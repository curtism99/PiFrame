export class ClockOverlay {
  constructor(element, clockConfig = {}) {
    this.element = element;
    this.config = clockConfig;
    this.timer = null;
  }

  start() {
    this.stop();
    this.applyConfig(this.config);
    this.render();
    this.timer = window.setInterval(() => this.render(), 1000);
  }

  stop() {
    window.clearInterval(this.timer);
    this.timer = null;
  }

  applyConfig(clockConfig = {}) {
    this.config = clockConfig;
    this.element.className = "widget-card clock-widget";
    this.element.hidden = !clockConfig.enabled;
  }

  setEnabled(enabled) {
    this.config = { ...this.config, enabled };
    this.element.hidden = !enabled;
    this.render();
  }

  render() {
    if (!this.config.enabled) {
      return;
    }

    const now = new Date();
    const hour12 = this.config.format !== "24h";
    const time = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12
    }).format(now);

    const date = this.config.show_date
      ? `<div class="clock-date">${new Intl.DateTimeFormat(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric"
        }).format(now)}</div>`
      : "";

    this.element.innerHTML = `<div class="clock-time">${time}</div>${date}`;
  }
}
