import { Show } from "solid-js";
import type { AfpMessage, AfpView } from "@/lib/api";
import { KNOWN_VIEW_FORMATS, pickView } from "@/lib/api";
import { InboxRenderer } from "@/components/renderers/InboxRenderer";
import { CanvasRenderer } from "@/components/renderers/CanvasRenderer";
import { TableRenderer } from "@/components/renderers/TableRenderer";
import { CalendarRenderer } from "@/components/renderers/CalendarRenderer";
import { AttachmentsRenderer } from "@/components/renderers/AttachmentsRenderer";
import { ApprovalsRenderer } from "@/components/renderers/ApprovalsRenderer";
import { SearchResultRenderer } from "@/components/renderers/SearchResultRenderer";
import { TaskCardRenderer } from "@/components/renderers/TaskCardRenderer";
import { GenerativeCardRenderer } from "@/components/renderers/GenerativeCardRenderer";
import { BlueprintRenderer } from "@/components/renderers/BlueprintRenderer";
import { A2UIRenderer } from "@/components/renderers/A2UIRenderer";
import { PresentationCardRenderer } from "@/components/renderers/PresentationCardRenderer";

/**
 * The agent-first renderer registry.
 *
 * Every AFP message carries a `views` array where each entry has a `format`
 * string. ViewDispatcher picks the highest-priority known format and hands the
 * message to the correct renderer. If no view hint is present it falls back to
 * a heuristic based on the message `type`, then to a generic card.
 *
 * Agents change what the workspace shows by writing a different `views` entry
 * into an AFP message — no UI code changes required.
 */
export function ViewDispatcher(props: {
  message: AfpMessage;
  viewOverride?: AfpView;
  compact?: boolean;
  /** card_section_update messages belonging to this card (for generative_card format) */
  cardUpdates?: AfpMessage[];
  onDecision?: (cardId: string, dpId: string, optionId: string) => void;
  /** Called by ui_presentation cards when user clicks "View workflow →" */
  onViewWorkflow?: () => void;
}) {
  const chosenView = () => props.viewOverride ?? pickView(props.message, [...KNOWN_VIEW_FORMATS]);

  const effectiveFormat = (): string => {
    if (chosenView()) return chosenView()!.format;
    // Heuristic fallback from message type
    const t = props.message.type;
    const subtype = props.message.subtype ?? "";
    const kind = (props.message.content?.kind as string | undefined) ?? "";
    if (t === "research" || t === "search_result" || t.includes("search")) return "search_result";
    if (t === "task") return "task_card";
    if (t.includes("email") || t.includes("inbox") || t.includes("reply")) return "email";
    if (t === "calendar" || t.includes("calendar") || t.includes("event") || t.includes("booking")) return "calendar";
    if (t.includes("table") || t.includes("action_log") || t.includes("database")) return "table";
    if (t.includes("canvas") || t.includes("note")) return "canvas";
    if (t.includes("attachment") || t.includes("file")) return "attachments";
    if (t.includes("approval") || t.includes("decision") || t.includes("review")) return "approvals";
    if (t === "agent" && subtype === "ui_presentation") return "ui_presentation";
    if (t === "agent" && subtype === "orchestration_card") return "generative_card";
    if (t === "agent" && subtype === "plan") return "task_card";
    if (t === "agent" && (subtype === "dashboard_panel" || subtype === "runner_editor" || subtype === "workspace_panel")) return "a2ui.v1";
    if (t === "note" && (subtype === "content" || kind.includes("note"))) return "canvas";
    if (t === "calendar" && (subtype === "plan" || kind.includes("schedule"))) return "calendar";
    if (t === "task" && (subtype === "card" || kind.includes("task"))) return "task_card";
    if (t === "research" && (subtype === "content" || kind.includes("research"))) return "search_result";
    if (t.includes("blueprint") || t.includes("ui")) return "ui_blueprint";
    // Content-shape heuristic: if content has bullets/summary it's a search result
    const c = props.message.content;
    if (c && typeof c === "object" && !Array.isArray(c) && ("bullets" in c || "sources" in c)) return "search_result";
    // Default to inbox-style card for unknown types
    return "email";
  };

  return (
    <article class="glass-surface rounded-xl border border-white/35 p-5 shadow-panel">
      <Show when={!props.compact}>
        <FormatBadge format={effectiveFormat()} agentDriven={Boolean(chosenView())} />
      </Show>

      <div class={props.compact ? "" : "mt-3"}>
        <Show when={effectiveFormat() === "email"}>
          <InboxRenderer message={props.message} />
        </Show>
        <Show when={effectiveFormat() === "canvas"}>
          <CanvasRenderer message={props.message} view={chosenView() ?? undefined} />
        </Show>
        <Show when={effectiveFormat() === "table"}>
          <TableRenderer message={props.message} view={chosenView() ?? undefined} />
        </Show>
        <Show when={effectiveFormat() === "calendar"}>
          <CalendarRenderer message={props.message} view={chosenView() ?? undefined} />
        </Show>
        <Show when={effectiveFormat() === "attachments"}>
          <AttachmentsRenderer message={props.message} />
        </Show>
        <Show when={effectiveFormat() === "approvals"}>
          <ApprovalsRenderer message={props.message} view={chosenView() ?? undefined} />
        </Show>
        <Show when={effectiveFormat() === "search_result"}>
          <SearchResultRenderer message={props.message} view={chosenView() ?? undefined} />
        </Show>
        <Show when={effectiveFormat() === "task_card"}>
          <TaskCardRenderer message={props.message} view={chosenView() ?? undefined} />
        </Show>
        <Show when={effectiveFormat() === "generative_card"}>
          <GenerativeCardRenderer
            message={props.message}
            updates={props.cardUpdates ?? []}
            onDecision={props.onDecision}
          />
        </Show>
        <Show when={effectiveFormat() === "a2ui.v1"}>
          <A2UIRenderer message={props.message} view={chosenView() ?? undefined} />
        </Show>
        <Show when={effectiveFormat() === "ui_presentation"}>
          <PresentationCardRenderer
            message={props.message}
            view={chosenView() ?? undefined}
            onViewWorkflow={props.onViewWorkflow}
          />
        </Show>
        <Show when={effectiveFormat() === "ui_blueprint" || effectiveFormat() === "blueprint"}>
          <BlueprintRenderer message={props.message} view={chosenView() ?? undefined} />
        </Show>
      </div>
    </article>
  );
}

function FormatBadge(props: { format: string; agentDriven: boolean }) {
  const label = () => {
    const map: Record<string, string> = {
      email: "Inbox",
      canvas: "Canvas",
      table: "Table",
      calendar: "Calendar",
      attachments: "Attachments",
      approvals: "Approval",
      search_result: "Research",
      task_card: "Task",
      generative_card: "Agent",
      "a2ui.v1": "A2UI",
      ui_blueprint: "Blueprint",
      blueprint: "Blueprint",
      ui_presentation: "Presentation",
    };
    return map[props.format] ?? props.format;
  };

  return (
    <div class="flex items-center gap-2">
      <span class="rounded-full bg-white/50 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-on-surface-variant">
        {label()}
      </span>
      <Show when={props.agentDriven}>
        <span class="rounded-full bg-primary-fixed/50 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-primary">
          agent view
        </span>
      </Show>
    </div>
  );
}
