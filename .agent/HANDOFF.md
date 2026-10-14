## 2026-10-13 - WED-181 Stripe one-off checkout webhook rollout (Codex)

- Confirmed the Wedding upgrade is a `mode=payment` one-off Checkout flow, so Stripe `subscription_data` must not be sent: it is valid only for a recurring Price and would reject the AUD 39 purchase.
- Made paid `checkout.session.completed` / async success handling explicit: Stripe session `status: complete` maps to the account entitlement status `active`. Added a regression fixture with the real `complete` session status.
- Verification: focused billing test passed; `cargo check` passed.
- Released commits `480c37a` and `3269ba1` to Oracle. The workspace returns HTTP 200 and serves `main-DXv7pLra.js`; Caddy, UI, and homeserver are running. The release helper now uses bounded non-interactive SSH connections to prevent a stalled release client.
- The signing secret was not read, copied, logged, or committed; the release used the existing Oracle `.env.oracle`.
# Handoff

## 2026-10-14 - WED-185 relay persistence foundation (Codex)

- Added migration `0108_wedding_vendor_email_relay_foundation` and catalog registration. It creates `wedding_agent_identity_masks`, `wedding_vendor_email_threads`, `wedding_vendor_email_provider_events`, and `wedding_vendor_email_read_projection` with lifecycle, tenant, uniqueness, dedupe, and lookup indexes.
- The mask domain is constrained to `mail.omnyid.com`; relay thread address data is only `BYTEA` ciphertext plus keyed digest. The migration contains no subject, body, HTML, preview, filename, or plaintext address column.
- Legacy Gmail contact data is intentionally not copied: the existing `wedding_vendor_user_contacts.vendor_email` field is plaintext, so a later reviewed encryption/backfill service must own any migration of unambiguous records.
- Verification: `cargo test migration_list --lib` passed (32 tests). The workspace has no local `psql` executable, so live Postgres application of the new SQL remains a pre-deployment requirement. No Oracle deployment or provider/routing change was made.

## 2026-10-14 - WED-185 AFP relay contract foundation (Codex)

- Added matching TypeScript and Rust contracts for `wedding_vendor_email/v1`, `email_read/v1`, delivery-status, and bounce decrypted payloads, while retaining the existing generic AFP message/protobuf shape unchanged.
- Relay envelopes require `type=email`, `kind=communication`, approved subtypes, `wedding_vendor_email` supertag, an exact encrypted-content marker, a non-empty encryption envelope, and content-free metadata. The allowlist rejects unapproved fields and `@`-bearing metadata values.
- Read events require both relay/read supertags and an explicit `message` reference to their `parent_id`; their metadata is restricted to schema plus opaque idempotency key. Deterministic SHA-256 helpers deliberately do not replace AFP ULIDs.
- Verification: `npm run typecheck`, `npm run build`, and `node --test tests/vendor-email-contract.test.mjs` passed in `typescript-sdk`; `cargo test wedding_vendor_email_contract --lib` and `cargo test vendor_mail_provider --lib` each passed (3 tests).
- No Oracle deployment or external mail-provider change: this is a disabled SDK/server validation layer only. Next safe dependency slice is RELAY-03 additive mask/thread/event/read-projection persistence design and migrations.

## 2026-10-14 - WED-185 disabled vendor-relay configuration foundation (Codex)

- Recorded the owner-approved temporary continuity exception: existing Gmail wiring remains live while Cloudflare Email Routing API access is unavailable. The new vendor relay is still disabled, and Gmail is not a selectable relay provider or fallback.
- Added `OMNYID_VENDOR_MAIL_*` example variables and file-backed Oracle secret-sync mappings for Cloudflare, Resend, Worker, and Resend webhook credentials. The compose service receives them separately from the existing Gmail/SMTP values.
- Added a fail-closed `vendor_mail_provider` configuration module: only `cloudflare_email_sending` and `resend` are accepted; enabling either without its platform credentials reports content-free non-readiness; Gmail/SMTP/Outlook names are rejected. No outbound provider call or routing change exists in this slice.
- Added the RELAY-01 threat-model draft, including trust boundaries, explicitly non-E2EE privacy language, residual risks, and the required independent-review release blockers.
- Local TypeScript SDK typecheck passed. `cargo test gateway::vendor_mail_provider --lib` is compiling under the shared artifact lock at handoff time; repository-wide `cargo fmt --check` reports pre-existing unrelated formatting drift, while the new Rust module was formatted independently. No deployment was attempted because this disabled configuration foundation has no live behavior change.

## 2026-10-14 - WED-185 regression repair and Wedding blog release (Codex)

- Released `f13f551` to Oracle. The vendor-search field now holds its draft while typing, avoiding the first-character viewport jump; it commits on blur or explicit search.
- The Wedding overview's **Track vendors** tile stays within the wedding home and scrolls to the real vendor-follow-up panel, instead of opening the unrelated generic Response Queue.
- Published the two requested WED-178 articles: **Fake wedding exits: are they worth it?** and **When a fake exit goes wrong, and how to run one well**. `blog.html` now includes both cards and a client-side guide search, including celebrant advice.
- Verification: `node wedding/tests/wedding-website-smoke.mjs`, `npm run typecheck`, `npm run build`, and `npm run test:wedding` (1,820 tests) passed. Oracle served-content checks passed for the index, both article URLs, blog search markup, and the deployed search-field source.
- Deployment was UI-only with Caddy reload disabled. The Caddyfile SHA-256 remained `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`; the StrollerCheck block and running Caddy/homeserver remained intact.
- WED-185 remains in progress: Cloudflare Email Routing inventory is still blocked by API permission error 10000, so no routing or DNS mutation has been made.

## 2026-10-12 - WED-183 workspace recovery and core view verification (Codex)

- Fixed the production `Cannot access lexical declaration ... before initialization` failure caused by eager Solid memos being declared before their sources in Database, Notes, and the workflow composer.
- Workflows now keeps its editor mounted and shows a retryable failure receipt if the initial workflow API call fails instead of allowing the resource rejection to trip the application error boundary.
- Wedding vendor smoke fixtures are selectively removed from the matching signed-in browser workspace and no longer show the internal cleanup directive or block a real search.
- Local signed-session browser checks confirmed Database, Notes, and Workflows render without the global error boundary. Database's existing `database_record` AFP save path was inspected; its networked write needs an authenticated homeserver session for end-to-end production exercise.
- Verification run: `npm run typecheck`, `npm run build`, focused Node tests for database failure handling, vendor smoke fixture cleanup, workflow editor failures, and workflow wait/resume failures (15 passed).
- Released as `b7cf8c1` (`fix(WED-183): recover workspace core views`). Oracle deployment used the existing remote environment; its scripted post-deploy proof passed at `artifacts/oracle-production-proof-wed183-deploy/postdeploy`.
- A clean production Chromium check passed against `https://omnyid.com/workspace/?auth=signin&source=wedding` (HTTP 200, no page errors). The deployed workspace references `main-BOriMZtG.js`.

## 2026-10-12 - WED-180 inspiration, calendar and timeline polish (Codex)

- WED-178 committed changes were reviewed as a separate public-site/newsletter slice and are retained as safe release ancestors of this branch.
- Removed inspiration storage caveats, redundant image label and item tags; removed Calendar knowledge setup and hides an AI summary when it repeats event context.
- Connected Google Calendar now refreshes automatically every ten minutes while the calendar stays open. Mobile timeline has compact filters, vertical connector nodes and hides secondary row actions.

## 2026-10-12 - WED-179 people, guest, contact, and vendor response usability (Codex)

- Removed internal-facing lifecycle copy from the helper/outreach path and simplified the People label.
- Vendor response cards now use an editable email composer, category-focused labels, a native date-picker follow-up field, and vendor-response AFP message kinds. Future scheduled follow-ups are withheld from the response queue until due.
- Guest drafts collapse behind a show/hide link, can be reopened for editing, summary counters filter visible guest rows, and invitation toggles have stronger visual affordance. Guest-rule saving now explains its effect.
- Contacts no longer expose local-sync implementation copy; role controls provide tap-friendly wedding role suggestions.
- `npm run typecheck` and `npm run build` were attempted in `solid-ui`; both stop at the existing missing `zod` dependency imported by `typescript-sdk/src/workflows.ts`.

## 2026-10-10 - WED-153 vendor rooms: API, card, comparison and operator editor (Claude -> Codex: please merge)

Merge request for Codex:

- Please review and merge these four commits, in order, on `agent/codex/WED-161` (they sit on top of `f3c6784`):
  - `8805290` `chore: apply rustfmt to server files` - formatting only, six `src/server/` files that were left modified in the shared worktree.
  - `92ed73f` `feat(WED-153): expose vendor rooms via API`
  - `1e67eea` `fix(WED-153): keep storage keys server-side`
  - `9d9eddd` `feat(WED-153): show vendor rooms in cards and admin`
- They cannot be cherry-picked onto `main` alone: they build on `3c6dd08` (WED-153 persistence) and on the WED-169 photo helpers. The branch is about 69 commits ahead of `main`, so merge the branch through the normal PR/squash path rather than these four on their own.
- Task WED-153 is set to `review` in `TASKS.yaml`; mark it `done` after the merge. Nothing is deployed.

What changed:

- `WeddingVendorRecord` now carries `rooms` (loaded in `list_wedding_vendors` and `list_active_wedding_vendors_for_user`), and directory search sources carry a `rooms` array. Stored room photos resolve to `/api/public/wedding/vendor/room-photos/{room_id}/{slot}`; bucket and key are `skip_serializing`, clients see a `stored` flag.
- New operator routes in `src/server/user_management_routes/wedding_rooms.rs`: `PUT /admin/wedding/vendors/{vendor_id}/rooms` (upsert by vendor + room name; evidence is merged, not replaced), `DELETE .../rooms/{room_id}` (also removes the stored objects), `PUT .../rooms/{room_id}/photos/{slot}` (raw JPEG/PNG/WebP body, re-encoded to WebP via the WED-169 helpers, stored in Seaweed FS), and the public photo route. The WED-169 helpers `decode_upload`, `encode_webp`, `FULL_EDGE` and `MAX_IMAGE_BYTES` are now `pub(super)`.
- UI: rooms flow `source.rooms` -> ranked candidate -> persisted card `rooms` rows (display strings only, so saved comparisons do not change when room data does). `WeddingVendorChoiceCard` shows a Rooms and pricing block; the comparison table has a Rooms and pricing row; the operator vendor panel has a rooms editor with photo upload.
- Also fixed a pre-existing test compile error: `wedding_vendor_photo_routes.rs` tests used `Cursor` without importing it, so `cargo test --lib` did not compile at `f3c6784`.

Verification (all run on this branch):

- `cargo check` passed; `cargo test --lib wedding_` 127 passed; the gated Postgres round trip (`OMNYID_RUN_DB_SMOKE=1 cargo test --lib local_postgres_room`) passed against local Postgres, covering upsert-by-name, photo replace, foreign-vendor rejection, hidden-vendor photo lookup and delete.
- `npm --prefix solid-ui exec tsc -- --noEmit`, `npm --prefix solid-ui run build`, and `typescript-sdk` `tsc --noEmit` passed; `npm --prefix solid-ui run test:wedding` 1812 passed.
- `npm --prefix solid-ui run test:line-budget` still fails only for the two pre-existing files (`WeddingResponseWorkspaceView.tsx` 1042, `weddingResponseWorkspaceViewState.ts` 1038). No file touched here is over budget.
- Not exercised: the new operator HTTP routes and the Seaweed FS upload/serve path against a running server, and the editor in a browser. They compile and their validation is unit-tested, but run one real upload before relying on them.

Remaining (also in `TASKS.yaml`):

