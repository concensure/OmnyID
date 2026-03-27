# OmnyID Landing Page — Design Prompt

## Project Name

**OmnyID** — the first privacy-first, local-first, decentralized Agent Framework and personal workspace layer built for the agentic era.

---

## Folder Structure Recommendation

> **Recommendation: Create a separate `docs/` subfolder inside the existing repository.**
>
> Rationale:
> - GitHub Pages natively serves from the `/docs` directory on the `main` branch — no extra CI, no extra branches needed.
> - Keeps the landing page entirely separate from the Rust/Next.js application code.
> - A single `git push` deploys both the product and the landing page.
> - Set the page at `https://<org>.github.io/OmnyID` or a custom domain via `docs/CNAME`.
>
> Alternative: a separate `gh-pages` branch, which is also acceptable if you prefer total code isolation.

---

## 1. Visual Language and Aesthetic

### Guiding Philosophy

The design should feel like a **living, breathing operating system for agents** — not a typical SaaS startup landing page. Calm rather than loud. Precise rather than playful. It should communicate that something profound is happening at the infrastructure level: that a new layer of digital life is becoming possible — quietly, privately, without asking for permission.

Think: the feeling of watching the northern lights. Something intelligent and vast is at work, but it is not intrusive. It simply is.

### Core Aesthetic Keywords

- Serene, spacious, luminous
- Understated elegance — not flashy, not brutalist
- Architectural minimalism with subtle depth
- Scientific precision meets human warmth
- "Open source infrastructure for civilization" energy — not startup noise

---

## 2. Color Palette

### Light Mode (Primary)

| Token | Hex | Usage |
|---|---|---|
| `surface-base` | `#FAFAF8` | Page background — warm off-white, not clinical |
| `surface-raised` | `#F2F2EF` | Cards, modal surfaces, secondary panels |
| `surface-sunken` | `#EEEEE9` | Input fields, code blocks, subtle dividers |
| `text-primary` | `#1C1C1E` | Headlines, primary body |
| `text-secondary` | `#6B6B6B` | Subheadings, supporting body, captions |
| `text-muted` | `#A0A0A0` | Placeholders, fine print, timestamps |
| `accent-primary` | `#4B6FA8` | Primary interactive: links, CTAs, highlights — calm mid-blue |
| `accent-glow` | `#A8C4F0` | Glow halos on interactive elements, agent node highlights |
| `accent-warm` | `#7B9E7A` | Milestones, open source badge, success states — muted sage green |
| `accent-amber` | `#C9953A` | Subtle caution tones, human approval indicators |
| `border-subtle` | `#E4E4E0` | Card borders, dividers |
| `shadow-soft` | `rgba(0,0,0,0.04)` | Ambient card shadow — barely there |

### Dark Mode (Optional Toggle)

| Token | Hex | Usage |
|---|---|---|
| `surface-base-dark` | `#0E0E10` | Deep near-black page background |
| `surface-raised-dark` | `#161618` | Cards |
| `text-primary-dark` | `#E8E8E6` | Primary text |
| `accent-primary-dark` | `#7AAFF0` | Links and CTAs — slightly lighter for dark context |
| `accent-glow-dark` | `#2A4A7A` | Glow halos |

Dark mode is **secondary** — light mode should receive 80% of the design effort. Include a subtle moon/sun toggle icon in the top navigation.

---

## 3. Typography

### Font Families

| Role | Typeface | Source |
|---|---|---|
| Display / Hero | **EB Garamond** (variable weight) | Google Fonts |
| Subheadings / UI | **Inter** (variable weight) | Google Fonts |
| Monospace / IDs / Code | **JetBrains Mono** | Google Fonts |

### Scale

| Class | Size | Weight | Use |
|---|---|---|---|
| `hero-xl` | 72–90px (clamp) | 400 (regular serif) | Main hero statement |
| `hero-lg` | 48–64px | 500 | Section headlines |
| `body-xl` | 22–26px | 400 | Hero subline, tagline |
| `body-lg` | 18–20px | 400 | Section body copy |
| `body-md` | 16px | 400 | Standard body |
| `caption` | 13–14px | 400 | Labels, captions, fine print |
| `mono-sm` | 13–14px | 400 | Agent IDs, code snippets |

### Line Height and Spacing

- `hero-xl`: line-height 1.05, letter-spacing -0.03em
- `hero-lg`: line-height 1.1, letter-spacing -0.02em
- `body-*`: line-height 1.7, letter-spacing 0
- Generous paragraph spacing: 1.5–2em between paragraphs

---

## 4. Background Animation

### Concept: "The Agent Mesh"

The page background should host a **very subtle, always-running animated canvas** that represents agents operating continuously in the background.

