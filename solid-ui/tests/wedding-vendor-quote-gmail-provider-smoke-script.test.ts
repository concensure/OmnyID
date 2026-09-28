// @locs-version: 1.0
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  loadWeddingVendorQuoteGmailProviderSmokeEnv,
  runWeddingVendorQuoteGmailProviderSmoke,
  weddingVendorQuoteGmailProviderSmokeRecordOutput,
  weddingVendorQuoteGmailProviderSmokeEnvTemplate,
  weddingVendorQuoteGmailProviderSmokeUsage,
} from "../scripts/verify-wedding-vendor-quote-gmail-provider.mjs";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const env = {
  OMNYID_API_BASE: "https://api.omnyid.example",
  OMNYID_SESSION_TOKEN: "session-token-value-123",
  OMNYID_GMAIL_SMOKE_TO: "hello@chloes.example",
  OMNYID_GMAIL_SMOKE_SUBJECT: "Floral quote",
  OMNYID_GMAIL_SMOKE_TEXT: "Thanks Chloe.",
  OMNYID_GMAIL_SMOKE_THREAD_ID: "wedding-vendor-quote-plan-1-workspace-1-chloes-florals",
  OMNYID_GMAIL_SMOKE_NOW_ISO: "2026-09-27T10:00:00.000Z",
};

test("Gmail provider smoke script exposes credential-safe operator help", () => {
  const usage = weddingVendorQuoteGmailProviderSmokeUsage();
  const template = weddingVendorQuoteGmailProviderSmokeEnvTemplate();

  assert.match(usage, /OMNYID_API_BASE/);
  assert.match(usage, /OMNYID_HOMESERVER_URL/);
  assert.match(usage, /OMNYID_SESSION_TOKEN/);
  assert.match(usage, /OMNYID_VERIFY_SESSION_TOKEN/);
  assert.match(usage, /OMNYID_VERIFY_EMAIL/);
  assert.match(usage, /OMNYID_VERIFY_PASSWORD/);
  assert.match(usage, /verification_record_json/);
  assert.match(usage, /printed from= value/);
  assert.match(usage, /--print-env-template/);
  assert.match(usage, /--env-file <path>/);
  assert.match(template, /\$env:OMNYID_API_BASE/);
  assert.match(template, /OMNYID_HOMESERVER_URL/);
  assert.match(template, /OMNYID_VERIFY_EMAIL/);
  assert.match(template, /npm run verify:wedding-vendor-quote:gmail/);
  assert.equal(template.includes("session-token"), false);
});

test("Gmail provider smoke script loads missing values from dotenv without overriding shell env", () => {
  const dir = mkdtempSync(join(tmpdir(), "omnyid-gmail-smoke-env-"));
  const envPath = join(dir, ".env");
  writeFileSync(envPath, [
    "OMNYID_HOMESERVER_URL=https://api.from-dotenv.example",
    "OMNYID_SESSION_TOKEN=dotenv-token-12345",
    "OMNYID_GMAIL_SMOKE_TO=dotenv@vendor.example",
    "OMNYID_GMAIL_SMOKE_SUBJECT='Dotenv quote follow-up'",
    "OMNYID_GMAIL_SMOKE_TEXT=\"Dotenv smoke verification message.\"",
  ].join("\n"));

  const loaded = loadWeddingVendorQuoteGmailProviderSmokeEnv(
    {
      OMNYID_SESSION_TOKEN: "shell-token-12345",
      OMNYID_GMAIL_SMOKE_TO: "",
    },
    ["--env-file", envPath],
    dir,
  );

  assert.equal(loaded.OMNYID_HOMESERVER_URL, "https://api.from-dotenv.example");
  assert.equal(loaded.OMNYID_SESSION_TOKEN, "shell-token-12345");
  assert.equal(loaded.OMNYID_GMAIL_SMOKE_TO, "dotenv@vendor.example");
  assert.equal(loaded.OMNYID_GMAIL_SMOKE_SUBJECT, "Dotenv quote follow-up");
  assert.equal(loaded.OMNYID_GMAIL_SMOKE_TEXT, "Dotenv smoke verification message.");
});

