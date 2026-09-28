import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingResponseWorkspaceState } from "@/lib/weddingResponseWorkspaceState";
import {
  buildWeddingVendorComparisonArtifactState,
  buildWeddingVendorSearchArtifactState,
  buildWeddingVendorSearchTaskItems,
} from "@/lib/weddingVendorSearchArtifactState";
import {
  runWeddingPlannedVendorSearchExecution,
  runWeddingVendorSearchExecution,
} from "@/lib/weddingVendorSearchExecutorState";
import { buildWeddingVendorSearchProviderPlanState } from "@/lib/weddingVendorSearchProviderPlanState";
import { buildWeddingVendorSearchReadinessState } from "@/lib/weddingVendorSearchReadinessState";

const metadata = {
  wedding_plan_id: "wedding_plan:harbour",
  response_workspace_id: "response_workspace:planning-pass",
  source_response_id: "afp:response-1",
};

const readiness = buildWeddingVendorSearchReadinessState({
  location: "Sydney",
  vendorCategories: ["photographer"],
  vendorPreferences: "documentary style and transparent pricing",
  photographyScope: "day-of coverage and portraits",
  liveSearchProviderReady: true,
});

test("buildWeddingVendorSearchArtifactState creates a source-linked vendor artifact from live search", async () => {
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [
        {
          title: "Harbour Studio",
          url: "https://harbour-studio.example",
          snippet: "Wedding photographer with documentary packages.",
          provider: "Brave Search",
        },
      ],
    }),
  });
  const state = buildWeddingVendorSearchArtifactState({ metadata, execution });

  assert.equal(state.status, "created");
  assert.equal(state.sourceCount, 1);
  assert.equal(state.summary?.kind, "vendor_table");
  assert.equal(state.summary?.sourceLinks[0]?.url, "https://harbour-studio.example");
  assert.ok(state.summary?.searchText.includes("source_linked"));
  assert.match(state.markdown ?? "", /not a booking, quote, availability confirmation/i);
  assert.match(state.markdown ?? "", /Source providers returned: Brave Search/i);
  assert.match(state.markdown ?? "", /Source counts by provider: Brave Search: 1/i);
  assert.match(state.markdown ?? "", /Confirm service area, availability, packages/i);
  assert.deepEqual(state.artifactInput?.metadata.sourceProviderLabels, ["Brave Search"]);
  assert.deepEqual(state.artifactInput?.metadata.sourceCountsByProvider, { "Brave Search": 1 });
});

test("vendor search source packet feeds existing wedding response workspace", async () => {
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [{ title: "Studio A", url: "https://studio-a.example", provider: "Brave Search" }],
    }),
  });
  const artifact = buildWeddingVendorSearchArtifactState({ metadata, execution });
  const workspace = buildWeddingResponseWorkspaceState({
    metadata,
    artifacts: artifact.artifactInput ? [artifact.artifactInput] : [],
    query: "studio",
  });

  assert.equal(workspace.totalArtifacts, 1);
  assert.equal(workspace.results[0]?.kind, "vendor_table");
  assert.equal(workspace.results[0]?.sourceLinks.length, 1);
});

