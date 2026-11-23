export type PracticePlanRef = { account_id: string; plan_id: string; thread_id: string };
export type PracticeAction = "review_permission" | "review_approval" | "review_response" | "review_quote" | "review_hold" | "prepare_follow_up" | "review_task" | "review_payment_evidence";
export type PracticePage = "home" | "clients" | "inbox" | "calendar" | "suppliers" | "settings" | "more";
export type PracticeClient = {
  summary: {
    plan: PracticePlanRef; client_label: string; wedding_date: string | null;
    stage: string; assigned_planner_id: string | null; next_action: PracticeAction | null;
    next_action_due_at: string | null; unread_count: number | null; action_needed_count: number | null;
    financial_due: { amount: { amount_minor: number; currency: string }; due_at: string }[];
    source_projection_version: number;
  };
  authority: { membership: number; collaboration: number };
};
export type PracticeBootstrap = {
  schema_version: "practice.bootstrap.v1"; account_id: string; professional_planner: boolean;
  status: "unavailable" | "no_practice" | "choose_practice" | "ready" | "forbidden";
  practices: { practice_id: string; display_name: string; role: string; membership_revision: number }[];
  selected_practice_id: string | null; clients: PracticeClient[]; generated_at: string;
  next_action: null | { component: "practice_next_action"; plan: PracticePlanRef; client_label: string;
    action: PracticeAction; due_at: string | null; owner_account_id: string | null };
};
export type PracticeRoute = { practice: string | null; page: PracticePage; client: PracticePlanRef | null; filter: string; search: string; offset: number };
export const practicePages: PracticePage[] = ["home", "clients", "inbox", "calendar", "suppliers", "settings", "more"];
export const practiceActionLabels: Record<PracticeAction, string> = {
  review_permission: "Review access", review_approval: "Review approval", review_response: "Review response",
  review_quote: "Review quote", review_hold: "Review date hold", prepare_follow_up: "Prepare follow-up",
  review_task: "Review task", review_payment_evidence: "Review payment evidence",
};
export function samePracticePlan(a: PracticePlanRef, b: PracticePlanRef): boolean {
  return a.account_id === b.account_id && a.plan_id === b.plan_id && a.thread_id === b.thread_id;
}
export function readPracticeRoute(search: string): PracticeRoute {
  const p = new URLSearchParams(search);
  const page = p.get("page") as PracticePage;
  const practice = p.get("practice")?.slice(0, 180) || null;
  const owner = p.get("owner"), plan = p.get("plan"), thread = p.get("thread");
  return { practice, page: practicePages.includes(page) ? page : "home",
    client: practice && owner && plan && thread ? { account_id: owner, plan_id: plan, thread_id: thread } : null,
    filter: p.get("filter")?.slice(0, 40) || "all", search: p.get("search")?.slice(0, 160) || "",
    offset: Math.max(0, Math.min(1000, Number.parseInt(p.get("offset") || "0", 10) || 0)) };
}
export function practiceHref(route: PracticeRoute): string {
  const p = new URLSearchParams({ page: route.page });
  if (route.practice) p.set("practice", route.practice);
  if (route.client && route.practice) {
    p.set("owner", route.client.account_id); p.set("plan", route.client.plan_id); p.set("thread", route.client.thread_id);
  }
  if (route.filter !== "all") p.set("filter", route.filter);
  if (route.search) p.set("search", route.search);
  if (route.offset) p.set("offset", String(route.offset));
  return `?${p}`;
}
export function practiceContextKey(data: PracticeBootstrap): string {
  const selected = data.practices.find(p => p.practice_id === data.selected_practice_id);
  return JSON.stringify([data.account_id, data.selected_practice_id, selected?.membership_revision,
    data.clients.map(c => [c.summary.plan, c.authority.membership, c.authority.collaboration])]);
}
export function practiceClientsForRoute(data: PracticeBootstrap, route: PracticeRoute): PracticeClient[] {
  if (data.status !== "ready" || data.selected_practice_id !== route.practice) return [];
  const now = Date.parse(data.generated_at), week = now + 7 * 86400000;
  const filter = route.filter !== "all" ? route.filter : route.page === "inbox" ? "inbox" : route.page === "calendar" ? "week" : "all";
  return data.clients.filter(({ summary: s }) => {
    if (route.search && !s.client_label.toLocaleLowerCase().includes(route.search.toLocaleLowerCase())) return false;
    if (filter === "attention") return s.next_action !== null;
    if (filter === "payments") return s.financial_due.length > 0;
    if (filter === "holds") return s.next_action === "review_hold";
    if (filter === "inbox") return ["review_response", "review_quote", "review_approval", "prepare_follow_up"].includes(s.next_action || "");
    if (filter === "week") { const due = Date.parse(s.next_action_due_at || ""); return Number.isFinite(due) && due <= week; }
    if (filter.startsWith("stage:")) return s.stage === filter.slice(6);
    return filter === "all";
  });
}

/** No response may populate a view after its context was replaced, even if fetch ignores abort. */
export function createPracticeRequestGate() {
  let generation = 0;
  let controller: AbortController | null = null;
  return {
    begin() { controller?.abort(); controller = new AbortController(); const id = ++generation;
      return { signal: controller.signal, isCurrent: () => id === generation && !controller?.signal.aborted }; },
    cancel() { ++generation; controller?.abort(); },
  };
}

export function assertPracticeBootstrap(data: PracticeBootstrap, requested: string | null): void {
  if (data.schema_version !== "practice.bootstrap.v1" || !data.account_id || !Array.isArray(data.practices)
    || !Array.isArray(data.clients) || !Number.isFinite(Date.parse(data.generated_at))
    || !["unavailable", "no_practice", "choose_practice", "ready", "forbidden"].includes(data.status)
    || (!data.professional_planner && (data.practices.length > 0 || data.status !== "unavailable"))
    || (data.status === "ready" && (data.selected_practice_id !== requested || !data.professional_planner
      || !data.practices.some(p => p.practice_id === requested)))) throw new Error("Invalid practice response");
  if (data.status !== "ready" && (data.clients.length || data.next_action)) throw new Error("Unscoped practice response");
  if (data.next_action && (data.next_action.component !== "practice_next_action"
    || !(data.next_action.action in practiceActionLabels)
    || !data.clients.some(c => samePracticePlan(c.summary.plan, data.next_action!.plan)))) throw new Error("Unscoped next action");
}
