// @locs-version: 1.0
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { ViewName } from "@/lib/viewNames";
import { EmptyState } from "@/components/EmptyState";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { RailIcon } from "@/components/RailIcons";
import {
  getBillingStatus,
  PARA_PREFIX,
  approveAutoArchive,
  archiveParaItem,
  classifyParaItem,
  cleanupIngestedAttachments,
  exportParaSection,
  fetchAutoArchiveCandidates,
  fetchParaArchived,
  fetchParaItems,
  fetchAttachmentIngestCapabilities,
  ingestAttachmentBatch,
  persistIngestedAttachments,
  sendNoteMessage,
  uploadFilePayload,
  type ArchiveRow,
  type AttachmentIngestCapabilities,
  type AttachmentRetentionMode,
  type AutoArchiveCandidate,
  type BillingStatus,
  type KnowledgeOrganizationMode,
  type ParaClassification,
  type ParaSectionKind,
} from "@/lib/api";
import { extractInlineKnowledgeText } from "@/lib/knowledgeAttachmentExtract";
import { summarizeKnowledgeAttachmentSupport } from "@/lib/knowledgeAttachmentSupportSummary";
import {
  buildParaImportClassificationTags,
  formatParaImportKnowledgeModeLabel,
  formatParaImportRetentionModeLabel,
  paraTagsIncludePermanentNote,
  paraTagsIncludeReviewPending,
  paraTagsIncludeSourceNote,
  paraTagsMatchResourceLens,
  type ParaResourceLens,
} from "@/lib/paraImportMode";
import {
  ATTACHMENT_RETENTION_OPTIONS,
  KNOWLEDGE_MODE_OPTIONS,
  attachmentRetentionOutcome,
  attachmentRetentionSummary,
  combinedKnowledgePolicySummary,
  knowledgeModeSummary,
} from "@/lib/knowledgeIngestPolicy";
import {
  evaluateParaUploadPreflight,
  hasMountedParaStorageSummary,
  hasMountedParaUploadPolicy,
  paraUploadStorageSummary,
  readMountedWarningText,
} from "@/lib/paraUploadPolicy";
import {
  buildParaFailureReceipt,
  type ParaFailureReceipt,
} from "@/lib/paraFailureState";

interface PARAViewProps {
  token: string;
  onNavigate: (view: ViewName) => void;
}

const PARA_SECTIONS: { kind: ParaSectionKind; label: string; desc: string }[] = [
  { kind: "project", label: "Projects", desc: "Active work with a deadline" },
  { kind: "area", label: "Areas", desc: "Ongoing responsibilities" },
  { kind: "resource", label: "Resources", desc: "Reference material and notes" },
  { kind: "archive", label: "Archive", desc: "Completed or inactive items" },
];

const ARCHIVE_REASONS = ["completed", "reference", "low_priority", "superseded", "inactive", "migrated"] as const;
const DEFAULT_ARCHIVE_REASON = "completed";
const PARA_UPLOAD_STATUS = {
  complete: "Upload complete.",
  refreshFailed: "Upload complete. Storage policy refresh failed after the last upload.",
  policyRefreshing: "Upload complete. Storage policy refresh still needs retry after the last upload.",
  usageRefreshing: "Upload complete. Storage usage data is still refreshing after the last upload.",
  refreshingAfterUpload: "Storage policy refresh is still in progress after the last upload...",
} as const;

function tagLabel(tag: string): string {
  const idx = tag.indexOf(":");
  return idx >= 0 ? tag.slice(idx + 1).replace(/_/g, " ") : tag;
}

function makeTag(section: Exclude<ParaSectionKind, "archive">, label: string): string {
  return `${section}:${label.toLowerCase().replace(/\s+/g, "_")}`;
}

function normalizeParaTargetId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAutoArchiveCandidateIds(candidates: AutoArchiveCandidate[]): string[] {
  return [
    ...new Set(
      candidates
        .map((candidate) => (typeof candidate.target_id === "string" ? candidate.target_id.trim() : ""))
        .filter(Boolean),
    ),
  ];
}

function readAutoArchiveCandidateDateLabel(value: unknown): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed.slice(0, 10) : "Date unavailable";
}

function readParaItemDateLabel(...values: unknown[]): string {
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed) return trimmed.slice(0, 10);
  }
  return "Date unavailable";
}

function readMountedParaText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readParaTargetLabel(value: unknown): string {
  return normalizeParaTargetId(value) || "Item unavailable";
}

function readMountedParaTags(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean),
    ),
  ];
}

function readParaTagLabel(value: unknown): string {
  const mountedTag = typeof value === "string" ? value.trim() : "";
  const label = mountedTag ? tagLabel(mountedTag).trim() : "";
  return label || "untitled";
}

function buildAppliedRefreshWarning(actionLabel: string): ParaFailureReceipt {
  return {
    title: `${actionLabel} applied, but the PARA view could not refresh`,
    summary: "The change was sent successfully, but the latest PARA section snapshot could not be confirmed afterward.",
    nextStep: "Retry the same PARA section refresh. If the item state still looks stale, reopen the section after connectivity recovers.",
    tone: "warning",
  };
}

function isAppliedRefreshWarning(receipt: ParaFailureReceipt | null): boolean {
  return receipt?.title.endsWith("applied, but the PARA view could not refresh") ?? false;
}

function isRefreshSectionReceipt(receipt: ParaFailureReceipt | null): boolean {
  return receipt?.title.startsWith("Refresh PARA section ") ?? false;
}

function isStorageRefreshFailureReceipt(receipt: ParaFailureReceipt | null): boolean {
  return receipt?.title.startsWith("Refresh storage policy ") ?? false;
}

function isStoragePolicyLoadReceipt(receipt: ParaFailureReceipt | null): boolean {
  return receipt?.title.startsWith("Load storage policy ") ?? false;
}

function buildUnavailableArchiveTargetReceipt(): ParaFailureReceipt {
  return {
    title: "No trusted archive target is currently available",
    summary: "The mounted archive target disappeared before this archive action could be submitted.",
    nextStep: "Close this modal to reopen the archive flow after the archive target becomes available again.",
    tone: "warning",
  };
}

function buildInvalidArchiveReasonReceipt(): ParaFailureReceipt {
  return {
    title: "The archive reason is no longer valid",
    summary: "The selected archive reason is no longer supported for this archive action.",
    nextStep: "Select a supported archive reason before submitting again.",
    tone: "warning",
  };
}

function buildStaleReviewQueueReceipt(): ParaFailureReceipt {
  return {
    title: "The review queue is stale",
    summary: "The mounted review queue changed before this review action could be submitted.",
    nextStep: "Refresh the stale review queue.",
    tone: "warning",
  };
}

function buildUnavailableReviewQueueReceipt(): ParaFailureReceipt {
  return {
    title: "No trusted review rows are currently available",
    summary: "The mounted review queue no longer contains any trusted rows for this review action.",
    nextStep: "Refresh the unavailable review queue.",
    tone: "warning",
  };
}

function buildStaleReviewSnapshotReceipt(): ParaFailureReceipt {
  return {
    title: "The review queue snapshot is partially unavailable",
    summary: "Some mounted review rows changed before this review action could be submitted.",
    nextStep: "Refresh the review queue for the stale review snapshot.",
    tone: "warning",
  };
}

function buildUnavailableReviewSnapshotReceipt(): ParaFailureReceipt {
  return {
    title: "The review queue snapshot is unavailable",
    summary: "No mounted review rows remain trusted for this review action.",
    nextStep: "Refresh the review queue for the unavailable review snapshot.",
    tone: "warning",
  };
}

function buildArchiveReviewFailureReceipt(message: string): ParaFailureReceipt {
  return {
    title: "Archive review could not be completed",
    summary: message,
    nextStep: "Refresh the review queue for archive review.",
    tone: "warning",
  };
}

function isArchiveReviewFailureReceipt(receipt: ParaFailureReceipt | null): boolean {
  return receipt?.title === "Archive review could not be completed";
}

function buildArchiveFlowFailureReceipt(message: string): ParaFailureReceipt {
  return {
    title: "Archive item could not be archived",
    summary: message,
    nextStep: "Close this modal to reopen the archive flow after the section refreshes.",
    tone: "warning",
  };
}

function isArchiveFlowFailureReceipt(receipt: ParaFailureReceipt | null): boolean {
  return (
    receipt?.title === "Archive item could not be archived" ||
    receipt?.title === "The archive flow could not be completed"
  );
}

function buildReviewLoadFailureReceipt(message: string, hasMountedQueue: boolean, mountedQueueCount: number): ParaFailureReceipt {
  if (!hasMountedQueue) {
    return mountedQueueCount > 0
      ? {
          title: "The review queue is stale",
          summary: message,
          nextStep: "Refresh the stale review queue.",
          tone: "warning",
        }
      : {
          title: "The review queue is unavailable",
          summary: message,
          nextStep: "Refresh the unavailable review queue.",
          tone: "warning",
        };
  }

  return mountedQueueCount > 0
    ? {
        title: "The review queue snapshot is partially unavailable",
        summary: message,
        nextStep: "Refresh the review queue for the stale review snapshot.",
        tone: "warning",
      }
    : {
        title: "The review queue snapshot is unavailable",
        summary: message,
        nextStep: "Refresh the review queue for the unavailable review snapshot.",
        tone: "warning",
      };
}

function isUploadStorageRefreshFailureStatus(status: string | null): boolean {
  return status === PARA_UPLOAD_STATUS.refreshFailed;
}

function isUploadStoragePolicyRefreshingStatus(status: string | null): boolean {
  return status === PARA_UPLOAD_STATUS.policyRefreshing;
}

function isUploadStorageUsageRefreshingStatus(status: string | null): boolean {
  return status === PARA_UPLOAD_STATUS.usageRefreshing;
}

function isUploadStorageRefreshPendingStatus(status: string | null): boolean {
  return status === PARA_UPLOAD_STATUS.refreshingAfterUpload;
}

