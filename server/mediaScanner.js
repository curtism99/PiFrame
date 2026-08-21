import fs from "node:fs/promises";
import path from "node:path";
import { legacyConfigWarnings } from "./compatibility.js";

const DEFAULT_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

export async function scanMedia(config, projectRoot) {
  const mediaRoot = path.isAbsolute(config.media.root)
    ? config.media.root
    : path.resolve(projectRoot, config.media.root);
  const mediaAssetRoot = getMediaAssetRoot(config, mediaRoot);

  const imageExtensions = new Set(
    (config.media?.allowed_image_extensions ?? DEFAULT_IMAGE_EXTENSIONS)
      .map((item) => item.toLowerCase())
  );

  const slideshowDirs = await resolvePlaylistDirs(config, mediaRoot, "slideshow");
  const slideshowGroups = await scanMediaGroups(
    mediaRoot,
    mediaAssetRoot,
    slideshowDirs,
    imageExtensions,
    "slideshow"
  );
  const slideshowItems = uniqueMediaItems(slideshowGroups.flatMap((group) => group.items))
    .sort((a, b) => a.url.localeCompare(b.url));
  const warnings = legacyConfigWarnings(config).map((message) => ({
    level: "warning",
    message
  }));

  return {
    generated_at: new Date().toISOString(),
    device_name: config.device_name,
    location: config.location,
    media_root: mediaRoot,
    media_asset_root: mediaAssetRoot,
    playlists: {
      slideshow: slideshowDirs
    },
    slideshow: {
      items: slideshowItems,
      photos: slideshowItems,
      groups: slideshowGroups
    },
    counts: {
      photos: slideshowItems.length,
      slideshow_items: slideshowItems.length,
      slideshow_groups: slideshowGroups.length
    },
    warnings
  };
}

async function resolvePlaylistDirs(config, mediaRoot, mode) {
  const playlistConfig = config.playlists ?? {};
  const playlistFile = playlistConfig[mode];
  const fallbackDirs = config.media?.fallback_dirs?.[mode] ?? legacyFallbackDirs(config, mode);
  const configuredDirs = uniqueRelativeDirs(fallbackDirs);

  if (!playlistFile) {
    return configuredDirs;
  }

  const playlistPath = path.resolve(mediaRoot, playlistFile);
  if (!isInside(mediaRoot, playlistPath)) {
    return configuredDirs;
  }

  try {
    const playlist = JSON.parse(await fs.readFile(playlistPath, "utf8"));
    const entries = Array.isArray(playlist) ? playlist : playlist[mode];
    if (!Array.isArray(entries)) {
      return configuredDirs;
    }

    const playlistDirs = entries.filter((entry) => typeof entry === "string");
    return uniqueRelativeDirs([...configuredDirs, ...playlistDirs]);
  } catch {
    return configuredDirs;
  }
}

function legacyFallbackDirs(config, mode) {
  return mode === "slideshow"
    ? config.media?.slideshow_dirs ?? ["media/photos"]
    : [];
}

function uniqueRelativeDirs(entries) {
  return [...new Set(entries.map(normalizeRelativeDir).filter(Boolean))];
}

async function scanMediaGroups(mediaRoot, mediaAssetRoot, relativeDirs, extensions, category) {
  const groups = new Map();

  for (const relativeDir of relativeDirs ?? []) {
    const absoluteDir = path.resolve(mediaRoot, relativeDir);
    if (!isInside(mediaRoot, absoluteDir)) {
      continue;
    }

    const items = await walkMedia(mediaRoot, mediaAssetRoot, absoluteDir, extensions, category);
    for (const item of items) {
      const groupPath = playlistGroupPath(relativeDir, item.source_path);
      if (!groups.has(groupPath)) {
        groups.set(groupPath, {
          id: groupPath,
          label: labelFromPath(groupPath),
          path: groupPath,
          items: [],
          photos: []
        });
      }

      groups.get(groupPath).items.push(item);
    }
  }

  return [...groups.values()]
    .map((group) => {
      const items = uniqueMediaItems(group.items).sort((a, b) => a.url.localeCompare(b.url));
      return {
        ...group,
        items,
        photos: items
      };
    })
    .filter((group) => group.items.length > 0)
    .sort((a, b) => a.path.localeCompare(b.path));
}

async function walkMedia(mediaRoot, mediaAssetRoot, currentDir, extensions, category) {
  let entries = [];
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results = [];
  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkMedia(mediaRoot, mediaAssetRoot, absolutePath, extensions, category)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (!extensions.has(extension)) {
      continue;
    }

    const stats = await fs.stat(absolutePath);
    const relativePath = mediaUrlPath(mediaRoot, mediaAssetRoot, absolutePath);
    const sourcePath = slashPath(path.relative(mediaRoot, absolutePath));
    const media = {
      url: `/media/${relativePath.split("/").map(encodeURIComponent).join("/")}`,
      type: "image",
      name: entry.name,
      extension,
      category,
      source_path: sourcePath,
      directory: slashPath(path.dirname(sourcePath)),
      mtime: stats.mtime.toISOString(),
      size_bytes: stats.size
    };

    results.push(media);
  }

  return results;
}

function slashPath(value) {
  return value.replace(/\\/g, "/").split(path.sep).join("/");
}

function normalizeRelativeDir(value) {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = path.posix.normalize(slashPath(value)).replace(/\/+$/, "");
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized.startsWith("/")) {
    return "";
  }

  return normalized;
}

function playlistGroupPath(relativeDir, sourcePath) {
  const normalizedDir = normalizeRelativeDir(relativeDir);
  const sourceDir = path.posix.dirname(slashPath(sourcePath));
  const relativeFromDir = path.posix.relative(normalizedDir, sourceDir);

  if (!relativeFromDir || relativeFromDir === ".") {
    return normalizedDir;
  }

  const [firstSegment] = relativeFromDir.split("/");
  if (!firstSegment || firstSegment.startsWith("..")) {
    return normalizedDir;
  }

  return `${normalizedDir}/${firstSegment}`;
}

function labelFromPath(value) {
  const lastSegment = value.split("/").filter(Boolean).pop() ?? value;
  return lastSegment
    .replace(/[-_]+/g, " ")
    .replace(/\b[a-z]/g, (match) => match.toUpperCase());
}

export function getMediaAssetRoot(config, mediaRoot) {
  const assetBaseDir = config.media?.asset_base_dir ?? "media";
  return path.resolve(mediaRoot, assetBaseDir);
}

function mediaUrlPath(mediaRoot, mediaAssetRoot, absolutePath) {
  if (isInside(mediaAssetRoot, absolutePath)) {
    return slashPath(path.relative(mediaAssetRoot, absolutePath));
  }
  return slashPath(path.relative(mediaRoot, absolutePath));
}

function uniqueMediaItems(items) {
  const byUrl = new Map();
  for (const item of items) {
    byUrl.set(item.url, item);
  }
  return [...byUrl.values()];
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
