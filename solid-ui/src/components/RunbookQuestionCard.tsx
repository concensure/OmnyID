import { createSignal, createUniqueId, For, Show } from "solid-js";
import { runbookAnswerPayload, type RunbookActivity, type RunbookQuestion } from "@/lib/runbookState";

export function RunbookQuestionCard(props: {
  activity: RunbookActivity; question: RunbookQuestion; busy: boolean;
  onAnswer: (payload: ReturnType<typeof runbookAnswerPayload>) => Promise<void>;
}) {
  const id = createUniqueId();
  const [values, setValues] = createSignal<Record<string, string>>({});
  const [error, setError] = createSignal("");
  async function submit(event: SubmitEvent) {
    event.preventDefault(); setError("");
    try {
      const payload = runbookAnswerPayload(props.activity, props.question, values(), crypto.randomUUID());
      await props.onAnswer(payload);
      setValues({});
    } catch { setError("Your answer was not saved. Check the fields and refresh if this question has changed."); }
  }
  return <form class="min-w-0 space-y-3 rounded-xl border border-slate-300 bg-white p-3 text-slate-900"
    aria-labelledby={id} onSubmit={submit}>
    <h3 id={id} class="break-words font-semibold">{props.question.question}</h3>
    <p class="break-words text-sm">{props.question.why_needed}</p>
    <p class="text-sm">Answer needed by {new Date(props.question.expires_at).toLocaleString()}.</p>
    <For each={props.question.missing_fields}>{(field, index) => {
      const inputId = `${id}-${index()}`;
      return <div class="min-w-0">
        <label for={inputId} class="block break-words text-sm font-medium">{field.replaceAll("_", " ")}</label>
        <Show when={props.question.answer_schema === "boolean"} fallback={
          <input id={inputId} required disabled={props.busy} maxLength={512}
            class="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-400 bg-white px-3 text-slate-900 focus-visible:outline focus-visible:outline-2"
            type={props.question.answer_schema === "date" ? "date" : props.question.answer_schema === "non_negative_number" ? "number" : "text"}
            min={props.question.answer_schema === "non_negative_number" ? "0" : undefined} step="any"
            value={values()[field] ?? ""} onInput={e => setValues(v => ({ ...v, [field]: e.currentTarget.value }))} />
        }>
          <select id={inputId} required disabled={props.busy} class="mt-1 min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3"
            value={values()[field] ?? ""} onChange={e => setValues(v => ({ ...v, [field]: e.currentTarget.value }))}>
            <option value="">Choose an answer</option><option value="true">Yes</option><option value="false">No</option>
          </select>
        </Show>
      </div>;
    }}</For>
    <details class="break-all text-sm"><summary class="min-h-11 cursor-pointer py-2">Evidence already checked</summary>
      <Show when={props.question.attempted_refs.length} fallback={<p>No source records were available.</p>}>
        <ul class="list-inside list-disc"><For each={props.question.attempted_refs}>{ref => <li>{ref}</li>}</For></ul>
      </Show>
    </details>
    <p class="text-sm">Saving supplies information to this step. It does not approve sending, spending or publishing.</p>
    <Show when={error()}><p role="alert" class="text-sm text-red-800">{error()}</p></Show>
    <button type="submit" disabled={props.busy} class="min-h-11 rounded-lg bg-slate-900 px-4 text-white disabled:opacity-60">
      {props.busy ? "Saving answer…" : "Save answer to this step"}
    </button>
  </form>;
}
