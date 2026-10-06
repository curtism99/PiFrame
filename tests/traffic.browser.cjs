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
        receive: { avg: points(500e6, 0, 1), max: points(500e6, 0, 1.35) },
        transmit: { avg: points(80e6, 2000, 1), max: points(80e6, 2000, 1.4) }
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
          x: window.testTraffic.plot.scales.x, y: window.testTraffic.plot.scales.y,
          show: window.testTraffic.plot.series.slice(1).map((s) => s.show),
          dataEnd: window.testTraffic.plot.data[0].at(-1),
          lastObserved: Math.max(...Object.values(window.testTraffic.data.series).flat().map((p) => p.timestampMs)) / 1000
        };
      });
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
      assert.equal(geometry.y.min, 0);
      assert.ok(geometry.y.max >= 600e6, "Y scale includes peak lines");
      assert.deepEqual(geometry.show, [true, true, true, true]);
      assert.ok(Math.abs((geometry.x.max - geometry.x.min) - 3600) < 0.001);
      assert.equal(geometry.dataEnd, geometry.lastObserved, "no extrapolated points after source end");
      await page.screenshot({ path: path.join(root, `.runtime/traffic-${width}x${height}.png`) });
      console.log(`Layout ${width}x${height}: full-width rail, four series, zero-based scale, lifted clock/weather`);
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForFunction(() => !window.testTraffic.controller);
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
      widget.data.freshness.rx.latestTimestampMs = Date.now() - 180000;
      widget.draw();
      return widget.element.querySelector('[data-age="rx"]').textContent;
    });
    assert.match(staleText, /stale/);
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
    assert.deepEqual(errors, []);
    console.log("Scrolling, fixed measurements, slideshow transitions, reduced motion, hidden/destroyed lifecycle and stale/error display passed");
  } finally {
    traffic.stop();
    await browser?.close();
    server.close();
    await once(server, "close");
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
