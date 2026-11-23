import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";

import {
  buildWeddingImportSynthesisState,
  WEDDING_IMPORT_MAX_SYNTHESIS_ROWS,
} from "../src/lib/weddingImportSynthesisState.ts";
import { buildWeddingBudgetTrackingState } from "../src/lib/weddingBudgetTrackingState.ts";
import {
  buildWeddingImportParserReadinessState,
  buildWeddingImportParserTaskItems,
} from "../src/lib/weddingImportParserReadinessState.ts";
import {
  parseWeddingXlsxArrayBuffer,
  parseWeddingXlsxWorkbookArrayBuffer,
} from "../src/lib/weddingXlsxImportParserState.ts";
import { buildWeddingResponseWorkspaceViewState } from "../src/lib/weddingResponseWorkspaceViewState.ts";
import {
  weddingMemoryStorage,
  weddingResponseWorkspaceMetadata as metadata,
} from "./wedding-response-workspace-fixtures.ts";

function uploadReceipt() {
  return {
    status: "saved" as const,
    messageId: "msg-upload-1",
    attachment: {
      id: "att-upload-1",
      name: "wedding-import.xlsx",
      mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size_bytes: 1200,
      storage: { backend: "local", key: "uploads/wedding-import.xlsx" },
      encryption: { mode: "server" },
      sha256: "hash-xlsx",
    },
  };
}

async function tinyXlsxBuffer(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`,
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`,
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>`,
    `</Types>`,
  ].join(""));
  zip.file("xl/workbook.xml", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`,
    `<sheets><sheet name="Guests" sheetId="1" r:id="rId1"/></sheets>`,
    `</workbook>`,
  ].join(""));
  zip.file("xl/_rels/workbook.xml.rels", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`,
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>`,
    `</Relationships>`,
  ].join(""));
  zip.file("xl/sharedStrings.xml", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="12" uniqueCount="12">`,
    `<si><t>Name</t></si><si><t>RSVP</t></si><si><t>Meal</t></si><si><t>Dietary</t></si>`,
    `<si><t>Alex Partner</t></si><si><t>Yes</t></si><si><t>Fish</t></si><si><t>Nut allergy</t></si>`,
    `<si><t>Blair Friend</t></si><si><t>Pending</t></si><si><t>Vegan</t></si><si><t>Vegan</t></si>`,
    `</sst>`,
  ].join(""));
  zip.file("xl/worksheets/sheet1.xml", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`,
    `<sheetData>`,
    `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>`,
    `<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2" t="s"><v>5</v></c><c r="C2" t="s"><v>6</v></c><c r="D2" t="s"><v>7</v></c></row>`,
    `<row r="3"><c r="A3" t="s"><v>8</v></c><c r="B3" t="s"><v>9</v></c><c r="C3" t="s"><v>10</v></c><c r="D3" t="s"><v>11</v></c></row>`,
    `</sheetData>`,
    `</worksheet>`,
  ].join(""));
  return zip.generateAsync({ type: "arraybuffer" });
}

