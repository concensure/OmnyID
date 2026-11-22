# Couple coworking specification

Status: implemented foundation; incremental enforcement and coworking UX continue
Date: 22 November 2026
Tasks: WED-365, WED-391, WED-392, WED-394, WED-395
Source guidance: `couple coworking.md`

## Outcome

Two independently authenticated people can operate one canonical Wedding plan
without gaining access to each other's personal OmnyID account. Wedding
membership grants access to explicitly Wedding-scoped objects; it never grants
owner-wide access to messages, contacts, diary entries, files, databases,
embeddings, agent memory or cached results.

This extends the existing membership, invitation and selected-contact sharing
foundation in migration `0168_wedding_partner_sharing.sql` and
`src/server/wedding_partner_sharing_routes.rs`. It does not add a second
wedding ledger, contact store, task engine, quote store or AI memory system.

## 2026-11-22 reconciliation

The source guidance has already produced this specification and the companion
task document. WED-391 therefore updates these existing documents rather than
creating a second coworking plan.

Implemented and retained:

- independently authenticated owner and co-owner accounts;
- one active co-owner limit, authenticated seven-day invitation acceptance,
  expiry, revocation and partner leave;
- canonical `WeddingScope` with owner, plan, response workspace, actor, role
  and membership revision;
- explicit selected-contact publication and the existing AFP Wedding task
  responsibility record;
- a sharing surface that states the personal-versus-Wedding boundary.

The WED-391 slice makes the membership journey actionable: it states the
current, next and following collaboration step, and accepted co-owner names
become the partner choices in task responsibility rather than a guessed
“Your partner” label. This is a projection of membership and task truth; it is
not a new collaborator or task store.

The WED-392 continuation completes the selected-contact publication boundary.
Either active member may choose the other member, select individual contacts
and fields, inspect the exact Wedding-only snapshots, and confirm before they
are encrypted and published. Incoming and outgoing snapshots show human
provenance. Only the original sharer may revoke a snapshot, and every list,
share and revoke operation resolves the exact canonical owner/plan/workspace
scope first. Membership still does not enumerate either account's general
contacts.

The WED-394 slice applies that same authority to the installed run-sheet
projection. The server resolves the exact active plan and response workspace
before installing, loading or committing the projection, then uses the
canonical owner's existing AFP ledger for both members while retaining the
signed-in member as the actor. The Database view carries the response workspace
on every projection request, so a guessed workspace, another couple or a
revoked member cannot select the ledger. Installation creates the existing
`wedding_runsheet.v1` database definition server-side when absent; it does not
ask the user to install a table and does not create a second run-sheet store.

WED-395 extends the same rule to the decision-research cache and explicit task
delivery. Research is authorised by exact plan/workspace before feature or
model execution, cached once against the canonical owner plan, and billed/
rate-limited against the acting account. An approved task delivery uses the
same owner-scoped idempotency key for either partner, records the actor
separately, and may hand the task to the other partner's personal agent without
granting access to the source workspace. This preserves the existing
current/next/following research window and explicit external-send action.

Still not claimed complete: systematic `WeddingScope` enforcement across
every Wedding domain, shared activity/catch-up, scoped AI retrieval,
private-to-shared AI publication and permission-filtered live delivery. Those
remain dependency-ordered below and must not be represented as production
proof merely because their UI concepts exist.

## Existing foundation and gaps

Confirmed foundations:

- Expiring partner invitations are email-bound, digest-stored and accepted by
  an authenticated account.
- `wedding_plan_memberships` resolves a member to the existing canonical owner,
  Wedding plan and response workspace.
- Selected contacts are copied as encrypted, field-limited shared
  representations. The source personal contact is not exposed.
- Revoking a member also revokes active selected-contact grants.

Remaining architectural gap: many older Wedding routes still authorise only by
`user.id` or derive plan state from the signed-in account. Each shared-domain
route must resolve a canonical `WeddingScope` before reading or writing. The UI
must not simulate sharing with browser storage or by copying projections.

## Cross-view authority inventory (first pass)

This inventory follows the source guidance's requirement to map access before
redesigning the UI. `Membership-ready` means the canonical record already has
the Wedding plan/workspace identity or an existing resolver can bind it. It
does not mean every route in that domain has completed partner enforcement.

