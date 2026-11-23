# OmnyID Weddings Small-Wedding Alignment: Tasks and Handoff

Date: 2026-11-17. Handover section 0 added 2026-11-20 (it overrides anything below that conflicts).
Spec: [omnyid wedding small-wedding alignment spec.md](omnyid%20wedding%20small-wedding%20alignment%20spec.md).
"Spec §6.4" and similar references point there.
Brief: [omnyid wedding small-wedding message alignment.md](omnyid%20wedding%20small-wedding%20message%20alignment.md).
Task IDs: the `WED-373` to `WED-388` range proposed on 2026-11-17 is **withdrawn**. `WED-373` to
`WED-383` now exist in the ledger for other work. Refer to tasks by `T1` to `T16` in this document.
Ledger IDs start at `WED-384` (see section 0.2).
Owner: Codex. Reviewer: Claude.

---

## Completion reconciliation — WED-402, 2026-11-23

The owner's later instructions supersede the old WED-384 website-only scope in section 0. Work was
reconciled against the WED-401 release base (`b1e3d7c929e7cdf02dab294d355d829ed13e1c86`), not the
stale worktree named below.

| Slice | Status | Shipped evidence |
| --- | --- | --- |
| T1–T7 public message | Complete | The soft headline remains general; intimate, micro and larger celebrations are visible on desktop and mobile; sample/claims/privacy smoke guards remain in `wedding/tests/wedding-website-smoke.mjs`. |
| T8 format contract | Complete | `weddingFormatState.ts` contains allowlist parsing, inference, precedence, starter/vendor/next-step tables and non-destructive menu emphasis. |
| T9 AFP/revisions | Complete by extension | Optional format/source fields project in the revisioned intake-profile payload and fingerprint. WED-401's planning-context fingerprint and approval queue remain the revision path; no parallel store or schema was introduced. |
| T10–T11 intake | Complete | Native format radios, range chips, inference-only hint, persistence, explicit-over-extracted precedence, first probe and conservative extraction patterns are wired through the existing intake. |
| T12–T13 defaults/demo | Complete | Format-aware first vendors/starters/next steps, deterministic witness task and 24-person micro demo extend the existing legal, task and decision systems. |
| T14 deep link | Complete | Three keyboard-reachable hero chips use an allowlisted `format`; only the parsed enum reaches account-scoped convenience storage and the wizard clears it after use. |
| T15 menu emphasis | Reconciled complete | The current primary menu has no Seating or Helpers top-level items to collapse. The pure emphasis contract is implemented without deleting any route; existing deep links and the People subviews remain available. |
| T16 quiz bridge | Complete | The quiz has no explicit guest-size question, so its existing result handoff intentionally carries no format and now explains that the couple chooses it privately in the planner. |

Verification for this reconciliation lives in the WED-402 task and release handoff. Any older line
below that says the implementation was absent or Slice B/C was out of scope is historical context,
not current status.

---

## 0. Handover to Codex, 2026-11-20: read this before section 1

### 0.1 Why this exists

On 2026-11-18 the owner found that `https://omnyid.com/wedding/` still showed the old message. The
reason: **none of this brief's copy has been applied anywhere.** It is not on any branch or worktree
(searched all refs for "Plan our kind of wedding", "Only What Matters" and similar). Production
serves the Wedding site as it stood at the latest Codex worktree, which pre-dates the brief.

The brief was written against the working tree of `agent/claude/WED-178`, which is stale. The site
has moved a lot since. **Do not apply the brief or spec as written.** Re-derive each change against
the latest code (section 0.4).

### 0.2 Base: the latest worktree, pinned

| Item | Value |
| --- | --- |
| Base worktree (read-only reference) | `C:/temp/wt/omnyid-wed383`, branch `agent/codex/WED-383` |
| Base SHA (full) | `3ac7ff9457424973d8f96ed656eb70565b1976dc` |
| New task, branch, worktree | `WED-384`, `agent/codex/WED-384`, `C:/temp/wt/omnyid-wed384` |
| Create with | `git worktree add -b agent/codex/WED-384 C:/temp/wt/omnyid-wed384 3ac7ff9457424973d8f96ed656eb70565b1976dc` |

- Before starting, re-run `git worktree list` and `git log --all --oneline -20`. If a newer Wedding
  worktree exists than `WED-383` (anything touching `wedding/` after `3ac7ff94`), stop and ask the
  owner which SHA to pin. Never pick one from memory.
- **Scope (owner decision, 2026-11-20): `wedding/` only.** `WED-384` covers Slice A (website, T1 to
  T7), meaning `omnyid.com/wedding/` and its subpages. Slice B and C (T8 to T16, the `solid-ui/`
  Wedding Planning template, wizard, format field and deep link) are **out of scope** and must not be
  started or registered unless the owner asks. Anything in this document that touches `solid-ui/`
  (including brief `LP-` items that depend on `TPL-`) is deferred: where a website line depends on
  template support, use the fallback wording the brief gives.
- `WED-384` is stacked on top of the `WED-383` worktree's SHA, so it carries WED-383's work. It does not
  commit into the `WED-383` branch, which is under review.
- Provenance (`AGENTS.md`): report toplevel, 40-character HEAD and `git status --short` before every
  build, test and deploy. Stop on mismatch or dirty tracked files.
