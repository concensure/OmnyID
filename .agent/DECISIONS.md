## 2026-10-18: Personalisation transplants preserve current quotation and mail boundaries

WED-187 is already an ancestor of the advanced WED-215 branch and `git cherry` reports no missing
committed changes, so no commit is cherry-picked and no worktree is merged wholesale. The dirty R10,
R11, and R12 work is re-expressed as bounded features: result-only Wedding Understanding import,
operator-reviewed evidence-bounded venue enrichment, and plan-private vendor preference signals in
the current home/search registry. Comparison cards always remain alongside outreach state, refresh
approved photos from the current directory, reserve full card width for names, and derive saved
recommendations from checked evidence. Feedback may add only known-vocabulary, nice-weight inferred
facets; a must-have still requires explicit user confirmation.

Production photographer data remains operational data, not application source. The verified Oracle
projection is 93 distinct photographer vendor IDs and 441 attributes; no corpus, seed, importer, or
duplicate write is added or run.

The WED-187 Cloudflare mail patch is not accepted as written. Current official Cloudflare Email
Service material accepts both scalar and array recipient forms, while the main API reference and
multi-recipient contract use an array. More importantly, the generic AFP SMTP gateway cannot infer
that every outbound message is vendor mail. Vendor relay therefore does not intercept it, the
Cloudflare inbound shared secret remains a readiness requirement, and transactional account mail
may not consume vendor-relay credentials. `OMNYID_VENDOR_MAIL_ENABLED` and ranking policy V2 remain
off until their existing independent evidence gates pass.

## 2026-10-18: Vendor response channels converge only after exact transport proof

Approved Gmail replies become quotation responses only when both the sender equals the approved
recipient and `In-Reply-To`/`References` names exactly one durable clarification Message-ID. Sender,
subject, body prose, and the legacy outreach fallback are never quotation authority. The matched
body and safe attachments become one deterministic tenant-private source; attachments reuse the
existing signature/active-content policy, ClamAV, quota, storage, image OCR, and source preparation
boundaries. Unsupported binary extraction remains review-only rather than decoding DOCX/PDF bytes
as text. An unavailable scanner or ambiguous/expired/revoked/stale grant creates no canonical fact.

Ciphertext-only claimed/federated AFP remains encrypted in transport storage. Its receipt is a
`delivery_accepted` event only. An authenticated owner client may converge decrypted canonical
plaintext only when its complete fingerprint, response identity, claimed-Agent attribution, and
grant/quotation/projection binding match the previously verified signed routing metadata. Email,
portal, and AFP then share `quotation.vendor_response.v1`: exact material/source duplicates append
only a channel-reconciliation receipt, while a material change requires a parent-linked successor
and user review. No transport state is commercial acceptance, booking evidence, or payment
authority. Both email reconciliation and relay remain independently release-gated and disabled.

## 2026-10-18: Vendor revision uploads are immutable capability-bound sources

A secure-link vendor may attach one quotation revision only when the active grant permits
`submit_revision`. The server derives owner, vendor, grant, thread, quotation/version, projection,
source, attachment, and response bindings from the transaction session; multipart fields cannot
assert them. A deterministic session-bound source makes exact upload retries idempotent and rejects
a different replacement under the same link. The final canonical response reloads that private AFP
source and adds its source/attachment references server-side.

Raw files use the existing owner-scoped attachment store and quota. Public untrusted uploads fail
closed unless the existing ClamAV boundary returns a clean result. A small policy layer permits only
PDF, DOCX, PNG, JPEG, WebP, and text, verifies file signatures, and rejects encrypted PDFs, PDF
active actions, OOXML macros/embeddings, and oversized input. It is validation policy, not a parser.

DOCX and text-bearing PDF preparation reuse the browser Mammoth/PDF.js utilities already shipped
by OmnyID; images reuse the shared server OCR boundary, and text reuses shared readability source
planning. Prepared text then enters the same quotation normalisation helper, LLM fallback ladder,
registry, exact-excerpt validation, usage receipt, and manual-review fallback as authenticated
ingestion. Extraction never promotes a vendor statement automatically: the immutable source joins
the existing response review proposal, and only the existing authenticated quotation review/
normalisation policy may later append a successor. Replay then makes prior comparisons, decisions,
and version-bound invitations stale without mutating historical quotations.

## 2026-10-18: Secure-link vendors are capability-attributed, never Agent-impersonated

The optional quotation response portal accepts only fragment-carried capability tokens,
exchanges them into the existing short-lived HttpOnly transaction session, and derives
all vendor, recipient, grant, quotation, channel, timestamp, response, and receipt
identity on the server. A submission becomes one tenant-private AFP response plus a
review proposal attributed to `capability://quotation-response`; it explicitly does not
claim a vendor-Agent signature, user acceptance, booking, or payment. The scoped
session stores only canonical response fingerprint and receipt identity so exact retries
return one durable receipt while materially different replays fail closed.

