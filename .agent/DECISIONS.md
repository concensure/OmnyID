# Decisions

This file records project architecture and coordination decisions. It is
project truth, not a running diary.

## 2026-10-09: Vendor photo removal has a fourteen-day reversible grace period

An owner removal immediately changes the asset to `hidden`, so it can no
longer appear in directory APIs or public image delivery. The stored WebP
variants remain for fourteen days, then a server-side purge worker removes all
three object variants before marking the record `removed`. This makes the
retention rule independent of a browser staying open and avoids immediate,
irrecoverable deletion from an accidental click.

## 2026-10-05: Mobile Wedding Decisions Require Explicit Confirmation

A phone-deck swipe only requests approval; it does not open the vendor
response workflow or execute an action. The couple must confirm in the deck,
which appends the existing privacy-minimised `decision_triage` event and moves
to the next unresolved card. Opening an agent reply draft remains review-only;
the established quote-reply send confirmation is the only path that can send a
vendor message.

## 2026-10-05: Master Agent Suggestions Do Not Preempt Their Result

The Master Agent always remains on the Search result after a direct command.
`suggested_view` may seed an available workflow handoff, but it does not
navigate away before the locally rendered result is visible. A rich encrypted
preview is decrypted in browser memory; if it cannot unlock, the UI renders the
response's safe summary and explicitly tells the user that the detailed view is
still locked.

## 2026-10-05: Command Previews Decrypt at the Client Render Boundary

An encrypted `preview_message` returned directly by the Master Agent command
endpoint is decrypted in browser memory before it enters the command-result
render signal. This uses the existing per-account E2EE key and never writes
plaintext to local storage or sends it back to the server. If the device cannot
obtain or use its key, the renderer retains its explicit unlock placeholder.

## 2026-10-05: Mobile Wedding Triage Is an AFP Projection, Not a Queue Store

The phone focus deck is a view over the existing wedding decision and quote
reply projections. Navigation is local view state; approve/defer creates a
privacy-minimised append-only `decision_triage` AFP event. Wedding deferral
also continues to use the existing `wedding_decision_deferral` path, so the
existing resurfacing policy remains authoritative. The deck cannot directly
send a vendor email: ready-to-send replies require the established confirmation
and send workflow.

## 2026-10-05: Agent Sessions Begin With Synchronisation

Every Claude or Codex session must start by reading `AGENTS.md` and the
canonical `.agent/` project-state files, then checking git status, recent git
history, relevant other-agent commits, machine-owned CI/build/deployment state
where available, and file-scope overlap against active tasks.

Every substantive session should finish by running the relevant tests/builds,
updating task state, recording architecture decisions, writing a concise
handoff, and committing with the task ID when working on a task branch and the
repo workflow calls for a commit.

## 2026-10-05: Separate Truth From Commentary

Agents must keep concise project facts in `.agent/PROJECT_STATE.md`, active
work in `.agent/TASKS.yaml`, architecture decisions in this file, and
conversational handoff notes in `.agent/HANDOFF.md`.

Validation status is machine-owned. Agents must not manually stamp build,
test, staging, deployment, or production health as passing in project-state
documents. Those states belong to GitHub Actions, GitHub Checks, GitHub
Deployments/environments, and runtime monitoring.

Authority map:

| Domain | Authority |
|---|---|
| Code | Git |
| Tasks | `.agent/TASKS.yaml` |
| Architecture | `.agent/DECISIONS.md` |
| Build | GitHub Actions |
| Tests | GitHub Checks |
| Deployment | GitHub Deployment environment |
| Production health | Health check / monitoring |
| Agent work notes | `.agent/HANDOFF.md` |

## 2026-10-05: Branches And PRs Are Agent Boundaries

Implementation tasks should not casually happen on `main`. Agents should use
task branches such as `agent/codex/WED-142` and `agent/claude/WED-143`, then
use PRs as boundary objects for cross-agent review.

The division of labor is situational rather than permanent:

