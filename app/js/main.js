import { fetchConfig } from "./configClient.js";
import { fetchManifest } from "./manifestClient.js";
import { SlideshowMode } from "./slideshowMode.js";
import { AmbienceMode } from "./ambienceMode.js";
import { AutoMode } from "./autoMode.js";
import { ClockOverlay } from "./clockOverlay.js";
import { fetchRuntimeMode } from "./adminClient.js";
import { setTransitionSeconds } from "./transitions.js";

const stage = document.querySelector("#stage");
const emptyState = document.querySelector("#empty-state");
const clockElement = document.querySelector("#clock-overlay");

let config;
let manifest;
let activeModeName = null;
let targetModeName = null;
let activeMode = null;
let autoMode = null;
let clockOverlay = null;

try {
  config = await fetchConfig();
  manifest = await fetchManifest();
  setTransitionSeconds(config.display?.transition_seconds);

  if (config.display?.hide_cursor) {
    document.body.classList.add("hide-cursor");
  }

  clockOverlay = new ClockOverlay(clockElement, config.clock);
  clockOverlay.start();

  const runtime = await fetchRuntimeMode().catch(() => null);
  const initialMode = runtime?.effective_mode ?? config.display?.mode ?? "slideshow";
  startDisplayMode(initialMode);
  pollRuntimeState();
} catch (error) {
  emptyState.hidden = false;
  emptyState.querySelector("h1").textContent = "Kiosk startup failed";
  emptyState.querySelector("p").textContent = error.message;
}

function startDisplayMode(mode, options = {}) {
  const normalizedMode = normalizeMode(mode);
  if (!options.fromAuto) {
    targetModeName = normalizedMode;
  }

  if (activeModeName === normalizedMode && normalizedMode !== "auto") {
    return;
  }

  autoMode?.stop();
  activeMode?.stop();
  stage.replaceChildren();
  activeModeName = normalizedMode;

  if (normalizedMode === "auto") {
    if (!config.auto_mode?.enabled) {
      startDisplayMode("slideshow");
      return;
    }
    autoMode = new AutoMode(config, (chosenMode) => startDisplayMode(chosenMode, { fromAuto: true }));
    autoMode.start();
    return;
  }

  if (normalizedMode === "ambience") {
    activeMode = new AmbienceMode(stage, emptyState, config, manifest);
  } else {
    activeMode = new SlideshowMode(stage, emptyState, config, manifest);
  }

  activeMode.start();
}

function normalizeMode(mode) {
  if (mode === "ambience" || mode === "auto") {
    return mode;
  }
  return "slideshow";
}

function pollRuntimeState() {
  window.setInterval(async () => {
    const state = await fetchRuntimeMode().catch(() => null);
    if (!state) {
      return;
    }

    clockOverlay?.setEnabled(Boolean(state.clock_enabled));
    if (state.effective_mode && state.effective_mode !== targetModeName) {
      startDisplayMode(state.effective_mode);
    }
  }, 5000);
}
