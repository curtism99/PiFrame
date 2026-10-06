import uPlot from "../vendor/uplot-1.6.32/uPlot.esm.js";
import { fetchTrafficWidget } from "./widgetClient.js";
import { alignTraffic, formatRate, formatAge, directionState, formatLocalTime, summarizePeaks } from "./trafficModel.js";

export class TrafficWidget {
  constructor(element, config = {}) {
    this.element = element;
    this.config = config;
    this.plot = null;
    this.data = null;
    this.running = false;
    this.pollTimer = null;
    this.redrawTimer = null;
    this.controller = null;
    this.fetchFailed = false;
    this.motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.onVisibility = () => {
      this.stopRedrawing();
      if (!document.hidden && this.running) {
        if (this.data) this.plot?.setData(alignTraffic(this.data.series, this.data.pollIntervalMs), false);
        this.draw();
        this.resize();
        this.beginRedrawing();
        if (!this.controller) { clearTimeout(this.pollTimer); void this.refresh(); }
      }
    };
    this.onMotion = () => { this.stopRedrawing(); this.beginRedrawing(); };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.element.hidden = false;
    this.element.classList.add("traffic-widget");
    this.element.setAttribute("aria-label", "ACC uplink traffic over the last hour");
    this.element.innerHTML = `
      <div class="traffic-heading">
        <div class="traffic-title"><strong>ACC uplink</strong><small data-capacity></small></div>
        ${["rx", "tx"].map((name) => `
          <div class="traffic-direction traffic-${name}">
            <div class="traffic-rate"><span class="traffic-direction-label"><i></i>${name === "rx" ? "RX / from provider" : "TX / to provider"}</span>
              <span>avg <b data-rate="${name}">—</b></span>
              <span data-peak-group>peak <b data-peak="${name}">—</b></span>
            </div>
            <div class="traffic-detail"><small data-age="${name}">waiting</small>
              <small data-peak-group data-peak-age="${name}">peak waiting</small>
              <span data-peak-group>1h high <b data-high="${name}">—</b></span>
            </div>
          </div>`).join("")}
        <span class="traffic-health" data-health>Waiting for UISP</span>
      </div>
      <div class="traffic-plot" role="img" aria-label="RX and TX averages and peaks, in Mbps or Gbps"></div>
      <div class="traffic-footer"><span data-status>Waiting for recorded samples</span><span data-api>API refresh: waiting · Chicago time</span></div>`;
    this.plotElement = this.element.querySelector(".traffic-plot");
    for (const group of this.element.querySelectorAll("[data-peak-group]")) group.hidden = this.config.show_peaks === false;
    const capacity = this.element.querySelector("[data-capacity]");
    capacity.hidden = !Number.isFinite(this.config.capacity_bps) || this.config.capacity_bps <= 0;
    capacity.textContent = `Circuit: ${formatRate(this.config.capacity_bps)}`;
    this.element.closest(".widget-layer")?.classList.add("has-traffic-rail");
    document.addEventListener("visibilitychange", this.onVisibility);
    this.motion.addEventListener("change", this.onMotion);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.element);
    this.createPlot();
    this.beginRedrawing();
    void this.refresh();
  }

  createPlot() {
    const peaks = this.config.show_peaks !== false;
    this.plot = new uPlot({
      width: Math.max(100, this.plotElement.clientWidth),
      height: Math.max(60, this.plotElement.clientHeight),
      padding: [4, 14, 0, 0],
      legend: { show: false },
      cursor: { show: false },
      select: { show: false },
      scales: {
        x: { time: true },
        y: { range: (plot, min, max) => [0, Math.max(1e6, (max ?? 0) * 1.12)] }
      },
      series: [
        {},
        { label: "RX average", stroke: "#56def5", width: 2, spanGaps: false, points: { show: false } },
        { label: "TX average", stroke: "#ffc66d", width: 2, spanGaps: false, points: { show: false } },
        { label: "RX peak", stroke: "rgba(86,222,245,0.8)", width: 2, dash: [6, 4], show: peaks, spanGaps: false, points: { show: false } },
        { label: "TX peak", stroke: "rgba(255,198,109,0.8)", width: 2, dash: [6, 4], show: peaks, spanGaps: false, points: { show: false } }
      ],
      axes: [
        { stroke: "#c1cbd3", font: "11px system-ui", size: 23, space: 130,
          grid: { stroke: "rgba(255,255,255,0.06)" }, ticks: { show: false },
          values: (plot, ticks) => ticks.map(formatLocalTime) },
        { stroke: "#c1cbd3", font: "11px system-ui", size: 82, space: 26,
          grid: { stroke: "rgba(255,255,255,0.10)" }, ticks: { show: false },
          values: (plot, ticks) => ticks.map(formatRate) }
      ]
    }, [[], [], [], [], []], this.plotElement);
    this.draw();
  }

  resize() {
    if (!this.running || !this.plot || document.hidden) return;
    this.plot.setSize({ width: Math.max(100, this.plotElement.clientWidth), height: Math.max(60, this.plotElement.clientHeight) });
    this.draw();
  }

  beginRedrawing() {
    if (!this.running || document.hidden || this.redrawTimer) return;
    // Reduced motion keeps the time domain fixed between API updates.
    if (!this.motion.matches) this.redrawTimer = window.setInterval(() => this.draw(), 250);
  }

  stopRedrawing() {
    clearInterval(this.redrawTimer);
    this.redrawTimer = null;
  }

  async refresh() {
    if (!this.running || this.controller) return;
    if (document.hidden) {
      this.pollTimer = window.setTimeout(() => this.refresh(), 15_000);
      return;
    }
    this.controller = new AbortController();
    const timeout = window.setTimeout(() => this.controller?.abort(), 10_000);
    try {
      const data = await fetchTrafficWidget({ signal: this.controller.signal });
      if (!this.running) return;
      this.data = data;
      this.fetchFailed = false;
      if (!document.hidden) this.plot.setData(alignTraffic(data.series, data.pollIntervalMs), false);
      this.draw();
    } catch {
      if (this.running) { this.fetchFailed = true; this.draw(); }
    } finally {
      clearTimeout(timeout);
      this.controller = null;
      if (this.running) this.pollTimer = window.setTimeout(() => this.refresh(), 15_000);
    }
  }

  draw() {
    if (!this.running || document.hidden || !this.plot) return;
    const now = Date.now();
    this.plot.setScale("x", { min: (now - 3_600_000) / 1000, max: now / 1000 });
    if (!this.data) {
      if (this.fetchFailed) this.element.querySelector("[data-health]").textContent = "Frame API unavailable";
      return;
    }
    const data = this.data;
    for (const name of ["rx", "tx"]) {
      const direction = data.freshness[name];
      const state = directionState(direction, now);
      this.element.querySelector(`[data-rate="${name}"]`).textContent = formatRate(direction.currentBps);
      const age = this.element.querySelector(`[data-age="${name}"]`);
      age.textContent = `sample ${state.age}${state.stale ? " · stale" : ""}`;
      age.classList.toggle("is-stale", state.stale);
      const peak = summarizePeaks(data.series[`${name}Peak`], now, data.pollIntervalMs);
      this.element.querySelector(`[data-peak="${name}"]`).textContent = formatRate(peak.latestBps);
      this.element.querySelector(`[data-high="${name}"]`).textContent = formatRate(peak.highBps);
      const peakAge = this.element.querySelector(`[data-peak-age="${name}"]`);
      peakAge.textContent = `peak ${peak.age}${peak.unknown ? " · unknown" : ""}${peak.stale ? " · stale" : ""}`;
      peakAge.classList.toggle("is-stale", peak.stale || peak.unknown);
    }
    const stale = ["rx", "tx"].some((name) => directionState(data.freshness[name], now).stale);
    const apiStale = data.fetchedAtMs === null || now - data.fetchedAtMs > 60_000;
    const linkStale = data.link.checkedAtMs === null || now - data.link.checkedAtMs > 60_000 || !data.link.verified;
    const link = linkStale ? "link unverified" : `link ${data.link.state}${data.link.speed ? ` · ${data.link.speed}` : ""}`;
    this.element.querySelector("[data-health]").textContent = link;
    const status = this.fetchFailed ? "Frame API unavailable · cached samples" : data.error?.message ??
      (data.status === "disabled" ? "Widget disabled" : stale ? "Recorded traffic is stale" : "Recorded traffic · solid avg / dashed peak");
    this.element.querySelector("[data-status]").textContent = status;
    this.element.querySelector("[data-api]").textContent = `API refresh ${formatAge(data.fetchedAtMs, now)}${apiStale ? " · stale" : ""} · Chicago time`;
    this.element.classList.toggle("traffic-error", Boolean(data.error) || this.fetchFailed || stale || apiStale);
  }

  stop() {
    this.running = false;
    clearTimeout(this.pollTimer);
    this.stopRedrawing();
    this.controller?.abort();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.motion.removeEventListener("change", this.onMotion);
    this.resizeObserver?.disconnect();
    this.plot?.destroy();
    this.plot = null;
    this.element.closest(".widget-layer")?.classList.remove("has-traffic-rail");
    this.element.replaceChildren();
    this.element.hidden = true;
  }
}
