import { For } from "solid-js";
import type { QuotationClarificationState } from "@/lib/quotationClarificationState";

export type QuotationClarificationCardProps = {
  state: QuotationClarificationState;
  onQuestionChange: (factKey: string, value: string) => void;
  onRecipientChange?: (value: string) => void;
  onSubjectChange?: (value: string) => void;
  onRequestApproval: () => void;
  onSend: () => void;
};

export default function QuotationClarificationCard(props: QuotationClarificationCardProps) {
  const sending = () => props.state.status === "sending";
  return (
    <article aria-labelledby="quotation-clarification-title" class="w-full max-w-2xl space-y-4 rounded-2xl border bg-white p-4 shadow-sm">
      <header>
        <h2 id="quotation-clarification-title" class="text-lg font-semibold">Clarify this quotation</h2>
        <p class="text-sm text-slate-600">Review these questions before anything is sent to {props.state.draft.recipient}.</p>
      </header>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block text-sm font-medium">
          Recipient
          <input
            type="email"
            value={props.state.draft.recipient}
            disabled={sending()}
            onInput={(event) => props.onRecipientChange?.(event.currentTarget.value)}
            class="mt-1 min-h-11 w-full rounded-lg border px-3"
          />
        </label>
        <label class="block text-sm font-medium">
          Subject
          <input
            value={props.state.draft.subject}
            disabled={sending()}
            onInput={(event) => props.onSubjectChange?.(event.currentTarget.value)}
            class="mt-1 min-h-11 w-full rounded-lg border px-3"
          />
        </label>
      </div>
      <div class="space-y-3">
        <For each={props.state.draft.questions}>{(question, index) => (
          <label class="block text-sm font-medium">
            Question {index() + 1}
            <textarea
              value={question.question}
              disabled={sending()}
              onInput={(event) => props.onQuestionChange(question.fact_key, event.currentTarget.value)}
              class="mt-1 min-h-24 w-full rounded-lg border p-3"
              aria-describedby={props.state.error ? "quotation-clarification-error" : undefined}
            />
          </label>
        )}</For>
      </div>
      {props.state.error ? <p id="quotation-clarification-error" role="alert" class="text-sm text-red-700">{props.state.error}</p> : null}
      <div class="flex flex-wrap gap-2">
        <button type="button" disabled={sending()} onClick={props.onRequestApproval} class="min-h-11 rounded-lg border px-4 disabled:opacity-50">Review approval</button>
        <button type="button" disabled={sending() || props.state.status !== "approval_required"} onClick={props.onSend} class="min-h-11 rounded-lg bg-slate-900 px-4 text-white disabled:opacity-50">Send approved questions</button>
      </div>
    </article>
  );
}
