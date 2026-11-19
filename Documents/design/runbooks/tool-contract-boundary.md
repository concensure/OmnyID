# Runbook tool contract boundary

Implementation task: WED-375. Preparation, approval, reservation and provider dispatch have separate authority boundaries.

The existing tool dispatcher now exposes `prepare_runbook_tool`. It loads the
owner-scoped connection and canonical capability grant in one database snapshot,
then selects exactly one tool slug and capability. It
never infers a capability from task text, calls a provider, or charges usage.
No prepared value may substitute for a policy decision or action approval.

The selected tool descriptor must contain a versioned contract under
`runbook_contracts[capability]`, with exactly `version`, `input_schema`, and
`output_schema`. Version 1 requires both schemas; absent schemas are rejected.
Schema names and arguments supplied by a definition/model cannot replace this
registry contract. The request hash binds owner, tool, capability, endpoint,
connection provider, both schemas and exact arguments. It excludes plaintext
credentials and includes an encrypted-credential fingerprint.
The opaque prepared value is neither Debug nor Serialize and retains no API key.

## Supported schema subset

Root input and output schemas are objects. Every object supplies `properties`,
`required`, and `additionalProperties: false`; duplicate/unknown required names
are rejected. Optional branches are validated even when no value uses them.
Each object has at most 32 properties; schema trees have at most 128 nodes and
8 nested levels. Arrays require `items` and `maxItems` (at most 64). Strings
require `maxLength` (at most 8192 Unicode characters) and optionally a bounded,
unique string `enum`. Integers require signed 64-bit `minimum` and `maximum`.
Boolean and null are supported without coercion. Zero and false remain values.

Unknown fields and keywords are rejected in schemas and input/output objects.
Numbers with fractions, references, unions, defaults, patterns, descriptions,
open objects and implicit unlimited strings/arrays are unsupported. This is a
closed subset, not a complete JSON Schema implementation. Extending it requires
explicit code and tests; unsupported provider schemas stay unavailable.

Schemas are capped at 16 KiB each, contract and input/result payloads at 32 KiB.
Preflight limits depth, node count and pending traversal size before recursive
parsing or serialization. Errors contain fixed codes, not private values.

## Provider results

Only `structuredContent` is accepted and checked against the frozen output
schema. `isError` may be absent or false. `content` may be absent or an empty
array. Text fallback, parallel text/image content, unknown envelope fields,
provider errors and malformed values cannot become successful structured output.
Providers returning additional channels need a separately reviewed adapter.

Validation does not establish that a provider ran, that a side effect succeeded,
or that the runbook's success criterion passed. The durable runtime separately
persists authenticated AFP receipts, checks success criteria and binds provenance.

## Canonical preparation and revalidation

Preparation reads no credential values. A connection must match exactly one
healthy, unrevoked canonical grant for the owner, tool, capability, transport
and secret pointer. Suggestion-only grants are rejected. Direct MCP connections
must not carry broker account fields; Composio requires the exact owner actor
and a bounded account identifier. Ambiguous grants fail closed, including a
second grant for a different account. The projected endpoint, provider and
selected contract must match the current connection descriptor.

The v3 request hash additionally binds connection/grant identities and epochs,
provider account, approval mode, scopes and encrypted-credential fingerprint. `revalidate_runbook_tool` reloads
current state and rejects a different owner or changed snapshot. This is not an
atomic dispatch reservation: the durable executor rechecks live authority at
its reservation boundary, and the MCP adapter rechecks the registry before send.
Credential rotation is detected through the fingerprint, not timestamps alone.

The generic `Db::list_tool_execution_registry` remains an empty stub. This
preparation-only projection does not enable its non-runbook callers or any
provider execution. Adversarial PostgreSQL tests cover these boundaries and
verify that preparation makes no connection to a local provider listener.

The durable executor binds exact approval, reserves an attempt before I/O and
persists private AFP results atomically. Hosted provider integration, usage
accounting and explicit crash/unknown-outcome reconciliation remain. Existing
private-review approval never supplies external execution authority.


