// @locs-version: 1.0
import type { SocialComposerSuggestion } from "./socialComposerResponseState";

export function socialComposerInteractionLocked(args: {
  publishing: boolean;
  approvalPending: boolean;
}): boolean {
  return args.publishing || args.approvalPending;
}

export function socialComposerEditorSubmitLabel(args: {
  publishing: boolean;
  approvalPending: boolean;
}): string {
  if (args.publishing) return "Publishing...";
  if (args.approvalPending) return "Confirming...";
  return "Preview";
}

export function socialComposerPublishLabel(args: {
  publishing: boolean;
  approvalPending: boolean;
  platformLabel: string;
}): string {
  if (args.publishing) return "Publishing...";
  if (args.approvalPending) return "Waiting for confirmation...";
  return `Publish to ${args.platformLabel}`;
}

export function socialComposerDefaultSuggestions(): SocialComposerSuggestion[] {
  return [
    {
      id: "tone-1",
      kind: "tone",
      label: "Professional",
      body: "Your post reads casually. A professional tone will resonate better with LinkedIn's B2B audience.",
      action: undefined,
    },
    {
      id: "hashtag-1",
      kind: "hashtag",
      label: "Hashtags",
      body: "Add #AI #Productivity #Automation to reach a wider audience on this topic.",
      action: "Add hashtags",
    },
    {
      id: "timing-1",
      kind: "timing",
      label: "Best time",
      body: "Tuesday-Thursday 8-10 AM local time typically yields 2x higher engagement on LinkedIn.",
      action: undefined,
    },
  ];
}