async function twoSheetXlsxBuffer(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`,
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`,
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    `<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>`,
    `</Types>`,
  ].join(""));
  zip.file("xl/workbook.xml", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`,
    `<sheets><sheet name="Guests" sheetId="1" r:id="rId1"/><sheet name="Budget" sheetId="2" r:id="rId2"/></sheets>`,
    `</workbook>`,
  ].join(""));
  zip.file("xl/_rels/workbook.xml.rels", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`,
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>`,
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>`,
    `</Relationships>`,
  ].join(""));
  zip.file("xl/sharedStrings.xml", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="16" uniqueCount="16">`,
    `<si><t>Name</t></si><si><t>RSVP</t></si><si><t>Meal</t></si><si><t>Dietary</t></si>`,
    `<si><t>Alex Partner</t></si><si><t>Yes</t></si><si><t>Fish</t></si><si><t>Nut allergy</t></si>`,
    `<si><t>Category</t></si><si><t>Estimate</t></si><si><t>Paid</t></si><si><t>Due</t></si>`,
    `<si><t>Venue</t></si><si><t>20000</t></si><si><t>2000</t></si><si><t>18000</t></si>`,
    `</sst>`,
  ].join(""));
  zip.file("xl/worksheets/sheet1.xml", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`,
    `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>`,
    `<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2" t="s"><v>5</v></c><c r="C2" t="s"><v>6</v></c><c r="D2" t="s"><v>7</v></c></row>`,
    `</sheetData></worksheet>`,
  ].join(""));
  zip.file("xl/worksheets/sheet2.xml", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`,
    `<row r="1"><c r="A1" t="s"><v>8</v></c><c r="B1" t="s"><v>9</v></c><c r="C1" t="s"><v>10</v></c><c r="D1" t="s"><v>11</v></c></row>`,
    `<row r="2"><c r="A2" t="s"><v>12</v></c><c r="B2" t="s"><v>13</v></c><c r="C2" t="s"><v>14</v></c><c r="D2" t="s"><v>15</v></c></row>`,
    `</sheetData></worksheet>`,
  ].join(""));
  return zip.generateAsync({ type: "arraybuffer" });
}

async function hiddenFirstSheetXlsxBuffer(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`,
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`,
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    `<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>`,
    `</Types>`,
  ].join(""));
  zip.file("xl/workbook.xml", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`,
    `<sheets><sheet name="Scratch" sheetId="1" state="hidden" r:id="rId1"/><sheet name="Budget" sheetId="2" r:id="rId2"/></sheets>`,
    `</workbook>`,
  ].join(""));
  zip.file("xl/_rels/workbook.xml.rels", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`,
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>`,
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>`,
    `</Relationships>`,
  ].join(""));
  zip.file("xl/sharedStrings.xml", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="12" uniqueCount="12">`,
    `<si><t>Private note</t></si><si><t>Do not import</t></si><si><t>Category</t></si><si><t>Estimate</t></si>`,
    `<si><t>Paid</t></si><si><t>Due</t></si><si><t>Venue</t></si><si><t>22000</t></si>`,
    `<si><t>2000</t></si><si><t>20000</t></si><si><t>Photography</t></si><si><t>5000</t></si>`,
    `</sst>`,
  ].join(""));
  zip.file("xl/worksheets/sheet1.xml", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`,
    `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>`,
    `</sheetData></worksheet>`,
  ].join(""));
  zip.file("xl/worksheets/sheet2.xml", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`,
    `<row r="1"><c r="A1" t="s"><v>2</v></c><c r="B1" t="s"><v>3</v></c><c r="C1" t="s"><v>4</v></c><c r="D1" t="s"><v>5</v></c></row>`,
    `<row r="2"><c r="A2" t="s"><v>6</v></c><c r="B2" t="s"><v>7</v></c><c r="C2" t="s"><v>8</v></c><c r="D2" t="s"><v>9</v></c></row>`,
    `<row r="3"><c r="A3" t="s"><v>10</v></c><c r="B3" t="s"><v>11</v></c></row>`,
    `</sheetData></worksheet>`,
  ].join(""));
  return zip.generateAsync({ type: "arraybuffer" });
}

async function formulaBudgetXlsxBuffer(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`,
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`,
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>`,
    `</Types>`,
  ].join(""));
  zip.file("xl/workbook.xml", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`,
    `<sheets><sheet name="Budget" sheetId="1" r:id="rId1"/></sheets>`,
    `</workbook>`,
  ].join(""));
  zip.file("xl/_rels/workbook.xml.rels", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`,
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>`,
    `</Relationships>`,
  ].join(""));
  zip.file("xl/sharedStrings.xml", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="5" uniqueCount="5">`,
    `<si><t>Category</t></si><si><t>Estimate</t></si><si><t>Paid</t></si><si><t>Due</t></si><si><t>Venue</t></si>`,
    `</sst>`,
  ].join(""));
  zip.file("xl/worksheets/sheet1.xml", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`,
    `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>`,
    `<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2"><v>22000</v></c><c r="C2"><v>2000</v></c><c r="D2"><f>B2-C2</f><v>20000</v></c></row>`,
    `</sheetData></worksheet>`,
  ].join(""));
  return zip.generateAsync({ type: "arraybuffer" });
}

async function unsafeWorksheetRelationshipXlsxBuffer(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`,
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`,
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    `</Types>`,
  ].join(""));
  zip.file("xl/workbook.xml", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`,
    `<sheets><sheet name="Guests" sheetId="1" r:id="rId1"/></sheets>`,
    `</workbook>`,
  ].join(""));
  zip.file("xl/_rels/workbook.xml.rels", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`,
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="../sharedStrings.xml"/>`,
    `</Relationships>`,
  ].join(""));
  zip.file("xl/worksheets/sheet1.xml", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`,
    `<row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c></row>`,
    `<row r="2"><c r="A2" t="inlineStr"><is><t>Should not load by fallback</t></is></c></row>`,
    `</sheetData></worksheet>`,
  ].join(""));
  return zip.generateAsync({ type: "arraybuffer" });
}