test("planned vendor search source packet preserves provider-specific search context", async () => {
  const providerPlan = buildWeddingVendorSearchProviderPlanState({
    readiness,
    providerKinds: ["google_places", "overpass"],
    maxCategories: 1,
  });
  const execution = await runWeddingPlannedVendorSearchExecution({
    providerPlans: providerPlan.providerPlans,
    mode: "live",
    providerLabel: "Admin wedding search stack",
    maxQueries: 2,
    port: (query) => ({
      ok: true,
      query: query.query,
      sources: [{
        title: `${query.category} source`,
        url: `https://example.com/${query.providerKind}/${query.category}`,
        snippet: query.expectedFields.join(", "),
        provider: query.providerKind,
      }],
    }),
  });
  const artifact = buildWeddingVendorSearchArtifactState({ metadata, execution });
  const workspace = buildWeddingResponseWorkspaceState({
    metadata,
    artifacts: artifact.artifactInput ? [artifact.artifactInput] : [],
    query: "place id craft=photographer",
  });

  assert.equal(artifact.status, "created");
  assert.match(artifact.markdown ?? "", /Provider kinds: google_places, overpass/i);
  assert.match(artifact.markdown ?? "", /Source providers returned: google_places, overpass/i);
  assert.match(artifact.markdown ?? "", /Source counts by provider: google_places: 1, overpass: 1/i);
  assert.match(artifact.markdown ?? "", /Google place types: point_of_interest/i);
  assert.match(artifact.markdown ?? "", /Overpass tags: craft=photographer/i);
  assert.match(artifact.markdown ?? "", /Expected fields: name, website, phone/i);
  assert.ok(artifact.summary?.sourceLabels.includes("google_places"));
  assert.deepEqual(artifact.artifactInput?.metadata.sourceProviderLabels, ["google_places", "overpass"]);
  assert.ok(artifact.summary?.sourceLabels.includes("craft=photographer"));
  assert.equal(workspace.totalArtifacts, 1);
  assert.ok(workspace.results[0]?.searchText.includes("place id"));
});

