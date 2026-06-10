# Chromium Kiosk Mode

The Pi display runs Chromium fullscreen against the local Express server:

```bash
chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --check-for-update-interval=31536000 \
  http://localhost:8080
```

The Chromium executable name depends on Raspberry Pi OS version. Check with:

```bash
command -v chromium-browser
command -v chromium
```

The Ansible desktop autostart template currently uses `chromium-browser`.
Adjust the template if the target OS uses a different binary.

## Video Implications

Chromium is convenient for layout, admin controls, clock overlays, and future UI
features, but it is less forgiving than VLC or mpv for video containers.

Preferred video format:

```text
.mp4 with H.264 video, ideally 1080p
```

`.webm` is supported by Chromium in many cases. `.mkv` is indexed as
best-effort, but may not play reliably in kiosk mode.
