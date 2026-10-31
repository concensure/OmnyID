// @locs-version: 2.0
import {
  coalesceWeddingBoundaryLedgerObjects,
  type WeddingBoundaryChangeRequest,
  type WeddingBoundaryEventInvitation,
  type WeddingBoundaryGuestProfile,
  type WeddingBoundaryHousehold,
  type WeddingBoundaryLedgerObject,
  type WeddingBoundaryPolicy,
  type WeddingBoundaryRoleAssignment,
} from "@/lib/weddingBoundaryLedgerState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";

export type WeddingBoundaryTopologyNodeKind =
  | "wedding_plan"
  | "response_workspace"
  | "wedding_event"
  | "boundary_policy"
  | "boundary_role"
  | "household"
  | "guest"
  | "event_invitation"
  | "change_request"
  | "private_rationale";

export type WeddingBoundaryTopologyEdgeKind =
  | "contains"
  | "member_of_household"
  | "primary_contact_for_household"
  | "invited_to_event"
  | "role_grants_visibility"
  | "request_targets_guest"
  | "request_targets_event"
  | "request_targets_household"
  | "request_violates_policy"
  | "decision_explains_policy"
  | "requires_approval";

export type WeddingBoundaryTopologyNode = {
  id: string;
  kind: WeddingBoundaryTopologyNodeKind;
  label: string;
  supertags: string[];
  metadata: Record<string, unknown>;
  degree: number;
};

export type WeddingBoundaryTopologyEdge = {
  id: string;
  source: string;
  target: string;
  kind: WeddingBoundaryTopologyEdgeKind;
  label: string;
  metadata: Record<string, unknown>;
};

export type WeddingBoundaryTopologyState = {
  metadata: WeddingPlanningMetadata;
  nodes: WeddingBoundaryTopologyNode[];
  edges: WeddingBoundaryTopologyEdge[];
  approvalRequestNodes: WeddingBoundaryTopologyNode[];
  familyVisibleNodes: WeddingBoundaryTopologyNode[];
  summaryLabel: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: readonly unknown[], limit = 60): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function nodeId(kind: WeddingBoundaryTopologyNodeKind, value: unknown): string {
  return `wedding_boundary:${kind}:${safeWeddingLabel(value)}`;
}

function optionalNodeId(kind: WeddingBoundaryTopologyNodeKind, value: unknown): string | null {
  return clean(value) ? nodeId(kind, value) : null;
}

function edgeId(source: string, kind: WeddingBoundaryTopologyEdgeKind, target: string): string {
  return `wedding_boundary_edge:${safeWeddingLabel(`${source}:${kind}:${target}`)}`;
}

function objectIdentity(object: WeddingBoundaryLedgerObject): string {
  if (object.kind === "wedding_boundary_household") return object.householdId;
  if (object.kind === "wedding_boundary_guest_profile") return object.personId;
  if (object.kind === "wedding_boundary_event_invitation") return object.invitationId;
  if (object.kind === "wedding_boundary_change_request") return object.requestId;
  if (object.kind === "wedding_boundary_decision_rationale") return object.decisionId;
  if (object.kind === "wedding_boundary_decline_template") return object.templateId;
  if (object.kind === "wedding_boundary_visibility_page") return object.pageId;
  return object.id;
}

function eventLabel(value: unknown): string {
  const cleaned = clean(value);
  if (!cleaned) return "Wedding event";
  return cleaned
    .replace(/^event:/i, "")
    .split(/[_:-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || cleaned;
}

function baseTags(metadata: WeddingPlanningMetadata, extra: readonly unknown[] = []): string[] {
  return uniqueStrings([
    ...metadata.supertags,
    "wedding_boundary",
    "topology:wedding_guest_graph",
    "topology:wedding_decision_rights",
    "decisionos:wedding_boundary",
    ...extra,
  ]);
}

function addNode(
  nodes: Map<string, WeddingBoundaryTopologyNode>,
  metadata: WeddingPlanningMetadata,
  id: string,
  kind: WeddingBoundaryTopologyNodeKind,
  label: string,
  extraTags: readonly unknown[] = [],
  extraMetadata: Record<string, unknown> = {},
): void {
  const existing = nodes.get(id);
  const supertags = baseTags(metadata, [`wedding_boundary_node:${kind}`, ...extraTags]);
  if (existing) {
    nodes.set(id, {
      ...existing,
      supertags: uniqueStrings([...existing.supertags, ...supertags]),
      metadata: { ...existing.metadata, ...extraMetadata },
    });
    return;
  }
  nodes.set(id, {
    id,
    kind,
    label,
    supertags,
    metadata: {
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      ...extraMetadata,
    },
    degree: 0,
  });
}

function addEdge(
  edges: Map<string, WeddingBoundaryTopologyEdge>,
  source: string | null,
  target: string | null,
  kind: WeddingBoundaryTopologyEdgeKind,
  label: string,
  metadata: Record<string, unknown> = {},
): void {
  if (!source || !target || source === target) return;
  const id = edgeId(source, kind, target);
  if (!edges.has(id)) edges.set(id, { id, source, target, kind, label, metadata });
}

function degreeCounts(edges: Iterable<WeddingBoundaryTopologyEdge>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const edge of edges) {
    counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1);
    counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1);
  }
  return counts;
}