test("buildWeddingVendorComparisonArtifactState ranks top three vendor choices with A2UI comparison", async () => {
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [
        {
          title: "Harbour Studio",
          url: "https://harbour-studio.example",
          snippet: "Sydney documentary wedding photographer with transparent packages, portfolio, and date availability.",
          provider: "Brave Search",
        },
        {
          title: "Budget Lens",
          url: "https://budget-lens.example",
          snippet: "Wedding photography rates and simple packages for Sydney couples.",
          provider: "Brave Search",
        },
        {
          title: "Portrait Hall",
          url: "https://portrait-hall.example",
          snippet: "Editorial portraits and gallery reviews.",
          provider: "Brave Search",
        },
        {
          title: "Generic Events",
          url: "https://generic-events.example",
          snippet: "Event services.",
          provider: "Brave Search",
        },
      ],
    }),
  });
  const comparison = buildWeddingVendorComparisonArtifactState({
    metadata,
    execution,
    preferences: "documentary style and transparent pricing",
    location: "Sydney",
    budgetComfort: "balanced budget",
    vendorCategories: ["photographer"],
  });
  const a2ui = comparison.artifactInput?.metadata && typeof comparison.artifactInput.metadata === "object"
    ? (comparison.artifactInput.metadata as Record<string, unknown>).a2ui as Record<string, unknown>
    : null;

  assert.equal(comparison.status, "created");
  assert.equal(comparison.topChoiceCount, 4);
  assert.equal(comparison.summary?.title, "Top vendor comparison");
  assert.equal(comparison.summary?.vendorLabels[0], "Harbour Studio");
  assert.match(comparison.markdown ?? "", /Top five candidates/i);
  assert.match(comparison.markdown ?? "", /documentary/i);
  assert.match(comparison.markdown ?? "", /Confirm service area, date availability/i);
  assert.equal(a2ui?.schema_version, "a2ui.v1");
  assert.equal(Array.isArray(a2ui?.components), true);
  const comparisonTable = (a2ui?.components as Array<Record<string, unknown>>)[0] as Record<string, unknown> | undefined;
  const comparisonProps = comparisonTable?.props as Record<string, unknown> | undefined;
  assert.equal(comparisonTable?.type, "comparison_table");
  assert.equal((comparisonProps?.selection as Record<string, unknown> | undefined)?.mode, "multi");
  assert.equal(((comparisonProps?.selection as Record<string, unknown> | undefined)?.confirm_action as Record<string, unknown> | undefined)?.kind, "confirm_vendor_choices");
  const columnActions = comparisonProps?.column_actions as Array<Record<string, unknown>>;
  assert.equal(columnActions.length, 4);
  assert.equal(columnActions[0]?.vendor_label, "Harbour Studio");
  assert.equal(columnActions[0]?.source_url, "https://harbour-studio.example");
  assert.equal((columnActions[0]?.actions as Array<Record<string, unknown>>)[0]?.kind, "select_vendor_for_follow_up");
  assert.equal((columnActions[0]?.actions as Array<Record<string, unknown>>)[1]?.kind, "open_vendor_source");
  assert.equal((columnActions[0]?.actions as Array<Record<string, unknown>>)[2]?.kind, "prepare_approval_gated_outreach");
  assert.deepEqual((comparison.artifactInput?.metadata as Record<string, unknown>).topChoiceLabels, [
    "Harbour Studio",
    "Budget Lens",
    "Portrait Hall",
    "Generic Events",
  ]);
  const comparisonMetadata = comparison.artifactInput?.metadata as Record<string, unknown>;
  const recommendationHandoff = comparisonMetadata.vendorComparisonHandoff as Record<string, unknown>;
  assert.match(String(recommendationHandoff.recommendationLabel), /Harbour Studio/i);
  assert.deepEqual(recommendationHandoff.whyLabels as string[], [
    "4 source-backed choices ranked from live search results",
    "2 choices matched stated preferences",
    "2 choices surfaced package/pricing language",
    "Intake signals used: Preferences: documentary style and transparent...; Budget comfort: balanced budget",
    "Location context: Sydney",
    "Provider evidence: Brave Search",
  ]);
  assert.equal(recommendationHandoff.confidenceLabel, "Confidence: strong");
  assert.match(String(recommendationHandoff.nextActionLabel), /approval-gated follow-up/i);
  assert.equal(((comparisonMetadata.vendorComparisonSelection as Record<string, unknown>).confirmAction), "confirm_vendor_choices");
  assert.equal(((comparisonMetadata.vendorComparisonSelection as Record<string, unknown>).approvalRequiredBeforeOutreach), true);
  assert.equal(((comparisonMetadata.vendorComparisonSelection as Record<string, unknown>).selectedVendorsContinueToFollowUp), true);
  assert.equal(((comparisonMetadata.vendorComparisonSelection as Record<string, unknown>).unselectedVendorsLeaveActiveQueues), true);
  assert.equal(((comparisonMetadata.vendorComparisonSelection as Record<string, unknown>).closedVendorHistoryRetained), true);
  assert.equal((comparisonMetadata.topChoiceActionRows as Array<Record<string, unknown>>).length, 4);
  const semanticObject = comparisonMetadata.semantic_object as Record<string, unknown>;
  const semanticActions = semanticObject.actions as Array<Record<string, unknown>>;
  assert.deepEqual(semanticActions.map((action) => action.kind), [
    "confirm_vendor_choices",
    "prepare_follow_up_for_selected_vendors",
    "open_vendor_sources",
  ]);
  assert.equal(semanticActions.find((action) => action.kind === "prepare_follow_up_for_selected_vendors")?.targetMenu, "response_queue");
  assert.deepEqual((comparison.artifactInput?.metadata as Record<string, unknown>).sourceProviderLabels, ["Brave Search"]);
  assert.deepEqual((comparison.artifactInput?.metadata as Record<string, unknown>).sourceCountsByProvider, { "Brave Search": 4 });
  assert.equal((comparison.artifactInput?.metadata as Record<string, unknown>).sourceUrlCount, 4);
  assert.equal((comparison.artifactInput?.metadata as Record<string, unknown>).parentSourceUrlCount, 4);
});

