# Wedding consent, analytics and encryption audit — 9 November 2026

Status: implementation audit and verification record for WED-349. This is a technical assessment, not a declaration of legal compliance. Australian privacy wording, overseas disclosure and provider terms should still be reviewed by an Australian privacy professional.

## 1. Couple opt-in: what the code now says and does

The onboarding checkbox in `solid-ui/src/components/WeddingSiteIntakeWizard.tsx` is unticked by default and says:

> **Share content-free progress statistics with OmnyID**
>
> Optional and unticked by default. Authorised administrators can count whether this wedding completes onboarding, saves a vendor or resolves a decision. Names, contact details, messages, drafts, budget, guest count, quiz answers, files and vendor choices are excluded. Declining does not change your planner. You can change this later in Documents.

The same preference is shown and can be withdrawn in Documents through `solid-ui/src/components/WeddingWorkspaceDocumentsPanel.tsx` and `solid-ui/src/lib/weddingAdminDataConsentState.ts`. Both locations link to `/wedding/privacy.html#product-statistics`.

The default is also false at the database boundary in `postgres/migrations/0135_wedding_onboarding_admin_data_consent.sql`. The choice is stored per user and wedding plan in `wedding_user_onboarding_state.admin_data_consent`; it is not a browser-only toggle. `src/db/wedding_onboarding_state.rs` records changes in `wedding_admin_data_consent_events` with the subject IDs, enabled/disabled state, notice version and time, but no wedding content.

When enabled, `src/db/growth_activation_projection.rs` permits only these durable, already-saved AFP projections:

- `wedding_plan_saved` from a saved intake profile;
- `vendor_saved` from a vendor explicitly selected for follow-up;
- `budget_saved` from a resolved budget decision; and
- `decision_resolved` from a resolved wedding decision.

The projection stores event type, plan/account identifiers, source AFP message identifier and event time. It does not copy the underlying budget, selected vendor, guest count, draft, message or plan content. Access to the aggregate growth dashboard is feature-flagged and restricted to the configured operator allowlist in `src/server/growth_dashboard_routes.rs` and `src/server/cost_controls.rs`.

When the user turns the preference off, `src/server/user_management_routes/wedding_admin.rs` calls `remove_growth_activation_for_wedding` in `src/db/growth_activation_projection.rs`. It removes that plan's growth wedding, activation-source, activation and activity rows, then rebuilds affected aggregate day rollups. Aggregate counts that no longer identify a plan may remain as described in the notice.

### Previous mismatch fixed

The previous UI said that generated plans and responses would be copied anonymously, but the UI only built a local display packet and no such copy was implemented. Separately, the private AFP growth projector did not require this consent. WED-349 removed the false copy claim and now makes the projector fail closed unless the stored preference is true.

## 2. Public website analytics is a separate choice

`wedding/assets/js/privacy-preferences.js` provides an Essential/Analytics choice on public Wedding pages. Essential is always on; Analytics is off until selected. Declining does not block the quote decoder, blog, vendor directory or account entry. Global Privacy Control and Do Not Track force Analytics off. A persistent **Privacy choices** control lets a visitor change the selection; withdrawal stops future optional loading after the page reload.

Only after opt-in does the controller activate:

- the first-party script in `wedding/assets/js/measure.js`; and
- Ahrefs Web Analytics.

The first-party payload contains a random tab-scoped visit identifier, bounded acquisition/referrer fields, device class, two-letter browser language, landing path, named interaction events and bucketed performance/error data. It does not include form values, messages, budgets, guest counts or account identity. Its raw session/event rows are pruned after 30 days by `src/db/wedding_site_measurement.rs`; day-level aggregate counts can remain.

Ahrefs is third-party analytics. Its official documentation says it is cookie-free and does not store raw IP addresses or track a visitor across days, but it does process page URL and parameters, referrer, user agent, screen information, language, IP-derived city/country, a daily pseudonymous identifier, and automatic page/link/form events. OmnyID does not describe that data as anonymous. The public notice explains that Ahrefs is a separate provider and that processing may occur outside Australia.