- Redeploy so the rooms API and editor ship (the tables already exist on Oracle). Use a clean release worktree; the shared worktree has many unrelated untracked files.
- No room photos exist yet. Upload through the operator rooms editor once `OMNYID_SEAWEEDFS_*` is configured in the target environment.
- Add the Grange packages PDF and Somersby Canva guide rooms and prices (needs the source documents read).
- `A2UIRenderer` recommendation cards do not show rooms; the comparison table row does.

## 2026-10-09 - WED-177 confirmed vendor selection and directory seed (Codex)

- Vendor comparison ticking is now pending-only. The explicit **Save selected vendors** action writes the existing contact-reference AFP messages, preserving the saved vendor set for unsent follow-up flows instead of writing on every click.
- Added migration `0106` and catalog registration to make `Mackay Family Estate` a production directory record, rather than relying on the unexecuted operator data-load file. A `Mackay` directory query now has a matching active, contactable source.
- Verification: Solid typecheck, `cargo check`, focused vendor-search tests, and diff hygiene passed.
- Release packaging follow-up: add `solid-ui/vendor.html` to the Oracle runtime staging allowlist; otherwise the production Vite build cannot resolve the new entry module.

## 2026-10-09 - WED-169 vendor claim portal and WED-176 mobile polish (Codex)

What changed:

- Added a dedicated Vite entry at `/workspace/vendor.html`, linked from the wedding directory as “Vendor sign in” and “Claim your profile”. The portal keeps the oversized `App.tsx` untouched, captures a claimant’s listing handle and role, then mounts the existing scroll-gated licensed upload panel.
- Extended claimant photo management. `GET /api/wedding/vendor/photos` lists owner images; `DELETE /api/wedding/vendor/photos/{asset_id}` hides a live image immediately and schedules retention expiry. Migration `0105` adds the removal timestamps, and a six-hour server worker removes all three SeaweedFS variants once their fourteen-day grace period ends.
- Phone decision triage now applies and persists the choice locally when account projection saving is temporarily unavailable, retains a Retry action, and does not falsely show the generic unsaved failure. Failed vendor-availability drafts now offer Retry draft.
- Removed internal live-search copy, positioned Search vendors below the field, tightened mobile overview tile hierarchy, and moved calendar knowledge setup into a small component that installs the baseline taxonomy by default.

Verification:

- `npm --prefix solid-ui run typecheck` passed.
- `npm --prefix solid-ui run build` passed (including `vendor.html`).
- `cargo check` passed.
- `node wedding/tests/wedding-website-smoke.mjs` passed.
- Focused vendor-search action-state tests passed.

Remaining:

- The vendor portal links to the existing account sign-in page when unauthenticated; the shared account-auth flow does not yet return a newly authenticated user directly to `/workspace/vendor.html`.
- Not deployed in this change set. Use a clean release worktree: this shared workspace has unrelated modifications in auth and vendor-search backend files.

## 2026-10-09 - WED-167 vendor photo licence consent (Codex)

What changed:

- Added migration `0104`: append-only, versioned photo-licence acceptance receipts; a new `live` owner asset must reference one. Existing early rows are preserved by a `NOT VALID` constraint while new publications are enforced.
- Added authenticated `POST /api/wedding/vendor/photo-licence`, limited to the active claimant. The server selects the current agreement version and SHA-256 itself and records consent copy, time, hashed forwarded IP and bounded user agent. `GET` exposes the current agreement metadata.
- Added the exact agreement as a responsive public page and a reusable phone-ready Solid consent component. Its checkbox stays disabled until the vendor scrolls to the end of the agreement; the button cannot continue without the exact supplied consent text being ticked.

Verification:

- `node wedding/tests/wedding-website-smoke.mjs` passed, including the new public agreement document.
- Focused TypeScript compile for `VendorPhotoLicenceConsent.tsx` passed; formatting and `git diff --check` passed.
- `cargo check`, the focused licence-receipt test, and the migration-catalog test passed after the Cargo queue cleared.

Remaining:

- The owner photo upload/re-encode pipeline is now implemented in the follow-up below. The claim/editor wizard still does not exist: mount `VendorPhotoUploadPanel` there rather than placing it in the already oversized `App.tsx`. The server-side upload path verifies a client-supplied receipt against its vendor, claimant, current version, and hash.

## 2026-10-09 - WED-167 licensed vendor photo publication follow-up (Codex)

What changed:

- Added protected multipart publishing at `POST /api/wedding/vendor/photos`. It accepts only the active claimant's current licence receipt, accepts JPEG/PNG/WebP up to 15 MB, applies source dimension and decoded-memory limits, re-encodes three WebP variants (removing original EXIF/metadata), rolls back stored objects on a database failure, and enforces the 10/30 tier caps.
- Added immutable, public WebP delivery at `GET /api/public/wedding/vendor/photos/{asset_id}/{full|medium|thumb}`. An image is not publicly available until its vendor is active and claimed or verified. Directory responses prefer live owner images over seed images.
- Added `VendorPhotoUploadPanel`, a small responsive Solid component that forces the scroll-gated licence acceptance flow before allowing a photo upload. It is deliberately not mounted in `App.tsx`, which already exceeds the project line budget; the planned vendor wizard is its mount point.

Verification:

- `cargo check -j 1` passed before the final decode-limit hardening edit; the focused WebP and alt-text tests passed from the compiled library test binary. Re-run `cargo check -j 1` after the shared Cargo queue clears to validate the final hardening edit.
- `npm --prefix solid-ui run typecheck` and `node wedding/tests/wedding-website-smoke.mjs` passed.
- `npm --prefix solid-ui run test:line-budget` reports two pre-existing unrelated failures: `WeddingResponseWorkspaceView.tsx` (1042) and `weddingResponseWorkspaceViewState.ts` (1038). All WED-167 files are below 1000 lines.
- Oracle deployment used an isolated clean worktree pinned to `5bc8ad8`, so unrelated shared-worktree changes were excluded. The Linux Docker release build passed, services restarted, and live checks returned `200` for both `/api/wedding/vendor/photo-licence` (including the pinned version/hash) and `/wedding/vendor-image-licence.html`. The deploy script's longer detached backup/restore audit remains in progress after the release.

## 2026-10-09 - WED-168 AgentCard and browser key-custody foundation (Codex)

What changed:

- Added an optional `encryption_public_key_hex` to AgentCard. It is included in the signature only when present, preserving verification of legacy cards while detecting a substituted or removed encryption key.
- Added a rate-limited authenticated AgentCard publish endpoint. It accepts only a self-signed card for the deterministic managed vendor Agent ID, requires both enquiry capabilities and a 32-byte X25519 public key, and never accepts a private key. Public card discovery is served from the standard well-known route only after the listing is claimed or verified.
- Added browser-side key custody in `solid-ui/src/lib/vendorAgentKeys.ts`: temporary extractable generation is used only to create the encrypted recovery backup, then private Ed25519/X25519 keys are re-imported non-extractable and stored in IndexedDB.
- Directory cards advertise secure enquiry only once a public AgentCard URL is present; otherwise they link to the vendor website rather than promising an unavailable conversation.

Verification:

- Focused TypeScript compile of `vendorAgentKeys.ts` passed.
- Wedding static-site smoke test passed.
- Rust formatting and `git diff --check` passed. Full Rust test commands are still draining from a shared Cargo target-directory queue; do not treat them as completed until their final output is captured.

Release status:

- Not deployed. The claim verification transition and ciphertext-only enquiry relay remain incomplete, so direct vendor enquiries must remain gated.

This file is for agent commentary, session notes, and coordination details.
It is not project truth. Keep durable facts in `.agent/PROJECT_STATE.md`, task
ownership in `.agent/TASKS.yaml`, and architecture decisions in
`.agent/DECISIONS.md`.

## 2026-10-09 - WED-161 vendor claim and enquiry schema foundation (Codex)

What changed:

- Added migrations `0101`–`0103` and registered them in the migration catalogue.
- The schema separates owner-managed public listing data from sourced seed data, records
  claim status/history and one-active-claim enforcement, and makes the proposed A2A
  relay ciphertext-only by schema (no plaintext enquiry fields exist).
- Updated WED-161 to `in_progress` on `agent/codex/WED-161`; WED-153 is now present
  in the branch ancestry, so its former dependency block is resolved.

Verification:

- `git diff --check` passed.
- `cargo check` passed.
- The focused migration-catalog test is queued behind an unrelated running full Cargo
  test process holding the shared target-directory lock.
- Oracle read-only preflight passed with the restore drill deliberately skipped:
  `artifacts/oracle-production-proof-wed161-preflight`.

Release status:

- Not deployed. Production has no Vendor Login, public vendor directory, claim wizard,
  or encrypted enquiry routes yet. Do not advertise or release the schema alone.

Next action:

- Finish and review WED-161, then implement WED-162 through WED-170 before any
  customer-facing Vendor Login or A2A enquiry launch.

## 2026-10-09 - WED-164/165 public directory and vendor entry started (Codex)

What changed:

- Added `src/server/wedding_vendor_claim_routes.rs`, kept under 1,000 lines, and
  merged its routes into the homeserver. It exposes active-only public listing
  responses without vendor email or phone fields and creates rate-limited,
  transactional claim-intake records for authenticated vendors.
- Added `wedding/vendors.html` plus dedicated small CSS and JS assets. The page is
  one-column at phone width, uses 44 px actions, and builds cards with DOM APIs so
  directory text is not injected as HTML.
- Added a separate `Vendor login` link to every wedding header at runtime. It routes
  to `/workspace/?auth=signin&source=vendor_claim`, rather than the couple flow.

Verification:

- `node wedding/tests/wedding-website-smoke.mjs` passed.
- Rust formatting and `git diff --check` passed for this slice.
- `cargo check` and the focused route tests are waiting behind a concurrently running
  full Cargo test job that holds the shared target lock; do not interpret that as a
  completed Rust verification.

Release status:

- Not deployed. The intake creates a pending claim but the vendor role landing,
  signed AgentCard publishing, and encrypted A2A envelopes are not yet present.

## 2026-10-09 - UX-MPR-01 mobile UI principles pass on wedding phone views (Claude)

For Codex - merge notes:

- Branch `agent/claude/UX-MPR-01`, cut from `agent/codex/AGM-00` at `e99e846`. It only touches
  files listed in the UX-MPR-01 task. Merge or cherry-pick that single commit; there is no overlap
  with the mesh Rust/SDK files, `.agent` task ids other than the new UX-MPR-01 entry, or staging files.
- Likely conflict spots if you changed these in parallel: `MobileFocusDeck.tsx` (bottom bar rewritten),
  `WeddingMobileFocusHome.tsx` (header title, Home button, save-failure notices),
  `WeddingBudgetTrackerCard.tsx` (scenario block rewritten, panel classes), and
  `AgentPersonaFAB.tsx` (two `phone:` position classes). Keep both sides' behaviour; do not revert the
  `phone:` classes.
- `WeddingResponseWorkspaceView.tsx` is still 1,042 lines (existing line-budget failure); this change
  kept it flat. Do not let it grow while merging.

What changed (source: `Documents/UI/mobile UI design principles.md`):

- Budget: Safe/Balanced/Stretch is a single radio list; Balanced is marked Recommended, the chosen
  row is solid-bordered, others are muted, and detail copy shows only on the chosen row. Removed the
  repeated "left in this version" and "still has room" filler; with nothing selected it reads "No
  choices counted yet". The outer budget card is flat on phones.
- Vendor search: removed the duplicated "‹ Home" (the header now shows the section title and the body
  keeps one SVG back button); flattened nested cards on phones; inputs and buttons are 44px.
- Deck: bottom bar is Later (secondary) plus Approve (primary); Prev/Next became icon buttons above it.
- Errors: new `friendlyErrorText` maps protocol/network text such as "Invalid AFP message" to plain
  language. Used in vendor search, mobile triage saves, outreach drafts and guest saves.
- Floating agent button is lifted above the phone action bar (`phone:` variant) and focus-home scroll
  areas have bottom padding so the last control can scroll clear of it.