test("buildWeddingImportSynthesisState turns CSV guest imports into private guest-list artifacts", () => {
  const state = buildWeddingImportSynthesisState({
    metadata,
    files: [{
      name: "guest-list.csv",
      mimeType: "text/csv",
      text: [
        "Name,RSVP,Meal,Dietary,Accessibility,Table",
        "Alex,Yes,Fish,Nut allergy,Wheelchair access,Table 1",
        "Blair,Pending,Vegan,Vegan,,",
      ].join("\n"),
    }],
  });

  assert.equal(state.readyCount, 1);
  assert.equal(state.items[0]?.artifactKind, "guest_list");
  assert.equal(state.items[0]?.rowCount, 2);
  assert.ok(state.items[0]?.columnLabels.includes("Dietary"));
  assert.equal(state.generatedArtifacts[0]?.summary.kind, "guest_list");
  assert.equal(state.generatedArtifacts[0]?.summary.metadata.privacyScope, "private");
  assert.ok(state.generatedArtifacts[0]?.summary.sourceLabels.some((label) => /CSV import: guest-list\.csv/.test(label)));
  assert.match(state.generatedArtifacts[0]?.markdown ?? "", /How this import will be used/);
  assert.match(state.generatedArtifacts[0]?.csv ?? "", /Nut allergy/);
});

test("imported budget artifacts feed the existing wedding workspace budget tracker and projection queue", () => {
  const imports = buildWeddingImportSynthesisState({
    metadata,
    files: [{
      name: "wedding-budget.csv",
      text: [
        "Category,Estimate,Confirmed cost,Paid,Due,Due date,Vendor",
        "Venue,20000,18000,2000,16000,2027-03-01,Harbour House",
        "Photography,4500,,0,4500,2027-04-01,Harbour Photos",
      ].join("\n"),
    }],
  });
  const view = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: imports.artifactInputs,
    generatedArtifacts: imports.generatedArtifacts,
    projectionStorage: weddingMemoryStorage(),
  });

  assert.equal(view.workspace.totalArtifacts, 1);
  assert.equal(view.budgetTracking.paymentTaskCandidates.length >= 2, true);
  assert.ok(view.budgetTracking.paymentTaskCandidates.some((candidate) => /Harbour House/.test(candidate.vendorName)));
  assert.equal(view.projectionQueue?.groups.find((group) => group.kind === "artifact")?.pendingCount, 1);
  assert.equal(view.projectionQueue?.dispatchPayload?.sendInputs.some((input) => input.subtype === "wedding_artifact"), true);
});

test("binary spreadsheet imports are stored as parser-needed artifacts without pretending rows were parsed", () => {
  const state = buildWeddingImportSynthesisState({
    metadata,
    files: [{
      name: "The Knot export.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: 12345,
      text: "",
    }],
  });

  assert.equal(state.parserNeededCount, 1);
  assert.equal(state.items[0]?.status, "needs_parser");
  assert.ok(state.items[0]?.warningLabels.some((label) => /backend parser/i.test(label)));
  assert.equal(state.generatedArtifacts[0]?.summary.approvalState, "pending_user_approval");
  assert.match(state.generatedArtifacts[0]?.markdown ?? "", /Binary spreadsheet parsing needs a backend parser/);
});

test("parseWeddingXlsxArrayBuffer extracts first-sheet rows from modern Excel workbooks", async () => {
  const parsed = await parseWeddingXlsxArrayBuffer(await tinyXlsxBuffer());

  assert.equal(parsed.ok, true);
  assert.equal(parsed.sheetName, "Guests");
  assert.equal(parsed.rowCount, 2);
  assert.equal(parsed.columnCount, 4);
  assert.match(parsed.text, /Name\tRSVP\tMeal\tDietary/);
  assert.match(parsed.text, /Alex Partner\tYes\tFish\tNut allergy/);
});

