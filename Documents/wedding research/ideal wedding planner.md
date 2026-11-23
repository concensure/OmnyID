A mediocre AI wedding planner would look like:

Chatbot + checklist + vendor search + calendar.

I don't think that's particularly compelling.

A genuinely excellent one would be closer to a wedding operating system.

It maintains a continuously updated representation such as:

COUPLE
 ├── values
 ├── preferences
 ├── dislikes
 ├── decision styles
 └── approval boundaries

WEDDING
 ├── vision
 ├── budget
 ├── date
 ├── venue
 ├── guest list
 └── requirements

PEOPLE
 ├── family
 ├── wedding party
 ├── guests
 └── responsibilities

VENDORS
 ├── venue
 ├── catering
 ├── photography
 ├── florist
 └── entertainment

DECISIONS
 ├── decided
 ├── pending
 ├── blocked
 └── deadline

MONEY
 ├── budget
 ├── quotes
 ├── contracts
 ├── deposits
 ├── payments
 └── forecast

DEPENDENCIES
 └── decision → consequence → deadline

And that is where AI starts outperforming the traditional planner in particular dimensions.

Perfect institutional memory

Six months ago the bride says:

"I really hate centrepieces that block conversation."

When florist quotes arrive six months later, the AI remembers.

"Option B uses 650 mm arrangements. This conflicts with your earlier preference for unobstructed table conversation. Shall I ask the florist for a lower arrangement?"

That is memory → reasoning → intervention.


Continuous budget intelligence

Instead of a spreadsheet saying:

Budget: $80,000
Spent: $54,200

the AI says:

You're currently committed to $54,200, but realistic projected expenditure is $83,700 because entertainment, transport and supplier meals remain uncontracted.

Even better:

Choosing Photographer A adds $2,400. Based on your stated priority of photography over florals, I can offset approximately $1,900 by moving from premium floral package B to A without materially affecting your stated wedding vision.

That's decision support.

Dependency reasoning

Suppose:

Wedding → 14 March

Therefore:

Invitations → January
Stationery printing → December
Final guest list → November
Accommodation blocks → September

The AI shouldn't wait for:

"What should I do next?"

It should say:

Hotel blocks are becoming the critical path. Three accommodation options are available near the venue; shall I compare cancellation terms and guest rates?

That's proactive planning.

6. AI can also solve the communication problem unusually well

Instead of twenty disconnected conversations:

Bride ↔ florist
Groom ↔ photographer
Planner ↔ venue
Mother ↔ caterer
Bride ↔ planner

the AI maintains one underlying state.

An email arrives:

"Unfortunately we can't provide the peonies originally quoted."

The system understands:

Vendor: florist
Affected object: bridal bouquet
Preference: soft pink/white
Budget: unchanged
Wedding: 23 days away
Decision required: replacement flower.

Then:

"The florist can't obtain your requested peonies. They suggested garden roses or ranunculus at the same price. Both fit your existing colour palette. Garden roses are closer to the shape you originally selected. Would you like me to approve that substitution?"

The user deals with the decision, not the administrative machinery behind it.

The killer feature may actually be "relationship memory"

Wedding planning contains enormous numbers of tiny statements:

"Dad doesn't drink."

"Don't seat Aunt Jenny beside Uncle Peter."

"We don't want speeches longer than five minutes."

"Grandma needs wheelchair access."

"Sarah's vegetarian."

"We loved the lighting in that photograph."

"I don't want guests travelling between venues."

Individually trivial.

Collectively they constitute understanding the client.

A strong wedding AI turns them into persistent constraints and relationships rather than storing them as conversation history.

For example:

Grandmother
  ├─ relationship → bride
  ├─ mobility → limited
  ├─ attending → ceremony + reception
  └─ requirement → step-free access

Venue B
  └─ ceremony access → stairs only

CONFLICT DETECTED

I would design the first AI conversation very differently

Don't give users a 47-question onboarding form.

Start conversationally:

"Tell me what the two of you imagine when you think about your wedding."

Then progressively infer what is known and unknown.

Perhaps they answer:

"Maybe around 100 people. Somewhere around Sydney, probably outdoors. We don't want anything too formal and we'd rather spend money on food than decorations."

The AI has already extracted:

guest_count ≈ 100
location = Sydney
venue_preference = outdoor
formality = low
priority(food) > priority(decor)