function objectNodeKind(object: WeddingBoundaryLedgerObject): WeddingBoundaryTopologyNodeKind | null {
  if (object.kind === "wedding_boundary_policy") return "boundary_policy";
  if (object.kind === "wedding_boundary_role_assignment") return "boundary_role";
  if (object.kind === "wedding_boundary_household") return "household";
  if (object.kind === "wedding_boundary_guest_profile") return "guest";
  if (object.kind === "wedding_boundary_event_invitation") return "event_invitation";
  if (object.kind === "wedding_boundary_change_request") return "change_request";
  if (object.kind === "wedding_boundary_decision_rationale") return "private_rationale";
  return null;
}

function labelFor(object: WeddingBoundaryLedgerObject): string {
  if (object.kind === "wedding_boundary_household") return object.displayName;
  if (object.kind === "wedding_boundary_guest_profile") return object.displayName;
  return object.title;
}

function objectTags(object: WeddingBoundaryLedgerObject): string[] {
  return uniqueStrings([
    `wedding_boundary:${object.kind.replace(/^wedding_boundary_/, "")}`,
    object.visibility === "couple_only" || object.kind === "wedding_boundary_decision_rationale" ? "wedding_boundary:couple_only" : null,
    object.visibility === "family_visible" || object.visibility === "approved_shared" ? "wedding_boundary:family_visible" : null,
    object.kind === "wedding_boundary_policy" ? `wedding_policy:${safeWeddingLabel(object.ruleType)}` : null,
    object.kind === "wedding_boundary_role_assignment" ? `wedding_boundary_role:${safeWeddingLabel(object.role)}` : null,
    object.kind === "wedding_boundary_change_request" && changeRequestNeedsCoupleReview(object) ? "wedding_boundary:approval_required" : null,
    object.kind === "wedding_boundary_guest_profile" && object.ageBand ? `wedding_guest:${safeWeddingLabel(object.ageBand)}` : null,
  ]);
}

function changeRequestNeedsCoupleReview(object: WeddingBoundaryChangeRequest): boolean {
  return object.approvalRequired === true && (object.requestStatus === "pending" || object.requestStatus === "partially_approved");
}

function nodeMetadataFor(object: WeddingBoundaryLedgerObject): Record<string, unknown> {
  const base = {
    boundary_object_id: objectIdentity(object),
    boundary_kind: object.kind,
    visibility: object.visibility ?? "couple_only",
    status: object.status ?? null,
  };
  if (object.kind === "wedding_boundary_policy") {
    return {
      ...base,
      rule_type: object.ruleType,
      enforcement: object.enforcement,
      plain_language: object.plainLanguage,
      private_rationale_encrypted: Boolean(object.privateRationaleCiphertext),
    };
  }
  if (object.kind === "wedding_boundary_role_assignment") {
    return { ...base, person_id: object.personId, role: object.role, can_view: object.canView ?? [], can_suggest: object.canSuggest ?? [], can_edit: object.canEdit ?? [] };
  }
  if (object.kind === "wedding_boundary_guest_profile") {
    return {
      ...base,
      person_id: object.personId,
      household_id: object.householdId ?? null,
      age_band: object.ageBand ?? "unknown",
      private_notes_encrypted: Boolean(object.privateNotesCiphertext),
    };
  }
  if (object.kind === "wedding_boundary_event_invitation") {
    return { ...base, invitation_id: object.invitationId, event_id: object.eventId, person_id: object.personId, invitation_status: object.invitationStatus };
  }
  if (object.kind === "wedding_boundary_change_request") {
    return {
      ...base,
      request_id: object.requestId,
      requested_by: object.requestedBy,
      change_type: object.changeType,
      request_status: object.requestStatus,
      approval_required: changeRequestNeedsCoupleReview(object),
      approval_gate_recorded: object.approvalRequired === true,
      private_rationale_encrypted: Boolean(object.privateRationaleCiphertext),
    };
  }
  return base;
}

