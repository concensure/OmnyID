// @module-id: wedding.vendor-quote-acceptance-owner
// @primary-capability: connected-wedding-quote-acceptance
// @locs-version: 1.0
import { createMemo, type Accessor } from "solid-js";

import type { SendAfpMessageInput } from "@/lib/api";
import type { WeddingArtifactQuotePreview } from "@/lib/weddingArtifactPreviewState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import { weddingVendorQuoteAcceptanceToAfpSendInput } from "@/lib/weddingVendorQuoteAcceptanceState";
import { findWeddingVendorLifecycle, projectWeddingVendorLifecycle } from "@/lib/weddingVendorLifecycleState";

export function useWeddingVendorQuoteAcceptanceOwner(input: {
  state: Accessor<WeddingResponseWorkspaceViewState>;
  saveProjection?: ((message: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefresh?: (() => void) | null;
  onNotice: (notice: string) => void;
}) {
  const lifecycle = createMemo(() => projectWeddingVendorLifecycle(input.state().afpMessages));
  const isAccepted = (vendorName: string) => Boolean(findWeddingVendorLifecycle({ records: lifecycle(), vendorName })?.quoteAccepted);
  const accept = async (quote: WeddingArtifactQuotePreview, sourceId: string): Promise<void> => {
    if (!input.saveProjection) return;
    if (isAccepted(quote.vendorName)) {
      input.onNotice(`${quote.vendorName}'s quote is already accepted.`);
      return;
    }
    if (!window.confirm(`Accept ${quote.vendorName}'s ${quote.amountLabel} quote? This records the vendor decision and budget commitment. It does not sign a contract, pay a deposit, or send a message.`)) return;
    await input.saveProjection(weddingVendorQuoteAcceptanceToAfpSendInput({ metadata: input.state().workspace.metadata, quote, sourceId }));
    input.onNotice(`${quote.vendorName}'s quote was accepted. The vendor decision and budget commitment now use the same record.`);
    input.onRefresh?.();
  };
  return { accept, isAccepted };
}
