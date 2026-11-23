// @locs-version: 1.0
import { afpOptionalRecord } from "@/lib/afpMessageRecord";

export const PRIVATE_RUNNER_INSTANCE_BOUNDARY = "private_runner_instance_only";

export function readBoundary(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  const record = afpOptionalRecord(value);
  const boundary = record?.boundary;
  return typeof boundary === "string" && boundary.trim() ? boundary.trim() : null;
}

export function readMessageBoundary(metadata: unknown, content: unknown): string | null {
  return readBoundary(metadata) ?? readBoundary(content);
}

export function isPrivateRunnerInstanceBoundary(boundary: unknown): boolean {
  return readBoundary(boundary) === PRIVATE_RUNNER_INSTANCE_BOUNDARY;
}
