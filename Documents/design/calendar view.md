# Calendar View Design

Source documents evaluated:
- C:\Users\ozans\Desktop\projects\OmnyID\Documents\design\brand
- C:\Users\ozans\Desktop\projects\OmnyID\Documents\design\calendar view.md
- C:\Users\ozans\Desktop\projects\OmnyID\Documents\design\note view
- C:\Users\ozans\Desktop\projects\OmnyID\Documents\design\email view

> **Unit policy**: All layout and sizing values use `em` (relative to the element's own font-size, which defaults to 1rem = 16px unless overridden). `px` is reserved for hairline borders only (1px, 2px). This keeps the calendar adaptive and accessible under zoom and user font scaling.

## Design direction

The Calendar View follows the same OmnyID brand philosophy as Note View and Email View: adaptive, accessible, reactive, elegant, and minimal. It should feel calm at first glance, with dense intelligence hidden behind a very readable surface.

The calendar is not a raw dump of source messages. It is a curated planning surface. Every visible entry is a lightweight, human-readable `calendar_event` derived from richer AFP messages by the Knowledge Curator.

Sunset orange (`#FF6B35`) is reserved for primary actions, active states, and urgent emphasis only. It should not become the default category color.

## Layout

**Top Bar** (`3.5em` high, fixed)

- Left cluster:
  - Mini month navigator
  - `Today` button
- Center cluster:
  - Current month and year in H1 styling
  - Search bar matching Note View and Email View behavior: full-text + semantic search across events, people, locations, and linked source messages
- Right cluster:
  - View toggle: `Month / Week / Day`
  - `New Event` button as the primary CTA in sunset orange

**Left Sidebar** (`15em`, collapsible to `4em`)

- Mini calendar for the current month
- Filter section with interactive pills
- Quick links:
  - `Today`
  - `Upcoming`
  - `Past`
  - `Conflicts`

**Main Content Area**

- Default view is Month
- Calendar grid uses clean surfaces, subtle borders, generous white space, and clear weekday/date hierarchy
- Each day cell shows a vertical list of brief line items, never raw AFP payloads
- When a day has more items than visible capacity, overflow is summarized as `+3 more`

**Right Sidebar** (`20em`)

- Context panel appears when a day or event is selected
- Shows:
  - Event summary
  - Full readable source thread
  - Backlinks
  - Related notes/emails/chats
  - AI summary and extracted action items

## Brand system applied

**Colors**

- Background: `#F8F5F0`
- Surface: `#FFFFFF`
- Primary text: `#1C1C1C`
- Secondary text: `#666666`
- Border: `#E5E0D8`
- Accent: `#FF6B35`
- Success: `#2E8B57`
- Error/conflict: `#E63939`

Dark theme should use the brand equivalents from the core brand document, without changing the accent rules.

**Typography**

- H1: Inter SemiBold, `1.5em`, line-height `1.2`
- H2: Inter Medium, `1.125em`
- Body: Inter Regular, `1em`, line-height `1.6`
- Caption/metadata: Inter Regular, `0.8125em`
- Enable `font-feature-settings: "ss01"`

**Spacing and shell metrics**

- Top bar height: `3.5em`
- Search input height: `2.5em`
- Search max width: `30em`
- Left sidebar width: `15em`
- Left sidebar collapsed width: `4em`
- Right sidebar width: `20em`
- Main content padding: `2em`
- Sidebar padding: `1.5em`
- Card/panel gap: `0.75em`
- Section vertical spacing: `1.5em`
- Minimum touch target: `2.75em`

## Calendar grid behavior

Each day cell should prioritize clarity over density.

- Date number anchored top-right or top-left consistently across the grid
- Today state uses a restrained accent treatment, not a heavy fill
- Weekend and out-of-month dates are visually quieter through text and surface contrast, not opacity so low that accessibility suffers
- Each visible event appears as a single-line or two-line compact row depending on view density
- Rows must remain readable with keyboard focus and hover

### Line item format

Example:

`10:00 AM Investor meeting with Sarah`

Optional metadata can appear inline only when space allows:

`10:00 AM Investor meeting with Sarah · Bondi`

Rules:

- Show concise, human-readable text only
- Never expose raw AFP schema or system labels in the grid
- Prefix with time when known; all-day events omit time
- Use a small color marker, not a full saturated background block, for standard categories
- Use sunset orange only for selected items, active filters, the New Event CTA, and urgent highlights

## Filter pills

Pills live in the left sidebar under `Filters` and update the grid instantly with no loading state.

Base categories:

- Notes
- Emails
- Chat
- Locations
- People
- Weather
- Knowledge Keywords

Color strategy:

- Standard categories should use muted, brand-compatible tones derived from success, blue-grey, earth, and sky ranges
- Pills should stay soft and low-noise on the neutral background
- Accent orange is not the default color for `People`; it remains reserved for active and primary emphasis

Interaction model:

- Selecting a category pill filters the grid
- Selecting a parent pill reveals drill-down pills below it
- Multiple pills can be active at once
- Active pills use accent-outline or accent-text treatment consistent with brand rules
- Search input and pills work together; searching `Sarah` can surface relevant People filters and matching events

## Knowledge Curator behavior

The Knowledge Curator runs continuously in the background and maintains the calendar as a derived, readable planning layer.

It sits inside a broader daemon model governed by the Master Agent:

- `Email Gateway Daemon` brings real email into AFP so date-bearing mail can later become `calendar_event` entries.
- `Relational Sync Worker` maintains disposable Postgres projections for fast calendar filters, list summaries, and other structured views when messages opt into `store_in_relational: true`.
- `Archive & Cold Storage Daemon` may move older AFP history into MinIO cold storage while preserving enough lightweight index state for discovery and restore.
- `Health & Maintenance Daemon` performs idle-time embedding refresh, duplicate detection, and graph cleanup that improve event linking and related-context quality.

Shared rules:

- Daemons are spawned by the Master Agent with delegated scoped keys.
- Daemons operate on AFP messages and AFP-derived indexes only.
- Daemons run asynchronously through ElectricSQL subscriptions or equivalent local-first reactive flows.
- Daemons must not break E2EE or append-only history.

When a new AFP message arrives:

- Extract dates, times, locations, people, tasks, and confidence
- Create a lightweight `calendar_event` message
- Place it on the correct date and time slot
- Link it back to the original message thread and related graph nodes
- Update the grid reactively through SolidJS signals or equivalent reactive state

The visible calendar should always show the cleaned event representation, not the full source document.

## Event detail experience

Selecting a line item should open the detail experience without disorienting the user.

Recommended behavior:

- On desktop, selection populates the right sidebar first
- For deeper inspection, a centered modal can open over a softly blurred background
- The modal uses the same visual language as the email composer and other OmnyID overlays

Content includes:

- Full readable event/source content
- Backlinks as clickable cards
- Related messages and entities
- AI summary
- Action items
- Close control in the top-right

## Creation and interaction patterns

**Adding an event**

- Click or tap the add affordance on a day
- Open a compact popover with:
  - Meeting
  - Task
  - Reminder
  - Voice note

Voice note behavior:

- Starts capture quickly
- Auto-transcribes
- Creates both a note and a linked calendar event when a date is detected or confirmed

**Filtering**

- Changes should feel immediate
- No full-page refreshes or visible layout jumps

**Search**

- Searches both visible event text and semantic relationships
- Can match people, places, topics, and linked source content

**Live updates**

- New curator-generated events appear in-place without interrupting the user
- If the selected day or event changes underneath the user, preserve focus when possible

## Interaction states

- Hover: subtle lift or scale (`1.02`) with border emphasis where appropriate
- Active item: left accent bar (`0.25em`) or equivalent contained accent treatment
- Focus: `2px` solid `#FF6B35`
- Motion: `120ms cubic-bezier(0.4, 0, 0.2, 1)`

## Accessibility and responsiveness

- Contrast ratio must remain at least `4.5:1`
- Fully keyboard navigable
- Touch targets must be at least `2.75em`
- Sidebar collapses below `64em` viewport width
- On screens below `40em`, the layout becomes a vertical stack:
  - top bar
  - mini calendar / filters
  - main calendar
  - detail panel

## Implementation intent

This view should feel like a calm executive planner rather than a busy enterprise scheduler. The grid remains light, readable, and deliberate, while the system does the heavy work of extraction, linking, summarization, and contextual reasoning in the background.