## 2026-10-17: Quotation intelligence is deployed dark until evidence gates pass

The generic quotation engine, authenticated AFP persistence, review, comparison,
clarification, closure, and vendor-context boundaries may be present in the Oracle
runtime before staged-release evidence is complete, but every independently
controlled capability remains disabled. Compose supplies the versioned release
gate and all feature flags with fail-closed defaults. No environment request can
enable a capability without a verified evidence digest and a verified readiness
report. This keeps the deployed contracts reusable by Wedding and future OmnyID
templates without claiming that hosted extraction, sending, or recommendation is
ready.

## 2026-10-13: Wedding upgrade remains a one-off payment entitlement

The AUD 39 OmnyID Wedding upgrade uses Stripe Checkout `mode=payment` with a one-off Price. The signed paid Checkout completion, bound by server-set session metadata, is the entitlement source and persists `active` rather than Stripe's transient Checkout Session `complete` status. `subscription_data` is deliberately not supplied unless a future recurring Price explicitly changes this product to a Stripe subscription.
# Decisions

This file records project architecture and coordination decisions. It is
project truth, not a running diary.

## 2026-10-14: Gmail remains temporary continuity transport while relay is disabled

The owner instructed the existing Gmail wiring to remain live because the
Cloudflare Email Routing control-plane API is currently unavailable. This
preserves the existing flow only; it does not enable the new relay or permit
Gmail as a vendor-relay fallback. Relay configuration defaults disabled, and
Cloudflare/DNS/routing state remains untouched until the inventory and security
gates are complete.

## 2026-10-14: Wedding draft provider order is Cerebras, Mistral, Anthropic

The platform-funded wedding vendor draft route attempts configured providers in
this order: Cerebras, Mistral, then Anthropic. A provider failure or invalid
structured response proceeds to the next provider; only a final failure uses
the existing deterministic, review-before-send template. Provider selection is
limited to this wedding draft path and does not alter Master Agent/BYOK routing.
Each successful call records its actual provider in the existing tenant-scoped
usage ledger.

The configured Cerebras account currently exposes `qwen-3.8-27b` and
`gpt-oss-120b`; the default is `qwen-3.8-27b`. Authentication works, but a
minimal completion returned HTTP 402, so the owner must add funds or enable
usage before Cerebras can produce drafts. The supplied local environment does
not currently contain a parseable `MISTRAL_API_KEY` or
`OMNYID_MISTRAL_API_KEY`, so Mistral cannot yet be deployed as the second
provider.

## 2026-10-14: Cloudflare inventory is partially captured and Email Sending is entitled

The updated user-owned Cloudflare API token can read routing rules, the exact
catch-all, and destination addresses. It still receives `403/10000` from the
routing-status and DNS-export endpoints, so the required pre-change inventory
is incomplete and routing/DNS must remain untouched. A deliberately invalid,
content-free request to Email Sending returned `400/10001`, not `403/10105`;
the account is entitled and the token has Email Sending permission. This is not
authorization to enable the relay or send test mail before the remaining
security gates.

## 2026-10-13: Wedding vendor relay uses a mail subdomain and isolated providers

Wedding masks use `@mail.omnyid.com`; Cloudflare Email Sending is primary and
Resend is fallback. The wedding path must not select Gmail OAuth, Gmail SMTP,
or any user mailbox. Cloudflare inbound remains a dedicated catch-all Worker,
but its rule and DNS may not change until an exact pre-change inventory and
rollback payload have been captured. Live relay sending is disabled until the
relay security and provider gates are complete.

## 2026-10-12: Eager Solid computations must follow their reactive sources

`createMemo` evaluates immediately. Any memo that reads another memo must be
declared after its source, especially in lazily loaded signed-in views. This
prevents persisted navigation state from turning an otherwise isolated view
into an application-wide temporal-dead-zone error boundary.

## 2026-10-12: Disposable vendor smoke data is silently scoped and purged

Artifacts explicitly marked as disposable vendor smoke fixtures are removed
only from the signed-in planner's matching local workspace. They never block a
live vendor search or expose internal fixture-cleanup instructions to users;
non-fixture imported artifacts remain untouched.

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

## 2026-10-12: Wedding storage entitlement and database persistence

The storage limit is enforced at every server-side status and file-upload path: standard accounts
receive 50 MiB and paid Wedding accounts receive 100 MiB. Configured operator email accounts are
exempt; a client-visible plan string cannot grant that exemption. The profile uses the supplied
Stripe Payment Link without embedding a Stripe credential.

Database grid row, cell, and field mutations each emit an AFP message. Successful messages are
also projected locally until the dashboard refresh arrives, so a successful save is immediately
visible rather than appearing to fail. Field definitions use `database_schema_update` AFP messages.

## 2026-10-12: One-off Stripe Wedding entitlement

