# Five named celebrants and two celebrant blog posts: handoff for the next agent (2026-11-23)

Prepared by Claude for whichever agent builds from the latest Wedding line. **Nothing here is committed, deployed or
written to any database.** Everything is staged, uncommitted, in the worktree below.

## 0. Read first

- **Worktree:** `C:/temp/wt/omnyid-wed406`, branch `agent/claude/WED-406`, created from
  `1b104ff1fad67206ef419e2f667ad2472a229441` (tip of `agent/codex/WED-404`, also the base of `WED-405`, the newest
  line on 2026-11-23). Registered as task `WED-406` (status `review`) in that worktree's `.agent/TASKS.yaml`.
- **Do not build or deploy from that worktree.** It is dirty by design. Per `AGENTS.md` Build Provenance, apply the
  files in section 5 onto your own branch from the then-current tip (re-check `git for-each-ref --sort=-committerdate
  refs/heads` first; if something newer than `1b104ff1` exists, rebase onto it), commit, then build from a clean checkout
  of the exact SHA.
- **Overlap check:** `WED-405` (in progress) owns `solid-ui/src/**`; this work touches only `wedding/blog*`,
  `docs/sitemap.xml`, one smoke test, `Documents/**` and `.agent/**`. No overlap found.
- **Line endings:** about 22 public pages show as `M` in `git status` but have an empty `git diff` (LF versus CRLF stat
  noise left by the generators). Do not `git add` them.
- **Machine-owned status:** nothing here claims Build, Tests, Staging or Production state. Section 6 lists what I ran
  locally, which is not release evidence.

## Part A. Celebrants (data only)

### A1. What was asked, and what I found

The user named five celebrants and asked for them to be added to the vendor database. Four are **already staged**
as register-only rows from the AG-register import (`celebrants-nsw-register-import-2026-11-18`, 1,913 rows parsed). Each
website phone number equals the register phone for the same person, which is how identity was confirmed. Per the
vendor playbook (existing rows win, enrich blank fields only), those four are **additions**, not new rows. The fifth is not
in the staged register batch, so it is a **new record**.

| Vendor id | Type | Site (business) | Adds to the register row |
|---|---|---|---|
| `celebrant-nicole-webster` | addition | nicolethecelebrant.com.au (Nicole The Celebrant) | website, email, Instagram, Facebook, services, summary, 12 tags, years (25, estimated), inclusivity tags |
| `celebrant-amanda-knapton` | addition | acelebrationday.com.au (A Celebration Day) | website, email, Instagram, Facebook, services, summary, 12 tags, price from $750, years (18, estimated) |
| `celebrant-jordan-vassallo` | addition | jordanvassallocelebrant.com.au (Jordan Vassallo Celebrant) | website, email, Instagram, Facebook, services, summary, 12 tags |
| `celebrant-cerys-rhian-murphy` | addition | marriedbycerys.com (Married By Cerys) | website, email, Instagram, services, summary, 12 tags |
| `celebrant-pauline-appiah-dwyer` | **new** | yourmemorablemoment.com.au (Your Memorable Moment) | whole record, price from $350, 12 tags, no phone |

Register names are the vendor names (for example "Cerys Rhian Murphy" is the register name; the site shows only "Cerys").
Trading names are kept in `evidence`, not as the vendor name, to match the other register rows and the A-Z surname sort.

### A2. Files

- `celebrants_src.py`: hand-written source (`ADDITIONS`, `NEW`). Edit here, never the outputs.
- `build.py`: builds and validates. Run `python -I build.py "C:/Users/ozans/Desktop/projects/OmnyID/Documents/design/wedding planner/celebrants-nsw-register-import-2026-11-18/sql/*.sql"` from this folder. The register folder exists only in the primary checkout (untracked), so its glob is an argument. It fails if an addition has no staged
  register row, a new record collides with one, a tag count is outside 8 to 13, or a source host is a directory.
- `celebrants_2026-11-23.json`: `new_vendors` (1, with an `attributes` array) and `existing_vendor_additions` (4, each with
  `fill`, `evidence_extra`, `extra_style_tags`, `extra_description`, `attributes`, `flags`).
- `celebrants_2026-11-23.csv`: flat copy of all five (`record_type` is `addition` or `new`).

### A3. Facts worth knowing (as read 2026-11-23)

- **Pricing published:** Pauline legals-only $350, co-presented $450, tailor-made $850; $150 non-refundable deposit
  within 7 days, balance due 14 days before. Amanda lists "from" prices: legals only $750 (Mon to Thu), elopement
  $2,080 / $2,300 (Mon to Thu / Fri to Sun and public holidays), mini $3,710 / $4,270, maxi $6,020 / $6,670, designer
  $9,010 / $9,750, bundling a photographer and florals from partner suppliers. Nicole, Jordan and Cerys publish **no
  fees**. Only Pauline's and Amanda's lowest figure is stored in `price_estimate_total_aud`; the rest of each price
  ladder is in `price_note`.
