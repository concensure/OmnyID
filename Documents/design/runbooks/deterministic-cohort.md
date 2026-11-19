# Expiring internal deterministic cohort

WED-379 connects the existing persisted-event hook to a separately disabled
executor. Event matching still requires OMNYID_RUNBOOK_EVENT_HOOKS_ENABLED and
OMNYID_RUNBOOK_ALLOWLIST. Automatic execution additionally requires:

- OMNYID_RUNBOOK_DETERMINISTIC_ENABLED=true
- OMNYID_RUNBOOK_DETERMINISTIC_OWNERS: explicit comma-separated owner IDs
- OMNYID_RUNBOOK_DETERMINISTIC_DEFINITIONS: explicit runbook_id@version entries
- OMNYID_RUNBOOK_DETERMINISTIC_EXPIRES_AT: RFC3339 expiry, at most one hour ahead

Missing, malformed, empty, oversized or expired configuration denies execution.
The two owner lists intersect. Request/event content cannot set these controls.
No management endpoint starts execution, and no model/tool adapter is composed.

Admission requires the complete canonical step contract of the budget, stored
quote or task-deadline starter: Read, Transform, private Emit, Complete. Matching
step kinds alone is insufficient: selectors, operations, required facts, output
kinds, token/cost fields and every other Step field must match the trusted starter.
Definitions with tools or followups are denied. A version change requires a new
operator allowlist entry. This is intentionally a narrow initial cohort.

At most five instances and six iterations per instance are considered inside the
existing five-second hook timeout. Existing executor receipts, revisions, owner
locks, enabled-definition checks and encrypted private storage remain authoritative.
Concurrent/stale workers stop without external retry. Terminal/waiting instances
are not restarted. Missing evidence does not become a fabricated review.

A bounded runtime checks expiry after acquiring each executor's owner lock,
before admitting its transaction. A transaction already admitted may finish;
subsequent transactions are denied. This is a transaction-admission cutoff, not
an assertion that a database commit is forcibly interrupted at the deadline.
Definition disablement is rechecked under the existing transaction lock.

Content-free hook counters record completed, policy-denied, terminal/waiting,
concurrent/stale and error outcomes. A timeout warns that matching/execution was
deferred; it never reports success. No model/provider call, approval, sending,
booking, payment, external publication or followup scheduling occurs here.

The hosted acceptance executable invokes the real Db::insert_daemon_afp_message
entrypoint. It persists private synthetic wedding budget facts, exercises two
allowed owners (24 guests/AUD18000 and120 guests/AUD45000), and verifies automatic
completion, review content, concurrent duplicate events and owner isolation.
A third non-allowed owner must get no instance or review. Further cases exercise
wrong version, disabled policy/definition, expiry while blocked on an owner lock,
unsupported contracts, stale revisions and cancellation/terminal reopens.
The runner uses a new empty disposable Oracle database and internal-only Docker
network; application credentials and provider API keys are absent. Its encryption
keys are generated for the fixture. Test containers stop afterward.

These instructions do not enable production. Model evaluation, reviewed provider
sandbox and final production release remain distinct gates. Delivery remains
Oracle-only as requested; GitHub upload is not required.
