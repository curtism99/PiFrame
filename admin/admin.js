const elements = {
  deviceName: document.querySelector("#device-name"),
  statusList: document.querySelector("#status-list"),
  mediaList: document.querySelector("#media-list"),
  weatherList: document.querySelector("#weather-list"),
  weatherAlertList: document.querySelector("#weather-alert-list"),
  warningList: document.querySelector("#warning-list"),
  refresh: document.querySelector("#refresh"),
  manifestRefresh: document.querySelector("#manifest-refresh"),
  syncTrigger: document.querySelector("#sync-trigger"),
  clockToggle: document.querySelector("#clock-toggle"),
  weatherTestAlertsToggle: document.querySelector("#weather-test-alerts-toggle"),
  effectsToggle: document.querySelector("#effects-toggle"),
  effectsStyle: document.querySelector("#effects-style"),
  slideshowPlaylist: document.querySelector("#slideshow-playlist"),
  ambiencePlaylist: document.querySelector("#ambience-playlist"),
  modeButtons: [...document.querySelectorAll("[data-mode]")]
};

let lastPayload = null;

elements.refresh.addEventListener("click", refresh);
elements.manifestRefresh.addEventListener("click", async () => {
  await fetch("/api/manifest/refresh", { method: "POST" });
  await refresh();
});
elements.syncTrigger.addEventListener("click", async () => {
  const response = await fetch("/api/sync", { method: "POST" });
  const payload = await response.json().catch(() => ({}));
  alert(payload.message ?? payload.output ?? "Sync request finished.");
  await refresh();
});
elements.clockToggle.addEventListener("change", async () => {
  await fetch("/api/clock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: elements.clockToggle.checked })
  });
  await refresh();
});
elements.weatherTestAlertsToggle.addEventListener("change", async () => {
  await fetch("/api/widgets/weather/test-alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: elements.weatherTestAlertsToggle.checked })
  });
  await refresh();
});
elements.effectsToggle.addEventListener("change", updateEffects);
elements.effectsStyle.addEventListener("change", updateEffects);
elements.slideshowPlaylist.addEventListener("change", updatePlaylists);
elements.ambiencePlaylist.addEventListener("change", updatePlaylists);
elements.modeButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    await fetch("/api/mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: button.dataset.mode })
    });
    await refresh();
  });
});

await refresh();
window.setInterval(refresh, 15000);

async function refresh() {
  const [health, config, manifest, mode, weather] = await Promise.all([
    getJson("/api/health"),
    getJson("/api/config"),
    getJson("/api/manifest"),
    getJson("/api/mode"),
    getJson("/api/widgets/weather")
  ]);

  lastPayload = { health, config, manifest, mode, weather };
  render(lastPayload);
}

