# OmnyID Weddings — Small-Wedding Message Alignment

> **Change brief v1.0** | 17 November 2026 | Input to an implementation spec
> **Inputs:** `omnyid wedding brand strategy.md` (brand strategy), `omnyid wedding positioning.md`
> (positioning research), `wedding landing page/PGJ framework landing page redesign.md` (journey
> framework), current `wedding/` site (working tree on `agent/claude/WED-178`), and the Wedding
> Planning template in `solid-ui/`.
> **Status:** Proposal. No code has been changed. Every item below needs a spec, an owner and
> acceptance tests before implementation.

---

## 0. How to read this document

This brief lists **what to change, where, and why**. It is not the spec. Each change has a stable ID
so a spec can cite it:

| Prefix | Scope |
| --- | --- |
| `MSG-` | Cross-cutting message rules (vocabulary, claims, imagery) |
| `LP-` | `wedding/index.html` landing page, in current section order |
| `SP-` | Secondary wedding pages (pricing, user guide, blog, quiz, vendors) |
| `TPL-` | Wedding Planning template in `solid-ui/` |
| `TASK-` | Prioritised, dependency-ordered work items (section 7) |

Each change gives the **current** state, the **proposed** state, the **reason** (with a source
reference) and **constraints** (tests, truth rules, AFP rules).

### 0.1 Change intensity rule

The goal is to **adjust the message, not rebuild the product**. A change belongs in this brief only if
it meets all of these:

1. It keeps the existing section order on `/wedding` (section 2 below).
2. It keeps existing routes, components, the sign-in bridge, the newsletter and the quiz.
3. It changes copy, demo data, image choices, defaults or the order of existing options, or it adds
   one small **optional** field.
4. It doesn't remove capability for larger weddings. Large-wedding tools are **de-emphasised by
   default**, not deleted.

Explicitly **out of scope** for this pass:

- The PGJ four-context selector, contextual demos and campaign-intent engine from the PGJ framework
  doc. They aren't implemented today, and building them would be a redesign.
- Migrating the landing site palette (rose/sage/gold/cream in `wedding/assets/css/style.css`) to the
  Deep Teal × Warm Porcelain tokens. The brand strategy wants this (§6), but it is a visual project.
  Track it separately (see `TASK-P2-06`).
- A brand rename, new logo or new mark. The brand strategy itself says to keep the existing
  lock-up (§6.3).

### 0.2 Resolving the conflict between the two source documents

The two inputs disagree on the target customer:

| Topic | Positioning research | Brand strategy (newer, 17 Nov 2026) | Decision for this brief |
| --- | --- | --- | --- |
| Target couple | Has a venue/date booked, **60–100 guests**, collecting quotes | **24–33**, eloping (≈0–10 guests) or micro wedding (≈11–40) | **Brand strategy governs audience and message.** |
| Campaign line | "Take back control of your wedding." | "Only What Matters" / "Small by Choice" | Use the brand strategy lines. Keep "control" only as a proof theme (approval, privacy). |
| Proof points | Budget visibility, quote normalisation, approval-first, privacy, AI drafts but doesn't decide | Decision-first, honest supplier status, shared plan, legal essentials | **Keep both.** The positioning proof points still hold for small weddings and are what the product already does. |
| Market numbers | A$38,252 average spend, 23% overshoot, 85 average guests | These are whole-market survey figures, **not** elopement or micro-wedding figures | Don't use average-wedding figures on the small-wedding page or to imply savings. |
| Research plan | 500-respondent psychographic, willingness-to-pay and brand-recognition survey | 15–20 interviews first, by format | Run the interviews first. Re-scope the survey quotas to the new audience before fielding (`TASK-P2-07`). |

---

## 1. The narrowed audience in one page

**Who:** Greater Sydney couples where at least one partner is **24–33**, planning an **elopement**
(about 0–10 invited guests) or a **micro wedding** (about 11–40 guests), plus **undecided
downsizers**. Age is used for media targeting only. The product never asks for it and never gates on it.

**Core belief:** "A wedding should reflect us, not what other people expect."

**Main job:** Decide what kind of day we want, then coordinate just enough to make it happen with
confidence.

**Three entry paths:** the brand strategy (§3.2) says not to merge these into one workflow.

| Path | Format label in UI | First three decisions | Essentials that must stay visible |
| --- | --- | --- | --- |
| Elopement | **Just us** | Ceremony style and place · Celebrant and legal timing · Witnesses and photography | NOIM (at least 1 month, at most 18 months before), authorised celebrant, **two adult witnesses**, location permission, weather plan |
| Micro wedding | **Our closest people** | Guest-count range · Venue or meal format · Budget priorities | Legal ceremony, capacity, supplier inclusions, RSVPs, accessibility, weather plan |
| Undecided | **Not sure yet** | What the day means to each of us · 10 vs 30 vs 80 trade-offs · Non-negotiables | No supplier shopping until the format feels settled |

**Not the priority, but never excluded:** large weddings, older couples, blended families,
cultural ceremonies, LGBTQIA+ couples and couples with accessibility needs. The niche is a
**planning style**, not an identity.

---

## 2. The existing landing-page flow, mapped to the customer journey

The current `/wedding` page already follows the PGJ journey states (J0–J7). **Keep this order.** The
smoke test enforces part of it: `how-it-works` → `vendor-flow` → `preview`.

| # | Current section (anchor) | Journey state | Job of the section | Change level |
| --- | --- | --- | --- | --- |
| 1 | `<head>` title and meta | J0 search entry | Match the search intent | **Rewrite copy** (`LP-01`) |
| 2 | Hero | J0–J1 latent need, problem recognition | "Is this for us?" | **Rewrite copy, swap image** (`LP-02`) |
| 3 | Location strip ("Sydney") | J2 relevance | Local fit | Keep (test-locked) (`LP-03`) |
| 4 | How it works (`#how-it-works`) | J2 solution exploration | "What happens if we start?" | **Reword steps** (`LP-04`) |
| 5 | Vendor reply flow (`#vendor-flow`) | J3 consideration, mechanism proof | "Does it actually help?" | Light reword (`LP-05`) |
| 6 | Workspace preview (`#preview`) | J4 evaluation | "Show me" | **Replace demo data** (`LP-06`) |
| 7 | Features ("Why couples choose OmnyID") | J3–J4 differentiation | "Why not a spreadsheet?" | **Reframe 6 cards** (`LP-07`) |
| 8 | Gallery strip | Emotional re-anchor (G6) | Feeling | **Swap images** (`LP-08`) |
| 9 | Moments ("The moments this is all for") | Emotional re-anchor (G6) | Feeling | **Swap images, retitle** (`LP-09`) |
| 10 | Stats band | J4 proof | Credibility | **Replace: unverified numbers** (`LP-10`) |
| 11 | Planning scenarios (testimonial slider) | J4 social proof | "People like us" | **Rewrite as labelled scenarios** (`LP-11`) |
| 12 | CTA band | J5 decision | Convert | Reword (`LP-12`) |
| 13 | Newsletter | J7 advocacy | "Know someone…" | Keep (test-locked) (`LP-13`) |
| 14 | Footer and sign-in modal | J5–J6 handoff | Continuity into the product | Light reword (`LP-14`) |

