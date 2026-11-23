# WED-363 celebrant and quote journey verification

Date: 2026-11-12  
Implementation SHA: `46fb900eb4204715f3bb164c4ebe5b4c971571ed`  
Release checkout: `C:\temp\wt\omnyid-wed363-release-46fb900`

## Lineage and selective integration

The findings in `tests/celebrant-vendor-journey-findings.md` and the dirty QA
checkout at `C:\temp\wt\omnyid-qa-celebrant-ffa7415` were treated as evidence.
No commit, build artifact or whole-file merge was taken from that checkout.
The affected changes were reimplemented against the current WED-360 contracts.

## Verified behavior

- Cookie and bearer dashboard requests use the same authenticated session
  authority, so a reload does not demote a valid cookie session.
- `officiant`, `celebrant` and `marriage celebrant` search intent resolves to
  the canonical `Celebrant` directory category.
- Disabled consultation and quotation-response resources render stable,
  truthful unavailable states instead of leaving a loading panel behind.
- A claimed vendor profile cannot fall back to seeded phone, email or website
  values after the owner has chosen not to publish those fields.
- Until platform enquiries launch, a public celebrant page offers only the
  direct contact methods the vendor published: an RFC `mailto:` action and/or
  a portable Australian `tel:+61...` action. It does not create a fake enquiry
  or send the couple through an unused workspace query string.
- The public quote article sends text only after `Analyse quote`, uses
  `/wedding/quote-extract`, displays exact source snippets and explicit
  `not_found` states, and states that OmnyID did not retain the proposal text.
- Quote arithmetic remains deterministic in the full comparison tool; the LLM
  extraction route does not promote a component subtotal into a package total.

## Local evidence

- `cargo check --lib --tests`: pass.
- Wedding TypeScript suite: 2,273/2,273 pass.
- Wedding public-site metadata, CSP, catalogue and lead-magnet suite: pass.
- Solid TypeScript check: pass.
- Vite production build: pass (1,819 modules).
- Public quote article Playwright smoke: one explicit extraction request,
  source grounded, no retention, 390 px viewport.
- Full quote decoder Playwright smoke: extraction and PDF-share handoff pass;
  browser cache, component-subtotal protection and 390 px viewport pass.

## Hosted evidence

- `SOURCE_COMMIT` and `oracle-runtime-manifest.json` both contain the full
  implementation SHA above.
- Hosted article and celebrant profile return HTTP 200.
- Hosted celebrant profile exposes `tel:+61...`, contains the direct-contact
  disclosure, and has no `source=wedding_enquiry` fallback.
- A synthetic hosted quote (`80 guests`, `$220 per person`, GST included)
  returned schema `quote-extraction.v2`, rate `220`, the exact source sentence,
  `whole_package_amount.state=not_found`, and
  `retained_by_omnyid=false`.
- Platform-funded extraction is fail-closed, rate limited and backed by the
  existing usage ledger with a hard USD 50 weekly cap.
- Final Oracle proof: `STATUS=pass`, manifest verification pass, backup
  verification pass, isolated restore drill pass, `FAILURE_STEP=none`.
  Root and `/var` use were 81% after pruning only inactive Docker builder cache
  and dangling images.
- Proof copy:
  `C:\temp\wt\proofs\wed363-46fb900\postdeploy-exact-image-remote`.

The review-system rollout remains false-default; this release does not broaden
review pilot authority.