test("buildWeddingVendorComparisonArtifactState uses structured intake atmosphere and inspiration signals", async () => {
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [
        {
          title: "Formal Ballroom Collective",
          url: "https://formal-ballroom.example",
          snippet: "Classic wedding photography packages and polished ballroom portraits.",
          provider: "Brave Search",
        },
        {
          title: "Garden Candle Studio",
          url: "https://garden-candle.example",
          snippet: "Relaxed candlelit garden wedding photographer with warm documentary galleries.",
          provider: "Brave Search",
        },
      ],
    }),
  });
  const comparison = buildWeddingVendorComparisonArtifactState({
    metadata,
    execution,
    preferences: "transparent pricing",
    atmosphereDescription: "Relaxed candlelit garden dinner",
    inspirationImageUrls: ["https://example.com/garden-table.jpg"],
    topPriorities: ["family", "budget"],
    location: "Sydney",
    budgetComfort: "Keep total spend low",
    vendorCategories: ["photographer"],
  });
  const comparisonMetadata = comparison.artifactInput?.metadata as Record<string, unknown>;

  assert.equal(comparison.status, "created");
  assert.equal(comparison.summary?.vendorLabels[0], "Garden Candle Studio");
  assert.match(comparison.markdown ?? "", /Desired atmosphere: Relaxed candlelit garden dinner/i);
  assert.match(comparison.markdown ?? "", /Top priorities: family, budget/i);
  assert.match(comparison.markdown ?? "", /Inspiration links: https:\/\/example\.com\/garden-table\.jpg/i);
  assert.deepEqual(comparisonMetadata.vendorComparisonPreferenceSignals, [
    "Preferences: transparent pricing",
    "Atmosphere: Relaxed candlelit garden dinner",
    "Budget comfort: Keep total spend low",
    "Priority: family",
    "Priority: budget",
    "Inspiration link: https://example.com/garden-table.jpg",
  ]);
  const recommendationHandoff = comparisonMetadata.vendorComparisonHandoff as Record<string, unknown>;
  assert.ok((recommendationHandoff.whyLabels as string[]).some((label) =>
    /Intake signals used: Preferences: transparent pricing; Atmosphere: Relaxed candlelit garden dinner/i.test(label)
  ));
  assert.ok((comparisonMetadata.vendorComparisonRankingSignals as string[]).includes("atmosphere_description"));
  assert.ok((comparisonMetadata.vendorComparisonRankingSignals as string[]).includes("inspiration_links"));
});

test("buildWeddingVendorSearchArtifactState does not create artifacts from dry-run or failed search", async () => {
  const dryRun = await runWeddingVendorSearchExecution({
    readiness,
    mode: "dry_run",
    providerLabel: "Brave Search",
  });
  const failed = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
  });

  const dryRunArtifact = buildWeddingVendorSearchArtifactState({ metadata, execution: dryRun });
  const failedArtifact = buildWeddingVendorSearchArtifactState({ metadata, execution: failed });

  assert.equal(dryRunArtifact.status, "not_created");
  assert.equal(failedArtifact.status, "not_created");
  assert.match(dryRunArtifact.reason ?? "", /did not run live/i);
  assert.equal(dryRunArtifact.artifactInput, null);
  assert.equal(failedArtifact.artifactInput, null);
});

test("buildWeddingVendorSearchArtifactState blocks live searches with no usable sources", async () => {
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({ ok: true, query, sources: [{ title: "No URL", url: "" }] }),
  });
  const artifact = buildWeddingVendorSearchArtifactState({ metadata, execution });

  assert.equal(execution.status, "executed");
  assert.equal(execution.sourceCount, 0);
  assert.equal(artifact.status, "not_created");
  assert.match(artifact.reason ?? "", /no usable HTTP\(S\) source URLs/i);
});

test("buildWeddingVendorSearchArtifactState blocks malformed source URLs before artifact creation", async () => {
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [
        { title: "Bad URL", url: "javascript:alert(1)", provider: "Brave Search" },
        { title: "Relative URL", url: "/vendor/profile", provider: "Brave Search" },
      ],
    }),
  });
  const artifact = buildWeddingVendorSearchArtifactState({ metadata, execution });

  assert.equal(execution.status, "executed");
  assert.equal(execution.sourceCount, 2);
  assert.equal(artifact.status, "not_created");
  assert.equal(artifact.sourceCount, 0);
  assert.match(artifact.reason ?? "", /no usable HTTP\(S\) source URLs/i);
  assert.equal(artifact.artifactInput, null);
});

