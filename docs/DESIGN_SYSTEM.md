# OmnyID Design System

> Status note as of Wednesday, August 26, 2026: this document still contains older brand-system material. For market-entry claim priority, defer to `Documents/marketing/OMNYID_PRODUCT_MARKET_FIT_ANALYSIS.md`. OmnyID should be presented first as cross-tool AI memory plus owned identity, with privacy as the trust amplifier.

## Brand Identity & Visual Language

This document defines the visual design system for OmnyID. All website pages, documentation, marketing materials, and product interfaces should follow these guidelines to ensure consistency across the brand.

---

## 1. Brand Positioning

**Tagline**: "Cross-tool AI memory you own."

**Positioning Statement**: OmnyID is the cross-tool AI memory and identity layer for the agentic era. It gives users portable context, owned identity, and private runtime control instead of trapping memory inside one vendor's product.

**Voice & Tone**:
- Calm, confident, technical
- No startup hype or superlatives
- Precise language over flowery prose
- Educational but not condescending
- "High-end architectural studio" aesthetic

---

## 2. Color Palette

### Primary Colors

| Token | Hex | Usage |
|---|---|---|
| `surface` | `#f9f9f7` | Page background — warm off-white |
| `surface-container-low` | `#f4f4f2` | Section backgrounds, alternating |
| `surface-container-lowest` | `#ffffff` | Cards, modals, elevated surfaces |
| `surface-container-high` | `#e8e8e6` | Input fields, code blocks |
| `on-surface` | `#1a1c1b` | Primary text (not pure black) |
| `on-surface-variant` | `#434750` | Secondary text, descriptions |

### Accent Colors

| Token | Hex | Usage |
|---|---|---|
| `primary` | `#31568e` | CTAs, links, highlights, active states |
| `primary-fixed` | `#d6e3ff` | Primary backgrounds, tags |
| `secondary` | `#526352` | Milestones, success states, green accents |
| `secondary-container` | `#d4e8d3` | Secondary backgrounds, badges |
| `outline` | `#737781` | Borders, dividers, muted elements |
| `outline-variant` | `#c3c6d1` | Subtle borders, hover states |

### Semantic Colors (Use sparingly)

| Token | Hex | Usage |
|---|---|---|
| `error` | `#ba1a1a` | Error states only |
| `ember` | `#d96b39` | Warm accent (use sparingly) |

### Dark Mode (Future)

| Token | Hex |
|---|---|
| `surface-dark` | `#0e0e10` |
| `surface-container-dark` | `#161618` |
| `on-surface-dark` | `#e8e8e6` |
| `primary-dark` | `#7aaff0` |

---

## 3. Typography

### Font Families

| Role | Font | Source | Usage |
|---|---|---|---|
| **Display** | EB Garamond | Google Fonts | Hero headlines, section titles |
| **Body** | Inter | Google Fonts | Paragraphs, UI elements, navigation |
| **Mono** | JetBrains Mono | Google Fonts | Code, Agent IDs, technical details |

### Type Scale

| Element | Font | Size | Weight | Line Height |
|---|---|---|---|---|
| Hero XL | EB Garamond | 6-8rem (clamp) | 400 | 1.05 |
| Hero L | EB Garamond | 4-5rem | 400 | 1.1 |
| Section Title | EB Garamond | 2.5-3rem | 400/500 | 1.2 |
| Card Title | Inter | 1.125rem (1xl) | 600 | 1.4 |
| Body L | Inter | 1.25rem (1xl) | 400 | 1.7 |
| Body | Inter | 1rem | 400 | 1.7 |
| Caption | Inter | 0.875rem (sm) | 400 | 1.5 |
| Mono | JetBrains Mono | 0.75-0.875rem | 400 | 1.5 |

### Tracking & Spacing

- Display text: `letter-spacing: -0.02em to -0.03em`
- Body text: `letter-spacing: 0`
- Uppercase labels: `letter-spacing: 0.15em to 0.3em`
- Paragraph spacing: `1.5em to 2em`

---

## 4. Layout & Grid

### Container

- **Max width**: `1120px` to `1280px` (7xl in Tailwind)
- **Side padding**: `clamp(24px, 5vw, 80px)`
- **Section vertical padding**: `clamp(64px, 10vw, 160px)`