---

## 3. Cross-cutting message rules (`MSG-`)

### MSG-01 — Message spine

Use only these levels on the site and in the template. Don't put more than one campaign line on a
screen (brand strategy §5.1).

| Level | Copy | Where it may appear |
| --- | --- | --- |
| Three-word phrase | **Only What Matters** | Hero sign-off, CTA band, footer, quiz result. Not on controls. |
| Main promise | **Your wedding, your way. Without the overwhelm.** | Meta title support, CTA band, sign-in modal |
| Product description | **A wedding planner for meaningful, smaller celebrations.** | Meta description, footer blurb, pricing lede |
| Campaign line | **Small by Choice** | Ads, blog hub and social only. **Not** on the homepage hero. |
| Product ritual | **Keep. Skip. Decide.** | How it works, quiz result, template onboarding |
| Primary CTA | **Plan our kind of wedding** | Hero and CTA band (replaces "Start planning free" as button text) |

"Intentional" is an internal association word. Don't put it in customer copy.

### MSG-02 — Vocabulary swaps (site and template)

| Replace (current) | With | Reason |
| --- | --- | --- |
| "Plan your whole wedding, end to end" | "Plan the parts that matter to you both" | "Whole/end to end" signals a large-wedding checklist (brand §4.4) |
| "Everything a wedding touches" | "Everything your day actually needs" | Same reason |
| "rich, ready plan" / "a full picture arrives at once" | "your first three decisions" | Three decisions, not a giant checklist (brand §7.1) |
| "command centre", "operations room" | "one shared plan" | Too heavy for the niche |
| "Bride", "bride and groom" as the default address | "you both", "your people", "couples" | Inclusive address (brand §4.4) |
| "Hidden-cost warnings" as a headline benefit | "See what's included before you say yes" | Keep the feature, soften the alarm framing |
| "AFP workspace", "first-class AFP messages", "artifacts" | "your plan", "saved files" | No internal architecture terms for visitors (PGJ §2) |

**Terms to repeat:** intimate wedding, elopement, micro wedding, your kind of day, the essentials,
what matters, next decision, best fit, still to confirm, planning together.

**Terms to avoid:** princess, fairy-tale, dream wedding, luxury for less, bride-to-be as the universal
address, wedding hacks, cheap, "AI wedding planner" as a headline.

### MSG-03 — Truth rules (apply before any copy ships)

From brand strategy §7.5 and §9, and the template spec's guardrails:

1. **No unverified numbers.** No hours saved, dollars saved, coverage percentages or counts of weddings
   planned unless measured and sourced.
2. **No first-person quotes** that look like reviews unless they are real and permissioned.
   Illustrative copy must be labelled as such, next to the quote.
3. **No live-availability claims** ("Available your date") unless backed by a dated source. Use
   "Ask to confirm" or "Last checked".
4. **No legal overclaims.** "NOIM reminders" is fine. "NOIM handled" is not. The celebrant is the
   authority.
5. **"Minimal" never means skipping legal or safety steps.** The elopement path keeps NOIM, celebrant,
   two adult witnesses and the weather plan.
6. **"Only What Matters" always means "to you both".** It is about choice, not mandated minimalism.
   Family rituals and cultural ceremonies can be what matters most.

### MSG-04 — Imagery rules

From brand strategy §6.4.

- **Show:** two people interacting, a celebrant guiding a small ceremony, a table for 8–20,
  signing the register, handwritten vows, small considered details, Sydney settings (registry,
  garden, small restaurant, permitted coastline, home).
- **Avoid:** bridal-only imagery, church exits with large crowds, empty ballrooms, 200-guest
  spectacle, defaulting to mountain-cliff elopements, heavy romantic haze.
- **Inclusivity:** include varied couples without treating anyone as a prop.
- **Text over photos:** never put small white text over a complex photo. Use a cream panel next to
  the photo instead.
- **Licensing:** every image needs a recorded licence or source. Unsplash and Wikimedia Commons files
  already in `wedding/assets/images/` keep their existing attribution handling.

---

## 4. Landing-page changes (`LP-`), in page order

> Line references are to `wedding/index.html` in the current working tree. Re-check them against
> the deployed page before writing the spec, because the working tree has uncommitted changes.

### LP-01 — `<head>` title and meta (lines 6–7)

| | Copy |
| --- | --- |
| **Current title** | `OmnyID Weddings — Plan your wedding end to end, without the overwhelm` |
| **Proposed title** | `Elopement & Micro Wedding Planner Sydney \| OmnyID Weddings` |
| **Current description** | "A calm, private planning workspace for couples. Budget, vendors, timeline, guest list and every decision — organised in one place, remembered for good." |
| **Proposed description** | "Plan an elopement or intimate Sydney wedding around what matters to you. Compare the essentials, organise your budget and make decisions together with OmnyID Weddings." |

**Reason:** Brand strategy §8.2 draft SEO title and meta. It matches the new search clusters
("elopement planner sydney", "micro wedding planner sydney").
**Constraint:** Check search-result competition before locking. Don't add "Sydney" to supplier
pages that don't serve Sydney.

### LP-02 — Hero (lines 41–74)

| Element | Current | Proposed |
| --- | --- | --- |
| Eyebrow | `✦ Planning, made calm` | `✦ Weddings, your way` |
| H1 | "Plan your whole wedding, end to end — without losing your evenings." | **"A smaller wedding. A day that feels like you."** |
| Lede | "OmnyID turns 'we have no idea where to start' into a clear plan. Venues, vendors, budget, guest list and timeline, organised in one private workspace that remembers every decision so you don't have to." | "Plan an elopement or intimate wedding around the people, places and moments you care about. Make clear decisions, compare the essentials and keep the plan together, privately." |
| Primary CTA text | "Start planning free" | **"Plan our kind of wedding"** (same `href`: `../workspace/?auth=register&source=wedding`) |
| Microcopy under CTA | — | "Free to start. No card needed." (already true per the CTA band and pricing) |
| Secondary CTA | "See how it works ↓" | Keep |
| Sign-off | — | Small serif line: **Only What Matters** |
| Trust item 1 | "Private by default — We never sell or transfer your data" | Keep |
| Trust item 2 | "Built with AU couples in mind — NOIM & vendor timing, handled" | "Made for Sydney couples — NOIM and celebrant timing reminders" (fixes the "handled" overclaim, `MSG-03.4`) |
| Hero image | `elvis-bekmanis-…jpg`, alt "Bride and groom embracing under her veil in a golden wheat field" | A small-ceremony or two-person image that meets `MSG-04`. Candidates to review in the existing folder: `commons-signing-the-book.jpg`, `commons-vietnam-candlelit-glasses.jpg`, `commons-same-sex-wedding-rainbow-bunting.jpg`. Write new alt text that describes the scene without assuming genders. |
| Floating card A | "128 days to go · Venue booked · caterer next" | "Your next 3 decisions · Ceremony spot · Celebrant · Witnesses" |
| Floating card B | "Budget on track · $18,400 of $30,000 planned" | "Budget on track · $7,800 of $12,000 planned" (scaled to a micro wedding, still clearly demo data) |