| Work Type | Primary | Secondary |
|---|---|---|
| Architecture | Claude | Codex critiques |
| Implementation | Codex | Claude reviews |
| UX/frontend | Claude | Codex tests |
| Complex refactor | Codex | Claude architectural review |
| Tests | Codex | Claude examines missing cases |
| Security | Claude | Codex adversarial tests |
| Bug diagnosis | both independently | compare hypotheses |
| Final PR | Agent B | reviews Agent A |

## 2026-10-05: AFP Ledger Is Canonical

The AFP ledger remains the source of truth. UI surfaces are projections over
ledger and persistence state, not independent authorities.

Implications:

- UI state should be replayable or reconstructable from persisted facts.
- Agents should prefer appending facts/events over mutating historical records.
- Any derived view can be stale; the fix belongs in projection refresh,
  invalidation, or evidence sourcing rather than hand-editing project state.

## 2026-10-05: Task Ownership Prevents Agent Collisions

Every non-trivial task should have a single owner, lifecycle status, branch,
file scope, dependencies, and acceptance criteria in `.agent/TASKS.yaml`.

Agents may read other tasks, but should not rewrite another active task's
owned files or contracts without recording coordination in `.agent/HANDOFF.md`.

## 2026-10-05: Development Ledger Should Dogfood AFP

The long-term coordination system should become an AFP-compatible development
event ledger rather than a set of handwritten Markdown files. Agents should be
interchangeable actors against the same project protocol.

Useful event kinds include task creation/claim/completion, implementation
start, file modification, test execution, commit creation, PR creation, review
completion, build status, deployment status, and production health verification.

This should expose AFP weaknesses in ownership, conflicting writes, stale
state, approval semantics, provenance, and event projection while the product
is being built.

## 2026-10-05: Wedding Vendor Search Is Directory-First

`POST /wedding/vendor-search` accepts the optional, backward-compatible
`source_policy` field. `directory_only` returns immediately after the existing
vendor-directory pass with a receipt that records the directory count, skipped
paid calls, and whether a client-side suitability check should request the
single online-capable fallback. Absent or `online_capable` retains the existing
provider behavior.

The shortlist policy is pure and consumes the existing ranking output; it does
not introduce another fit score. It uses a stable material fingerprint,
canonical identity de-duplication, bookable-then-verify ordering, and explicit
verified-photo versus placeholder presentation semantics.

## 2026-10-05: Wedding MVP Uses Durable-First Projection Boundaries

Vendor outreach draft UI becomes editable only after its existing AFP draft
builder has been successfully appended. The active workspace receives quote
DecisionOS requests through the existing AFP save/refresh path; stable quote
identity and the persisted `idempotency_key` suppress duplicate projection on
refresh or reload. The temporary onboarding launch guard uses a
fingerprinted browser-storage record until comparison artifact fingerprints
are available as a first-class persisted projection field.

Sent wedding quote replies close their DecisionOS request by appending a
separate `decision_result` AFP successor. Active and resolved messages have
different stable idempotency keys, so closure never mutates quote history and
reloads cannot append either projection twice.

## 2026-10-05: Saved Model State Is Not Inference Health

The Master Agent model pill identifies a saved workspace configuration only; it
is not a connectivity or provider-health claim. When a command falls back after
a saved configuration cannot yield a usable response, the server sends explicit
`model_configured` fallback metadata and the UI directs the user to test that
model instead of saying no model is connected.

Platform-funded wedding AI remains separate from user BYOK and direct Master
Agent queries. Wedding vendor outreach requires an explicit server policy,
enforceable daily request limit, and a tenant-scoped shared-tool usage receipt;
the route fails closed if any are unavailable.

## 2026-10-05: Oracle Vendor CSV Has a Stable Normalized Export Contract

The Oracle vendor CSV uses the persisted `wedding_vendors` fields
`vendor_id`, `vendor_name`, `category`, `service_area`, `website_url`,
`source_url`, and `status`. Its `photo_count` is intentionally derived from
the existing stable `(vendor_id, slot)` `wedding_vendor_photos` rows, rather
than duplicated on the vendor record. Migration `0096` creates
`wedding_vendor_directory_export` with those exact eight columns, preserving
the CSV contract without count drift.

The 2026-10-05 snapshot has no unrepresented source fields: 130 unique rows,
valid status values, and non-negative photo counts. Any future source fields
must be retained as evidence/provenance before an import is accepted; they
must not be silently discarded by a schema reshape.

