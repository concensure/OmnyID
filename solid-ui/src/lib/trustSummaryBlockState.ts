// @locs-version: 1.0
export type TrustSummaryBlockItem = {
  title: string;
  summary: string;
  containerClass: string;
  titleClass: string;
  summaryClass: string;
};

// Colors are tuned for the light/white card backgrounds these blocks actually render
// on in the wedding response queue and elsewhere â€” dark, saturated -800/-900/-950 text
// on a solid -50 fill and a -200 border, not the pale -100/-200 translucent tokens this
// used before (those read fine on a dark backdrop but fail WCAG AA on white and were
// reported as "near-invisible text"). font-semibold on the label offsets its small size.
const TRUST_SUMMARY_ITEMS = {
  boundedReason: {
    title: "Why Now",
    containerClass: "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2",
    titleClass: "text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-emerald-800",
    summaryClass: "mt-1 text-xs leading-5 text-emerald-950",
  },
  selectionReason: {
    title: "Selection Reason",
    containerClass: "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2",
    titleClass: "text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-emerald-800",
    summaryClass: "mt-1 text-xs leading-5 text-emerald-950",
  },
  consequencePreview: {
    title: "Consequence Preview",
    containerClass: "rounded-lg border border-sky-200 bg-sky-50 px-3 py-2",
    titleClass: "text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-sky-800",
    summaryClass: "mt-1 text-xs leading-5 text-sky-950",
  },
  provenanceCue: {
    title: "Provenance",
    containerClass: "rounded-lg border border-slate-200 bg-slate-50 px-3 py-2",
    titleClass: "text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-slate-600",
    summaryClass: "mt-1 text-xs leading-5 text-slate-800",
  },
  sourceSummary: {
    title: "Sources",
    containerClass: "rounded-lg border border-slate-200 bg-slate-50 px-3 py-2",
    titleClass: "text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-slate-600",
    summaryClass: "mt-1 text-xs leading-5 text-slate-800",
  },
  previewBoundarySummary: {
    title: "Preview Boundary",
    containerClass: "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2",
    titleClass: "text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-amber-800",
    summaryClass: "mt-1 text-xs leading-5 text-amber-950",
  },
  autonomySummary: {
    title: "Action Boundary",
    containerClass: "rounded-lg border border-slate-200 bg-slate-50 px-3 py-2",
    titleClass: "text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-slate-600",
    summaryClass: "mt-1 text-xs leading-5 text-slate-800",
  },
  confidence: {
    title: "Confidence",
    containerClass: "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2",
    titleClass: "text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-amber-800",
    summaryClass: "mt-1 text-xs leading-5 text-amber-950",
  },
} as const;

export type TrustSummaryBlockInput = {
  boundedReason?: string | null;
  selectionReason?: string | null;
  showSelectionReason?: boolean;
  consequencePreview?: string | null;
  provenanceCue?: string | null;
  sourceSummary?: string | null;
  previewBoundarySummary?: string | null;
  autonomySummary?: string | null;
  confidence?: string | null;
  blockContainerClass?: string | null;
  blockTitleClass?: string | null;
  blockSummaryClass?: string | null;
};

function joinClasses(...values: Array<string | null | undefined>): string {
  return values.filter((value): value is string => Boolean(value && value.trim())).join(" ");
}

function compactConfidenceSummary(confidence?: string | null): string | null {
  const trimmed = confidence?.trim() ?? "";
  if (!trimmed) return null;
  return /confidence/i.test(trimmed) ? trimmed : `${trimmed} confidence`;
}

