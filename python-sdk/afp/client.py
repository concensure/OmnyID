import asyncio
import base64
import json
import os
import ssl
from datetime import datetime
from typing import Any, Dict, Literal
from urllib.parse import urlparse

import httpx
import websockets
from aioquic.asyncio.client import connect as quic_connect
from aioquic.asyncio.protocol import QuicConnectionProtocol
from aioquic.h3.connection import H3Connection, H3_ALPN
from aioquic.h3.events import DataReceived, H3Event, HeadersReceived, WebTransportStreamDataReceived
from aioquic.quic.configuration import QuicConfiguration
from aioquic.quic.events import ConnectionTerminated, ProtocolNegotiated, QuicEvent
from nacl.bindings import (
    crypto_aead_xchacha20poly1305_ietf_decrypt,
    crypto_aead_xchacha20poly1305_ietf_encrypt,
    crypto_box_seal,
    crypto_box_seal_open,
    crypto_sign_ed25519_pk_to_curve25519,
    crypto_sign_ed25519_sk_to_curve25519,
)
from nacl.encoding import HexEncoder
from nacl.signing import SigningKey, VerifyKey
from nacl.utils import random as random_bytes
from pydantic import BaseModel, ConfigDict, Field
from ulid import ULID


class _OmnyidWebTransportClient(QuicConnectionProtocol):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._http: H3Connection | None = None
        self._control_queues: dict[int, asyncio.Queue[H3Event | None]] = {}
        self._stream_queues: dict[int, asyncio.Queue[bytes | None]] = {}

    def quic_event_received(self, event: QuicEvent) -> None:
        if isinstance(event, ProtocolNegotiated):
            self._http = H3Connection(self._quic, enable_webtransport=True)
        elif isinstance(event, ConnectionTerminated):
            for queue in self._control_queues.values():
                queue.put_nowait(None)
            for queue in self._stream_queues.values():
                queue.put_nowait(None)

        if self._http is None:
            return

        for http_event in self._http.handle_event(event):
            self.http_event_received(http_event)

    def http_event_received(self, event: H3Event) -> None:
        if isinstance(event, (HeadersReceived, DataReceived)):
            queue = self._control_queues.get(event.stream_id)
            if queue is not None:
                queue.put_nowait(event)
        elif isinstance(event, WebTransportStreamDataReceived):
            queue = self._stream_queues.get(event.stream_id)
            if queue is not None:
                if event.data:
                    queue.put_nowait(event.data)
                if event.stream_ended:
                    queue.put_nowait(None)

    async def establish_session(self, url: str) -> int:
        if self._http is None:
            raise RuntimeError("HTTP/3 was not negotiated for WebTransport")

        parsed = urlparse(url)
        path = parsed.path or "/"
        if parsed.query:
            path = f"{path}?{parsed.query}"

        stream_id = self._quic.get_next_available_stream_id()
        queue: asyncio.Queue[H3Event | None] = asyncio.Queue()
        self._control_queues[stream_id] = queue
        self._http.send_headers(
            stream_id=stream_id,
            headers=[
                (b":method", b"CONNECT"),
                (b":scheme", b"https"),
                (b":authority", parsed.netloc.encode("utf-8")),
                (b":path", path.encode("utf-8")),
                (b":protocol", b"webtransport"),
                (b"user-agent", b"omnyid-python-sdk/1.0"),
            ],
        )
        self.transmit()

        try:
            while True:
                event = await queue.get()
                if event is None:
                    raise ConnectionError("WebTransport session closed before CONNECT completed")
                if isinstance(event, HeadersReceived):
                    status = _header_value(event.headers, b":status")
                    if status == "200":
                        return stream_id
                    raise ValueError(
                        f"WebTransport CONNECT failed with status {status or 'unknown'}"
                    )
        finally:
            self._control_queues.pop(stream_id, None)

    async def send_request(self, session_id: int, payload: bytes) -> bytes:
        if self._http is None:
            raise RuntimeError("HTTP/3 was not negotiated for WebTransport")

        stream_id = self._http.create_webtransport_stream(session_id)
        queue: asyncio.Queue[bytes | None] = asyncio.Queue()
        self._stream_queues[stream_id] = queue
        self._quic.send_stream_data(stream_id, payload, end_stream=True)
        self.transmit()

        chunks: list[bytes] = []
        try:
            while True:
                chunk = await queue.get()
                if chunk is None:
                    break
                chunks.append(chunk)
        finally:
            self._stream_queues.pop(stream_id, None)

        return b"".join(chunks)

    async def open_subscription(self, session_id: int, payload: bytes) -> asyncio.Queue[bytes | None]:
        if self._http is None:
            raise RuntimeError("HTTP/3 was not negotiated for WebTransport")

        stream_id = self._http.create_webtransport_stream(session_id)
        queue: asyncio.Queue[bytes | None] = asyncio.Queue()
        self._stream_queues[stream_id] = queue
        self._quic.send_stream_data(stream_id, payload, end_stream=True)
        self.transmit()
        return queue

    def close_subscription(self, queue: asyncio.Queue[bytes | None]) -> None:
        for stream_id, stream_queue in list(self._stream_queues.items()):
            if stream_queue is queue:
                self._stream_queues.pop(stream_id, None)
                break


def _header_value(headers: list[tuple[bytes, bytes]], target: bytes) -> str | None:
    for key, value in headers:
        if key == target:
            return value.decode("utf-8")
    return None


