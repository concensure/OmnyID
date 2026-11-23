// @locs-version: 1.0
import { parseJsonValue } from "@/lib/jsonParseState";

type StorageReader = Pick<Storage, "length" | "key" | "getItem">;

export function buildSovereignDataBundle(storage: StorageReader = localStorage): Record<string, unknown> {
  const bundle: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    version: "1",
  };

  for (let i = 0; i < storage.length; i++) {
    let key: string | null = null;
    try {
      key = storage.key(i);
    } catch {
      continue;
    }
    if (!key?.startsWith("omnyid.")) continue;

    let raw: string | null = null;
    try {
      raw = storage.getItem(key);
    } catch {
      continue;
    }

    const parsed = parseJsonValue(raw ?? "null");
    bundle[key] = parsed.ok ? parsed.value : raw;
  }

  return bundle;
}

export function exportSovereignDataBundle() {
  const bundle = buildSovereignDataBundle();
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }),
  );
  const link = Object.assign(document.createElement("a"), {
    href: url,
    download: `omnyid-bundle-${Date.now()}.json`,
  });

  link.click();
  URL.revokeObjectURL(url);
}
