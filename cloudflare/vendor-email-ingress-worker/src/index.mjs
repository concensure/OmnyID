const CONTRACT_VERSION = "1";
const CONTRACT_DOMAIN = "omnyid-email-worker-v1";
const DEFAULT_MAX_RAW_BYTES = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 8_000;
const HEX_64 = /^[a-f0-9]{64}$/;

const encoder = new TextEncoder();

export function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

export function base64Url(value) {
  const bytes = encoder.encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function normalizedAddress(value) {
  const address = String(value ?? "").trim().toLowerCase();
  if (!address || address.length > 320 || /[\r\n\0]/u.test(address)) {
    throw new Error("invalid_envelope_address");
  }
  return address;
}

function normalizedMessageId(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^<|>$/gu, "")
    .slice(0, 512);
}

function configuredAddresses(value) {
  return new Set(String(value ?? "").split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean));
}

export function cloudflareDmarcPassed(headers) {
  const result = String(headers?.get?.("Authentication-Results") ?? "").trim().toLowerCase();
  return result.startsWith("mx.cloudflare.net;")
    && result.split(";").some((part) => part.trim().startsWith("dmarc=pass"));
}

export async function deterministicEventId({ from, to, messageId, bodyDigest }) {
  if (!HEX_64.test(bodyDigest)) throw new Error("invalid_body_digest");
  const material = [
    CONTRACT_DOMAIN,
    normalizedAddress(to),
    normalizedAddress(from),
    normalizedMessageId(messageId),
    bodyDigest,
  ].join("\0");
  return sha256Hex(material);
}

export function canonicalRequest(fields) {
  const values = [
    CONTRACT_DOMAIN,
    fields.keyId,
    fields.timestamp,
    fields.nonce,
    fields.eventId,
    fields.fromEncoded,
    fields.toEncoded,
    fields.bodyDigest,
    fields.rawSize,
  ];
  if (values.some((value) => String(value).includes("\n"))) {
    throw new Error("invalid_canonical_field");
  }
  return values.join("\n");
}

export async function hmacSha256Hex(secret, value) {
  if (encoder.encode(secret).byteLength < 32) throw new Error("weak_ingress_secret");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

export function classifyGatewayStatus(status) {
  if (status === 202) return "accepted";
  if ([400, 401, 404, 409, 413].includes(status)) return "permanent";
  return "transient";
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function boundedPositiveInteger(value, fallback, maximum) {
  return Math.min(positiveInteger(value, fallback), maximum);
}

function randomNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function assertRuntimeConfig(env) {
  const url = new URL(env.GATEWAY_URL);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("invalid_gateway_url");
  }
  if (url.pathname !== "/integrations/vendor-email/cloudflare/inbound") {
    throw new Error("invalid_gateway_path");
  }
  const keyId = String(env.KEY_ID ?? "").trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,31}$/u.test(keyId)) throw new Error("invalid_key_id");
  if (encoder.encode(String(env.INGRESS_SHARED_SECRET ?? "")).byteLength < 32) {
    throw new Error("weak_ingress_secret");
  }
  return { url: url.toString(), keyId };
}

async function rawBytes(message, maxBytes) {
  if (!Number.isSafeInteger(message.rawSize) || message.rawSize < 0) {
    throw new Error("invalid_raw_size");
  }
  if (message.rawSize > maxBytes) return null;
  const bytes = new Uint8Array(await new Response(message.raw).arrayBuffer());
  if (bytes.byteLength !== message.rawSize || bytes.byteLength > maxBytes) {
    throw new Error("raw_size_mismatch");
  }
  return bytes;
}

export async function processEmail(message, env, fetchImpl = fetch) {
  const { url, keyId } = assertRuntimeConfig(env);
  const maxBytes = boundedPositiveInteger(
    env.MAX_RAW_BYTES,
    DEFAULT_MAX_RAW_BYTES,
    DEFAULT_MAX_RAW_BYTES,
  );
  const bytes = await rawBytes(message, maxBytes);
  if (bytes === null) {
    message.setReject("Message cannot be accepted");
    return { status: "rejected", reason: "message_too_large" };
  }

  const from = normalizedAddress(message.from);
  const to = normalizedAddress(message.to);
  if (configuredAddresses(env.OPERATOR_ALIASES).has(to) && !cloudflareDmarcPassed(message.headers)) {
    message.setReject("Message cannot be accepted");
    return { status: "rejected", reason: "dmarc_not_passed" };
  }
  const bodyDigest = await sha256Hex(bytes);
  const eventId = await deterministicEventId({
    from,
    to,
    messageId: message.headers.get("Message-ID"),
    bodyDigest,
  });
  const timestamp = Math.floor(Date.now() / 1000).toString(10);
  const nonce = randomNonce();
  const fromEncoded = base64Url(from);
  const toEncoded = base64Url(to);
  const rawSize = bytes.byteLength.toString(10);
  const canonical = canonicalRequest({
    keyId,
    timestamp,
    nonce,
    eventId,
    fromEncoded,
    toEncoded,
    bodyDigest,
    rawSize,
  });
  const signature = await hmacSha256Hex(env.INGRESS_SHARED_SECRET, canonical);
  const headers = new Headers({
    "Content-Type": "message/rfc822",
    "X-OmnyID-Email-Version": CONTRACT_VERSION,
    "X-OmnyID-Email-Key-Id": keyId,
    "X-OmnyID-Email-Timestamp": timestamp,
    "X-OmnyID-Email-Nonce": nonce,
    "X-OmnyID-Email-Event-Id": eventId,
    "X-OmnyID-Email-From": fromEncoded,
    "X-OmnyID-Email-To": toEncoded,
    "X-OmnyID-Email-Body-SHA256": bodyDigest,
    "X-OmnyID-Email-Raw-Size": rawSize,
    "X-OmnyID-Email-Signature": signature,
  });
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort("gateway_timeout"),
    boundedPositiveInteger(env.GATEWAY_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 30_000),
  );
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: bytes,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const disposition = classifyGatewayStatus(response.status);
  if (disposition === "accepted") return { status: "accepted", eventId };
  if (disposition === "permanent") {
    message.setReject("Message cannot be accepted");
    return { status: "rejected", reason: "gateway_rejected" };
  }
  throw new Error("gateway_temporarily_unavailable");
}

export default {
  async email(message, env) {
    await processEmail(message, env);
  },
};
