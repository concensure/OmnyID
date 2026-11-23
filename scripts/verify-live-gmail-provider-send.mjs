#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const CONFIRMATION = "admin-to-concensure";
const DEFAULT_TO = "concensure@gmail.com";
const DEFAULT_EXPECTED_FROM = "admin@omnyid.com";
const STATUS_PATHS = ["/integrations/gmail/status", "/gmail/status"];
const OAUTH_URL_PATHS = ["/integrations/gmail/oauth-url", "/gmail/connect-url"];

function usageText() {
  return [
    "OmnyID live Gmail provider send verifier",
    "",
    "This script sends a real email only when OMNYID_CONFIRM_LIVE_GMAIL_SEND=admin-to-concensure.",
    "",
    "Required:",
    "  OMNYID_VERIFY_API_BASE=https://api.omnyid.com",
    "  OMNYID_CONFIRM_LIVE_GMAIL_SEND=admin-to-concensure",
    "",
    "Authentication, choose one:",
    "  OMNYID_VERIFY_SESSION_TOKEN=<bearer session token>",
    "  or OMNYID_VERIFY_EMAIL=<login email> and OMNYID_VERIFY_PASSWORD=<login password>",
    "",
    "Optional smoke-test expectations:",
    "  OMNYID_VERIFY_GMAIL_FROM=admin@omnyid.com",
    "  OMNYID_VERIFY_GMAIL_TO=concensure@gmail.com",
    "  OMNYID_VERIFY_GMAIL_ID=<stable verification id>",
    "  OMNYID_VERIFY_OUTPUT_PATH=./wedding-gmail-verification.json",
    "",
    "Run:",
    "  cd C:\\Users\\ozans\\Desktop\\projects\\OmnyID",
    "  node scripts/verify-live-gmail-provider-send.mjs",
    "",
    "From any folder on this Windows machine:",
    "  node C:\\Users\\ozans\\Desktop\\projects\\OmnyID\\scripts\\verify-live-gmail-provider-send.mjs",
  ].join("\n");
}

function printUsage(consoleLike = console) {
  consoleLike.log(usageText());
}

function env(name, envSource = process.env) {
  const value = envSource[name];
  return typeof value === "string" ? value.trim() : "";
}

function fail(message, consoleLike = console) {
  consoleLike.error(`[gmail-live-verify] ${message}`);
  return { ok: false, error: message };
}

function requireEnv(name, fallbackNames = [], envSource = process.env) {
  const names = [name, ...fallbackNames];
  for (const candidate of names) {
    const value = env(candidate, envSource);
    if (value) return value;
  }
  return "";
}

function joinUrl(base, path) {
  return `${base.replace(/\/+$/, "")}${path}`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
  })[char]);
}

async function requestJson(baseUrl, path, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const { fetchImpl: _fetchImpl, token, ...fetchOptions } = options;
  const response = await fetchImpl(joinUrl(baseUrl, path), {
    ...fetchOptions,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body = null;
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }
  }
  if (!response.ok) {
    const detail = body?.message ?? body?.error ?? body?.detail ?? text;
    throw new Error(`${path} failed with ${response.status}: ${detail}`);
  }
  return body ?? {};
}

async function tokenFromLogin(baseUrl, options = {}) {
  const envSource = options.envSource ?? process.env;
  const email = env("OMNYID_VERIFY_EMAIL", envSource) || env("OMNYID_LOGIN_EMAIL", envSource);
  const password = env("OMNYID_VERIFY_PASSWORD", envSource) || env("OMNYID_LOGIN_PASSWORD", envSource);
  if (!email && !password) return "";
  if (!email || !password) {
    throw new Error("set both OMNYID_VERIFY_EMAIL and OMNYID_VERIFY_PASSWORD, or provide OMNYID_VERIFY_SESSION_TOKEN");
  }
  const response = await requestJson(baseUrl, "/auth/login", {
    method: "POST",
    fetchImpl: options.fetchImpl,
    body: JSON.stringify({ email, password }),
  });
  if (typeof response.token !== "string" || !response.token.trim()) {
    throw new Error("/auth/login did not return a session token");
  }
  return response.token.trim();
}

