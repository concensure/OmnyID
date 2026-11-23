// @locs-version: 1.0
export const AGENT_PERSONA_FAB_VISIBILITY_EVENT = "omnyid:agent-persona-fab-visibility";

export function dispatchAgentPersonaFabVisibility(visible: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AGENT_PERSONA_FAB_VISIBILITY_EVENT, { detail: { visible } }));
}

export function agentPersonaFabVisibilityFromEvent(event: Event): boolean | null {
  const detail = (event as CustomEvent<{ visible?: unknown }>).detail;
  return typeof detail?.visible === "boolean" ? detail.visible : null;
}
