# Multi-Frame Plan

The first frame is:

```text
piframe-office -> //NAS-DS223/PiFrame/office
```

Future frames can use the same app and Ansible role with different vars:

```text
piframe-living-room -> //NAS-DS223/PiFrame/living-room
piframe-hallway     -> //NAS-DS223/PiFrame/hallway
```

NAS layout:

```text
PiFrame/
  office/
    media/photos/
    media/videos/
    playlists/
  living-room/
    media/photos/
    media/videos/
    playlists/
  hallway/
    media/photos/
    media/videos/
    playlists/
```

Each Pi remains independent. A future central dashboard can be added later, but
v1 deliberately avoids cloud services and shared runtime dependencies.
