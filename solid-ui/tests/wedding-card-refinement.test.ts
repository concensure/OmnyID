import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("wedding decision card separates the why control and removes queue prose", async () => {
  const [decision, focus] = await Promise.all([
    read("solid-ui/src/components/DecisionCard.tsx"),
    read("solid-ui/src/components/WeddingDecisionFocusCard.tsx"),
  ]);
  assert.match(decision, /action\.id !== "why"/);
  assert.match(decision, /aria-label="Show Me Why"/);
  assert.match(decision, /flex items-end justify-between/);
  assert.match(decision, /h-9 w-9/);
  assert.doesNotMatch(focus, /display\(\)\.summaryLabel/);
});

test("vendor cards use a photo heart while activity filters stay count-aware", async () => {
  const [choice, search] = await Promise.all([
    read("solid-ui/src/components/WeddingVendorChoiceCard.tsx"),
    read("solid-ui/src/components/WeddingVendorSearchHomeSections.tsx"),
  ]);
  assert.match(choice, /Add \$\{card\.title\} to favourites/);
  assert.match(choice, /fill=\{props\.selectedForFollowUp \? "currentColor" : "none"\}/);
  assert.doesNotMatch(choice, />\{props\.selectedForFollowUp \? "Favourited" : "Favourite"\}</);
  assert.match(search, /filter\(\(filter\) => lifecycleCount\(filter\.id\) > 0\)/);
  assert.match(search, />My activity</);
  assert.match(search, /Quote received.*bg-amber-500/);
  assert.match(search, /Booked.*bg-emerald-600/);
});

test("overview assignment remains in place and overview notes use AFP", async () => {
  const [owner, overview, noteState] = await Promise.all([
    read("solid-ui/src/components/WeddingTaskOwnerControl.tsx"),
    read("solid-ui/src/components/WeddingHomeOverviewGrid.tsx"),
    read("solid-ui/src/lib/weddingOverviewNoteState.ts"),
  ]);
  assert.doesNotMatch(owner, /if \(result\.saved\) props\.onRefreshWorkspace/);
  assert.match(overview, /\+ Add note/);
  assert.match(overview, /projectWeddingOverviewNotes/);
  assert.match(noteState, /type: "note"/);
  assert.match(noteState, /subtype: "wedding_overview_note"/);
  assert.match(noteState, /store_in_relational: true/);
  assert.match(overview, /Remove \$\{DOMAIN_STYLE\[note\.domain\]\.label\.toLowerCase\(\)\} note/);
  assert.match(noteState, /wedding_overview_note_removed/);
});

test("seating decisions open the existing canvas while task assignment remains visible", async () => {
  const focus = await read("solid-ui/src/components/WeddingDecisionFocusCard.tsx");
  assert.match(focus, /assign\\s\+\\d\+\\s\+attending guest/);
  assert.match(focus, /setExpandedTaskId\(item\.id\)/);
  assert.match(focus, /<WeddingSeatingPanel/);
  assert.match(focus, /The task assignment controls stay open above/);
});

test("server-confirmed operators are not redirected back into the wedding deep link", async () => {
  const app = await read("solid-ui/src/App.tsx");
  assert.match(app, /getAuthSession\(\)/);
  assert.match(app, /if \(!operatorLogin && shouldLaunchWeddingTemplateFromDeepLink\(\)\)/);
  assert.match(app, /setActiveView\("admin_dashboard"\)/);
});

test("decision research exposes real vendor contact actions and an in-place OpenStreetMap", async () => {
  const [detail, map] = await Promise.all([
    read("solid-ui/src/components/WeddingDecisionResearchDetail.tsx"),
    read("solid-ui/src/components/WeddingVendorInlineMap.tsx"),
  ]);
  assert.match(detail, />Website</);
  assert.match(detail, /onEmailVendor/);
  assert.match(detail, /phoneTelHref\(vendor\.phone\)/);
  assert.match(detail, /WeddingVendorInlineMap/);
  assert.match(map, /nominatim\.openstreetmap\.org/);
  assert.match(map, /openstreetmap\.org\/export\/embed/);
});