**Optional, additive (recommended):** add a single row of three link-chips under the CTAs:
**Just us** · **Our closest people** · **Not sure yet**. Each chip is a plain link to the same
register URL with `&format=elopement|micro|undecided`. There's no JavaScript state, no form and no
change to the layout above the fold. It is the smallest change that delivers the brand strategy's
"choose your format" step (§5.2, §7.2) without building the PGJ selector. It depends on `TPL-01` and
`TPL-10`. Without them, the parameter is ignored safely.

**Constraints:**
- The smoke test (`wedding/tests/wedding-website-smoke.mjs:195`) only checks that any
  "Start planning free" text links to `auth=register`. Renaming the button passes, as long as every
  register CTA keeps `auth=register`.
- The header must not contain "Start planning" (test line 308). The header doesn't change.
- Keep exactly **one** primary CTA in the hero viewport. The chips are styled as secondary links.

### LP-03 — Location strip (lines 77–84)

No change. "Built for couples planning across **Sydney**" is test-locked (line 281) and matches the
Sydney-first decision.

### LP-04 — How it works (lines 87–117)

Keep four step cards and the anchor. Rewrite them around **Keep. Skip. Decide.** and the three-decision
start.

| | Current | Proposed |
| --- | --- | --- |
| Section H2 | "From 'where do we even start' to a plan you trust" | "Start with what matters. Skip the rest." |
| Section lede | "Four calm steps. No spreadsheets to build from scratch, no forty-tab browser windows, no forgotten deposit dates." | "Four calm steps. No 100-item checklist, no large-wedding defaults, no forgotten NOIM date." |
| Step 1 | "Tell us the essentials" — rough date, region, guest count, budget comfort | **"Choose your kind of day"**: just us, our closest people, or not sure yet. Then a rough date, place and budget comfort. "Not sure" is always an answer. |
| Step 2 | "Get a rich, ready plan" — "A full picture arrives at once…" | **"See your first three decisions"**: a short list for your format instead of a giant checklist. Eloping? Ceremony, celebrant and witnesses come first. |
| Step 3 | "Approve, don't guess" | Keep the meaning: **"Approve, don't guess"**. Every enquiry and share is a draft until you both say yes. |
| Step 4 | "Everything, remembered" | **"Keep it together"**: budget, suppliers, legal dates and decisions in one shared plan, so either of you can pick it up. |

**Reason:** Brand strategy §5.2 proof module and §7.1. Step 2 also removes the "instant full plan"
promise that the PGJ framework warns against (§5, Getting Started).
**Constraint:** Step 1 and step 2 claims depend on `TPL-01` and `TPL-05`. If those don't ship
first, step 2 must read "See your next decisions" without the format-specific example.

### LP-05 — Vendor reply flow (lines 120–153)

Keep the section, the screenshot and the four steps. They are the strongest mechanism proof and are
test-locked by position.

| | Current | Proposed |
| --- | --- | --- |
| Eyebrow | "✦ When a vendor replies" | "✦ When a supplier replies" |
| H2 | "Vendor replies land in one place, with a reply ready for you to approve." | "Celebrant, photographer or venue replies land in one place, with a reply ready for you to approve." |
| Lede | Keep | Keep. Add one sentence: "With fewer suppliers, each choice matters more, so you can see exactly what's included before you say yes." |
| Step 2 body | "…based on what you've told us matters to you." | Keep (already on-message) |

**Screenshot:** `vendor-reply-flow.png` shows "Chloe's Florals, $799, $200 over the floral budget".
That's acceptable at small-wedding scale, so leave it for now. Optionally re-shoot later with a
celebrant or photographer quote.

### LP-06 — Workspace preview (lines 156–330)

Keep all seven tabs, the layout and the interactions. **Replace the demo scenario** from a 90-guest
Hunter Valley wedding with a **24-guest Sydney micro wedding**, and fix three truth issues.

| Pane | Current demo content | Proposed demo content |
| --- | --- | --- |
| URL bar | `omnyid.com/plan/emma-and-jack` | `omnyid.com/plan/sam-and-alex` (gender-neutral names) |
| Overview, plan summary | "Autumn wedding, ~90 guests, Hunter Valley region…" | "Autumn micro wedding, 24 guests, Inner West Sydney. Priorities: a personal ceremony, a long dinner with our closest people, good photos." |
| Overview, at a glance | Budget 61% · RSVP 34% · Vendors booked 4/9 | Budget 58% · RSVPs 18 of 24 · Suppliers booked 2 of 4 |
| Overview, why this matters | Wet-weather backup for an outdoor ceremony | Keep the concept. Reword for a garden ceremony with 24 guests. |
| Timeline | Venue secured · NOIM lodged · Caterer deposit · Final numbers · 128 days | Restaurant booked · NOIM lodged with celebrant · Two witnesses confirmed · Final numbers to restaurant · Ceremony day |
| Budget | $30,000 total; venue $8.4k, catering $6.9k… | ~$12,000 total; dinner and venue, photography, celebrant, attire. Keep one "Not yet included" flag (soft wording, `MSG-02`) |
| Vendors | "Caterer shortlist — Hunter Valley", seats 120/150; tag **"Available your date"** | "Small venue shortlist — Inner West": three restaurant or private-room options seating 20–40; tags **Best fit** · **Still to confirm: your date** · **Min. spend applies**. **Remove "Available your date"** (`MSG-03.3`). |
| Decisions | Marquee +$1,900 vs indoor barn | "Ceremony spot: Garden ceremony + dinner (best fit) vs Registry ceremony + private dining room". This uses the existing `.mock-decision-opt.pick` left-edge style, which is the brand's decision-edge motif. |
| Drafts | Tasting enquiry to a caterer | Enquiry to a celebrant or restaurant: "…24 guests, ceremony in the garden at 4pm…" Keep both buttons. |
| Files | Includes "Guest travel & accommodation map", "Gift registry draft"; status bar **"AFP workspace"**; strip "Files, Calendar and Tasks stay first-class AFP messages…" | Replace with "Celebrant questions", "Budget sheet", "Venue comparison", "Run sheet (one page)". Change the status bar to "Private · source-linked · export-ready". Change the strip copy to "Everything you save stays searchable and connected to the decision it came from." |

