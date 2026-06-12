# Multi-Frame Plan

The first frame is:

```text
piframe-office -> //nas-ds223/PiFrame-Media + office subfolder
```

Future frames can use the same app and Ansible role with different vars:

```text
piframe-living-room -> //nas-ds223/PiFrame-Media + living-room subfolder
piframe-hallway     -> //nas-ds223/PiFrame-Media + hallway subfolder
```

NAS layout:

```text
PiFrame-Media/
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
