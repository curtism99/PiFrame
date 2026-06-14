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
`http://localhost:8080/api/health`, hides the pointer with `unclutter`, and then
opens the kiosk page.

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
tail -f ~/.local/state/pi-picture-kiosk/kiosk-browser.log
pgrep -a chromium
```

Restarting the Node service does not automatically reload an already-open
Chromium page. Use the `xdotool` refresh command above, or reboot the Pi, after
frontend deploys.

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
.mp4 with H.264 video, ideally 1080p
```

`.webm` is supported by Chromium in many cases. `.mkv` is indexed as
best-effort, but may not play reliably in kiosk mode.
