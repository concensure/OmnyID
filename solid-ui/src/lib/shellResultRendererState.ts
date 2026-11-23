// @locs-version: 1.0
import { type ApprovalReviewLike } from "afp-ts/continuity";
import type { AfpMessage, AfpView } from "@/lib/api";
import {
  approvalMessageContent,
  approvalReviewForMessage,
} from "@/lib/approvalReviewState";
import { shellRequestReason } from "@/lib/shellCommandPresentation";

function shellString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function shellOptionalString(value: unknown): string | undefined {
  const stringValue = shellString(value);
  return stringValue ? stringValue : undefined;
}

function shellBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function shellNumber(value: unknown, fallback: number): number {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

export function shellResultRendererState(message: AfpMessage, view?: AfpView) {
  const content = approvalMessageContent(message, view);
  const subtype = message.subtype ?? "";
  const command = shellString(content.command);
  const safeMode = shellBoolean(content.safe_mode, true);

  return {
    subtype,
    command,
    safeMode,
    approvalReview: approvalReviewForMessage(message, view) ?? undefined,
    workingDir: shellOptionalString(content.working_dir),
    timeout: shellNumber(content.timeout_seconds, 30),
    reason: shellRequestReason(content.reason),
    approved: shellBoolean(content.approved, false),
    stdout: shellString(content.stdout),
    stderr: shellString(content.stderr),
    exitCode: shellNumber(content.exit_code, 0),
    durationMs: shellNumber(content.duration_ms, 0),
    showRequest: subtype === "request",
    showDecision: subtype === "decision",
    showResult: subtype === "result",
  };
}
