// @locs-version: 1.0
import UsageExternalToolOverviewGrid from "@/components/UsageExternalToolOverviewGrid";
import type { UsageExternalToolOverviewGridProps } from "@/components/UsageExternalToolOverviewGrid";
import UsageExternalToolSummaryPanels from "@/components/UsageExternalToolSummaryPanels";
import type { UsageExternalToolSummaryPanelsProps } from "@/components/UsageExternalToolSummaryPanels";
import UsageExternalToolUsagePanels from "@/components/UsageExternalToolUsagePanels";
import type { UsageExternalToolUsagePanelsProps } from "@/components/UsageExternalToolUsagePanels";
import UsageExternalToolCostTrustPanel from "@/components/UsageExternalToolCostTrustPanel";
import type {
  AdminThirdPartyToolPolicyState,
  AdminThirdPartyToolScope,
} from "@/lib/adminThirdPartyToolPolicyState";

type UsageExternalToolBillingSectionProps = {
  intro: string;
  estimatedToolSpendLabel: string;
  estimateDetail: string;
  overviewCards: UsageExternalToolOverviewGridProps["cards"];
  categoryCards: UsageExternalToolSummaryPanelsProps["categoryCards"];
  categoryEmptyState: UsageExternalToolSummaryPanelsProps["categoryEmptyState"];
  connectionCards: UsageExternalToolSummaryPanelsProps["connectionCards"];
  connectionEmptyState: UsageExternalToolSummaryPanelsProps["connectionEmptyState"];
  connectedLineItemsEmptyState: string;
  connectedLineItems: UsageExternalToolUsagePanelsProps["lineItems"];
  connectedUsageEmptyState: string;
  connectedUsageEvents: UsageExternalToolUsagePanelsProps["usageEvents"];
  builtInLineItemsEmptyState: string;
  builtInLineItems: UsageExternalToolUsagePanelsProps["lineItems"];
  builtInUsageEmptyState: string;
  builtInUsageEvents: UsageExternalToolUsagePanelsProps["usageEvents"];
  costTrustPanel: {
    heading: string;
    detail: string;
    coverageTitle: string;
    coverageItems: string[];
    caveatsTitle: string;
    caveatItems: string[];
  };
  adminThirdPartyToolPolicy?: AdminThirdPartyToolPolicyState | null;
  onToggleAdminThirdPartyTool?: (toolId: string, scope: AdminThirdPartyToolScope, enabled: boolean) => void;
  adminThirdPartyToolPolicyNotice?: string | null;
  adminThirdPartyToolPolicyError?: string | null;
  adminThirdPartyToolPolicyBusyKey?: string | null;
};