Tests performed: `npx tsc --noEmit`, `npm run test:wedding` (1,804 passing), focused
visible-error and budget tests, `npm run build` (pass). `npm run test:line-budget` still fails only on
the two pre-existing files above. No device or browser check was run; not deployed.

Not done: other wedding views (guest list, timeline, tasks) were not audited against the principles.

## 2026-10-09 - UX-MPR-01 follow-up: guest list, timeline, tasks (Claude)

For Codex - merge notes:

- Same branch `agent/claude/UX-MPR-01`, second commit. Only
  `WeddingGuestOperationsCard.tsx`, `WeddingTimelinePanel.tsx` and `WeddingTaskStageView.tsx` changed.
  If you edited these, keep both sides and do not revert the `phone:` classes.
- Guests: add-guest toggles are switch rows, RSVP quick actions are a three-way radio control,
  rows are divider-separated on phones, primary/secondary buttons and inputs are 44px.
- Timeline: one solid primary button; removed the subtitle and empty-state text that repeated button
  labels; the date label that duplicated "View date" is plain text; undated items are stacked rows;
  Gantt rows are 44px tall.
- Tasks: 44px circular completion control (role checkbox, same data-magic ids), segmented To do /
  Done control, stage groups lose their tinted box on phones, the expanded panel keeps only the due
  date, and the Home/Budget/Timeline/Documents shortcut pills are hidden on phones (the phone menu and
  back button cover them).

Tests performed: `npx tsc --noEmit`, `npm run test:wedding` (1,804 passing), `npm run build` (pass).
`npm run test:line-budget` fails only on the same two pre-existing files. No device check; not deployed.

Not done: `WeddingBoundaryManagementCard.tsx` (family boundaries, shown with Guests) was not changed.

## 2026-10-08 - Oracle staging stack, www redirect, strict production policy (Claude)

What changed:

- Added the isolated `omnyid-staging` compose project (`docker-compose.oracle.staging.yml`,
  `scripts/staging-up.sh`) on the Oracle host: own Postgres volume, fresh keys, seed user, resource
  caps, no mail provider or paid API keys. It serves `staging.omnyid.com` through the existing Caddy.
- Caddy now redirects `www.omnyid.com` to the apex (it returned 525) and restricts the staging
  origin to Cloudflare IP ranges. Basic auth gates only the staging dashboard shell because the app's
  Bearer tokens share the `Authorization` header.
- Production now runs with `OMNYID_ENV=production` and a new `omnyid_delegation_master_key_hex`
  secret file. The policy was rehearsed in a one-off container with production's real inputs first;
  the previous image is tagged `omnyid-homeserver:prev-20261008` and the prior compose file is
  `docker-compose.oracle.minimal.yml.pre-strict` on the server.
- Oracle housekeeping: build cache and stale runtimes pruned, `OMNYID_BACKUP_RETAIN=3` (days).

Open items:

- Cloudflare Zero Trust is enabled (team `omnyid`, `omnyid.cloudflareaccess.com`) with no apps,
  identity providers or clients yet, so nothing needs migrating. The staging API is not behind
  Cloudflare Access until an Access app for `staging.omnyid.com` is created; the API token is
  read-only for Access (`auth.forbidden` on create), and the origin lock is already in place.
- The Gmail sync reports `auth_invalid` (permanent); the refresh token needs re-authorising.
- The 89k ingested emails in `public.messages` and heavy bloat in the owner's message table and
  `daemon_heartbeats` are unresolved; nothing was deleted or vacuumed.
- Nothing was pushed; `origin/main` is an unrelated history.

## 2026-10-08 - Mesh/staging ownership coordination

User requests local-only release/tag and Oracle runtime verification; no push/PR/origin-main changes.
Mesh implementation continues in sibling `OmnyID-agm`, now on `agent/codex/AGM-06`.
Local checkpoints: storage `6969576`, policy `4e40df4`, lifecycle `206ed81`, archive/derived state
`a86db76`. None is a release candidate. AGM-05 has local PostgreSQL contracts, 2,327 library tests
and binary compile evidence. AGM-06 extraction is in progress; later integration gates remain open.
That session owns mesh Rust/SDK modules and its coordination records. The user's other session
owns the active primary-worktree Caddy/Compose/.gitignore and staging setup changes. Mesh work
will consume their committed staging implementation without overwriting it or restarting services.

## 2026-10-08 - AGM-00 agent mesh implementation and production closure plan (Codex)

What changed:

- Added `Documents/design/agent/Agent mesh integration production task plan.md`, using the proposed
  Agent Mesh Integration Spec as direction while separating verified repository facts from claims
  that must be re-audited on each task branch.
- Defined dependency-ordered AGM-00 through AGM-14 work covering repository/task reconciliation,
  tenant agent storage, daemon policy, suggestion cutover, append-only retention, event pipeline,
  synthesizer/projection/heartbeats, mobile controls, integrated validation, staging, rollback, and
  Oracle production promotion.
- Recommended `gpt-6-astra` at medium reasoning as the normal executor, with high reasoning limited
  to bounded storage, security, migration, or failed-release reviews.
- Made safe worktree reconciliation and closure of the seven existing `in_progress` tasks explicit
  release gates. Secrets and generated artifacts must be relocated/ignored rather than blindly
  committed. PARA receives compatibility smoke coverage but is not a feature-priority dependency.

Validation performed:

- Re-read the 502-line direction spec and inspected the referenced current symbols, schemas,
  migration tail, large-file line counts, task ledger, Git ancestry/status, GitHub CI/deployment
  visibility, Oracle rollout runbook, deploy script, and recent production handoff evidence.
- Confirmed the plan contains the model directive, baseline worktree/task counts, secret-safe
  reconciliation, staging, rollback, exact-SHA production proof, and PARA compatibility gates.
- `git diff --check -- .agent/TASKS.yaml` completed without whitespace errors (Git reported only the
  existing Windows line-ending conversion warning).

Not changed:

- No agent-mesh implementation, migration, environment, staging, or production deployment was
  performed; this task only creates the implementation/release plan.
- None of the 448 pre-existing untracked entries was staged, edited, removed, or committed. The
  referenced direction spec remains user-owned and untracked.

Recommended next action:

- Claim AGM-01 only after AGM-00's live repository/worktree reconciliation steps are executed and
  the release base is agreed. Do not start storage migration work from the current dirty primary
  worktree.

## 2026-10-08 - WED-175 wedding home mobile gestures and schedule chart (Codex)

What changed:

- Mobile vendor buttons no longer compete with the deck pointer capture. Swipe movement locks to
  one axis, tracks the finger with directional tilt, animates out on a completed gesture, and does
  not accidentally commit on pointer cancellation.
- Successfully saved mobile vendor/decision triage now has a workspace-scoped local mirror, so a
  cleared recommendation stays cleared when returning to Wedding Home before the AFP refresh lands.
- Wedding overview action tiles are substantially larger touch targets on mobile.
- Timeline omits demo/seed review tasks. Its Gantt range runs from saved planning start to wedding
  date plus one day, includes the generated project lead-time plan, and preserves explicit task
  dates as editable overrides. Major axis ticks use that full window.

Tests performed:

- `npm run typecheck` — pass.
- `npm run build` — pass (Vite emitted the existing `min-*`/`max-*` Tailwind configuration warning).
- `npm run test:wedding` — 1,804 passing.

Next action:

- Deploy through the normal reviewed release path when production rollout is requested.

## 2026-10-08 - Oracle release of WED-153 and WED-174 (Codex)

What changed:

- Committed the pending WED-153 vendor enrichment/rooms work as `3c6dd08`, on top of the
  WED-174 persistence release `885636a`.
- Deployed the current branch to Oracle with the existing secret-file-backed remote environment.
  The staged `0100_wedding_vendor_rooms.sql` hash matches the copy on Oracle.

Verification evidence:

- `cargo test wedding_vendor --lib --quiet` — 107 passed.
- `cargo check` — passed.
- Oracle deployment rebuilt the homeserver and UI, recreated homeserver/Caddy/backup, and the
  workspace smoke check returned HTTP 200 with the expected CSP.
- The remote Oracle production proof completed with `STATUS=pass`: homeserver and backup service
  running, backup verification passed, runtime-script integrity passed, and the restore drill
  passed.

Operational follow-up:

- The existing Oracle `.env.oracle` does not set `OMNYID_ENV=production`, and the compose file
  does not pass that variable to the homeserver. The release retained the known working environment;
  enabling strict production startup policy needs a separate, reviewed secret/config hardening
  change. The attempted in-place preflight correction was restored because host-side validation
  cannot read the container-only `/run/secrets` paths and exposed additional missing policy inputs.
- Oracle proof reports root and `/var` usage at 91%; treat storage remediation as urgent before
  another large runtime upload or restore drill.

## 2026-10-08 - WED-174 wedding guest and calendar persistence (Codex)

What changed:

- The guest card now immediately includes a successfully saved local guest in its total, attending,
  and pending figures until the refreshed AFP projection arrives, without double counting it after
  the server-backed row appears.
- Wedding guest and family-boundary projections now translate their readable logical identifiers to
  the ULID-format message and thread IDs required by the authenticated AFP store, while preserving
  the logical thread ID in metadata. This unblocks saving boundary rules and guest records.
- Calendar Knowledge Setup reads the authenticated user's stored supertag definitions on mount, so
  a completed default install remains marked Installed after returning to Calendar. The endpoint now
  skips already stored defaults rather than writing duplicate taxonomy definitions.

Tests performed:

- Focused TypeScript tests: 38 passing (guest display, guest/boundary projection, and boundary state).
- `npm run typecheck` and `npm run build` in `solid-ui` passed.
- `cargo check` passed.

Next action:

- Changes are local on `agent/codex/WED-174`; production deployment was not requested in this turn.

## 2026-10-08 - WED-173 wedding planner correctness fixes (Codex)

What changed:

- Outreach drafting now draws date, location and preferences from the persisted wedding workspace
  context and falls back to the committed budget target. It no longer requires an intake-profile
  thread message to use existing wedding basics.
- Directory search prioritises the exact user query before a broad category fallback, so a
  `mackay` search can return Mackay Family Estate before generic venues. Generic directory records
  such as VenueGuide.au and Easy Weddings are excluded server-side; old persisted comparison cards
  filter those aggregate identities on read as well.
- The People picker inside an expanded task in the decision-focus card includes an inline Add a new
  contact form. A saved person is immediately selected in the assignee field.
- The Wedding Timeline now has a Show Gantt chart control. Its all-task horizontal chart carries a
  labelled major date axis and preserves calendar navigation from task names and bars.

Tests performed:

- Focused TypeScript wedding tests: 11 pass (outreach context, persisted directory exclusion, and
  Gantt date axis).
- `npm run typecheck` and `npm run build` in `solid-ui` pass.
- Two focused Rust directory tests pass (exact-query ordering and generic-directory exclusion).
- `cargo fmt --check` is still blocked by unrelated pre-existing formatting differences in shared
  Rust files; no formatter was run over those files.

Next action:

- No deployment was requested. Preserve WED-153's uncommitted database/migration files; WED-161
  remains blocked until that owner commits them.

## 2026-10-08 - WED-160 Sydney-only wedding home copy (Codex)

What changed:

- Updated `wedding/index.html` so the planning strip lists Sydney only.
- Changed the Byron Bay and Melbourne testimonial captions to "Sydney planning scenario".
- Added exact-copy assertions to `wedding/tests/wedding-website-smoke.mjs`.

Why:

- Implements the accepted Claim Your Profile spec §2 / decision D6 without changing the
  Hunter Valley scenario or any other page copy.

Tests performed:

