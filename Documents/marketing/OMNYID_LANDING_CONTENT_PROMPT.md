# OmnyID Landing Page — Content Prompt

## Purpose of This Document

This document defines every word, headline, body paragraph, label, CTA, and piece of microcopy that should appear on the OmnyID landing page. It is structured section by section, matching the layout defined in the Design Prompt. The content is crafted to:

1. Speak directly to the pain of two distinct audiences: **everyday people overwhelmed by the digital world**, and **developers and AI power users** who live inside agent frameworks day-to-day
2. Position OmnyID as the **first infrastructure layer** built from the ground up for the agentic era — not another AI feature bolted onto old architecture
3. Build enough trust to convert visitors to the waitlist
4. Be optimized for SEO without sacrificing the calm, elegant tone

---

## Brand Voice

- **Tone**: Calm. Precise. Inevitable. Not hypey. Not startup-bro. Not scifi.
- **Energy**: The confidence of someone who has already built the foundation and doesn't need to shout about it
- **Stance**: Open source, community-owned, privacy-as-default — these are not selling points; they are simply how the project is built
- **Avoid**: Superlatives without substance ("revolutionary", "game-changing"), passive voice, jargon without context, excessive exclamation marks
- **Use**: Short declarative sentences. Meaningful contrast. Concrete specifics.

---

## Page Meta

### Browser Title
```
OmnyID — Your Agent Identity. Your Rules.
```

### Meta Description (≤160 characters)
```
OmnyID gives every AI agent a cryptographic identity, a real email address, and a private workspace. Open source. Local-first. Built for the agentic era.
```

### Open Graph Title
```
OmnyID — The Gateway to the Agentic Era
```

### Open Graph Description
```
The first privacy-first, local-first, open-source Agent ID platform. Give your agents an identity that works — without giving up your data.
```

---

## Navigation Labels

| Link | Label |
|---|---|
| Features section | Why OmnyID |
| How it works | How It Works |
| Roadmap section | Roadmap |
| GitHub repository | GitHub ↗ |
| CTA button | Join the Waitlist |

---

## Section 1: Hero

### Pill Badge (above headline)
```
Open Source  ·  Privacy-First  ·  Built for the Agentic Era
```

### Hero Headline
```
Your agents need
an identity they own.
```

**Alternative A** (punchier):
```
The internet wasn't built
for agents.
OmnyID is.
```

**Alternative B** (more human):
```
Every agent you run
deserves a home.
```

*Recommendation: Use Alternative A for its contrast and clarity.*

### Hero Subline
```
OmnyID is the first open-source, privacy-first platform that gives every AI agent a permanent, cryptographic identity — complete with a real email address, encrypted storage, and a personal workspace. All under your control.
```

### Primary CTA Button
```
Join the Waitlist
```

### Secondary CTA Button
```
View on GitHub ↗
```

### Trust Line (below CTAs)
```
Open source. Self-hostable. Your data, always yours.
```

---

## Section 2: The Problem

### Section Label
```
THE PROBLEM
```

### Pullquote Statement
```
AI is getting powerful.
But your agents have nowhere to live.
```

### Supporting Context Paragraph
```
Every day, millions of AI agents are spun up, run a task, and disappear — leaving no record, no identity, no continuity. They can't receive replies. They can't act on real email. They don't know who you are. And every workspace tool claiming to be "AI-powered" is just a database with a chat box stapled to the side.

The agentic era needs new infrastructure. It needs it to be private by default. It needs it to be yours.
```

### Pain Point 1: Privacy
**Icon**: a lock with a slash, or an eye with a line through it

**Label**: Your email is being read — right now.

**Body**: Google, Microsoft, and every "AI workspace" you use has full access to your messages, your notes, your documents. Their AI gets smarter. You get a product update.

---

### Pain Point 2: Agents Without Identity
**Icon**: a disconnected plug, or a question mark inside a node

**Label**: Your agents have no persistent identity.

**Body**: Tools like ChatGPT, Claude, AutoGen, and OpenClaw are powerful — but they can't receive replies, can't hold a mailbox, and can't act on the internet without borrowing your credentials. They exist in isolation.

---

### Pain Point 3: Non-Native AI Architecture
**Icon**: a cracked foundation or mismatched puzzle piece

**Label**: "AI-native" products aren't actually native.

**Body**: Notion AI, Microsoft Copilot, and every "workspace with AI" share the same problem: they're traditional apps with AI features added later. Your data still lives in someone else's server. The architecture wasn't built for agents — it was adapted for them.

---

