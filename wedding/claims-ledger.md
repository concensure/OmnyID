# Wedding landing claims ledger

Checked 2 November 2026. A claim stays on the public page only while the cited
product behavior and source remain current.

| Public claim | Evidence | Status |
|---|---|---|
| Start planning free; no card required | `wedding/pricing.html` Free plan and current registration deep link | Verified |
| Wedding information is not sold | `wedding/privacy.html`, section 3 | Verified |
| Outbound vendor messages require approval | `src/server/approval_surfaces.rs` send approval boundary and wedding enquiry flows | Verified |
| Quote summaries identify unreadable attachments instead of guessing | `wedding/index.html` demo copy and quote extraction failure projection tests | Verified with explicit limitation |
| The workspace connects vendors, quotes, dates and preferences | Wedding AFP projections in `solid-ui/src/lib/wedding*State.ts` | Verified |
| The public vendor-reply image is example data | `wedding/assets/images/vendor-reply-flow.png` and adjacent visible demo label | Verified |
| The Wedding Animal Quiz is a playful planning profile, not a compatibility test | Quiz v2 specification and `wedding/animal-quiz.html` | Must remain qualified |

## Claims intentionally excluded

- Planning hours saved, costs found, deadline coverage and customer-result
  percentages have no reviewed production evidence.
- Stock-photo testimonials and invented first-person customer quotes are not
  customer evidence.
- Onboarding does not promise that a complete final plan appears instantly.