test("readable XLSX imports synthesize private wedding artifacts without parser-needed fallback", async () => {
  const parsed = await parseWeddingXlsxArrayBuffer(await tinyXlsxBuffer());
  const state = buildWeddingImportSynthesisState({
    metadata,
    files: [{
      name: "guests.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sourceKind: "spreadsheet",
      text: parsed.text,
      parserName: "browser_xlsx_jszip",
      parsedSheetName: parsed.sheetName,
      uploadReceipt: uploadReceipt(),
    }],
  });
  const readiness = buildWeddingImportParserReadinessState({
    artifacts: state.artifactInputs,
  });

  assert.equal(state.readyCount, 1);
  assert.equal(state.parserNeededCount, 0);
  assert.equal(state.items[0]?.artifactKind, "guest_list");
  assert.equal(state.items[0]?.rowCount, 2);
  assert.match(state.generatedArtifacts[0]?.markdown ?? "", /Read with: browser_xlsx_jszip/);
  assert.match(state.generatedArtifacts[0]?.markdown ?? "", /Sheet: Guests/);
  assert.equal((state.generatedArtifacts[0]?.input.metadata as any)?.importParserName, "browser_xlsx_jszip");
  assert.equal(readiness.productionReady, true);
});

test("multi-sheet XLSX imports synthesize separate wedding artifacts per readable sheet", async () => {
  const parsedSheets = await parseWeddingXlsxWorkbookArrayBuffer(await twoSheetXlsxBuffer());
  const state = buildWeddingImportSynthesisState({
    metadata,
    files: parsedSheets.filter((sheet) => sheet.ok).map((sheet) => ({
      name: `wedding-plan.xlsx - ${sheet.sheetName}`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sourceKind: "spreadsheet",
      text: sheet.text,
      parserName: "browser_xlsx_jszip",
      parsedSheetName: sheet.sheetName,
      uploadReceipt: uploadReceipt(),
    })),
  });
  const view = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: state.artifactInputs,
    generatedArtifacts: state.generatedArtifacts,
    projectionStorage: weddingMemoryStorage(),
  });

  assert.equal(parsedSheets.length, 2);
  assert.equal(state.readyCount, 2);
  assert.equal(state.parserNeededCount, 0);
  assert.deepEqual(state.items.map((item) => item.artifactKind).sort(), ["budget_sheet", "guest_list"]);
  assert.equal(view.guestTracking.guestRowCount, 1);
  assert.ok(view.budgetTracking.paymentTaskCandidates.some((candidate) => /Venue/.test(candidate.title)));
  assert.equal(view.importParserReadiness.productionReady, true);
});

test("XLSX browser synthesis skips hidden sheets and keeps visible wedding evidence", async () => {
  const parsedSheets = await parseWeddingXlsxWorkbookArrayBuffer(await hiddenFirstSheetXlsxBuffer());
  const readableSheets = parsedSheets.filter((sheet) => sheet.ok);
  const state = buildWeddingImportSynthesisState({
    metadata,
    files: readableSheets.map((sheet) => ({
      name: `wedding-plan.xlsx - ${sheet.sheetName}`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sourceKind: "spreadsheet",
      text: sheet.text,
      parserName: "browser_xlsx_jszip",
      parsedSheetName: sheet.sheetName,
      parserWarningLabels: sheet.warningLabels,
      uploadReceipt: uploadReceipt(),
    })),
  });
  const view = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: state.artifactInputs,
    generatedArtifacts: state.generatedArtifacts,
    projectionStorage: weddingMemoryStorage(),
  });

  assert.equal(readableSheets.length, 1);
  assert.equal(readableSheets[0]?.sheetName, "Budget");
  assert.doesNotMatch(readableSheets[0]?.text ?? "", /Private note/);
  assert.equal(state.items[0]?.artifactKind, "budget_sheet");
  assert.ok(state.items[0]?.warningLabels.some((label) => /hidden XLSX sheet/i.test(label)));
  assert.ok(view.budgetTracking.paymentTaskCandidates.some((candidate) => /Venue/.test(candidate.title)));
});

