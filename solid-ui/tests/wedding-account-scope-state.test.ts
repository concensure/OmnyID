import assert from "node:assert/strict";
import test from "node:test";

import { emptyWeddingBudgetAllocationDraft, loadWeddingBudgetAllocationDraft, saveWeddingBudgetAllocationDraft } from "@/lib/weddingBudgetAllocationState";
import { loadLocalWeddingDate, saveLocalWeddingDate } from "@/lib/weddingDateCaptureState";
import { setWeddingLocalAccountScope } from "@/lib/weddingLocalAccountScope";
import { hasSentWeddingProjection, markWeddingProjectionSent, WEDDING_TASK_AFP_PROJECTIONS_KEY } from "@/lib/weddingProjectionStorageState";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } as Storage;
}

test("Wedding budget, date, and AFP fallback receipts remain isolated when starter ids are shared", () => {
  const storage = memoryStorage();
  const planId = "wedding_plan:starter";
  const workspaceId = "response_workspace:starter";
  const draft = emptyWeddingBudgetAllocationDraft();
  draft.totalAmount = 42_000;

  setWeddingLocalAccountScope("account-a");
  saveWeddingBudgetAllocationDraft(planId, draft, storage);
  saveLocalWeddingDate(workspaceId, "2027-11-10", storage);
  markWeddingProjectionSent("task:venue", WEDDING_TASK_AFP_PROJECTIONS_KEY, storage);

  setWeddingLocalAccountScope("account-b");
  assert.equal(loadWeddingBudgetAllocationDraft(planId, storage), null);
  assert.equal(loadLocalWeddingDate(workspaceId, storage), null);
  assert.equal(hasSentWeddingProjection("task:venue", WEDDING_TASK_AFP_PROJECTIONS_KEY, storage), false);

  setWeddingLocalAccountScope("account-a");
  assert.equal(loadWeddingBudgetAllocationDraft(planId, storage)?.totalAmount, 42_000);
  assert.equal(loadLocalWeddingDate(workspaceId, storage), "2027-11-10");
  assert.equal(hasSentWeddingProjection("task:venue", WEDDING_TASK_AFP_PROJECTIONS_KEY, storage), true);
  setWeddingLocalAccountScope(null);
});
