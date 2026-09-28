import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeOperatorRuntimeRemediationHistoryResponse,
  normalizeOperatorUserDetail,
  normalizeOperatorRuntimeRemediationReceipt,
  normalizeOperatorUserActionReceipt,
  normalizeOperatorProfitAdminSummary,
  normalizeOperatorUsersResponse,
} from "../src/lib/api.ts";

test("normalizeOperatorUsersResponse drops malformed user rows and preserves bounded query state", () => {
  const response = normalizeOperatorUsersResponse({
    users: [
      {
        user_id: "user-1",
        email: "user@example.com",
        email_verified: true,
        plan: "pro",
        billing_status: "active",
        account_status: "active",
        last_session_at: "2026-08-15T08:00:00Z",
      },
      {
        user_id: "missing-email",
        plan: "free",
      },
    ],
    limit: 25,
    query: "pro",
  });

  assert.equal(response.users.length, 1);
  assert.equal(response.users[0]?.email, "user@example.com");
  assert.equal(response.users[0]?.email_verified, true);
  assert.equal(response.users[0]?.account_status, "active");
  assert.equal(response.limit, 25);
  assert.equal(response.query, "pro");
});

test("normalizeOperatorProfitAdminSummary drops malformed rows and defaults missing numerics", () => {
  const response = normalizeOperatorProfitAdminSummary({
    users: [
      {
        user_id: "user-1",
        sessions: 4,
        plan: "pro",
        cost_usd: 12.5,
        revenue_usd: 49,
        margin_usd: 36.5,
      },
      {
        plan: "free",
      },
    ],
    by_workflow: [
      {
        workflow_id: "workflow-alpha",
        cost_usd: 7.25,
        events: 3,
      },
      {
        cost_usd: 4,
      },
    ],
    daily_cost: [
      {
        day: "2026-08-15",
      },
      {
        cost_usd: 5,
      },
    ],
    operational_guidance: {
      status: "no_go",
      summary: "Execute bounded cleanup before trusting runtime pressure state.",
      command: "./scripts/oracle-prune-operational-history.ps1 -Apply",
      source: "artifacts/production-go-no-go-current/production-go-no-go.json",
      pressure_status: "operational_history_present",
      pressure_total_rows: 19800,
      cleanup_mode: "dry_run",
      generated_at: "2026-08-28T08:55:00Z",
    },
  });

  assert.equal(response.users.length, 1);
  assert.equal(response.users[0]?.margin_usd, 36.5);
  assert.equal(response.by_workflow.length, 1);
  assert.equal(response.by_workflow[0]?.workflow_id, "workflow-alpha");
  assert.equal(response.daily_cost.length, 1);
  assert.equal(response.daily_cost[0]?.day, "2026-08-15");
  assert.equal(response.daily_cost[0]?.cost_usd, 0);
  assert.deepEqual(response.operational_guidance, {
    status: "no_go",
    summary: "Execute bounded cleanup before trusting runtime pressure state.",
    command: "./scripts/oracle-prune-operational-history.ps1 -Apply",
    source: "artifacts/production-go-no-go-current/production-go-no-go.json",
    pressure_status: "operational_history_present",
    pressure_total_rows: 19800,
    cleanup_mode: "dry_run",
    generated_at: "2026-08-28T08:55:00Z",
  });
});

test("normalizeOperatorUserActionReceipt defaults missing counts and booleans safely", () => {
  const receipt = normalizeOperatorUserActionReceipt({
    ok: true,
    action: "revoke_all_sessions",
    user_id: "user-1",
    email: "user@example.com",
    account_status: "suspended",
  });

  assert.equal(receipt.ok, true);
  assert.equal(receipt.action, "revoke_all_sessions");
  assert.equal(receipt.user_id, "user-1");
  assert.equal(receipt.email, "user@example.com");
  assert.equal(receipt.sessions_revoked, 0);
  assert.equal(receipt.support_access_revoked, false);
  assert.equal(receipt.account_status, "suspended");
});