test("XLSX browser synthesis warns when budget rows use cached formula values", async () => {
  const parsed = await parseWeddingXlsxArrayBuffer(await formulaBudgetXlsxBuffer());
  const state = buildWeddingImportSynthesisState({
    metadata,
    files: [{
      name: "formula-budget.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sourceKind: "spreadsheet",
      text: parsed.text,
      parserName: "browser_xlsx_jszip",
      parsedSheetName: parsed.sheetName,
      parserFormulaCellCount: parsed.formulaCellCount,
      parserWarningLabels: parsed.warningLabels,
      uploadReceipt: uploadReceipt(),
    }],
  });
  const view = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: state.artifactInputs,
    generatedArtifacts: state.generatedArtifacts,
    projectionStorage: weddingMemoryStorage(),
  });

  assert.equal(parsed.formulaCellCount, 1);
  assert.match(parsed.text, /Venue\t22000\t2000\t20000/);
  assert.ok(parsed.warningLabels.some((label) => /cached workbook values/i.test(label)));
  assert.equal(state.items[0]?.artifactKind, "budget_sheet");
  assert.equal((state.generatedArtifacts[0]?.input.metadata as any)?.importParserFormulaCellCount, 1);
  assert.match(state.generatedArtifacts[0]?.markdown ?? "", /Formula cells detected: 1/);
  assert.equal(view.importParserReadiness.productionReady, true);
  assert.equal(view.importParserReadiness.formulaReviewCount, 1);
  assert.ok(view.importParserReadiness.nextActionLabels.some((label) => /Verify formula-backed budget\/payment totals/i.test(label)));
  assert.ok(view.budgetTracking.paymentTaskCandidates.some((candidate) => /Venue/.test(candidate.title)));
  assert.equal(view.projectionQueue?.groups.find((group) => group.kind === "task")?.items.some((item) =>
    /formula-backed wedding import totals/i.test(item.title)
  ), true);
});

test("XLSX browser synthesis rejects worksheet relationships outside workbook sheets", async () => {
  const parsed = await parseWeddingXlsxWorkbookArrayBuffer(await unsafeWorksheetRelationshipXlsxBuffer());

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.ok, false);
  assert.equal(parsed[0]?.rowCount, 0);
  assert.doesNotMatch(parsed[0]?.text ?? "", /Should not load by fallback/);
  assert.ok(parsed[0]?.warningLabels.some((label) => /points outside readable workbook worksheets/i.test(label)));
});

test("large CSV imports are capped for browser synthesis while preserving source warning", () => {
  const rows = Array.from({ length: WEDDING_IMPORT_MAX_SYNTHESIS_ROWS + 25 }, (_, index) => `Guest ${index + 1},Pending`);
  const state = buildWeddingImportSynthesisState({
    metadata,
    files: [{
      name: "large-rsvp.csv",
      text: ["Name,RSVP", ...rows].join("\n"),
    }],
  });

  assert.equal(state.readyCount, 1);
  assert.equal(state.items[0]?.truncated, true);
  assert.equal(state.items[0]?.rowCount, WEDDING_IMPORT_MAX_SYNTHESIS_ROWS);
  assert.ok(state.items[0]?.warningLabels.some((label) => /capped/i.test(label)));
  assert.match(state.generatedArtifacts[0]?.markdown ?? "", /Import preview limit/);
});

test("upload receipts are preserved in imported artifact provenance and readiness", () => {
  const state = buildWeddingImportSynthesisState({
    metadata,
    files: [{
      name: "guest-list.csv",
      text: "Name,RSVP\nAlex,Yes",
      uploadReceipt: uploadReceipt(),
    }],
  });
  const readiness = buildWeddingImportParserReadinessState({
    artifacts: state.artifactInputs,
  });

  assert.match(state.generatedArtifacts[0]?.markdown ?? "", /Original upload saved to OmnyID Files/);
  assert.equal((state.generatedArtifacts[0]?.input.metadata as any)?.originalUploadStatus, "saved");
  assert.equal(readiness.originalUploadSavedCount, 1);
  assert.equal(readiness.unsavedOriginalUploadCount, 0);
  assert.equal(readiness.productionReady, true);
  assert.ok(readiness.proofReferenceLabels.some((label) =>
    /Wedding import original upload proof: msg-upload-1:att-upload-1/i.test(label)
  ));
});

test("import parser readiness emits a proof label when no imports are present", () => {
  const readiness = buildWeddingImportParserReadinessState({ artifacts: [] });

  assert.equal(readiness.productionReady, true);
  assert.deepEqual(readiness.proofReferenceLabels, ["Wedding import parser proof: no-current-imports"]);
});

