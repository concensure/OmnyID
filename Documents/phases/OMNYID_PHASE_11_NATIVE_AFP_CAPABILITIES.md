# Omnyid Phase 11 — Native AFP Capabilities

## Status: in progress

## Purpose

Introduce a set of first-party native AFP capabilities that any agent (including the Master Agent) can invoke via the Python SDK. These capabilities produce valid AFP messages as output, store generated media in the user's private MinIO bucket, and render results through A2UI view components. No user-supplied LLM API key is required for any of these capabilities.

---

## What Was Landed

### Storage Layer — `afp.storage`

**Files:**
- `python-sdk/afp/storage/__init__.py`
- `python-sdk/afp/storage/minio_client.py`

MinIO object storage abstraction shared by all media-producing capabilities.

- `upload_image(user_id, image_bytes, content_type, extension)` — stores images under `{user_id}/images/`.
- `upload_file(user_id, file_bytes, content_type, extension, subfolder, prefix)` — generic upload with configurable path layout.
- All credentials (`MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`) are read from environment only and never pass through AFP messages or agent parameters.
- Returns the full public MinIO URL used in AFP `views[].props.image_url`.

---

### Native Capability 1 — Image Generator (`image_generate`)

**Files:**
- `python-sdk/afp/executors/image_generate.py`
- Registered in `python-sdk/afp/executors/__init__.py` via `build_default_registry()`

**Type:** `BaseExecutor` (MasterAgent ReAct loop integration)

**Backends** (selected via `IMAGE_GEN_BACKEND` env var):

| Backend | Env var | Notes |
|---------|---------|-------|
| `grok`  | `XAI_API_KEY` | xAI Grok Imagine (`grok-2-image-1212`) — default |
| `flux`  | `FLUX_API_KEY` | Black Forest Labs Flux Pro 1.1 (async submit/poll) |
| `sd3`   | `SD3_ENDPOINT` | Local Stable Diffusion 3 — free, no API cost |

**Cost per generation (cents):**

| Backend | Standard | High |
|---------|----------|------|
| Grok    | 2.5¢     | 5.0¢ |
| Flux    | 2.0¢     | 4.0¢ |
| SD3     | 0¢       | 0¢   |

**AFP output type:** `image_generate`
**AFP view:** `media_card`

**Supported params:** `prompt` (required), `style` (11 options), `aspect_ratio` (7 ratios), `quality` (standard/high), `caption`, `alt_text`

**Prompt safety:** blocked-term check runs before any backend call. Optimised prompts are enriched with style-appropriate quality descriptors before submission.

---

### Native Capability 2 — Calendar Event (`calendar_event`)

**Files:**
- `python-sdk/afp/capabilities/calendar_event.py`
- `python-sdk/afp/integrations/google_calendar.py`
- `python-sdk/afp/integrations/outlook_calendar.py`
- `python-sdk/afp/capabilities/__init__.py`

**Type:** `@agent.capability` (approval-gated)
**Approval mode:** `human_approval_required`

**Operations:** `create`, `update`

**Provider routing** (`OMNYID_CALENDAR_PROVIDER` env var):

| Provider | Env vars required | API used |
|----------|-------------------|----------|
| `google` (default) | `OMNYID_GOOGLE_CLIENT_ID`, `OMNYID_GCAL_CLIENT_SECRET`, `OMNYID_GCAL_REFRESH_TOKEN` | Google Calendar v3 |
| `outlook` | `OMNYID_MICROSOFT_CLIENT_ID`, `OMNYID_OUTLOOK_CLIENT_SECRET`, `OMNYID_OUTLOOK_REFRESH_TOKEN` | Microsoft Graph |

**Approval gate — two-phase flow:**

1. **Phase 1** (normal invocation): validates params → returns AFP `subtype: "preview"` with a `decision_point` view showing the event summary and Approve / Cancel options.
2. **Phase 2** (`_approved: true` injected by homeserver): executes the calendar write → returns AFP `subtype: "create"` or `"update"` with a `confirmation` A2UI view.

Write operations are structurally blocked until approval — the gate is not a runtime flag check but a missing phase-2 call.

**AFP output type:** `calendar_event`
**AFP subtypes:** `preview`, `create`, `update`, `error`
**AFP views:** `decision_point` (phase 1), `confirmation` (phase 2), `error_callout`

