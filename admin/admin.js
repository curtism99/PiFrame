const elements = {
  deviceName: document.querySelector("#device-name"),
  statusList: document.querySelector("#status-list"),
  mediaList: document.querySelector("#media-list"),
  warningList: document.querySelector("#warning-list"),
  refresh: document.querySelector("#refresh"),
  manifestRefresh: document.querySelector("#manifest-refresh"),
  syncTrigger: document.querySelector("#sync-trigger"),
  clockToggle: document.querySelector("#clock-toggle"),
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
  const [health, config, manifest, mode] = await Promise.all([
    getJson("/api/health"),
    getJson("/api/config"),
    getJson("/api/manifest"),
    getJson("/api/mode")
  ]);

  lastPayload = { health, config, manifest, mode };
  render(lastPayload);
}

async function getJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url} failed with ${response.status}`);
  }
  return response.json();
}

function render({ health, config, manifest, mode }) {
  elements.deviceName.textContent = `${config.device_name} (${config.location})`;
  elements.clockToggle.checked = Boolean(mode.clock_enabled);
  elements.modeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === mode.effective_mode);
  });

  setDefinitionList(elements.statusList, {
    "Backend health": health.ok ? "ok" : "not ok",
    "Current mode": mode.effective_mode,
    "Configured mode": mode.configured_mode,
    "Auto enabled": yesNo(mode.auto_mode_enabled),
    "Clock": yesNo(mode.clock_enabled),
    "Media root": config.media.root,
    "NAS source": config.nas_sync?.source ?? "not configured",
    "Last sync": config.runtime?.last_sync ?? "unknown",
    "State file": mode.state_path
  });

  setDefinitionList(elements.mediaList, {
    "Photos": manifest.counts?.photos ?? 0,
    "Videos": manifest.counts?.videos ?? 0,
    "Manifest": manifest.generated_at,
    "Local cache": manifest.media_root
  });

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
