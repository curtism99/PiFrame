import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import {
  normalizePoints, normalizeStatistics, selectPhysicalInterface,
  directionFreshness, retryAfterMs, TrafficError
} from "../server/widgets/trafficData.js";
import { createTrafficService, validatePrivateConfig, readPrivateConfig } from "../server/widgets/trafficService.js";
import { configRouter } from "../server/routes/config.js";
import { widgetsRouter } from "../server/routes/widgets.js";
import { alignTraffic, plotTable, formatRate, directionState, formatLocalTime } from "../app/js/trafficModel.js";

const T = 1_700_000_000_000;
const privateFixture = { origin: "https://uisp.example.invalid", deviceId: "synthetic-device", token: "synthetic-read-token" };
const enabledConfig = { widgets: { acc_traffic: { enabled: true } } };
const physical = (name = "port1") => ({
  identification: { name, position: 1, description: "ATTUplink" },
  status: { status: "active", plugged: true, currentSpeed: "10000-full", description: "must not expose upstream free text" }
});
const statistics = (value = 250e6, timestamp = T) => ({
  period: 15_000,
  interfaces: [
    { id: "lag1", name: "ATTUplink", receive: { avg: [{ x: timestamp, y: 999e9 }] } },
    { id: "port1", name: "ATTUplink", receive: { avg: [{ x: timestamp, y: value }], max: [{ x: timestamp, y: 400e6 }] },
      transmit: { avg: [{ x: timestamp + 2000, y: 12e6 }], max: [{ x: timestamp + 1000, y: 20e6 }] },
      rxBytes: { sum: [{ x: timestamp, y: 999999999 }] } }
  ]
});
const response = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers });

function harness(fetchImpl, overrides = {}) {
  let time = T + 5000;
  let timer = null;
  const calls = [];
  const service = createTrafficService(enabledConfig, {
    readPrivateConfig: async () => privateFixture,
    fetchImpl: async (...args) => { calls.push(args); return fetchImpl(...args); },
    now: () => time,
    setTimer: (callback, delay) => { timer = { callback, delay }; return timer; },
    clearTimer: () => { timer = null; },
    ...overrides
  });
  return {
    service, calls,
    setTime(value) { time = value; },
    get delay() { return timer?.delay; },
    async tick() {
      assert.ok(timer, "collector scheduled a next poll");
      const next = timer;
      timer = null;
      time += next.delay;
      next.callback();
      await service.whenIdle();
    }
  };
}

test("selects exact physical identity and rejects LAG, wrong label and duplicates", () => {
  assert.equal(selectPhysicalInterface([physical("lag1"), physical()]).speed, "10000-full");
  assert.throws(() => selectPhysicalInterface([physical("lag1")]), /identity_mismatch/);
  assert.throws(() => selectPhysicalInterface([physical(), physical()]), /identity_mismatch/);
  assert.throws(() => selectPhysicalInterface([{ ...physical(), identification: { ...physical().identification, description: "other" } }]), /identity_mismatch/);
  assert.equal(normalizeStatistics(statistics()).series.rx[0].bps, 250e6);
  assert.throws(() => normalizeStatistics({ interfaces: [statistics().interfaces[1], statistics().interfaces[1]] }), /identity_mismatch/);
  assert.throws(() => normalizeStatistics({ interfaces: [statistics().interfaces[0]] }), /identity_mismatch/);
});

test("rates retain bits/sec and milliseconds; zero is valid, invalid values unknown, duplicate last wins", () => {
  const result = normalizePoints([
    { x: T + 4, y: null }, { x: T + 3, y: -2 }, { x: T + 2, y: "3" },
    { x: T, y: 0 }, { x: T + 1, y: 100 }, { x: T + 1, y: 123 },
    { x: T + 5 }, { x: NaN, y: 100 }, { x: T + 6, y: Infinity }
  ]);
  assert.deepEqual(result.map((p) => p.bps), [0, 123, null, null, null, null, null]);
  assert.equal(result[1].timestampMs, T + 1);
  assert.equal(formatRate(123e6), "123.00 Mbps");
  assert.equal(formatRate(2e9), "2.00 Gbps");
  assert.equal(formatRate(0), "0.00 Mbps");
  assert.equal(formatRate(null), "—");
});

