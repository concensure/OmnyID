# Note Design Tasks

Source documents evaluated:
- C:\Users\ozans\Desktop\projects\OmnyID\Documents\design\brand
- C:\Users\ozans\Desktop\projects\OmnyID\Documents\design\note view

Library constraints:
- Data-driven documents and graph visuals: D3.js (permissive ISC license, commercial use allowed; retain license notice on redistribution).
- 3D objects: three.js (permissive MIT license, commercial use allowed; retain license notice on redistribution).
- OCR: PaddleOCR (Apache-2.0, commercial use allowed; retain license notice on redistribution).

> **Unit policy**: All layout and sizing values use `em` (relative to the element's own font-size, which defaults to 1rem = 16px unless overridden). `px` is reserved for hairline borders only (1px, 2px). This ensures every metric scales with the user's font-size preference and browser zoom.

## Phase 0 - Scope, Constraints, and Design Baseline ✅
- Lock the brand requirements into a single source of truth: colors, typography, spacing, layout metrics, and interaction states.
- Convert brand specs into design tokens: color palette, text styles, spacing scale, radii, and motion curve.
- Apply typography scale: H1 1.5em semibold (≈24px), H2 1.125em medium (≈18px), body 1em regular (≈16px), caption 0.8125em regular (≈13px), with ss01 feature enabled.
- Enforce accent usage rules: sunset orange (#FF6B35) only for primary CTAs, active states, and critical highlights.
- Confirm the view model for the note list and selected note details (cards, sidebars, summary, backlinks, actions).
- Define the initial feature cut for a first usable Note View: list and grid, search, create note, select note, and right-side context panel.

## Phase 1 - Information Model and Storage Contracts ✅
- Define note data model: title, body blocks, summary, tags, supertags, backlinks, updated time, and metadata (voice, image, OCR).
- Define graph model for backlinks and note relationships (directed edges, edge types, merge candidates).
- Define search schema: full-text index, semantic vectors, and tag filters.
- Align API contracts for list view, grid view, and graph view with pagination, sorting, and filtering rules.

## Phase 2 - Layout Shell and Navigation ✅
- Implement the top bar (fixed 3.5em height, search input with 2.5em height and 30em max width, view toggle, New Note).
- Implement the left sidebar at 15em width, collapsible to 4em.
- Implement the right sidebar at 20em width with AI summary, actions, backlinks, and version timeline.
- Enforce layout metrics: main padding 2em, sidebar padding 1.5em, card gaps 0.75em, and section vertical spacing 1.5em.

## Phase 3 - Note List, Grid, and Selection ✅
- Build list view cards showing title, preview lines, supertags, and update time at 4.5em height.
- Build grid view cards with size 17.5em × 11.25em and 1em radius, consistent internal spacing, and 1.25em padding.
- Implement selection state and focus behavior, including the left accent bar (0.25em) on active card.
- Implement hover and focus states with the specified timing curve and color.

## Phase 4 - Note Authoring and Creation Flows ✅
- Implement New Note button with quick actions: voice, camera (image + OCR), handwriting, and text.
- Implement instant blank note creation with cursor focus.
- Implement multi-select and group actions for tags, supertags, and notebooks.

## Phase 5 - Search and Retrieval ✅
- Implement instant search across full-text, semantic, tags, and OCR metadata.
- Add highlighting of matches and backlink suggestions in results.
- Implement "Ask your notes" query mode with ranked results and summary response.

## Phase 6 - Knowledge Graph and Data-Driven Views (D3) ✅
- Implement graph view using D3 for the note network.
- Support click-through navigation from graph nodes to notes.
- Add inline backlink suggestions as chips while typing.

## Phase 7 - AI Actions and Background Processing ✅
- Add AI Actions entry points: Summarize, Extract Action Items, Create Mind Map, Elaborate.
- Add subtle suggestion chips for contextual prompts.
- Queue heavy tasks (OCR, summarization, graph building) to background agents.

## Phase 8 - OCR Pipeline (PaddleOCR) 🔲 (UI stub complete; backend integration pending)
- Add OCR ingestion for camera and image notes.
- Normalize OCR output into note blocks and searchable text.
- Store OCR confidence and document provenance for later audit and QA.

## Phase 9 - 3D Object Embedding (three.js) ✅ (lazy viewer with rotating cube placeholder)
- Add a dedicated block type for embedded 3D models in notes.
- Use three.js for rendering and interaction controls.
- Define fallback behavior for low-power or mobile devices.

## Phase 10 - Accessibility, Responsiveness, and QA ✅
- Enforce minimum 2.75em touch targets (≈44px) and full keyboard navigation.
- Validate contrast ratio meets 4.5:1 in light and dark themes.
- Validate responsive collapse rules for < 64em (≈1024px) and < 40em (≈640px) breakpoints.
- Add regression tests for layout metrics and interactive states.

---

## Layout metrics reference (em equivalents)

| Spec description | em value | px equivalent (at 16px root) |
|---|---|---|
| Top bar height | 3.5em | 56px |
| Search input height | 2.5em | 40px |
| Search max width | 30em | 480px |
| Left sidebar width | 15em | 240px |
| Left sidebar collapsed | 4em | 64px |
| Right sidebar width | 20em | 320px |
| Main content padding | 2em | 32px |
| Sidebar padding | 1.5em | 24px |
| Card gap | 0.75em | 12px |
| Section vertical spacing | 1.5em | 24px |
| List card height | 4.5em | 72px |
| List card padding | 1em | 16px |
| List card border radius | 0.75em | 12px |
| Grid card width | 17.5em | 280px |
| Grid card height | 11.25em | 180px |
| Grid card padding | 1.25em | 20px |
| Grid card border radius | 1em | 16px |
| Active accent bar width | 0.25em | 4px |
| Min touch target | 2.75em | 44px |
| AI action button height | 2.5em | 40px |
| AI action button gap | 0.75em | 12px |
| Backlinks section gap | 1em | 16px |
| H1 font-size | 1.5em | 24px |
| H2 font-size | 1.125em | 18px |
| Body font-size | 1em | 16px |
| Caption font-size | 0.8125em | 13px |
