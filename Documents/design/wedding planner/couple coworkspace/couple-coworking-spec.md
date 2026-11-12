# Couple coworking specification

Status: implementation specification
Date: 12 November 2026
Task: WED-365
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
