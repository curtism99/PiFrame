import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { createManifestStore } from "./manifest.js";
import { healthRouter } from "./routes/health.js";
import { configRouter } from "./routes/config.js";
import { manifestRouter } from "./routes/manifest.js";
import { modeRouter } from "./routes/mode.js";
import { clockRouter } from "./routes/clock.js";
import { slideshowRouter } from "./routes/slideshow.js";
import { syncRouter } from "./routes/sync.js";

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), "..");

const { config, configPath, runtimeState } = await loadConfig(projectRoot);
const manifestStore = createManifestStore(config, projectRoot);

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

app.use((request, response, next) => {
  response.setHeader("X-Pi-Picture-Kiosk", config.device_name);
  next();
});

app.use("/", express.static(path.join(projectRoot, "app"), { index: "index.html" }));
app.use("/admin", express.static(path.join(projectRoot, "admin"), { index: "index.html" }));
app.use("/media", express.static(manifestStore.staticMediaRoot, {
  fallthrough: true,
  immutable: false,
  maxAge: "1h"
}));

app.use("/api/health", healthRouter({ config, configPath, runtimeState, manifestStore }));
app.use("/api/config", configRouter({ config, runtimeState }));
app.use("/api/manifest", manifestRouter({ manifestStore }));
app.use("/api/mode", modeRouter({ config, runtimeState }));
app.use("/api/clock", clockRouter({ runtimeState }));
app.use("/api/slideshow", slideshowRouter({ config, runtimeState }));
app.use("/api/sync", syncRouter({ config, projectRoot }));

app.use((request, response) => {
  response.status(404).json({ error: "not_found" });
});

const host = process.env.HOST ?? config.server?.host ?? "0.0.0.0";
const port = Number(process.env.PORT ?? config.server?.port ?? 8080);

app.listen(port, host, () => {
  console.log(`Pi Picture Kiosk listening on http://${host}:${port}`);
  console.log(`Config: ${configPath}`);
  console.log(`Media root: ${manifestStore.mediaRoot}`);
});