### Technical Specification

- Render using a `<canvas>` element or CSS + SVG — positioned `fixed`, full-viewport, `z-index: 0`, `pointer-events: none`
- All content renders above the animation layer

### Visual Rules

- **Nodes**: 20–40 small circular dots (radius 2–4px), very low opacity (5–12%), color `#4B6FA8` in light mode
- **Edges**: thin lines (stroke 0.5–1px, opacity 3–8%) connecting nearby nodes when they drift within ~150px of each other
- **Motion**: extremely slow, organic drift — each node moves at 0.1–0.3px per frame in a gentle sinusoidal path; no sharp direction changes
- **Pulse**: occasionally (every 8–15 seconds per node), a node very gently brightens from 8% to 20% opacity over 2 seconds then returns — representing an agent completing a task
- **No interactivity on mobile** — disable the animation on devices with `prefers-reduced-motion: reduce` or screen widths < 768px and replace with a single static radial gradient
- **Performance**: use `requestAnimationFrame`, target 30fps not 60fps; limit canvas redraws to only dirty regions

### Emotional Intent

A first-time visitor should not consciously notice the animation — but should feel a subtle sense that something is **alive and working quietly behind the scenes**. On second glance, they see the network. It feels inevitable.

---

## 5. Layout and Grid

### Container

- Max content width: `1120px`
- Side padding: `clamp(24px, 5vw, 80px)`
- Section vertical padding: `clamp(80px, 10vw, 140px)`

### Grid

- Desktop: 12-column CSS Grid or Flexbox as appropriate per section
- Tablet: 8-column grid
- Mobile: single-column stack

### Section Rhythm

All sections share the same container width. Sections alternate between two feels:
- **Open**: content centered, generous white space above and below, single-column text
- **Structured**: 2 or 3-column card grids, feature tables, or timeline layouts

Never crowd the page. Every section needs room to breathe.

---

## 6. Navigation

### Structure

```
[OmnyID logo + wordmark]        [Why OmnyID] [How It Works] [Roadmap] [GitHub ↗]        [Join Waitlist →]
```

### Behaviour

- Sticky on scroll — after 80px scroll, the nav becomes `backdrop-blur: 12px` with `background: rgba(250,250,248, 0.88)` (light mode) giving it a frosted glass quality
- On mobile: hamburger icon opens a full-height slide-in drawer from the right
- Smooth scroll to section anchors
- Active section indicator: the corresponding nav link becomes `accent-primary` when its section is in viewport
- The **Join Waitlist** button uses the primary accent color with a very subtle inner glow on hover

### Logo

- The wordmark: "OmnyID" in Inter, weight 600, `text-primary`
- A small abstract mark: two overlapping circles (representing agent identity + privacy) rendered in SVG, `accent-primary` colored
- The mark can animate very gently (1 slow rotation cycle over 60 seconds) on hover

---

## 7. Contextual Menus / Hover Cards

Underline certain key terms in body copy with a subtle dotted underline. On hover (desktop) or tap (mobile), a small floating card appears with a 2–3 line explanation. Use this for jargon like:

- **AFP** → "Agent Forward Protocol — the structured message format used by every OmnyID agent. Think email, but typed, signed, and encryption-aware."
- **Agent ID** → "A cryptographically signed identifier unique to your workspace. Agents use it to send, receive, and act without ever exposing your real email."
- **E2EE** → "End-to-End Encryption — only you and your intended recipients can read the content. The server never sees plaintext."
- **Self-hostable** → "Run OmnyID on your own server or cloud account. Your data never leaves your infrastructure."
- **Local-first** → "Your data lives on your device or your server first. The network syncs second. Even offline, you have access."

### Hover Card Design

- Background: `surface-raised` with `border: 1px solid border-subtle`, `border-radius: 10px`
- Shadow: `0 4px 20px rgba(0,0,0,0.08)`
- Typography: `body-md`, `text-secondary`
- Width: 240–280px
- Animation: fade-in 150ms + 4px upward translate, easing `cubic-bezier(0.16, 1, 0.3, 1)`

---

## 8. Section-by-Section Design

### Section 1: Hero

**Layout**: full-viewport height, centered vertically and horizontally, with the agent mesh animation visible behind

**Elements**:
- Top: a small pill badge — `[ Open Source · Privacy-First · Built for the Agentic Era ]` — in `surface-raised` with `accent-primary` text, `border-radius: 100px`, subtle shimmer animation (CSS `background-position` sweep)
- Below badge: the hero headline in `hero-xl` EB Garamond — the text should feel like a declaration
- Below headline: subline in `body-xl` Inter — `text-secondary`
- Below subline: two CTA buttons side by side
  - Primary: **Join the Waitlist** — filled `accent-primary` background, white text, `border-radius: 8px`, subtle shimmer on hover
  - Secondary: **View on GitHub** — outline only, `accent-primary` border and text, same radius