OmnyID Wedding uses authenticated server-created Stripe Checkout in `payment` mode instead of a reusable Payment Link, preserving an internal account binding and keeping credentials out of the browser.

The server accepts a restricted key and either a Price ID or Product ID. A product must resolve to one active AUD one-off price (or a matching default price). The webhook grants entitlement only for a signed paid Checkout event with server-issued Wedding metadata and a bound account ID. Workspace return URLs normalize to one `/workspace/` segment.

## 2026-10-12: Transactional email truthfulness and travel-tool resilience

Password registration remains account-enumeration safe, but a known failed confirmation-email delivery must not be presented as a successful inbox handoff. The registration response therefore reports a generic delivery retry state only when the server's own attempt fails; it does not disclose whether any address already exists. Oracle's Gmail OAuth client and file-backed secrets are present, but the refresh-token exchange currently returns HTTP 400, so a newly authorised refresh token is required before confirmation delivery can be verified.

Travel responses must retain useful planning guidance when optional live weather or map lookups fail. A response that is only tool-outage text is replaced with a clearly caveated, actionable itinerary-planning fallback; a partial answer with real guidance is preserved.

## 2026-10-14: Wedding planner navigation must stay within the wedding surface

The Wedding overview's vendor tile points to the Wedding Home vendor-follow-up panel rather than
the generic product Response Queue. It selects the wedding home and scrolls to that panel, so a
real vendor reply cannot be replaced by unrelated sample queue content. Vendor-search text is
held locally while typing and committed only on blur or submit; persisting each keystroke remounts
the planning surface and causes the page to jump.

## 2026-10-14: Vendor Follow-up must use native editable controls

The vendor follow-up surface uses a native textarea, email input, and date input
rather than a nested rich-text editor for its minimum viable reply path. This
keeps direct editing, text selection, clipboard use, and the browser calendar
reliably available. When an address is missing from the directory, the UI is
truthful about that fact and offers the stored official website rather than
inventing an email address or contact-form URL.

An empty `{}` encryption marker is a legacy plaintext representation, not an
envelope. It is rendered as plaintext; non-empty envelope metadata remains
unreadable until client-side decryption succeeds. Operational
`daemon_heartbeat` records are retained for monitoring but excluded from chat
responses and client render units.

## 2026-10-14: Vendor media is limited to verified direct or first-party sources

Couple-facing vendor cards may render a direct `images.unsplash.com` image or
the authenticated OmnyID Google Places photo proxy. The proxy accepts only a
validated `places/` photo resource name and a bounded width, keeping the
Google credential server-side. Arbitrary third-party URLs and arbitrary proxy
parameters remain excluded. This retains photos already stored in the vendor
directory without exposing image URLs or weakening the existing source policy.

## 2026-10-14: Guest RSVP edits are account changes, not local-only toggles

Changing an RSVP in the guest card writes the same durable guest, household,
and invitation ledger projection used by the rest of Wedding. Household records
are created with guest records and the UI presents their display names, never
their internal identifiers. Unassigned planning work defaults to the account
owner, who may then intentionally assign it to a partner or helper.

## 2026-10-14: Mobile Wedding action surfaces retain the persistent tab bar

The clear-decision state fills the available mobile content area but reserves the
fixed Wedding tab bar. Timeline uses its in-panel title and information control as
the sole mobile title; its task rows remain visually chart-like while opening the
same task/menu action as desktop. Older vendor-research task projections infer the
existing Vendors (`response_queue`) surface rather than falling back to a generic
task list.

Google Places remains server-only. Oracle receives it through the existing
`OMNYID_GOOGLE_PLACES_API_KEY_FILE` mount; the process environment is the relevant
runtime check because a later `docker exec` shell does not inherit entrypoint exports.

## 2026-10-14: Saved vendor comparisons use the live vendor-card action surface

Persisted comparison A2UI can describe data but must not carry action controls that
the generic renderer cannot execute. Wedding documents therefore render vendor
comparisons with the same interactive cards as Wedding Home: selecting a vendor
immediately writes (or removes) the follow-up reference, and outreach remains in the
approval-gated composer. Existing saved cards are rehydrated from the current vendor
directory where a safe image is available.

The permitted media set is deliberately narrow: direct Unsplash, the authenticated
Google Places proxy, or an exact `https://omnyid.com/wedding/assets/venue-photos/`
administrator-managed asset without a query or fragment. This adds legitimate
first-party vendor listings without accepting arbitrary remote image URLs.

## 2026-10-14: Wedding AFP UI projections normalise transport identifiers

The AFP send endpoint requires ULID-shaped message and thread identifiers. Wedding
UI features retain their readable domain identifiers in metadata and derive valid
opaque transport identifiers at the shared send boundary, so a local-looking
identifier cannot cause an account-sync failure. This also fixes persisted Vision
notes and vendor-selection changes without weakening server validation.

## 2026-10-14: Master Agent reasoning requires a usable connected model

