const NWS_BASE = "https://api.weather.gov";
const POINT_CACHE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 8000;
const SEVERITY_ORDER = {
  Extreme: 5,
  Severe: 4,
  Moderate: 3,
  Minor: 2,
  Unknown: 1
};
const URGENCY_ORDER = {
  Immediate: 4,
  Expected: 3,
  Future: 2,
  Past: 1,
  Unknown: 0
};

export function createWeatherService(config, runtimeState) {
  const weatherConfig = config.widgets?.weather ?? {};
  let pointCache = null;
  let pointCacheAt = 0;
  let lastPayload = null;
  let lastFetchAt = 0;
  let inFlight = null;

  async function getWeather({ refresh = false } = {}) {
    if (!weatherConfig.enabled) {
      return {
        enabled: false,
        ok: true,
        message: "Weather widget disabled"
      };
    }

    const state = await runtimeState.read();
    const cacheMs = minutes(weatherConfig.refresh_minutes, 10) * 60 * 1000;
    const effectiveCacheMs = lastPayload?.ok === false ? Math.min(cacheMs, 60_000) : cacheMs;
    const fresh = lastPayload && Date.now() - lastFetchAt < effectiveCacheMs;

    if (!refresh && fresh) {
      return withRuntimeAlerts(lastPayload, state, weatherConfig);
    }

    try {
      inFlight ??= fetchWeatherPayload(config, weatherConfig, {
        getPointMetadata: () => getPointMetadata(config, weatherConfig)
      }).finally(() => {
        inFlight = null;
      });

      lastPayload = await inFlight;
      lastFetchAt = Date.now();
      return withRuntimeAlerts(lastPayload, state, weatherConfig);
    } catch (error) {
      if (lastPayload) {
        return withRuntimeAlerts({
          ...lastPayload,
          ok: false,
          stale: true,
          error: error.message,
          updated_at: new Date().toISOString()
        }, state, weatherConfig);
      }

      lastPayload = {
        enabled: true,
        ok: false,
        stale: true,
        provider: "nws",
        current: null,
        hourly: [],
        daily: [],
        alerts: [],
        error: error.message,
        updated_at: new Date().toISOString()
      };
      lastFetchAt = Date.now();
      return withRuntimeAlerts(lastPayload, state, weatherConfig);
    }
  }

  async function getPointMetadata(config, weatherConfig) {
    if (pointCache && Date.now() - pointCacheAt < POINT_CACHE_MS) {
      return pointCache;
    }

    const latitude = Number(weatherConfig.latitude);
    const longitude = Number(weatherConfig.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error("Weather widget requires widgets.weather.latitude and widgets.weather.longitude");
    }

    const pointUrl = `${NWS_BASE}/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    const point = await fetchJson(pointUrl, config, weatherConfig);
    const properties = point.properties ?? {};
    pointCache = {
      point_url: pointUrl,
      forecast_url: properties.forecast,
      hourly_url: properties.forecastHourly,
      observation_stations_url: properties.observationStations,
      forecast_zone_url: properties.forecastZone,
      county_url: properties.county,
      city: properties.relativeLocation?.properties?.city ?? null,
      state: properties.relativeLocation?.properties?.state ?? null
    };
    pointCacheAt = Date.now();
    return pointCache;
  }

  return { getWeather };
}

async function fetchWeatherPayload(config, weatherConfig, { getPointMetadata }) {
  const point = await getPointMetadata();
  const [hourly, daily, observation, alerts] = await Promise.all([
    fetchHourlyForecast(point, config, weatherConfig),
    fetchDailyForecast(point, config, weatherConfig),
    fetchLatestObservation(point, config, weatherConfig).catch(() => null),
    fetchAlerts(point, config, weatherConfig).catch(() => [])
  ]);

  const current = currentFromObservation(observation, weatherConfig)
    ?? currentFromHourly(hourly, weatherConfig);

  return {
    enabled: true,
    ok: true,
    stale: false,
    provider: "nws",
    location: [point.city, point.state].filter(Boolean).join(", ") || null,
    current,
    hourly,
    daily,
    alerts,
    updated_at: new Date().toISOString(),
    error: null
  };
}

async function fetchHourlyForecast(point, config, weatherConfig) {
  if (!point.hourly_url) {
    return [];
  }

  const payload = await fetchJson(point.hourly_url, config, weatherConfig);
  const periods = payload.properties?.periods ?? [];
  return periods.slice(0, Number(weatherConfig.hourly_periods) || 6).map((period) => ({
    name: period.name,
    start_time: period.startTime,
    end_time: period.endTime,
    temperature: normalizeTemperature(period.temperature, period.temperatureUnit, weatherConfig),
    temperature_unit: unitLabel(weatherConfig),
    short_forecast: period.shortForecast,
    is_daytime: period.isDaytime
  }));
}

async function fetchDailyForecast(point, config, weatherConfig) {
  if (!point.forecast_url) {
    return [];
  }

  const payload = await fetchJson(point.forecast_url, config, weatherConfig);
  const periods = payload.properties?.periods ?? [];
  const days = new Map();

  for (const period of periods) {
    const key = (period.startTime ?? "").slice(0, 10);
    if (!key) {
      continue;
    }

    const existing = days.get(key) ?? {
      date: key,
      label: weekdayLabel(period.startTime),
      high: null,
      low: null,
      short_forecast: period.shortForecast
    };

    const temp = normalizeTemperature(period.temperature, period.temperatureUnit, weatherConfig);
    if (period.isDaytime) {
      existing.high = temp;
      existing.short_forecast = period.shortForecast ?? existing.short_forecast;
    } else {
      existing.low = temp;
    }

    days.set(key, existing);
  }

  return [...days.values()].slice(0, 7).map((day) => ({
    ...day,
    temperature_unit: unitLabel(weatherConfig)
  }));
}

async function fetchLatestObservation(point, config, weatherConfig) {
  if (!point.observation_stations_url) {
    return null;
  }

  const stations = await fetchJson(point.observation_stations_url, config, weatherConfig);
  const stationUrl = stations.observationStations?.[0];
  if (!stationUrl) {
    return null;
  }

  const observation = await fetchJson(`${stationUrl}/observations/latest`, config, weatherConfig);
  return {
    station: stationUrl.split("/").pop(),
    timestamp: observation.properties?.timestamp,
    temperature_c: observation.properties?.temperature?.value,
    condition: observation.properties?.textDescription
  };
}

async function fetchAlerts(point, config, weatherConfig) {
  const latitude = Number(weatherConfig.latitude);
  const longitude = Number(weatherConfig.longitude);
  const urls = [
    `${NWS_BASE}/alerts/active?point=${latitude.toFixed(4)},${longitude.toFixed(4)}`
  ];

  const zoneId = point.forecast_zone_url?.split("/").pop();
  if (zoneId) {
    urls.push(`${NWS_BASE}/alerts/active?zone=${encodeURIComponent(zoneId)}`);
  }

  for (const url of urls) {
    try {
      const payload = await fetchJson(url, config, weatherConfig);
      return sortAlerts((payload.features ?? []).map(normalizeAlert)).slice(0, maxAlerts(weatherConfig));
    } catch {
      // Try the next alert source.
    }
  }

  return [];
}

function currentFromObservation(observation, weatherConfig) {
  if (!observation?.timestamp || !Number.isFinite(Number(observation.temperature_c))) {
    return null;
  }

  const staleMs = minutes(weatherConfig.stale_after_minutes, 90) * 60 * 1000;
  const observedAt = new Date(observation.timestamp).getTime();
  if (!Number.isFinite(observedAt) || Date.now() - observedAt > staleMs) {
    return null;
  }

  return {
    temperature: normalizeTemperature(observation.temperature_c, "C", weatherConfig),
    temperature_unit: unitLabel(weatherConfig),
    condition: observation.condition || "Current conditions",
    source: "observation",
    observed_at: observation.timestamp,
    station: observation.station
  };
}

function currentFromHourly(hourly, weatherConfig) {
  const period = hourly[0];
  if (!period) {
    return null;
  }

  return {
    temperature: period.temperature,
    temperature_unit: unitLabel(weatherConfig),
    condition: period.short_forecast,
    source: "hourly forecast",
    forecast_time: period.start_time
  };
}

function normalizeAlert(feature) {
  const properties = feature.properties ?? {};
  const effective = properties.effective ?? properties.onset ?? properties.sent ?? null;
  const ends = properties.ends ?? null;
  const expires = properties.expires ?? null;

  return {
    id: feature.id ?? properties.id ?? properties.event,
    event: properties.event ?? "Weather Alert",
    severity: properties.severity ?? "Unknown",
    urgency: properties.urgency ?? "Unknown",
    certainty: properties.certainty ?? "Unknown",
    effective,
    ends,
    expires,
    headline: properties.headline ?? properties.description ?? properties.event ?? "Weather alert",
    display_range: displayRange(effective, ends ?? expires),
    priority: alertPriority(properties.event, properties.severity, properties.urgency),
    test: false
  };
}

function withRuntimeAlerts(payload, state, weatherConfig) {
  const testEnabled = Boolean(state.weather_test_alerts_enabled ?? weatherConfig.test_alerts?.enabled);
  const alerts = testEnabled
    ? buildTestAlerts()
    : payload.alerts ?? [];

  return {
    ...payload,
    test_alerts_enabled: testEnabled,
    alerts: sortAlerts(alerts).slice(0, maxAlerts(weatherConfig))
  };
}

function buildTestAlerts() {
  const now = new Date();
  return [
    testAlert("Tornado Warning", "Extreme", "Immediate", addMinutes(now, -8), addMinutes(now, 32)),
    testAlert("Severe Thunderstorm Warning", "Severe", "Immediate", addMinutes(now, -14), addMinutes(now, 46)),
    testAlert("Tornado Watch", "Severe", "Expected", addMinutes(now, -45), addMinutes(now, 175))
  ];
}

function testAlert(event, severity, urgency, effectiveDate, endDate) {
  const effective = effectiveDate.toISOString();
  const ends = endDate.toISOString();
  return {
    id: `test-${event.toLowerCase().replaceAll(" ", "-")}`,
    event,
    severity,
    urgency,
    certainty: event.includes("Warning") ? "Observed" : "Possible",
    effective,
    ends,
    expires: ends,
    headline: `TEST ${event} for PiFrame weather alert display`,
    display_range: displayRange(effective, ends),
    priority: alertPriority(event, severity, urgency),
    test: true
  };
}

async function fetchJson(url, config, weatherConfig) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(weatherConfig.timeout_ms) || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/geo+json, application/json",
        "User-Agent": weatherConfig.user_agent ?? `PiFrame/${config.device_name ?? "local"}`
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`NWS request failed ${response.status} for ${url}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeTemperature(value, unit, weatherConfig) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const wanted = unitLabel(weatherConfig);
  if (wanted === "F" && unit?.toUpperCase().startsWith("C")) {
    return Math.round((numeric * 9) / 5 + 32);
  }
  if (wanted === "C" && unit?.toUpperCase().startsWith("F")) {
    return Math.round(((numeric - 32) * 5) / 9);
  }
  return Math.round(numeric);
}

function unitLabel(weatherConfig) {
  return weatherConfig.units === "celsius" ? "C" : "F";
}

function sortAlerts(alerts) {
  return [...alerts].sort((a, b) => {
    if ((b.priority ?? 0) !== (a.priority ?? 0)) {
      return (b.priority ?? 0) - (a.priority ?? 0);
    }
    return new Date(a.effective ?? 0) - new Date(b.effective ?? 0);
  });
}

function alertPriority(event = "", severity = "Unknown", urgency = "Unknown") {
  const normalized = event.toLowerCase();
  let eventScore = 0;
  if (normalized.includes("tornado warning")) {
    eventScore = 100;
  } else if (normalized.includes("severe thunderstorm warning")) {
    eventScore = 90;
  } else if (normalized.includes("tornado watch")) {
    eventScore = 80;
  } else if (normalized.includes("warning")) {
    eventScore = 70;
  } else if (normalized.includes("watch")) {
    eventScore = 50;
  } else if (normalized.includes("advisory")) {
    eventScore = 30;
  }

  return eventScore + (SEVERITY_ORDER[severity] ?? 0) + (URGENCY_ORDER[urgency] ?? 0);
}

function displayRange(start, end) {
  if (start && end) {
    return `${timeLabel(start)} - ${timeLabel(end)}`;
  }
  if (end) {
    return `Until ${timeLabel(end)}`;
  }
  if (start) {
    return `From ${timeLabel(start)}`;
  }
  return "Time period unavailable";
}

function timeLabel(value) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function weekdayLabel(value) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(new Date(value));
}

function addMinutes(date, minutesToAdd) {
  return new Date(date.getTime() + minutesToAdd * 60 * 1000);
}

function minutes(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function maxAlerts(weatherConfig) {
  const value = Number(weatherConfig.max_alerts);
  return Number.isFinite(value) && value > 0 ? value : 3;
}
