# WED-286 controlled provider receipt rehearsal

Status: partially executed and safely restored; Worker route and live round trip blocked by token scope

## Registered control window

- Window: 2026-10-28 00:30–02:30 AEDT
- Operator: Codex, acting under the repository owner's explicit instruction in this session
- Authorising owner: Ozan
- Synthetic vendor: OmnyID Receipt Lab
- Synthetic locality: Sydney
- Single generated vendor mask: `omnyid_receipt_lab_sydney@omnyid.com`
- Environment: Oracle staging for application/database state; the production Cloudflare zone only for one temporary literal-address routing rule
- Initial frozen source: `2dca8ed2089562e93432c740d66a425a0fc78f1c`

Implementation commits through `4e4da2992857116e6cd4c7276604004163d6251b`
added the provider, ingress, suppression and staging controls. The final evidence
must name the later documentation-bound candidate after clean verification; a
new commit invalidates earlier candidate evidence.

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

## Execution result

### Completed automatically

1. The before inventory contained eight Email Routing rules and a disabled,
   Drop catch-all. No Worker route was present.
2. A recipient outside the single-address provider allowlist was refused before
   any provider network request (`recipient_not_allowlisted`).
3. A controlled Cloudflare Email Sending request was accepted with one queued
   recipient, zero delivered recipients and zero permanent bounces. This proves
   provider acceptance only.
4. The local authenticated-ingress test appended exactly one recipient-encrypted
   tenant AFP event. Exact replay appended no second event.
5. A deliberate invalid-domain message was accepted into the provider queue.
   It produced no immediate permanent bounce or suppression record and the
   application did not retry it.
6. Oracle staging ran with vendor mail, sender masks, Worker ingress and policy
   V2 false. The ingress endpoint returned 404 and provider, quarantine and
   suppression counts remained `0,0,0`.
7. No Cloudflare route, catch-all, DNS or Worker mutation occurred. The final
   canonical inventory was byte-for-byte equal to the before inventory.

### Not passed or not attempted

- `wrangler deploy` was refused before upload because the replacement API token
  lacks Workers Scripts write permission. A literal routing rule must never be
  created before the exact Worker is deployed successfully.
- The controlled Gmail mailbox could not be authenticated through IMAP or the
  isolated browser run. Mailbox receipt and received headers are therefore not
  evidenced.
- Because the Worker could not be deployed, the hosted synthetic reply,
  correlated AFP event and hosted duplicate suppression were not attempted.
- The deliberately invalid-domain request remained queued at observation time.
  It is not live bounce evidence and must not be reported as such.

### Narrow resume condition

Provide the replacement account-scoped API token with Workers Scripts write
permission for the one reviewed ingress Worker, while retaining the existing
Email Routing access. Confirm that the controlled mailbox can receive the
message or provide a disposable controlled mailbox whose headers can be
inspected. Then repeat only the unpassed steps, remove the literal route, empty
the recipient allowlist, restore all flags to false and require another exact
inventory diff.
