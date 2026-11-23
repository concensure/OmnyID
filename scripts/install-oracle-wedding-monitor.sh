#!/usr/bin/env bash
set -euo pipefail

repo_root="${OMNYID_REPO_ROOT:-/home/ubuntu/omnyid}"
email_source="${1:-}"
password_source="${2:-}"
if [[ ! -r "$email_source" || ! -r "$password_source" ]]; then
  echo "usage: $0 <monitor-email-file> <monitor-password-file>" >&2
  exit 2
fi

sudo install -d -m 0755 /etc/omnyid
sudo install -d -m 0755 /usr/local/libexec
sudo install -m 0600 -o root -g root "$email_source" /etc/omnyid/wedding-monitor-email
sudo install -m 0600 -o root -g root "$password_source" /etc/omnyid/wedding-monitor-password
sudo install -m 0755 "$repo_root/scripts/omnyid-wedding-monitor.sh" /usr/local/libexec/omnyid-wedding-monitor
sudo install -m 0644 "$repo_root/scripts/systemd/omnyid-wedding-monitor.service" /etc/systemd/system/omnyid-wedding-monitor.service
sudo install -m 0644 "$repo_root/scripts/systemd/omnyid-wedding-monitor.timer" /etc/systemd/system/omnyid-wedding-monitor.timer
sudo systemctl daemon-reload
sudo systemctl enable --now omnyid-wedding-monitor.timer
sudo systemctl start omnyid-wedding-monitor.service
sudo systemctl --no-pager --full status omnyid-wedding-monitor.service
sudo systemctl --no-pager --full list-timers omnyid-wedding-monitor.timer