function addObjectEdges(
  nodes: Map<string, WeddingBoundaryTopologyNode>,
  edges: Map<string, WeddingBoundaryTopologyEdge>,
  metadata: WeddingPlanningMetadata,
  object: WeddingBoundaryLedgerObject,
  sourceId: string,
  planId: string,
): void {
  if (object.kind === "wedding_boundary_household") {
    const household = object as WeddingBoundaryHousehold;
    addEdge(edges, sourceId, optionalNodeId("guest", household.primaryContactPersonId), "primary_contact_for_household", "primary contact");
    for (const personId of household.memberPersonIds ?? []) addEdge(edges, nodeId("guest", personId), sourceId, "member_of_household", "member of household");
  } else if (object.kind === "wedding_boundary_guest_profile") {
    const guest = object as WeddingBoundaryGuestProfile;
    addEdge(edges, sourceId, optionalNodeId("household", guest.householdId), "member_of_household", "member of household");
  } else if (object.kind === "wedding_boundary_event_invitation") {
    const invitation = object as WeddingBoundaryEventInvitation;
    const eventNodeId = nodeId("wedding_event", invitation.eventId);
    addNode(nodes, metadata, eventNodeId, "wedding_event", eventLabel(invitation.eventId), [
      `wedding_event:${safeWeddingLabel(invitation.eventId)}`,
    ], {
      event_id: invitation.eventId,
    });
    addEdge(edges, sourceId, nodeId("guest", invitation.personId), "request_targets_guest", "guest");
    addEdge(edges, sourceId, eventNodeId, "invited_to_event", "invited to event", { status: invitation.invitationStatus });
  } else if (object.kind === "wedding_boundary_role_assignment") {
    const role = object as WeddingBoundaryRoleAssignment;
    addEdge(edges, sourceId, nodeId("guest", role.personId), "role_grants_visibility", "grants visibility", { role: role.role });
  } else if (object.kind === "wedding_boundary_change_request") {
    const request = object as WeddingBoundaryChangeRequest;
    addEdge(edges, sourceId, nodeId("guest", request.requestedBy), "role_grants_visibility", "requested by");
    addEdge(edges, sourceId, optionalNodeId("guest", request.targetPersonId), "request_targets_guest", "targets guest");
    if (request.targetEventId) {
      const eventNodeId = nodeId("wedding_event", request.targetEventId);
      addNode(nodes, metadata, eventNodeId, "wedding_event", eventLabel(request.targetEventId), [
        `wedding_event:${safeWeddingLabel(request.targetEventId)}`,
      ], {
        event_id: request.targetEventId,
      });
      addEdge(edges, sourceId, eventNodeId, "request_targets_event", "targets event");
    }
    addEdge(edges, sourceId, optionalNodeId("household", request.targetHouseholdId), "request_targets_household", "targets household");
    for (const policyId of request.policyIds ?? []) addEdge(edges, sourceId, nodeId("boundary_policy", policyId), "request_violates_policy", "policy involved");
    if (changeRequestNeedsCoupleReview(request)) addEdge(edges, sourceId, planId, "requires_approval", "needs couple approval");
  } else if (object.kind === "wedding_boundary_policy") {
    const policy = object as WeddingBoundaryPolicy;
    for (const eventId of policy.appliesToEventIds ?? []) {
      const eventNodeId = nodeId("wedding_event", eventId);
      addNode(nodes, metadata, eventNodeId, "wedding_event", eventLabel(eventId), [
        `wedding_event:${safeWeddingLabel(eventId)}`,
      ], {
        event_id: eventId,
      });
      addEdge(edges, sourceId, eventNodeId, "request_targets_event", "applies to event");
    }
  }
}

export function buildWeddingBoundaryTopologyState(input: {
  metadata?: unknown;
  objects?: readonly WeddingBoundaryLedgerObject[] | null;
}): WeddingBoundaryTopologyState {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const objects = coalesceWeddingBoundaryLedgerObjects(input.objects);
  const nodes = new Map<string, WeddingBoundaryTopologyNode>();
  const edges = new Map<string, WeddingBoundaryTopologyEdge>();
  const planId = nodeId("wedding_plan", metadata.weddingPlanId);
  const workspaceId = nodeId("response_workspace", metadata.responseWorkspaceId);
  addNode(nodes, metadata, planId, "wedding_plan", "Wedding plan", [metadata.weddingPlanId]);
  addNode(nodes, metadata, workspaceId, "response_workspace", "Wedding workspace", [metadata.responseWorkspaceId]);
  addEdge(edges, planId, workspaceId, "contains", "contains workspace");

  for (const object of objects) {
    const kind = objectNodeKind(object);
    if (!kind) continue;
    const id = nodeId(kind, objectIdentity(object));
    addNode(nodes, metadata, id, kind, labelFor(object), objectTags(object), nodeMetadataFor(object));
    addEdge(edges, workspaceId, id, "contains", "contains boundary record", { boundary_kind: object.kind });
    addObjectEdges(nodes, edges, metadata, object, id, planId);
  }

  const counts = degreeCounts(edges.values());
  const finalNodes = Array.from(nodes.values())
    .map((node) => ({ ...node, degree: counts.get(node.id) ?? 0 }))
    .sort((left, right) => right.degree - left.degree || left.label.localeCompare(right.label));
  const finalEdges = Array.from(edges.values()).sort((left, right) => left.id.localeCompare(right.id));
  return {
    metadata,
    nodes: finalNodes,
    edges: finalEdges,
    approvalRequestNodes: finalNodes.filter((node) => node.kind === "change_request" && node.metadata.approval_required === true),
    familyVisibleNodes: finalNodes.filter((node) => node.supertags.includes("wedding_boundary:family_visible")),
    summaryLabel: `${finalNodes.length} boundary node${finalNodes.length === 1 ? "" : "s"} and ${finalEdges.length} relationship${finalEdges.length === 1 ? "" : "s"}`,
  };
}
