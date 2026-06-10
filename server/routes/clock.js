import { Router } from "express";

export function clockRouter({ runtimeState }) {
  const router = Router();

  router.post("/", async (request, response) => {
    const enabled = Boolean(request.body?.enabled);
    response.json(await runtimeState.write({ clock_enabled: enabled }));
  });

  return router;
}
