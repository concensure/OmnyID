# Oracle operator administrator allowlist

Verified: 12 November 2026 (Australia/Sydney)  
Runtime variable: `OMNYID_ADMIN_EMAILS`

The Oracle production environment file contains these operator email
addresses:

- `admin@omnyid.com`
- `concensure@gmail.com`

## Verification note

The addresses above were read from `/home/ubuntu/omnyid/.env.oracle` without
printing any unrelated environment values or secrets. Before WED-365, the
running `omnyid-homeserver-1` container had no `OMNYID_ADMIN_EMAILS` entry,
because the production Compose service did not pass the variable through. The
source fix adds an explicit environment mapping and requires the homeserver to
be recreated. Authorization continues to use the canonical server-side
allowlist; no hard-coded email bypass was added.

This document records operational configuration, not passwords, tokens or
session material. Future changes to the production list should update both the
protected environment file and this record through the normal release process.

