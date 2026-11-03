import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = await import(new URL("../solid-ui/src/lib/weddingTaskCatalogueState.ts", import.meta.url));
const outputPath = resolve(root, "wedding/assets/data/wedding-catalogue.v1.json");
const payload = {
  schema: source.WEDDING_TASK_CATALOGUE_VERSION,
  reviewedAt: source.WEDDING_CATALOGUE_REVIEWED_AT,
  publicationReady: source.WEDDING_COUNTDOWN_PUBLICATION_READY,
  stages: source.WEDDING_CATALOGUE_STAGES,
  tasks: source.WEDDING_CATALOGUE_TASKS,
  vendorLeadTimeRules: source.WEDDING_VENDOR_LEAD_TIME_RULES,
  legalSources: source.WEDDING_CATALOGUE_LEGAL_SOURCES,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload)}\n`, "utf8");
console.log(`Generated ${payload.tasks.length} Wedding catalogue tasks at ${outputPath}`);
