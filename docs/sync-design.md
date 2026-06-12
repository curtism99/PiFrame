# Sync Design

The Pi pulls from the NAS into a local cache. The display app reads only the
local cache, so it keeps working if the NAS is offline.

Flow:

```text
//nas-ds223/PiFrame/office
  -> /mnt/pi-picture-kiosk-source
  -> rsync
  -> /srv/pi-picture-kiosk/media
```

Use a stable NAS IP plus an Ansible-managed `/etc/hosts` entry:

```yaml
frame_nas_ip: "192.168.0.10"
frame_nas_hostname: "nas-ds223"
frame_nas_aliases:
  - "NAS-DS223"
frame_nas_source: "//nas-ds223/PiFrame/office"
```

This keeps the SMB path readable without depending on Pi-hole, router DNS
quirks, NetBIOS, mDNS, or `.home.arpa`.

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

If you see this error:

```text
mount error: could not resolve address for NAS-DS223
```

then the Pi cannot resolve the NAS hostname. Set a DHCP reservation for the NAS,
set `frame_nas_ip` and `frame_nas_hostname`, rerun the playbook, and verify:

```bash
getent hosts nas-ds223
sudo systemctl start pi-picture-kiosk-sync.service
```