test("Gmail provider smoke script accepts OMNYID_HOMESERVER_URL as API base fallback", async () => {
  const seen: string[] = [];
  const fetchImpl = async (url: string | URL | Request) => {
    seen.push(String(url));
    if (String(url).endsWith("/integrations/gmail/status")) {
      return jsonResponse({
        connected: true,
        gmail_email: "concensure@gmail.com",
        token_expired: false,
      });
    }
    return jsonResponse({
      ok: true,
      sent: true,
      message_id: "gmail-message-homeserver-123",
    });
  };

  const record = await runWeddingVendorQuoteGmailProviderSmoke({
    ...env,
    OMNYID_API_BASE: "",
    OMNYID_HOMESERVER_URL: "https://homeserver.omnyid.example",
  }, fetchImpl);

  assert.deepEqual(seen, [
    "https://homeserver.omnyid.example/integrations/gmail/status",
    "https://homeserver.omnyid.example/integrations/gmail/send-draft",
  ]);
  assert.equal(record.provider_message_id, "gmail-message-homeserver-123");
});

test("Gmail provider smoke script calls integration routes and returns structured release proof", async () => {
  const seen: Array<{
    url: string;
    method?: string;
    authorization?: string;
    body: Record<string, unknown> | null;
  }> = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string> | undefined;
    seen.push({
      url: String(url),
      method: init?.method,
      authorization: headers?.Authorization,
      body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null,
    });
    if (String(url).endsWith("/integrations/gmail/status")) {
      return jsonResponse({
        connected: true,
        gmail_email: "admin@omnyid.com",
        token_expired: false,
      });
    }
    return jsonResponse({
      ok: true,
      sent: true,
      message_id: "gmail-message-quote-123",
      client_message_id: "local-gmail-quote-123",
      draft_message_id: "draft-gmail-quote-123",
    });
  };

  const record = await runWeddingVendorQuoteGmailProviderSmoke(env, fetchImpl);

  assert.deepEqual(seen.map((item) => item.url), [
    "https://api.omnyid.example/integrations/gmail/status",
    "https://api.omnyid.example/integrations/gmail/send-draft",
  ]);
  assert.equal(seen[0]?.authorization, "Bearer session-token-value-123");
  assert.equal(seen[1]?.body?.to, "hello@chloes.example");
  assert.equal(seen[1]?.body?.html, "<p>Thanks Chloe.</p>");
  assert.equal(seen[1]?.body?.thread_id, "wedding-vendor-quote-plan-1-workspace-1-chloes-florals");
  assert.equal(record.verification_kind, "omnyid_live_gmail_provider_send");
  assert.equal(record.provider, "gmail");
  assert.equal(record.provider_message_id, "gmail-message-quote-123");
  assert.equal(record.actual_connected_provider_proof_ref, "gmail:prod-smoke:2026-09-27:gmail-message-quote-123");
});

test("Gmail provider smoke script can log in for a session token before provider checks", async () => {
  const calls: Array<{
    path: string;
    method?: string;
    authorization?: string;
    body: Record<string, unknown> | null;
  }> = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    const headers = init?.headers as Record<string, string> | undefined;
    calls.push({
      path,
      method: init?.method,
      authorization: headers?.Authorization,
      body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null,
    });
    if (path === "/auth/login") {
      return jsonResponse({ token: "login-session-token-12345" });
    }
    if (path === "/integrations/gmail/status") {
      return jsonResponse({
        connected: true,
        gmail_email: "concensure@gmail.com",
        token_expired: false,
      });
    }
    return jsonResponse({
      ok: true,
      sent: true,
      message_id: "gmail-message-login-123",
    });
  };

  const record = await runWeddingVendorQuoteGmailProviderSmoke({
    ...env,
    OMNYID_SESSION_TOKEN: "",
    OMNYID_AUTH_TOKEN: "",
    OMNYID_VERIFY_EMAIL: "concensure@gmail.com",
    OMNYID_VERIFY_PASSWORD: "real-password-123",
  }, fetchImpl);

  assert.deepEqual(calls.map((call) => call.path), [
    "/auth/login",
    "/integrations/gmail/status",
    "/integrations/gmail/send-draft",
  ]);
  assert.deepEqual(calls[0]?.body, {
    email: "concensure@gmail.com",
    password: "real-password-123",
  });
  assert.equal(calls[1]?.authorization, "Bearer login-session-token-12345");
  assert.equal(record.provider_message_id, "gmail-message-login-123");
});

