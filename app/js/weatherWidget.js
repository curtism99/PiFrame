import { fetchWeatherWidget } from "./widgetClient.js";

export class WeatherWidget {
  constructor(element, config = {}) {
    this.element = element;
    this.config = config;
    this.weather = null;
    this.pollTimer = null;
    this.cycleTimer = null;
    this.view = "hourly";
  }

  start() {
    this.stop();
    this.element.classList.add("weather-widget");
    this.element.hidden = true;
    this.refresh({ force: true });
    this.pollTimer = window.setInterval(() => this.refresh(), 30_000);

    const cycleSeconds = Number(this.config.forecast_cycle_seconds) || 25;
    this.cycleTimer = window.setInterval(() => {
      this.view = this.view === "hourly" ? "daily" : "hourly";
      this.render();
    }, cycleSeconds * 1000);
  }

  stop() {
    window.clearInterval(this.pollTimer);
    window.clearInterval(this.cycleTimer);
    this.pollTimer = null;
    this.cycleTimer = null;
  }

  async refresh(options = {}) {
    try {
      this.weather = await fetchWeatherWidget({ refresh: options.force });
    } catch (error) {
      this.weather = {
        enabled: true,
        ok: false,
        stale: true,
        error: error.message,
        current: null,
        hourly: [],
        daily: [],
        alerts: []
      };
    }
    this.render();
  }

  render() {
    if (!this.weather?.enabled) {
      this.element.hidden = true;
      return;
    }

    this.element.hidden = false;
    const weather = this.weather;
    const current = weather.current;
    const temp = current?.temperature != null
      ? `${current.temperature}&deg;${current.temperature_unit ?? "F"}`
      : "--&deg;";
    const condition = current?.condition ?? weather.error ?? "Weather unavailable";
    const source = weather.stale ? "stale" : current?.source ?? weather.provider ?? "weather";
    const forecast = this.view === "hourly"
      ? this.renderHourly(weather.hourly ?? [])
      : this.renderDaily(weather.daily ?? []);
    const alerts = this.renderAlerts(weather.alerts ?? []);

    this.element.innerHTML = `
      <div class="weather-current">
        <div class="weather-temp">${temp}</div>
        <div class="weather-meta">
          <div>${escapeHtml(condition)}</div>
          <span>${escapeHtml(sourceLabel(source))}</span>
        </div>
      </div>
      <div class="weather-forecast">
        <div class="weather-section-title">${this.view === "hourly" ? "Next hours" : "7 day"}</div>
        ${forecast}
      </div>
      ${alerts}
    `;
  }

  renderHourly(periods) {
    if (!periods.length) {
      return `<div class="weather-empty">Hourly forecast unavailable</div>`;
    }

    return `
      <div class="weather-hourly">
        ${periods.slice(0, 4).map((period) => `
          <div class="weather-row">
            <span>${escapeHtml(hourLabel(period.start_time))}</span>
            <strong>${temperatureLabel(period)}</strong>
            <em>${escapeHtml(period.short_forecast ?? "")}</em>
          </div>
        `).join("")}
      </div>
    `;
  }

  renderDaily(days) {
    if (!days.length) {
      return `<div class="weather-empty">7 day forecast unavailable</div>`;
    }

    return `
      <div class="weather-daily">
        ${days.slice(0, 5).map((day) => `
          <div class="weather-row">
            <span>${escapeHtml(day.label ?? "")}</span>
            <strong>${highLowLabel(day)}</strong>
            <em>${escapeHtml(day.short_forecast ?? "")}</em>
          </div>
        `).join("")}
      </div>
    `;
  }

  renderAlerts(alerts) {
    if (!alerts.length) {
      return `<div class="weather-alerts is-clear">No active alerts</div>`;
    }

    return `
      <div class="weather-alerts">
        ${alerts.map((alert) => `
          <div class="weather-alert ${alertClass(alert)}">
            <div class="weather-alert-heading">
              <strong>${escapeHtml(alert.event ?? "Weather Alert")}</strong>
              ${alert.test ? `<span>TEST</span>` : ""}
            </div>
            <div class="weather-alert-time">${escapeHtml(alert.display_range ?? "Time period unavailable")}</div>
          </div>
        `).join("")}
      </div>
    `;
  }
}

function temperatureLabel(period) {
  if (period.temperature == null) {
    return "--";
  }
  return `${period.temperature}&deg;${period.temperature_unit ?? "F"}`;
}

function highLowLabel(day) {
  const high = day.high == null ? "--" : `${day.high}&deg;`;
  const low = day.low == null ? "--" : `${day.low}&deg;`;
  return `${high}/${low}`;
}

function hourLabel(value) {
  if (!value) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    hour12: true
  }).format(new Date(value)).replace(/\s/g, "");
}

function alertClass(alert) {
  const event = String(alert.event ?? "").toLowerCase();
  if (event.includes("tornado warning")) {
    return "alert-tornado-warning";
  }
  if (event.includes("severe thunderstorm warning")) {
    return "alert-severe-thunderstorm";
  }
  if (event.includes("tornado watch")) {
    return "alert-tornado-watch";
  }
  if (event.includes("warning")) {
    return "alert-warning";
  }
  return "alert-watch";
}

function sourceLabel(source) {
  if (source === "observation") {
    return "observed";
  }
  return source;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
