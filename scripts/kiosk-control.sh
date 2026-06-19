#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${PIFRAME_APP_DIR:-/opt/pi-picture-kiosk}"
APP_URL="${PIFRAME_APP_URL:-http://localhost:8080}"
DISPLAY_NAME="${PIFRAME_DISPLAY:-${DISPLAY:-:0}}"
PROFILE_DIR="${PIFRAME_CHROMIUM_PROFILE:-${HOME}/.config/pi-picture-kiosk/chromium-profile}"
LOG_FILE="${PIFRAME_KIOSK_LOG:-${HOME}/.local/state/pi-picture-kiosk/kiosk-browser.log}"
LAUNCHER="${PIFRAME_KIOSK_LAUNCHER:-${APP_DIR}/scripts/start-kiosk-browser.sh}"
CHROMIUM_PATTERN="--user-data-dir=${PROFILE_DIR}"

prepare_display_env() {
  export DISPLAY="${DISPLAY_NAME}"
  if [ -z "${XAUTHORITY:-}" ] && [ -f "${HOME}/.Xauthority" ]; then
    export XAUTHORITY="${HOME}/.Xauthority"
  fi
  if [ -z "${XDG_RUNTIME_DIR:-}" ] && [ -d "/run/user/$(id -u)" ]; then
    export XDG_RUNTIME_DIR="/run/user/$(id -u)"
  fi
}

usage() {
  cat <<USAGE
Usage: $(basename "$0") <command>

Commands:
  health           Check the backend health endpoint
  status           Show backend, browser, and cursor-helper status
  refresh          Refresh the visible Chromium kiosk page
  restart-backend  Restart the Node backend systemd service
  restart-browser  Restart Chromium and the cursor helper
  stop-browser     Stop Chromium and the cursor helper
  logs             Show recent kiosk browser launcher logs
USAGE
}

health() {
  curl -fsS "${APP_URL}/api/health"
}

status() {
  if curl -fsS "${APP_URL}/api/health" >/dev/null; then
    echo "backend: ok"
  else
    echo "backend: unavailable"
  fi

  if pgrep -f -- "${CHROMIUM_PATTERN}" >/dev/null; then
    echo "browser: running"
    pgrep -a -f -- "${CHROMIUM_PATTERN}" || true
  else
    echo "browser: stopped"
  fi

  if pgrep -x unclutter >/dev/null; then
    echo "cursor-helper: running"
  else
    echo "cursor-helper: stopped"
  fi

  echo "display: ${DISPLAY_NAME}"
  echo "runtime: ${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
}

refresh_browser() {
  prepare_display_env
  if ! command -v xdotool >/dev/null 2>&1; then
    echo "xdotool is required for refresh; install it or use restart-browser." >&2
    exit 1
  fi

  xdotool key F5
}

restart_backend() {
  sudo systemctl restart pi-picture-kiosk.service
}

stop_browser() {
  pkill -f -- "${CHROMIUM_PATTERN}" >/dev/null 2>&1 || true
  pkill -x unclutter >/dev/null 2>&1 || true
}

restart_browser() {
  prepare_display_env
  stop_browser
  for _ in $(seq 1 20); do
    if ! pgrep -f -- "${CHROMIUM_PATTERN}" >/dev/null; then
      break
    fi
    sleep 0.25
  done

  if [ ! -x "${LAUNCHER}" ]; then
    echo "Kiosk launcher is not executable: ${LAUNCHER}" >&2
    exit 1
  fi

  nohup "${LAUNCHER}" >>"${LOG_FILE}" 2>&1 &
  echo "browser restart requested"
}

case "${1:-}" in
  health)
    health
    ;;
  status)
    status
    ;;
  refresh)
    refresh_browser
    ;;
  restart-backend)
    restart_backend
    ;;
  restart-browser)
    restart_browser
    ;;
  stop-browser)
    stop_browser
    ;;
  logs)
    tail -n "${PIFRAME_LOG_LINES:-120}" "${LOG_FILE}"
    ;;
  -h|--help|help|"")
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