test("Gmail provider smoke script prints the actual connected Gmail sender for readiness expectations", async () => {
  const fetchImpl = async (url: string | URL | Request) => {
    if (String(url).endsWith("/integrations/gmail/status")) {
      return jsonResponse({
        connected: true,
        gmail_email: "concensure@gmail.com",
        token_expired: false,
      });
    }
    return jsonResponse({
      ok: true,
      sent: true,
      message_id: "gmail-message-concensure-123",
      client_message_id: "local-gmail-concensure-123",
    });
  };

  const record = await runWeddingVendorQuoteGmailProviderSmoke(env, fetchImpl);
  const output = weddingVendorQuoteGmailProviderSmokeRecordOutput(record);

  assert.equal(record.from, "concensure@gmail.com");
  assert.match(output, /^from=concensure@gmail\.com$/m);
  assert.match(output, /^provider_message_id=gmail-message-concensure-123$/m);
  assert.match(output, /^verification_record_json=/m);
  assert.doesNotMatch(output, /from=admin@omnyid\.com/);
});

test("Gmail provider smoke script rejects malformed or insecure API bases before calling the provider", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse({});
  };

  await assert.rejects(
    () => runWeddingVendorQuoteGmailProviderSmoke({ ...env, OMNYID_API_BASE: "not a url" }, fetchImpl),
    /valid URL/i,
  );
  await assert.rejects(
    () => runWeddingVendorQuoteGmailProviderSmoke({ ...env, OMNYID_API_BASE: "http://localhost:8787" }, fetchImpl),
    /must use https/i,
  );
  await assert.rejects(
    () => runWeddingVendorQuoteGmailProviderSmoke({ ...env, OMNYID_API_BASE: "", OMNYID_HOMESERVER_URL: "" }, fetchImpl),
    /OMNYID_API_BASE|OMNYID_HOMESERVER_URL/i,
  );
  assert.equal(calls, 0);
});

test("Gmail provider smoke script rejects missing or placeholder tokens before calling the provider", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse({});
  };

  for (const patch of [
    { OMNYID_SESSION_TOKEN: "", OMNYID_AUTH_TOKEN: "" },
    { OMNYID_SESSION_TOKEN: "...", OMNYID_AUTH_TOKEN: "" },
    { OMNYID_SESSION_TOKEN: "session-token", OMNYID_AUTH_TOKEN: "" },
    { OMNYID_SESSION_TOKEN: "short", OMNYID_AUTH_TOKEN: "" },
    { OMNYID_SESSION_TOKEN: "token with spaces", OMNYID_AUTH_TOKEN: "" },
  ]) {
    await assert.rejects(
      () => runWeddingVendorQuoteGmailProviderSmoke({ ...env, ...patch }, fetchImpl),
      /OMNYID_SESSION_TOKEN|OMNYID_AUTH_TOKEN|real bearer token/i,
  );
  }

  assert.equal(calls, 0);
});

test("Gmail provider smoke script rejects incomplete or placeholder login credentials before provider checks", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse({});
  };

  for (const patch of [
    { OMNYID_SESSION_TOKEN: "", OMNYID_VERIFY_EMAIL: "concensure@gmail.com", OMNYID_VERIFY_PASSWORD: "" },
    { OMNYID_SESSION_TOKEN: "", OMNYID_VERIFY_EMAIL: "", OMNYID_VERIFY_PASSWORD: "real-password-123" },
    { OMNYID_SESSION_TOKEN: "", OMNYID_VERIFY_EMAIL: "test@example.com", OMNYID_VERIFY_PASSWORD: "real-password-123" },
    { OMNYID_SESSION_TOKEN: "", OMNYID_VERIFY_EMAIL: "concensure@gmail.com", OMNYID_VERIFY_PASSWORD: "password" },
  ]) {
    await assert.rejects(
      () => runWeddingVendorQuoteGmailProviderSmoke({
        ...env,
        OMNYID_AUTH_TOKEN: "",
        OMNYID_VERIFY_SESSION_TOKEN: "",
        ...patch,
      }, fetchImpl),
      /OMNYID_VERIFY_EMAIL|OMNYID_LOGIN_EMAIL|OMNYID_VERIFY_PASSWORD|OMNYID_LOGIN_PASSWORD|provide OMNYID_SESSION_TOKEN/i,
    );
  }

  assert.equal(calls, 0);
});

test("Gmail provider smoke script rejects login responses without session tokens before Gmail checks", async () => {
  const calls: string[] = [];
  const fetchImpl = async (url: string | URL | Request) => {
    calls.push(new URL(String(url)).pathname);
    return jsonResponse({ ok: true });
  };

  await assert.rejects(
    () => runWeddingVendorQuoteGmailProviderSmoke({
      ...env,
      OMNYID_SESSION_TOKEN: "",
      OMNYID_AUTH_TOKEN: "",
      OMNYID_VERIFY_EMAIL: "concensure@gmail.com",
      OMNYID_VERIFY_PASSWORD: "real-password-123",
    }, fetchImpl),
    /did not return a session token/i,
  );

  assert.deepEqual(calls, ["/auth/login"]);
});

