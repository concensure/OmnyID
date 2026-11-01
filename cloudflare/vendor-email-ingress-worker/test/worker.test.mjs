import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canonicalRequest,
  classifyGatewayStatus,
  cloudflareDmarcPassed,
  deterministicEventId,
  hmacSha256Hex,
  processEmail,
  sha256Hex,
} from "../src/index.mjs";

const SECRET = "0123456789abcdef0123456789abcdef";

function mockMessage(raw = "Subject: Test\r\nMessage-ID: <abc@example.com>\r\n\r\nHello") {
  const bytes = new TextEncoder().encode(raw);
  const rejects = [];
  return {
    from: "Sender@Example.com",
    to: "vendor_mosman@omnyid.com",
    rawSize: bytes.byteLength,
    raw: new Blob([bytes]).stream(),
    headers: new Headers({ "Message-ID": "<abc@example.com>" }),
    setReject(reason) {
      rejects.push(reason);
    },
    rejects,
  };
}

function env(overrides = {}) {
  return {
    GATEWAY_URL: "https://api.omnyid.com/integrations/vendor-email/cloudflare/inbound",
    KEY_ID: "primary-v1",
    INGRESS_SHARED_SECRET: SECRET,
    MAX_RAW_BYTES: "10485760",
    GATEWAY_TIMEOUT_MS: "1000",
    OPERATOR_ALIASES: "hello@omnyid.com,info@omnyid.com,wedding@omnyid.com,privacy@omnyid.com",
    ...overrides,
  };
}

test("operator aliases require Cloudflare's first DMARC result", async () => {
  assert.equal(cloudflareDmarcPassed(new Headers({
    "Authentication-Results": "mx.cloudflare.net; spf=pass; dkim=pass; dmarc=pass",
  })), true);
  assert.equal(cloudflareDmarcPassed(new Headers({
    "Authentication-Results": "attacker.invalid; dmarc=pass",
  })), false);
  assert.equal(cloudflareDmarcPassed(new Headers({
    "Authentication-Results": "mx.cloudflare.net; spf=pass; dmarc=fail",
  })), false);

  const refused = mockMessage("Authentication-Results: attacker.invalid; dmarc=pass\r\n\r\nHello");
  refused.to = "hello@omnyid.com";
  refused.headers = new Headers({
    "Message-ID": "<abc@example.com>",
    "Authentication-Results": "attacker.invalid; dmarc=pass",
  });
  let fetched = false;
  const result = await processEmail(refused, env(), async () => {
    fetched = true;
    return new Response(null, { status: 202 });
  });
  assert.equal(result.reason, "dmarc_not_passed");
  assert.equal(fetched, false);
  assert.deepEqual(refused.rejects, ["Message cannot be accepted"]);
});

test("digest and deterministic event identity are stable", async () => {
  const bodyDigest = await sha256Hex(new TextEncoder().encode("message"));
  const first = await deterministicEventId({
    from: "Sender@Example.com",
    to: "VENDOR_MOSMAN@OMNYID.COM",
    messageId: "<ABC@EXAMPLE.COM>",
    bodyDigest,
  });
  const second = await deterministicEventId({
    from: "sender@example.com",
    to: "vendor_mosman@omnyid.com",
    messageId: "abc@example.com",
    bodyDigest,
  });
  assert.match(first, /^[a-f0-9]{64}$/u);
  assert.equal(first, second);
});

test("canonical signature binds every routing field", async () => {
  const fields = {
    keyId: "primary-v1",
    timestamp: "1792890000",
    nonce: "a".repeat(32),
    eventId: "b".repeat(64),
    fromEncoded: "c2VuZGVyQGV4YW1wbGUuY29t",
    toEncoded: "dmVuZG9yQG9tbnlpZC5jb20",
    bodyDigest: "c".repeat(64),
    rawSize: "123",
  };
  const canonical = canonicalRequest(fields);
  assert.equal(canonical.split("\n").length, 9);
  assert.notEqual(
    await hmacSha256Hex(SECRET, canonical),
    await hmacSha256Hex(SECRET, canonicalRequest({ ...fields, rawSize: "124" })),
  );
});

test("accepted delivery sends exact bytes and required headers", async () => {
  const message = mockMessage();
  let request;
  const result = await processEmail(message, env(), async (url, init) => {
    request = { url, init };
    return new Response(null, { status: 202 });
  });
  assert.equal(result.status, "accepted");
  assert.equal(message.rejects.length, 0);
  assert.equal(request.url, env().GATEWAY_URL);
  assert.equal(request.init.headers.get("X-OmnyID-Email-Version"), "1");
  assert.match(request.init.headers.get("X-OmnyID-Email-Signature"), /^[a-f0-9]{64}$/u);
  assert.equal(request.init.body.byteLength, message.rawSize);
});

test("oversized mail is rejected before fetch", async () => {
  const message = mockMessage("small");
  message.rawSize = 11;
  let fetched = false;
  const result = await processEmail(message, env({ MAX_RAW_BYTES: "10" }), async () => {
    fetched = true;
    return new Response(null, { status: 202 });
  });
  assert.equal(result.reason, "message_too_large");
  assert.equal(fetched, false);
  assert.deepEqual(message.rejects, ["Message cannot be accepted"]);
});

test("configured size limit cannot exceed the reviewed ten MiB ceiling", async () => {
  const message = mockMessage("small");
  message.rawSize = 10 * 1024 * 1024 + 1;
  let fetched = false;
  await processEmail(message, env({ MAX_RAW_BYTES: "999999999" }), async () => {
    fetched = true;
    return new Response(null, { status: 202 });
  });
  assert.equal(fetched, false);
});

test("permanent responses reject generically and transient responses throw", async () => {
  const rejected = mockMessage();
  const result = await processEmail(rejected, env(), async () => new Response(null, { status: 404 }));
  assert.equal(result.reason, "gateway_rejected");
  assert.deepEqual(rejected.rejects, ["Message cannot be accepted"]);

  await assert.rejects(
    processEmail(mockMessage(), env(), async () => new Response(null, { status: 503 })),
    /gateway_temporarily_unavailable/u,
  );
  assert.equal(classifyGatewayStatus(429), "transient");
});

test("wrangler config cannot create or take over routing rules", async () => {
  const config = JSON.parse(
    await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
  );
  assert.equal(Object.hasOwn(config, "addresses"), false);
  assert.equal(config.observability.enabled, false);
});