test("joins unequal timestamps with undefined alignment holes and keeps explicit null measurements", () => {
  const joined = alignTraffic({
    rx: [{ timestampMs: T, bps: 0 }, { timestampMs: T + 8000, bps: null }],
    tx: [{ timestampMs: T + 4000, bps: 12e6 }],
    rxPeak: [{ timestampMs: T + 8000, bps: 20e6 }], txPeak: []
  });
  assert.deepEqual(joined[0], [T / 1000, T / 1000 + 4, T / 1000 + 8]);
  assert.deepEqual(joined[1], [0, undefined, null]);
  assert.deepEqual(joined[2], [undefined, 12e6, undefined]);
  assert.deepEqual(joined[3], [undefined, undefined, 20e6]);
});

test("long gaps receive only a display null; plot ends at measured point, never at now", () => {
  const input = [0, 8000, 16000, 24000, 300000].map((offset) => ({ timestampMs: T + offset, bps: 10 }));
  const [xs, ys] = plotTable(input);
  assert.equal(xs.length, input.length + 1);
  assert.equal(ys.filter((y) => y === null).length, 1);
  assert.equal(xs.at(-1), (T + 300000) / 1000);
  assert.equal(input.length, 5);
});

test("direction freshness uses source samples independently and ignores response period", () => {
  const points = [0, 8000, 16000, 24000].map((offset) => ({ timestampMs: T + offset, bps: 0 }));
  const fresh = directionFreshness(points, T + 30000);
  assert.equal(fresh.staleAfterMs, 60000);
  assert.equal(fresh.medianSpacingMs, 8000);
  assert.equal(fresh.stale, false);
  assert.equal(directionState(fresh, T + 90000).stale, true);
  const slow = [0, 40000, 80000].map((offset) => ({ timestampMs: T + offset, bps: 1 }));
  assert.equal(directionFreshness(slow, T).staleAfterMs, 120000);
  assert.equal(directionFreshness([...points, { timestampMs: T + 25000, bps: null }], T + 30000).currentBps, null);
  assert.equal(directionFreshness([], T).stale, true);
  assert.match(formatLocalTime(Date.UTC(2024, 0, 1, 18, 30) / 1000), /12:30/);
});

test("collector replaces revised timestamps and checks physical identity every minute", async (t) => {
  let rate = 250e6;
  const h = harness(async (url) => response(url.endsWith("interfaces") ? [physical("lag1"), physical()] : statistics(rate)));
  t.after(() => h.service.stop());
  await h.service.start();
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0][1].headers["x-auth-token"], privateFixture.token);
  assert.equal(h.calls[0][1].redirect, "error");
  assert.match(h.calls[1][0], /statistics\?interval=hour$/);
  rate = 280e6;
  await h.tick();
  const snapshot = h.service.getSnapshot();
  assert.equal(snapshot.series.rx.length, 1);
  assert.equal(snapshot.series.rx[0].bps, 280e6);
  assert.equal(snapshot.series.tx[0].timestampMs, T + 2000);
  assert.equal(snapshot.sourcePeriodMs, 15000);
  for (let i = 0; i < 3; i++) await h.tick();
  assert.equal(h.calls.filter(([url]) => url.endsWith("interfaces")).length, 2);
});

test("successful refresh with old measurements stays directionally stale", async (t) => {
  const h = harness(async (url) => response(url.endsWith("interfaces") ? [physical()] : statistics(0, T - 120000)));
  t.after(() => h.service.stop());
  await h.service.start();
  const snapshot = h.service.getSnapshot();
  assert.equal(snapshot.apiAgeMs, 0);
  assert.equal(snapshot.freshness.rx.currentBps, 0);
  assert.equal(snapshot.freshness.rx.stale, true);
  assert.equal(snapshot.status, "stale");
});

