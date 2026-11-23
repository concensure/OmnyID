# WED-286 controlled provider receipt rehearsal

Status: controlled Worker route executed and safely restored; controlled-mailbox receipt/reply and live bounce remain open

## Registered control window

- Window: 2026-10-28 00:30–02:30 AEDT
- Operator: Codex, acting under the repository owner's explicit instruction in this session
- Authorising owner: Ozan
- Synthetic vendor: OmnyID Receipt Lab
- Synthetic locality: Sydney
- Single generated vendor mask: `omnyid_receipt_lab_sydney@omnyid.com`
- Environment: Oracle staging for application/database state; the production Cloudflare zone only for one temporary literal-address routing rule
- Executed frozen source: `9e1be336219f6a8efc78c36f5c2aabb24d571874`

The exact source was built and deployed from the clean detached worktree
`C:/Users/ozans/Desktop/projects/OmnyID-WED-286-verify-9e1be33`. A later source
commit is a new candidate and cannot inherit this hosted-runtime evidence.

## Safety invariants

- The apex catch-all remains Drop/Disabled throughout.
- Only the exact synthetic mask may be temporarily routed to the Worker.
- The provider recipient allowlist contains one controlled mailbox during the send and is empty before and after.
- Production application data is not seeded or altered. The requested test user, synthetic vendor and bounded AFP/provider fixtures remain in Oracle staging for the unfinished mailbox-reply check; their password and private recipient key are not committed.
- Vendor mail, sender-mask, Worker ingress and policy-V2 flags are false before and after the window.
- Provider acceptance, controlled-mailbox receipt and AFP persistence are recorded as separate observations.
- Evidence stores hashes, opaque IDs and bounded headers; no token, password, raw message body or private mailbox address is committed.
- Any failed precondition aborts the send and begins restoration.

## Before-state record

At registration, Oracle production reported all three vendor-mail/ingress flags false and policy V2 unset. Production contained zero selected vendor masks, zero relay threads, zero provider events and zero ingress-quarantine rows. No production application or database mutation occurred in this task.

The complete Cloudflare routing/DNS inventory, token capability probes and hosted-shadow evidence are captured immediately before the controlled mutation and compared with the restored state after the test.

## Execution result

### Completed automatically

1. The before inventory contained eight Email Routing rules and a disabled,
   Drop catch-all. No literal route for the synthetic mask was present.
2. A recipient outside the single-address provider allowlist was refused before
   any provider network request (`recipient_not_allowlisted`).
3. The account-scoped routing token read Email Routing and Workers APIs. With
   an explicit account ID, Wrangler deployed Worker version
   `30e3e00e-fd04-449a-9f82-b199d3f6932c` from the exact source above. The
   deployed Worker remains unrouted after restoration.
4. One temporary literal-address rule routed only
   `omnyid_receipt_lab_sydney@omnyid.com` to that Worker. The apex catch-all was
   never enabled or changed.
5. A controlled Cloudflare Email Sending request to the controlled Gmail
   mailbox was accepted with one queued recipient, zero delivered recipients
   and zero permanent bounces. This proves provider acceptance only.
6. A second synthetic platform send to the literal mask reported one delivered
   recipient. Oracle staging then contained exactly one completed provider
   event, one recipient-encrypted quarantine record and one tenant-private AFP
   message for the synthetic staging owner.
7. Repeating the authenticated hosted request through the staging container
   returned `accepted` then `duplicate`; the provider-event and AFP counts both
   remained one. A direct Internet probe was rejected at the edge with 403 and
   created no database row.
8. A deliberate invalid-domain message was accepted into the provider queue.
   It produced no immediate permanent bounce or suppression record and the
   application did not retry it.
9. Oracle staging also ran a flags-off shadow with vendor mail, sender masks,
   Worker ingress and policy
   V2 false. The ingress endpoint returned 404 and provider, quarantine and
   suppression counts remained `0,0,0`.
10. Restoration deleted the temporary literal route, emptied the temporary
    provider allowlist, returned every staging flag to false, removed the
    disposable scanner and shredded the temporary server secret. The final
    routing inventory again contained the same eight rules and disabled Drop
    catch-all as the before inventory.

### Not passed or not attempted

- The controlled Gmail mailbox could not be authenticated through IMAP or the
  available tooling. Mailbox receipt and received headers are therefore not
  evidenced, and no controlled human reply has been correlated.
- The deliberately invalid-domain request remained queued at observation time.
  A later authenticated read-only suppression query still returned zero total
  records. It is not live bounce evidence and must not be reported as such.
- The routing token does not have Email Sending permission; the existing
  separately scoped sending credential was used for the two controlled sends.
  This separation is intentional and no token value was logged.

### Narrow resume condition

The owner inspects the already-sent controlled message in
`concensure+testing@gmail.com`, records its received headers and confirms a
short reply window. Re-add only the reviewed literal route for that window,
observe exactly one correlated AFP event, replay the same RFC 822 fixture to
prove suppression, and restore the route/allowlist/flags with another exact
inventory diff. Separately obtain a real provider bounce or complaint event;
provider queue acceptance is not a substitute.
