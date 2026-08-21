import { Router } from "express";
import { legacyConfigWarnings } from "../compatibility.js";

export function configRouter({ config, runtimeState }) {
  const router = Router();

  router.get("/", async (request, response) => {
    const state = await runtimeState.read();
    response.json({
      ...config,
      runtime: {
        state_path: runtimeState.path,
        current_mode: state.current_mode,
        clock_enabled: state.clock_enabled,
        weather_test_alerts_enabled: state.weather_test_alerts_enabled,
        last_sync: state.last_sync
      },
      warnings: [
        "Admin is LAN-only and has no auth in v1.",
        "Do not expose this server to the public internet.",
        ...legacyConfigWarnings(config)
      ]
    });
  });

  return router;
}
