import { Router } from "express";

export function healthRouter({ config, configPath, runtimeState, manifestStore }) {
  const router = Router();

  router.get("/", async (request, response) => {
    const manifest = await manifestStore.get().catch(() => null);
    const state = await runtimeState.read();

    response.json({
      ok: true,
      device_name: config.device_name,
      location: config.location,
      uptime_seconds: Math.round(process.uptime()),
      config_path: configPath,
      media_root: manifestStore.mediaRoot,
      mode: state.current_mode ?? config.display?.mode ?? "slideshow",
      clock_enabled: state.clock_enabled,
      manifest_generated_at: manifest?.generated_at ?? null,
      last_manifest_error: manifestStore.getLastError()?.message ?? null,
      admin_auth: "disabled-lan-only"
    });
  });

  return router;
}