- `node wedding/tests/wedding-website-smoke.mjs` — pass.
- `cd solid-ui && npm run typecheck` — pass.
- `cd solid-ui && npm run test:wedding:ci` — blocked at its line-budget phase by
  pre-existing violations in `src/db.rs` (17,990 / 17,986),
  `solid-ui/src/components/WeddingResponseWorkspaceView.tsx` (1,042 / 999), and
  `solid-ui/src/lib/weddingResponseWorkspaceViewState.ts` (1,002 / 999). The scoped
  website smoke test passes.

Next action:

- WED-161 remains blocked until WED-153 commits its `src/db.rs`, migration-catalog and
  migration-0100 changes. Do not stage or alter those files.

## 2026-10-08 - WED-160..172 vendor "Claim Your Profile" handed to Codex (Claude)

What changed:

- Wrote the spec and the task/handoff doc for the wedding vendor claim directory, AFP
  enquiries, vendor dashboard and tiers. No code changed.
- Registered WED-160..172 in `.agent/TASKS.yaml`, owner `codex`.
- Recorded the architecture in `.agent/DECISIONS.md` ("2026-10-08: Wedding Vendor Claim
  Directory").

Why:

- The user wants unclaimed seeded vendor listings to become vendor-owned, with E2EE AFP
  enquiries. Codex implements and Claude reviews.

Files changed:

- `Documents/design/wedding planner/wedding-vendor-claim-your-profile-spec.md`
- `Documents/design/wedding planner/wedding-vendor-claim-your-profile-tasks.md`
- `.agent/TASKS.yaml`, `.agent/DECISIONS.md`, `.agent/HANDOFF.md`

Tests performed:

- None; documentation only.
- New `TASKS.yaml` entries were checked by hand for YAML scalar pitfalls. No YAML parser
  is installed locally.

User decisions (2026-10-08):

- Couples enquire from a free account.
- Byron Bay and Melbourne testimonial captions become "Sydney planning scenario".
- Oracle has enough disk for this work.
- Pricing: Starter free, Pro AUD 79/month or 790/year, Founding AUD 39/month or 390/year
  locked for life (first 100 vendors or until 2027-03-31). Claude proposed these prices
  for 1,000 couples a month.

Unresolved:

- Stripe price IDs must be created by the user in the Stripe dashboard.
- Competitor price comparison in spec §7.4 is a market impression and should be
  checked before launch.

Coordination (important):

- `agent/codex/WED-150` is 44 commits ahead of `main` and unmerged. Branch
  `agent/codex/WED-160` from it.
- WED-153 (claude, in_progress) has uncommitted `src/db.rs`,
  `src/db/migration_catalog.rs`, `src/db/wedding_vendor_evidence.rs` and an untracked
  migration 0100. WED-161 is `blocked` until those are committed. Do not touch them.

Next action:

- Codex: read section 1 of the tasks doc, then start WED-160, which has no dependencies.

## 2026-10-06 - WED-150 wedding vendor production-closure implementation

What changed:

- Reworked wedding action styling to outlined, readable 44px controls and added a real-browser
  contrast/target-size plus axe gate at 360×740 and 1280×800. The fixture covers the full comparison,
  persisted draft, explicit send, receipt, inbound reply/quote, durable defer/reload/resolve,
  category replacement from both entry points, blocked shortfall/retry, and second-context bounds.
- Split every reported oversized wedding/Rust module without raising caps. Added durable AFP triage,
  honest save failure/retry, comparison reopen, a database-backed shortlist run claim, semantic vendor
  action intents in AFP, and an in-deck mobile comparison/draft/send/receipt flow. Saved outreach drafts
  and receipts now reconstruct from AFP after reload.
- Added attribute-catalog v2 keys, validation (including 1–5 operator scores and coordinates), grouped
  admin editing, provenance-aware coverage reporting, ranking-v2 pure helpers, deterministic
  interleaving/MMR, Q/S/Value and seasonal/location models, and a fail-closed NDCG gate evaluator.
  Ranking v2 remains default-off; cards show honest placeholders until the real-catalog gate passes.
- Added the guarded operational worksheets for monthly catalog benchmarks, hosted canary/provider
  drills, 14-day SLO evidence, manual WCAG acceptance, moderated usability, staged rollout, and the
  release proof packet. CI installs Playwright Chromium and runs the wedding browser gate.

Tests performed from the working tree:

- `npm run typecheck` (pass)
- `npm run test:line-budget` (2 passing; no cap change)
- `npm run test:wedding` (1,791 passing)
- `npm run test:decisionos-navigation` (7 passing)
- `npm run test:wedding:e2e` (4 passing across both viewports)
- `npm run build` (pass)
- `cd typescript-sdk && npx tsc --noEmit` (pass)
- `cargo check` (pass after the Rust module split)
- `cargo test --quiet` (pass: 2,322 library tests, 3 taxonomy tests, 12 API-flow tests,
  and 1 doctest; 11 doctests ignored)
- `git diff --check` (pass; line-ending warnings only)

Open production gates:

- C6/C13: no real Oracle corpus or two independent judges were supplied. The required 40-case NDCG
  report, calibration review, and canary-only activation therefore remain open; no synthetic fixture
  was represented as human relevance evidence.
- C8: bulk catalog geocoding/enrichment needs explicit approval for each write batch. Coverage has not
  been asserted against Oracle.
- C15: no deployment was performed. It needs fresh authorisation, ≥25% Oracle disk headroom, guarded
  ancestry containing `a95514e`/`7e1880d`, controlled-mailbox hosted lineage, replay, and provider
  drills. The last recorded proof had only 18% free disk.
- C16/C17: security-owner disposition of residual JS advisories, authorised hosted scans and
  rollback/restore drills, 14 consecutive SLO days, human WCAG/usability sessions, rollout decisions,
  and named approvals cannot be agent-closed.
- CI has been updated but this uncommitted working tree has no release-candidate GitHub Check; local
  Playwright success is not described as CI success.

Assumptions and next action:

- The supplied closure spec is authoritative, AFP remains append-only, external send stays
  user-triggered, ranking v1 remains active, and the existing 1 GiB free / 2 GiB paid account-storage
  policy is unchanged. Do not deploy this working tree merely to collect evidence.
- Review and commit the agent-closable slice, obtain approval for a sanitised read-only Oracle catalog
  export and the first enrichment batch, arrange two human judges, then run C6/C13. Only after those
  gates and disk remediation should an authorised guarded canary begin C15.

## 2026-10-05 - UX-MFH-01 decision confirmation and home return

What changed:

- A downward mobile-deck swipe now opens an explicit confirmation rather than
  routing straight into a vendor response workflow. Confirmation appends the
  existing `decision_triage` projection and removes the resolved decision so
  the next unresolved card becomes visible.
- The response/deck and compact quote card now expose an explicit **Open agent
  draft** entry point for the existing Tiptap reply editor. Opening it is
  review-only; the existing send confirmation remains the only send path.
- Deferring remains on Wedding Home, and every non-home wedding workspace page
  now has a **Wedding Home** return control.

Tests performed:

- `solid-ui: npm run typecheck` (pass)
- focused swipe/mobile/quote-reply suite (38 passing)
- `solid-ui: npm run build` (pass; existing Browserslist freshness and
  Tailwind min/max screen-variant warnings)
- `solid-ui: npm run test:line-budget` (baseline failure: existing oversized
  Rust and wedding files; no changed file is a new violation)

Deployment:

- Committed as `af9e93b fix(UX-MFH-01): confirm wedding deck decisions`.
- The normal all-services Oracle deployment was stopped before container
  replacement when the root disk filled while exporting a rebuilt homeserver
  image. Docker build cache was safely pruned (98% to 87% root use), then the
  completed frontend image was deployed directly to `omnyid-ui-1`. Caddy and
  homeserver remained running; the local proxy returned the expected HTTPS 308.
- No database or Docker volume was removed. The host needs a capacity/retention
  remediation before a future full all-services rebuild.

## 2026-10-06 - SEC-001 Caddy-only Oracle rollout

What changed:

- Deployed Caddyfile from clean detached commit `7e1880d` only. No application
  image was rebuilt and no application service was recreated.
- Validated the candidate inside the running Caddy image, then recreated only
  the Caddy service after detecting its file bind mount held an old inode.

Machine-derived verification:

- External HTTPS: `/privacy.html` and `/.well-known/security.txt` returned
  200; the known internal Markdown and TypeScript paths at both `/` and
  `/docs/` returned 404.
- Remote loopback checks returned `local_public=200` and `local_blocked=404`.
- Postgres, homeserver, backup, Electric, and SeaweedFS remained running;
  Caddy is running with the mounted guard configuration. Root disk remained
  70% used with 14 GB available.

Operational note:

- A normal deployment from a working tree without `7e1880d` would overwrite
  the Caddyfile and remove this guard. Merge/cherry-pick this branch before
  such a deployment.

## 2026-10-05 - UX-MFH-01 Master Agent result visibility repair

What changed:

- Direct Master Agent commands now remain on the Search surface after the
  response arrives. A `suggested_view` can still seed a workflow handoff, but
  no longer clears the just-finished command result before it renders.
- Rich previews continue to decrypt only in browser memory. If the device
  cannot unlock one, the renderer now shows the response's safe summary and an
  explicit local unlock notice instead of a blank/locked-only result area.
- Added focused unit coverage for decrypted and locked-preview selection.

Why:

- A working BYOK provider could still appear to return nothing because the UI
  immediately followed a model navigation suggestion and cleared search state.

Tests performed:

- `solid-ui: npm run typecheck` (pass)
- focused command preview tests (19 passing)
- `solid-ui: npm run build` (pass; pre-existing Browserslist freshness and
  Tailwind min/max screen-variant warnings)
- `git diff --check` (pass)

Deployment:

- Committed as `4445f38 fix(UX-MFH-01): keep master agent results visible`.
- Oracle deployment completed with the existing production environment; UI,
  homeserver, backup, and Caddy were recreated and the workspace HTTP smoke
  returned `200`.

Remaining verification:

- An authenticated browser smoke with the user's BYOK account is still needed
  to exercise a real provider response end-to-end. The UI repair is deployed.

## 2026-10-05 - DEV-001

What changed:

- Added `AGENTS.md` as the shared Claude/Codex session protocol.
- Established `.agent/` as the canonical coordination directory.
- Added compatibility pointers at root for `PROJECT_STATE.md`, `TASKS.yaml`,
  `DECISIONS.md`, and `HANDOFF.md`.
- Added follow-up tasks for machine-readable ops state, runtime version/health
  endpoints, project MCP tooling, and an AFP development event ledger.

Why:

- Every agent session needs the same startup context, file ownership map, and
  finish checklist.
- Build/test/deploy/production health must come from machine authorities rather
  than hand-written status claims.
- Claude and Codex should coordinate through artifacts and observable events,
  not conversation history.

Files changed:

- `AGENTS.md`
- `.agent/PROJECT_STATE.md`
- `.agent/TASKS.yaml`
- `.agent/DECISIONS.md`
- `.agent/HANDOFF.md`
- root compatibility files
- `README.md`
- `CLAUDE.md`
- `Documents/README.md`

Tests performed:

- Inspected `git status --short --branch`.
- Inspected recent git log.
- Confirmed existing backend health routes include `/healthz` and `/readyz`.
- Performed a lightweight structure check for `TASKS.yaml`.

Unresolved problems:

- CI/deployment status is not yet queried through a shared project tool.
- `/api/version` and richer `/api/health` are planned but not implemented in
  this pass.
- No PR was created from this local workspace.

Assumptions:

- The user's new `.agent/` convention supersedes the earlier root-file-only
  layout.
- Documentation/process changes do not require a full Rust/UI build.
- Commit creation should wait for an explicit task-branch workflow or user
  request because the current worktree has many unrelated changes.

Recommended next action:

- Move implementation work off `main` onto task branches, then implement
  `DEV-002` so agents can query CI and deployment state directly.

## 2026-10-05 - WED-145

What changed:

- Committed the tracked implementation and coordination changes as
  `42304ae feat(WED-145): begin directory-first wedding vendor MVP`.
- Created `agent/codex/WED-145` and added the WED-145 task to the canonical task ledger.
- Added the pure `weddingVendorShortlistPolicyState` contract and table-driven tests.
  It chooses a single category, fingerprints material intake, filters/uniquely
  selects exactly three suitable ranked candidates, reports shortfall/blocked
  outcomes, and makes media truth explicit.
- Added optional `source_policy` support to the existing vendor-search API,
  executor adapter, and Rust route. A `directory_only` request returns before
  HTTP provider client construction, metering, or online fallbacks.
- Added focused Rust and TypeScript policy/adapter tests.

Why:

- The MVP requires a directory-only first pass and policy-backed exact-three
  selection without replacing the existing ranking/evidence system.

Tests performed:

- `solid-ui: npm run typecheck` (pass)
- focused shortlist/executor/artifact tests (pass)
- `cargo check` (pass)
- `cargo test wedding_vendor_search_routes::source_policy --lib` (pass)
- `solid-ui: npm run test:line-budget` (baseline failure: pre-existing legacy
  monoliths and seven pre-existing wedding files are over their caps)

Unresolved problems:

- M3 still needs the policy wired into the active comparison renderer and the
  existing photo-admin lifecycle.
- M4–M6 (onboarding coordinator, persisted-before-visible outreach drafts, and
  quote-to-DecisionOS projection) remain unimplemented.
- The worktree contains 48 modified, 11 deleted, and 414 untracked top-level
  paths (over 12,000 untracked files) before the commit. The tracked work and
  the required `.agent/` protocol files are in `42304ae`; the remaining
  untracked paths are editor/session artifacts, transient outputs, or unrelated
  documentation and were deliberately not staged blindly.
- No deploy has been attempted: the end-to-end MVP and required production
  verification are not complete.

Recommended next action:

- Extract the current ResponseQueue vendor orchestration into a focused owner,
  call `directory_only`, apply this policy, then make one `online_capable`
  retry only for a suitable-candidate shortfall.

## 2026-10-05 - WED-145 continuation

What changed:

- Wired strict exactly-three comparison rendering and truthful media states
  into the existing live vendor-search path.
- Added an instrumented directory-first executor: it calls `directory_only`,
  ranks the result, and makes at most one online-capable retry only for a
  suitable-candidate shortfall. When paid providers are unavailable it still
  makes the directory request and reports the shortfall without an online call.
- Added a fingerprinted onboarding coordinator which selects one category and
  launches the existing search while preserving the home surface. It records
  a browser-storage run claim to avoid reload/second-tab duplicates.
- Made vendor outreach durable-first: the generated AFP draft is appended
  before the composer moves to its sendable state.
- Wired unresolved quote flows to the existing AFP save/refresh path using a
  stable quote decision idempotency key and persisted-message dedupe.

Tests performed:

- `solid-ui: npm run typecheck` (pass)
- focused MVP policy/search/outreach/quote suite: 36 passing tests
- `cargo check` (pass)
- `solid-ui: npm run test:line-budget` (baseline failure: the three existing
  Rust monoliths and seven pre-existing wedding files remain over cap)
- `git diff --check` (pass; CRLF conversion warnings only)

Unresolved problems:

- M3 photo-admin add/replace/provenance lifecycle has not yet been proven in
  this pass; the comparison renderer has the truthful fallback only.
- M6 still needs durable resolution/deferral successor wiring so a resolved
  quote deterministically leaves DecisionOS.
- Full build, complete wedding suite, full Rust suite, CI/deployment checks,
  and Oracle production smoke remain outstanding. The Vite build began but the
  local command runner cut it off before an exit status; do not treat it as a
  passing build or deploy this checkpoint.
- Existing line-budget failures remain baseline defects; neither cap was raised.

Recommended next action:

- Complete the existing photo-admin lifecycle and quote resolution successor,
  then run M7's full verification matrix before an Oracle deployment.

## 2026-10-05 - WED-145 quote closure continuation

What changed:

- A reply which reaches the existing sent/log flow now projects an append-only
  `decision_result` successor for the same stable quote decision id.
- The dispatcher deduplicates both `decision_request` and `decision_result`
  records using their persisted idempotency keys.

Tests performed:

- focused quote DecisionOS projector/dispatcher tests: 5 passing tests.

Unresolved problems:

- Photo provenance fields (source URL, retrieval time, and licence/use data)
  still need an additive record/migration path; current stable photo slots only
  retain URL, alt text, and source label.
- Full M7 verification and deployment remain outstanding.

## 2026-10-05 - WED-145 photo provenance foundation

What changed:

- Added migration `0095_wedding_vendor_photo_provenance.sql`. It extends the
  existing stable `(vendor_id, slot)` photo rows with nullable `source_url`,
  `retrieved_at`, and JSONB `licence_metadata`; it does not create a second
  photo table or rewrite current rows.

Tests performed:

- `git diff --check` (pass).

Next action:

- Thread these optional fields through the existing admin DTO, DB read/write
  path, and form, then add migration-backed API tests before deployment.

## 2026-10-05 - WED-145 photo provenance DTO continuation

What changed:

- Extended the existing photo request, database records/upserts, list queries,
  and write transaction for optional source URL, retrieval time, and licence
  metadata.
- Existing operator form writes preserve a vendor's already-entered source
  label/URL/check date for each photo without changing the stable vendor/slot
  identity or adding a media store.

Tests performed:

- `solid-ui: npm run typecheck` (pass)
- `solid-ui: wedding-admin-vendor-form-state.test.ts` (4 passing tests)

## 2026-10-05 - WED-145 Oracle vendor directory compatibility

What changed:

- Registered the existing `0095_wedding_vendor_photo_provenance` migration in
  the embedded startup catalog, so source URL, retrieval time, and licence
  metadata reach Oracle on the next application deployment.
- Added migration `0096_wedding_vendor_directory_export.sql`, exposing the
  downloaded Oracle CSV's exact eight-column shape. `photo_count` is computed
  from stable photo slots rather than stored as a stale duplicate.
- Updated photo-provenance Rust fixtures that the full test compilation found
  incomplete.
- Extracted wedding-vendor record DTOs into `src/db/wedding_vendor_directory.rs`
  so the existing database monolith is smaller than it was before this work.
- Preserved the existing backend-validated Google Places photo proxy as a
  verified provider photo in the exactly-three card policy; it is not a
  placeholder merely because it is a same-origin relative URL.

Evidence:

- Read-only Oracle query: production currently has 130 vendor rows and the
  CSV-compatible normalized projection hashes identically to
  `Documents/design/wedding planner/wedding-vendor-database-oracle.csv`
  (`f3cd92e4e975f3952d69aa924c97a345`).
# 2026-10-05 - SEC-001 static docs exposure remediation

What changed:

- Added a Caddy rejection handler for Markdown, TypeScript, SQL, review, and
  CSV files before either `/` or `/docs/` static resolution.
- Versioned the existing Oracle legal-page assets, public security contact,
  Genesis logo script, OmnyID logo, wedding images, and the historical
  production-applied venue-photo seed migration.

Validation:

- `caddy validate` passed in the pinned Caddy 2 container with placeholder
  domain and ACME-email values.
- An isolated Caddy route check returned 200 for `/privacy.html` and
  `/.well-known/security.txt`, and 404 for the previously exposed root and
  `/docs/` Markdown paths plus both TypeScript paths.
- The `0092b` SQL file has one terminating venue-photo `INSERT` statement and
  no migration-catalog entry, so it remains recoverable source history without
  becoming a new automatic migration.
- The untracked Python SDK capability/prototype paths remain deliberately
  unstaged: production uses `runtime-templates/python-runner-chat`; the new
  SDK modules are neither registered nor tested as a shipped runner feature.

Deployment note:

- Do not rely on the normal archive deploy to remove old `docs/` files: it
  intentionally preserves the live bind-mounted directory. Remove the named
  internal files on Oracle after this Caddy change is deployed.

---

- Snapshot validation: 130 unique vendor IDs; all statuses valid; no missing
  required values; `photo_count` values are non-negative (36 zero, 94 three).
- Oracle is currently at migrations through `0094`; `0095` and `0096` are
  pending and the export view is absent until deployment. This is expected and
  has not been papered over in project state.
- `cargo check` (pass)
- focused migration-catalog test (pass)
- focused Rust vendor write and source-mapping tests (3 passing tests)
- `solid-ui: npm run typecheck` (pass)
- `solid-ui: wedding-admin-vendor-form-state.test.ts` (4 passing tests)
- `solid-ui: npm run test:wedding` (1,757 passing tests)

Recommended next action:

- Finish M7 verification, then deploy the task branch's application image to
  Oracle. Startup will apply `0095` and `0096`; re-run the read-only shape and
  hash query afterward before declaring production current.

## 2026-10-05 - WED-145 production deployment

What changed:

- Deployed the clean, committed WED-145 checkout at `608bd6a` to Oracle. The
  release bundle was staged from the explicit runtime contract, excluding the
  dirty workspace's unrelated `Documents/`, artifacts, build outputs, and Git
  metadata.
- Application startup applied migrations `0095_wedding_vendor_photo_provenance`
  and `0096_wedding_vendor_directory_export`.

Machine-derived evidence:

- Oracle post-deploy proof at
  `artifacts/oracle-production-proof-wed145-postdeploy/` passed with
  `homeserver_running=true` and `backup_verify_status=pass` (restore drill
  deliberately skipped for the direct non-invasive proof).
- External workspace smoke check during deployment returned HTTP 200.
- The live directory export has 130 rows and still hashes to
  `f3cd92e4e975f3952d69aa924c97a345`, exactly matching the supplied Oracle
  CSV snapshot. The export view exists and all three photo-provenance columns
  are present.

Deployment-wrapper note:

- The original background deploy wrapper completed the remote build, service
  recreation, and workspace smoke check but became locally inert before
  emitting its post-deploy receipt. With no child or remote audit process, it
  was stopped and replaced by the successful direct post-deploy proof above.
- `cargo check` (pass)

Unresolved problems:

- The operator UI still needs separate per-photo provenance inputs instead of
  inheriting vendor-level source fields.
- Focused Rust admin-route tests were started but did not finish before the
  local command runner's 30-second cutoff.

## 2026-10-05 - WED-145 per-photo provenance editor

What changed:

- Added independent source URL, retrieval date, and licence JSON fields for
  each existing photo slot in the operator vendor editor.
- The form round-trips those fields through the existing vendor/slot write
  contract and rejects malformed source URLs, dates, or licence JSON before
  any API call.

Tests performed:

- `solid-ui: npm run typecheck` (pass)
- `solid-ui: wedding-admin-vendor-form-state.test.ts` (4 passing tests)

## 2026-10-05 - WED-146 planner recovery and visibility polish

What changed:

- Guarded the home Operational Lanes projection so an absent memo value cannot
  make the wedding planner error screen's Back to Home recovery route throw.
- Google Places vendor photos now load through the authenticated API fetch path
  and a temporary browser object URL rather than a bare image request that
  cannot attach the workspace Bearer token.
- Moved Show guide, Upload files, and the density control immediately after
  Setup checks in the planner toolbar; removed duplicated decision-copy; and
  strengthened the response-card action and label contrast.

Evidence and checks:

- Production read-only database check: 282 non-empty photo rows, all Google
  proxy URLs; 94 vendors have three photos. Seaweed FS is not the source of
  these provider photos.
- Focused UI guard/photo tests: 10 passing.
- Wedding test suite: 1,757 passing.
- TypeScript compiler check completed without diagnostics.
- Oracle deploy of `d16a552` completed from a clean detached worktree.
  `artifacts/oracle-production-proof-wed146-postdeploy/` reports passed with
  homeserver and backup services running and backup verification passed;
  restore drill was deliberately skipped for the direct non-invasive proof.
  The remote staged source contains `fetchGoogleWeddingVendorPhoto`, and the
  workspace HTTP smoke returned `200`.

Deployment-wrapper note:

- After remote build/recreation, the local deploy wrapper became inert with no
  child process. It was stopped only after the services and deployed source
  marker were verified, then replaced with the successful direct proof above.

Coordination note:

- WED-146 was expanded concurrently with separate AI-routing acceptance
  criteria. Its task remains `in_progress`; this handoff covers only the
  completed production-recovery and planner-polish slice.
# 2026-10-05 - UX-MFH-01 local output and mobile focus home

Changed:
- Direct `/ui/command` preview messages now use the same in-memory local
  decryption path as dashboard AFP messages before the Master Agent renderer
  receives them. Plaintext is not persisted.
- Added the phone (<640px) wedding focus deck, menu sheet, overview density,
  safe gesture/button/keyboard triage controls, AFP triage builder, source
  previews, and the requested contrast improvements.
- The adapter reads existing wedding DecisionOS/quote projections and leaves
  vendor search, ranking, three-choice comparison, outreach approval, and
  quote projection ownership unchanged per the governing architecture.

Verification:
- `npm run typecheck` passed.
- Focused Node tests passed: 23/23, including swipe thresholds, privacy
  minimisation, ordering, daily streak compatibility, and palette contrast.
- `npm run build` passed. It emitted the pre-existing Browserslist freshness
  warning and the repository-wide Tailwind min/max-variant configuration
  warning; the new mobile rules use the configured `phone:` breakpoint.
- `git diff --check` passed.
- Deployed commit `cc12b86` to the Oracle host with the existing production
  environment. Docker rebuilt the UI, homeserver, and backup images; the UI and
  homeserver containers were recreated; the post-deploy workspace HTTP check
  returned `200`.

Open follow-up:
- The task remains in progress pending device/browser smoke testing and a
  production rollout. Historic GitHub CI runs visible at session start are
  failed and do not correspond to this unpushed local SHA.

# 2026-10-05 - WED-146 model-status and wedding-AI production repair

What changed:

- Renamed the search-bar pill to `Saved model` and distinguished a saved BYOK
  preference from a missing model and from a model that did not return a usable
  Master Agent response.
- Added an explicit, fail-closed policy for platform-funded wedding vendor
  outreach: routing and audit flags, an enforced 60-request/day production
  cap, and a persisted tenant-scoped usage receipt for each successful draft.
- Added the three policy variables to the homeserver compose environment; they
  were previously present in the production env file but not passed into the
  container.

Production evidence:

- Deployed commits `82b5911` and `808bf73` to Oracle.
- Live container inspection: routing=`true`, audit receipts=`true`, daily
  request limit=`60`; protected `/healthz` returned HTTP 401, confirming the
  running endpoint was reachable without exposing the operational token.
- `scripts/oracle-production-proof.ps1 -SkipRestoreDrill` wrote
  `artifacts/oracle-production-proof-wed146-ai-routing-final/` with
  homeserver and backup service running plus `backup_verify_status=pass`.

Tests performed:

- `cargo check --quiet`
- focused wedding policy, outreach, shared-tool metering, and command-route
  Rust tests (20 passing)
- `solid-ui: npm run typecheck`
- `solid-ui: ui-command-fallback-state.test.ts` (5 passing)
- `solid-ui: npm run build`

Unresolved problems:

- The full restore drill was intentionally not repeated in the final proof;
  its machine result remains separate from this targeted deployment.
- WED-146 remains in progress for its pre-existing planner recovery and polish
  acceptance criteria.

# 2026-10-06 - WED-147 wedding vendor production release candidate

What changed:

- Merged required security/Caddy guard commit `a95514e` (including `7e1880d`) through merge commit
  `6cc32e7` before deployment. The deployed release commit is `f0eeb43`.
- Added controlled `wedding.vendor_selection@1` and `wedding.vendor_quote_response@1` patterns,
  deterministic verification, server insert-time quote projection, five-minute reconciliation,
  stable identities, four safety dates, deferral/resurface, supersession, replay, and approval/send
  payload-hash binding.
- Added provider/enrichment/shortlist/send/projection kill switches, deterministic quality corpus,
  metrics, SLO policy, threat model, rollout gates, and operator runbooks.
- Changed authoritative account storage policy and all affected product copy/tests from 5/15 GB to
  1 GiB for new/free accounts and 2 GiB for upgraded accounts. The explicit 10 GiB add-on remains.
- Refreshed Rust and JavaScript dependency locks. Reachable Rust advisories were removed; CI retains
  one documented unreachable lockfile-only RSA exception.

Deployment evidence:

- Oracle runtime inventory: root filesystem 70% before build with 14 GiB free; runtime script
  integrity passed. Its synthetic-message and operational-history subqueries returned unavailable
  because of existing shell/`psql` quoting defects and were not represented as passing.
- The normal deployment used the existing remote production env and explicit 50-path runtime
  manifest. UI, homeserver, backup, and Caddy were rebuilt/recreated. Public workspace smoke is HTTP
  200; an internal Markdown URL is HTTP 404, proving the Caddy guard remained active.
- `artifacts/oracle-production-proof-wed147-deploy/postdeploy/` reports `status=pass`, homeserver and
  backup running, backup verification pass, restore drill pass, and root `/var` use at 82%.
- Live staged source contains `FREE_STORAGE_BYTES = GIB_BYTES` and
  `PAID_STORAGE_BYTES = 2 * GIB_BYTES`; the running homeserver image is the release image built at
  deployment time.
- The deploy and detached-proof wrappers both reached their known inert local post-remote state with
  no child/remote process. Only those inert local wrappers were stopped; the authoritative proof was
  rerun synchronously and passed.

Tests and gates:

- `cargo check` passed after the dependency refresh.
- Full `cargo test` passed: 2,321 library, 12 API-flow, 3 taxonomy, and 1 doctest; 11 doctests ignored.
- `cargo audit --ignore RUSTSEC-2023-0071` passed with one allowed `lru` warning. `rsa` and
  `sqlx-mysql` are absent from the resolved build graph.
- Fresh-lock UI install, `npm run typecheck`, `npm run build`, `npm run test:wedding` (1,766), and
  `npm run test:decisionos-navigation` (7) passed. TypeScript SDK `npx tsc --noEmit` passed.
- The first fresh-lock wedding run hit a one-millisecond pre-existing outreach timestamp assertion
  and a deliberately incomplete temporary config copy; both focused tests and the complete rerun
  passed after the policy fixture was present.
- Tracked secret-pattern scan returned no matches.
- `npm run test:line-budget` remains red on committed/pre-existing oversized files; no cap was
  raised and every new WED-147 source/test module is below 999 lines.

Unresolved production/GA gates:

- Manual WCAG 2.2 AA/device/usability acceptance, controlled Gmail/provider canaries, stable hosted
  SLO windows, later rollout cohorts, and named product/engineering/security/privacy/operations
  approvals remain required. The task list deliberately leaves those boxes unchecked.
- JavaScript audit still reports the upstream TipTap 2 moderate advisory and high `image-size`
  JXL/HEIF/ICNS denial-of-service advisories inherited through `pptxgenjs`. The wedding path does not
  invoke that parser, but security must formally accept reachability or adopt patched upstream
  packages before GA.
- Oracle inventory synthetic/operational-history queries need a separate quoting repair.

Recommended next action:

- Hold at developer canary. Collect quote-projection/provider/SLO evidence, complete the manual
  accessibility and security reviews, repair the line-budget baseline and inventory queries, then
  advance through the documented internal/beta/percentage stages only with named approvals.

# 2026-10-06 - WED-148 global mobile navigation and Oracle rollout

What changed:

- Added one application-shell mobile menu trigger that remains reachable from every phone view,
  retains the wedding attention badge, and replaces the duplicate wedding-home-only control.
- Expanded the drawer to the supported desktop destinations, including feature-gated Study, PARA,
  and Runner entries, searchable groups, current-page state, and persisted cross-page wedding menu
  intent.
- Added Escape/backdrop dismissal, a keyboard focus trap, trigger focus restoration, background
  scroll lock, safe-area spacing, 48px targets, auto-fitting controls for 200% zoom, and destination
  focus/scroll reset.

Deployment evidence:

- Deployed implementation commit `9b609c9` to Oracle with the existing remote production env and a
  UI-scoped image build; Caddy was recreated from the guarded configuration.
- Required guard commit `a95514e` (including `7e1880d`) is an ancestor of the deployed commit.
- Public workspace probe returned HTTP 200. The internal
  `/docs/PRODUCTION_ROLLOUT_RUNBOOK.md` probe returned HTTP 404.
- `artifacts/oracle-production-proof-wed148-postdeploy-retry/` reports `status=pass`, homeserver and
  backup running, manifest and runtime-script integrity pass, backup verification pass, and restore
  drill pass. Root and `/var` usage were 86% after proof.
- The first proof attempt ended on an SSH connection reset before producing evidence. A clean SSH
  check and synchronous retry completed successfully; no failed attempt was represented as passing.

Tests performed:

- mobile navigation/focus/wedding-menu focused suites: 21 passing
- `npm run test:decisionos-navigation`: 7 passing
- `npm run test:wedding`: 1,766 passing
- `npm run typecheck`
- `npm run build`, locally and in the Oracle UI image build
- `npm run test:line-budget` remains red only on the previously recorded oversized baseline files;
  both new WED-148 source modules and tests are below 999 lines and no cap changed.

Unresolved production/GA gates:

- The vendor production checklist still correctly leaves manual WCAG/device/usability review,
  security disposition of upstream JavaScript advisories, hosted canary/SLO windows, legacy file
  decomposition, and named rollout approvals open. Those external/human gates were not fabricated.
- Oracle inventory still emits the known synthetic/operational-history shell/`psql` quoting errors;
  runtime-script integrity passes, but those two unavailable query results need a separate repair.
- Oracle root usage is 86%; schedule evidence-aware backup/build-cache retention work before the next
  full rebuild rather than deleting shared-host data ad hoc.

Recommended next action:

- Perform the named mobile WCAG/device review against the live build, then collect canary SLO and
  provider evidence before advancing beyond the documented developer-canary stage.

# 2026-10-06 - WED-149 wedding routing, vendor comparison, and Decision Cards

What changed:

- Mobile wedding destinations now preserve inner intent: **Wedding Home** opens overview,
  **Live vendor research** opens the `vendor_search` home card, every other wedding destination
  clears stale card selection, and published home cards route correctly from any application page.
- The inline laptop vendor-search result now renders the persisted top-three comparison through
  `WeddingVendorChoiceCard`, matching the mobile artifact state and retaining photos, truthful
  placeholders, evidence, availability, contact details, and approval-gated outreach.
- Fixed Google Places photos by preserving the validated relative proxy path until the choice card
  performs its authenticated fetch and creates a temporary object URL.
- Added the typed `content.decision_card` contract, eight pattern identifiers, validation, and one
  native Solid renderer with wedding/general themes and glance/compact/standard/full modes.
  General DecisionOS queue cards, wedding focus cards, mobile focus cards, and vendor comparison
  now consume that shared primitive while retaining their existing durable/safe action flows.

Tests performed:

- `npm run typecheck` (pass)
- `npm run test:wedding` (1,766 passing)
- `npm run test:decisionos-navigation` (7 passing)
- decision-card, live-vendor rendering, and mobile destination focused tests (9 passing)
- `npm run build` locally and in the Oracle UI image build (pass)
- `git diff --check` (pass)
- `npm run test:line-budget` remains red only on the recorded pre-existing oversized baseline
  files; the already-large wedding workspace component is 18 lines smaller than at task start.

Deployment evidence:

- Implementation commit `f326068` was deployed through the scoped Oracle UI build; Caddy was
  force-recreated from the guarded configuration. Required guard commit `a95514e` (including
  `7e1880d`) is an ancestor of the deployed commit.
- Public root returned HTTP 200 and `/docs/PRODUCTION_ROLLOUT_RUNBOOK.md` returned HTTP 404.
- The initial detached audit completed remotely with status/exit 0, but its local deploy wrapper
  did not collect the finished report and was stopped only after the remote job had completed.
- A clean synchronous proof at `artifacts/oracle-production-proof-wed149-postdeploy-retry/` reports
  `status=pass`, homeserver and backup running, manifest/runtime integrity pass, backup verification
  pass, restore drill pass, and root plus `/var` usage at 82%.
- Live staged source preserves the relative authenticated Google photo proxy and the authoritative
  `FREE_STORAGE_BYTES = GIB_BYTES` / `PAID_STORAGE_BYTES = 2 * GIB_BYTES` policy.

Unresolved production/GA gates:

- The pre-existing manual WCAG/device/usability sign-off, JavaScript advisory disposition,
  hosted canary/SLO windows, and named rollout approvals remain external gates; none were
  represented as complete by this UI rollout.

Recommended next action:

- Perform an authenticated phone/laptop acceptance pass on real wedding data, then continue the
  documented canary evidence collection before broadening rollout.

# 2026-10-06 - WED-150/WED-151 closure rollout and production visibility repair

What changed:

- Completed the agent-closable wedding production closure work: durable shortlist claims,
  persisted outreach/reply projections, deterministic three-card mobile deck, ranking-v2 policy
  modules and fail-closed evaluation gate, shared decision triage, source splits, operational
  evidence contracts, and four Playwright/axe scenarios at 360px and 1280px.
- Fixed the production-only invisible text regression. Oracle runtime staging now includes
  `solid-ui/tailwind.config.cjs` and `solid-ui/postcss.config.cjs`, so the deployed build generates
  the wedding text/background/border utilities used by buttons and follow-up tags.
- Removed the internal **Update availability** selector from vendor recommendation cards. The card
  still shows the provider-derived availability status and routes the primary action appropriately.
- Reduced seeded demo messages to one clearly labelled item. New accounts receive one signed Demo
  welcome message; migration 0099 removes redundant legacy seeds, while the UI labels and supplies
  exactly one fallback without rewriting a retained signed payload.
- Added a plain, always-visible Master Agent response panel before the enhanced AFP preview so a
  completed search cannot disappear because a rich renderer returns no visible surface.

Tests performed:

- `npm run test:wedding`: 1,791 passing
- `npm run test:wedding:e2e`: 4 passing at mobile and desktop widths
- focused Master Agent/demo tests: 11 passing
- `npm run typecheck`, `npm run build`, `npm run test:line-budget`: passing
- `scripts/stage-oracle-runtime-pwsh-selftest.ps1`: passing with 52/51 expected staged paths
- `cargo check` and full `cargo test --quiet`: 2,320 core tests plus integration/doctests passing
- `git diff --check` and LOCS commit guard: passing

Deployment evidence:

- Deployed implementation commit `b8fee60` using the existing Oracle production environment with
  scoped UI and homeserver rebuilds and guarded Caddy recreation. Required commit `a95514e`
  (including `7e1880d`) is an ancestor.
- Public `/`, `/workspace/`, and `/wedding/` return HTTP 200. Live CSS contains
  `.text-wedding-text`, `.bg-wedding-accent`, and `.border-wedding-muted`; live JavaScript contains
  the Master Agent response and Demo welcome, retains **Check availability**, and does not contain
  **Update availability**.
- Migrations `0098_wedding_vendor_shortlist_run_claims` and `0099_single_demo_seed_message` are
  applied. Existing tenant schemas contain no redundant server demo seeds.
- `artifacts/oracle-production-proof-wed151-postdeploy-sync/` reports `status=pass`, homeserver and
  backup running, runtime integrity pass, backup verification pass, restore drill pass, and no
  failure step.
- The deploy wrapper's detached proof completed remotely with status/exit 0 but left a literal `$!`
  PID and continued polling. Only the local polling wrapper was interrupted; the synchronous proof
  was then run to completion and is the authoritative local artifact.

Remaining external gates and next action:

- WED-150's human judging/NDCG corpus, named accessibility/usability sessions, security-owner
  disposition, 14-day SLO window, and rollout approvals remain intentionally open; local code does
  not fabricate those results.
- Oracle is now 82% used (about 8.7 GB free). Before another normal deployment, perform the existing
  evidence-aware cleanup procedure until at least 25% is free; do not bypass the preflight gate.
- Perform one authenticated phone/laptop acceptance pass using real wedding data and a real Master
  Agent query, then continue the documented canary evidence collection.

# 2026-10-06 - WED-152 vendor-search and browser-navigation reliability

What changed:

- Vendor search is a native form, so Enter and **Search vendors** execute the same guarded action.
- Strict directory-first search still attempts the one permitted online fallback, but a remaining
  shortfall no longer discards suitable evidence. One or two source-backed vendors are persisted and
  rendered immediately, with explicit shortlist status, shortfall, and reason metadata.
- **Show full search result** now expands the saved Vendor search notes body directly below the
  result and can be hidden or closed without switching to Documents.
- Primary application views now push typed browser-history entries and restore them on Back/Forward.
  Existing query/hash context remains intact.
- Template launch waits for the destination chunk before changing view; the wedding intent is then
  dispatched against the mounted planner, removing the observed transient render/retry race.

Tests performed:

- focused vendor-search/history tests: 30 passing, plus the final 24-test interaction regression run
- `npm run test:wedding`: 1,793 passing
- `npm run typecheck`: pass
- `npm run test:line-budget`: pass
- `npm run build`: pass locally and in the Oracle UI image
- `git diff --check` and LOCS commit guard: pass

Deployment evidence:

- Implementation commit `db6d2c6` includes required guard ancestor `a95514e` (and `7e1880d`).
- Read-only inventory measured 82% root use. The evidence-aware cleanup removed 5.36 GB of Docker
  build cache only; no containers, volumes, backups, or shared review targets were deleted. Its
  optional journal vacuum failed, but fresh inventory measured 71% use / 13 GB free before deploy.
- Guarded UI deployment used the existing remote environment, rebuilt only `ui`, and force-recreated
  Caddy from the staged guarded configuration. Root, `/workspace/`, and `/wedding/` return HTTP 200.
- Live workspace assets contain the browser-history marker, **Show full search result**, and the
  honest partial-shortlist copy; the former **Open in Documents** result action is absent.
- `artifacts/oracle-production-proof-wed152-deploy/postdeploy/` reports `status=pass`, homeserver and
  backup running, manifest/backup verification pass, restore drill pass, runtime integrity pass,
  and root plus `/var` usage at 73%.

Remaining external gates:

- WED-150 human ranking judges, named accessibility/usability sessions, security disposition,
  14-day SLO window, and staged rollout approvals remain external and intentionally open.
- An authenticated human acceptance pass should verify the exact provider result and browser history
  on the target phone/laptop, because the automated and public checks do not use the user's account.

## 2026-10-06 Claude: vendor email enrichment, directory cleanup, rooms model (WED-153)

Done (applied directly to local Postgres and Oracle production Postgres via psql; the homeserver
was NOT redeployed):

- Added venues from the user's 2026-10-06 enquiry replies: Yarramalong Valley Farmstay
  (Harvest Haven $15,500 for ~100 guests, midweek micro from $5,000, Nov 5-7/26-28 and all Dec
  2027 available), Somersby Gardens Estate (no minimum spend, 4-part payment plan, Nov and early
  Dec 2027 available, price only in a Canva guide), The Grange Wollongong (all-inclusive packages;
  deposit, minimum spend, availability unanswered; pricing is in a SharePoint PDF not yet read).
- Deleted 14 directory/listicle rows from production (ids in
  `postgres/data/2026-10-06_vendor_email_enrichment.sql`). Production now has 118 active and 2
  hidden vendors. St Siandra and SRG Hospitality were kept deliberately.
- Migration `0100_wedding_vendor_rooms` creates `wedding_vendor_rooms` and
  `wedding_vendor_room_photos`; registered in `migration_catalog.rs`. Three Yarramalong rooms
  were loaded. `src/db/wedding_vendor_rooms.rs` has the records and `Db::list_wedding_vendor_rooms`;
  `cargo check` passes. No route, UI, or upsert uses it yet.
- Photo facts: production has 282 photos across 94 vendors (max 3 each); local dev has 0 photos
  (0092b never applied). DB photos reach search via `source.photo_url`; the placeholder renders
  only when there is no photo or it fails to load.

Open / for Codex:

- No room photos exist yet. Upload to Seaweed FS (`OMNYID_SEAWEEDFS_*`), add an authenticated
  serving route, then insert `wedding_vendor_room_photos` rows.
- Expose rooms in the vendor API and render in the card/comparison; add admin editing.
- Read the Grange packages PDF and Somersby Canva guide and add their rooms and prices.
- Stop search-cache ingestion from re-adding directory/listicle pages as hidden vendors.
- PLYNLIMMON 1860 Heritage Cottage still has an Easy Weddings URL as its website_url.
- All changes above are uncommitted in the working tree.

### 2026-10-07 Claude follow-up (WED-153)

- Resolved the open item "search cache can re-add directory pages". `upsert_discovered_wedding_vendor`
  (`src/db/wedding_vendor_evidence.rs`) now resolves an incoming vendor to an existing row by slug,
  normalised name+category, website host, or phone digits before inserting. A match is merged
  (existing values win; only missing address/phone/email/website/source and empty photo slots are
  filled), so a discovery never creates a duplicate and only adds genuinely new details.
- Added wedlockers, hitchbird, tagvenue, weddinghero, weddingvenues.com, hiddencitysecrets and
  weddedwonderland to `DIRECTORY_DOMAINS` so they classify as directory/listicle, which the
  persister already skips. Directory profile pages of a real venue can still enter as hidden
  vendors if they are not duplicates.
- Smoke test `local_postgres_discovered_vendor_merges_duplicates_and_fills_gaps` passes against local
  Postgres. 22 other `local_postgres_*` server tests fail in this environment; not investigated and
  not related to these files.
- PLYNLIMMON 1860 website in `Documents/design/wedding planner/oracle-venue-export-2026-10-06.csv`
  is now the official site; the Oracle DB row still holds the Easy Weddings URL (not updated).

### 2026-10-07 Claude: listing enrichment (WED-153)

- Applied `postgres/data/2026-10-07_vendor_listing_enrichment.sql` to local and Oracle Postgres.
  New vendors: The Tea Room QVB, Zest Boathouse at The Spit, Waterview in Bicentennial Park, Crowne
  Plaza Hawkesbury Valley, Mackay Family Estate. Yarramalong Valley Farmstay enriched; PLYNLIMMON
  website_url fixed in Oracle.
- Facts live in catalog attribute keys (`style_tags`, `editorial_summary`, capacities, `price_per_head_aud`,
  `curfew_time`, booleans, `inclusions`) with authority `directory`; the upsert only replaces rows whose
  authority is already `directory`, so vendor_reply values are kept. Packages for Yarramalong are in
  `wedding_vendors.evidence.packages`. Crowne Plaza and Waterview have per-room rows (hire fee in
  `price_from_cents`, ceremony fees in `pricing_label`).
- Mackay Family Estate photos are served as static files from Caddy at
  `https://omnyid.com/wedding/assets/venue-photos/mackay-family-estate-{1,2}.png` (copied to
  `/home/ubuntu/omnyid/wedding/assets/venue-photos/` on Oracle and to `wedding/assets/venue-photos/` in
  the repo so a deploy keeps them). This is public static hosting, not Seaweed FS.
- Not provided in the pasted listings: Tea Room QVB, Zest and Crowne Plaza websites/phones; Mackay
  details beyond address, website, phone and photos.

## 2026-10-12 - WED-181 storage and database editor repair

Changed:

- Enforced 50 MiB standard / 100 MiB paid Wedding storage on billing status and file routes; configured operator emails are exempt.
- Added a clear Profile upgrade card for the supplied AUD 39 one-off OmnyID Wedding Stripe Payment Link. No Stripe key was written to source control or frontend code.
- Made Database immediately project successful row, cell, import, and new-field saves; field definitions persist as `database_schema_update` AFP messages. Removed the internal-facing Database subtitle.

Verification:

- `cargo check` passed.
- `cargo test server::billing::tests --lib` passed (20 tests).
- Focused UI state tests passed (24 tests), `npm run typecheck` passed, and `npm run build` passed after installing the workspace SDK dependencies.
- `git diff --check` passed.

Open:

- Existing wedding collaboration UI is explicitly a scaffold: durable partner co-ownership still needs backend ACLs, shared-key distribution, per-collaborator audit, and conflict handling. Do not represent its current invite controls as live shared access.

## 2026-10-12 - WED-181 Stripe Checkout completion

Changed: replaced the reusable Payment Link with authenticated server-created one-off Stripe Checkout; added restricted-key/Product-ID support; passed Stripe configuration only to the Oracle homeserver; made file-backed webhook secrets work; normalized workspace returns; and repaired a calendar null-safety type error.

Verification: `cargo check` and `cargo test server::billing::tests --lib` passed (21 tests). `npm run typecheck` passed; rerun `npm run build` once more before deployment.

Open: subscribe the Stripe destination to `checkout.session.async_payment_succeeded` if delayed payment methods are enabled. Partner co-ownership still requires backend ACL/shared-key/audit/conflict contracts and must not be presented as live shared data access.

Deployment: release commit `fc93467` was staged to Oracle. The initial compose recreate encountered a verified stale generated UI-container-name conflict; the exact exited `omnyid-ui-1` container was removed and the scoped homeserver/UI start then completed. Oracle Stripe secrets were written after staging (the deployment prune removes `.secrets`), are mode `0600`, and are loaded by the homeserver entrypoint. The public workspace probe returned HTTP 200. The synchronous Oracle production proof passed with homeserver and backup service running, backup verification passing, and restore-drill status passing. `/readyz` is authentication-protected (HTTP 401 without its operational credential), so it was not treated as a failed health assertion.

## 2026-10-12 - WED-182 custom-email confirmation and Master Agent travel fallback

Changed:

- Password registration no longer tells a user to check their inbox after the server's transactional confirmation delivery has already failed. It returns a generic retry state that remains safe against account enumeration.
- Master Agent task output that consists only of unavailable weather/map/tool status now becomes a clear, actionable travel-planning fallback. A partial answer that already includes useful guidance is left intact.

Verification:

- `cargo test registration_delivery_failure_is_honest_without_revealing_account_state --lib` passed.
- `cargo test travel_tool_outage_is_replaced_with_actionable_planning_guidance --lib` passed.
- `cargo test travel_answer_with_guidance_is_not_replaced_when_one_tool_is_unavailable --lib` passed.
- `cargo check` and `git diff --check` passed.

Operational finding:

- Oracle has the Gmail OAuth client and both file-backed Gmail secrets, and `OMNYID_BASE_URL` is set to the expected public origin. Its refresh-token exchange returns HTTP 400. A fresh user-authorized Gmail refresh token must be installed securely before confirmation mail can be delivered and the full registration flow can be verified; no credential was printed, copied, or committed.

Deployment:

- Commit `09d338f` was staged through the scoped Oracle homeserver/UI deployment. The running homeserver restarted with the source markers for both the email-delivery response and travel fallback; `https://omnyid.com/workspace/` returned HTTP 200.
- `artifacts/oracle-production-proof-wed182-postdeploy/oracle-production-proof.json` reports `status=pass` with `failure_step=none` after the synchronous Oracle audit and restore drill.
# 2026-10-13 - WED-185 relay foundation and wedding response hotfix

Changed:

- Added a Cloudflare Email Routing inventory/rollback capture script and a
  RELAY-00 decision record. The selected address domain is `mail.omnyid.com`;
  Cloudflare Email Sending is primary and Resend fallback. Wedding relay has
  no Gmail or personal-mailbox fallback.
- Removed sample-dashboard merging for authenticated workspaces. The generic
  Greenfield queue content can no longer mask real user content.
- Made the Track vendors tile open the existing wedding vendor-follow-up panel,
  which owns the wedding vendor reply projection, instead of the unrelated
  general Response Queue.
- Dashboard loading now obtains the local encryption key before attempting to
  decrypt its AFP messages. An encrypted envelope that cannot be opened now
  says the device must be unlocked rather than claiming it is still decrypting.

Cloudflare control-plane result:

- The supplied token verifies for basic zone/account reads, but Email Routing
  rules reads return Cloudflare error `10000`. No Email Routing or DNS change
  was made, and the incomplete capture artifact is intentionally not committed.

Verification:

- `node --import ./tests/node-ts-specifier-hooks.mjs --experimental-strip-types --test tests/decrypted-display-state.test.ts tests/wedding-home-overview-state.test.ts` (19 passed).
- `npm run typecheck` (passed).
- `npm run build` (passed; existing Tailwind/chunk-size warnings only).

Remaining:

- Cloudflare needs the Email Routing Rules and Email Sending API permissions
  required to capture the mandatory inventory and run the external smoke.
- RELAY-01 onward, including authenticated gateway routes and the transport
  retrofit, remain in progress; live vendor relay is deliberately disabled.

# 2026-10-14 - WED-185 wedding reply and catalogue repair

Changed:

- The vendor follow-up reply action now receives a deterministic, editable
  draft if the optional hosted Anthropic draft call is unavailable. It still
  persists through the existing AFP projection before display and still
  requires explicit user approval before the existing Gmail send path runs.
- Directory-only searches retain a couple's exact free-text query, fixing
  searches such as Mackay when no online provider is configured.
- Vendor comparison cards accept only direct images.unsplash.com photo URLs;
  all other external and legacy proxy image URLs are omitted.
- Removed the Wedding planner guide's automatic display and entry point.

Production investigation:

- Oracle has active venue-mackay-family-estate with a phone number and two
  photo records; migration 0106_wedding_vendor_mackay_family_estate is
  already applied. The missing result was the client query plan, not absent
  catalogue data.
- Homeserver logs show the reply failure was caused by Anthropic returning an
  insufficient-credit response, not a lost browser connection.
- Recorded pre-release Caddy SHA-256
  06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40.
  The release must use a scoped homeserver/UI deployment with Caddy reload
  skipped.

Verification:

- focused Solid tests: 29 passing
- Solid typecheck: passed
- focused Rust outreach tests: 11 passing
- focused Rust vendor-search tests: 22 passing
- git diff --check: passed

Open:

- The repository-wide cargo fmt --check still reports pre-existing formatting
  drift in unrelated files. Changed Rust files were formatted directly.
- Relay live transport remains disabled pending the documented Cloudflare
  inventory and security gates; existing Gmail remains the owner-approved
  temporary transport.

Deployment correction:

- The disabled relay's optional secret-file paths must default to empty in
  Compose. A fixed default path made the runtime entrypoint require relay
  secrets even while OMNYID_VENDOR_MAIL_ENABLED=false; this is corrected in
  the follow-up deployment commit.

Production release:

- Released `050f652` and the Compose correction `db32e0a` to Oracle on
  2026-10-14 using the existing production environment. The initial scoped
  release built the new homeserver and UI assets, but exposed the optional
  secret-path error above. The Compose-only recovery then recreated
  `homeserver` without rebuilding or changing Caddy.
- Verified `omnyid-homeserver-1` is running, logs `Omnyid HTTP listening on
  0.0.0.0:8080`, the configured Gmail sync scheduler is active, and
  `https://omnyid.com/wedding/` returns HTTP 200. Caddy still has SHA-256
  `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`.

Follow-up UI hardening:

- Persisted comparison artifacts and shortlist-card media had a separate
  permissive image policy, including the legacy Google photo proxy. They now
  use the same direct `images.unsplash.com` allowlist as live vendor search;
  all other image URLs resolve to the existing honest placeholder. Focused
  comparison/shortlist/search tests (25) and Solid typecheck pass.
- Released `0ef2673` as a scoped Oracle `ui` build on 2026-10-14. The asset
  copy completed (`UI assets ready at /srv/workspace`), the homeserver stayed
  up, `/wedding/` returned HTTP 200, and Caddy's SHA-256 remained
  `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`.

Provider and Cloudflare follow-up:

- Wedding vendor drafts now cascade Cerebras -> Mistral -> Anthropic and only
  then use the deterministic review-before-send template. Successful provider
  calls are metered by their actual provider; model output is no longer logged.
  The local Cerebras credential was moved to
  `.secrets/omnyid_cerebras_api_key` and is ready for Oracle sync.
- Cerebras authentication and model discovery work, but its currently exposed
  `qwen-3.8-27b` completion returned HTTP 402. The supplied local `.env` has
  no parseable Mistral key, so the Mistral leg remains unconfigured until the
  owner supplies `MISTRAL_API_KEY` or `OMNYID_MISTRAL_API_KEY`.
- `artifacts/cloudflare-email-routing-inventory-20261014` contains rules,
  catch-all, rollback, destination-address inventory, and explicit error
  records. Routing-status and DNS export remain `403/10000`; no routing/DNS
  mutation occurred. A deliberately invalid, non-sending Email Sending request
  returned `400/10001`, proving this account/token is entitled (not `10105`).
- Released `807fe72` to Oracle on 2026-10-14. The homeserver rebuilt and is
  running with the file-backed Cerebras key; its HTTP listener and the public
  wedding page returned normally. Caddy was not reloaded and still has SHA-256
  `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`.
- The local Oracle environment is missing the staging-only Caddy password
  interpolation value. A transient inert value was used only to let Compose
  validate while recreating `homeserver`; Caddy was untouched. Do not perform a
  Caddy restart/reload through Compose until that source environment value is
  restored through its approved secret path.

Current WED-185 follow-up (pending release):

- Vendor Follow-up has native, selectable draft and email controls; the source
  rationale is collapsed until requested. The date field can be typed directly
  and has an explicit calendar button. A missing directory email is shown
  truthfully, with a stored official vendor-website link when one exists.
- Thread rendering treats legacy empty encryption `{}` as plaintext, while
  non-empty encryption envelopes still require in-memory client decryption.
  `daemon_heartbeat` is excluded in both the authenticated thread endpoint and
  client render state.
- The owner-confirmed `MISTRAL_API_KEY` was migrated from the local `.env` to
  the gitignored file-backed secret `.secrets/omnyid_mistral_api_key`; its
  Oracle reference already exists in `oracle-cloud.local.env` and Compose.
- Verification: Solid typecheck; focused Solid tests (28 passing); focused
  Rust provider-order and thread-merge tests passing; Solid production build;
  `git diff --check` passing. Repository-wide `cargo fmt --check` continues to
  report unrelated existing drift; `src/server/auth.rs` was formatted directly.
- Next: commit the code, install the Mistral secret on Oracle, then scope the
  deployment to `homeserver` and `ui` with `OMNYID_STAGING_PASSWORD_HASH=disabled` only for Compose interpolation. Do not reload Caddy.

Release completion (2026-10-14):

- Released `da42505` to Oracle. The scoped `ui` asset job completed with exit
  code 0 and the homeserver is running on its rebuilt image, logging its HTTP
  listener on `0.0.0.0:8080`.
- The Mistral file-backed secret is present at the mounted container path;
  neither its name beyond the configured file key nor its content was logged.
  The configured draft order remains Cerebras, Mistral, then Anthropic.
- `https://omnyid.com/wedding/` returned HTTP 200. Caddy remained running
  throughout and its Caddyfile SHA-256 is unchanged at
  `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`.
- The manual Windows archive transfer required normalizing the remote
  `runtime-env-entrypoint.sh` to LF before restarting homeserver; normal
  `deploy-oracle.ps1` already performs that normalization after extraction.
  Caddy was never reloaded.
