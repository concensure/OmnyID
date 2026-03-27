import sodium from 'libsodium-wrappers';
import { z } from 'zod';

const ViewSchema = z.object({
  format: z.enum(['email', 'notion', 'database', 'calendar', 'graph', 'system']),
  content: z.record(z.any()),
  priority: z.number().int().default(0),
});

const ReferenceSchema = z.object({
  type: z.string(),
  target: z.string(),
  label: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const AttachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  mime_type: z.string(),
  size_bytes: z.number().int().nonnegative(),
  storage: z.record(z.any()),
  encryption: z.record(z.any()),
  sha256: z.string().optional(),
});

const MessageSchema = z.object({
  protocol: z.literal('afp-v1').default('afp-v1'),
  id: z.string().default(''),
  thread_id: z.string(),
  parent_id: z.string().optional(),
  from: z.string().default(''),
  to: z.array(z.string()).default([]),
  timestamp: z.string().default(''),
  type: z.string(),
  content: z.record(z.any()).default({}),
  signature: z.string().default(''),
  encryption: z.record(z.any()).nullable().optional(),
  views: z.array(ViewSchema).default([]),
  references: z.array(ReferenceSchema).default([]),
  attachments: z.array(AttachmentSchema).default([]),
  store_in_relational: z.boolean().default(false),
});

const ActionSchema = z.object({
  type: z.enum(['label', 'star', 'archive', 'move', 'share', 'forward', 'reply', 'summarise']),
  thread_id: z.string(),
  payload: z.record(z.any()).default({}),
});

export type View = z.infer<typeof ViewSchema>;
export type Reference = z.infer<typeof ReferenceSchema>;
export type Attachment = z.infer<typeof AttachmentSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type MessageInput = z.input<typeof MessageSchema>;
export type ActionInput = z.input<typeof ActionSchema>;

export interface AgentOptions {
  signingKeyHex?: string;
  encryptionKeyHex?: string;
  encryptByDefault?: boolean;
  recipientKeys?: Record<string, string>;
  transportPreference?: 'auto' | 'http' | 'websocket' | 'webtransport';
  discoveryTrustMode?: 'strict' | 'tofu';
}

export interface RelayEvent {
  event: string;
  message_id?: string;
  thread_id?: string;
  type?: string;
  payload?: unknown;
}

export interface RelaySubscriptionHandle {
  close(): Promise<void>;
}

export interface TransportCapabilities {
  public_transport?: {
    primary?: string;
    fallback?: string;
    webtransport?: {
      enabled?: boolean;
      reason?: string;
      path?: string;
      bind_addr?: string;
    };
    websocket?: {
      enabled?: boolean;
      path?: string;
    };
    http?: {
      enabled?: boolean;
      path?: string;
    };
  };
  internal_transport?: {
    grpc_enabled?: boolean;
  };
}

type Sodium = typeof sodium;
type TransportPreference = NonNullable<AgentOptions['transportPreference']>;

type WebTransportLike = {
  ready: Promise<unknown>;
  closed: Promise<unknown>;
  close?: (options?: { closeCode?: number; reason?: string }) => void;
  createBidirectionalStream?: () => Promise<WritableReadablePair>;
};

type WritableReadablePair = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
};

type WebTransportConstructorLike = new (url: string) => WebTransportLike;

function generateId(prefix: string) {
  const random = Math.random().toString(36).slice(2, 12);
  return `${prefix}_${random}`;
}

function isoNow() {
  return new Date().toISOString();
}

function readEnv(name: string): string {
  const scope = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return scope.process?.env?.[name]?.trim() ?? '';
}

