# WED-257 recipient and storage security evidence

Date: 2026-10-25

Commit under test: working tree based on `93c44fe40a40add3a7b49ca382f921cbc7610842`.

Status: implementation evidence only. No production deployment or release approval.

## Recipient-held vendor email envelope

- New vendor-email quarantine records use `recipient-x25519-v1`.
- The public key comes from the signed AgentCard for the verified vendor listing.
- The envelope records the recipient agent and key IDs and binds them in authenticated data.
- No recipient private key or server decryption recipient is stored.
- Missing, invalid or mismatched AgentCards fail closed.
- Exact RFC 822 bytes are scanned by ClamAV before persistence. Scanner absence, error or infection fails closed.
- The database-backed ingress test passed for acceptance, recipient binding, encrypted storage,
  idempotent replay and conflicting replay.
- A focused crypto test passed and proved that a different X25519 private key cannot decrypt the
  envelope.
- Rust and browser implementations share a fixed HKDF-SHA-256 contract vector. The browser checks the
  recipient key version before deriving the AEAD key and retains legacy raw-X25519 compatibility only
  for existing non-versioned vendor envelopes.

This does not convert legacy AFP ciphertext. Ordinary Internet email is also plaintext at the mail
provider and briefly in live gateway memory. The broader account/device key-registration, recovery,
revocation and legacy migration work remains open.

## SeaweedFS inspection and rehearsal

Read-only Oracle inspection found:

- no SeaweedFS host ports were published;
- external probes to 8333, 9000, 9001 and 9333 were closed;
- the existing secret directory was root-owned mode 0700 and its secret files were mode 0600;
- the Docker socket was mode 0660 for root and the Docker group, whose only non-root member was the
  deployment account;
- the current container shared the broad default application network and accepted its credential
  through environment variables; the unauthenticated master endpoint was reachable from peers on
  that network;
- the existing production volume contained about 2 GB, so it was not restarted or migrated during
  this work.

A disposable local Docker rehearsal used an internal network and random temporary credentials:

- unauthenticated S3 access returned HTTP 403;
- the storage-admin identity created the configured bucket;
- the application identity could put, get and delete an object only in that bucket;
- the application identity could not create another bucket or delete its configured bucket;
- the test container, network and volume were removed and the temporary secret files were emptied.

The reviewed Compose definitions now use a dedicated internal storage network, publish no production
storage ports, mount file-backed application credentials and separately stored administration
credentials, omit working defaults, and expose only the bucket-scoped application identity to the
homeserver. Readiness performs an
authenticated `HeadBucket` rather than contacting the master API.

## Checks

- `cargo test crypto::tests::recipient_ --lib`: pass, 2/2.
- Solid UI typecheck and recipient key-derivation contract tests: pass, 2/2.
- `cargo test gateway::vendor_mail_provider::tests --lib`: pass, 4/4.
- `cargo test server::vendor_email_worker_ingress::tests --lib`: pass, 3/3.
- `cargo test db::migration_catalog::tests --lib`: pass, 1/1.
- `cargo test --test vendor_email_worker_ingress_api -- --nocapture`: pass, 1/1.
- Four Compose configurations with required non-secret placeholders: pass.
- Secure entrypoint shell syntax: pass.
- Disposable SeaweedFS authorization rehearsal: pass.

The inherited unused `user_id` warning in `src/server/email_group_routes.rs` remains. Mail, sender-mask,
ingress and policy-V2 rollout flags remain disabled.