- Below CTAs: a single trust line — "Open Source. Self-Hostable. Your data, always." in `caption`, `text-muted`, centered
- The hero background animation is most visible here — the nodes drift at their slowest rate

**Visual Detail**: the hero headline should have a very subtle `text-shadow: 0 1px 20px rgba(75,111,168,0.1)` so the blue accent bleeds gently into the display text.

---

### Section 2: The Pain (Problem Statement)

**Layout**: centered, single column, max-width 720px

**Design Style**: stark, measured — let the words do the work; minimal surrounding decoration

**Elements**:
- A small section label: `THE PROBLEM` in `caption`, `text-muted`, uppercase, letter-spacing 0.15em
- A large pullquote-style statement (2–3 lines, `hero-lg` weight 400) contrasting how the current world works vs. where it's going
- Below: 3 pain-point blocks arranged in a `1 × 3` stack on mobile or `1 × 3` row on desktop, each with:
  - An icon (SVG, 24px, `accent-primary`)
  - Short bold label
  - 2–3 sentence description in `body-md`, `text-secondary`

**Separator**: a single hairline rule `1px solid border-subtle` below this section

---

### Section 3: What Is OmnyID

**Layout**: 2-column on desktop (left: text stack, right: animated diagram), 1-column on mobile

**Left column**: section label, headline, body paragraphs, the "contextual menu" term underlines

