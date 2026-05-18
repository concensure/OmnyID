Building a General-Purpose, Interactive Planning Assistant

Core Objective
Build a manager-led, stateful, tool-rich assistant that answers general queries (like Google, but interactive) with a focus on goal-oriented planning. The assistant should feel intelligent, trustworthy, and easy to refine—not a travel planner, but a general-purpose helper that can handle complex, multi-step queries (e.g., "Find me the best way to X, avoiding Y, with Z constraints").



🎯 Design Principles


Manager-First Architecture

One orchestration agent owns the conversation and final answer.
Narrow, hidden specialists (tools) handle sub-tasks (e.g., location resolution, preference inference, live data analysis).
Benefits: Consistent voice, easier debugging, lower latency, higher trust.


Progressive Autonomy

Silent: Read-only tasks (e.g., checking weather, traffic, events).
Soft Confirm: Reversible actions (e.g., saving preferences, pinning a destination, confirming details such as number of people on a trip to make the search and task planning more customised and meaningful).
Hard Confirm: Irreversible actions (e.g., bookings, payments, sending messages).


Structured Working State

Maintain a machine-readable session state (e.g., user goal, time context, constraints, unresolved ambiguities, evidence gathered).
The LLM reasons over the state, not raw chat history. Use AFP message for all agent to agent communication. Use ledger if necessary.


Tool Contracts

Tools must have clear input/output schemas (e.g., find_routes(origin, destination, depart_time, transport_modes, avoid_tolls)).
Avoid vague tools like search_routes(query).


Interactive Answer Composition

Outputs are structured, not just prose:

Cards (best route, alternatives, travel time ranges).
Rationale ("why this is best").
Comparison tables.
Live risk flags.
Editable assumptions.
One-tap follow-ups (e.g., "leave 20 mins later," "avoid tolls").

Each card should have a copy button at the top right of the card that copies the content to the user's clipboard.



🏗️ Architecture
1. Frontend (User Interface)

Chat/Query Bar: Natural language input.
Results Canvas: Interactive cards (best route, alternatives, rationale, maps, follow-up chips).
Context Strip: Shows current assumptions (e.g., departure time, destination, transport mode).
Explainability Drawer: "Why this route?" / "What constraints were applied?" / "What sources affected the answer?"
Behavior: Hybrid of chat, search, and lightweight dashboard.
2. Backend (Orchestration)

Stateful Orchestrator Loop:

Interpret intent.
Inspect current state.
Decide next tool/specialist.
Execute.
Normalize result into state.
Decide if enough certainty exists.
Compose structured output.

3. Specialist Layer (Hidden from User)


  
    
      Specialist
      Role
    
  
  
    
      Intent & Constraint Parser
      Extracts goals, constraints, and ambiguities from user input.
    
    
      Location/Venue Resolver
      Resolves vague destinations (e.g., "the city" → "Sydney CBD").
    
    
      Live Conditions Analyser
      Fetches traffic, public transport alerts, weather, closures.
    
    
      Preference Modeller
      Infers user preferences (e.g., avoids tolls, prefers walking <10m).
    
    
      Uncertainty Handler
      Manages low-confidence data (e.g., parking estimates).
    
    
      Response/UI Planner
      Composes interactive cards, tables, and follow-ups.
    
  


4. Tool Layer (Data & APIs)

Maps/Directions API (e.g., Google Maps, OpenStreetMap).
Public Transport API (timetables, disruptions).
Event/Weather APIs (e.g., Eventbrite, OpenWeather).
Calendar Integration (for personal timing constraints).
User Profile Store (habits, accessibility needs, common destinations).
5. Policy & Safety Layer

Tool Allow/Deny Rules: Restrict risky actions (e.g., no auto-bookings).
Confirmation Thresholds: Silent/soft/hard confirmations.
Hallucination Detection: Validate time-sensitive recommendations.
Source Freshness Checks: Ensure data is up-to-date.
Privacy Controls: Protect location/calendar data.
Fallback Behavior: Handle conflicts in live data.
6. Memory Layer


  
    
      Type
      Purpose
      Example Data
    
  
  
    
      Profile Memory
      Long-term user preferences.
      Home suburb, usual transport mode, accessibility needs.
    
    
      Session Memory
      Current user goal and assumptions.
      Current destination, unresolved trade-offs.
    
  





🎨 UX Design Goals


Anticipatory Clarification

Avoid needless questions. Instead of:

"Which route do you want?"

Say:

"I found 3 viable options. Based on your preference for fewer transfers, this one is best. I can also optimize for cost or walking distance."


Editable Assumptions

Always show assumptions in the UI:
text
Copy

Leaving: 6:30 PM
Priority: Fastest
Avoid: Major event congestion
Walking tolerance: 10 mins


The fields in the assumptions cards shall be editable. If the assumption changes, then the relevant content should also change.



Confidence-Aware Recommendations

Label confidence levels:

High: Best route (live incidents + traffic).
Medium: Parking estimate.
Low: Quieter side-street drop-off.



Threaded Follow-Up

Preserve context for iterative queries:

"What if I leave after dinner?"
"Now show me the same but by train."
"Compare against Uber."





🚀 MVP Scope (Start Here)
Do Include
✅ Natural language goal input (e.g., "Find me the best way to X, avoiding Y").

✅ Vague destination resolution (e.g., "the city" → "Sydney CBD").

✅ Route options + 1-2 live constraints (e.g., traffic, weather).

✅ Ranked, interactive cards (best route + alternatives).

✅ Iterative follow-ups (no context reset).
Do Not Include (Yet)
❌ Payments/bookings.

❌ Broad web browsing.

❌ Too many verticals (e.g., travel, shopping, health).

❌ Unrestricted multi-agent autonomy.

❌ Long autonomous task chains.



📊 Evaluation Metrics
Track these to ensure quality:

Accuracy: Intent classification, tool selection, constraint extraction.
User Satisfaction: Route ranking, unnecessary clarification rate.
Continuity: Follow-up success, source freshness compliance.
Latency: Time per workflow stage.
Human-Centered: "Was the first recommendation good enough without correction?"



💡 One-Sentence Target Design
"Build a manager-led, stateful, tool-rich consumer planning assistant with deterministic scaffolding, narrow hidden specialists, progressive autonomy, and an interactive results surface that exposes assumptions and trade-offs."



🔜 Next Steps for You

Start with a narrow, high-frequency scenario (e.g., route planning under real-world constraints).
Implement the orchestration loop (interpret → inspect → decide → execute → normalize → compose).
Design the interactive UI (cards, assumptions, follow-ups).
Add specialists/tools one by one (e.g., start with location resolver + route planner).
Test and evaluate using the metrics above.