## Section 3: What Is OmnyID

### Section Label
```
WHAT IS OMNYID
```

### Section Headline
```
A permanent home for every agent you run.
```

### Body (left column, ~4 paragraphs)

**Paragraph 1:**
```
OmnyID is the first open-source, privacy-first Agent Framework built from the ground up for the way AI actually works — not the way legacy software hoped it would.
```

**Paragraph 2:**
```
At its core, OmnyID gives every agent — and every person — a permanent, cryptographic Agent ID. Think of it as a home address for your digital life: permanent, verifiable, and under your control. Agents can send and receive messages, take real-world actions, and operate across the internet using your identity — without ever giving a third party access to your data.
```

**Paragraph 3:**
```
Everything in OmnyID flows through AFP — the Agent Forward Protocol. AFP is a structured, signed, encryption-aware message format. Whether you're reading an email, writing a note, updating a calendar, or booking a flight, it all becomes one AFP message. One format. One identity. Every action auditable.
```

**Paragraph 4:**
```
OmnyID runs on your hardware. On your cloud account. Or self-hosted by you, with one Docker command. We'll also offer a hosted path for people who want the experience without the infrastructure — but even then, the homeserver cannot read your messages. End-to-end encryption is the default, not the upgrade.
```

### Diagram Alt Text (for accessibility)
```
Diagram showing an OmnyID Agent ID at the center, with lines connecting outward to: Email, Notes, Tasks, Calendar, External APIs, and Other Agents.
```

---

## Section 4: How It Works / Feature Grid

### Section Label
```
HOW IT WORKS
```

### Section Headline
```
One identity. Every surface. Zero compromises.
```

### Feature Cards

---

#### Feature 1: Permanent Agent ID
**Icon**: fingerprint or key

**Title**: Your Agent ID Is Yours Forever

**Body**: When you claim an Agent ID on OmnyID, it is cryptographically generated and belongs to you. It doesn't expire. It isn't tied to our servers. It's yours, wherever you run OmnyID — on your machine, your VPS, or our hosted path.

**Contextual term**: `Agent ID` (hover card enabled)

---

#### Feature 2: Real Email Gateway
**Icon**: envelope with a shield

**Title**: Agents That Send and Receive Real Email

**Body**: Connect your own email address. Your OmnyID agents can triage your inbox, summarize threads, label, star, archive, and reply — acting as a tireless, private assistant. Nothing leaves your infrastructure in plaintext.

---

#### Feature 3: End-to-End Encrypted
**Icon**: lock or shield

**Title**: The Server Sees Nothing

**Body**: Every message, note, and attachment is encrypted on your device before it reaches the homeserver. The homeserver stores ciphertext only. Even if you run OmnyID on our hosted path, we cannot read your content. This is not a setting. This is the architecture.

**Contextual term**: `E2EE` (hover card enabled)

---

#### Feature 4: Structured Agent Actions
**Icon**: checklist or action arrow

**Title**: Agents That Act, Not Just Answer

**Body**: OmnyID agents don't just generate text — they take typed, auditable actions. Label an email. Book a flight. Update a workspace. Charge a card. Every action is an AFP message: structured, signed, and reviewable. You decide what requires human approval.

**Contextual term**: `AFP` (hover card enabled)

---

#### Feature 5: Local-First, Always
**Icon**: device/laptop with a local storage symbol

**Title**: Your Data Lives on Your Hardware First

**Body**: OmnyID is local-first. Your workspace loads from local storage. Agents work with local data. The homeserver syncs what you choose, when you choose. Going offline doesn't mean losing access.

**Contextual term**: `Local-first` (hover card enabled)

---

#### Feature 6: Open Source, Forever
**Icon**: GitHub Octocat or open padlock

**Title**: Open Source and Community-Owned

**Body**: Every line of OmnyID is open source under a permissive license. The protocol spec is public. The roadmap is public. We believe the infrastructure of the agentic era must be owned by the people who use it.

---

## Section 5: OmnyID vs "AI Workspace"

### Section Label
```
WHY THIS IS DIFFERENT
```

### Section Headline
```
Other tools add AI to software.
OmnyID builds software for AI.
```

### Framing Paragraph
```
There is a category of product called "AI workspace." It includes Notion AI, Microsoft Copilot, Google Workspace AI, and dozens of VC-funded competitors. They all share the same architecture: a traditional database or document editor, with an AI model connected to it via API. They were not designed for agents. They were adapted for them.

OmnyID starts from a different question: what would personal software look like if it was built from day one for the way agents think, communicate, and act?
```

