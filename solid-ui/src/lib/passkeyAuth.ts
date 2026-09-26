// @locs-version: 1.0
import {
  beginPasskeyAuthenticationByEmail,
  finishPasskeyAuthentication,
} from "@/lib/api";
import type { AuthApiResponse } from "@/lib/authResponseState";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  return toBase64Url(new Uint8Array(buffer));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function passkeyAbortMessage(error: unknown): string | null {
  if (!(error instanceof DOMException)) return null;
  if (error.name === "NotAllowedError") {
    return "Passkey sign-in was cancelled or no matching passkey was approved on this device.";
  }
  if (error.name === "InvalidStateError") {
    return "This browser could not complete passkey sign-in with the current homeserver settings.";
  }
  if (error.name === "SecurityError") {
    return "Passkey sign-in requires a secure origin that matches the homeserver WebAuthn settings.";
  }
  return null;
}

export function browserSupportsPasskeyAuth(): boolean {
  return typeof window !== "undefined"
    && typeof window.PublicKeyCredential !== "undefined"
    && typeof navigator !== "undefined"
    && Boolean(navigator.credentials?.get);
}

export async function authenticateWithPasskey(email: string): Promise<AuthApiResponse> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error("Enter your account email before using passkey sign-in.");
  }
  if (!browserSupportsPasskeyAuth()) {
    throw new Error("This browser does not support passkey sign-in.");
  }

  const begin = await beginPasskeyAuthenticationByEmail(normalizedEmail);
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: toArrayBuffer(fromBase64Url(begin.options.challenge)),
      rpId: begin.options.rp_id,
      timeout: begin.options.timeout_ms,
      userVerification: begin.options.user_verification as UserVerificationRequirement,
      allowCredentials: begin.options.allow_credentials.map((entry) => ({
        type: "public-key",
        id: toArrayBuffer(fromBase64Url(entry.id)),
      })),
    },
  }).catch((error) => {
    throw new Error(passkeyAbortMessage(error) || "Passkey sign-in could not be completed.");
  });

  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error("Passkey sign-in did not return a valid browser credential.");
  }

  const response = credential.response;
  if (!(response instanceof AuthenticatorAssertionResponse)) {
    throw new Error("Passkey sign-in returned an unsupported credential response.");
  }

  return finishPasskeyAuthentication({
    user_id: begin.user_id,
    credential_id: credential.id,
    client_data_json: bufferToBase64Url(response.clientDataJSON),
    authenticator_data: bufferToBase64Url(response.authenticatorData),
    signature: bufferToBase64Url(response.signature),
  });
}
