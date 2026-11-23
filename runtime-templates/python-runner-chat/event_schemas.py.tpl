"""
event_schemas.py — JSON Schema registry for all AgentEvent types.

Unknown fields are allowed (additionalProperties: true) for forward compatibility.
Missing required fields raise EventValidationError, which routes the event to the DLQ.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from event_bus import AgentEvent

try:
    import jsonschema  # type: ignore[import]
    _HAS_JSONSCHEMA = True
except ImportError:
    _HAS_JSONSCHEMA = False


class EventValidationError(Exception):
    pass


# ── Schema definitions ────────────────────────────────────────────────────────

_ENVELOPE_SCHEMA = {
    "type": "object",
    "required": ["id", "schema_version", "event_type", "source_agent_id", "timestamp", "payload"],
    "properties": {
        "id":              {"type": "string", "minLength": 1},
        "schema_version":  {"type": "string", "pattern": r"^\d+\.\d+$"},
        "event_type":      {"type": "string", "minLength": 1},
        "source_agent_id": {"type": "string", "minLength": 1},
        "timestamp":       {"type": "string"},  # ISO-8601
        "payload":         {"type": "object"},
        "correlation_id":  {"type": ["string", "null"]},
    },
    "additionalProperties": True,
}

# Per-type payload schemas — only required fields validated
_PAYLOAD_SCHEMAS: dict[str, dict] = {
    "message_received": {
        "type": "object",
        "required": ["thread_id", "message_id", "from", "timestamp"],
        "properties": {
            "thread_id":  {"type": "string"},
            "message_id": {"type": "string"},
            "from":       {"type": "string"},
            "type":       {"type": "string"},
            "timestamp":  {"type": "string"},
        },
        "additionalProperties": True,
    },
    "capability_registered": {
        "type": "object",
        "required": ["capability_name", "agent_id"],
        "properties": {
            "capability_name": {"type": "string"},
            "version":         {"type": "string"},
            "approval_mode":   {"type": "string", "enum": ["autonomous", "suggest_only", "human_approval_required"]},
            "agent_id":        {"type": "string"},
        },
        "additionalProperties": True,
    },
    "sub_agent_result": {
        "type": "object",
        "required": ["delegation_id", "capability_name", "status"],
        "properties": {
            "delegation_id":   {"type": "string"},
            "capability_name": {"type": "string"},
            "status":          {"type": "string", "enum": ["ok", "failed"]},
            "result":          {},
            "error":           {"type": ["string", "null"]},
        },
        "additionalProperties": True,
    },
    "task_created": {
        "type": "object",
        "required": ["task_id", "intent"],
        "properties": {
            "task_id":  {"type": "string"},
            "intent":   {"type": "string"},
            "priority": {"type": "string", "enum": ["high", "normal", "low"]},
        },
        "additionalProperties": True,
    },
    "task_updated": {
        "type": "object",
        "required": ["task_id", "new_status"],
        "properties": {
            "task_id":    {"type": "string"},
            "old_status": {"type": "string"},
            "new_status": {"type": "string"},
        },
        "additionalProperties": True,
    },
    "task_completed": {
        "type": "object",
        "required": ["task_id"],
        "properties": {
            "task_id":        {"type": "string"},
            "result_summary": {"type": "string"},
            "steps_taken":    {"type": "integer"},
        },
        "additionalProperties": True,
    },
    "mask_changed": {
        "type": "object",
        "required": ["agent_id", "new_mask"],
        "properties": {
            "agent_id": {"type": "string"},
            "old_mask": {"type": ["string", "null"]},
            "new_mask": {"type": "string"},
            "scope":    {"type": "string"},
        },
        "additionalProperties": True,
    },
    "revocation_requested": {
        "type": "object",
        "required": ["delegation_id", "capability_name"],
        "properties": {
            "delegation_id":   {"type": "string"},
            "capability_name": {"type": "string"},
            "requestor_id":    {"type": "string"},
        },
        "additionalProperties": True,
    },
    "reflection_complete": {
        "type": "object",
        "required": ["task_id", "step_id", "decision"],
        "properties": {
            "task_id":  {"type": "string"},
            "step_id":  {"type": "string"},
            "decision": {
                "type": "string",
                "enum": ["continue", "retry", "replan", "done", "escalate"],
            },
        },
        "additionalProperties": True,
    },
    "goal_updated": {
        "type": "object",
        "required": ["agent_id", "new_goal"],
        "properties": {
            "agent_id": {"type": "string"},
            "old_goal": {"type": ["string", "null"]},
            "new_goal": {"type": "string"},
            "user_id":  {"type": "string"},
        },
        "additionalProperties": True,
    },
}


# ── Validator ─────────────────────────────────────────────────────────────────

def validate_event(event: "AgentEvent") -> None:
    """
    Validate the event envelope and, if a payload schema is registered,
    the payload. Raises EventValidationError on failure.
    Falls through silently when jsonschema is not installed.
    """
    if not _HAS_JSONSCHEMA:
        return

    # Validate envelope
    try:
        jsonschema.validate(
            {
                "id": event.id,
                "schema_version": event.schema_version,
                "event_type": event.event_type,
                "source_agent_id": event.source_agent_id,
                "timestamp": event.timestamp,
                "payload": event.payload,
                "correlation_id": event.correlation_id,
            },
            _ENVELOPE_SCHEMA,
        )
    except jsonschema.ValidationError as exc:
        raise EventValidationError(f"Envelope invalid: {exc.message}") from exc

    # Validate payload if we have a schema for this event type
    payload_schema = _PAYLOAD_SCHEMAS.get(event.event_type)
    if payload_schema is not None:
        try:
            jsonschema.validate(event.payload, payload_schema)
        except jsonschema.ValidationError as exc:
            raise EventValidationError(
                f"Payload invalid for {event.event_type!r}: {exc.message}"
            ) from exc
