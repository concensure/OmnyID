// @locs-version: 1.0
import { Show } from "solid-js";

type OperatorUserSummaryRow = {
  userId: string;
  emailLabel: string;
  identitySummary: string;
  planLabel: string;
  billingStatusLabel: string;
  accountStatusLabel: string;
  accountStatusToneClass: string;
  lastSessionLabel: string;
  supportStatusLabel: string;
  supportExpiresSummary: string | null;
  inspectLabel: string;
  accountAction: "reactivate_account" | "suspend_account";
  accountActionLabel: string;
  supportActionLabel: string;
  sessionsActionLabel: string;
};

export type UsageOperatorUserSummaryPanelProps = {
  queryLabel: string;
  rows: OperatorUserSummaryRow[];
  emptyState: string;
  loading: boolean;
  onInspectUser: (userId: string) => void;
  onRunAction: (
    userId: string,
    action: "reactivate_account" | "suspend_account" | "revoke_support_access" | "revoke_all_sessions",
  ) => void;
  actionBusy: boolean;
};

export default function UsageOperatorUserSummaryPanel(props: UsageOperatorUserSummaryPanelProps) {
  return (
    <div class="rounded-xl border border-white/50 bg-white/80 p-3">
      <div class="flex items-center justify-between gap-3">
        <p class="text-sm font-semibold text-slate-900">User summary</p>
        <p class="text-xs text-slate-500">{props.queryLabel}</p>
      </div>
      <div class="mt-3 overflow-x-auto">
        <table class="min-w-full text-left text-xs text-slate-700">
          <thead>
            <tr class="border-b border-slate-200/80 text-slate-500">
              <th class="py-2 pr-3 font-semibold">User</th>
              <th class="py-2 pr-3 font-semibold">Plan</th>
              <th class="py-2 pr-3 font-semibold">Billing</th>
              <th class="py-2 pr-3 font-semibold">Account</th>
              <th class="py-2 pr-3 font-semibold">Last session</th>
              <th class="py-2 pr-3 font-semibold">Support</th>
              <th class="py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((user) => (
              <tr class="border-b border-slate-200/60 last:border-b-0">
                <td class="py-2 pr-3 align-top">
                  <div class="font-medium text-slate-900">{user.emailLabel}</div>
                  <div class="text-[11px] text-slate-500">{user.identitySummary}</div>
                </td>
                <td class="py-2 pr-3 align-top">{user.planLabel}</td>
                <td class="py-2 pr-3 align-top">{user.billingStatusLabel}</td>
                <td class={`py-2 pr-3 align-top font-medium ${user.accountStatusToneClass}`}>{user.accountStatusLabel}</td>
                <td class="py-2 pr-3 align-top">{user.lastSessionLabel}</td>
                <td class="py-2 align-top">
                  {user.supportStatusLabel}
                  <Show when={user.supportExpiresSummary}>
                    <div class="text-[11px] text-slate-500">{user.supportExpiresSummary}</div>
                  </Show>
                </td>
                <td class="py-2 align-top">
                  <div class="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => props.onInspectUser(user.userId)}
                      class="rounded-lg border border-sky-300/60 bg-sky-50/85 px-2.5 py-1 text-[11px] font-medium text-sky-900 transition hover:bg-sky-50"
                    >
                      {user.inspectLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onRunAction(user.userId, user.accountAction)}
                      disabled={props.actionBusy}
                      class={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        user.accountAction === "reactivate_account"
                          ? "border-emerald-300/60 bg-emerald-50/85 text-emerald-900 hover:bg-emerald-50"
                          : "border-red-300/60 bg-red-50/85 text-red-800 hover:bg-red-50"
                      }`}
                    >
                      {user.accountActionLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onRunAction(user.userId, "revoke_support_access")}
                      disabled={props.actionBusy}
                      class="rounded-lg border border-slate-300/60 bg-white/85 px-2.5 py-1 text-[11px] font-medium text-slate-800 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {user.supportActionLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onRunAction(user.userId, "revoke_all_sessions")}
                      disabled={props.actionBusy}
                      class="rounded-lg border border-amber-300/60 bg-amber-50/85 px-2.5 py-1 text-[11px] font-medium text-amber-900 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {user.sessionsActionLabel}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Show when={!props.loading && props.rows.length === 0}>
          <p class="mt-3 text-xs text-slate-500">{props.emptyState}</p>
        </Show>
      </div>
    </div>
  );
}