## 2026-10-05: Google Vendor Photos Use the Authenticated API Fetch Path

Google Places photo URLs remain same-purpose, server-side proxies; they are
not copied into Seaweed FS. Browser image elements cannot attach the workspace
Bearer token, especially when the API host differs from the static workspace
host. The comparison card therefore retrieves only the narrow, validated
Google proxy path via the existing authenticated API base, renders a temporary
object URL, and revokes it on cleanup. This preserves the server-side Places
credential boundary while retaining the existing truthful placeholder for a
failed image response.

## 2026-10-05: Static Docs Mount Is Deny-by-Format for Internal Sources

The Oracle Caddy container bind-mounts `docs/` for a small public static site.
That mount is also a deployment input and must not make operational Markdown,
TypeScript, SQL, review, or CSV files downloadable. Caddy rejects those
formats before static resolution at both the root and `/docs/` aliases.
Public HTML legal pages, static assets, and `/.well-known/security.txt` remain
available. Internal documents should be kept outside `docs/`; the deny rule is
defence in depth for an accidental staged file.

## 2026-10-06: Wedding Quote Decisions Are Pattern-Governed Server Projections

Wedding quote ingestion projects `wedding.vendor_quote_response@1` on the server at insert time and
repairs missed projections with a bounded five-minute reconciliation loop. Stable source and
decision identities, four explicit safety dates, append-only deferral/resurface events, and
supersession keep replay deterministic. A projection cannot reach DecisionOS unless the controlled
pattern verifier returns `VALID` or `VALID_WITH_OPTIONAL_GAPS`; malformed, stale, conflicting, or
unknown-pattern inputs append diagnostics rather than complete-looking cards.

The AFP ledger remains authoritative. Wedding Home and global DecisionOS are projections of the
same decision identity, and approval/send events must bind to the same immutable payload hash.

## 2026-10-06: Base Hosted Storage Is 1 GiB Free And 2 GiB Paid

New free accounts receive 1 GiB of hosted storage. An upgraded account receives a 2 GiB base quota.
The existing explicit storage add-on remains a separate 10 GiB increment. This is account storage,
not Oracle VM RAM allocation, and the server billing policy is authoritative over UI copy.

## 2026-10-06: Dependency Exceptions Must Be Unreachable And Explicit

Rust CI ignores `RUSTSEC-2023-0071` only while `rsa` remains lockfile-only through disabled
`sqlx-mysql`; neither crate is in the resolved build graph and upstream has no fixed release. The
exception must be removed if MySQL is enabled or a fixed RSA version becomes available.

JavaScript audit findings without compatible upstream fixes remain visible release risks rather than
being hidden by force-downgrades or blanket audit ignores. The current TipTap moderate advisory and
`image-size` high parser denial-of-service advisory require security disposition before GA, even
though the wedding path does not invoke PPTX image parsing.

## 2026-10-06: Mobile Navigation Is A Global Application Control

The phone navigation trigger is mounted at the application shell rather than inside an individual
view. It opens one modal drawer with the same supported destinations as the desktop rail, preserves
feature-gated Study, PARA, and Runner visibility, and keeps wedding workspace navigation available
from every page. Wedding submenu intent is written to storage and the URL before the lazy wedding
route mounts, so cross-page navigation cannot lose the requested section.

The drawer owns focus trapping/restoration, Escape and backdrop dismissal, background scroll lock,
safe-area spacing, current-page semantics, and zoom-safe auto-fitting controls. Page selection closes
the drawer, moves focus to the workspace shell, and returns the viewport to the top.

## 2026-10-06: Decision Cards Share One Typed Native Contract

Wedding Planner and general DecisionOS decision surfaces use the `content.decision_card` model with
one of eight explicit patterns: Choose, Approve/Act, Compare, Notice/Decide, Clarify, Coordinate,
Review, or Record. Every card has exactly one primary action, evidence references, verification
state, honest unknowns, and optional recommendations only when reasons and evidence are present.