- **Contacts:** emails, Instagram and Facebook were re-read from raw page HTML on 2026-11-23, except Cerys's contact page
  (the email is on her home page). Pauline's site blocks plain `curl` with ModSecurity; a browser-style request worked.
  Pauline has **no phone published** (`needs_phone_lookup`); `contact_form_url` is her contact page.
- **Years:** Nicole's site says "Est. 2001" and "25+ years" on the home page but "over 20 years" on the About page (stored
  25, estimated, flagged). Amanda became a celebrant in 2008 (stored 18, estimated). Jordan's "20 years" is theatre
  experience, not celebrancy, so none is stored. Pauline and Cerys state none.

### A4. Flags the owner should see before publishing

- **Unverified claims, deliberately not stored as ratings or awards:** Jordan's "Australia's #1 Male Celebrant", "Best
  Celebrant in NSW", "300+ five-star reviews" and a reality-TV mention (no issuer named); Cerys's "3rd place, Best
  Celebrant in NSW"; Amanda's "ABIA finalist"; Pauline's membership of a celebrants network. They are flags only
  (`*_claim_unverified`).
- **Pauline is not matched to the register.** Her name is not among the 1,913 staged register rows. That could be a
  different registered surname, a gap in the NSW sheet, or an unregistered business. Do not mark her registered. Leave
  `register_source_url` null on her pilot-profile row and verify on the AG register.
- **Site inconsistencies:** Pauline's pages disagree on where she is based ("Western Sydney" versus "Sydney") and on the
  travel threshold (150 km versus 200 km). Amanda's site still has placeholder lorem-ipsum blocks and a "password
  protected" notice on a page that is readable. Jordan's register suburb is Box Hill but the site says Sydney metro; only
  two of his pages were readable.
- **Gmail contact:** Cerys's only email is a Gmail address (`contact_email_is_gmail`).
- **Open owner decision from the 2026-11-18 batch still applies:** whether to publish emails and phones of individuals on
  active listings. These five are sole traders publishing the details on their own sites for enquiries.

### A5. How to load

Follow `../photographers-import-2026-11-12/HANDOFF.md` ("How to load") and the attribute keys in
`src/server/wedding_vendor_search_routes/attribute_catalog.rs`. Specifics:

1. **Check the four ids exist first**, for example `SELECT vendor_id FROM wedding_vendors WHERE vendor_id IN (...)`. The
   register SQL is not committed in the repo (it was applied through private scripts for WED-376), so I could not confirm
   production state. If a row is missing, load the 2026-11-18 register batch first or skip that addition.
2. **Additions:** update `wedding_vendors` only where the column is NULL (`website_url`, `contact_email`). Never overwrite
   `vendor_name`, `contact_phone` or `service_area`. Merge `evidence_extra` into `evidence` without disturbing
   `import_batch`, `contact_basis` or `celebrant_profile.sort_key`; set `celebrant_profile.editorial_summary` from
   `extra_description` only if you want it to replace the generic register sentence. Append `flags` to `caveat_labels`.
3. **Attributes:** insert each `attributes` row into `wedding_vendor_attributes`; `ON CONFLICT (vendor_id, attribute_key)
   DO UPDATE` only when the existing authority is not `operator` or `vendor_reply`. Authority is `primary_official`.
4. **New record (Pauline):** insert into `wedding_vendors` with `ON CONFLICT (vendor_id) DO NOTHING`; `category` is exactly
   `Celebrant`; put `contact_form_url`, `instagram_url`, `services`, `trading_name`, `price_note`, `contact_basis` and
   `celebrant_profile.sort_key` (`appiah dwyer, pauline`) into `evidence`. Then add her
   `wedding_celebrant_pilot_profiles` row exactly as the register SQL does, leaving registration `pending`.
5. Do not mint availability or management links here; that stays an operator step (see memory: management links cannot be
   made offline).

## Part B. Two celebrant blog posts

### B1. What was written

Both are original pieces. They use the celebrant's blog only for angles (the legal role, writing the ceremony, running the
room, booking timelines, short-notice weddings, choosing by feel, celebrant versus registry, MC continuity, wet weather). No
sentences were copied, **no personal, business or venue names appear** (checked by search), and the anecdotes are labelled
as composites, not real weddings.

| Slug | H1 | Category | Cover |
|---|---|---|---|
| `what-does-a-marriage-celebrant-do-wedding-day` | What does a marriage celebrant actually do? | Ceremony | `redd-francisco-y4bE8ST_CTg-unsplash.jpg` (already in repo, unused) |
| `when-to-book-a-wedding-celebrant-and-find-the-right-vibe` | When to book a wedding celebrant, and how to find the right fit | Vendors | `commons-signing-the-book.jpg` (already in repo) |

