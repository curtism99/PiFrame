#!/usr/bin/env bash
set -euo pipefail

NAS_SOURCE="${PIFRAME_NAS_SOURCE:-//nas-ds223/PiFrame-Media}"
NAS_SOURCE_SUBDIR="${PIFRAME_NAS_SOURCE_SUBDIR:-office}"
MOUNT_POINT="${PIFRAME_NAS_MOUNT_POINT:-/mnt/pi-picture-kiosk-source}"
LOCAL_CACHE="${PIFRAME_LOCAL_CACHE:-/srv/pi-picture-kiosk/media}"
CREDENTIALS_FILE="${PIFRAME_CREDENTIALS_FILE:-/etc/pi-picture-kiosk/smb-credentials}"
STATE_FILE="${PIFRAME_STATE_FILE:-/var/lib/pi-picture-kiosk/state.json}"
LOG_FILE="${PIFRAME_SYNC_LOG:-/var/log/piframe-media-sync.log}"
NAS_HOST="${NAS_SOURCE#//}"
NAS_HOST="${NAS_HOST%%/*}"

log() {
  printf '%s %s\n' "$(date --iso-8601=seconds)" "$*" | tee -a "$LOG_FILE"
}

is_ip_address() {
  [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]
}

mkdir -p "$MOUNT_POINT" "$LOCAL_CACHE" "$(dirname "$STATE_FILE")"

if [[ "$NAS_SOURCE_SUBDIR" = /* || "$NAS_SOURCE_SUBDIR" == *".."* ]]; then
  log "Invalid NAS source subdir: $NAS_SOURCE_SUBDIR"
  exit 24
fi

if ! mountpoint -q "$MOUNT_POINT"; then
  if ! is_ip_address "$NAS_HOST" && ! getent hosts "$NAS_HOST" >/dev/null; then
    log "NAS host '$NAS_HOST' does not resolve on this Pi. Add an /etc/hosts entry or use an IP-based source such as //192.168.0.10/PiFrame-Media."
    exit 23
  fi

  if [[ ! -f "$CREDENTIALS_FILE" ]]; then
    log "SMB credentials file missing: $CREDENTIALS_FILE"
    exit 20
  fi

  log "Mounting $NAS_SOURCE at $MOUNT_POINT"
  if ! mount -t cifs "$NAS_SOURCE" "$MOUNT_POINT" \
    -o "credentials=$CREDENTIALS_FILE,iocharset=utf8,vers=3.0,uid=$(id -u),gid=$(id -g),file_mode=0644,dir_mode=0755"; then
    log "Mount failed for $NAS_SOURCE. If this was mount error(2), verify the SMB share name. The NAS source must be the share root, for example //nas-ds223/PiFrame-Media, with office configured as the source subdir."
    exit 25
  fi
fi

if ! mountpoint -q "$MOUNT_POINT"; then
  log "NAS source is not mounted. Refusing to run rsync --delete-after."
  exit 21
fi

SYNC_SOURCE="$MOUNT_POINT"
if [[ -n "$NAS_SOURCE_SUBDIR" ]]; then
  SYNC_SOURCE="$MOUNT_POINT/$NAS_SOURCE_SUBDIR"
fi

if [[ ! -d "$SYNC_SOURCE" ]]; then
  log "Mounted source directory is unavailable: $SYNC_SOURCE"
  exit 22
fi

log "Starting rsync from $SYNC_SOURCE/ to $LOCAL_CACHE/"
set +e
rsync \
  -rltv \
  --human-readable \
  --delete-after \
  --no-owner \
  --no-group \
  --no-perms \
  --omit-dir-times \
  "$SYNC_SOURCE"/ "$LOCAL_CACHE"/ 2>&1 | tee -a "$LOG_FILE"
rsync_status=${PIPESTATUS[0]}
set -e

if [[ "$rsync_status" -eq 24 ]]; then
  log "rsync reported vanished files during transfer; treating as non-fatal for this media cache."
elif [[ "$rsync_status" -ne 0 ]]; then
  log "rsync failed with exit status $rsync_status. See $LOG_FILE for the file-level error above."
  exit "$rsync_status"
fi

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
