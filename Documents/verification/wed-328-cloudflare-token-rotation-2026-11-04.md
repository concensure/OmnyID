# WED-328 Cloudflare Email Routing Token Rotation

Date: 2026-11-04 (Australia/Sydney)
Credential label supplied by owner: `omnyid_email_routing`

## Handling

- The credential value was never written to Git, a command argument, console output or this report.
- The local canonical copy is in the primary checkout's gitignored `.secrets` directory.
- The temporary Downloads copy was removed after local and Oracle digest equality was verified.
- Plaintext legacy Cloudflare token variables in the local `.env` were removed and replaced by
  `_FILE` references.
- Oracle's existing three consumers (transactional sending, vendor mail and operator relay) continue
  to resolve one root-owned file at `/run/secrets/omnyid_vendor_mail_cloudflare_api_token`.
- The Oracle file is owned by `root:root`, mode `0600`, and its digest matches the local canonical
  copy. The running homeserver can see the replaced file.
- No service restart was required because the mounted secret file is read on demand.

## Non-mutating capability checks

The replacement bearer returned a successful active-token verification response. Read-only probes
also succeeded for:

- the `omnyid.com` zone lookup;
- Email Routing destination addresses;
- Workers scripts;
- Email Sending suppressions;
- Email Routing rules;
- Workers routes; and
- DNS records.

These probes demonstrate readable access to the relevant surfaces. They do not prove a later
mutation will succeed and they do not constitute a send, Worker deploy, DNS edit or route edit.

## Preserved state

- No Email Routing rule, catch-all, destination address, Worker script, Worker route or DNS record
  was changed.
- No vendor-mail, sender-mask, ingress or other rollout flag was changed.
- No message was sent.
- The owner reports that the previous same-purpose Cloudflare token was revoked.

## Follow-up

Before a future control-plane mutation, capture the full routing/DNS/Worker inventory and rollback
payload, make the smallest reviewed change, then compare the restored inventory after the window.
