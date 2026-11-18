# Runbook tool contract boundary

Implementation task: WED-375. This is validated preparation, not execution authority.

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
connection provider, both schemas and exact arguments. It excludes credentials.
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
or that the runbook's success criterion passed. Future runtime integration must
persist authenticated AFP receipts, check success criteria and bind provenance.

## Canonical preparation and revalidation

Preparation reads no credential values. A connection must match exactly one
healthy, unrevoked canonical grant for the owner, tool, capability, transport
and secret pointer. Suggestion-only grants are rejected. Direct MCP connections
must not carry broker account fields; Composio requires the exact owner actor
and a bounded account identifier. Ambiguous grants fail closed, including a
second grant for a different account. The projected endpoint, provider and
selected contract must match the current connection descriptor.

The v2 request hash additionally binds connection/grant identities and epochs,
provider account, approval mode and scopes. `revalidate_runbook_tool` reloads
current state and rejects a different owner or changed snapshot. This is not an
atomic dispatch reservation: a future executor must recheck live authority at
its transaction/dispatch boundary. Credential rotation does not yet have an
independent revision counter and must not be inferred solely from timestamps.

The generic `Db::list_tool_execution_registry` remains an empty stub. This
preparation-only projection does not enable its non-runbook callers or any
provider execution. Adversarial PostgreSQL tests cover these boundaries and
verify that preparation makes no connection to a local provider listener.

The remaining execution work must bind exact action approval, freeze/reserve an
attempt before any provider call, recheck current registry/policy, bound timeout
and result size at transport, persist verified private AFP results atomically,
and define crash/unknown-outcome reconciliation without blind retries. Existing
private-review approval never supplies external execution authority.


## Bounded MCP transport (not yet connected to runbook execution)

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
Future routes must require a recent authenticated human session; no route is
wired to this internal seam in this batch.

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

The trusted adapter seam currently has loopback/mock coverage only. Selecting and
loading live provider credentials, approved account binding in the live adapter,
UI/route integration, deterministic evidence-to-argument mapping, normalized
provider-specific AFP projections and explicit unknown-outcome reconciliation
remain separate integration work. Nothing here enables production tool execution.