test("network and server failures preserve samples, cap backoff at five minutes and recover", async (t) => {
  let failed = false;
  const h = harness(async (url) => {
    if (failed) throw new Error(`${privateFixture.token} ${privateFixture.origin}`);
    return response(url.endsWith("interfaces") ? [physical()] : statistics());
  });
  t.after(() => h.service.stop());
  await h.service.start();
  failed = true;
  for (const expected of [15000, 30000, 60000, 120000, 240000, 300000, 300000]) {
    await h.tick();
    assert.equal(h.delay, expected);
    assert.equal(h.service.getSnapshot().series.rx[0].bps, 250e6);
  }
  const serialized = JSON.stringify(h.service.getSnapshot());
  assert.ok(!serialized.includes(privateFixture.token));
  assert.ok(!serialized.includes(privateFixture.origin));
  assert.equal(h.service.getSnapshot().error.code, "network");
  failed = false;
  await h.tick();
  assert.equal(h.service.getSnapshot().error, null);
  assert.equal(h.delay, 15000);
  const serverFailure = harness(async () => response({}, 503));
  await serverFailure.service.start();
  assert.equal(serverFailure.service.getSnapshot().error.code, "server");
  serverFailure.service.stop();
});

test("authentication suspends polling until a new service starts", async () => {
  for (const status of [401, 403]) {
    const h = harness(async () => response({ token: privateFixture.token }, status));
    await h.service.start();
    assert.equal(h.service.getSnapshot().status, "suspended");
    assert.equal(h.service.getSnapshot().error.code, "authentication");
    assert.equal(h.delay, undefined);
    await h.service.start();
    assert.equal(h.calls.length, 1);
    h.service.stop();
  }
});

test("rate limits honor Retry-After seconds/date, including delays longer than backoff cap", async (t) => {
  assert.equal(retryAfterMs(new Date(T + 90000).toUTCString(), T), 90000);
  assert.equal(retryAfterMs("600", T), 600000);
  assert.equal(retryAfterMs("invalid", T), null);
  const h = harness(async () => {
    h.setTime(T + 7000); // Response latency must not shorten Retry-After.
    return response({}, 429, { "retry-after": "600" });
  });
  t.after(() => h.service.stop());
  await h.service.start();
  assert.equal(h.delay, 600000);
  assert.equal(h.service.getSnapshot().nextPollAtMs, T + 607000);
});

test("ten-second deadline aborts requests and reports only a sanitized timeout", async (t) => {
  let abortRequest;
  const h = harness(async (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error(privateFixture.token)), { once: true });
    abortRequest();
  }), {
    setRequestTimer: (callback, delay) => { assert.equal(delay, 10000); abortRequest = callback; return {}; },
    clearRequestTimer: () => {}
  });
  t.after(() => h.service.stop());
  await h.service.start();
  assert.equal(h.service.getSnapshot().error.code, "timeout");
  assert.ok(!JSON.stringify(h.service.getSnapshot()).includes(privateFixture.token));
});

test("startup and slow requests cannot overlap; stopping cancels future polls", async () => {
  let release;
  const h = harness(async (url) => {
    if (url.endsWith("interfaces")) return new Promise((resolve) => { release = () => resolve(response([physical()])); });
    return response(statistics());
  });
  const first = h.service.start();
  await new Promise((resolve) => setImmediate(resolve));
  await h.service.start();
  for (let i = 0; i < 10; i++) h.service.getSnapshot();
  assert.equal(h.calls.length, 1);
  assert.equal(h.delay, undefined);
  release();
  await first;
  assert.equal(h.calls.length, 2);
  h.service.stop();
  assert.equal(h.delay, undefined);
  assert.equal(h.service.getSnapshot().nextPollAtMs, null);
});

test("metadata mismatch after startup retains data and blocks new statistics", async (t) => {
  let valid = true;
  const h = harness(async (url) => response(url.endsWith("interfaces") ? [physical(valid ? "port1" : "lag1")] : statistics()));
  t.after(() => h.service.stop());
  await h.service.start();
  valid = false;
  h.setTime(T + 70000);
  await h.tick();
  assert.equal(h.calls.filter(([url]) => url.includes("statistics")).length, 1);
  assert.equal(h.service.getSnapshot().error.code, "identity_mismatch");
  assert.equal(h.service.getSnapshot().link.verified, false);
  assert.equal(h.service.getSnapshot().series.rx.length, 1);
});

