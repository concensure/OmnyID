# Email Worker Gates 2 and 3 — Simulation Audit

Date: 2026-10-29 AEDT
Audited implementation commit: `5b51eeb724303b49e914e3623789c61bfb8f633d`
Earlier controlled-provider runtime: `9e1be336219f6a8efc78c36f5c2aabb24d571874`
Classification: autonomous evidence only; not an independent approval or live-provider sign-off

## Conclusion

### Gate 2 — Independent security and privacy review

**Not passed.** Automated negative tests and implementation inspection can prepare evidence for Gate 2, but they cannot establish reviewer independence or accept residual security/privacy risk. The gate still requires:

1. a named independent security reviewer;
2. a named independent privacy reviewer;
3. review of the same frozen app, Worker, gateway, manifests and configuration inventory;
4. disposition of every finding, with no open Critical or High finding; and
5. both reviewers signing the same release digest and identifying re-review triggers.

The implementing agent must not sign either role or convert the simulations below into Gate 2 approval.

### Gate 3 — Controlled provider receipt test

**Not passed, but substantially exercised.** The WED-286 window performed real controlled routing, provider acceptance/delivery, mailbox receipt, one human reply, one correlated recipient-private AFP event, exact replay suppression, flags-off shadowing and restoration. The earlier evidence is bound to `9e1be33…`; it cannot automatically pass a later candidate.

The following remain unproved for the gate:

- saved Gmail “Show original” authentication evidence containing the redacted SPF, DKIM and DMARC results;
- a provider-observed permanent bounce or complaint and its no-retry application record;
- an operator-signed consolidated report containing the redacted provider IDs/headers, AFP references, before/after inventory diff, exact times and digest for the frozen release candidate; and
- independent confirmation that the vendor's real address is not disclosed in the couple-facing projection of that same hosted candidate.

An invalid-domain request that stayed queued is not bounce evidence. Local bounce fixtures are not provider-observed delivery failure evidence.

## Previously completed live or hosted actions

The controlled WED-286 evidence records:

- eight routing rules and a disabled Drop catch-all before and after;
- all vendor-mail, sender-mask and ingress flags false before and after;
- one literal generated vendor-mask route only, removed during restoration;
- a non-allowlisted recipient refused before the provider request;
- a direct unauthorised probe rejected at the edge with no database row;
- separate provider acceptance and delivered observations;
- controlled Gmail receipt confirmed by the owner;
- one reply correlated to one completed provider event, one encrypted quarantine record and one recipient-private AFP message;
- hosted exact replay suppressed without a second AFP event;
- an empty allowlist and restored disabled flags after the reply window; and
- a flags-off Oracle staging shadow with zero provider, quarantine and suppression rows.

See `Documents/verification/wed-286-controlled-provider-receipt.md` and the 2026-10-28 WED-286 handoff. Where that older receipt's initial “not attempted” section conflicts with the later handoff, the later reply-window evidence is the successor record.

## Safe simulations rerun on 2026-10-29

The following were executed locally without changing Cloudflare, a provider account, routing, an allowlist or production flags:

| Evidence | Result | What it proves | What it does not prove |
|---|---|---|---|
| Worker tests, 7 cases | Passed | Deterministic event identity, signed canonical request, exact bytes, size limits, status classification and inability of Worker config to create routing rules | Live routing or mailbox receipt |
| Vendor-mail provider units, 7 cases | Passed | Default-off behavior, readiness boundary, outsider refusal before provider request, accepted/delivered/bounced distinction and bounce/complaint no-retry policy | A real provider bounce |
| Worker ingress units, 4 cases | Passed | RFC822 type boundary, stale/altered/wrong-key/noncanonical rejection and content-free canonical envelopes | Hosted tenant persistence |
| SMTP-out units, 7 cases | Passed | Structured recipient contract, reply headers, config failure and isolation from transactional account mail | Provider acceptance or delivery |
| Disposable-Postgres suppression integration, 1 case | Passed | Complaint record is digest-only, idempotent, creates one provider event and blocks automated retry | A provider-originated complaint |
| Disposable live ClamAV, 3 cases | Passed | Clean acceptance, harmless EICAR detection and unavailable-scanner fail-closed behavior | Full MIME bomb/malware corpus |

## Gate status after simulation

- Gate 2 remains **blocked on independent human authority**, not on an ordinary coding task.
- Gate 3 remains **blocked on real provider/header evidence and operator consolidation**, despite strong automated and earlier controlled evidence.
- No routing, DNS, provider, allowlist, Oracle or production mutation occurred during this audit.
- Policy V2 and outbound relay flags were not enabled.

## Exact resume action

On the frozen candidate, an authorised operator should run one bounded window and add only the missing evidence:

1. export and hash the before inventory;
2. confirm the three flags are false and the outsider path produces no AFP event;
3. save the controlled received message's Gmail original with redacted SPF/DKIM/DMARC results;
4. cause or retrieve one provider-observed permanent bounce/complaint, then prove one suppression record and no retry;
5. confirm the couple-facing projection does not reveal the vendor's real address;
6. restore and hash the after inventory, which must match except timestamps; and
7. sign one consolidated report and calculate its SHA-256 for the workbook.

Do not repeat the already-proved route/reply steps unless the candidate, Worker, gateway or external configuration changed in a way that invalidates them.
