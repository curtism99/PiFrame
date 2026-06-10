# Sync Design

The Pi pulls from the NAS into a local cache. The display app reads only the
local cache, so it keeps working if the NAS is offline.

Flow:

```text
//NAS-DS223/PiFrame/office
  -> /mnt/pi-picture-kiosk-source
  -> rsync
  -> /srv/pi-picture-kiosk/media
```

The sync script:

- mounts the SMB source if needed;
- verifies the mount point is actually mounted;
- refuses to run `rsync --delete-after` if the mount is unavailable;
- logs to `/var/log/pi-picture-kiosk-sync.log`;
- updates `/var/lib/pi-picture-kiosk/state.json` with `last_sync` after success.

Manual command on the Pi:

```bash
sudo /opt/pi-picture-kiosk/scripts/sync-from-nas.sh
```

Timer status:

```bash
systemctl status pi-picture-kiosk-sync.timer
journalctl -u pi-picture-kiosk-sync.service
```