test("Gmail provider smoke script allows explicit insecure API base override for local debugging", async () => {
  const seen: string[] = [];
  const fetchImpl = async (url: string | URL | Request) => {
    seen.push(String(url));
    if (String(url).endsWith("/integrations/gmail/status")) {
      return jsonResponse({
        connected: true,
        gmail_email: "admin@omnyid.com",
        token_expired: false,
      });
    }
    return jsonResponse({
      ok: true,
      sent: true,
      message_id: "gmail-message-local-debug-123",
    });
  };

  const record = await runWeddingVendorQuoteGmailProviderSmoke({
    ...env,
    OMNYID_API_BASE: "http://localhost:8787/api/",
    OMNYID_ALLOW_INSECURE_GMAIL_SMOKE_API_BASE: "true",
  }, fetchImpl);

  assert.deepEqual(seen, [
    "http://localhost:8787/integrations/gmail/status",
    "http://localhost:8787/integrations/gmail/send-draft",
  ]);
  assert.equal(record.provider_message_id, "gmail-message-local-debug-123");
});

test("Gmail provider smoke script rejects unsafe smoke recipients before calling the provider", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse({});
  };

  for (const recipient of [
    "...",
    "test@example.com",
    "vendor@example.com",
    "hello@chloes.example,planner@example.com",
    "hello@chloes.example planner@example.com",
    "not-an-email",
  ]) {
    await assert.rejects(
      () => runWeddingVendorQuoteGmailProviderSmoke({ ...env, OMNYID_GMAIL_SMOKE_TO: recipient }, fetchImpl),
      /exactly one real email address/i,
    );
  }

  assert.equal(calls, 0);
});

test("Gmail provider smoke script rejects unusable subject and thread ids before calling the provider", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse({});
  };

  for (const patch of [
    { OMNYID_GMAIL_SMOKE_SUBJECT: "..." },
    { OMNYID_GMAIL_SMOKE_SUBJECT: "test subject" },
    { OMNYID_GMAIL_SMOKE_SUBJECT: "x".repeat(181) },
    { OMNYID_GMAIL_SMOKE_THREAD_ID: "..." },
    { OMNYID_GMAIL_SMOKE_THREAD_ID: "test-thread" },
    { OMNYID_GMAIL_SMOKE_THREAD_ID: "bad thread id" },
  ]) {
    await assert.rejects(
      () => runWeddingVendorQuoteGmailProviderSmoke({ ...env, ...patch }, fetchImpl),
      /OMNYID_GMAIL_SMOKE_(?:SUBJECT|THREAD_ID)/,
    );
  }

  assert.equal(calls, 0);
});

test("Gmail provider smoke script rejects unusable message bodies before calling the provider", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse({});
  };

  for (const patch of [
    { OMNYID_GMAIL_SMOKE_TEXT: "..." },
    { OMNYID_GMAIL_SMOKE_TEXT: "test" },
    { OMNYID_GMAIL_SMOKE_TEXT: "too short" },
    { OMNYID_GMAIL_SMOKE_TEXT: "x".repeat(4001) },
    { OMNYID_GMAIL_SMOKE_HTML: "..." },
    { OMNYID_GMAIL_SMOKE_HTML: "<p>test</p>" },
    { OMNYID_GMAIL_SMOKE_HTML: "x".repeat(8001) },
  ]) {
    await assert.rejects(
      () => runWeddingVendorQuoteGmailProviderSmoke({ ...env, ...patch }, fetchImpl),
      /OMNYID_GMAIL_SMOKE_(?:TEXT|HTML)/,
    );
  }

  assert.equal(calls, 0);
});

test("Gmail provider smoke script escapes default HTML generated from smoke text", async () => {
  const seen: Array<Record<string, unknown> | null> = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    seen.push(init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null);
    if (String(url).endsWith("/integrations/gmail/status")) {
      return jsonResponse({
        connected: true,
        gmail_email: "admin@omnyid.com",
        token_expired: false,
      });
    }
    return jsonResponse({
      ok: true,
      sent: true,
      message_id: "gmail-message-escaped-html-123",
    });
  };

  await runWeddingVendorQuoteGmailProviderSmoke({
    ...env,
    OMNYID_GMAIL_SMOKE_TEXT: "Thanks <Chloe> & team.",
    OMNYID_GMAIL_SMOKE_HTML: "",
  }, fetchImpl);

  assert.equal(seen[1]?.html, "<p>Thanks &lt;Chloe&gt; &amp; team.</p>");
});

