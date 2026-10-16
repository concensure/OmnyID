import { createEffect, onCleanup } from "solid-js";
import QuotationSourcePreview from "@/components/QuotationSourcePreview";

export type QuotationEvidenceDrawerProps = {
  open: boolean;
  title: string;
  excerpt: string;
  locatorLabel: string;
  sourceAvailable: boolean;
  onClose: () => void;
  returnFocus?: HTMLElement | null;
};

export default function QuotationEvidenceDrawer(props: QuotationEvidenceDrawerProps) {
  let closeButton: HTMLButtonElement | undefined;
  let wasOpen = false;
  createEffect(() => {
    if (props.open) {
      closeButton?.focus();
    } else if (wasOpen) {
      props.returnFocus?.focus();
    }
    wasOpen = props.open;
  });
  onCleanup(() => {
    if (wasOpen) props.returnFocus?.focus();
  });

  return props.open ? (
    <aside role="dialog" aria-modal="true" aria-labelledby="quotation-evidence-title" class="fixed inset-0 z-50 overflow-auto bg-white p-4 sm:inset-y-0 sm:left-auto sm:w-[30rem] sm:shadow-xl">
      <div class="mb-4 flex items-center justify-between gap-3">
        <h2 id="quotation-evidence-title" class="text-lg font-semibold">{props.title}</h2>
        <button ref={closeButton} type="button" onClick={props.onClose} class="min-h-11 min-w-11 rounded-lg border px-3" aria-label="Close source evidence">Close</button>
      </div>
      <QuotationSourcePreview excerpt={props.excerpt} locatorLabel={props.locatorLabel} sourceAvailable={props.sourceAvailable} />
    </aside>
  ) : null;
}
