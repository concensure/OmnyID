# GROWTH-00 source and contract audit

- Worktree: `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`
- Branch: `agent/codex/GROWTH-001`
- Frozen base: `8291a0c59be5217c49871db3c8f04cb68401b8d4`
- Event schema: `growth-events.v1`
- KPI schema: `growth-kpis.v1`
- Reporting timezone: `Australia/Sydney`

## Existing authorities

| Growth fact | Repository authority | v1 state |
| --- | --- | --- |
| Landing, Quiz start/completion | `wedding_site_sessions/events`, `/wedding/e` | Direct; replay hardening remains GROWTH-01 |
| Binder download | None | Absent; form submission is not download proof |
| Registration | new `users` row committed by `/auth/register` | Direct; server projection remains GROWTH-02 |
| Email verification | `users.email_verified` after verified token/provider | Direct; idempotent projection remains GROWTH-02 |
| Canonical Wedding | first authorised durable AFP scope carrying `wedding_plan_id` | Derived once per Wedding |
| Saved plan | AFP subtype `wedding_intake_profile` | Activation-v1 eligible |
| Saved budget | AFP subtype `wedding_decision_selection` with `budget_decision=true` | Activation-v1 eligible; amount excluded |
| Saved vendor | AFP subtype `selected_vendor_contact_details` with `selected_for_follow_up=true` | Activation-v1 eligible |
| Resolved decision | AFP subtype `wedding_decision_selection` with durable decision ID | Activation-v1 eligible |
| Payment success | signed accepted Wedding checkout completion in `billing_events` | Direct; test mode excluded |
| Refund | None in accepted billing projection | Absent; net revenue/CAC margin remains unavailable |

Partner invitation acceptance is deliberately excluded from acquisition. Either partner may later
create meaningful activity, but the reporting unit remains one Wedding and one Wedding/Sydney day.

## Privacy boundary

The existing session-only opaque visit supports same-session attribution. Cross-session linkage is
off. If the privacy-impact wording is approved later, the code contract requires explicit opt-in,
honours GPC/DNT, caps touch/link life at 30 days and removes the identity link on revocation.
Historical campaign acquisition is unavailable where no touch was captured.

The raw anonymous measurement target is 30 days, but the existing cleanup is longer; GROWTH-01 must
change and prove the batched cleanup before this target is described as operational. User/Wedding-
linked projection retention is not enabled until its privacy-impact assessment is approved.

The policy is informed by official OAIC guidance:

- [APP 11 security and retention](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-11-app-11-security-of-personal-information)
- [Guide to data analytics and the APPs](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/more-guidance/guide-to-data-analytics-and-the-australian-privacy-principles)
- [De-identification and the Privacy Act](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/handling-personal-information/de-identification-and-the-privacy-act)

These sources require justified retention and reasonable destruction/de-identification when data is
no longer needed; they do not prescribe a universal analytics retention period. The 30-day cap is a
conservative product boundary, not a claim of legal approval.