### Grid System

- **Desktop**: 12-column grid
- **Tablet**: 8-column grid  
- **Mobile**: Single column stack
- **Gap**: 8, 12, 16, 24, 32, 48, 64px scale

### Responsive Breakpoints

| Breakpoint | Width | Target |
|---|---|---|
| Mobile | < 640px | Phones |
| Tablet | 640-1024px | Tablets |
| Desktop | > 1024px | Desktops |
| Wide | > 1280px | Large screens |

---

## 5. Components

### Navigation Bar

- **Style**: Sticky, glassmorphism effect
- **Background**: `rgba(249, 249, 247, 0.8)` with `backdrop-filter: blur(20px)`
- **Border**: None or very subtle `border-bottom: 1px solid rgba(0,0,0,0.05)`
- **Height**: Auto, typically `py-4` (16px vertical)
- **Logo**: EB Garamond italic, 1.5-2rem

### Buttons

**Primary Button**:
- Background: `primary` (#31568e)
- Text: White
- Border radius: `0.5rem` (lg)
- Padding: `px-5 py-2` (sm) or `px-8 py-4` (lg)
- Hover: `opacity-90` or `bg-primary/90`
- Shadow: `shadow-lg shadow-primary/10` for hero CTAs

**Secondary/Outline Button**:
- Background: Transparent or `surface-container-low`
- Border: `1px solid outline-variant`
- Text: `on-surface`
- Hover: `bg-surface-container-low`

**Ghost Button**:
- No background, no border
- Text with underline on hover
- Use for tertiary actions

### Cards (The "Atelier" Card)

- Background: `surface-container-lowest` (#ffffff)
- Border: `1px solid outline-variant/10`
- Border radius: `1rem` (xl)
- Padding: `p-6` to `p-8`
- Hover effect: `transform: translateY(-4px)` + slight shadow increase
- No heavy shadows at rest

### Input Fields

- Background: `surface-container-low` or transparent
- Border: `1px solid outline-variant`, no border until focus
- Focus state: `border: 1px solid primary`, `ring: 2px primary/20`
- Border radius: `0.75rem` to `1rem`
- Padding: `px-4 py-3` to `px-4 py-4`

### Badges & Tags

- Background: `primary-fixed` or `secondary-container`
- Text: `primary` or `secondary`
- Border radius: Full (pill shape) or `0.25rem`
- Font: Inter or Mono, small size, uppercase with tracking

### Code Blocks

- Background: `surface-container-high`
- Border radius: `0.5rem`
- Font: JetBrains Mono
- Font size: `text-xs` to `text-sm`
- Padding: `p-3` to `p-4`

---

## 6. Visual Effects

### Backgrounds

**Mesh/Gradient Background**:
```css
background-image: radial-gradient(circle at 2px 2px, rgba(49, 86, 142, 0.05) 1px, transparent 0);
background-size: 40px 40px;
```

**Hero Glow** (optional):
```css
background: radial-gradient(circle at top left, rgba(217, 107, 57, 0.08), transparent 30%),
            radial-gradient(circle at top right, rgba(120, 145, 109, 0.08), transparent 28%),
            #f4efe6;
```

### Shadows

- **Card rest**: `box-shadow: 0 1px 3px rgba(0,0,0,0.04)`
- **Card hover**: `box-shadow: 0 8px 32px rgba(0,0,0,0.08)`
- **Modal**: `box-shadow: 0 24px 80px rgba(0,0,0,0.15)`
- **Glow effect**: `box-shadow: 0 0 80px rgba(49, 86, 142, 0.06)`

### Animations

- **Transitions**: `transition: all 0.2s ease` to `0.3s ease`
- **Hover lift**: `transform: translateY(-4px)`
- **Page load**: Optional fade-in, no complex animations
- **Respect**: `prefers-reduced-motion: reduce`

---

## 7. Section Templates

### Hero Section

- Full viewport height or `min-h-[80vh]`
- Grid layout: text left, visual right (desktop)
- Headline: EB Garamond, very large
- Subline: Inter, secondary text color
- CTAs: Primary + Secondary buttons
- Background: Mesh pattern with optional glow

### Problem/Intro Section

- Centered, max-width `720px` to `800px`
- Section label: Mono, uppercase, tracked
- Headline: EB Garamond, large
- Body: Inter, secondary text, generous line-height

### Feature Grid

- Section label + headline left-aligned
- Grid: 3 columns (desktop), 2 (tablet), 1 (mobile)
- Cards with icons, titles, descriptions
- Optional: code snippets, badges

### Comparison Table

- Centered headline
- Table with 3 columns: Feature | Competitor | OmnyID
- Alternating row backgrounds
- OmnyID column highlighted with accent background

### Timeline/Roadmap

- Horizontal line connecting milestones (desktop)
- Vertical line (mobile)
- Milestone nodes: circles with status indicators
- Labels, titles, descriptions per milestone

### CTA Section (Waitlist)

- Dark background (`on-surface`)
- Glowing orbs for atmosphere
- Two-column: text left, form right
- Form with email input + submit button

### Footer

- Minimal, secondary background
- Logo + tagline
- Link columns
- Copyright

---

## 8. Accessibility

- **Color contrast**: All text meets WCAG AA (4.5:1 for body, 3:1 for large)
- **Focus states**: Visible focus rings on all interactive elements
- **Keyboard navigation**: All elements keyboard accessible
- **Skip links**: Include skip-to-content link
- **Alt text**: All images have descriptive alt text
- **Forms**: All inputs have associated labels

---

## 9. Technical Implementation

### Recommended Stack

- **Framework**: Plain HTML/CSS/JS (for marketing pages)
- **CSS**: Tailwind CSS with custom config
- **Fonts**: Google Fonts (self-host for performance)
- **Icons**: Inline SVGs or a minimal icon set
- **Animations**: CSS only, or minimal vanilla JS

### Tailwind Config Template

```javascript
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: '#f9f9f7',
        'surface-container-low': '#f4f4f2',
        'surface-container-lowest': '#ffffff',
        'surface-container-high': '#e8e8e6',
        primary: '#31568e',
        'primary-fixed': '#d6e3ff',
        secondary: '#526352',
        'secondary-container': '#d4e8d3',
        'on-surface': '#1a1c1b',
        'on-surface-variant': '#434750',
        outline: '#737781',
        'outline-variant': '#c3c6d1'
      },
      fontFamily: {
        display: ['EB Garamond', 'serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      }
    }
  }
}
```

---

## 10. Do's and Don'ts

### Do

- ✅ Use warm, paper-like backgrounds (#f9f9f7)
- ✅ Use EB Garamond for headlines, Inter for body
- ✅ Keep generous white space between sections
- ✅ Use subtle shadows, not heavy borders
- ✅ Include section labels in mono, uppercase
- ✅ Use the accent colors sparingly
- ✅ Make CTAs prominent but not aggressive
- ✅ Test on mobile devices

### Don't

- ❌ Use pure black (#000000) — use `#1a1c1b`
- ❌ Use pure white backgrounds (#ffffff) for page body
- ❌ Use bright, saturated accent colors
- ❌ Use 1px solid borders to define sections (use whitespace instead)
- ❌ Use stock photos — use abstract diagrams or code
- ❌ Use multiple font families beyond the three defined
- ❌ Overcrowd sections
- ❌ Use startup-hype language ("revolutionary", "game-changing")

---

## 11. Wedding Planner Surface (separate brand)

The wedding planner (`wedding/` and the wedding components in `solid-ui/`) uses its own palette and
component rules. Sections 1-10 above do not apply to it; the Do's and Don'ts here win for wedding views.
Reference mock-up: `Documents/design/wedding planner/screenshots/wedding-home-proposed-teal-brand.png`.

### Wedding palette

| Role | Value | Name |
|---|---|---|
| Page background, primary-button text | `#FAF7F2` | Warm Porcelain |
| Primary action fill, links on tint, progress | `#0F5F5A` | Deep Teal |
| Secondary action border/text | `#274B77` | Ink Blue |
| Card border | `#E8E2D9` | Soft Warm Gray |
| Card background | `#FFFFFF` | Pure White |
| Text | `#1F1A17` | Warm ink |
| Muted fill (ghost button, chips) | warm slate, around `#EFEBE4` | Warm Slate |

Status tints are reserved for status only: teal tint for "on track", amber for "in progress" and
"still to confirm". Do not use colour alone; pair every status with an icon and a label.

### Cards and containers

- Background `#FFFFFF`, border `1px solid #E8E2D9`.
- Radius 8px or 12px. No pill-shaped cards or bubbles.
- Shadow very light and high blur: `0 8px 32px rgba(31, 26, 23, 0.04)`.
- Emphasis comes from a 3-4px Deep Teal left edge (best fit, active decision), not from tinted
  card backgrounds. One tinted colour per domain tile is retired.

### Buttons and actions

- Primary: Deep Teal `#0F5F5A` background, Warm Porcelain `#FAF7F2` text, crisp semi-bold sans-serif.
  One primary button per viewport region.
- Secondary: transparent background with Ink Blue `#274B77` border and text, or a subtle Warm Slate fill.
- Radius 8px; no full-pill buttons. Category chips are 8px-radius, the selected chip uses the primary fill.

### Layout patterns

- Journey stepper uses the shared planning stages: Plan & budget, Venue & date, Celebrant & suppliers,
  Details & invites, Final prep, and Wedding & after. Each stage is a button that reveals its
  chronological, categorised task projection directly below the stepper; it never changes route.
  Completed stages are filled teal and the current stage has a teal ring. Every task projection uses
  the same completion record, stage and deadline, so Home, Timeline, Tasks and People cannot drift.
- Decision cards show a "Best fit" tag, checked facts, and a "Still to confirm" risk note.
- A right-hand rail holds "Up next" tasks and the saved-vendor count on desktop; it stacks on mobile.
- Serif display face for page titles and the countdown number; sans for everything functional.

#### Hub and summary surfaces

- Keep the page heading and subtitle orienting and brief. Action-card descriptions carry the detailed
  scope, so the page introduction must not repeat each card's feature list.
- Summary status indicators use an icon and explicit label as well as colour. Neutral counts use Warm
  Slate, attention or pending work uses the amber status tint, and resolved/non-issue states use the
  soft green status tint. Use 8px-radius chips rather than pills.
- A status indicator that describes work the user can address acts as a shortcut to that exact
  surface. Its accessible name includes both the status and destination; passive indicators must not
  look actionable.
- Related action cards stretch to equal height in a row. Their action label sits at the bottom through
  a column layout with flexible space, so variable copy never misaligns primary actions.
- Prefer one whole-card button when the card has only one destination. Give it a visible hover,
  pressed and keyboard-focus state, a minimum 44px touch target, and no nested interactive controls.
- Keep action labels concise and outcome-led (for example, `Manage Guests & Boundaries`). Present
  secondary metadata as a short list or compact labelled items, not a punctuation-joined sentence.
- At phone widths, status indicators and cards stack without horizontal overflow. Primary actions
  remain full-width and the persistent wedding bottom navigation remains unchanged.
- Verify primary, secondary, status and muted text combinations against WCAG AA. Deep Teal with Warm
  Porcelain is the preferred primary-action pairing; do not rely on colour alone to communicate state.

### Implementation notes

- Add the values as `wedding-*` tokens in `solid-ui/tailwind.config.cjs`; do not inline hex values.
- The existing rose/plum wedding tokens (`wedding-accent #A6335A`, `wedding-cta`, `wedding-surface-blush`)
  predate this brand and should be migrated per component, not mass-replaced.
- Keep this palette out of non-wedding views.

---

## 12. Resources

- **Google Fonts**: https://fonts.google.com
- **EB Garamond**: https://fonts.google.com/specimen/EB+Garamond
- **Inter**: https://fonts.google.com/specimen/Inter
- **JetBrains Mono**: https://fonts.google.com/specimen/JetBrains+Mono
- **Tailwind CSS**: https://tailwindcss.com

---

## 13. Maintenance

This design system should be reviewed and updated:
- When brand positioning changes
- When new components are needed
- When accessibility standards evolve
- Annually for relevance

**Last Updated**: March 2026

**Version**: 1.0