test("buildWeddingVendorSearchArtifactState blocks local source URLs before artifact creation", async () => {
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [
        { title: "Localhost URL", url: "http://localhost:8787/vendor/profile", provider: "Brave Search" },
        { title: "Loopback URL", url: "https://127.0.0.1/vendor/profile", provider: "Brave Search" },
      ],
    }),
  });
  const artifact = buildWeddingVendorSearchArtifactState({ metadata, execution });

  assert.equal(execution.status, "executed");
  assert.equal(execution.sourceCount, 2);
  assert.equal(artifact.status, "not_created");
  assert.equal(artifact.sourceCount, 0);
  assert.match(artifact.reason ?? "", /no usable HTTP\(S\) source URLs/i);
  assert.equal(artifact.artifactInput, null);
});

test("buildWeddingVendorSearchArtifactState drops malformed URLs from mixed source packets", async () => {
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [
        { title: "Harbour Studio", url: "https://harbour-studio.example", provider: "Brave Search" },
        { title: "Bad URL", url: "javascript:alert(1)", provider: "Brave Search" },
      ],
    }),
  });
  const artifact = buildWeddingVendorSearchArtifactState({ metadata, execution });

  assert.equal(artifact.status, "created");
  assert.equal(artifact.sourceCount, 1);
  assert.equal(artifact.summary?.sourceLinks.length, 1);
  assert.equal(artifact.summary?.sourceLinks[0]?.url, "https://harbour-studio.example");
  assert.equal(artifact.artifactInput?.metadata.sourceUrlCount, 1);
  assert.equal(artifact.artifactInput?.metadata.unusableSourceUrlCount, 1);
  assert.doesNotMatch(artifact.markdown ?? "", /javascript:alert/);
});

test("buildWeddingVendorSearchArtifactState drops local URLs from mixed source packets", async () => {
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [
        { title: "Harbour Studio", url: "https://harbour-studio.example", provider: "Brave Search" },
        { title: "Local URL", url: "http://localhost:8787/vendor/profile", provider: "Brave Search" },
      ],
    }),
  });
  const artifact = buildWeddingVendorSearchArtifactState({ metadata, execution });

  assert.equal(artifact.status, "created");
  assert.equal(artifact.sourceCount, 1);
  assert.equal(artifact.summary?.sourceLinks.length, 1);
  assert.equal(artifact.summary?.sourceLinks[0]?.url, "https://harbour-studio.example");
  assert.equal(artifact.artifactInput?.metadata.sourceUrlCount, 1);
  assert.equal(artifact.artifactInput?.metadata.unusableSourceUrlCount, 1);
  assert.doesNotMatch(artifact.markdown ?? "", /localhost/);
});

test("buildWeddingVendorSearchTaskItems recovers review tasks from source packet artifacts", async () => {
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [{ title: "Studio A", url: "https://studio-a.example", provider: "Brave Search" }],
    }),
  });
  const artifact = buildWeddingVendorSearchArtifactState({ metadata, execution });
  const tasks = buildWeddingVendorSearchTaskItems({
    metadata,
    artifacts: artifact.artifactInput ? [artifact.artifactInput] : [],
  });

  assert.equal(tasks.length, 4);
  assert.ok(tasks.some((task) => /source freshness/i.test(task.title)));
  assert.ok(tasks.some((task) => /Tick preferred vendor/i.test(task.title)));
  assert.ok(tasks.some((task) =>
    (task.metadata as Record<string, unknown>).vendor_search_review_task === true
    && (task.metadata as Record<string, unknown>).vendor_price_freshness_required === true
    && task.linkedArtifactId === artifact.artifactInput?.id
  ));
  assert.ok(tasks.some((task) =>
    (task.metadata as Record<string, unknown>).approval_required_before_outreach === true
    && (task.metadata as Record<string, unknown>).no_external_send_without_approval === true
  ));
});

