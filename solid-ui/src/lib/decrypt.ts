/**
 * Client-side AFP message decryption.
 *
 * Core E2EE principle: ciphertext is stored on the server. The encryption key
 * is fetched once per session and held only in memory. Decrypted content never
 * leaves the device and is never re-stored — it lives only in Solid signals
 * for rendering.
 *
 * Algorithm: XChaCha20-Poly1305-IETF (libsodium xchacha20poly1305_ietf)
 * AAD: canonical JSON of {id, thread_id, from, to, type, timestamp}
 */

import type { AfpMessage } from "@/lib/api";
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";
import sodium from "libsodium-wrappers";

let _keyBytes: Uint8Array | null = null;
let _ready = false;

/** Call once per session after fetching the key from /agent/keys. */
export async function initDecrypt(encKeyHex: string): Promise<void> {
  await sodium.ready;
  _ready = true;
  _keyBytes = hexToBytes(encKeyHex);
}

export function isDecryptReady(): boolean {
  return _ready && _keyBytes !== null;
}

/**
 * Attempt to decrypt a single AFP message's content in-place.
 * Returns a new message object with decrypted content (original unchanged).
 * If decryption fails or isn't applicable, returns the message unchanged.
 */
export function tryDecryptMessage(msg: AfpMessage): AfpMessage {
  if (!_keyBytes || !msg.encryption) return msg;
  const enc = msg.encryption as Record<string, string>;
  if (enc["scheme"] !== "omnyid-envelope-v1") return msg;

  try {
    const nonce = base64ToBytes(enc["nonce"]);
    const ciphertext = base64ToBytes(enc["ciphertext"]);

    // Reconstruct AAD — must match server-side aad object key order exactly
    const aad = canonicalJson({
      id: msg.id,
      thread_id: msg.thread_id,
      from: msg.from,
      to: msg.to ?? [],
      type: msg.type,
      timestamp: msg.timestamp,
    });

    const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      new TextEncoder().encode(aad),
      nonce,
      _keyBytes,
    );

    const decryptedContent = parseDecryptedAfpContent(new TextDecoder().decode(plaintext));
    if (!decryptedContent) return msg;
    return { ...msg, content: decryptedContent, encryption: null };
  } catch {
    // Wrong key, corrupted data, or unsupported format — return ciphertext form
    return msg;
  }
}

/** Decrypt an array of messages. Returns new array, originals unchanged. */
export function decryptMessages(msgs: AfpMessage[]): AfpMessage[] {
  if (!_keyBytes) return msgs;
  return msgs.map(tryDecryptMessage);
}

export function parseDecryptedAfpContent(text: string): Record<string, unknown> | null {
  const parsed = parseJsonValue(text);
  if (!parsed.ok) return null;

  return isRecord(parsed.value)
    ? parsed.value
    : null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Canonical JSON — sorted keys, no extra whitespace.
 * Must produce the same string as the Rust server's canonical_json_string().
 */
function canonicalJson(obj: unknown): string {
  if (!isRecord(obj)) {
    return JSON.stringify(obj);
  }
  const sorted = Object.keys(obj)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = obj[k];
      return acc;
    }, {});
  return JSON.stringify(sorted);
}
