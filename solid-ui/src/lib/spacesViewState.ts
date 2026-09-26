// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";

type SpaceMessageLike = {
  id: string;
};

export type NormalizedSpace = {
  id: string;
  name: string;
  description?: string;
  owner_user_id: string;
  afp_thread_id: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

export type NormalizedSpaceMessage = {
  id: string;
  space_id: string;
  afp_message_id: string;
  from_agent: string;
  author_user_id: string;
  type: string;
  subtype?: string;
  content: Record<string, unknown>;
  created_at: string;
};

export type NormalizedSpaceMember = {
  id: string;
  user_id: string;
  agent_id?: string;
  role: string;
  joined_at: string;
};

function scalarString(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function normalizeSpace(value: unknown): NormalizedSpace | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    name: scalarString(value.name, "Untitled space"),
    description: optionalString(value.description),
    owner_user_id: scalarString(value.owner_user_id),
    afp_thread_id: scalarString(value.afp_thread_id),
    is_public: typeof value.is_public === "boolean" ? value.is_public : false,
    created_at: scalarString(value.created_at),
    updated_at: scalarString(value.updated_at),
  };
}

export function normalizeSpaceMessage(value: unknown): NormalizedSpaceMessage | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    space_id: scalarString(value.space_id),
    afp_message_id: scalarString(value.afp_message_id, value.id),
    from_agent: scalarString(value.from_agent, "unknown"),
    author_user_id: scalarString(value.author_user_id),
    type: scalarString(value.type, "text"),
    subtype: optionalString(value.subtype),
    content: isRecord(value.content) ? value.content : {},
    created_at: scalarString(value.created_at),
  };
}

export function normalizeSpaceMember(value: unknown): NormalizedSpaceMember | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    user_id: scalarString(value.user_id),
    agent_id: optionalString(value.agent_id),
    role: scalarString(value.role, "member"),
    joined_at: scalarString(value.joined_at),
  };
}

export function normalizeSpacesResponse(payload: unknown): NormalizedSpace[] {
  if (!isRecord(payload) || !Array.isArray(payload.spaces)) return [];
  return payload.spaces.flatMap((space): NormalizedSpace[] => {
    const normalized = normalizeSpace(space);
    return normalized ? [normalized] : [];
  });
}

export function normalizeSpaceMessagesResponse(payload: unknown): NormalizedSpaceMessage[] {
  if (!isRecord(payload) || !Array.isArray(payload.messages)) return [];
  return payload.messages.flatMap((message): NormalizedSpaceMessage[] => {
    const normalized = normalizeSpaceMessage(message);
    return normalized ? [normalized] : [];
  });
}

export function normalizeSpaceMembersResponse(payload: unknown): NormalizedSpaceMember[] {
  if (!isRecord(payload) || !Array.isArray(payload.members)) return [];
  return payload.members.flatMap((member): NormalizedSpaceMember[] => {
    const normalized = normalizeSpaceMember(member);
    return normalized ? [normalized] : [];
  });
}

export function normalizeCreatedSpaceResponse(payload: unknown): NormalizedSpace | null {
  return isRecord(payload) ? normalizeSpace(payload.space) : null;
}

export function normalizeCreatedSpaceMessageResponse(payload: unknown): NormalizedSpaceMessage | null {
  return isRecord(payload) ? normalizeSpaceMessage(payload.message) : null;
}

export function shouldApplySpaceState(
  activeSpaceId: string | null | undefined,
  targetSpaceId: string,
): boolean {
  return activeSpaceId === targetSpaceId;
}

export function appendSpaceMessageIfCurrent<T extends SpaceMessageLike>(
  messages: T[],
  activeSpaceId: string | null | undefined,
  targetSpaceId: string,
  message: T,
): T[] {
  if (!shouldApplySpaceState(activeSpaceId, targetSpaceId)) return messages;
  return [...messages, message];
}

export function shouldShowSpaceScopedPendingState(
  activeSpaceId: string | null | undefined,
  pendingSpaceId: string | null | undefined,
): boolean {
  return !!activeSpaceId && activeSpaceId === pendingSpaceId;
}
