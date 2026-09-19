// @locs-version: 2.0
export type WeddingNativeExportWorkerId = "zip_packet_worker" | "docx_packet_worker" | "image_packet_worker";

export type WeddingNativeExportWorkerInput = {
  id: WeddingNativeExportWorkerId;
  connected?: boolean | null;
  supportsSensitiveFilter?: boolean | null;
  supportsDeterministicFilename?: boolean | null;
  supportsReceipt?: boolean | null;
  supportsFailureCopy?: boolean | null;
};

export type WeddingNativeExportWorkerCheck = {
  id: WeddingNativeExportWorkerId;
  label: string;
  status: "ready" | "blocked";
  blockerLabels: string[];
};

export type WeddingNativeExportWorkerReadinessState = {
  status: "ready" | "blocked";
  productionEvidenceReady: boolean;
  summary: string;
  checks: WeddingNativeExportWorkerCheck[];
  nextActions: string[];
};

const WORKER_LABELS: Record<WeddingNativeExportWorkerId, string> = {
  zip_packet_worker: "ZIP bundle download",
  docx_packet_worker: "Word download",
  image_packet_worker: "JPG/PNG image download",
};

const REQUIRED_WORKERS: readonly WeddingNativeExportWorkerId[] = [
  "zip_packet_worker",
  "docx_packet_worker",
  "image_packet_worker",
];

function workerInputFor(
  workers: readonly WeddingNativeExportWorkerInput[],
  id: WeddingNativeExportWorkerId,
): WeddingNativeExportWorkerInput {
  return workers.find((worker) => worker.id === id) ?? { id };
}

function checkWorker(worker: WeddingNativeExportWorkerInput): WeddingNativeExportWorkerCheck {
  const blockerLabels = [
    worker.connected ? null : "Download service is not connected.",
    worker.supportsSensitiveFilter ? null : "Download service has not proven the same private-file filter.",
    worker.supportsDeterministicFilename ? null : "Download service has not proven repeatable filenames.",
    worker.supportsReceipt ? null : "Download service does not produce a saved export receipt.",
    worker.supportsFailureCopy ? null : "Download service does not show a safe error message when conversion fails.",
  ].filter((value): value is string => Boolean(value));

  return {
    id: worker.id,
    label: WORKER_LABELS[worker.id],
    status: blockerLabels.length === 0 ? "ready" : "blocked",
    blockerLabels,
  };
}

export function buildWeddingNativeExportWorkerReadinessState(input: {
  workers?: readonly WeddingNativeExportWorkerInput[] | null;
} = {}): WeddingNativeExportWorkerReadinessState {
  const workers = input.workers ?? [];
  const checks = REQUIRED_WORKERS.map((id) => checkWorker(workerInputFor(workers, id)));
  const blockedChecks = checks.filter((check) => check.status === "blocked");
  const status = blockedChecks.length === 0 ? "ready" : "blocked";
  const nextActions = blockedChecks.map((check) => `${check.label}: ${check.blockerLabels[0] ?? "Worker blocked."}`);

  return {
    status,
    productionEvidenceReady: status === "ready",
    checks,
    nextActions,
    summary: status === "ready"
      ? "ZIP, DOCX, JPG, and PNG downloads are verified and can be enabled."
      : `${blockedChecks.length} download service${blockedChecks.length === 1 ? "" : "s"} still block direct ZIP/DOCX/JPG/PNG downloads.`,
  };
}