async function getJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url} failed with ${response.status}`);
  }
  return response.json();
}

function render({ health, config, manifest, mode, weather }) {
  elements.deviceName.textContent = `${config.device_name} (${config.location})`;
  elements.clockToggle.checked = Boolean(mode.clock_enabled);
  elements.weatherTestAlertsToggle.checked = Boolean(weather.test_alerts_enabled);
  elements.effectsToggle.checked = Boolean(mode.slideshow_effects?.enabled);
  elements.effectsStyle.value = mode.slideshow_effects?.style ?? "random";
  renderPlaylistSelect(
    elements.slideshowPlaylist,
    manifest.slideshow?.groups,
    mode.selected_playlists?.slideshow,
    "All slideshow playlists",
    "items"
  );
  renderPlaylistSelect(
    elements.ambiencePlaylist,
    manifest.ambience?.groups,
    mode.selected_playlists?.ambience,
    "All ambience playlists",
    "videos"
  );
  elements.modeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === mode.effective_mode);
  });

  setDefinitionList(elements.statusList, {
    "Backend health": health.ok ? "ok" : "not ok",
    "Current mode": mode.effective_mode,
    "Configured mode": mode.configured_mode,
    "Auto enabled": yesNo(mode.auto_mode_enabled),
    "Clock": yesNo(mode.clock_enabled),
    "Weather": yesNo(weather.enabled),
    "Weather test alerts": yesNo(weather.test_alerts_enabled),
    "Slideshow transitions": `${yesNo(mode.slideshow_effects?.enabled)} (${mode.slideshow_effects?.style ?? "random"})`,
    "Slideshow playlist": playlistStatus(manifest.slideshow?.groups, mode.selected_playlists?.slideshow),
    "Ambience playlist": playlistStatus(manifest.ambience?.groups, mode.selected_playlists?.ambience),
    "Media root": config.media.root,
    "NAS source": config.nas_sync?.source ?? "not configured",
    "Last sync": config.runtime?.last_sync ?? "unknown",
    "State file": mode.state_path
  });

  setDefinitionList(elements.mediaList, {
    "Photos": manifest.counts?.photos ?? 0,
    "Videos": manifest.counts?.videos ?? 0,
    "Slideshow items": manifest.counts?.slideshow_items ?? 0,
    "Slideshow playlists": manifest.counts?.slideshow_groups ?? 0,
    "Ambience videos": manifest.counts?.ambience_videos ?? 0,
    "Ambience playlists": manifest.counts?.ambience_groups ?? 0,
    "Slideshow roots": (manifest.playlists?.slideshow ?? []).join(", ") || "none",
    "Ambience roots": (manifest.playlists?.ambience ?? []).join(", ") || "none",
    "Manifest": manifest.generated_at,
    "Local cache": manifest.media_root,
    "Static media root": manifest.media_asset_root ?? config.media.root
  });

  setDefinitionList(elements.weatherList, {
    "Enabled": yesNo(weather.enabled),
    "Status": weather.ok ? "ok" : "not ok",
    "Location": weather.location ?? "unknown",
    "Current": weather.current?.temperature != null
      ? `${weather.current.temperature} deg ${weather.current.temperature_unit ?? "F"}`
      : "unavailable",
    "Condition": weather.current?.condition ?? "unknown",
    "Source": weather.current?.source ?? weather.provider ?? "unknown",
    "Stale": yesNo(weather.stale),
    "Updated": weather.updated_at ?? "unknown",
    "Error": weather.error ?? "none"
  });

  elements.weatherAlertList.replaceChildren(...(weather.alerts ?? []).map((alert) => {
    const item = document.createElement("li");
    item.textContent = `${alert.test ? "TEST " : ""}${alert.event}: ${alert.display_range ?? "Time period unavailable"}`;
    item.classList.toggle("is-test", Boolean(alert.test));
    return item;
  }));
  if (!(weather.alerts ?? []).length) {
    const item = document.createElement("li");
    item.textContent = "No active alerts";
    elements.weatherAlertList.replaceChildren(item);
  }

  const warnings = [
    ...(config.warnings ?? []),
    ...(manifest.warnings ?? []).map((warning) => warning.message)
  ];
  elements.warningList.replaceChildren(...warnings.map((message) => {
    const item = document.createElement("li");
    item.textContent = message;
    return item;
  }));
}

function setDefinitionList(list, values) {
  list.replaceChildren(...Object.entries(values).flatMap(([term, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = String(value);
    return [dt, dd];
  }));
}

function yesNo(value) {
  return value ? "yes" : "no";
}

async function updateEffects() {
  await fetch("/api/slideshow/effects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      enabled: elements.effectsToggle.checked,
      style: elements.effectsStyle.value
    })
  });
  await refresh();
}

async function updatePlaylists() {
  await fetch("/api/mode/playlists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slideshow: elements.slideshowPlaylist.value || null,
      ambience: elements.ambiencePlaylist.value || null
    })
  });
  await refresh();
}

function renderPlaylistSelect(select, groups = [], selectedId, allLabel, countField) {
  const normalizedGroups = normalizeGroups(groups, countField);
  const options = [optionElement("", allLabel)];

  for (const group of normalizedGroups) {
    options.push(optionElement(group.id, `${group.label} (${group.count})`));
  }

  if (selectedId && !normalizedGroups.some((group) => group.id === selectedId)) {
    options.push(optionElement(selectedId, `Missing: ${selectedId}`));
  }

  select.replaceChildren(...options);
  select.value = selectedId ?? "";
}

function playlistStatus(groups = [], selectedId) {
  if (!selectedId) {
    return "all";
  }

  const group = normalizeGroups(groups, "items").find((item) => item.id === selectedId);
  return group ? `${group.label} (${group.count})` : `missing: ${selectedId}`;
}

function normalizeGroups(groups = [], preferredCountField) {
  return (Array.isArray(groups) ? groups : [])
    .map((group) => {
      const countItems = Array.isArray(group[preferredCountField]) ? group[preferredCountField] : [];
      const fallbackItems = Array.isArray(group.items) ? group.items : [];
      const fallbackVideos = Array.isArray(group.videos) ? group.videos : [];
      return {
        id: group.id ?? group.path ?? group.label,
        label: group.label ?? group.path ?? group.id,
        count: countItems.length || fallbackItems.length || fallbackVideos.length
      };
    })
    .filter((group) => group.id);
}

function optionElement(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}
