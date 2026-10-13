// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";
import { isRecord } from "@/lib/eventDetail";

export const ENCRYPTED_MESSAGE_PENDING_LABEL = "Encrypted message - decrypting on this device";
export const ENCRYPTED_MESSAGE_UNAVAILABLE_LABEL = "Encrypted message - unlock this device to view";

export type DecryptedDisplayState = {
  encrypted: boolean;
  decrypted: boolean;
  content: Record<string, unknown>;
  stringValues: string[];
  placeholder: string | null;
};

type DisplayMessageLike = Pick<AfpMessage, "encryption"> & {
  content?: unknown;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasEncryption(encryption: unknown): boolean {
  return Boolean(encryption && typeof encryption === "object");
}

function contentLooksLikeCiphertext(content: Record<string, unknown>, encryption: unknown): boolean {
  const keys = Object.keys(content).map((key) => key.toLowerCase());
  const encryptionKeys = isRecord(encryption)
    ? Object.keys(encryption).map((key) => key.toLowerCase())
    : [];
  return [...keys, ...encryptionKeys].some((key) => ["ciphertext", "nonce", "aad", "encrypted_content"].includes(key));
}

function displayStringValues(content: Record<string, unknown>): string[] {
  return Object.values(content).filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

export function buildDecryptedDisplayState(
  message: DisplayMessageLike,
): DecryptedDisplayState {
  const content = isRecord(message.content) ? message.content : {};
  const encrypted = hasEncryption(message.encryption);
  const decrypted = !encrypted;
  if (encrypted) {
    return {
      encrypted: true,
      decrypted: false,
      content: {},
      stringValues: [],
      placeholder: contentLooksLikeCiphertext(content, message.encryption)
        ? ENCRYPTED_MESSAGE_UNAVAILABLE_LABEL
        : ENCRYPTED_MESSAGE_PENDING_LABEL,
    };
  }
  return {
    encrypted: false,
    decrypted: true,
    content,
    stringValues: displayStringValues(content),
    placeholder: null,
  };
}

export function decryptedDisplayContent(message: DisplayMessageLike): Record<string, unknown> {
  return buildDecryptedDisplayState(message).content;
}

export function decryptedDisplayStringValues(message: DisplayMessageLike): string[] {
  return buildDecryptedDisplayState(message).stringValues;
}

export function decryptedDisplayLabel(message: DisplayMessageLike): string | null {
  return clean(buildDecryptedDisplayState(message).placeholder) || null;
}
