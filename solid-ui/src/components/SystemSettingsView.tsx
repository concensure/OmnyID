// @locs-version: 1.0
/**
 * SystemSettingsView — top-level settings panel accessible from the hamburger menu.
 *
 * Contains an "AFP Message Retention" section where each AFP message type category
 * (and individual type within it) can be toggled ephemeral or persistent.
 * Category-level toggles set a default for the whole group; type-level toggles
 * override the category default. Hover the ℹ icon to see the recommended default
 * and the pros/cons of each choice.
 *
 * State is stored in localStorage:
 *   omnyid.afp-ephemeral-types       → Record<typeId, boolean>   (true = ephemeral)
 *   omnyid.afp-ephemeral-categories  → Record<categoryId, boolean>
 */
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { EmptyState } from "@/components/EmptyState";
import { InfoHint } from "@/components/InfoHint";
import {
  loadAfpEphemeralCategoryOverrides,
  loadAfpEphemeralTypeOverrides,
  saveAfpEphemeralCategoryOverrides,
  saveAfpEphemeralTypeOverrides,
} from "@/lib/afpRetentionLocalState";
import {
  FONT_BODY_OPTIONS,
  type FontBodyOption,
  loadFontBodyPreference,
  saveFontBodyPreference,
} from "@/lib/fontBodyPreference";
import {
  FONT_SCALE_OPTIONS,
  type FontScaleOption,
  loadFontScalePreference,
  saveFontScalePreference,
} from "@/lib/fontScalePreference";
import {
  loadParaViewPreference,
  saveParaViewPreference,
  subscribeParaViewPreference,
} from "@/lib/paraViewPreference";

// ── AFP category + type definitions ──────────────────────────────────────────

interface AfpTypeEntry {
  id: string;
  label: string;
  description: string;
  defaultEphemeral: boolean;
  defaultReason: string;
  pros: { persistent: string; ephemeral: string };
}

interface AfpCategory {
  id: string;
  label: string;
  description: string;
  types: AfpTypeEntry[];
}

