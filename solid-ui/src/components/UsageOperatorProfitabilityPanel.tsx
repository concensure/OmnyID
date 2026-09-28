// @locs-version: 1.0
import { Show } from "solid-js";

type OperatorProfitabilityUserRow = {
  userId: string;
  planLabel: string;
  costLabel: string;
  revenueLabel: string;
  marginLabel: string;
};

export type UsageOperatorProfitabilityPanelProps = {
  workflowLabel: string;
  workflowDetail: string;
  rows: OperatorProfitabilityUserRow[];
  emptyState: string;
  loading: boolean;
};

export default function UsageOperatorProfitabilityPanel(props: UsageOperatorProfitabilityPanelProps) {
  return (
    <div class="rounded-xl border border-white/50 bg-white/80 p-3">
      <p class="text-sm font-semibold text-slate-900">Profitability hotspots</p>
      <div class="mt-3 grid gap-3">
        <div class="rounded-xl border border-slate-200/70 bg-slate-50/80 p-3">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Top workflow</p>
          <p class="mt-1 text-sm font-medium text-slate-900">{props.workflowLabel}</p>
          <p class="mt-1 text-xs text-slate-600">{props.workflowDetail}</p>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full text-left text-xs text-slate-700">
            <thead>
              <tr class="border-b border-slate-200/80 text-slate-500">
                <th class="py-2 pr-3 font-semibold">User</th>
                <th class="py-2 pr-3 font-semibold">Plan</th>
                <th class="py-2 pr-3 font-semibold">Cost</th>
                <th class="py-2 pr-3 font-semibold">Revenue</th>
                <th class="py-2 font-semibold">Margin</th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((user) => (
                <tr class="border-b border-slate-200/60 last:border-b-0">
                  <td class="py-2 pr-3 align-top font-medium text-slate-900">{user.userId}</td>
                  <td class="py-2 pr-3 align-top">{user.planLabel}</td>
                  <td class="py-2 pr-3 align-top">{user.costLabel}</td>
                  <td class="py-2 pr-3 align-top">{user.revenueLabel}</td>
                  <td class="py-2 align-top">{user.marginLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Show when={!props.loading && props.rows.length === 0}>
            <p class="mt-3 text-xs text-slate-500">{props.emptyState}</p>
          </Show>
        </div>
      </div>
    </div>
  );
}
