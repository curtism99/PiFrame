import { loadConfig } from "../server/config.js";
import { scanMedia } from "../server/mediaScanner.js";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const { config } = await loadConfig(projectRoot);
const manifest = await scanMedia(config, projectRoot);
console.log(JSON.stringify(manifest, null, 2));