The deterministic command router remains useful for internal routing only, but it
must not be displayed as a completed user plan when the account has no usable model.
The authenticated command endpoint therefore returns a model-setup boundary before
travel, browser-AI, search, or other deterministic fallbacks. The UI renders that
boundary as a Connect AI model first action and suppresses the generated card
renderer. Boolean retrieval expansion likewise preserves natural-language agent
commands unchanged.

Voice input is transcript-only: browser microphone permission is requested through
`getUserMedia` from the user gesture, the probe stream is immediately stopped, and
SpeechRecognition text is placed in the command field. No voice file is attached or
persisted by this flow.

## 2026-10-14: Vendor replies require inbound provenance

An older browser projection could classify its own A2Z vendor outreach draft as a
reply because it contained vendor wording. Reply projection now accepts either the
gateway's explicit `wedding_vendor_reply_received` kind, a known contact match, or
an authenticated Gmail inbound record with a Gmail message id. Migration `0110`
removes the one exact synthetic A2Z row for every account; it does not touch real
vendor contact or reply records.

## 2026-10-15: Workspace interactions retain durable AFP records

Thread rendering may use the authenticated dashboard bootstrap as a read-only
fallback only when the thread endpoint races or returns no messages. This avoids an
empty conversation after a valid list selection without replacing the authoritative
thread fetch. Note quick actions create user-owned AFP task or meeting-follow-up
records; they do not silently invoke an external calendar provider.

The Composio project credential is injected only by `COMPOSIO_API_KEY_FILE` from
the Oracle secret mount. It enables the shared provider project while each user
continues to create and own their individual Composio connection record and OAuth
grant.

## 2026-10-15: Platform-owned account mail uses Cloudflare before Resend

Account verification and password-reset mail now uses Cloudflare Email Sending
(`POST /accounts/{account_id}/email/sending/send`) with `hello@mail.omnyid.com`
as the configured sender. Resend is retained only as the platform-owned fallback;
the legacy Gmail mailbox gateway is not selected while either platform provider
is configured. This is intentionally separate from the vendor relay, which stays
behind its inbound-routing and security gates.

## 2026-10-15: Wedding focus is bounded and vendor-dependent decisions open research

Wedding Home may show at most three ranked decision cards. The mobile decision deck
contains those cards only; it does not append vendor comparison cards as additional
decisions. When a decision deterministically requires supplier research (for example,
choosing wedding rings), the surface opens a category-specific vendor search before
any vendor selection or message is prepared.

## 2026-10-15: Personalised recommendation import and facet rollout

A locally stored Wedding Understanding result imports after every successful account
creation or sign-in while it remains valid. The import is idempotent by the local-result
fingerprint and wedding plan, so an existing account holder who takes the quiz imports
once at their next sign-in without creating duplicate AFP profile successors or repeated
confirmation banners.

Venue style facets are the first released facet pass. Photographer `aesthetic.*` and
`atmosphere.*` facets are a subsequent independently evaluated pass and do not alter the
venue corpus or policy gate.

## 2026-10-15: Wedding LLM features use one fixed provider ladder

Platform-funded wedding LLM work uses Cerebras, then Mistral, then Anthropic. Each feature
resolves its own model override first and otherwise falls back to its outreach override and the
shared defaults. Invalid, empty, timed-out, or failed provider responses advance the ladder;
feature routes keep their own response validators and durable metering receipts. Anthropic is
last and defaults to Claude Haiku 5.5 (`claude-haiku-5-5`).

## 2026-10-15: Policy-v2 ranking is opt-in and fingerprinted

The production default remains ranking policy `1`. Policy `2` is selected only by
`VITE_WEDDING_VENDOR_RANKING_POLICY_V2`; it changes both the ranking execution and the
material-fingerprint/receipt policy version so a policy-1 result is never reused as a policy-2
result. The v1 utility calculation is isolated from the eligibility, availability, and grouping
orchestrator to preserve its baseline behaviour while v2 evolves independently.

## 2026-10-15: Facet vocabulary is a shared JSON build input

`solid-ui/src/lib/weddingFacetVocabulary.json` is the single `wedding_facets.v1` source. Vite
imports it with a JSON module attribute and the Rust catalog includes the same file at compile time.
The homeserver Dockerfile copies that specific build input, preventing a container build from using
a stale or separately maintained facet list. `style_facets` stores facet id strings; per-facet
confidence and evidence remain in the ordinary attribute notes until a structured attribute format
is introduced.

## 2026-10-15: Policy-v2 style uses deterministic facet matches

Under policy `2`, vendor facets are derived at rank time and matched to a deterministic preference
profile. Unknown facets use the neutral 0.5 prior with zero confidence, while user-confirmed
must-have conflicts exclude only when their conflicting vendor evidence is decisive (at least 0.7).
The original policy-1 path remains untouched. The R0 Bondi policy-2 fixture is now 52 rather than
the earlier pre-facet 42; policy 1 remains 38.

