import { For, type JSX } from "solid-js";
import { DialogShell } from "@/components/DialogShell";
import { WeddingDashboardIcon, type WeddingDashboardIconId } from "@/components/WeddingDashboardIcons";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";

type MoreItem = {
  label: string;
  icon: WeddingDashboardIconId;
  menu?: WeddingWorkspaceMenuId;
  onSelect?: () => void;
};

const FOCUSABLE = "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";

export function WeddingMobileMoreSheet(props: {
  open: boolean;
  onClose: () => void;
  onSelectMenu: (menu: WeddingWorkspaceMenuId) => void;
}) {
  const groups: readonly { label: string; items: readonly MoreItem[] }[] = [
    { label: "Planning", items: [
      { label: "Guests", icon: "users", menu: "guests" },
      { label: "Seating", icon: "table-cells", menu: "seating" },
      { label: "Plan", icon: "calendar-days", menu: "plan" },
      { label: "Helpers", icon: "check-circle", menu: "helpers" },
      { label: "People", icon: "user-plus", menu: "people" },
    ] },
    { label: "Ideas", items: [
      { label: "Vision", icon: "shield-check", menu: "vision" },
      { label: "Inspiration", icon: "search", menu: "inspiration" },
    ] },
    { label: "Files", items: [
      { label: "Documents", icon: "table-cells", menu: "documents" },
    ] },
  ];

  const select = (item: MoreItem) => {
    props.onClose();
    if (item.menu) props.onSelectMenu(item.menu);
    else item.onSelect?.();
  };

  return (
    <DialogShell
      open={props.open}
      labelledBy="wedding-mobile-more-title"
      focusableSelector={FOCUSABLE}
      overlayClass="fixed inset-0 z-[70] flex items-end bg-wedding-text/35 animate-fade-in sm:hidden"
      dialogClass="max-h-[92dvh] w-full overflow-y-auto rounded-t-[24px] bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 shadow-panel animate-slide-up"
      onClose={props.onClose}
    >
      <div aria-hidden="true" class="mx-auto mb-2 h-1 w-9 rounded-full bg-wedding-muted/30" />
      <header class="flex items-center justify-between gap-3">
        <h2 id="wedding-mobile-more-title" class="text-wed-title font-semibold text-wedding-text">More</h2>
        <button type="button" class="inline-flex h-11 w-11 items-center justify-center rounded-xl text-wedding-muted active:bg-wedding-surface-muted" aria-label="Close More" onClick={props.onClose}>
          <svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5" fill="none"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
        </button>
      </header>
      <For each={groups}>{(group) => (
        <section class="mt-5" aria-labelledby={`wedding-more-${group.label.toLowerCase()}`}>
          <h3 id={`wedding-more-${group.label.toLowerCase()}`} class="mb-2 text-wed-caption font-medium text-wedding-muted">{group.label}</h3>
          <div class="divide-y divide-wedding-muted/15 rounded-2xl border border-wedding-muted/15 bg-white px-1">
            <For each={group.items}>{(item) => (
              <button type="button" class="flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 text-left text-wed-body text-wedding-text active:bg-wedding-surface-muted" onClick={() => select(item)}>
                <WeddingDashboardIcon id={item.icon} class="h-6 w-6 shrink-0 text-wedding-accent" />
                <span class="min-w-0 flex-1">{item.label}</span>
                <svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5 text-wedding-muted" fill="none"><path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
              </button>
            )}</For>
          </div>
        </section>
      )}</For>
    </DialogShell>
  );
}