## Bounded MCP transport

`mcp_client::bounded::call_tool` is an opt-in low-level transport alongside the
legacy API. It does not load credentials, select an account, approve an action,
reserve an attempt, or persist AFP. No production runbook route invokes it.

It constructs one exact tools/call JSON-RPC request with a fresh correlation ID.
Arguments must be an object and pass depth/node/byte limits before serialization.
The request envelope is capped at 64 KiB. Credentials are bounded, validated as
header values and marked sensitive; errors contain fixed codes only.

A single total deadline (15 seconds by default, at most 30) covers transmission,
headers and body chunks. Responses are bounded to at most 64 KiB by both declared
length and actual accumulated bytes. Redirects, retries, inherited proxies,
compressed responses and event-stream/text fallbacks are disabled or rejected.
Only an application/json object with exact jsonrpc/id/result fields is accepted.
The ID must match; duplicate keys, including nested result keys, are rejected.

A correlated transport receipt is opaque and neither Debug nor Serialize. It
binds endpoint, capability and exact arguments. PreparedRunbookTool validates
that binding and the frozen output schema. Transport correlation is not business
success, proof of the owner/account, an approval or an attempt reservation: the
future executor must bind its full owner/account/grant hash to a durable receipt.

Pre-send validation failures are NotSent. Every error once transmission starts,
including timeout, HTTP/provider error, malformed body and schema rejection, is
Unknown. None grants retry permission. Errors retain no URL, credentials, raw
provider text or private arguments. Cancellation/crash reconciliation and
provider-side idempotency still require the durable execution implementation.

This client retains the existing HTTPS/localhost endpoint policy. Complete DNS
and destination isolation, approved provider compatibility and sandbox evidence
remain release prerequisites; this transport is not an SSRF protection claim.


## Durable exact-action lifecycle

The internal runtime now has propose_tool, decide_tool and execute_tool methods.
A proposal names an exact tool/capability and arguments for the current Tool step;
its full registry hash and original definition are frozen in the private ledger.
The explicit-argument path rejects automatic input selectors and required-field
selectors until their deterministic mapping is implemented. The proposal expires
after ten minutes. The returned proposal_ref identifies the exact decision target.

Decisions require the exact pending proposal and instance revision. Approval
rechecks current canonical account/grant/schema state, both definition policies,
and the existing account proactivity policy. Rejection remains possible after
revocation. Decisions are separate runbook_tool_decision records: a private-review
approval, policy receipt or model answer cannot substitute for this approval.
Approval routes require a recent authenticated human session, as described below.

Execution takes an owner lock, checks the saved decision and fresh policy, locks
existing connection/grant rows while preparing, and appends a one-shot reservation
before invoking the trusted ToolProvider adapter. Its commit is the authorization
boundary. Cancellation/revocation after that point cannot undo an admitted call,
but prevents successful continuation. No locks are held over provider I/O.
A reservation without a result never permits automatic reissue, including after
cancellation, process loss, or failure to persist the provider result.

Finalization signs/encrypts the result in the existing private AFP store and
atomically appends its StepTrace, existing-format provenance, and applicable
instance revision. Provenance hashes the exact saved tool decision. A completed
provider result can be retained with applied=false after cancellation/revocation;
that is not permission to continue. Provider/schema failures retain NotSent or
Unknown honestly and expose only fixed failure codes. Exact retries return the
stored receipt. Completion additionally requires a matching applied tool receipt.

The trusted adapter currently has loopback/mock coverage only. Credential-service
wiring, hosted provider/account compatibility, deterministic evidence-to-argument
mapping, normalized provider-specific AFP projections and explicit unknown-outcome
reconciliation remain separate integration work. The queue UI uses the exact
review API below. Nothing here enables production tool execution.


## Authenticated tool review API

Both `OMNYID_RUNBOOK_MANAGEMENT_ENABLED=true` and
`OMNYID_RUNBOOK_TOOL_REVIEW_ENABLED=true` are required. The latter defaults off.
The management router supplies owner authentication, rate limits, a 40 KiB body
limit and `Cache-Control: no-store`. These endpoints do not call providers:

