import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  POLL_MS, WINDOW_MS, SERIES_NAMES, TrafficError, selectPhysicalInterface,
  normalizeStatistics, directionFreshness, retryAfterMs
} from "./trafficData.js";

const MESSAGES = {
  missing_credentials: "UISP connection is not configured",
  invalid_credentials: "UISP private configuration is invalid",
  authentication: "UISP authentication failed; correct credentials and restart the service",
  rate_limited: "UISP rate limit; waiting before retrying",
  network: "UISP is unreachable; retrying",
  timeout: "UISP request timed out; retrying",
  server: "UISP is unavailable; retrying",
  invalid_response: "UISP response could not be read",
  identity_mismatch: "Physical uplink identity could not be verified"
};

export function validatePrivateConfig(input) {
  try {
    const origin = new URL(input.origin);
    if (origin.protocol !== "https:" || origin.username || origin.password ||
        origin.pathname !== "/" || origin.search || origin.hash ||
        !/^[a-zA-Z0-9-]{1,128}$/.test(input.device_id) ||
        typeof input.token !== "string" || !input.token.trim() || /[\r\n]/.test(input.token)) {
      throw new Error();
    }
    return { origin: origin.origin, deviceId: input.device_id, token: input.token };
  } catch {
    throw new TrafficError("invalid_credentials");
  }
}

export async function readPrivateConfig() {
  const filename = process.env.PIFRAME_UISP_CONFIG_PATH ?? path.resolve("config/uisp.local.json");
  let content;
  try {
    content = await readFile(filename, "utf8");
  } catch {
    throw new TrafficError("missing_credentials");
  }
  try {
    if (content.length > 65_536) throw new Error();
    return validatePrivateConfig(JSON.parse(content));
  } catch {
    throw new TrafficError("invalid_credentials");
  }
}

export function createTrafficService(config, dependencies = {}) {
  const enabled = config.widgets?.acc_traffic?.enabled === true;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const now = dependencies.now ?? Date.now;
  const setTimer = dependencies.setTimer ?? setTimeout;
  const clearTimer = dependencies.clearTimer ?? clearTimeout;
  const setRequestTimer = dependencies.setRequestTimer ?? setTimeout;
  const clearRequestTimer = dependencies.clearRequestTimer ?? clearTimeout;
  const loadPrivate = dependencies.readPrivateConfig ?? readPrivateConfig;
  let privateConfig;
  let started = false;
  let stopped = false;
  let suspended = false;
  let inFlight = null;
  let timer;
  let controller;
  let failures = 0;
  let nextPollAtMs = null;
  let lastAttemptAtMs = null;
  let fetchedAtMs = null;
  let link = { state: "unknown", plugged: null, speed: null, checkedAtMs: null, verified: false };
  let error = null;
  let data = {
    series: Object.fromEntries(SERIES_NAMES.map((name) => [name, []])),
    sourcePeriodMs: null,
    sourceInterval: "hour"
  };

  function report(code) {
    error = { code, message: MESSAGES[code] ?? MESSAGES.invalid_response };
  }

  async function request(suffix) {
    controller = new AbortController();
    const deadline = setRequestTimer(() => controller?.abort(), 10_000);
    deadline.unref?.();
    try {
      const url = `${privateConfig.origin}/nms/api/v2.1/devices/${encodeURIComponent(privateConfig.deviceId)}/${suffix}`;
      const response = await fetchImpl(url, {
        headers: { "x-auth-token": privateConfig.token, Accept: "application/json" },
        signal: controller.signal,
        redirect: "error"
      });
      if (response.status === 401 || response.status === 403) throw new TrafficError("authentication");
      if (response.status === 429) throw new TrafficError("rate_limited", retryAfterMs(response.headers.get("retry-after"), now()));
      if (response.status >= 500) throw new TrafficError("server");
      if (!response.ok) throw new TrafficError("invalid_response");
      try {
        return await response.json();
      } catch {
        throw new TrafficError(controller.signal.aborted ? "timeout" : "invalid_response");
      }
    } catch (caught) {
      if (caught instanceof TrafficError) throw caught;
      throw new TrafficError(controller.signal.aborted ? "timeout" : "network");
    } finally {
      clearRequestTimer(deadline);
      controller = null;
    }
  }

  async function collect() {
    if (!enabled || stopped || suspended || !privateConfig) return;
    const began = now();
    lastAttemptAtMs = began;
    let delay = POLL_MS;
    let failed = false;
    try {
      if (!link.verified || link.checkedAtMs === null || began - link.checkedAtMs >= 60_000) {
        link.verified = false;
        const checked = selectPhysicalInterface(await request("interfaces"));
        link = { ...checked, verified: true, checkedAtMs: now() };
      }
      const replacement = normalizeStatistics(await request("statistics?interval=hour"));
      data = replacement;
      fetchedAtMs = now();
      failures = 0;
      error = null;
    } catch (caught) {
      failed = true;
      const code = caught instanceof TrafficError ? caught.code : "invalid_response";
      report(code);
      if (code === "identity_mismatch") link.verified = false;
      if (code === "authentication") suspended = true;
      failures += 1;
      delay = Math.min(300_000, POLL_MS * 2 ** Math.min(failures - 1, 5));
      if (code === "rate_limited" && caught.retryAfterMs !== null) delay = Math.max(delay, caught.retryAfterMs);
    }
    if (!stopped && !suspended) {
      // A recursive timer prevents overlap, even when both ten-second requests are slow.
      const remaining = failed ? delay : Math.max(0, delay - (now() - began));
      nextPollAtMs = now() + remaining;
      timer = setTimer(() => { inFlight = collect(); }, remaining);
      timer?.unref?.();
    } else nextPollAtMs = null;
  }

  async function start() {
    if (started || !enabled) return;
    started = true;
    try {
      privateConfig = await loadPrivate();
      if (!stopped) {
        inFlight = collect();
        await inFlight;
      }
    } catch (caught) {
      report(caught instanceof TrafficError ? caught.code : "invalid_credentials");
      suspended = true;
    }
  }

  function getSnapshot() {
    const currentTime = now();
    const freshness = {
      rx: directionFreshness(data.series.rx, currentTime),
      tx: directionFreshness(data.series.tx, currentTime)
    };
    return structuredClone({
      enabled, label: "ACC uplink", timezone: "America/Chicago",
      pollIntervalMs: POLL_MS, windowMs: WINDOW_MS,
      ...data, fetchedAtMs, lastAttemptAtMs, nextPollAtMs,
      apiAgeMs: fetchedAtMs === null ? null : Math.max(0, currentTime - fetchedAtMs),
      freshness,
      link: { ...link, stale: link.checkedAtMs === null || currentTime - link.checkedAtMs > 60_000 },
      status: !enabled ? "disabled" : suspended ? "suspended" : error ? "error" : fetchedAtMs === null ? "waiting" :
        freshness.rx.stale || freshness.tx.stale ? "stale" : "ok",
      error
    });
  }

  function stop() {
    stopped = true;
    clearTimer(timer);
    controller?.abort();
    nextPollAtMs = null;
  }

  return { start, stop, getSnapshot, whenIdle: () => inFlight ?? Promise.resolve() };
}
