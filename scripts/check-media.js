import { loadConfig } from "../server/config.js";
import { scanMedia } from "../server/mediaScanner.js";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const { config } = await loadConfig(projectRoot);
const manifest = await scanMedia(config, projectRoot);

console.log(`Photos: ${manifest.counts.photos}`);
console.log(`Videos: ${manifest.counts.videos}`);

for (const warning of manifest.warnings) {
  console.warn(`${warning.level.toUpperCase()}: ${warning.message}`);
}

if (manifest.counts.photos === 0 && manifest.counts.videos === 0) {
  console.warn("No media found. Add files under sample-media for local development.");
}
