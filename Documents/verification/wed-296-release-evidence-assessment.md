# WED-296 release evidence assessment

Date: 2026-10-29

This assessment connects the owner's completed-human-review authorization to the autonomous evidence already produced in this repository. It does not replace or reconstruct private reviewer notes.

## Accuracy and ranking

- The reviewed ranking corpus contains 40 cases and 480 scores per reviewer.
- The reviewers agree on 477 of 480 scores (99.375%). The three disagreements remain visible in the corpus rather than being silently resolved.
- Policy V2 treats unknown evidence conservatively, preserves hard vetoes, fingerprints its policy version, and has deterministic regression coverage.
- The five fictional quotation fixtures exercise extraction, normalisation, missing-item, escalation and comparison behavior. Conditional facts remain labelled as conditional.
- The owner explicitly accepted the completed human reviews and authorised Policy V2 and quotation-intelligence release. This is an accountable release decision, not a claim that the implementing agent independently observed every private session.

## Mail and provider behavior

- Worker, ingress, SMTP and provider tests cover signature rejection, replay, cross-tenant denial, bounded MIME processing, recipient allowlisting, complaint/bounce idempotency and no-retry behavior.
- Disposable ClamAV evidence covers clean content, EICAR and unavailable fail-closed behavior.
- The controlled provider rehearsal records outsider refusal, one accepted/received enquiry, one correlated reply, exact replay suppression, and restoration to the disabled routing baseline.
- The earlier live run did not retain a provider-observed permanent-bounce receipt or Gmail Show-original authentication export. The owner has nevertheless stated that all human reviews are complete and authorised release. Runtime allowlisting, provider readiness and independent kill switches remain enforced.

## Hosted and human acceptance

- The workbooks enforce exact source/runtime identity, hosted URL, evidence digest, action completion, named authority and final sign-off context.
- Browser regression coverage confirms keyboard focus continuity, persistence, candidate invalidation and final-export blocking.
- Existing hosted accessibility and couple-session preflights are committed. The owner states that the corresponding human accessibility, couple, vendor/copy and cohort reviews have since been completed.
- No private reviewer identity, participant identity or raw session content was supplied to the implementing agent; none is invented here.

## Release boundary

- Quotation features remain fail-closed unless `OMNYID_QUOTATION_RELEASE_GATE=verified`, the schema version is exact and the evidence binding is hexadecimal.
- Policy V2 remains default-off in source and is activated only in the production UI build.
- Vendor mail remains separately controlled by mail, sender-mask, ingress, exact-recipient allowlist and provider-readiness checks.
- Deployment, health, runtime identity or provider-readiness failure overrides this approval and stops the affected feature.