export default function UsageExternalToolBillingSection(props: UsageExternalToolBillingSectionProps) {
  return (
    <>
      <div class="mt-4 rounded-2xl border border-white/30 bg-white/15 p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-on-surface">External tools and provider billing</p>
            <p class="mt-1 text-xs leading-6 text-on-surface-variant">{props.intro}</p>
          </div>
          <div class="rounded-xl border border-sky-300/35 bg-sky-50/50 px-3 py-2 text-right">
            <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-900">Estimated tool spend</p>
            <p class="mt-1 text-lg font-semibold text-sky-950">{props.estimatedToolSpendLabel}</p>
            <p class="mt-1 text-[11px] text-sky-900/80">{props.estimateDetail}</p>
          </div>
        </div>

        <UsageExternalToolOverviewGrid cards={props.overviewCards} />

        <UsageExternalToolSummaryPanels
          categoryCards={props.categoryCards}
          categoryEmptyState={props.categoryEmptyState}
          connectionCards={props.connectionCards}
          connectionEmptyState={props.connectionEmptyState}
        />

        {props.adminThirdPartyToolPolicy ? (
          <div class="mt-4 rounded-2xl border border-indigo-300/30 bg-indigo-50/45 p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-indigo-950">Admin shared tools</p>
                <p class="mt-1 text-xs leading-6 text-indigo-950/75">
                  Enable provider tools for everyone, or only for wedding planner work. Usage remains metered per user and in total.
                </p>
                {props.adminThirdPartyToolPolicyNotice ? (
                  <p class="mt-2 rounded-lg border border-emerald-300/50 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-950">
                    {props.adminThirdPartyToolPolicyNotice}
                  </p>
                ) : null}
                {props.adminThirdPartyToolPolicyError ? (
                  <p class="mt-2 rounded-lg border border-amber-300/50 bg-amber-50 px-2 py-1.5 text-xs text-amber-950">
                    {props.adminThirdPartyToolPolicyError}
                  </p>
                ) : null}
              </div>
              <div class="rounded-xl border border-indigo-300/40 bg-white/65 px-3 py-2 text-right">
                <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-900">Shared spend</p>
                <p class="mt-1 text-lg font-semibold text-indigo-950">{props.adminThirdPartyToolPolicy.overallCostLabel}</p>
                <p class="mt-1 text-[11px] text-indigo-900/75">{props.adminThirdPartyToolPolicy.summary}</p>
                <p class="mt-1 text-[11px] text-indigo-900/75">Source: {props.adminThirdPartyToolPolicy.sourceLabel}</p>
              </div>
            </div>
            <div class="mt-3 grid gap-3 lg:grid-cols-2">
              {props.adminThirdPartyToolPolicy.rows.map((row) => (
                <div class="rounded-xl border border-indigo-200/70 bg-white/70 p-3">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="text-sm font-semibold text-indigo-950">{row.label}</p>
                      <p class="mt-1 text-xs leading-5 text-indigo-950/70">{row.use}</p>
                    </div>
                    <span class="rounded-full border border-indigo-300/50 bg-indigo-100/70 px-2 py-1 text-[11px] font-medium text-indigo-950">
                      {row.statusLabel}
                    </span>
                  </div>
                  <div class="mt-3 grid gap-2 text-xs text-indigo-950/75 sm:grid-cols-3">
                    <p><span class="font-semibold text-indigo-950">Usage:</span> {row.monthToDateUsageLabel}</p>
                    <p><span class="font-semibold text-indigo-950">Cost:</span> {row.monthToDateCostLabel}</p>
                    <p><span class="font-semibold text-indigo-950">Quota:</span> {row.quotaLabel}</p>
                  </div>
                  <p class="mt-2 rounded-lg border border-indigo-200/70 bg-indigo-50/65 px-2 py-1.5 text-xs text-indigo-950/80">
                    <span class="font-semibold text-indigo-950">{row.meteringStatusLabel}:</span> {row.meteringDetailLabel}
                  </p>
                  <p class="mt-2 rounded-lg border border-indigo-200/70 bg-white/65 px-2 py-1.5 text-xs text-indigo-950/75">
                    <span class="font-semibold text-indigo-950">{row.usageEventSourceLabel}</span> · {row.usageMetadataLabel}
                  </p>
                  <p class="mt-2 rounded-lg border border-indigo-200/70 bg-white/65 px-2 py-1.5 text-xs text-indigo-950/75">
                    <span class="font-semibold text-indigo-950">Wedding scope:</span> {row.weddingScopeProofLabel}
                  </p>
                  {row.warningLabel ? (
                    <p class="mt-2 rounded-lg border border-amber-300/50 bg-amber-50 px-2 py-1.5 text-xs text-amber-950">
                      {row.warningLabel}
                    </p>
                  ) : null}
                  <div class="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={props.adminThirdPartyToolPolicyBusyKey === `${row.toolId}:all_users`}
                      class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        row.enabledForAllUsers
                          ? "border-emerald-300/70 bg-emerald-100 text-emerald-950"
                          : "border-indigo-300/50 bg-white/70 text-indigo-950 hover:bg-indigo-100/60"
                      }`}
                      onClick={() => props.onToggleAdminThirdPartyTool?.(row.toolId, "all_users", !row.enabledForAllUsers)}
                    >
                      {row.enabledForAllUsers ? "All users on" : "Enable for all users"}
                    </button>
                    <button
                      type="button"
                      disabled={props.adminThirdPartyToolPolicyBusyKey === `${row.toolId}:wedding_template`}
                      class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        row.enabledForWeddingTemplate
                          ? "border-emerald-300/70 bg-emerald-100 text-emerald-950"
                          : "border-indigo-300/50 bg-white/70 text-indigo-950 hover:bg-indigo-100/60"
                      }`}
                      onClick={() => props.onToggleAdminThirdPartyTool?.(row.toolId, "wedding_template", !row.enabledForWeddingTemplate)}
                    >
                      {row.enabledForWeddingTemplate ? "Wedding only on" : "Enable for wedding only"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <ul class="mt-3 space-y-1 text-xs text-indigo-950/70">
              {props.adminThirdPartyToolPolicy.guardrails.map((guardrail) => <li>{guardrail}</li>)}
            </ul>
          </div>
        ) : null}

        <UsageExternalToolUsagePanels
          lineItemsTitle="Connected provider line items"
          lineItemsEmptyState={props.connectedLineItemsEmptyState}
          lineItems={props.connectedLineItems}
          lineItemPrimaryHeader="Tool"
          usageTitle="Connected provider usage"
          usageEmptyState={props.connectedUsageEmptyState}
          usageEvents={props.connectedUsageEvents}
        />

        <UsageExternalToolUsagePanels
          lineItemsTitle="Built-in direct usage"
          lineItemsEmptyState={props.builtInLineItemsEmptyState}
          lineItems={props.builtInLineItems}
          lineItemPrimaryHeader="Provider"
          usageTitle="Built-in recent usage"
          usageEmptyState={props.builtInUsageEmptyState}
          usageEvents={props.builtInUsageEvents}
        />
      </div>

      <UsageExternalToolCostTrustPanel {...props.costTrustPanel} />
    </>
  );
}
