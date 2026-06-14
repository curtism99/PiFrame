import { Router } from "express";

export function widgetsRouter({ config, runtimeState, weatherService }) {
  const router = Router();

  router.get("/", async (request, response) => {
    const state = await runtimeState.read();
    const weather = await weatherService.getWeather();

    response.json({
      clock: {
        enabled: Boolean(state.clock_enabled),
        config: config.clock ?? {}
      },
      weather
    });
  });

  router.get("/weather", async (request, response) => {
    response.json(await weatherService.getWeather({
      refresh: request.query.refresh === "true"
    }));
  });

  router.post("/weather/test-alerts", async (request, response) => {
    const enabled = Boolean(request.body?.enabled);
    await runtimeState.write({ weather_test_alerts_enabled: enabled });
    response.json(await weatherService.getWeather());
  });

  return router;
}
