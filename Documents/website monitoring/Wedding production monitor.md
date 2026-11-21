# OmnyID Wedding production monitor

Status: implementation and operator runbook
Task: WED-390
Source guidance: `automatic monitoring.md`

## Purpose

The monitor answers a narrower question than a public uptime probe: can a dedicated
Wedding account sign in and read the real workspace while the application database,
background daemons and current frontend asset are healthy?

It is intentionally read-only. It does not create a plan, add a guest, save a
decision, send a message or approve an external action. Each run revokes the session
it created.

## Checks

The synthetic requires HTTP 200 and expected JSON/content for:

1. `https://omnyid.com/wedding/`;
2. `https://omnyid.com/workspace/`;
3. password login for the dedicated monitor account;
4. the authenticated session identity;
5. the authenticated dashboard bootstrap;
6. `/healthz` with status `ok`;
7. `/readyz` with status `ready`, database `ok` and daemons `ok`;
8. the hashed JavaScript entry referenced by the current workspace shell.

The latest result is written to
`/var/lib/omnyid-wedding-monitor/latest.json` using schema
`omnyid.wedding_monitor.v1`. A non-zero service result makes failures visible to
systemd. If `OMNYID_WEDDING_MONITOR_ALERT_WEBHOOK_FILE` names a readable credential
file, the failed JSON result is also posted to that webhook.

## Schedule and credentials

`omnyid-wedding-monitor.timer` runs at 08:00 and 20:00 Australia/Sydney, is
persistent across downtime and applies up to ten minutes of random delay. The
service receives the account email and password through systemd `LoadCredential`.
The installed files are root-owned mode 0600 under `/etc/omnyid`; their values must
never be committed or included in deployment evidence.

The account is synthetic, has the normal Wedding couple role and owns only its empty
safe workspace. There is no monitor-specific write privilege. MFA is not enabled
because this is a non-interactive synthetic; the script is constrained to GETs after
login and session revocation.

## Install or rotate

From the exact released source on Oracle (the installer copies the frozen script to
`/usr/local/libexec/omnyid-wedding-monitor`):

```bash
sudo /home/ubuntu/omnyid/scripts/install-oracle-wedding-monitor.sh \
  /secure/path/email /secure/path/password
```

To rotate credentials, replace the two source files and run the installer again.
Do not pass the secret values as command-line arguments.

## Verify and diagnose

```bash
sudo systemctl start omnyid-wedding-monitor.service
sudo systemctl status omnyid-wedding-monitor.service --no-pager
sudo systemctl list-timers omnyid-wedding-monitor.timer --no-pager
sudo cat /var/lib/omnyid-wedding-monitor/latest.json
sudo journalctl -u omnyid-wedding-monitor.service -n 100 --no-pager
```

Interpret failures by check name. `password_login` isolates auth; `auth_session` and
`workspace_bootstrap` isolate post-login account/API access; `health` and `readiness`
isolate runtime dependencies; `workspace_asset_cache` catches a shell that points at
a missing compiled asset. Runtime health remains machine-owned by the endpoints and
service result rather than a hand-edited project-state claim.

The local deterministic harness is:

```bash
bash scripts/omnyid-wedding-monitor-selftest.sh
```

It uses an in-process mock, verifies all eight checks and asserts that the test
password is absent from monitor output.
