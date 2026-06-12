import { Router } from "express";

const EFFECT_STYLES = new Set(["random", "fade", "dissolve", "dip"]);

export function slideshowRouter({ config, runtimeState }) {
  const router = Router();

  router.post("/effects", async (request, response) => {
    const enabled = Boolean(request.body?.enabled);
    const requestedStyle = request.body?.style ?? config.slideshow?.transition_effects?.style ?? "random";
    const style = EFFECT_STYLES.has(requestedStyle) ? requestedStyle : "random";
    const state = await runtimeState.write({
      slideshow_effects_enabled: enabled,
      slideshow_effect_style: style
    });

    response.json({
      enabled: Boolean(state.slideshow_effects_enabled),
      style: state.slideshow_effect_style
    });
  });

  return router;
}
