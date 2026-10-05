# OmnyID Landing Page — Content

> Status note as of Wednesday, August 26, 2026: this is a historical identity-first landing draft. For the current landing hierarchy, defer to `Documents/marketing/OMNYID_PRODUCT_MARKET_FIT_ANALYSIS.md` and `Documents/marketing/OMNYID_LANDING_CONTENT_PROMPT.md`.

This markdown file contains all the content for the OmnyID landing page, organized by section to match the design in `code.html`.

---

## Navigation

- **Technology** → Hero section
- **Architecture** → "What is OmnyID" section
- **Roadmap** → Roadmap section
- **Docs** → GitHub README
- **Join Waitlist** CTA button

---

## Hero Section

### Pill Badge
```
Portable Memory · Owned Identity
```

### Headline
```
Your AI context
should not reset
every time you switch tools.
```

### Subline
```
OmnyID gives you cross-tool AI memory tied to an identity you own, with private runtime control instead of context trapped inside one vendor's product.
```

### Primary CTA
```
Join Waitlist
```

### Secondary CTA
```
Read the Thesis → (links to thesis.html)
```

### Agent Manifest Card (right side)
```json
id:        "omny_8f2e...9k2"
status:    active_sovereign
peers:     1,402
```

Animated text: *"Drifting node mesh sync in progress..."*

---

## Problem Section — "The Current State"

### Section Label
```
THE CURRENT STATE
```

### Headline
```
Your AI context is trapped in separate tools.
```

### Body
```
Every time you switch between ChatGPT, Claude, Cursor, email, notes, and calendar tools, your context fractures. You either re-explain yourself or accept generic output. OmnyID exists to make that context portable, durable, and under your control.
```

---

## What Is OmnyID Section

### Headline
```
Decentralization without the friction.
```

### Body
```
OmnyID uses a local-first architecture. Your identity lives on your hardware, syncs across your devices via encrypted peer-to-peer tunnels, and presents a cryptographic proof to services—never your raw data.
```

### Feature List

#### 1. Zero-Knowledge Proofs
- **Icon**: Security shield
- **Headline**: Zero-Knowledge Proofs
- **Body**: Verify your age, nationality, or credentials without revealing the underlying data points.

#### 2. Device Mesh Sync
- **Icon**: Sync arrows
- **Headline**: Device Mesh Sync
- **Body**: Instant, cloudless synchronization between your phone, laptop, and hardware keys.

### Constellation Diagram (right side)

Central node connected to four satellite nodes representing:
- Email
- Notes  
- Tasks
- External APIs

---

## Feature Grid Section — "Capabilities"

### Section Label
```
CAPABILITIES
```

### Headline
```
Engineered for Sovereignty.
```

### Card 1: Sovereign Agent ID
- **Icon**: Key
- **Headline**: Sovereign [Agent ID](tooltip: "Agent ID is a unique, non-custodial identifier controlled solely by you.")
- **Body**: A unique cryptographic identity that exists outside of any database. Your identity is a protocol, not a record in a table.
- **Code sample**: `omny_id://0x4f2...9k2e`

### Card 2: Native E2EE
- **Icon**: Shield
- **Headline**: Native [E2EE](tooltip: "End-to-End Encryption ensures only you and the intended recipient can read the data.")
- **Body**: Every interaction is encrypted by default. Data is never decrypted on a server—only on your authorized devices.
- **Technical note**: Standard: AES-256-GCM

### Card 3: Adaptive AFP
- **Icon**: Hub
- **Headline**: Adaptive [AFP](tooltip: "Agent Federation Protocol allows different identity agents to communicate securely without central servers.")
- **Body**: The Agent Federation Protocol allows OmnyID to bridge with existing OIDC and SAML systems while maintaining local control.
- **Badges**: OIDC, SAML

### Card 4: Hardware Binding
- **Icon**: Devices
- **Headline**: Hardware Binding
- **Body**: Bind your identity to Secure Enclaves (TPM/T2) or external FIDO2 keys for multi-factor sovereign security.

### Card 5: Data Granularity
- **Icon**: Folder managed
- **Headline**: Data Granularity
- **Body**: Share only what is necessary. Need to prove you're 21+? Share the proof, not your birthdate.