test("incomplete saved upload receipts do not clear import production readiness", () => {
  const state = buildWeddingImportSynthesisState({
    metadata,
    files: [{
      name: "guest-list.csv",
      text: "Name,RSVP\nAlex,Yes",
      uploadReceipt: {
        ...uploadReceipt(),
        attachment: {
          ...uploadReceipt().attachment,
          storage: undefined,
          sha256: undefined,
        },
      },
    }],
  });
  const readiness = buildWeddingImportParserReadinessState({
    artifacts: state.artifactInputs,
  });

  assert.match(state.generatedArtifacts[0]?.markdown ?? "", /Original upload storage failed/i);
  assert.doesNotMatch(state.generatedArtifacts[0]?.markdown ?? "", /Original upload saved to OmnyID Files/);
  assert.equal((state.generatedArtifacts[0]?.input.metadata as any)?.originalUploadStatus, "failed");
  assert.match((state.generatedArtifacts[0]?.input.metadata as any)?.originalUploadFailureLabel, /receipt is incomplete/i);
  assert.equal(readiness.originalUploadSavedCount, 0);
  assert.equal(readiness.unsavedOriginalUploadCount, 1);
  assert.equal(readiness.productionReady, false);
  assert.ok(readiness.blockerLabels.some((label) => /need to be saved/i.test(label)));
});

test("placeholder saved upload receipts do not clear import production readiness", () => {
  const state = buildWeddingImportSynthesisState({
    metadata,
    files: [{
      name: "guest-list.csv",
      text: "Name,RSVP\nAlex,Yes",
      uploadReceipt: {
        ...uploadReceipt(),
        messageId: "msg-placeholder",
        attachment: {
          ...uploadReceipt().attachment,
          id: "att-upload-1",
          sha256: "hash-xlsx",
        },
      },
    }],
  });
  const readiness = buildWeddingImportParserReadinessState({
    artifacts: state.artifactInputs,
  });

  assert.match(state.generatedArtifacts[0]?.markdown ?? "", /Original upload storage failed/i);
  assert.equal((state.generatedArtifacts[0]?.input.metadata as any)?.originalUploadStatus, "failed");
  assert.equal(readiness.originalUploadSavedCount, 0);
  assert.equal(readiness.unsavedOriginalUploadCount, 1);
  assert.equal(readiness.productionReady, false);
});

test("stored spreadsheet imports expose request-ready parser job inputs", () => {
  const imports = buildWeddingImportSynthesisState({
    metadata,
    files: [{
      name: "wedding-import.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      text: "",
      uploadReceipt: uploadReceipt(),
    }],
  });
  const readiness = buildWeddingImportParserReadinessState({
    artifacts: imports.artifactInputs,
  });

  assert.equal(readiness.parserNeededCount, 1);
  assert.equal(readiness.parserJobReadyCount, 1);
  assert.equal(readiness.parserJobBlockedCount, 0);
  assert.equal(readiness.parserJobRequests[0]?.status, "request_ready");
  assert.equal(readiness.parserJobRequests[0]?.sourceMessageId, "msg-upload-1");
  assert.equal(readiness.parserJobRequests[0]?.attachmentId, "att-upload-1");
  assert.deepEqual(readiness.parserJobRequests[0]?.parserInput.source_attachment_id, "att-upload-1");
  assert.ok(readiness.nextActionLabels.some((label) => /Reprocess saved spreadsheets/i.test(label)));
});

