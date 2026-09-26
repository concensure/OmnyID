// @locs-version: 1.0
import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { EmptyState } from "@/components/EmptyState";
import {
  type DashboardBootstrap,
  fetchCostProfitSummary,
  fetchCostSummary,
  fetchLlmConfig,
  fetchSpendHistory,
  getBillingStatus,
  getCostBudget,
  setArchiveOnlyMode,
  upsertCostBudget,
  type BillingStatus,
  type CostBudget,
  type CostProfitSummary,
  type CostSummary,
  type LlmConfig,
  type SpendHistoryEntry,
} from "@/lib/api";
import { readBillingOperationalGuidanceCard } from "@/lib/billingOperationalGuidanceState";
import { buildCostTrustGuidance } from "@/lib/costTrustState";
import {
  readCostDashboardApiCallsGaugeState,
  readCostDashboardRunCostGaugeState,
  readCostDashboardTokenGaugeState,
} from "@/lib/costDashboardBudgetGaugeState";
import {
  readCostDashboardSpendBars,
  readCostDashboardSpendHistoryDetail,
  readCostDashboardSpendHistoryTotals,
  readCostDashboardSpendHistoryValue,
} from "@/lib/costDashboardSpendHistoryState";
import {
  readCostDashboardPaceStatus,
  readCostDashboardProjectionState,
} from "@/lib/costDashboardPacingState";
import {
  readCostDashboardLlmBudgetDetail,
  readCostDashboardLlmBudgetValue,
  readCostDashboardLlmGaugeState,
} from "@/lib/costDashboardLlmState";
import {
  readCostDashboardProfitDetail,
  readCostDashboardProfitTitle,
  readCostDashboardProfitValue,
} from "@/lib/costDashboardProfitState";
import { readCostDashboardSummaryDetail, readCostDashboardSummaryValue } from "@/lib/costDashboardSummaryState";
import {
  readCostDashboardUsageGuardDetail,
  readCostDashboardUsageGuardSummary,
} from "@/lib/costDashboardUsageGuardState";
import {
  buildCostDashboardFailureReceipt,
  type CostDashboardFailureReceipt,
} from "@/lib/costDashboardFailureState";
import {
  STORAGE_ADDON,
  STORAGE_PLANS,
  formatUsdPerMonth,
  hasRecognizedPlanMetadata,
  nextStorageUpgradeLabel,
  normalizePlanId,
} from "@/lib/pricing";
import { archiveOnlyActiveLabel, archiveOnlyToggleLabel, archiveOnlyWarningTitle } from "@/lib/storageMode";
import { costDashboardMountedDateTimeLabel } from "@/lib/costDashboardViewState";

function money(value: number): string {
  return `$${value.toFixed(value >= 100 ? 0 : 2)}`;
}

function byteCountLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatPlan(plan: string | null | undefined): string {
  const raw = String(plan || "free").trim();
  if (!raw) return "Free";
  return raw
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function readMountedWarningText(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function hasMountedFiniteBytes(value: number | null | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function Gauge(props: {
  label: string;
  used: number;
  max: number;
  unit?: string;
  warnAt?: number;
  hint?: string | null;
}) {
  const pct = createMemo(() => {
    if (props.max <= 0) return 0;
    return Math.min(100, (props.used / props.max) * 100);
  });
  const color = createMemo(() => {
    if (pct() >= 100) return "bg-rose-500";
    if (pct() >= (props.warnAt ?? 80)) return "bg-amber-400";
    return "bg-sky-500";
  });

  return (
    <div class="space-y-2">
      <div class="flex items-end justify-between gap-3">
        <div>
          <p class="text-xs font-medium text-on-surface">{props.label}</p>
          <Show when={props.hint}>
            <p class="text-[11px] text-on-surface-variant/70">{props.hint}</p>
          </Show>
        </div>
        <p class="text-xs font-semibold text-on-surface">
          {props.unit === "$" ? money(props.used) : props.used.toLocaleString()}
          {" / "}
          {props.unit === "$" ? money(props.max) : props.max.toLocaleString()}
        </p>
      </div>
      <div class="h-2.5 overflow-hidden rounded-full bg-white/50">
        <div
          class={`h-full rounded-full transition-[width] duration-500 ${color()}`}
          style={{ width: `${pct()}%` }}
        />
      </div>
    </div>
  );
}

function SpendBars(props: { history: SpendHistoryEntry[] }) {
  const bars = createMemo(() => readCostDashboardSpendBars(props.history));

  return (
    <div class="grid h-36 grid-cols-12 items-end gap-2 rounded-2xl border border-white/40 bg-white/45 p-4">
      <Show
        when={bars()}
        fallback={
          <p class="col-span-12 text-xs text-on-surface-variant/60">
            {props.history.length > 0
              ? "Retry the dashboard to confirm daily spend history."
              : "No spend history yet."}
          </p>
        }
      >
        {bars()!.map((entry) => {
          const height = Math.max(10, Math.round(entry.ratio * 100));
          return (
            <div class="flex h-full flex-col justify-end gap-2">
              <div
                class="rounded-t-xl bg-gradient-to-t from-sky-500 via-cyan-400 to-emerald-300"
                style={{ height: `${height}%` }}
                title={entry.title}
              />
              <span class="text-center font-mono text-[9px] uppercase tracking-[0.12em] text-on-surface-variant/60">
                {entry.dayLabel}
              </span>
            </div>
          );
        })}
      </Show>
    </div>
  );
}

function StatCard(props: { eyebrow: string; title: string; value: string; detail: string }) {
  return (
    <div class="rounded-3xl border border-white/45 bg-white/55 p-5 shadow-card backdrop-blur">
      <p class="font-mono text-[9px] uppercase tracking-[0.18em] text-outline/60">{props.eyebrow}</p>
      <p class="mt-3 text-2xl font-semibold text-on-surface">{props.value}</p>
      <p class="mt-1 text-sm font-medium text-on-surface">{props.title}</p>
      <p class="mt-2 text-xs leading-5 text-on-surface-variant/70">{props.detail}</p>
    </div>
  );
}

function summaryFromSnapshot(snapshot: DashboardBootstrap["cost_snapshot"] | null | undefined): CostSummary | null {
  if (!snapshot) return null;
  return {
    user_id: "bootstrap",
    total_usd: snapshot.total_usd,
    total_tokens: snapshot.total_tokens,
    event_count: snapshot.event_count,
    run_count: snapshot.run_count,
  };
}

function budgetFromSnapshot(snapshot: DashboardBootstrap["cost_snapshot"] | null | undefined): CostBudget | null {
  if (!snapshot) return null;
  return {
    max_cost_usd: snapshot.monthly_budget_usd,
    max_api_calls: 0,
    max_llm_tokens: 0,
    soft_limit_ratio: snapshot.soft_limit_ratio,
  };
}

function profitFromSnapshot(
  snapshot: DashboardBootstrap["cost_snapshot"] | null | undefined,
): CostProfitSummary | null {
  if (!snapshot) return null;
  return {
    user_id: "bootstrap",
    pricing_tier: "bootstrap",
    tier_max_stage: 0,
    daily_deep_query_limit: snapshot.daily_deep_query_limit,
    deep_queries_today: snapshot.deep_queries_today,
    budget_max_cost_usd: snapshot.monthly_budget_usd,
    cost_day_usd: 0,
    cost_month_usd: snapshot.cost_month_usd,
    estimated_monthly_revenue_usd: snapshot.cost_month_usd + snapshot.estimated_monthly_margin_usd,
    estimated_monthly_margin_usd: snapshot.estimated_monthly_margin_usd,
    margin_guard_active: snapshot.margin_guard_active,
    usage_guard_active: snapshot.usage_guard_active,
  };
}

export function CostDashboardView(props: { initialSnapshot?: DashboardBootstrap["cost_snapshot"] | null }) {
  let loadRequestId = 0;
  let saveRequestId = 0;
  let modeRequestId = 0;
  let operationalCommandRequestId = 0;
  let savedTimer: ReturnType<typeof setTimeout> | undefined;
  let clockTimer: ReturnType<typeof setInterval> | undefined;
  const [summary, setSummary] = createSignal<CostSummary | null>(summaryFromSnapshot(props.initialSnapshot));
  const [budget, setBudget] = createSignal<CostBudget | null>(budgetFromSnapshot(props.initialSnapshot));
  const [profit, setProfit] = createSignal<CostProfitSummary | null>(profitFromSnapshot(props.initialSnapshot));
  const [llm, setLlm] = createSignal<LlmConfig | null>(null);
  const [history, setHistory] = createSignal<SpendHistoryEntry[]>([]);
  const [billing, setBilling] = createSignal<BillingStatus | null>(null);
  const [editing, setEditing] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [modeSaving, setModeSaving] = createSignal(false);
  const [saved, setSaved] = createSignal(false);
  const [now, setNow] = createSignal(Date.now());
  const [loadError, setLoadError] = createSignal<CostDashboardFailureReceipt | null>(null);
  const [actionError, setActionError] = createSignal<CostDashboardFailureReceipt | null>(null);
  const [operationalCommandNotice, setOperationalCommandNotice] = createSignal<string | null>(null);

  const [editUsd, setEditUsd] = createSignal("");
  const [editCalls, setEditCalls] = createSignal("");
  const [editTokens, setEditTokens] = createSignal("");
  const [editSoft, setEditSoft] = createSignal(String(props.initialSnapshot?.soft_limit_ratio ?? ""));
  const hasBillingSnapshot = createMemo(() => billing() !== null);
  const hasConfirmedPlanMetadata = createMemo(() => !!String(billing()?.plan ?? "").trim());
  const hasRecognizedPlanState = createMemo(() => hasRecognizedPlanMetadata(billing()?.plan));
  const hasStorageUsageSignals = createMemo(
    () =>
      hasMountedFiniteBytes(billing()?.storage_used_bytes) &&
      hasMountedFiniteBytes(billing()?.storage_remaining_bytes),
  );
  const hasStorageTierSignals = createMemo(
    () =>
      hasMountedFiniteBytes(billing()?.storage_quota_bytes) &&
      hasMountedFiniteBytes(billing()?.max_single_upload_bytes),
  );
  const normalizedPlanId = createMemo(() => normalizePlanId(billing()?.plan));
  const storagePlan = createMemo(() => STORAGE_PLANS[normalizedPlanId()]);
  const storageUpgradeLabel = createMemo(() => nextStorageUpgradeLabel(billing()?.plan));
  const storageQuotaBytes = createMemo(() => billing()?.storage_quota_bytes ?? storagePlan().storageQuotaGb * 1024 * 1024 * 1024);
  const storageUsedBytes = createMemo(() => billing()?.storage_used_bytes ?? 0);
  const storageRemainingBytes = createMemo(() => billing()?.storage_remaining_bytes ?? Math.max(0, storageQuotaBytes() - storageUsedBytes()));
  const operationalGuidanceCard = createMemo(() => readBillingOperationalGuidanceCard(billing()));
  const costTrustGuidance = createMemo(() => buildCostTrustGuidance({
    billingStatusAvailable: hasBillingSnapshot(),
    hostedBudgetCents: llm()?.monthly_budget_cents,
    quotaState: billing()?.quota_state,
  }));

  const hasDashboardData = createMemo(
    () => !!summary() || !!budget() || !!profit() || !!llm() || !!billing() || history().length > 0,
  );

  function isMissingBudgetError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    return message.includes("404") || message.includes("not found") || message.includes("no budget");
  }

  async function loadDashboard() {
    const requestId = ++loadRequestId;
    setLoadError(null);
    setActionError(null);
    clearSavedState();
    try {
      const [summaryValue, budgetValue, profitValue, llmValue, historyValue, billingValue] = await Promise.all([
        fetchCostSummary(),
        getCostBudget().catch((error) => {
          if (isMissingBudgetError(error)) return null;
          throw error;
        }),
        fetchCostProfitSummary().catch(() => null),
        fetchLlmConfig().catch(() => null),
        fetchSpendHistory(30).catch(() => null),
        getBillingStatus().catch(() => null),
      ]);
      if (requestId !== loadRequestId) return;
      setSummary(summaryValue);
      setBudget(budgetValue);
      if (profitValue) {
        setProfit(profitValue);
      }
      if (llmValue) {
        setLlm(llmValue);
      }
      if (historyValue) {
        setHistory(historyValue.history);
      }
      if (billingValue) {
        setBilling(billingValue);
      }
      if (!editing()) {
        syncBudgetDraftFields(budgetValue);
      }
    } catch (loadError) {
      if (requestId !== loadRequestId) return;
      setLoadError(
        buildCostDashboardFailureReceipt(
          "Load cost dashboard",
          loadError instanceof Error ? loadError.message : "Failed to load cost dashboard.",
        ),
      );
    }
  }

  onMount(() => {
    void loadDashboard();
    clockTimer = setInterval(() => {
      setNow(Date.now());
    }, 60_000);
  });

  onCleanup(() => {
    loadRequestId += 1;
    saveRequestId += 1;
    modeRequestId += 1;
    if (clockTimer !== undefined) {
      clearInterval(clockTimer);
    }
    if (savedTimer !== undefined) {
      clearTimeout(savedTimer);
    }
  });

  const spendHistoryTotals = createMemo(() => readCostDashboardSpendHistoryTotals(history()));
  const usedUsd30d = createMemo(() => spendHistoryTotals()?.usedUsd ?? 0);
  const usedCalls30d = createMemo(() => spendHistoryTotals()?.usedCalls ?? 0);
  const usedTokens30d = createMemo(() => spendHistoryTotals()?.usedTokens ?? 0);
  const runCostGaugeState = createMemo(() => readCostDashboardRunCostGaugeState(budget(), usedUsd30d()));
  const apiCallsGaugeState = createMemo(() => readCostDashboardApiCallsGaugeState(budget(), usedCalls30d()));
  const tokenGaugeState = createMemo(() => readCostDashboardTokenGaugeState(budget(), usedTokens30d()));
  const paceStatus = createMemo(() => {
    return readCostDashboardPaceStatus(budget(), history(), now());
  });
  const projectedLimitState = createMemo(() => {
    return readCostDashboardProjectionState(budget(), history());
  });
  const storageTierDetail = createMemo(() => {
    if (!hasBillingSnapshot()) {
      return "Retry the dashboard to confirm storage quota, upload limits, and archive-only availability.";
    }
    if (!hasConfirmedPlanMetadata()) {
      return "Retry the dashboard to confirm the current storage tier, quota, upload limits, and archive-only availability.";
    }
    if (!hasStorageTierSignals()) {
      return "Retry the dashboard to confirm the current storage quota and max upload limit before trusting this tier summary.";
    }
    const quotaLabel = byteCountLabel(billing()!.storage_quota_bytes!);
    const uploadLabel = byteCountLabel(billing()!.max_single_upload_bytes!);
    if (!hasRecognizedPlanState()) {
      return `Plan metadata unavailable | ${quotaLabel} total storage | ${uploadLabel} max single upload`;
    }
    return `${formatPlan(billing()?.plan)} | ${quotaLabel} total storage | ${uploadLabel} max single upload`;
  });
  const storageUsageDetail = createMemo(() => {
    if (!hasBillingSnapshot()) {
      return "Storage usage is unavailable until billing status loads.";
    }
    if (!hasStorageUsageSignals()) {
      return "Retry the dashboard to confirm current storage usage and remaining capacity.";
    }
    return `Used ${byteCountLabel(storageUsedBytes())} | Remaining ${byteCountLabel(storageRemainingBytes())}`;
  });
  const storageUpgradeDetail = createMemo(() => {
    if (!hasBillingSnapshot()) {
      return "Retry the dashboard to confirm the next storage upgrade path.";
    }
    if (!hasConfirmedPlanMetadata()) {
      return "Retry the dashboard to confirm the current plan before inferring the next storage upgrade path.";
    }
    if (!hasRecognizedPlanState()) {
      return "Retry the dashboard to confirm a supported plan id before trusting the next storage upgrade path.";
    }
    return storageUpgradeLabel();
  });
  const archiveOnlyWarningCardTitle = createMemo(() => {
    if (!hasBillingSnapshot()) {
      return "Archive-only policy unavailable";
    }
    return archiveOnlyWarningTitle(billing());
  });
  const archiveOnlyWarningCardBody = createMemo(() => {
    if (!hasBillingSnapshot()) {
      return "Retry the dashboard to confirm quota overflow behaviour, archive-only policy, and any current storage restrictions.";
    }
    if (typeof billing()?.archive_only_enabled !== "boolean") {
      return "Retry the dashboard to confirm quota overflow behaviour, archive-only policy, and any current storage restrictions.";
    }
    return (
      readMountedWarningText(billing()?.archive_only_warning) ??
      "If a quota is exceeded, the user can switch to archive-only mode or upgrade. Archive-only mode should warn that retrieval and agent performance may degrade because new hot storage and live working context are constrained."
    );
  });
  const profitCardValue = createMemo(() => {
    return readCostDashboardProfitValue(profit());
  });
  const profitCardDetail = createMemo(() => {
    return readCostDashboardProfitDetail(profit());
  });
  const usageGuardSummary = createMemo(() => {
    return readCostDashboardUsageGuardSummary(profit());
  });
  const usageGuardDetail = createMemo(() => {
    return readCostDashboardUsageGuardDetail(profit());
  });
  const llmCardValue = createMemo(() => {
    return readCostDashboardLlmBudgetValue(llm());
  });
  const llmCardDetail = createMemo(() => {
    return readCostDashboardLlmBudgetDetail(llm());
  });
  const llmGaugeState = createMemo(() => {
    return readCostDashboardLlmGaugeState(llm());
  });

  function parseOptionalFloat(value: string): number | undefined {
    const normalized = value.trim();
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function parseOptionalInt(value: string): number | undefined {
    const normalized = value.trim();
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    return Number.isInteger(parsed) ? parsed : undefined;
  }

  function validateBudgetDraft(): CostDashboardFailureReceipt | null {
    if (!budget()) {
      if (!editUsd().trim() || !editCalls().trim() || !editTokens().trim() || !editSoft().trim()) {
        return {
          title: "Complete the first budget setup",
          summary: "A new budget needs all four limits before it can be created.",
          nextStep: "Enter the USD, API call, token, and soft warning ratio values, then save the budget.",
          tone: "warning",
        };
      }
    }

    const usd = parseOptionalFloat(editUsd());
    if (editUsd().trim() !== "" && (!Number.isFinite(usd) || (usd ?? 0) < 0)) {
      return {
        title: "Review cost limits",
        summary: "The monthly USD limit must be a valid non-negative number.",
        nextStep: "Enter a non-negative dollar amount, or leave the field blank to keep the current setting.",
        tone: "warning",
      };
    }

    const calls = parseOptionalInt(editCalls());
    if (editCalls().trim() !== "" && (!Number.isFinite(calls) || (calls ?? 0) < 0)) {
      return {
        title: "Review cost limits",
        summary: "The API call limit must be a valid non-negative whole number.",
        nextStep: "Enter a whole number of calls, or leave the field blank to keep the current setting.",
        tone: "warning",
      };
    }

    const tokens = parseOptionalInt(editTokens());
    if (editTokens().trim() !== "" && (!Number.isFinite(tokens) || (tokens ?? 0) < 0)) {
      return {
        title: "Review cost limits",
        summary: "The token limit must be a valid non-negative whole number.",
        nextStep: "Enter a whole number of tokens, or leave the field blank to keep the current setting.",
        tone: "warning",
      };
    }

    const softLimit = parseOptionalFloat(editSoft());
    if (editSoft().trim() !== "" && (!Number.isFinite(softLimit) || (softLimit ?? 0) < 0 || (softLimit ?? 0) > 1)) {
      return {
        title: "Review cost limits",
        summary: "The soft warning ratio must be between 0 and 1.",
        nextStep: "Enter a value like 0.8 for an 80% warning threshold, or leave the field blank to keep the current setting.",
        tone: "warning",
      };
    }

    return null;
  }

  function clearSavedState() {
    if (savedTimer !== undefined) {
      clearTimeout(savedTimer);
      savedTimer = undefined;
    }
    setSaved(false);
  }

  async function copyOperationalCommand(command: string | null | undefined) {
    const normalized = String(command ?? "").trim();
    if (!normalized) return;
    const requestId = ++operationalCommandRequestId;
    setOperationalCommandNotice(null);
    setActionError(null);
    if (!navigator.clipboard?.writeText) {
      if (requestId === operationalCommandRequestId) {
        setActionError(
          buildCostDashboardFailureReceipt(
            "Copy cleanup command",
            "Clipboard writeText is not available in this browser.",
          ),
        );
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(normalized);
      if (requestId !== operationalCommandRequestId) return;
      setOperationalCommandNotice("Cleanup command copied.");
    } catch (error: unknown) {
      if (requestId !== operationalCommandRequestId) return;
      setActionError(
        buildCostDashboardFailureReceipt(
          "Copy cleanup command",
          error instanceof Error ? error.message : "Could not copy the cleanup command.",
        ),
      );
    }
  }

  function syncBudgetDraftFields(nextBudget: CostBudget | null) {
    setEditUsd(nextBudget ? String(nextBudget.max_cost_usd ?? 0) : "");
    setEditCalls(nextBudget ? String(nextBudget.max_api_calls ?? 0) : "");
    setEditTokens(nextBudget ? String(nextBudget.max_llm_tokens ?? 0) : "");
    setEditSoft(nextBudget ? String(nextBudget.soft_limit_ratio ?? 0.8) : "");
  }

  function beginBudgetEditing() {
    clearSavedState();
    setActionError(null);
    setEditing(true);
  }

  function cancelBudgetEditing() {
    clearSavedState();
    setActionError(null);
    setEditing(false);
    syncBudgetDraftFields(budget());
  }

  function updateBudgetField(setter: (value: string) => void, value: string) {
    clearSavedState();
    setActionError(null);
    setter(value);
  }

  async function saveBudget() {
    const requestId = ++saveRequestId;
    setActionError(null);
    clearSavedState();
    const draftValidation = validateBudgetDraft();
    if (draftValidation) {
      if (requestId === saveRequestId) {
        setActionError(draftValidation);
      }
      return;
    }
    const nextBudgetDraft: CostBudget = {
      max_cost_usd: parseOptionalFloat(editUsd()) ?? budget()?.max_cost_usd ?? 0,
      max_api_calls: parseOptionalInt(editCalls()) ?? budget()?.max_api_calls ?? 0,
      max_llm_tokens: parseOptionalInt(editTokens()) ?? budget()?.max_llm_tokens ?? 0,
      soft_limit_ratio: parseOptionalFloat(editSoft()) ?? budget()?.soft_limit_ratio ?? 0.8,
    };
    loadRequestId += 1;
    setSaving(true);
    try {
      await upsertCostBudget({
        max_cost_usd: parseOptionalFloat(editUsd()),
        max_api_calls: parseOptionalInt(editCalls()),
        max_llm_tokens: parseOptionalInt(editTokens()),
        soft_limit_ratio: parseOptionalFloat(editSoft()),
      });
      if (requestId !== saveRequestId) return;
      try {
        const refreshed = await getCostBudget();
        if (requestId !== saveRequestId) return;
        setBudget(refreshed);
        syncBudgetDraftFields(refreshed);
      } catch {
        if (requestId !== saveRequestId) return;
        setBudget(nextBudgetDraft);
        syncBudgetDraftFields(nextBudgetDraft);
      }
      setSaved(true);
      setEditing(false);
      savedTimer = setTimeout(() => {
        setSaved(false);
        savedTimer = undefined;
      }, 1800);
    } catch (saveError) {
      if (requestId !== saveRequestId) return;
      setActionError(
        buildCostDashboardFailureReceipt(
          "Save cost limits",
          saveError instanceof Error ? saveError.message : "Failed to save cost limits.",
        ),
      );
    } finally {
      if (requestId === saveRequestId) {
        setSaving(false);
      }
    }
  }

  async function toggleArchiveOnlyMode(enabled: boolean) {
    if (!billing()) return;
    const requestId = ++modeRequestId;
    loadRequestId += 1;
    setModeSaving(true);
    setActionError(null);
    try {
      const nextBilling = await setArchiveOnlyMode(enabled);
      if (requestId !== modeRequestId) return;
      setBilling(nextBilling);
    } catch (error: unknown) {
      if (requestId !== modeRequestId) return;
      setActionError(
        buildCostDashboardFailureReceipt(
          "Update archive-only mode",
          error instanceof Error ? error.message : "Could not update archive-only mode.",
        ),
      );
    } finally {
      if (requestId === modeRequestId) {
        setModeSaving(false);
      }
    }
  }

  return (
    <div class="view-enter space-y-6">
      <div class="rounded-[28px] border border-white/50 bg-gradient-to-br from-sky-50/90 via-white/75 to-emerald-50/60 p-6 shadow-panel backdrop-blur-xl">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-3xl">
            <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-sky-700/70">Cost Oracle</p>
            <h2 class="mt-3 text-3xl font-semibold tracking-tight text-on-surface">Budgeting, tracking, and cost analysis</h2>
            <p class="mt-3 max-w-2xl text-sm leading-6 text-on-surface-variant/75">
              Keep operational spend visible without digging through agent settings. This view surfaces budget ceilings,
              recent usage, monthly pacing, and margin-aware guardrails from the existing cost oracle.
            </p>
          </div>
          <div class="rounded-2xl border border-white/50 bg-white/60 px-4 py-3 text-sm text-on-surface shadow-card">
            <p class="font-medium">{paceStatus()}</p>
            <p class="mt-1 text-xs text-on-surface-variant/70">
              {projectedLimitState().reason === "retry"
                ? "Retry the dashboard to confirm current daily spend before projecting cap arrival."
                : projectedLimitState().days === null
                  ? "Set a budget to unlock cap projections."
                  : `At the current 30-day pace, the cap is about ${projectedLimitState().days} day${projectedLimitState().days === 1 ? "" : "s"} away.`}
            </p>
          </div>
        </div>
        <Show when={operationalGuidanceCard()}>
          <div
            class={`mt-4 rounded-2xl border p-4 text-sm shadow-card ${
              operationalGuidanceCard()?.tone === "warning"
                ? "border-amber-300/55 bg-amber-50/80 text-amber-950"
                : "border-slate-300/45 bg-slate-50/80 text-slate-900"
            }`}
          >
            <p class="font-semibold">{operationalGuidanceCard()?.title}</p>
            <p class="mt-1 leading-6">{operationalGuidanceCard()?.detail}</p>
            <Show when={operationalGuidanceCard()?.generatedAt || operationalGuidanceCard()?.source}>
              <p class="mt-2 text-[11px] leading-5 opacity-80">
                {operationalGuidanceCard()?.generatedAt ? `Artifact updated ${costDashboardMountedDateTimeLabel(operationalGuidanceCard()?.generatedAt) ?? operationalGuidanceCard()?.generatedAt}. ` : ""}
                {operationalGuidanceCard()?.source ? `Source: ${operationalGuidanceCard()?.source}` : ""}
              </p>
            </Show>
            <Show when={operationalGuidanceCard()?.command}>
              <pre class="mt-3 overflow-x-auto rounded-xl bg-slate-950 px-3 py-2 font-mono text-[11px] text-slate-50">
                {operationalGuidanceCard()?.command}
              </pre>
              <div class="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copyOperationalCommand(operationalGuidanceCard()?.command)}
                  class="rounded-xl border border-amber-400/50 bg-white/70 px-3 py-1.5 text-xs font-medium text-amber-950 transition hover:bg-white"
                >
                  Copy cleanup command
                </button>
              </div>
            </Show>
          </div>
        </Show>
      </div>

      <Show
        when={!loadError() || hasDashboardData()}
        fallback={
          <EmptyState
            icon="CO"
            title={loadError()?.title ?? "Could not load cost dashboard"}
            body={`${loadError()?.summary ?? "The cost dashboard is unavailable right now."} ${loadError()?.nextStep ?? ""}`.trim()}
            action={
              <button
                type="button"
                onClick={() => void loadDashboard()}
                disabled={saving() || modeSaving()}
                class="rounded-xl border border-rose-200/70 bg-white/80 px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-white"
              >
                Retry dashboard
              </button>
            }
          />
        }
      >
        <Show when={loadError()}>
          <div
            classList={{
              "flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm shadow-card": true,
              "border border-rose-200/70 bg-rose-50/85 text-rose-700": loadError()?.tone === "danger",
              "border border-amber-200/70 bg-amber-50/85 text-amber-800": loadError()?.tone !== "danger",
            }}
          >
            <div>
              <p class="font-semibold">{loadError()?.title}</p>
              <p class="mt-1">{loadError()?.summary}</p>
              <p class="mt-1 opacity-90">{loadError()?.nextStep}</p>
            </div>
            <button
              type="button"
              onClick={() => void loadDashboard()}
              disabled={saving() || modeSaving()}
              class="rounded-xl border border-white/60 bg-white/80 px-3 py-1.5 text-xs font-medium transition hover:bg-white"
            >
              Retry dashboard
            </button>
          </div>
        </Show>

        <Show when={actionError()}>
          <div
            classList={{
              "rounded-2xl border px-4 py-3 text-sm shadow-card": true,
              "border-rose-200/70 bg-rose-50/85 text-rose-700": actionError()?.tone === "danger",
              "border-amber-200/70 bg-amber-50/85 text-amber-800": actionError()?.tone !== "danger",
            }}
          >
            <p class="font-semibold">{actionError()?.title}</p>
            <p class="mt-1">{actionError()?.summary}</p>
            <p class="mt-1 opacity-90">{actionError()?.nextStep}</p>
          </div>
        </Show>

        <Show when={operationalCommandNotice()}>
          <div class="rounded-2xl border border-sky-200/70 bg-sky-50/85 px-4 py-3 text-sm text-sky-900 shadow-card">
            {operationalCommandNotice()}
          </div>
        </Show>

        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            eyebrow="Lifetime spend"
            title="All recorded run cost"
            value={readCostDashboardSummaryValue(summary())}
            detail={readCostDashboardSummaryDetail(summary())}
          />
          <StatCard
            eyebrow="30-day spend"
            title="Recent operational burn"
            value={readCostDashboardSpendHistoryValue(history())}
            detail={readCostDashboardSpendHistoryDetail(history())}
          />
          <StatCard
            eyebrow="Monthly margin"
            title={readCostDashboardProfitTitle(profit())}
            value={profitCardValue()}
            detail={profitCardDetail()}
          />
          <StatCard
            eyebrow="LLM budget"
            title="Configured model envelope"
            value={llmCardValue()}
            detail={llmCardDetail()}
          />
        </div>

        <div class="grid gap-6 xl:grid-cols-[1.25fr_0.9fr]">
          <div class="space-y-6">
            <div class="rounded-3xl border border-white/45 bg-white/55 p-5 shadow-card backdrop-blur">
              <div class="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p class="font-mono text-[9px] uppercase tracking-[0.18em] text-outline/60">Budget controls</p>
                  <p class="mt-2 text-sm text-on-surface-variant/70">Tune your cost envelope without leaving the dashboard.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (editing()) {
                      cancelBudgetEditing();
                    } else {
                      beginBudgetEditing();
                    }
                  }}
                  disabled={saving() || modeSaving()}
                  class="rounded-xl border border-white/40 bg-white/70 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white"
                >
                  {editing() ? "Cancel" : "Edit limits"}
                </button>
              </div>

              <div class="space-y-4">
                <Show when={runCostGaugeState()}>
                  <Gauge
                    label="Run cost envelope"
                    used={runCostGaugeState()!.used}
                    max={runCostGaugeState()!.max}
                    unit="$"
                    warnAt={runCostGaugeState()!.warnAt}
                    hint={runCostGaugeState()!.hint}
                  />
                </Show>
                <Show when={apiCallsGaugeState()}>
                  <Gauge
                    label="API calls"
                    used={apiCallsGaugeState()!.used}
                    max={apiCallsGaugeState()!.max}
                    warnAt={apiCallsGaugeState()!.warnAt}
                  />
                </Show>
                <Show when={tokenGaugeState()}>
                  <Gauge
                    label="LLM tokens"
                    used={tokenGaugeState()!.used}
                    max={tokenGaugeState()!.max}
                    warnAt={tokenGaugeState()!.warnAt}
                  />
                </Show>
                <Show when={llmGaugeState()}>
                  <Gauge
                    label="Monthly LLM billing budget"
                    used={llmGaugeState()!.usedUsd}
                    max={llmGaugeState()!.maxUsd}
                    unit="$"
                    warnAt={80}
                  />
                </Show>
              </div>

              <Show when={editing()}>
                <div class="mt-5 grid gap-3 border-t border-white/35 pt-5 md:grid-cols-2">
                  {[
                    { label: "Max USD ($)", value: editUsd, set: setEditUsd, step: "0.01" },
                    { label: "Max API Calls", value: editCalls, set: setEditCalls, step: "1" },
                    { label: "Max Tokens", value: editTokens, set: setEditTokens, step: "1000" },
                    { label: "Soft limit ratio", value: editSoft, set: setEditSoft, step: "0.05" },
                  ].map((field) => (
                    <label class="flex flex-col gap-1.5">
                      <span class="text-xs text-on-surface-variant">{field.label}</span>
                      <input
                        type="number"
                        step={field.step}
                        value={field.value()}
                        disabled={saving() || modeSaving()}
                        onInput={(event) => updateBudgetField(field.set, (event.target as HTMLInputElement).value)}
                        class="rounded-xl border border-white/45 bg-white/70 px-3 py-2 text-sm text-on-surface outline-none transition focus:border-sky-400/60"
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={() => void saveBudget()}
                    disabled={saving() || modeSaving()}
                    class="md:col-span-2 rounded-2xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving() ? "Saving..." : saved() ? "Saved" : "Save cost limits"}
                  </button>
                </div>
              </Show>
            </div>

            <div class="rounded-3xl border border-white/45 bg-white/55 p-5 shadow-card backdrop-blur">
              <div class="mb-4 flex items-center justify-between">
                <div>
                  <p class="font-mono text-[9px] uppercase tracking-[0.18em] text-outline/60">30-day spend trend</p>
                  <p class="mt-2 text-sm text-on-surface-variant/70">Recent daily spend for tracking burn and detecting drift.</p>
                </div>
                <p class="rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 font-mono text-[11px] text-sky-700">
                  {readCostDashboardSpendHistoryValue(history())}
                </p>
              </div>
              <SpendBars history={history()} />
            </div>
          </div>

          <div class="space-y-6">
            <div class="rounded-3xl border border-white/45 bg-white/55 p-5 shadow-card backdrop-blur">
              <p class="font-mono text-[9px] uppercase tracking-[0.18em] text-outline/60">Storage policy</p>
              <div class="mt-4 space-y-3">
                <div class="rounded-2xl border border-white/40 bg-white/65 p-4">
                  <p class="text-xs font-semibold text-on-surface">Current storage tier</p>
                  <p class="mt-1 text-sm text-on-surface-variant/75">
                    {storageTierDetail()}
                  </p>
                  <p class="mt-2 text-xs text-on-surface-variant/65">
                    {storageUsageDetail()}
                  </p>
                  <Show when={archiveOnlyActiveLabel(billing())}>
                    <p class="mt-2 text-xs font-semibold text-amber-800">{archiveOnlyActiveLabel(billing())}</p>
                  </Show>
                  <div class="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void toggleArchiveOnlyMode(!(billing()?.archive_only_enabled ?? false))}
                      disabled={
                        modeSaving() ||
                        saving() ||
                        !billing() ||
                        typeof billing()?.archive_only_enabled !== "boolean"
                      }
                      class="rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {archiveOnlyToggleLabel(billing(), modeSaving())}
                    </button>
                  </div>
                </div>
                <div class="rounded-2xl border border-white/40 bg-white/65 p-4">
                  <p class="text-xs font-semibold text-on-surface">Next upgrade</p>
                  <p class="mt-1 text-sm text-on-surface-variant/75">{storageUpgradeDetail()}</p>
                  <p class="mt-2 text-xs text-on-surface-variant/65">
                    Pricing is linked to the shared plan config. When plan pricing changes, this surface updates with it.
                  </p>
                </div>
                <div class="rounded-2xl border border-amber-200/70 bg-amber-50/85 p-4">
                  <p class="text-xs font-semibold text-amber-800">{archiveOnlyWarningCardTitle()}</p>
                  <p class="mt-1 text-sm text-amber-700/90">
                    {archiveOnlyWarningCardBody()}
                  </p>
                </div>
                <Show when={hasRecognizedPlanState() && normalizedPlanId() === "paid"}>
                  <p class="text-xs text-on-surface-variant/65">
                    Current paid expansion block: +{STORAGE_ADDON.storageQuotaGb} GB for {formatUsdPerMonth(STORAGE_ADDON.monthlyPriceUsd)}.
                  </p>
                </Show>
              </div>
            </div>

            <div class="rounded-3xl border border-white/45 bg-white/55 p-5 shadow-card backdrop-blur">
              <p class="font-mono text-[9px] uppercase tracking-[0.18em] text-outline/60">Analysis</p>
              <div class="mt-4 space-y-3">
                <div class="rounded-2xl border border-white/40 bg-white/65 p-4">
                  <p class="text-xs font-semibold text-on-surface">Budget pace</p>
                  <p class="mt-1 text-sm text-on-surface-variant/75">{paceStatus()}</p>
                </div>
                <div class="rounded-2xl border border-white/40 bg-white/65 p-4">
                  <p class="text-xs font-semibold text-on-surface">Projected cap arrival</p>
                  <p class="mt-1 text-sm text-on-surface-variant/75">
                    {projectedLimitState().reason === "retry"
                      ? "Retry the dashboard to confirm current daily spend before projecting cap arrival."
                      : projectedLimitState().days === null
                        ? "Not enough budget or spend data yet."
                        : `If the current pace holds, your configured cost cap is about ${projectedLimitState().days} day${projectedLimitState().days === 1 ? "" : "s"} away.`}
                  </p>
                </div>
                <Show when={profit()}>
                  <div class="rounded-2xl border border-white/40 bg-white/65 p-4">
                    <p class="text-xs font-semibold text-on-surface">Usage guards</p>
                    <p class="mt-1 text-sm text-on-surface-variant/75">{usageGuardSummary()}</p>
                    <p class="mt-2 text-xs text-on-surface-variant/65">{usageGuardDetail()}</p>
                  </div>
                </Show>
              </div>
            </div>

            <div class="rounded-3xl border border-white/45 bg-white/55 p-5 shadow-card backdrop-blur">
              <p class="font-mono text-[9px] uppercase tracking-[0.18em] text-outline/60">Tracking notes</p>
              <ul class="mt-4 space-y-3 text-sm leading-6 text-on-surface-variant/75">
                <li>Use this view for user-facing budgeting and spend analysis, separate from the internal fleet dashboard.</li>
                <li>Budget limits here feed the same cost-oracle controls used by execution paths and budget guardrails.</li>
                <li>Coverage and caveats are shown explicitly below so users can tell the difference between mounted metering and still-partial accounting.</li>
                <li>The workspace tile can be removed and later restored through the dashboard <span class="font-medium text-on-surface">+</span> tray.</li>
              </ul>
            </div>

            <div class="rounded-3xl border border-white/45 bg-white/55 p-5 shadow-card backdrop-blur">
              <p class="font-mono text-[9px] uppercase tracking-[0.18em] text-outline/60">Trust guidance</p>
              <div class="mt-4 grid gap-3">
                <div class="rounded-2xl border border-emerald-300/35 bg-emerald-50/55 p-4">
                  <p class="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-900">What is covered</p>
                  <ul class="mt-2 space-y-2 text-sm leading-6 text-emerald-950/85">
                    {costTrustGuidance().coverage.map((entry) => (
                      <li>{entry}</li>
                    ))}
                  </ul>
                </div>
                <div class="rounded-2xl border border-amber-300/35 bg-amber-50/55 p-4">
                  <p class="text-xs font-semibold uppercase tracking-[0.14em] text-amber-900">What may still lag</p>
                  <ul class="mt-2 space-y-2 text-sm leading-6 text-amber-950/85">
                    {costTrustGuidance().caveats.map((entry) => (
                      <li>{entry}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
