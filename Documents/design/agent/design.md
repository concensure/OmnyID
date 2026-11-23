0. OmnyID Evolved Design Addendum
These principles supersede the generic guidance below anywhere they conflict. They reflect the current OmnyID product shape and should be treated as the primary design constraints for new agent work.

A. Product Shape

- OmnyID is not a chatbot-first assistant. It is a calm Decision OS that compresses cognitive load into a guided next step, bounded trust cues, and a reversible action path.
- The default experience should be: one surfaced priority, one recommended path, optional reasoning on demand, and one clear next action.
- The product should prefer cards, lanes, and prepared artifacts over long chat paragraphs. Complexity should be inspectable, not forced.
- The user should feel in control while the system does the coordination, retrieval, drafting, comparison, and preparation work underneath.

B. Architecture Rules

- AFP v1 remains the single atomic unit. Do not invent side channels or parallel memory systems for cognition, trust, or continuity.
- Ledger remains append-only, message-first, local-first, and privacy-preserving. Extend existing message families before creating new ones.
- A2UI remains the only user-facing rendering path. New agent logic should improve existing DecisionOS, continuity, retrieval, and proactive surfaces instead of creating separate UI classes.
- Master Agent remains the orchestrator. Do not create a second durable control plane beside the existing watcher, synthesizer, projection, and master flow.

C. State and Reasoning

- Prefer state monitoring over brittle rule bundles. The main substrate is watcher signals -> synthesized state -> proactive/DecisionOS surfacing, not isolated one-off heuristics.
- Prefer metadata-first, heuristics-first activation. Decrypt, embed, simulate, or escalate only when the cheap signals indicate that deeper work is justified.
- Reuse the current continuity substrate (`state_snapshot`, continuity metrics, prepared artifacts, proactive suggestions) instead of inventing a second snapshot or planning family.
- Use topology and relationship continuity as first-class context. Retrieval and surfacing should lean on `relation_link`, legacy-compatible `knowledge_link`, shared object references, and thread continuity before adding new memory silos.
- Use Bohm field pressure, continuity metrics, and prepared artifacts as bounded ranking inputs. They should shape prioritization and explanation, not replace the rest of the state model.

D. Initiative and Trust

- Background initiative must feel calm, preference-bounded, and reversible. If the system is uncertain, it should narrow, defer, or ask rather than bluff.
- Trust should be progressive and legible: why now, why this, confidence, consequence, provenance, and undo should be available without forcing the user through a wall of detail.
- The system should prefer prepared help over generic nudges. Finished context packs, prepared drafts, and bounded review items should usually outrank low-value reminders when both are available.
- Reversibility is not just a safety feature; it is a core UX principle for reducing regret and making delegation feel comfortable.

E. Memory and Relationship Principles

- Avoid proliferating parallel ledgers for every relationship or context. Prefer stable identifiers, metadata, relation links, and evolving topology over silo creation.
- Relationship continuity should evolve through stable `relationship_id`-style grouping and additive metadata updates rather than creating replacement ledgers when the relationship changes shape.
- Memory should distinguish raw evidence from agent interpretation where it materially improves trust, but this should be implemented as additive structure inside the existing ledger/message substrate rather than as a second memory system.
- Follow-up timing, resurfacing, and memory promotion should stay heuristics-first and user-respectful. Persistent proactive surfacing should be traceable to real continuity, topology, or prepared-artifact state.

F. Decision UX Principles

- The product should optimize for decision + confidence + reversibility + action, not just recommendation quality.
- The UX should reduce four common failures at once: loss of control, information overload, regret risk, and identity misalignment.
- One primary action per surface remains the default. Alternative paths, expert detail, and deeper evidence should be available through progressive disclosure.
- The best agent work often looks like compression: fewer surfaced choices, better prepared context, clearer trade-offs, and lower switching cost.

1. Core Design Principles
These are the non-negotiable rules your agent should obey to feel proactive without being intrusive or unpredictable.
A. User-Centric Principles


  
    
      Principle
      Why It Matters
      Example
    
  
  
    
      Explicit Consent
      Users must opt into proactivity (no surprises).
      "Enable ‘Smart Suggestions’ to let me anticipate your needs."
    
    
      Transparency
      Always explain why an action is suggested.
      "I scheduled this meeting because you always accept invites from Alex on Tuesdays."
    
    
      Reversibility
      Every proactive action must be undoable.
      "I booked a ride to the airport. [Undo] [Confirm]"
    
    
      Progressive Trust
      Start with low-risk actions; earn trust for higher-stakes decisions.
      Begin with "Want me to draft a reply?" before "Want me to send it?"
    
    
      Contextual Relevance
      Only act on current or predicted user intent.
      If the user is in "focus mode," suppress non-urgent notifications.
    
  


