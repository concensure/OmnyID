import test from "node:test";
import assert from "node:assert/strict";

import { createDecisionOsHomeBridgeController } from "../src/lib/decisionOsHomeBridgeController.ts";

test("decisionos home bridge controller wires listeners, tick timer, and disposal", () => {
  const windowAdds: Array<{ name: string; handler: unknown }> = [];
  const windowRemoves: Array<{ name: string; handler: unknown }> = [];
  const documentAdds: Array<{ name: string; handler: unknown }> = [];
  const documentRemoves: Array<{ name: string; handler: unknown }> = [];
  const cleared: unknown[] = [];

  let scheduledTick: (() => void) | null = null;
  let disposed = false;

  const controller = createDecisionOsHomeBridgeController({
    windowTarget: {
      addEventListener(name, handler) {
        windowAdds.push({ name, handler });
      },
      removeEventListener(name, handler) {
        windowRemoves.push({ name, handler });
      },
    },
    documentTarget: {
      addEventListener(name, handler) {
        documentAdds.push({ name, handler });
      },
      removeEventListener(name, handler) {
        documentRemoves.push({ name, handler });
      },
    },
    onUpdateDetail() {},
    onFocusDetail() {},
    onKeyDown() {},
    onMagicDetail() {},
    onTick() {},
    onDispose() {
      disposed = true;
    },
    tickMs: 1234,
    setIntervalFn(callback, delayMs) {
      assert.equal(delayMs, 1234);
      scheduledTick = callback;
      return "tick-id";
    },
    clearIntervalFn(id) {
      cleared.push(id);
    },
  });

  assert.equal(windowAdds.length, 3);
  assert.deepEqual(windowAdds.map((entry) => entry.name), ["omnyid:decision-os-update", "omnyid:decision-os-focus", "keydown"]);
  assert.equal(documentAdds.length, 1);
  assert.equal(documentAdds[0]?.name, "magic-action");
  assert.equal(typeof scheduledTick, "function");

  controller.dispose();

  assert.equal(windowRemoves.length, 3);
  assert.deepEqual(windowRemoves.map((entry) => entry.name), ["omnyid:decision-os-update", "omnyid:decision-os-focus", "keydown"]);
  assert.equal(documentRemoves.length, 1);
  assert.equal(documentRemoves[0]?.name, "magic-action");
  assert.deepEqual(cleared, ["tick-id"]);
  assert.equal(disposed, true);
});
