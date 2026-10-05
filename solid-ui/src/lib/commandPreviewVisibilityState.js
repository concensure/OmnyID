// @locs-version: 1.0

// A command response may carry a richer AFP preview that is encrypted for the
// current device. The command endpoint also returns a safe summary/bullets
// payload, so never replace a readable answer with an unlock placeholder.
export function readableCommandPreview(previewMessage, generatedPreview) {
  if (previewMessage?.encryption) return generatedPreview;
  return previewMessage ?? generatedPreview;
}

export function commandPreviewUnlockNotice(previewMessage) {
  if (!previewMessage?.encryption) return null;
  return {
    label: "Detailed response is still locked on this device",
    detail: "Showing the readable response summary instead. Refresh or sign in again to unlock the detailed view.",
  };
}