**Right column (Diagram)**:
- An SVG or canvas-rendered diagram showing:
  - A central "Agent ID" node (the user's OmnyID identity)
  - Lines radiating out to: Email, Notes, Tasks, Calendar, External APIs
  - Each endpoint pulses softly on hover
  - The diagram should feel like a star map or constellation
- No text inside the diagram — let the connections speak
- On mobile: the diagram collapses to a simple icon grid below the text

---

### Section 4: How It Works / Feature Grid

**Layout**: centered headline + `2 × 3` card grid on desktop, `1 × 6` stack on mobile

**Cards**:
- Minimal design: `surface-raised` background, `border-radius: 12px`, `border: 1px solid border-subtle`
- Hover: card lifts with `box-shadow: 0 8px 32px rgba(0,0,0,0.08)` and a very subtle `border-color: accent-glow` transition
- Each card: SVG icon (top-left), bold feature name, 2–3 line description
- No heavy drop shadows at rest

---

### Section 5: OmnyID vs "AI Workspace"

**Layout**: centered headline + a comparison table

**Table Design**:
- 3 columns: Feature | Traditional AI Workspace | OmnyID
- Column headers: `caption` uppercase, `text-muted`
- Rows: alternating `surface-base` and `surface-raised` background
- OmnyID column: each value prefixed with a small `accent-warm` checkmark ✓ or `accent-amber` cross ✗ for others
- The OmnyID column header has a soft `accent-primary` underline or left border treatment to visually distinguish it
- On mobile: transform into stacked comparison cards, one per feature row

---

### Section 6: Roadmap

**Layout**: centered headline + a horizontal timeline on desktop, vertical timeline on mobile

**Timeline Design**:
- 4 milestones connected by a thin horizontal line (`border-subtle`)
- Each milestone node: a circle (20px diameter) filled `accent-primary` for completed/in-progress, `surface-raised` with `border` for future
- Below each node: Milestone letter badge (A, B, C, D) in small `mono-sm`, then milestone name, then 2–3 line description
- The connecting line between nodes uses a dashed style for future milestones
- A subtle animated progress fill on the line, from left to right, showing how far the project has come
- On mobile: rotate to vertical with the line on the left

---

### Section 7: Open Source

**Layout**: centered, minimal — just a strong statement and a GitHub link

**Design**:
- The GitHub Octocat icon (SVG) in `accent-primary`, 32px, centered
- A single strong sentence about open source principles
- A GitHub repository link button (outline style, subtle)
- This section is intentionally the most minimal on the page — it trusts the message

---

### Section 8: Join the Waitlist

**Layout**: centered, card container, max-width 560px

**Card Design**:
- `surface-raised` background, generous padding (`40–60px`), `border-radius: 16px`
- `border: 1px solid border-subtle`
- Subtle ambient glow: `box-shadow: 0 0 80px rgba(75,111,168,0.06), 0 4px 24px rgba(0,0,0,0.06)`
- A small headline, 1–2 sentences of copy, then the email input + submit button
- Input: `surface-sunken` background, no visible border unless focused; on focus: `border: 1px solid accent-primary`, `box-shadow: 0 0 0 3px rgba(75,111,168,0.12)`
- Submit button: full width, `accent-primary` fill, white text, `border-radius: 8px`, text: "Claim Your Spot"
- Below the button: trust copy in `caption`, `text-muted` — "No spam. No credit card. Open source forever."

---

### Section 9: Footer

**Layout**: 3-column grid on desktop: left (logo + tagline), center (nav links), right (social + GitHub)

**Design**:
- `surface-raised` background or a very slightly darker tone than `surface-base`
- `text-muted` for all footer text
- A hairline divider above the footer
- Copyright line: centered, `caption`

---

## 9. Scroll Animations

Use `IntersectionObserver` with CSS classes toggled on entry.

- **Fade-up**: sections fade in and translate upward by 24px over 600ms, easing `cubic-bezier(0.16, 1, 0.3, 1)`
- **Stagger**: feature cards within a grid stagger with 80ms delays per card
- **No parallax** — it conflicts with the calm aesthetic
- All animations respect `prefers-reduced-motion: reduce`

---

## 10. SEO and Meta

- `<title>`: `OmnyID — Your Agent Identity. Your Rules.`
- `<meta name="description">`: 140–160 character description covering: privacy-first, local-first, open-source Agent ID platform
- Open Graph tags: `og:title`, `og:description`, `og:image` (a 1200×630 social card using the hero design — the wordmark over the agent mesh on a light background)
- Twitter Card: `summary_large_image`
- Canonical URL
- Structured data (`application/ld+json`): `WebSite` + `Organization` schemas
- All section headings use proper `H1 → H2 → H3` hierarchy (only one `H1` per page)
- Alt text on all images and SVG diagrams
- `<meta name="robots" content="index, follow">`
- Sitemap: `sitemap.xml` at the root of the `docs/` folder
- `robots.txt`: allow all

---

## 11. Responsive Breakpoints

| Breakpoint | Max-width | Notes |
|---|---|---|
| Mobile | < 640px | Single column, hamburger nav, no canvas animation, simplified diagrams |
| Tablet | 640–1024px | 2-column where appropriate, hamburger nav |
| Desktop | > 1024px | Full layout, canvas animation, horizontal timeline, comparison table |

---

## 12. Technical Stack for the Landing Page

This is a **static site** deployed via GitHub Pages. Use one of:

**Option A — Pure HTML/CSS/JS** (recommended for simplicity and zero build step):
- Single `docs/index.html`
- CSS custom properties (variables) for the design tokens
- Vanilla JS for the canvas animation, scroll observers, and waitlist form submission
- No build step, no framework — just `git push`

**Option B — Next.js Static Export** (if the team prefers):
- `next export` into the `docs/` folder
- Use Tailwind CSS with a custom theme for the design tokens
- This adds complexity but enables component reuse with the main app

**Option C — Astro** (best performance/DX balance):
- `astro build --outDir docs`
- Zero JS shipped to client unless needed
- Tailwind integration is native

Whichever option is chosen, the page must pass **Lighthouse scores of 95+ on Performance, Accessibility, Best Practices, and SEO** on desktop.

---

## 13. Waitlist Form Submission

The email input should POST to one of:
- **Airtable API** (simplest)
- **Buttondown** (newsletter-focused)
- **Mailchimp** embed
- Or a simple **Supabase** table insert (consistent with the project stack)

Show an inline success state (no page reload): replace the form with a gentle confirmation message — "You're on the list. We'll be in touch." with a soft checkmark animation.

---

## 14. Accessibility Requirements

- All interactive elements keyboard-navigable
- Focus rings: `outline: 2px solid accent-primary`, `outline-offset: 3px`
- Color contrast: all text meets WCAG AA minimum (4.5:1 for body, 3:1 for large text)
- ARIA roles on the canvas (`role="presentation"`) and all icon buttons
- Form input has associated `<label>`
- Skip-to-content link at the top of `<body>`

---

## 15. File Structure

```
docs/
├── index.html              # or Astro/Next build output
├── CNAME                   # custom domain (e.g. omnyid.dev)
├── robots.txt
├── sitemap.xml
├── assets/
│   ├── css/
│   │   └── styles.css      # or inline in HTML for pure option
│   ├── js/
│   │   ├── animation.js    # agent mesh canvas
│   │   ├── scroll.js       # intersection observer animations
│   │   └── waitlist.js     # form submission logic
│   ├── fonts/              # self-hosted font subsets
│   └── images/
│       ├── og-card.png     # 1200×630 social preview
│       └── logo.svg        # OmnyID wordmark + mark
└── favicon.ico
```