class View(BaseModel):
    format: Literal["email", "notion", "database", "calendar", "graph", "system"]
    content: Dict[str, Any]
    priority: int = 0


class Reference(BaseModel):
    type: str
    target: str
    label: str | None = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class Attachment(BaseModel):
    id: str
    name: str
    mime_type: str
    size_bytes: int
    storage: Dict[str, Any]
    encryption: Dict[str, Any]
    sha256: str | None = None


class Message(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    protocol: str = "afp-v1"
    id: str = ""
    thread_id: str
    parent_id: str | None = None
    from_: str = Field(default="", alias="from")
    to: list[str] = Field(default_factory=list)
    timestamp: str = ""
    type: str
    subtype: str | None = None
    content: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] | None = None
    signature: str = ""
    encryption: Dict[str, Any] | None = None
    views: list[View | Dict[str, Any]] = Field(default_factory=list)
    references: list[Reference | Dict[str, Any]] = Field(default_factory=list)
    attachments: list[Attachment | Dict[str, Any]] = Field(default_factory=list)
    store_in_relational: bool = False


class Action(BaseModel):
    type: Literal["label", "star", "archive", "move", "share", "forward", "reply", "summarise"]
    thread_id: str
    payload: Dict[str, Any] = Field(default_factory=dict)


class Agent:
    def __init__(
        self,
        homeserver_url: str = "https://example.com",
        agent_id: str = "agent:you@example.com",
        signing_key_hex: str | None = None,
        encryption_key_hex: str | None = None,
        encrypt_by_default: bool | None = None,
        recipient_keys: Dict[str, str] | None = None,
        transport_preference: str | None = None,
        discovery_trust_mode: str | None = None,
    ):
        self.url = homeserver_url.rstrip("/")
        self.agent_id = agent_id
        self.client = httpx.AsyncClient()
        self.signing_key = self._load_signing_key(signing_key_hex)
        self.encryption_key = self._load_encryption_key(encryption_key_hex)
        self.encrypt_by_default = self._resolve_encrypt_by_default(encrypt_by_default)
        self.recipient_keys = self._load_recipient_keys(recipient_keys)
        self.transport_preference = self._resolve_transport_preference(transport_preference)
        self.discovery_trust_mode = self._resolve_discovery_trust_mode(
            discovery_trust_mode
        )
        self._capabilities: dict[str, dict] = {}

    # ------------------------------------------------------------------
    # Capability registry
    # ------------------------------------------------------------------

    def capability(
        self,
        name: str,
        description: str,
        input_schema: dict,
        output_schema: dict | None = None,
        version: str = "1.0.0",
        tags: list[str] | None = None,
        approval_mode: str = "autonomous",
    ):
        """Decorator that registers a handler as a named agent capability."""
        def decorator(fn):
            self._capabilities[name] = {
                "descriptor": {
                    "name": name,
                    "description": description,
                    "input_schema": input_schema,
                    "output_schema": output_schema,
                    "version": version,
                    "tags": tags or [],
                    "approval_mode": approval_mode,
                },
                "handler": fn,
            }
            return fn
        return decorator

    async def sync_capabilities(self) -> list[dict]:
        """Push all @capability descriptors to POST /agent/capability."""
        results = []
        for entry in self._capabilities.values():
            resp = await self.client.post(
                f"{self.url}/agent/capability",
                json=entry["descriptor"],
                headers=self._auth_headers(),
            )
            resp.raise_for_status()
            results.append(resp.json())
        return results

    def _auth_headers(self) -> dict:
        token = os.getenv("OMNYID_AUTH_TOKEN", "")
        return {"Authorization": f"Bearer {token}"} if token else {}

    async def serve(self, host: str = "0.0.0.0", port: int = 8765) -> None:
        """
        Start an aiohttp HTTP server that routes incoming capability_invoke
        AFP messages to registered handlers and sends capability_result back.
        """
        try:
            from aiohttp import web
        except ImportError as exc:
            raise RuntimeError(
                "aiohttp is required for Agent.serve(). Install it with: pip install aiohttp"
            ) from exc

        async def _invoke_handler(request: web.Request) -> web.Response:
            body = await request.json()
            capability_name = body.get("capability_name") or body.get("name")
            params = body.get("params") or body.get("input") or {}
            entry = self._capabilities.get(capability_name)
            if entry is None:
                return web.json_response(
                    {"error": f"Unknown capability: {capability_name}"}, status=404
                )
            try:
                result = await entry["handler"](params)
                return web.json_response({"status": "ok", "result": result})
            except Exception as exc:
                return web.json_response(
                    {"status": "error", "error": str(exc)}, status=500
                )

        app = web.Application()
        app.router.add_post("/invoke", _invoke_handler)
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, host, port)
        await site.start()
        await asyncio.Event().wait()

    async def send(self, msg: Message):
        if not msg.id:
            msg.id = str(ULID())
        if not msg.timestamp:
            msg.timestamp = datetime.utcnow().isoformat() + "Z"
        if not msg.from_:
            msg.from_ = self.agent_id

        await self._ensure_recipient_keys(msg)

        if self._should_encrypt(msg):
            plaintext_content = msg.content
            msg.encryption = self._encrypt_content(msg, plaintext_content)
            msg.content = {
                "omnyid_encrypted": True,
                "scheme": "omnyid-envelope-v1",
            }

        if self.signing_key is not None:
            msg.signature = self._sign_message(msg)

        payload = msg.model_dump(by_alias=True)
        for transport in await self._resolve_send_transport_plan():
            try:
                if transport == "webtransport":
                    return await self._send_via_webtransport(payload)
                if transport == "websocket":
                    return await self._send_via_websocket(payload)
                return await self._send_via_http(payload)
            except Exception:
                continue

        raise ValueError("Omnyid transport fallback chain exhausted")

    async def act(self, action: Action):
        msg = Message(
            thread_id=action.thread_id,
            type=f"action_{action.type}",
            content=action.payload,
            views=[
                View(
                    format="system",
                    content=action.model_dump(),
                )
            ],
        )
        return await self.send(msg)

    async def label(self, thread_id: str, labels: list[str]):
        return await self.act(
            Action(type="label", thread_id=thread_id, payload={"labels": labels})
        )

    async def star(self, thread_id: str):
        return await self.act(Action(type="star", thread_id=thread_id))

    async def archive(self, thread_id: str):
        return await self.act(Action(type="archive", thread_id=thread_id))

    async def move(self, thread_id: str, destination: str):
        return await self.act(
            Action(type="move", thread_id=thread_id, payload={"destination": destination})
        )

    async def share(self, thread_id: str, to: list[str]):
        return await self.act(Action(type="share", thread_id=thread_id, payload={"to": to}))

    async def forward(self, thread_id: str, to: list[str], note: str = ""):
        payload: Dict[str, Any] = {"to": to}
        if note:
            payload["note"] = note
        return await self.act(Action(type="forward", thread_id=thread_id, payload=payload))

    async def reply(
        self,
        thread_id: str,
        body: str,
        to: list[str] | None = None,
        subject: str | None = None,
        in_reply_to: str | None = None,
        references: list[str] | None = None,
    ):
        payload: Dict[str, Any] = {"body": body}
        if to:
            payload["to"] = to
        if subject:
            payload["subject"] = subject
        if in_reply_to:
            payload["in_reply_to"] = in_reply_to
        if references:
            payload["references"] = references
        return await self.act(Action(type="reply", thread_id=thread_id, payload=payload))

    async def summarise(self, thread_id: str, style: str = "brief"):
        return await self.act(
            Action(type="summarise", thread_id=thread_id, payload={"style": style})
        )

    async def get_thread(self, thread_id: str):
        resp = await self.client.get(f"{self.url}/thread/{thread_id}")
        resp.raise_for_status()
        messages = resp.json()
        return [self._decrypt_message_content(message) for message in messages]

    async def semantic_search(self, query_text: str, limit: int = 5):
        resp = await self.client.get(
            f"{self.url}/search",
            params={"q": query_text, "limit": limit},
        )
        resp.raise_for_status()
        return resp.json()

    async def get_page(self, thread_id: str):
        return await self.get_thread(thread_id)

    async def discover(self, domain_url: str):
        domain_url = domain_url.rstrip("/")
        card_base_url = await self._resolve_discovery_base_url(domain_url)
        resp = await self.client.get(f"{card_base_url}/.well-known/agent-card")
        resp.raise_for_status()
        return resp.json()

    async def discover_verified(self, domain_url: str):
        card = await self.discover(domain_url)
        if not self.verify_agent_card(card):
            raise ValueError("Invalid or unsigned Omnyid AgentCard")
        if not self._agent_card_matches_requested_domain(card, domain_url):
            if self.discovery_trust_mode != "tofu":
                raise ValueError("Discovered AgentCard does not match requested domain")
            if not self._can_trust_on_first_use(card):
                raise ValueError(
                    "TOFU discovery rejected because the AgentCard key conflicts with cached identity"
                )
        elif not self._can_trust_on_first_use(card):
            raise ValueError("Discovered AgentCard does not match requested domain")
        self.remember_agent_card(card)
        return card

    async def discover_delegation(self, domain_url: str) -> Dict[str, Any] | None:
        domain_url = domain_url.rstrip("/")
        resp = await self.client.get(f"{domain_url}/.well-known/afp-delegation")
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        payload = resp.json()
        return payload if isinstance(payload, dict) else None

    async def get_transport_capabilities(self) -> Dict[str, Any]:
        resp = await self.client.get(f"{self.url}/transport/capabilities")
        resp.raise_for_status()
        payload = resp.json()
        return payload if isinstance(payload, dict) else {}

    async def execute_capability(
        self,
        capability: Dict[str, Any],
        intent: Dict[str, Any],
        url: str,
        method: str = "POST",
        bearer_token: str | None = None,
    ) -> Dict[str, Any]:
        """
        Execute a typed integration action against an external endpoint.

        The homeserver validates approval mode, fires the HTTP call (if autonomous
        or suggest-only preview), stores AFP intent + result messages into the thread,
        and returns the structured result.

        ``capability`` must match the ``IntegrationCapability`` shape::

            {
                "capability_id": "cap_stripe_charge",
                "provider": "stripe",
                "operation": "charge",
                "transport": "rest",       # "rest" | "graphql" | "browser_automation"
                "scopes": ["charges:write"],
                "approval_mode": "autonomous",  # "autonomous" | "suggest_only" | "human_approval_required"
                "secret_refs": [],
                "metadata": {}
            }

        ``intent`` must match the ``ActionIntent`` shape::

            {
                "capability_id": "cap_stripe_charge",
                "thread_id": "thread_...",
                "requested_by": "agent:...",
                "input": { ... },
                "reason": "..."
            }
        """
        resp = await self.client.post(
            f"{self.url}/actions/execute",
            json={
                "capability": capability,
                "intent": intent,
                "url": url,
                "method": method,
                "bearer_token": bearer_token,
            },
        )
        resp.raise_for_status()
        return resp.json()

    async def rotate_key(self, reason: str | None = None) -> Dict[str, Any]:
        """
        Request a server-side Ed25519 key rotation.
        Returns new key material (new_key_id, new_public_key_hex, new_private_key_hex).
        The operator must update OMNYID_SIGNING_KEY_HEX and restart the homeserver.
        """
        resp = await self.client.post(
            f"{self.url}/keys/rotate",
            json={"reason": reason},
        )
        resp.raise_for_status()
        return resp.json()

    async def _upsert_peer_key_server_side(self, card: Dict[str, Any]) -> None:
        """Persist a discovered peer's public key to the server-side cache."""
        agent_id = card.get("agent_id")
        key_id = card.get("key_id")
        public_key_hex = card.get("public_key_hex")
        homeserver_url = card.get("homeserver_url") or card.get("endpoint") or ""
        previous_key_ids = card.get("previous_key_ids") or []
        if not (agent_id and key_id and public_key_hex):
            return
        try:
            await self.client.post(
                f"{self.url}/keys/peer",
                json={
                    "agent_id": agent_id,
                    "key_id": key_id,
                    "public_key_hex": public_key_hex,
                    "homeserver_url": homeserver_url,
                    "previous_key_ids": previous_key_ids,
                },
            )
        except Exception:
            pass  # Best-effort; local in-memory cache is the primary path

    async def send_as_email(self, to: str, subject: str, body: str):
        msg = Message(
            thread_id=f"email_{ULID()}",
            to=[to],
            type="email",
            subtype="outgoing",
            content={"subject": subject, "body": body},
            metadata={"transport": "smtp", "channel": "email"},
            views=[View(format="email", content={"subject": subject, "body": body})],
        )
        return await self.send(msg)

    async def relay_events(self):
        relay_url = self._relay_url()
        async with websockets.connect(relay_url) as websocket:
            async for raw_event in websocket:
                if isinstance(raw_event, bytes):
                    raw_event = raw_event.decode("utf-8")
                try:
                    yield json.loads(raw_event)
                except Exception:
                    yield {"event": "raw", "payload": raw_event}

    async def watch_thread(self, thread_id: str, include_snapshot: bool = True):
        plan = await self._resolve_send_transport_plan()
        for transport in plan:
            if transport == "http":
                continue
            try:
                if transport == "webtransport":
                    async for event in self._watch_thread_via_webtransport(
                        thread_id, include_snapshot
                    ):
                        yield event
                    return
                async for event in self._watch_thread_via_websocket(
                    thread_id, include_snapshot
                ):
                    yield event
                return
            except Exception:
                continue

        raise ValueError("Omnyid realtime transport fallback chain exhausted")

    async def _watch_thread_via_websocket(
        self, thread_id: str, include_snapshot: bool
    ):
        relay_url = self._relay_url()
        async with websockets.connect(relay_url) as websocket:
            await websocket.send(
                json.dumps(
                    {
                        "op": "subscribe_thread",
                        "thread_id": thread_id,
                        "include_snapshot": include_snapshot,
                    }
                )
            )
            async for raw_event in websocket:
                if isinstance(raw_event, bytes):
                    raw_event = raw_event.decode("utf-8")
                try:
                    yield json.loads(raw_event)
                except Exception:
                    yield {"event": "raw", "payload": raw_event}

    async def _send_via_websocket(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        relay_url = self._relay_url()
        async with websockets.connect(relay_url) as websocket:
            await websocket.send(json.dumps({"op": "send", "message": payload}))
            async for raw_event in websocket:
                if isinstance(raw_event, bytes):
                    raw_event = raw_event.decode("utf-8")
                event = json.loads(raw_event)
                if event.get("event") == "ack":
                    return {
                        "success": bool(event.get("success")),
                        "message_id": event.get("message_id", payload.get("id", "")),
                    }
                if event.get("event") == "error":
                    raise ValueError(event.get("message", "WebSocket send failed"))

        raise ValueError("WebSocket relay closed before ack")

    async def _send_via_http(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        resp = await self.client.post(f"{self.url}/send", json=payload)
        resp.raise_for_status()
        result = resp.json()
        return result if isinstance(result, dict) else {}

    async def _send_via_webtransport(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        webtransport_url = self._webtransport_url()
        parsed = urlparse(webtransport_url)
        host = parsed.hostname
        if host is None:
            raise ValueError("WebTransport URL is missing a hostname")

        port = parsed.port or 443
        configuration = self._webtransport_configuration(host)
        async with quic_connect(
            host,
            port,
            configuration=configuration,
            create_protocol=_OmnyidWebTransportClient,
        ) as protocol:
            protocol = protocol
            assert isinstance(protocol, _OmnyidWebTransportClient)
            session_id = await protocol.establish_session(webtransport_url)
            raw = await protocol.send_request(
                session_id,
                json.dumps({"op": "send", "message": payload}).encode("utf-8"),
            )

        event = self._parse_webtransport_response(raw)
        if event.get("event") == "ack":
            return {
                "success": bool(event.get("success")),
                "message_id": event.get("message_id", payload.get("id", "")),
            }
        if event.get("event") == "error":
            raise ValueError(str(event.get("message", "WebTransport send failed")))
        raise ValueError("WebTransport relay returned an unsupported response")

    async def _resolve_send_transport_plan(self) -> list[str]:
        if self.transport_preference == "webtransport":
            return ["webtransport", "websocket", "http"]
        if self.transport_preference == "websocket":
            return ["websocket", "http"]
        if self.transport_preference == "http":
            return ["http"]

        capabilities = await self._safe_transport_capabilities()
        public_transport = capabilities.get("public_transport", {})
        if isinstance(public_transport, dict) and public_transport.get("primary") == "webtransport":
            return ["webtransport", "websocket", "http"]
        return ["websocket", "http"]

    async def _safe_transport_capabilities(self) -> Dict[str, Any]:
        try:
            return await self.get_transport_capabilities()
        except Exception:
            return {}

    async def _watch_thread_via_webtransport(
        self, thread_id: str, include_snapshot: bool
    ):
        webtransport_url = self._webtransport_url()
        parsed = urlparse(webtransport_url)
        host = parsed.hostname
        if host is None:
            raise ValueError("WebTransport URL is missing a hostname")

        port = parsed.port or 443
        configuration = self._webtransport_configuration(host)
        async with quic_connect(
            host,
            port,
            configuration=configuration,
            create_protocol=_OmnyidWebTransportClient,
        ) as protocol:
            assert isinstance(protocol, _OmnyidWebTransportClient)
            session_id = await protocol.establish_session(webtransport_url)
            queue = await protocol.open_subscription(
                session_id,
                json.dumps(
                    {
                        "op": "subscribe_thread",
                        "thread_id": thread_id,
                        "include_snapshot": include_snapshot,
                    }
                ).encode("utf-8"),
            )
            pending = ""
            try:
                while True:
                    chunk = await queue.get()
                    if chunk is None:
                        break
                    pending += chunk.decode("utf-8")
                    lines = pending.split("\n")
                    pending = lines.pop() if lines else ""
                    for line in lines:
                        stripped = line.strip()
                        if not stripped:
                            continue
                        try:
                            yield json.loads(stripped)
                        except Exception:
                            yield {"event": "raw", "payload": stripped}

                trailing = pending.strip()
                if trailing:
                    try:
                        yield json.loads(trailing)
                    except Exception:
                        yield {"event": "raw", "payload": trailing}
            finally:
                protocol.close_subscription(queue)

    async def _resolve_discovery_base_url(self, domain_url: str) -> str:
        delegation = await self.discover_delegation(domain_url)
        if not delegation:
            return domain_url

        server = delegation.get("afp.server")
        if not isinstance(server, str):
            return domain_url

        server = server.strip()
        if not server:
            return domain_url

        if server.startswith("http://") or server.startswith("https://"):
            candidate = server.rstrip("/")
        else:
            candidate = f"https://{server}".rstrip("/")

        if self._is_allowed_delegation_target(domain_url, candidate):
            return candidate
        return domain_url

    async def aclose(self):
        await self.client.aclose()

    def _load_signing_key(self, signing_key_hex: str | None) -> SigningKey | None:
        key_text = signing_key_hex or os.getenv("OMNYID_SIGNING_KEY_HEX", "").strip()
        if not key_text:
            return None
        return SigningKey(bytes.fromhex(key_text))

    def _load_encryption_key(self, encryption_key_hex: str | None) -> bytes | None:
        key_text = encryption_key_hex or os.getenv("OMNYID_ENCRYPTION_KEY_HEX", "").strip()
        if not key_text:
            return None

        key_bytes = bytes.fromhex(key_text)
        if len(key_bytes) != 32:
            raise ValueError("OMNYID encryption key must be exactly 32 bytes in hex form")
        return key_bytes

    def _resolve_encrypt_by_default(self, encrypt_by_default: bool | None) -> bool:
        if encrypt_by_default is not None:
            return encrypt_by_default

        value = os.getenv("OMNYID_ENCRYPT_BY_DEFAULT", "").strip().lower()
        if value in {"1", "true", "yes"}:
            return True
        if value in {"0", "false", "no"}:
            return False
        return self.encryption_key is not None or self.signing_key is not None

    def _resolve_transport_preference(self, transport_preference: str | None) -> str:
        value = (transport_preference or os.getenv("OMNYID_TRANSPORT", "auto")).strip().lower()
        if value in {"auto", ""}:
            return "auto"
        if value in {"wt", "webtransport"}:
            return "webtransport"
        if value in {"ws", "websocket"}:
            return "websocket"
        return "http"

    def _resolve_discovery_trust_mode(self, discovery_trust_mode: str | None) -> str:
        value = (
            discovery_trust_mode
            or os.getenv("OMNYID_DISCOVERY_TRUST_MODE", "strict")
        ).strip().lower()
        if value == "tofu":
            return "tofu"
        return "strict"

    def _load_recipient_keys(
        self, recipient_keys: Dict[str, str] | None
    ) -> Dict[str, str]:
        if recipient_keys is not None:
            return dict(recipient_keys)

        raw = os.getenv("OMNYID_RECIPIENT_KEYS_JSON", "").strip()
        if not raw:
            return {}
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            raise ValueError("OMNYID_RECIPIENT_KEYS_JSON must decode to a JSON object")
        return {str(key): str(value) for key, value in parsed.items()}

    def _sign_message(self, msg: Message) -> str:
        assert self.signing_key is not None
        signable = self._signable_payload(msg)
        signature = self.signing_key.sign(signable.encode("utf-8")).signature
        public_key_hex = self.signing_key.verify_key.encode(encoder=HexEncoder).decode("ascii")
        signature_b64 = base64.b64encode(signature).decode("ascii")
        return f"ed25519:{public_key_hex}:{signature_b64}"

    def _signable_payload(self, msg: Message) -> str:
        parts = [
            msg.protocol,
            msg.id,
            msg.thread_id,
            msg.parent_id or "",
            msg.from_,
            self._canonical_json(msg.to),
            msg.timestamp,
            msg.type,
            msg.subtype or "",
            self._canonical_json(msg.content),
            self._canonical_json(msg.metadata or {}),
            self._canonical_json(msg.encryption or {}),
            self._canonical_json([self._normalize_view(view) for view in msg.views]),
            self._canonical_json([self._normalize_reference(reference) for reference in msg.references]),
            self._canonical_json([self._normalize_attachment(attachment) for attachment in msg.attachments]),
            str(msg.store_in_relational).lower(),
        ]
        return "\n".join(parts)

    def _should_encrypt(self, msg: Message) -> bool:
        if not self.encrypt_by_default:
            return False

        if msg.encryption:
            return False

        if msg.content.get("omnyid_encrypted") is True:
            return False

        return self.encryption_key is not None or self.signing_key is not None

    def _encrypt_content(self, msg: Message, content: Dict[str, Any]) -> Dict[str, Any]:
        recipient_envelope = self._encrypt_content_for_recipients(msg, content)
        if recipient_envelope is not None:
            return recipient_envelope

        if self.encryption_key is None:
            raise ValueError(
                "Omnyid encryption requires either OMNYID_ENCRYPTION_KEY_HEX or known recipient keys"
            )

        nonce = random_bytes(24)
        aad = self._encryption_aad(msg).encode("utf-8")
        plaintext = self._canonical_json(content).encode("utf-8")
        ciphertext = crypto_aead_xchacha20poly1305_ietf_encrypt(
            plaintext,
            aad,
            nonce,
            self.encryption_key,
        )
        return {
            "scheme": "omnyid-envelope-v1",
            "algorithm": "xchacha20poly1305-ietf",
            "nonce": base64.b64encode(nonce).decode("ascii"),
            "ciphertext": base64.b64encode(ciphertext).decode("ascii"),
            "mode": "shared-key",
        }

    def _decrypt_message_content(self, message: Dict[str, Any]) -> Dict[str, Any]:
        envelope = message.get("encryption")
        if not isinstance(envelope, dict):
            return message

        if envelope.get("scheme") != "omnyid-envelope-v1":
            return message

        if envelope.get("algorithm") != "xchacha20poly1305-ietf":
            return message

        wrapped_key = self._unwrap_content_key(message, envelope)
        if wrapped_key is not None:
            key_to_use = wrapped_key
        elif self.encryption_key is not None:
            key_to_use = self.encryption_key
        else:
            return message

        nonce_b64 = envelope.get("nonce")
        ciphertext_b64 = envelope.get("ciphertext")
        if not isinstance(nonce_b64, str) or not isinstance(ciphertext_b64, str):
            return message

        try:
            nonce = base64.b64decode(nonce_b64)
            ciphertext = base64.b64decode(ciphertext_b64)
            plaintext = crypto_aead_xchacha20poly1305_ietf_decrypt(
                ciphertext,
                self._encryption_aad_from_dict(message).encode("utf-8"),
                nonce,
                key_to_use,
            )
            decrypted = json.loads(plaintext.decode("utf-8"))
        except Exception:
            return message

        updated = dict(message)
        updated["content"] = decrypted
        updated["content_encrypted"] = True
        return updated

    def remember_agent_card(self, card: Dict[str, Any]):
        agent_id = card.get("agent_id")
        public_key_hex = card.get("public_key_hex")
        key_id = card.get("key_id")
        if (
            isinstance(agent_id, str)
            and isinstance(public_key_hex, str)
            and isinstance(key_id, str)
            and key_id.strip()
            and self._parse_agent_id(agent_id) is not None
        ):
            self.recipient_keys[agent_id] = public_key_hex

    async def _ensure_recipient_keys(self, msg: Message):
        for agent_id in self._recipient_agent_ids(msg):
            if agent_id == self.agent_id:
                continue
            if agent_id in self.recipient_keys:
                continue

            domain_url = self._agent_domain_url(agent_id)
            if domain_url is None:
                continue

            try:
                card = await self.discover_verified(domain_url)
                await self._upsert_peer_key_server_side(card)
            except Exception:
                continue

    def _encryption_aad(self, msg: Message) -> str:
        return self._canonical_json(
            {
                "protocol": msg.protocol,
                "id": msg.id,
                "thread_id": msg.thread_id,
                "parent_id": msg.parent_id or "",
                "from": msg.from_,
                "to": msg.to,
                "timestamp": msg.timestamp,
                "type": msg.type,
                "subtype": msg.subtype or "",
                "metadata": msg.metadata or {},
            }
        )

    def _encryption_aad_from_dict(self, message: Dict[str, Any]) -> str:
        return self._canonical_json(
            {
                "protocol": message.get("protocol", "afp-v1"),
                "id": message.get("id", ""),
                "thread_id": message.get("thread_id", ""),
                "parent_id": message.get("parent_id") or "",
                "from": message.get("from", ""),
                "to": message.get("to", []),
                "timestamp": message.get("timestamp", ""),
                "type": message.get("type", ""),
                "subtype": message.get("subtype", "") or "",
                "metadata": message.get("metadata", {}) or {},
            }
        )

    def _canonical_json(self, value: Any) -> str:
        return json.dumps(value, sort_keys=True, separators=(",", ":"))

    def _normalize_view(self, view: View | Dict[str, Any]) -> Dict[str, Any]:
        if isinstance(view, View):
            return view.model_dump()
        return view

    def _normalize_reference(self, reference: Reference | Dict[str, Any]) -> Dict[str, Any]:
        if isinstance(reference, Reference):
            return reference.model_dump()
        return reference

    def _normalize_attachment(self, attachment: Attachment | Dict[str, Any]) -> Dict[str, Any]:
        if isinstance(attachment, Attachment):
            return attachment.model_dump()
        return attachment

    def _encrypt_content_for_recipients(
        self, msg: Message, content: Dict[str, Any]
    ) -> Dict[str, Any] | None:
        if self.signing_key is None:
            return None

        recipients = self._recipient_agent_ids(msg)
        recipient_entries: list[Dict[str, str]] = []
        content_key = random_bytes(32)

        for agent_id in recipients:
            public_key_hex = self._recipient_public_key_hex(agent_id)
            if public_key_hex is None:
                return None

            try:
                wrapped_key = crypto_box_seal(
                    content_key,
                    crypto_sign_ed25519_pk_to_curve25519(bytes.fromhex(public_key_hex)),
                )
            except Exception:
                return None

            recipient_entries.append(
                {
                    "agent_id": agent_id,
                    "public_key_hex": public_key_hex,
                    "wrapped_content_key": base64.b64encode(wrapped_key).decode("ascii"),
                }
            )

        nonce = random_bytes(24)
        aad = self._encryption_aad(msg).encode("utf-8")
        plaintext = self._canonical_json(content).encode("utf-8")
        ciphertext = crypto_aead_xchacha20poly1305_ietf_encrypt(
            plaintext,
            aad,
            nonce,
            content_key,
        )
        return {
            "scheme": "omnyid-envelope-v1",
            "algorithm": "xchacha20poly1305-ietf",
            "mode": "recipient-wrapped",
            "key_wrapping": "curve25519-sealedbox-v1",
            "nonce": base64.b64encode(nonce).decode("ascii"),
            "ciphertext": base64.b64encode(ciphertext).decode("ascii"),
            "recipients": recipient_entries,
        }

    def _unwrap_content_key(
        self, message: Dict[str, Any], envelope: Dict[str, Any]
    ) -> bytes | None:
        recipients = envelope.get("recipients")
        if not isinstance(recipients, list) or self.signing_key is None:
            return None

        own_public_key_hex = (
            self.signing_key.verify_key.encode(encoder=HexEncoder).decode("ascii")
        )
        for recipient in recipients:
            if not isinstance(recipient, dict):
                continue

            recipient_agent_id = recipient.get("agent_id")
            recipient_public_key_hex = recipient.get("public_key_hex")
            wrapped_key_b64 = recipient.get("wrapped_content_key")
            if (
                not isinstance(recipient_public_key_hex, str)
                or not isinstance(wrapped_key_b64, str)
            ):
                continue

            if recipient_public_key_hex != own_public_key_hex and recipient_agent_id != self.agent_id:
                continue

            try:
                ed25519_secret_key = (
                    self.signing_key.encode() + self.signing_key.verify_key.encode()
                )
                curve_private_key = crypto_sign_ed25519_sk_to_curve25519(
                    ed25519_secret_key
                )
                curve_public_key = crypto_sign_ed25519_pk_to_curve25519(
                    self.signing_key.verify_key.encode()
                )
                return crypto_box_seal_open(
                    base64.b64decode(wrapped_key_b64),
                    curve_public_key,
                    curve_private_key,
                )
            except Exception:
                return None

        return None

    def _recipient_agent_ids(self, msg: Message) -> list[str]:
        seen: set[str] = set()
        ordered: list[str] = []
        for agent_id in [msg.from_, *msg.to]:
            if (
                agent_id
                and agent_id not in seen
                and self._parse_agent_id(agent_id) is not None
            ):
                seen.add(agent_id)
                ordered.append(agent_id)
        return ordered

    def _recipient_public_key_hex(self, agent_id: str) -> str | None:
        if self.signing_key is not None and agent_id == self.agent_id:
            return self.signing_key.verify_key.encode(encoder=HexEncoder).decode("ascii")
        return self.recipient_keys.get(agent_id)

    def _agent_domain_url(self, agent_id: str) -> str | None:
        parsed = self._parse_agent_id(agent_id)
        if parsed is None:
            return None

        domain = parsed["domain"]
        if not domain:
            return None

        if domain.startswith("localhost") or domain.startswith("127.0.0.1"):
            return f"http://{domain}"
        return f"https://{domain}"

    def _agent_card_matches_requested_domain(
        self, card: Dict[str, Any], domain_url: str
    ) -> bool:
        parsed_agent = self._parse_agent_id(str(card.get("agent_id", "")))
        requested_host = self._normalized_host(domain_url)
        if parsed_agent is None or requested_host is None:
            return False
        return parsed_agent["domain"] == requested_host

    def _can_trust_on_first_use(self, card: Dict[str, Any]) -> bool:
        agent_id = card.get("agent_id")
        public_key_hex = card.get("public_key_hex")
        if not isinstance(agent_id, str) or not isinstance(public_key_hex, str):
            return False

        cached = self.recipient_keys.get(agent_id)
        if cached is None:
            return True
        return cached == public_key_hex

    def _is_allowed_delegation_target(self, requested_domain_url: str, candidate_url: str) -> bool:
        requested_host = self._normalized_host(requested_domain_url)
        candidate = urlparse(candidate_url)
        candidate_host = candidate.hostname
        if not requested_host or not candidate_host:
            return False
        if requested_host in {"localhost", "127.0.0.1"}:
            return candidate.scheme in {"http", "https"}
        return candidate.scheme == "https"

    def _normalized_host(self, url_or_host: str) -> str | None:
        parsed = urlparse(url_or_host)
        if parsed.hostname:
            return parsed.hostname.strip().lower()
        trimmed = url_or_host.strip().lower().rstrip("/")
        if "://" in trimmed or not trimmed:
            return None
        return trimmed

    def _parse_agent_id(self, agent_id: str) -> Dict[str, str] | None:
        trimmed = agent_id.strip()
        if not trimmed.startswith("agent:"):
            return None

        remainder = trimmed[len("agent:") :]
        if "@" not in remainder:
            return None

        localpart, domain = remainder.split("@", 1)
        if not localpart or not domain:
            return None

        allowed_local_chars = set(
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-+"
        )
        if any(ch not in allowed_local_chars for ch in localpart):
            return None

        if domain.startswith(".") or domain.endswith("."):
            return None

        labels = domain.split(".")
        if any(not label for label in labels):
            return None

        for label in labels:
            if label.startswith("-") or label.endswith("-"):
                return None
            if any(not (ch.isascii() and (ch.isalnum() or ch == "-")) for ch in label):
                return None

        return {"full": trimmed, "localpart": localpart, "domain": domain}

    def _relay_url(self) -> str:
        if self.url.startswith("https://"):
            return self.url.replace("https://", "wss://", 1) + "/relay/ws"
        if self.url.startswith("http://"):
            return self.url.replace("http://", "ws://", 1) + "/relay/ws"
        return self.url + "/relay/ws"

    def _webtransport_url(self) -> str:
        env_url = os.getenv("OMNYID_WEBTRANSPORT_URL", "").strip()
        if env_url:
            return env_url.rstrip("/")

        parsed = urlparse(self.url)
        if parsed.scheme not in {"http", "https"}:
            return self.url + "/relay/wt"

        host = parsed.hostname or ""
        port = parsed.port
        if host in {"localhost", "127.0.0.1"}:
            scheme = "https"
            netloc = f"{host}:8443"
        else:
            netloc = parsed.netloc
            scheme = "https" if parsed.scheme == "https" else "http"
            if port is None and scheme == "https":
                netloc = host
        path = "/relay/wt"
        return parsed._replace(scheme=scheme, netloc=netloc, path=path, params="", query="", fragment="").geturl()

    def _webtransport_configuration(self, host: str) -> QuicConfiguration:
        configuration = QuicConfiguration(
            is_client=True,
            alpn_protocols=H3_ALPN,
            server_name=host,
        )

        ca_certs = os.getenv("OMNYID_WEBTRANSPORT_CA_CERTS", "").strip()
        if ca_certs:
            configuration.load_verify_locations(ca_certs)

        insecure = os.getenv("OMNYID_WEBTRANSPORT_INSECURE", "").strip().lower()
        if insecure in {"1", "true", "yes"}:
            configuration.verify_mode = ssl.CERT_NONE

        return configuration

    def _parse_webtransport_response(self, raw: bytes) -> Dict[str, Any]:
        text = raw.decode("utf-8").strip()
        if not text:
            raise ValueError("WebTransport relay returned an empty response")

        lines = [line.strip() for line in text.splitlines() if line.strip()]
        if not lines:
            raise ValueError("WebTransport relay returned an empty response")

        payload = json.loads(lines[-1])
        if not isinstance(payload, dict):
            raise ValueError("WebTransport relay returned a non-object response")
        return payload

    def verify_agent_card(self, card: Dict[str, Any]) -> bool:
        if self._parse_agent_id(str(card.get("agent_id", ""))) is None:
            return False

        key_id = card.get("key_id")
        previous_key_ids = card.get("previous_key_ids", [])
        if not isinstance(key_id, str) or not key_id.strip():
            return False
        if not isinstance(previous_key_ids, list) or any(
            not isinstance(value, str) for value in previous_key_ids
        ):
            return False

        signature = card.get("signature")
        public_key_hex = card.get("public_key_hex")
        if not isinstance(signature, str) or not isinstance(public_key_hex, str):
            return False

        parts = signature.split(":", 2)
        if len(parts) != 3 or parts[0] != "ed25519":
            return False

        _, signature_public_key_hex, signature_b64 = parts
        if signature_public_key_hex != public_key_hex:
            return False

        try:
            verify_key = VerifyKey(bytes.fromhex(public_key_hex))
            verify_key.verify(
                self._agent_card_signable_payload(card).encode("utf-8"),
                base64.b64decode(signature_b64),
            )
        except Exception:
            return False

        return True

    def _agent_card_signable_payload(self, card: Dict[str, Any]) -> str:
        parts = [
            str(card.get("protocol", "afp-v1")),
            str(card.get("agent_id", "")),
            str(card.get("key_id", "")),
            self._canonical_json(card.get("previous_key_ids", [])),
            str(card.get("public_key_hex", "")),
            str(card.get("homeserver_url", "")),
            self._canonical_json(card.get("capabilities", [])),
            str(card.get("timestamp", "")),
        ]
        return "\n".join(parts)
