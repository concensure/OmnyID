import type { AfpMessage } from "@/lib/api";
import type { WeddingArtifactInput } from "@/lib/weddingArtifactState";
import type { WeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";
import { planIdFrom, record, workspaceIdFrom } from "@/lib/weddingPersistedWorkspaceMessageState";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";

const kinds = new Set(["quotation_normalisation_confirmed", "quotation_normalisation_corrected"]);
const lifecycles = new Set(["draft", "active", "superseded", "accepted", "declined", "expired"]);
const evidenceStates = new Set(["confirmed", "inferred", "unknown", "conflicting"]);
const inclusions = new Set(["included", "required", "optional", "excluded", "conditional", "unknown"]);
const bases = new Set(["fixed", "per_person", "per_item", "per_hour", "percentage", "minimum_spend"]);

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0
    && value.length <= 180 && !/[\u0000-\u001f\u007f]/.test(value);
}

// Ledger text is evidence, never markdown instructions, links or authority.
function display(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 300)
    .replace(/[\\`*_{}\[\]()<>#+.!|~-]/g, "\\$&");
}

/** Pure read projection of already-normalized private ledger messages.
 * The caller supplies the current authenticated account's visible messages.
 * Workspace membership must be proven by every source in the same thread;
 * namespace or normalization metadata alone cannot assign a wedding plan.
 */
export function weddingCanonicalQuoteArtifacts(
  messages: readonly AfpMessage[], metadata: WeddingPlanningMetadata,
): WeddingArtifactInput[] {
  const byId = new Map<string, AfpMessage[]>();
  for (const message of messages) byId.set(message.id, [...(byId.get(message.id) ?? []), message]);
  const artifacts: WeddingArtifactInput[] = [];
  for (const message of messages) {
    if (message.protocol !== "afp-v1" || message.type !== "ledger"
      || !kinds.has(message.kind ?? "") || message.subtype !== message.kind
      || !identifier(message.id) || byId.get(message.id)?.length !== 1) continue;
    const quote = record(decryptedDisplayContent(message).quotation);
    const identity = record(quote?.identity);
    if (quote?.schema_version !== "quotation.normalised.v1" || identity?.context_namespace !== "wedding_planner"
      || !identifier(identity.quotation_id) || !identifier(identity.version_id) || !identifier(identity.vendor_id)
      || !lifecycles.has(String(quote.lifecycle)) || !/^[A-Z]{3}$/.test(String(quote.currency))) continue;
    if (message.kind === "quotation_normalisation_corrected"
      && !identifier(identity.supersedes_version_id)) continue;
    const ownWorkspace = workspaceIdFrom(message), ownPlan = planIdFrom(message);
    if ((ownWorkspace && ownWorkspace !== metadata.responseWorkspaceId)
      || (ownPlan && ownPlan !== metadata.weddingPlanId)) continue;
    const sources = quote.sources;
    if (!Array.isArray(sources) || sources.length === 0 || sources.length > 64) continue;
    const sourceRefs: string[] = [];
    const sourceIds = new Set<string>();
    const sourcesValid = sources.every((value) => {
      const source = record(value);
      if (!identifier(source?.source_id) || !identifier(source?.source_version_id)
        || sourceIds.has(source.source_id)) return false;
      sourceIds.add(source.source_id);
      const candidates = byId.get(source.source_id);
      const original = candidates?.length === 1 ? candidates[0] : null;
      if (!original || original.thread_id !== message.thread_id
        || workspaceIdFrom(original) !== metadata.responseWorkspaceId
        || planIdFrom(original) !== metadata.weddingPlanId) return false;
      sourceRefs.push(`${display(source.source_id)} / ${display(source.source_version_id)}`);
      return true;
    });
    if (!sourcesValid || !Array.isArray(quote.line_items) || quote.line_items.length > 200) continue;
    const lines: string[] = [];
    const linesValid = quote.line_items.every((value) => {
      const line = record(value), evidence = record(line?.evidence), price = record(line?.unit_price);
      if (typeof line?.label !== "string" || !line.label.trim() || line.label.length > 1000
        || !inclusions.has(String(line.inclusion)) || !bases.has(String(line.price_basis))
        || !evidenceStates.has(String(evidence?.state))) return false;
      if (price && (!Number.isSafeInteger(price.amount_minor) || price.currency !== quote.currency)) return false;
      lines.push(`- ${display(line.label)}; ${line.inclusion}; basis ${line.price_basis}; evidence ${evidence?.state}; `
        + (price ? `${price.amount_minor} ${quote.currency} minor units` : "price unknown"));
      return true;
    });
    const createdAt = Date.parse(message.timestamp);
    if (!linesValid || !Number.isFinite(createdAt)) continue;
    artifacts.push({
      id: message.id, title: `Normalized quotation ${identity.version_id}`, kind: "decision_log", createdAt,
      metadata: { ...metadata, artifactKind: "decision_log", privacyScope: "private", approvalState: "draft",
        canonicalQuotationMessageId: message.id, canonicalQuotationVersionId: identity.version_id,
        canonicalQuotationSourceIds: [...sourceIds] },
      exportTargets: ["markdown", "browser_pdf"], sourceLabels: ["Canonical quotation ledger"],
      sourceLinks: [], vendorLabels: [identity.vendor_id],
      bodyText: ["# Normalized quotation review", "",
        "Review evidence only. Booking, payment and availability require separate confirmation.",
        `Quotation: ${display(identity.quotation_id)}`, `Version: ${display(identity.version_id)}`,
        ...(identifier(identity.supersedes_version_id) ? [`Supersedes version: ${display(identity.supersedes_version_id)}`] : []),
        `Vendor identifier: ${display(identity.vendor_id)}`, `Recorded lifecycle: ${quote.lifecycle}`,
        "Comparable total: not calculated in this projection. Use the quotation comparison and review flow.",
        "", "## Recorded line items", ...lines, "", "## Source versions", ...sourceRefs.map((ref) => `- ${ref}`),
      ].join("\n"),
    });
  }
  return artifacts;
}