Now ask the highest-information unanswered question, perhaps:

"Have you settled on a date or season?"

Not:

"What colour flowers do you want?"

The interview therefore becomes adaptive, not questionnaire-driven.

Instead of a dashboard saying:

47 tasks remaining

show:

3 things need your attention

And perhaps:

Choose photographer
Needed by 3 October

I've narrowed 18 photographers to 3 that match your documentary style, Saturday availability and $4,000–$5,000 budget.

Recommended: Sarah Chen Photography
Why: strongest match to the candid, low-interruption style you both preferred.

Compare 3 Show me why Decide later

More concerning is budget drift through individual decisions. One couple reported selecting plates estimated at $3 each that eventually became $8 each, contributing to a substantially higher final spreadsheet. Another complained that their planner continued suggesting vendors and décor beyond explicitly stated spending limits.

So don't make the homepage budget card simply:

Budget
$47,300 / $60,000

Give OmnyID three concepts:

Budget → Committed → Forecast

For example:

Wedding budget
$60,000

Committed $38,420
Expected final $57,800
Uncertainty ±$4,600

⚠ Catering final numbers represent the largest remaining exposure.

More importantly, connect money to values.

If OmnyID knows:

priority:
  guest_food: very_high
  photography: high
  flowers: low
  stationery: low

and photography runs $2,000 over budget, it shouldn't simply announce:

You're over budget.

It can reason:

Photography option A would increase forecast expenditure by $1,900. Because you've consistently prioritised photography over floral styling, reducing ceremony florals from Package B to A would recover approximately $1,400 without compromising one of your high-priority experiences.

That is something spreadsheets cannot do particularly well.

A particularly revealing recent complaint about a full-service planner says the planner goes silent, requires chasing and presents vendor problems asking what the couple wants to do rather than recommending a solution. The poster summarises the issue as the mental load of moving things forward remaining with the couple.

That sentence could almost become OmnyID Wedding's design brief:

The couple should not be the wedding's project manager.

PersonalOS should therefore maintain the operational state continuously:

Wedding State

Venue
✓ contracted
✓ deposit paid
○ final guest count due 12 Jan

Photographer
✓ contracted
✓ deposit paid
○ shot preferences — not urgent

Florist
⚠ revised quotation awaiting response
  received: yesterday
  response required: 4 Oct

Catering
○ tasting: 18 Oct
○ dietary information: 73/94 guests
⚠ 21 outstanding RSVPs

Transport
⚠ unresolved
  depends on final accommodation distribution

Most of this should never appear on the homepage.

PersonalOS watches it.

DecisionOS surfaces something only when human judgement becomes valuable.

The deeper opportunity: infer the wedding, don't make couples specify it

This is where I think your ontology/supertag architecture could produce something substantially more interesting than existing wedding software.

An experienced wedding planner doesn't just collect:

Colour = sage
Guests = 120
Budget = $65k
Venue = winery

They gradually form a mental representation of these people.

Consider a couple who says during different conversations:

"We hate being the centre of attention."

"Our favourite nights are having ten friends around for dinner."

"Food matters much more to us than flowers."

"We don't really like formal photographs."

"My grandmother coming is incredibly important."

"I'd rather spend $10k on our honeymoon than add another $10k to the wedding."

None of those says:

desired_wedding = intimate_relaxed_guest_centric

But an experienced planner infers it.

OmnyID should too.

Build a Wedding Experience Model

I'd add a wedding-specific ontology above the generic PersonalOS rather than building a separate wedding-planning architecture.

Something like:

WeddingExperience
│
├── Atmosphere
│   ├── intimate ↔ spectacular
│   ├── relaxed ↔ formal
│   ├── spontaneous ↔ choreographed
│   ├── private ↔ performative
│   └── traditional ↔ unconventional
│
├── Social experience
│   ├── couple-centred
│   ├── family-centred
│   ├── guest-centred
│   └── community-centred
│
├── Sensory experience
│   ├── food
│   ├── music
│   ├── visual
│   ├── setting
│   └── physical comfort
│
├── Values
│   ├── authenticity
│   ├── hospitality
│   ├── tradition
│   ├── celebration
│   ├── family
│   └── simplicity
│
└── Friction tolerance
    ├── attention
    ├── formality
    ├── complexity
    ├── spending
    └── decision involvement

But don't ask users to complete this matrix.