test("Gmail provider smoke script rejects malformed smoke timestamps before calling the provider", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse({});
  };

  for (const nowIso of ["...", "2026-09-27", "not-a-date", "27 Sep 2026"]) {
    await assert.rejects(
      () => runWeddingVendorQuoteGmailProviderSmoke({ ...env, OMNYID_GMAIL_SMOKE_NOW_ISO: nowIso }, fetchImpl),
      /OMNYID_GMAIL_SMOKE_NOW_ISO/i,
    );
  }

  assert.equal(calls, 0);
});

test("Gmail provider smoke script normalizes smoke timestamps to canonical UTC ISO", async () => {
  const fetchImpl = async (url: string | URL | Request) => {
    if (String(url).endsWith("/integrations/gmail/status")) {
      return jsonResponse({
        connected: true,
        gmail_email: "admin@omnyid.com",
        token_expired: false,
      });
    }
    return jsonResponse({
      ok: true,
      sent: true,
      message_id: "gmail-message-timestamp-123",
    });
  };

  const record = await runWeddingVendorQuoteGmailProviderSmoke({
    ...env,
    OMNYID_GMAIL_SMOKE_NOW_ISO: "2026-09-27T20:00:00+10:00",
  }, fetchImpl);

  assert.equal(record.verified_at, "2026-09-27T10:00:00.000Z");
  assert.equal(record.actual_connected_provider_proof_ref, "gmail:prod-smoke:2026-09-27:gmail-message-timestamp-123");
});

test("Gmail provider smoke script generates acceptable default subject and thread id", async () => {
  const seen: Array<Record<string, unknown> | null> = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    seen.push(init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null);
    if (String(url).endsWith("/integrations/gmail/status")) {
      return jsonResponse({
        connected: true,
        gmail_email: "admin@omnyid.com",
        token_expired: false,
      });
    }
    return jsonResponse({
      ok: true,
      sent: true,
      message_id: "gmail-message-defaults-123",
    });
  };

  const record = await runWeddingVendorQuoteGmailProviderSmoke({
    ...env,
    OMNYID_GMAIL_SMOKE_SUBJECT: "",
    OMNYID_GMAIL_SMOKE_THREAD_ID: "",
  }, fetchImpl);

  assert.match(String(seen[1]?.subject), /OmnyID Gmail provider verification/);
  assert.match(String(seen[1]?.thread_id), /^wedding-vendor-quote-live-smoke-/);
  assert.equal(record.provider_message_id, "gmail-message-defaults-123");
});

test("Gmail provider smoke script fails before send when Gmail is disconnected", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse({
      connected: false,
      gmail_email: "",
      token_expired: false,
    });
  };

  await assert.rejects(
    () => runWeddingVendorQuoteGmailProviderSmoke(env, fetchImpl),
    /Gmail is not connected/i,
  );
  assert.equal(calls, 1);
});

test("Gmail provider smoke script fails before send when connected sender is missing or malformed", async () => {
  let calls = 0;
  const fetchImpl = async (_url: string | URL | Request, _init?: RequestInit, sender = "") => {
    calls += 1;
    return jsonResponse({
      connected: true,
      gmail_email: sender,
      token_expired: false,
    });
  };

  for (const sender of ["", "...", "test@example.com", "admin@omnyid.com,other@example.com", "not-an-email"]) {
    const before = calls;
    await assert.rejects(
      () => runWeddingVendorQuoteGmailProviderSmoke(
        env,
        (url, init) => fetchImpl(url, init, sender),
      ),
      /real connected sender email address/i,
    );
    assert.equal(calls, before + 1);
  }
});

test("Gmail provider smoke script rejects sends without durable provider message ids", async () => {
  let calls = 0;
  const fetchImpl = async (url: string | URL | Request) => {
    calls += 1;
    if (String(url).endsWith("/integrations/gmail/status")) {
      return jsonResponse({
        connected: true,
        gmail_email: "admin@omnyid.com",
        token_expired: false,
      });
    }
    return jsonResponse({
      ok: true,
      sent: true,
      message: "Accepted, but no message id was returned.",
    });
  };

  await assert.rejects(
    () => runWeddingVendorQuoteGmailProviderSmoke(env, fetchImpl),
    /Accepted, but no message id was returned/i,
  );
  assert.equal(calls, 2);
});