**Section copy:** H2 "One screen. Every part of your wedding, at a glance." becomes **"One screen.
Your whole (smaller) wedding, at a glance."** or keep the current H2. The sub-line stays.
**Constraint:** All names are fictional and the preview is clearly demo data. Keep it consistent with
`TPL-07` so the landing preview and the in-product demo tell the same story.

### LP-07 — Features (lines 333–385)

Keep six cards and their icons. Change the section heading and the card copy.

| | Current | Proposed |
| --- | --- | --- |
| Eyebrow | "✦ Why couples choose OmnyID" | Keep |
| H2 | "Everything a wedding touches, in one calm place" | **"Everything your day needs. Nothing it doesn't."** |
| Lede | "Not a rigid checklist app. A private planning partner that adapts to your wedding, your culture, and your pace while keeping every artifact searchable through OmnyID." | "Not a 100-item checklist. A private planning partner that starts from your kind of day, respects your traditions and moves at your pace." |
| Card 1 | Private by design | Keep. Add: "Plan together with separate sign-ins. Your personal notes stay yours." **Only if** `TASK-P1-05` confirms the separation works. |
| Card 2 | Deadlines that keep themselves (NOIM, RSVP, deposits) | **"Legal dates, kept in view"**: NOIM window, celebrant timing and the two-witness requirement, with time to act. Reminders don't replace your celebrant. |
| Card 3 | Budget that stays honest | **"Spend where it counts"**: estimated vs confirmed vs paid, per supplier, so the money goes to the moments you'll remember. |
| Card 4 | Vendor shortlists with real reasons | **"Fewer options, better reasons"**: every suggestion shows why it fits, what's known, and what's still to confirm. |
| Card 5 | "Venues, vendors and guests, mapped": travel time, accommodation clusters | **"Right-sized places"**: small venues, restaurants and ceremony spots compared on capacity, minimum spend and wet-weather plan. Maps stay as a supporting detail. |
| Card 6 | Nothing sent without you | Keep |

**Reason:** Brand pillars (§4.3): personal by design, fewer and better decisions, honest
confidence, planning together, human at the moment that matters. Card 5 removes the guest-logistics
framing that suits 100-guest destination weddings.

### LP-08 — Gallery strip (lines 388–397)

The four hot-linked Unsplash images ("Bride in wedding dress", "Couple on their wedding day",
reception table, rings) become four `MSG-04`-compliant images: a small ceremony, a table for about 12,
signing the register, a two-person candid. Prefer local files in `wedding/assets/images/` over
hot-links (performance, and to prevent upstream image swaps).

### LP-09 — Moments (lines 400–412)

| | Current | Proposed |
| --- | --- | --- |
| Eyebrow | "✦ Real days, made calmer" | "✦ Small by choice" (campaign line, allowed here as a section label, `MSG-01`) |
| H2 | "The moments this is all for" | **"The moments that matter most"** |
| Image 2 | `mark-zamora-…jpg`: "Bride and groom exiting the church through a bubble send-off with guests" | Replace with a small-group or two-person moment (crowd exit conflicts with the niche) |
| Images 1 and 3 | Garden aisle (aerial) and reception table | Review. The table can stay if it reads as about 20 guests or fewer. |

### LP-10 — Stats band (lines 415–436): truth fix, priority P0

| Current stat | Problem |
| --- | --- |
| "14+ hrs — Planning hours organized per month" | Unmeasured and ambiguous |
| "$2,100 — Hidden costs surfaced before booking" | No source. Reads as a savings claim. |
| "97% — Target deadline coverage once calendar sync is enabled" | A target dressed as a result |
| "0% — Of your data ever sold or shared" | Supported by policy. Keep. |

**Proposed:** Keep the band component and the count-up animation, but replace the content with
**verifiable product facts**:

| Value | Label |
| --- | --- |
| **3** | First decisions, not a 100-item checklist (only if `TPL-05` ships; otherwise use "1 shared plan") |
| **2** | Partners, one shared plan (only if `TASK-P1-05` confirms it) |
| **1 month** | Minimum NOIM notice we remind you about (official rule, AG Department) |
| **0%** | Of your data ever sold or shared (keep) |

**Reason:** Brand strategy §9 ("Never fabricate… comparison savings"). PGJ acceptance criteria
("No… fake performance metrics").

### LP-11 — Planning scenarios slider (lines 439–474): truth fix, priority P0

The current slides are first-person quotes with stock portrait photos and named couples, captioned
"… planning scenario". A visitor will read them as testimonials. Two of them assume large-wedding
problems.

**Proposed:** Keep the slider component. Rewrite the three slides as **clearly illustrative
scenarios**, one per format:

| Slide | Caption (keep the test-required pattern) | Scenario copy (illustrative) |
| --- | --- | --- |
| 1 | "Hunter Valley planning scenario" becomes **"Blue Mountains planning scenario"** (or keep it) | *Elopement:* "Just the two of us, a celebrant and two witnesses. The plan started with three decisions: where, who marries us, and who takes the photos." |
| 2 | "Sydney planning scenario" | *Micro wedding:* "Twenty-two people and one long table. We put the money into dinner and photos and skipped the rest." |
| 3 | "Sydney planning scenario" | *Undecided:* "We compared 10, 30 and 80 guests side by side before we booked anything. Thirty felt like us." |

**Rules:**
- Add a visible label inside each slide: **"Illustrative scenario. Not a customer review."**
- Remove the stock **portrait** photos, or replace them with non-face detail images, so the slides
  don't imply real people.
- Change the section H2 from "What calmer planning can feel like" to **"What 'our kind of wedding'
  can look like"**.
- Replace the slides with real, permissioned stories when they exist (brand strategy §9, proof stack
  item 4).

**Constraint:** The smoke test requires exactly **two** "Sydney planning scenario" captions and
forbids "Byron Bay" or "Melbourne" captions (lines 284–288). The proposal keeps exactly two.

### LP-12 — CTA band (lines 477–488)

