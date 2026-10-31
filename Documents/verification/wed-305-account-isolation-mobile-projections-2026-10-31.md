# WED-305 account isolation and connected mobile projections

Date: 2026-10-31 (Australia/Sydney)

## Production account finding

A read-only production inspection was performed after the test account was
recreated. The new account has:

- no generic onboarding row;
- no Wedding onboarding row;
- no retained attachment metadata or allocated attachment bytes;
- two tenant messages, both written after recreation; and
- an empty Wedding preference profile with no derived signals, facets, hard
  constraints, budget or guest count.

The visible 80-guest and budget values therefore did not originate in the
recreated account's tenant database. They came from browser convenience state
whose keys were shared across account identities.

## Implemented boundaries

- Generic onboarding completion, Wedding entry source, intake variant and
  Wedding intake draft keys are now scoped by the authenticated user ID.
- A deleted account's browser state is not read by a recreated account with a
  new user ID, even when the email and Wedding workspace identifiers match.
- Account deletion inventories every attachment object while the private
  tenant schema still exists, removes the corresponding SeaweedFS or managed
  filesystem object, and only then deletes the tenant profile, AFP ledger,
  quota and account rows.
- Object deletion rejects unsafe storage keys and fails closed. If any object
  cannot be removed, the tenant metadata is retained so the operation can be
  retried from its authoritative inventory.
- The successful deletion response reports stored-file count, profile/ledger
  deletion and allocated-storage release.

## Connected Wedding behavior

- Vendor-research actions resolve against the complete mobile queue, so later
  photographer, planner and other category decisions open Search vendors or an
  existing shortlist instead of falling back to Review decision.
- Mobile overview tiles use content-driven height and place the action in a
  separate final row. Plan aggregate actions use larger gaps and touch areas.
- Vendor category changes remain in place. Favourite is visible on mobile and
  lifecycle filters merge current comparison choices with account-scoped AFP
  state while recognizing supported enquiry and quote event variants.
- Original import storage remains automatic. A storage retry is an operational
  state, not a couple planning task.
- Quote acceptance uses one confirmed AFP decision from the follow-up card,
  Documents or Quote received filter. That same decision supplies the Budget
  commitment and vendor lifecycle projection; it explicitly does not sign a
  contract, book, pay, or send a message.

## Local verification before freeze

- TypeScript typecheck: passed.
- Focused account-state, intake-draft, import, mobile and vendor-lifecycle
  tests: passed.
- Full Wedding suite: 2,094 passed.
- Production UI build: passed.
- Source and Wedding line budgets: passed after quote acceptance ownership was
  extracted from the existing large workspace component.
- `cargo check`: passed.
- Account deletion route tests: 4 passed.
- Attachment purge traversal test: 1 passed.

## Frozen release and Oracle deployment

- Application release: `77b4bb0868017e0e295811d2722257f276faea8b`.
- Clean release checkout:
  `C:\Users\ozans\AppData\Local\Temp\omnyid-wed305-release-77b4bb0`.
- The release added the missing Compose transport for
  `OMNYID_WEDDING_RSVP_PUBLIC_ENABLED` and
  `OMNYID_WEDDING_RSVP_PILOT_USER_IDS`. Every runtime profile keeps the public
  switch false by default; an empty pilot list remains the default.
- Exact-SHA checks passed: TypeScript, 2,095 Wedding tests, both line budgets,
  production build, `cargo check`, and syntax validation for all four Compose
  profiles.
- Oracle preflight, runtime replacement, workspace/security-header smoke,
  backup verification and isolated restore drill passed. The proof reports
  both the homeserver and backup service running, root/`/var` at 81% used and
  no failed proof step.
- Proof artifact:
  `artifacts/oracle-production-proof-wed305-77b4bb0/postdeploy/oracle-production-proof.json`.

## Hosted account and onboarding checks

- The recreated test account has a new account identity and no retained
  onboarding, Wedding preference, attachment or allocated-storage data from
  the deleted identity.
- A fresh 390 by 844 sign-in showed the privacy introduction followed by the
  generic agent onboarding. A Wedding-source sign-in showed the Wedding intake
  basics. Neither browser run inherited the old 80-guest or budget values.
- The normal login and Wedding deep-link fixes are in `b2ead124e` and
  `dcd573f1e`; the deployed release contains both.

## Controlled RSVP pilot

The window used one synthetic household and one invitation in the recreated
test account. Setup was written through `/send` as account-private AFP data;
no database bypass was used. The first attempted window exposed missing
Compose variable wiring and stayed disabled. The byte-identical environment
baseline was restored before the wiring fix was released.

On the final window:

- the container reported the public switch true and exactly one pilot-account
  entry;
- the authenticated status endpoint enabled only that account;
- one digest-only capability opened one scoped invitation;
- the first response appended exactly one `wedding_rsvp_response` and one
  `wedding_rsvp_impact_receipt`;
- replaying the identical command returned `replayed:true` and appended no
  duplicate event;
- revocation made the same link return HTTP 404; and
- only redacted SHA-256 prefixes were retained in operator output. The raw
  capability token and account ID were not printed or saved in this record.

The exact pre-window `.env.oracle` hash was restored, the temporary baseline
was removed, the container reports public RSVP false with zero pilot entries,
the hosted status endpoint reports `enabled:false`, the sole grant is revoked,
and authenticated `/healthz` returns HTTP 200. This clears the allowlisted
pilot without enabling general public collection.