They are distinct from the existing celebrant posts (`how-to-find-a-marriage-celebrant-in-australia`,
`questions-to-ask-a-wedding-celebrant`, `wedding-celebrant-fees-australia`, `how-to-elope-in-australia-celebrant`,
`non-religious-marriage-celebrant-ceremony`, `same-sex-wedding-celebrant-australia`) and link to all of them.

### B2. SEO done before handover

- Shortened H1/title (43 and 63 characters); 150-character meta descriptions; one H1 each; question-style H2/H3 headings
  with answer-first intros.
- Generated by the repo's own tooling: canonical, Open Graph, Twitter, `article:published_time`, `Article` and
  `BreadcrumbList` JSON-LD (via `scripts/reconcile-wedding-seo.mjs`), search-tags meta and in-article topic chips (via
  `scripts/reconcile-wedding-blog.ps1`), and `docs/sitemap.xml` entries with `lastmod` 2026-11-23
  (`scripts/generate-public-sitemap.ps1`). A second SEO run changed nothing.
- A visible four-question FAQ on each page with matching `FAQPage` JSON-LD (the generator preserves it).
- Descriptive alt text on covers and related-card images; internal links to six existing guides plus each other; related
  cards use local images only (the CSP allows self-hosted images).
- Taxonomy entries added to `wedding/blog-taxonomy.json`; cards added to `wedding/blog.html`; two rows added to the
  publication catalogue CSV (the generator's refresh of every other row's `last_verified` date was reverted on purpose to
  keep the diff small).
- `docs/llms.txt` was not changed: it lists only the original-data articles by design.
- **Not done (owner-only):** Google Search Console and Bing Webmaster sitemap submission or URL inspection, and rich-result
  validation (needs the deployed URL).

### B3. Check before publishing

- Skim the legal statements: notice of intended marriage at least one month and no more than 18 months before the wedding,
  two adult witnesses, required statement and vows, lodging within 14 days, and "in some limited circumstances the notice
  period can be shortened". They match the existing vetted posts but are general information.
- The first post's cover is an overseas autumn ceremony; the alt text describes it neutrally.
- Publish with the static hot-sync of `wedding/` plus `docs/sitemap.xml`, following Build Provenance and the
  production-safe-development skill. Do not claim deploy status by hand.

## 5. What to take from `C:/temp/wt/omnyid-wed406`

New files:
- `wedding/blog/what-does-a-marriage-celebrant-do-wedding-day.html`
- `wedding/blog/when-to-book-a-wedding-celebrant-and-find-the-right-vibe.html`
- `Documents/marketing/wedding planning/posts/blog/what-does-a-marriage-celebrant-do-wedding-day.html` and
  `.../when-to-book-a-wedding-celebrant-and-find-the-right-vibe.html` (editorial copies the generator maintains)
- `Documents/design/wedding planner/celebrants-import-2026-11-23/` (this folder)

Modified files (small diffs; `git diff` shows only these):
- `wedding/blog-taxonomy.json` (2 entries)
- `wedding/blog.html` (2 cards)
- `docs/sitemap.xml` (2 URLs)
- `Documents/marketing/wedding planning/posts/blog/blog-publication-catalogue.csv` (2 rows)
- `wedding/tests/blog-catalogue-smoke.mjs` (`expectedArticleCount` 71 to 73)
- `.agent/TASKS.yaml` and `.agent/HANDOFF.md` (carry the `WED-406` entries onto your branch rather than copying whole files)

Suggested commits (subject at most 50 characters): `feat(WED-406): add two celebrant guides` for the posts, taxonomy,
cards, sitemap, catalogue and test; `docs(WED-406): stage five celebrant records` for this folder and the ledger.

## 6. Verification I ran (local, uncommitted tree at `1b104ff1`; not release evidence)

From `C:/temp/wt/omnyid-wed406`: `node wedding/tests/public-metadata-smoke.mjs` (95 sitemap pages),
`wedding-website-smoke.mjs`, `blog-catalogue-smoke.mjs` and `security-csp-smoke.mjs` all printed their pass line. Both posts
parse with balanced tags. `python -I build.py <register glob>` in this folder exits 0 (1,913 register rows parsed). Not run: the Playwright browser smokes, `tsc`,
`cargo`, a clean-checkout build, and any rich-result validator.

## 7. Recommended next action

1. Pick the base (section 0), carry the files in section 5, commit as suggested, rerun the four smoke suites on your SHA.
2. Verify the four register ids exist, then load Part A with the blank-fill rules, and look up Pauline on the AG register.
3. Hot-sync the two posts, `blog.html`, taxonomy-driven pages and `docs/sitemap.xml`, then submit the two URLs in Search Console.
