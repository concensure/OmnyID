# WED-225 couple usability session preflight

> This is a readiness check, not an observed couple usability session and not
> `couple_usability` gate evidence.

## Session identity and scope

- Intended frozen commit: `4a4712f76024705eb32c8e860b669860cd1a58ff`
- Hosted URL checked: `https://omnyid.com/workspace/`
- Oracle release-manifest source SHA observed: `67c1559e0ad5b3760620674fed86a987d8bafc11`
- Date: 2026-10-24 Australia/Sydney
- Facilitator preflight: Codex, implementing agent
- Recruited couples observed: 0
- Consent collected: not applicable; no participant session occurred
- Test account: supplied synthetic account; its password was read only into process memory and
  was not printed, persisted or copied into evidence

## Why the session was not run

The protocol requires a real or recruited couple, a facilitator and silent observer, a hosted
copy of the exact frozen commit, and a known synthetic three-quotation workspace. Those conditions
were not present:

1. Oracle is serving a different, divergent source SHA.
2. No real or recruited couple was available. An implementing agent cannot impersonate participant
   comprehension, think-aloud comments, wrong clicks or Single Ease Question scores.
3. The account did not contain the required synthetic comparison, quotation review, clarification,
   contract/deposit review or closure timeline surfaces.
4. The seed's expected answers were not supplied for observation.
5. The current hosted page remained at the wedding intake/home surface. It would be misleading to
   turn automated control activation into usability evidence.

No `couple_usability.json` pointer was created.

## Readiness observations

| Requirement | Observation | Status |
| --- | --- | --- |
| Frozen SHA hosted | Oracle manifest reports `67c1559…`, not `4a4712f…`. | Blocked |
| Test-only account | Supplied account authenticated successfully without exposing its password. | Ready |
| Synthetic Alex and Sam workspace | Wedding intake values were visible, but the required three-quote fixture and answer key were not present. | Blocked |
| No real vendor/payment effect | No vendor message, booking, payment or provider action was triggered. | Preserved |
| Facilitator and observer | No human facilitator/observer pair was present. | Blocked |
| Real/recruited couple | No participant couple was present. | Blocked |
| Recording consent | Not requested because no participant session occurred. | Not applicable |

## Task sheet

No task was attempted or scored. Recording automated navigation as participant success would
invalidate the gate.

| Task | Result | Reason |
| --- | --- | --- |
| 1. Find the least expensive quote and confidence | Not testable | Three-quote comparison absent; no couple |
| 2. Identify what the system does not know | Not testable | Evidence/source view absent; no couple |
| 3. Draft cake-cutting-fee clarification | Not testable | Clarification card absent; no couple |
| 4. Choose a preferred quote | Not testable | Quotation decision surface absent; no couple |
| 5. Review contract and deposit changes | Not testable | Contract/deposit review absent; no couple |
| 6. Defer the decision | Not testable | Bound quotation decision absent; no couple |
| 7. Understand a successor quotation | Not testable | Revised-quote fixture absent; no couple |
| 8. Find cancellation/refund history | Not testable | Closure timeline absent; no couple |

Questions Q1-Q7 were not asked, no timings or wrong-click counts were invented, and no SEQ scores
were recorded.

## Required next action

1. Deploy the exact frozen SHA to a controlled hosted environment with consequential flags limited
   to the named test accounts.
2. Seed one disposable workspace per participating couple from `tests/fixtures/quotation/`, including
   three made-up vendors, the hidden mandatory fee, unknown inclusions and a revised successor quote.
3. Produce the written answer key and confirm that all outbound vendor and payment actions are inert.
4. Recruit at least one couple, nominate separate facilitator and observer roles, collect consent,
   and run the eight tasks one at a time without coaching before two minutes.
5. Create a gate report and pointer only if the protocol's actual pass rule is met.

Result: SESSION NOT RUN — GATE REMAINS MISSING