Infer it.

Your kind and supertag architecture becomes very useful here

A normal wedding app sees:

"Mum really wants us to invite the Andersons but I haven't seen them since I was twelve."

as a note.

OmnyID should see several things simultaneously:

kind: message

entities:
  person: mother
  household: Anderson family

supertags:
  #guest-list
  #family-expectation
  #social-obligation
  #couple-preference
  #potential-conflict

inferences:
  user_preference: weak_against_invitation
  mother_preference: strong_for_invitation

decision:
  invite_anderson_family

decision_state:
  unresolved

confidence:
  0.86

That's an enormous difference.

Another conversation:

"That wedding was beautiful but everything felt staged. We barely got to talk to James and Anna."

could produce:

#experience-signal
#negative-example
#social-access
#anti-preference

inference:
  couple values interaction with guests
  couple dislikes highly choreographed timelines

The user never filled in a questionnaire saying:

"Choreography tolerance: 2/10."

The system learned it naturally.

Separate four things that wedding software usually conflates

This is particularly important.

Stated preference

"I like outdoor weddings."

Revealed preference

They save 17 photographs of candlelit indoor receptions.

Constraint

Grandmother requires step-free access.

Value

"Having Grandma there matters more than where we get married."

Now suppose the beautiful outdoor venue has difficult accessibility.

A basic recommender says:

Venue match: 92%

A sophisticated OmnyID planner reasons:

Outdoor venue
    ↓ matches stated preference

Poor accessibility
    ↓ conflicts with constraint

Grandmother attendance
    ↓ supports high-weight value

Therefore:
Do not recommend venue despite aesthetic match.

That distinction between preference, constraint and underlying value is where the system begins behaving more like an experienced planner.

Add "Why?" inference chains

Your AI shouldn't silently decide that the couple wants a "relaxed wedding".

Store the evidence.

For example:

We think you want a relaxed, guest-focused celebration.

Why OmnyID thinks this

You both preferred long-table dinners.
You rejected formal plated dining twice.
You said talking with friends was one of your favourite parts of three weddings you've attended.
You dislike prolonged photography.
Food and music consistently rank above décor.
You want approximately 80 guests despite venues accommodating 150+.

Then:

Does that sound right?

Exactly Mostly Not really

That tiny interaction is extraordinarily valuable.

It converts inference into validated personal knowledge.

And the correction feeds PersonalOS.

Learn from decisions, not just conversation

This may be even more important.

Suppose OmnyID repeatedly presents:

A — beautiful, expensive
B — practical, mid-priced
C — unusual, personal

and the couple repeatedly selects C.

The system should gradually learn:

decision pattern:

personal_distinctiveness > prestige
experience > appearance
moderate_price_sensitivity
low_brand_sensitivity

Now future recommendations improve without another interview.

Wedding planning itself becomes the training signal.

Model the couple as two people, not one "user"

This is something I'd consider essential.

Do not collapse:

Alex + Jamie → CouplePreferences

Maintain:

Alex
 ├ preferences
 ├ values
 └ concerns

Jamie
 ├ preferences
 ├ values
 └ concerns

Couple
 ├ shared preferences
 ├ shared values
 ├ negotiated decisions
 └ unresolved differences

Suppose:

Alex: photography 9/10
Jamie: photography 4/10

The correct inference isn't:

Photography = 6.5/10.

Perhaps Alex cares deeply and Jamie is indifferent.

That's very different from both being moderately interested.

OmnyID could recognise:

Jamie hasn't expressed a strong preference about photography, while this appears very important to Alex. Would you like me to optimise this decision primarily around Alex's preferences while keeping within your shared budget?

That's remarkably planner-like.

Then model the wedding as an experience journey

Don't organise everything exclusively around vendor categories.

Experienced planners think about what happens to people.

For example:

Guest receives invitation
        ↓
anticipation
        ↓
travel / accommodation
        ↓
arrival
        ↓
ceremony
        ↓
transition
        ↓
drinks
        ↓
dinner
        ↓
speeches
        ↓
celebration
        ↓
departure
        ↓
next morning

At every transition, ask:

What does the guest see?
What do they know?
What are they waiting for?
Are they comfortable?
What emotion should dominate?

Then the ontology starts identifying experiential problems.

Example:

Ceremony ends 15:30
Reception opens 17:00
Travel = 15 min