- **Do not work in, copy from or build from:**
  - the primary checkout `C:/Users/ozans/Desktop/projects/OmnyID` (branch `agent/claude/WED-178`). Its
    `wedding/` is the October version plus 29 files of uncommitted edits. The Ahrefs snippet it holds
    is already in the base.
  - `C:/temp/wt/omnyid-wed383` itself (it is Claude-reviewed work in `review`; don't commit there).
  - any `omnyid-wed33x-release-*` worktree.
- The ledger in the primary checkout is also stale (no entries after `WED-285`). Carry the `WED-384`
  entry into the ledger on your branch, which inherits the `WED-383` ledger. Don't copy the primary's.

### 0.3 What "selectively built" means (binding rules)

1. **Port intent, not files.** Never `git checkout <old-sha> -- wedding/...`, never copy a whole file
   from the primary checkout, and never paste the brief's "Proposed" text over a section without first
   reading that section in the base.
2. **Reconcile first.** Before the first edit, write the reconciliation table (section 0.4, complete
   it for every `LP-`, `SP-` and `MSG-` item) into `.agent/HANDOFF.md`. Each row gets one status:
   `APPLY`, `ALREADY DONE`, `OBSOLETE` or `CONFLICT`, with a grep or line reference as evidence.
   Put `CONFLICT` rows to the owner before editing them.
3. **Change only the rows marked `APPLY`.** After editing, `git diff 3ac7ff94 -- wedding` must show only
   hunks that map to a table row. Revert any other hunk. Do not reformat, reorder or re-indent.
4. **Preserve everything added since 2026-11-17:**
   - the four-context selector (`landing-config.js`, `landing-context.js`, `data-context-*` markup)
   - `wedding-agent.js` and its `?v=` tag
   - the `@graph` JSON-LD (WebSite, WebPage, BreadcrumbList)
   - analytics consent gating (WED-349) and the Ahrefs snippet
   - the `#change-planning`, binder, run-sheet and `#trust-faq` sections
   - the quote decoder, llms and agent directory
5. **Don't restore removed content.** The testimonial slider, the old stats band and the "AFP
   workspace" label are already gone from the base. Don't bring them back to "then fix" them.
6. **Section order is now `how-it-works` → `change-planning` → `vendor-flow` → `preview`.** The smoke
   test locks this (about lines 464 to 468). The brief's order and line numbers are stale.
7. **Hero copy has two sources.** The static HTML is only what crawlers and no-JS visitors see. On load
   `landing-context.js` overwrites the H1, lede and CTA text from `landing-config.js` (default context
   `starting`). Change **both**, keep them consistent, and verify the rendered text in a browser.
   Edit existing contexts only. Don't add or remove a context key, and don't drop the `retrieval`
   fields (the smoke test asserts them).
8. **Cache-bust changed scripts.** If you touch any `wedding/assets/js/*.js` file loaded from a page,
   follow the `?v=` convention from commit `e9c4abb6` ("WED-377 version changed public scripts to refresh
   CDN cached entrypoints"). This prevents a repeat of the "production still shows the old message"
   problem.
9. **Don't leave the smoke test behind.** Update the assertions that lock old copy, and add the T1
   guards against `MSG-03` regressions. Don't loosen unrelated assertions.

### 0.4 Reconciliation seed (checked 2026-11-20 against `3ac7ff94`; re-verify every row)

| Brief item | State in the base | Likely status |
| --- | --- | --- |
| LP-01 title and meta | `<title>` and `<meta description>` are still the old text. The JSON-LD WebPage `name` and `description` repeat them. | APPLY (update the JSON-LD too; check `public-metadata-smoke.mjs`) |
| LP-02 hero | Static H1 is "Less wedding admin. More of a wedding that feels like you." (WED-373). Visible H1 for JS users is `landing-config.js` `starting`: "Less wedding admin. More wedding." CTA text differs between HTML ("Start planning free") and config ("Build my wedding plan"). | CONFLICT: brief's "current" text no longer exists. Decide the hero line with the owner (see 0.6) |
| LP-03 location strip | Smoke-locked, and the text now reads "NSW-first and expanding" with Sydney and Regional NSW. | ALREADY DONE (leave) |
| LP-04 how it works | Section exists (`#how-it-works`). Wording not re-read. | APPLY after re-reading |
| New: `#change-planning` | Not in the brief. | Leave alone, unless a `MSG-` vocabulary item hits it |
| LP-05 vendor flow | Section exists. | APPLY light reword |
| LP-06 preview demo | "Available your date" is still present once. "Hunter Valley", "emma-and-jack" and "AFP workspace" no longer match. | APPLY for the remaining overclaim. Re-read every pane before swapping demo data |
| LP-07 features | "Everything a wedding touches" and "rich, ready plan" are each still present once. | APPLY |
| LP-08, LP-09 images | No `images.unsplash.com` hot-links remain. "Bride and groom" still appears twice (alt text). | APPLY for `MSG-04` alt text and imagery. Gallery hot-link fix is ALREADY DONE |
| LP-10 stats band | "14+", "$2,100" and "97%" no longer appear. | Verify whether a band remains. Likely OBSOLETE or ALREADY DONE |
| LP-11 testimonial slider | "Sydney planning scenario" and "What calmer planning can feel like" no longer appear. | OBSOLETE (confirm the section is gone) |
| LP-12 CTA band | "Start planning free" appears twice (hero and CTA band). | APPLY, reconciled with `landing-config.js` and the owner's decision on the CTA (0.6) |
| LP-13 newsletter | Smoke-locked. | ALREADY DONE (leave) |
| LP-14 footer and modal | Not re-read. | APPLY across all pages that carry the modal |
| SP-01 to SP-04 | Not re-read. Pricing and blog are smoke-locked. | Re-read, then decide |
| MSG-02, MSG-03 | Full-site scan not done. | Scan `wedding/*.html`, `landing-config.js` and `quiz-data.js` for each banned or replaced phrase |

### 0.5 Deploy gate (Oracle; the owner approves each deploy)

- The base contains `WED-383` quote-decoder changes that are in `review` and **not deployed**: 6 files
  (`compare-wedding-venue-quotes.html`, `quote-decoder.js`, `quote-decoder-engine.js`,
  `quote-decoder.css` and two tests). A whole-directory `wedding/` hot-sync from your branch would ship
  them. Either get explicit approval for that, or sync **only** the files the alignment changed, and say
  which you chose.
- Before any sync, hash the server's on-disk `wedding/` files (CRs stripped) against your worktree
  and list every file that differs. Each difference must be explained by a reconciliation row or an
  approved WED-383 file. The server's `wedding/index.html` currently matches the WED-376 to WED-383
  worktrees.
- Use the static hot-sync only. Don't run `deploy-oracle.ps1` (the local `Caddyfile` diff would drop
  the StrollerCheck API). Don't claim deploy status by hand.
- Verify after the sync: the server file's hash equals the worktree's, and a Playwright run of
  `https://omnyid.com/wedding/` at desktop and 375px shows the new **rendered** hero (not only the HTML
  source). Check that the changed scripts load at their new `?v=` URLs.

### 0.6 Decisions the owner still has to make (ask before applying; don't guess)

1. **Hero line and CTA.** The brief's "A smaller wedding. A day that feels like you." and "Plan our
   kind of wedding" are a full pivot. WED-373 already shipped a softer pivot ("…more of a wedding that
   feels like you", "a calmer way to plan your kind of wedding"). Should the four contexts each carry
   the small-wedding framing, or only the default `starting` context? Is the CTA label changed on
   all four?
2. **Large weddings.** The live hero lede says "…an elopement, a micro-wedding or a larger day". The
   brief wants the niche to lead without excluding larger weddings. Confirm the balance.
3. **Pricing line** "one price, whether it's two or forty" (spec D6) stays unpublished until the guest
   cap audit (T2) says it is true.
4. **WED-383 coupling** (section 0.5): ship its files with the alignment, or sync selectively.

### 0.7 First actions, in order

1. Read `AGENTS.md`, the ledger and `HANDOFF.md` on your branch, and sections 0 to 1 here, then the spec
   and brief.
2. Create the `WED-384` worktree from the pinned SHA, and report provenance.
3. Complete the reconciliation table and put it in `HANDOFF.md`. Ask the owner the 0.6 questions that
   block `APPLY` rows.
4. Do T2 (claim audit) and T1 (truth guards) first. Then T3 onward as sequenced in the suggested order
   below.

---

## 1. Handoff

### 1.1 Read first

1. `AGENTS.md`, `.agent/PROJECT_STATE.md`, `.agent/TASKS.yaml`, `.agent/DECISIONS.md`,
   `.agent/HANDOFF.md`.
2. The spec in full. §3 (AFP contract) and §6.11 (file budgets) are binding.
3. Brief §4 and §5. These are the copy deck the website tasks apply.
4. These existing anchors. Consume them rather than re-implementing them:

| Need | Existing code |
| --- | --- |
| Intake profile AFP message | `solid-ui/src/lib/weddingIntakeProfileAfpProjectionState.ts` (`weddingIntakeProfileToAfpMessage`, sent-once guard) |
| Need-to-know AFP message | `solid-ui/src/lib/weddingNeedToKnowAfpProjectionState.ts` (`planning_context`) |
| Approval-gated projection queue | `solid-ui/src/lib/weddingProjectionQueueState.ts` (`intakeProfileItem`), `weddingProjectionDispatchState.ts` |
| Reload from AFP | `solid-ui/src/lib/weddingPersistedWorkspaceState.ts` (`messageToNeedToKnowContext`) |
| Planning context type, probe rules | `solid-ui/src/lib/weddingNeedToKnowProbingState.ts` (`WeddingPlanningContext`, `PROBE_RULES`, `hasGuestCount`) |
| Paste-and-extract | `solid-ui/src/lib/weddingNeedToKnowExtractionState.ts` |
| Intake UI | `solid-ui/src/components/WeddingSiteIntakeWizard.tsx`; its signals live in `ResponseQueueView.tsx` (around line 483) |
| Local draft persistence | `solid-ui/src/lib/weddingTemplateFollowUpLocalState.ts`, `weddingTemplateFollowUpState.ts` |
| Starters, demo | `solid-ui/src/lib/weddingTemplateEntryState.ts`, `weddingTemplateLaunchState.ts` |
| Vendor lead times | `solid-ui/src/lib/weddingVendorLeadTimeState.ts` |
| Legal tasks | `solid-ui/src/lib/weddingAustralianLegalSetupState.ts` |
| Next step | `solid-ui/src/lib/weddingNextStepState.ts`, `components/WeddingNextStepCard.tsx` |
| Menu | `solid-ui/src/lib/weddingWorkspaceMenuState.ts` |
| Deep link | `solid-ui/src/App.tsx` around line 1260; `solid-ui/src/lib/weddingEntrySourceState.ts` |
| First-profile reader to fix | `solid-ui/src/lib/useWeddingVendorOutreachOwner.ts:164` |
| Rust replay (no change needed) | `src/wedding_vendor_replay.rs`, where the latest intake profile already wins |
| Site smoke test | `wedding/tests/wedding-website-smoke.mjs` |

### 1.2 Branches and sequencing

- The current checkout `agent/claude/WED-178` has **uncommitted changes in `wedding/`**, including
  `wedding/index.html`, `blog.html`, `pricing.html`, `user-guide.html`, the blog posts, the CSS/JS
  and the smoke test. **Slice A must not start until those changes are committed** under their own
  task. Don't stage or commit another task's files. If they are still uncommitted, write a note in
  `.agent/HANDOFF.md` and ask the user.
- Branch Slice A from the commit that contains the WED-178 work (or from `main` once WED-178 is
  merged). Branch Slice B from `main` unless `.agent/TASKS.yaml` shows in-progress work in the same
  `solid-ui/src/lib/wedding*` files. In that case, stack on that branch and say so in the PR.
- Before starting each task, check `.agent/TASKS.yaml` for `in_progress` tasks that list the same
  files.
- Use one branch per slice, one PR per slice, and one commit per task with the task ID in the
  subject. Subjects are conventional and at most 50 characters, for example
  `fix(WED-373): remove unverified wedding claims`.

| Slice | Branch | Tasks | Review focus |
| --- | --- | --- | --- |
| A. Website message | `agent/<owner>/WED-373` | T1 → T7 | Truth guards; copy matches the brief and spec §2.1; structure invariants (spec §5.1) |
| B. Template format | `agent/<owner>/WED-380` | T8 → T13 | AFP contract (spec §3); no-format regressions; file budgets |
| C. Connect and emphasise | `agent/<owner>/WED-386` (stacked on B) | T14 → T16 | Deep-link allowlist; menu reversibility |

### 1.3 Constraints (from `CLAUDE.md` and the spec, enforced in review)

- **AFP:** no `MessageSchema` change, no new type or subtype, no required fields, no mutation of a
  sent message. Format changes after sending are **new** superseding messages (spec §3.3). The
  inferred format is never written to AFP (spec §3.4).
- **Files:** wedding-prefixed files must stay under 999 lines. **Don't edit**
  `weddingResponseWorkspaceViewState.ts`: it is at 1038 lines, already over the cap. Respect the line
  budgets in spec §6.11. The only new source file is `weddingFormatState.ts`, plus its test.
- **Code style:** 2-space indent, 100-character lines, no dead code, no `console.log`, no empty
  catches (except the existing convenience-storage pattern, which has a comment), and error messages
  that say what failed, why and how to fix it.
- **Design:** don't invent colours. Website changes are copy, images and markup only, and don't touch
  `style.css` unless a chip needs an existing button class. The wizard keeps its current classes,
  because the visual migration is out of scope.
- **Truth:** no new numeric claim, review, availability or legal claim beyond spec §5.4–§5.6 and the
  audited claims in T2.
- **Inclusivity:** no default bride or gendered pair assumptions, in copy or alt text.

### 1.4 Tests and verification

Run these for every task, before marking it done:

```bash
git rev-parse --show-toplevel && git rev-parse HEAD && git status --short
cd solid-ui && npx tsc --noEmit
cd solid-ui && npm run test:wedding:ci   # typecheck + line budget + site smoke + wedding unit tests
cd solid-ui && npm run build             # Slice B and C, and any task that touches solid-ui
```

Website-only tasks also need desktop and 375px screenshots of the changed sections in the PR.

### 1.5 Definition of done (per task)

1. The acceptance criteria below are met, and every listed test was added or updated and passes.
2. The §1.4 commands pass on a clean tree at the task's commit. Report the full 40-character SHA.
3. One commit for the task, with the task ID in the subject.
4. `.agent/TASKS.yaml` status is updated, and `.agent/HANDOFF.md` has a 3–6 line note covering what
   changed, any spec deviation and its reason, and any open item.
5. Machine-owned build, test, staging and production status is never written manually into project
   state docs.

### 1.6 Ask the user before

- Any production deploy, including the wedding static hot-sync.
- Publishing the pricing guest-count line (spec D6) if the audit is inconclusive.
- Changing any spec §2.2 default.
- Any change outside the files listed in a task.
- Committing or touching another task's uncommitted files.

---

## 2. Files

### 2.1 New

| File | Task | Purpose |
| --- | --- | --- |
| `solid-ui/src/lib/weddingFormatState.ts` | T8 | Format type, labels, allowlist parse, inference, effective format, latest-profile selector, format tables (spec §6.1) |
| `solid-ui/tests/wedding-format-state.test.ts` | T8 | Unit tests (spec §9.1) |

### 2.2 Changed

| File | Tasks |
| --- | --- |
| `wedding/index.html` | T1, T3, T4, T5, T6, T14 |
| `wedding/pricing.html`, `user-guide.html`, `blog.html`, `animal-quiz.html` | T3 (modal and footer), T7 |
| `wedding/assets/images/*` (additions only) | T6 |
| `wedding/assets/js/quiz-engine.js` | T16 |
| `wedding/tests/wedding-website-smoke.mjs` | T1, T3, T14 |
| `solid-ui/src/lib/weddingNeedToKnowProbingState.ts` | T9 (type), T11 (rule) |
| `solid-ui/src/lib/weddingIntakeProfileAfpProjectionState.ts` | T9 |
| `solid-ui/src/lib/weddingNeedToKnowAfpProjectionState.ts` | T9 (only if `planningContext` isn't already serialised whole) |
| `solid-ui/src/lib/weddingProjectionQueueState.ts` | T9 |
| `solid-ui/src/lib/weddingPersistedWorkspaceState.ts` | T9 (≤5 lines) |
| `solid-ui/src/lib/useWeddingVendorOutreachOwner.ts` | T9 |
| `solid-ui/src/lib/weddingTemplateFollowUpLocalState.ts`, `weddingTemplateFollowUpState.ts` | T10 |
| `solid-ui/src/components/WeddingSiteIntakeWizard.tsx` | T10, T12 (review starters), T14 (mount pre-select) |
| `solid-ui/src/components/ResponseQueueView.tsx` | T10 (≤15 lines) |
| `solid-ui/src/lib/weddingNeedToKnowExtractionState.ts` | T11 |
| `solid-ui/src/lib/weddingVendorLeadTimeState.ts` | T12 |
| `solid-ui/src/lib/weddingTemplateEntryState.ts` | T12, T13 |
| `solid-ui/src/lib/weddingAustralianLegalSetupState.ts` | T12 |
| `solid-ui/src/lib/weddingNextStepState.ts`, `components/WeddingNextStepCard.tsx` | T12 |
| `solid-ui/src/App.tsx` | T14 (≤3 lines) |
| `solid-ui/src/lib/weddingEntrySourceState.ts` | T14 |
| `solid-ui/src/lib/weddingWorkspaceMenuState.ts` and the menu component | T15 |
| Matching `solid-ui/tests/wedding-*.test.ts` files | per task |

### 2.3 Not touched

`typescript-sdk/`, `src/` (Rust), `proto/`, `postgres/migrations/`, `wedding/assets/css/*`,
`weddingResponseWorkspaceViewState.ts`, `docs/DESIGN_SYSTEM.md`.

---

## 3. Tasks

### Slice A: Website message (`wedding/`)

#### T1 / WED-373: Remove unverified claims (P0)

- **Spec:** §5.4, §5.5, §5.6, §9.2. Brief LP-10, LP-11, MSG-03.
- **Files:** `wedding/index.html`, `wedding/tests/wedding-website-smoke.mjs`.
- **Steps:**
  1. Replace the stats band values with the spec §5.4 values. Use `6` / "Starter plan documents to
     choose from" for now.
  2. Rewrite the three scenario slides (spec §5.5). Add the visible label, remove the portraits, and
     change the captions to Blue Mountains, Sydney and Sydney.
  3. Replace "NOIM & vendor timing, handled" with the brief LP-02 trust item 2 text.
  4. In the preview vendors pane, replace the "Available your date" tag with "Still to confirm: your
     date".
  5. In the preview files pane, replace the "AFP workspace" label and the AFP strip text with the
     brief LP-06 text.
  6. Add smoke assertions 1–3 from spec §9.2.
- **Acceptance:** the §5.6 strings are gone; exactly two "Sydney planning scenario" captions remain;
  the smoke test passes; the new guards fail if any removed string is restored. Prove this by
  temporarily reverting one string locally. Don't commit that.
- **Depends:** WED-178 changes committed (§1.2).
- **May ship alone** after owner approval.

#### T2 / WED-374: Claims audit (read-only)

- **Spec:** §8.1. Brief TASK-P1-05, TPL-12.
- **Files:** none changed. Output goes in the PR description for Slice A and a `.agent/HANDOFF.md`
  entry.
- **Steps:** for each claim in spec §8.1, cite the file and function, or the test, that proves it,
  or mark it **unproven**. For partner sharing, find whether any test asserts that private ledger,
  diary or chat items aren't visible to a collaborator.
- **Acceptance:** every claim is proven or unproven, with a citation. T3, T4 and T7 apply the "If
  missing" column for each unproven claim.
- **Depends:** none. It can run before or alongside T1.

#### T3 / WED-375: Hero, meta, CTA band, footer, modal

- **Spec:** §5.1, §5.2 (LP-01, LP-02, LP-12, LP-14), §2.1 D1. Brief LP-01, LP-02, LP-12, LP-14.
- **Files:** `wedding/index.html`; footer blurb and modal register text in `pricing.html`,
  `user-guide.html`, `blog.html`, `animal-quiz.html`; `wedding/tests/wedding-website-smoke.mjs`.
- **Steps:**
  1. Apply the title, meta, eyebrow, H1, lede, CTA text, microcopy, sign-off and floating cards
     ($7,800 of $12,000).
  2. Apply the CTA band copy, with the secondary CTA reading "Explore small-wedding ideas".
  3. Change the footer blurb and modal text on all five pages.
  4. Add smoke assertion 5 from spec §9.2.
  5. **No chips yet.** They belong to T14.
- **Acceptance:** spec §5.1 invariants hold; one primary CTA in the hero; every "Plan our kind of
  wedding" link has `auth=register&source=wedding`; the microcopy follows T2's free-tier result.
- **Depends:** T1, T2.

#### T4 / WED-376: How it works, vendor flow, features, moments copy

- **Spec:** §5.2 (LP-04, LP-05, LP-07, LP-09). Brief LP-04, LP-05, LP-07, LP-09.
- **Files:** `wedding/index.html`.
- **Steps:** apply the copy. Step 2 reads "See your next decisions" (spec §5.2 note). Include the
  features card 1 partner sentence **only** if T2 proved it.
- **Acceptance:** section anchors and order are unchanged, and the smoke test passes. The copy uses
  only the brief MSG-01 spine and MSG-02 vocabulary.
- **Depends:** T3.

#### T5 / WED-377: Landing preview demo scenario

- **Spec:** §4, §5.2 (LP-06). Brief LP-06.
- **Files:** `wedding/index.html`.
- **Steps:**
  1. Run the §4 name check against the `wedding_vendors` directory and a web search. Rename any name
     that clashes, and record the result in the PR.
  2. Replace all seven panes' demo content with the §4 values. Keep the tabs, rail, classes and
     `data-*` attributes.
  3. Change the draft email recipient to `celebrant@example.com`.
- **Acceptance:** no "90 guests", "Hunter Valley", "seats 120/150" or `.com.au` demo address remains;
  the decision pane uses `.mock-decision-opt.pick` for the best fit; the preview tabs still work
  (manual click-through).
- **Depends:** T1 (the shared pane edits are already done there).

#### T6 / WED-378: Imagery

- **Spec:** §5.3, §7. Brief MSG-04, LP-02, LP-08, LP-09.
- **Files:** `wedding/index.html`, new files in `wedding/assets/images/`.
- **Steps:**
  1. Choose the hero image. Review the spec §5.3 candidates visually first.
  2. Replace the four gallery hot-links with local images that meet MSG-04.
  3. Replace moments image 2.
  4. Write alt text with no gender assumptions.
  5. Record the licence and source for each new image.
- **Acceptance:** no `images.unsplash.com` in `index.html` (add smoke assertion 4); no bridal-only or
  large-crowd image in the hero, gallery or moments; every image has a recorded licence.
- **Depends:** T3.

#### T7 / WED-379: Pricing, user guide, blog hub

- **Spec:** §5.2 (SP-01..SP-03), §2.1 D6 and D9. Brief SP-01..SP-03.
- **Files:** `wedding/pricing.html`, `wedding/user-guide.html`, `wedding/blog.html`.
- **Steps:**
  1. **Pricing:** change the meta description and the CTA band H2. Add the guest-count line only if
     T2 proved there is no guest limit.
  2. **User guide:** add the small-wedding callout, change the H2 and the meta description.
  3. **Blog:** change the H1. Move these existing cards to the top of `#blogGrid`, in this order:
     how-to-elope, small-ceremony-big-reception, legal checklist, find a celebrant, questions to ask
     a celebrant, non-religious celebrant, same-sex celebrant, first five decisions, reducing
     overwhelm.
- **Acceptance:** the pricing smoke strings are unchanged; blog card count equals post count; no
  draft post is published.
- **Depends:** T2, T3.

### Slice B: Template format (`solid-ui/`)

#### T8 / WED-380: `weddingFormatState.ts` module

- **Spec:** §6.1, §6.5–§6.8 (tables), §9.1.
- **Files:** new `solid-ui/src/lib/weddingFormatState.ts` and
  `solid-ui/tests/wedding-format-state.test.ts`.
- **Steps:**
  1. Implement the spec §6.1 API.
  2. Put the format tables in the module: must-decide-first categories, recommended starters, next
     steps (with their ids, labels and menu targets) and menu emphasis.
  3. Reuse `hasGuestCount` and any existing integer parsing. Don't duplicate them.
- **Acceptance:** <300 lines; pure functions; all spec §9.1 `wedding-format-state` cases pass;
  `<script>` and unknown inputs parse to `null`.
- **Depends:** none.

#### T9 / WED-381: AFP fields, revisions, latest-wins readers

- **Spec:** §3 (all), §6.2 (types), §9.1 projection-queue cases.
- **Files:** `weddingNeedToKnowProbingState.ts` (type only), `weddingIntakeProfileAfpProjectionState.ts`,
  `weddingNeedToKnowAfpProjectionState.ts` (only if needed), `weddingProjectionQueueState.ts`,
  `weddingPersistedWorkspaceState.ts` (≤5 lines), `useWeddingVendorOutreachOwner.ts`, and the tests.
- **Steps:**
  1. Add `weddingFormat` and `weddingFormatSource` as optional fields on `WeddingPlanningContext`.
  2. Intake profile: add the spec §3.2 optional `content`, `views`, `searchable_terms` and
     `supertags` entries, only when a format is set.
  3. Confirm that `wedding_need_to_know` already serialises `planningContext` whole. If it does, there
     is no code change in that file. Add a test that asserts the field round-trips.
  4. Projection queue: implement the spec §3.3 revision path. Add a builder for revision messages next
     to `weddingIntakeProfileToAfpMessage` that takes `parentMessageId` and the revision `sourceId`.
     The base id is never re-queued once sent.
  5. Readers: replace the `.find` at `useWeddingVendorOutreachOwner.ts:164` with
     `latestWeddingIntakeProfileMessage`. In `weddingPersistedWorkspaceState.ts`, overlay the latest
     profile's `wedding_format` onto the reloaded need-to-know context.
- **Acceptance:**
  - A profile without a format is byte-identical to today's output (snapshot test).
  - A revision has `parent_id`, a `supersedes` reference, `supersedes_message_id` and **full**
    content.
  - Revisions go through the approval-gated queue.
  - A reload picks the latest profile.
  - No `MessageSchema`, Rust or migration diff (`git diff --stat` shows only the listed files).
  - `weddingPersistedWorkspaceState.ts` stays under 999 lines.
- **Depends:** T8.

#### T10 / WED-382: Wizard format control, guest chips, copy

- **Spec:** §6.3, §7, §2.1 D8. Brief TPL-01 (UI), TPL-02, TPL-03.
- **Files:** `WeddingSiteIntakeWizard.tsx`, `ResponseQueueView.tsx` (≤15 lines),
  `weddingTemplateFollowUpLocalState.ts`, `weddingTemplateFollowUpState.ts`, and the tests.
- **Steps:**
  1. Add the format signal and its draft persistence (follow the `celebrantPath` pattern at
     `ResponseQueueView.tsx` lines 483, 539, 564, 787 and 1220).
  2. Add the radio group as the first control in step 0.
  3. Add the guest chips, the help text and the read-only "Sounds like" hint.
  4. Apply the copy table.
- **Acceptance:**
  - The format persists across reloads of the draft. An old draft without the format loads
    unchanged.
  - The chips write into the existing field.
  - The inferred hint never sets the format.
  - Keyboard-only completion works.
  - "Make our starter plan" is the review CTA.
  - Wizard <999 lines.
- **Depends:** T9.

#### T11 / WED-383: Probe rule and extraction

- **Spec:** §6.4, §9.1. Brief TPL-01 (probing), TPL-09.
- **Files:** `weddingNeedToKnowProbingState.ts`, `weddingNeedToKnowExtractionState.ts`, and the tests.
- **Steps:**
  1. Add the `wedding_format` slot and the rule as the first entry in `PROBE_RULES`, with the
     guest-count fallback in `isAnswered`.
  2. Change the guest-count suggested answers.
  3. Add the extraction patterns. They produce a suggestion with source `extracted`. They must not
     overwrite an explicit choice.
- **Acceptance:**
  - **Regression test:** a set of existing fixture contexts that have a guest count gives the same
    `nextQuestion` and `isReadyForFirstRecommendations` before and after.
  - `coreAnswered` is unchanged.
  - The bare word "intimate" gives no format.
- **Depends:** T9.

#### T12 / WED-384: Format-aware defaults and legal essentials

- **Spec:** §3.6, §6.5, §6.6, §6.7. Brief TPL-04, TPL-05, TPL-08, TPL-11.
- **Files:** `weddingVendorLeadTimeState.ts`, `weddingTemplateEntryState.ts`,
  `weddingAustralianLegalSetupState.ts`, `weddingNextStepState.ts`, `WeddingNextStepCard.tsx`,
  `WeddingSiteIntakeWizard.tsx` (review starter preselect), and the tests. Also `wedding/index.html`
  for the LP-04 step 2 wording and the stats `3` value (spec §5.4), only after the template changes
  pass.
- **Steps:**
  1. Make the vendor must-decide-first categories and the ranking format-aware, with the optional
     format parameter.
  2. Make the starter recommendations and prompts format-aware. Add the review-step preselect rule.
     Update `description` and `firstResponseInstruction`.
  3. Add the witness task: deterministic id, elopement and micro only.
  4. Add the next-step ladder, reading the format through `weddingFormatFromWorkspace`, and the
     elopement witness label. Audit the `menuId` targets and record them in the PR.
  5. Add the format chip and "Change" control on `WeddingNextStepCard`, wired to the T9 revision path.
  6. Update the website step 2 wording and the stats value.
- **Acceptance:**
  - Each format's first three steps match spec §6.7. `wedding_date` stays first.
  - `larger` and `null` snapshots equal today for the lead times, starters and ladder.
  - Elopement plans always include the NOIM and witness tasks.
  - Changing the format on the card queues a revision. It never edits the base profile.
  - `weddingResponseWorkspaceViewState.ts` has no diff.
- **Depends:** T9, T10, T11.

#### T13 / WED-385: Template demo scenario

- **Spec:** §4, §6.10. Brief TPL-07.
- **Files:** `weddingTemplateEntryState.ts` (`buildWeddingTemplateDemoState`) and
  `wedding-template-entry-state.test.ts`.
- **Steps:** replace the harbour demo with the §4 scenario. Keep all sample labels and `.invalid`
  contacts.
- **Acceptance:** the demo's `planningContext` has `guestCount: 24` and `weddingFormat: "micro"`;
  `demoLabels` is unchanged; there is no `@example.com`/`.com.au` real-looking address in the
  template demo; the venue names match the landing preview after the T5 name check.
- **Depends:** T5 (name check), T9.

### Slice C: Connect and emphasise

#### T14 / WED-386: Deep-link format and hero chips

- **Spec:** §6.9, §2.1 D2, §9.2 assertion 6. Brief TPL-10, LP-02 (chips).
- **Files:** `App.tsx` (≤3 lines), `weddingEntrySourceState.ts`, `WeddingSiteIntakeWizard.tsx` (mount
  preselect), `wedding/index.html` (chips), the smoke test, and `wedding-entry-source-state.test.ts`
  and `wedding-template-deep-link-launch-state.test.ts`.
- **Steps:**
  1. Add the save, load and clear helpers.
  2. Read `format` only for wedding or marketing sources, parsed through the allowlist.
  3. In the wizard, preselect the pending format with source `deep_link`, then clear it.
  4. Add three chips under the hero CTAs.
- **Acceptance:**
  - `?auth=register&source=wedding&format=elopement` preselects "Just us".
  - `format=<script>`, `format=larger%00` and an unknown value do nothing.
  - The raw value never reaches the DOM, storage or AFP.
  - The chips are reachable by keyboard and don't add a second primary CTA.
  - Smoke assertion 6 passes.
- **Depends:** T10, T3.

#### T15 / WED-387: Menu emphasis by format

- **Spec:** §6.8. Brief TPL-06.
- **Files:** `weddingWorkspaceMenuState.ts`, the menu component (locate it; record the path in the
  PR), and `wedding-workspace-menu-state.test.ts`.
- **Steps:** apply `weddingMenuEmphasis`. Add the "Show all tools" toggle with per-plan
  `localStorage` storage, failing open if storage is unavailable.
- **Acceptance:**
  - Elopement collapses Seating and Helpers. Micro suppresses the seating badge until there is an
    RSVP. Other formats are unchanged.
  - `weddingMenu=seating` still opens Seating and reveals it.
  - No menu id is removed.
- **Depends:** T12.

#### T16 / WED-388: Quiz result bridge

- **Spec:** §6.9 (quiz bullet). Brief SP-04.
- **Files:** `wedding/assets/js/quiz-engine.js` (and `quiz-data.js` only if a mapping table is
  needed), `wedding/animal-quiz.html` only if markup is required.
- **Steps:**
  1. Audit the quiz for an explicit guest-size answer.
  2. If one exists, map it to a format and add a one-line bridge on the result screen linking to
     register with `&format=`. If none exists, link without `format`, and record that in the PR.
  3. Audit the quiz answers for large-reception assumptions and list them in the PR. Don't rewrite
     them in this task.
- **Acceptance:** the quiz still runs end to end; the bridge link passes smoke assertion 6; no
  validity claims are made.
- **Depends:** T14.

### Suggested order

```
Slice A:  T2 ─┐
          T1 ─┴─► T3 ─► T4 ─► T7
                    ├─► T6
          T1 ─► T5
Slice B:  T8 ─► T9 ─► T10 ─► T11 ─► T12
                 └──────────► T13 (needs T5 name check)
Slice C:  T12 ─► T15
          T10 + T3 ─► T14 ─► T16
```

---

## 4. Out of scope (follow-ups to register separately)

| Brief ID | Follow-up |
| --- | --- |
| TASK-P2-04 / TPL-12 | Partner invite after the first saved decision, with a permissions preview. Gated on T2 proving the private/shared boundary. |
| TASK-P2-05 | Small-wedding lead magnets and posts (one-page elopement essentials, guest-list wording templates, 10/30/80 guide); publishing draft posts from `Documents/`. |
| TASK-P2-06 | Visual migration of the landing CSS and `WeddingSiteIntakeWizard` to the Deep Teal wedding tokens. |
| TASK-P2-07 | 15–20 couple interviews by format; re-scope the positioning survey quotas. |
| TASK-P2-08 | Activation-by-format measurement using existing analytics only. |
| — | Re-projecting **non-format** intake changes after the profile is sent. Today only the first profile is sent. T9 adds revisions for format changes, and each revision carries the full current profile, but other edits alone still don't trigger one. |

---

## 5. Verify before each deploy

1. Report the provenance: toplevel, the 40-character HEAD SHA and `git status --short`. The tree is
   clean.
2. `cd solid-ui && npm run test:wedding:ci && npm run build` passes at that SHA.
3. **Website:** use the static hot-sync procedure only. Check that the local `Caddyfile` diff is not
   shipped. After the sync, check `https://omnyid.com/wedding/` with Playwright on desktop and 375px,
   and run the smoke test.
4. **Template:** follow the `CLAUDE.md` deploy checklist, and confirm there are no pending migrations
   (none are expected from this work).
5. The owner has approved this specific deploy.
