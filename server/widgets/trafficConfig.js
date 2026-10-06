// Display configuration only. UISP connection information never belongs here.
export function publicTrafficConfig(settings = {}) {
  return {
    enabled: settings.enabled === true,
    position: "bottom",
    label: "ACC uplink",
    window_minutes: 60,
    height_percent: 15,
    poll_seconds: 15,
    show_peaks: settings.show_peaks !== false
  };
}