→ 75-minute experiential gap

Guests:
  18 elderly
  11 children
  26 from interstate

⚠ EXPERIENCE FRICTION

That's far more useful than:

"Cocktail hour: incomplete."

I would therefore make your homepage extremely restrained

Rather than turning it into another project-management dashboard:

Wedding — 172 days

94 guests
87 confirmed · 7 awaiting

$48,250
of $60,000 · projected $58,700

82% ready
No critical deadlines missed

Then the dominant component:

Three things worth your attention

1. Photographer · Decide within 6 days
3 strong matches from 21 reviewed.

2. Guest accommodation · Decision becoming urgent
Room-block availability is declining.

3. Menu tasting · Enjoyable decision
Your tasting is Saturday; I've prepared your shortlisted dishes.

Underneath could be a small contextual observation:

Your wedding is taking shape as:
warm · relaxed · food-led · intimate · low-formality

See what this means

That final component is unusual.

It reminds the couple that OmnyID isn't merely administering their wedding.

It is understanding what they are trying to create.

The architecture I would aim for

Your existing components map surprisingly cleanly:

                    OMNYID PERSONAL OS
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
     Memory             Ontology          Event State
        │                  │                  │
        └──────────┬───────┴─────────┬────────┘
                   │                 │
            Wedding Model     Relationship Graph
                   │                 │
                   └────────┬────────┘
                            ↓
                    Experience Model
                            ↓
                    Constraint Engine
                            ↓
                     DecisionOS
                            ↓
             importance × urgency × impact
                × confidence × dependency
                            ↓
                   TOP 3 DECISIONS
                            ↓
                         A2UI

And PersonalOS runs behind it:

observe → infer → remember → anticipate → research → coordinate → recommend → request approval → execute → learn.

The distinction I would preserve is:

PersonalOS manages the wedding. DecisionOS manages the couple's attention. The ontology understands the wedding. Supertags capture meaning. A2UI presents only what matters now.

If you achieve that separation properly, the product should feel less like "AI wedding-planning software" and more like having an exceptionally organised planner who has known both partners for years, remembers every conversation, understands why particular things matter, watches the entire project continuously, and only interrupts them when their judgement is genuinely needed.

---

## Implementation Spec: Gap And Progress Map

Date added: 2026-09-25

### Product Target

OmnyID Wedding should feel like a wedding operating system, not a chatbot, checklist, or vendor directory. PersonalOS should quietly maintain the wedding state. DecisionOS should only surface the few items where the couple's judgement is useful. The ontology, supertags, topology, and AFP ledger should turn preferences, constraints, people, vendors, money, and decisions into durable planning knowledge.

### Current Progress

- Home structure is intentionally restrained and should remain as-is.
- The top snapshot area now supports actionable square cards instead of decorative cards.
- Budget, guests, seating, and timeline cards route to their real planner surfaces.
- Budget now separates target, committed amount, expected final, and remaining forecast risk language.
- Guests now shows invited/replied/awaiting rather than only attending.
- Timeline uses a real wedding date helper and avoids confusing ordinary dated tasks with the wedding day.
- "Who is helping" has a tested state layer for workload, overdue items, helper dedupe, and weekly agenda ordering.
- Family boundaries, guest rules, guest drafts, and approvals are AFP-backed through boundary ledger objects.
- Task completion produces AFP status projections and can ask the planner to advance the next related step.
- The decision-focus surface is moving toward "Three things worth your attention" instead of a broad task dashboard.

### Important Gaps

1. Wedding Experience Model

Missing: a durable model of atmosphere, values, friction tolerance, social experience, and sensory priorities.

Needed:
- Represent experience signals as AFP ledger objects.
- Separate stated preference, revealed preference, constraint, and value.
- Store evidence chains for inferred traits.
- Ask lightweight validation questions such as "Does this sound right?"

Urgency: high. This is the main differentiation from ordinary wedding software.

2. Budget Intelligence

Progress: the homepage card now separates budget, committed, and expected final. Budget tracking already reads selected vendors, quotes, contracts, payment dates, and category allocation.

Missing:
- Real uncertainty calculation from uncontracted categories, guest count, quote confidence, tax/service-fee gaps, and payment schedules.
- Safe/balanced/stretch wedding scenarios connected to vendor choices.
- Explanations that connect budget tradeoffs to the couple's values.

