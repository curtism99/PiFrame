# Raspberry Pi Setup

Target device:

```text
hostname: piframe-office
device: Raspberry Pi 4 Model B
display: 1080p HDMI landscape
```

## Base OS

Install Raspberry Pi OS with desktop support so Chromium kiosk mode can run.
Enable SSH during imaging or after first boot.

Recommended first boot checklist:

```bash
sudo raspi-config
sudo apt update
sudo apt full-upgrade
```

Set the hostname to `piframe-office`.

## LAN Management

Use your router to create a DHCP reservation for the Pi. Manage it by direct IP
address, for example:

```text
192.168.1.123
```

Do not depend on Pi-hole, custom DNS, `.home.arpa`, or cloud access.

## Deployment

From your workstation:

```bash
cd ansible
cp inventory.example.ini inventory.ini
cp group_vars/frames.example.yml group_vars/frames.yml
ansible-playbook -i inventory.ini playbook.yml
```

Put real SMB credentials in an ignored local vars file or Ansible Vault, not in
git.

## Runtime Paths

```text
/opt/pi-picture-kiosk              app
/etc/pi-picture-kiosk/config.json  config
/srv/pi-picture-kiosk/media        local media cache
/var/lib/pi-picture-kiosk/state.json runtime state
/mnt/pi-picture-kiosk-source       NAS mount point
```
