# OmnyID Consumer Privacy Strategy

> Status note as of Wednesday, August 26, 2026: this document should be read through the lens of `Documents/marketing/OMNYID_PRODUCT_MARKET_FIT_ANALYSIS.md`. Privacy remains a major trust and segmentation advantage, but it should not be treated as OmnyID's primary broad-market top-of-funnel pain claim.

## Why "Get an Agent ID" is weak for non-technical users

For technical users, `Get an Agent ID` is understandable because they already think in terms of protocols, SDKs, and agent infrastructure.

For normal users, it is abstract and premature.

They are usually asking:

- What will this do for me today?
- Is this hard to set up?
- Will this read my private data?
- Am I about to sign up for another technical product I cannot use?

That means OmnyID should not lead with identity plumbing, even though Agent ID is the underlying primitive.

## Better consumer framing

Lead with outcomes, not infrastructure.

Lead with the strongest outcome first:

- `Stop restarting every AI conversation from zero`
- `Bring your context across tools`
- `Get a private assistant that remembers`

Then use privacy as the trust amplifier that makes the outcome believable.

Recommended primary CTA:

- `Start my private assistant`

Recommended supporting lines:

- `Portable memory across your tools`
- `Runs in a dedicated private environment`
- `No shared runtime with other customers`
- `Encrypted storage and isolated secrets`
- `Support access disabled by default`

Recommended secondary CTA:

- `Choose my privacy mode`

Recommended advanced link:

- `Already have an agent? Create only an Agent ID`

## The right product ladder

OmnyID should offer three deployment modes in plain English.

### 1. Local Private

Best for users who want the strongest privacy.

- Runs on the user's own machine
- Data stays on their device
- Best story for "even OmnyID cannot casually inspect my data"
- Slightly more setup friction
- Must acknowledge platform differences: Windows and macOS/Linux need separate local install flows for Docker, OpenClaw, and CrewAI

### 2. Private Cloud in Your Account

Best balance for privacy-focused non-technical users.

- OmnyID provisions a dedicated runtime inside the user's own Oracle, UpCloud, or OVHcloud account
- OmnyID acts as a control plane and installer, not as the compute owner
- Stronger privacy and ownership than managed hosting

### 3. Managed Private

Best convenience for users who want one-click hosting.

- OmnyID provisions the runtime in OmnyID-managed infrastructure
- Dedicated runtime, storage, and secret boundary still required
- Must be disclosed honestly as convenience-first, not maximum-sovereignty

## What the website should actually say

Do not ask users to understand AFP or Agent IDs first.

Do not make privacy the whole pitch either.

The recommended message order is:

1. `Your assistant remembers across tools`
2. `It belongs to you, not one vendor`
3. `It runs privately by default`

Instead, the first experience should be:

1. choose what the assistant should help with
2. choose privacy mode
3. connect apps only if they want to
4. launch a private workspace

Only after that should OmnyID reveal:

- their Agent ID
- the runtime status
- the advanced deployment details

Keep one explicit advanced path for technical users who already built agents elsewhere and only need OmnyID identity and relay infrastructure.

## Control Plane vs Data Plane

The website should be the control plane.

It should manage:

- signup
- billing
- deployment status
- subdomain routing
- privacy settings
- support consent
- runtime lifecycle controls

It should not be the shared execution engine for customer agents.

The customer data plane must stay inside:

- one isolated OpenClaw runtime, or
- one isolated CrewAI runtime, or
- both, inside the same customer-specific boundary

## Minimum privacy model OmnyID should commit to

One customer must always map to:

- one isolated runtime
- one isolated storage boundary
- one isolated secret boundary
- one isolated auth boundary

That is the minimum defensible position for a privacy-forward commercial product.

## Hosted privacy statement OmnyID can defend

This is a safe plain-English promise:

`Your workspace runs in a dedicated isolated environment. Your data is encrypted at rest, separated from every other customer, and not accessed by our staff unless you explicitly authorise support access.`

Avoid absolute claims such as:

- `100% impossible for us to ever see your data`
- `Zero chance of operator access`

Those are not operationally honest unless customer-managed keys and strict break-glass policy are fully implemented.

## Recommended product rollout

### Phase A

- Local Private installer
- Separate Windows and macOS/Linux installers
- BYOC cloud installer for Oracle, UpCloud, OVHcloud
- OmnyID website as wizard and control plane
- Agent templates for real daily-life value

### Phase B

- Managed Private hosting
- Dedicated runtime per customer
- Per-customer secret paths
- Consent-based support access

### Phase C

- Customer-managed keys
- Stronger operator-blind backups
- Enterprise audit export
- Policy controls and SSO

## What users should build

Do not ask non-technical people to "build agents from Python" first.

They should start from templates such as:

- study day coordinator
- personal workday navigator
- private inbox triage assistant
- appointment and follow-up assistant

Advanced mode can reveal:

- CrewAI orchestration
- OpenClaw gateway settings
- custom prompts
- tool permissions

## Best way forward

OmnyID should position itself as:

- a private assistant launcher for people whose AI context is fragmented across tools
- a control plane for isolated private runtimes
- a simple setup wizard for Local Private, BYOC, and Managed Private
- a downloadable onboarding bundle with direct installer handoff after setup is saved
- provider-specific private-cloud bundle guidance for Oracle Cloud, UpCloud, and OVHcloud instead of a single generic hosted path

The Agent ID remains central technically, but it should appear later in the journey, after the user already understands what they are getting.
Privacy remains central to trust, but it should validate the value proposition rather than replace it.
