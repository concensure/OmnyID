Where AI agents operate (highlighted nodes):

D (Decision Point): Main agent operation. A lightweight rule engine first (no tokens), then optional LLM call for smart filtering (“is this urgent?”, “extract action items”, “generate summary”).
F (LLM Summariser + Auto-reply): Core AI agent here. Uses the Phase 2 summarizer (can call Ollama locally or Groq). The agent can also decide to create backlinks or sync to relational tables.
J → K: Outgoing agent can be fully autonomous (e.g., an invoice agent sends updates via your personal address).