function field(body, ...names) {
  for (const name of names) {
    const value = body?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function proofDateFromMs(nowMs) {
  const parsed = new Date(nowMs);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function liveProviderProofRef(providerMessageId, nowMs) {
  return `gmail:prod-smoke:${proofDateFromMs(nowMs)}:${providerMessageId}`;
}

async function gmailStatus(baseUrl, token, options = {}) {
  let lastError = null;
  for (const path of STATUS_PATHS) {
    try {
      const body = await requestJson(baseUrl, path, {
        token,
        fetchImpl: options.fetchImpl,
      });
      return { body, path };
    } catch (error) {
      lastError = error;
      if (!String(error?.message ?? "").includes(`${path} failed with 404`)) throw error;
    }
  }
  throw lastError ?? new Error("Gmail status route unavailable");
}

async function gmailOAuthUrl(baseUrl, token, options = {}) {
  let lastError = null;
  for (const path of OAUTH_URL_PATHS) {
    try {
      const body = await requestJson(baseUrl, path, {
        token,
        fetchImpl: options.fetchImpl,
      });
      return { url: field(body, "url", "oauth_url", "oauthUrl"), path };
    } catch (error) {
      lastError = error;
      if (!String(error?.message ?? "").includes(`${path} failed with 404`)) throw error;
    }
  }
  throw lastError ?? new Error("Gmail OAuth URL route unavailable");
}

async function disconnectedGmailError(baseUrl, token, statusResult, options = {}) {
  const configured = statusResult.body?.configured === true;
  const statusPath = statusResult.path;
  if (!configured) {
    return new Error(`Gmail status is not connected for the authenticated user, and Gmail OAuth is not fully configured on this server. status_route=${statusPath}`);
  }
  try {
    const oauth = await gmailOAuthUrl(baseUrl, token, options);
    const urlDetail = oauth.url ? ` Open this URL while signed in as the same OmnyID user: ${oauth.url}` : "";
    return new Error(`Gmail status is not connected for the authenticated user. status_route=${statusPath}; oauth_url_route=${oauth.path}.${urlDetail}`);
  } catch (error) {
    return new Error(`Gmail status is not connected for the authenticated user. status_route=${statusPath}; could not fetch Gmail OAuth URL: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function verificationRecord(result) {
  return {
    schema_version: 1,
    verification_kind: "omnyid_live_gmail_provider_send",
    ok: result.ok === true,
    from: result.from,
    to: result.to,
    subject: result.subject,
    thread_id: result.threadId,
    status_route: result.statusRoute,
    send_route: "/integrations/gmail/send-draft",
    provider: "gmail",
    provider_message_id: result.providerMessageId,
    client_message_id: result.clientMessageId,
    actual_connected_provider_proof_ref: result.proofRef,
    verified_at: result.verifiedAt,
  };
}

async function writeVerificationRecord(path, record) {
  const cleanPath = typeof path === "string" ? path.trim() : "";
  if (!cleanPath) return null;
  await mkdir(dirname(cleanPath), { recursive: true });
  await writeFile(cleanPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return cleanPath;
}

async function verifyLiveGmailProviderSend(options = {}) {
  const envSource = options.envSource ?? process.env;
  const consoleLike = options.consoleLike ?? console;
  const fetchImpl = options.fetchImpl ?? fetch;
  const nowMs = typeof options.nowMs === "number" ? options.nowMs : Date.now();

  if (env("OMNYID_CONFIRM_LIVE_GMAIL_SEND", envSource) !== CONFIRMATION) {
    return fail(`refusing live send; set OMNYID_CONFIRM_LIVE_GMAIL_SEND=${CONFIRMATION}`, consoleLike);
  }

  const baseUrl = requireEnv("OMNYID_VERIFY_API_BASE", ["OMNYID_E2E_API_BASE", "OMNYID_API_BASE"], envSource);
  if (!baseUrl) {
    return fail("missing OMNYID_VERIFY_API_BASE or OMNYID_E2E_API_BASE or OMNYID_API_BASE", consoleLike);
  }

  const token =
    env("OMNYID_VERIFY_SESSION_TOKEN", envSource) ||
    env("OMNYID_E2E_SESSION_TOKEN", envSource) ||
    env("OMNYID_SESSION_TOKEN", envSource) ||
    (await tokenFromLogin(baseUrl, { envSource, fetchImpl }));
  if (!token) {
    return fail("missing OMNYID_VERIFY_SESSION_TOKEN, OMNYID_E2E_SESSION_TOKEN, OMNYID_SESSION_TOKEN, or login credentials", consoleLike);
  }

  const expectedFrom = env("OMNYID_VERIFY_GMAIL_FROM", envSource) || DEFAULT_EXPECTED_FROM;
  const to = env("OMNYID_VERIFY_GMAIL_TO", envSource) || DEFAULT_TO;
  const verificationId = env("OMNYID_VERIFY_GMAIL_ID", envSource) || `omnyid-live-gmail-${nowMs}`;
  const statusResult = await gmailStatus(baseUrl, token, { fetchImpl });
  const status = statusResult.body;
  if (status.connected !== true) {
    throw await disconnectedGmailError(baseUrl, token, statusResult, { fetchImpl });
  }
  if (status.configured !== true) {
    throw new Error("Gmail OAuth is not fully configured on this server");
  }
  const connectedFrom = field(status, "gmail_email", "gmailEmail");
  if (connectedFrom.toLowerCase() !== expectedFrom.toLowerCase()) {
    throw new Error(`authenticated Gmail is ${connectedFrom || "unknown"}, expected smoke-test sender ${expectedFrom}`);
  }

  const subject = `OmnyID Gmail provider verification - ${verificationId}`;
  const threadId = `wedding_vendor_quote:live-provider-verification:${verificationId}`;
  const text = [
    "Real OmnyID connected-provider Gmail verification.",
    `Verification id: ${verificationId}`,
    `Expected smoke-test sender: ${expectedFrom}`,
    `Recipient: ${to}`,
    "Route: /integrations/gmail/send-draft",
  ].join("\n");
  const html = text
    .split("\n")
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");

  const sendResult = await requestJson(baseUrl, "/integrations/gmail/send-draft", {
    method: "POST",
    token,
    fetchImpl,
    body: JSON.stringify({
      to,
      subject,
      html,
      text,
      thread_id: threadId,
      references: [`<${verificationId}@omnyid.live>`],
      in_reply_to: `<${verificationId}@omnyid.live>`,
    }),
  });

  const providerMessageId = field(sendResult, "message_id", "messageId", "id");
  const clientMessageId = field(sendResult, "client_message_id", "clientMessageId");
  if (sendResult.sent !== true && sendResult.ok !== true) {
    throw new Error(`send route did not report sent=true: ${JSON.stringify(sendResult)}`);
  }
  if (!providerMessageId) {
    throw new Error(`send route did not return a provider message id: ${JSON.stringify(sendResult)}`);
  }

  const result = {
    ok: true,
    from: connectedFrom,
    to,
    subject,
    threadId,
    statusRoute: statusResult.path,
    providerMessageId,
    clientMessageId: clientMessageId || null,
    proofRef: liveProviderProofRef(providerMessageId, nowMs),
    verifiedAt: new Date(nowMs).toISOString(),
  };
  consoleLike.log("LIVE_GMAIL_PROVIDER_SEND_CONFIRMED");
  consoleLike.log(`from=${result.from}`);
  consoleLike.log(`to=${result.to}`);
  consoleLike.log(`subject=${result.subject}`);
  consoleLike.log(`provider_message_id=${result.providerMessageId}`);
  if (result.clientMessageId) consoleLike.log(`client_message_id=${result.clientMessageId}`);
  consoleLike.log(`actual_connected_provider_proof_ref=${result.proofRef}`);
  const record = verificationRecord(result);
  consoleLike.log(`verification_record_json=${JSON.stringify(record)}`);
  const outputPath = env("OMNYID_VERIFY_OUTPUT_PATH", envSource) || env("OMNYID_E2E_GMAIL_VERIFICATION_OUTPUT_PATH", envSource);
  const writtenPath = await writeVerificationRecord(outputPath, record);
  if (writtenPath) consoleLike.log(`verification_record_path=${writtenPath}`);
  return result;
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }
  try {
    const result = await verifyLiveGmailProviderSend();
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export {
  STATUS_PATHS,
  escapeHtml,
  liveProviderProofRef,
  printUsage,
  usageText,
  verificationRecord,
  writeVerificationRecord,
  verifyLiveGmailProviderSend,
};
