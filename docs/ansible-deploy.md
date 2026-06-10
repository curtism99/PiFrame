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