test("normalizeOperatorRuntimeRemediationReceipt keeps the manual execution contract explicit", () => {
  const receipt = normalizeOperatorRuntimeRemediationReceipt({
    ok: true,
    action: "issue_cleanup_receipt",
    receipt_id: "receipt_1",
    lifecycle_status: "issued",
    issued_at: "2026-08-28T10:00:00Z",
    execution_mode: "manual_operator_shell",
    approval_required: true,
    summary: "Execute bounded cleanup before trusting runtime pressure state.",
    command: "./scripts/oracle-prune-operational-history.ps1 -Apply",
    source: "artifacts/production-go-no-go-current/production-go-no-go.json",
    guidance_status: "no_go",
    pressure_status: "operational_history_present",
    pressure_total_rows: 19800,
    cleanup_mode: "dry_run",
    artifact_generated_at: "2026-08-28T08:55:00Z",
    note: "Issued from operator usage view.",
  });

  assert.equal(receipt.ok, true);
  assert.equal(receipt.action, "issue_cleanup_receipt");
  assert.equal(receipt.receipt_id, "receipt_1");
  assert.equal(receipt.lifecycle_status, "issued");
  assert.equal(receipt.execution_mode, "manual_operator_shell");
  assert.equal(receipt.approval_required, true);
  assert.equal(receipt.guidance_status, "no_go");
  assert.equal(receipt.pressure_total_rows, 19800);
  assert.equal(receipt.note, "Issued from operator usage view.");
});

test("normalizeOperatorRuntimeRemediationHistoryResponse keeps bounded receipt history metadata", () => {
  const response = normalizeOperatorRuntimeRemediationHistoryResponse({
    entries: [
      {
        ok: true,
        action: "issue_cleanup_receipt",
        receipt_id: "receipt_1",
        lifecycle_status: "completed",
        issued_at: "2026-08-28T10:00:00Z",
        execution_mode: "manual_operator_shell",
        approval_required: true,
        summary: "Execute bounded cleanup before trusting runtime pressure state.",
        command: "./scripts/oracle-prune-operational-history.ps1 -Apply",
        source: "artifacts/production-go-no-go-current/production-go-no-go.json",
        guidance_status: "no_go",
      },
      {
        bogus: true,
      },
    ],
    retention: {
      max_event_age_days: 30,
      max_event_rows_per_user: 100,
      rollover_behavior: "oldest_receipts_pruned_first_after_manual_issue",
    },
  });

  assert.equal(response.entries.length, 1);
  assert.equal(response.entries[0]?.receipt_id, "receipt_1");
  assert.equal(response.entries[0]?.lifecycle_status, "completed");
  assert.equal(response.retention?.max_event_age_days, 30);
  assert.equal(response.retention?.max_event_rows_per_user, 100);
  assert.equal(response.retention?.rollover_behavior, "oldest_receipts_pruned_first_after_manual_issue");
});

test("normalizeOperatorUserDetail keeps bounded support history and valid session rows", () => {
  const detail = normalizeOperatorUserDetail({
    user_id: "user-1",
    email: "user@example.com",
    display_name: "User One",
    auth_provider: "password",
    created_at: "2026-08-15T08:00:00Z",
    account_status: "suspended",
    account_status_reason: "abuse review",
    support_access: {
      status: "active",
      access_scope: "runtime_debug",
      support_disabled_by_default: true,
      granted_at: "2026-08-15T07:00:00Z",
      expires_at: "2026-08-15T08:00:00Z",
    },
    support_access_history: [
      {
        id: "grant-1",
        status: "active",
        access_scope: "runtime_debug",
        granted_at: "2026-08-15T07:00:00Z",
        expires_at: "2026-08-15T08:00:00Z",
      },
      {
        status: "bad-row",
      },
    ],
    sessions: [
      {
        session_ref: "sess-1",
        token_preview: "abcd...wxyz",
        created_at: "2026-08-15T07:10:00Z",
        expires_at: "2026-09-14T07:10:00Z",
        current: false,
      },
      {
        token_preview: "missing-ref",
      },
    ],
  });

  assert.equal(detail.user_id, "user-1");
  assert.equal(detail.account_status, "suspended");
  assert.equal(detail.account_status_reason, "abuse review");
  assert.equal(detail.support_access?.status, "active");
  assert.equal(detail.support_access_history.length, 1);
  assert.equal(detail.support_access_history[0]?.id, "grant-1");
  assert.equal(detail.sessions.length, 1);
  assert.equal(detail.sessions[0]?.session_ref, "sess-1");
});
