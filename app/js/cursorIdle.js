export function configureCursorIdle(displayConfig = {}) {
  if (!displayConfig.hide_cursor) {
    setCursorHidden(false);
    return;
  }

  const configuredIdleSeconds = Number(displayConfig.cursor_idle_seconds);
  const idleSeconds = Number.isFinite(configuredIdleSeconds) && configuredIdleSeconds >= 0
    ? configuredIdleSeconds
    : 3;
  let idleTimer = null;

  const showCursor = () => {
    setCursorHidden(false);
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(hideCursor, idleSeconds * 1000);
  };

  const hideCursor = () => {
    setCursorHidden(true);
  };

  hideCursor();

  window.addEventListener("mousemove", showCursor, { passive: true });
  window.addEventListener("mousedown", showCursor, { passive: true });
  window.addEventListener("touchstart", showCursor, { passive: true });
}

function setCursorHidden(hidden) {
  document.documentElement.classList.toggle("hide-cursor", hidden);
  document.body.classList.toggle("hide-cursor", hidden);
}
