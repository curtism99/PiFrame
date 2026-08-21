import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { scanMedia } from "../server/mediaScanner.js";

test("photo manifest does not require a video directory or video config", async (context) => {
  const mediaRoot = await fs.mkdtemp(path.join(os.tmpdir(), "piframe-stills-"));
  context.after(() => fs.rm(mediaRoot, { recursive: true, force: true }));

  await fs.mkdir(path.join(mediaRoot, "media", "photos", "family"), { recursive: true });
  await fs.writeFile(path.join(mediaRoot, "media", "photos", "family", "photo.jpg"), "fixture");

  const manifest = await scanMedia({
    device_name: "test-frame",
    location: "test",
    media: {
      root: mediaRoot,
      asset_base_dir: "media",
      fallback_dirs: { slideshow: ["media/photos"] },
      allowed_image_extensions: [".jpg"]
    },
    playlists: {}
  }, mediaRoot);

  assert.equal(manifest.counts.photos, 1);
  assert.equal(manifest.counts.slideshow_items, 1);
  assert.equal(manifest.slideshow.items[0].type, "image");
  assert.equal("videos" in manifest.counts, false);
  assert.equal("ambience" in manifest, false);
  assert.deepEqual(manifest.playlists, { slideshow: ["media/photos"] });
});

test("legacy video files and ambience roots are ignored safely", async (context) => {
  const mediaRoot = await fs.mkdtemp(path.join(os.tmpdir(), "piframe-legacy-"));
  context.after(() => fs.rm(mediaRoot, { recursive: true, force: true }));

  await fs.mkdir(path.join(mediaRoot, "media", "photos"), { recursive: true });
  await fs.mkdir(path.join(mediaRoot, "media", "videos"), { recursive: true });
  await fs.writeFile(path.join(mediaRoot, "media", "photos", "photo.jpg"), "fixture");
  await fs.writeFile(path.join(mediaRoot, "media", "videos", "movie.mp4"), "fixture");

  const manifest = await scanMedia({
    device_name: "legacy-frame",
    location: "test",
    display: { mode: "ambience" },
    media: {
      root: mediaRoot,
      asset_base_dir: "media",
      fallback_dirs: {
        slideshow: ["media/photos"],
        ambience: ["media/videos"]
      },
      allowed_image_extensions: [".jpg"],
      allowed_video_extensions: [".mp4"]
    },
    playlists: { ambience: "playlists/ambience.json" },
    ambience: { shuffle: true }
  }, mediaRoot);

  assert.equal(manifest.counts.photos, 1);
  assert.equal(manifest.slideshow.items.some((item) => item.type === "video"), false);
  assert.equal(manifest.warnings.length, 2);
  assert.match(manifest.warnings[1].message, /ignored/);
});