| Domain | Canonical authority | Current state | Required next action |
| --- | --- | --- | --- |
| Membership and selected contacts | `wedding_plan_memberships`, `wedding_partner_invites`, encrypted `wedding_shared_contact_grants` | Membership-ready | Reuse `WeddingScope`; retain field-preview publication and revocation. |
| Budget and contributions | Existing Wedding AFP projections and budget records | Mixed owner/browser assumptions | Resolve `WeddingScope` before read/write and add expected revision to protected money changes. |
| Guests, RSVP and households | Canonical RSVP setup/response/capability routes and guest AFP projections | External capability is narrow; couple routes are mixed | Bind authenticated couple routes to the canonical owner/plan/workspace without broadening guest capabilities. |
| Seating | Canonical guest/seating AFP projections plus account-keyed presentation state | Partly browser-local | Move authoritative placement mutations behind scoped server commands; keep only view preferences local. |
| Vendors, enquiries and quotes | Canonical vendor IDs, enquiry envelopes, messages and Quote Intelligence | Mostly plan-referenced, not uniformly membership-resolved | Apply scope to authenticated couple reads, messages, attachments and quote selection. |
| Tasks and decisions | Wedding task AFP records, assignment routes and DecisionOS projections | Mixed owner ID and response-workspace checks | Use canonical owner for shared task truth while retaining actor ID for attribution. |
| Run sheet and timeline | Existing source-linked run-sheet projector/share capability | Couple install/read/write now use canonical scope and one owner AFP ledger; restricted external capability remains separate | Extend the same actor/revision and live-delivery guarantees without broadening vendor/public capabilities. |
| Wedding documents | Tenant-private AFP/files with Wedding references | Personal by default | Add an explicit Wedding publication/grant boundary; never infer sharing from a filename or tag. |
| Database view | Existing personal databases plus Wedding saved/projection views | Presentation exists; shared enumeration incomplete | List only personal databases plus exact Wedding projections authorised by `WeddingScope`; do not clone rows. |
| Search, embeddings and AI | General tenant-private retrieval plus Wedding research routes | Not membership-complete | Filter before prompt/retrieval, namespace caches by scope revision, and adversarially test stale access. |
| Diary and chat | Tenant-private AFP messages | Personal by default | Keep private; create shared Wedding journal/chat only through explicit Wedding-scoped AFP writes. |

The first implementation slice adds migration `0171_wedding_scope_revision.sql`
and `src/server/wedding_scope.rs`. The resolver returns the canonical owner,
plan, workspace, acting member, role and membership revision in one server-side
authority. The partner-sharing routes now consume it rather than maintaining a
second resolver. This is foundation work only; it does not claim the mixed
domains above are already shared safely.

The second slice enforces the launch membership shape at the server boundary:
one owner and at most one active co-owner. Acceptance serialises on the owner
membership row so two pending links cannot race into a three-person Wedding.
The owner may revoke the partner and the partner may leave; both operations
advance membership revision, revoke selected-contact grants and invalidate
the affected dashboard caches without deleting either personal account.

## Scope model

```text
WeddingScope {
  owner_user_id,
  wedding_plan_id,
  response_workspace_id,
  member_user_id,
  role,
  membership_revision
}
```

The server derives this value from active membership. Clients may request a
plan ID but cannot nominate its owner or elevate their role.

`membership_revision` changes when access is restored or revoked and is part
of the cache namespace. A valid account session therefore cannot keep using a
stale shared Wedding cache after its membership changes.

Data classes:

| Class | Default authority | Examples |
| --- | --- | --- |
| Personal | account owner only | diary, personal chat, contacts, databases, files, AI memory |
| Wedding shared | active Wedding membership | budget, guests, RSVP, seating, vendors, quotes, tasks, run sheet, shared documents and discussions |
| Wedding-related personal | account owner only | vows, surprises, private reflections, private financial context |
| Restricted external | explicit capability | RSVP household, vendor response, planner or run-sheet view |

Words such as `wedding` in a personal record never change its scope.

## Server authorisation contract

