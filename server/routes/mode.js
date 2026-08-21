import { Router } from "express";
import path from "node:path";
import {
  LEGACY_DISPLAY_MODES,
  PRIMARY_DISPLAY_MODE,
  legacyModeFallback,
  normalizeDisplayMode
} from "../compatibility.js";

const ACCEPTED_MODES = new Set([PRIMARY_DISPLAY_MODE, ...LEGACY_DISPLAY_MODES]);
const TRANSITION_STYLES = new Set(["random", "fade", "dissolve", "dip"]);

export function modeRouter({ config, runtimeState }) {
  const router = Router();

  router.get("/", async (request, response) => {
    response.json(await modePayload(config, runtimeState));
  });

  router.post("/", async (request, response) => {
    const mode = request.body?.mode;
    if (!ACCEPTED_MODES.has(mode)) {
      response.status(400).json({
        error: "invalid_mode",
        allowed: [PRIMARY_DISPLAY_MODE],
        legacy_fallbacks: [...LEGACY_DISPLAY_MODES]
      });
      return;
    }

    await runtimeState.write({ current_mode: mode });
    response.json(await modePayload(config, runtimeState));
  });

  router.post("/reset", async (request, response) => {
    await runtimeState.write({ current_mode: null });
    response.json(await modePayload(config, runtimeState));
  });

  router.post("/playlists", async (request, response) => {
    const slideshowPlaylistId = normalizePlaylistId(request.body?.slideshow);
    await runtimeState.write({
      slideshow_playlist_id: slideshowPlaylistId
    });
    response.json(await modePayload(config, runtimeState));
  });

  return router;
}

export async function modePayload(config, runtimeState) {
  const state = await runtimeState.read();
  const requestedConfiguredMode = config.display?.mode ?? PRIMARY_DISPLAY_MODE;
  const requestedRuntimeMode = state.current_mode;
  const requestedEffectiveMode = requestedRuntimeMode ?? requestedConfiguredMode;
  const configuredMode = normalizeDisplayMode(requestedConfiguredMode);
  const runtimeMode = requestedRuntimeMode ? normalizeDisplayMode(requestedRuntimeMode) : null;
  const effectiveMode = normalizeDisplayMode(requestedEffectiveMode);
  const configuredTransitionStyle = config.slideshow?.transition_effects?.style ?? "random";
  const transitionStyle = TRANSITION_STYLES.has(state.slideshow_effect_style)
    ? state.slideshow_effect_style
    : configuredTransitionStyle;

  return {
    configured_mode: configuredMode,
    requested_configured_mode: requestedConfiguredMode,
    runtime_mode: runtimeMode,
    requested_runtime_mode: requestedRuntimeMode,
    effective_mode: effectiveMode,
    legacy_mode_fallback: legacyModeFallback(requestedEffectiveMode),
    auto_mode_enabled: false,
    clock_enabled: Boolean(state.clock_enabled),
    selected_playlists: {
      slideshow: normalizePlaylistId(state.slideshow_playlist_id)
    },
    slideshow_effects: {
      enabled: Boolean(state.slideshow_effects_enabled),
      style: TRANSITION_STYLES.has(transitionStyle) ? transitionStyle : "random"
    },
    state_path: runtimeState.path,
    updated_at: state.updated_at
  };
}

function normalizePlaylistId(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = path.posix.normalize(value.trim().replace(/\\/g, "/")).replace(/\/+$/, "");
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized.startsWith("/")) {
    return null;
  }

  return normalized;
}