| | Current | Proposed |
| --- | --- | --- |
| H2 | "Your wedding deserves a plan you can trust." | **"Your wedding, your way. Without the overwhelm."** |
| Body | "Start free, no credit card. Upgrade only when you're ready for full end-to-end planning." | "Start free, no credit card. Begin with your first three decisions, and upgrade only if you want the full planner." |
| Primary | "Start planning free" | "Plan our kind of wedding" (same `href`) |
| Secondary | "Read planning guides" → `blog.html` | **"Explore small-wedding ideas"** → `blog.html` (optionally filtered to the elopement and micro posts, see `SP-03`) |
| Sign-off | — | **Only What Matters** |

### LP-13 — Newsletter (lines 491–508)

No copy change. `<p>Subscribe to our newsletter</p>` and the Subscribe button are test-locked
(line 342). "Know someone about to get married?" is already an advocacy (J7) prompt.

### LP-14 — Footer and sign-in modal

| | Current | Proposed |
| --- | --- | --- |
| Footer blurb | "A private planning workspace for couples — part of the OmnyID personal agent. Your day, organised and remembered, with your data never for sale." | "A wedding planner for meaningful, smaller celebrations, part of OmnyID. Your day, your way, with your data never for sale." |
| Modal lede (all pages) | "…the same personal agent that holds your budget, calendar, email drafts and files…" | Keep. Optionally shorten to "OmnyID Weddings runs in your private OmnyID workspace." |
| Modal register option | "…OmnyID sets up your private wedding workspace." | "…OmnyID starts your plan with your kind of day." |

The modal text appears on every page (`index`, `pricing`, `user-guide`, `blog`, `animal-quiz`).
Change it in all of them at once to keep them consistent.

---

## 5. Secondary page changes (`SP-`)

### SP-01 — Pricing (`wedding/pricing.html`)

- **Keep the plans and prices.** "$39 AUD / one-off" and the free-tier wording are test-locked
  (smoke test lines 336–340).
- Meta description: lead with "Simple, honest pricing for elopements and intimate weddings…", then the
  current plan facts.
- Add one supporting line under the H1: "One price, whether it's just the two of you or forty of
  your favourite people." This is true because the plan is one-off and not per guest. Confirm there
  are no guest caps first.
- CTA band "Ready to stop juggling tabs?" becomes "Ready to plan only what matters?"

### SP-02 — User guide (`wedding/user-guide.html`)

- Add a short "If you're eloping or keeping it small" callout near the top. It covers which
  workspace areas to start with (Plan, Budget, Timeline, People for witnesses) and which can wait or be
  ignored (Seating, Registry, Helpers).
- H2 "Use the workspace as your planning command centre" becomes "Use the workspace as your one
  shared plan" (`MSG-02`).
- Meta description: add "elopement" and "intimate wedding".

### SP-03 — Blog hub (`wedding/blog.html`)

Existing posts already serve the niche. **Feature them first**, with no new pages required:

- `how-to-elope-in-australia-celebrant.html`
- `small-ceremony-big-reception-australia.html`
- `micro-wedding` content (`Documents/.../posts/blog/micro-wedding-nsw-venue-minimums.html` exists
  as a draft; publish it if ready)
- `legal-minimum-…` (draft in `Documents/`), `australian-legal-checklist.html`,
  `how-to-find-a-marriage-celebrant-in-australia.html`, `questions-to-ask-a-wedding-celebrant.html`,
  `non-religious-marriage-celebrant-ceremony.html`, `same-sex-wedding-celebrant-australia.html`,
  `the-first-five-decisions.html`, `reducing-wedding-planning-overwhelm.html`

Changes:
- H1 "Calm, practical wedding planning guides" becomes **"Small by choice: guides for elopements
  and intimate weddings"**. Keep the full archive and search.
- Add an "Elopement & small weddings" category filter if the existing filter supports categories.
  Otherwise, pin those posts to the top.
- **Constraint:** The blog card count must equal the post file count (test lines 363–367). Publishing
  a draft post means adding its card.
- Content gaps from brand strategy §8.1, for later content tasks rather than this pass:
  "Kind, firm guest-list message templates", "10 vs 30 vs 80 guests", "Sydney elopement essentials
  (one page)".

### SP-04 — Wedding Animal Quiz (`wedding/animal-quiz.html`, `assets/js/quiz-*.js`)

- Keep the quiz and its routes (PGJ §6).
- On the result screen, add a one-line bridge: "Your answers suggest **[format]**. Start a plan
  shaped for it." The link goes to register with `&format=…` (`TPL-10`). The quiz already writes a
  brief with `source: 'wedding_animal_quiz'`.
- The quiz data (`quiz-data.js`) already contains elopement and micro wording. Audit it for answers
  that assume a large reception.
- Make no claims of psychological validity.

### SP-05 — Vendors directory (`wedding/vendors.html`)

No structural change. Optionally reword the intro to name celebrants, photographers and small venues
first. Don't imply a coverage depth that doesn't exist (brand strategy §3.1, location row).

### SP-06 — Disclosures, Privacy, Unsubscribe, Image licence

No change. These are legal and policy pages, and their wording is test-locked.

---

## 6. Wedding Planning template changes (`TPL-`)

The template is the in-product journey a visitor lands in from `/wedding`. The entry chain is
`?source=wedding` → `App.tsx` `launchWeddingTemplateFromDeepLink()` →
`saveWeddingEntrySource("wedding_site")` → `ResponseQueueView` → **`WeddingSiteIntakeWizard`**
(four steps: The basics → Vendors → Legal & vows → Review).

Today the template is **scale-neutral in code but large-wedding in defaults**. The placeholders say
"80" and "about 90 guests", the demo is a 90–120-capacity harbour wedding, the must-decide-first
vendors are venue and officiant, and seating, registry and helpers carry equal weight.

**Design rule for every `TPL-` item:** add an **optional** format signal, then use it only to
**change defaults, ordering, emphasis and copy**. Never remove a capability, never add a required
field, and never block a larger wedding.

### TPL-01 — Optional wedding format field (foundation)

- **What:** Capture `weddingFormat: "elopement" | "micro" | "undecided" | "larger"`, which is optional
  and can be `null`. Show it in the UI as **Just us / Our closest people / Not sure yet / A bigger
  celebration**.
- **Where:** First control in wizard step 0 (`WeddingSiteIntakeWizard.tsx`, before "Date or season").
  Persist it with the existing intake profile (`weddingIntakeProfileAfpProjectionState.ts`) and the
  planning context passed to `buildWeddingPresentationState`.
- **Probing:** Add a rule to `weddingNeedToKnowProbingState.ts` **before** the guest-count rule:
  "What feels closest to your kind of wedding?" When the format is set, the guest-count question can
  pre-fill a range.
- **Inference:** If a guest count is entered but no format, infer it softly (≤10 → elopement,
  11–40 → micro, otherwise larger). Show the inferred format as editable. Never overwrite an explicit
  choice.