The native Solid renderer owns the shared anatomy and wedding/general theme variants. Surface
adapters retain domain-specific actions: wedding deferral continues to append its existing durable
AFP event, general queue actions open the source workflow, and mobile deck actions remain guarded by
the existing confirmation bar. Vendor comparison is a Choose card whose desktop hero reuses
`WeddingVendorChoiceCard`; this avoids a second comparison implementation and preserves the
authenticated Google-photo, availability, evidence, and approval-gated outreach behavior.

## 2026-10-06: Wedding Production Closure Fails Closed At Human And Hosted Gates

Ranking policy v2 is additive and default-off behind `WEDDING_VENDOR_RANKING_POLICY_V2`. Its pure
quality, sentiment, value, seasonal-cost, location, confidence, interleaving, and diversity helpers
may be exercised locally, but v2 must not become an active production policy until a sanitised active
Oracle corpus has at least 40 cases, two independent human judges, deterministic replay, all probes,
aggregate NDCG@3 improvement of at least 0.05, and no case regression greater than 0.15. The gate
evaluator enforces those conditions rather than treating synthetic tests as release evidence.

Automatic shortlist launches use a database uniqueness claim over tenant, plan, category, material
fingerprint, and ranking-policy version. Failed or stale claims are retryable; browser storage is only
a latency optimisation. Outreach draft and delivery cards rebuild from append-only AFP messages, and
the mobile vendor deck uses those persisted projections rather than inventing a second local truth.

Hosted canary, provider resilience, bulk catalog writes, the 14-day SLO window, accessibility and
usability sessions, staged rollout, and named sign-offs remain external or human gates. Local code and
fixtures cannot close them. Any future Oracle deployment must retain guard commit `a95514e` (including
`7e1880d`) in ancestry and meet the documented disk-headroom precondition.

## 2026-10-06: Oracle UI Builds Must Stage Their CSS Toolchain Configuration

`solid-ui/tailwind.config.cjs` and `solid-ui/postcss.config.cjs` are production runtime-build inputs,
not development-only files. Oracle staging must copy both alongside the UI source. A deployment that
updates component class names without the matching Tailwind configuration can ship correct markup
with no generated utility rules, making text and controls appear missing in production.

Seeded demo messages are bounded to one per tenant. Existing signed messages are not rewritten by a
database migration: redundant seeds are removed, while the retained seed is clearly labelled as Demo
in the presentation projection. New accounts receive one explicitly labelled seed from the server.

## 2026-10-06: Application Views Participate In Browser History

Primary application view changes push a same-origin history entry with both a typed history-state
value and a reload-safe `view` query parameter. Back and Forward consume `popstate` without pushing a
replacement entry. Existing query, hash, and wedding-menu state are preserved so browser navigation
does not erase contextual routes.

Vendor shortlist completeness and vendor visibility are separate concerns. A strict search still
runs one online fallback when fewer than three suitable candidates exist and records the remaining
shortfall, but every real source-backed candidate found so far is persisted and rendered. Search
notes expand inline from their source artifact and do not reroute the user to Documents.

## 2026-10-06: Vendor Rooms Are a Child Table; Room Photos Live in Seaweed FS

Rooms (spaces, packages, accommodation) are rows in `wedding_vendor_rooms`, each with its own
pricing label, optional `price_from_cents` / `minimum_spend_cents`, inclusions, and availability
note. `wedding_vendor_room_photos` stores image bytes by `storage_bucket` + `storage_key` in
Seaweed FS, with `photo_url` only for externally hosted images (exactly one must be set). This
differs from the Google-proxy vendor photos above because room photos are operator-supplied
files, not provider content. Vendor-reply facts (price, minimum spend, availability) are also
recorded in `wedding_vendor_attributes` with `authority = 'vendor_reply'`; unknowns stay
`unknown` rather than guessed. Directory/listicle pages (Easy Weddings, Wedlockers, Hitchbird,
etc.) are not vendors and were deleted from `wedding_vendors`; search-cache ingestion should
filter them out (not yet implemented, so they may be re-cached as hidden `custom_vendor_search`
rows).

## 2026-10-08: Wedding Vendor Claim Directory

Spec: `Documents/design/wedding planner/wedding-vendor-claim-your-profile-spec.md` (WED-160..172).