Urgency: high. Couples complain when individual decisions quietly create budget drift.

3. Top Three Decisions

Progress: PersonalOS ranks wedding items and DecisionOS surfaces a bounded focus list. The UI now frames it as "Three things worth your attention."

Missing:
- Better decision summaries: "needed by date", "why now", "what OmnyID already narrowed", and "recommended option".
- Real postpone/decide-later persistence.
- "Compare", "Show me why", and approval actions should each map to a durable AFP action, not only navigation.

Urgency: high. This is the homepage's main promise: reduce mental load.

4. Relationship Memory And Constraints

Progress: family boundaries, guest rules, household grouping, and private rationale handling exist in the boundary subsystem.

Missing:
- Convert small relationship facts into persistent constraints: accessibility, seating conflicts, dietary needs, speech limits, travel burden, family sensitivities.
- Make these constraints visible when they affect venue, seating, transport, vendor, or schedule choices.
- Couple-only private notes need the real E2EE path, not only field naming.

Urgency: high. Relationship memory is one of the strongest wedding-specific advantages.

5. Couple-As-Two-People Model

Missing:
- Separate partner preferences, concerns, and values.
- Detect when one partner cares strongly and the other is indifferent.
- Record negotiated decisions without averaging away important differences.

Urgency: medium-high. This prevents poor recommendations and helps reduce conflict.

6. Guest Experience Journey

Missing:
- Model the guest journey from invitation through travel, arrival, ceremony, transition, dinner, speeches, celebration, departure, and next morning.
- Detect experiential gaps, such as long waits, difficult transitions, inaccessible locations, or confusing communication.

Urgency: medium-high. This makes the planner feel experienced rather than administrative.

7. Persistence For Core Planning Data

Progress: many wedding outputs can be projected as AFP messages; boundary objects are ledger-like.

Missing:
- Guest list, budget line items, seating plan, helper assignments, decision ownership, and custom cards should all persist as first-class AFP ledger objects, not only client state.
- Second-device and cleared-browser resilience still need stronger proof for all wedding surfaces.

Urgency: high for production readiness.

8. Vendor And Communication Intelligence

Progress: vendor follow-up cards, outreach approval, seeded vendor data, editable vendor DB, and contact tracking exist.

Missing:
- Incoming communication should update affected objects automatically: vendor, budget, timeline, decision, and dependency.
- The system should recommend the next move, not simply ask the couple what to do.
- Quote normalisation should feed budget drift, decision ranking, and vendor comparison.

Urgency: medium-high.

### Current Homepage Direction

Keep the current homepage layout. Do not replace it with a dense dashboard.

Square card tweaks:
- Timeline: keep days-to-wedding, but show the next meaningful milestone as a clickable line.
- Budget: show Budget, Committed, Expected final, and remaining/forecast risk language.
- Guests: show total guests, replied, awaiting, and attending.
- Seating: show seated and unassigned; if no guests exist, route to Guests first.

Decision card tweaks:
- Title: "Three things worth your attention."
- Each item should answer:
  - what decision or judgement is needed
  - why now
  - what OmnyID already narrowed or checked
  - what the recommended next action is
- Actions should evolve toward:
  - Compare
  - Show me why
  - Approve / choose / postpone

### Most Urgent Build Order

1. Durable AFP persistence for guest, budget, seating, helper assignment, and decision ownership objects.
2. Budget intelligence v2: committed vs estimated vs expected final vs uncertainty, tied to guest count and vendor quote confidence.
3. Decision-focus v2: top-three cards with due date, recommendation, reason, and durable action buttons.
4. Wedding Experience Model: inferred values/preferences/constraints with evidence and user validation.
5. Relationship memory constraints: accessibility, seating conflict, family boundaries, dietary needs, speech/timeline limits.
6. Guest journey model: detect experiential gaps and critical-path issues.
7. Two-person couple model: individual partner preferences and negotiated shared decisions.

### Definition Of Done For The Next Product Pass

- No homepage card is decorative only; every card either shows meaningful state or opens the right planner surface.
- The budget card never hides committed spend behind a single remaining number.
- The top decision card never shows more than three primary attention items.
- Each top decision has a reason, evidence, and a clear action.
- Any private or sensitive wedding rationale is either genuinely encrypted or not described as private/E2EE.
- Any planning object that the couple edits survives refresh and can be represented as an AFP ledger object.
