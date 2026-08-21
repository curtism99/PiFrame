export const PRIMARY_DISPLAY_MODE = "slideshow";
export const LEGACY_DISPLAY_MODES = new Set(["ambience", "auto"]);

export function normalizeDisplayMode(mode) {
  return mode === PRIMARY_DISPLAY_MODE ? mode : PRIMARY_DISPLAY_MODE;
}

export function legacyModeFallback(mode) {
  if (!mode || mode === PRIMARY_DISPLAY_MODE) {
    return null;
  }

  return {
    requested: mode,
    fallback: PRIMARY_DISPLAY_MODE
  };
}

export function legacyConfigWarnings(config = {}) {
  const warnings = [];
  const configuredMode = config.display?.mode;

  if (configuredMode && configuredMode !== PRIMARY_DISPLAY_MODE) {
    warnings.push(
      `Display mode "${configuredMode}" is retired and falls back to "${PRIMARY_DISPLAY_MODE}".`
    );
  }

  if (hasLegacyVideoConfig(config)) {
    warnings.push(
      "Legacy video and ambience media settings are ignored; PiFrame now indexes still photos only."
    );
  }

  return warnings;
}

function hasLegacyVideoConfig(config) {
  return Boolean(
    config.ambience
      || config.auto_mode
      || config.playlists?.ambience
      || config.media?.ambience_dirs
      || config.media?.fallback_dirs?.ambience
      || config.media?.allowed_video_extensions
  );
}