export default function PARAView(props: PARAViewProps) {
  void props.onNavigate;
  let fileInputRef: HTMLInputElement | undefined;
  let uploadStatusTimer: ReturnType<typeof setTimeout> | undefined;
  let loadSectionRequestId = 0;
  let candidateRequestId = 0;
  let billingRequestId = 0;

  const [section, setSection] = createSignal<ParaSectionKind>("project");
  const [loadedSection, setLoadedSection] = createSignal<ParaSectionKind | null>(null);
  const [items, setItems] = createSignal<ParaClassification[]>([]);
  const [archivedItems, setArchivedItems] = createSignal<ArchiveRow[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [loadError, setLoadError] = createSignal<ParaFailureReceipt | null>(null);

  const [dragItem, setDragItem] = createSignal<ParaClassification | null>(null);
  const [dragOver, setDragOver] = createSignal<ParaSectionKind | null>(null);

  const [archiveTarget, setArchiveTarget] = createSignal<ParaClassification | null>(null);
  const [archiveTargetSection, setArchiveTargetSection] = createSignal<Exclude<ParaSectionKind, "archive"> | null>(null);
  const [archiveReason, setArchiveReason] = createSignal<string>(DEFAULT_ARCHIVE_REASON);
  const [archiveContext, setArchiveContext] = createSignal("");
  const [archiveError, setArchiveError] = createSignal<ParaFailureReceipt | null>(null);
  const [archiving, setArchiving] = createSignal(false);

  const [candidates, setCandidates] = createSignal<AutoArchiveCandidate[]>([]);
  const [showAutoArchive, setShowAutoArchive] = createSignal(false);
  const [candidateError, setCandidateError] = createSignal<ParaFailureReceipt | null>(null);
  const [candidateLoading, setCandidateLoading] = createSignal(false);
  const [autoArchiving, setAutoArchiving] = createSignal(false);

  const [fileDragOver, setFileDragOver] = createSignal(false);
  const [uploading, setUploading] = createSignal(false);
  const [uploadStatus, setUploadStatus] = createSignal<string | null>(null);
  const [lastImportSummary, setLastImportSummary] = createSignal<string | null>(null);
  const [pendingCleanupMessageIds, setPendingCleanupMessageIds] = createSignal<string[]>([]);
  const [retryingCleanup, setRetryingCleanup] = createSignal(false);
  const [persistingCleanupOutputs, setPersistingCleanupOutputs] = createSignal(false);
  const [reviewingTargetId, setReviewingTargetId] = createSignal<string | null>(null);
  const [promotingTargetId, setPromotingTargetId] = createSignal<string | null>(null);
  const [importKnowledgeMode, setImportKnowledgeMode] =
    createSignal<KnowledgeOrganizationMode>("connected_notes");
  const [importRetentionMode, setImportRetentionMode] =
    createSignal<AttachmentRetentionMode>("keep_file");
  const [resourceLens, setResourceLens] = createSignal<ParaResourceLens>("all");
  const [billing, setBilling] = createSignal<BillingStatus | null>(null);
  const [billingError, setBillingError] = createSignal<ParaFailureReceipt | null>(null);
  const [billingLoading, setBillingLoading] = createSignal(false);
  const [attachmentIngestCapabilities, setAttachmentIngestCapabilities] =
    createSignal<AttachmentIngestCapabilities | null>(null);

  const [exporting, setExporting] = createSignal(false);
  const [actionError, setActionError] = createSignal<ParaFailureReceipt | null>(null);

  const mountedLiveItems = () => {
    const seen = new Set<string>();
    return items().filter((item) => {
      const targetId = normalizeParaTargetId(item.target_id);
      if (!targetId || seen.has(targetId)) return false;
      seen.add(targetId);
      return true;
    });
  };

  const mountedAutoArchiveCandidates = () => {
    const seen = new Set<string>();
    return candidates().filter((candidate) => {
      const targetId = normalizeParaTargetId(candidate.target_id);
      if (!targetId || seen.has(targetId)) return false;
      seen.add(targetId);
      return true;
    });
  };

  const mountedArchivedItems = () => {
    const seen = new Set<string>();
    return archivedItems().filter((item) => {
      const targetId = normalizeParaTargetId(item.target_id);
      if (!targetId || seen.has(targetId)) return false;
      seen.add(targetId);
      return true;
    });
  };

  const filteredLiveItems = () => {
    const liveItems = mountedLiveItems();
    if (section() !== "resource") return liveItems;
    return liveItems.filter((item) => paraTagsMatchResourceLens(readMountedParaTags(item.para_tags), resourceLens()));
  };

  const resourceLensCount = (lens: ParaResourceLens) =>
    mountedLiveItems().filter((item) => paraTagsMatchResourceLens(readMountedParaTags(item.para_tags), lens)).length;

  onCleanup(() => {
    if (uploadStatusTimer !== undefined) {
      clearTimeout(uploadStatusTimer);
      uploadStatusTimer = undefined;
    }
  });

  async function loadSection(nextSection: ParaSectionKind): Promise<boolean> {
    const requestId = ++loadSectionRequestId;
    setLoading(true);
    setLoadError(null);
    setActionError((current) => (isAppliedRefreshWarning(current) || isRefreshSectionReceipt(current) ? null : current));
    try {
      if (nextSection === "archive") {
        const res = await fetchParaArchived(100);
        if (requestId !== loadSectionRequestId) return false;
        setArchivedItems(res.archive ?? []);
      } else {
        const res = await fetchParaItems(PARA_PREFIX[nextSection], 100);
        if (requestId !== loadSectionRequestId) return false;
        setItems(res.items ?? []);
      }
      setLoadedSection(nextSection);
      setActionError((current) => (isAppliedRefreshWarning(current) || isRefreshSectionReceipt(current) ? null : current));
      return true;
    } catch (error: unknown) {
      if (requestId !== loadSectionRequestId) return false;
      const failureMessage = error instanceof Error ? error.message : "Failed to load PARA section.";
      if (loadedSection() !== nextSection) {
        setItems([]);
        setArchivedItems([]);
        setLoadedSection(null);
        setLoadError(
          buildParaFailureReceipt(
            "Load PARA section",
            failureMessage,
          ),
        );
      } else {
        setActionError(buildParaFailureReceipt("Refresh PARA section", failureMessage));
        setLoadError(null);
      }
      return false;
    } finally {
      if (requestId === loadSectionRequestId) {
        setLoading(false);
      }
    }
  }

  createEffect(() => {
    void loadSection(section());
  });

  createEffect(() => {
    if (showAutoArchive() && !autoArchiving() && candidates().length === 0) {
      closeAutoArchiveModal(true);
    }
  });

  createEffect(() => {
    if (showAutoArchive() && !candidateLoading() && !autoArchiving() && !hasMountedAutoArchiveSnapshot()) {
      closeAutoArchiveModal(true);
    }
  });

  createEffect(() => {
    const target = archiveTarget();
    const targetSection = archiveTargetSection();
    if (!target || !targetSection || archiving()) return;
    if (section() !== targetSection) {
      closeArchiveModal(true);
      return;
    }
    const targetId = normalizeParaTargetId(target.target_id);
    const hasTarget =
      !!targetId && mountedLiveItems().some((item) => normalizeParaTargetId(item.target_id) === targetId);
    if (!hasTarget) {
      closeArchiveModal(true);
    }
  });

  createEffect(() => {
    if (reclassifyBlocked()) {
      setDragItem(null);
      setDragOver(null);
    }
  });

  createEffect(() => {
    if (importRecoveryOverlayBlocked()) {
      setFileDragOver(false);
    }
  });

  createEffect(() => {
    if (section() !== "resource" && resourceLens() !== "all") {
      setResourceLens("all");
    }
  });

  createEffect(() => {
    if (isUploadStorageRefreshFailureStatus(uploadStatus()) && isStorageRefreshFailureReceipt(billingError())) return;
    if (!uploadStatusNeedsAttention() || !storageSummaryMounted()) return;
    if (uploadStatusTimer !== undefined) return;
    setUploadStatus(PARA_UPLOAD_STATUS.complete);
    uploadStatusTimer = setTimeout(() => {
      setUploadStatus(null);
      uploadStatusTimer = undefined;
    }, 3000);
  });

  async function loadAutoArchiveCandidates(options?: { allowWhileSectionLoading?: boolean }) {
    if ((!options?.allowWhileSectionLoading && loading()) || candidateLoading() || billingLoading() || autoArchiving() || archiveTarget() || archiving() || uploading() || exporting()) return;
    const requestId = ++candidateRequestId;
    setCandidateError(null);
    setCandidateLoading(true);
    try {
      const res = await fetchAutoArchiveCandidates();
      if (requestId !== candidateRequestId) return;
      const nextCandidates = res.candidates ?? [];
      const candidateIds = normalizeAutoArchiveCandidateIds(nextCandidates);
      if (candidateIds.length !== nextCandidates.length) {
        setCandidates([]);
        setCandidateError(candidateIds.length > 0 ? buildStaleReviewQueueReceipt() : buildUnavailableReviewQueueReceipt());
        return;
      }
      setCandidates(nextCandidates);
      setCandidateError(null);
    } catch (error: unknown) {
      if (requestId !== candidateRequestId) return;
      setCandidateError(
        buildReviewLoadFailureReceipt(
          error instanceof Error ? error.message : "Failed to load auto-archive candidates.",
          hasMountedAutoArchiveQueue(),
          mountedAutoArchiveQueueCount(),
        ),
      );
    } finally {
      if (requestId === candidateRequestId) {
        setCandidateLoading(false);
      }
    }
  }

  async function refreshBillingStatus(
    action: "Load storage policy" | "Refresh storage policy",
    options?: { allowWhileSectionLoading?: boolean; allowWithoutVisibleRetry?: boolean },
  ) {
    if (action === "Load storage policy" && (archiveTarget() || showAutoArchive())) return false;
    if (action === "Load storage policy" && uploading()) return false;
    if (
      action === "Load storage policy" &&
      !options?.allowWithoutVisibleRetry &&
      !importActionOwnsGenericStorageRetry() &&
      !showStoragePolicyRetryAction() &&
      !showBillingErrorCard()
    ) return false;
    if ((!options?.allowWhileSectionLoading && loading()) || candidateLoading() || billingLoading() || archiving() || autoArchiving() || exporting()) return false;
    const requestId = ++billingRequestId;
    setBillingError(null);
    setBillingLoading(true);
    try {
      const status = await getBillingStatus();
      if (requestId !== billingRequestId) return false;
      setBilling(status);
      setBillingError(null);
      return true;
    } catch (error: unknown) {
      if (requestId !== billingRequestId) return false;
      if (action === "Load storage policy" && billing() === null) {
        setBilling(null);
      }
      setBillingError(
        buildParaFailureReceipt(
          action,
          error instanceof Error
            ? error.message
            : action === "Load storage policy"
              ? "Failed to load storage policy."
              : "Failed to refresh storage policy after the last upload.",
        ),
      );
      return false;
    } finally {
      if (requestId === billingRequestId) {
        setBillingLoading(false);
      }
    }
  }

  function syncUploadStatusFromStorageState(storageRefreshApplied: boolean) {
    setUploadStatus(
      !storageRefreshApplied
        ? PARA_UPLOAD_STATUS.refreshFailed
        : !uploadPolicyMounted()
          ? PARA_UPLOAD_STATUS.policyRefreshing
          : !storageSummaryMounted()
            ? PARA_UPLOAD_STATUS.usageRefreshing
            : PARA_UPLOAD_STATUS.complete,
    );
  }

  async function retryUploadStorageRefresh() {
    if (
      !uploadStatusNeedsStorageRetry() ||
      loading() ||
      candidateLoading() ||
      billingLoading() ||
      archiving() ||
      autoArchiving() ||
      uploading() ||
      exporting() ||
      !!archiveTarget() ||
      showAutoArchive()
    ) return;
    if (uploadStatusTimer !== undefined) {
      clearTimeout(uploadStatusTimer);
      uploadStatusTimer = undefined;
    }
    setActionError(null);
    setUploadStatus(PARA_UPLOAD_STATUS.refreshingAfterUpload);
    const storageRefreshApplied = await refreshBillingStatus("Refresh storage policy");
    syncUploadStatusFromStorageState(storageRefreshApplied);
    if (storageRefreshApplied && storageSummaryMounted()) {
      uploadStatusTimer = setTimeout(() => {
        setUploadStatus(null);
        uploadStatusTimer = undefined;
      }, 3000);
    }
  }

  function retryGenericStoragePolicyLoad() {
    if (
      importRecoveryBlocked() ||
      (!importActionOwnsGenericStorageRetry() &&
        !showStoragePolicyRetryAction() &&
        !showBillingErrorCard())
    ) return;
    setActionError(null);
    void refreshBillingStatus("Load storage policy");
  }

  onMount(async () => {
    void fetchAttachmentIngestCapabilities()
      .then((capabilities) => setAttachmentIngestCapabilities(capabilities))
      .catch(() => undefined);
    await loadAutoArchiveCandidates({ allowWhileSectionLoading: true });
    await refreshBillingStatus("Load storage policy", { allowWhileSectionLoading: true, allowWithoutVisibleRetry: true });
  });

  const maxSingleUploadBytes = () => billing()?.max_single_upload_bytes ?? null;
  const quotaExceeded = () => uploadPolicyMounted() && billing()?.quota_state === "exceeded";
  const archiveOnlyEnabled = () => uploadPolicyMounted() && billing()?.archive_only_enabled === true;
  const archiveOnlyWarning = () => readMountedWarningText(billing()?.archive_only_warning);
  const uploadPolicyMounted = () => hasMountedParaUploadPolicy(billing());
  const storageSummaryMounted = () => hasMountedParaStorageSummary(billing());
  const importTargetSection = (): Exclude<ParaSectionKind, "archive"> => {
    const currentSection = section();
    return currentSection === "archive" ? "resource" : currentSection;
  };
  const idleImportSummary = () => {
    const targetSection = importTargetSection();
    return `Files and classified messages here become private workspace memory items for this account. Use Import files or drag a file into PARA to upload it into your storage quota, organize it as ${formatParaImportKnowledgeModeLabel(importKnowledgeMode())}, and apply the ${formatParaImportRetentionModeLabel(importRetentionMode())} storage policy inside the ${targetSection} section. Best-supported study files right now are PDF, DOCX, TXT, Markdown, CSV, spreadsheets, slide decks, and common audio recordings. Unsupported files are skipped instead of blocking the whole import when at least one readable file is present.`;
  };
  const storageSummary = () =>
    archiveTarget()
      ? "Finish the archive modal before starting another PARA import or storage-policy recovery action."
    : showAutoArchive()
      ? "Finish the review modal before starting another PARA import or storage-policy recovery action."
    : uploadStorageRefreshFailed()
      ? "The last PARA upload completed, but the storage policy refresh failed after the last upload. Use Retry storage policy refresh before treating the mounted storage policy and storage usage data as fully current."
    : uploadStorageRefreshPending()
      ? "The last PARA upload completed, and the storage policy refresh is still in progress after the last upload. Wait for that refresh to settle before treating the mounted storage policy as fully current."
    : uploadStoragePolicyRefreshing()
      ? "The last PARA upload completed, but the storage policy refresh still needs retry after the last upload. Use Retry storage policy refresh before the next import or before treating the mounted storage policy as fully current."
    : uploadStorageUsageRefreshing()
      ? "The last PARA upload completed, but the storage usage data is still refreshing after the last upload. You can keep importing files under the confirmed upload policy or use Retry usage refresh for fully trusted storage usage data."
      : billingLoading()
        ? "Storage policy refresh is in progress so PARA upload eligibility and single-upload limits can be trusted."
      : visibleStoragePolicyLoadFailed()
        ? "The storage policy load failed. Use Retry storage policy after this failed load before importing files so PARA upload eligibility and single-upload limits are trusted."
      : uploadPolicyMounted()
        ? paraUploadStorageSummary(billing())
        : "Use Retry storage policy before importing files so PARA upload eligibility and single-upload limits are trusted.";
  const storagePolicyNeedsRetry = () => !uploadPolicyMounted() || !storageSummaryMounted();
  const uploadStorageRefreshFailed = () => isUploadStorageRefreshFailureStatus(uploadStatus());
  const uploadStoragePolicyRefreshing = () => isUploadStoragePolicyRefreshingStatus(uploadStatus());
  const uploadStorageUsageRefreshing = () => isUploadStorageUsageRefreshingStatus(uploadStatus());
  const uploadStorageRefreshPending = () => isUploadStorageRefreshPendingStatus(uploadStatus());
  const storagePolicyLoadFailed = () => isStoragePolicyLoadReceipt(billingError());
  const visibleStoragePolicyLoadFailed = () =>
    storagePolicyLoadFailed() && !uploadStatusOwnsStorageRecovery();
  const genericStoragePolicyLoadFailed = () =>
    importActionOwnsGenericStorageRetry() && storagePolicyLoadFailed();
  const importActionLabel = () => {
    const targetSection = importTargetSection();
    return uploading()
      ? "Uploading..."
      : loading()
        ? "Refreshing PARA section..."
        : candidateLoading()
          ? "Refreshing review queue..."
          : archiving()
            ? "Archiving item..."
              : autoArchiving()
                ? "Archiving..."
                : exporting()
                  ? "Export in progress..."
                  : archiveTarget()
                    ? "Archive modal open..."
                    : showAutoArchive()
                      ? "Review modal open..."
                    : importActionOwnsStorageRetry()
                      ? uploadStatusStorageRetryLabel()
                      : uploadStorageRefreshPending()
                        ? "Storage policy refresh is still in progress after the last upload..."
                        : billingLoading()
                          ? uploadStatusOwnsStorageRecovery()
                            ? uploadStorageUsageRefreshing()
                              ? "Refreshing storage usage data after the last upload..."
                              : "Refreshing storage policy after the last upload..."
                            : "Storage policy refresh in progress..."
                          : visibleStoragePolicyLoadFailed()
                            ? "Retry storage policy after this failed load"
                            : uploadStorageUsageRefreshing()
                              ? `Import into ${targetSection} while the storage usage data is still refreshing after the last upload`
                              : !uploadPolicyMounted()
                                ? "Retry storage policy"
                                : !storageSummaryMounted()
                                  ? `Import into ${targetSection} while the storage usage data is still incomplete or use Retry storage policy`
                                  : `Import into ${targetSection}`;
  };
  const paraIntroSummary = () =>
    archiveTarget()
      ? "Finish the archive modal before starting another PARA import or storage-policy recovery action."
    : showAutoArchive()
      ? "Finish the review modal before starting another PARA import or storage-policy recovery action."
    : uploadStorageRefreshFailed()
      ? "The last PARA upload completed, but the storage policy refresh failed after the last upload. Use Retry storage policy refresh before treating the mounted PARA storage policy and storage usage data as fully current."
    : uploadStorageRefreshPending()
    ? "The last PARA upload completed, and the storage policy refresh is still in progress after the last upload. Wait for that refresh to settle before treating the mounted PARA storage policy as fully current."
    : uploadStoragePolicyRefreshing()
      ? "The last PARA upload completed, but the storage policy refresh still needs retry after the last upload. Use Retry storage policy refresh before the next import or before treating the mounted PARA storage policy as fully current."
    : uploadStorageUsageRefreshing()
      ? "The last PARA upload completed, and uploads are still allowed under the confirmed policy, but the storage usage data is still refreshing after the last upload. You can keep importing files now or use Retry usage refresh for fully trusted storage usage data."
      : billingLoading()
      ? "Storage policy refresh is in progress so PARA upload eligibility and single-upload limits can be trusted before the next import."
      : visibleStoragePolicyLoadFailed()
      ? "The storage policy load failed. Use Retry storage policy after this failed load before importing files into PARA so upload eligibility and single-upload limits are trusted."
    : !uploadPolicyMounted()
      ? "Use Retry storage policy before importing files into PARA so upload eligibility and single-upload limits are trusted."
    : !storageSummaryMounted()
      ? "PARA imports are allowed, but storage usage data is still incomplete. You can upload files now or use Retry storage policy for fully trusted storage usage data."
        : idleImportSummary();
  const fileDropOverlayLabel = () =>
    {
      const targetSection = importTargetSection();
      return archiveTarget()
        ? `Finish the archive modal before importing into ${targetSection}`
      : showAutoArchive()
        ? `Finish the review modal before importing into ${targetSection}`
      : uploadStorageRefreshFailed()
        ? `Use Retry storage policy refresh before importing into ${targetSection}`
      : uploadStorageRefreshPending()
        ? `Storage policy refresh is still in progress after the last upload for ${targetSection}`
      : uploadStoragePolicyRefreshing()
        ? `Use Retry storage policy refresh before importing into ${targetSection}`
      : billingLoading() && uploadStorageUsageRefreshing()
        ? `Refreshing storage usage data after the last upload for ${targetSection}`
      : billingLoading()
        ? `Storage policy refresh in progress for ${targetSection}`
      : uploadStorageUsageRefreshing()
        ? `Drop file to import into ${targetSection} while the storage usage data is still refreshing after the last upload`
      : visibleStoragePolicyLoadFailed()
        ? `Storage policy load failed for ${targetSection}. Use Retry storage policy after this failed load before importing.`
      : !uploadPolicyMounted()
        ? `Use Retry storage policy before importing into ${targetSection}`
      : !storageSummaryMounted()
        ? `Drop file to import into ${targetSection} while the storage usage data is still incomplete or use Retry storage policy`
        : `Drop file to add to ${targetSection}`;
    };
  const importActionNeedsAttention = () =>
    !!archiveTarget() ||
    showAutoArchive() ||
    billingLoading() ||
    visibleStoragePolicyLoadFailed() ||
    uploadStorageRefreshFailed() ||
    uploadStorageRefreshPending() ||
    uploadStoragePolicyRefreshing() ||
    uploadStorageUsageRefreshing() ||
    !uploadPolicyMounted() ||
    !storageSummaryMounted();
  const importDropNeedsAttention = () =>
    !!archiveTarget() ||
    showAutoArchive() ||
    billingLoading() ||
    visibleStoragePolicyLoadFailed() ||
    uploadStorageRefreshFailed() ||
    uploadStorageRefreshPending() ||
    uploadStoragePolicyRefreshing() ||
    uploadStorageUsageRefreshing() ||
    !uploadPolicyMounted() ||
    (uploadPolicyMounted() && !storageSummaryMounted());
  const uploadStatusNeedsAttention = () =>
    !!uploadStatus() &&
    !uploading() &&
    !isUploadStorageRefreshPendingStatus(uploadStatus()) &&
    (isUploadStorageRefreshFailureStatus(uploadStatus()) ||
      isUploadStoragePolicyRefreshingStatus(uploadStatus()) ||
      isUploadStorageUsageRefreshingStatus(uploadStatus()) ||
      !uploadPolicyMounted() ||
      !storageSummaryMounted());
  const uploadStatusNeedsStorageRetry = () => {
    const status = uploadStatus();
    return (
      !!status &&
      (isUploadStorageRefreshFailureStatus(status) ||
        isUploadStoragePolicyRefreshingStatus(status) ||
        isUploadStorageUsageRefreshingStatus(status))
    );
  };
  const importActionOwnsStorageRetry = () =>
    uploadStorageRefreshFailed() || uploadStoragePolicyRefreshing();
  const importActionOwnsGenericStorageRetry = () =>
    !uploadPolicyMounted() || visibleStoragePolicyLoadFailed();
  const importActionOwnsRecovery = () =>
    importActionOwnsStorageRetry() || importActionOwnsGenericStorageRetry();
  const showUploadStatusStorageRetryAction = () =>
    uploadStatusNeedsStorageRetry() && !importActionOwnsStorageRetry();
  const uploadStatusStorageRetryLabel = () =>
    uploadStorageUsageRefreshing() ? "Retry usage refresh" : "Retry storage policy refresh";
  const uploadStatusStorageRetryPendingLabel = () =>
    uploadStorageUsageRefreshing()
      ? "Retrying usage refresh after the last upload..."
      : "Retrying storage policy refresh after the last upload...";
  const uploadStatusStorageRetryButtonNeedsAttention = () =>
    uploadStatusOwnsStorageRecovery() ||
    !!archiveTarget() ||
    showAutoArchive() ||
    loading() ||
    candidateLoading() ||
    billingLoading() ||
    archiving() ||
    autoArchiving() ||
    uploading() ||
    exporting();
  const uploadStatusOwnsStorageRecovery = () => {
    const status = uploadStatus();
    return (
      !!status &&
      (isUploadStorageRefreshPendingStatus(status) ||
        isUploadStorageRefreshFailureStatus(status) ||
        isUploadStoragePolicyRefreshingStatus(status) ||
        isUploadStorageUsageRefreshingStatus(status))
    );
  };
  const storagePolicyStatusLabel = () => {
    if (archiveTarget()) return "Finish the archive modal before importing";
    if (showAutoArchive()) return "Finish the review modal before importing";
    if (uploadStatus() === PARA_UPLOAD_STATUS.refreshFailed) return "Storage policy refresh failed after the last upload";
    if (uploadStatus() === PARA_UPLOAD_STATUS.refreshingAfterUpload) return "Storage policy refresh is still in progress after the last upload";
    if (uploadStatus() === PARA_UPLOAD_STATUS.policyRefreshing) return "Storage policy refresh still needs retry after the last upload";
    if (billingLoading() && uploadStatus() === PARA_UPLOAD_STATUS.usageRefreshing) return "Storage usage data is still refreshing after the last upload";
    if (uploadStatus() === PARA_UPLOAD_STATUS.usageRefreshing) return "Storage usage data is still refreshing after the last upload";
    if (billingLoading()) return "Storage policy refresh is in progress";
    if (storagePolicyLoadFailed()) return "Storage policy load failed; use Retry storage policy after this failed load";
    if (!storagePolicyNeedsRetry()) return null;
    return !uploadPolicyMounted()
      ? "Use Retry storage policy before importing"
      : "Storage usage data is still incomplete; use Retry storage policy";
  };
  const storagePolicyNeedsAttention = () =>
    !!archiveTarget() ||
    showAutoArchive() ||
    billingLoading() ||
    visibleStoragePolicyLoadFailed() ||
    uploadStorageRefreshFailed() ||
    uploadStorageRefreshPending() ||
    uploadStoragePolicyRefreshing() ||
    uploadStorageUsageRefreshing() ||
    quotaExceeded() ||
    archiveOnlyEnabled() ||
    (storagePolicyNeedsRetry() && !uploadStorageRefreshPending());
  const storageRecoveryButtonNeedsAttention = () =>
    !!archiveTarget() ||
    showAutoArchive() ||
    billingLoading() ||
    loading() ||
    candidateLoading() ||
    archiving() ||
    autoArchiving() ||
    uploading() ||
    exporting();
  const reviewQueueRecoveryButtonNeedsAttention = () =>
    !!archiveTarget() ||
    showAutoArchive() ||
    isArchiveReviewFailureReceipt(candidateError()) ||
    !hasMountedAutoArchiveQueue() ||
    !hasMountedAutoArchiveSnapshot() ||
    loading() ||
    candidateLoading() ||
    billingLoading() ||
    archiving() ||
    autoArchiving() ||
    uploading() ||
    exporting();
  const retrySectionButtonNeedsAttention = () =>
    !!archiveTarget() ||
    showAutoArchive() ||
    loading() ||
    candidateLoading() ||
    billingLoading() ||
    archiving() ||
    autoArchiving() ||
    uploading() ||
    exporting();
  const exportActionNeedsAttention = () =>
    loading() ||
    candidateLoading() ||
    billingLoading() ||
    archiving() ||
    autoArchiving() ||
    uploading() ||
    exporting() ||
    section() === "archive" ||
    !!archiveTarget() ||
    showAutoArchive();
  const archiveEntryButtonNeedsAttention = (targetId: unknown) =>
    loading() ||
    candidateLoading() ||
    billingLoading() ||
    !!archiveTarget() ||
    showAutoArchive() ||
    archiving() ||
    autoArchiving() ||
    uploading() ||
    exporting() ||
    reviewingTargetId() === normalizeParaTargetId(targetId) ||
    !hasMountedParaTargetId(targetId);
  const reviewEntryButtonNeedsAttention = (targetId: unknown) =>
    loading() ||
    candidateLoading() ||
    billingLoading() ||
    !!archiveTarget() ||
    showAutoArchive() ||
    archiving() ||
    autoArchiving() ||
    uploading() ||
    exporting() ||
    reviewingTargetId() === normalizeParaTargetId(targetId) ||
    promotingTargetId() === normalizeParaTargetId(targetId) ||
    !hasMountedParaTargetId(targetId);
  const promoteEntryButtonNeedsAttention = (targetId: unknown) =>
    loading() ||
    candidateLoading() ||
    billingLoading() ||
    !!archiveTarget() ||
    showAutoArchive() ||
    archiving() ||
    autoArchiving() ||
    uploading() ||
    exporting() ||
    reviewingTargetId() === normalizeParaTargetId(targetId) ||
    promotingTargetId() === normalizeParaTargetId(targetId) ||
    !hasMountedParaTargetId(targetId);
  const archiveModalPrimaryActionNeedsAttention = () =>
    loading() ||
    candidateLoading() ||
    billingLoading() ||
    showAutoArchive() ||
    archiving() ||
    autoArchiving() ||
    uploading() ||
    exporting() ||
    isArchiveFlowFailureReceipt(archiveError()) ||
    !hasMountedArchiveTarget() ||
    !ARCHIVE_REASONS.includes(archiveReason() as (typeof ARCHIVE_REASONS)[number]);
  const reviewModalPrimaryActionNeedsAttention = () =>
    loading() ||
    candidateLoading() ||
    billingLoading() ||
    !!archiveTarget() ||
    archiving() ||
    autoArchiving() ||
    uploading() ||
    exporting() ||
    isArchiveReviewFailureReceipt(candidateError()) ||
    !hasMountedAutoArchiveQueue() ||
    !hasMountedAutoArchiveSnapshot();
  const showStoragePolicyCard = () =>
    !!billing() || billingLoading() || uploadStatusOwnsStorageRecovery() || importActionOwnsGenericStorageRetry();
  const showStoragePolicyRetryAction = () =>
    storagePolicyNeedsRetry() &&
    !uploadStatusOwnsStorageRecovery() &&
    !importActionOwnsGenericStorageRetry() &&
    !isStoragePolicyLoadReceipt(billingError());
  const showBillingErrorCard = () => {
    const receipt = billingError();
    if (!receipt) return false;
    if (importActionOwnsGenericStorageRetry() && isStoragePolicyLoadReceipt(receipt)) {
      return false;
    }
    return !(uploadStatusOwnsStorageRecovery() && isStorageRefreshFailureReceipt(receipt));
  };
  const uploadActionBlocked = () =>
    loading() || candidateLoading() || !!archiveTarget() || showAutoArchive() || archiving() || autoArchiving() || uploading() || exporting() || billingLoading() || !uploadPolicyMounted();
  const uploadEntryBlocked = () =>
    uploadActionBlocked() || uploadStorageRefreshFailed() || uploadStoragePolicyRefreshing();
  const importRecoveryBlocked = () =>
    loading() || candidateLoading() || billingLoading() || archiving() || autoArchiving() || uploading() || exporting() || !!archiveTarget() || showAutoArchive();
  const importRecoveryOverlayBlocked = () =>
    loading() || candidateLoading() || archiving() || autoArchiving() || uploading() || exporting() || !!archiveTarget() || showAutoArchive();
  const archiveEntryBlocked = () =>
    loading() || candidateLoading() || billingLoading() || !!archiveTarget() || showAutoArchive() || archiving() || autoArchiving() || uploading() || exporting();
  const sectionSwitchBlocked = () =>
    candidateLoading() || billingLoading() || !!archiveTarget() || showAutoArchive() || archiving() || autoArchiving() || uploading() || exporting();
  const sectionSwitchNeedsAttention = () => sectionSwitchBlocked();
  const reclassifyBlocked = () =>
    loading() || sectionSwitchBlocked();
  const retrySectionBlocked = () =>
    loading() || candidateLoading() || billingLoading() || autoArchiving() || archiving() || uploading() || exporting() || !!archiveTarget() || showAutoArchive();
  const hasMountedParaTargetId = (value: unknown) => !!normalizeParaTargetId(value);
  const hasMountedArchiveTarget = () => {
    const target = archiveTarget();
    const targetId = normalizeParaTargetId(target?.target_id);
    return !!targetId && mountedLiveItems().some((item) => normalizeParaTargetId(item.target_id) === targetId);
  };
  const mountedAutoArchiveQueueCount = () => mountedAutoArchiveCandidates().length;
  const hasMountedLiveSectionSnapshot = () => mountedLiveItems().length === items().length;
  const hasMountedArchiveSnapshot = () => mountedArchivedItems().length === archivedItems().length;
  const hasMountedAutoArchiveSnapshot = () => mountedAutoArchiveCandidates().length === candidates().length;
  const hasMountedAutoArchiveQueue = () => {
    const candidateCount = mountedAutoArchiveQueueCount();
    return candidateCount > 0 && hasMountedAutoArchiveSnapshot();
  };
  const hasVisibleAutoArchiveQueue = () => mountedAutoArchiveQueueCount() > 0 || candidates().length > 0;

  function selectSection(nextSection: ParaSectionKind) {
    if (sectionSwitchBlocked()) return;
    setSection(nextSection);
  }

  function openArchiveModal(item: ParaClassification) {
    if (archiveEntryBlocked()) return;
    const currentSection = section();
    if (currentSection === "archive") return;
    const targetId = normalizeParaTargetId(item.target_id);
    if (!targetId || !mountedLiveItems().some((candidate) => normalizeParaTargetId(candidate.target_id) === targetId)) return;
    setArchiveTarget(item);
    setArchiveTargetSection(currentSection);
    setArchiveReason(DEFAULT_ARCHIVE_REASON);
    setArchiveContext("");
    setArchiveError(null);
  }

  function closeArchiveModal(force = false, options?: { clearError?: boolean }) {
    if (!force && archiving()) return;
    setArchiveTarget(null);
    setArchiveTargetSection(null);
    setArchiveReason(DEFAULT_ARCHIVE_REASON);
    setArchiveContext("");
    if (options?.clearError) {
      setArchiveError(null);
    }
  }

  function openAutoArchiveModal() {
    const candidateIds = normalizeAutoArchiveCandidateIds(candidates());
    if (!candidateIds.length || showAutoArchive() || loading() || candidateLoading() || billingLoading() || autoArchiving() || archiveTarget() || archiving() || uploading() || exporting()) return;
    if (candidateIds.length !== candidates().length) {
      setCandidateError(candidateIds.length > 0 ? buildStaleReviewQueueReceipt() : buildUnavailableReviewQueueReceipt());
      return;
    }
    setCandidateError(null);
    setShowAutoArchive(true);
  }

  function closeAutoArchiveModal(force = false, options?: { clearError?: boolean }) {
    if (!force && (candidateLoading() || autoArchiving())) return;
    setShowAutoArchive(false);
    if (options?.clearError) {
      setCandidateError(null);
    }
  }

  function onItemDragStart(e: DragEvent, item: ParaClassification) {
    const targetId = normalizeParaTargetId(item.target_id);
    if (reclassifyBlocked() || !targetId) {
      e.preventDefault();
      setDragItem(null);
      setDragOver(null);
      return;
    }
    e.dataTransfer?.setData("text/plain", targetId);
    setDragItem(item);
  }

  function onItemDragEnd() {
    setDragItem(null);
    setDragOver(null);
  }

  function onSectionDragOver(e: DragEvent, nextSection: ParaSectionKind) {
    if (reclassifyBlocked() || !dragItem()) return;
    e.preventDefault();
    setDragOver(nextSection);
  }

  function onSectionDragLeave() {
    setDragOver(null);
  }

  async function onSectionDrop(e: DragEvent, toSection: ParaSectionKind) {
    e.preventDefault();
    setDragOver(null);
    if (reclassifyBlocked()) {
      setDragItem(null);
      return;
    }
    const item = dragItem();
    setDragItem(null);
    if (!item || toSection === section()) return;

    if (toSection === "archive") {
      openArchiveModal(item);
      return;
    }
    setActionError(null);

    const targetId = normalizeParaTargetId(item.target_id);
    if (!targetId || !mountedLiveItems().some((candidate) => normalizeParaTargetId(candidate.target_id) === targetId)) {
      return;
    }

    const currentSection = section();
    const currentPrefix = currentSection !== "archive" ? PARA_PREFIX[currentSection] : null;
    const mountedTags = readMountedParaTags(item.para_tags);
    const otherTags = mountedTags.filter((tag) => !currentPrefix || !tag.startsWith(currentPrefix));
    const newTag = makeTag(
      toSection,
      readParaTagLabel(mountedTags.find((tag) => currentPrefix && tag.startsWith(currentPrefix)) ?? readParaTargetLabel(item.target_id)),
    );
    const nextTags = [...new Set([...otherTags, newTag])];

    try {
      await classifyParaItem(targetId, nextTags);
      setItems((current) => current.filter((candidate) => normalizeParaTargetId(candidate.target_id) !== targetId));
      const refreshed = await loadSection(section());
      if (!refreshed) {
        setActionError(buildAppliedRefreshWarning("Reclassify PARA item"));
      }
    } catch (error: unknown) {
      setActionError(
        buildParaFailureReceipt(
          "Reclassify PARA item",
          error instanceof Error ? error.message : "Failed to reclassify item.",
        ),
      );
    }
  }

  async function confirmArchive() {
    const target = archiveTarget();
    const targetSection = archiveTargetSection();
    if (!target || !targetSection || loading() || candidateLoading() || billingLoading() || showAutoArchive() || archiving() || autoArchiving() || uploading() || exporting()) return;
    if (section() !== targetSection || section() === "archive") return;
    const targetId = normalizeParaTargetId(target.target_id);
    if (!targetId || !mountedLiveItems().some((item) => normalizeParaTargetId(item.target_id) === targetId)) {
      setArchiveError(buildUnavailableArchiveTargetReceipt());
      return;
    }
    const reason = archiveReason();
    if (!ARCHIVE_REASONS.includes(reason as (typeof ARCHIVE_REASONS)[number])) {
      setArchiveError(buildInvalidArchiveReasonReceipt());
      return;
    }
    const context = archiveContext().trim();
    setActionError(null);
    setArchiveError(null);
    setArchiving(true);
    try {
      await archiveParaItem(targetId, reason, context || undefined);
      setCandidates((current) => current.filter((candidate) => normalizeParaTargetId(candidate.target_id) !== targetId));
      setItems((current) => current.filter((candidate) => normalizeParaTargetId(candidate.target_id) !== targetId));
      closeArchiveModal(true, { clearError: true });
      const refreshed = await loadSection(section());
      if (!refreshed) {
        setActionError(buildAppliedRefreshWarning("Archive PARA item"));
      }
    } catch (error: unknown) {
      setArchiveError(
        buildArchiveFlowFailureReceipt(
          error instanceof Error ? error.message : "Failed to archive item.",
        ),
      );
    } finally {
      setArchiving(false);
    }
  }

  async function handleMarkReviewed(item: ParaClassification) {
    if (section() !== "resource") return;
    const targetId = normalizeParaTargetId(item.target_id);
    if (
      !targetId ||
      reviewEntryButtonNeedsAttention(targetId) ||
      !mountedLiveItems().some((candidate) => normalizeParaTargetId(candidate.target_id) === targetId)
    ) {
      return;
    }
    const previousTags = readMountedParaTags(item.para_tags);
    if (!paraTagsIncludeReviewPending(previousTags)) return;
    const nextTags = previousTags.filter((tag) => tag !== "zk:review_pending");

    setActionError(null);
    setReviewingTargetId(targetId);
    setItems((current) =>
      current.map((entry) =>
        normalizeParaTargetId(entry.target_id) === targetId
          ? { ...entry, para_tags: nextTags }
          : entry,
      ),
    );

    try {
      await Promise.all([
        classifyParaItem(targetId, nextTags),
        sendNoteMessage({
          type: "tag_update",
          thread_id: targetId,
          content: {
            remove_supertags: ["zk:review_pending"],
            add_supertags: ["zk:reviewed"],
          },
          references: [{ id: targetId }],
        }),
      ]);
      const refreshed = await loadSection(section());
      if (!refreshed) {
        setActionError(buildAppliedRefreshWarning("Mark Zettelkasten note reviewed"));
      }
    } catch (error: unknown) {
      setItems((current) =>
        current.map((entry) =>
          normalizeParaTargetId(entry.target_id) === targetId
            ? { ...entry, para_tags: previousTags }
            : entry,
        ),
      );
      setActionError(
        buildParaFailureReceipt(
          "Mark Zettelkasten note reviewed",
          error instanceof Error ? error.message : "Failed to mark this Zettelkasten note as reviewed.",
        ),
      );
    } finally {
      setReviewingTargetId((current) => (current === targetId ? null : current));
    }
  }

  async function handlePromotePermanentNote(item: ParaClassification) {
    if (section() !== "resource") return;
    const targetId = normalizeParaTargetId(item.target_id);
    if (
      !targetId ||
      promoteEntryButtonNeedsAttention(targetId) ||
      !mountedLiveItems().some((candidate) => normalizeParaTargetId(candidate.target_id) === targetId)
    ) {
      return;
    }

    const previousTags = readMountedParaTags(item.para_tags);
    if (!paraTagsIncludeSourceNote(previousTags) || paraTagsIncludePermanentNote(previousTags)) return;

    const nextTags = [
      ...previousTags.filter((tag) => tag !== "zk:source_note" && tag !== "zk:review_pending"),
      "zk:permanent_note",
      "zk:reviewed",
    ];

    setActionError(null);
    setPromotingTargetId(targetId);
    setItems((current) =>
      current.map((entry) =>
        normalizeParaTargetId(entry.target_id) === targetId
          ? { ...entry, para_tags: nextTags }
          : entry,
      ),
    );

    try {
      await Promise.all([
        classifyParaItem(targetId, nextTags),
        sendNoteMessage({
          type: "tag_update",
          thread_id: targetId,
          content: {
            remove_supertags: ["zk:source_note", "zk:review_pending"],
            add_supertags: ["zk:permanent_note", "zk:reviewed"],
          },
          references: [{ id: targetId }],
        }),
      ]);
      const refreshed = await loadSection(section());
      if (!refreshed) {
        setActionError(buildAppliedRefreshWarning("Promote Zettelkasten note"));
      }
    } catch (error: unknown) {
      setItems((current) =>
        current.map((entry) =>
          normalizeParaTargetId(entry.target_id) === targetId
            ? { ...entry, para_tags: previousTags }
            : entry,
        ),
      );
      setActionError(
        buildParaFailureReceipt(
          "Promote Zettelkasten note",
          error instanceof Error ? error.message : "Failed to promote this Zettelkasten note into a permanent note.",
        ),
      );
    } finally {
      setPromotingTargetId((current) => (current === targetId ? null : current));
    }
  }

  function onFileDragOver(e: DragEvent) {
    if (
      !importRecoveryOverlayBlocked() &&
      [...(e.dataTransfer?.items ?? [])].some((item) => item.kind === "file")
    ) {
      e.preventDefault();
      setFileDragOver(true);
    }
  }

  function onFileDragLeave() {
    setFileDragOver(false);
  }

  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    if (!props.token) {
      setActionError(
        buildParaFailureReceipt(
          "Upload to PARA",
          "A signed-in session is required before PARA can import and read attachments.",
        ),
      );
      return;
    }
    if (importActionOwnsRecovery()) {
      if (!importRecoveryBlocked()) {
        handlePrimaryImportAction();
      }
      return;
    }
    if (uploadEntryBlocked()) return;
    setActionError(null);
    setLastImportSummary(null);
    setPendingCleanupMessageIds([]);
    const preflight = evaluateParaUploadPreflight(billingLoading() ? null : billing(), files);
    if (!preflight.allowed) {
      setUploadStatus(null);
      setActionError(buildParaFailureReceipt("Upload to PARA", preflight.reason));
      return;
    }
    const attachmentSupport = summarizeKnowledgeAttachmentSupport(
      files,
      attachmentIngestCapabilities(),
    );
    const supportedFiles = attachmentSupport.supportedFiles;
    const skippedUnsupportedFiles = attachmentSupport.unsupportedFiles;
    if (files.length > 0 && supportedFiles.length === 0) {
      const unsupportedNames = skippedUnsupportedFiles
        .slice(0, 3)
        .map((file) => file.name)
        .join(", ");
      const overflowLabel =
        skippedUnsupportedFiles.length > 3
          ? ` and ${skippedUnsupportedFiles.length - 3} more`
          : "";
      const unsupportedDetail = attachmentSupport.unsupportedDescriptions[0]?.trim();
      setUploadStatus(null);
      setActionError(
        buildParaFailureReceipt(
          "Upload to PARA",
          `None of the selected files can be imported into connected notes yet: ${unsupportedNames}${overflowLabel}. ${unsupportedDetail ?? "Try PDF, DOCX, TXT, Markdown, CSV, or common audio files."}`,
        ),
      );
      return;
    }
    setUploading(true);
    setUploadStatus(
      `Uploading ${supportedFiles.length} readable file${supportedFiles.length === 1 ? "" : "s"}...${
        skippedUnsupportedFiles.length > 0
          ? ` Skipping ${skippedUnsupportedFiles.length} unsupported file${skippedUnsupportedFiles.length === 1 ? "" : "s"}.`
          : ""
      }`,
    );
    const targetSection = importTargetSection();
    const retentionMode = importRetentionMode();
    const knowledgeMode = importKnowledgeMode();

    try {
      const uploaded = await Promise.all(
        supportedFiles.map(async (file) => {
          const inlineExtract = await extractInlineKnowledgeText(file).catch(() => null);
          const payload = await uploadFilePayload(file, {
            token: props.token,
            filename: file.name,
          });
          if (!payload.message_id || !payload.attachment) {
            throw new Error(`Attachment upload failed for ${file.name}.`);
          }
          return {
            source_message_id: payload.message_id,
            attachment_id: payload.attachment.id,
            file_name: payload.attachment.name,
            mime_type: payload.attachment.mime_type,
            inline_text: inlineExtract?.text ?? null,
            inline_content_type: inlineExtract?.contentType ?? null,
            extraction_mode: inlineExtract?.extractionMode ?? null,
          };
        }),
      );
      const ingestResult = await ingestAttachmentBatch({
        thread_id: `thread.para.${targetSection}.${Date.now()}`,
        query: `Import into PARA ${targetSection}`,
        retention_mode: retentionMode,
        knowledge_mode: knowledgeMode,
        uploads: uploaded,
      });
      const cleanupMessageIds = ingestResult.cleanup_message_ids ?? [];
      const ingestedItems = ingestResult.items.filter((item) => item.ingested !== false);
      const failedItems = ingestResult.items.filter((item) => item.ingested === false);
      let cleanupWarningLabel = "";
      if (ingestedItems.length === 0 && failedItems.length > 0) {
        throw new Error(
          `No attachments could be read. ${failedItems.map((item) => item.file_name || "file").join(", ")}`,
        );
      }
      if (retentionMode !== "keep_nothing") {
        for (const item of ingestedItems) {
          const targetMessageId = item.output_message_id ?? item.source_message_id;
          if (!targetMessageId) continue;
          const label = item.file_name || item.mime_type || item.source_message_id || "imported_item";
          await classifyParaItem(
            targetMessageId,
            buildParaImportClassificationTags(targetSection, label, knowledgeMode),
          );
        }
      } else if (cleanupMessageIds.length > 0) {
        try {
          await cleanupIngestedAttachments({ message_ids: cleanupMessageIds });
          setPendingCleanupMessageIds([]);
        } catch {
          setPendingCleanupMessageIds(cleanupMessageIds);
          cleanupWarningLabel =
            " Temporary note copies could not be deleted automatically. Retry cleanup to finish the keep-nothing contract.";
        }
      }
      const inlineExtractedCount = ingestedItems.filter((item) => item.inline_extracted).length;
      const serverParsedCount = ingestedItems.length - inlineExtractedCount;
      const skippedUnsupportedLabel = skippedUnsupportedFiles.length > 0
        ? ` Skipped ${skippedUnsupportedFiles.length} unsupported file${skippedUnsupportedFiles.length === 1 ? "" : "s"}: ${skippedUnsupportedFiles
          .slice(0, 3)
          .map((file) => file.name)
          .join(", ")}${skippedUnsupportedFiles.length > 3 ? ` and ${skippedUnsupportedFiles.length - 3} more` : ""}.`
        : "";
      const skippedUnsupportedDetail = attachmentSupport.unsupportedDescriptions.length > 0
        ? ` ${attachmentSupport.unsupportedDescriptions.join(" ")}`
        : "";
      const storageRefreshApplied = await refreshBillingStatus("Refresh storage policy");
      const refreshed = retentionMode === "keep_nothing" ? true : await loadSection(section());
      if (failedItems.length > 0) {
        const failedNames = failedItems
          .map((item) => item.file_name || item.mime_type || "attachment")
          .join(", ");
        setLastImportSummary(
          `Imported ${ingestedItems.length} attachment${ingestedItems.length === 1 ? "" : "s"} into ${targetSection} using ${combinedKnowledgePolicySummary(knowledgeMode, retentionMode)} (${inlineExtractedCount} instant read${inlineExtractedCount === 1 ? "" : "s"}, ${serverParsedCount} server parse${serverParsedCount === 1 ? "" : "s"}). ${attachmentRetentionOutcome(retentionMode)}${skippedUnsupportedLabel}${skippedUnsupportedDetail} Could not read ${failedItems.length}: ${failedNames}.${cleanupWarningLabel}`,
        );
      } else {
        setLastImportSummary(
          `Imported ${ingestedItems.length} attachment${ingestedItems.length === 1 ? "" : "s"} into ${targetSection} using ${combinedKnowledgePolicySummary(knowledgeMode, retentionMode)} (${inlineExtractedCount} instant read${inlineExtractedCount === 1 ? "" : "s"}, ${serverParsedCount} server parse${serverParsedCount === 1 ? "" : "s"}). ${attachmentRetentionOutcome(retentionMode)}${skippedUnsupportedLabel}${skippedUnsupportedDetail}${cleanupWarningLabel}`,
        );
      }
      syncUploadStatusFromStorageState(storageRefreshApplied);
      if (uploadStatusTimer !== undefined) {
        clearTimeout(uploadStatusTimer);
        uploadStatusTimer = undefined;
      }
      if (storageRefreshApplied && storageSummaryMounted()) {
        uploadStatusTimer = setTimeout(() => {
          setUploadStatus(null);
          uploadStatusTimer = undefined;
        }, 3000);
      }
      if (!refreshed) {
        setActionError(buildAppliedRefreshWarning("Upload to PARA"));
      }
    } catch (error: unknown) {
      setUploadStatus(null);
      setActionError(
        buildParaFailureReceipt(
          "Upload to PARA",
          error instanceof Error ? error.message : "Failed to upload file into PARA.",
        ),
      );
    } finally {
      setUploading(false);
    }
  }

  async function retryPendingCleanup() {
    const messageIds = pendingCleanupMessageIds();
    if (messageIds.length === 0) return;
    setRetryingCleanup(true);
    try {
      await cleanupIngestedAttachments({ message_ids: messageIds });
      setPendingCleanupMessageIds([]);
      setLastImportSummary((current) => {
        const warning =
          "Temporary note copies could not be deleted automatically. Retry cleanup to finish the keep-nothing contract.";
        const success = "Temporary note copies were deleted successfully.";
        const base = (current ?? "").replace(warning, "").trim();
        return base ? `${base} ${success}` : success;
      });
    } catch {
      setLastImportSummary((current) => current ?? "Temporary note copies could not be deleted automatically.");
    } finally {
      setRetryingCleanup(false);
    }
  }

  async function persistPendingCleanupOutputs() {
    const messageIds = pendingCleanupMessageIds();
    if (messageIds.length === 0) return;
    setPersistingCleanupOutputs(true);
    try {
      await persistIngestedAttachments({ message_ids: messageIds });
      setPendingCleanupMessageIds([]);
      setLastImportSummary((current) => {
        const warning =
          "Temporary note copies could not be deleted automatically. Retry cleanup to finish the keep-nothing contract.";
        const success = "Extracted knowledge was kept instead, so temporary cleanup is no longer required.";
        const base = (current ?? "").replace(warning, "").trim();
        return base ? `${base} ${success}` : success;
      });
    } catch {
      setLastImportSummary((current) => current ?? "Could not keep extracted knowledge right now.");
    } finally {
      setPersistingCleanupOutputs(false);
    }
  }

  async function onFileDrop(e: DragEvent) {
    e.preventDefault();
    setFileDragOver(false);
    const files = [...(e.dataTransfer?.files ?? [])];
    if (!files.length) return;
    if (importActionOwnsRecovery()) {
      if (!importRecoveryBlocked()) {
        handlePrimaryImportAction();
      }
      return;
    }
    if (uploadEntryBlocked()) return;
    await uploadFiles(files);
  }

  async function onFileInputChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement | null;
    const files = [...(input?.files ?? [])];
    if (!files.length) {
      if (input) input.value = "";
      return;
    }
    if (importActionOwnsRecovery()) {
      if (!importRecoveryBlocked()) {
        handlePrimaryImportAction();
      }
      if (input) input.value = "";
      return;
    }
    if (uploadEntryBlocked()) {
      if (input) input.value = "";
      return;
    }
    await uploadFiles(files);
    if (input) input.value = "";
  }

  function openFilePicker() {
    if (importActionOwnsRecovery()) {
      if (!importRecoveryBlocked()) {
        handlePrimaryImportAction();
      }
      return;
    }
    if (uploadEntryBlocked()) return;
    fileInputRef?.click();
  }

  function handlePrimaryImportAction() {
    if (importActionOwnsStorageRetry()) {
      if (importRecoveryBlocked()) return;
      void retryUploadStorageRefresh();
      return;
    }
    if (importActionOwnsGenericStorageRetry()) {
      retryGenericStoragePolicyLoad();
      return;
    }
    openFilePicker();
  }

  async function handleExport() {
    const currentSection = section();
    if (exporting() || uploading() || loading() || candidateLoading() || billingLoading() || archiving() || autoArchiving() || archiveTarget() || showAutoArchive() || currentSection === "archive") return;
    setExporting(true);
    setActionError(null);
    try {
      const prefix = PARA_PREFIX[currentSection];
      const blob = await exportParaSection(prefix);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `para_${currentSection}.md`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 0);
    } catch (error: unknown) {
      setActionError(
        buildParaFailureReceipt(
          "Export PARA section",
          error instanceof Error ? error.message : "Failed to export PARA section.",
        ),
      );
    } finally {
      setExporting(false);
    }
  }

  async function handleApproveAutoArchive() {
    if (!showAutoArchive() || loading() || candidateLoading() || billingLoading() || archiveTarget() || archiving() || autoArchiving() || uploading() || exporting()) return;
    const ids = normalizeAutoArchiveCandidateIds(candidates());
    if (!ids.length || ids.length !== candidates().length) {
      setCandidateError(ids.length > 0 ? buildStaleReviewSnapshotReceipt() : buildUnavailableReviewSnapshotReceipt());
      return;
    }
    setActionError(null);
    setCandidateError(null);
    setAutoArchiving(true);
    try {
      await approveAutoArchive(ids, "inactive");
      setCandidates([]);
      setItems((current) => current.filter((item) => !ids.includes(normalizeParaTargetId(item.target_id))));
      closeAutoArchiveModal(true, { clearError: true });
      const refreshed = await loadSection(section());
      if (!refreshed) {
        setActionError(buildAppliedRefreshWarning("Archive PARA candidates"));
      }
    } catch (error: unknown) {
      setCandidateError(
        buildArchiveReviewFailureReceipt(
          error instanceof Error ? error.message : "Failed to archive candidates.",
        ),
      );
    } finally {
      setAutoArchiving(false);
    }
  }

  return (
    <div class="flex h-full flex-col overflow-hidden">
      <div class="flex items-center justify-between border-b border-outline/10 px-6 py-4">
        <div>
          <h1 class="text-lg font-semibold text-on-surface">PARA Navigator</h1>
          <p class="text-xs text-on-surface-variant/60">Projects | Areas | Resources | Archive</p>
          <p class="mt-1 max-w-2xl text-[11px] leading-relaxed text-on-surface-variant/65">
            <Show
              when={
                !!archiveTarget() ||
                showAutoArchive() ||
                billingLoading() ||
                visibleStoragePolicyLoadFailed() ||
                uploadStorageRefreshFailed() ||
                uploadStorageRefreshPending() ||
                uploadStoragePolicyRefreshing() ||
                uploadStorageUsageRefreshing() ||
                !uploadPolicyMounted() ||
                !storageSummaryMounted()
              }
              fallback={
                <>
                  Files and classified messages here become <span class="font-medium text-on-surface">private workspace memory items</span> for this account. Use <span class="font-medium text-on-surface">Import files</span> or drag a file into PARA to upload it into your storage quota and tag it into the <span class="font-medium text-on-surface">{importTargetSection()}</span> section.
                </>
              }
            >
              {paraIntroSummary()}
            </Show>
          </p>
        </div>
        <div class="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            class="hidden"
            onChange={(e) => void onFileInputChange(e)}
          />
          <button
            type="button"
            onClick={handlePrimaryImportAction}
            disabled={importActionOwnsRecovery() ? importRecoveryBlocked() : uploadActionBlocked()}
            class={[
              "rounded-xl border px-3 py-1.5 text-xs font-medium transition disabled:opacity-40",
              importActionNeedsAttention()
                ? "border-amber-300/40 bg-amber-50/80 text-amber-800 hover:bg-amber-100"
                : "border-outline/20 bg-white/60 text-on-surface hover:bg-white/80",
            ].join(" ")}
          >
            {importActionLabel()}
          </button>
          <Show when={hasVisibleAutoArchiveQueue()}>
            <button
              type="button"
              onClick={openAutoArchiveModal}
              disabled={!hasMountedAutoArchiveQueue() || !hasMountedAutoArchiveSnapshot() || isArchiveReviewFailureReceipt(candidateError()) || showAutoArchive() || loading() || candidateLoading() || billingLoading() || autoArchiving() || !!archiveTarget() || archiving() || uploading() || exporting()}
              class={[
                "rounded-xl border px-3 py-1.5 text-xs font-medium transition disabled:opacity-40",
                reviewQueueRecoveryButtonNeedsAttention()
                  ? "border-amber-200/70 bg-amber-100/80 text-amber-800 hover:bg-amber-100"
                  : "border-amber-300/40 bg-amber-50 text-amber-700 hover:bg-amber-100",
              ].join(" ")}
            >
              {loading()
                ? "Refreshing PARA section..."
                : candidateLoading()
                  ? "Refreshing review queue..."
                : billingLoading()
                  ? "Storage policy refresh is in progress..."
                : isArchiveReviewFailureReceipt(candidateError())
                  ? "Refresh the review queue for archive review"
                : !hasMountedAutoArchiveQueue()
                  ? mountedAutoArchiveQueueCount() > 0
                    ? "Use the review queue refresh action to recover the stale review queue"
                    : "Use the review queue refresh action to recover the unavailable review queue"
                : !hasMountedAutoArchiveSnapshot()
                  ? mountedAutoArchiveQueueCount() > 0
                    ? "Use the review queue refresh action to recover the stale review snapshot"
                    : "Use the review queue refresh action to recover the unavailable review snapshot"
                : showAutoArchive()
                  ? "Review modal open..."
                : uploading()
                    ? "Upload in progress..."
                    : exporting()
                      ? "Export in progress..."
                  : archiveTarget()
                    ? "Archive modal open..."
                  : archiving()
                      ? "Archiving item..."
                      : autoArchiving()
                        ? "Archiving..."
                        : `${mountedAutoArchiveQueueCount()} items to review`}
            </button>
          </Show>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting() || uploading() || loading() || candidateLoading() || billingLoading() || archiving() || autoArchiving() || !!archiveTarget() || showAutoArchive() || section() === "archive"}
            class={[
              "rounded-xl border px-3 py-1.5 text-xs font-medium transition disabled:opacity-40",
              exportActionNeedsAttention()
                ? "border-amber-200/70 bg-amber-100/80 text-amber-800 hover:bg-amber-100"
                : "border-outline/20 bg-white/60 text-on-surface hover:bg-white/80",
            ].join(" ")}
          >
            {exporting()
              ? "Exporting..."
              : uploading()
                ? "Upload in progress..."
                : loading()
                  ? "Refreshing PARA section..."
                  : candidateLoading()
                    ? "Refreshing review queue..."
                  : billingLoading()
                    ? "Storage policy refresh is in progress..."
              : archiving()
                    ? "Archiving item..."
                  : autoArchiving()
                    ? "Archiving..."
                  : section() === "archive"
                    ? "Archive tab open..."
                  : archiveTarget()
                    ? "Archive modal open..."
                    : showAutoArchive()
                      ? "Review modal open..."
                    : "Export MD"}
          </button>
        </div>
      </div>

      <div class="fixed bottom-0 left-0 right-0 z-30 flex border-t border-outline/10 bg-surface md:relative md:bottom-auto md:border-b md:border-t-0 md:border-b-outline/10">
        <For each={PARA_SECTIONS}>
          {(nextSection) => (
            <button
              type="button"
              onClick={() => selectSection(nextSection.kind)}
              onDragOver={(e) => onSectionDragOver(e, nextSection.kind)}
              onDragLeave={onSectionDragLeave}
              onDrop={(e) => void onSectionDrop(e, nextSection.kind)}
              disabled={sectionSwitchBlocked()}
              class={[
                "flex flex-1 flex-col items-center gap-0.5 px-3 py-2.5 text-xs font-medium transition",
                "md:flex-row md:gap-2 md:py-3",
                dragOver() === nextSection.kind
                  ? "bg-primary/10 text-primary ring-1 ring-primary/30 ring-inset"
                  : sectionSwitchNeedsAttention()
                    ? "bg-amber-50/80 text-amber-800 disabled:hover:bg-amber-50/80 disabled:hover:text-amber-800"
                  : section() === nextSection.kind
                    ? "border-b-2 border-primary text-primary"
                    : "text-on-surface-variant/60 hover:bg-white/40 hover:text-on-surface disabled:hover:bg-transparent disabled:hover:text-on-surface-variant/60",
              ].join(" ")}
            >
              <span class="font-semibold md:hidden">{nextSection.label.charAt(0)}</span>
              <span>{nextSection.label}</span>
              <span class="hidden text-[10px] text-on-surface-variant/40 md:inline">{nextSection.desc}</span>
            </button>
          )}
        </For>
      </div>

      <div
        class={[
          "relative flex-1 overflow-y-auto pb-16 transition md:pb-0",
          fileDragOver()
            ? importDropNeedsAttention()
              ? "bg-amber-50/70 ring-2 ring-amber-300/50 ring-inset"
              : "bg-primary/5 ring-2 ring-primary/30 ring-inset"
            : "",
        ].join(" ")}
        onDragOver={onFileDragOver}
        onDragLeave={onFileDragLeave}
        onDrop={(e) => void onFileDrop(e)}
      >
        <Show when={fileDragOver()}>
          <div class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <p
              class={[
                "rounded-2xl px-6 py-3 text-sm font-medium",
                importDropNeedsAttention() ? "bg-amber-100/90 text-amber-800" : "bg-primary/10 text-primary",
              ].join(" ")}
            >
              {fileDropOverlayLabel()}
            </p>
          </div>
        </Show>

        <Show when={showStoragePolicyCard() || showBillingErrorCard()}>
          <div class="mx-6 mt-4 space-y-2">
            <Show when={showStoragePolicyCard()}>
              <div
                class={[
                  "rounded-2xl border px-4 py-3 text-sm shadow-card",
                  storagePolicyNeedsAttention()
                    ? "border-amber-300/50 bg-amber-50/80 text-amber-800"
                    : "border-white/35 bg-white/70 text-on-surface-variant",
                ].join(" ")}
              >
                <p class="font-medium text-on-surface">Storage policy</p>
                <p class="mt-1 text-xs leading-6">{storageSummary()}</p>
                <Show when={storagePolicyStatusLabel()}>
                  <p
                    classList={{
                      "mt-2 text-[11px] font-semibold uppercase tracking-[0.14em]": true,
                      "text-amber-800": storagePolicyNeedsAttention(),
                      "text-on-surface-variant": !storagePolicyNeedsAttention(),
                    }}
                  >
                    {storagePolicyStatusLabel()}
                  </p>
                </Show>
                <Show when={archiveOnlyEnabled()}>
                  <p class="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800">
                    Archive-only mode active
                  </p>
                </Show>
                <Show when={quotaExceeded() || archiveOnlyEnabled()}>
                  <p class="mt-2 text-xs leading-6">
                    {archiveOnlyWarning() ?? "Storage quota exceeded. Upgrade storage or switch to archive-only mode. Agent retrieval quality will degrade while over quota."}
                  </p>
                </Show>
                <Show when={showStoragePolicyRetryAction()}>
                  <div class="mt-3">
                    <button
                      type="button"
                      onClick={retryGenericStoragePolicyLoad}
                      disabled={importRecoveryBlocked()}
                      class={[
                        "rounded-lg border px-3 py-1.5 text-[11px] font-medium transition disabled:opacity-40",
                        storageRecoveryButtonNeedsAttention()
                          ? "border-amber-200/70 bg-amber-100/80 text-amber-800 hover:bg-amber-100"
                          : "border-current/20 bg-white/70 hover:bg-white/90",
                      ].join(" ")}
                    >
                      {loading()
                        ? "Refreshing PARA section..."
                        : candidateLoading()
                          ? "Refreshing review queue..."
                          : billingLoading()
                            ? "Storage policy refresh is in progress..."
                            : archiving()
                              ? "Archiving item..."
                              : autoArchiving()
                                ? "Archiving..."
                                : uploading()
                                  ? "Upload in progress..."
                                  : exporting()
                                    ? "Export in progress..."
                                    : archiveTarget()
                                      ? "Archive modal open..."
                                      : showAutoArchive()
                                        ? "Review modal open..."
                                        : "Retry storage policy"}
                    </button>
                  </div>
                </Show>
              </div>
            </Show>
            <Show when={showBillingErrorCard()}>
              <div
                classList={{
                  "rounded-2xl border px-4 py-3 text-xs leading-6": true,
                  "border-rose-300/40 bg-rose-50/70 text-rose-800": billingError()?.tone === "danger",
                  "border-amber-300/40 bg-amber-50/70 text-amber-800": billingError()?.tone !== "danger",
                }}
              >
                <p class="font-semibold">{billingError()?.title}</p>
                <p class="mt-1">{billingError()?.summary}</p>
                <p class="mt-1 opacity-90">{billingError()?.nextStep}</p>
                <div class="mt-3">
                  <button
                    type="button"
                    onClick={retryGenericStoragePolicyLoad}
                    disabled={importRecoveryBlocked()}
                    class={[
                      "rounded-lg border px-3 py-1.5 text-[11px] font-medium transition disabled:opacity-40",
                      storageRecoveryButtonNeedsAttention()
                        ? "border-amber-200/70 bg-amber-100/80 text-amber-800 hover:bg-amber-100"
                        : "border-current/20 bg-white/70 hover:bg-white/90",
                    ].join(" ")}
                  >
                    {loading()
                      ? "Refreshing PARA section..."
                      : candidateLoading()
                      ? "Refreshing review queue..."
                      : billingLoading()
                      ? "Storage policy refresh is in progress..."
                      : archiving()
                        ? "Archiving item..."
                      : autoArchiving()
                        ? "Archiving..."
                      : uploading()
                        ? "Upload in progress..."
                        : exporting()
                          ? "Export in progress..."
                        : archiveTarget()
                          ? "Archive modal open..."
                          : showAutoArchive()
                            ? "Review modal open..."
                          : "Retry storage policy"}
                  </button>
                </div>
              </div>
            </Show>
          </div>
        </Show>

        <div class="mx-6 mt-4 rounded-2xl border border-white/35 bg-white/70 px-4 py-4 shadow-card">
          <div class="flex flex-col gap-3">
            <div class="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-white/70 bg-white/75 px-4 py-3">
              <div class="max-w-3xl">
                <p class="text-xs font-semibold uppercase tracking-[0.14em] text-on-surface-variant/55">
                  Import policy
                </p>
                <p class="mt-1 text-sm font-medium text-on-surface">
                  Choose how PARA should organize these uploads and what OmnyID should keep.
                </p>
                <p class="mt-1 text-[11px] leading-5 text-on-surface-variant/70">
                  This uses the same storage and knowledge-linking policy as the main study workspace.
                </p>
              </div>
              <div class="rounded-full border border-primary/15 bg-primary/8 px-3 py-1 text-[11px] font-medium text-primary">
                {combinedKnowledgePolicySummary(importKnowledgeMode(), importRetentionMode())}
              </div>
            </div>
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-on-surface-variant/55">
                Import organization
              </p>
              <div class="mt-2 grid gap-2 md:grid-cols-3">
                <For each={KNOWLEDGE_MODE_OPTIONS}>
                  {(option) => (
                    <button
                      type="button"
                      onClick={() => setImportKnowledgeMode(option.value)}
                      disabled={uploadActionBlocked() || archiving() || autoArchiving()}
                      class={`rounded-2xl border p-3 text-left transition ${
                        importKnowledgeMode() === option.value
                          ? option.value === "zettelkasten"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-950 shadow-sm"
                            : option.value === "connected_notes"
                              ? "border-sky-300 bg-sky-50 text-sky-950 shadow-sm"
                              : "border-slate-300 bg-slate-50 text-slate-950 shadow-sm"
                          : "border-outline/12 bg-white/70 text-on-surface-variant hover:border-primary/20 hover:bg-white"
                      }`}
                    >
                      <div class="text-xs font-semibold">{option.label}</div>
                      <div class="mt-1 text-[11px] font-medium opacity-80">{option.title}</div>
                      <div class="mt-1 text-[11px] leading-4 opacity-75">{option.description}</div>
                    </button>
                  )}
                </For>
              </div>
              <p class="mt-2 text-[11px] leading-5 text-on-surface-variant/65">
                {knowledgeModeSummary(importKnowledgeMode())}
              </p>
            </div>
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-on-surface-variant/55">
                Import retention
              </p>
              <div class="mt-2 grid gap-2 md:grid-cols-3">
                <For each={ATTACHMENT_RETENTION_OPTIONS}>
                  {(option) => (
                    <button
                      type="button"
                      onClick={() => setImportRetentionMode(option.value)}
                      disabled={uploadActionBlocked() || archiving() || autoArchiving()}
                      class={`rounded-2xl border p-3 text-left transition ${
                        importRetentionMode() === option.value
                          ? option.value === "keep_nothing"
                            ? "border-rose-300 bg-rose-50 text-rose-950 shadow-sm"
                            : option.value === "keep_file"
                              ? "border-sky-300 bg-sky-50 text-sky-950 shadow-sm"
                              : "border-emerald-300 bg-emerald-50 text-emerald-950 shadow-sm"
                          : "border-outline/12 bg-white/70 text-on-surface-variant hover:border-primary/20 hover:bg-white"
                      }`}
                    >
                      <div class="text-xs font-semibold">{option.label}</div>
                      <div class="mt-1 text-[11px] font-medium opacity-80">{option.title}</div>
                      <div class="mt-1 text-[11px] leading-4 opacity-75">{option.description}</div>
                    </button>
                  )}
                </For>
              </div>
              <p class="mt-2 text-[11px] leading-5 text-on-surface-variant/65">
                {attachmentRetentionSummary(importRetentionMode())}
              </p>
              <p class="mt-1 text-[11px] leading-5 text-on-surface-variant/65">
                {attachmentRetentionOutcome(importRetentionMode())}
              </p>
            </div>
          </div>
        </div>

        <Show when={lastImportSummary()}>
          <div class="mx-6 mt-4 rounded-xl border border-sky-200/60 bg-sky-50/80 px-4 py-3 text-xs text-sky-800 shadow-card">
            <p>{lastImportSummary()}</p>
            <Show when={pendingCleanupMessageIds().length > 0}>
              <div class="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void persistPendingCleanupOutputs()}
                  disabled={persistingCleanupOutputs() || retryingCleanup() || uploading()}
                  class="rounded-full border border-emerald-200/80 bg-emerald-50/90 px-3 py-1 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {persistingCleanupOutputs() ? "Keeping extracted notes..." : "Keep extracted notes instead"}
                </button>
                <button
                  type="button"
                  onClick={() => void retryPendingCleanup()}
                  disabled={persistingCleanupOutputs() || retryingCleanup() || uploading()}
                  class="rounded-full border border-rose-200/80 bg-rose-50/90 px-3 py-1 text-xs font-medium text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {retryingCleanup() ? "Deleting temporary copies..." : "Retry temporary cleanup"}
                </button>
              </div>
            </Show>
          </div>
        </Show>

        <Show when={uploadStatus()}>
          <div
            classList={{
              "mx-6 mt-4 animate-fade-in rounded-xl px-4 py-2 text-xs": true,
              "bg-primary/8 text-primary": !uploadStatusNeedsAttention(),
              "bg-amber-50/80 text-amber-800": uploadStatusNeedsAttention(),
            }}
          >
            <p>{uploadStatus()}</p>
            <Show when={showUploadStatusStorageRetryAction()}>
              <div class="mt-3">
                <button
                  type="button"
                  onClick={() => void retryUploadStorageRefresh()}
                  disabled={loading() || candidateLoading() || billingLoading() || archiving() || autoArchiving() || uploading() || exporting() || !!archiveTarget() || showAutoArchive()}
                  class={[
                    "rounded-lg border px-3 py-1.5 text-[11px] font-medium transition disabled:opacity-40",
                    uploadStatusStorageRetryButtonNeedsAttention()
                      ? "border-amber-200/70 bg-amber-100/80 text-amber-800 hover:bg-amber-100"
                      : "border-current/20 bg-white/70 hover:bg-white/90",
                  ].join(" ")}
                >
                  {loading()
                    ? "Refreshing PARA section..."
                    : candidateLoading()
                      ? "Refreshing review queue..."
                      : billingLoading()
                        ? uploadStatusStorageRetryPendingLabel()
                        : archiving()
                          ? "Archiving item..."
                          : autoArchiving()
                            ? "Archiving..."
                            : uploading()
                              ? "Upload in progress..."
                                : exporting()
                                  ? "Export in progress..."
                                : archiveTarget()
                                  ? "Archive modal open..."
                                  : showAutoArchive()
                                    ? "Review modal open..."
                                    : uploadStatusStorageRetryLabel()}
                </button>
              </div>
            </Show>
          </div>
        </Show>

        <Show when={actionError()}>
          <div
            classList={{
              "mx-6 mt-4 rounded-xl border px-4 py-3 text-xs shadow-card": true,
              "border-red-200/60 bg-red-50/80 text-red-600": actionError()?.tone === "danger",
              "border-amber-200/60 bg-amber-50/80 text-amber-700": actionError()?.tone !== "danger",
            }}
          >
            <p class="font-semibold">{actionError()?.title}</p>
            <p class="mt-1">{actionError()?.summary}</p>
            <p class="mt-1 opacity-90">{actionError()?.nextStep}</p>
          </div>
        </Show>

        <Show when={candidateError() && !showAutoArchive()}>
          <div
            classList={{
              "mx-6 mt-4 rounded-xl border px-4 py-3 text-xs shadow-card": true,
              "border-red-200/60 bg-red-50/80 text-red-600": candidateError()?.tone === "danger",
              "border-amber-200/60 bg-amber-50/80 text-amber-700": candidateError()?.tone !== "danger",
            }}
          >
            <p class="font-semibold">{candidateError()?.title}</p>
            <p class="mt-1">{candidateError()?.summary}</p>
            <p class="mt-1 opacity-90">{candidateError()?.nextStep}</p>
            <div class="mt-3">
                  <button
                    type="button"
                    onClick={() => void loadAutoArchiveCandidates()}
                    disabled={loading() || candidateLoading() || billingLoading() || autoArchiving() || !!archiveTarget() || archiving() || uploading() || exporting()}
                    class={[
                      "rounded-lg border px-3 py-1.5 text-[11px] font-medium transition disabled:opacity-40",
                      reviewQueueRecoveryButtonNeedsAttention()
                        ? "border-amber-200/70 bg-amber-100/80 text-amber-800 hover:bg-amber-100"
                        : "border-current/20 bg-white/70 hover:bg-white/90",
                    ].join(" ")}
                  >
                  {loading()
                    ? "Refreshing PARA section..."
                    : candidateLoading()
                    ? "Refreshing review queue..."
                    : billingLoading()
                      ? "Storage policy refresh is in progress..."
                    : autoArchiving()
                      ? "Archiving..."
                    : uploading()
                        ? "Upload in progress..."
                    : exporting()
                        ? "Export in progress..."
                    : archiveTarget()
                        ? "Archive modal open..."
                      : archiving()
                        ? "Archiving item..."
                      : isArchiveReviewFailureReceipt(candidateError())
                        ? "Refresh the review queue for archive review"
                      : !hasMountedAutoArchiveQueue()
                        ? mountedAutoArchiveQueueCount() > 0
                          ? "Refresh the stale review queue"
                          : "Refresh the unavailable review queue"
                            : mountedAutoArchiveQueueCount() > 0
                            ? "Refresh the review queue for the stale review snapshot"
                            : "Refresh the review queue for the unavailable review snapshot"}
               </button>
            </div>
          </div>
        </Show>

        <Show when={!candidateError() && !showAutoArchive() && hasVisibleAutoArchiveQueue() && !hasMountedAutoArchiveSnapshot()}>
          <div class="mx-6 mt-4 rounded-xl border border-amber-200/60 bg-amber-50/80 px-4 py-3 text-xs text-amber-700 shadow-card">
              <p class="font-semibold">
                {mountedAutoArchiveQueueCount() > 0
                ? "Review queue snapshot is partially unavailable"
                : "Review queue snapshot is unavailable"}
              </p>
              <p class="mt-1">
                {mountedAutoArchiveQueueCount() > 0
                ? "Some auto-archive rows could not be trusted because the review snapshot is stale."
                : "No trusted auto-archive rows are currently available in this review snapshot."}
              </p>
              <p class="mt-1 opacity-90">
                {mountedAutoArchiveQueueCount() > 0
                ? "Refresh the review queue for the stale review snapshot."
                : "Refresh the review queue for the unavailable review snapshot."}
              </p>
            <div class="mt-3">
              <button
                type="button"
                onClick={() => void loadAutoArchiveCandidates()}
                disabled={loading() || candidateLoading() || billingLoading() || autoArchiving() || !!archiveTarget() || archiving() || uploading() || exporting()}
                class={[
                  "rounded-lg border px-3 py-1.5 text-[11px] font-medium transition disabled:opacity-40",
                  reviewQueueRecoveryButtonNeedsAttention()
                    ? "border-amber-200/70 bg-amber-100/80 text-amber-800 hover:bg-amber-100"
                    : "border-current/20 bg-white/70 hover:bg-white/90",
                ].join(" ")}
              >
                {loading()
                  ? "Refreshing PARA section..."
                  : candidateLoading()
                    ? "Refreshing review queue..."
                    : billingLoading()
                      ? "Storage policy refresh is in progress..."
                      : autoArchiving()
                        ? "Archiving..."
                      : uploading()
                          ? "Upload in progress..."
                      : exporting()
                          ? "Export in progress..."
                        : archiveTarget()
                            ? "Archive modal open..."
                          : archiving()
                            ? "Archiving item..."
                            : mountedAutoArchiveQueueCount() > 0
                              ? "Refresh the review queue for the stale review snapshot"
                              : "Refresh the review queue for the unavailable review snapshot"}
              </button>
            </div>
          </div>
        </Show>

        <Show when={loading()}>
          <div class="flex items-center justify-center py-16 text-sm text-on-surface-variant/40">Loading...</div>
        </Show>

        <Show
          when={!loading() && !loadError()}
          fallback={
            <div class="px-6 py-10">
              <EmptyState
                icon="PA"
                title="Could not load PARA section"
                body={`${loadError()?.summary ?? "PARA is unavailable right now."} ${loadError()?.nextStep ?? ""}`.trim()}
                action={
                  <button
                    type="button"
                    onClick={() => {
                      if (retrySectionBlocked()) return;
                      void loadSection(section());
                    }}
                    disabled={retrySectionBlocked()}
                    class={[
                      "rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-40",
                      retrySectionButtonNeedsAttention()
                        ? "border border-amber-200/70 bg-amber-100/80 text-amber-800 hover:bg-amber-100"
                        : "bg-primary text-white hover:bg-primary/80",
                    ].join(" ")}
                  >
                    {loading()
                      ? "Refreshing PARA section..."
                      : candidateLoading()
                        ? "Refreshing review queue..."
                      : billingLoading()
                        ? "Storage policy refresh is in progress..."
                      : autoArchiving()
                        ? "Archiving..."
                      : archiving()
                        ? "Archiving item..."
                      : uploading()
                        ? "Upload in progress..."
                        : exporting()
                          ? "Export in progress..."
                      : archiveTarget()
                        ? "Archive modal open..."
                        : showAutoArchive()
                          ? "Review modal open..."
                          : "Refresh the PARA section"}
                  </button>
                }
              />
            </div>
          }
        >
          <Show when={section() !== "archive"}>
            <Show when={filteredLiveItems().length === 0}>
              <div class="flex flex-col items-center justify-center py-20 text-center">
                <div class="mb-3 text-on-surface-variant/25">
                  <RailIcon id="para" />
                </div>
                <p class="text-sm text-on-surface-variant/50">
                  {hasMountedLiveSectionSnapshot()
                    ? section() === "resource" && resourceLens() !== "all"
                      ? `No ${resourceLens().replace(/_/g, " ")} resources yet`
                      : `No ${section()}s yet`
                    : `${section()} snapshot is unavailable`}
                </p>
                <p class="mt-1 text-xs text-on-surface-variant/35">
                  {hasMountedLiveSectionSnapshot()
                    ? section() === "resource" && resourceLens() !== "all"
                      ? "Change the resource lens or import new material in this organization mode."
                      : "Drag items here, drop a local file, or classify an existing message"
                    : `No trusted ${section()} rows are currently available in this snapshot.`}
                </p>
                <Show when={!hasMountedLiveSectionSnapshot()}>
                  <div class="mt-4">
                      <button
                        type="button"
                        onClick={() => {
                          if (retrySectionBlocked()) return;
                          void loadSection(section());
                        }}
                        disabled={retrySectionBlocked()}
                        class={[
                          "rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-40",
                          retrySectionButtonNeedsAttention()
                            ? "border-amber-200/70 bg-amber-100/80 text-amber-800 hover:bg-amber-100"
                            : "border-outline/15 bg-white/80 text-on-surface-variant hover:bg-white",
                        ].join(" ")}
                      >
                      {loading()
                        ? "Refreshing PARA section..."
                        : candidateLoading()
                          ? "Refreshing review queue..."
                          : billingLoading()
                            ? "Storage policy refresh is in progress..."
                            : autoArchiving()
                              ? "Archiving..."
                              : archiving()
                                ? "Archiving item..."
                                : uploading()
                                  ? "Upload in progress..."
                                  : exporting()
                                    ? "Export in progress..."
                                    : archiveTarget()
                                    ? "Archive modal open..."
                                      : showAutoArchive()
                                        ? "Review modal open..."
                                        : `Refresh the PARA section for the unavailable ${section()} snapshot`}
                    </button>
                  </div>
                </Show>
              </div>
            </Show>
            <Show when={mountedLiveItems().length > 0 && !hasMountedLiveSectionSnapshot()}>
              <div class="mx-6 mt-6 rounded-2xl border border-amber-200/60 bg-amber-50/80 px-4 py-3 text-sm text-amber-700">
                <p class="font-medium">{`${section()} snapshot is partially unavailable`}</p>
                <p class="mt-1 text-xs opacity-90">{`Some ${section()} rows could not be trusted because this snapshot is stale.`}</p>
                <div class="mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (retrySectionBlocked()) return;
                      void loadSection(section());
                    }}
                    disabled={retrySectionBlocked()}
                    class={[
                      "rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-40",
                      retrySectionButtonNeedsAttention()
                        ? "border-amber-200/70 bg-amber-100/80 text-amber-800 hover:bg-amber-100"
                        : "border-amber-200/70 bg-white/80 text-amber-700 hover:bg-white",
                    ].join(" ")}
                  >
                    {loading()
                      ? "Refreshing PARA section..."
                      : candidateLoading()
                        ? "Refreshing review queue..."
                        : billingLoading()
                          ? "Storage policy refresh is in progress..."
                          : autoArchiving()
                            ? "Archiving..."
                            : archiving()
                              ? "Archiving item..."
                              : uploading()
                                ? "Upload in progress..."
                                : exporting()
                                  ? "Export in progress..."
                                  : archiveTarget()
                                    ? "Archive modal open..."
                                    : showAutoArchive()
                                      ? "Review modal open..."
                                      : `Refresh the PARA section for the stale ${section()} snapshot`}
                  </button>
                </div>
              </div>
            </Show>
            <Show when={section() === "resource" && mountedLiveItems().length > 0}>
              <div class="mx-6 mt-6 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setResourceLens("all")}
                  disabled={reclassifyBlocked()}
                  class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    resourceLens() === "all"
                      ? "bg-slate-900 text-white"
                      : "bg-white/70 text-on-surface-variant hover:bg-white"
                  }`}
                >
                  All resources ({resourceLensCount("all")})
                </button>
                <button
                  type="button"
                  onClick={() => setResourceLens("connected_notes")}
                  disabled={reclassifyBlocked()}
                  class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    resourceLens() === "connected_notes"
                      ? "bg-sky-600 text-white"
                      : "bg-sky-100/80 text-sky-700 hover:bg-sky-200"
                  }`}
                >
                  Connected notes ({resourceLensCount("connected_notes")})
                </button>
                <button
                  type="button"
                  onClick={() => setResourceLens("zettelkasten")}
                  disabled={reclassifyBlocked()}
                  class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    resourceLens() === "zettelkasten"
                      ? "bg-emerald-600 text-white"
                      : "bg-emerald-100/80 text-emerald-700 hover:bg-emerald-200"
                  }`}
                >
                  Zettelkasten ({resourceLensCount("zettelkasten")})
                </button>
                <button
                  type="button"
                  onClick={() => setResourceLens("review_queue")}
                  disabled={reclassifyBlocked()}
                  class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    resourceLens() === "review_queue"
                      ? "bg-amber-600 text-white"
                      : "bg-amber-100/80 text-amber-700 hover:bg-amber-200"
                  }`}
                >
                  Review queue ({resourceLensCount("review_queue")})
                </button>
                <button
                  type="button"
                  onClick={() => setResourceLens("permanent_notes")}
                  disabled={reclassifyBlocked()}
                  class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    resourceLens() === "permanent_notes"
                      ? "bg-emerald-700 text-white"
                      : "bg-emerald-50/90 text-emerald-800 hover:bg-emerald-100"
                  }`}
                >
                  Permanent notes ({resourceLensCount("permanent_notes")})
                </button>
                <button
                  type="button"
                  onClick={() => setResourceLens("reference")}
                  disabled={reclassifyBlocked()}
                  class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    resourceLens() === "reference"
                      ? "bg-amber-600 text-white"
                      : "bg-amber-100/80 text-amber-700 hover:bg-amber-200"
                  }`}
                >
                  Reference ({resourceLensCount("reference")})
                </button>
              </div>
            </Show>
            <div class="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3">
              <For each={filteredLiveItems()}>
                {(item) => (
                  <div
                    draggable={!reclassifyBlocked() && hasMountedParaTargetId(item.target_id)}
                    onDragStart={(e) => onItemDragStart(e, item)}
                    onDragEnd={onItemDragEnd}
                    class="glass-card card-hover active:cursor-grabbing cursor-grab rounded-2xl p-4 transition"
                  >
                    <div class="mb-2 flex flex-wrap gap-1">
                      <Show when={section() === "resource" && paraTagsIncludeReviewPending(readMountedParaTags(item.para_tags))}>
                        <span class="rounded-full bg-amber-100/90 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                          Review pending
                        </span>
                      </Show>
                      <Show
                        when={
                          section() === "resource"
                          && !paraTagsIncludeReviewPending(readMountedParaTags(item.para_tags))
                          && paraTagsIncludePermanentNote(readMountedParaTags(item.para_tags))
                        }
                      >
                        <span class="rounded-full bg-emerald-100/90 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                          Permanent note
                        </span>
                      </Show>
                      <Show
                        when={
                          section() === "resource"
                          && !paraTagsIncludeReviewPending(readMountedParaTags(item.para_tags))
                          && !paraTagsIncludePermanentNote(readMountedParaTags(item.para_tags))
                          && paraTagsIncludeSourceNote(readMountedParaTags(item.para_tags))
                        }
                      >
                        <span class="rounded-full bg-emerald-50/95 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          Source note
                        </span>
                      </Show>
                    </div>
                    <p class="truncate text-sm font-medium text-on-surface">{readParaTargetLabel(item.target_id)}</p>
                    <div class="mt-2 flex flex-wrap gap-1">
                      <For each={readMountedParaTags(item.para_tags)}>
                        {(tag) => (
                          <span class="rounded-full bg-primary/8 px-2 py-0.5 text-[10px] font-medium text-primary/70">{readParaTagLabel(tag)}</span>
                        )}
                      </For>
                    </div>
                    <div class="mt-3 flex items-center justify-between">
                      <span class="text-[10px] text-on-surface-variant/30">{readParaItemDateLabel(item.updated_at)}</span>
                      <div class="flex items-center gap-2">
                        <Show
                          when={
                            section() === "resource"
                            && paraTagsIncludeSourceNote(readMountedParaTags(item.para_tags))
                            && !paraTagsIncludePermanentNote(readMountedParaTags(item.para_tags))
                          }
                        >
                          <button
                            type="button"
                            onClick={() => void handlePromotePermanentNote(item)}
                            disabled={promoteEntryButtonNeedsAttention(item.target_id)}
                            class={[
                              "rounded-lg px-2.5 py-1 text-[10px] transition disabled:opacity-40",
                              promoteEntryButtonNeedsAttention(item.target_id)
                                ? "bg-emerald-100/80 text-emerald-900 hover:bg-emerald-100"
                                : "bg-emerald-600 text-white hover:bg-emerald-700",
                            ].join(" ")}
                          >
                            {promotingTargetId() === normalizeParaTargetId(item.target_id)
                              ? "Promoting..."
                              : loading()
                                ? "Refreshing PARA section..."
                                : candidateLoading()
                                  ? "Refreshing review queue..."
                                  : billingLoading()
                                    ? "Storage policy refresh is in progress..."
                                    : archiveTarget()
                                      ? "Archive modal open..."
                                      : showAutoArchive()
                                        ? "Review modal open..."
                                        : archiving()
                                          ? "Archiving item..."
                                          : autoArchiving()
                                            ? "Archiving..."
                                            : uploading()
                                              ? "Upload in progress..."
                                              : exporting()
                                                ? "Export in progress..."
                                                : !hasMountedParaTargetId(item.target_id)
                                                  ? `Item unavailable; use the PARA section refresh action for the stale ${section()} snapshot`
                                                  : "Promote note"}
                          </button>
                        </Show>
                        <Show when={section() === "resource" && paraTagsIncludeReviewPending(readMountedParaTags(item.para_tags))}>
                          <button
                            type="button"
                            onClick={() => void handleMarkReviewed(item)}
                            disabled={reviewEntryButtonNeedsAttention(item.target_id)}
                            class={[
                              "rounded-lg px-2.5 py-1 text-[10px] transition disabled:opacity-40",
                              reviewEntryButtonNeedsAttention(item.target_id)
                                ? "bg-amber-100/80 text-amber-800 hover:bg-amber-100"
                                : "bg-emerald-100/80 text-emerald-700 hover:bg-emerald-100",
                            ].join(" ")}
                          >
                            {reviewingTargetId() === normalizeParaTargetId(item.target_id)
                              ? "Reviewing..."
                              : loading()
                                ? "Refreshing PARA section..."
                                : candidateLoading()
                                  ? "Refreshing review queue..."
                                  : billingLoading()
                                    ? "Storage policy refresh is in progress..."
                                    : archiveTarget()
                                      ? "Archive modal open..."
                                      : showAutoArchive()
                                        ? "Review modal open..."
                                        : archiving()
                                          ? "Archiving item..."
                                          : autoArchiving()
                                            ? "Archiving..."
                                            : uploading()
                                              ? "Upload in progress..."
                                              : exporting()
                                                ? "Export in progress..."
                                                : !hasMountedParaTargetId(item.target_id)
                                                  ? `Item unavailable; use the PARA section refresh action for the stale ${section()} snapshot`
                                                  : "Mark reviewed"}
                          </button>
                        </Show>
                        <button
                          type="button"
                          onClick={() => openArchiveModal(item)}
                          disabled={archiveEntryBlocked() || !hasMountedParaTargetId(item.target_id)}
                          class={[
                            "rounded-lg px-2.5 py-1 text-[10px] transition disabled:opacity-40",
                            archiveEntryButtonNeedsAttention(item.target_id)
                              ? "bg-amber-100/80 text-amber-800 hover:bg-amber-100"
                              : "text-on-surface-variant/40 hover:bg-on-surface/5 hover:text-on-surface-variant",
                          ].join(" ")}
                        >
                          {loading()
                            ? "Refreshing PARA section..."
                            : candidateLoading()
                              ? "Refreshing review queue..."
                              : billingLoading()
                                ? "Storage policy refresh is in progress..."
                                : archiveTarget()
                                  ? "Archive modal open..."
                                  : showAutoArchive()
                                    ? "Review modal open..."
                                    : archiving()
                                      ? "Archiving item..."
                                      : autoArchiving()
                                        ? "Archiving..."
                                        : uploading()
                                          ? "Upload in progress..."
                                            : exporting()
                                            ? "Export in progress..."
                                            : !hasMountedParaTargetId(item.target_id)
                                              ? `Item unavailable; use the PARA section refresh action for the stale ${section()} snapshot`
                                              : "Archive"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>

            <Show when={section() === "archive"}>
              <Show when={mountedArchivedItems().length === 0}>
                <div class="flex flex-col items-center justify-center py-20 text-center">
                  <p class="text-sm text-on-surface-variant/50">
                  {hasMountedArchiveSnapshot()
                    ? "Archive is empty"
                    : "Archive snapshot is unavailable"}
                  </p>
                <p class="mt-1 text-xs text-on-surface-variant/35">
                  {hasMountedArchiveSnapshot()
                    ? "Archived items will appear here after PARA items are completed or retired."
                    : "No trusted archived rows are currently available in this archive snapshot."}
                </p>
                <Show when={!hasMountedArchiveSnapshot()}>
                  <div class="mt-4">
                      <button
                        type="button"
                        onClick={() => {
                          if (retrySectionBlocked()) return;
                          void loadSection(section());
                        }}
                        disabled={retrySectionBlocked()}
                        class={[
                          "rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-40",
                          retrySectionButtonNeedsAttention()
                            ? "border-amber-200/70 bg-amber-100/80 text-amber-800 hover:bg-amber-100"
                            : "border-outline/15 bg-white/80 text-on-surface-variant hover:bg-white",
                        ].join(" ")}
                      >
                      {loading()
                        ? "Refreshing PARA section..."
                        : candidateLoading()
                          ? "Refreshing review queue..."
                          : billingLoading()
                            ? "Storage policy refresh is in progress..."
                            : autoArchiving()
                              ? "Archiving..."
                              : archiving()
                                ? "Archiving item..."
                                : uploading()
                                  ? "Upload in progress..."
                                  : exporting()
                                    ? "Export in progress..."
                                    : archiveTarget()
                                    ? "Archive modal open..."
                                      : showAutoArchive()
                                        ? "Review modal open..."
                                        : "Refresh the PARA section to recover the unavailable archive snapshot"}
                    </button>
                  </div>
                </Show>
              </div>
            </Show>
            <Show when={mountedArchivedItems().length > 0 && !hasMountedArchiveSnapshot()}>
              <div class="mx-6 mt-6 rounded-2xl border border-amber-200/60 bg-amber-50/80 px-4 py-3 text-sm text-amber-700">
                <p class="font-medium">Archive snapshot is partially unavailable</p>
                <p class="mt-1 text-xs opacity-90">Some archived rows could not be trusted because the archive snapshot is stale.</p>
                <div class="mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (retrySectionBlocked()) return;
                      void loadSection(section());
                    }}
                    disabled={retrySectionBlocked()}
                    class={[
                      "rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-40",
                      retrySectionButtonNeedsAttention()
                        ? "border-amber-200/70 bg-amber-100/80 text-amber-800 hover:bg-amber-100"
                        : "border-amber-200/70 bg-white/80 text-amber-700 hover:bg-white",
                    ].join(" ")}
                  >
                    {loading()
                      ? "Refreshing PARA section..."
                      : candidateLoading()
                        ? "Refreshing review queue..."
                        : billingLoading()
                          ? "Storage policy refresh is in progress..."
                          : autoArchiving()
                            ? "Archiving..."
                            : archiving()
                              ? "Archiving item..."
                              : uploading()
                                ? "Upload in progress..."
                                : exporting()
                                  ? "Export in progress..."
                                  : archiveTarget()
                                    ? "Archive modal open..."
                                      : showAutoArchive()
                                        ? "Review modal open..."
                                        : "Refresh the PARA section to recover the stale archive snapshot"}
                    </button>
                  </div>
                </div>
              </Show>
            <div class="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3">
              <For each={mountedArchivedItems()}>
                {(item) => (
                  <div class="glass-card rounded-2xl p-4">
                    <p class="truncate text-sm font-medium text-on-surface">{readParaTargetLabel(item.target_id)}</p>
                    <div class="mt-2 flex flex-wrap gap-1">
                      <For each={readMountedParaTags(item.para_tags)}>
                        {(tag) => <span class="rounded-full bg-outline/10 px-2 py-0.5 text-[10px] text-outline">{readParaTagLabel(tag)}</span>}
                      </For>
                    </div>
                    <Show when={readMountedParaText(item.reason)}>
                      <p class="mt-2 text-xs capitalize text-on-surface-variant/50">{readMountedParaText(item.reason)}</p>
                    </Show>
                    <Show when={readMountedParaText(item.context)}>
                      <p class="mt-1 text-[11px] italic text-on-surface-variant/40">{readMountedParaText(item.context)}</p>
                    </Show>
                    <p class="mt-2 text-[10px] text-on-surface-variant/30">{readParaItemDateLabel(item.archived_at, item.updated_at)}</p>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>

      <Show when={archiveTarget()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div class="glass-surface w-full max-w-sm rounded-3xl p-6 shadow-xl">
            <h2
              classList={{
                "text-base font-semibold": true,
                "text-on-surface": hasMountedArchiveTarget() && !isArchiveFlowFailureReceipt(archiveError()),
                "text-amber-800": !hasMountedArchiveTarget() || isArchiveFlowFailureReceipt(archiveError()),
              }}
            >
              {isArchiveFlowFailureReceipt(archiveError())
                ? "Archive item could not be archived. Close this modal to reopen the archive flow after the section refreshes"
                : hasMountedArchiveTarget()
                  ? "Archive item"
                  : "No trusted archive target is currently available"}
            </h2>
            <p
              classList={{
                "mt-0.5 text-xs": true,
                truncate: hasMountedArchiveTarget() && !isArchiveFlowFailureReceipt(archiveError()),
                "text-on-surface-variant/50": hasMountedArchiveTarget() && !isArchiveFlowFailureReceipt(archiveError()),
                "text-amber-800": !hasMountedArchiveTarget() || isArchiveFlowFailureReceipt(archiveError()),
              }}
            >
              {isArchiveFlowFailureReceipt(archiveError())
                ? "Archive item could not be archived. Close this modal to reopen the archive flow after the section refreshes."
                : hasMountedArchiveTarget()
                  ? readParaTargetLabel(archiveTarget()?.target_id)
                  : "The mounted archive target disappeared before this archive action could be submitted."}
            </p>
            <div class="mt-4">
              <label class="text-xs font-medium text-on-surface-variant">Reason</label>
              <select
                value={archiveReason()}
                onInput={(e) => {
                  setArchiveReason(e.currentTarget.value);
                  if (archiveError()?.title === "The archive reason is no longer valid") {
                    setArchiveError(null);
                  }
                }}
                disabled={loading() || candidateLoading() || billingLoading() || showAutoArchive() || archiving() || autoArchiving() || uploading() || exporting() || isArchiveFlowFailureReceipt(archiveError()) || !hasMountedArchiveTarget()}
                class={[
                  "mt-1.5 w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:opacity-70",
                  archiveModalPrimaryActionNeedsAttention()
                    ? "border border-amber-200/70 bg-amber-50/80 text-amber-800 focus:ring-amber-200/60"
                    : "border border-outline/20 bg-white/80 text-on-surface focus:ring-primary/30",
                ].join(" ")}
              >
                <For each={ARCHIVE_REASONS}>{(reason) => <option value={reason}>{reason.replace(/_/g, " ")}</option>}</For>
              </select>
            </div>
            <div class="mt-3">
              <label class="text-xs font-medium text-on-surface-variant">Context (optional)</label>
              <div class="mt-1.5">
                <TiptapEditor
                  mode="compact"
                  initialContent={archiveContext()}
                  disabled={loading() || candidateLoading() || billingLoading() || showAutoArchive() || archiving() || autoArchiving() || uploading() || exporting() || isArchiveFlowFailureReceipt(archiveError()) || !hasMountedArchiveTarget()}
                  placeholder="Why are you archiving this?"
                  showToolbar={false}
                  showFooter={false}
                  submitShortcut="none"
                  clearOnSend={false}
                  appearance="minimal"
                  class={archiveModalPrimaryActionNeedsAttention()
                    ? "border-amber-200/70 bg-amber-50/80 text-amber-800"
                    : "border-outline/20 bg-white/80 text-on-surface"}
                  contentClass="min-h-[4.5rem] text-sm"
                  onChange={(_text, markdown) => setArchiveContext(markdown)}
                  onSend={async () => {}}
                />
              </div>
            </div>
            <Show when={archiveError()}>
              <div
                classList={{
                  "mt-3 rounded-xl border px-3 py-2 text-xs": true,
                  "border-red-200/60 bg-red-50/80 text-red-600": archiveError()?.tone === "danger",
                  "border-amber-200/60 bg-amber-50/80 text-amber-700": archiveError()?.tone !== "danger",
                }}
              >
                <p class="font-semibold">{archiveError()?.title}</p>
                <p class="mt-1">{archiveError()?.summary}</p>
                <p class="mt-1 opacity-90">{archiveError()?.nextStep}</p>
              </div>
            </Show>
            <div class="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => closeArchiveModal()}
                disabled={archiving()}
                class={[
                  "rounded-xl px-4 py-2 text-sm transition disabled:opacity-40",
                  archiving() ||
                  isArchiveFlowFailureReceipt(archiveError()) ||
                  !hasMountedArchiveTarget()
                    ? "bg-amber-100/80 text-amber-800 hover:bg-amber-100"
                    : "text-on-surface-variant hover:bg-on-surface/5",
                ].join(" ")}
              >
                {archiving()
                  ? "Archiving..."
                  : isArchiveFlowFailureReceipt(archiveError())
                  ? "Close this modal to reopen the archive flow after the section refreshes"
                  : !hasMountedArchiveTarget()
                    ? "Close this modal to reopen the archive flow after the archive target becomes available again."
                    : "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => void confirmArchive()}
                disabled={loading() || candidateLoading() || billingLoading() || showAutoArchive() || archiving() || autoArchiving() || uploading() || exporting() || !hasMountedArchiveTarget() || !ARCHIVE_REASONS.includes(archiveReason() as (typeof ARCHIVE_REASONS)[number]) || isArchiveFlowFailureReceipt(archiveError())}
                class={[
                  "rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-40",
                  archiveModalPrimaryActionNeedsAttention()
                    ? "border border-amber-200/70 bg-amber-100/80 text-amber-800 hover:bg-amber-100"
                    : "bg-primary text-white hover:bg-primary/90",
                ].join(" ")}
              >
                {loading()
                  ? "Refreshing PARA section..."
                  : candidateLoading()
                    ? "Refreshing review queue..."
                    : billingLoading()
                      ? "Storage policy refresh is in progress..."
                      : autoArchiving()
                        ? "Archiving..."
                        : uploading()
                            ? "Upload in progress..."
                          : exporting()
                            ? "Export in progress..."
                            : isArchiveFlowFailureReceipt(archiveError())
                              ? "Use the close action to reopen the archive flow after the section refreshes"
                            : !hasMountedArchiveTarget()
                              ? "Use the close action to reopen the archive flow after the archive target becomes available again"
                              : !ARCHIVE_REASONS.includes(archiveReason() as (typeof ARCHIVE_REASONS)[number])
                                ? "Select a supported archive reason before submitting again"
                              : archiving()
                                ? "Archiving..."
                                : "Archive"}
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={showAutoArchive()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div class="glass-surface w-full max-w-md rounded-3xl p-6 shadow-xl">
            <h2
              classList={{
                "text-base font-semibold": true,
                "text-on-surface": hasMountedAutoArchiveSnapshot() && !isArchiveReviewFailureReceipt(candidateError()),
                "text-amber-800": !hasMountedAutoArchiveSnapshot() || isArchiveReviewFailureReceipt(candidateError()),
              }}
            >
              {isArchiveReviewFailureReceipt(candidateError())
                ? "Archive review could not be completed. Refresh the review queue for archive review"
                : hasMountedAutoArchiveSnapshot()
                ? "Review auto-archive candidates"
                : mountedAutoArchiveQueueCount() > 0
                  ? "The review queue snapshot is partially unavailable"
                  : "The review queue snapshot is unavailable"}
            </h2>
            <p
              classList={{
                "mt-1 text-xs": true,
                "text-on-surface-variant/60": hasMountedAutoArchiveSnapshot() && !isArchiveReviewFailureReceipt(candidateError()),
                "text-amber-800": !hasMountedAutoArchiveSnapshot() || isArchiveReviewFailureReceipt(candidateError()),
              }}
            >
              {isArchiveReviewFailureReceipt(candidateError())
                ? "Archive review could not be completed. Refresh the review queue for archive review."
                : hasMountedAutoArchiveSnapshot()
                ? `${mountedAutoArchiveQueueCount()} classifications have not been updated in 6 months. Archive them?`
                : mountedAutoArchiveQueueCount() > 0
                ? "Some mounted review rows changed before this review action could be completed."
                : "No mounted review rows remain trusted for this review action."}
            </p>
            <div class="mt-4 max-h-48 space-y-1 overflow-y-auto">
              <Show
              when={hasMountedAutoArchiveSnapshot()}
              fallback={
                <div class="rounded-xl border border-amber-200/70 bg-amber-100/80 px-3 py-2 text-xs text-amber-800 shadow-sm">
                  {isArchiveReviewFailureReceipt(candidateError())
                    ? "Archive review could not be completed. Refresh the review queue for archive review."
                    : mountedAutoArchiveQueueCount() > 0
                      ? "Some mounted review rows changed before this review action could be completed."
                      : "No mounted review rows remain trusted for this review action."}
                </div>
              }
            >
                <For each={mountedAutoArchiveCandidates()}>
                  {(candidate) => (
                    <div class="flex items-center justify-between rounded-lg bg-on-surface/3 px-3 py-2">
                      <span class="truncate text-xs text-on-surface">{readParaTargetLabel(candidate.target_id)}</span>
                      <span class="ml-2 flex-shrink-0 text-[10px] text-on-surface-variant/40">{readAutoArchiveCandidateDateLabel(candidate.created_at)}</span>
                    </div>
                  )}
                </For>
              </Show>
            </div>
            <Show when={candidateError()}>
              <div
                classList={{
                  "mt-3 rounded-xl border px-3 py-2 text-xs": true,
                  "border-red-200/60 bg-red-50/80 text-red-600": candidateError()?.tone === "danger",
                  "border-amber-200/60 bg-amber-50/80 text-amber-700": candidateError()?.tone !== "danger",
                }}
              >
                <p class="font-semibold">{candidateError()?.title}</p>
                <p class="mt-1">{candidateError()?.summary}</p>
                <p class="mt-1 opacity-90">{candidateError()?.nextStep}</p>
                <div class="mt-3">
                  <button
                    type="button"
                    onClick={() => void loadAutoArchiveCandidates()}
                    disabled={loading() || candidateLoading() || billingLoading() || autoArchiving() || !!archiveTarget() || archiving() || uploading() || exporting()}
                    class={[
                      "rounded-lg border px-3 py-1.5 text-[11px] font-medium transition disabled:opacity-40",
                      reviewQueueRecoveryButtonNeedsAttention()
                        ? "border-amber-200/70 bg-amber-100/80 text-amber-800 hover:bg-amber-100"
                        : "border-current/20 bg-white/70 hover:bg-white/90",
                    ].join(" ")}
                  >
                    {loading()
                      ? "Refreshing PARA section..."
                      : candidateLoading()
                      ? "Refreshing review queue..."
                      : billingLoading()
                        ? "Storage policy refresh is in progress..."
                      : autoArchiving()
                        ? "Archiving..."
                      : uploading()
                          ? "Upload in progress..."
                      : exporting()
                          ? "Export in progress..."
                        : archiveTarget()
                            ? "Archive modal open..."
                            : archiving()
                              ? "Archiving item..."
                            : isArchiveReviewFailureReceipt(candidateError())
                              ? "Refresh the review queue for archive review"
                            : !hasMountedAutoArchiveQueue()
                              ? mountedAutoArchiveQueueCount() > 0
                                ? "Refresh the stale review queue"
                                : "Refresh the unavailable review queue"
                              : mountedAutoArchiveQueueCount() > 0
                                ? "Refresh the review queue for the stale review snapshot"
                                : "Refresh the review queue for the unavailable review snapshot"}
                  </button>
                </div>
              </div>
            </Show>
            <div class="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => closeAutoArchiveModal()}
                disabled={autoArchiving() || candidateLoading()}
                class={[
                  "rounded-xl px-4 py-2 text-sm transition disabled:opacity-40",
                  candidateLoading() || autoArchiving() || isArchiveReviewFailureReceipt(candidateError()) || !hasMountedAutoArchiveSnapshot()
                    ? "bg-amber-100/80 text-amber-800 hover:bg-amber-100"
                    : "text-on-surface-variant hover:bg-on-surface/5",
                ].join(" ")}
              >
                {candidateLoading()
                  ? "Refreshing review queue..."
                  : autoArchiving()
                    ? "Archiving..."
                    : isArchiveReviewFailureReceipt(candidateError())
                      ? "Close this modal to refresh the review queue for archive review"
                    : !hasMountedAutoArchiveSnapshot()
                      ? mountedAutoArchiveQueueCount() > 0
                        ? "Close this modal to leave the stale review snapshot state"
                        : "Close this modal to leave the unavailable review snapshot state"
                      : "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => void handleApproveAutoArchive()}
                disabled={
                  loading() ||
                  candidateLoading() ||
                  billingLoading() ||
                  !!archiveTarget() ||
                  archiving() ||
                  autoArchiving() ||
                  uploading() ||
                  exporting() ||
                  isArchiveReviewFailureReceipt(candidateError()) ||
                  !hasMountedAutoArchiveQueue() ||
                  !hasMountedAutoArchiveSnapshot()
                }
                class={[
                  "rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-40",
                  reviewModalPrimaryActionNeedsAttention()
                    ? "border border-amber-200/70 bg-amber-100/80 text-amber-800 hover:bg-amber-100"
                    : "bg-primary text-white hover:bg-primary/90",
                ].join(" ")}
              >
                {loading()
                  ? "Refreshing PARA section..."
                  : candidateLoading()
                    ? "Refreshing review queue..."
                  : billingLoading()
                    ? "Storage policy refresh is in progress..."
                  : archiveTarget()
                    ? "Archive modal open..."
                    : archiving()
                      ? "Archiving item..."
                  : autoArchiving()
                    ? "Archiving..."
                    : uploading()
                      ? "Upload in progress..."
                      : exporting()
                        ? "Export in progress..."
                : isArchiveReviewFailureReceipt(candidateError())
                  ? "Refresh the review queue for archive review"
                : !hasMountedAutoArchiveQueue() || !hasMountedAutoArchiveSnapshot()
                  ? mountedAutoArchiveQueueCount() > 0
                    ? "Use the close action to leave the stale review snapshot state"
                    : "Use the close action to leave the unavailable review snapshot state"
                      : "Archive All"}
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}

export function PARAOverviewStrip(props: { onOpen: () => void; token: string }) {
  void props.token;
  return (
    <button
      type="button"
      onClick={props.onOpen}
      class="group flex w-full animate-fade-in items-center justify-between rounded-2xl border border-outline/10 bg-white/50 px-4 py-3 text-left shadow-sm transition hover:bg-white/70 hover:shadow-md"
    >
      <div class="flex items-center gap-3">
        <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4">
            <rect x="2" y="2" width="7" height="7" rx="1.5" />
            <rect x="11" y="2" width="7" height="7" rx="1.5" />
            <rect x="2" y="11" width="7" height="7" rx="1.5" />
            <rect x="11" y="11" width="7" height="7" rx="1.5" />
          </svg>
        </span>
        <div>
          <p class="text-sm font-semibold text-on-surface">PARA Navigator</p>
          <p class="text-xs text-on-surface-variant/50">Projects | Areas | Resources | Archive</p>
        </div>
      </div>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4 text-outline/40 transition group-hover:text-primary">
        <path d="M7 4l6 6-6 6" />
      </svg>
    </button>
  );
}