## 2026-10-16: Policy-v2 ledger and priority shift are deterministic

Policy 2 assigns the facet-match component the specified 0.20 base weight. Only a mapped
`topPriorities` anchor redistributes up to 0.06 from the other positive-weight components, and each
component records its signed `weightShift`; the total is unchanged. The reason ledger keeps exactly
one strongest facet result for each couple anchor, then adds location, budget, guest-capacity and
quality rows. It validates provenance before retaining a pro or con and exposes a per-candidate
drop counter for diagnostics. Policy 1 remains unchanged.

## 2026-10-16: Preference interpretation is advisory and successor-only

The preference interpreter may map only vocabulary ids anchored in the couple's submitted text; it
never ranks, invents a constraint, or persists a profile server-side. A missing key, failed
provider, malformed JSON, or fully invalid output yields an empty fallback so the deterministic
synonym profile remains active. Client confirmation upgrades facets to user authority and confidence
1.0, then emits a new `wedding_preference_profile` AFP message with the previous message as its
parent. The preference profile message id and vocabulary version are material comparison inputs,
preventing a confirmed reading from silently reusing an old comparison.

## 2026-10-17: Quotation intelligence is template-neutral and deterministic after extraction

Quotation source parsing and model extraction are untrusted proposal stages. Only versioned,
schema-valid facts with registered source anchors enter the quotation ledger and calculator.
Authoritative money uses integer minor units with checked i128 intermediates; unknown required
amounts remain outside exact totals. Comparison excludes only confirmed hard conflicts, keeps
unknown hard requirements conditional, and emits no winner for a single quote, ties, incomplete
evidence, scenario mismatch, or mixed currencies.

The quotation core uses a context namespace and generic/category registries. Wedding planning is
an adapter, not the owner of the core. Existing OCR, MinerU/LlamaParse, DecisionOS cards, A2UI
primitives, approval gates, and vendor relay remain the required integration points; no parallel
OCR, card foundation, renderer, or mail sender is introduced.

## 2026-10-17: Vendor quotation context is explicit fact-level permission

A future vendor experience receives no open-ended user context. A grant binds user authority,
target vendor, quotation/thread, purpose, allowlisted fact ids, approval receipt, issue/expiry,
single-use or reusable scope, and projection version. Expiry, revocation, recipient mismatch, and
single-use consumption are enforced when projecting. Competitor information, private notes,
hidden preferences, full-plan content, and internal scores are prohibited even if requested by a
malformed grant. Grant and revocation state remains append-only AFP lineage owned by the user.

## 2026-10-17: Quotation sources reuse the document-ingest provider boundary

Quotation ingestion resolves an existing authenticated thread message or attachment, then invokes
the same parser selection, MinerU/LlamaParse, readability, and image OCR implementation as ordinary
ingestion. A source receipt is content-addressed and records only source/version references,
capability/parser metadata, content fingerprint, page count, and retention state. Parsed text is a
transient extraction input; it is not copied into the source-received ledger event or operational
logs. Capability, ownership, size, MIME, and unreadable/encrypted failures remain typed fail-closed
states with a manual-entry path.

## 2026-10-17: Quotation extraction is an untrusted proposal with exact anchors

The shared wedding-funded provider ladder gains a quotation-normalisation feature but keeps the
existing Cerebras, Mistral, then Anthropic order. Quotation requests use temperature zero and a
prompt generated from the selected registry fingerprint. Provider JSON is deny-unknown and bounded;
confirmed or inferred fields survive only when an exact excerpt occurs in the parsed source and
their type, range, currency, unit, basis, and locator can be verified. Unsupported material is
downgraded to unknown or retained as bounded unmapped review material. Exhaustion creates a manual
review state, never a trusted normalisation. A structured vendor submission bypasses the LLM but
passes through the identical validator and receipt contract.

## 2026-10-17: Quotation review creates successors and gates material uncertainty

Review never mutates an extraction or quotation version. Each command binds the active version and
material fingerprint, and accepted confirm/correct/unknown/not-applicable actions create a new
content-addressed successor. Corrections require an anchor from the quotation's registered source
set and must pass the same normalised-quotation validator. Selection, contact, and closure remain
blocked while a high-materiality field is unreviewed, below the confidence threshold, unknown, or
conflicting. Source preview renders escaped text only and returns focus to its trigger.

## 2026-10-17: Clarification approval is content- and revision-exact

A quotation clarification is a persisted editable draft of at most three unanswered fact questions.
Approval binds the entire draft hash, recipient, quotation version, comparison revision, expiry,
and durable approval receipt. Any edit invalidates approval. The resulting idempotency key is passed
to the existing communication executor; the quotation module does not implement another sender.
Outbound context is structured and rejects competitor/private/internal/full-plan keys. Inbound reply
facts re-enter the normal evidence/review path with exact excerpts, and the old decision resolves
only after its direct quotation successor is durably stored.