- **AFP and contract rules:** The field is **optional metadata**. Never add it as required to
  `MessageSchema` or any wedding contract. Messages without it must parse and behave exactly as
  today. A change of format is a **new** AFP message that references the previous profile, not a
  mutation.
- **Acceptance:** Existing plans with no format render unchanged. Each of the four values persists
  and reloads. A format change can be reverted.

### TPL-02 — Guest-count input

- Placeholder `"80"` becomes `"20"`.
- Add quick-pick chips beside the free-text field: **0–10 · 11–20 · 21–40 · 41+ · Not sure**
  (brand strategy §3.5 Q2). Chips fill the existing field. Free text stays.
- Copy note under the field: "Suppliers don't count. Legal ceremonies need two adult witnesses."

### TPL-03 — Intake placeholders and copy

| Location (`WeddingSiteIntakeWizard.tsx`) | Current | Proposed |
| --- | --- | --- |
| Eyebrow (l.159) | "Let's set up your wedding" | "Let's start with your kind of day" |
| Paste-box example (l.207) | "…October 2027 in Sydney NSW, about 90 guests, mid-range budget, priorities are food and photos…" | "…October 2027 in Sydney, about 20 guests, a long dinner after a garden ceremony, priorities are photos and food, NOIM not downloaded, need a celebrant." |
| Priorities label (l.334) | "Priorities" | "What matters most? Choose up to three." |
| Priorities placeholder | "food, photos, low stress" | "personal ceremony, time together, photos" |
| Atmosphere placeholder | "Relaxed garden dinner, candlelit, joyful, not too formal." | Keep (already on-message) |
| Vendor step hint (l.373) | "Start with the longest-lead-time choices…" | Keep, but make the categories format-aware (`TPL-04`) |
| Review CTA (l.554) | "Make follow-up documents" | "Show our first three decisions" (only if `TPL-05` ships; otherwise "Make our starter plan") |
| Review note | "Choose what OmnyID should prepare first." | "Choose what to prepare first. You can add the rest later." |

Brand micro-copy to adopt where an equivalent string already exists (brand strategy §5.5): "Keep
this choice" / "Revisit decision", "Not yet confirmed by the supplier", "Nothing needs your attention
here yet.", "One good decision made." **The spec must include a string audit** listing every
current equivalent string before replacing any of them.

### TPL-04 — Format-aware first vendor categories

- **Current:** `weddingVendorMustDecideFirstCategories()` returns **venue + officiant** for everyone
  (`weddingVendorLeadTimeState.ts:34,44`).
- **Proposed:** Accept an optional format argument.
  - Elopement: **officiant (celebrant) + photographer**. Venue becomes "ceremony location" and is
    optional.
  - Micro and larger: unchanged (venue + officiant).
  - Undecided: show none pre-selected, with the note "Choose your format first. It changes what's
    worth booking early."
- Lead-time months stay as they are. Only the default selection and ordering change.

### TPL-05 — First three decisions per format

- **Current:** `weddingNextStepState.ts` follows one priority ladder (date → budget → guests →
  vendor follow-up → seating → helpers…). The home summary shows "Guests: X of Y replied" even for
  two-person weddings.
- **Proposed:** When a format is set, the first next steps follow the brand strategy §7.1 table
  (section 1 of this brief). Examples:
  - Elopement: ceremony spot → celebrant and NOIM timing → witnesses and photographer.
  - Micro: guest-count range → venue or meal format → budget priorities.
  - Undecided: the 10/30/80 trade-off conversation **before** any supplier step.
- For elopements, hide the "Guests: X of Y replied" label when the guest count is 10 or fewer. Show
  "Witnesses: X of 2 confirmed" instead, but only if witness tracking exists or is added as a
  lightweight task (see `TPL-11`).
- **Reuse:** Implement this as a format-keyed ordering on top of the existing ladder. Don't build a
  second next-step engine.

### TPL-06 — De-emphasise large-wedding machinery (don't remove it)

- **Menu items:** `seating`, `helpers` (→ `people`), registry, and travel or accommodation map
  artifacts.
- **Elopement:** collapse Seating and Registry under "More tools". Hide the seating "Start" badge
  (`weddingWorkspaceMenuState.ts:162–164`).
- **Micro:** keep Seating but don't badge it until RSVPs exist. Keep Registry under "More tools".
- **Larger or no format:** unchanged.
- One tap ("Show all tools") restores the full menu, and the choice persists per plan.
- **Acceptance:** No route, menu ID or deep link is removed. `weddingMenu=seating` still opens
  Seating.

### TPL-07 — Demo and sample data

- `buildWeddingTemplateDemoState()` (`weddingTemplateEntryState.ts:168–317`) currently uses "Sample
  harbour wedding", 90 guests, venues for 80–120 and a $25k venue line.
- **Proposed:** "Sample garden micro wedding", 24 guests. Use two sample small venues or restaurants
  (capacity 20–40), a ~$12k budget, an email draft to a celebrant, a "Confirm two witnesses" task, and
  `topPriorities: ["personal ceremony", "long dinner", "photos"]`.
- Keep `demoLabels` ("Sample data", "No live availability", "No external action taken") and all
  `Sample`/`demo-only@example.invalid` markers.
- Mirror the landing preview (`LP-06`) so the marketing and product demos match.

### TPL-08 — Starter prompts and recommended starters

- **Current:** six starter intents, with `venue_search` the only recommended one
  (`weddingTemplateEntryState.ts:98–137`).
- **Proposed:** keep the six intents and the type union **unchanged**. Make `recommended` format-aware:
  - Elopement: `budget_plan` + `vendor_emails` (celebrant enquiry).
  - Micro: `venue_search` + `budget_plan` + `guest_list`.
  - Undecided: `budget_plan` only, with the prompt variant "Compare what 10, 30 and 80 guests would
    mean for our budget and plan."
  - Larger or none: unchanged.
- Reword the prompts to stay scale-neutral and drop large-wedding assumptions. For example, the
  `run_sheet` prompt drops "transport" for elopements.
- **Description string** "Plan venues, budgets, vendors, guests, drafts, run sheets, and registry ideas
  as saved wedding documents." becomes "Plan the parts of your wedding that matter: decisions,
  budget, suppliers and legal dates, saved as wedding documents."

### TPL-09 — Paste-and-extract recognises format

- `weddingNeedToKnowExtractionState.ts`: recognise phrases such as "elope", "eloping", "just us",
  "just the two of us", "micro wedding", "intimate", "small wedding" and "registry wedding", and map
  them to `weddingFormat` as a **suggestion**. The user must confirm it, as with other extracted
  fields.
