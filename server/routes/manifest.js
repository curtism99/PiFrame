import { Router } from "express";

export function manifestRouter({ manifestStore }) {
  const router = Router();

  router.get("/", async (request, response, next) => {
    try {
      response.json(await manifestStore.get());
    } catch (error) {
      next(error);
    }
  });

  router.post("/refresh", async (request, response, next) => {
    try {
      response.json(await manifestStore.get({ refresh: true }));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