### Card 6: Immutable Audit
- **Icon**: History
- **Headline**: Immutable Audit
- **Body**: A private, local-only ledger of every service that has requested your data and what you provided.

---

## Comparison Table Section — "The Architecture of Control"

### Headline
```
The Architecture of Control
```

### Table

| Feature | SaaS Cloud ID | OmnyID |
|---|---|---|
| Ownership | Custodial (The Provider) | **Non-Custodial (You)** |
| Data Storage | Centralized DB | **Local-First / Mesh** |
| Data Privacy | Provider has full view | **Zero-Knowledge Only** |
| Interoperability | Ecosystem Locked | **Universal Protocol** |

---

## Roadmap Section — "The Path Forward"

### Section Label
```
THE PATH FORWARD
```

### Headline
```
Roadmap
```

### Milestone 1: Core Protocol Beta
- **Timeline**: Q2 2026
- **Status**: In Progress (secondary color, ring indicator)
- **Description**: AFP v1 stable, Rust homeserver, Python/TS SDKs, basic AgentCard discovery, E2EE (Noise), append-only ElectricSQL storage.

### Milestone 2: Gateway & Cloud Alpha
- **Timeline**: Q3 2026
- **Status**: Future (secondary/40%, lighter)
- **Description**: Bidirectional IMAP/SMTP gateway with OAuth, one-click Docker & Oracle Cloud deploy, OmnyID Cloud private beta (hosted homeserver).

### Milestone 3: Premium UI & Agent Tools
- **Timeline**: Q4 2026
- **Status**: Future (dashed border)
- **Description**: SolidJS + Lexical note-taking UI (supertags, backlinks), LoRA genome support, one-click agent runner templates, public Cloud launch ($9/mo tier).

### Milestone 4: Ecosystem & Marketplace
- **Timeline**: Q1 2027
- **Status**: Future (dashed border)
- **Description**: Open Capability Card standard published, optional ERC-8004 registry integration, agent marketplace MVP, mobile PWA.

---

## Open Source Section — "Freedom of Code"

### Section Label
```
FREEDOM OF CODE
```

### Quote
```
OmnyID is, and will always be, open source. Identity is too important to be a black box.
```

### Links
- GitHub/omnyid-core
- Spec/afp-01

---

## Waitlist Section

### Headline
```
Join the waitlist for the private beta.
```

### Subline
```
Secure your sovereign handle and be among the first to deploy an Omny Agent.
```

### Form
- **Label**: Email Address
- **Placeholder**: you@example.com
- **Button**: Request Access
- **Success state**: "You are #1,402 in line." (with checkmark)

---

## Footer

### Brand
```
OmnyID
```

### Tagline
```
© 2024 OmnyID. Built for the sovereign internet.
```

### Links
- Open Source
- Privacy
- Security
- Status

### Version
```
AGENT_NODE_v0.1.2-ALPHA
```

---

## SEO Meta

### Title
```
OmnyID | The Sovereign Identity Layer
```

### Description
```
OmnyID is a local-first, decentralized identity system built for the sovereign internet. Take back control of your digital self.
```

### OG Title
```
OmnyID | The Sovereign Identity Layer
```

### OG Description
```
Local-first, decentralized identity for the modern web.
```

---

## Structured Data (JSON-LD)

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "OmnyID",
  "applicationCategory": "IdentityManagement",
  "operatingSystem": "Web, iOS, Android",
  "description": "A decentralized, local-first identity system using sovereign agents.",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  }
}
```

---

## Hover Tooltips Content

### Agent ID
> Agent ID is a unique, non-custodial identifier controlled solely by you.

### E2EE
> End-to-End Encryption ensures only you and the intended recipient can read the data.

### AFP
> Agent Federation Protocol allows different identity agents to communicate securely without central servers.

---

## Brand Keywords

- Sovereign identity
- Local-first
- Decentralized
- Agent mesh
- Zero-knowledge
- Non-custodial
- Open source
- Privacy-first

---

## Tone Notes

- **Voice**: Calm, technical, architectural. Not startup-hype. Not sci-fi. "High-end architectural studio" energy.
- **Avoid**: Exclamation marks, superlatives, "revolutionary," "game-changing"
- **Use**: Precise language, "leased asset" metaphor, "sovereign" as consistent theme
- **Design integration**: The content should feel like it's living in a physical space — warm paper, brushed steel, soft natural light
