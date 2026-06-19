# Chromium Kiosk Mode

The Pi display runs Chromium fullscreen against the local Express server:

```bash
chromium-browser \
  --kiosk \
  --app=http://localhost:8080 \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --autoplay-policy=no-user-gesture-required \
  --password-store=basic \
  --check-for-update-interval=31536000 \
  --user-data-dir="$HOME/.config/pi-picture-kiosk/chromium-profile"
```

The Chromium executable name depends on Raspberry Pi OS version. Check with:

```bash
command -v chromium-browser
command -v chromium
```

The Ansible role installs `/opt/pi-picture-kiosk/scripts/start-kiosk-browser.sh`.
That launcher finds either `chromium-browser` or `chromium`, waits briefly for
`http://localhost:8080/api/health`, and then opens the kiosk page. Pointer
hiding is handled in the app by default.

## Boot Autostart

Chromium needs a graphical desktop session, so the role installs a desktop
autostart entry for the display user:

```text
~/.config/autostart/pi-picture-kiosk.desktop
```

It also installs a labwc autostart script for Raspberry Pi OS Wayland sessions:

```text
~/.config/labwc/autostart
```

For a dedicated frame, set this in `ansible/group_vars/frames.yml`:

```yaml
frame_desktop_user: "curtis"
frame_desktop_group: "curtis"
frame_enable_desktop_autologin: true
```

After the next Ansible run and reboot, Raspberry Pi OS should auto-login to the
desktop and launch Chromium at `http://localhost:8080`.

Useful SSH commands:

```bash
sudo systemctl restart pi-picture-kiosk.service
DISPLAY=:0 xdotool key F5
/opt/pi-picture-kiosk/scripts/kiosk-control.sh status
/opt/pi-picture-kiosk/scripts/kiosk-control.sh refresh
/opt/pi-picture-kiosk/scripts/kiosk-control.sh restart-browser
tail -f ~/.local/state/pi-picture-kiosk/kiosk-browser.log
pgrep -a chromium
```

Restarting the Node service does not automatically reload an already-open
Chromium page. Use the `xdotool` refresh command above, or reboot the Pi, after
frontend deploys.

The preferred keyboardless control path is the deployed control script:

```bash
/opt/pi-picture-kiosk/scripts/kiosk-control.sh status
/opt/pi-picture-kiosk/scripts/kiosk-control.sh refresh
/opt/pi-picture-kiosk/scripts/kiosk-control.sh restart-backend
/opt/pi-picture-kiosk/scripts/kiosk-control.sh restart-browser
/opt/pi-picture-kiosk/scripts/kiosk-control.sh logs
```

Run the script from SSH as the desktop login user so it has the same display
session and Chromium profile as the kiosk launcher.

## Cursor Hiding

The kiosk page starts with the pointer hidden and keeps it hidden when
`display.hide_cursor` is enabled. Moving or clicking the mouse makes the pointer
visible again until it is idle for `display.cursor_idle_seconds`.

For Pi deployment, tune these in `ansible/group_vars/frames.yml`:

```yaml
frame_hide_cursor: true
frame_cursor_idle_seconds: 3
# Optional X11-only desktop cursor helper. Keep disabled on labwc/Wayland unless verified.
frame_install_unclutter: false
# Optional; only enable after verifying XWayland works on the frame.
# frame_chromium_ozone_platform: "x11"
```

When `frame_chromium_ozone_platform` is set to `x11`, Chromium runs through
X11/XWayland, which can let X11 tools such as `xdotool` refresh the kiosk from
SSH. Leave this unset if Chromium fails to auto-start or exits immediately on
the frame.

`unclutter` is disabled by default because the classic X11 package and its
`unclutter-startup` companion can install Xsession startup hooks that fail under
Raspberry Pi OS labwc/Wayland. Only set `frame_install_unclutter: true` after
verifying the frame runs a working X11 session.

If you need normal desktop mouse behavior while troubleshooting:

```bash
pkill chromium
```

## Keyring Prompt

If Chromium prompts to create or unlock a desktop keyring during kiosk startup,
the launcher uses this Chromium flag to avoid the keyring:

```text
--password-store=basic
```

The kiosk does not need browser-saved passwords because it only opens the local
app at `http://localhost:8080`. This does not change the NAS SMB credential
file, which remains root-owned at `/etc/pi-picture-kiosk/smb-credentials`.

## Video Implications

Chromium is convenient for layout, admin controls, clock overlays, and future UI
features, but it is less forgiving than VLC or mpv for video containers.

Preferred video format:

```text
.mp4 with H.264 video, yuv420p, ideally no larger than 1080p30
```

`.webm` is supported by Chromium in many cases. `.mkv` is indexed as
best-effort, but may not play reliably in kiosk mode.

For Raspberry Pi kiosk output, treat 4K, 60fps, and very high bitrate files as
suspect even when they play smoothly from another workstation browser. A useful
ambience target is:

```text
H.264 MP4, max 1920x1080, max 30fps, yuv420p, CRF 23, maxrate 8000k
```

Use the optimizer script to audit or generate Pi-friendly copies while
preserving directory grouping:

```bash
node scripts/optimize-ambience-videos.js --source /path/to/office/media/videos
node scripts/optimize-ambience-videos.js --source /path/to/office/media/videos --dest /path/to/office-optimized/media/videos --apply
```

The first command is a dry-run report. The second writes optimized copies to a
separate tree and does not overwrite source media.