test("stored spreadsheet parser job inputs normalize unsafe legacy receipt fields", () => {
  const longId = "x".repeat(260);
  const readiness = buildWeddingImportParserReadinessState({
    artifacts: [{
      id: "wedding_import:budget_sheet:workspace:legacy",
      title: "Imported XLSX: private-family-budget.xlsx",
      kind: "budget_sheet",
      sourceLabels: ["wedding_import", "wedding_import_status:needs_parser"],
      metadata: {
        ...metadata,
        supertags: ["wedding_import", "wedding_import_status:needs_parser"],
        originalUploadStatus: "saved",
        originalUploadMessageId: `msg-${longId}`,
        originalUploadAttachmentId: `att-${longId}`,
        originalUploadSha256: `hash-${longId}`,
        originalUploadFileName: "..\\..\\private-family-budget.xlsx",
        originalUploadMimeType: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;${longId}`,
        originalUploadSizeBytes: 1200,
        originalUploadStorage: {
          backend: "local",
          key: `uploads/private-family-budget.xlsx?${longId}`,
          nested: { raw: "not allowed" },
        },
      },
    }],
  });
  const request = readiness.parserJobRequests[0];
  const parserInput = request?.parserInput as Record<string, unknown>;
  const storage = parserInput.storage as Record<string, unknown>;
  const tasks = buildWeddingImportParserTaskItems({ importParserReadiness: readiness, metadata });
  const taskMetadata = tasks[0]?.metadata as Record<string, unknown>;
  const serializedTaskMetadata = JSON.stringify(taskMetadata);

  assert.equal(request?.status, "request_ready");
  assert.equal(request?.fileName, "private-family-budget.xlsx");
  assert.equal(parserInput.file_name, "private-family-budget.xlsx");
  assert.equal((request?.sourceMessageId ?? "").length, 200);
  assert.equal((request?.attachmentId ?? "").length, 200);
  assert.equal((request?.sha256 ?? "").length, 256);
  assert.equal(storage.backend, "local");
  assert.equal(typeof storage.key, "string");
  assert.ok((storage.key as string).length <= 500);
  assert.match(storage.key as string, /^uploads\/private-family-budget\.xlsx/);
  assert.equal(storage.nested, undefined);
  assert.equal(taskMetadata.wedding_import_parser_job_receipts_redacted, true);
  assert.equal(serializedTaskMetadata.includes("private-family-budget.xlsx"), false);
  assert.equal(serializedTaskMetadata.includes("uploads/private-family-budget.xlsx"), false);
  assert.equal(serializedTaskMetadata.includes(longId), false);
});

test("import parser readiness tasks redact upload receipts from projected task metadata", () => {
  const imports = buildWeddingImportSynthesisState({
    metadata,
    files: [{
      name: "private-family-budget.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      text: "",
      uploadReceipt: {
        ...uploadReceipt(),
        attachment: {
          ...uploadReceipt().attachment,
          name: "private-family-budget.xlsx",
          storage: { backend: "local", key: "uploads/private-family-budget.xlsx" },
        },
      },
    }],
  });
  const readiness = buildWeddingImportParserReadinessState({
    artifacts: imports.artifactInputs,
  });
  const tasks = buildWeddingImportParserTaskItems({
    importParserReadiness: readiness,
    metadata,
  });

  assert.equal(readiness.parserJobRequests[0]?.parserInput.file_name, "private-family-budget.xlsx");
  assert.equal(readiness.parserJobRequests[0]?.parserInput.source_attachment_id, "att-upload-1");
  assert.equal(readiness.parserJobRequests[0]?.parserInput.sha256, "hash-xlsx");
  assert.ok(tasks.length > 0);

  const taskMetadata = tasks[0]?.metadata as Record<string, unknown>;
  const taskJobs = taskMetadata.wedding_import_parser_jobs as Array<Record<string, unknown>>;
  const serialized = JSON.stringify(taskMetadata);

  assert.equal(taskMetadata.wedding_import_parser_job_receipts_redacted, true);
  assert.equal(taskJobs[0]?.status, "request_ready");
  assert.equal(taskJobs[0]?.file_name_redacted, true);
  assert.equal(taskJobs[0]?.source_attachment_receipt_present, true);
  assert.equal(taskJobs[0]?.sha256_receipt_present, true);
  assert.equal(taskJobs[0]?.storage_receipt_present, true);
  assert.equal(serialized.includes("private-family-budget.xlsx"), false);
  assert.equal(serialized.includes("att-upload-1"), false);
  assert.equal(serialized.includes("hash-xlsx"), false);
  assert.equal(serialized.includes("uploads/private-family-budget.xlsx"), false);
});

test("spreadsheet parser jobs require complete durable source receipts", () => {
  const receipt = uploadReceipt();
  const imports = buildWeddingImportSynthesisState({
    metadata,
    files: [{
      name: "wedding-import.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      text: "",
      uploadReceipt: {
        ...receipt,
        attachment: {
          ...receipt.attachment,
          storage: undefined,
          sha256: undefined,
        },
      },
    }],
  });
  const readiness = buildWeddingImportParserReadinessState({
    artifacts: imports.artifactInputs,
  });

  assert.equal((imports.generatedArtifacts[0]?.input.metadata as any)?.originalUploadStatus, "failed");
  assert.match(imports.generatedArtifacts[0]?.markdown ?? "", /Original upload storage failed/i);
  assert.equal(readiness.parserJobReadyCount, 0);
  assert.equal(readiness.parserJobBlockedCount, 1);
  assert.equal(readiness.parserJobRequests[0]?.status, "storage_missing");
  assert.ok(readiness.parserJobRequests[0]?.blockerLabels.some((label) => /SHA-256/i.test(label)));
  assert.ok(readiness.parserJobRequests[0]?.blockerLabels.some((label) => /storage receipt/i.test(label)));
});

test("spreadsheet parser jobs stay blocked without source attachment receipts", () => {
  const imports = buildWeddingImportSynthesisState({
    metadata,
    files: [{
      name: "wedding-import.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      text: "",
    }],
  });
  const readiness = buildWeddingImportParserReadinessState({
    artifacts: imports.artifactInputs,
  });

  assert.equal(readiness.parserJobReadyCount, 0);
  assert.equal(readiness.parserJobBlockedCount, 1);
  assert.equal(readiness.parserJobRequests[0]?.status, "storage_missing");
  assert.ok(readiness.parserJobRequests[0]?.blockerLabels.some((label) => /source message ID/i.test(label)));
});

test("local-only imports block production readiness until original files are saved", () => {
  const state = buildWeddingImportSynthesisState({
    metadata,
    files: [{
      name: "guest-list.csv",
      text: "Name,RSVP\nAlex,Yes",
    }],
  });
  const readiness = buildWeddingImportParserReadinessState({
    artifacts: state.artifactInputs,
  });

  assert.equal(readiness.productionReady, false);
  assert.equal(readiness.unsavedOriginalUploadCount, 1);
  assert.ok(readiness.blockerLabels.some((label) => /need to be saved/i.test(label)));
  assert.ok(readiness.nextActionLabels.some((label) => /Save original wedding imports to Files/i.test(label)));
  assert.deepEqual(
    buildWeddingImportParserTaskItems({ importParserReadiness: readiness, metadata }),
    [],
    "automatic storage retry must not become a couple planning task",
  );
});

test("import parser readiness blocks production when spreadsheet imports still need a parser", () => {
  const imports = buildWeddingImportSynthesisState({
    metadata,
    files: [{
      name: "budget.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      text: "",
    }],
  });
  const readiness = buildWeddingImportParserReadinessState({
    artifacts: imports.artifactInputs,
  });

  assert.equal(readiness.productionReady, false);
  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.parserNeededCount, 1);
  assert.ok(readiness.blockerLabels.some((label) => /Excel workbook support/i.test(label)));
});

test("legacy placeholder original upload metadata does not clear import parser readiness", () => {
  const readiness = buildWeddingImportParserReadinessState({
    binarySpreadsheetParserReady: true,
    artifacts: [{
      id: "wedding_import:budget_sheet:workspace:legacy",
      title: "Imported XLSX: private-family-budget.xlsx",
      kind: "budget_sheet",
      sourceLabels: ["wedding_import", "wedding_import_status:synthesized"],
      metadata: {
        ...metadata,
        supertags: ["wedding_import", "wedding_import_status:synthesized", "wedding_import_upload:saved"],
        originalUploadStatus: "saved",
        originalUploadMessageId: "msg-placeholder",
        originalUploadAttachmentId: "att-upload-1",
        originalUploadSha256: "hash-xlsx",
        originalUploadStorage: { backend: "local", key: "uploads/private-family-budget.xlsx" },
      },
    }],
  });

  assert.equal(readiness.originalUploadSavedCount, 0);
  assert.equal(readiness.unsavedOriginalUploadCount, 1);
  assert.equal(readiness.productionReady, false);
  assert.ok(readiness.blockerLabels.some((label) => /need to be saved/i.test(label)));
});

test("declared list kind overrides ambiguous headers and budget rows project exact imported amounts", () => {
  const state = buildWeddingImportSynthesisState({
    metadata,
    files: [{
      name: "my-list.csv",
      declaredKind: "budget",
      text: "Thing,Value,Notes\nVenue,$22000,Estimated package\nPhotography,$4800,Quoted",
    }],
  });
  assert.equal(state.items[0]?.artifactKind, "budget_sheet");
  assert.equal(state.items[0]?.generatedArtifact.input.metadata?.importDeclaredKind, "budget");
  const budget = buildWeddingBudgetTrackingState({ artifacts: state.artifactInputs });
  assert.deepEqual(budget.lineItems.map((item) => [item.categoryLabel, item.amount]), [
    ["Venue", 22000],
    ["Photography", 4800],
  ]);
});

test("a declared seating chart projects through the existing guest and seating artifact", () => {
  const state = buildWeddingImportSynthesisState({
    metadata,
    files: [{
      name: "room-layout.csv",
      declaredKind: "seating_chart",
      text: "Name,Table,RSVP\nAlex,Table 1,Attending\nBlair,Table 2,Attending",
    }],
  });
  assert.equal(state.items[0]?.artifactKind, "guest_list");
  assert.match(state.generatedArtifacts[0]?.markdown ?? "", /Planning area chosen by user: seating chart/);
});