## 2026-10-17: Booking closure is an evidence-backed state machine, not payment

Quotation selection does not imply contract, payment, booking, or budget commitment. Closure uses
revision-exact successors for selection, contract receipt and review, deposit request and paid
record, booking confirmation, cancellation, refund, and supersession. Changed quote-to-contract
terms block progress until explicitly reviewed. A deposit is cash flow unless explicitly identified
as a fee, preventing it from being counted twice. Only an evidence-backed booking confirmation
produces an idempotent quotation-version-bound budget commitment. Closure projections declare that
payment execution is false; payment remains out of scope.

## 2026-10-17: Generic quotation APIs derive authority from tenant AFP replay

Confirmed quotation, review, comparison, and state routes authenticate through the existing session
boundary and resolve their source/version ids only from messages visible in that user's thread.
Review operates on the replay-derived active quotation and appends a compact review record before its
normalisation successor. Comparison accepts scenario and evidence-linked requirement assessments but
recalculates totals and ranking from active server-side quotation versions; client totals are never
trusted. All writes use the existing private AFP store, preserving idempotency, relay notification,
indexing, and tenant isolation without introducing a quotation-specific database.

## 2026-10-17: Quotation release controls require versioned verified evidence

Accuracy thresholds are compile-time constants: 100% confirmed-material anchor coverage, zero
unsupported confirmed material facts, at least 98% exact money/currency, at least 95% inclusion
accuracy, and 100% determinism plus send approval/receipt enforcement. Empty data is untested and a
known failing threshold is failed. All quotation feature switches default off and are ignored unless
a `quotation.readiness.v1` verified gate plus hexadecimal evidence digest is configured. In-process
readiness can still force every requested feature off. Metrics accept aggregate counts, latency,
fallback, correction, and micro-cost only; raw source/model content is outside their schema.

## 2026-10-17: Clarification send reserves before delegating to existing Gmail transport

Quotation clarification does not introduce a mail provider or a second sender. The authenticated
adapter reloads the tenant-visible persisted draft and its parent-linked approval, verifies the
active quotation and comparison revisions, and then calls the existing Gmail transport. A stable
AFP reservation is inserted atomically before the provider call. A duplicate reservation cannot
send again: a completed retry replays its stored provider receipt, while a delivery-ambiguous
attempt requires explicit reconciliation. Gmail messages carry a deterministic RFC Message-ID and
the receipt references it, so the existing inbound email matcher restores the quotation thread.
Matched email bodies enter the shared source parser as tenant-authorised text and must still pass
exact-anchor extraction, review, successor persistence, and deterministic re-comparison.

Reconciliation is an audit of the already-persisted authorization, not a second authorization.
On retry, the adapter first requires the exact server-derived reservation, then searches the
connected Gmail account's sent mailbox by the deterministic RFC Message-ID. Exactly one provider message may be
projected into the durable sent receipt; no match remains reserved and multiple matches fail closed.
Because no new send occurs, an existing reservation remains reconcilable after approval expiry or a
later comparison revision, while an expired approval can never create a fresh reservation.

## 2026-10-17: Wedding closure consumes generic commitments through existing projections

The quotation core remains template-neutral. Only an evidence-backed `booking_confirmed` snapshot
can produce a generic `BudgetCommitment`; the wedding adapter maps it to the existing wedding
decision/budget projection with a stable commitment id and quotation/source-version references.
Contract and deposit deadlines map to the existing wedding task/reminder projection. Selection,
contract receipt, and deposit records alone never create committed spend, terminal states do not
leave an open deadline task, and every adapter output explicitly states that payment execution is
false.

## 2026-10-17: Content-addressed quotation events use AFP-valid deterministic ULIDs

The authoritative AFP write boundary accepts the canonical `afp-v1` protocol and only ULID-shaped
message and thread identifiers. Quotation normalisation, comparison, review,
clarification-reservation, and clarification-receipt events therefore derive a 128-bit ULID from a
SHA-256 digest of their event namespace, thread, and stable domain payload. Quotation projections
declare `afp-v1`. This preserves idempotent replay while satisfying AFP core and avoids cross-thread
primary-key collisions. Readable quotation/version/idempotency identifiers remain in content,
metadata, and typed references rather than being overloaded as transport message ids.

## 2026-10-17: Vendor responses extend generic quotation AFP, not the wedding planner

The WED-215 audit found claim ownership, AgentCard keys, quotation closure, context grants,
Gmail reconciliation, private AFP persistence, and A2UI projections on the clean `052acc7`
base, but no WED-170 enquiry runtime or WED-171 local-first vendor inbox. Vendor responses
will therefore use a template-neutral `quotation.vendor_response.v1` contract and the
existing singular `/quotation` route namespace. Claimed AFP, scoped secure-link, and email
channels converge on the same response fingerprint, evidence review, quotation successor,
and closure lineage. Wedding code remains an adapter/transport only.

