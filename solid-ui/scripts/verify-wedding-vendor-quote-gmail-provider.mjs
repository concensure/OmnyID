#!/usr/bin/env node
// @locs-version: 1.0
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const STATUS_ROUTE = "/integrations/gmail/status";
const SEND_ROUTE = "/integrations/gmail/send-draft";
const DEFAULT_ENV_FILE_CANDIDATES = [".env", "../.env"];

export function weddingVendorQuoteGmailProviderSmokeUsage() {
  return [
    "Usage: npm run verify:wedding-vendor-quote:gmail",
    "",
    "Required environment:",
    "  OMNYID_API_BASE             API origin, for example https://api.example.com",
    "                              Falls back to OMNYID_HOMESERVER_URL when loaded from .env",
    "  OMNYID_GMAIL_SMOKE_TO       Recipient address for the live provider smoke send",
    "",
    "Authentication, choose one:",
    "  OMNYID_SESSION_TOKEN        Session bearer token, or use OMNYID_AUTH_TOKEN",
    "  OMNYID_VERIFY_SESSION_TOKEN Alternate bearer token name used by live verifiers",
    "  OMNYID_VERIFY_EMAIL and OMNYID_VERIFY_PASSWORD",
    "",
    "Optional environment:",
    "  OMNYID_ALLOW_INSECURE_GMAIL_SMOKE_API_BASE=true  Allow http:// API bases for local debugging only",
    "  OMNYID_GMAIL_SMOKE_SUBJECT",
    "  OMNYID_GMAIL_SMOKE_TEXT",
    "  OMNYID_GMAIL_SMOKE_HTML",
    "  OMNYID_GMAIL_SMOKE_THREAD_ID",
    "  OMNYID_GMAIL_SMOKE_NOW_ISO",
    "",
    "Output:",
    "  Copy the verification_record_json=... line into the wedding vendor quote production readiness evidence.",
    "  Use the printed from= value as the expected connected Gmail sender; do not assume it is the OmnyID app user.",
    "",
    "Flags:",
    "  --help                 Show this help without sending mail",
    "  --print-env-template   Print a PowerShell env template without sending mail",
    "  --env-file <path>      Load missing values from a dotenv file without printing secrets",
  ].join("\n");
}

export function weddingVendorQuoteGmailProviderSmokeEnvTemplate() {
  return [
    '$env:OMNYID_API_BASE="https://..."',
    '# Or rely on OMNYID_HOMESERVER_URL from ../.env when running from solid-ui.',
    '$env:OMNYID_SESSION_TOKEN="..."',
    '# Or, if you do not have a token handy:',
    '$env:OMNYID_VERIFY_EMAIL="concensure@gmail.com"',
    '$env:OMNYID_VERIFY_PASSWORD="..."',
    '$env:OMNYID_GMAIL_SMOKE_TO="..."',
    '# Optional, but recommended when matching a specific vendor quote release gate:',
    '$env:OMNYID_GMAIL_SMOKE_SUBJECT="..."',
    '$env:OMNYID_GMAIL_SMOKE_THREAD_ID="..."',
    "npm run verify:wedding-vendor-quote:gmail",
  ].join("\n");
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function requiredEnv(env, name) {
  const value = clean(env[name]);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function booleanEnv(value) {
  return /^(?:1|true|yes)$/i.test(clean(value));
}

function optionalEnv(env, name, fallback = "") {
  return clean(env[name]) || fallback;
}

function requiredAnyEnv(env, names) {
  for (const name of names) {
    const value = clean(env[name]);
    if (value) return value;
  }
  throw new Error(`${names.join(" or ")} is required.`);
}

function unquoteDotenvValue(value) {
  const trimmed = clean(value);
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\""))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseDotenv(text) {
  const entries = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const separator = normalized.indexOf("=");
    if (separator <= 0) continue;
    const key = normalized.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    entries[key] = unquoteDotenvValue(normalized.slice(separator + 1));
  }
  return entries;
}

function envFilePathFromArgs(args) {
  const index = args.findIndex((arg) => arg === "--env-file");
  if (index < 0) return null;
  const path = clean(args[index + 1]);
  if (!path || path.startsWith("--")) throw new Error("--env-file requires a path.");
  return path;
}