No session-replay SDK or deliberate recording of page text, keystrokes, form values, plan contents or messages was found in the audited Wedding public analytics path. This finding is limited to the code inspected in this repository; provider-side behaviour remains governed by the provider terms.

## 3. Encryption and access boundaries

The code does not support a blanket claim that every item is end-to-end encrypted.

- `src/crypto.rs` supports recipient-held X25519 envelopes for selected vendor-email material. The server creates an ephemeral key and does not receive the recipient private key, so possession of the server environment alone cannot later decrypt that envelope.
- The same module also supports a legacy XChaCha20-Poly1305 envelope protected by the server-wide `OMNYID_ENCRYPTION_KEY_HEX`. Server processes that possess this key can decrypt that material. The key is also used to derive encryption-at-rest keys for BYOK secrets and OAuth tokens.
- `/agent/keys` is deliberately blocked with HTTP 501 in `src/server/mod.rs`; the server-wide key is not returned to authenticated clients. The older browser helper in `solid-ui/src/lib/decrypt.ts` therefore does not establish per-user E2EE for those legacy envelopes.
- `src/db.rs::store_private_message` stores ciphertext for encrypted storage modes, but also supports modes whose content/metadata projections are readable by the server. AFP identifiers, timestamps, types, references and growth event metadata are not concealed by content encryption.
- SeaweedFS credentials are read server-side from the secret manager/environment in `src/daemon_runtime.rs` and are not exposed to the browser. Stored-object encryption depends on the upload path and retention choice; it is not safe to claim that every object in SeaweedFS is end-to-end encrypted.

Accordingly, authorised infrastructure operators may be able to access server-readable plaintext, server-held keys and operational metadata. The consent implemented here does not grant administrators access to private planning content; it grants only the bounded product-statistics projection above.

## 4. Minimal measurement design and limitations

The implemented design measures progression using one content-free event per durable action, rather than capturing screens or contents:

1. Require an explicit, unticked, plan-scoped opt-in.
2. Project only saved intake, saved-vendor and resolved-decision AFP events.
3. Use the AFP source message ID as the idempotency boundary so a retry does not double-count.
4. Keep public analytics consent independent from signed-in product-statistics consent.
5. Restrict dashboard access to an operator allowlist and retain an audit record for preference changes.
6. Remove plan-level product-statistics rows on withdrawal and rebuild aggregates.

Technical limitations:

- event metadata is pseudonymous/identifiable operational data, not automatically anonymous;
- an authorised database operator can associate a plan/account identifier with an account;
- already transmitted Ahrefs events cannot be recalled by changing a local preference;
- aggregate rollups cannot reliably be subtracted after they have been irreversibly de-identified or exported; and
- the repository cannot prove the provider's internal retention beyond its published terms.

Screen-sharing research and recording are deliberately outside this preference. They require a separate invitation, purpose statement and explicit consent, with recording consent asked separately.

## 5. Questions for privacy review

An Australian privacy professional should confirm:

- whether the public notice and just-in-time wording adequately describe overseas disclosure and Ahrefs processing;
- whether the selected retention periods are proportionate to the stated purposes;
- the appropriate controller/processor and deletion terms with Ahrefs and infrastructure providers;
- whether any future event or URL could reveal sensitive information and therefore require a stronger express-consent flow; and
- how aggregate statistics and backups should be handled after account deletion or withdrawal.

## 6. Verification evidence

The WED-349 candidate is verified by automated checks covering:

- no Ahrefs or first-party optional analytics request before opt-in;
- essential-only use of the quote decoder;
- a single Ahrefs activation after opt-in;
- withdrawal and GPC preventing later activation;
- an unticked default for signed-in product statistics;
- consent-gated AFP growth projection and deletion on withdrawal;
- absence of private values in approved activation projections;
- canonical metadata and CSP coverage; and
- a permanent redirect from the accidental doubled quote URL to the canonical quote page.

The exact commands and release SHA are recorded in `.agent/HANDOFF.md` when the candidate is frozen.
