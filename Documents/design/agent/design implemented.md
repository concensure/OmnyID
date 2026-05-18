Heuristic assessment — all 200 heuristics
The file covers 6 categories (200 heuristics total). Assessment by everyday practicality:

A. Meeting heuristics (45) — practical: high
Most are immediately usable with calendar data OmnyID already ingests. The 12 implemented cover the highest-value cases. Lower-value ones (travel distance/location, departure timing) require Maps API and are left for a later integration phase.

Skip for now (need external data):

Travel buffer/congestion (7, 11–20): need Maps API + live traffic
Monday briefing Sunday evening (10): requires timezone-aware scheduling daemon
Venue parking (19): need location/parking API
Implemented (12): No-agenda, attendee briefing, repeated rescheduling, large-group facilitator, decompression buffer, no-action-items, urgent keyword, same-day client follow-up, cognitive overload, cancellation trend, financial commitment, rehearsal block.

B. Email heuristics (45) — practical: high
Highly practical. Most work purely on email metadata and idle patterns. 12 implemented.

Skip for now:

Recipient response timing prediction (66): needs ML model on reply history
Attachment password secure linkage (76): requires encrypted temporary store
Emotional state detection on draft (67): needs sentiment/emotion model
Implemented (12): VIP unanswered, deadline language, client waiting, newsletter stale, sentiment decline, thread too long, inbox spike, approval pending, unsent draft, repeated sender, invoice due date, obligation digest.

C. Deadline heuristics (35) — practical: high
All very practical — work with task metadata. 10 implemented. Ones skipped:

Skip for now:

University semester cycle (124): too role-specific, needs academic calendar
Optimism bias correction (110): needs ML on historical estimates
Weather-sensitive work (112): needs weather API
D. Public transport (25) — practical: low without API
Need real-time transit API (GTFS, TfNSW, etc.). Only 3 implemented at a structural level; they'll produce suggestions when transport events arrive. The others are deferred to a transit integration phase.

E. Weather & large events (30) — practical: low without API
Need weather API (BOM/OpenWeatherMap) and events API (Songkick/Ticketmaster). 3 implemented as structural hooks. Skip for MVP.

F. Finance & tax (20) — practical: high for business users
Very practical. 10 implemented. Skipped:

Property settlement (195): too role-specific
Construction budget variance (198): needs project accounting integration
Historical tax refund delay prediction (190): needs ML on past data
Overall verdict
85 heuristics are practically implementable with existing OmnyID data. The 115 that need external APIs (transport, weather, events, maps) should be deferred to integration phases. The 4 that need ML models (sentiment, optimism bias, etc.) sit in a middle tier.

Pack-based agent suggestion (active + passive)


85 heuristics are practically implementable with existing OmnyID data. The 115 that need external APIs (transport, weather, events, maps) should be deferred to integration phases. The 4 that need ML models (sentiment, optimism bias, etc.) sit in a middle tier.

Pack-based agent suggestion (active + passive)
How the agent suggests packs
Passive (already implemented): After every POST /events/passive, suggest_packs_from_behavior() analyses temporal summary and behavioral memory. If ≥3 calendar events are in the temporal log, it suggests the Meeting pack. If ≥5 email events, it suggests the Email pack. If finance/invoice delay patterns exist in behavioral memory, it suggests the Finance pack. These emit as proactive_suggestion messages with is_pack_suggestion: true and appear in DashboardFeed.

Active (interface/view/scenario mapping):

Scenario	Surface	Trigger	Behaviour
First-run onboarding	DashboardFeed + Suggestions tab	Any passive event ingested	Pack suggestion card rendered: "Based on your activity, enable Meeting Intelligence?"
Heavy meeting schedule detected	DashboardFeed card (low urgency)	calendar events ≥ 3 in temporal log	Amber/violet card with "Enable pack" action button
High email volume detected	DashboardFeed card	email events ≥ 5 in temporal log	Card: "Enable Email Intelligence to track obligations automatically"
Finance admin delays observed	DashboardFeed card	behavioral memory: invoice/finance patterns	Card with Finance pack suggestion
Manual discovery	AgentSettingsView → Proactive Behaviour	User opens settings	Full pack catalogue with toggle cards, heuristic count, external data badge
Command bar	/ui/command query	User types "what packs should I use"	Agent reads enabled packs + usage patterns and recommends