**Registration:**
```python
from afp.capabilities.calendar_event import register_calendar_capability
register_calendar_capability(agent)
await agent.sync_capabilities()
```

---

### Native Capability 3 — QR Code Generator (`qr_generate`)

**Files:**
- `python-sdk/afp/capabilities/qr_generate.py`

**Type:** `@agent.capability` (autonomous — no approval required)
**Dependency:** `qrcode[pil]>=7.0` (local, no external API)

**Supported data types:**

| `type`    | Required param | Encoding standard |
|-----------|---------------|-------------------|
| `url`     | `url`         | Raw URL string |
| `text`    | `text`        | Raw text |
| `wifi`    | `ssid`        | `WIFI:T:WPA;S:...;P:...;;` |
| `contact` | `name`        | MeCard format |
| `payment` | `address`     | BIP-21 for BTC, raw string for others |

**Generation:** runs entirely in-process using `qrcode` — PNG rendered to `io.BytesIO`, no temp files. QR config via optional env vars: `QR_BOX_SIZE` (default 10), `QR_BORDER` (default 4), `QR_ERROR_CORRECTION` (default M).

**Storage:** uploads PNG to MinIO via `afp.storage.minio_client.upload_image`.

**AFP output type:** `qr_generate`
**AFP view:** `media_card`

**Registration:**
```python
from afp.capabilities.qr_generate import register_qr_capability
register_qr_capability(agent)
await agent.sync_capabilities()
```

---

### Storage `__init__.py` export update

`afp.storage` now exports both `upload_image` and `upload_file` for use by any future media-producing capability.

---

## Env vars introduced in this phase

All new vars are documented in `.env.example`. None should be committed with real values.

```
# Image generation
IMAGE_GEN_BACKEND=grok
XAI_API_KEY=
FLUX_API_KEY=
FLUX_API_URL=               # optional override
SD3_ENDPOINT=               # local SD3 only

# MinIO
MINIO_ENDPOINT=minio.omnyid.cloud:9000
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=
MINIO_SECURE=true
MINIO_PUBLIC_URL=https://minio.omnyid.cloud
MINIO_BUCKET=omnyid-user-media

# QR code (optional tuning)
QR_BOX_SIZE=10
QR_BORDER=4
QR_ERROR_CORRECTION=M

# Calendar
OMNYID_CALENDAR_PROVIDER=google
OMNYID_GCAL_CLIENT_SECRET=
OMNYID_GCAL_REFRESH_TOKEN=
OMNYID_GCAL_CALENDAR_ID=primary
OMNYID_OUTLOOK_TENANT_ID=
OMNYID_OUTLOOK_CLIENT_SECRET=
OMNYID_OUTLOOK_REFRESH_TOKEN=
```

---

## New Python dependencies

Add to `requirements.txt`:

```
minio>=7.2.0          # MinIO object storage client
qrcode[pil]>=7.0      # QR code generation (image_generate uses httpx only)
httpx>=0.27.0         # already present; used by calendar integrations
```

---

## New directory structure

```
python-sdk/afp/
├── storage/
│   ├── __init__.py              # exports upload_image, upload_file
│   └── minio_client.py          # MinIO client (upload_image, upload_file)
├── integrations/
│   ├── __init__.py
│   ├── google_calendar.py       # Google Calendar v3 (OAuth refresh token)
│   └── outlook_calendar.py      # Microsoft Graph Calendar (OAuth refresh token)
├── capabilities/
│   ├── __init__.py
│   ├── calendar_event.py        # @agent.capability("calendar_event")
│   └── qr_generate.py           # @agent.capability("qr_generate")
└── executors/
    └── image_generate.py        # BaseExecutor for MasterAgent ReAct loop
```

---

## Still Remaining in Phase 11

- Wire `register_calendar_capability` and `register_qr_capability` into the main agent startup entrypoint.
- Add Outlook Calendar setup notes to `Documents/deployment/`.
- Add homeserver-side `_approved` injection for the calendar approval flow.
- Consider adding `list` and `delete` operations to `calendar_event` once the approval flow is proven.
- Consider adding SVG output option to `qr_generate` for web embed use cases.
- Add cost entries for `image_generate` to the cost dashboard Rust side (`src/cost_oracle.rs`).
