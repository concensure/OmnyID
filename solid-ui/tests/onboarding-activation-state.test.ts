import test from "node:test";
import assert from "node:assert/strict";

import { buildOnboardingActivationItems, onboardingActivationSummary } from "../src/lib/onboardingActivationState.ts";

test("onboarding activation marks llm as required until workspace ai is truly usable", () => {
  const items = buildOnboardingActivationItems(
    {
      backend: "hosted",
      model: "omnyid-default",
      monthly_budget_cents: 0,
    },
    { connected: false, gmail_email: "", configured: true },
  );
  assert.equal(items[0].id, "llm");
  assert.equal(items[0].ready, false);
  assert.equal(items[0].statusLabel, "Required");
  assert.match(items[0].detail, /Hosted AI is still disabled/i);
  assert.equal(items[1].ready, false);
  assert.equal(
    onboardingActivationSummary(
      { backend: "hosted", model: "omnyid-default", monthly_budget_cents: 0 },
      { connected: false, gmail_email: "", configured: true },
    ),
    "Your preferences are saved, but the agent still needs an AI model before it can respond properly.",
  );
});

test("onboarding activation treats non-hosted llm config as ready and gmail as recommended", () => {
  const items = buildOnboardingActivationItems(
    {
      backend: "openai",
      model: "gpt-4.1-mini",
      monthly_budget_cents: 0,
    },
    { connected: false, gmail_email: "", configured: true },
  );
  assert.equal(items[0].ready, true);
  assert.equal(items[0].statusLabel, "Connected");
  assert.equal(items[1].statusLabel, "Recommended");
  assert.equal(
    onboardingActivationSummary(
      { backend: "openai", model: "gpt-4.1-mini", monthly_budget_cents: 0 },
      { connected: false, gmail_email: "", configured: true },
    ),
    "Your agent can respond now. Connect Gmail next if you want inbox triage and email context.",
  );
});

test("onboarding activation reports fully ready when llm and gmail are connected", () => {
  const items = buildOnboardingActivationItems(
    {
      backend: "ollama",
      model: "llama3.2",
      monthly_budget_cents: 0,
      ollama_url: "http://localhost:11434",
    },
    {
      connected: true,
      gmail_email: "alex@example.com",
      configured: true,
      token_expired: false,
      expires_within_24h: false,
    },
  );
  assert.equal(items.every((item) => item.ready), true);
  assert.equal(
    onboardingActivationSummary(
      {
        backend: "ollama",
        model: "llama3.2",
        monthly_budget_cents: 0,
        ollama_url: "http://localhost:11434",
      },
      {
        connected: true,
        gmail_email: "alex@example.com",
        configured: true,
        token_expired: false,
        expires_within_24h: false,
      },
    ),
    "Your core setup is ready. You can move into the workspace and start using the agent.",
  );
});

test("onboarding activation warns when gmail is connected but expiring soon", () => {
  const items = buildOnboardingActivationItems(
    {
      backend: "openai",
      model: "gpt-4.1-mini",
      monthly_budget_cents: 0,
    },
    {
      connected: true,
      gmail_email: "alex@example.com",
      configured: true,
      token_expired: false,
      expires_within_24h: true,
    },
  );
  assert.equal(items[1].ready, false);
  assert.equal(items[1].statusLabel, "Reconnect soon");
  assert.match(items[1].detail, /expires soon/i);
  assert.equal(
    onboardingActivationSummary(
      { backend: "openai", model: "gpt-4.1-mini", monthly_budget_cents: 0 },
      {
        connected: true,
        gmail_email: "alex@example.com",
        configured: true,
        token_expired: false,
        expires_within_24h: true,
      },
    ),
    "Your agent can respond now. Reconnect Gmail soon so inbox triage and reply actions do not fail.",
  );
});
