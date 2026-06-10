#!/usr/bin/env bash
set -euo pipefail

NAS_SOURCE="${PIFRAME_NAS_SOURCE:-//NAS-DS223/PiFrame/office}"
MOUNT_POINT="${PIFRAME_NAS_MOUNT_POINT:-/mnt/pi-picture-kiosk-source}"
LOCAL_CACHE="${PIFRAME_LOCAL_CACHE:-/srv/pi-picture-kiosk/media}"
CREDENTIALS_FILE="${PIFRAME_CREDENTIALS_FILE:-/etc/pi-picture-kiosk/smb-credentials}"
STATE_FILE="${PIFRAME_STATE_FILE:-/var/lib/pi-picture-kiosk/state.json}"
LOG_FILE="${PIFRAME_SYNC_LOG:-/var/log/pi-picture-kiosk-sync.log}"

log() {
  printf '%s %s\n' "$(date --iso-8601=seconds)" "$*" | tee -a "$LOG_FILE"
}

mkdir -p "$MOUNT_POINT" "$LOCAL_CACHE" "$(dirname "$STATE_FILE")"

if ! mountpoint -q "$MOUNT_POINT"; then
  if [[ ! -f "$CREDENTIALS_FILE" ]]; then
    log "SMB credentials file missing: $CREDENTIALS_FILE"
    exit 20
  fi

  log "Mounting $NAS_SOURCE at $MOUNT_POINT"
  mount -t cifs "$NAS_SOURCE" "$MOUNT_POINT" \
    -o "credentials=$CREDENTIALS_FILE,iocharset=utf8,vers=3.0,uid=$(id -u),gid=$(id -g),file_mode=0644,dir_mode=0755"
fi

if ! mountpoint -q "$MOUNT_POINT"; then
  log "NAS source is not mounted. Refusing to run rsync --delete-after."
  exit 21
fi

if [[ ! -d "$MOUNT_POINT" ]]; then
  log "Mounted source directory is unavailable: $MOUNT_POINT"
  exit 22
fi

log "Starting rsync from $MOUNT_POINT/ to $LOCAL_CACHE/"
rsync -av --delete-after "$MOUNT_POINT"/ "$LOCAL_CACHE"/ | tee -a "$LOG_FILE"

PIFRAME_STATE_FILE="$STATE_FILE" node -e '
const fs = require("fs");
const file = process.env.PIFRAME_STATE_FILE;
let state = {};
try { state = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
state.last_sync = new Date().toISOString();
state.updated_at = state.last_sync;
fs.writeFileSync(file, JSON.stringify(state, null, 2));
' || true

log "Sync complete"
