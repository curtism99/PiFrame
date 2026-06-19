import path from "node:path";
import { getMediaAssetRoot, scanMedia } from "./mediaScanner.js";

export function createManifestStore(config, projectRoot) {
  const mediaRoot = path.isAbsolute(config.media.root)
    ? config.media.root
    : path.resolve(projectRoot, config.media.root);
  const staticMediaRoot = getMediaAssetRoot(config, mediaRoot);

  let cachedManifest = null;
  let lastError = null;

  return {
    mediaRoot,
    staticMediaRoot,
    async get({ refresh = false } = {}) {
      if (!cachedManifest || refresh) {
        try {
          cachedManifest = await scanMedia(config, projectRoot);
          lastError = null;
        } catch (error) {
          lastError = error;
          if (!cachedManifest) {
            throw error;
          }
        }
      }

      return cachedManifest;
    },
    getLastError() {
      return lastError;
    }
  };
}