test("missing credentials and malformed data are isolated; disabled widget reads no private file", async () => {
  let reads = 0;
  const disabled = createTrafficService({}, { readPrivateConfig: async () => { reads++; throw new Error(); } });
  await disabled.start();
  assert.equal(reads, 0);
  assert.equal(disabled.getSnapshot().status, "disabled");
  const missing = createTrafficService(enabledConfig, { readPrivateConfig: async () => { throw new TrafficError("missing_credentials"); } });
  await missing.start();
  assert.equal(missing.getSnapshot().error.code, "missing_credentials");
  const invalid = harness(async () => new Response("not JSON"));
  await invalid.service.start();
  assert.equal(invalid.service.getSnapshot().error.code, "invalid_response");
  invalid.service.stop();
});

test("private-file errors and URL validation never reveal secret text", async (t) => {
  assert.equal(validatePrivateConfig({ origin: privateFixture.origin, device_id: privateFixture.deviceId, token: privateFixture.token }).token, privateFixture.token);
  for (const origin of ["http://uisp.example.invalid", "https://user:password@uisp.example.invalid", "https://uisp.example.invalid/path"]) {
    assert.throws(() => validatePrivateConfig({ origin, device_id: "device", token: "token" }), /^Error: invalid_credentials$/);
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), "piframe-traffic-"));
  const previous = process.env.PIFRAME_UISP_CONFIG_PATH;
  t.after(async () => {
    if (previous === undefined) delete process.env.PIFRAME_UISP_CONFIG_PATH;
    else process.env.PIFRAME_UISP_CONFIG_PATH = previous;
    await rm(directory, { recursive: true, force: true });
  });
  process.env.PIFRAME_UISP_CONFIG_PATH = path.join(directory, "private.json");
  await writeFile(process.env.PIFRAME_UISP_CONFIG_PATH, `invalid ${privateFixture.token}`);
  await assert.rejects(readPrivateConfig(), { message: "invalid_credentials" });
  process.env.PIFRAME_UISP_CONFIG_PATH = path.join(directory, "absent.json");
  await assert.rejects(readPrivateConfig(), { message: "missing_credentials" });
});

test("many HTTP clients read one collector and public endpoints exclude connection details", async (t) => {
  const h = harness(async (url) => response(url.endsWith("interfaces") ? [physical()] : statistics()));
  await h.service.start();
  const config = { ...enabledConfig, widgets: { acc_traffic: { enabled: true, token: privateFixture.token, origin: privateFixture.origin } } };
  const runtimeState = { read: async () => ({ clock_enabled: true }) };
  const app = express();
  app.use("/api/config", configRouter({ config, runtimeState }));
  app.use("/api/widgets", widgetsRouter({ config, runtimeState, weatherService: { getWeather: async () => ({ enabled: true }) }, trafficService: h.service }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => { h.service.stop(); server.close(); await once(server, "close"); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const payloads = await Promise.all(Array.from({ length: 20 }, () => fetch(`${base}/api/widgets/krc-acc-traffic`).then((r) => r.text())));
  payloads.push(await fetch(`${base}/api/config`).then((r) => r.text()));
  assert.equal(h.calls.length, 2);
  for (const payload of payloads) {
    assert.ok(!payload.includes(privateFixture.token));
    assert.ok(!payload.includes(privateFixture.origin));
    assert.ok(!payload.includes(privateFixture.deviceId));
  }
  const snapshot = h.service.getSnapshot();
  snapshot.series.rx[0].bps = 99;
  assert.equal(h.service.getSnapshot().series.rx[0].bps, 250e6);
  const weatherAndClock = await fetch(`${base}/api/widgets`).then((r) => r.json());
  assert.equal(weatherAndClock.weather.enabled, true);
  assert.equal(weatherAndClock.clock.enabled, true);
});
