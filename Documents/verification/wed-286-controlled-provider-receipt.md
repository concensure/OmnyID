# WED-286 controlled provider receipt rehearsal

Status: planned; no provider, routing, DNS, Worker or runtime mutation made at registration

## Registered control window

- Window: 2026-10-28 00:30–02:30 AEDT
- Operator: Codex, acting under the repository owner's explicit instruction in this session
- Authorising owner: Ozan
- Synthetic vendor: OmnyID Receipt Lab
- Synthetic locality: Sydney
- Single generated vendor mask: `omnyid_receipt_lab_sydney@omnyid.com`
- Environment: Oracle staging for application/database state; the production Cloudflare zone only for one temporary literal-address routing rule
- Initial frozen source: `2dca8ed2089562e93432c740d66a425a0fc78f1c`

The final test candidate will replace the initial source above after implementation and clean verification. A new commit invalidates prior build or deployment evidence.

## Safety invariants

- The apex catch-all remains Drop/Disabled throughout.
- Only the exact synthetic mask may be temporarily routed to the Worker.
- The provider recipient allowlist contains one controlled mailbox during the send and is empty before and after.
- Production application data is not seeded or altered; synthetic user, vendor, thread and AFP state belong to Oracle staging and are removed after evidence capture.
- Vendor mail, sender-mask, Worker ingress and policy-V2 flags are false before and after the window.
- Provider acceptance, controlled-mailbox receipt and AFP persistence are recorded as separate observations.
- Evidence stores hashes, opaque IDs and bounded headers; no token, password, raw message body or private mailbox address is committed.
- Any failed precondition aborts the send and begins restoration.

## Before-state record

At registration, Oracle production reported all three vendor-mail/ingress flags false and policy V2 unset. Production contained zero selected vendor masks, zero relay threads, zero provider events and zero ingress-quarantine rows. No Cloudflare API mutation or email send had occurred in this task.

The complete Cloudflare routing/DNS inventory, token capability probes and hosted-shadow evidence are captured immediately before the controlled mutation and compared with the restored state after the test.
