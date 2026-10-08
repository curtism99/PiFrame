// Optional UI suite: set PIFRAME_PLAYWRIGHT_MODULE to an installed Playwright
// package if it is not on Node's module path. No UISP or Pi is contacted.
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { once } = require("node:events");
const { chromium } = require(process.env.PIFRAME_PLAYWRIGHT_MODULE || "playwright");

(async () => {
  const { default: express } = await import("express");
  const { createTrafficService } = await import("../server/widgets/trafficService.js");
  const { widgetsRouter } = await import("../server/routes/widgets.js");
  const { configRouter } = await import("../server/routes/config.js");
  const root = path.resolve(__dirname, "..");
  const config = JSON.parse(await fs.readFile(path.join(root, "config/frame.config.example.json"), "utf8"));
  config.widgets.acc_traffic.enabled = true;
  config.widgets.acc_traffic.capacity_bps = 2e9;
  config.display.hide_cursor = false;
  config.display.transition_seconds = 0.2;
  config.slideshow.photo_duration_seconds = 1;
  config.slideshow.shuffle = false;
  const traffic = createTrafficService(config, {
    readPrivateConfig: async () => ({ origin: "https://uisp.example.invalid", deviceId: "synthetic-device", token: "synthetic-read-token" }),
    fetchImpl: async (url) => {
      if (url.endsWith("interfaces")) return new Response(JSON.stringify([{
        identification: { name: "port1", position: 1, description: "ATTUplink" },
        status: { status: "active", plugged: true, currentSpeed: "10000-full" }
      }]));
      const timestamp = Date.now() - 3000;
      const points = (base, offset, factor) => Array.from({ length: 451 }, (_, i) => ({
        x: timestamp - (450 - i) * 8000 + offset,
        y: i >= 250 && i < 270 ? null : base * (0.65 + 0.3 * Math.sin(i / 13) ** 2) * factor
      }));
      return new Response(JSON.stringify({ period: 15000, interfaces: [{ id: "port1", name: "ATTUplink",
        receive: { avg: points(500e6, 0, 1), max: points(500e6, -4000, 1.35) },
        transmit: { avg: points(80e6, 2000, 1), max: points(80e6, -2000, 1.4) }
      }] }));
    }
  });
  await traffic.start();
  const runtimeState = { read: async () => ({ clock_enabled: true, effective_mode: "slideshow", slideshow_effects: { enabled: true } }) };
  const weatherService = { getWeather: async () => ({ enabled: true, stale: false, provider: "nws",
    current: { temperature: 72, temperature_unit: "F", condition: "Clear", source: "nws" },
    hourly: [], daily: [], alerts: [] }) };
  const app = express();
  app.use("/api/config", configRouter({ config, runtimeState }));
  app.use("/api/widgets", widgetsRouter({ config, runtimeState, weatherService, trafficService: traffic }));
  app.get("/api/mode", async (req, res) => res.json(await runtimeState.read()));
  app.get("/api/manifest", (req, res) => res.json({ slideshow: { items: [1, 2].map((i) => ({ id: `fixture${i}`, type: "photo", url: `/test/photo.svg?i=${i}` })) } }));
  app.get("/test/photo.svg", (req, res) => res.type("svg").send(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="g"><stop stop-color="#274666"/><stop offset="1" stop-color="#907950"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#g)"/><circle cx="${req.query.i === "1" ? 1200 : 900}" cy="350" r="180" fill="#c6b996" opacity=".45"/><path d="M0 900L600 370L1150 850L1500 570L1920 1000V1080H0Z" fill="#183344"/></svg>`));
  app.use(express.static(path.join(root, "app")));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PIFRAME_BROWSER_PATH ? { executablePath: process.env.PIFRAME_BROWSER_PATH } : {}) });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.on("pageerror", (error) => errors.push(error.message));
    // Capture the real widget instance through a test-only module interception.
    await page.route("**/js/main.js", async (route) => {
      const source = await fs.readFile(path.join(root, "app/js/main.js"), "utf8");
      await route.fulfill({ contentType: "application/javascript", body:
        'import { TrafficWidget as TestWidget } from "./trafficWidget.js"; const originalStart = TestWidget.prototype.start; TestWidget.prototype.start = function() { window.testTraffic = this; return originalStart.call(this); };\n' + source });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => window.testTraffic?.data?.status === "ok" && document.querySelector(".layer.is-visible"));
    const readouts = await page.evaluate(async () => {
      const { formatRate } = await import("/js/trafficModel.js");
      return ["rx", "tx"].map((name) => {
        const points = window.testTraffic.data.series[`${name}Peak`];
        return {
          current: document.querySelector(`[data-rate="${name}"]`).textContent,
          label: document.querySelector(`[data-rate-label="${name}"]`).textContent,
          expectedCurrent: formatRate(window.testTraffic.data.series[name].at(-1).bps),
          peak: document.querySelector(`[data-peak="${name}"]`).textContent,
          high: document.querySelector(`[data-high="${name}"]`).textContent,
          expectedPeak: formatRate(points.at(-1).bps),
          expectedHigh: formatRate(Math.max(...points.filter((p) => p.bps !== null).map((p) => p.bps))),
          ownTimestamp: points.at(-1).timestampMs,
          averageTimestamp: window.testTraffic.data.freshness[name].latestTimestampMs
        };
      });
    });
    for (const reading of readouts) {
      assert.equal(reading.current, reading.expectedCurrent);
      assert.equal(reading.label, "latest");
      assert.equal(reading.peak, reading.expectedPeak);
      assert.equal(reading.high, reading.expectedHigh);
      assert.notEqual(reading.ownTimestamp, reading.averageTimestamp);
    }
    assert.equal(await page.locator(".traffic-direction-label i").count(), 0, "no dash markers precede RX/TX");
    assert.equal(await page.locator("[data-capacity]").innerText(), "Circuit: 2.00 Gbps");
    await fs.mkdir(path.join(root, ".runtime"), { recursive: true });
    for (const [width, height] of [[1920, 1080], [1280, 720], [800, 600], [480, 800]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(350);
      const geometry = await page.evaluate(() => {
        const rect = (selector) => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
        };
        return {
          rail: rect(".traffic-widget"), clock: rect(".clock-widget"), weather: rect(".weather-widget"),
          stage: rect("#stage"), canvas: rect(".traffic-plot canvas"),
          heading: rect(".traffic-heading"), footer: rect(".traffic-footer"),
          plot: rect(".traffic-plot"),
          details: [...document.querySelectorAll(".traffic-direction")].map((el) => ({
            right: el.getBoundingClientRect().right,
            overflow: el.scrollWidth > el.clientWidth,
            hiddenPeaks: [...el.querySelectorAll("[data-peak-group]")].some((p) => getComputedStyle(p).display === "none")
          })),
          x: window.testTraffic.plot.scales.x, y: window.testTraffic.plot.scales.y,
          show: window.testTraffic.plot.series.slice(1).map((s) => s.show),
          dataEnd: window.testTraffic.plot.data[0].at(-1),
          lastObserved: Math.max(...Object.values(window.testTraffic.data.series).flat().map((p) => p.timestampMs)) / 1000
        };
      });
      await page.screenshot({ path: path.join(root, `.runtime/traffic-${width}x${height}.png`) });
      assert.equal(geometry.rail.left, 0);
      assert.equal(geometry.rail.width, width);
      assert.equal(geometry.rail.bottom, height);
      assert.ok(geometry.clock.bottom < geometry.rail.top);
      assert.ok(geometry.weather.bottom < geometry.rail.top);
      const overlap = geometry.clock.left < geometry.weather.right && geometry.clock.right > geometry.weather.left &&
        geometry.clock.top < geometry.weather.bottom && geometry.clock.bottom > geometry.weather.top;
      assert.equal(overlap, false, "clock and weather remain readable without overlap");
      assert.equal(geometry.stage.height, height);
      assert.ok(geometry.footer.bottom <= height);
      assert.ok(geometry.canvas.height > 50);
      assert.ok(geometry.heading.bottom <= geometry.plot.top, "peak header fits above graph");
      assert.ok(geometry.plot.bottom <= geometry.footer.top, "graph fits above footer");
      for (const direction of geometry.details) {
        assert.ok(direction.right <= width);
        assert.equal(direction.overflow, false, "numeric peak readouts fit the rail");
        assert.equal(direction.hiddenPeaks, false, "peaks remain visible at every viewport");
      }
      assert.equal(geometry.y.min, 0);
      assert.ok(geometry.y.max >= 600e6, "Y scale includes peak lines");
      assert.ok(geometry.y.max < 2e9, "circuit header does not force the automatic scale");
      assert.deepEqual(geometry.show, [true, true, true, true]);
      assert.ok(Math.abs((geometry.x.max - geometry.x.min) - 3600) < 0.001);
      assert.equal(geometry.dataEnd, geometry.lastObserved, "no extrapolated points after source end");
      console.log(`Layout ${width}x${height}: full-width rail, four series, zero-based scale, lifted clock/weather`);
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForFunction(() => !window.testTraffic.controller);
    // Reproduce the live Pi's valid -> newer nulls -> revised valid responses.
    const cycleResponse = await page.evaluate(() => {
      clearTimeout(window.testTraffic.pollTimer);
      return structuredClone(window.testTraffic.data);
    });
    const cycleTime = Date.now();
    const values = { rx: 95e6, tx: 0, rxPeak: 129e6, txPeak: 12e6 };
    for (const name of Object.keys(values)) {
      cycleResponse.series[name] = [{ timestampMs: cycleTime - 41000, bps: values[name] }];
    }
    for (const name of ["rx", "tx"]) cycleResponse.freshness[name] = {
      latestTimestampMs: cycleTime - 41000, currentBps: values[name], staleAfterMs: 192000
    };
    await page.route("**/api/widgets/krc-acc-traffic", (route) => route.fulfill({ json: cycleResponse }));
    let knownGeometry;
    for (const phase of ["valid", "partial", "revised"]) {
      if (phase === "partial") for (const name of Object.keys(values)) {
        cycleResponse.series[name].push({ timestampMs: cycleTime - 1000, bps: null });
      }
      if (phase === "revised") for (const name of Object.keys(values)) {
        cycleResponse.series[name].at(-1).bps = values[name] / 2;
      }
      await page.evaluate(() => window.testTraffic.refresh());
      for (const name of ["rx", "tx"]) {
        assert.equal(await page.locator(`[data-rate-label="${name}"]`).innerText(), "latest");
        assert.notEqual(await page.locator(`[data-rate="${name}"]`).innerText(), "—");
        assert.notEqual(await page.locator(`[data-peak="${name}"]`).innerText(), "—");
      }
      assert.equal(await page.locator('[data-peak="rx"]').innerText(), phase === "revised" ? "64.50 Mbps" : "129.00 Mbps");
      assert.equal(await page.locator('[data-rate="tx"]').innerText(), "0.00 Mbps");
      const ageIndicators = await page.evaluate(() => [...document.querySelectorAll(".traffic-unknown-icon")].map((icon) => ({
        active: icon.dataset.active, visibility: getComputedStyle(icon).visibility,
        hidden: icon.getAttribute("aria-hidden"), label: icon.getAttribute("aria-label"), title: icon.title,
        width: icon.getBoundingClientRect().width
      })));
      for (const indicator of ageIndicators) {
        const unknown = phase === "partial";
        assert.equal(indicator.active, String(unknown));
        assert.equal(indicator.visibility, unknown ? "visible" : "hidden");
        assert.equal(indicator.hidden, String(!unknown));
        assert.match(indicator.label, /Newer sample is unknown/);
        assert.equal(indicator.title, indicator.label);
        assert.ok(indicator.width > 0 && indicator.width <= 16, "compact slot stays reserved");
      }
      const statusGeometry = await page.evaluate(() => [...document.querySelectorAll(".traffic-detail small, [data-high]")].map((el) => {
        const rect = el.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width };
      }));
      if (phase === "valid") knownGeometry = statusGeometry;
      if (phase === "partial") assert.deepEqual(statusGeometry, knownGeometry, "icon toggles do not move age or high readouts");
      if (phase === "partial") {
        assert.match(await page.locator('[data-peak-age="rx"]').innerText(), /^peak 4\ds$/);
        assert.equal(await page.evaluate(() => window.testTraffic.data.series.rxPeak.at(-1).bps), null);
        for (const [width, height] of [[800, 600], [480, 800]]) {
          await page.setViewportSize({ width, height });
          await page.waitForTimeout(100);
          assert.ok(await page.evaluate(() => {
            const widget = document.querySelector(".traffic-widget");
            const heading = widget.querySelector(".traffic-heading").getBoundingClientRect();
            const plot = widget.querySelector(".traffic-plot").getBoundingClientRect();
            const footer = widget.querySelector(".traffic-footer").getBoundingClientRect();
            return heading.bottom <= plot.top && plot.bottom <= footer.top && footer.bottom <= innerHeight;
          }), "newer-unknown indicators fit compact layouts");
        }
        await page.setViewportSize({ width: 1920, height: 1080 });
      }
    }
    await page.evaluate(() => {
      clearTimeout(window.testTraffic.pollTimer);
      window.testSlideChanges = 0;
      window.testSlideObserver = new MutationObserver((records) => {
        for (const record of records) for (const node of record.addedNodes) {
          if (node.classList?.contains("layer")) window.testSlideChanges++;
        }
      });
      window.testSlideObserver.observe(document.querySelector("#stage"), { childList: true });
    });
    const before = await page.evaluate(() => ({ x: window.testTraffic.plot.scales.x.max, values: window.testTraffic.plot.data[1].slice(), url: document.querySelector(".layer.is-visible .photo-fg").src }));
    await page.waitForTimeout(1300);
    const after = await page.evaluate(() => ({ x: window.testTraffic.plot.scales.x.max, values: window.testTraffic.plot.data[1].slice(), url: document.querySelector(".layer.is-visible .photo-fg").src }));
    assert.ok(after.x > before.x);
    assert.deepEqual(after.values, before.values, "scrolling does not invent samples");
    assert.ok(await page.evaluate(() => window.testSlideChanges > 0), "slideshow transitioned underneath graph");
    await page.emulateMedia({ reducedMotion: "reduce" });
    const reducedX = await page.evaluate(() => window.testTraffic.plot.scales.x.max);
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => window.testTraffic.plot.scales.x.max), reducedX);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const hiddenX = await page.evaluate(() => window.testTraffic.plot.scales.x.max);
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => window.testTraffic.plot.scales.x.max), hiddenX);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForFunction(() => !window.testTraffic.controller);
    const staleText = await page.evaluate(() => {
      const widget = window.testTraffic;
      clearTimeout(widget.pollTimer);
      const outageMs = widget.data.freshness.rx.staleAfterMs + 60000;
      widget.data.freshness.rx.latestTimestampMs = Date.now() - outageMs;
      widget.data.series.rx = widget.data.series.rx.map((p) => ({ ...p, timestampMs: p.timestampMs - outageMs }));
      widget.draw();
      return widget.element.querySelector('[data-age="rx"]').textContent;
    });
    assert.match(staleText, /stale/);
    assert.equal(await page.locator('[data-rate-label="rx"]').innerText(), "latest");
    const unknownCurrent = await page.evaluate(() => {
      const widget = window.testTraffic;
      const now = Date.now();
      widget.data.series.tx = [{ timestampMs: now - 20000, bps: 0 }, { timestampMs: now - 1000, bps: null }];
      widget.draw();
      return {
        label: widget.element.querySelector('[data-rate-label="tx"]').textContent,
        value: widget.element.querySelector('[data-rate="tx"]').textContent,
        age: widget.element.querySelector('[data-age="tx"]').textContent
      };
    });
    assert.equal(unknownCurrent.label, "latest");
    assert.equal(unknownCurrent.value, "0.00 Mbps");
    assert.equal(unknownCurrent.age.trim(), "sample 20s");
    assert.equal(await page.locator('[data-age="tx"] .traffic-unknown-icon').getAttribute("aria-hidden"), "false");
    const peakState = await page.evaluate(() => {
      const widget = window.testTraffic;
      const now = Date.now();
      widget.data.series.rxPeak = [{ timestampMs: now - 180000, bps: 1.7e9 }, { timestampMs: now - 1000, bps: null }];
      widget.draw();
      return {
        latest: widget.element.querySelector('[data-peak="rx"]').textContent,
        high: widget.element.querySelector('[data-high="rx"]').textContent,
        age: widget.element.querySelector('[data-peak-age="rx"]').textContent
      };
    });
    assert.equal(peakState.latest, "1.70 Gbps");
    assert.equal(peakState.high, "1.70 Gbps");
    assert.match(peakState.age, /peak 3m 0s.*stale/);
    assert.doesNotMatch(peakState.age, /newer unknown/);
    assert.equal(await page.locator('[data-peak-age="rx"] .traffic-unknown-icon').getAttribute("aria-hidden"), "false");
    await page.evaluate(() => {
      window.testTraffic.data.error = { code: "network", message: "UISP is unreachable; retrying" };
      window.testTraffic.draw();
    });
    assert.match(await page.locator("[data-status]").innerText(), /unreachable/);
    assert.ok(await page.locator(".layer.is-visible").count());
    await page.evaluate(() => window.testTraffic.stop());
    assert.equal(await page.evaluate(() => window.testTraffic.plot), null);
    assert.equal(await page.evaluate(() => window.testTraffic.redrawTimer), null);
    assert.equal(await page.evaluate(() => getComputedStyle(window.testTraffic.element).display), "none");
    assert.equal(await page.locator(".has-traffic-rail").count(), 0);
    await page.evaluate(() => {
      window.testTraffic.config.show_peaks = false;
      window.testTraffic.start();
    });
    await page.waitForFunction(() => !window.testTraffic.controller);
    assert.deepEqual(await page.evaluate(() => window.testTraffic.plot.series.slice(1).map((s) => s.show)), [true, true, false, false]);
    assert.equal(await page.locator("[data-peak-group]:visible").count(), 0);
    assert.equal(await page.locator("[data-capacity]").innerText(), "Circuit: 2.00 Gbps");
    await page.evaluate(() => window.testTraffic.stop());
    assert.deepEqual(errors, []);
    console.log("Scrolling, fixed measurements, slideshow transitions, reduced motion, hidden/destroyed lifecycle and stale/error display passed");
  } finally {
    traffic.stop();
    await browser?.close();
    server.close();
    await once(server, "close");
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
