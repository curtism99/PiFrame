import assert from "node:assert/strict";
import test from "node:test";
import {
  legacyConfigWarnings,
  legacyModeFallback,
  normalizeDisplayMode
} from "../server/compatibility.js";
import { modePayload } from "../server/routes/mode.js";

test("legacy ambience and auto modes fall back to slideshow", () => {
  assert.equal(normalizeDisplayMode("slideshow"), "slideshow");
  assert.equal(normalizeDisplayMode("ambience"), "slideshow");
  assert.equal(normalizeDisplayMode("auto"), "slideshow");
  assert.deepEqual(legacyModeFallback("ambience"), {
    requested: "ambience",
    fallback: "slideshow"
  });
});

test("mode payload normalizes an old configured mode and old runtime state", async () => {
  const runtimeState = {
    path: "state.json",
    async read() {
      return {
        current_mode: "auto",
        slideshow_playlist_id: "media/photos/family",
        slideshow_effects_enabled: true,
        slideshow_effect_style: "fade",
        clock_enabled: true,
        updated_at: "2026-08-20T00:00:00.000Z"
      };
    }
  };

  const payload = await modePayload({
    display: { mode: "ambience" },
    slideshow: { transition_effects: { style: "random" } },
    auto_mode: { enabled: true }
  }, runtimeState);

  assert.equal(payload.configured_mode, "slideshow");
  assert.equal(payload.requested_configured_mode, "ambience");
  assert.equal(payload.runtime_mode, "slideshow");
  assert.equal(payload.requested_runtime_mode, "auto");
  assert.equal(payload.effective_mode, "slideshow");
  assert.equal(payload.auto_mode_enabled, false);
  assert.deepEqual(payload.legacy_mode_fallback, {
    requested: "auto",
    fallback: "slideshow"
  });
  assert.deepEqual(payload.selected_playlists, {
    slideshow: "media/photos/family"
  });
});

test("legacy video configuration produces an operator warning", () => {
  const warnings = legacyConfigWarnings({
    display: { mode: "ambience" },
    media: {
      fallback_dirs: { ambience: ["media/videos"] },
      allowed_video_extensions: [".mp4"]
    },
    playlists: { ambience: "playlists/ambience.json" }
  });

  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /falls back to "slideshow"/);
  assert.match(warnings[1], /indexes still photos only/);
});