- Reuse the existing signal patterns where possible. `weddingExperienceModelState.ts` already treats
  "intimate" as an atmosphere trait. Keep the two meanings separate: atmosphere is not guest count.

### TPL-10 — Carry the format from the landing page (deep link)

- **Current:** `App.tsx:1260–1276` reads only `source` from the register URL.
- **Proposed:** also read an optional `format` parameter. Accept **only** the allowlisted values
  `elopement | micro | undecided`. Ignore anything else silently and never render the raw value
  (PGJ §7 technical requirements). Pass the value to the wizard as a **pre-selection** the user can
  change.
- Precedence: an explicit wizard choice beats a deep-link value, which beats an inferred value.
- **No new tracking.** The parameter isn't stored outside the user's own plan.
- **Acceptance:** `?source=wedding&format=elopement` pre-selects "Just us".
  `?format=<script>` and unknown values do nothing.

### TPL-11 — Elopement legal essentials stay visible

- The legal setup state (`weddingAustralianLegalSetupState.ts`) mentions witnesses only inside
  celebrant guidance text (l.176).
- **Proposed:** for the elopement and micro formats, add a lightweight, approval-free planning task:
  **"Confirm two adult witnesses"**. Use the existing task-item shape (`WeddingPlanningTaskItem`), with
  no new task store.
- NOIM reminders keep their current one-month and 18-month logic. Copy keeps "confirm with your
  celebrant".
- **Reason:** `MSG-03.5`. Brand strategy §7.1: "Never imply that 'minimal' means ignoring legal or
  safety requirements."

### TPL-12 — Partner invite after the first value moment (audit first)

- Brand strategy §7.1 step 4 and §7.4: offer "Share with partner" **after** the first saved decision,
  with a permissions preview. Personal ledger, diary and chat items must never become shared.
- **This is an audit item, not a build item.** `WeddingCollaborationAccessCard.tsx` exists. The spec
  must first confirm what is deployed, and how private-versus-shared separation is enforced and
  tested, before any site copy claims "plan together, separate sign-ins" (`LP-07` card 1, `LP-10`).

### Out of scope for the template in this pass

- Restyling `WeddingSiteIntakeWizard` from rose classes (`rose-100`, `rose-900`…) to the Deep Teal
  wedding tokens. `CLAUDE.md` asks for per-component migration. Do it as a separate visual task
  (`TASK-P2-06`) so message changes and visual changes can be tested apart.
- New AFP message types. None are needed. If one becomes necessary, follow `CLAUDE.md`'s
  new-message-type steps (outbound allowlist, `allowed_types`, renderer).

---

## 7. Critical task list (`TASK-`)

Priorities: **P0** is a truth or brand-risk fix that should ship first and is copy-only. **P1** is
the core message alignment. **P2** comes after validation or needs an audit.

### P0 — Truth and trust fixes (copy only, no dependencies)

| ID | Task | Files | Acceptance criteria |
| --- | --- | --- | --- |
| **TASK-P0-01** | Replace the unverified stats band (`LP-10`) | `wedding/index.html` | No hours or dollar figures without a source. Every remaining number is a product fact or official rule. The count-up still animates. |
| **TASK-P0-02** | Rewrite the testimonial slider as labelled illustrative scenarios (`LP-11`) | `wedding/index.html` | Each slide shows "Illustrative scenario. Not a customer review." There are no stock face portraits. Exactly two "Sydney planning scenario" captions remain. The smoke test passes. |
| **TASK-P0-03** | Remove overclaims: "NOIM & vendor timing, handled", "Available your date", the "AFP workspace" label and AFP strip copy (`LP-02`, `LP-06`) | `wedding/index.html` | None of the four strings remain. The replacement copy follows `MSG-03`. |

### P1 — Core message alignment (ship together as one release)

| ID | Task | Depends on | Files | Acceptance criteria |
| --- | --- | --- | --- | --- |
| **TASK-P1-01** | Hero, meta, CTA band and footer copy (`LP-01`, `LP-02`, `LP-12`, `LP-14`) | P0 | `wedding/index.html`, modal text on 5 pages | A first-time visitor can tell from the first viewport that this is a planner for intimate weddings (brand strategy §11.3). One primary CTA per viewport. Every register CTA keeps `auth=register&source=wedding`. |
| **TASK-P1-02** | How it works and Features copy (`LP-04`, `LP-07`) | P1-01; step 2 wording depends on TPL-05 | `wedding/index.html` | Copy uses only the `MSG-01` spine. No claim exceeds shipped behaviour. |
| **TASK-P1-03** | Small-wedding demo scenario on the landing preview **and** in the template demo (`LP-06`, `TPL-07`) | — | `wedding/index.html`, `weddingTemplateEntryState.ts` | Both demos show the same 24-guest Sydney micro wedding, labelled as sample data. `tsc --noEmit` passes. |
| **TASK-P1-04** | Imagery swap for hero, gallery and moments (`LP-02`, `LP-08`, `LP-09`) | Image licences recorded | `wedding/index.html`, `wedding/assets/images/` | Every image meets `MSG-04`. Alt text doesn't assume gender. No hot-linked gallery images. |
| **TASK-P1-05** | **Audit:** confirm which claims the product supports today: partner sharing and separation (`TPL-12`), free-tier terms, approval gating, NOIM reminders | — | Read-only audit of `solid-ui/`, `src/` | A written claim-to-evidence table (brand strategy §7.5). Any claim without evidence is removed from P1 copy. |
| **TASK-P1-06** | Optional `weddingFormat` field, probing rule and soft inference (`TPL-01`, `TPL-09`) | — | `WeddingSiteIntakeWizard.tsx`, `weddingNeedToKnowProbingState.ts`, `weddingNeedToKnowExtractionState.ts`, `weddingIntakeProfileAfpProjectionState.ts` | Optional only. Old plans are unchanged. The format persists and reloads. A change is a new AFP message, not a mutation. Unit tests cover the four values, `null`, inference and explicit-beats-inferred. |
| **TASK-P1-07** | Intake copy, guest-count chips and placeholders (`TPL-02`, `TPL-03`) | P1-06 | `WeddingSiteIntakeWizard.tsx` | No "80" or "90 guests" defaults remain. The chips fill the existing field. A string audit is attached. |
| **TASK-P1-08** | Format-aware defaults: first vendor categories, recommended starters, first three decisions, legal essentials (`TPL-04`, `TPL-05`, `TPL-08`, `TPL-11`) | P1-06 | `weddingVendorLeadTimeState.ts`, `weddingTemplateEntryState.ts`, `weddingNextStepState.ts`, `weddingAustralianLegalSetupState.ts` | For each format the first three next steps match the brand strategy §7.1 table. A larger or empty format behaves exactly as today. Elopement plans always include the NOIM and two-witness items. |
| **TASK-P1-09** | Pricing, user guide and blog hub copy; feature the small-wedding posts (`SP-01`–`SP-03`) | P1-01 | `pricing.html`, `user-guide.html`, `blog.html` | Smoke test passes (pricing strings, blog card count). Elopement and micro posts appear first. |
| **TASK-P1-10** | Update the smoke test for the new hero and CTA copy, and add guards against `MSG-03` regressions | P0, P1-01 | `wedding/tests/wedding-website-smoke.mjs` | The test fails if "Available your date", "handled" (next to NOIM), "AFP workspace" or the retired stats return. |

