import { fetchConfig } from "./configClient.js";
import { fetchManifest } from "./manifestClient.js";
import { SlideshowMode } from "./slideshowMode.js";
import { ClockOverlay } from "./clockOverlay.js";
import { fetchRuntimeMode } from "./adminClient.js";
import { setTransitionSeconds } from "./transitions.js";
import { WidgetLayer } from "./widgetLayer.js";
import { WeatherWidget } from "./weatherWidget.js";
import { configureCursorIdle } from "./cursorIdle.js";

const stage = document.querySelector("#stage");
const emptyState = document.querySelector("#empty-state");
const widgetLayerElement = document.querySelector("#widget-layer");
const CLIENT_BUILD = "still-photo-primary-v1";
const RUNTIME_POLL_MS = 1000;

let config;
let manifest;
let activeMode = null;
let widgetLayer = null;
let clockOverlay = null;
let weatherWidget = null;
let runtimeState = null;

try {
  window.PI_FRAME_CLIENT_BUILD = CLIENT_BUILD;
  config = await fetchConfig();
  manifest = await fetchManifest();
  setTransitionSeconds(config.display?.transition_seconds);

  configureCursorIdle(config.display);

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
  startSlideshow();
  pollRuntimeState();
} catch (error) {
  emptyState.hidden = false;
  emptyState.querySelector("h1").textContent = "Kiosk startup failed";
  emptyState.querySelector("p").textContent = error.message;
}

function startSlideshow() {
  activeMode?.stop();
  stage.replaceChildren();
  activeMode = new SlideshowMode(stage, emptyState, config, manifest, runtimeState);
  activeMode.start();
}

function pollRuntimeState() {
  window.setInterval(async () => {
    const state = await fetchRuntimeMode().catch(() => null);
    if (!state) {
      return;
    }

    clockOverlay?.setEnabled(Boolean(state.clock_enabled));
    runtimeState = state;
    activeMode?.setRuntimeOptions?.(state);
  }, RUNTIME_POLL_MS);
}