const AFP_CATEGORIES: AfpCategory[] = [
  {
    id: "communication",
    label: "Communication",
    description: "Emails, notes, and conversation records",
    types: [
      { id: "email", label: "Email / Inbox", description: "Inbox messages and reply threads", defaultEphemeral: false, defaultReason: "Emails are correspondence records and must remain accessible.", pros: { persistent: "Full history, searchable, auditable.", ephemeral: "Reduces noise once an email is handled." } },
      { id: "canvas", label: "Canvas", description: "Free-form notes and writing surfaces", defaultEphemeral: false, defaultReason: "Documents you write should persist by default.", pros: { persistent: "Your writing is always available.", ephemeral: "Clears draft surfaces after action." } },
      { id: "transcript", label: "Transcript", description: "Conversation and call transcripts", defaultEphemeral: false, defaultReason: "Transcripts are audit-trail records.", pros: { persistent: "Permanent record for review and compliance.", ephemeral: "Saves space in high-volume call environments." } },
    ],
  },
  {
    id: "data",
    label: "Data & Queries",
    description: "Tables, grids, charts, and computed results",
    types: [
      { id: "table", label: "Table", description: "Tabular query results", defaultEphemeral: true, defaultReason: "Query results become stale; re-query when needed.", pros: { persistent: "Keeps historical snapshots for comparison.", ephemeral: "Prevents accumulation of outdated tables." } },
      { id: "supertag_grid", label: "Database Grid", description: "Tagged entity grids (Notion-style)", defaultEphemeral: false, defaultReason: "Database views represent structured, ongoing data.", pros: { persistent: "Live reference to your database.", ephemeral: "Reduces clutter from one-off grids." } },
      { id: "chart_view", label: "Chart", description: "Data visualisations and charts", defaultEphemeral: true, defaultReason: "Charts are point-in-time snapshots that go stale.", pros: { persistent: "Historical visual reference.", ephemeral: "Prevents stale charts from accumulating." } },
      { id: "formula", label: "Formula", description: "Mathematical formula computations", defaultEphemeral: true, defaultReason: "Formula results can always be re-computed.", pros: { persistent: "Keeps computed values for comparison.", ephemeral: "Cleans up after one-off calculations." } },
      { id: "parsed_document", label: "Parsed Document", description: "Extracted document content", defaultEphemeral: false, defaultReason: "Extracted content is reference material.", pros: { persistent: "Always-available document reference.", ephemeral: "Frees space once document is acted on." } },
    ],
  },
  {
    id: "productivity",
    label: "Productivity",
    description: "Tasks, calendar, approvals, and board state",
    types: [
      { id: "task_card", label: "Task", description: "Action items and task entries", defaultEphemeral: false, defaultReason: "Tasks need to persist until explicitly completed.", pros: { persistent: "Action items visible until done.", ephemeral: "Auto-clears to reduce checklist noise." } },
      { id: "calendar", label: "Calendar Event", description: "Events, bookings, and schedule entries", defaultEphemeral: false, defaultReason: "Calendar events are actionable commitments.", pros: { persistent: "Upcoming events stay in context.", ephemeral: "Cleans up past events automatically." } },
      { id: "attachments", label: "Attachments", description: "File and media attachments", defaultEphemeral: false, defaultReason: "Files should remain accessible after upload.", pros: { persistent: "Files available for later retrieval.", ephemeral: "Reduces feed noise for transient files." } },
      { id: "approvals", label: "Approvals", description: "Decision requests and sign-off flows", defaultEphemeral: false, defaultReason: "Approval records are audit-critical.", pros: { persistent: "Decision trail always accessible.", ephemeral: "Clears processed decisions." } },
      { id: "ledger_diff", label: "Ledger Diff", description: "Change diffs and delta records", defaultEphemeral: false, defaultReason: "Change history is valuable for review.", pros: { persistent: "Complete change audit trail.", ephemeral: "Reduces noise from minor updates." } },
      { id: "ledger_board", label: "Ledger Board", description: "Project board state views", defaultEphemeral: false, defaultReason: "Board state reflects live project status.", pros: { persistent: "Current project state always visible.", ephemeral: "Hides outdated board snapshots." } },
      { id: "multi_edit", label: "Multi-edit", description: "Batch edit operation records", defaultEphemeral: false, defaultReason: "Batch operations should have a persistent record.", pros: { persistent: "Full audit trail for batch changes.", ephemeral: "Removes processed bulk operations." } },
    ],
  },
  {
    id: "agent",
    label: "Agent & AI",
    description: "Agent-generated UI, plans, and orchestration cards",
    types: [
      { id: "generative_card", label: "Agent Card", description: "Orchestration and AI-generated interactive cards", defaultEphemeral: true, defaultReason: "Agent cards are interactive widgets, not permanent records.", pros: { persistent: "Keeps agent interactions for review.", ephemeral: "Removes processed agent prompts automatically." } },
      { id: "a2ui.v1", label: "A2UI Panel", description: "Agent-declared UI panels (v1)", defaultEphemeral: true, defaultReason: "UI widgets are transient by design.", pros: { persistent: "Panels available for reference.", ephemeral: "Keeps feed clean from stale widgets." } },
      { id: "a2ui_render", label: "A2UI Render", description: "Agent UI render blocks", defaultEphemeral: true, defaultReason: "Render blocks are live views, not records.", pros: { persistent: "Snapshot of rendered state.", ephemeral: "Avoids stale renders accumulating." } },
      { id: "ui_presentation", label: "Presentation Card", description: "Agent-authored presentation cards", defaultEphemeral: true, defaultReason: "Presentations are point-in-time outputs.", pros: { persistent: "Keeps presentation for sharing.", ephemeral: "Cleans up after presentation is done." } },
      { id: "ui_blueprint", label: "Blueprint", description: "UI and workflow blueprints", defaultEphemeral: false, defaultReason: "Blueprints are design references you return to.", pros: { persistent: "Blueprint accessible as a reference.", ephemeral: "Removes blueprints once implemented." } },
      { id: "planning_result", label: "Plan", description: "Agent planning output", defaultEphemeral: false, defaultReason: "Plans guide ongoing work and should be tracked.", pros: { persistent: "Plan visible throughout execution.", ephemeral: "Clears completed plans automatically." } },
    ],
  },
  {
    id: "research",
    label: "Research & Media",
    description: "Search results, digests, and generated media",
    types: [
      { id: "search_result", label: "Search Result", description: "Web and workspace search results", defaultEphemeral: true, defaultReason: "Search results go stale within hours.", pros: { persistent: "Historical search snapshots for comparison.", ephemeral: "Prevents stale results cluttering the feed." } },
      { id: "media_card", label: "Media Card", description: "Generated images and QR codes", defaultEphemeral: false, defaultReason: "Generated media is a unique artefact — lost if dismissed.", pros: { persistent: "Media permanently available.", ephemeral: "Removes media once saved elsewhere." } },
      { id: "content_digest_result", label: "Content Digest", description: "Summarised content digests", defaultEphemeral: true, defaultReason: "Digests are point-in-time summaries.", pros: { persistent: "Keeps summaries for comparison over time.", ephemeral: "Prevents stale digests from accumulating." } },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    description: "Shell output, exports, and inbox views",
    types: [
      { id: "shell_result", label: "Shell Output", description: "Terminal / shell command output", defaultEphemeral: true, defaultReason: "Shell output is transient by nature.", pros: { persistent: "Logs available for debugging.", ephemeral: "Keeps feed clean from command noise." } },
      { id: "export_request", label: "Export Request", description: "Export job submission", defaultEphemeral: true, defaultReason: "The request itself is transient; the result matters.", pros: { persistent: "Request details available for retry.", ephemeral: "Cleans up once export completes." } },
      { id: "export_result", label: "Export Result", description: "Completed export with download link", defaultEphemeral: false, defaultReason: "Download links need to remain accessible.", pros: { persistent: "Download link always available.", ephemeral: "Removes links after files are downloaded." } },
      { id: "inbox_canvas", label: "Inbox Canvas", description: "Collaborative inbox canvas views", defaultEphemeral: false, defaultReason: "Inbox canvas is a shared workspace.", pros: { persistent: "Canvas available to all collaborators.", ephemeral: "Auto-archives inactive canvases." } },
      { id: "inbox_thread_dashboard", label: "Thread Dashboard", description: "Thread summary dashboard panels", defaultEphemeral: true, defaultReason: "Dashboards are dynamic views, not records.", pros: { persistent: "Historical snapshots of thread state.", ephemeral: "Keeps feed showing current state only." } },
    ],
  },
];

// ── Storage ───────────────────────────────────────────────────────────────────


// ── InfoTooltip ───────────────────────────────────────────────────────────────

function InfoTooltip(props: { entry: AfpTypeEntry; effectiveEphemeral: boolean }) {
  const [open, setOpen] = createSignal(false);
  return (
    <div class="relative inline-flex">
      <button
        type="button"
        class="flex h-4 w-4 items-center justify-center rounded-full border border-white/25 text-[0.55rem] text-on-surface-variant/60 transition hover:border-sky-400/50 hover:text-sky-400"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-label={`Info about ${props.entry.label} retention`}
      >ℹ</button>
      <Show when={open()}>
        <div class="absolute bottom-full left-1/2 z-[300] mb-2 w-64 -translate-x-1/2 rounded-xl border border-white/30 bg-white/95 p-3 shadow-2xl backdrop-blur-md text-left pointer-events-none">
          <p class="font-semibold text-xs text-on-surface mb-1">{props.entry.label}</p>
          <p class="text-[0.65rem] text-on-surface-variant mb-2">{props.entry.description}</p>

          <div class="rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 mb-2">
            <p class="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-primary/70 mb-0.5">Recommended default</p>
            <p class="text-xs font-semibold text-on-surface">{props.entry.defaultEphemeral ? "Ephemeral" : "Persistent"}</p>
            <p class="text-[0.65rem] text-on-surface-variant mt-0.5">{props.entry.defaultReason}</p>
          </div>

          <div class="space-y-1">
            <div>
              <span class="font-mono text-[0.55rem] uppercase tracking-[0.12em] text-emerald-600/70">Persistent: </span>
              <span class="text-[0.65rem] text-on-surface-variant">{props.entry.pros.persistent}</span>
            </div>
            <div>
              <span class="font-mono text-[0.55rem] uppercase tracking-[0.12em] text-amber-600/70">Ephemeral: </span>
              <span class="text-[0.65rem] text-on-surface-variant">{props.entry.pros.ephemeral}</span>
            </div>
          </div>

          <Show when={props.effectiveEphemeral !== props.entry.defaultEphemeral}>
            <p class="mt-2 text-[0.6rem] text-amber-600/80 border-t border-white/30 pt-1.5">
              ⚠ Differs from recommended default.
            </p>
          </Show>
        </div>
      </Show>
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────

function EphemeralToggle(props: {
  ephemeral: boolean;
  isOverride: boolean;
  onChange: () => void;
  onReset?: () => void;
}) {
  return (
    <div class="flex items-center gap-2">
      <Show when={props.isOverride && props.onReset}>
        <button
          type="button"
          class="text-[0.55rem] text-on-surface-variant/40 hover:text-amber-400 transition"
          title="Reset to category default"
          onClick={props.onReset}
        >↺</button>
      </Show>
      <button
        type="button"
        class={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors ${props.ephemeral ? "bg-amber-500/80 border-amber-400/60" : "bg-emerald-500/80 border-emerald-400/60"}`}
        onClick={props.onChange}
        title={props.ephemeral ? "Currently ephemeral — click to make persistent" : "Currently persistent — click to make ephemeral"}
        aria-pressed={props.ephemeral}
      >
        <span class={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${props.ephemeral ? "translate-x-[18px]" : "translate-x-[2px]"}`} />
      </button>
      <span class={`text-[0.6rem] font-medium ${props.ephemeral ? "text-amber-400" : "text-emerald-400"}`}>
        {props.ephemeral ? "Ephemeral" : "Persistent"}
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SystemSettingsView() {
  const [typeOverrides, setTypeOverrides] = createSignal<Record<string, boolean>>(loadAfpEphemeralTypeOverrides());
  const [catOverrides, setCatOverrides] = createSignal<Record<string, boolean>>(loadAfpEphemeralCategoryOverrides());
  const [expandedCat, setExpandedCat] = createSignal<string | null>(null);
  const [search, setSearch] = createSignal("");
  const [fontBody, setFontBody] = createSignal<FontBodyOption>(loadFontBodyPreference());
  const [fontScale, setFontScale] = createSignal<FontScaleOption>(loadFontScalePreference());
  const [paraViewEnabled, setParaViewEnabled] = createSignal(loadParaViewPreference());

  onMount(() => {
    const syncParaViewPreference = () => setParaViewEnabled(loadParaViewPreference());
    const unsubscribeParaViewPreference = subscribeParaViewPreference((enabled) => {
      setParaViewEnabled(enabled);
    });
    onCleanup(() => unsubscribeParaViewPreference());
  });

  const saveTypes = (next: Record<string, boolean>) => {
    setTypeOverrides(next);
    saveAfpEphemeralTypeOverrides(next);
  };
  const saveCats = (next: Record<string, boolean>) => {
    setCatOverrides(next);
    saveAfpEphemeralCategoryOverrides(next);
  };

  // Effective value: type override > category override > hardcoded default
  const effectiveEphemeral = (catId: string, entry: AfpTypeEntry): boolean => {
    const to = typeOverrides();
    if (to[entry.id] !== undefined) return to[entry.id];
    const co = catOverrides();
    if (co[catId] !== undefined) return co[catId];
    return entry.defaultEphemeral;
  };

  const catEffectiveEphemeral = (cat: AfpCategory): boolean => {
    const co = catOverrides();
    if (co[cat.id] !== undefined) return co[cat.id];
    // Majority vote of defaults for display
    const epCount = cat.types.filter((t) => t.defaultEphemeral).length;
    return epCount > cat.types.length / 2;
  };

  const isCatMixed = (cat: AfpCategory): boolean => {
    const first = effectiveEphemeral(cat.id, cat.types[0]);
    return cat.types.some((t) => effectiveEphemeral(cat.id, t) !== first);
  };

  const toggleCat = (cat: AfpCategory) => {
    const next = !catEffectiveEphemeral(cat);
    saveCats({ ...catOverrides(), [cat.id]: next });
    // Clear all type-level overrides within this category
    const to = { ...typeOverrides() };
    for (const t of cat.types) delete to[t.id];
    saveTypes(to);
  };

  const toggleType = (catId: string, entry: AfpTypeEntry) => {
    const current = effectiveEphemeral(catId, entry);
    saveTypes({ ...typeOverrides(), [entry.id]: !current });
  };

  const resetType = (entry: AfpTypeEntry) => {
    const to = { ...typeOverrides() };
    delete to[entry.id];
    saveTypes(to);
  };

  const resetAll = () => {
    saveTypes({});
    saveCats({});
  };

  const resetCategory = (cat: AfpCategory) => {
    const nextCats = { ...catOverrides() };
    delete nextCats[cat.id];
    saveCats(nextCats);

    const nextTypes = { ...typeOverrides() };
    for (const type of cat.types) delete nextTypes[type.id];
    saveTypes(nextTypes);
  };

  const hasAnyOverride = () =>
    Object.keys(typeOverrides()).length > 0 || Object.keys(catOverrides()).length > 0;

  const normalizedSearch = () => search().trim().toLowerCase();

  const fontScaleSummary = () => {
    switch (fontScale()) {
      case "S":
        return "Small";
      case "L":
        return "Large";
      case "XL":
        return "Extra large";
      default:
        return "Medium";
    }
  };

  const fontBodySummary = () =>
    fontBody() === "Readable" ? "Atkinson Hyperlegible for note, thread, and email content" : "Default body text";

  const filteredCategories = () => {
    const query = normalizedSearch();
    if (!query) return AFP_CATEGORIES.map((cat) => ({ category: cat, types: cat.types }));
    return AFP_CATEGORIES
      .map((cat) => {
        const categoryMatches =
          cat.label.toLowerCase().includes(query)
          || cat.description.toLowerCase().includes(query)
          || cat.id.toLowerCase().includes(query);
        const matchingTypes = categoryMatches
          ? cat.types
          : cat.types.filter((entry) =>
            entry.label.toLowerCase().includes(query)
            || entry.description.toLowerCase().includes(query)
            || entry.id.toLowerCase().includes(query)
          );
        return matchingTypes.length > 0 ? { category: cat, types: matchingTypes } : null;
      })
      .filter((value): value is { category: AfpCategory; types: AfpTypeEntry[] } => value !== null);
  };

  return (
    <div class="mx-auto max-w-3xl px-4 py-8 space-y-8">
      {/* Page header */}
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-semibold text-on-surface">System Settings</h1>
          <p class="text-sm text-on-surface-variant mt-1">Manage workspace behaviour and agent message preferences.</p>
        </div>
      </div>

      <section class="rounded-2xl border border-white/15 bg-white/[0.03] p-4">
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="flex items-center gap-1.5">
              <h2 class="text-base font-semibold text-on-surface">Appearance</h2>
              <InfoHint text="Adjust the workspace base font size without relying on browser zoom. This preference is stored locally on this device." />
            </div>
            <p class="mt-1 text-xs text-on-surface-variant">
              Base font size currently set to <span class="font-medium text-on-surface">{fontScaleSummary()}</span>.
            </p>
            <p class="mt-1 text-xs text-on-surface-variant">
              Content font currently set to <span class="font-medium text-on-surface">{fontBodySummary()}</span>.
            </p>
          </div>
          <div class="flex flex-col items-end gap-2">
            <div class="inline-flex rounded-full border border-white/15 bg-white/[0.04] p-1">
              <For each={FONT_SCALE_OPTIONS}>
                {(option) => (
                  <button
                    type="button"
                    onClick={() => {
                      setFontScale(option);
                      saveFontScalePreference(option);
                    }}
                    class={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      fontScale() === option
                        ? "bg-primary text-white shadow-[0_8px_20px_rgba(49,86,142,0.22)]"
                        : "text-on-surface-variant hover:bg-white/10 hover:text-on-surface"
                    }`}
                    aria-pressed={fontScale() === option}
                    title={`Set base font size to ${option}`}
                  >
                    {option}
                  </button>
                )}
              </For>
            </div>
            <div class="inline-flex rounded-full border border-white/15 bg-white/[0.04] p-1">
              <For each={FONT_BODY_OPTIONS}>
                {(option) => (
                  <button
                    type="button"
                    onClick={() => {
                      setFontBody(option);
                      saveFontBodyPreference(option);
                    }}
                    class={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      fontBody() === option
                        ? "bg-primary text-white shadow-[0_8px_20px_rgba(49,86,142,0.22)]"
                        : "text-on-surface-variant hover:bg-white/10 hover:text-on-surface"
                    }`}
                    aria-pressed={fontBody() === option}
                    title={option === "Readable" ? "Use Atkinson Hyperlegible for user content" : "Use the default body font"}
                  >
                    {option}
                  </button>
                )}
              </For>
            </div>
          </div>
        </div>
        <p class="mt-3 text-[11px] text-on-surface-variant/65">
          Applies across the workspace and survives reloads on this browser profile. The readable font affects user-generated content only, not UI labels.
        </p>
      </section>

      <section class="rounded-2xl border border-white/15 bg-white/[0.03] p-4">
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="flex items-center gap-1.5">
              <h2 class="text-base font-semibold text-on-surface">Workspace Methods</h2>
              <InfoHint text="Turn workspace methods on or off for this browser profile. Disabling PARA removes its main entry points and keeps the rest of the workspace unchanged." />
            </div>
            <p class="mt-1 text-xs text-on-surface-variant">
              PARA Navigator is currently <span class="font-medium text-on-surface">{paraViewEnabled() ? "enabled" : "disabled"}</span>.
            </p>
            <p class="mt-1 text-[11px] text-on-surface-variant/65">
              Stored locally on this device. Turning PARA off hides its quick-access entry points and prevents reopening that workflow until you enable it again.
            </p>
          </div>
          <div class="inline-flex rounded-full border border-white/15 bg-white/[0.04] p-1">
            <button
              type="button"
              onClick={() => {
                setParaViewEnabled(true);
                saveParaViewPreference(true);
              }}
              class={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                paraViewEnabled()
                  ? "bg-primary text-white shadow-[0_8px_20px_rgba(49,86,142,0.22)]"
                  : "text-on-surface-variant hover:bg-white/10 hover:text-on-surface"
              }`}
              aria-pressed={paraViewEnabled()}
              title="Enable PARA Navigator"
            >
              PARA on
            </button>
            <button
              type="button"
              onClick={() => {
                setParaViewEnabled(false);
                saveParaViewPreference(false);
              }}
              class={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                !paraViewEnabled()
                  ? "bg-primary text-white shadow-[0_8px_20px_rgba(49,86,142,0.22)]"
                  : "text-on-surface-variant hover:bg-white/10 hover:text-on-surface"
              }`}
              aria-pressed={!paraViewEnabled()}
              title="Disable PARA Navigator"
            >
              PARA off
            </button>
          </div>
        </div>
      </section>

      {/* ── AFP Message Retention section ── */}
      <section class="space-y-2">
        <label for="system-settings-search" class="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
          Search settings
          <InfoHint text="Filter the retention catalog by category name, message type, or setting id so you can jump directly to the rule you need." />
        </label>
        <input
          id="system-settings-search"
          type="search"
          value={search()}
          onInput={(event) => setSearch(event.currentTarget.value)}
          placeholder="Search categories, message types, or retention rules"
          class="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/45 outline-none transition focus:border-primary/40"
          aria-label="Search system settings"
        />
        <Show when={normalizedSearch()}>
          <p class="text-[11px] text-on-surface-variant/60">
            Showing retention settings matching “{search().trim()}”.
          </p>
        </Show>
      </section>

      <section class="space-y-4">
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="flex items-center gap-1.5">
              <h2 class="text-base font-semibold text-on-surface">AFP Message Retention</h2>
              <InfoHint text="These controls decide whether new AFP message cards stay in persistent thread history or auto-dismiss after they have been seen. Category toggles set the default for a whole group, while type rows let you override specific message kinds." />
            </div>
            <p class="text-xs text-on-surface-variant mt-0.5 max-w-lg">
              Choose whether each message type is <span class="text-emerald-400 font-medium">persistent</span> (kept in thread history) or <span class="text-amber-400 font-medium">ephemeral</span> (auto-dismissed after viewing). Category toggles set a default for all types in that group; individual type toggles override the category.
            </p>
          </div>
          <Show when={hasAnyOverride()}>
            <button
              type="button"
              class="shrink-0 rounded-lg border border-white/20 px-3 py-1.5 text-xs text-on-surface-variant hover:bg-white/10 transition"
              onClick={resetAll}
              title="Reset all overrides to their hardcoded defaults"
            >
              Reset all to defaults
            </button>
          </Show>
        </div>

        {/* Legend */}
        <div class="flex items-center gap-4 text-[0.65rem] text-on-surface-variant/70 px-1">
          <span class="flex items-center gap-1.5"><span class="inline-block h-2 w-2 rounded-full bg-emerald-500/70" />Persistent — kept in thread history</span>
          <span class="flex items-center gap-1.5"><span class="inline-block h-2 w-2 rounded-full bg-amber-500/70" />Ephemeral — auto-dismissed after viewing</span>
        </div>

        {/* Categories */}
        <Show
          when={filteredCategories().length > 0}
          fallback={
            <EmptyState
              icon="⚙"
              title="No matching settings"
              body="Try a broader search like email, calendar, agent, or retention to find the setting you need."
            />
          }
        >
          <div class="space-y-2">
            <For each={filteredCategories()}>
              {({ category: cat, types }) => {
              const isExpanded = () => expandedCat() === cat.id;
              const catEphemeral = () => catEffectiveEphemeral(cat);
              const mixed = () => isCatMixed(cat);
              const catHasOverride = () => catOverrides()[cat.id] !== undefined;

              return (
                <div class="rounded-2xl border border-white/15 bg-white/[0.03] overflow-hidden">
                  {/* Category header */}
                  <div class="flex items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      class="flex-1 flex items-center gap-3 text-left"
                      onClick={() => setExpandedCat((v) => v === cat.id ? null : cat.id)}
                    >
                      <span class="text-[0.7rem] text-on-surface-variant transition">{isExpanded() ? "▼" : "▶"}</span>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                          <span class="font-semibold text-sm text-on-surface">{cat.label}</span>
                          <Show when={mixed()}>
                            <span class="rounded-full border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-widest text-on-surface-variant/60">Mixed</span>
                          </Show>
                          <Show when={catHasOverride()}>
                            <span class="rounded-full border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-widest text-amber-400/80">Override</span>
                          </Show>
                        </div>
                        <p class="text-[0.65rem] text-on-surface-variant mt-0.5">{cat.description}</p>
                      </div>
                    </button>
                    <Show when={catHasOverride()}>
                      <button
                        type="button"
                        class="shrink-0 rounded-lg border border-white/20 px-2.5 py-1 text-[11px] text-on-surface-variant transition hover:bg-white/10"
                        onClick={() => resetCategory(cat)}
                        title={`Reset ${cat.label} to its recommended defaults`}
                      >
                        Reset
                      </button>
                    </Show>
                    {/* Category-level toggle */}
                    <EphemeralToggle
                      ephemeral={catEphemeral()}
                      isOverride={catHasOverride()}
                      onChange={() => toggleCat(cat)}
                      onReset={() => { const c = { ...catOverrides() }; delete c[cat.id]; saveCats(c); }}
                    />
                  </div>

                  {/* Type list (expanded) */}
                  <Show when={isExpanded()}>
                    <div class="border-t border-white/10">
                      <For each={types}>
                        {(entry) => {
                          const eff = () => effectiveEphemeral(cat.id, entry);
                          const hasTypeOverride = () => typeOverrides()[entry.id] !== undefined;
                          return (
                            <div class="flex items-center gap-3 px-5 py-2.5 border-b border-white/[0.06] last:border-0 hover:bg-white/[0.02] transition">
                              <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-1.5">
                                  <span class="text-xs font-medium text-on-surface">{entry.label}</span>
                                  <InfoTooltip entry={entry} effectiveEphemeral={eff()} />
                                  <Show when={hasTypeOverride()}>
                                    <span class="rounded-full border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-widest text-amber-400/80">Override</span>
                                  </Show>
                                  <Show when={!hasTypeOverride() && eff() !== entry.defaultEphemeral}>
                                    <span class="rounded-full border border-violet-400/30 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-widest text-violet-400/70">Cat.</span>
                                  </Show>
                                </div>
                                <p class="text-[0.6rem] text-on-surface-variant/60 mt-0.5">{entry.description}</p>
                              </div>
                              <EphemeralToggle
                                ephemeral={eff()}
                                isOverride={hasTypeOverride()}
                                onChange={() => toggleType(cat.id, entry)}
                                onReset={() => resetType(entry)}
                              />
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </Show>
                </div>
              );
              }}
            </For>
          </div>
        </Show>

        {/* Footer note */}
        <p class="text-[0.65rem] text-on-surface-variant/50 px-1">
          These settings affect how the agent handles new messages. Existing messages in open threads are not affected retroactively.
          Ephemeral messages are still stored server-side until the session ends — they are simply hidden from the persistent feed.
        </p>
      </section>
    </div>
  );
}
