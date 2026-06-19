import { Router } from "express";

const MODES = new Set(["slideshow", "ambience", "auto"]);
const TRANSITION_STYLES = new Set(["random", "fade", "dissolve", "dip"]);

export function modeRouter({ config, runtimeState }) {
  const router = Router();

  router.get("/", async (request, response) => {
    response.json(await modePayload(config, runtimeState));
  });

  router.post("/", async (request, response) => {
    const mode = request.body?.mode;
    if (!MODES.has(mode)) {
      response.status(400).json({ error: "invalid_mode", allowed: [...MODES] });
      return;
    }

    await runtimeState.write({ current_mode: mode });
    response.json(await modePayload(config, runtimeState));
  });

  router.post("/reset", async (request, response) => {
    await runtimeState.write({ current_mode: null });
    response.json(await modePayload(config, runtimeState));
  });

  return router;
}

export async function modePayload(config, runtimeState) {
  const state = await runtimeState.read();
  const configuredMode = config.display?.mode ?? "slideshow";
  const effectiveMode = state.current_mode ?? configuredMode;
  const configuredTransitionStyle = config.slideshow?.transition_effects?.style ?? "random";
  const transitionStyle = TRANSITION_STYLES.has(state.slideshow_effect_style)
    ? state.slideshow_effect_style
    : configuredTransitionStyle;

  return {
    configured_mode: configuredMode,
    runtime_mode: state.current_mode,
    effective_mode: effectiveMode,
    auto_mode_enabled: Boolean(config.auto_mode?.enabled),
    clock_enabled: Boolean(state.clock_enabled),
    slideshow_effects: {
      enabled: Boolean(state.slideshow_effects_enabled),
      style: TRANSITION_STYLES.has(transitionStyle) ? transitionStyle : "random"
    },
    state_path: runtimeState.path,
    updated_at: state.updated_at
  };
}