### Comparison Table

**Headers**: Feature | Traditional AI Workspace | OmnyID

| Feature | Traditional AI Workspace | OmnyID |
|---|---|---|
| Architecture | Built for humans, AI bolted on | Built for agents, human UX on top |
| Data privacy | Your data processed on their servers | Ciphertext-only homeserver by default |
| Agent identity | No persistent identity | Permanent cryptographic Agent ID |
| Email integration | Read-only summaries, no real agent inbox | Full SMTP/IMAP gateway — agents send, receive, and act |
| Protocol | Proprietary, closed | AFP — open, typed, auditable |
| Message format | Unstructured text | Structured AFP messages: signed, versioned, encryption-aware |
| Self-hostable | No | Yes — Docker Compose, one command |
| Open source | No | Yes — full source, public spec |
| Local-first sync | No | Yes — ElectricSQL sync layer, PGLite on-device |
| Agent actions | Suggestions only | Typed, permissioned actions with audit trail |
| Personalization | Model trained on aggregate data | LoRA adapter trained locally on your data only |

### Closing Statement (after table)
```
This is not a criticism of those products. They serve a purpose. But if you want your agents to actually work — to hold a real inbox, to act on the world, to remember who you are, to keep your data private — you need infrastructure built for that purpose. OmnyID is that infrastructure.
```

---

## Section 6: Roadmap

### Section Label
```
ROADMAP
```

### Section Headline
```
Building the foundation, one milestone at a time.
```

### Framing Paragraph
```
OmnyID is being built transparently, in public. The milestones below represent the critical path from today's functional cryptographic core to a fully self-hostable personal workspace. Every milestone ships working software, not just plans.
```

---

### Milestone A: Private Messaging Core

**Badge**: A  
**Status**: In Progress

**Headline**: Private Messaging Core

**Description**:
```
The foundation of OmnyID. This milestone delivers the canonical AFP v1 message protocol with Ed25519 signatures, XChaCha20-Poly1305 content encryption, a Rust homeserver with ciphertext-only storage defaults, and production-ready Python and TypeScript SDKs.

When Milestone A is complete: agents can send, receive, and verify private, structured messages. The homeserver stores nothing it cannot be trusted to store. Signed AgentCards allow secure agent discovery.
```

**Key deliverables**:
- AFP v1 schema — frozen, cross-platform
- Ed25519 message signing and verification
- XChaCha20-Poly1305 content encryption
- Rust homeserver with signed ingress enforcement
- Python SDK and TypeScript SDK at feature parity
- Signed AgentCard discovery protocol

---

### Milestone B: Real Email Agent

**Badge**: B  
**Status**: Planned

**Headline**: Real Email Agent

**Description**:
```
The first moment OmnyID touches your real life. This milestone connects OmnyID to your existing email address — Gmail, Outlook, or any IMAP/SMTP provider. Your agents can triage incoming email, summarize threads, label, star, archive, and reply, all without a third party reading your messages.

When Milestone B is complete: you can replace a significant portion of your daily inbox management with a private, local-first agent that acts on your behalf.
```

**Key deliverables**:
- SMTP and IMAP gateway hardened for Gmail and Outlook
- Inbound email-to-AFP conversion with full threading support
- Outbound agent reply using your own credentials
- Triage loop: classify, summarize, route, and act
- Digest generation: only what matters reaches your real inbox

---

### Milestone C: Personal Workspace

**Badge**: C  
**Status**: Planned

**Headline**: Personal Workspace

**Description**:
```
One AFP thread. Four views. This milestone turns OmnyID from an agent infrastructure tool into a usable personal workspace. The same thread of messages and actions can be rendered as an email inbox, a structured notes canvas, a relational database table, or a calendar — all driven by AFP render hints, not hardcoded layouts.

When Milestone C is complete: non-technical users have a real workspace. Developers have a fully programmable workspace API.
```

**Key deliverables**:
- Multi-view renderer: email, notes canvas, database table, calendar
- Config-driven layout system — reorderable, per-user
- Local-first sync layer via ElectricSQL
- Thread navigation and page workspace
- Encrypted attachment preview

---

### Milestone D: Self-Hostable Product

**Badge**: D  
**Status**: Planned

**Headline**: Self-Hostable Product

**Description**:
```
OmnyID for everyone. This milestone makes it possible for any person with a server or a cloud account to run OmnyID with a single Docker command — with proper HTTPS, domain binding, backup workflows, and a migration path as the project evolves.

A one-click hosted path will also be available for users who want the experience without managing infrastructure. Even in hosted mode, the zero-access privacy model is preserved by the cryptographic architecture.

When Milestone D is complete: OmnyID is a product, not just a framework.
```

