// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";
import { taskMessageContentRecord } from "@/lib/taskPresentationState";

export type ActiveTaskLifecycle = "pending" | "in_progress" | "blocked" | "decided" | "completed" | "skipped";

export type ActiveTaskDecisionOption = {
  id: string;
  label: string;
  detail: string | null;
  chosen: boolean;
};

export type ActiveTaskDecision = {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "decided" | "skipped";
  statusLabel: string;
  options: ActiveTaskDecisionOption[];
  chosenOptionLabel: string | null;
};

export type ActiveTaskDecisionItem = {
  id: string;
  title: string;
  description: string | null;
  status: ActiveTaskLifecycle;
  statusLabel: string;
  dueLabel: string | null;
  dueSortKey: string;
  threadId: string | null;
  sourceMessageId: string | null;
  decisions: ActiveTaskDecision[];
};

export type ActiveTaskDecisionViewState = {
  items: ActiveTaskDecisionItem[];
  counts: Record<ActiveTaskLifecycle | "all", number>;
};

type UnknownRecord = Record<string, unknown>;

const TECHNICAL_TEXT = /(?:schema[_ -]?version|stack trace|fingerprint|provider[_ -]?(?:receipt|credential|executor)|message[_ -]?id|thread[_ -]?id|\b(?:smtp|http 5\d\d|postgres|clamav)\b|^[\[{].*[\]}]$)/i;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

function safeText(value: unknown, max = 180): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const clean = String(value).replace(/\s+/g, " ").trim();
  if (!clean || TECHNICAL_TEXT.test(clean)) return null;
  return clean.slice(0, max);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => safeText(entry, 120) ?? []).slice(0, 24);
}

function idList(source: UnknownRecord | null): string[] {
  if (!source) return [];
  const scalarKeys = ["task_id", "linked_task_id", "source_task_id"];
  const arrayKeys = ["task_ids", "linked_task_ids"];
  return [
    ...scalarKeys.flatMap((key) => safeText(source[key], 160) ?? []),
    ...arrayKeys.flatMap((key) => stringList(source[key])),
  ];
}

function optionFrom(value: unknown, index: number, chosenId: string | null, chosenLabel: string | null): ActiveTaskDecisionOption | null {
  const item = record(value);
  const label = safeText(item?.label ?? item?.name ?? item?.title ?? value, 140);
  if (!label) return null;
  const id = safeText(item?.id ?? item?.option_id, 160) ?? `option-${index + 1}`;
  return {
    id,
    label,
    detail: safeText(item?.detail ?? item?.summary ?? item?.description, 240),
    chosen: id === chosenId || label.toLocaleLowerCase() === chosenLabel?.toLocaleLowerCase(),
  };
}

function decisionFrom(value: unknown, fallbackId: string, fallbackStatus: ActiveTaskLifecycle): ActiveTaskDecision | null {
  const item = record(value);
  if (!item) return null;
  const selected = record(item.selected_option ?? item.chosen_option ?? item.selection);
  const chosenId = safeText(selected?.id ?? selected?.option_id ?? item.selected_option_id ?? item.chosen_option_id, 160);
  const chosenLabel = safeText(selected?.label ?? selected?.name ?? item.selected_option_label ?? item.chosen_option_label, 140);
  const slots = record(item.pattern_slots ?? item.patternSlots);
  const rawOptions = Array.isArray(item.options)
    ? item.options
    : Array.isArray(slots?.options)
      ? slots.options
      : stringList(item.option_labels);
  const options = rawOptions
    .map((option, index) => optionFrom(option, index, chosenId, chosenLabel))
    .filter((option): option is ActiveTaskDecisionOption => option !== null);
  if (chosenLabel && !options.some((option) => option.chosen)) {
    options.unshift({ id: chosenId ?? "chosen", label: chosenLabel, detail: null, chosen: true });
  }
  const rawStatus = safeText(item.status ?? item.decision_status ?? item.outcome, 40)?.toLowerCase() ?? "";
  const skipped = /skip|defer|dismiss|cancel/.test(rawStatus);
  const decided = Boolean(chosenLabel || chosenId) || /decid|select|approv|complete/.test(rawStatus);
  const status = skipped ? "skipped" : decided ? "decided" : fallbackStatus === "in_progress" ? "in_progress" : "pending";
  const title = safeText(item.title ?? item.question ?? item.prompt ?? item.label, 160) ?? "Decision";
  return {
    id: safeText(item.id ?? item.decision_id, 180) ?? fallbackId,
    title,
    status,
    statusLabel: status === "in_progress" ? "In progress" : status[0].toUpperCase() + status.slice(1),
    options,
    chosenOptionLabel: chosenLabel ?? options.find((option) => option.chosen)?.label ?? null,
  };
}

function decisionCandidates(content: UnknownRecord): unknown[] {
  const candidates: unknown[] = [];
  for (const key of ["decisions", "decision_items", "related_decisions"]) {
    if (Array.isArray(content[key])) candidates.push(...content[key] as unknown[]);
  }
  for (const key of ["decision", "selected_decision_scope"]) {
    if (record(content[key])) candidates.push(content[key]);
  }
  return candidates;
}

function lifecycle(content: UnknownRecord, decisions: readonly ActiveTaskDecision[]): ActiveTaskLifecycle {
  const raw = (safeText(content.status, 50) ?? "pending").toLowerCase().replace(/[ -]+/g, "_");
  if (/skip|cancel|dismiss/.test(raw)) return "skipped";
  if (/block|fail|error/.test(raw)) return "blocked";
  if (/decid|select|approv/.test(raw)) return "decided";
  if (/complete|done|finish/.test(raw)) return decisions.some((decision) => decision.status === "decided") ? "decided" : "completed";
  if (/progress|active|working|started/.test(raw)) return "in_progress";
  return decisions.some((decision) => decision.status === "decided") ? "in_progress" : "pending";
}

