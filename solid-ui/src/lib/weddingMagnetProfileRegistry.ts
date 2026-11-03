// @locs-version: 1.0
// @module-id: wedding.magnet-profile-registry
// @primary-capability: shared-wedding-lead-magnet-profile-contract
// @stability: beta
import registryJson from "./weddingMagnetProfileFields.v1.json" with { type: "json" };

export type WeddingMagnetToolId = "BUD" | "QDEC" | "SHOT" | "PAL" | "INV" | "CDN";
export type WeddingMagnetProfileTier = "B" | "P" | "S";
export type WeddingMagnetProfileField = {
  key: string;
  type: string;
  validation: Record<string, unknown>;
  tier: WeddingMagnetProfileTier;
  writers: WeddingMagnetToolId[];
  workspace_target: string;
  conflict_rule: string;
  why: string;
};

export const WEDDING_MAGNET_PROFILE_REGISTRY_VERSION = registryJson.version;
export const WEDDING_MAGNET_PROFILE_FIELDS = registryJson.fields as WeddingMagnetProfileField[];

export function weddingMagnetProfileField(key: string): WeddingMagnetProfileField | null {
  return WEDDING_MAGNET_PROFILE_FIELDS.find((field) => field.key === key) ?? null;
}

export function weddingMagnetToolMayWrite(tool: WeddingMagnetToolId, key: string): boolean {
  return weddingMagnetProfileField(key)?.writers.includes(tool) ?? false;
}

export function weddingMagnetSensitiveKeys(): string[] {
  return WEDDING_MAGNET_PROFILE_FIELDS.filter((field) => field.tier === "S").map((field) => field.key);
}
