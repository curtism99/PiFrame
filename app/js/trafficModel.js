import uPlot from "../vendor/uplot-1.6.32/uPlot.esm.js";

export const TRAFFIC_SERIES = ["rx", "tx", "rxPeak", "txPeak"];

export function formatRate(bps) {
  if (!Number.isFinite(bps) || bps < 0) return "—";
  return bps >= 1e9 ? `${(bps / 1e9).toFixed(2)} Gbps` : `${(bps / 1e6).toFixed(2)} Mbps`;
}

export function formatAge(timestampMs, nowMs) {
  if (!Number.isFinite(timestampMs)) return "waiting";
  const seconds = Math.max(0, Math.floor((nowMs - timestampMs) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function spacing(points) {
  const numeric = points.filter((point) => point.bps !== null).slice(-31);
  const deltas = numeric.slice(1).map((point, index) => point.timestampMs - numeric[index].timestampMs)
    .filter((delta) => delta > 0).sort((a, b) => a - b);
  const mid = Math.floor(deltas.length / 2);
  return !deltas.length ? null : deltas.length % 2 ? deltas[mid] : (deltas[mid - 1] + deltas[mid]) / 2;
}

export function plotTable(points, pollIntervalMs = 15_000) {
  const gapThreshold = Math.max(60_000, 3 * (spacing(points) ?? 0), 3 * pollIntervalMs);
  const x = [];
  const y = [];
  let previous;
  for (const point of points) {
    // A display-only null prevents interpolation through an outage. No invented rates.
    if (previous && point.timestampMs - previous.timestampMs > gapThreshold) {
      x.push((previous.timestampMs + point.timestampMs) / 2000);
      y.push(null);
    }
    x.push(point.timestampMs / 1000);
    y.push(point.bps);
    previous = point;
  }
  return [x, y];
}

export function alignTraffic(series, pollIntervalMs = 15_000) {
  const tables = TRAFFIC_SERIES.map((name) => plotTable(series[name] ?? [], pollIntervalMs));
  // Retain real nulls; alignment holes remain undefined and do not interrupt lines.
  return uPlot.join(tables, tables.map(() => [null, 1]));
}

export function directionState(direction, nowMs) {
  const timestamp = direction?.latestTimestampMs;
  return {
    age: formatAge(timestamp, nowMs),
    stale: !Number.isFinite(timestamp) || nowMs - timestamp > (direction?.staleAfterMs ?? 60_000)
  };
}

export function currentReading(points = [], direction, nowMs) {
  const observed = points.filter((point) => Number.isFinite(point.timestampMs) && point.timestampMs <= nowMs);
  const valid = (point) => Number.isFinite(point.bps) && point.bps >= 0;
  const latest = observed.findLast(valid);
  const unknown = !observed.length || !valid(observed.at(-1));
  const state = directionState({ ...direction, latestTimestampMs: latest?.timestampMs ?? null }, nowMs);
  return {
    bps: latest?.bps ?? null,
    timestampMs: latest?.timestampMs ?? null,
    label: "latest",
    unknown,
    ...state
  };
}

export function summarizePeaks(points = [], nowMs, pollIntervalMs = 15_000) {
  // Each peak series has its own timestamps, independent of average samples.
  const visible = points.filter((point) => Number.isFinite(point.timestampMs) &&
    point.timestampMs >= nowMs - 3_600_000 && point.timestampMs <= nowMs);
  const valid = (point) => Number.isFinite(point.bps) && point.bps >= 0;
  const numeric = visible.filter(valid);
  const latest = visible.at(-1);
  const latestValid = numeric.at(-1);
  const staleAfterMs = Math.max(60_000, 3 * (spacing(numeric) ?? 0), 3 * pollIntervalMs);
  return {
    // Readouts retain the last recorded peak; plotted nulls remain unknown gaps.
    latestBps: latestValid?.bps ?? null,
    latestTimestampMs: latestValid?.timestampMs ?? null,
    highBps: numeric.length ? Math.max(...numeric.map((point) => point.bps)) : null,
    age: formatAge(latestValid?.timestampMs, nowMs),
    stale: !latestValid || nowMs - latestValid.timestampMs > staleAfterMs,
    unknown: !latest || !valid(latest)
  };
}

const localTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago", hour: "numeric", minute: "2-digit"
});

export function formatLocalTime(seconds) {
  return localTime.format(new Date(seconds * 1000));
}