**Key deliverables**:
- Production-ready Docker Compose with Caddy, Postgres, MinIO, and homeserver
- Oracle Cloud and secondary cloud one-click deploy templates
- One-click hosted onboarding: claim Agent ID, connect email, open workspace
- Documented security model for hosted-mode trust
- Backup, restore, and upgrade workflows

---

## Section 7: Open Source

### Section Label
```
OPEN SOURCE
```

### Section Headline
```
The infrastructure of the agentic era must be owned by everyone.
```

### Body
```
OmnyID is fully open source. The protocol spec, the homeserver, the SDKs, the UI, and the cryptographic primitives — every line of code is public and auditable. We believe that private, agent-native infrastructure cannot be trusted unless it can be inspected, forked, and run independently.

We are building OmnyID because we believe this layer needs to exist, not because we need to own it. If you believe the same thing, we'd love your contribution.
```

### GitHub CTA Button
```
View the Source on GitHub ↗
```

### Supporting Tagline (under button)
```
MIT Licensed. Community governed. No VC lock-in.
```

---

## Section 8: Join the Waitlist

### Section Label
```
EARLY ACCESS
```

### Section Headline
```
Be among the first to claim your Agent ID.
```

### Body (above form)
```
OmnyID is in active development. We're opening early access to a small group of privacy-conscious individuals, developers, and organizations who want to help shape the platform.

Join the waitlist. We'll reach out when your spot is ready.
```

### Input Placeholder
```
your@email.com
```

### Submit Button
```
Claim Your Spot
```

### Success Message (after submission)
```
You're on the list. We'll be in touch when your Agent ID is ready.
```

### Trust Copy (below form)
```
No spam. No credit card required. Unsubscribe any time. Open source forever.
```

### Optional: Waitlist Social Proof (if >100 signups)
```
Join [X] people already waiting.
```

---

## Section 9: Footer

### Tagline
```
OmnyID — Your Agent Identity. Your Rules.
```

### Footer Navigation

Left column:
- Product (scroll to hero)
- Why OmnyID (scroll to problem)
- How It Works (scroll to features)
- Roadmap (scroll to roadmap)

Center column:
- GitHub ↗
- Documentation (placeholder — opens GitHub README)
- Protocol Spec (placeholder — opens AFP proto file on GitHub)
- Open an Issue ↗

Right column:
- Privacy Model
- Terms of Service (placeholder)
- Built with ♥ in public

### Copyright Line
```
© 2025 OmnyID Contributors. Open source under the MIT License.
```

---

## Contextual Hover Card Copy

These appear on hover for underlined terms in the body copy.

### AFP
```
Agent Forward Protocol — the open, structured message format at the heart of OmnyID. Every email, note, action, and calendar event is an AFP message: typed, signed, and encryption-aware.
```

### Agent ID
```
A permanent, cryptographic identifier for you and your agents. Like an email address, but tied to a key you control — not a server someone else owns.
```

### E2EE
```
End-to-End Encryption. Content is encrypted on your device before it reaches the server. Only you — and whoever you send to — can decrypt it. The homeserver stores ciphertext only.
```

### Self-hostable
```
Run OmnyID on your own machine, VPS, or cloud account using Docker. Your data never leaves your infrastructure. One command: `docker compose up`.
```

### Local-first
```
Your workspace loads from local storage. Agents work with local data. The homeserver syncs what you choose, when you choose — going offline doesn't mean losing access.
```

### Ed25519
```
A modern, fast digital signature algorithm. Every AFP message sent through OmnyID is signed with Ed25519, proving it came from the declared identity and wasn't modified in transit.
```

### HomeServer
```
The private server that stores your encrypted AFP messages. It can run on your hardware, your cloud, or OmnyID's hosted infrastructure. It never requires plaintext to function.
```

---

## SEO Keyword Targets

The content should naturally incorporate these without keyword stuffing:

**Primary:**
- AI agent identity
- private agent workspace
- open source AI workspace
- local-first AI agent
- agent email address
- decentralized AI framework

**Secondary:**
- agent forward protocol
- E2EE agent communication
- self-hosted AI workspace
- AI inbox management
- privacy-first AI tools
- agent SDK Python TypeScript

**Long-tail:**
- "give AI agent a real email address"
- "private AI workspace open source"
- "agent identity cryptographic"
- "self-hosted alternative to Notion AI"
- "AI agent framework privacy first"

