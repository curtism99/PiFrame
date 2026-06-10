import fs from "node:fs/promises";
import path from "node:path";

export async function scanMedia(config, projectRoot) {
  const mediaRoot = path.isAbsolute(config.media.root)
    ? config.media.root
    : path.resolve(projectRoot, config.media.root);

  const imageExtensions = new Set(config.media.allowed_image_extensions.map((item) => item.toLowerCase()));
  const videoExtensions = new Set(config.media.allowed_video_extensions.map((item) => item.toLowerCase()));

  const photos = await scanDirs(mediaRoot, config.media.slideshow_dirs, imageExtensions, "image", "slideshow");
  const videos = await scanDirs(mediaRoot, config.media.ambience_dirs, videoExtensions, "video", "ambience");
  const warnings = [];

  if (videos.some((item) => item.extension === ".mkv")) {
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
    slideshow: { photos },
    ambience: { videos },
    counts: {
      photos: photos.length,
      videos: videos.length
    },
    warnings
  };
}

async function scanDirs(mediaRoot, relativeDirs, extensions, type, category) {
  const found = [];
  for (const relativeDir of relativeDirs ?? []) {
    const absoluteDir = path.resolve(mediaRoot, relativeDir);
    if (!isInside(mediaRoot, absoluteDir)) {
      continue;
    }
    found.push(...(await walkMedia(mediaRoot, absoluteDir, extensions, type, category)));
  }
  return found.sort((a, b) => a.url.localeCompare(b.url));
}

async function walkMedia(mediaRoot, currentDir, extensions, type, category) {
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
      results.push(...(await walkMedia(mediaRoot, absolutePath, extensions, type, category)));
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
    const relativePath = slashPath(path.relative(mediaRoot, absolutePath));
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

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