test("buildWeddingVendorSearchTaskItems projects top-three comparison as a decision task", async () => {
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [
        { title: "Harbour Studio", url: "https://harbour-studio.example", snippet: "Documentary Sydney photographer packages.", provider: "Brave Search" },
        { title: "Budget Lens", url: "https://budget-lens.example", snippet: "Transparent pricing for weddings.", provider: "Brave Search" },
        { title: "Portrait Hall", url: "https://portrait-hall.example", snippet: "Portfolio and reviews.", provider: "Brave Search" },
      ],
    }),
  });
  const sourceArtifact = buildWeddingVendorSearchArtifactState({ metadata, execution });
  const comparison = buildWeddingVendorComparisonArtifactState({
    metadata,
    execution,
    preferences: "documentary style and transparent pricing",
    location: "Sydney",
    vendorCategories: ["photographer"],
  });
  const tasks = buildWeddingVendorSearchTaskItems({
    metadata,
    artifacts: [
      sourceArtifact.artifactInput!,
      comparison.artifactInput!,
    ],
  });
  const comparisonTask = tasks.find((task) =>
    (task.metadata as Record<string, unknown>).vendor_comparison_decision_task === true
  );

  assert.equal(tasks.length, 1);
  assert.ok(comparisonTask);
  assert.equal(comparisonTask?.kind, "decision");
  assert.match(comparisonTask?.title ?? "", /top-three comparison/i);
  assert.deepEqual((comparisonTask?.metadata as Record<string, unknown>).vendor_comparison_top_choice_labels, [
    "Harbour Studio",
    "Budget Lens",
    "Portrait Hall",
  ]);
  assert.equal((comparisonTask?.metadata as Record<string, unknown>).a2ui_primary_action, "open_vendor_comparison");
});

test("buildWeddingVendorSearchTaskItems hides comparison queue work after vendors are selected", async () => {
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [
        { title: "Harbour Studio", url: "https://harbour-studio.example", snippet: "Documentary Sydney photographer packages.", provider: "Brave Search" },
        { title: "Budget Lens", url: "https://budget-lens.example", snippet: "Transparent pricing for weddings.", provider: "Brave Search" },
        { title: "Portrait Hall", url: "https://portrait-hall.example", snippet: "Portfolio and reviews.", provider: "Brave Search" },
      ],
    }),
  });
  const sourceArtifact = buildWeddingVendorSearchArtifactState({ metadata, execution });
  const comparison = buildWeddingVendorComparisonArtifactState({
    metadata,
    execution,
    preferences: "documentary style and transparent pricing",
    location: "Sydney",
    vendorCategories: ["photographer"],
  });
  assert.ok(comparison.artifactInput);

  const tasks = buildWeddingVendorSearchTaskItems({
    metadata,
    artifacts: [
      sourceArtifact.artifactInput!,
      comparison.artifactInput,
    ],
    selectedDecisionItems: [{
      id: "decision:harbour",
      metadata,
      artifactId: comparison.artifactInput.id,
      artifactTitle: comparison.artifactInput.title,
      artifactKind: "vendor_table",
      sourceLabels: [],
      sourceUrls: [],
      sourceProviderLabels: [],
      sourceCountsByProvider: null,
      selectedOption: {
        id: "0:harbour-studio",
        rowIndex: 0,
        label: "Harbour Studio",
        detail: "Documentary Sydney photographer packages.",
        cells: ["Harbour Studio"],
        selected: true,
        preferenceFitLabels: [],
        missingPreferenceLabels: [],
        tradeoffLabels: [],
        preferenceSummaryLabel: "Selected by user",
      },
      source: "local_selection",
    }],
  });

  assert.deepEqual(tasks, []);
});
