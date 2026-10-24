# WED-225 hosted accessibility implementing-agent preflight

> This is not the independent accessibility report and must not be used as
> `hosted_accessibility_review` evidence.

## Review identity and scope

- Intended frozen commit: `4a4712f76024705eb32c8e860b669860cd1a58ff`
- Hosted URL checked: `https://omnyid.com/workspace/`
- Oracle release-manifest source SHA observed: `67c1559e0ad5b3760620674fed86a987d8bafc11`
- Date: 2026-10-24 Australia/Sydney
- Reviewer: Codex, implementing agent; not an independent reviewer
- Account: supplied synthetic test account only
- Environment: Windows NT 10 build 26200, Playwright 1.63.0, headless Chromium 153.0.8010.12
- Assistive technology: automated DOM, keyboard and Axe preflight only; NVDA, VoiceOver,
  TalkBack, Firefox, a physical phone and forced-colours mode were not exercised

## Gate eligibility

The hosted gate cannot be run or signed off from this evidence:

1. Oracle is not serving the frozen candidate. Its release manifest identifies a different,
   divergent source SHA.
2. The implementing agent is not independent, as required by the protocol.
3. The signed-in hosted workspace has no seeded quotation review, clarification, closure,
   evidence or source-preview surfaces.
4. No valid, expired or revoked single-use vendor secure links were supplied. The no-token
   shell was checked only as a safety preflight.
5. Required manual screen-reader, physical-device, forced-colours and browser-zoom passes
   were not available in this automated session.

No `hosted_accessibility_review.json` pointer was created.

## Objective hosted observations

These findings describe the older deployed build, not commit `4a4712f`.

| ID | Surface | Observation | Automated classification |
| --- | --- | --- | --- |
| PRE-A11Y-01 | Sign-in | No dialog role was present; Escape did not close the modal; the password field had no accessible label; the page had no `h1`. | Protocol known issue; serious functional accessibility concern |
| PRE-A11Y-02 | Wedding home | Three `main` landmarks were present, two nested inside another `main`, and no `h1` was present. | Axe moderate: duplicate, nested and non-unique main landmarks; missing heading one |
| PRE-A11Y-03 | Wedding home | The TipTap `contenteditable` field had no accessible name. | Axe serious: `aria-input-field-name` |
| PRE-A11Y-04 | Workspace | A plain `div` used `aria-label` without a permitted role. | Axe serious: `aria-prohibited-attr` |
| PRE-A11Y-05 | Desktop wedding home | A 10px `kbd` label measured 2.52:1 (`#a1a3a8` on white), below the required 4.5:1. | Axe serious: `color-contrast` |
| PRE-A11Y-06 | Quotation flow | No quotation review, comparison, clarification, closure timeline, evidence drawer or source preview was found for the test account. | Required test surface unavailable |

Positive observations on the deployed build:

- The first tab stop on the Wedding surface was `Skip to workspace content`.
- The Wedding surface had no document-level horizontal overflow at 320 CSS pixels.
- The automated visible-control sample at 390 CSS pixels found no target below 24 by 24 pixels.
- The no-token vendor response shell returned HTTP 200, used one `main` and one `h1`,
  announced that the response link was unavailable, exposed no quotation details, and had no
  Axe violations in that state.
- No browser page exception was observed. Console errors were counted but their potentially
  sensitive provider text was deliberately not copied into evidence.

## Protocol-row preflight

These results are diagnostic only because the hosted SHA is wrong.

| Row | Observation | Preflight result |
| --- | --- | --- |
| K1 | Skip link was the first tab stop on Wedding home. | Pass on deployed build |
| K2-K7 | Required quotation cards, evidence drawer and usable vendor token were absent. | Not testable |
| S1 | Vendor no-token shell had a meaningful title and `h1`; Wedding home had no `h1`. | Partial / Fail on Wedding home |
| S2 | No manual NVDA heading-list pass was run. | Not testable |
| S3 | Wedding home had duplicate and nested main landmarks. | Fail on deployed build |
| S4 | Sign-in password and Wedding rich-text editor lacked accessible names. | Fail on deployed build |
| S5-S6 | A disposable valid vendor link was not supplied. | Not testable |
| S7 | The no-token unavailable state was safe, but expired and revoked links were not supplied. | Partial only |
| S8-S9 | Money/status and closure timeline surfaces were absent. | Not testable |
| Z1 | Manual 200% browser zoom was not run. | Not testable |
| Z2 | At 320 CSS pixels the page width equalled the scroll width. | Pass on deployed build |
| Z3-Z4 | Text-spacing and physical-phone rotation passes were not run. | Not testable |
| C1 | One 10px label measured 2.52:1. | Fail on deployed build |
| C2-C3 | Greyscale and forced-colours passes were not run. | Not testable |
| T1 | Automated visible controls were at least 24 by 24 pixels at 390 CSS pixels. | Automated pass only |
| T2-T5 | Required manual/device and quotation/closure surfaces were unavailable. | Not testable |

## Evidence files

Machine output and screenshots are under `artifacts/wed-225-hosted-preflight/`:

- `auth-vendor-preflight.json`
- `wedding-hosted-preflight.json`
- `wedding-desktop-axe-details.json`
- `auth-dialog-current-production.png`
- `vendor-response-no-token.png`
- `wedding-home-320.png`
- `wedding-home-390.png`
- `wedding-home-1280.png`

## Required next action

Deploy the exact frozen SHA to a test-account-only hosted environment, seed the synthetic
quotation fixture, issue disposable valid/expired/revoked links, and give those details to a
reviewer who did not build the feature. That reviewer must perform the NVDA, mobile screen-reader,
zoom, text-spacing, forced-colours and physical-touch passes before a gate report or pointer can
exist.

Result: PREFLIGHT BLOCKED — NOT VALID GATE EVIDENCE
