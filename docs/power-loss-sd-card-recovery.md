# Power-Loss and SD-Card Recovery

Use this runbook when a PiFrame stops booting after power loss, reports storage
errors, reaches the desktop without the kiosk, or shows a blank kiosk page.

## Decide: Repair or Reimage

Typical storage and boot symptoms include:

```text
Failed to execute /init (error -2)
Kernel panic - not syncing
EXT4-fs error
Read-only file system
Emergency mode
```

Repair the existing card only when it contains unique local data that is not
available elsewhere, or when a quick offline filesystem check is operationally
important. Remove the card and run `fsck` against the correct unmounted Linux
partition from another machine. Never run a repair-mode `fsck` against the
mounted root filesystem.

Reimage when the system cannot execute `/init`, filesystem errors return after
repair, the card reports I/O errors, or the frame has no unique local data. A
fresh image plus Ansible redeployment is normally the safer PiFrame recovery.

## Restore Assumptions

- Git is the source of truth for the application and Ansible role.
- The Synology NAS is the source of truth for photos.
- `/srv/pi-picture-kiosk/media` is a disposable local cache.
- `/var/lib/pi-picture-kiosk/state.json` contains replaceable runtime choices.
- Real Ansible inventory, SMB credentials, and weather coordinates are local
  ignored files or Vault data and must be available before redeployment.
- Do not copy credentials, private photo filenames, or complete sync logs into
  Git or issue comments.

## Reimage

Use Raspberry Pi Imager to install the current 64-bit Raspberry Pi OS with
desktop support. In the image settings:

- set the expected hostname, such as `piframe-office`;
- create the expected desktop and SSH user;
- enable SSH;
- configure networking when the frame will not use wired Ethernet.

After first boot, confirm the root filesystem and power state:

```bash
df -h /
findmnt -no TARGET,SOURCE,FSTYPE,OPTIONS /
vcgencmd get_throttled
```

An active undervoltage bit or kernel undervoltage messages must be addressed
with a suitable Raspberry Pi power supply, sound cable, and reduced peripheral
load before a sustained media transfer.

## Redeploy with Ansible

From the workstation:

```bash
cd ansible
ansible -i inventory.ini frames -m ping --ask-pass
ansible-playbook -i inventory.ini playbook.yml --syntax-check
ansible-playbook -i inventory.ini playbook.yml \
  --ask-pass \
  --ask-become-pass \
  -e frame_sync_timer_enabled=false
```

The role installs the Debian `chromium` package. The ignored
`group_vars/frames.yml` should define the NAS share root, the frame folder, and
the photo folder separately:

```yaml
frame_nas_source: "//nas-ds223/PiFrame-Media"
frame_nas_source_subdir: "office"
frame_nas_photo_subdir: "media/photos"
frame_sync_min_free_bytes: 1073741824
```

The last setting makes the sync refuse to start if the supported photo set
would leave less than 1 GiB available on the cache filesystem. The recovery
deployment override keeps the timer disabled until the manual sync passes.

## Validate a Manual Photo Sync

Confirm the timer is inactive before the first manual validation:

```bash
systemctl is-active piframe-media-sync.timer
sudo systemctl start piframe-media-sync.service
systemctl status piframe-media-sync.service --no-pager
df -h /
sudo du -sh /srv/pi-picture-kiosk/media
```

The service copies only `.jpg`, `.jpeg`, `.png`, and `.webp` files beneath the
configured NAS photo directory. It does not mirror legacy videos, PSD files, or
other content from the frame folder. Logs contain aggregate rsync statistics,
not a list of private filenames.

Refresh the manifest without printing its full contents:

```bash
node --input-type=module -e '
const response = await fetch("http://127.0.0.1:8080/api/manifest/refresh", { method: "POST" });
if (!response.ok) throw new Error("manifest refresh HTTP " + response.status);
const manifest = await response.json();
console.log(JSON.stringify({
  photos: manifest.counts?.photos,
  slideshow_items: manifest.counts?.slideshow_items,
  warnings: manifest.warnings?.length
}, null, 2));
'

/opt/pi-picture-kiosk/scripts/kiosk-control.sh status
/opt/pi-picture-kiosk/scripts/kiosk-control.sh refresh
```

If the browser is stopped, restart it:

```bash
/opt/pi-picture-kiosk/scripts/kiosk-control.sh restart-browser
```

## Recover from a Full Cache

First stop automatic retries and confirm the exact cache path:

```bash
sudo systemctl stop piframe-media-sync.timer
CACHE=/srv/pi-picture-kiosk/media

if [ "$(readlink -f "$CACHE")" = "$CACHE" ]; then
  sudo find "$CACHE" -xdev -mindepth 1 -delete
else
  echo "Refusing cleanup: unexpected cache path"
fi

df -h /
```

This deletes only the disposable Pi cache. It does not modify the mounted NAS
source. Do not restart an old whole-tree sync script after cleanup; redeploy the
current Ansible role first.

## Re-enable and Reboot

Only after the manual sync succeeds:

```bash
sudo systemctl enable --now piframe-media-sync.timer
systemctl is-active piframe-media-sync.timer
sudo reboot
```

After the Pi returns:

```bash
systemctl is-active pi-picture-kiosk.service
systemctl is-active piframe-media-sync.timer
/opt/pi-picture-kiosk/scripts/kiosk-control.sh status
df -h /
vcgencmd get_throttled
sudo journalctl -k -b --no-pager | grep -i undervoltage || echo "No undervoltage warnings this boot"
```

Physical acceptance requires photos to advance on the monitor, the clock and
weather widgets to show current data, Chromium to remain in kiosk mode, and the
pointer to remain hidden after the reboot. Keep the recovery Bead open until
these physical checks and an automatic timer-driven sync have both passed.