function lifecycleLabel(status: ActiveTaskLifecycle): string {
  return status === "in_progress" ? "In progress" : status[0].toUpperCase() + status.slice(1);
}

function dueState(value: unknown): { label: string | null; sort: string } {
  const text = safeText(value, 80);
  if (!text) return { label: null, sort: "9999-12-31T23:59:59.999Z" };
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) return { label: text, sort: "9999-12-31T23:59:59.999Z" };
  return {
    label: parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    sort: parsed.toISOString(),
  };
}

function decisionKey(decision: ActiveTaskDecision): string {
  return decision.id || decision.title.toLocaleLowerCase();
}

function mergeDecision(base: ActiveTaskDecision, update: ActiveTaskDecision): ActiveTaskDecision {
  const optionMap = new Map(base.options.map((option) => [option.id, option]));
  for (const option of update.options) optionMap.set(option.id, { ...optionMap.get(option.id), ...option });
  const options = [...optionMap.values()];
  const chosen = update.chosenOptionLabel ?? base.chosenOptionLabel;
  return {
    ...base,
    ...update,
    title: update.title === "Decision" ? base.title : update.title,
    options: options.map((option) => ({ ...option, chosen: option.chosen || option.label === chosen })),
    chosenOptionLabel: chosen,
  };
}

export function buildActiveTaskDecisionViewState(messages: readonly AfpMessage[]): ActiveTaskDecisionViewState {
  const ordered = [...messages].sort((left, right) => String(left.timestamp ?? "").localeCompare(String(right.timestamp ?? "")));
  const decisionLibrary = new Map<string, ActiveTaskDecision>();
  const linkedDecisionKeys = new Map<string, string[]>();

  for (const message of ordered) {
    const content = taskMessageContentRecord(message);
    const metadata = record(message.metadata);
    const isDecision = message.type.includes("decision") || message.subtype?.includes("decision") || decisionCandidates(content).length > 0;
    if (!isDecision) continue;
    const candidates = decisionCandidates(content);
    if (candidates.length === 0) candidates.push(content);
    const taskIds = [...new Set([...idList(content), ...idList(metadata)])];
    candidates.forEach((candidate, index) => {
      const decision = decisionFrom(candidate, `${message.id}:decision-${index + 1}`, "pending");
      if (!decision) return;
      const keys = [decision.id, safeText(record(candidate)?.artifact_id, 180)].filter((key): key is string => Boolean(key));
      for (const key of keys) decisionLibrary.set(key, decisionLibrary.has(key) ? mergeDecision(decisionLibrary.get(key)!, decision) : decision);
      for (const taskId of taskIds) linkedDecisionKeys.set(taskId, [...new Set([...(linkedDecisionKeys.get(taskId) ?? []), ...keys])]);
    });
  }

  const taskMap = new Map<string, ActiveTaskDecisionItem>();
  for (const message of ordered) {
    const content = taskMessageContentRecord(message);
    if (message.type !== "task" && content.kind !== "task") continue;
    const id = safeText(content.task_id, 180) ?? message.id;
    const previous = taskMap.get(id);
    const rawStatus = safeText(content.status, 50)?.toLowerCase() ?? "pending";
    const fallbackStatus: ActiveTaskLifecycle = /progress|active|started/.test(rawStatus) ? "in_progress" : "pending";
    const embedded = decisionCandidates(content)
      .map((candidate, index) => decisionFrom(candidate, `${message.id}:decision-${index + 1}`, fallbackStatus))
      .filter((decision): decision is ActiveTaskDecision => decision !== null);
    const references = [
      ...stringList(content.decision_ids),
      ...[safeText(content.decision_id, 180), safeText(record(content.selected_decision_scope)?.decision_id, 180), safeText(record(content.selected_decision_scope)?.artifact_id, 180)].filter((key): key is string => Boolean(key)),
      ...(linkedDecisionKeys.get(id) ?? []),
    ];
    const linked = references.flatMap((key) => decisionLibrary.get(key) ?? []);
    const decisionMap = new Map((previous?.decisions ?? []).map((decision) => [decisionKey(decision), decision]));
    for (const decision of [...embedded, ...linked]) {
      const key = decisionKey(decision);
      decisionMap.set(key, decisionMap.has(key) ? mergeDecision(decisionMap.get(key)!, decision) : decision);
    }
    const decisions = [...decisionMap.values()];
    const due = dueState(content.due_date ?? content.due_at ?? previous?.dueLabel);
    const status = lifecycle(content, decisions);
    taskMap.set(id, {
      id,
      title: safeText(content.title, 180) ?? previous?.title ?? "Task",
      description: safeText(content.description, 280) ?? previous?.description ?? null,
      status,
      statusLabel: lifecycleLabel(status),
      dueLabel: due.label ?? previous?.dueLabel ?? null,
      dueSortKey: due.sort === "9999-12-31T23:59:59.999Z" ? previous?.dueSortKey ?? due.sort : due.sort,
      threadId: safeText(message.thread_id, 180) ?? previous?.threadId ?? null,
      sourceMessageId: safeText(message.id, 180) ?? previous?.sourceMessageId ?? null,
      decisions,
    });
  }

  const items = [...taskMap.values()].sort((left, right) => left.dueSortKey.localeCompare(right.dueSortKey) || left.title.localeCompare(right.title));
  const counts = { all: items.length, pending: 0, in_progress: 0, blocked: 0, decided: 0, completed: 0, skipped: 0 };
  for (const item of items) counts[item.status] += 1;
  return { items, counts };
}