### P2 — Additive features and follow-ups (after P1 is live)

| ID | Task | Depends on | Notes |
| --- | --- | --- | --- |
| **TASK-P2-01** | Hero format chips with a `format` deep link (`LP-02` optional, `TPL-10`) | P1-06 | Allowlist only. No injection of raw query values. Pre-selection only. |
| **TASK-P2-02** | De-emphasise large-wedding menu items by format (`TPL-06`) | P1-06, P1-08 | No route removed. "Show all tools" persists per plan. |
| **TASK-P2-03** | Quiz result to format bridge (`SP-04`) | P2-01 | No validity claims. |
| **TASK-P2-04** | Partner invite after the first saved decision, with a permissions preview (`TPL-12`) | P1-05 audit outcome | Only if separation is proven by tests. |
| **TASK-P2-05** | Small-wedding lead magnets and posts: one-page elopement essentials, guest-list wording templates, 10/30/80 trade-off guide (brand strategy §8.1) | — | Offer the one-page checklist before the long day-of binder. |
| **TASK-P2-06** | Visual migration of the landing CSS and `WeddingSiteIntakeWizard` from rose/sage/gold to the wedding Deep Teal tokens (brand strategy §6, `DESIGN_SYSTEM.md` §11) | Separate design review | Kept apart so message tests and visual tests don't mix. |
| **TASK-P2-07** | Validation: 15–20 couple interviews by format, then re-scope the positioning survey quotas (500 respondents) to the new audience | — | The brand strategy (§10) treats "Only What Matters" and the audience as hypotheses. Hold the next copy iteration until the interviews are in. |
| **TASK-P2-08** | Measurement: activation by format (first saved decision, 7-day return) using **existing** analytics only | P1-06 | No new vendor and no personal data in events (PGJ §9). Report elopement, micro and undecided separately. |

### Dependency order (summary)

```
P0-01, P0-02, P0-03  (copy-only, parallel)
        │
        ▼
P1-05 audit ──► gates claims in P1-01 / P1-02 / LP-07 card 1 / LP-10
        │
P1-01 ─► P1-02 ─► P1-09 ─► P1-10
P1-03, P1-04 (parallel)
P1-06 ─► P1-07
      └► P1-08
        │
        ▼
P2-01 ─► P2-03     P2-02     P2-04 (needs P1-05)     P2-05..P2-08
```

---

## 8. Acceptance guardrails for the whole change

Adapted from brand strategy §11.3, the PGJ acceptance criteria and `CLAUDE.md`.

- [ ] The existing `/wedding` section order is unchanged. `how-it-works` → `vendor-flow` → `preview`
      still passes the smoke test.
- [ ] A first-time visitor can tell from the first viewport that this is **a planner for intimate
      weddings**, not a generic AI tool.
- [ ] One primary CTA per viewport region. Every register CTA keeps `auth=register&source=wedding`.
- [ ] No unverified statistic, review-like quote, live-availability claim or legal overclaim remains
      (`MSG-03`).
- [ ] No internal architecture terms (AFP, artifact, agent ledger) appear in visitor-facing copy.
- [ ] Copy is inclusive: no default bride or heterosexual framing, and "what matters" is said as
      "to you both".
- [ ] Large weddings still work. A plan with no format or `larger` behaves exactly as today.
- [ ] `weddingFormat` is optional everywhere. No required AFP field is added. Format changes are new
      messages, not mutations.
- [ ] The elopement path always surfaces NOIM timing, the authorised celebrant and two adult witnesses.
- [ ] Small-wedding users are never forced into seating, registry or bridal-party tasks.
- [ ] Partner-sharing claims appear only after the P1-05 audit confirms the private/shared boundary.
- [ ] Builds pass: `solid-ui` `npx tsc --noEmit` and `npm run build`, plus the wedding smoke test.
- [ ] No production deploy without explicit approval (the Oracle deploy rules in `CLAUDE.md`
      apply).

---

## 9. Open decisions for the product owner

1. **Primary CTA text:** switch fully to "Plan our kind of wedding", or A/B test it against "Start
   planning free"? The brand strategy recommends the former, and PGJ experiment D supports testing.
2. **Hero chips (`TASK-P2-01`):** ship with P1 or after? They are low-risk without the template
   support, because the parameter is ignored, but they only add value once `TPL-01` and `TPL-10` exist.
3. **"A bigger celebration" option:** show it as a fourth format choice in the template, or keep it
   implicit (no format = today's behaviour)? The brand strategy says to "provide a pathway for larger
   weddings".
4. **Testimonial slider:** keep it as labelled scenarios (`LP-11`), or remove the section until real
   stories exist? Removing it is the safer choice for trust, but it removes a journey step. The smoke
   test would need updating.
5. **Hunter Valley caption:** rename it to another NSW location, or keep it?
6. **Pricing line "one price whether it's two or forty":** confirm the plan has no guest-count
   limits before publishing.

---

## 10. Traceability

| Change | Source |
| --- | --- |
| Audience, formats, three paths | Brand strategy §1, §3.1–3.2 |
| Message spine, CTA, vocabulary | Brand strategy §4.2, §4.4, §5.1–5.6 |
| Hero copy and proof module | Brand strategy §5.2, §7.2 |
| Truth rules, stats and testimonial fixes | Brand strategy §7.5, §9; PGJ §3 and §10 acceptance criteria |
| Imagery | Brand strategy §6.4 |
| Format field, three-decision start, legal essentials | Brand strategy §7.1, §3.5; template spec "Need-To-Know Probing", "Australian Legal…" |
| Partner sharing boundaries | Brand strategy §7.4; template spec "Privacy And Sharing" |
| Proof points kept from the positioning research | Positioning "Feature priorities" 1, 3, 5, 6 (budget, approval-first, decision journal, AI drafts but doesn't decide) |
| Journey order kept | PGJ framework §3 (Vector J), current `wedding/index.html` |
| Deep-link safety | PGJ §7 technical requirements |
| SEO title and meta | Brand strategy §8.2 |
| Validation and measurement | Brand strategy §10; positioning "Recommended research sequence" |