export function loadWeddingVendorQuoteGmailProviderSmokeEnv(
  baseEnv = process.env,
  args = [],
  cwd = process.cwd(),
) {
  const merged = { ...baseEnv };
  const explicitEnvFile = envFilePathFromArgs(args);
  const candidates = explicitEnvFile ? [explicitEnvFile] : DEFAULT_ENV_FILE_CANDIDATES;
  for (const candidate of candidates) {
    const path = resolve(cwd, candidate);
    if (!existsSync(path)) continue;
    const parsed = parseDotenv(readFileSync(path, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (!clean(merged[key])) merged[key] = value;
    }
    if (explicitEnvFile) break;
  }
  return merged;
}

function validateApiBase(apiBase, env) {
  let parsed;
  try {
    parsed = new URL(apiBase);
  } catch {
    throw new Error("OMNYID_API_BASE must be a valid URL.");
  }
  if (parsed.protocol !== "https:" && !booleanEnv(env.OMNYID_ALLOW_INSECURE_GMAIL_SMOKE_API_BASE)) {
    throw new Error("OMNYID_API_BASE must use https:// for live Gmail smoke sends. Set OMNYID_ALLOW_INSECURE_GMAIL_SMOKE_API_BASE=true only for local debugging.");
  }
  return parsed.origin;
}

function validateToken(value) {
  const token = clean(value);
  if (!token) throw new Error("OMNYID_SESSION_TOKEN or OMNYID_AUTH_TOKEN is required.");
  if (
    token === "..."
    || /^(?:token|session-token|auth-token|bearer)$/i.test(token)
    || token.length < 12
    || /\s/.test(token)
  ) {
    throw new Error("OMNYID_SESSION_TOKEN or OMNYID_AUTH_TOKEN must be a real bearer token, not a placeholder.");
  }
  return token;
}

function validateLoginEmail(value) {
  const loginEmail = clean(value).toLowerCase();
  if (
    !loginEmail
    || loginEmail === "..."
    || /^(?:test|example|email|user)@/i.test(loginEmail)
    || !/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(loginEmail)
  ) {
    throw new Error("OMNYID_VERIFY_EMAIL or OMNYID_LOGIN_EMAIL must be a real login email.");
  }
  return loginEmail;
}

function validateLoginPassword(value) {
  const password = clean(value);
  if (
    !password
    || password === "..."
    || /^(?:password|test|example|secret)$/i.test(password)
    || password.length < 8
  ) {
    throw new Error("OMNYID_VERIFY_PASSWORD or OMNYID_LOGIN_PASSWORD must be a real password.");
  }
  return password;
}

function normalizeLoginToken(value) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return clean(record.token)
    || clean(record.session_token)
    || clean(record.sessionToken)
    || clean(record.auth_token)
    || clean(record.authToken);
}

async function sessionTokenFromLogin(apiBase, env, fetchImpl) {
  const emailValue = clean(env.OMNYID_VERIFY_EMAIL) || clean(env.OMNYID_LOGIN_EMAIL);
  const passwordValue = clean(env.OMNYID_VERIFY_PASSWORD) || clean(env.OMNYID_LOGIN_PASSWORD);
  if (!emailValue && !passwordValue) return "";
  if (!emailValue || !passwordValue) {
    throw new Error("Set both OMNYID_VERIFY_EMAIL and OMNYID_VERIFY_PASSWORD, or provide OMNYID_SESSION_TOKEN.");
  }
  const response = await jsonFetch(fetchImpl, apiUrl(apiBase, "/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: validateLoginEmail(emailValue),
      password: validateLoginPassword(passwordValue),
    }),
  });
  const token = normalizeLoginToken(response);
  if (!token) throw new Error("/auth/login did not return a session token.");
  return validateToken(token);
}

async function resolveSessionToken(apiBase, env, fetchImpl) {
  const token = clean(env.OMNYID_SESSION_TOKEN)
    || clean(env.OMNYID_AUTH_TOKEN)
    || clean(env.OMNYID_VERIFY_SESSION_TOKEN)
    || clean(env.OMNYID_E2E_SESSION_TOKEN);
  if (token) return validateToken(token);
  const loginToken = await sessionTokenFromLogin(apiBase, env, fetchImpl);
  if (loginToken) return loginToken;
  throw new Error("OMNYID_SESSION_TOKEN, OMNYID_AUTH_TOKEN, OMNYID_VERIFY_SESSION_TOKEN, or login credentials are required.");
}

function validateRecipient(value) {
  const recipient = clean(value);
  if (!recipient) throw new Error("OMNYID_GMAIL_SMOKE_TO is required.");
  if (
    recipient.includes(",")
    || recipient.includes(";")
    || /\s/.test(recipient)
    || /^(?:test|example|vendor|recipient)@/i.test(recipient)
    || /^\.\.\.$/.test(recipient)
    || !/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(recipient)
  ) {
    throw new Error("OMNYID_GMAIL_SMOKE_TO must be exactly one real email address for the live Gmail smoke send.");
  }
  return recipient;
}

