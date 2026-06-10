# Pi Picture Kiosk

Local-first Raspberry Pi picture frame and ambience kiosk software.

This project runs a tiny website on the Pi, opens Chromium in kiosk mode at
`http://localhost:8080`, and displays media that has already been copied from a
Synology NAS into a local SD-card cache.

The first target frame is:

```text
hostname: piframe-office
location: office
display: 1080p HDMI landscape monitor
NAS source: //NAS-DS223/PiFrame/office
local cache: /srv/pi-picture-kiosk/media
```

The system does not depend on Pi-hole, custom DNS, `.home.arpa`, cloud services,
or internet access after media has been cached locally.

## Architecture

```text
Synology NAS folder
  //NAS-DS223/PiFrame/office
        |
        v
SMB mount + rsync timer
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
  slideshow/
    photos/
  ambience/
    videos/
```

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
- `POST /api/sync`

The admin page is LAN-only and has no authentication in v1. Do not expose it to
the public internet.

## Media Compatibility

Images:

```text
.jpg .jpeg .png .webp
```

Videos:

```text
.mp4 .webm .mkv
```

MP4 with H.264 video is preferred for Chromium kiosk mode. MKV files are indexed
as best-effort and may not play reliably in Chromium.

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

See the `docs/` folder for Raspberry Pi setup, Synology media layout, sync
design, kiosk mode, Ansible deployment, and future multi-frame notes.
