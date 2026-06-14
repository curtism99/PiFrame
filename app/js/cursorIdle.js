export function configureCursorIdle(displayConfig = {}) {
  if (!displayConfig.hide_cursor) {
    document.documentElement.classList.remove("hide-cursor");
    document.body.classList.remove("hide-cursor");
    return;
  }

  const idleSeconds = Number(displayConfig.cursor_idle_seconds) || 3;
  let idleTimer = null;

  const showCursor = () => {
    document.documentElement.classList.remove("hide-cursor");
    document.body.classList.remove("hide-cursor");
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(hideCursor, idleSeconds * 1000);
  };

  const hideCursor = () => {
    document.documentElement.classList.add("hide-cursor");
    document.body.classList.add("hide-cursor");
  };

  window.addEventListener("mousemove", showCursor, { passive: true });
  window.addEventListener("mousedown", showCursor, { passive: true });
  window.addEventListener("touchstart", showCursor, { passive: true });

  showCursor();
}
