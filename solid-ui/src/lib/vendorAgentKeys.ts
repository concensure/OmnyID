// @module-id: wedding.vendor-agent-browser-keys
// @primary-capability: browser-generated-vendor-agent-keys
// @locs-version: 2.0
// @stability: draft
// @owner: omnyid

/** Browser-only key custody for a vendor's encrypted enquiry agent. */

const DATABASE_NAME = "omnyid.vendor-agent-keys";
const STORE_NAME = "keys";
const BACKUP_ITERATIONS = 310_000;

export interface VendorAgentPublicKeys {
  agentId: string;
  keyId: string;
  signingPublicKeyHex: string;
  encryptionPublicKeyHex: string;
  createdAt: string;
}

export interface EncryptedVendorAgentBackup {
  version: 1;
  kdf: "PBKDF2-SHA-256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface VendorAgentKeySetup {
  publicKeys: VendorAgentPublicKeys;
  encryptedBackup: EncryptedVendorAgentBackup;
}

interface StoredVendorAgentKeys extends VendorAgentPublicKeys {
  signingPrivateKey: CryptoKey;
  signingPublicKey: CryptoKey;
  encryptionPrivateKey: CryptoKey;
  encryptionPublicKey: CryptoKey;
}

/**
 * Generates Ed25519 and X25519 keys in the browser, writes only non-extractable
 * private CryptoKeys to IndexedDB, and returns the one encrypted recovery file.
 */
export async function createVendorAgentKeys(
  agentId: string,
  backupPassword: string,
): Promise<VendorAgentKeySetup> {
  if (!agentId.startsWith("agent:") || agentId.length > 160) {
    throw new Error("A valid vendor Agent ID is required.");
  }
  if (backupPassword.length < 12) {
    throw new Error("Choose a backup password with at least 12 characters.");
  }
  requireWebCrypto();

  const signingPair = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  const encryptionPair = await crypto.subtle.generateKey(
    { name: "X25519" },
    true,
    ["deriveBits"],
  ) as CryptoKeyPair;
  const [signingPublicRaw, encryptionPublicRaw, signingPrivatePkcs8, encryptionPrivatePkcs8] =
    await Promise.all([
      crypto.subtle.exportKey("raw", signingPair.publicKey),
      crypto.subtle.exportKey("raw", encryptionPair.publicKey),
      crypto.subtle.exportKey("pkcs8", signingPair.privateKey),
      crypto.subtle.exportKey("pkcs8", encryptionPair.privateKey),
    ]);
  const publicKeys: VendorAgentPublicKeys = {
    agentId,
    keyId: `vendor-${crypto.randomUUID()}`,
    signingPublicKeyHex: toHex(signingPublicRaw),
    encryptionPublicKeyHex: toHex(encryptionPublicRaw),
    createdAt: new Date().toISOString(),
  };
  const encryptedBackup = await encryptBackup(
    {
      version: 1,
      publicKeys,
      signingPrivateKeyPkcs8: toBase64(signingPrivatePkcs8),
      encryptionPrivateKeyPkcs8: toBase64(encryptionPrivatePkcs8),
    },
    backupPassword,
  );

  const [signingPrivateKey, encryptionPrivateKey] = await Promise.all([
    crypto.subtle.importKey("pkcs8", signingPrivatePkcs8, { name: "Ed25519" }, false, ["sign"]),
    crypto.subtle.importKey("pkcs8", encryptionPrivatePkcs8, { name: "X25519" }, false, ["deriveBits"]),
  ]);
  await writeKeys({
    ...publicKeys,
    signingPrivateKey,
    signingPublicKey: signingPair.publicKey,
    encryptionPrivateKey,
    encryptionPublicKey: encryptionPair.publicKey,
  });
  new Uint8Array(signingPrivatePkcs8).fill(0);
  new Uint8Array(encryptionPrivatePkcs8).fill(0);
  return { publicKeys, encryptedBackup };
}

export async function loadVendorAgentPublicKeys(agentId: string): Promise<VendorAgentPublicKeys | null> {
  const record = await readKeys(agentId);
  if (!record) return null;
  const { signingPrivateKey: _signingPrivateKey, signingPublicKey: _signingPublicKey,
    encryptionPrivateKey: _encryptionPrivateKey, encryptionPublicKey: _encryptionPublicKey, ...publicKeys } = record;
  return publicKeys;
}

/** Sign a canonical AgentCard payload without exposing the private signing key. */
export async function signVendorAgentCardPayload(agentId: string, payload: Uint8Array): Promise<Uint8Array> {
  const record = await readKeys(agentId);
  if (!record) throw new Error("Vendor agent keys are not available on this device.");
  return new Uint8Array(await crypto.subtle.sign("Ed25519", record.signingPrivateKey, new Uint8Array(payload)));
}

async function encryptBackup(backup: unknown, password: string): Promise<EncryptedVendorAgentBackup> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const passwordKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const encryptionKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: BACKUP_ITERATIONS },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    encryptionKey,
    new TextEncoder().encode(JSON.stringify(backup)),
  );
  return { version: 1, kdf: "PBKDF2-SHA-256", iterations: BACKUP_ITERATIONS, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
}

function requireWebCrypto(): void {
  if (!globalThis.isSecureContext || !globalThis.crypto?.subtle || !globalThis.indexedDB) {
    throw new Error("Secure browser storage is required to create a vendor agent.");
  }
}

async function writeKeys(record: StoredVendorAgentKeys): Promise<void> {
  const database = await openDatabase();
  await transactionResult(database, "readwrite", (store) => store.put(record));
}

async function readKeys(agentId: string): Promise<StoredVendorAgentKeys | null> {
  requireWebCrypto();
  const database = await openDatabase();
  return transactionResult(database, "readonly", (store) => store.get(agentId));
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "agentId" });
    request.onerror = () => reject(request.error ?? new Error("Unable to open secure key storage."));
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionResult<T>(database: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = run(transaction.objectStore(STORE_NAME));
    request.onerror = () => reject(request.error ?? new Error("Unable to access secure key storage."));
    request.onsuccess = () => resolve(request.result);
  });
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const values = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let start = 0; start < values.length; start += 0x8000) {
    binary += String.fromCharCode(...values.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}
