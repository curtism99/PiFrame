export const POLL_MS = 15_000;
export const WINDOW_MS = 3_600_000;
export const SERIES_NAMES = ["rx", "tx", "rxPeak", "txPeak"];

export class TrafficError extends Error {
  constructor(code, retryAfterMs = null) {
    super(code);
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

export function selectPhysicalInterface(interfaces) {
  const matches = Array.isArray(interfaces) ? interfaces.filter((item) =>
    item?.identification?.name === "port1" &&
    item.identification.position === 1 &&
    item.identification.description === "ATTUplink") : [];
  if (matches.length !== 1) throw new TrafficError("identity_mismatch");
  const status = matches[0].status ?? {};
  // Only bounded, recognized link fields may cross the private/public boundary.
  return {
    state: ["active", "inactive", "disabled", "disconnected"].includes(status.status) ? status.status : "unknown",
    plugged: typeof status.plugged === "boolean" ? status.plugged : null,
    speed: typeof status.currentSpeed === "string" && /^\d{1,6}-(full|half)$/.test(status.currentSpeed) ? status.currentSpeed : null
  };
}

export function normalizePoints(points) {
  const unique = new Map();
  for (const point of Array.isArray(points) ? points : []) {
    if (!Number.isFinite(point?.x) || point.x < 0 || point.x > 8.64e15) continue;
    unique.set(point.x, {
      timestampMs: point.x,
      bps: Number.isFinite(point.y) && point.y >= 0 ? point.y : null
    });
  }
  return [...unique.values()].sort((a, b) => a.timestampMs - b.timestampMs);
}

export function normalizeStatistics(payload) {
  const matches = Array.isArray(payload?.interfaces) ? payload.interfaces.filter((item) =>
    item?.id === "port1" && item.name === "ATTUplink") : [];
  if (matches.length !== 1) throw new TrafficError("identity_mismatch");
  const item = matches[0];
  return {
    series: {
      rx: normalizePoints(item.receive?.avg),
      tx: normalizePoints(item.transmit?.avg),
      rxPeak: normalizePoints(item.receive?.max),
      txPeak: normalizePoints(item.transmit?.max)
    },
    sourcePeriodMs: Number.isFinite(payload.period) && payload.period >= 0 ? payload.period : null,
    sourceInterval: "hour"
  };
}

export function medianSpacing(points) {
  const numeric = points.filter((point) => point.bps !== null).slice(-31);
  const spacings = numeric.slice(1).map((point, index) => point.timestampMs - numeric[index].timestampMs)
    .filter((spacing) => spacing > 0).sort((a, b) => a - b);
  if (!spacings.length) return null;
  const mid = Math.floor(spacings.length / 2);
  return spacings.length % 2 ? spacings[mid] : (spacings[mid - 1] + spacings[mid]) / 2;
}

export function directionFreshness(points, nowMs) {
  const latest = points.findLast((point) => point.bps !== null);
  const spacing = medianSpacing(points);
  const staleAfterMs = Math.max(60_000, 3 * (spacing ?? 0), 3 * POLL_MS);
  const ageMs = latest ? Math.max(0, nowMs - latest.timestampMs) : null;
  return {
    latestTimestampMs: latest?.timestampMs ?? null,
    currentBps: points.at(-1)?.bps ?? null,
    medianSpacingMs: spacing,
    staleAfterMs,
    ageMs,
    stale: ageMs === null || ageMs > staleAfterMs
  };
}

export function retryAfterMs(value, nowMs) {
  if (!value) return null;
  if (/^\d+(\.\d+)?$/.test(value.trim())) return Number(value) * 1000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - nowMs) : null;
}
