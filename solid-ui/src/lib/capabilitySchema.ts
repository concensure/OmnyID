// @locs-version: 1.0
export type CapabilityFieldDef = {
  name: string;
  type: "string" | "number" | "boolean" | "object";
};

export function buildCapabilityInputSchema(fields: CapabilityFieldDef[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const field of fields) {
    const normalizedName = field.name.trim();
    if (!normalizedName) continue;
    properties[normalizedName] = { type: field.type };
    required.push(normalizedName);
  }
  return { type: "object", properties, required };
}

export function firstDuplicateCapabilityFieldIndex(fields: CapabilityFieldDef[]): number {
  const seen = new Map<string, number>();
  for (const [index, field] of fields.entries()) {
    const normalizedName = field.name.trim();
    if (!normalizedName) continue;
    if (seen.has(normalizedName)) return index;
    seen.set(normalizedName, index);
  }
  return -1;
}

export function duplicateCapabilityFieldIndexes(fields: CapabilityFieldDef[]): Set<number> {
  const seen = new Map<string, number>();
  const duplicates = new Set<number>();
  for (const [index, field] of fields.entries()) {
    const normalizedName = field.name.trim();
    if (!normalizedName) continue;
    const previousIndex = seen.get(normalizedName);
    if (previousIndex !== undefined) {
      duplicates.add(previousIndex);
      duplicates.add(index);
      continue;
    }
    seen.set(normalizedName, index);
  }
  return duplicates;
}
