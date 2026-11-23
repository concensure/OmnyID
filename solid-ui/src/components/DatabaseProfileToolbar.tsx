// @locs-version: 1.0
import { Show } from "solid-js";
import { databaseProfilePlugin } from "@/lib/databaseProfilePluginState";
import type { WeddingRunSheetFilters, WeddingRunSheetPresentedRow } from "@/lib/weddingRunSheetEditingState";
import { WeddingRunSheetProfileToolbar } from "@/components/WeddingRunSheetProfileToolbar";

export function DatabaseProfileToolbar(props: {
  profileId: string | null;
  runSheetRows: WeddingRunSheetPresentedRow[];
  visibleRunSheetRows: WeddingRunSheetPresentedRow[];
  runSheetFilters: WeddingRunSheetFilters;
  archived: boolean;
  onRunSheetFilters: (filters: WeddingRunSheetFilters) => void;
  onAddRunSheetItem: () => void;
}) {
  const plugin = () => databaseProfilePlugin(props.profileId);
  return <Show when={plugin()?.toolbarKind === "wedding_run_sheet"}>
    <WeddingRunSheetProfileToolbar
      rows={props.runSheetRows}
      visibleRows={props.visibleRunSheetRows}
      filters={props.runSheetFilters}
      archived={props.archived}
      onFilters={props.onRunSheetFilters}
      onAddItem={props.onAddRunSheetItem}
    />
  </Show>;
}