export function trustSummaryBlockItems(props: TrustSummaryBlockInput): TrustSummaryBlockItem[] {
  const items: TrustSummaryBlockItem[] = [];
  const blockContainerClass = props.blockContainerClass?.trim() ?? "";
  const blockTitleClass = props.blockTitleClass?.trim() ?? "";
  const blockSummaryClass = props.blockSummaryClass?.trim() ?? "";

  if (props.boundedReason) {
    items.push({
      title: TRUST_SUMMARY_ITEMS.boundedReason.title,
      summary: props.boundedReason,
      containerClass: joinClasses(
        TRUST_SUMMARY_ITEMS.boundedReason.containerClass,
        blockContainerClass,
      ),
      titleClass: joinClasses(TRUST_SUMMARY_ITEMS.boundedReason.titleClass, blockTitleClass),
      summaryClass: joinClasses(
        TRUST_SUMMARY_ITEMS.boundedReason.summaryClass,
        blockSummaryClass,
      ),
    });
  }

  if (props.showSelectionReason && props.selectionReason) {
    items.push({
      title: TRUST_SUMMARY_ITEMS.selectionReason.title,
      summary: props.selectionReason,
      containerClass: joinClasses(
        TRUST_SUMMARY_ITEMS.selectionReason.containerClass,
        blockContainerClass,
      ),
      titleClass: joinClasses(TRUST_SUMMARY_ITEMS.selectionReason.titleClass, blockTitleClass),
      summaryClass: joinClasses(
        TRUST_SUMMARY_ITEMS.selectionReason.summaryClass,
        blockSummaryClass,
      ),
    });
  }

  if (props.consequencePreview) {
    items.push({
      title: TRUST_SUMMARY_ITEMS.consequencePreview.title,
      summary: props.consequencePreview,
      containerClass: joinClasses(
        TRUST_SUMMARY_ITEMS.consequencePreview.containerClass,
        blockContainerClass,
      ),
      titleClass: joinClasses(
        TRUST_SUMMARY_ITEMS.consequencePreview.titleClass,
        blockTitleClass,
      ),
      summaryClass: joinClasses(
        TRUST_SUMMARY_ITEMS.consequencePreview.summaryClass,
        blockSummaryClass,
      ),
    });
  }

  if (props.provenanceCue) {
    items.push({
      title: TRUST_SUMMARY_ITEMS.provenanceCue.title,
      summary: props.provenanceCue,
      containerClass: joinClasses(
        TRUST_SUMMARY_ITEMS.provenanceCue.containerClass,
        blockContainerClass,
      ),
      titleClass: joinClasses(TRUST_SUMMARY_ITEMS.provenanceCue.titleClass, blockTitleClass),
      summaryClass: joinClasses(
        TRUST_SUMMARY_ITEMS.provenanceCue.summaryClass,
        blockSummaryClass,
      ),
    });
  }

  if (props.sourceSummary) {
    items.push({
      title: TRUST_SUMMARY_ITEMS.sourceSummary.title,
      summary: props.sourceSummary,
      containerClass: joinClasses(
        TRUST_SUMMARY_ITEMS.sourceSummary.containerClass,
        blockContainerClass,
      ),
      titleClass: joinClasses(TRUST_SUMMARY_ITEMS.sourceSummary.titleClass, blockTitleClass),
      summaryClass: joinClasses(
        TRUST_SUMMARY_ITEMS.sourceSummary.summaryClass,
        blockSummaryClass,
      ),
    });
  }

  if (props.previewBoundarySummary) {
    items.push({
      title: TRUST_SUMMARY_ITEMS.previewBoundarySummary.title,
      summary: props.previewBoundarySummary,
      containerClass: joinClasses(
        TRUST_SUMMARY_ITEMS.previewBoundarySummary.containerClass,
        blockContainerClass,
      ),
      titleClass: joinClasses(
        TRUST_SUMMARY_ITEMS.previewBoundarySummary.titleClass,
        blockTitleClass,
      ),
      summaryClass: joinClasses(
        TRUST_SUMMARY_ITEMS.previewBoundarySummary.summaryClass,
        blockSummaryClass,
      ),
    });
  }

  if (props.autonomySummary) {
    items.push({
      title: TRUST_SUMMARY_ITEMS.autonomySummary.title,
      summary: props.autonomySummary,
      containerClass: joinClasses(
        TRUST_SUMMARY_ITEMS.autonomySummary.containerClass,
        blockContainerClass,
      ),
      titleClass: joinClasses(TRUST_SUMMARY_ITEMS.autonomySummary.titleClass, blockTitleClass),
      summaryClass: joinClasses(
        TRUST_SUMMARY_ITEMS.autonomySummary.summaryClass,
        blockSummaryClass,
      ),
    });
  }

  const confidenceSummary = compactConfidenceSummary(props.confidence);
  if (confidenceSummary) {
    items.push({
      title: TRUST_SUMMARY_ITEMS.confidence.title,
      summary: confidenceSummary,
      containerClass: joinClasses(
        TRUST_SUMMARY_ITEMS.confidence.containerClass,
        blockContainerClass,
      ),
      titleClass: joinClasses(TRUST_SUMMARY_ITEMS.confidence.titleClass, blockTitleClass),
      summaryClass: joinClasses(
        TRUST_SUMMARY_ITEMS.confidence.summaryClass,
        blockSummaryClass,
      ),
    });
  }

  return items;
}
