from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


app = FastAPI(title="OmnyID AFP Service Adapter", version="0.1.0")


class AfpCapabilityRequest(BaseModel):
    protocol: str = "afp-v1"
    id: str
    thread_id: str
    from_agent: str = Field(alias="from")
    capability_id: str
    payload: dict[str, Any] = Field(default_factory=dict)
    signature: str


def service_agent_id() -> str:
    return os.getenv("SERVICE_AGENT_ID", "agent:service@example.edu")


def service_base() -> str:
    return os.getenv("SERVICE_PUBLIC_BASE", "https://service.example.edu").rstrip("/")


def verify_signed_request(request: AfpCapabilityRequest) -> None:
    # Replace this with real OmnyID signature verification logic.
    if not request.signature.strip():
        raise HTTPException(status_code=400, detail="missing signature")


def signed_afp_reply(request: AfpCapabilityRequest, capability_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    # Replace `signature` with a real Ed25519 signature using the service key.
    return {
        "protocol": "afp-v1",
        "id": f"reply-{request.id}",
        "thread_id": request.thread_id,
        "parent_id": request.id,
        "from": service_agent_id(),
        "to": [request.from_agent],
        "timestamp": now_iso(),
        "type": "capability_result",
        "content": {
            "capability_id": capability_id,
            "status": "ok",
            "payload": payload,
        },
        "signature": "replace-with-real-signature",
        "encryption": None,
        "views": [],
        "references": [],
        "attachments": [],
        "store_in_relational": False,
    }


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok", "service": "omnyid-afp-service-adapter"}


@app.get("/.well-known/agent-card")
def agent_card() -> dict[str, Any]:
    return {
        "agent_id": service_agent_id(),
        "display_name": "Service Adapter",
        "transport": {
            "https": service_base(),
        },
        "capabilities": [
            {"id": "timetable", "path": "/capability/timetable"},
            {"id": "deadlines", "path": "/capability/deadlines"},
        ],
        "public_keys": {
            "signing": os.getenv("SERVICE_PUBLIC_KEY_HEX", ""),
        },
        "key_id": "service-key-1",
        "previous_key_ids": [],
    }


def fetch_timetable(student_id: str) -> list[dict[str, Any]]:
    # Replace this with your real portal or SIS integration.
    return [
        {
            "course": "COMP101",
            "title": "Programming Fundamentals",
            "starts_at": "2026-03-23T09:00:00+11:00",
            "ends_at": "2026-03-23T10:30:00+11:00",
            "location": "Building A / Room 2",
            "student_id": student_id,
        }
    ]


def fetch_deadlines(student_id: str) -> list[dict[str, Any]]:
    # Replace this with your LMS or assessment system integration.
    return [
        {
            "course": "COMP101",
            "title": "Week 4 lab submission",
            "due_at": "2026-03-25T23:59:00+11:00",
            "student_id": student_id,
        }
    ]


@app.post("/capability/timetable")
def timetable(request: AfpCapabilityRequest, x_request_id: str | None = Header(default=None)) -> dict[str, Any]:
    del x_request_id
    verify_signed_request(request)
    student_id = str(request.payload.get("student_id", "")).strip()
    if not student_id:
        raise HTTPException(status_code=400, detail="student_id is required")
    return signed_afp_reply(request, "timetable", {"entries": fetch_timetable(student_id)})


@app.post("/capability/deadlines")
def deadlines(request: AfpCapabilityRequest, x_request_id: str | None = Header(default=None)) -> dict[str, Any]:
    del x_request_id
    verify_signed_request(request)
    student_id = str(request.payload.get("student_id", "")).strip()
    if not student_id:
        raise HTTPException(status_code=400, detail="student_id is required")
    return signed_afp_reply(request, "deadlines", {"entries": fetch_deadlines(student_id)})


@app.get("/capabilities")
def capabilities() -> dict[str, Any]:
    return {
        "capabilities": [
            {
                "id": "timetable",
                "description": "Returns timetable entries for an authorized student.",
                "transport": "https",
            },
            {
                "id": "deadlines",
                "description": "Returns upcoming assignment deadlines for an authorized student.",
                "transport": "https",
            },
        ]
    }