Context purposes preserve the shipped `resolve_quote_gaps`, `refine_vendor_package`, and
`confirm_booking_details` values; submitting a revision is an allowed action rather than a
breaking purpose rename. Response access is exact-vendor, thread, grant, projection, action,
and expiry bound. It cannot disclose competitor comparisons, private notes, hidden
preferences, full-plan context, or internal scores. Existing decision/A2UI primitives are
sufficient, and no new foundational comparison or booking card is authorized. Closure and
vendor response capabilities remain independently fail-closed, and no transition executes
payment.

## 2026-10-17: Selection starts closure but remains a separate AFP fact

An authenticated quotation selection binds the exact active comparison AFP message,
quotation version, vendor, current selection, user authority, and idempotency key. The
server persists `quotation_vendor_selected`, then idempotently creates a distinct initial
`quotation_closure_transition` in `selected` state. This preserves the rule that choosing a
vendor is not contract acceptance, payment, or booking while avoiding an ambiguous gap
before later contract/deposit transitions.

Closure commands reload tenant-visible replay, require the active selection and exact
comparison revision, and accept evidence only when its source message exists in that same
thread. Replay independently enforces source visibility so a directly injected AFP event
cannot activate unsupported closure state. Active decision and closure projections are
suppressed while the release-evidence-backed closure flag is off; history remains
append-only. Quotation successors deactivate old selections and closures without deleting
them, and every persisted transport projection fixes payment execution to false.

## 2026-10-17: Closure presentation is a revision-bound replay projection

DecisionOS and A2UI consume the active tenant-visible quotation replay; they do not own a
second booking state. The closure projector reuses the existing Decision Card contract and
existing A2UI nodes, exposes at most one current closure mutation, and replaces stale
mutation controls with a refresh-only action. Every action carries decision, quotation,
comparison, closure, and grant revisions. The closure route additionally verifies the exact
predecessor closure event and records it in event metadata, preventing a same-state client
snapshot from standing in for the reviewed event revision.

The vendor-share preview renders only the fields in the server-produced least-privilege
projection. Because the canonical projection currently carries sorted field, fact, and
provenance collections rather than a field-to-provenance map, the UI does not invent that
mapping; it presents projection-level provenance separately. A small template adapter adds
wedding presentation metadata without copying quotation state, so future OmnyID templates
can consume the same generic projection. All closure copy states that OmnyID records external
payment evidence but does not execute a payment.

## 2026-10-17: Closure transitions consume validated evidence receipts, not client facts

Closure evidence is a template-neutral, tenant-private AFP successor produced only after the
existing authenticated source-preparation service resolves a visible message or attachment and
uses its existing PDF parser or image OCR boundary. The persisted receipt contains the selected
quotation/version, immutable source/version and content hash, bounded evidence facts, and
`payment_execution: false`; extracted document text is never copied into the receipt. Parser or
OCR unavailability yields manual review rather than inferred closure state.

Contract terms must validate against exact excerpts from the prepared source, and material changes
are derived against the active selected quotation. Contract review must reference the same
validated contract evidence used for receipt. Deposit amount, currency, dates, refundability, and
fee status are accepted only where conservative source text supports them; otherwise the result is
manual review. The closure mutation route no longer accepts authoritative client sources, changes,
deposit records, deadlines, or classifications. It requires a visible validated evidence AFP
message and derives those fields server-side while preserving explicit user authority.

Downstream templates consume one generic deadline projection. Its task identity is stable per
quotation version while every closure revision produces a distinct successor projection. Terminal
booking, cancellation, refund, or supersession archives the task without deleting prior events.
The wedding planner is an adapter over this output, and only the existing evidence-backed generic
booking commitment can enter its budget projection.

## 2026-10-17: Vendor response links are transaction capabilities, never login links

Quotation response capabilities are separate from `auth_magic_links`, account sessions, and vendor
claim authentication. A capability binds one approved grant, vendor, response recipient, quotation
version, commercial thread, projection fingerprint, and action set. The raw 256-bit link secret is
returned once; storage retains only a peppered HMAC and a bounded prefix for rate-limit lookup.
Database compromise therefore does not reveal a usable link without the separately managed service
pepper.

Exchange produces a short-lived transaction session constrained to `account_access = false`, an
HttpOnly Secure SameSite=Strict cookie scoped to the response path, a CSRF secret, and a one-time
submission nonce. Wrong recipient/thread/version/projection, expiry, grant revocation, quotation
supersession, claim dispute, and terminal closure collapse to the same unavailable result. Lifecycle
audit events contain only capability id, kind, time, and deterministic event id; projection fields,
raw secrets, contact details, and network addresses are excluded.

Vendor context projection is now exact-version and exact-recipient bound. Authoritative field
classes and a defence-in-depth key denylist reject competitor, score, private-note, hidden
preference, full-plan, and unapproved values even if a malformed grant names their fact ids. The
delivered canonical projection fingerprint must equal the couple-approved preview fingerprint.

