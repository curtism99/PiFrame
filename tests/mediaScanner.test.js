import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { once } from "node:events";
import express from "express";
import { scanMedia } from "../server/mediaScanner.js";
import { createManifestStore } from "../server/manifest.js";
import { manifestRouter } from "../server/routes/manifest.js";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "piframe-media-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "media/photos"), { recursive: true });
  await mkdir(path.join(root, "media/videos"), { recursive: true });
  for (const filename of ["synthetic.JPG", "synthetic.jpeg", "synthetic.png", "synthetic.webp", "ignored.txt"]) {
    await writeFile(path.join(root, "media/photos", filename), "synthetic fixture content");
  }
  await writeFile(path.join(root, "media/videos/synthetic.mp4"), "synthetic fixture content");
  return {
    root,
    config: {
      device_name: "synthetic-frame", location: "fixture",
      media: {
        root, asset_base_dir: "media",
        fallback_dirs: { slideshow: ["media/photos"], ambience: ["media/videos"] },
        allowed_image_extensions: [".jpg", ".jpeg", ".png", ".webp"]
      }
    }
  };
}

test("deployed photo-only config without video extensions produces a photo manifest", async (t) => {
  const { config, root } = await fixture(t);
  const manifest = await scanMedia(config, root);
  assert.equal(manifest.counts.photos, 4);
  assert.equal(manifest.counts.videos, 0);
  assert.equal(manifest.counts.slideshow_items, 4);
  assert.equal(manifest.counts.ambience_videos, 0);
  assert.ok(manifest.slideshow.items.every((item) => item.type === "image" && item.url.startsWith("/media/photos/")));
});

test("omitted image extensions use supported defaults; explicit empty lists stay empty", async (t) => {
  const { config, root } = await fixture(t);
  delete config.media.allowed_image_extensions;
  assert.equal((await scanMedia(config, root)).counts.photos, 4);
  config.media.allowed_image_extensions = [];
  config.media.allowed_video_extensions = [];
  assert.equal((await scanMedia(config, root)).counts.photos, 0);
  assert.equal((await scanMedia(config, root)).counts.videos, 0);
});

test("explicit video support still indexes existing videos", async (t) => {
  const { config, root } = await fixture(t);
  config.media.allowed_video_extensions = [".MP4"];
  const manifest = await scanMedia(config, root);
  assert.equal(manifest.counts.photos, 4);
  assert.equal(manifest.counts.videos, 1);
  assert.equal(manifest.ambience.videos[0].type, "video");
});

test("real manifest HTTP endpoint returns 200 for the deployed photo-only schema", async (t) => {
  const { config, root } = await fixture(t);
  const store = createManifestStore(config, root);
  const app = express();
  app.use("/api/manifest", manifestRouter({ manifestStore: store }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => { server.close(); await once(server, "close"); });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/manifest`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).counts.photos, 4);
  assert.equal(store.getLastError(), null);
});
