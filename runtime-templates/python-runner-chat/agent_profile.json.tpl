{
  "agent_id": "{{PRIMARY_AGENT_ID}}",
  "owner_user_id": "{{OWNER_USER_ID}}",
  "owner_email": "{{OWNER_EMAIL}}",
  "default_template_id": "student_day_planner",
  "capabilities": [
    "chat_control",
    "day_planning",
    "message_summary",
    "task_capture",
    "tool_traces",
    "prompt_versions",
    "human_review",
    "afp_agent_endpoint"
  ],
  "approval_required": [
    "send",
    "reply",
    "payments",
    "bookings",
    "destructive_api_actions"
  ],
  "notes": [
    "This is a starter Python runner scaffolded by OmnyID.",
    "The built-in chat window is a private agent IDE surface for non-technical users.",
    "Bring your own API key in .env to connect a live model, or keep using local planning mode until a key is present.",
    "Tool use is capability-gated by runtime_policy.json before execution."
  ]
}
