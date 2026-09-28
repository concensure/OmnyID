// @locs-version: 1.0
import type { SendAfpMessageInput } from "@/lib/api";
import type { GmailConnectionStatus } from "@/lib/gmailConnectionState";
import type { WeddingApprovalExecutionHandlers } from "@/lib/weddingApprovalExecutionState";
import type { WeddingProjectionDispatchReceiptState } from "@/lib/weddingProjectionDispatchState";
import type {
  WeddingResponseWorkspaceViewState,
  WeddingWorkspaceFilterChip,
} from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingRichResponseAction, WeddingRichResponseRendererState } from "@/lib/weddingRichResponseRendererState";
import type { WeddingVendorEndToEndValidationState } from "@/lib/weddingVendorEndToEndValidationState";
import type { WeddingLiveWorkflowReadinessState } from "@/lib/weddingLiveWorkflowReadinessState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";
import type { WeddingVendorSearchResultAction } from "@/lib/weddingVendorSearchResultActionState";
import type { ViewName } from "@/lib/viewNames";

export type WeddingProjectionSaveFn = (input: SendAfpMessageInput) => Promise<unknown>;
export type WeddingWorkspaceRefreshTone = "idle" | "loading" | "success" | "warning";

export type WeddingResponseWorkspaceViewProps = {
  state: WeddingResponseWorkspaceViewState;
  query?: string | null;
  refreshState?: {
    label: string;
    detail: string;
    tone: WeddingWorkspaceRefreshTone;
    disabled?: boolean;
  } | null;
  saveProjection?: WeddingProjectionSaveFn | null;
  approvalHandlers?: WeddingApprovalExecutionHandlers | null;
  gmailStatus?: GmailConnectionStatus | null;
  projectionStorage?: Storage | null;
  contactUserId?: string | null;
  importNotice?: string | null;
  importRunning?: boolean | null;
  activeMenu?: WeddingWorkspaceMenuId;
  sharePlanOpen?: boolean;
  onToggleSharePlan?: () => void;
  onImportFiles?: (files: FileList) => void;
  compact?: boolean;
  onQueryChange?: (query: string) => void;
  onRefreshWorkspace?: () => void;
  onAdminDataConsentChange?: (enabled: boolean) => void;
  onSelectArtifact?: (artifactId: string) => void;
  onFilterChip?: (chip: WeddingWorkspaceFilterChip) => void;
  onSidebarAction?: (action: WeddingWorkspaceSidebarAction) => void;
  onProjectionDispatched?: (receipt: WeddingProjectionDispatchReceiptState) => void;
  onReviewBlockedOutputs?: () => void;
  onOpenSavedOutputs?: () => void;
  onProviderSetup?: (view: ViewName) => void;
  onRunLiveVendorSearch?: () => void;
  vendorSearchRunning?: boolean;
  vendorSearchNotice?: string | null;
  vendorSearchQuery?: string | null;
  vendorSearchQuerySourceLabel?: string | null;
  vendorSearchResultAction?: WeddingVendorSearchResultAction | null;
  onVendorSearchQueryChange?: (query: string) => void;
  vendorSearchReadiness?: WeddingLiveWorkflowReadinessState | null;
  vendorSearchBlockedReason?: string | null;
  onRunLiveEvidenceCheck?: () => void;
  liveEvidenceRunning?: boolean;
  liveEvidenceNotice?: string | null;
  liveEvidenceReadiness?: WeddingLiveWorkflowReadinessState | null;
  vendorSmokeTestAvailable?: boolean;
  vendorSmokeTestVendorEmail?: string | null;
  vendorEndToEndValidation?: WeddingVendorEndToEndValidationState | null;
  onInstallVendorSmokeFixture?: () => void;
  onRemoveVendorSmokeFixture?: () => void;
  onSelectMenu?: (menu: WeddingWorkspaceMenuId) => void;
  onSaveWeddingDate?: (date: string) => Promise<void> | void;
  richResponse?: WeddingRichResponseRendererState | null;
  onRichResponseAction?: (action: WeddingRichResponseAction) => void;
};
