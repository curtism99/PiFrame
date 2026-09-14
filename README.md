# Pi Picture Kiosk

Local-first Raspberry Pi still-photo frame and ambient display software.

This project runs a tiny website on the Pi, opens Chromium in kiosk mode at
`http://localhost:8080`, and displays media that has already been copied from a
Synology NAS into a local SD-card cache.

The first target frame is:

```text
hostname: piframe-office
location: office
display: 1080p HDMI landscape monitor
NAS source: //nas-ds223/PiFrame-Media share, office subfolder
local cache: /srv/pi-picture-kiosk/media
```

The system does not depend on Pi-hole, custom DNS, `.home.arpa`, cloud services,
or internet access after media has been cached locally.

## Architecture

```text
Synology NAS folder
  //nas-ds223/PiFrame-Media/office/media/photos
        |
        v
SMB mount + photo-only rsync timer
        |
        v
Raspberry Pi local cache
  /srv/pi-picture-kiosk/media
        |
        v
Node.js + Express
  /, /admin, /media, /api/*
        |
        v
Chromium kiosk
  http://localhost:8080
```

## Local Dev Quick Start

Install dependencies:

```bash
npm install
```

Put test files here:

```text
sample-media/
  media/
    photos/
      family/
      travel/
      art/
  playlists/
    slideshow.json
```

Playlist folder entries are scanned recursively, so `media/photos` includes all
albums underneath it.

Run the development server:

```bash
npm run dev
```

PowerShell helper:

```powershell
.\scripts\run-dev.ps1
```

Open:

```text
http://localhost:8080
http://localhost:8080/admin
```

Useful commands:

```bash
npm run scan
npm run check-media
npm start
```

## API

- `GET /api/health`
- `GET /api/config`
- `GET /api/manifest`
- `POST /api/manifest/refresh`
- `GET /api/mode`
- `POST /api/mode`
- `POST /api/clock`
- `GET /api/widgets`
- `GET /api/widgets/weather`
- `POST /api/widgets/weather/test-alerts`
- `POST /api/sync`

The admin page is LAN-only and has no authentication in v1. Do not expose it to
the public internet.

## Media Compatibility

```text
.jpg .jpeg .png .webp
```

The primary manifest and kiosk runtime index still images only. Video and movie
playback are retired because they were not reliable on the Raspberry Pi display.
Existing configs that request `ambience` or `auto` mode fall back to `slideshow`;
legacy video roots and extensions are ignored with a warning in admin.

## Widgets

The display app supports multiple overlay widgets. V1 includes:

- clock/date
- NWS weather with current temp, hourly forecast, 7-day high/low forecast, and
  active warning/watch/advisory details

The weather widget is optional and uses latitude/longitude from config. It
caches the last good NWS response so the frame keeps working if internet or NWS
is unavailable. The admin page includes a runtime-only test alert toggle for
previewing severe thunderstorm and tornado alert display. Checked-in examples
use a public-landmark location; keep real coordinates only in ignored local
configuration or Ansible Vault.

## Raspberry Pi Deployment

Provisioning starts with Ansible:

```bash
cd ansible
cp inventory.example.ini inventory.ini
cp group_vars/frames.example.yml group_vars/frames.yml
ansible-playbook -i inventory.ini playbook.yml
```

Keep real SMB credentials out of git. Use Ansible Vault or local ignored vars for
the NAS username and password.

See the `docs/` folder for Raspberry Pi setup, power-loss and SD-card recovery,
Synology media layout, sync design, kiosk mode, Ansible deployment, and future
multi-frame notes.
