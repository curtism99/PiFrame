import fs from "node:fs/promises";
import path from "node:path";

export async function scanMedia(config, projectRoot) {
  const mediaRoot = path.isAbsolute(config.media.root)
    ? config.media.root
    : path.resolve(projectRoot, config.media.root);
  const mediaAssetRoot = getMediaAssetRoot(config, mediaRoot);

  const imageExtensions = new Set(config.media.allowed_image_extensions.map((item) => item.toLowerCase()));
  const videoExtensions = new Set(config.media.allowed_video_extensions.map((item) => item.toLowerCase()));
  const allMediaExtensions = new Set([...imageExtensions, ...videoExtensions]);

  const slideshowDirs = await resolvePlaylistDirs(config, mediaRoot, "slideshow");
  const ambienceDirs = await resolvePlaylistDirs(config, mediaRoot, "ambience");
  const slideshowItems = await scanDirs(mediaRoot, mediaAssetRoot, slideshowDirs, allMediaExtensions, "slideshow", imageExtensions);
  const ambienceVideos = await scanDirs(mediaRoot, mediaAssetRoot, ambienceDirs, videoExtensions, "ambience", imageExtensions);
  const slideshowPhotos = slideshowItems.filter((item) => item.type === "image");
  const slideshowVideos = slideshowItems.filter((item) => item.type === "video");
  const warnings = [];
  const allVideos = [...slideshowVideos, ...ambienceVideos];

  if (allVideos.some((item) => item.extension === ".mkv")) {
    warnings.push({
      level: "warning",
      message: "MKV files are indexed but may not play reliably in Chromium kiosk mode."
    });
  }

  return {
    generated_at: new Date().toISOString(),
    device_name: config.device_name,
    location: config.location,
    media_root: mediaRoot,
    media_asset_root: mediaAssetRoot,
    playlists: {
      slideshow: slideshowDirs,
      ambience: ambienceDirs
    },
    slideshow: {
      items: slideshowItems,
      photos: slideshowPhotos,
      videos: slideshowVideos
    },
    ambience: { videos: ambienceVideos },
    counts: {
      photos: slideshowPhotos.length,
      videos: allVideos.length,
      slideshow_items: slideshowItems.length,
      ambience_videos: ambienceVideos.length
    },
    warnings
  };
}

async function resolvePlaylistDirs(config, mediaRoot, mode) {
  const playlistConfig = config.playlists ?? {};
  const playlistFile = playlistConfig[mode];
  const fallbackDirs = config.media?.fallback_dirs?.[mode] ?? legacyFallbackDirs(config, mode);

  if (!playlistFile) {
    return fallbackDirs;
  }

  const playlistPath = path.resolve(mediaRoot, playlistFile);
  if (!isInside(mediaRoot, playlistPath)) {
    return fallbackDirs;
  }

  try {
    const playlist = JSON.parse(await fs.readFile(playlistPath, "utf8"));
    const entries = Array.isArray(playlist) ? playlist : playlist[mode];
    if (!Array.isArray(entries)) {
      return fallbackDirs;
    }

    return uniqueRelativeDirs(entries.filter((entry) => typeof entry === "string"));
  } catch {
    return fallbackDirs;
  }
}

function legacyFallbackDirs(config, mode) {
  if (mode === "slideshow") {
    return config.media?.slideshow_dirs ?? ["media/photos"];
  }
  return config.media?.ambience_dirs ?? ["media/videos"];
}

function uniqueRelativeDirs(entries) {
  return [...new Set(entries.map((entry) => slashPath(path.normalize(entry))).filter((entry) => entry && !entry.startsWith("..")))];
}

async function scanDirs(mediaRoot, mediaAssetRoot, relativeDirs, extensions, category, imageExtensions) {
  const found = [];
  for (const relativeDir of relativeDirs ?? []) {
    const absoluteDir = path.resolve(mediaRoot, relativeDir);
    if (!isInside(mediaRoot, absoluteDir)) {
      continue;
    }
    found.push(...(await walkMedia(mediaRoot, mediaAssetRoot, absoluteDir, extensions, category, imageExtensions)));
  }
  return uniqueMediaItems(found).sort((a, b) => a.url.localeCompare(b.url));
}

async function walkMedia(mediaRoot, mediaAssetRoot, currentDir, extensions, category, imageExtensions) {
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
      results.push(...(await walkMedia(mediaRoot, mediaAssetRoot, absolutePath, extensions, category, imageExtensions)));
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
    const type = imageExtensions.has(extension) ? "image" : "video";
    const media = {
      url: `/media/${relativePath.split("/").map(encodeURIComponent).join("/")}`,
      type,
      name: entry.name,
      extension,
      category,
      mtime: stats.mtime.toISOString(),
      size_bytes: stats.size
    };

    if (type === "video") {
      media.browser_playback = extension === ".mp4" ? "preferred" : extension === ".mkv" ? "best-effort" : "supported";
    }

    results.push(media);
  }

  return results;
}

function slashPath(value) {
  return value.split(path.sep).join("/");
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
