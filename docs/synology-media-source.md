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

The sync service mounts the `PiFrame-Media` SMB share and then syncs the `office`
subfolder into the local cache.

Expected folder layout:

```text
PiFrame-Media/
  office/
    media/
      photos/
        family/
        travel/
        art/
      videos/
        fireplace/
        clouds/
        abstract/
        short-clips/
    playlists/              optional extra scan roots
      slideshow.json
      ambience.json
```

The Pi mirrors that folder into:

```text
/srv/pi-picture-kiosk/media/
  media/
    photos/
    videos/
  playlists/
    slideshow.json
    ambience.json
```

The NAS is the source of truth for media files, not the active runtime
playlist selection. PiFrame always scans the configured default roots,
`media/photos` for slideshow and `media/videos` for ambience, then the admin
page lets you select `All` or a discovered folder such as `abstract` or
`underwater`.

Synced playlist JSON files are optional extra scan roots for cases where media
should be included from outside the default roots. Example:

```json
{
  "slideshow": [
    "media/videos/short-clips"
  ]
}
```

```json
{
  "ambience": [
    "media/other-videos/waterfall"
  ]
}
```

Each default or extra scan root is recursive. Listing `media/videos` groups
media by immediate child folders. Listing an extra folder keeps that folder as a
separate category. If a playlist file is missing, invalid, or stale, the app
still scans the configured default roots.

The Pi syncs the whole `office` folder into the local cache. The kiosk serves
only the cached `media/` subfolder through the browser route `/media`.

SMB credentials are written on the Pi to:

```text
/etc/pi-picture-kiosk/smb-credentials
```

That file must be owned by root and mode `0600`.
