import { For, Show, createSignal } from "solid-js";
import type { AfpMessage, AfpView } from "@/lib/api";
import { apiFetch } from "@/lib/api";

type ApprovalItem = {
  messageId: string;
  threadId: string;
  actionType: string;
  title: string;
  summary: string;
  status: "pending" | "approved" | "rejected" | string;
  requestedBy: string;
};

/**
 * Renders pending agent actions that require human approval.
 * Agents set `views: [{format:"approvals", content:{items:[...]}}]`.
 * Decisions are posted to POST /actions/decision.
 */
export function ApprovalsRenderer(props: { message: AfpMessage; view?: AfpView }) {
  const rawContent = () => props.view?.content ?? props.message.content;

  const items = (): ApprovalItem[] => {
    const raw = rawContent().items;
    if (Array.isArray(raw)) return raw as ApprovalItem[];
    // Treat the message itself as a single approval item
    return [
      {
        messageId: props.message.id,
        threadId: props.message.thread_id,
        actionType: props.message.type,
        title:
          (rawContent().title as string | undefined) ??
          (rawContent().subject as string | undefined) ??
          props.message.type,
        summary:
          (rawContent().summary as string | undefined) ??
          (rawContent().body as string | undefined) ??
          "Agent action awaiting review.",
        status: (rawContent().status as string | undefined) ?? "pending",
        requestedBy: props.message.from
      }
    ];
  };

  return (
    <div class="space-y-2">
      <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">
        Approval required · {props.message.from}
      </p>
      <For each={items()}>
        {(item) => <ApprovalCard item={item} />}
      </For>
    </div>
  );
}

function ApprovalCard(props: { item: ApprovalItem }) {
  const [status, setStatus] = createSignal(props.item.status);
  const [busy, setBusy] = createSignal(false);
  const [feedback, setFeedback] = createSignal("");

  async function decide(decision: "approved" | "rejected") {
    setBusy(true);
    try {
      await apiFetch("/actions/decision", {
        method: "POST",
        bodyJson: {
          thread_id: props.item.threadId,
          target_message_id: props.item.messageId,
          decision
        }
      });
      setStatus(decision);
      setFeedback(decision === "approved" ? "Approved and queued for execution." : "Rejected.");
    } catch (err) {
      setFeedback((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const statusColor = () => {
    if (status() === "approved") return "bg-green-500/20 text-green-700 border-green-500/30";
    if (status() === "rejected") return "bg-error/10 text-error border-error/20";
    return "bg-amber-400/20 text-amber-700 border-amber-400/30";
  };

  return (
    <div class="rounded-2xl border border-white/30 bg-white/20 px-4 py-3">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="truncate font-medium text-on-surface">{props.item.title}</p>
          <p class="mt-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-outline">
            {props.item.actionType} · {props.item.requestedBy}
          </p>
        </div>
        <span
          class={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${statusColor()}`}
        >
          {status()}
        </span>
      </div>
      <p class="mt-2 text-sm leading-6 text-on-surface-variant">{props.item.summary}</p>
      <Show when={status() === "pending"}>
        <div class="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy()}
            onClick={() => void decide("approved")}
            class="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy()}
            onClick={() => void decide("rejected")}
            class="rounded-xl border border-outline-variant bg-surface px-4 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-low disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </Show>
      <Show when={feedback()}>
        <p class="mt-2 text-xs text-on-surface-variant">{feedback()}</p>
      </Show>
    </div>
  );
}
