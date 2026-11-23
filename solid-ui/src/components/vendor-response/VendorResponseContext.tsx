import { For } from "solid-js";
import { normalizeA2UIRootNodes } from "../../lib/a2uiContentState";
import { humanizeIdentifier, safeProjectionFieldEntries } from "../../lib/quotationResponseFormState";
import type { VendorContextProjection } from "../../lib/quotationResponseSessionApi";

function displayValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record.amount_minor === "number" && typeof record.currency === "string") {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: record.currency })
        .format(record.amount_minor / 100);
    }
  }
  return JSON.stringify(value);
}

export function vendorContextA2UI(projection: VendorContextProjection): Record<string, unknown> {
  return {
    schema_version: "a2ui.v1",
    kind: "panel",
    components: [
      ...safeProjectionFieldEntries(projection.fields)
        .map(([key, value], index) => ({
          id: `approved-field-${index}`,
          type: "stat_row",
          props: { label: humanizeIdentifier(key), value: displayValue(value), helper: "Approved context" },
        })),
      {
        id: "review-boundary",
        type: "callout",
        props: {
          tone: "info", title: "Review comes next",
          body: "Submitting sends these facts to the requester for review. It does not accept a contract, book a service, or make a payment.",
        },
      },
    ],
  };
}

export default function VendorResponseContext(props: { projection: VendorContextProjection }) {
  const nodes = () => normalizeA2UIRootNodes(vendorContextA2UI(props.projection));
  return (
    <section class="qr-card" aria-labelledby="approved-context-title">
      <p class="qr-eyebrow">Shared with you</p>
      <h2 id="approved-context-title">Approved request context</h2>
      <div class="qr-context-list">
        <For each={nodes()}>{(node) => node.type === "stat_row" ? (
          <dl class="qr-stat-row" data-a2ui-type="stat_row">
            <div><dt>{String(node.props.label ?? "Field")}</dt><dd>{String(node.props.value ?? "")}</dd></div>
            <small>{String(node.props.helper ?? "")}</small>
          </dl>
        ) : (
          <aside class="qr-callout" data-a2ui-type="callout">
            <strong>{String(node.props.title ?? "Note")}</strong>
            <p>{String(node.props.body ?? "")}</p>
          </aside>
        )}</For>
      </div>
    </section>
  );
}
