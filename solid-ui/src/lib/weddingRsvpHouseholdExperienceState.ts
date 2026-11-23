// @locs-version: 1.0
import type { WeddingRsvpInvitationPreview, WeddingRsvpSetupState } from "@/lib/weddingRsvpSetupState";

export type WeddingRsvpExperienceMode = "preview" | "test" | "production";

export type WeddingRsvpEventFacts = {
  hostLabel: string;
  eventLabel: string;
  responseDeadline: string;
  eventDate: string | null;
  eventLocalTime: string | null;
  eventTimeZone: string | null;
  venueName: string | null;
  venueAddress: string | null;
};

export type WeddingRsvpHouseholdExperience = WeddingRsvpEventFacts & {
  mode: WeddingRsvpExperienceMode;
  householdLabel: string;
  recipientLabels: string[];
  questions: Array<{ label: string; required: boolean; sensitive: boolean }>;
  expiresAt: string | null;
};

export type WeddingRsvpTestEnvelope = {
  version: 1;
  mode: "test";
  issuedAt: string;
  expiresAt: string;
  experience: WeddingRsvpHouseholdExperience;
};

const clean = (value: unknown, max = 300): string | null => {
  const result = typeof value === "string" ? value.trim().slice(0, max) : "";
  return result || null;
};

export function weddingRsvpEventFacts(setup: WeddingRsvpSetupState): WeddingRsvpEventFacts {
  return {
    hostLabel: setup.hostLabel,
    eventLabel: setup.eventLabel,
    responseDeadline: setup.responseDeadline,
    eventDate: clean(setup.eventDate, 10),
    eventLocalTime: clean(setup.eventLocalTime, 5),
    eventTimeZone: clean(setup.eventTimeZone, 80),
    venueName: clean(setup.venueName, 160),
    venueAddress: clean(setup.venueAddress, 300),
  };
}

export function buildWeddingRsvpHouseholdExperience(
  setup: WeddingRsvpSetupState,
  preview: WeddingRsvpInvitationPreview,
  mode: WeddingRsvpExperienceMode,
  expiresAt: string | null = null,
): WeddingRsvpHouseholdExperience {
  return {
    ...weddingRsvpEventFacts(setup),
    mode,
    householdLabel: preview.householdLabel,
    recipientLabels: preview.recipients.map((recipient) => recipient.displayName),
    questions: preview.questions.map((question) => ({ ...question })),
    expiresAt,
  };
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

export function weddingRsvpTestLink(
  experience: WeddingRsvpHouseholdExperience,
  origin = window.location.origin,
  now = new Date(),
): string {
  const expiresAt = new Date(now.getTime() + 15 * 60_000).toISOString();
  const envelope: WeddingRsvpTestEnvelope = {
    version: 1,
    mode: "test",
    issuedAt: now.toISOString(),
    expiresAt,
    experience: { ...experience, mode: "test", expiresAt },
  };
  return `${origin}/workspace/rsvp.html#test.${base64UrlEncode(JSON.stringify(envelope))}`;
}

export function weddingRsvpTestEnvelopeFromHash(
  hash: string,
  now = new Date(),
): WeddingRsvpTestEnvelope | null {
  if (!hash.startsWith("#test.")) return null;
  try {
    const parsed = JSON.parse(base64UrlDecode(hash.slice(6))) as Partial<WeddingRsvpTestEnvelope>;
    const experience = parsed.experience as Partial<WeddingRsvpHouseholdExperience> | undefined;
    const expiresAt = clean(parsed.expiresAt, 40);
    if (parsed.version !== 1 || parsed.mode !== "test" || !expiresAt || Date.parse(expiresAt) <= now.getTime()
      || !experience || experience.mode !== "test" || !clean(experience.hostLabel, 120)
      || !clean(experience.eventLabel, 120) || !clean(experience.householdLabel, 300)
      || !Array.isArray(experience.recipientLabels) || experience.recipientLabels.length === 0) return null;
    return parsed as WeddingRsvpTestEnvelope;
  } catch {
    return null;
  }
}

export function weddingRsvpDirectionsUrl(address: string | null): string | null {
  return address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}` : null;
}

export function weddingRsvpCalendarUrl(facts: WeddingRsvpEventFacts): string | null {
  if (!facts.eventDate) return null;
  const compactDate = facts.eventDate.replaceAll("-", "");
  const start = facts.eventLocalTime ? `${compactDate}T${facts.eventLocalTime.replace(":", "")}00` : compactDate;
  const end = facts.eventLocalTime ? `${compactDate}T${String(Math.min(23, Number(facts.eventLocalTime.slice(0, 2)) + 1)).padStart(2, "0")}${facts.eventLocalTime.slice(3)}00` : compactDate;
  const query = new URLSearchParams({
    action: "TEMPLATE",
    text: facts.eventLabel,
    dates: `${start}/${end}`,
    location: [facts.venueName, facts.venueAddress].filter(Boolean).join(", "),
    details: `Hosted by ${facts.hostLabel}${facts.eventTimeZone ? ` · Local time zone: ${facts.eventTimeZone}` : ""}`,
  });
  return `https://calendar.google.com/calendar/render?${query.toString()}`;
}

export function weddingRsvpMaterialPreflightGap(facts: WeddingRsvpEventFacts): { label: string; actionLabel: string } | null {
  if (!facts.eventDate) return { label: "Event date is missing, so guests cannot add it to a calendar.", actionLabel: "Add event date" };
  if (!facts.venueAddress) return { label: "Venue address is missing, so directions are not shown.", actionLabel: "Add venue address" };
  if (!facts.eventLocalTime) return { label: "Local start time is missing.", actionLabel: "Add local time" };
  return null;
}
