# Ansible Deploy

The Ansible skeleton provisions the first frame, `piframe-office`.

## Files

```text
ansible/inventory.example.ini
ansible/group_vars/frames.example.yml
ansible/playbook.yml
ansible/roles/pi_picture_kiosk/
```

## Prepare

```bash
cd ansible
cp inventory.example.ini inventory.ini
cp group_vars/frames.example.yml group_vars/frames.yml
```

Edit `inventory.ini` with the DHCP-reserved Pi IP.

Edit `group_vars/frames.yml` with the DHCP-reserved NAS IP and readable local
hostname:

```yaml
frame_nas_ip: "192.168.0.10"
frame_nas_hostname: "nas-ds223"
frame_nas_aliases:
  - "NAS-DS223"
frame_nas_source: "//nas-ds223/PiFrame-Media"
frame_nas_source_subdir: "office"
```

Replace `192.168.0.10` with the actual Synology IP. The role writes the hostname
to `/etc/hosts` on the Pi, so SMB can use a readable path without depending on
Pi-hole, router DNS quirks, NetBIOS, mDNS, or `.home.arpa`.

Store real NAS credentials outside git. Use Ansible Vault for production:

```bash
ansible-vault create group_vars/vault.yml
```

## Run

```bash
ansible-playbook -i inventory.ini playbook.yml
```

The playbook installs Node.js, Chromium, `cifs-utils`, `rsync`, deploys the app,
templates config and credentials, enables the backend service, enables the sync
timer, and installs a Chromium kiosk autostart desktop entry.

For a dedicated display, make sure `group_vars/frames.yml` names the desktop
login user and enables desktop autologin:

```yaml
frame_desktop_user: "curtis"
frame_desktop_group: "curtis"
frame_enable_desktop_autologin: true
```

Then deploy and reboot:

```bash
ansible-playbook -i inventory.ini playbook.yml --ask-pass --ask-become-pass
ssh curtis@192.168.0.70 "sudo reboot"
```

After boot, the Pi should log into the desktop and open Chromium fullscreen at
`http://localhost:8080`.

For SSH-only control after a frontend deploy:

```bash
ssh curtis@192.168.0.70
sudo systemctl restart pi-picture-kiosk.service
DISPLAY=:0 xdotool key F5
```
