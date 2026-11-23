import assert from "node:assert/strict";
import test from "node:test";

import {
  listWeddingRsvpCapabilities,
  loadWeddingRsvpCapabilityStatus,
  revokeWeddingRsvpCapability,
} from "../src/lib/weddingRsvpCapabilityApi.ts";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

test("couple-side RSVP capability requests always bind the exact Wedding scope", async () => {
  const priorWindow = globalThis.window;
  const priorFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: unknown }> = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage() },
  });
  globalThis.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    const response = String(input).endsWith("/revoke") ? {} : [];
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await loadWeddingRsvpCapabilityStatus("plan one", "workspace/one");
    await listWeddingRsvpCapabilities("plan one", "workspace/one");
    await revokeWeddingRsvpCapability({
      grantId: "grant/one",
      weddingPlanId: "plan one",
      responseWorkspaceId: "workspace/one",
    });
  } finally {
    globalThis.fetch = priorFetch;
    Object.defineProperty(globalThis, "window", { configurable: true, value: priorWindow });
  }

  assert.deepEqual(requests, [
    {
      url: "/wedding/rsvp/capabilities/status?wedding_plan_id=plan+one&response_workspace_id=workspace%2Fone",
      body: null,
    },
    {
      url: "/wedding/rsvp/capabilities?wedding_plan_id=plan+one&response_workspace_id=workspace%2Fone",
      body: null,
    },
    {
      url: "/wedding/rsvp/capabilities/grant%2Fone/revoke",
      body: { wedding_plan_id: "plan one", response_workspace_id: "workspace/one" },
    },
  ]);
});
