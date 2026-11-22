import type { UiCommandResponse } from "@/lib/api";
import type { WeddingAssistantResponse } from "@/lib/weddingAssistantApi";

/** Present the same bounded Wedding assistant contract in the Master Agent surface. */
export function weddingAssistantToUiCommandResponse(response: WeddingAssistantResponse): UiCommandResponse {
  const action = response.suggestedAction;
  return {
    intent: "wedding_assistance",
    suggested_view: "search",
    summary: response.answer,
    engine: response.model || "wedding-assistant",
    links: [
      ...(action ? [{
        title: action.kind === "stage_update" ? `Review in ${action.label.replace(/^Open /, "")}` : action.label,
        url: `/workspace/?weddingMenu=${encodeURIComponent(action.target)}`,
        kind: "wedding_workspace",
      }] : []),
      ...response.links.map((link) => ({ ...link, kind: "wedding_guide" })),
    ],
    boundary: {
      execution: "authenticated_current_account_wedding_only",
      persisted: false,
      approval_required_for_external_actions: true,
    },
    bullets: ["Wedding workspace changes remain drafts until you review and save them."],
  };
}
