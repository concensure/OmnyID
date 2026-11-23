# Recipient message and SeaweedFS security boundary

Date: 2026-10-25

Status: implementation boundary; not a production rollout approval.

## Stored vendor email

New vendor-email quarantine objects use `recipient-x25519-v1` envelopes. The
gateway obtains the encryption public key from the signed, current vendor
AgentCard associated with the verified listing owner. Associated data binds
the provider event, sender identity, vendor owner, AgentCard identity and key
version, and payload digest.

The matching private X25519 key is generated and retained by the vendor device.
It is not accepted by an API, stored in PostgreSQL, written to a server secret
file or added as a second server recipient. A missing, malformed, stale or
cross-owner AgentCard fails closed. The legacy `/agent/keys` route remains
unable to return the server-wide AFP encryption key.

This guarantee currently applies to the WED-255 vendor-email quarantine and
the existing claimed-vendor quotation transport. Other legacy AFP envelopes
still need account/device key registration and migration before OmnyID can
claim operator-resistant encryption for every historical message. Do not
represent the whole product as zero-knowledge until that migration and
recovery design is complete.

Ordinary email is plaintext at Cloudflare and briefly in gateway memory. The
gateway runs ClamAV on the exact bytes before persistence and fails closed if
the scanner is unavailable. Recipient encryption protects retained content
from later server-key disclosure; it cannot prevent a malicious live operator
from instrumenting the delivery process.

## SeaweedFS

Production definitions place SeaweedFS on an internal Docker network shared
only with the homeserver. No master, filer, volume or S3 port is published on
the host. Caddy, Electric, PostgreSQL and unrelated containers are not members
of the storage network.

Credentials are random values in root-owned files. Storage-admin credentials
live in a separate `.seaweedfs-admin-secrets` directory which is never mounted
into the homeserver. SeaweedFS receives a
generated in-memory static IAM configuration with two identities:

- `omnyid-app`: Read, List, Tagging and Write only for the configured bucket;
- `omnyid-storage-admin`: bucket administration for one-shot provisioning and
  recovery, never mounted into the homeserver.

The application reads its access and secret keys through the existing
`*_FILE` secret boundary. Compose contains no working default. Readiness uses
an authenticated `HeadBucket`; the unauthenticated master API is not treated
as a health check.

Docker administrators and root remain trusted infrastructure operators: they
can inspect containers, replace binaries or mount volumes. These controls
exclude ordinary host users, other application containers and the public
Internet; they do not pretend to defend against a hostile root operator.
