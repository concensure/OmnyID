#!/usr/bin/env node
// Renders an independent, ranker-blind markdown sheet for one named human judge.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const value = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
const inputPath = value("--input");
const judge = value("--judge");
const outputPath = value("--output");
if (!inputPath || !["Casper", "Iris"].includes(judge ?? "") || !outputPath || args.includes("--help")) {
  console.log("Usage: node scripts/render-wedding-vendor-judge-sheet.mjs --input <corpus.json> --judge Casper|Iris --output <sheet.md>");
  process.exit(args.includes("--help") ? 0 : 1);
}
const corpus = JSON.parse(readFileSync(resolve(inputPath), "utf8"));
const cases = Array.isArray(corpus.cases) ? corpus.cases : [];
const lines = [`# Wedding vendor ranking evaluation — ${judge}`, "", "Judge each candidate independently from 0 (irrelevant) to 3 (excellent), then name an ideal top 3. Do not discuss cases before independent scoring.", ""];
for (const item of cases) {
  lines.push(`## ${item.id}`, `Couple: ${item.guestCount} guests · ${item.budgetComfort} · ${item.dateOrSeason} · ${item.location}`, `Priorities: ${(item.topPriorities ?? []).join(", ")}`, "", "| Candidate | Facts and links | Relevance 0–3 |", "| --- | --- | --- |");
  for (const vendor of item.candidates ?? []) lines.push(`| ${vendor.title} | ${JSON.stringify(vendor.attributes)} ${(vendor.sourceLinks ?? []).join(" ")} |  |`);
  lines.push("", "Ideal top 3 (candidate ids, ordered): `", "Notes for disagreement resolution: ", "");
}
writeFileSync(resolve(outputPath), `${lines.join("\n")}\n`);
console.log(`Wrote ${judge}'s blinded sheet with ${cases.length} cases.`);