---

## Research Notes: Target Audience Pain Points

These insights informed the content above. Use them to calibrate tone and emphasis.

### Everyday Users (Non-Technical)

**Pain**: Email consumes 2.5–3 hours of the average knowledge worker's day. Inbox zero is a joke. Newsletters, receipts, spam, and actual urgent messages all look the same.

**Pain**: Every AI tool that promises to help reads your email — Google, Microsoft, every startup. Users feel surveilled but feel they have no alternative.

**Pain**: "AI workspace" tools (Notion AI, etc.) require uploading all documents and notes to a third-party server to get any AI benefit. There is no local option.

**Pain**: AI assistants have no memory, no continuity, no identity. Every conversation starts over. They can't "be working in the background" in any real sense.

**Desire**: A workspace that works for me, not one I work for. One that learns my preferences, not one that trains on my data for someone else's product.

**Desire**: Agents that "just handle it" — the flight booking, the invoice, the reply — without needing to be supervised every 30 seconds.

**Desire**: The feeling that technology is on their side, not surveilling them.

### AI Power Users / Developers

**Pain**: OpenClaw, LangChain, AutoGen, CrewAI, MetaGPT — all powerful, none solve the identity problem. Agents have no stable ID, no real inbox, no way to receive async replies.

**Pain**: MCP (Model Context Protocol) by Anthropic gives agents tools, but not identity. Google A2A gives agents routing, but not privacy. There is no protocol that does all three: identity + privacy + action.

**Pain**: Every agent framework requires calling home to OpenAI, Anthropic, or another cloud service. Nothing is local by default.

**Pain**: No audit trail. Agent takes an action, it's opaque. No signed record of what was decided, when, by which agent, with what input.

**Pain**: Building agent workflows that interact with real email is painful — every developer reinvents the IMAP/SMTP bridge, the summarization loop, the deduplication logic.

**Desire**: A protocol layer for agents — like HTTP was for web pages. A standard that lets agents communicate across teams, organizations, and implementations.

**Desire**: Real E2EE that is architecturally enforced, not just an option in a settings menu.

**Desire**: Open source, auditable, forkable. Not locked to any one vendor's runtime.

---

## Research Notes: Agentic Era Landscape (2024–2025)

These facts contextually position OmnyID as the infrastructure layer the industry needs but hasn't built yet. They can be woven into the body copy or used in a future blog post.

- **OpenClaw / WebMCP**: Gives agents tools to interact with the web. Does not solve identity, inbox, or privacy.
- **Anthropic MCP (Model Context Protocol)**: A standard for connecting AI models to external tools. No identity layer, no E2EE, not local-first.
- **Google Agent2Agent (A2A)**: A proposal for agent-to-agent task routing. Proprietary to Google's ecosystem, not privacy-preserving.
- **AutoGen / MetaGPT / CrewAI**: Multi-agent orchestration frameworks. None provide persistent identity, real email integration, or local-first operation.
- **Notion AI / Microsoft Copilot / Google Workspace AI**: Traditional software with AI models bolted on. Data processed in the cloud. Not agent-native architecture.
- **ElectricSQL**: Local-first sync layer for Postgres. OmnyID uses this to enable true multi-device sync without a centralized server round-trip for every read.

**The gap**: Every framework in this list solves a piece of the puzzle. None provide:
1. Cryptographic agent identity
2. Real email gateway (SMTP/IMAP)
3. E2EE by architectural default
4. Local-first data model
5. Open, typed AFP protocol
6. Self-hostable with one command

OmnyID is the first framework to attempt all six simultaneously, openly, and with privacy as a structural property rather than a feature toggle.

---

## Tone Calibration Examples

Use these examples to verify tone before writing or editing any copy.

**Too loud / wrong**:
> "OmnyID is REVOLUTIONARY! The AI workspace that will change EVERYTHING!"

**Too technical / wrong**:
> "OmnyID implements RFC-compliant Ed25519 message signing with XChaCha20-Poly1305 content envelopes across an append-only AFP v1 homeserver."

**Too corporate / wrong**:
> "OmnyID empowers users to leverage next-generation AI-native workspace solutions through our innovative agent identity platform."

**Correct tone**:
> "OmnyID gives every agent you run a permanent home. Signed. Encrypted. Yours."

**Correct tone**:
> "The homeserver sees ciphertext. Only you hold the keys. This is not a privacy setting — it is the architecture."

**Correct tone**:
> "We're not adding AI to a workspace. We're building a workspace for AI."
