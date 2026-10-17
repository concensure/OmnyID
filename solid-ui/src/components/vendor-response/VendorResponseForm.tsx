import { For, Show, createMemo } from "solid-js";
import type { FormIssue, QuotationResponseFormState } from "../../lib/quotationResponseFormState";
import {
  buildQuotationResponseSubmission, humanizeIdentifier, responsePreviewLines,
  safeProjectionFieldEntries,
} from "../../lib/quotationResponseFormState";
import type { VendorContextProjection } from "../../lib/quotationResponseSessionApi";

type Props = {
  projection: VendorContextProjection;
  state: QuotationResponseFormState;
  issues: FormIssue[];
  submitting: boolean;
  onChange: (next: QuotationResponseFormState) => void;
  onSubmit: () => void;
};

export default function VendorResponseForm(props: Props) {
  const patch = (values: Partial<QuotationResponseFormState>) => props.onChange({ ...props.state, ...values });
  const issue = (field: string) => props.issues.find((item) => item.field === field)?.message;
  const preview = createMemo(() => responsePreviewLines(buildQuotationResponseSubmission(props.state, props.projection)));
  const canRevise = () => props.projection.allowed_actions.includes("submit_revision");

  return (
    <form class="qr-card qr-form" onSubmit={(event) => { event.preventDefault(); props.onSubmit(); }} novalidate>
      <p class="qr-eyebrow">Your response</p>
      <h2>Answer the approved request</h2>
      <Show when={props.issues.length > 0}>
        <div class="qr-error-summary" role="alert" aria-labelledby="response-error-title">
          <strong id="response-error-title">Check your response</strong>
          <ul><For each={props.issues}>{(item) => <li><a href={`#${item.field}`}>{item.message}</a></li>}</For></ul>
        </div>
      </Show>

      <fieldset>
        <legend>Questions</legend>
        <For each={props.projection.question_ids} fallback={<p class="qr-muted">There are no separate questions on this request.</p>}>
          {(questionId) => {
            const answer = () => props.state.answers[questionId] ?? { state: "unknown" as const, answer: "" };
            const fieldId = `question-${questionId}`;
            return (
              <div class="qr-field-group">
                <label for={`${fieldId}-state`}>{humanizeIdentifier(questionId)}</label>
                <select id={`${fieldId}-state`} value={answer().state} onInput={(event) => {
                  const state = event.currentTarget.value as "confirmed" | "proposed" | "unknown";
                  patch({ answers: { ...props.state.answers, [questionId]: { ...answer(), state, ...(state === "unknown" ? { answer: "" } : {}) } } });
                }}>
                  <option value="unknown">Unknown</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="proposed">Proposed / conditional</option>
                </select>
                <Show when={answer().state !== "unknown"}>
                  <textarea id={fieldId} rows="3" maxlength="4000" value={answer().answer}
                    aria-invalid={Boolean(issue(fieldId))} aria-describedby={issue(fieldId) ? `${fieldId}-error` : undefined}
                    placeholder="Answer only this approved question"
                    onInput={(event) => patch({ answers: { ...props.state.answers, [questionId]: { ...answer(), answer: event.currentTarget.value } } })} />
                  <Show when={issue(fieldId)}><small class="qr-field-error" id={`${fieldId}-error`}>{issue(fieldId)}</small></Show>
                </Show>
              </div>
            );
          }}
        </For>
      </fieldset>

      <fieldset>
        <legend>Availability</legend>
        <div class="qr-grid-two">
          <div><label for="availability">Status</label><select id="availability" value={props.state.availability}
            onInput={(event) => patch({ availability: event.currentTarget.value as QuotationResponseFormState["availability"] })}>
            <option value="unknown">Unknown</option><option value="available">Available</option>
            <option value="conditional">Conditionally available</option><option value="unavailable">Unavailable</option>
          </select></div>
          <div><label for="availability-date">From date (optional)</label><input id="availability-date" type="date"
            value={props.state.availabilityDate} aria-invalid={Boolean(issue("availability-date"))}
            onInput={(event) => patch({ availabilityDate: event.currentTarget.value })} /></div>
        </div>
        <label for="availability-notes">Availability notes (optional)</label>
        <textarea id="availability-notes" rows="2" maxlength="2000" value={props.state.availabilityNotes}
          onInput={(event) => patch({ availabilityNotes: event.currentTarget.value })} />
      </fieldset>

      <Show when={canRevise()}>
        <fieldset>
          <legend>Package or quote change</legend>
          <label class="qr-check" for="commercial-enabled"><input id="commercial-enabled" type="checkbox"
            checked={props.state.commercialEnabled} onChange={(event) => patch({ commercialEnabled: event.currentTarget.checked })} />
            <span>Propose a structured change</span></label>
          <Show when={props.state.commercialEnabled}>
            <div class="qr-grid-two">
              <div><label for="commercial-key">Approved field</label><select id="commercial-key" value={props.state.commercialKey}
                onInput={(event) => patch({ commercialKey: event.currentTarget.value })}>
                <For each={safeProjectionFieldEntries(props.projection.fields)}>{([key]) => <option value={key}>{humanizeIdentifier(key)}</option>}</For>
              </select></div>
              <div><label for="commercial-fact">Approved fact reference</label><select id="commercial-fact" value={props.state.commercialFactId}
                onInput={(event) => patch({ commercialFactId: event.currentTarget.value })}>
                <For each={props.projection.fact_ids}>{(id) => <option value={id}>{humanizeIdentifier(id)}</option>}</For>
              </select></div>
              <div><label for="commercial-kind">Value type</label><select id="commercial-kind" value={props.state.commercialKind}
                onInput={(event) => patch({ commercialKind: event.currentTarget.value as QuotationResponseFormState["commercialKind"], commercialValue: "" })}>
                <option value="money">Amount</option><option value="date">Date</option><option value="inclusion">Inclusion</option>
                <option value="integer">Quantity</option><option value="boolean">Yes / no</option><option value="text">Text</option>
              </select></div>
              <Show when={props.state.commercialKind === "money"}><div><label for="commercial-currency">Currency</label>
                <input id="commercial-currency" maxlength="3" value={props.state.currency} onInput={(event) => patch({ currency: event.currentTarget.value.toUpperCase() })} /></div></Show>
            </div>
            <label for="commercial-value">Proposed value</label>
            <Show when={props.state.commercialKind === "boolean"} fallback={
              <Show when={props.state.commercialKind === "inclusion"} fallback={
                <input id="commercial-value" type={props.state.commercialKind === "date" ? "date" : props.state.commercialKind === "money" || props.state.commercialKind === "integer" ? "number" : "text"}
                  min={props.state.commercialKind === "money" ? "0" : undefined} step={props.state.commercialKind === "money" ? "0.01" : props.state.commercialKind === "integer" ? "1" : undefined}
                  value={props.state.commercialValue} aria-invalid={Boolean(issue("commercial-value"))}
                  onInput={(event) => patch({ commercialValue: event.currentTarget.value })} />
              }><select id="commercial-value" value={props.state.commercialValue} onInput={(event) => patch({ commercialValue: event.currentTarget.value })}>
                <option value="">Choose</option><option value="included">Included</option><option value="excluded">Excluded</option>
                <option value="optional">Optional</option><option value="unknown">Unknown</option>
              </select></Show>
            }><select id="commercial-value" value={props.state.commercialValue} onInput={(event) => patch({ commercialValue: event.currentTarget.value })}>
              <option value="">Choose</option><option value="true">Yes</option><option value="false">No</option>
            </select></Show>
            <Show when={issue("commercial-value")}><small class="qr-field-error">{issue("commercial-value")}</small></Show>
          </Show>
        </fieldset>
      </Show>

      <label for="explanation">Additional explanation (optional)</label>
      <textarea id="explanation" rows="4" maxlength="4000" value={props.state.explanation}
        onInput={(event) => patch({ explanation: event.currentTarget.value })} />

      <details class="qr-preview"><summary>Preview exactly what will be submitted</summary>
        <ul><For each={preview()}>{(line) => <li>{line}</li>}</For></ul>
        <p>No contract acceptance, booking, payment, or competitor information is included.</p>
      </details>

      <label class="qr-check" for="affirmed"><input id="affirmed" type="checkbox" checked={props.state.affirmed}
        aria-invalid={Boolean(issue("affirmed"))} onChange={(event) => patch({ affirmed: event.currentTarget.checked })} />
        <span>I confirm this response is accurate to the best of my knowledge.</span></label>
      <Show when={issue("affirmed")}><small class="qr-field-error">{issue("affirmed")}</small></Show>
      <button class="qr-primary" type="submit" disabled={props.submitting}>{props.submitting ? "Submitting…" : "Submit response"}</button>
    </form>
  );
}