function canonicalJson(value: unknown) {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortJson((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  return value;
}

function isEncryptedPlaceholder(content: Record<string, unknown>) {
  return content.omnyid_encrypted === true;
}

function encryptionAad(message: Message) {
  return canonicalJson({
    protocol: message.protocol,
    id: message.id,
    thread_id: message.thread_id,
    parent_id: message.parent_id ?? '',
    from: message.from,
    to: message.to,
    timestamp: message.timestamp,
    type: message.type,
  });
}

function encryptionAadFromObject(message: Record<string, unknown>) {
  return canonicalJson({
    protocol: message.protocol ?? 'afp-v1',
    id: message.id ?? '',
    thread_id: message.thread_id ?? '',
    parent_id: message.parent_id ?? '',
    from: message.from ?? '',
    to: Array.isArray(message.to) ? message.to : [],
    timestamp: message.timestamp ?? '',
    type: message.type ?? '',
  });
}

function agentCardSignablePayload(card: Record<string, unknown>) {
  return [
    String(card.protocol ?? 'afp-v1'),
    String(card.agent_id ?? ''),
    String(card.key_id ?? ''),
    canonicalJson(Array.isArray(card.previous_key_ids) ? card.previous_key_ids : []),
    String(card.public_key_hex ?? ''),
    String(card.homeserver_url ?? ''),
    canonicalJson(Array.isArray(card.capabilities) ? card.capabilities : []),
    String(card.timestamp ?? ''),
  ].join('\n');
}

function resolveEncryptByDefault(input: boolean | undefined, hasEncryptionKey: boolean) {
  if (typeof input === 'boolean') {
    return input;
  }

  const envValue = readEnv('OMNYID_ENCRYPT_BY_DEFAULT').toLowerCase();
  if (['1', 'true', 'yes'].includes(envValue)) {
    return true;
  }
  if (['0', 'false', 'no'].includes(envValue)) {
    return false;
  }

  return hasEncryptionKey;
}

export class Agent {
  private url: string;
  private agentId: string;
  private signingKeyHex: string;
  private encryptionKeyHex: string;
  private encryptByDefault: boolean;
  private recipientKeys: Record<string, string>;
  private sodiumReady: Promise<Sodium>;
  private transportPreference: TransportPreference;
  private discoveryTrustMode: 'strict' | 'tofu';

  constructor(
    homeserverUrl = 'http://localhost:8080',
    agentId = 'agent:you@yourdomain.ai',
    options: AgentOptions = {},
  ) {
    this.url = homeserverUrl.replace(/\/+$/, '');
    this.agentId = agentId;
    this.signingKeyHex = options.signingKeyHex ?? readEnv('OMNYID_SIGNING_KEY_HEX');
    this.encryptionKeyHex = options.encryptionKeyHex ?? readEnv('OMNYID_ENCRYPTION_KEY_HEX');
    this.encryptByDefault = resolveEncryptByDefault(
      options.encryptByDefault,
      Boolean(this.encryptionKeyHex || this.signingKeyHex),
    );
    this.recipientKeys = this.loadRecipientKeys(options.recipientKeys);
    this.sodiumReady = sodium.ready.then(() => sodium);
    this.transportPreference = this.resolveTransportPreference(options.transportPreference);
    this.discoveryTrustMode = this.resolveDiscoveryTrustMode(options.discoveryTrustMode);
  }

  async send(input: MessageInput) {
    const sodiumLib = await this.sodiumReady;
    const msg = MessageSchema.parse(input);
    const payload: Message = {
      ...msg,
      id: msg.id || generateId('msg'),
      timestamp: msg.timestamp || isoNow(),
      from: msg.from || this.agentId,
    };

    await this.ensureRecipientKeys(payload);

    if (this.shouldEncrypt(payload)) {
      const plaintext = payload.content;
      payload.encryption = this.encryptContent(sodiumLib, payload, plaintext);
      payload.content = {
        omnyid_encrypted: true,
        scheme: 'omnyid-envelope-v1',
      };
    }

    if (this.signingKeyHex) {
      payload.signature = this.signMessage(sodiumLib, payload);
    }

    const transportPlan = await this.resolveSendTransportPlan();
    for (const transport of transportPlan) {
      try {
        if (transport === 'webtransport') {
          return await this.sendViaWebTransport(payload);
        }
        if (transport === 'websocket') {
          return await this.sendViaWebSocket(payload);
        }
        return await this.sendViaHttp(payload);
      } catch {
        continue;
      }
    }

    throw new Error('Omnyid transport fallback chain exhausted');
  }

  async act(input: ActionInput) {
    const action = ActionSchema.parse(input);
    return this.send({
      thread_id: action.thread_id,
      type: `action_${action.type}`,
      content: action.payload,
      views: [
        {
          format: 'system',
          content: action,
          priority: 0,
        },
      ],
    });
  }

  async label(threadId: string, labels: string[]) {
    return this.act({ type: 'label', thread_id: threadId, payload: { labels } });
  }

  async star(threadId: string) {
    return this.act({ type: 'star', thread_id: threadId, payload: {} });
  }

  async archive(threadId: string) {
    return this.act({ type: 'archive', thread_id: threadId, payload: {} });
  }

  async move(threadId: string, destination: string) {
    return this.act({
      type: 'move',
      thread_id: threadId,
      payload: { destination },
    });
  }

  async share(threadId: string, to: string[]) {
    return this.act({ type: 'share', thread_id: threadId, payload: { to } });
  }

  async forward(threadId: string, to: string[], note = '') {
    const payload: Record<string, unknown> = { to };
    if (note) {
      payload.note = note;
    }
    return this.act({ type: 'forward', thread_id: threadId, payload });
  }

  async reply(
    threadId: string,
    body: string,
    options: {
      to?: string[];
      subject?: string;
      in_reply_to?: string;
      references?: string[];
    } = {},
  ) {
    return this.act({
      type: 'reply',
      thread_id: threadId,
      payload: {
        body,
        ...options,
      },
    });
  }

  async summarise(threadId: string, style = 'brief') {
    return this.act({
      type: 'summarise',
      thread_id: threadId,
      payload: { style },
    });
  }

  async getThread(threadId: string) {
    const sodiumLib = await this.sodiumReady;
    const res = await fetch(`${this.url}/thread/${threadId}`);
    const messages = (await res.json()) as Record<string, unknown>[];
    return messages.map((message) => this.decryptMessageContent(sodiumLib, message));
  }

  async discover(domainUrl: string) {
    const domain = domainUrl.replace(/\/+$/, '');
    const cardBaseUrl = await this.resolveDiscoveryBaseUrl(domain);
    const res = await fetch(`${cardBaseUrl}/.well-known/agent-card`);
    return res.json();
  }

  async discoverVerified(domainUrl: string) {
    const sodiumLib = await this.sodiumReady;
    const card = (await this.discover(domainUrl)) as Record<string, unknown>;
    if (!this.verifyAgentCard(sodiumLib, card)) {
      throw new Error('Invalid or unsigned Omnyid AgentCard');
    }
    if (!this.agentCardMatchesRequestedDomain(card, domainUrl)) {
      if (this.discoveryTrustMode !== 'tofu') {
        throw new Error('Discovered AgentCard does not match requested domain');
      }
      if (!this.canTrustOnFirstUse(card)) {
        throw new Error(
          'TOFU discovery rejected because the AgentCard key conflicts with cached identity',
        );
      }
    } else if (!this.canTrustOnFirstUse(card)) {
      throw new Error('Discovered AgentCard key conflicts with cached identity');
    }
    this.rememberAgentCard(card);
    return card;
  }

  async discoverDelegation(domainUrl: string) {
    const domain = domainUrl.replace(/\/+$/, '');
    const res = await fetch(`${domain}/.well-known/afp-delegation`);
    if (res.status === 404) {
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  }

  async getTransportCapabilities() {
    const res = await fetch(`${this.url}/transport/capabilities`);
    return (await res.json()) as TransportCapabilities;
  }

  /**
   * Execute a typed integration action against an external endpoint.
   *
   * The homeserver validates `capability.approval_mode`, fires the HTTP call
   * (if autonomous), stores AFP intent + result messages into the thread, and
   * returns the structured result.
   */
  async executeCapability(options: {
    capability: {
      capability_id: string;
      provider: string;
      operation: string;
      transport: 'rest' | 'graphql' | 'browser_automation';
      scopes: string[];
      approval_mode: 'autonomous' | 'suggest_only' | 'human_approval_required';
      secret_refs: string[];
      metadata?: unknown;
    };
    intent: {
      capability_id: string;
      thread_id: string;
      requested_by: string;
      input: unknown;
      reason?: string;
    };
    url: string;
    method?: string;
    bearer_token?: string;
  }) {
    const res = await fetch(`${this.url}/actions/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...options,
        method: options.method ?? 'POST',
      }),
    });
    return res.json() as Promise<{
      status: string;
      capability_id: string;
      thread_id: string;
      intent_message_id: string;
      result_message_id: string;
      output: unknown;
      external_reference: string | null;
    }>;
  }

  /**
   * Request a server-side Ed25519 key rotation.
   * Returns new key material. The operator must update OMNYID_SIGNING_KEY_HEX
   * and restart the homeserver for the rotation to take effect.
   */
  async rotateKey(reason?: string) {
    const res = await fetch(`${this.url}/keys/rotate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason ?? null }),
    });
    return res.json() as Promise<{
      event_id: string;
      agent_id: string;
      old_key_id: string;
      new_key_id: string;
      new_public_key_hex: string;
      new_private_key_hex: string;
      action_required: string;
    }>;
  }

  private async upsertPeerKeyServerSide(card: Record<string, unknown>) {
    const { agent_id, key_id, public_key_hex, homeserver_url, previous_key_ids } = card;
    if (!agent_id || !key_id || !public_key_hex) return;
    try {
      await fetch(`${this.url}/keys/peer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id,
          key_id,
          public_key_hex,
          homeserver_url: homeserver_url ?? '',
          previous_key_ids: previous_key_ids ?? [],
        }),
      });
    } catch {
      // Best-effort; local in-memory cache is the primary path
    }
  }

  subscribeRelay(onEvent: (event: RelayEvent) => void) {
    const socket = new WebSocket(this.relayUrl());
    socket.addEventListener('message', (messageEvent) => {
      const raw = String(messageEvent.data);
      try {
        onEvent(JSON.parse(raw) as RelayEvent);
      } catch {
        onEvent({ event: 'raw', payload: raw });
      }
    });
    return socket;
  }

  subscribeThread(
    threadId: string,
    onEvent: (event: RelayEvent & { messages?: unknown[] }) => void,
    includeSnapshot = true,
  ) {
    const socket = new WebSocket(this.relayUrl());
    socket.addEventListener('open', () => {
      socket.send(
        JSON.stringify({
          op: 'subscribe_thread',
          thread_id: threadId,
          include_snapshot: includeSnapshot,
        }),
      );
    });
    socket.addEventListener('message', (messageEvent) => {
      const raw = String(messageEvent.data);
      try {
        onEvent(JSON.parse(raw) as RelayEvent & { messages?: unknown[] });
      } catch {
        onEvent({ event: 'raw', payload: raw });
      }
    });
    return socket;
  }

  async openThreadSubscription(
    threadId: string,
    onEvent: (event: RelayEvent & { messages?: unknown[] }) => void,
    includeSnapshot = true,
  ): Promise<RelaySubscriptionHandle> {
    const plan = await this.resolveSendTransportPlan();
    for (const transport of plan) {
      try {
        if (transport === 'webtransport') {
          return await this.subscribeThreadViaWebTransport(threadId, onEvent, includeSnapshot);
        }
        if (transport === 'websocket') {
          const socket = this.subscribeThread(threadId, onEvent, includeSnapshot);
          return {
            async close() {
              socket.close();
            },
          };
        }
      } catch {
        continue;
      }
    }

    throw new Error('No supported realtime transport is available for thread subscription');
  }

  private async ensureRecipientKeys(message: Message) {
    for (const agentId of this.recipientAgentIds(message)) {
      if (agentId === this.agentId || this.recipientKeys[agentId]) {
        continue;
      }

      const domainUrl = this.agentDomainUrl(agentId);
      if (!domainUrl) {
        continue;
      }

      try {
        const card = await this.discoverVerified(domainUrl);
        void this.upsertPeerKeyServerSide(card);
      } catch {
        continue;
      }
    }
  }

  private shouldEncrypt(message: Message) {
    if (!this.encryptByDefault) {
      return false;
    }

    if (message.encryption) {
      return false;
    }

    return !isEncryptedPlaceholder(message.content);
  }

  private encryptContent(
    sodiumLib: Sodium,
    message: Message,
    content: Record<string, unknown>,
  ): Record<string, unknown> {
    const recipientEnvelope = this.encryptContentForRecipients(sodiumLib, message, content);
    if (recipientEnvelope) {
      return recipientEnvelope;
    }

    if (!this.encryptionKeyHex) {
      throw new Error(
        'Omnyid encryption requires either OMNYID_ENCRYPTION_KEY_HEX or known recipient keys',
      );
    }

    const key = this.loadEncryptionKey(sodiumLib);
    const nonce = sodiumLib.randombytes_buf(
      sodiumLib.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
    );
    const ciphertext = sodiumLib.crypto_aead_xchacha20poly1305_ietf_encrypt(
      canonicalJson(content),
      encryptionAad(message),
      null,
      nonce,
      key,
    );

    return {
      scheme: 'omnyid-envelope-v1',
      algorithm: 'xchacha20poly1305-ietf',
      mode: 'shared-key',
      nonce: sodiumLib.to_base64(nonce, sodiumLib.base64_variants.ORIGINAL),
      ciphertext: sodiumLib.to_base64(ciphertext, sodiumLib.base64_variants.ORIGINAL),
    };
  }

  private decryptMessageContent(sodiumLib: Sodium, message: Record<string, unknown>) {
    const envelope = message.encryption;
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
      return message;
    }

    const typedEnvelope = envelope as Record<string, unknown>;
    if (typedEnvelope.scheme !== 'omnyid-envelope-v1') {
      return message;
    }
    if (typedEnvelope.algorithm !== 'xchacha20poly1305-ietf') {
      return message;
    }
    if (typeof typedEnvelope.nonce !== 'string' || typeof typedEnvelope.ciphertext !== 'string') {
      return message;
    }

    try {
      const key =
        this.unwrapContentKey(sodiumLib, message, typedEnvelope) ??
        (this.encryptionKeyHex ? this.loadEncryptionKey(sodiumLib) : null);
      if (!key) {
        return message;
      }
      const nonce = sodiumLib.from_base64(
        typedEnvelope.nonce,
        sodiumLib.base64_variants.ORIGINAL,
      );
      const ciphertext = sodiumLib.from_base64(
        typedEnvelope.ciphertext,
        sodiumLib.base64_variants.ORIGINAL,
      );
      const plaintext = sodiumLib.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        ciphertext,
        encryptionAadFromObject(message),
        nonce,
        key,
      );
      const decrypted = JSON.parse(sodiumLib.to_string(plaintext));

      return {
        ...message,
        content: decrypted,
        content_encrypted: true,
      };
    } catch {
      return message;
    }
  }

  private signMessage(sodiumLib: Sodium, message: Message) {
    const seed = this.loadSigningSeed(sodiumLib);
    const keyPair = sodiumLib.crypto_sign_seed_keypair(seed);
    const signable = this.signablePayload(message);
    const signature = sodiumLib.crypto_sign_detached(signable, keyPair.privateKey);
    const publicKeyHex = sodiumLib.to_hex(keyPair.publicKey);
    const signatureBase64 = sodiumLib.to_base64(
      signature,
      sodiumLib.base64_variants.ORIGINAL,
    );
    return `ed25519:${publicKeyHex}:${signatureBase64}`;
  }

  private rememberAgentCard(card: Record<string, unknown>) {
    if (
      typeof card.agent_id === 'string' &&
      typeof card.public_key_hex === 'string' &&
      typeof card.key_id === 'string' &&
      Boolean(card.key_id.trim()) &&
      this.parseAgentId(card.agent_id)
    ) {
      this.recipientKeys[card.agent_id] = card.public_key_hex;
    }
  }

  private verifyAgentCard(sodiumLib: Sodium, card: Record<string, unknown>) {
    if (typeof card.agent_id !== 'string' || !this.parseAgentId(card.agent_id)) {
      return false;
    }
    if (typeof card.key_id !== 'string' || !card.key_id.trim()) {
      return false;
    }
    if (
      !Array.isArray(card.previous_key_ids) ||
      card.previous_key_ids.some((value) => typeof value !== 'string')
    ) {
      return false;
    }

    if (typeof card.signature !== 'string' || typeof card.public_key_hex !== 'string') {
      return false;
    }

    const parts = card.signature.split(':', 3);
    if (parts.length !== 3 || parts[0] !== 'ed25519') {
      return false;
    }

    const [, signaturePublicKeyHex, signatureBase64] = parts;
    if (signaturePublicKeyHex !== card.public_key_hex) {
      return false;
    }

    try {
      const publicKey = sodiumLib.from_hex(card.public_key_hex);
      const signature = sodiumLib.from_base64(
        signatureBase64,
        sodiumLib.base64_variants.ORIGINAL,
      );
      return sodiumLib.crypto_sign_verify_detached(
        signature,
        agentCardSignablePayload(card),
        publicKey,
      );
    } catch {
      return false;
    }
  }

  private signablePayload(message: Message) {
    return [
      message.protocol,
      message.id,
      message.thread_id,
      message.parent_id ?? '',
      message.from,
      canonicalJson(message.to),
      message.timestamp,
      message.type,
      canonicalJson(message.content),
      canonicalJson(message.encryption ?? {}),
      canonicalJson(message.views),
      canonicalJson(message.references),
      canonicalJson(message.attachments),
      String(message.store_in_relational).toLowerCase(),
    ].join('\n');
  }

  private loadSigningSeed(sodiumLib: Sodium) {
    const seed = sodiumLib.from_hex(this.signingKeyHex);
    if (seed.length !== sodiumLib.crypto_sign_SEEDBYTES) {
      throw new Error('OMNYID signing key must be a 32-byte Ed25519 seed in hex form');
    }
    return seed;
  }

  private loadEncryptionKey(sodiumLib: Sodium) {
    const key = sodiumLib.from_hex(this.encryptionKeyHex);
    if (key.length !== sodiumLib.crypto_aead_xchacha20poly1305_ietf_KEYBYTES) {
      throw new Error('OMNYID encryption key must be a 32-byte key in hex form');
    }
    return key;
  }

  private loadRecipientKeys(input: Record<string, string> | undefined) {
    if (input) {
      return { ...input };
    }

    const raw = readEnv('OMNYID_RECIPIENT_KEYS_JSON');
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('OMNYID_RECIPIENT_KEYS_JSON must decode to a JSON object');
    }

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [
        key,
        String(value),
      ]),
    );
  }

  private encryptContentForRecipients(
    sodiumLib: Sodium,
    message: Message,
    content: Record<string, unknown>,
  ): Record<string, unknown> | null {
    if (!this.signingKeyHex) {
      return null;
    }

    const contentKey = sodiumLib.randombytes_buf(
      sodiumLib.crypto_aead_xchacha20poly1305_ietf_KEYBYTES,
    );
    const recipients = this.recipientAgentIds(message).map((agentId) => {
      const publicKeyHex = this.recipientPublicKeyHex(sodiumLib, agentId);
      if (!publicKeyHex) {
        throw new Error(`Missing Omnyid public key for recipient ${agentId}`);
      }

      const curvePublicKey = sodiumLib.crypto_sign_ed25519_pk_to_curve25519(
        sodiumLib.from_hex(publicKeyHex),
      );
      const wrappedContentKey = sodiumLib.crypto_box_seal(contentKey, curvePublicKey);
      return {
        agent_id: agentId,
        public_key_hex: publicKeyHex,
        wrapped_content_key: sodiumLib.to_base64(
          wrappedContentKey,
          sodiumLib.base64_variants.ORIGINAL,
        ),
      };
    });

    const nonce = sodiumLib.randombytes_buf(
      sodiumLib.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
    );
    const ciphertext = sodiumLib.crypto_aead_xchacha20poly1305_ietf_encrypt(
      canonicalJson(content),
      encryptionAad(message),
      null,
      nonce,
      contentKey,
    );

    return {
      scheme: 'omnyid-envelope-v1',
      algorithm: 'xchacha20poly1305-ietf',
      mode: 'recipient-wrapped',
      key_wrapping: 'curve25519-sealedbox-v1',
      nonce: sodiumLib.to_base64(nonce, sodiumLib.base64_variants.ORIGINAL),
      ciphertext: sodiumLib.to_base64(ciphertext, sodiumLib.base64_variants.ORIGINAL),
      recipients,
    };
  }

  private unwrapContentKey(
    sodiumLib: Sodium,
    message: Record<string, unknown>,
    envelope: Record<string, unknown>,
  ) {
    if (!Array.isArray(envelope.recipients) || !this.signingKeyHex) {
      return null;
    }

    const seed = this.loadSigningSeed(sodiumLib);
    const signingKeyPair = sodiumLib.crypto_sign_seed_keypair(seed);
    const ownPublicKeyHex = sodiumLib.to_hex(signingKeyPair.publicKey);
    const curvePublicKey = sodiumLib.crypto_sign_ed25519_pk_to_curve25519(
      signingKeyPair.publicKey,
    );
    const curvePrivateKey = sodiumLib.crypto_sign_ed25519_sk_to_curve25519(
      signingKeyPair.privateKey,
    );

    for (const recipient of envelope.recipients) {
      if (!recipient || typeof recipient !== 'object' || Array.isArray(recipient)) {
        continue;
      }
      const entry = recipient as Record<string, unknown>;
      if (
        typeof entry.public_key_hex !== 'string' ||
        typeof entry.wrapped_content_key !== 'string'
      ) {
        continue;
      }
      if (
        entry.public_key_hex !== ownPublicKeyHex &&
        entry.agent_id !== this.agentId
      ) {
        continue;
      }

      try {
        return sodiumLib.crypto_box_seal_open(
          sodiumLib.from_base64(
            entry.wrapped_content_key,
            sodiumLib.base64_variants.ORIGINAL,
          ),
          curvePublicKey,
          curvePrivateKey,
        );
      } catch {
        return null;
      }
    }

    return null;
  }

  private recipientAgentIds(message: Message) {
    return Array.from(
      new Set([message.from, ...message.to].filter((agentId) => {
        return typeof agentId === 'string' && Boolean(this.parseAgentId(agentId));
      })),
    );
  }

  private recipientPublicKeyHex(sodiumLib: Sodium, agentId: string) {
    if (agentId === this.agentId && this.signingKeyHex) {
      const seed = this.loadSigningSeed(sodiumLib);
      return sodiumLib.to_hex(sodiumLib.crypto_sign_seed_keypair(seed).publicKey);
    }
    return this.recipientKeys[agentId] ?? null;
  }

  private agentDomainUrl(agentId: string) {
    const parsed = this.parseAgentId(agentId);
    if (!parsed) {
      return null;
    }

    const domain = parsed.domain;
    if (!domain) {
      return null;
    }

    if (domain.startsWith('localhost') || domain.startsWith('127.0.0.1')) {
      return `http://${domain}`;
    }

    return `https://${domain}`;
  }

  private parseAgentId(agentId: string) {
    const trimmed = agentId.trim();
    if (!trimmed.startsWith('agent:')) {
      return null;
    }

    const remainder = trimmed.slice('agent:'.length);
    const atIndex = remainder.indexOf('@');
    if (atIndex <= 0 || atIndex === remainder.length - 1) {
      return null;
    }

    const localpart = remainder.slice(0, atIndex);
    const domain = remainder.slice(atIndex + 1);
    if (!/^[A-Za-z0-9._+\-]+$/.test(localpart)) {
      return null;
    }
    if (domain.startsWith('.') || domain.endsWith('.')) {
      return null;
    }

    const labels = domain.split('.');
    if (labels.some((label) => !label || label.startsWith('-') || label.endsWith('-'))) {
      return null;
    }
    if (
      labels.some((label) => !/^[A-Za-z0-9-]+$/.test(label))
    ) {
      return null;
    }

    return { full: trimmed, localpart, domain };
  }

  private relayUrl() {
    if (this.url.startsWith('https://')) {
      return this.url.replace('https://', 'wss://') + '/relay/ws';
    }
    if (this.url.startsWith('http://')) {
      return this.url.replace('http://', 'ws://') + '/relay/ws';
    }
    return this.url + '/relay/ws';
  }

  private resolveTransportPreference(
    input: AgentOptions['transportPreference'],
  ): TransportPreference {
    if (input === 'auto' || input === 'webtransport' || input === 'websocket' || input === 'http') {
      return input;
    }
    const envValue = readEnv('OMNYID_TRANSPORT').toLowerCase();
    if (envValue === 'webtransport' || envValue === 'wt') {
      return 'webtransport';
    }
    if (input === 'websocket') {
      return 'websocket';
    }
    if (envValue === 'websocket' || envValue === 'ws') {
      return 'websocket';
    }
    if (envValue === 'http') {
      return 'http';
    }
    return 'auto';
  }

  private resolveDiscoveryTrustMode(
    input: AgentOptions['discoveryTrustMode'],
  ): 'strict' | 'tofu' {
    if (input === 'tofu') {
      return 'tofu';
    }
    const envValue = readEnv('OMNYID_DISCOVERY_TRUST_MODE').toLowerCase();
    if (envValue === 'tofu') {
      return 'tofu';
    }
    return 'strict';
  }

  private async resolveDiscoveryBaseUrl(domainUrl: string) {
    const delegation = await this.discoverDelegation(domainUrl);
    const server = delegation?.['afp.server'];
    if (typeof server !== 'string' || !server.trim()) {
      return domainUrl;
    }

    const trimmed = server.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const candidate = trimmed.replace(/\/+$/, '');
      return this.isAllowedDelegationTarget(domainUrl, candidate) ? candidate : domainUrl;
    }

    const candidate = `https://${trimmed}`.replace(/\/+$/, '');
    return this.isAllowedDelegationTarget(domainUrl, candidate) ? candidate : domainUrl;
  }

  private agentCardMatchesRequestedDomain(
    card: Record<string, unknown>,
    domainUrl: string,
  ) {
    if (typeof card.agent_id !== 'string') {
      return false;
    }
    const parsedAgent = this.parseAgentId(card.agent_id);
    const requestedHost = this.normalizedHost(domainUrl);
    if (!parsedAgent || !requestedHost) {
      return false;
    }
    return parsedAgent.domain === requestedHost;
  }

  private isAllowedDelegationTarget(requestedDomainUrl: string, candidateUrl: string) {
    const requestedHost = this.normalizedHost(requestedDomainUrl);
    const candidate = new URL(candidateUrl);
    if (!requestedHost || !candidate.hostname) {
      return false;
    }
    if (requestedHost === 'localhost' || requestedHost === '127.0.0.1') {
      return candidate.protocol === 'http:' || candidate.protocol === 'https:';
    }
    return candidate.protocol === 'https:';
  }

  private normalizedHost(urlOrHost: string) {
    try {
      return new URL(urlOrHost).hostname.toLowerCase();
    } catch {
      const trimmed = urlOrHost.trim().toLowerCase().replace(/\/+$/, '');
      if (!trimmed || trimmed.includes('://')) {
        return null;
      }
      return trimmed;
    }
  }

  private canTrustOnFirstUse(card: Record<string, unknown>) {
    if (typeof card.agent_id !== 'string' || typeof card.public_key_hex !== 'string') {
      return false;
    }
    const cached = this.recipientKeys[card.agent_id];
    if (!cached) {
      return true;
    }
    return cached === card.public_key_hex;
  }

  private sendViaWebSocket(payload: Message) {
    return new Promise<{ success: boolean; message_id: string }>((resolve, reject) => {
      const socket = new WebSocket(this.relayUrl());
      let settled = false;

      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({ op: 'send', message: payload }));
      });

      socket.addEventListener('message', (messageEvent) => {
        const raw = String(messageEvent.data);
        try {
          const event = JSON.parse(raw) as RelayEvent & {
            message?: string;
            success?: boolean;
          };
          if (event.event === 'ack') {
            settled = true;
            socket.close();
            resolve({
              success: Boolean(event.success),
              message_id: event.message_id ?? payload.id,
            });
            return;
          }
          if (event.event === 'error') {
            settled = true;
            socket.close();
            reject(new Error(event.message ?? raw));
          }
        } catch {
          // Ignore relay broadcast frames until an ack or error arrives.
        }
      });

      socket.addEventListener('error', () => {
        if (!settled) {
          settled = true;
          reject(new Error('WebSocket send failed'));
        }
      });

      socket.addEventListener('close', () => {
        if (!settled) {
          reject(new Error('WebSocket relay closed before ack'));
        }
      });
    });
  }

  private async sendViaHttp(payload: Message) {
    const res = await fetch(`${this.url}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  private async resolveSendTransportPlan(): Promise<Array<'webtransport' | 'websocket' | 'http'>> {
    switch (this.transportPreference) {
      case 'webtransport':
        return ['webtransport', 'websocket', 'http'];
      case 'websocket':
        return ['websocket', 'http'];
      case 'http':
        return ['http'];
      case 'auto':
      default: {
        const capabilities = await this.safeTransportCapabilities();
        if (capabilities?.public_transport?.primary === 'webtransport') {
          return ['webtransport', 'websocket', 'http'];
        }
        return ['websocket', 'http'];
      }
    }
  }

  private async safeTransportCapabilities() {
    try {
      return await this.getTransportCapabilities();
    } catch {
      return null;
    }
  }

  private webTransportUrl() {
    try {
      const parsed = new URL(this.url);
      parsed.protocol = parsed.protocol === 'https:' ? 'https:' : 'http:';
      parsed.hostname = parsed.hostname === 'api.omnyid.com' ? 'wt.omnyid.com' : parsed.hostname;
      parsed.pathname = '/relay/wt';
      return parsed.toString();
    } catch {
      return this.url + '/relay/wt';
    }
  }

  private webTransportConstructor(): WebTransportConstructorLike | null {
    const scope = globalThis as typeof globalThis & {
      WebTransport?: WebTransportConstructorLike;
    };
    return scope.WebTransport ?? null;
  }

  private async sendViaWebTransport(payload: Message) {
    const WebTransportCtor = this.webTransportConstructor();
    if (!WebTransportCtor) {
      throw new Error('WebTransport is not available in this runtime');
    }

    const transport = new WebTransportCtor(this.webTransportUrl());
    await transport.ready;
    if (!transport.createBidirectionalStream) {
      throw new Error('WebTransport bidirectional streams are unavailable');
    }

    const stream = await transport.createBidirectionalStream();
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    await writer.write(encoder.encode(JSON.stringify({ op: 'send', message: payload })));
    await writer.close();

    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        chunks.push(value);
      }
    }

    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const raw = decoder.decode(merged);
    if (!raw.trim()) {
      throw new Error('WebTransport relay returned an empty response');
    }

    try {
      const event = JSON.parse(raw) as RelayEvent & {
        message?: string;
        success?: boolean;
      };
      if (event.event === 'ack') {
        return {
          success: Boolean(event.success),
          message_id: event.message_id ?? payload.id,
        };
      }
      if (event.event === 'error') {
        throw new Error(event.message ?? raw);
      }
    } catch (err) {
      if (err instanceof Error) {
        throw err;
      }
    }

    throw new Error('WebTransport relay returned an unsupported response');
  }

  private async subscribeThreadViaWebTransport(
    threadId: string,
    onEvent: (event: RelayEvent & { messages?: unknown[] }) => void,
    includeSnapshot: boolean,
  ): Promise<RelaySubscriptionHandle> {
    const WebTransportCtor = this.webTransportConstructor();
    if (!WebTransportCtor) {
      throw new Error('WebTransport is not available in this runtime');
    }

    const transport = new WebTransportCtor(this.webTransportUrl());
    await transport.ready;
    if (!transport.createBidirectionalStream) {
      throw new Error('WebTransport bidirectional streams are unavailable');
    }

    const stream = await transport.createBidirectionalStream();
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    await writer.write(
      encoder.encode(
        JSON.stringify({
          op: 'subscribe_thread',
          thread_id: threadId,
          include_snapshot: includeSnapshot,
        }),
      ),
    );
    await writer.close();

    let pending = '';
    let closed = false;

    void (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          if (!value) {
            continue;
          }

          pending += decoder.decode(value, { stream: true });
          const lines = pending.split('\n');
          pending = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
              continue;
            }
            try {
              onEvent(JSON.parse(trimmed) as RelayEvent & { messages?: unknown[] });
            } catch {
              onEvent({ event: 'raw', payload: trimmed });
            }
          }
        }

        const trailing = pending.trim();
        if (trailing) {
          try {
            onEvent(JSON.parse(trailing) as RelayEvent & { messages?: unknown[] });
          } catch {
            onEvent({ event: 'raw', payload: trailing });
          }
        }
      } finally {
        closed = true;
      }
    })();

    return {
      async close() {
        if (closed) {
          return;
        }
        transport.close?.({ closeCode: 0, reason: 'thread subscription closed' });
        await transport.closed.catch(() => undefined);
      },
    };
  }
}

export * from './workflows.js';