| Method | Path | Body / response |
| --- | --- | --- |
| POST | `/runbooks/instances/{id}/tools` | `step_id`, `expected_revision`, `request` containing `tool_slug`, `capability`, `arguments`; returns saved `proposal` |
| GET | `/runbooks/instances/{id}/tools/{proposal}` | Returns the exact historical `proposal`, including reviewed arguments |
| POST | `/runbooks/instances/{id}/tools/{proposal}/decision` | `expected_revision`, `approved`; returns saved `decision` |

Every response includes `execution_available: false`. Owner identity comes only
from the authenticated session, never request JSON. Unknown fields are rejected.
Cross-owner and mismatched-instance lookups cannot reveal a proposal. Approval
requires the shared recent high-risk session check, even for a replay. Rejection
requires a valid session but not recent sign-in, so expired proposals and revoked
grants can still be declined. Runtime revision, hash, expiry and live policy
checks remain authoritative; historical GET never implies current eligibility.
There is no provider execution endpoint. Queue UI and live adapter wiring remain
separate work, and neither management nor review flags enable dispatch.


## Tool review queue projection

Owner activity lists include `tool_reviews` with proposal reference, step,
capability, request hash, expiry and status (pending, expired, approved, rejected
or cancelled). Arguments and provider outputs are omitted. HTTP projections add
`tool_review_available` from the default-off review flag; this is display state,
never dispatch authority. Pending approvals share first-page priority with
unanswered questions in the bounded 50-run listing.

Runbook activity and Decision Queue use a separate Tool action review card. The
owner explicitly opens the exact argument detail, fetched from the authenticated
proposal endpoint and checked against the summary. Argument JSON is escaped text,
including false/zero values, with bounded scrolling and wrapping. Approval and
rejection use the dedicated endpoint and current revision after confirmation.
Client expiry is rechecked on confirmation; the server independently checks all
authority. Expired pending proposals can be rejected. Errors require refresh and
never expose raw provider/server error bodies. Account change/unmount aborts
fetches and clears private detail and confirmation state. No execution control
or live provider adapter is introduced.


## Credential-bound pinned MCP adapter

`tool_dispatch::runbook_provider::McpRunbookProvider` implements the trusted
provider seam using existing canonical capability grants, encrypted connection
credentials and bounded MCP transport. Invoke it only through the runtime's
approved one-shot execution flow. It accepts a trusted credential-service KEK
and an explicit reviewed list of `PinnedMcpTarget`s; nothing constructs or enables
it from HTTP, daemon hooks, model arguments or default environment configuration.

Request hash v3 includes a bounded encrypted-credential fingerprint. Changing or
re-encrypting the credential invalidates prior preparation and approval even with
an unchanged connection timestamp. Old v2 proposals cannot be dispatched by this
adapter. Before send, the adapter checks an active owner and re-prepares under
connection/grant locks, compares the exact approved hash, then decrypts only the
matched row's credential. Missing, plaintext, wrong-key and oversized credentials
fail NotSent. There is no anonymous or Composio fallback. No database lock is held
over provider I/O; later revocation/cancellation does not undo an admitted call.

`PinnedMcpTarget::https` requires an exact HTTPS endpoint and one to eight reviewed
public IPv4 addresses. The HTTP client uses those addresses directly while
retaining ordinary hostname TLS verification; URL credentials, query/fragment,
trailing-dot hosts, private/reserved pins and IPv6 are rejected. The dedicated
`loopback_sandbox` constructor accepts only literal IPv4-loopback HTTP endpoints
for local tests. Target selection must remain operator-controlled. Existing
redirect, retry, proxy, deadline, size, correlation and schema safeguards apply.

This is not hosted provider compatibility or a claim that every possible provider
is safe. Real provider/account semantics, KEK service integration, destination
review/updates, usage accounting and rollout evidence remain required. The adapter
does not change the legacy dispatcher, instantiate itself, send real traffic in
verification or grant authority independently of the runtime reservation.
