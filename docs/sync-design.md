# Sync Design

The Pi pulls from the NAS into a local cache. The display app reads only the
local cache, so it keeps working if the NAS is offline.

Flow:

```text
//nas-ds223/PiFrame-Media
  -> /mnt/pi-picture-kiosk-source
  -> office/
  -> rsync
  -> /srv/pi-picture-kiosk/media
```

Use a stable NAS IP plus an Ansible-managed `/etc/hosts` entry:

```yaml
frame_nas_ip: "192.168.0.10"
frame_nas_hostname: "nas-ds223"
frame_nas_aliases:
  - "NAS-DS223"
frame_nas_source: "//nas-ds223/PiFrame-Media"
frame_nas_source_subdir: "office"
```

This keeps the SMB path readable without depending on Pi-hole, router DNS
quirks, NetBIOS, mDNS, or `.home.arpa`.

The sync script:

- mounts the SMB share if needed;
- syncs from the configured source subfolder, such as `office`;
- verifies the mount point is actually mounted;
- refuses to run `rsync --delete-after` if the mount is unavailable;
- logs to `/var/log/piframe-media-sync.log`;
- updates `/var/lib/pi-picture-kiosk/state.json` with `last_sync` after success.

Manual command on the Pi:

```bash
sudo /opt/pi-picture-kiosk/scripts/sync-from-nas.sh
```

Timer status:

```bash
systemctl status piframe-media-sync.timer
journalctl -u piframe-media-sync.service
```

If you see this error:

```text
mount error: could not resolve address for NAS-DS223
```

then the Pi cannot resolve the NAS hostname. Set a DHCP reservation for the NAS,
set `frame_nas_ip` and `frame_nas_hostname`, rerun the playbook, and verify:

```bash
getent hosts nas-ds223
sudo systemctl start piframe-media-sync.service
```

If you see this error:

```text
mount error(2): No such file or directory
```

confirm that `frame_nas_source` is the SMB share root, such as
`//nas-ds223/PiFrame-Media`, and that `frame_nas_source_subdir` is the folder inside
that share, such as `office`.

To list the shares the Pi can see:

```bash
sudo smbclient -L //nas-ds223 -A /etc/pi-picture-kiosk/smb-credentials
```

Use the exact share name from that list in `frame_nas_source`.

## Rsync Failures

If the service exits with status `23`, the NAS mounted but rsync could not copy
one or more files. Check the full sync log instead of the clipped systemd view:

```bash
sudo tail -n 200 /var/log/piframe-media-sync.log
```

Common causes are unreadable files, unusual filenames, a file being changed on
the NAS during sync, or destination write errors. The sync script does not try
to preserve SMB ownership or permissions because the Pi cache only needs media
files readable by the kiosk app.
