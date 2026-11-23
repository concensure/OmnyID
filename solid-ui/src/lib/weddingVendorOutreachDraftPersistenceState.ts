// @locs-version: 1.0

/**
 * Commits an outreach draft before its caller can expose that draft for editing
 * or sending. The callbacks make the durability boundary explicit and testable.
 */
export async function persistWeddingVendorOutreachDraftBeforeDisplay<T>(input: {
  draft: T;
  persist: (draft: T) => Promise<unknown>;
  display: (draft: T) => void;
}): Promise<void> {
  await input.persist(input.draft);
  input.display(input.draft);
}
