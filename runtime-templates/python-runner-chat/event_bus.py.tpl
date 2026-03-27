"""
event_bus.py — typed, versioned event bus for the Agenton runner.

Provides:
  - AgentEvent dataclass (shared envelope for all events)
  - publish() / subscribe() API
  - asyncio.Queue with back-pressure (MAX_QUEUE_SIZE = 256)
  - Dead-letter queue (DLQ_SIZE = 64) with single-retry drain
  - Token-bucket rate limiting per event type
  - publish_with_retry() with exponential backoff
  - Structured observability logging on every publish and handler completion
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import traceback
from collections import defaultdict
from dataclasses import dataclass, field, asdict
from typing import Any, Callable, Awaitable

try:
    from event_schemas import validate_event, EventValidationError
except ImportError:  # graceful fallback when schemas not present
    def validate_event(event: "AgentEvent") -> None:  # type: ignore[misc]
        pass
    class EventValidationError(Exception):  # type: ignore[no-redef]
        pass

logger = logging.getLogger("agenton.event_bus")

# ── Configuration ────────────────────────────────────────────────────────────

MAX_QUEUE_SIZE = 256   # back-pressure: producers block when full
DLQ_SIZE = 64          # oldest-dropped on overflow

# (max_events, window_seconds)
_RATE_LIMITS: dict[str, tuple[int, float]] = {
    "message_received":       (100, 60.0),
    "capability_registered":  (10,  60.0),
    "sub_agent_result":       (50,  60.0),
    "task_created":           (20,  60.0),
    "task_updated":           (60,  60.0),
    "task_completed":         (20,  60.0),
    "mask_changed":           (10,  60.0),
    "revocation_requested":   (20,  60.0),
    "reflection_complete":    (200, 60.0),
    "goal_updated":           (10,  60.0),
}

# ── Event envelope ────────────────────────────────────────────────────────────

@dataclass
class AgentEvent:
    id: str                        # ULID
    schema_version: str            # "1.0"
    event_type: str                # one of the catalog
    source_agent_id: str
    timestamp: str                 # ISO-8601 UTC
    payload: dict = field(default_factory=dict)
    correlation_id: str | None = None  # task_id or thread_id for tracing


# ── Internal state ────────────────────────────────────────────────────────────

_queue: asyncio.Queue[AgentEvent] = asyncio.Queue(maxsize=MAX_QUEUE_SIZE)
_dlq: asyncio.Queue[tuple[AgentEvent, Exception]] = asyncio.Queue(maxsize=DLQ_SIZE)
_subscribers: dict[str, list[Callable[[AgentEvent], Awaitable[None]]]] = defaultdict(list)

# Token-bucket state: {event_type: [tokens_remaining, last_refill_ts]}
_buckets: dict[str, list[float]] = {}


# ── Rate limiter ──────────────────────────────────────────────────────────────

class RateLimitExceeded(Exception):
    pass


def _check_rate_limit(event_type: str) -> None:
    """Raise RateLimitExceeded if this event type is over its token budget."""
    if event_type not in _RATE_LIMITS:
        return
    max_tokens, window = _RATE_LIMITS[event_type]
    now = time.monotonic()
    if event_type not in _buckets:
        _buckets[event_type] = [float(max_tokens), now]
    bucket = _buckets[event_type]
    elapsed = now - bucket[1]
    # Refill proportionally
    refill = elapsed * (max_tokens / window)
    bucket[0] = min(float(max_tokens), bucket[0] + refill)
    bucket[1] = now
    if bucket[0] < 1.0:
        raise RateLimitExceeded(f"Rate limit exceeded for event type: {event_type!r}")
    bucket[0] -= 1.0


# ── Public API ────────────────────────────────────────────────────────────────

async def publish(event: AgentEvent) -> None:
    """
    Publish an event to the bus.

    Validates schema, checks rate limit, then puts the event on the
    asyncio.Queue. Blocks (back-pressure) when the queue is full.
    """
    try:
        validate_event(event)
    except EventValidationError as exc:
        logger.warning("Event validation failed — routing to DLQ: %s", exc)
        if _dlq.full():
            _dlq.get_nowait()
        await _dlq.put((event, exc))
        return

    try:
        _check_rate_limit(event.event_type)
    except RateLimitExceeded:
        raise

    logger.debug(
        json.dumps({
            "ts": event.timestamp,
            "event": event.event_type,
            "source": event.source_agent_id,
            "correlation_id": event.correlation_id,
            "queue_depth": _queue.qsize(),
        })
    )
    await _queue.put(event)   # blocks when MAX_QUEUE_SIZE reached


def subscribe(event_type: str, handler: Callable[[AgentEvent], Awaitable[None]]) -> None:
    """Register an async handler for a given event type."""
    _subscribers[event_type].append(handler)


# ── Dispatch loop ─────────────────────────────────────────────────────────────

async def dispatch_loop() -> None:
    """
    Main dispatch loop. Run as an asyncio task at startup.
    Delivers each event to all registered subscribers.
    Failed handlers are routed to the DLQ.
    """
    while True:
        event = await _queue.get()
        for handler in list(_subscribers.get(event.event_type, [])):
            t0 = time.monotonic()
            outcome = "ok"
            try:
                await asyncio.wait_for(handler(event), timeout=10.0)
            except Exception as exc:
                outcome = "error"
                logger.error(
                    "Handler %s failed for event %s: %s\n%s",
                    handler.__name__, event.event_type, exc, traceback.format_exc()
                )
                if _dlq.full():
                    _dlq.get_nowait()
                await _dlq.put((event, exc))
            finally:
                duration_ms = int((time.monotonic() - t0) * 1000)
                logger.debug(
                    json.dumps({
                        "ts": event.timestamp,
                        "event": event.event_type,
                        "handler": getattr(handler, "__name__", str(handler)),
                        "outcome": outcome,
                        "duration_ms": duration_ms,
                    })
                )
        _queue.task_done()


# ── Dead-letter queue drain ───────────────────────────────────────────────────

# Track which events have already been retried once
_dlq_retried: set[str] = set()


async def dlq_drain_loop(agent: Any | None = None) -> None:
    """
    Drain the DLQ every 60 seconds.
    Retries each failed event once. On a second failure, emits an AFP
    agent/step audit message (if an agent instance is provided) and logs.
    """
    import datetime

    while True:
        await asyncio.sleep(60.0)
        batch: list[tuple[AgentEvent, Exception]] = []
        while not _dlq.empty():
            try:
                batch.append(_dlq.get_nowait())
            except asyncio.QueueEmpty:
                break

        for event, original_exc in batch:
            if event.id in _dlq_retried:
                # Second failure — emit AFP audit message and drop
                logger.error(
                    "DLQ: event %s (%s) failed twice, dropping. Original error: %s",
                    event.id, event.event_type, original_exc
                )
                if agent is not None:
                    try:
                        from afp.client import Message  # type: ignore[import]
                        await agent.send(Message(
                            type="agent",
                            subtype="step",
                            content={
                                "status": "event_delivery_failed",
                                "event_id": event.id,
                                "event_type": event.event_type,
                                "error": str(original_exc),
                                "dropped_at": datetime.datetime.utcnow().isoformat() + "Z",
                            },
                            metadata={
                                "origin": "event_bus_dlq",
                                "legacy_type": "agent_step",
                            },
                        ))
                    except Exception as audit_exc:
                        logger.error("Failed to emit DLQ audit AFP message: %s", audit_exc)
                _dlq_retried.discard(event.id)
            else:
                _dlq_retried.add(event.id)
                try:
                    await publish(event)
                    _dlq_retried.discard(event.id)
                    logger.info("DLQ: event %s redelivered successfully", event.id)
                except Exception as retry_exc:
                    logger.warning("DLQ: retry for event %s failed: %s", event.id, retry_exc)
                    if _dlq.full():
                        _dlq.get_nowait()
                    await _dlq.put((event, retry_exc))


# ── Retry helper ──────────────────────────────────────────────────────────────

async def publish_with_retry(event: AgentEvent, max_attempts: int = 3) -> None:
    """
    Publish with exponential backoff on RateLimitExceeded or QueueFull.
    Raises on exhaustion.
    """
    delay = 1.0
    for attempt in range(max_attempts):
        try:
            await publish(event)
            return
        except (RateLimitExceeded, asyncio.QueueFull):
            if attempt == max_attempts - 1:
                raise
            await asyncio.sleep(min(delay, 60.0))
            delay *= 2


# ── Utility: build a minimal AgentEvent quickly ───────────────────────────────

def make_event(
    event_type: str,
    source_agent_id: str,
    payload: dict,
    correlation_id: str | None = None,
) -> AgentEvent:
    import datetime
    try:
        from ulid import ULID  # type: ignore[import]
        eid = str(ULID())
    except ImportError:
        import uuid
        eid = str(uuid.uuid4())

    return AgentEvent(
        id=eid,
        schema_version="1.0",
        event_type=event_type,
        source_agent_id=source_agent_id,
        timestamp=datetime.datetime.utcnow().isoformat() + "Z",
        payload=payload,
        correlation_id=correlation_id,
    )
