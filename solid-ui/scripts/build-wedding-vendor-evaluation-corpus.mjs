#!/usr/bin/env node
// Builds a judge-blind corpus from a sanitised active-catalog JSON export.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const value = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
const inputPath = value("--input");
const outputPath = value("--output") ?? resolve("../Documents/design/wedding planner/wedding-vendor-ranking-eval-corpus.json");
if (!inputPath || args.includes("--help")) {
  console.log("Usage: node scripts/build-wedding-vendor-evaluation-corpus.mjs --input <sanitised-active-catalog.json> [--output <corpus.json>]");
  process.exit(args.includes("--help") ? 0 : 1);
}
const input = JSON.parse(readFileSync(resolve(inputPath), "utf8"));
const vendors = Array.isArray(input.vendors) ? input.vendors.filter((vendor) => vendor && vendor.active !== false && typeof vendor.id === "string") : [];
if (vendors.length < 8) throw new Error("The sanitised input needs at least 8 active vendor rows.");
const profiles = Array.from({ length: 40 }, (_, index) => ({
  id: `eval-${String(index + 1).padStart(2, "0")}`,
  guestCount: String([30, 50, 80, 120, 180, 250][index % 6]),
  budgetComfort: ["$20k", "$35k", "$50k"][index % 3],
  dateOrSeason: ["February", "May", "October", "December"][index % 4],
  location: ["Sydney CBD", "Eastern Suburbs", "North Shore", "Western Sydney", "Regional NSW"][index % 5],
  topPriorities: [["Intimacy"], ["Wheelchair access"], ["Food"], ["Relaxed garden"], ["Waterfront"]][index % 5],
  sparseEvidence: index % 8 === 0,
}));
const cases = profiles.map((profile, index) => ({
  ...profile,
  candidates: Array.from({ length: Math.min(12, Math.max(8, vendors.length)) }, (_, offset) => vendors[(index * 7 + offset) % vendors.length]).map((vendor) => ({
    id: vendor.id, title: vendor.title ?? vendor.name ?? vendor.id, category: vendor.category ?? null,
    attributes: vendor.attributes ?? {}, sourceLinks: Array.isArray(vendor.sourceLinks) ? vendor.sourceLinks : [],
  })),
  judges: { Casper: null, Iris: null }, disagreement: false, resolution: null,
}));
writeFileSync(resolve(outputPath), `${JSON.stringify({ version: "wedding_vendor_eval.v1", generatedAt: new Date().toISOString(), cases }, null, 2)}\n`);
console.log(`Wrote ${cases.length} blinded cases to ${resolve(outputPath)}.`);
