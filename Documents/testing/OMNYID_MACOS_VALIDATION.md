# OmnyID macOS Validation

## What is needed to test the macOS installer

To validate `scripts/install-omnyid-private.sh` on a rented macOS instance, OmnyID needs:

- SSH host or public IP
- SSH username
- authentication method and key path
- macOS version
- CPU architecture: Apple Silicon or Intel
- whether Homebrew is installed
- whether Docker Desktop, Colima, or OrbStack is installed
- whether `cargo` is installed
- whether `python3` is installed
- whether the instance has outbound internet access

## Recommended preflight checks on the macOS host

```bash
sw_vers
uname -m
which brew || true
which docker || true
docker --version || true
docker compose version || true
which cargo || true
cargo --version || true
which python3 || true
python3 --version || true
curl -I https://api.omnyid.com
```

## Success criteria for macOS installer validation

- `bash scripts/install-omnyid-private.sh local` completes
- bundle folder is created under `~/Documents/OmnyID/<workspace>`
- `.env.private` exists
- `tenant.json` exists
- `preflight.json` exists
- `README.md` exists
- local estimates are written clearly
- if Docker is installed and enabled, local launch can be attempted

## Nice-to-have follow-up checks

- test on both Intel and Apple Silicon
- test with Docker Desktop
- test with Colima
- test with no Docker installed to confirm friendly error messaging
