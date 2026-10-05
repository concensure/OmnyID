import assert from "node:assert/strict";
import test from "node:test";

import { persistWeddingVendorOutreachDraftBeforeDisplay } from "@/lib/weddingVendorOutreachDraftPersistenceState";

test("an outreach draft becomes visible only after its AFP append resolves", async () => {
  const events: string[] = [];
  let releasePersistence: (() => void) | undefined;
  const completed = persistWeddingVendorOutreachDraftBeforeDisplay({
    draft: { id: "draft-1" },
    persist: async () => {
      events.push("persist:start");
      await new Promise<void>((resolve) => { releasePersistence = resolve; });
      events.push("persist:complete");
    },
    display: () => events.push("display"),
  });

  await Promise.resolve();
  assert.deepEqual(events, ["persist:start"]);
  releasePersistence?.();
  await completed;
  assert.deepEqual(events, ["persist:start", "persist:complete", "display"]);
});

test("a rejected append never exposes a sendable draft", async () => {
  let displayed = false;
  await assert.rejects(
    persistWeddingVendorOutreachDraftBeforeDisplay({
      draft: { id: "draft-1" },
      persist: async () => { throw new Error("offline"); },
      display: () => { displayed = true; },
    }),
    /offline/,
  );
  assert.equal(displayed, false);
});
