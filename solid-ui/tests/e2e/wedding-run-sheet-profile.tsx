import { createMemo, createSignal } from "solid-js";
import { render } from "solid-js/web";

import "../../src/index.css";
import {
  WeddingRunSheetItemDialog,
  WeddingRunSheetMobileCards,
  WeddingRunSheetProfileToolbar,
} from "../../src/components/WeddingRunSheetProfileToolbar";
import { WeddingRunSheetSavedViews } from "../../src/components/WeddingRunSheetSavedViews";
import { WeddingRunSheetIntelligencePanel } from "../../src/components/WeddingRunSheetContextCards";
import {
  filterWeddingRunSheetRows,
  projectWeddingRunSheetRows,
  weddingRunSheetDefaultFilters,
} from "../../src/lib/weddingRunSheetEditingState";
import type { DatabaseViewRecord } from "../../src/lib/databaseViewState";

const records: DatabaseViewRecord[] = [
  {
    id: "ceremony",
    databaseId: "runsheet",
    table: "run_sheet",
    revision: 1,
    timestamp: "2027-11-20T04:00:00.000Z",
    data: {
      title: "Ceremony",
      start_at: "2027-11-20T04:00:00.000Z",
      end_at: "2027-11-20T04:20:00.000Z",
      status: "confirmed",
      time_zone: "Australia/Sydney",
      location: "Harbour garden",
      owner_refs: ["Priya"],
      visibility: ["master", "vendor"],
      private_notes: "alarm code",
      source_refs: [{ message_id: "decision-ceremony", kind: "wedding_decision" }],
    },
  },
  {
    id: "photos",
    databaseId: "runsheet",
    table: "run_sheet",
    revision: 1,
    timestamp: "2027-11-20T04:30:00.000Z",
    data: {
      title: "Family photographs",
      start_at: "2027-11-20T04:30:00.000Z",
      status: "proposed",
      time_zone: "Australia/Sydney",
      location: "Garden steps",
      owner_refs: ["Photographer"],
      visibility: ["master", "vendor", "vip"],
      dependency_refs: ["ceremony"],
      buffer_before_minutes: 15,
    },
  },
];

function Fixture() {
  const [filters, setFilters] = createSignal(weddingRunSheetDefaultFilters());
  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [dialogPreset, setDialogPreset] = createSignal<"item" | "milestone">("item");
  const [status, setStatus] = createSignal("Ready");
  const rows = projectWeddingRunSheetRows(records);
  const visibleRows = createMemo(() => filterWeddingRunSheetRows(rows, filters()));
  const closeDialog = () => {
    setDialogOpen(false);
    queueMicrotask(() => document.getElementById("wedding-runsheet-add-item")?.focus());
  };
  return <main class="mx-auto max-w-5xl space-y-4 p-3 sm:p-6">
    <h1 class="text-xl font-bold text-wedding-text">Run sheet</h1>
    <WeddingRunSheetProfileToolbar
      rows={rows}
      visibleRows={visibleRows()}
      filters={filters()}
      archived={false}
      onFilters={setFilters}
      onAddItem={() => { setDialogPreset("item"); setDialogOpen(true); }}
    />
    <WeddingRunSheetIntelligencePanel
      rows={rows}
      archived={false}
      onFocusRecords={() => setStatus("Items focused")}
      onShowAttention={() => setStatus("Attention shown")}
      onShowAll={() => setStatus("All shown")}
      onAddItem={(preset) => { setDialogPreset(preset); setDialogOpen(true); }}
      onApproveBuffer={async () => { setStatus("Buffer approved"); return true; }}
    />
    <WeddingRunSheetMobileCards
      rows={visibleRows()}
      archived={false}
      onTimeChange={() => setStatus("Time changed")}
      onShift={(_record, minutes) => setStatus(minutes < 0 ? "Moved earlier" : "Moved later")}
    />
    <WeddingRunSheetSavedViews databaseId="database:runsheet" weddingPlanId="plan-e2e" rows={rows} archived={false} onMessage={() => undefined} />
    <p role="status" class="sr-only">{status()}</p>
    <WeddingRunSheetItemDialog
      open={dialogOpen()}
      preset={dialogPreset()}
      busy={false}
      error=""
      onClose={closeDialog}
      onSave={() => { setStatus("Item added"); closeDialog(); }}
    />
  </main>;
}

render(() => <Fixture />, document.getElementById("root")!);