B. Technical Principles


  
    
      Principle
      Why It Matters
      Example
    
  
  
    
      Modularity
      Components (hooks, scripts, models) should be decoupled and replaceable.
      Swap a calendar hook for a Notion hook without breaking the system.
    
    
      Observability
      Log why decisions were made for debugging.
      "Suggested break because: (1) 2h of continuous work, (2) Calendar shows no meetings."
    
    
      Idempotency
      Proactive actions should be repeatable without side effects.
      If a reminder fails to send, retrying won’t spam the user.
    
    
      Latency Awareness
      Proactive actions must be fast (or async if slow).
      Pre-fetch data for likely next steps (e.g., load flight options when a user checks dates).
    
    
      Fallback Gracefully
      If unsure, ask—don’t guess.
      "I’m 70% confident you want to reschedule. Should I proceed?"
    
  



2. Architectural Components
A proactive agent should be a composite system with these layers:
A. Input Layer (Sensors)
Gathers raw data about the user and environment.

Hooks/Triggers:

Time-based: Cron jobs, calendar events.
Event-based: File changes, app notifications (e.g., Slack messages, GitHub PRs).
Behavioral: Keystrokes, mouse activity, app usage patterns.
External: Weather, stock prices, news (for context-aware suggestions).

Data Sources:

User’s calendar, emails, documents, browser history (with permission).
Third-party APIs (e.g., Google Maps for traffic, Stripe for payments).

Example (for your agent website):
python
Copy

# Pseudocode for a "hook" system
class Hook:
    def __init__(self, trigger_type, callback):
        self.trigger_type = trigger_type  # e.g., "time", "github_pr", "user_idle"
        self.callback = callback          # Function to run when triggered

hooks = [
    Hook("time", lambda: check_calendar_for_meetings()),
    Hook("github_pr", lambda: review_pr_and_suggest_changes()),
    Hook("user_idle", lambda: suggest_break()),
]




B. Context Layer (Brain)
Processes raw data into actionable insights.

State Management:

Maintains a real-time model of the user’s goals, preferences, and current context.
Example: "User is in ‘work mode’ (typing in VS Code), has a deadline in 3h, and prefers coffee at 3 PM."

Memory:

Short-term: Session-based (e.g., current task).
Long-term: User habits, preferences (e.g., "Always declines meetings after 5 PM").
Semantic Indexing: Use your semantic project’s AST/logical node graphs to understand code/documents the user is working on.

Prediction Engine:

Uses ML (or simple heuristics) to forecast needs.
Example: "User opens Figma at 10 AM daily → Pre-load Figma and suggest templates."

Tools to Use:

Vector DBs (e.g., Pinecone, Weaviate) for semantic search in user data.
Graph DBs (e.g., Neo4j) for relationship mapping (e.g., "This PR is linked to the Q3 goals doc").
Rule Engines (e.g., Drools) for deterministic logic (e.g., "If user hasn’t taken a break in 2h, suggest one").

C. Decision Layer (Orchestrator)
Decides what to do and when.

Priority Engine:

Ranks actions by urgency, user preference, and confidence.
Example:


  
    
      Action
      Urgency
      User Preference
      Confidence
      Score
    
  
  
    
      Remind about meeting
      High
      High
      95%
      0.95
    
    
      Suggest coffee break
      Low
      Medium
      80%
      0.40
    
  




Conflict Resolution:

Handles competing actions (e.g., "User is in a meeting but also has a deadline").
Example: "Mute non-urgent notifications during meetings unless marked ‘critical.’"

Permission System:

Checks if the agent is allowed to take an action (e.g., "Can I send this email?").

Example (Priority Scoring):
python
Copy

def calculate_action_score(action):
    urgency = get_urgency(action)      # 0-1
    preference = get_user_preference(action)  # 0-1
    confidence = get_confidence(action)      # 0-1
    return 0.5 * urgency + 0.3 * preference + 0.2 * confidence




D. Action Layer (Actuators)
Executes decisions via scripts, APIs, or UI interactions.

Types of Actions:

Automated: No user input needed (e.g., "Auto-archive old emails").
Suggestive: Requires user approval (e.g., "Want me to reschedule this?").
Hybrid: Automated but reversible (e.g., "I drafted a reply—edit it here").