1. All shared Wedding reads and mutations resolve the active membership on the
   server and use its canonical owner/plan/workspace tuple.
2. IDs are filtered by scope in the same SQL statement that reads or mutates
   the object. A UI check is not an authorisation control.
3. Revocation invalidates subsequent reads, writes, search, AI retrieval,
   exports and live/subscription delivery. Account sessions remain valid for
   personal work, but Wedding-scope caches are revision-keyed and evicted.
4. Personal tables and tenant schemas are never queried with another member's
   user ID. Shared projections are read through an explicit Wedding authority.
5. AFP events carry actor, canonical scope, object/reference type, provenance,
   revision and publication state using existing metadata conventions.
6. Mutations use expected revision or equivalent conflict detection for money,
   confirmed decisions, guest status and other non-commutative changes.
7. Recoverable archive/version history precedes permanent destruction. Joint
   deletion/export policy is a later product decision; one member cannot
   silently erase the other's shared work.

## Shared projections

Budget, guests/RSVP, seating, vendors/quotes, task progress, decisions, run
sheet, files and Wedding databases are multiple views of the same existing
records. The general Database view lists personal databases plus Wedding
databases authorised to that member. It does not clone Wedding data into the
member's personal database.

New databases created from Personal default to personal. New databases created
inside the Wedding context default to the current Wedding scope and clearly
state that both partners can access them.

## Contacts and personal-to-shared publication

A contact crosses the boundary only through explicit field selection. The
published snapshot contains approved fields such as name, phone, email,
relationship and role labels, plus source provenance and revision. Private
notes, addresses, threads and future fields remain unavailable. Updating the
personal contact does not silently expand or refresh the snapshot.

The same preview/approve pattern applies when a private AI draft or other
personal content is promoted into the Wedding workspace. The preview names the
exact content and audience before a shared AFP write.

## AI, search and background work

- Personal AI may use that account's personal context plus authorised Wedding
  context.
- Shared Wedding AI retrieves only from the Wedding scope, regardless of which
  partner invokes it.
- Embeddings, vector search, summaries, notifications, background jobs,
  attachment previews and tool calls apply the same scope before content enters
  a model prompt or response cache.
- A shared catch-up cites only shared events visible to the requesting member.
- Drafting may be private; sending or publishing remains approval-gated.

Prompt instructions are not a privacy boundary.

## Membership journey

1. An owner enters a partner email and creates a seven-day, single-purpose
   invitation through the existing route.
2. The recipient signs in or registers with the invited email and sees the
   personal-versus-shared explanation.
3. Acceptance adds an active co-owner membership; it never authenticates as the
   inviter.
4. Both accounts select the same Wedding plan and see the same canonical
   Wedding data with actor attribution.
5. Either partner may leave; removal/revocation stops new shared access and
   preserves each account's personal data.

Initial full membership is limited to two partners. Planner, supplier and RSVP
roles continue through their narrower existing capabilities until separately
  approved.
## Collaboration UX

The shared home prioritises assigned work, joint decisions, comments attached
to source objects, recent shared activity and a permission-filtered "Since you
were last here" summary. Every shared mutation records the actor. Independent
task completions merge; conflicting edits to the same protected field require
review rather than silent last-write-wins.

## Privacy and security acceptance

- Partner B cannot enumerate Partner A's personal database, diary, chat,
  contact, file, embedding or AI memory by guessed ID, search, export, linked
  reference or stale cache.
- Both partners see and mutate the same Wedding budget, guests, seating,
  decisions, tasks, quotes and run sheet.
- Selected contact sharing exposes only selected fields.
- Revocation denies every Wedding route and subscription without deleting the
  revoked person's personal account.
- RSVP/vendor/helper capabilities remain narrower than partner membership.
- Cross-account and stale-revision tests run against disposable PostgreSQL and
  separate browser contexts.

## Decisions deliberately deferred

- Joint confirmation thresholds for permanent deletion and large financial
  commitments.
- Relationship-breakdown export, retention and dispute policy.
- Planner/family roles beyond current narrow capability grants.
- Transport technology for prompt live updates. The requirement is
  permission-filtered propagation, not a new WebSocket subsystem.
