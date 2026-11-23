import test from "node:test";
import assert from "node:assert/strict";

import {
  isWorkspaceCalendarSetupComplete,
  isWorkspaceGmailSetupComplete,
  isWorkspaceLlmSetupComplete,
  workspaceCalendarSetupPendingReason,
  workspaceGmailSetupPendingReason,
  workspaceLlmSetupErrorPendingReason,
  workspaceLlmSetupPendingReason,
} from "../src/lib/workspaceSetupState.ts";
import type { LlmConfig } from "../src/lib/api";

function llmConfig(overrides: Partial<LlmConfig>): LlmConfig {
  return {
    id: "cfg_01",
    backend: "hosted",
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    ollama_url: null,
    monthly_budget_cents: 0,
    usage_cents_current_month: 0,
    inference_ready: false,
    ...overrides,
  };
}

test("isWorkspaceLlmSetupComplete keeps hosted config incomplete while hosted budget is zero", () => {
  const config = llmConfig({
    backend: "hosted",
    monthly_budget_cents: 0,
  });
  assert.equal(
    isWorkspaceLlmSetupComplete(config),
    false,
  );
  assert.equal(
    workspaceLlmSetupPendingReason(config),
    "Hosted AI is still disabled. Set a hosted budget or switch to BYOK/Ollama.",
  );
});

test("isWorkspaceLlmSetupComplete accepts hosted config once hosted budget is enabled", () => {
  const config = llmConfig({
    backend: "hosted",
    monthly_budget_cents: 900,
    inference_ready: true,
  });
  assert.equal(
    isWorkspaceLlmSetupComplete(config),
    true,
  );
  assert.equal(workspaceLlmSetupPendingReason(config), null);
});

test("isWorkspaceLlmSetupComplete accepts non-hosted backends without a hosted budget", () => {
  const byok = llmConfig({
    backend: "byok",
    monthly_budget_cents: 0,
    inference_ready: true,
  });
  const ollama = llmConfig({
    backend: "ollama",
    monthly_budget_cents: 0,
    inference_ready: true,
  });
  assert.equal(isWorkspaceLlmSetupComplete(byok), true);
  assert.equal(isWorkspaceLlmSetupComplete(ollama), true);
  assert.equal(workspaceLlmSetupPendingReason(byok), null);
  assert.equal(workspaceLlmSetupPendingReason(ollama), null);
});

test("isWorkspaceLlmSetupComplete rejects a saved BYOK model without usable credentials", () => {
  const config = llmConfig({ backend: "byok", model: "Qwen 3 235B Instruct", inference_ready: false });
  assert.equal(isWorkspaceLlmSetupComplete(config), false);
  assert.match(workspaceLlmSetupPendingReason(config) ?? "", /no usable API key/i);
});

test("workspaceLlmSetupPendingReason treats missing config as setup work, not verification failure", () => {
  assert.match(
    workspaceLlmSetupPendingReason(null) ?? "",
    /No AI model is connected/i,
  );
  assert.match(
    workspaceLlmSetupErrorPendingReason(new Error("no LLM config; call POST /agent/provision first")) ?? "",
    /No AI model is connected/i,
  );
  assert.equal(workspaceLlmSetupErrorPendingReason(new Error("service unavailable")), null);
});

test("isWorkspaceGmailSetupComplete requires a healthy non-expiring connection", () => {
  assert.equal(
    isWorkspaceGmailSetupComplete({
      connected: true,
      gmail_email: "alex@example.com",
      configured: true,
      token_expired: false,
      expires_within_24h: false,
    }),
    true,
  );
  assert.equal(
    isWorkspaceGmailSetupComplete({
      connected: true,
      gmail_email: "alex@example.com",
      configured: true,
      token_expired: true,
      expires_within_24h: false,
    }),
    false,
  );
  assert.equal(
    isWorkspaceGmailSetupComplete({
      connected: true,
      gmail_email: "alex@example.com",
      configured: true,
      token_expired: false,
      expires_within_24h: true,
    }),
    false,
  );
});

test("workspaceGmailSetupPendingReason distinguishes disconnected expired and expiring states", () => {
  assert.match(
    workspaceGmailSetupPendingReason({ connected: false, gmail_email: "", configured: true }) ?? "",
    /Connect Gmail/i,
  );
  assert.match(
    workspaceGmailSetupPendingReason({
      connected: true,
      gmail_email: "alex@example.com",
      configured: true,
      token_expired: true,
      expires_within_24h: false,
    }) ?? "",
    /token has expired/i,
  );
  assert.match(
    workspaceGmailSetupPendingReason({
      connected: true,
      gmail_email: "alex@example.com",
      configured: true,
      token_expired: false,
      expires_within_24h: true,
    }) ?? "",
    /expires soon/i,
  );
});

test("isWorkspaceCalendarSetupComplete requires a connected, non-expired token", () => {
  assert.equal(
    isWorkspaceCalendarSetupComplete({
      connected: true,
      google_email: "alex@example.com",
      configured: true,
      token_expired: false,
    }),
    true,
  );
  assert.equal(
    isWorkspaceCalendarSetupComplete({
      connected: true,
      google_email: "alex@example.com",
      configured: true,
      token_expired: true,
    }),
    false,
  );
  assert.equal(isWorkspaceCalendarSetupComplete(null), false);
});

test("workspaceCalendarSetupPendingReason distinguishes disconnected, expired, and expiring states", () => {
  assert.match(
    workspaceCalendarSetupPendingReason({ connected: false, google_email: "", configured: true }) ?? "",
    /Connect Google Calendar/i,
  );
  assert.match(
    workspaceCalendarSetupPendingReason({
      connected: true,
      google_email: "alex@example.com",
      configured: true,
      token_expired: true,
    }) ?? "",
    /token has expired/i,
  );
  assert.match(
    workspaceCalendarSetupPendingReason({
      connected: true,
      google_email: "alex@example.com",
      configured: true,
      token_expired: false,
      expires_within_24h: true,
    }) ?? "",
    /expires soon/i,
  );
  assert.equal(
    workspaceCalendarSetupPendingReason({
      connected: true,
      google_email: "alex@example.com",
      configured: true,
      token_expired: false,
      expires_within_24h: false,
    }),
    null,
  );
});
