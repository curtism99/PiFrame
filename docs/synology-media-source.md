# Synology Media Source

The NAS is the source of truth for media.

Windows UNC path:

```text
\\NAS-DS223\PiFrame\office
```

Linux SMB path:

```text
//NAS-DS223/PiFrame/office
```

Expected folder layout:

```text
PiFrame/
  office/
    slideshow/
      photos/
    ambience/
      videos/
```

The Pi mirrors that folder into:

```text
/srv/pi-picture-kiosk/media/
  slideshow/
    photos/
  ambience/
    videos/
```

SMB credentials are written on the Pi to:

```text
/etc/pi-picture-kiosk/smb-credentials
```

That file must be owned by root and mode `0600`.
