// @locs-version: 1.0
export type WeddingRsvpCoupleKey = {
  responseWorkspaceId: string;
  keyId: string;
  publicKeyHex: string;
  createdAt: string;
};

type StoredWeddingRsvpCoupleKey = WeddingRsvpCoupleKey & {
  privateKey: CryptoKey;
};

const DATABASE = "omnyid-wedding-rsvp-keys-v1";
const STORE = "workspace-keys";

function requireCrypto(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) throw new Error("Secure RSVP encryption is not available in this browser.");
  return globalThis.crypto.subtle;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function keyIdFor(publicKey: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await requireCrypto().digest("SHA-256", arrayBuffer(publicKey)));
  return `wedding-rsvp-${bytesToHex(digest.slice(0, 12))}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: "responseWorkspaceId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("RSVP key storage could not be opened."));
  });
}

async function readStored(responseWorkspaceId: string): Promise<StoredWeddingRsvpCoupleKey | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE, "readonly").objectStore(STORE).get(responseWorkspaceId);
      request.onsuccess = () => resolve((request.result as StoredWeddingRsvpCoupleKey | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("RSVP key could not be read."));
    });
  } finally {
    database.close();
  }
}

async function writeStored(record: StoredWeddingRsvpCoupleKey): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("RSVP key could not be saved."));
      transaction.onabort = () => reject(transaction.error ?? new Error("RSVP key save was cancelled."));
    });
  } finally {
    database.close();
  }
}

function publicRecord(record: StoredWeddingRsvpCoupleKey): WeddingRsvpCoupleKey {
  const { privateKey: _privateKey, ...safe } = record;
  return safe;
}

export async function loadWeddingRsvpCoupleKey(responseWorkspaceId: string): Promise<WeddingRsvpCoupleKey | null> {
  const workspaceId = responseWorkspaceId.trim();
  if (!workspaceId) return null;
  const stored = await readStored(workspaceId);
  return stored ? publicRecord(stored) : null;
}

export async function ensureWeddingRsvpCoupleKey(responseWorkspaceId: string): Promise<WeddingRsvpCoupleKey> {
  const workspaceId = responseWorkspaceId.trim();
  if (!workspaceId) throw new Error("Choose a Wedding workspace before configuring secure RSVP answers.");
  const existing = await readStored(workspaceId);
  if (existing) return publicRecord(existing);
  const subtle = requireCrypto();
  const generated = await subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]) as CryptoKeyPair;
  const publicBytes = new Uint8Array(await subtle.exportKey("raw", generated.publicKey));
  const privatePkcs8 = await subtle.exportKey("pkcs8", generated.privateKey);
  const privateKey = await subtle.importKey("pkcs8", privatePkcs8, { name: "X25519" }, false, ["deriveBits"]);
  const record: StoredWeddingRsvpCoupleKey = {
    responseWorkspaceId: workspaceId,
    keyId: await keyIdFor(publicBytes),
    publicKeyHex: bytesToHex(publicBytes),
    privateKey,
    createdAt: new Date().toISOString(),
  };
  await writeStored(record);
  return publicRecord(record);
}