function validateConnectedSenderEmail(value) {
  const sender = clean(value);
  if (
    !sender
    || sender.includes(",")
    || sender.includes(";")
    || /\s/.test(sender)
    || /^(?:test|example|sender|gmail)@/i.test(sender)
    || /^\.\.\.$/.test(sender)
    || !/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(sender)
  ) {
    throw new Error("Gmail status did not return exactly one real connected sender email address.");
  }
  return sender;
}

function validateSubject(value) {
  const subject = clean(value);
  if (!subject || subject === "..." || /^test(?: subject)?$/i.test(subject)) {
    throw new Error("OMNYID_GMAIL_SMOKE_SUBJECT must describe the vendor quote flow being verified.");
  }
  if (subject.length > 180) {
    throw new Error("OMNYID_GMAIL_SMOKE_SUBJECT must be 180 characters or fewer.");
  }
  return subject;
}

function validateThreadId(value) {
  const threadId = clean(value);
  if (!threadId || threadId === "..." || /^test(?:[-_: ]|$)/i.test(threadId)) {
    throw new Error("OMNYID_GMAIL_SMOKE_THREAD_ID must be a stable vendor quote thread id.");
  }
  if (!/^[a-z0-9][a-z0-9:._/-]{5,180}$/i.test(threadId)) {
    throw new Error("OMNYID_GMAIL_SMOKE_THREAD_ID must be 6-181 URL-safe id characters.");
  }
  return threadId;
}

function validateNowIso(value) {
  const nowIso = clean(value);
  if (!nowIso) throw new Error("OMNYID_GMAIL_SMOKE_NOW_ISO must be an ISO timestamp.");
  const parsed = Date.parse(nowIso);
  if (!Number.isFinite(parsed) || !/^\d{4}-\d{2}-\d{2}T/.test(nowIso)) {
    throw new Error("OMNYID_GMAIL_SMOKE_NOW_ISO must be an ISO timestamp.");
  }
  return new Date(parsed).toISOString();
}

function validateBodyText(value) {
  const text = clean(value);
  if (!text || text === "..." || /^test(?: message| email)?$/i.test(text)) {
    throw new Error("OMNYID_GMAIL_SMOKE_TEXT must describe the live Gmail provider verification.");
  }
  if (text.length < 10) {
    throw new Error("OMNYID_GMAIL_SMOKE_TEXT must be at least 10 characters.");
  }
  if (text.length > 4000) {
    throw new Error("OMNYID_GMAIL_SMOKE_TEXT must be 4000 characters or fewer.");
  }
  return text;
}

function validateBodyHtml(value) {
  const html = clean(value);
  if (!html || html === "..." || /^<p>\s*(?:test|\.\.\.)\s*<\/p>$/i.test(html)) {
    throw new Error("OMNYID_GMAIL_SMOKE_HTML must include non-placeholder message content.");
  }
  if (html.length > 8000) {
    throw new Error("OMNYID_GMAIL_SMOKE_HTML must be 8000 characters or fewer.");
  }
  return html;
}

function escapeHtml(value) {
  return value.replace(/[<&>]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[char]);
}

function apiUrl(apiBase, route) {
  return `${apiBase.replace(/\/+$/, "")}${route}`;
}

function smokeSubject(nowIso) {
  return `OmnyID Gmail provider verification - ${nowIso.replace(/[:.]/g, "-")}`;
}

function smokeThreadId(nowIso) {
  return `wedding-vendor-quote-live-smoke-${nowIso.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`;
}

function normalizeSendResponse(value) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const messageId = clean(record.message_id) || clean(record.messageId) || clean(record.id);
  const clientMessageId = clean(record.client_message_id) || clean(record.clientMessageId);
  const draftMessageId = clean(record.draft_message_id) || clean(record.draftMessageId);
  const message = clean(record.message) || clean(record.error) || clean(record.detail);
  return {
    ok: record.ok === true || record.sent === true,
    sent: record.sent === true || record.ok === true,
    messageId: messageId || null,
    clientMessageId: clientMessageId || null,
    draftMessageId: draftMessageId || null,
    message: message || null,
  };
}

function proofRefFor(messageId, nowIso) {
  const date = nowIso.slice(0, 10) || "unknown-date";
  return `gmail:prod-smoke:${date}:${messageId}`;
}

