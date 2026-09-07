# Synology Media Source

The NAS is the source of truth for media.

Windows UNC path:

```text
\\NAS-DS223\PiFrame-Media\office
```

Linux SMB path:

```text
//nas-ds223/PiFrame-Media
```

Use the real DHCP-reserved NAS IP address in Ansible, then let the playbook add
a local `/etc/hosts` entry on the Pi for `nas-ds223`.

The sync service mounts the `PiFrame-Media` SMB share and then copies supported
images from the `office/media/photos` subfolder into the local cache.

Expected folder layout:

```text
PiFrame-Media/
  office/
    media/
      photos/
        family/
        travel/
        art/
    playlists/              optional; not copied by the photo-only sync
      slideshow.json
```

The Pi mirrors supported photos into:

```text
/srv/pi-picture-kiosk/media/media/photos/
```

The NAS is the source of truth for media files, not the active runtime
playlist selection. PiFrame scans the configured `media/photos` root, then the
admin page lets you select `All` or a discovered album such as `family` or
`travel`.

Local playlist JSON files are optional extra scan roots for development or
custom deployments. Example:

```json
{
  "slideshow": [
    "media/photos/family"
  ]
}
```

Each default or extra scan root is recursive. Immediate child folders become
separate slideshow groups. If a playlist file is missing, invalid, or stale,
the app still scans the configured default photo root.

Legacy `media/videos` folders may remain on the NAS during migration. They are
excluded from the Pi cache. Existing ambience or auto display settings fall
back to slideshow and appear as admin warnings until the old config is cleaned
up.

The Pi syncs only `.jpg`, `.jpeg`, `.png`, and `.webp` files beneath the
configured photo subfolder. The kiosk serves the cached `media/` subfolder
through the browser route `/media`.

SMB credentials are written on the Pi to:

```text
/etc/pi-picture-kiosk/smb-credentials
```

That file must be owned by root and mode `0600`.
