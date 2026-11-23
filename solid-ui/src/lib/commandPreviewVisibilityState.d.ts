// @locs-version: 1.0
import type { AfpMessage } from "./api";

export declare function readableCommandPreview(
  previewMessage: AfpMessage | null | undefined,
  generatedPreview: AfpMessage,
): AfpMessage;

export declare function commandPreviewUnlockNotice(
  previewMessage: AfpMessage | null | undefined,
): { label: string; detail: string } | null;
