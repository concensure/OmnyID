import type { PracticeBootstrap, PracticeClient } from "../../src/lib/weddingPracticeState";

export function practiceFixture(selected: string | null = "harbour"): PracticeBootstrap {
  const client = (name: string, id: string, action: PracticeClient["summary"]["next_action"]): PracticeClient => ({
    summary: { plan: { account_id: `owner-${id}`, plan_id: id, thread_id: `thread-${id}` }, client_label: name,
      wedding_date: "2027-03-20", stage: "planning", assigned_planner_id: "planner", next_action: action,
      next_action_due_at: "2026-10-28T10:00:00+11:00", unread_count: 1, action_needed_count: 1,
      financial_due: action === "review_payment_evidence" ? [{ amount: { amount_minor: 50000, currency: "AUD" }, due_at: "2026-10-28T00:00:00Z" }] : [], source_projection_version: 1 },
    authority: { membership: 1, collaboration: 1 },
  });
  const clients = selected === "harbour" ? [client("Priya & Daniel", "priya", "review_quote"), client("Amelia & Oliver", "amelia", "review_hold"), client("Sofia & James", "sofia", "review_payment_evidence")]
    : selected === "garden" ? [client("Mei & Alex", "mei", "review_task")] : [];
  return {
    schema_version: "practice.bootstrap.v1", account_id: "planner", professional_planner: true,
    status: selected ? (["harbour", "garden"].includes(selected) ? "ready" : "forbidden") : "choose_practice",
    practices: [{ practice_id: "harbour", display_name: "Harbour & Pine Events", role: "lead_planner", membership_revision: 1 },
      { practice_id: "garden", display_name: "Garden Gatherings", role: "lead_planner", membership_revision: 1 }],
    selected_practice_id: ["harbour", "garden"].includes(selected || "") ? selected : null,
    clients, generated_at: "2026-10-27T00:00:00Z",
    next_action: clients.length ? { component: "practice_next_action", plan: clients[0].summary.plan,
      client_label: clients[0].summary.client_label, action: clients[0].summary.next_action!, due_at: clients[0].summary.next_action_due_at, owner_account_id: "planner" } : null,
  };
}
