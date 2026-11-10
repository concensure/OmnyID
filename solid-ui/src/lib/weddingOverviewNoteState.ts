// @locs-version: 1.0
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";

export const WEDDING_OVERVIEW_NOTE_DOMAINS = ["budget", "guests", "seating"] as const;
export type WeddingOverviewNoteDomain = (typeof WEDDING_OVERVIEW_NOTE_DOMAINS)[number];

export type WeddingOverviewNote = {
  id: string;
  domain: WeddingOverviewNoteDomain;
  body: string;
  title: string;
  timestamp: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isDomain(value: unknown): value is WeddingOverviewNoteDomain {
  return typeof value === "string" && WEDDING_OVERVIEW_NOTE_DOMAINS.includes(value as WeddingOverviewNoteDomain);
}

export function projectWeddingOverviewNotes(messages: readonly AfpMessage[]): WeddingOverviewNote[] {
  return messages.flatMap((message): WeddingOverviewNote[] => {
    const content = afpRecord(decryptedDisplayContent(message));
    if (message.type !== "note" || (message.subtype !== "wedding_overview_note" && content.kind !== "wedding_overview_note")) return [];
    const domain = content.domain;
    const body = clean(content.body);
    if (!isDomain(domain) || !body) return [];
    return [{
      id: message.id,
      domain,
      body,
      title: clean(content.title) || `${domain[0].toUpperCase()}${domain.slice(1)} note`,
      timestamp: message.timestamp,
    }];
  }).sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

export function weddingOverviewNoteToAfpSendInput(input: {
  domain: WeddingOverviewNoteDomain;
  body: string;
  responseWorkspaceId?: string | null;
  weddingPlanId?: string | null;
  nowIso?: string;
}): SendAfpMessageInput | null {
  const body = input.body.trim();
  if (!body) return null;
  const timestamp = input.nowIso ?? new Date().toISOString();
  const domainLabel = `${input.domain[0].toUpperCase()}${input.domain.slice(1)}`;
  const scope = clean(input.responseWorkspaceId) || clean(input.weddingPlanId) || "wedding";
  return {
    thread_id: `wedding_overview_note:${scope}:${input.domain}`,
    from: "user://wedding-overview",
    to: ["agent://notes", "agent://wedding-planner"],
    type: "note",
    kind: "note",
    subtype: "wedding_overview_note",
    timestamp,
    content: {
      kind: "wedding_overview_note",
      domain: input.domain,
      title: `${domainLabel} note`,
      body,
      summary: body,
      tags: ["wedding", "overview", input.domain],
      supertags: ["Wedding"],
      response_workspace_id: clean(input.responseWorkspaceId) || null,
      wedding_plan_id: clean(input.weddingPlanId) || null,
    },
    supertags: ["Wedding"],
    references: [
      ...(clean(input.responseWorkspaceId) ? [{ id: clean(input.responseWorkspaceId), type: "wedding_response_workspace" }] : []),
      ...(clean(input.weddingPlanId) ? [{ id: clean(input.weddingPlanId), type: "wedding_plan" }] : []),
    ],
    metadata: {
      origin: "wedding_overview_up_next",
      wedding_domain: input.domain,
    },
    store_in_relational: true,
  };
}
