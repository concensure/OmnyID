// @locs-version: 1.0
import { safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";

export type WeddingVisionTagButtonState = {
  actionLabel: string;
  displayLabel: string;
  magicAction: "save" | "remove";
  magicId: string;
  title: string;
  ariaPressed: boolean;
  disabled: boolean;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildWeddingVisionTagButtonState(input: {
  tag: string;
  saved: boolean;
  saving: boolean;
}): WeddingVisionTagButtonState {
  const tag = clean(input.tag) || "Preference";
  const saved = input.saved === true;
  const saving = input.saving === true;
  return {
    actionLabel: saved ? `Remove ${tag} from saved wedding vision` : `Save ${tag} to wedding vision`,
    displayLabel: saving ? "Saving..." : saved ? `${tag} saved` : tag,
    magicAction: saved ? "remove" : "save",
    magicId: `wedding:vision:feel-tag:${safeWeddingLabel(tag, "tag")}`,
    title: saved ? "Remove this feeling from the saved vision" : "Save this feeling to the wedding vision",
    ariaPressed: saved,
    disabled: saving,
  };
}
