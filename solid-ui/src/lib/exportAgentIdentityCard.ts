import { buildAgentIdentityCardHtml } from "@/lib/buildAgentIdentityCardHtml";

export function exportAgentIdentityCard(params: {
  agentId: string;
  model: string;
  provider: string;
  loraScore: string;
  issuedAt: string;
  capabilities: Array<{ id: string; description?: string | null }>;
}) {
  const card = window.open("", "_blank", "width=900,height=640,noopener,noreferrer");
  if (!card) return false;
  try {
    card.opener = null;
  } catch {
    // Ignore browsers that expose opener as read-only for noopener windows.
  }

  card.document.write(buildAgentIdentityCardHtml(params));
  card.document.close();
  return true;
}
