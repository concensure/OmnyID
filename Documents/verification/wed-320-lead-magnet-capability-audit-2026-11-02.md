# WED-320 lead-magnet capability audit

Date: 2 November 2026
Branch: `agent/codex/WED-320`
Purpose: LP-01 evidence for `OmnyID_Wedding_Lead_Magnets_2_Tasks.md` before public copy relies on workspace behaviour.

`Works` means the current repository has a typed builder, persistence path and focused test or hosted evidence. `Gated` means part exists but public copy must stay narrower than the proposed promise. `Absent` means the proposed contract is not implemented and the corresponding task remains open.

| LP-01 item | State | Evidence | Copy or task blocked |
|---|---|---|---|
| Intake opens with imported initial values, provenance tags, and a new review-first step without breaking paste-a-message | Gated | `WeddingSiteIntakeWizard.tsx` accepts Quiz suggestions and the existing message extraction path remains separate. There is no shared `profile-fields.v1` registry or provenance-tagged “Check what you've told us” first step. | Do not claim cross-tool “tell us once”. LP-02, LP-03 and LP-04 remain prerequisites. |
| Every `WeddingPlanningContext` field is written by `wedding_intake_profile` and skipped by probing when present | Absent | `weddingNeedToKnowProbingState.ts` defines cultural/religious, accessibility and dietary fields, but `weddingIntakeProfileAfpProjectionState.ts` does not write those fields. The probing rules can skip populated in-memory fields, but the durable profile is incomplete. | Blocks full LP-04/LP-05 import and “we won't ask again” copy. |
| Children and plus-one rules can be created programmatically | Works | `buildWeddingGuestBoundaryRuleObjects` emits `wedding_boundary_policy` records with `ruleType` `plus_one` or `children`, `enforcement: require_approval`, `scope: guest_list`, family-visible text and couple approval. Covered by `wedding-guest-boundary-draft-state.test.ts`. | Import may use this existing builder; it must not create a parallel policy store. |
| Feel preferences are written per tag and read by Vision | Works | `weddingVisionPreferenceToAfpSendInput` writes one private `wedding_vision_preference` AFP event per tag; `weddingVisionPreferenceRecordsFromAfpMessages` resolves the latest affirm/remove revision. Covered by `wedding-vision-preference-afp-state.test.ts`. | LP-05 should reuse this writer. |
| Inspiration can be created from a site-hosted image URL | Works | `buildWeddingInspirationItem` accepts safe `previewUrl` and HTTP(S) `sourceUrl`; `weddingInspirationItemsToAfpSendInput` persists the collection. | LP-05 may reuse the builder after the shared consent preview. |
| Documents accept and render `style_palette`, `creative_brief`, `invitation_wording` and `shot_list` subtypes | Absent | `WeddingArtifactKind` is limited to research, vendor table, budget, guest list, timeline, email, legal, registry, map and decision log. The requested subtype contract and subtype-specific renderer do not exist. | Blocks those preview promises and the relevant LP-05, PAL, INV and Batch-1 SHOT import mappings. |
| Vendor `style_tags` coverage and ranking | Gated | The hosted audit in `wed-319-lead-magnet-capability-audit-2026-11-02.md` found 178 venues and 93 photographers with populated style tags; no other category clears the user's 50-record threshold. Ranking V2 reads `style_tags` in `weddingVendorRankingState.ts`. | Style matching may be described only for venues and photographers, and only while the coverage check remains current. PAL-07 remains gated for other categories. |
| Reminder delivery today | Gated | Task `alert_offset_days` and `alert_dates` project into the in-app calendar. RSVP email reminders have draft, explicit approval, reservation, receipt and retry-decision routes, but provider sending is false-default and cohort-gated. No general task-reminder email delivery contract was found. | Public copy may promise in-app dates only. Do not promise generic email reminders. CDN-07 remains open. |
| Changing the wedding date reprojects every task date and alert | Absent | `weddingDateToAfpSendInputs` writes the wedding date schedule item and decision. Persisted task-date updates are per task. No tested fan-out command re-dates every generated task and alert. | The sentence “Move your date and every deadline moves with it” must remain absent. CDN-08 remains open. |
| Imported catalogue ids complete tasks and booked categories skip search tasks | Absent | Task completion and vendor lifecycle AFP writers exist independently, but there is no shared magnet-profile mapping from imported catalogue ids/booked categories to those writers. | Blocks CDN-08 and the matching parts of LP-05. |
| Public vendor directory exposes canonical `style_tags` | Gated | `/api/public/wedding/vendors` returns owner-profile `styles`, but does not join or expose the canonical vendor-attribute `style_tags`. Internal authenticated vendor search materialises canonical attributes. | A public Style tool must not claim canonical directory matching until PAL-07 adds a bounded endpoint or a generated, thresholded dataset. |
| Sensitive-field classification has owner/legal approval | Gated | Current AFP writers mark Vision preferences private/E2EE and family-boundary private payloads explicitly, but no reviewed Batch-2 field registry classifies every proposed profile key. | Blocks LP-02 sensitive tiers, LP-04 default toggles and LP-09 copy. |

## RSVP verification relevant to the landing claims

The RSVP feature is not merely a design stub. The authenticated Guests surface uses the same AFP-backed guest projection as the public capability link:

- `wedding_rsvp_capability_routes.rs` creates revocable, expiring, invitation-scoped public capabilities.
- `wedding_rsvp_response_routes.rs` validates invitation/person/event scope, expected revision, controlled answers and encrypted private-answer envelopes before append.
- `WeddingGuestOperationsCard` derives Replied, Pending and Need details counts from those projected invitation and response records.
- WED-320 places RSVP setup and operations inside the Guests hub; it does not create a second list.

Release evidence still must prove the exact clean candidate on disposable Postgres and the hosted UI. Public wording may say that RSVP responses update the guest list after that proof; it must not claim ungated email reminders.

## Relay observation

The reported `550 5.7.1 DMARC checks failed` occurred at the Cloudflare Worker authentication boundary, before parsing the first `To:` command line. The guard must remain. A command is accepted only when the first trusted Cloudflare `Authentication-Results` header identifies `mx.cloudflare.net`, records `dmarc=pass`, and the authenticated From address is exactly `concensure@gmail.com`. Gmail's composer must therefore use `concensure@gmail.com` as the actual From identity; selecting a `hello@omnyid.com` send-as identity fails because Google is not authorised to send that domain under its DMARC policy.

## Next dependency-ordered Batch 2 work

1. LP-02: build the field registry, marking the three omitted sensitive context fields and unsupported document subtypes blocked rather than inventing writers.
2. LP-03: local profile history/export and declared-key enforcement.
3. LP-04/LP-05: one consent preview and existing AFP writers, after adding the missing durable fields and document subtype contract.
4. CDN-02/CDN-03/CDN-08: one catalogue and real date-change reprojection before Countdown copy.
5. PAL-07: expose only thresholded style data and retain the 50-record category gate.
