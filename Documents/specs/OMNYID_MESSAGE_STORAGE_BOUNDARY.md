# OmnyID Message Storage Boundary

## Purpose

This note documents which AFP message flows are expected to land in:

- tenant-local Postgres schemas such as `"user_<id>".messages`
- shared/public message storage such as `public.messages`

The goal is to keep the privacy boundary explicit as the migration progresses.

## Core Rule

Use this rule unless there is a clear reason not to:

- authenticated, user-owned workflow traces should be stored in the tenant-local schema
- generic AFP transport, public/shared infrastructure traffic, and cross-tenant/public ingress stay on the shared path

In practice:

- `store_private_app_message(...)` and `Db::store_private_message(...)`
  are the preferred write path for authenticated workspace flows
- `store_proto_message(...)` and `Db::store_message(...)`
  remain the shared/default transport path for generic AFP ingress

## Tenant-Local By Default

These flows now follow the tenant-local storage model when driven by an authenticated user:

### Agent and Task Workflows

- agent intent creation
- command-generated task creation
- command-generated schedule creation
- command-generated note creation
- task approval
- task rejection
- task cancellation
- task completion result trace
- orchestration card creation
- orchestration card lifecycle updates:
  - progress
  - results
  - final answer
  - error

### Decision and Interactive Control Flows

- `/ui/decision` user decision messages
- `/ui/decision` clarification / approval replacement sections
- `/ui/decision` orchestration resume / cancel progress updates
- authenticated action approval decisions recorded through `record_action_decision_http(...)`

### Runtime and Audit-Adjacent Flows

- authenticated `/agent/invoke` capability audit message
- authenticated `/actions/execute` intent/result messages
  - when a bearer session is present
  - otherwise this path still falls back to shared storage

### Bootstrap and Demo Flows

- agent provisioning activity message
- demo agent intro messages
- authenticated demo agent-to-agent send flow

## Intentionally Shared / Public

These paths are still expected to use shared/public message storage:

### Generic AFP Transport

- tonic gRPC AFP message ingress
- generic relay socket message submission
- low-level server `store_proto_message(...)` transport path

### Public or Mixed Ingress

- inbound gateway email handling
- public/shared AFP traffic where no authenticated tenant boundary is available
- any transport path whose source is not safely attributable to a signed-in workspace user

## Transitional Read Behavior

Authenticated thread reads now use a bridge:

- first read tenant-local messages from `"user_<id>".messages`
- then read shared messages from `public.messages`
- merge and de-duplicate by message id
- sort by timestamp and id

That lets OmnyID migrate authenticated workflow threads incrementally without breaking:

- older shared history
- mixed threads created before tenant-local routing existed
- public/shared AFP transport behavior

## Current Design Intention

The intended steady state is:

- user-private workspace workflows live in tenant-local storage
- shared/public infrastructure traffic remains shared only where that is truly required

This is not yet a full cutover of every message family.
It is an incremental migration with explicit exceptions.

## Developer Guidance

When adding a new message-producing path, ask:

1. Is this message created on behalf of an authenticated user workspace?
2. Is the message part of that user’s private task, note, orchestration, or runtime activity?
3. Does any other tenant need to read it by default?

If the answers are:

- yes
- yes
- no

then prefer the tenant-local write path.

If the path is:

- public ingress
- generic transport
- cross-tenant/public infrastructure
- unauthenticated or identity-ambiguous

then keep the shared write path unless the architecture is redesigned more deeply.

## Verification

Real local Postgres smoke coverage already verifies tenant-local message storage for:

- private messages
- private attachments
- private task-thread trace messages
- authenticated task completion result traces written through `POST /agent/tasks/{id}/complete`
- authenticated thread reads that merge tenant-local and shared messages through `GET /thread/{id}`
- authenticated helper-based storage routing through `store_app_message_for_headers(...)`
- authenticated `send_http(...)` endpoint storage
- authenticated `execute_action_http(...)` intent/result storage
- unauthenticated `store_app_message_for_headers(...)` shared fallback storage

Use:

```bash
$env:OMNYID_RUN_DB_SMOKE='1'
$env:DATABASE_URL='postgres://afp:afp@127.0.0.1:5432/afp'
cargo test local_postgres_tenant_private_workflow_round_trip -- --nocapture
```

Additional focused smoke tests:

```bash
$env:OMNYID_RUN_DB_SMOKE='1'
$env:DATABASE_URL='postgres://afp:afp@127.0.0.1:5432/afp'
cargo test local_postgres_store_app_message_for_headers_ -- --nocapture
cargo test local_postgres_send_http_authenticated_uses_tenant_private_storage -- --nocapture
cargo test local_postgres_execute_action_http_authenticated_uses_tenant_private_storage -- --nocapture
cargo test local_postgres_agent_task_complete_http_authenticated_appends_private_result_trace -- --nocapture
cargo test local_postgres_get_thread_http_authenticated_merges_private_and_shared_messages -- --nocapture
```

before expanding this boundary further.
