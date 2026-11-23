// @locs-version: 1.0
import { fetchThread } from "@/lib/api";
import type { WeddingApprovalExecutionState } from "@/lib/weddingApprovalExecutionState";
import { runWeddingApprovalExecution } from "@/lib/weddingApprovalExecutionState";
import type { WeddingApprovalRequestState } from "@/lib/weddingApprovalState";
import {
  weddingApprovalReceiptToAfpSendInput,
  weddingApprovalReceiptToVendorThreadAfpSendInput,
} from "@/lib/weddingApprovalReceiptAfpProjectionState";
import { weddingVendorQuoteReceiptParentId } from "@/lib/weddingVendorQuoteThreadProofState";
import { weddingVendorQuoteReceiptPersistenceNotice } from "@/lib/weddingVendorQuoteReceiptPersistenceState";
import type { WeddingProjectionSaveFn } from "@/components/WeddingResponseWorkspaceViewTypes";

type WeddingApprovalHandlers = Parameters<typeof runWeddingApprovalExecution>[0]["handlers"];

export type WeddingApprovalExecutionOwner = {
  isRunning: () => boolean;
  setRunning: (running: boolean) => void;
  setRunningRequestId: (requestId: string | null) => void;
  approvedRequest: (request: WeddingApprovalRequestState) => WeddingApprovalRequestState;
  handlers: WeddingApprovalHandlers;
  setReceipt: (receipt: WeddingApprovalExecutionState) => void;
  rememberQuoteExecution: (requestId: string, result: WeddingApprovalExecutionState) => void;
  clearQuoteExecutionTombstone: (requestId: string) => void;
  saveProjection?: WeddingProjectionSaveFn | null;
  setSaveNotice: (request: WeddingApprovalRequestState, notice: string) => void;
};

export function useWeddingApprovalExecution(owner: WeddingApprovalExecutionOwner) {
  return async function executeRequest(request: WeddingApprovalRequestState): Promise<void> {
    if (owner.isRunning()) return;
    owner.setRunning(true);
    owner.setRunningRequestId(request.id);
    try {
      const result = await runWeddingApprovalExecution({
        request: owner.approvedRequest(request),
        handlers: owner.handlers,
      });
      owner.setReceipt(result);
      if (request.delivery?.threadId) {
        owner.rememberQuoteExecution(request.id, result);
        owner.clearQuoteExecutionTombstone(request.id);
      }
      if (!owner.saveProjection) {
        owner.setSaveNotice(request, weddingVendorQuoteReceiptPersistenceNotice("account_save_unavailable"));
        return;
      }
      try {
        await owner.saveProjection(weddingApprovalReceiptToAfpSendInput(result.receipt));
        const vendorThreadId = request.delivery?.threadId ?? null;
        let vendorThreadParentId: string | null = null;
        if (vendorThreadId && result.status === "executed") {
          try {
            vendorThreadParentId = weddingVendorQuoteReceiptParentId(await fetchThread(vendorThreadId), request.id);
          } catch {
            vendorThreadParentId = null;
          }
        }
        const vendorThreadReceipt = vendorThreadId && result.status === "executed"
          ? weddingApprovalReceiptToVendorThreadAfpSendInput(result.receipt, {
            threadId: vendorThreadId,
            parentId: vendorThreadParentId,
          })
          : null;
        if (vendorThreadReceipt) {
          try {
            await owner.saveProjection(vendorThreadReceipt);
            owner.setSaveNotice(request, weddingVendorQuoteReceiptPersistenceNotice("approval_saved_vendor_thread_saved"));
          } catch {
            owner.setSaveNotice(request, weddingVendorQuoteReceiptPersistenceNotice("approval_saved_vendor_thread_failed"));
          }
        } else if (vendorThreadId && result.status === "executed") {
          owner.setSaveNotice(request, weddingVendorQuoteReceiptPersistenceNotice("approval_saved_vendor_thread_skipped"));
        } else {
          owner.setSaveNotice(request, weddingVendorQuoteReceiptPersistenceNotice("approval_saved"));
        }
      } catch {
        owner.setSaveNotice(request, weddingVendorQuoteReceiptPersistenceNotice("approval_save_failed"));
      }
    } finally {
      owner.setRunning(false);
      owner.setRunningRequestId(null);
    }
  };
}