## 2026-10-18: Capability authority is replayed, signed, and transactionally persisted

Response-link issuance requires the exact private AFP grant and canonical projection plus a visible
human approval receipt signed by the configured OmnyID server key. The grant is parent-linked to
that receipt, binds question IDs as well as actions, and must reference the active quotation version
for the same vendor. Unsigned development mode, a missing signing key, a missing 256-bit capability
pepper, or an unverified quotation release gate all fail closed.

Capability lifecycle storage lives in a small database module rather than enlarging `src/db.rs`.
Issue/audit, exchange/session/audit, consume/session/audit, revoke, and rotate use database
transactions and optimistic status/generation predicates. A single-use grant cannot issue again
after consumption, an exchanged link cannot rotate around its live session, and expiry is recorded
as a distinct terminal audit state. Because migration 0112 was already committed, expiry constraints
are introduced by additive migration 0113 rather than by changing applied migration semantics.

Every public exchange and consume replays the owner's tenant-private quotation thread and rechecks
grant revocation, active quote/version/vendor, claim dispute when a wedding listing exists, terminal
closure, and the canonical projection fingerprint. Token-prefix, Cloudflare connecting-IP, stored
vendor, and stored thread counters persist only keyed hashes; vendor/thread dimensions never trust
request fields. Public failures intentionally collapse to `response unavailable`. The shared request
middleware logs only request IDs, while capability route and persistence modules contain no request,
secret, or projection logging.

## 2026-10-18: All vendor response channels converge on one material fingerprint

`quotation.vendor_response.v1` is template neutral and is the only semantic response contract for
AFP, scoped secure-link, upload, and email channels. It binds the vendor, thread, grant, exact
quotation version, and approved projection, while transport channel, receipt, response ID, lifecycle
state, and attestation identity remain provenance rather than material response content. Canonical
fingerprints use immutable source content hashes where available, normalise equivalent timestamps,
media types, hash casing, and collection order, and therefore reconcile the same response across
channel-specific source and receipt IDs.

Confirmed commercial facts require exact anchors resolving to declared sources. Vendor-proposed
facts retain their proposed state, but the generic review projection maps their evidence to unknown
with an explicit user-review rationale; a vendor statement never becomes inferred platform truth.
Identical material submissions deduplicate. A material change must be parent-linked to the prior
response and preserve all transaction bindings. Response lifecycle stops at reviewed/rejected or
superseded: it contains no user acceptance, booking confirmation, payment execution, or
`wedding_plan_id`. Later wedding and other template adapters consume the same generic response and
review proposal rather than defining their own response model.

## 2026-10-18 - Claimed-vendor responses use ciphertext envelopes plus routing sidecars

- Reuse `wedding_enquiry_envelopes` as the only claimed-vendor commercial payload store. Its
  serialized AFP message must have null/empty content and an exact encrypted container; server
  code validates signed routing metadata but never decrypts or parses the canonical response.
- Keep authority outside ciphertext in a bounded sidecar: owner, vendor, grant, thread, quotation
  version, projection fingerprint, nonce, current AgentCard key, material fingerprint, and request
  digest. This permits IDOR prevention, revocation/key-change checks, replay safety, and dedupe
  without duplicating commercial facts.
- Treat the current signed AgentCard as live authority on every inbox read and response submission.
  Replacing its key hides invitations encrypted for the old key and invalidates old signature
  assumptions; claim dispute or revocation removes access without deleting evidence history.
- Browser-held keys perform X25519/XChaCha20-Poly1305 encryption/decryption and Ed25519 AFP
  signing. Server receipts prove durable transport only and never imply user review, acceptance,
  booking, contract execution, or payment.
- Gate the path independently with `OMNYID_QUOTATION_CLAIMED_VENDOR_RESPONSES_ENABLED`. Keep it
  disabled until the disposable-Postgres matrix and independent security review are recorded.
## 2026-10-18: Vendor-portal readiness requires a closed metric taxonomy and commit-bound evidence

Quotation funnel metrics use fixed event, category, and outcome enums rather than free-form labels.
Only bounded aggregate counts, elapsed time, fallback/correction counts, and OmnyID processing cost
are representable; identifiers, content, URLs, tokens, email addresses, and quote amounts have no
field in the contract. This supports the source brief's four investment questions without creating
a second commercial ledger or a surveillance signal such as email-open intent.

The DBV-10 verifier emits `untested`, `blocked`, `failed`, or `verified` evidence and a SHA-256
digest over quotation programme inputs. Local test success cannot satisfy Postgres, clean ClamAV,
provider, accuracy-corpus, independent security/privacy/accessibility, usability, human wording,
hosted-shadow, or cohort gates. External sign-offs must use the frozen small JSON contract and bind
the exact commit. Missing or malformed evidence stays blocked. Deployment and feature enablement
remain separate: no release flag follows automatically from code presence or a local green suite.
