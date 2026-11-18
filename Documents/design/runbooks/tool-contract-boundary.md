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