function buildVerificationRecord(input) {
  return {
    schema_version: 1,
    verification_kind: "omnyid_live_gmail_provider_send",
    ok: true,
    from: input.from,
    to: input.to,
    subject: input.subject,
    thread_id: input.threadId,
    status_route: STATUS_ROUTE,
    send_route: SEND_ROUTE,
    provider: "gmail",
    provider_message_id: input.messageId,
    client_message_id: input.clientMessageId,
    draft_message_id: input.draftMessageId,
    actual_connected_provider_proof_ref: proofRefFor(input.messageId, input.verifiedAt),
    verified_at: input.verifiedAt,
  };
}

async function jsonFetch(fetchImpl, url, options) {
  const response = await fetchImpl(url, options);
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }
  }
  if (!response.ok) {
    const message = clean(body.error) || clean(body.message) || `Request failed with ${response.status}`;
    throw new Error(message);
  }
  return body;
}

export async function runWeddingVendorQuoteGmailProviderSmoke(env = process.env, fetchImpl = fetch) {
  const apiBase = validateApiBase(requiredAnyEnv(env, ["OMNYID_API_BASE", "OMNYID_HOMESERVER_URL"]), env);
  const token = await resolveSessionToken(apiBase, env, fetchImpl);
  const nowIso = validateNowIso(optionalEnv(env, "OMNYID_GMAIL_SMOKE_NOW_ISO", new Date().toISOString()));
  const to = validateRecipient(requiredEnv(env, "OMNYID_GMAIL_SMOKE_TO"));
  const subject = validateSubject(optionalEnv(env, "OMNYID_GMAIL_SMOKE_SUBJECT", smokeSubject(nowIso)));
  const text = validateBodyText(optionalEnv(env, "OMNYID_GMAIL_SMOKE_TEXT", "OmnyID live Gmail provider verification for the wedding vendor quote reply flow."));
  const html = validateBodyHtml(optionalEnv(env, "OMNYID_GMAIL_SMOKE_HTML", `<p>${escapeHtml(text)}</p>`));
  const threadId = validateThreadId(optionalEnv(env, "OMNYID_GMAIL_SMOKE_THREAD_ID", smokeThreadId(nowIso)));
  const authHeaders = {
    Authorization: `Bearer ${token}`,
  };
  {
    const status = await jsonFetch(fetchImpl, apiUrl(apiBase, STATUS_ROUTE), {
      method: "GET",
      headers: authHeaders,
    });
    if (status.connected !== true || status.token_expired === true || status.tokenExpired === true) {
      throw new Error("Gmail is not connected with a healthy token.");
    }
    const connectedGmailEmail = validateConnectedSenderEmail(clean(status.gmail_email) || clean(status.gmailEmail));

    const send = normalizeSendResponse(await jsonFetch(fetchImpl, apiUrl(apiBase, SEND_ROUTE), {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to,
        subject,
        html,
        text,
        thread_id: threadId,
      }),
    }));
    if (!send.ok || !send.sent || !send.messageId) {
      throw new Error(send.message || "Gmail send did not return a durable provider message id.");
    }

    return buildVerificationRecord({
      from: connectedGmailEmail,
      to,
      subject,
      threadId,
      messageId: send.messageId,
      clientMessageId: send.clientMessageId,
      draftMessageId: send.draftMessageId,
      verifiedAt: nowIso,
    });
  }
}

export function weddingVendorQuoteGmailProviderSmokeRecordOutput(record) {
  return [
    "LIVE_GMAIL_PROVIDER_SEND_CONFIRMED",
    record.from ? `from=${record.from}` : null,
    `to=${record.to}`,
    `subject=${record.subject}`,
    `thread_id=${record.thread_id}`,
    `provider_message_id=${record.provider_message_id}`,
    record.client_message_id ? `client_message_id=${record.client_message_id}` : null,
    `actual_connected_provider_proof_ref=${record.actual_connected_provider_proof_ref}`,
    `verification_record_json=${JSON.stringify(record)}`,
  ].filter(Boolean).join("\n");
}

function printRecord(record) {
  console.log(weddingVendorQuoteGmailProviderSmokeRecordOutput(record));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(weddingVendorQuoteGmailProviderSmokeUsage());
  } else if (args.includes("--print-env-template")) {
    console.log(weddingVendorQuoteGmailProviderSmokeEnvTemplate());
  } else {
    runWeddingVendorQuoteGmailProviderSmoke(loadWeddingVendorQuoteGmailProviderSmokeEnv(process.env, args))
      .then(printRecord)
      .catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      });
  }
}
