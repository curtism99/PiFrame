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
    playlists/
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

Example playlists:

```json
{
  "slideshow": [
    "media/photos",
    "media/videos/short-clips"
  ]
}
```

```json
{
  "ambience": [
    "media/videos/fireplace",
    "media/videos/clouds"
  ]
}
```

Each playlist entry is recursive. Adding `media/photos` includes all nested
photo albums below that folder. Ambience entries are also preserved as playback
groups; listing `media/videos` groups videos by immediate child folders, while
listing `media/videos/fireplace` and `media/videos/clouds` keeps those folders
as separate ambience categories.

If a playlist file is missing or invalid, the app falls back to scanning
`media/photos` for slideshow and `media/videos` for ambience.

The Pi syncs the whole `office` folder into the local cache. The kiosk serves
only the cached `media/` subfolder through the browser route `/media`.

SMB credentials are written on the Pi to:

```text
/etc/pi-picture-kiosk/smb-credentials
```

That file must be owned by root and mode `0600`.
