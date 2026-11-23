// @locs-version: 1.0
import { createEffect, createSignal, Show } from "solid-js";
import { DialogShell } from "@/components/DialogShell";
import { recordShortcutUse } from "@/lib/shortcutRecency";
import {
  loadCustomViews,
  saveCustomViews,
  type CustomView,
} from "@/lib/customViewStorage";

interface FieldMeta {
  key: keyof Omit<CustomView, "id">;
  label: string;
  placeholder: string;
  tooltip: string;
  required: boolean;
}

const FIELDS: FieldMeta[] = [
  {
    key: "name",
    label: "View name",
    placeholder: "e.g. My research notes",
    tooltip: "The label shown on the nav tab. Keep it short.",
    required: true,
  },
  {
    key: "description",
    label: "Description",
    placeholder: "e.g. Shows all research messages from agents",
    tooltip: "A brief note about what this view is for. Shown as a tooltip on the tab.",
    required: false,
  },
  {
    key: "filterType",
    label: "Message category",
    placeholder: "e.g. agent, note, task - leave blank for all",
    tooltip:
      "Filters messages by their category. Common categories: 'agent' (agent outputs), "
      + "'note' (your notes), 'task' (task ledger). Leave blank to show everything.",
    required: false,
  },
  {
    key: "filterSubtype",
    label: "Sub-category",
    placeholder: "e.g. plan, create, summary - leave blank for all",
    tooltip:
      "Narrows down the category further. For example if you chose 'agent', you could "
      + "enter 'plan' to see only planning messages. Leave blank to see all sub-types.",
    required: false,
  },
  {
    key: "keywords",
    label: "Keywords",
    placeholder: "e.g. battery, research, 2026 (comma-separated)",
    tooltip:
      "Only show messages that contain at least one of these words. "
      + "Separate multiple keywords with commas.",
    required: false,
  },
  {
    key: "workflowFamilyId",
    label: "Workflow family",
    placeholder: "e.g. family_weather, family_budget",
    tooltip:
      "Optional lineage filter. Use this when the view should only show outputs produced by one workflow family.",
    required: false,
  },
  {
    key: "familyAssetWorkflowId",
    label: "Family asset",
    placeholder: "e.g. wf_weather_to_chart",
    tooltip:
      "Optional lineage filter for outputs that came from a specific reusable workflow family asset.",
    required: false,
  },
  {
    key: "instanceWorkflowId",
    label: "Workflow instance",
    placeholder: "e.g. wf_12345_instance",
    tooltip:
      "Optional lineage filter for one specific workflow instance or invocation.",
    required: false,
  },
];

function Tooltip(props: { text: string }) {
  const [visible, setVisible] = createSignal(false);

  return (
    <span class="relative inline-block ml-1.5">
      <button
        type="button"
        class="touch-target inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/40 text-[10px] font-bold text-on-surface-variant transition hover:bg-white/70 focus:outline-none"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        aria-label="Help"
      >
        ?
      </button>
      <Show when={visible()}>
        <div
          role="tooltip"
          class="absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-xl border border-white/40 bg-white/80 px-3 py-2 text-xs text-on-surface shadow-lg backdrop-blur-md"
        >
          {props.text}
        </div>
      </Show>
    </span>
  );
}

export function AddCustomViewModal(props: {
  onAdd: (view: CustomView) => void;
  onClose: () => void;
}) {
  const blank = (): Omit<CustomView, "id"> => ({
    name: "",
    description: "",
    filterType: "",
    filterSubtype: "",
    keywords: "",
    workflowFamilyId: "",
    familyAssetWorkflowId: "",
    instanceWorkflowId: "",
  });

  const [form, setForm] = createSignal(blank());
  const [error, setError] = createSignal("");
  let nameInputRef: HTMLInputElement | undefined;

  function handleField(key: keyof Omit<CustomView, "id">, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function handleSubmit(event: Event) {
    event.preventDefault();
    const current = form();
    if (!current.name.trim()) {
      setError("Please give your view a name.");
      return;
    }
    const id = `cv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    props.onAdd({ id, ...current });
  }

  function handleSubmitShortcut(event: KeyboardEvent) {
    if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) return;
    event.preventDefault();
    recordShortcutUse("form_submit");
    handleSubmit(event);
  }

  createEffect(() => {
    queueMicrotask(() => nameInputRef?.focus());
  });

  return (
    <DialogShell
      labelledBy="add-custom-view-title"
      describedBy="add-custom-view-description"
      focusableSelector='button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      overlayClass="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      dialogClass="w-full max-w-md rounded-3xl border border-white/50 bg-white/70 p-7 shadow-2xl backdrop-blur-xl"
      onClose={props.onClose}
    >
      <>
        <div class="mb-6 flex items-start justify-between gap-3">
          <div>
            <h2 id="add-custom-view-title" class="text-lg font-semibold text-on-surface">Add a custom view</h2>
            <p id="add-custom-view-description" class="mt-0.5 text-xs text-on-surface-variant">
              Create a personalised tab that filters messages to exactly what you need.
            </p>
          </div>
          <button
            type="button"
            class="-mr-2 -mt-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-xs text-on-surface-variant transition hover:bg-white/50"
            onClick={props.onClose}
            aria-label="Close add custom view dialog"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} onKeyDown={handleSubmitShortcut} class="space-y-4">
          {FIELDS.map((field) => (
            <div>
              <label class="mb-1 flex items-center text-sm font-medium text-on-surface">
                {field.label}
                {field.required && <span class="ml-0.5 text-red-500">*</span>}
                <Tooltip text={field.tooltip} />
              </label>
              <input
                ref={field.key === "name" ? nameInputRef : undefined}
                type="text"
                placeholder={field.placeholder}
                value={form()[field.key]}
                onInput={(event) => handleField(field.key, (event.target as HTMLInputElement).value)}
                class="w-full rounded-xl border border-white/50 bg-white/50 px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/60 outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          ))}

          <Show when={error()}>
            <p class="text-xs text-red-500">{error()}</p>
          </Show>

          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              class="rounded-full px-4 py-2 text-sm text-on-surface-variant hover:bg-white/40"
              onClick={props.onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              class="rounded-full bg-primary px-5 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Add view
            </button>
          </div>
        </form>
      </>
    </DialogShell>
  );
}

export { loadCustomViews, saveCustomViews };
