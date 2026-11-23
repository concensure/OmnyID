# OmnyID AFP Service Adapter Starter

This starter is for organizations that want to expose existing data sources to OmnyID agents without rewriting their core systems.

What this bundle includes:

- a lightweight FastAPI adapter
- a published `/.well-known/agent-card` route
- sample capability endpoints for `timetable` and `deadlines`
- a signed-request verification seam
- a signed AFP reply seam

What this is intended for:

- universities exposing timetable or deadline data
- small businesses exposing CRM, booking, or scheduling data
- internal service teams that want an OmnyID-facing wrapper around an existing API

Important notes:

- this is an adapter layer, not a replacement for your system of record
- per-user authorization still needs to be enforced against your existing identity system
- the adapter should sign replies with its own service Agent ID key
- start with HTTPS first; add WebTransport later only if you need realtime push

Suggested next steps:

1. Set the service Agent ID and key material in `.env.example`
2. Implement the data fetch functions in `app.py`
3. Map capability auth to your existing student/customer identity
4. Deploy behind HTTPS and publish the service AgentCard
