# Celebrant consultations specification

Status: implementation specification for WED-359
Source brief: `celebrant.md`
Pilot: Sydney, Australia

## Outcome

OmnyID will offer a public **Talk to a celebrant** surface with two explicit paths: request a ten-minute callback from a celebrant who is genuinely live, or book a ten-minute consultation in a published window. A visitor does not need an account. The same vendor, calendar, profile, lead and AFP authorities already used by the wedding vendor portal remain canonical.

This is not a public telephone directory and it is not a claim that a celebrant is available for a wedding. Phone-consultation readiness and wedding-date availability remain separate evidence.

## Reused authorities

| Concern | Canonical authority | Extension |
|---|---|---|
| Vendor identity and claim | `wedding_vendors`, verified claim and membership roles | Celebrant settings reference `vendor_id`; no second profile |
| Public profile and photos | owner publication revisions and licensed vendor photos | Consultation cards project the published fields only |
| Wedding-date availability | Limited Specials/calendar authority | Remains the **Wedding dates** view |
| Phone consultations | New time-window and live-session records | Appears beside Wedding dates in the existing Availability area |
| Leads and hiring enquiry | existing vendor enquiry/inbox | A post-call hiring action creates a linked enquiry only after the couple approves it |
| Audit | AFP-compatible content-light event records | Request lifecycle events contain references and state, never phone numbers or notes |

## Public experience

`/wedding/talk-to-a-celebrant.html` works without authentication and is indexable as a useful ceremony-planning page. Its availability API is not indexable and is `no-store`.

The page presents:

- **Available now** only when a verified pilot celebrant has a non-expired live session, remaining capacity and enough time for a full call plus buffer.
- The next bookable Sydney-time window when nobody is live.
- A directory route even when no windows exist; an empty live list is not an error.
- Cards with the published name, representative photo, service area, languages and selected help topics.
- A specific-celebrant route and a **First available celebrant** route. Automatic retry is permitted only for the latter.

The short intake asks for intent, topic, location, optional wedding date and a phone number. It tells the visitor which celebrant (or matching pool) will receive the number before explicit submission. First-time numbers must pass provider-backed verification. The raw phone number is encrypted at rest and is revealed to the selected celebrant only after acceptance.

## Vendor controls

Verified celebrants see **Phone consultations** in the existing vendor Availability section. Calendar managers and owners may:

- maintain recurring weekly windows and one-off exceptions in `Australia/Sydney`;
- select general-question, prospective-client, or both intents;
- set topics, a buffer and a per-live-session call cap;
- go live for a bounded period, pause immediately and see remaining capacity;
- accept or pass a held callback;
- cancel or request a reschedule for a booked call; and
- report `connected`, `not_connected`, or `cancelled` independently of acceptance.

The first release uses the vendor's nominated business phone for callbacks. OmnyID does not promise masked calling.

After acceptance, the verified callback number is presented as a tap-sized
`tel:` action. Australian national mobile and landline numbers are normalised
to E.164 (`+61…`) in the link while retaining readable formatting on screen.
Incomplete local numbers are shown without a call action rather than guessed.
Mobile devices open their native dialler; desktop behaviour depends on the
calling application registered with the operating system.

## Authorisation and official evidence

Pilot cards require a current operator-recorded check against the Australian Attorney-General's Department celebrant register. The verification record stores the register type, source URL, checked time and operator—not copied register content. Registration evidence does not imply live readiness.

The Attorney-General's Department states that Australian marriages must be conducted by an authorised marriage celebrant and provides separate searchable registers for Commonwealth-registered and religious celebrants: <https://www.ag.gov.au/families-and-marriage/marriage/find-marriage-celebrant> (checked 11 November 2026). This is product evidence, not legal advice.

## State and concurrency

Callback request states are:

`awaiting_verification -> waiting_acceptance -> accepted -> connected|not_connected`

and may also transition to `passed`, `expired`, `cancelled`, or `reschedule_requested`. Scheduled requests use `scheduled` after verification and may then be accepted, cancelled or rescheduled.

Submission locks the chosen live session in PostgreSQL, counts unexpired held/accepted requests and reserves capacity atomically. Scheduled slots have one active reservation per celebrant and start time. Idempotency keys prevent duplicate creation. Acceptance and connection are deliberately separate events.

## Verification, privacy and abuse controls

- SMS verification uses Twilio Verify through server-held secrets; no verification code is persisted.
- If Twilio or required encryption/token secrets are unavailable, verification fails closed with a service-unavailable response.
- Public list, verification and request endpoints have separate IP/phone-hash rate limits.
- Public capability/status tokens are random, stored as keyed digests and returned once.
- Phone ciphertext uses the server encryption root with a consultation-specific derived key.
- APIs return generic not-found responses for invalid tokens and do not expose vendor private contact data.
- Events contain identifiers, state, timing and intent class only. Phone, free-text notes and verification codes never enter event metadata.
- Public availability responses are `no-store`; public pages must not expose management endpoints or secrets.

## Notifications and conversion

The portal inbox is the initial reliable notification surface. Email/SMS notification may be added only through the existing outbound delivery authority and must distinguish provider acceptance from receipt. After a connected call the visitor can save the celebrant or ask about a wedding date. The latter requires explicit approval and creates a linked canonical vendor enquiry; the consultation itself never silently becomes a sales lead.

## Rollout and observability

The entire public surface is false-default behind `OMNYID_CELEBRANT_CONSULTATIONS_ENABLED`. Publishing also requires the vendor-level pilot verification flag. Operator metrics distinguish requested, accepted, connected, not connected, expired, scheduled and hiring-enquiry outcomes. No metric treats acceptance as a completed conversation.

The operator Wedding funnel also reports three separately defined, content-free
measures over selectable 30-, 90- and 365-day windows:

- **Qualified couples** are distinct wedding plans that reached the existing
  activation projection. This does not inspect budgets, messages or plan text.
- **Accurately maintained availability** shows both vendors with current,
  unexpired availability refreshed in the last 30 days and the distinct vendors
  that made an authoritative availability change on each Sydney calendar day.
- **Completed venue enquiries** require delivery or acknowledgement evidence.
  A draft or provider-level `accepted` event is deliberately excluded.

The time series is projected from canonical server records, not browser-local
analytics, and uses Australia/Sydney day boundaries. It stores no new message
content, phone number, visitor cookie or couple profile field.

## Acceptance boundaries

The first release is complete only when:

1. an unregistered or unchecked vendor cannot appear publicly;
2. a visitor can see honest empty, live and next-available states without an account;
3. two concurrent requests cannot overbook one live session or scheduled slot;
4. the phone number is unreadable at rest and absent from audit payloads;
5. only an authorised vendor role can configure windows or act on requests;
6. acceptance, expiry, reschedule and reported outcome create idempotent lifecycle evidence; and
7. post-call hiring uses the existing enquiry authority after explicit couple approval.
