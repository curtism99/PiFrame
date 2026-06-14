import { fetchConfig } from "./configClient.js";
import { fetchManifest } from "./manifestClient.js";
import { SlideshowMode } from "./slideshowMode.js";
import { AmbienceMode } from "./ambienceMode.js";
import { AutoMode } from "./autoMode.js";
import { ClockOverlay } from "./clockOverlay.js";
import { fetchRuntimeMode } from "./adminClient.js";
import { setTransitionSeconds } from "./transitions.js";
import { WidgetLayer } from "./widgetLayer.js";
import { WeatherWidget } from "./weatherWidget.js";

const stage = document.querySelector("#stage");
const emptyState = document.querySelector("#empty-state");
const widgetLayerElement = document.querySelector("#widget-layer");
const CLIENT_BUILD = "widgets-weather-v1";

let config;
let manifest;
let activeModeName = null;
let targetModeName = null;
let activeMode = null;
let autoMode = null;
let widgetLayer = null;
let clockOverlay = null;
let weatherWidget = null;
let runtimeState = null;

try {
  window.PI_FRAME_CLIENT_BUILD = CLIENT_BUILD;
  config = await fetchConfig();
  manifest = await fetchManifest();
  setTransitionSeconds(config.display?.transition_seconds);

  if (config.display?.hide_cursor) {
    document.body.classList.add("hide-cursor");
  }

  widgetLayer = new WidgetLayer(widgetLayerElement);
  clockOverlay = new ClockOverlay(
    widgetLayer.getWidgetElement("clock", config.clock?.position),
    config.clock
  );
  clockOverlay.start();
  if (config.widgets?.weather?.enabled) {
    weatherWidget = new WeatherWidget(
      widgetLayer.getWidgetElement("weather", config.widgets.weather.position),
      config.widgets.weather
    );
    weatherWidget.start();
  }

  runtimeState = await fetchRuntimeMode().catch(() => null);
  const initialMode = runtimeState?.effective_mode ?? config.display?.mode ?? "slideshow";
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
    activeMode = new SlideshowMode(stage, emptyState, config, manifest, runtimeState?.slideshow_effects);
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
    runtimeState = state;
    activeMode?.setRuntimeOptions?.(state.slideshow_effects);
    if (state.effective_mode && state.effective_mode !== targetModeName) {
      startDisplayMode(state.effective_mode);
    }
  }, 5000);
}
