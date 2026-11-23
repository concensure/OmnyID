// @locs-version: 2.0
import type { WeddingPacketPlannedConversion } from "@/lib/weddingExportState";
import type {
  WeddingNativeExportWorkerCheck,
  WeddingNativeExportWorkerReadinessState,
} from "@/lib/weddingNativeExportWorkerReadinessState";

export type WeddingNativeExportWorkerRequest = {
  conversion: WeddingPacketPlannedConversion;
  title?: string | null;
  sourceContent?: string | null;
  sourceFormat?: "markdown" | "html" | "word_doc" | null;
  warningLabels?: readonly string[] | null;
};

export type WeddingNativeExportWorkerPortResult = {
  ok: boolean;
  byteLength?: number | null;
  mimeType?: string | null;
  receiptId?: string | null;
  error?: string | null;
};

export type WeddingNativeExportWorkerPort = (
  request: Required<Pick<WeddingNativeExportWorkerRequest, "conversion">> & {
    title: string;
    sourceContent: string;
    sourceFormat: "markdown" | "html" | "word_doc";
    warningLabels: string[];
  },
) => WeddingNativeExportWorkerPortResult | Promise<WeddingNativeExportWorkerPortResult>;

export type WeddingNativeExportWorkerExecutionState = {
  status: "blocked" | "executed" | "failed";
  filename: string;
  conversionId: WeddingPacketPlannedConversion["id"];
  workerId: string;
  message: string;
  receipt: {
    filename: string;
    workerId: string;
    byteLength: number | null;
    mimeType: string | null;
    receiptId: string | null;
    warningLabels: string[];
  } | null;
  blockerLabels: string[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function checkForWorker(
  readiness: WeddingNativeExportWorkerReadinessState,
  workerId: string,
): WeddingNativeExportWorkerCheck | null {
  return readiness.checks.find((check) => check.id === workerId) ?? null;
}

export async function runWeddingNativeExportWorkerExecution(input: {
  request: WeddingNativeExportWorkerRequest;
  readiness: WeddingNativeExportWorkerReadinessState;
  port?: WeddingNativeExportWorkerPort | null;
}): Promise<WeddingNativeExportWorkerExecutionState> {
  const conversion = input.request.conversion;
  const workerCheck = checkForWorker(input.readiness, conversion.requiresWorker);
  const sourceContent = clean(input.request.sourceContent);
  const title = clean(input.request.title) || "Wedding planning packet";
  const sourceFormat = input.request.sourceFormat === "html" || input.request.sourceFormat === "word_doc"
    ? input.request.sourceFormat
    : "markdown";
  const warningLabels = (input.request.warningLabels ?? []).map(clean).filter(Boolean);
  const blockerLabels = [
    workerCheck?.status === "ready" ? null : workerCheck?.blockerLabels[0] ?? `${conversion.requiresWorker} is not ready.`,
    sourceContent ? null : "Source packet content is empty.",
    input.port ? null : "Native export worker port is not connected.",
  ].filter((value): value is string => Boolean(value));

  if (blockerLabels.length > 0) {
    return {
      status: "blocked",
      filename: conversion.filename,
      conversionId: conversion.id,
      workerId: conversion.requiresWorker,
      message: `Native ${conversion.id.toUpperCase()} export is blocked.`,
      receipt: null,
      blockerLabels,
    };
  }

  const port = input.port;
  if (!port) {
    return {
      status: "blocked",
      filename: conversion.filename,
      conversionId: conversion.id,
      workerId: conversion.requiresWorker,
      message: `Native ${conversion.id.toUpperCase()} export is blocked.`,
      receipt: null,
      blockerLabels: ["Native export worker port is not connected."],
    };
  }

  try {
    const result = await port({
      conversion,
      title,
      sourceContent,
      sourceFormat,
      warningLabels,
    });
    if (!result.ok) {
      return {
        status: "failed",
        filename: conversion.filename,
        conversionId: conversion.id,
        workerId: conversion.requiresWorker,
        message: clean(result.error) || `Native ${conversion.id.toUpperCase()} export failed.`,
        receipt: null,
        blockerLabels: [clean(result.error) || "Worker returned a failed result."],
      };
    }

    return {
      status: "executed",
      filename: conversion.filename,
      conversionId: conversion.id,
      workerId: conversion.requiresWorker,
      message: `Native ${conversion.id.toUpperCase()} export completed.`,
      receipt: {
        filename: conversion.filename,
        workerId: conversion.requiresWorker,
        byteLength: typeof result.byteLength === "number" && Number.isFinite(result.byteLength)
          ? Math.max(0, Math.trunc(result.byteLength))
          : null,
        mimeType: clean(result.mimeType) || null,
        receiptId: clean(result.receiptId) || null,
        warningLabels,
      },
      blockerLabels: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Native export worker threw an error.";
    return {
      status: "failed",
      filename: conversion.filename,
      conversionId: conversion.id,
      workerId: conversion.requiresWorker,
      message,
      receipt: null,
      blockerLabels: [message],
    };
  }
}