Integration Methods:

APIs: Directly interact with tools (e.g., Google Calendar, Slack).
Scripts: Run local/remote scripts (e.g., Python, Bash).
UI Automation: Simulate clicks/keystrokes (e.g., Selenium, PyAutoGUI).
MCP/LSP: Use your semantic project’s MCP layer to edit code or fetch context for developers.

Example (Actuator for GitHub):
python
Copy

def suggest_pr_changes(pr_url):
    pr_data = fetch_pr_data(pr_url)
    user_style = get_user_code_style()  # From your semantic project
    suggestions = analyze_pr_with_ast(pr_data, user_style)  # AST-based analysis
    return f"Here are suggested changes for {pr_url}: {suggestions}"




E. Feedback Layer (Learning Loop)
Improves over time via user feedback and self-evaluation.

Explicit Feedback:

"Was this suggestion helpful? [Yes] [No] [Never suggest this again]."

Implicit Feedback:

Tracks if user ignores, modifies, or accepts suggestions.

Self-Correction:

If an action fails (e.g., wrong meeting time), log the error and adjust future behavior.

A/B Testing:

Experiment with different proactivity levels (e.g., "Group A gets aggressive suggestions, Group B gets minimal").

Example (Feedback Loop):
python
Copy

def log_feedback(action, user_response):
    if user_response == "ignored":
        decrease_priority(action.type)
    elif user_response == "accepted":
        increase_priority(action.type)




3. Implementation Strategies
A. Start Small, Iterate Fast

MVP: Build a single proactive feature (e.g., "Suggest breaks after 2h of work").
Expand: Add more hooks/scripts as you validate user needs.
Generalize: Abstract common patterns (e.g., "All time-based hooks inherit from TimeHook").
B. Use a Plugin Architecture

Let users add/remove hooks like browser extensions.
Example:
python
Copy

# Load plugins dynamically
plugins = [
    "calendar_plugin.py",
    "github_plugin.py",
    "focus_mode_plugin.py",
]
for plugin in plugins:
    register_hooks_from(plugin)




C. Leverage Existing Frameworks


  
    
      Component
      Tools/Frameworks
    
  
  
    
      Hooks
      Zapier (no-code), Prefect (Python), Node-RED (flow-based).
    
    
      Context Engine
      LangChain (for LLM-based reasoning), Rasa (for dialogue management).
    
    
      Decision Logic
      Drools (rule engine), Scikit-learn (ML prioritization).
    
    
      Actuators
      Selenium (UI), Requests (APIs), PyAutoGUI (desktop automation).
    
    
      Memory
      Pinecone (vector DB), Neo4j (graph DB), SQLite (simple K-V store).
    
  


D. Safety and Guardrails

Sandboxing: Run untrusted scripts in containers (e.g., Docker).
Rate Limiting: Prevent action spam (e.g., "Max 1 suggestion per minute").
User Overrides: Always allow manual intervention (e.g., "Pause all automation").

4. Example: Proactive Agent for Developers
(Relevant to your semantic project and autonomous agent website.)
Hooks:

GitHub: On PR creation → "Run semantic analysis and suggest improvements."
VS Code: On file save → "Check for style violations using your AST rules."
Calendar: Before meetings → "Pull up relevant docs/code mentioned in the invite."
Context Engine:

Uses your logical node graph to understand:

"This PR modifies the auth module, which is critical for the Q3 launch."
"The user always reviews tests before merging—flag if tests are missing."

Actions:

Auto: "Archive stale branches older than 30 days."
Suggest: "This PR conflicts with the db-schema branch. Want me to rebase?"
Hybrid: "I’ve generated a test suite for your new function. [Edit] [Accept]."
Feedback:

If the user reverts an auto-merge, log: "User prefers manual merges for auth module."

5. Key Challenges & Solutions


  
    
      Challenge
      Solution
    
  
  
    
      Cold Start Problem
      Use default templates (e.g., "Most users like break reminders") until personalized.
    
    
      Over-Personalization
      Let users reset to defaults if the agent feels "creepy."
    
    
      Performance Overhead
      Cache frequent queries (e.g., "User’s top 5 projects").
    
    
      Privacy Concerns
      Local-first design (e.g., run hooks on-device). Use differential privacy for analytics.
    
    
      Brittle Hooks
      Fuzzy matching (e.g., "If user types ‘meet’ or ‘call,’ trigger calendar check").
    
  