Every seeded `wedding_vendors` row starts `unclaimed`. A vendor claims it through the existing
workspace auth form (`source=vendor_claim`), which assigns a `vendor` role and a `vendor_listing`
plan with a 0 B private quota. Vendor-only accounts get no workspace provisioning. Owner edits live
in separate owner tables and never mutate seed rows, so provenance stays honest and revocation is
clean. Owner photos are public listing data in a `wedding-public` SeaweedFS collection.

Each newly live owner photo must refer to a server-recorded Vendor Image Licence Agreement receipt. The server
selects the agreement version and source-document SHA-256, records the claimant, timestamp, hashed client IP and
bounded user agent, and rejects acceptance by a non-claimant. The phone consent control stays disabled until the
vendor has scrolled through the agreement; this is an informed-consent guard, not merely a UI acknowledgement.

"Verified" requires an email-domain, email-code or admin check. Self-declaration alone shows
"Claimed by owner".

Couple↔vendor enquiries are `wedding_enquiry` / `wedding_enquiry_response` AFP messages,
encrypted and signed on the sender's device with keys generated in the browser. The homeserver
relays ciphertext envelopes with minimal routing metadata and never holds keys on anyone's behalf.
Lead Quality Score is computed on the vendor's device. `MessageSchema` is unchanged. `AgentCard`
gains only an optional `encryption_public_key_hex`.

When present, `encryption_public_key_hex` is part of the AgentCard's signed payload. Cards without
the field retain the original AFP-v1 payload, so an existing card remains verifiable; removing or
replacing a published encryption key invalidates its signature. A vendor AgentCard is bound to a
deterministic managed Agent ID for that vendor/account pair before it can be linked to the listing.

Couples enquire from a free account. Vendor tiers (AUD, incl. GST):

- Starter: free.
- Pro: $79/month or $790/year.
- Founding: $39/month or $390/year, locked for life, for the first 100 vendors or until
  2027-03-31.

The enquiry inbox is never paywalled.

## 2026-10-08: Wedding Home Mobile Triage and Planning Window

The mobile deck leaves native controls (buttons, links, and fields) to their own pointer sequence;
the surrounding swipe recogniser never captures those taps. A completed swipe locks to its initial
axis, follows the finger without transition, then animates beyond the card boundary before applying
the existing action. Cancelled gestures always return to rest without an action.

Completed or deferred mobile items are mirrored in account-scoped browser storage only after the
AFP triage save succeeds. AFP remains the authoritative history, while the mirror prevents a
successfully completed recommendation flashing back during a route remount or slow refresh.

The schedule chart's canonical range begins at `planning_started_at` recorded with the wedding date
and ends one day after the wedding. Project task lead-time templates provide deterministic displayed
dates until a user sets a task date; an explicit task date wins and remains editable. Demo/seed
review tasks are deliberately excluded from the couple-facing chart.

## 2026-10-08: Same-Host Staging and Strict Production Policy

Staging is a separate compose project on the Oracle host, reached at `staging.omnyid.com`, so it
shares disk, RAM and the Docker daemon with production and does not rehearse host-level failures.
Its services are prefixed `staging-` so they can never resolve to production's `postgres`. It runs
with fresh keys, no mail provider and no paid API keys.

Production runs with `OMNYID_ENV=production`, so unsafe startup settings fail closed. That policy
treats Gmail OAuth as enabled whenever a homeserver URL or session secret is set, so it effectively
requires a Gmail client id and secret; staging supplies inert placeholders. Release evidence comes
from the Oracle runtime and local tags, not GitHub Deployments, because no GitHub release is used.

## 2026-10-09: Vendor Owner Photo Publication

The original vendor upload is never retained. A claimant uploads a bounded JPEG, PNG, or WebP
payload only after recording the current versioned image-licence receipt. The service enforces
source-dimension and decoder-memory bounds, writes full/medium/thumb WebP derivatives to the
public SeaweedFS namespace, and deletes stored derivatives if its database write fails. A public
derivative is served only for an active vendor listing that is claimed or verified. This keeps
metadata out of public delivery and prevents an unverified claimant from immediately publishing
to the directory.
