# Dirty Workspace Inventory - 2026-09-26

Generated after wedding planner hardening, Oracle deployment/build commits, and proof collection. This inventory excludes this inventory file itself so the report does not self-reference while being updated.

Total dirty entries excluding this file: 1377

## Summary

- Modified/type-changed tracked: 132
- Deleted tracked: 9
- Renamed/copied tracked: 0
- Untracked: 1236
- Other: 0

## Modified / Type-Changed Tracked Files

```text
 M .env.example
 M .github/workflows/ci.yml
 M .gitignore
 M CLAUDE.md
 M Caddyfile
 M Dockerfile
 M Documents/README.md
 M Documents/deployment/OMNYID_CLOUD_SETUP_NOTES.md
 M Documents/deployment/OMNYID_ORACLE_DEPLOYMENT.md
 M Documents/deployment/OMNYID_WEBTRANSPORT_DEPLOYMENT.md
 M "Documents/design/agent/consumer agent use case/product gap/consumer agent use case product gap.md"
 M Documents/design/agent/design.md
 M "Documents/design/agent/proactive heuristics yet to be implemented.md"
 M "Documents/design/ui fixes.md"
 M "Documents/marketing/HackerNews reach out.txt"
 M Documents/marketing/OMNYID_LANDING_CONTENT_PROMPT.md
 M Documents/marketing/OMNYID_LANDING_DESIGN_PROMPT.md
 M Documents/phases/OMNYID_PHASE_0_5_AUDIT.md
 M Documents/phases/OMNYID_PHASE_10_PERSONALIZATION.md
 M Documents/phases/OMNYID_PHASE_11_KNOWLEDGE_CURATOR_DAEMONS.md
 M Documents/phases/OMNYID_PHASE_11_NATIVE_AFP_CAPABILITIES.md
 M Documents/phases/OMNYID_PHASE_12_KNOWLEDGE_CURATOR_ENHANCED.md
 M "Documents/phases/OMNYID_PHASE_13 considerations.md"
 M Documents/phases/OMNYID_PHASE_1_SCHEMA_FREEZE.md
 M Documents/phases/OMNYID_PHASE_2_CRYPTO.md
 M Documents/phases/OMNYID_PHASE_3_HOMESERVER_STORAGE.md
 M Documents/phases/OMNYID_PHASE_4_IDENTITY_DISCOVERY.md
 M Documents/phases/OMNYID_PHASE_5_EMAIL_GATEWAY.md
 M Documents/phases/OMNYID_PHASE_6_SDK_STABILIZATION.md
 M Documents/phases/OMNYID_PHASE_7_UI_FOUNDATION.md
 M Documents/phases/OMNYID_PHASE_8_ACTION_FRAMEWORK.md
 M Documents/phases/OMNYID_PHASE_9_ELECTRICSQL_SYNC.md
 M "Documents/prompt/OmnyID evolution prompt.md"
 M Documents/roadmap/OMNYID_EPHEMERAL_RETENTION_AND_OUTCOME_CENTRIC_IMPLEMENTATION_TASKS.md
 M Documents/roadmap/OMNYID_TASKS.md
 M "Documents/roadmap/slack app experience.md"
 M "Documents/roadmap/to do.txt"
 M Documents/specs/OMNYID_AFP_NODE_MESSAGE_SPEC.md
 M Documents/specs/OMNYID_STACK_VERSIONS.md
 M Documents/specs/OMNYID_TEMPLATE_AND_WORKFLOW_DEPENDENCY_PLAN.md
 M Documents/specs/OMNYID_VISUAL_WORKFLOW_BUILDER_PLAN.md
 M Documents/specs/OMNYID_WORKFLOW_SCHEMA_SPEC.md
 M Documents/specs/agent/OMNYID_AGENT_TEMPLATE_PLAN.md
 M Documents/specs/agent/OMNYID_SUBAGENT_TEMPLATE_SPEC.md
 M Documents/strategy/OMNYID_CONSUMER_PRIVACY_STRATEGY.md
 M Documents/strategy/OMNYID_PRODUCTION_DECISIONS.md
 M README.md
 M docker-compose.oracle.minimal.yml
 M docker-compose.oracle.quic.yml
 M docker-compose.oracle.yml
 M docker-compose.yml
 M docs/DESIGN_SYSTEM.md
 M docs/app.js
 M docs/index.html
 M docs/landing.md
 M oracle-cloud.env.example
 M oracle-cloud.quic.env.example
 M runtime-templates/python-runner-chat/starter_templates.json.tpl
 M scripts/get-gmail-token.py
 M scripts/install-omnyid-private.ps1
 M scripts/install-omnyid-private.sh
 M scripts/omnyid-backup.sh
 M scripts/omnyid-restore.sh
 M scripts/omnyid-upgrade.sh
 M solid-ui/dashboard.html
 M solid-ui/index.html
 M solid-ui/public/omnyid-logo.png
 M solid-ui/src/DashboardApp.tsx
 M solid-ui/src/components/AddCapabilityModal.tsx
 M solid-ui/src/components/AgentCardTile.tsx
 M solid-ui/src/components/AgentFleetView.tsx
 M solid-ui/src/components/AgentPersonaFAB.tsx
 M solid-ui/src/components/AgentPreferencesPanel.tsx
 M solid-ui/src/components/AgentPulse.tsx
 M solid-ui/src/components/AliasSettings.tsx
 M solid-ui/src/components/AlternateViewsInspector.tsx
 M solid-ui/src/components/BentoGrid.tsx
 M solid-ui/src/components/CofounderStudioView.tsx
 M solid-ui/src/components/DaemonPanel.tsx
 M solid-ui/src/components/DashboardFeed.tsx
 M solid-ui/src/components/DiscoverView.tsx
 M solid-ui/src/components/EmailView.tsx
 M solid-ui/src/components/FocusItemsPanel.tsx
 M solid-ui/src/components/GlassPanel.tsx
 M solid-ui/src/components/GuidedTour.tsx
 M solid-ui/src/components/KnowledgeGraphView.tsx
 M solid-ui/src/components/LoraStatusWidget.tsx
 M solid-ui/src/components/MaskSwitcher.tsx
 M solid-ui/src/components/MonthlyCalendarView.tsx
 M solid-ui/src/components/NavBar.tsx
 M solid-ui/src/components/NoteView.tsx
 M solid-ui/src/components/OnboardingWizard.tsx
 M solid-ui/src/components/PublicFeedView.tsx
 M solid-ui/src/components/PythonRunnerView.tsx
 M solid-ui/src/components/ResponseQueueSurface.tsx
 M solid-ui/src/components/ResponseQueueView.tsx
 M solid-ui/src/components/SearchBar.tsx
 M solid-ui/src/components/TaskDetailModal.tsx
 M solid-ui/src/components/ThreadMiniMap.tsx
 M solid-ui/src/components/ThreadView.tsx
 M solid-ui/src/components/ThreadsListView.tsx
 M solid-ui/src/components/UsageView.tsx
 M solid-ui/src/components/ViewDispatcher.tsx
 M solid-ui/src/components/renderers/A2UIRenderer.tsx
 M solid-ui/src/components/renderers/ApprovalsRenderer.tsx
 M solid-ui/src/components/renderers/AttachmentsRenderer.tsx
 M solid-ui/src/components/renderers/BlueprintRenderer.tsx
 M solid-ui/src/components/renderers/CalendarRenderer.tsx
 M solid-ui/src/components/renderers/CanvasRenderer.tsx
 M solid-ui/src/components/renderers/GenerativeCardRenderer.tsx
 M solid-ui/src/components/renderers/InboxRenderer.tsx
 M solid-ui/src/components/renderers/PresentationCardRenderer.tsx
 M solid-ui/src/components/renderers/PresentationCards.tsx
 M solid-ui/src/components/renderers/SearchResultRenderer.tsx
 M solid-ui/src/components/renderers/TableRenderer.tsx
 M solid-ui/src/components/renderers/TaskCardRenderer.tsx
 M solid-ui/src/lib/api.ts
 M solid-ui/src/lib/browserAi.ts
 M solid-ui/src/lib/costStrategy.ts
 M solid-ui/src/lib/decrypt.ts
 M solid-ui/src/lib/sync.ts
 M solid-ui/src/lib/voiceInput.ts
 M solid-ui/src/lib/workflowGraphTypes.ts
 M solid-ui/src/main.tsx
 M solid-ui/tsconfig.json
 M solid-ui/vite.config.ts
 M src/server/health.rs
 M "to do.txt"
 M typescript-sdk/package.json
 M typescript-sdk/src/index.ts
 M typescript-sdk/src/workflows.ts
 M ui/schema.ts
```

## Deleted Tracked Files

```text
 D "Documents/UI/UI refinement.md"
 D "Documents/design/Building a General-Purpose, Interactive Planning Assistant.md"
 D "Documents/design/calendar view.md"
 D "Documents/design/email design tasks.md"
 D "Documents/design/email view"
 D "Documents/design/note design tasks.md"
 D "Documents/design/proactive agent.md"
 D "Documents/design/space view.md"
 D Documents/handover/PHASE2_HANDOVER_2026-04-02.md
```

## Renamed / Copied Tracked Files

_None._

## Untracked Files

```text
.antigravity.md
.antigravitycli/
.claude/
.contextCLI/
.cursorrules
.guardpatch.yml
.mcp.json
.playwright-mcp/
.skillcapsule/
.smartlearn/
.tmp-debug-bash-selftest/
"AI Co-Founder Launch Template.txt"
"C\357\200\272UsersozansAppDataLocalTemprust-hygiene-regression-test/"
"Documents/Recommended Oracle Cloud Solutions.txt"
"Documents/UI/100 More UI Improvement Suggestions.md"
"Documents/UI/50 UI Improvement Suggestions.md"
"Documents/UI/Dashboard experience.md"
"Documents/UI/Implemented UI.txt"
Documents/UI/NANO_RESPONSIVE_TASKS.md
"Documents/UI/UI cards.md"
"Documents/UI/UI design principles.md"
"Documents/UI/agent to UI.md"
"Documents/UI/current capability for UI modification.md"
Documents/UI/procedural-symmetry.html
"Documents/UI/project use of solid js vs a2ui.md"
Documents/UI/ui_ux_first_time_use_skill.md
Documents/UX/50-ux-improvements-batch-2.md
Documents/UX/DECISION_OS_HOME_UX_IMPROVEMENTS.md
Documents/UX/ONBOARDING_API_KEYS_FINDINGS.md
Documents/UX/ONBOARDING_IMPLEMENTATION_SUMMARY.md
Documents/UX/UX_IMPROVEMENTS.md
Documents/afp/Moat/
"Documents/afp/The Cost of Fragmentation.md"
"Documents/afp/action tagging support.md"
"Documents/afp/afp structured bundling tasks.md"
"Documents/afp/afp the glue.md"
"Documents/afp/afp the unifying protocol.md"
"Documents/afp/agent federation protocol.md"
"Documents/afp/behaviour pattern temporal projection.md"
"Documents/afp/hierarchical supertags task plan.md"
"Documents/afp/high impact indexing retrieval.md"
"Documents/afp/memory workspace.md"
"Documents/afp/metadata and references.md"
"Documents/afp/separate index layer dependency ordered task plan.md"
"Documents/afp/separate index layer.md"
"Documents/afp/structured bundling.md"
"Documents/afp/unified object model schema.md"
"Documents/behaviour continuity afp message.docx"
Documents/chrome_plugin/
"Documents/competitor analysis/Losava analysis.txt"
"Documents/deployment/Cloud agent vs desktop agent.md"
"Documents/deployment/OMNYID Cloud user capacity.md"
Documents/deployment/OMNYID_ARCHITECTURE_FINDINGS.md
"Documents/deployment/VM docker schema.md"
"Documents/deployment/api usage costing.md"
Documents/design/GTD/
Documents/design/OMNYID_EVERYDAY_AUTOMATION_PLAN.md
Documents/design/PARA/
"Documents/design/agent/Background watcher agent prompt.md"
"Documents/design/agent/Building a General-Purpose, Interactive Planning Assistant.md"
"Documents/design/agent/Calculus inspired agent behaviour prompt.md"
Documents/design/agent/afp_coordination_wakeup_bridges.md
"Documents/design/agent/agent coordination plan.md"
"Documents/design/agent/agent intelligence improvements dependency ordered task plan.md"
"Documents/design/agent/agent interaction design.md"
"Documents/design/agent/agent orchestration/"
"Documents/design/agent/agent properties behavior capabilities.md"
Documents/design/agent/agent_intelligence_improvements.md
Documents/design/agent/agent_profiles_design.md
"Documents/design/agent/agentic interaction dependency ordered task list.md"
"Documents/design/agent/agentic interaction transformation plan.md"
Documents/design/agent/browser/
"Documents/design/agent/consumer agent use case/agent_reasoning_skills.md"
"Documents/design/agent/consumer agent use case/content_generation_skills.md"
"Documents/design/agent/consumer agent use case/orchestration_workaround.md"
"Documents/design/agent/decisionOS design.md"
"Documents/design/agent/decisionOS prompt.md"
Documents/design/agent/decisionOS_gap_analysis.md
Documents/design/agent/empathetic_memory_and_persona_design.md
"Documents/design/agent/intent routing/"
"Documents/design/agent/master agent.md"
Documents/design/agent/master_agent_process_flowchart.md
"Documents/design/agent/memory ledger and relationship ledger.md"
"Documents/design/agent/personal cognitive system.md"
"Documents/design/agent/proactive agent feel and architecture.md"
"Documents/design/agent/proactive agent prompt.md"
"Documents/design/agent/proactive agent.md"
Documents/design/agent/quarternion.md
"Documents/design/agent/smooth transitions.md"
"Documents/design/agent/state synthesizer agent and topology plan.md"
"Documents/design/agent/state synthesizer agent and topology task plan.md"
Documents/design/agent/threejs_a2ui_evaluation.md
"Documents/design/agent/winning agentic product design.md"
"Documents/design/content generation/"
"Documents/design/materialised index layer.md"
"Documents/design/middle layer/"
Documents/design/optional_action_index_value_integration_task_plan.md
Documents/design/optional_afp_index_value_integration_task_plan.md
"Documents/design/ui enhancements for warmth and transparency.md"
"Documents/design/value modelling.md"
Documents/design/views/
Documents/design/waiting_indicator.html
Documents/engineering/integrations/
Documents/features/
Documents/functional_features/
Documents/images/
Documents/issues/2026-06-30_runtime_security_audit_findings.md
Documents/issues/2026-07-01_alpha_beta_practical_value_and_kubernetes_readiness.md
Documents/issues/2026-07-14_skill_capsule_system_audit.md
Documents/issues/2026-07-26_study-planner-and-appointment-assistant-production-readiness-audit.md
Documents/issues/agent_vulnerabilities.md
Documents/issues/cloud-delivery-and-file-conversion-gaps.md
"Documents/issues/critical issues.md"
Documents/issues/gap-remediation-log.md
Documents/issues/migration-catalog-wired-feature-relevance.md
Documents/issues/personalos-background-automation-execution-plan-2026-07-17.md
Documents/issues/personalos-background-automation-first-slice-implementation-map-2026-07-17.md
Documents/issues/personalos-background-automation-gap-analysis-2026-07-17.md
Documents/issues/personalos-homepage-claim-audit-2026-07-17.md
Documents/issues/personalos-homepage-promise-implementation-map-2026-07-17.md
Documents/issues/production-readiness-gaps.md
Documents/issues/release-blocking-issues.md
Documents/issues/voice-input-audit.md
"Documents/marketing/200 word posts.docx"
"Documents/marketing/Claude Fable solopreneur strategy.md"
Documents/marketing/GTM-Strategy-Personal-DecisionOS-Solopreneur-2026-05.md
"Documents/marketing/Go to market strategy.docx"
Documents/marketing/OMNYID_AI_AGENT_AUDIENCE_SURVEY_20-26.md
Documents/marketing/OMNYID_IDEA_SET_PURPOSE_CHANNELS_DELIVERABLE.md
Documents/marketing/OMNYID_INITIAL_MOCKUP_PREVIEW_FIRST.html
Documents/marketing/OMNYID_LIVE_DEMO_AND_FEEDBACK_SYSTEM_DELIVERABLE.md
Documents/marketing/OMNYID_METRICS_REVIEW_PRESENTATION.html
Documents/marketing/OMNYID_PRICING_TEST_MOCKUP_18-26_NSW.md
Documents/marketing/OMNYID_PRODUCT_MARKET_FIT_ANALYSIS.md
Documents/marketing/OMNYID_REVENUE_MODEL_AND_PRICING.md
Documents/marketing/OMNYID_SPRINT_BUSINESS_VALIDATION_DELIVERABLE.md
Documents/marketing/OMNYID_TEAM_ONBOARDING_ALPHA_PLAN.md
"Documents/marketing/OmnyID marketing pitch.md"
"Documents/marketing/decisionOS design.docx"
"Documents/marketing/medical anki/"
Documents/marketing/omnyid-advisor-demo-brief.md
Documents/marketing/omnyid-beta-call-kit.md
Documents/marketing/omnyid-current-pitch-assets.md
Documents/marketing/pitch.txt
"Documents/marketing/pricing plan.md"
Documents/marketing/workflow-governance-audit.md
Documents/mermaid/
Documents/outreach/
Documents/personalOS/
Documents/phases/PHASE2_HANDOVER_2026-04-02.md
Documents/roadmap/cloud-delivery-and-upgrade-strategy.md
"Documents/roadmap/proactive agent builtin heuristic.md"
"Documents/roadmap/project evaluation 25052026.md"
Documents/roadmap/strategic-product-direction-2026.md
Documents/roadmap/user-profiling-and-proactive-engagement-tasks.md
Documents/roadmap/user-profiling-proactive-risks-gaps.md
Documents/security-vulnerabilities-2.html
Documents/security-vulnerabilities-3.html
Documents/security-vulnerabilities-4.html
Documents/security-vulnerabilities-5.html
Documents/security-vulnerabilities.html
Documents/strategy/ai_agent_market_strategy.md
Documents/terminology.md
Documents/tools/
Documents/user-profiling-test-plan.html
Documents/user/
Documents/workspace-pro-manual(1).html
LOCS_REGISTRY.md
LOCS_SESSION_INIT.md
LOCS_SKILL.md
"Runpod api.txt"
artifacts/commercial-readiness-current/
artifacts/commercial-readiness-snapshot-current-explicit/
artifacts/commercial-readiness-snapshot-current/
artifacts/commercial-readiness-snapshot-detached-ready/
artifacts/commercial-readiness-snapshot-fast-current/
artifacts/commercial-readiness-snapshot-live-postcleanup/
artifacts/commercial-readiness-snapshot-postcleanup-20260818T0901Z/
artifacts/commercial-readiness-snapshot-postcleanup-20260818T0918Z/
artifacts/commercial-readiness-snapshot-postpatch-20260818T0925Z/
artifacts/commercial-readiness-snapshot-postpatch-20260818T0932Z/
artifacts/commercial-readiness-snapshot-postpatch-20260818T0936Z/
artifacts/commercial-readiness-snapshot-strict-current/
artifacts/commercial-readiness-snapshot-supabase-target-current/
artifacts/frontend-correctness-current/
artifacts/oracle-production-proof-after-backup-fix/
artifacts/oracle-production-proof-after-backup/
artifacts/oracle-production-proof-after-manual-backup/
artifacts/oracle-production-proof-backup-only/
artifacts/oracle-production-proof-current/
artifacts/oracle-production-proof-deploy-wedding-20260926/
artifacts/oracle-production-proof-deploy/
artifacts/oracle-production-proof-detached-smoke/
artifacts/oracle-production-proof-diagnostic-current/
artifacts/oracle-production-proof-direct-backup/
artifacts/oracle-production-proof-fast-current/
artifacts/oracle-production-proof-live-current/
artifacts/oracle-production-proof-manual-check/
artifacts/oracle-production-proof-optimized-current/
artifacts/oracle-production-proof-postcleanup-20260818T0901Z/
artifacts/oracle-production-proof-postcleanup-20260818T0918Z/
artifacts/oracle-production-proof-postcleanup-current/
artifacts/oracle-production-proof-postpatch-20260818T0936Z/
artifacts/oracle-production-proof-preflight-current/
artifacts/oracle-production-proof-real-backup/
artifacts/oracle-production-proof-restored-detached/
artifacts/oracle-production-proof-restored/
artifacts/oracle-production-proof-verified-backup/
artifacts/oracle-remediation-sequence-current/
artifacts/oracle-remediation-sequence-detached-ready/
artifacts/oracle-remediation-sequence-postpatch-20260818T0932Z/
artifacts/oracle-remediation-sequence-supabase-target-current/
artifacts/oracle-runtime-cleanup-execute-current/
artifacts/oracle-runtime-cleanup-execute-detached-ready/
artifacts/oracle-runtime-cleanup-execute-hostlogs-current/
artifacts/oracle-runtime-cleanup-execute-live-current/
artifacts/oracle-runtime-cleanup-execute-refresh-20260818T0914Z/
artifacts/oracle-runtime-cleanup-execute-rerun-20260818T0900Z/
artifacts/oracle-runtime-cleanup-plan-current/
artifacts/oracle-runtime-cleanup-plan-detached-ready/
artifacts/oracle-runtime-cleanup-plan-live-current/
artifacts/oracle-runtime-cleanup-plan-postcleanup-20260818T0901Z/
artifacts/oracle-runtime-cleanup-plan-postcleanup-20260818T0918Z/
artifacts/oracle-runtime-cleanup-plan-postpatch-20260818T0932Z/
artifacts/oracle-runtime-cleanup-plan-refresh-20260818T0912Z/
artifacts/oracle-runtime-cleanup-plan-rerun-20260818T0900Z/
artifacts/oracle-runtime-cleanup-plan-supabase-target-current/
artifacts/oracle-runtime-inventory-current/
artifacts/oracle-runtime-inventory-detached-ready/
artifacts/oracle-runtime-inventory-live-current/
artifacts/oracle-runtime-inventory-post-hardened-proof/
artifacts/oracle-runtime-inventory-post-hostlogs/
artifacts/oracle-runtime-inventory-post-restore-cleanup/
artifacts/oracle-runtime-inventory-postcleanup-20260818T0901Z/
artifacts/oracle-runtime-inventory-postcleanup-20260818T0918Z/
artifacts/oracle-runtime-inventory-postcleanup-current/
artifacts/oracle-runtime-inventory-postpatch-20260818T0925Z/
artifacts/oracle-runtime-inventory-postprune/
artifacts/oracle-runtime-inventory-refresh-20260818T0910Z/
artifacts/oracle-runtime-inventory-supabase-target-current/
artifacts/oracle-runtime-stage-current/
artifacts/personalos-readiness-audit-current/
artifacts/production-go-no-go-current/
artifacts/production-go-no-go-detached-ready/
artifacts/production-go-no-go-fast-current/
artifacts/production-go-no-go-live-postcleanup/
artifacts/production-go-no-go-strict-current/
artifacts/production-go-no-go-strict/
artifacts/production-readiness-refresh-current-auto-strict/
artifacts/production-readiness-refresh-current/
artifacts/production-readiness-refresh-detached-current/
artifacts/production-readiness-refresh-detached-fast/
artifacts/production-readiness-refresh-detached-live/
artifacts/production-readiness-refresh-fast-auto-strict/
artifacts/production-readiness-refresh-live-current/
artifacts/production-readiness-refresh-strict-current/
artifacts/production-readiness-refresh-strict/
artifacts/release-readiness-current-agent-pass/
artifacts/release-readiness-current/
artifacts/release-readiness-pass3/
artifacts/storage-hygiene-report-benchmark-after3/
artifacts/storage-hygiene-report-benchmark-final/
artifacts/storage-hygiene-report-benchmark/
artifacts/storage-hygiene-report-current/
backups/
dev.ps1
doc_ignore/
docs/.well-known/
docs/A2UI_CONTRACT.md
docs/COMMERCIAL_READINESS_STATUS.md
docs/PRODUCTION_ROLLOUT_RUNBOOK.md
docs/RUST_HYGIENE.md
docs/SKILL_MANAGEMENT_A2UI.md
docs/architecture.md
docs/data-rights.html
docs/genesis-logo.js
docs/nemotron-challenge-roadmap.md
docs/personalos-homepage.tsx
docs/privacy.html
docs/reset-password.html
docs/security.html
docs/terms.html
financials/
fix_one.py
hooks/
infra/
logo/
mcp-servers/
package-lock.json
prompts/
python-sdk/afp/capabilities/
python-sdk/afp/executors/image_generate.py
python-sdk/afp/integrations/
python-sdk/afp/session_crypto.py
python-sdk/afp/storage/
rule.md
scripts/apply-training-migrations.sh
scripts/audit_sft_corpus.py
scripts/commercial-readiness-snapshot-pwsh-selftest.ps1
scripts/commercial-readiness-snapshot.ps1
scripts/convert-kaggle-dataset.sh
scripts/evaluate_lora_checkpoints.py
scripts/filter_sft_by_length.py
scripts/frontend-correctness-pwsh-selftest.ps1
scripts/frontend-correctness.ps1
scripts/frontend-correctness.sh
scripts/migrate-env-secrets-to-files.ps1
scripts/nemotron-lora-train.sh
scripts/omnyid-backup-verify-selftest.sh
scripts/omnyid-prune-daemon-heartbeats-selftest.sh
scripts/omnyid-prune-operational-history.sh
scripts/omnyid-prune-synthetic-message-spam-selftest.sh
scripts/omnyid-prune-synthetic-message-spam.sh
scripts/omnyid-restore-drill-selftest.sh
scripts/omnyid-restore-selftest.sh
scripts/oracle-production-proof-pwsh-selftest.ps1
scripts/oracle-prune-daemon-heartbeats-pwsh-selftest.ps1
scripts/oracle-prune-daemon-heartbeats.ps1
scripts/oracle-prune-operational-history-pwsh-selftest.ps1
scripts/oracle-prune-operational-history.ps1
scripts/oracle-prune-synthetic-message-spam-pwsh-selftest.ps1
scripts/oracle-prune-synthetic-message-spam.ps1
scripts/oracle-remediate-electric-slot-pwsh-selftest.ps1
scripts/oracle-remediation-sequence-pwsh-selftest.ps1
scripts/oracle-remediation-sequence.ps1
scripts/oracle-runtime-cleanup-execute-pwsh-selftest.ps1
scripts/oracle-runtime-cleanup-execute.ps1
scripts/oracle-runtime-cleanup-plan-pwsh-selftest.ps1
scripts/oracle-runtime-cleanup-plan.ps1
scripts/oracle-runtime-contract.ps1
scripts/oracle-runtime-inventory-pwsh-selftest.ps1
scripts/oracle-runtime-inventory.ps1
scripts/oracle-secret-sync.ps1
scripts/pdf-from-html.mjs
scripts/personalos-readiness-audit-pwsh-selftest.ps1
scripts/personalos-readiness-audit.ps1
scripts/phase0-cot-generate.py
scripts/phase0_diagnostic_probe.py
scripts/phase0_solver_augment.py
scripts/phase0_solver_backfill.py
scripts/phase1-sft-train.py
scripts/phase2-grpo-train.py
scripts/prepare_sft_data.py
scripts/production-go-no-go-pwsh-selftest.ps1
scripts/production-go-no-go.ps1
scripts/production-readiness-refresh-pwsh-selftest.ps1
scripts/production-readiness-refresh-status-pwsh-selftest.ps1
scripts/production-readiness-refresh-status.ps1
scripts/production-readiness-refresh.ps1
scripts/prune-curator-artifact-spam.sql
scripts/prune-ingestion-topology-spam.sql
scripts/prune-maintenance-summary-spam.sql
scripts/prune-operational-history.sql
scripts/release-readiness-pwsh-selftest.ps1
scripts/release-readiness-selftest.sh
scripts/release-readiness.ps1
scripts/release-readiness.sh
scripts/runpod-autopilot.sh
scripts/rust-correctness.ps1
scripts/rust-correctness.sh
scripts/rust-hygiene-baseline.env
scripts/rust-hygiene-no-regression.sh
scripts/rust-hygiene-pwsh-selftest.ps1
scripts/rust-hygiene-refresh-baseline.sh
scripts/rust-hygiene-selftest.sh
scripts/rust-hygiene.ps1
scripts/rust-hygiene.sh
scripts/start-semantic-omnyid.ps1
scripts/start-training.sh
scripts/storage-hygiene-report-pwsh-selftest.ps1
scripts/storage-hygiene-report.ps1
scripts/test_backends.py
skills/
solid-ui/_tmp_shoot.mjs
solid-ui/public/favicon.svg
solid-ui/public/icons/
solid-ui/public/logo-animation.html
solid-ui/public/manifest.webmanifest
solid-ui/public/pdf.worker.min.mjs
solid-ui/public/sw.js
solid-ui/src/appEvents.d.ts
solid-ui/src/components/AddCustomViewModal.tsx
solid-ui/src/components/AgentTriggersView.tsx
solid-ui/src/components/AutomationsView.tsx
solid-ui/src/components/ClaimNeighborhoodInspector.tsx
solid-ui/src/components/CognitiveBentoRow.tsx
solid-ui/src/components/DailyBriefingBar.tsx
solid-ui/src/components/DecisionOSHomeView.tsx
solid-ui/src/components/DurationTabs.tsx
solid-ui/src/components/FirstRunExperience.tsx
solid-ui/src/components/InlineEntityInspector.tsx
solid-ui/src/components/MagicPointer.tsx
solid-ui/src/components/OperationalPressureRow.tsx
solid-ui/src/components/PlanningView.tsx
solid-ui/src/components/QueueOverloadBanner.tsx
solid-ui/src/components/RenderRoutingSummary.tsx
solid-ui/src/components/SocialComposerView.tsx
solid-ui/src/components/SystemSettingsView.tsx
solid-ui/src/components/TokenBudgetBar.tsx
solid-ui/src/components/UsageBillingSection.tsx
solid-ui/src/components/UsageBillingSummaryGrid.tsx
solid-ui/src/components/UsageExternalToolBillingSection.tsx
solid-ui/src/components/UsageExternalToolCostTrustPanel.tsx
solid-ui/src/components/UsageExternalToolOverviewGrid.tsx
solid-ui/src/components/UsageExternalToolSummaryPanels.tsx
solid-ui/src/components/UsageExternalToolUsagePanels.tsx
solid-ui/src/components/UsageFeaturedRuntimeRemediationCard.tsx
solid-ui/src/components/UsageOperationalGuidanceCard.tsx
solid-ui/src/components/UsageOperatorMetricsGrid.tsx
solid-ui/src/components/UsageOperatorOverviewSection.tsx
solid-ui/src/components/UsageOperatorProfitabilityPanel.tsx
solid-ui/src/components/UsageOperatorSection.tsx
solid-ui/src/components/UsageOperatorUserDetailPanel.tsx
solid-ui/src/components/UsageOperatorUserFilterForm.tsx
solid-ui/src/components/UsageOperatorUserSummaryPanel.tsx
solid-ui/src/components/UsagePaymentSetupSection.tsx
solid-ui/src/components/UsageRuntimeRemediationEmptyState.tsx
solid-ui/src/components/UsageRuntimeRemediationFeed.tsx
solid-ui/src/components/UsageRuntimeRemediationHistoryPanel.tsx
solid-ui/src/components/UsageRuntimeRemediationRow.tsx
solid-ui/src/components/UsageStatusMessageCard.tsx
solid-ui/src/components/UsageStoragePolicySection.tsx
solid-ui/src/components/WelcomeScreen.tsx
solid-ui/src/components/WorkflowRunBranchFocusPanel.tsx
solid-ui/src/components/WorkflowRunDetailHeaderPanel.tsx
solid-ui/src/components/WorkflowRunExecutionLogPanel.tsx
solid-ui/src/components/WorkflowRunFamilyContextPanel.tsx
solid-ui/src/components/WorkflowRunHistoryCard.tsx
solid-ui/src/components/WorkflowRunLiveExecutionPanel.tsx
solid-ui/src/components/WorkflowRunOverviewPanel.tsx
solid-ui/src/components/WorkflowRunPolicyDriftSummaryPanel.tsx
solid-ui/src/components/WorkflowRunStatusContextPanel.tsx
solid-ui/src/components/WorkflowRunStructuredResultPanel.tsx
solid-ui/src/components/WorkflowRunTimelineReviewHeader.tsx
solid-ui/src/components/WorkflowRunTimelineStatsPanel.tsx
solid-ui/src/components/WorkflowRunTimelineStepCard.tsx
solid-ui/src/components/WorkflowRunWaitResumePanel.tsx
solid-ui/src/components/WorkflowValidationPanel.tsx
solid-ui/src/components/agents/
solid-ui/src/components/dev/
solid-ui/src/components/editor/A2UI_USAGE.md
solid-ui/src/components/editor/AgentImproveButton.tsx
solid-ui/src/components/editor/tokens.ts
solid-ui/src/components/renderers/A2UIExtendedCards.tsx
solid-ui/src/components/renderers/A2UIFlowchartView.tsx
solid-ui/src/components/renderers/A2UIFormulaField.tsx
solid-ui/src/components/renderers/A2UISequenceStepper.tsx
solid-ui/src/components/renderers/FormulaRenderer.tsx
solid-ui/src/components/renderers/InlineEntityText.tsx
solid-ui/src/components/renderers/MapRenderer.tsx
solid-ui/src/components/renderers/SupertagGridRenderer.tsx
solid-ui/src/directives/
solid-ui/src/lib/actionChipEvent.ts
solid-ui/src/lib/adminThirdPartyToolPolicyState.ts
solid-ui/src/lib/afpRetentionLocalState.ts
solid-ui/src/lib/agentApprovalCopy.ts
solid-ui/src/lib/agentDashboardActionFailureState.ts
solid-ui/src/lib/agentDashboardBudgetFailureState.ts
solid-ui/src/lib/agentDashboardLoadFailureState.ts
solid-ui/src/lib/agentDashboardLocalState.ts
solid-ui/src/lib/agentDashboardSkillsFailureState.ts
solid-ui/src/lib/agentPulseFailureState.ts
solid-ui/src/lib/agentPulseState.ts
solid-ui/src/lib/agentTriggerCardState.ts
solid-ui/src/lib/agentTriggerConfig.ts
solid-ui/src/lib/agentTriggerGrouping.ts
solid-ui/src/lib/agentTriggerKindPresentation.ts
solid-ui/src/lib/agentTriggerObjectiveInference.ts
solid-ui/src/lib/agentTriggerRunCountPresentation.ts
solid-ui/src/lib/agentTriggerRunPresentation.ts
solid-ui/src/lib/agentTriggerSchedulePresentation.ts
solid-ui/src/lib/agentTriggerSummaryPresentation.ts
solid-ui/src/lib/agentTriggerTemplates.ts
solid-ui/src/lib/agentTriggerTime.ts
solid-ui/src/lib/agentTriggersFailureState.ts
solid-ui/src/lib/agentTriggersViewState.ts
solid-ui/src/lib/apiBaseState.ts
solid-ui/src/lib/appCommandPanelState.d.ts
solid-ui/src/lib/automationsLocalState.ts
solid-ui/src/lib/billingStateMetadata.ts
solid-ui/src/lib/billingUsageSectionState.ts
solid-ui/src/lib/claimNeighborhoodFailureState.ts
solid-ui/src/lib/claimNeighborhoodPreferenceState.ts
solid-ui/src/lib/commandBoundaries.ts
solid-ui/src/lib/commandPreviewMessageState.d.ts
solid-ui/src/lib/commandPreviewRouting.d.ts
solid-ui/src/lib/composeQueryFragmentEvent.ts
solid-ui/src/lib/costBudgetResponseState.ts
solid-ui/src/lib/customViewStorage.ts
solid-ui/src/lib/daemonPanelFailureState.ts
solid-ui/src/lib/dailyBriefingFailureState.ts
solid-ui/src/lib/dailyBriefingState.ts
solid-ui/src/lib/decisionOsApproveFlowController.ts
solid-ui/src/lib/decisionOsBriefingInteractionState.ts
solid-ui/src/lib/decisionOsBriefingState.ts
solid-ui/src/lib/decisionOsCelebrationState.ts
solid-ui/src/lib/decisionOsCognitiveBentoState.ts
solid-ui/src/lib/decisionOsConfettiEffect.d.ts
solid-ui/src/lib/decisionOsConfettiEffect.js
solid-ui/src/lib/decisionOsConfidencePopoverState.ts
solid-ui/src/lib/decisionOsConfidenceState.ts
solid-ui/src/lib/decisionOsContextAnnotations.ts
solid-ui/src/lib/decisionOsContextNavigationState.ts
solid-ui/src/lib/decisionOsContinuityMergeState.ts
solid-ui/src/lib/decisionOsCostStatusState.ts
solid-ui/src/lib/decisionOsDecisionActionEffectState.d.ts
solid-ui/src/lib/decisionOsDecisionActionEffectState.js
solid-ui/src/lib/decisionOsDecisionActionExecutionState.d.ts
solid-ui/src/lib/decisionOsDecisionActionExecutionState.js
solid-ui/src/lib/decisionOsDecisionActionPlan.ts
solid-ui/src/lib/decisionOsDecisionActionState.ts
solid-ui/src/lib/decisionOsDecisionCardContextPreviewState.ts
solid-ui/src/lib/decisionOsDecisionCardInsightState.ts
solid-ui/src/lib/decisionOsDecisionCardState.ts
solid-ui/src/lib/decisionOsDecisionContextState.ts
solid-ui/src/lib/decisionOsDiaryState.d.ts
solid-ui/src/lib/decisionOsEventBridgeState.ts
solid-ui/src/lib/decisionOsFocusOverlayState.ts
solid-ui/src/lib/decisionOsGoalBreakdownModalState.ts
solid-ui/src/lib/decisionOsGoalScheduleState.ts
solid-ui/src/lib/decisionOsHomeBridgeController.ts
solid-ui/src/lib/decisionOsHomeEffects.d.ts
solid-ui/src/lib/decisionOsHomeEffects.js
solid-ui/src/lib/decisionOsHomeFollowUpState.d.ts
solid-ui/src/lib/decisionOsHomeFollowUpState.js
solid-ui/src/lib/decisionOsHomeOptionsState.ts
solid-ui/src/lib/decisionOsHomePresentationState.ts
solid-ui/src/lib/decisionOsInterfaceCopy.ts
solid-ui/src/lib/decisionOsKeyboardExecutionState.ts
solid-ui/src/lib/decisionOsKeyboardIntentState.ts
solid-ui/src/lib/decisionOsKeyboardState.ts
solid-ui/src/lib/decisionOsMagicExecutionState.ts
solid-ui/src/lib/decisionOsMoodState.ts
solid-ui/src/lib/decisionOsOperationalPressureState.ts
solid-ui/src/lib/decisionOsOutcomeCheckState.d.ts
solid-ui/src/lib/decisionOsOutcomeCheckState.js
solid-ui/src/lib/decisionOsPriorityDisplayState.ts
solid-ui/src/lib/decisionOsProgressState.ts
solid-ui/src/lib/decisionOsQueueInteractionState.ts
solid-ui/src/lib/decisionOsQueueLoadState.ts
solid-ui/src/lib/decisionOsResolvedUpdateState.ts
solid-ui/src/lib/decisionOsSelectionState.ts
solid-ui/src/lib/decisionOsSnoozeState.d.ts
solid-ui/src/lib/decisionOsSnoozeState.js
solid-ui/src/lib/decisionOsSwipeState.ts
solid-ui/src/lib/decisionOsToastController.ts
solid-ui/src/lib/decisionOsUpdateApplicationState.ts
solid-ui/src/lib/decisionosEnergy.ts
solid-ui/src/lib/externalToolBillingCoverageState.ts
solid-ui/src/lib/externalToolBillingViewState.ts
solid-ui/src/lib/externalToolUsageSectionState.ts
solid-ui/src/lib/fileConversionCatalog.ts
solid-ui/src/lib/firstRunExperienceFailureState.ts
solid-ui/src/lib/firstRunExperienceLocalState.ts
solid-ui/src/lib/focusItemsFailureState.ts
solid-ui/src/lib/fontBodyPreference.ts
solid-ui/src/lib/fontScalePreference.ts
solid-ui/src/lib/goalBreakdownEvent.ts
solid-ui/src/lib/gridMutationFailureState.ts
solid-ui/src/lib/inlineEntityActions.ts
solid-ui/src/lib/inlineEntityEvent.ts
solid-ui/src/lib/inlineEntityKinds.ts
solid-ui/src/lib/inlineEntityLocalState.ts
solid-ui/src/lib/inlineEntityPreferenceEvent.ts
solid-ui/src/lib/inlineEntityPresentation.ts
solid-ui/src/lib/inlineEntitySegmentation.ts
solid-ui/src/lib/localRouterCompanionState.d.ts
solid-ui/src/lib/localRouterCopy.d.ts
solid-ui/src/lib/mapConfig.ts
solid-ui/src/lib/mapRendererFailureState.ts
solid-ui/src/lib/medicalConceptGraphCapabilityState.ts
solid-ui/src/lib/medicalFactVerificationAfpProjectionState.ts
solid-ui/src/lib/noteEditorEvents.ts
solid-ui/src/lib/noteHistoryLocalState.ts
solid-ui/src/lib/operationalPressureCardTrustState.ts
solid-ui/src/lib/operatorAdminPresentationState.ts
solid-ui/src/lib/operatorRuntimeRemediationDraftState.ts
solid-ui/src/lib/operatorRuntimeRemediationLocalState.ts
solid-ui/src/lib/operatorRuntimeRemediationShortcutState.ts
solid-ui/src/lib/operatorRuntimeRemediationViewState.ts
solid-ui/src/lib/operatorUsageSectionState.ts
solid-ui/src/lib/orchestrationPanelState.d.ts
solid-ui/src/lib/outcomeCheckEvent.ts
solid-ui/src/lib/planningFailureState.ts
solid-ui/src/lib/planningViewState.ts
solid-ui/src/lib/popoverPosition.ts
solid-ui/src/lib/searchPreviewState.d.ts
solid-ui/src/lib/searchResultPanelState.d.ts
solid-ui/src/lib/socialComposerFailureState.ts
solid-ui/src/lib/socialComposerViewState.ts
solid-ui/src/lib/supertagGridLocalState.ts
solid-ui/src/lib/supertagGridRuntimeState.ts
solid-ui/src/lib/tokenBudgetFailureState.ts
solid-ui/src/lib/usageBillingSummaryState.ts
solid-ui/src/lib/usageStorageState.ts
solid-ui/src/lib/usageViewAsyncActionState.ts
solid-ui/src/lib/usageViewBillingActionHandlers.ts
solid-ui/src/lib/usageViewBillingMountedState.ts
solid-ui/src/lib/usageViewBindingsState.ts
solid-ui/src/lib/usageViewFailureState.ts
solid-ui/src/lib/usageViewFormattingState.ts
solid-ui/src/lib/usageViewInteractionState.ts
solid-ui/src/lib/usageViewOperatorActionHandlers.ts
solid-ui/src/lib/usageViewOperatorInteractionState.ts
solid-ui/src/lib/usageViewOperatorLocalPersistence.ts
solid-ui/src/lib/usageViewOperatorMountedState.ts
solid-ui/src/lib/usageViewOperatorRemediationPersistenceState.ts
solid-ui/src/lib/usageViewOperatorRemediationSyncState.ts
solid-ui/src/lib/usageViewOperatorRuntimeRemediationHandlers.ts
solid-ui/src/lib/usageViewOperatorUiHandlers.ts
solid-ui/src/lib/usageViewRenderActionState.ts
solid-ui/src/lib/usageViewResourceState.ts
solid-ui/src/lib/usageViewSectionPropsState.ts
solid-ui/src/lib/usageViewSharedState.ts
solid-ui/src/lib/usageViewStateCommitters.ts
solid-ui/src/lib/welcomeScreenFailureState.ts
solid-ui/src/lib/workflowApprovalPanelState.ts
solid-ui/src/lib/workflowHistoryCopy.ts
solid-ui/src/lib/workflowTimelineCardPresentation.ts
solid-ui/src/lib/workflowTimelineTriggerPresentation.ts
solid-ui/src/lib/workflowWaitResumeFailureState.ts
solid-ui/src/types/d3-shim.d.ts
solid-ui/src/types/mathlive.d.ts
solid-ui/src/types/speech-recognition.d.ts
solid-ui/src/vendor.d.ts
solid-ui/tests/a2ui-content-state.test.ts
solid-ui/tests/a2ui-diff-view-state.test.ts
solid-ui/tests/a2ui-events.test.ts
solid-ui/tests/a2ui-rich-text-editor-state.test.ts
solid-ui/tests/account-scoped-storage.test.ts
solid-ui/tests/action-chip-event.test.ts
solid-ui/tests/active-goals-response-state.test.ts
solid-ui/tests/add-capability-failure-state.test.ts
solid-ui/tests/add-capability-state.test.ts
solid-ui/tests/admin-third-party-tool-policy-state.test.ts
solid-ui/tests/afp-inspect-event.test.ts
solid-ui/tests/afp-retention-local-state.test.ts
solid-ui/tests/agent-approval-copy.test.ts
solid-ui/tests/agent-dashboard-action-failure-state.test.ts
solid-ui/tests/agent-dashboard-budget-failure-state.test.ts
solid-ui/tests/agent-dashboard-load-failure-state.test.ts
solid-ui/tests/agent-dashboard-local-state.test.ts
solid-ui/tests/agent-dashboard-skills-failure-state.test.ts
solid-ui/tests/agent-fleet-failure-state.test.ts
solid-ui/tests/agent-fleet-presentation-state.test.ts
solid-ui/tests/agent-fleet-response-state.test.ts
solid-ui/tests/agent-fleet-view-state.test.ts
solid-ui/tests/agent-preferences-failure-state.test.ts
solid-ui/tests/agent-pulse-failure-state.test.ts
solid-ui/tests/agent-pulse-state.test.ts
solid-ui/tests/agent-response-style.test.ts
solid-ui/tests/agent-settings-async-state.test.ts
solid-ui/tests/agent-settings-capability-failure-state.test.ts
solid-ui/tests/agent-settings-capability-import-state.test.ts
solid-ui/tests/agent-settings-capability-usage-state.test.ts
solid-ui/tests/agent-settings-device-policy-failure-state.test.ts
solid-ui/tests/agent-settings-identity-failure-state.test.ts
solid-ui/tests/agent-settings-identity-utility-failure-state.test.ts
solid-ui/tests/agent-settings-llm-failure-state.test.ts
solid-ui/tests/agent-settings-local-state.test.ts
solid-ui/tests/agent-settings-runtime-failure-state.test.ts
solid-ui/tests/agent-settings-soul-failure-state.test.ts
solid-ui/tests/agent-settings-summary-rows-state.test.ts
solid-ui/tests/agent-settings-view-state.test.ts
solid-ui/tests/agent-trigger-card-state.test.ts
solid-ui/tests/agent-trigger-config.test.ts
solid-ui/tests/agent-trigger-grouping.test.ts
solid-ui/tests/agent-trigger-kind-presentation.test.ts
solid-ui/tests/agent-trigger-objective-inference.test.ts
solid-ui/tests/agent-trigger-response-state.test.ts
solid-ui/tests/agent-trigger-run-count-presentation.test.ts
solid-ui/tests/agent-trigger-run-presentation.test.ts
solid-ui/tests/agent-trigger-schedule-presentation.test.ts
solid-ui/tests/agent-trigger-summary-presentation.test.ts
solid-ui/tests/agent-trigger-templates.test.ts
solid-ui/tests/agent-trigger-time.test.ts
solid-ui/tests/agent-triggers-failure-state.test.ts
solid-ui/tests/agent-triggers-view-state.test.ts
solid-ui/tests/alias-settings-failure-state.test.ts
solid-ui/tests/alias-settings-state.test.ts
solid-ui/tests/api-base-state.test.ts
solid-ui/tests/api-response-normalizers.test.ts
solid-ui/tests/api-session-event.test.ts
solid-ui/tests/app-chrome-local-state.test.ts
solid-ui/tests/app-command-panel-state.test.ts
solid-ui/tests/approval-card-failure-state.test.ts
solid-ui/tests/approval-review-message-state.test.ts
solid-ui/tests/approval-review-state.test.ts
solid-ui/tests/approval-review-summary-state.test.ts
solid-ui/tests/approvals-renderer-dedup-state.test.ts
solid-ui/tests/approvals-renderer-state.test.ts
solid-ui/tests/async-request-state.test.ts
solid-ui/tests/attachment-capability-state.test.ts
solid-ui/tests/attachment-grounding-evidence.test.ts
solid-ui/tests/attachment-policy-moment-state.test.ts
solid-ui/tests/attachment-preview-source.test.ts
solid-ui/tests/attachment-retention-decision-state.test.ts
solid-ui/tests/attachments-renderer-failure-state.test.ts
solid-ui/tests/auth-response-state.test.ts
solid-ui/tests/automations-local-state.test.ts
solid-ui/tests/autonomy-decision-state.test.ts
solid-ui/tests/bento-grid-local-state.test.ts
solid-ui/tests/billing-operational-guidance-state.test.ts
solid-ui/tests/billing-state-metadata.test.ts
solid-ui/tests/billing-upgrade-state.test.ts
solid-ui/tests/billing-usage-section-state.test.ts
solid-ui/tests/browser-ai.test.ts
solid-ui/tests/change-proposal-failure-state.test.ts
solid-ui/tests/claim-neighborhood-failure-state.test.ts
solid-ui/tests/claim-neighborhood-preference-state.test.ts
solid-ui/tests/cofounder-studio-failure-state.test.ts
solid-ui/tests/cofounder-studio-stream-state.test.ts
solid-ui/tests/command-boundaries.test.ts
solid-ui/tests/command-preview-message-state.test.ts
solid-ui/tests/command-preview-routing.test.ts
solid-ui/tests/command-search-failure-state.test.ts
solid-ui/tests/compose-query-fragment-event.test.ts
solid-ui/tests/composio-callback-state.test.ts
solid-ui/tests/connected-apps-catalog.test.ts
solid-ui/tests/connected-apps-state.test.ts
solid-ui/tests/connected-apps-storage.test.ts
solid-ui/tests/connected-apps-view-model.test.ts
solid-ui/tests/contact-engagement-state.test.ts
solid-ui/tests/contact-follow-up-outcome-projection-state.test.ts
solid-ui/tests/contact-follow-up-outcome-state.test.ts
solid-ui/tests/contact-follow-up-queue-state.test.ts
solid-ui/tests/contact-follow-up-task-dispatch-state.test.ts
solid-ui/tests/contact-follow-up-task-projection-state.test.ts
solid-ui/tests/contact-import-state.test.ts
solid-ui/tests/contact-outreach-health-projection-state.test.ts
solid-ui/tests/contact-outreach-health-state.test.ts
solid-ui/tests/contact-response-evidence-projection-state.test.ts
solid-ui/tests/contact-response-summary-state.test.ts
solid-ui/tests/contacts-failure-state.test.ts
solid-ui/tests/contacts-local-state-phone.test.ts
solid-ui/tests/contacts-local-state.test.ts
solid-ui/tests/conversation-attention-presentation.test.ts
solid-ui/tests/cost-budget-response-state.test.ts
solid-ui/tests/cost-dashboard-budget-gauge-state.test.ts
solid-ui/tests/cost-dashboard-failure-state.test.ts
solid-ui/tests/cost-dashboard-llm-state.test.ts
solid-ui/tests/cost-dashboard-pacing-state.test.ts
solid-ui/tests/cost-dashboard-profit-state.test.ts
solid-ui/tests/cost-dashboard-spend-history-state.test.ts
solid-ui/tests/cost-dashboard-summary-state.test.ts
solid-ui/tests/cost-dashboard-usage-guard-state.test.ts
solid-ui/tests/cost-dashboard-view-state.test.ts
solid-ui/tests/cost-trust-state.test.ts
solid-ui/tests/custom-view-storage.test.ts
solid-ui/tests/daemon-panel-failure-state.test.ts
solid-ui/tests/daily-briefing-failure-state.test.ts
solid-ui/tests/daily-briefing-state.test.ts
solid-ui/tests/dashboard-bootstrap-state.test.ts
solid-ui/tests/dashboard-feed-activity-spark.test.ts
solid-ui/tests/dashboard-feed-card-presentation.test.ts
solid-ui/tests/dashboard-feed-cards.test.ts
solid-ui/tests/dashboard-feed-layout.test.ts
solid-ui/tests/dashboard-feed-pinned-nav.test.ts
solid-ui/tests/dashboard-feed-resource-state.test.ts
solid-ui/tests/dashboard-feed-scope-state.test.ts
solid-ui/tests/dashboard-feed-storage.test.ts
solid-ui/tests/dashboard-feed-summary-state.test.ts
solid-ui/tests/dashboard-feed-thread-summaries.test.ts
solid-ui/tests/dashboard-feed-topic-lens.test.ts
solid-ui/tests/dashboard-refresh-event.test.ts
solid-ui/tests/database-view-failure-state.test.ts
solid-ui/tests/database-view-state.test.ts
solid-ui/tests/decision-queue-model.test.ts
solid-ui/tests/decision-queue-navigation.test.ts
solid-ui/tests/decision-queue-presentation-state.test.ts
solid-ui/tests/decisionos-approve-flow-controller.test.ts
solid-ui/tests/decisionos-briefing-interaction-state.test.ts
solid-ui/tests/decisionos-briefing-state.test.ts
solid-ui/tests/decisionos-celebration-state.test.ts
solid-ui/tests/decisionos-cognitive-bento-state.test.ts
solid-ui/tests/decisionos-confetti-effect.test.ts
solid-ui/tests/decisionos-confidence-popover-state.test.ts
solid-ui/tests/decisionos-confidence-state.test.ts
solid-ui/tests/decisionos-context-annotations.test.ts
solid-ui/tests/decisionos-context-navigation-state.test.ts
solid-ui/tests/decisionos-context-pack-presentation-state.test.ts
solid-ui/tests/decisionos-continuity-decision-assembly.test.ts
solid-ui/tests/decisionos-continuity-decision-state.test.ts
solid-ui/tests/decisionos-continuity-merge-state.test.ts
solid-ui/tests/decisionos-continuity.test.ts
solid-ui/tests/decisionos-cost-status-state.test.ts
solid-ui/tests/decisionos-decision-action-effect-state.test.ts
solid-ui/tests/decisionos-decision-action-execution-state.test.ts
solid-ui/tests/decisionos-decision-action-plan.test.ts
solid-ui/tests/decisionos-decision-action-state.test.ts
solid-ui/tests/decisionos-decision-card-context-preview-state.test.ts
solid-ui/tests/decisionos-decision-card-insight-state.test.ts
solid-ui/tests/decisionos-decision-card-popover-state.test.ts
solid-ui/tests/decisionos-decision-card-state.test.ts
solid-ui/tests/decisionos-decision-context-state.test.ts
solid-ui/tests/decisionos-diary-state.test.ts
solid-ui/tests/decisionos-event-bridge-state.test.ts
solid-ui/tests/decisionos-focus-overlay-state.test.ts
solid-ui/tests/decisionos-goal-breakdown-modal-state.test.ts
solid-ui/tests/decisionos-goal-schedule-state.test.ts
solid-ui/tests/decisionos-home-bridge-controller.test.ts
solid-ui/tests/decisionos-home-effects.test.ts
solid-ui/tests/decisionos-home-follow-up-state.test.ts
solid-ui/tests/decisionos-home-options-state.test.ts
solid-ui/tests/decisionos-home-presentation-state.test.ts
solid-ui/tests/decisionos-home-state.test.ts
solid-ui/tests/decisionos-interface-copy.test.ts
solid-ui/tests/decisionos-keyboard-execution-state.test.ts
solid-ui/tests/decisionos-keyboard-intent-state.test.ts
solid-ui/tests/decisionos-keyboard-state.test.ts
solid-ui/tests/decisionos-magic-execution-state.test.ts
solid-ui/tests/decisionos-mood-state.test.ts
solid-ui/tests/decisionos-navigation-continuity.test.ts
solid-ui/tests/decisionos-object-retrieval-state.test.ts
solid-ui/tests/decisionos-operational-pressure-state.test.ts
solid-ui/tests/decisionos-outcome-check-state.test.ts
solid-ui/tests/decisionos-prepared-work-state.test.ts
solid-ui/tests/decisionos-priority-display-state.test.ts
solid-ui/tests/decisionos-proactive-trust-state.test.ts
solid-ui/tests/decisionos-progress-state.test.ts
solid-ui/tests/decisionos-queue-bootstrap-state.test.ts
solid-ui/tests/decisionos-queue-interaction-state.test.ts
solid-ui/tests/decisionos-queue-load-state.test.ts
solid-ui/tests/decisionos-resolved-update-state.test.ts
solid-ui/tests/decisionos-selection-state.test.ts
solid-ui/tests/decisionos-snooze-state.test.ts
solid-ui/tests/decisionos-swipe-state.test.ts
solid-ui/tests/decisionos-toast-controller.test.ts
solid-ui/tests/decisionos-trust-lane-state.test.ts
solid-ui/tests/decisionos-update-application-state.test.ts
solid-ui/tests/decrypt-content.test.ts
solid-ui/tests/decrypted-display-state.test.ts
solid-ui/tests/dev-viewport-event.test.ts
solid-ui/tests/device-sync-runtime-state.test.ts
solid-ui/tests/diary-event.test.ts
solid-ui/tests/editor-comment-toggle.test.ts
solid-ui/tests/editor-datetime-preference.test.ts
solid-ui/tests/editor-submit-event.test.ts
solid-ui/tests/editor-types.test.ts
solid-ui/tests/editor-url-cleanup.test.ts
solid-ui/tests/email-action-failure-state.test.ts
solid-ui/tests/email-local-state.test.ts
solid-ui/tests/email-view-state.test.ts
solid-ui/tests/event-detail.test.ts
solid-ui/tests/export-sovereign-data-bundle.test.ts
solid-ui/tests/external-tool-billing-coverage-state.test.ts
solid-ui/tests/external-tool-billing-view-state.test.ts
solid-ui/tests/external-tool-usage-section-state.test.ts
solid-ui/tests/file-explorer-focus-state.test.ts
solid-ui/tests/file-library-api.test.ts
solid-ui/tests/file-library-item-value-story-state.test.ts
solid-ui/tests/file-library-navigation-state.test.ts
solid-ui/tests/file-library-next-action-state.test.ts
solid-ui/tests/file-library-quick-filter-state.test.ts
solid-ui/tests/file-library-state.test.ts
solid-ui/tests/file-library-student-focus-state.test.ts
solid-ui/tests/file-library-value-path-state.test.ts
solid-ui/tests/file-line-budget.test.ts
solid-ui/tests/first-run-experience-failure-state.test.ts
solid-ui/tests/first-run-experience-local-state.test.ts
solid-ui/tests/first-run-experience-response-state.test.ts
solid-ui/tests/focus-items-failure-state.test.ts
solid-ui/tests/font-body-preference.test.ts
solid-ui/tests/font-scale-preference.test.ts
solid-ui/tests/generative-card-failure-state.test.ts
solid-ui/tests/generative-card-local-state.test.ts
solid-ui/tests/gmail-connection-state.test.ts
solid-ui/tests/gmail-redirect-state.test.ts
solid-ui/tests/goal-breakdown-event.test.ts
solid-ui/tests/google-identity.test.ts
solid-ui/tests/grid-mutation-failure-state.test.ts
solid-ui/tests/guided-tour-local-state.test.ts
solid-ui/tests/inline-entity-actions.test.ts
solid-ui/tests/inline-entity-event.test.ts
solid-ui/tests/inline-entity-external-data.test.ts
solid-ui/tests/inline-entity-local-state.test.ts
solid-ui/tests/inline-entity-preference-event.test.ts
solid-ui/tests/inline-entity-presentation.test.ts
solid-ui/tests/inline-entity-segmentation.test.ts
solid-ui/tests/intelligence-brief-failure-state.test.ts
solid-ui/tests/intelligence-brief-local-state.test.ts
solid-ui/tests/intelligence-brief-state.test.ts
solid-ui/tests/intelligence-brief-view-state.test.ts
solid-ui/tests/json-parse-state.test.ts
solid-ui/tests/knowledge-attachment-extract.test.ts
solid-ui/tests/knowledge-attachment-support-summary.test.ts
solid-ui/tests/knowledge-card-connection-story-state.test.ts
solid-ui/tests/knowledge-graph-coverage-state.test.ts
solid-ui/tests/knowledge-graph-data.test.ts
solid-ui/tests/knowledge-graph-explorer-focus-state.test.ts
solid-ui/tests/knowledge-graph-navigation-state.test.ts
solid-ui/tests/knowledge-graph-presentation.test.ts
solid-ui/tests/knowledge-graph-robustness-state.test.ts
solid-ui/tests/knowledge-graph-slice-explanation-state.test.ts
solid-ui/tests/knowledge-graph-student-focus-state.test.ts
solid-ui/tests/knowledge-graph-study-recommendation-action-state.test.ts
solid-ui/tests/knowledge-graph-study-recommendation-state.test.ts
solid-ui/tests/knowledge-graph-supertag-definitions.test.ts
solid-ui/tests/knowledge-graph-trust-state.test.ts
solid-ui/tests/knowledge-graph-value-path-state.test.ts
solid-ui/tests/knowledge-graph-view-state.test.ts
solid-ui/tests/knowledge-ingest-policy.test.ts
solid-ui/tests/local-router-afp-row-state.test.ts
solid-ui/tests/local-router-companion-state.test.ts
solid-ui/tests/local-router-copy.test.ts
solid-ui/tests/local-router-preview-controller.test.ts
solid-ui/tests/local-router-projector.test.ts
solid-ui/tests/local-router-recovery-action.test.ts
solid-ui/tests/local-router-schema.test.mjs
solid-ui/tests/map-config-response-state.test.ts
solid-ui/tests/map-renderer-failure-state.test.ts
solid-ui/tests/medical-anki-quality-state.test.ts
solid-ui/tests/medical-anki-study-state.test.ts
solid-ui/tests/medical-anki-workflow-afp-projection-state.test.ts
solid-ui/tests/medical-anki-workflow-state.test.ts
solid-ui/tests/medical-concept-edge-attempt-afp-projection-state.test.ts
solid-ui/tests/medical-concept-edge-attempt-extraction-state.test.ts
solid-ui/tests/medical-concept-edge-attempt-local-state.test.ts
solid-ui/tests/medical-concept-edge-attempt-presentation-state.test.ts
solid-ui/tests/medical-concept-graph-capability-state.test.ts
solid-ui/tests/medical-concept-relationship-afp-projection-state.test.ts
solid-ui/tests/medical-concept-relationship-state.test.ts
solid-ui/tests/medical-concept-repair-artifact-state.test.ts
solid-ui/tests/medical-concept-review-queue-state.test.ts
solid-ui/tests/medical-fact-verification-afp-projection-state.test.ts
solid-ui/tests/medical-fact-verification-result-state.test.ts
solid-ui/tests/medical-fact-verification-state.test.ts
solid-ui/tests/medical-missed-question-afp-projection-state.test.ts
solid-ui/tests/medical-missed-question-local-state.test.ts
solid-ui/tests/medical-missed-topic-capture-state.test.ts
solid-ui/tests/medical-missed-topic-queue-state.test.ts
solid-ui/tests/medical-topology-coverage-afp-projection-state.test.ts
solid-ui/tests/medical-trusted-reference-state.test.ts
solid-ui/tests/message-timestamp-presentation.test.ts
solid-ui/tests/monthly-calendar-view-state.test.ts
solid-ui/tests/nav-bar-local-state.test.ts
solid-ui/tests/nav-bar-weather-state.test.ts
solid-ui/tests/node-ts-specifier-hooks.mjs
solid-ui/tests/note-editor-events.test.ts
solid-ui/tests/note-history-local-state.test.ts
solid-ui/tests/note-relative-time.test.ts
solid-ui/tests/note-view-state.test.ts
solid-ui/tests/object-messages-response-state.test.ts
solid-ui/tests/ollama-embedding-response-state.test.ts
solid-ui/tests/onboarding-activation-state.test.ts
solid-ui/tests/onboarding-local-state.test.ts
solid-ui/tests/onboarding-quick-start.test.ts
solid-ui/tests/onboarding-student-fast-path-state.test.ts
solid-ui/tests/onboarding-wizard-failure-state.test.ts
solid-ui/tests/open-object-search-event.test.ts
solid-ui/tests/open-thread-event.test.ts
solid-ui/tests/open-thread-search-event.test.ts
solid-ui/tests/operational-approval-copy.test.ts
solid-ui/tests/operational-lane-trust-review-state.test.ts
solid-ui/tests/operational-pressure-card-trust-state.test.ts
solid-ui/tests/operational-runtime-lane-state.test.ts
solid-ui/tests/operator-admin-presentation-state.test.ts
solid-ui/tests/operator-admin-response-state.test.ts
solid-ui/tests/operator-runtime-remediation-draft-state.test.ts
solid-ui/tests/operator-runtime-remediation-keyboard.test.ts
solid-ui/tests/operator-runtime-remediation-local-state.test.ts
solid-ui/tests/operator-runtime-remediation-shortcut-state.test.ts
solid-ui/tests/operator-runtime-remediation-view-state.test.ts
solid-ui/tests/operator-usage-section-state.test.ts
solid-ui/tests/orchestration-panel-state.test.ts
solid-ui/tests/para-failure-state.test.ts
solid-ui/tests/para-import-mode.test.ts
solid-ui/tests/para-upload-policy.test.ts
solid-ui/tests/parsed-document-failure-state.test.ts
solid-ui/tests/passkey-auth.test.ts
solid-ui/tests/persona-install-state.test.ts
solid-ui/tests/persona-switcher-failure-state.test.ts
solid-ui/tests/persona-switcher-state.test.ts
solid-ui/tests/persona-switcher-view-state.test.ts
solid-ui/tests/planning-failure-state.test.ts
solid-ui/tests/planning-view-state.test.ts
solid-ui/tests/popover-position.test.ts
solid-ui/tests/pricing.test.ts
solid-ui/tests/proactive-suggestion-approval-state.test.ts
solid-ui/tests/proactive-suggestion-context-artifact-preview-state.test.ts
solid-ui/tests/proactive-suggestion-simulator-preview-state.test.ts
solid-ui/tests/profile-ledger-failure-state.test.ts
solid-ui/tests/profile-ledger-local-state.test.ts
solid-ui/tests/profile-ledger-session-key.test.ts
solid-ui/tests/profile-ledger-values.test.ts
solid-ui/tests/profile-local-state.test.ts
solid-ui/tests/public-feed-failure-state.test.ts
solid-ui/tests/public-feed-presentation-state.test.ts
solid-ui/tests/public-feed-response-state.test.ts
solid-ui/tests/pulse-feed-failure-state.test.ts
solid-ui/tests/pulse-feed-response-state.test.ts
solid-ui/tests/pulse-feed-view-state.test.ts
solid-ui/tests/queue-and-outcome-events.test.ts
solid-ui/tests/quick-add-failure-state.test.ts
solid-ui/tests/quick-control-shortcut-state.test.ts
solid-ui/tests/reason-fallback-text.test.ts
solid-ui/tests/report-generator-state.test.ts
solid-ui/tests/report-navigation-state.test.ts
solid-ui/tests/report-seed-metadata.test.ts
solid-ui/tests/report-workspace-state.test.ts
solid-ui/tests/response-queue-card-trust-state.test.ts
solid-ui/tests/response-queue-policy.test.ts
solid-ui/tests/response-queue-sound-preference.test.ts
solid-ui/tests/response-queue-trust-block-state.test.ts
solid-ui/tests/retrieval-tone.test.ts
solid-ui/tests/runtime-backup-manifest-state.test.ts
solid-ui/tests/runtime-backups-state.test.ts
solid-ui/tests/runtime-controls-state.test.ts
solid-ui/tests/runtime-operations-state.test.ts
solid-ui/tests/runtime-recovery-metrics-state.test.ts
solid-ui/tests/runtime-recovery-packet-state.test.ts
solid-ui/tests/runtime-restore-drills-state.test.ts
solid-ui/tests/runtime-runner-failure-state.test.ts
solid-ui/tests/runtime-surface-timestamp-format.test.ts
solid-ui/tests/runtime-updates-state.test.ts
solid-ui/tests/safe-href.test.ts
solid-ui/tests/sample-dashboard.test.ts
solid-ui/tests/saved-searches.test.ts
solid-ui/tests/saved-study-artifacts-panel-state.test.ts
solid-ui/tests/search-bar-local-state.test.ts
solid-ui/tests/search-boolean-mode.test.ts
solid-ui/tests/search-preview-state.test.ts
solid-ui/tests/search-result-panel-state.test.ts
solid-ui/tests/session-recovery-state.test.ts
solid-ui/tests/session-view-trail.test.ts
solid-ui/tests/shell-command-presentation.test.ts
solid-ui/tests/shell-result-renderer-state.test.ts
solid-ui/tests/shortcut-recency.test.ts
solid-ui/tests/simulator-runtime-state.test.ts
solid-ui/tests/skill-deactivation-event.test.ts
solid-ui/tests/skills-failure-state.test.ts
solid-ui/tests/skills-local-state.test.ts
solid-ui/tests/skills-presentation.test.ts
solid-ui/tests/social-composer-failure-state.test.ts
solid-ui/tests/social-composer-response-state.test.ts
solid-ui/tests/social-composer-view-state.test.ts
solid-ui/tests/space-message-content.test.ts
solid-ui/tests/space-selection-state.test.ts
solid-ui/tests/spaces-failure-state.test.ts
solid-ui/tests/spaces-view-state.test.ts
solid-ui/tests/storage-mode.test.ts
solid-ui/tests/structured-text-input-state.test.ts
solid-ui/tests/student-activation-launch-state.test.ts
solid-ui/tests/student-report-memory-state.test.ts
solid-ui/tests/student-study-outcome-state.test.ts
solid-ui/tests/study-academic-calendar-event-scope-state.test.ts
solid-ui/tests/study-academic-calendar-search-state.test.ts
solid-ui/tests/study-academic-integration-state.test.ts
solid-ui/tests/study-academic-scope-state.test.ts
solid-ui/tests/study-adjacent-source-recommendation.test.ts
solid-ui/tests/study-artifact-export-action-state.test.ts
solid-ui/tests/study-artifact-search-index-state.test.ts
solid-ui/tests/study-artifact-search-result-state.test.ts
solid-ui/tests/study-attachment-action-state.test.ts
solid-ui/tests/study-attachment-adaptive-quick-start.test.ts
solid-ui/tests/study-attachment-plan-state.test.ts
solid-ui/tests/study-attachment-policy-preset-state.test.ts
solid-ui/tests/study-attachment-setup-snapshot-state.test.ts
solid-ui/tests/study-attempt-local-state.test.ts
solid-ui/tests/study-batch-next-action-state.test.ts
solid-ui/tests/study-composer-guidance.test.ts
solid-ui/tests/study-course-local-state.test.ts
solid-ui/tests/study-deadline-afp-projection-state.test.ts
solid-ui/tests/study-deadline-local-state.test.ts
solid-ui/tests/study-first-run-state.test.ts
solid-ui/tests/study-first-run-value-path-state.test.ts
solid-ui/tests/study-first-session-fast-lane-state.test.ts
solid-ui/tests/study-focus-signal-state.test.ts
solid-ui/tests/study-immediate-value.test.ts
solid-ui/tests/study-launch-metadata-state.test.ts
solid-ui/tests/study-lens-card-state.test.ts
solid-ui/tests/study-lens-course-context-state.test.ts
solid-ui/tests/study-lens-dashboard-action-state.test.ts
solid-ui/tests/study-lens-evidence-state.test.ts
solid-ui/tests/study-lens-focused-mode-state.test.ts
solid-ui/tests/study-lens-label-state.test.ts
solid-ui/tests/study-lens-navigation-state.test.ts
solid-ui/tests/study-lens-next-action-state.test.ts
solid-ui/tests/study-lens-progress-state.test.ts
solid-ui/tests/study-lens-session-plan-state.test.ts
solid-ui/tests/study-lens-sidebar-state.test.ts
solid-ui/tests/study-lens-state.test.ts
solid-ui/tests/study-memory-reinforcement-state.test.ts
solid-ui/tests/study-next-session-carryover-state.test.ts
solid-ui/tests/study-output-template-contract-state.test.ts
solid-ui/tests/study-pack-action-state.test.ts
solid-ui/tests/study-pack-focus-state.test.ts
solid-ui/tests/study-prompt-path-state.test.ts
solid-ui/tests/study-quick-start-choice-state.test.ts
solid-ui/tests/study-report-artifact-local-state.test.ts
solid-ui/tests/study-result-command-center-state.test.ts
solid-ui/tests/study-result-continuation-state.test.ts
solid-ui/tests/study-result-export-state.test.ts
solid-ui/tests/study-result-handoff-state.test.ts
solid-ui/tests/study-result-momentum-state.test.ts
solid-ui/tests/study-result-retention-map-state.test.ts
solid-ui/tests/study-result-value-path-state.test.ts
solid-ui/tests/study-run-outcome-state.test.ts
solid-ui/tests/study-search-continuation-state.test.ts
solid-ui/tests/study-search-result-state.test.ts
solid-ui/tests/study-session-kickoff-state.test.ts
solid-ui/tests/study-session-local-state.test.ts
solid-ui/tests/study-source-map-state.test.ts
solid-ui/tests/study-source-mix-state.test.ts
solid-ui/tests/study-thread-reinforcement-path-state.test.ts
solid-ui/tests/study-upload-readiness-state.test.ts
solid-ui/tests/study-workspace-arrival-state.test.ts
solid-ui/tests/study-workspace-continuation-context-state.test.ts
solid-ui/tests/study-workspace-continuation-seed.test.ts
solid-ui/tests/study-workspace-launch-state.test.ts
solid-ui/tests/study-zero-state-starter-state.test.ts
solid-ui/tests/supertag-grid-local-state.test.ts
solid-ui/tests/supertag-grid-runtime-state.test.ts
solid-ui/tests/support-access-history-format.test.ts
solid-ui/tests/support-access-state.test.ts
solid-ui/tests/surface-timestamp-presentation.test.ts
solid-ui/tests/sw-update-event.test.ts
solid-ui/tests/sync-bootstrap-state.test.ts
solid-ui/tests/sync-local-state.test.ts
solid-ui/tests/table-renderer-local-state.test.ts
solid-ui/tests/task-detail-failure-state.test.ts
solid-ui/tests/task-detail-response-state.test.ts
solid-ui/tests/task-detail-trace-message-state.test.ts
solid-ui/tests/task-presentation-state.test.ts
solid-ui/tests/task-result-meta.test.ts
solid-ui/tests/template-catalog-state.test.ts
solid-ui/tests/thread-dashboard-presentation-state.test.ts
solid-ui/tests/thread-dashboard-trust-state.test.ts
solid-ui/tests/thread-interaction-state.test.ts
solid-ui/tests/thread-list-local-state.test.ts
solid-ui/tests/thread-list-view-state.test.ts
solid-ui/tests/thread-load-failure-state.test.ts
solid-ui/tests/thread-message-row-state.test.ts
solid-ui/tests/thread-mini-map-failure-state.test.ts
solid-ui/tests/thread-orchestration-failure-state.test.ts
solid-ui/tests/thread-related-context-state.test.ts
solid-ui/tests/thread-retrieval-state.test.ts
solid-ui/tests/thread-search-failure-state.test.ts
solid-ui/tests/thread-session-history.test.ts
solid-ui/tests/thread-sort.test.ts
solid-ui/tests/thread-summaries-response-state.test.ts
solid-ui/tests/thread-view-local-state.test.ts
solid-ui/tests/thread-view-presentation-state.test.ts
solid-ui/tests/thread-view-render-state.test.ts
solid-ui/tests/tile-image-url.test.ts
solid-ui/tests/token-budget-failure-state.test.ts
solid-ui/tests/tool-catalog-billing.test.ts
solid-ui/tests/tools-failure-state.test.ts
solid-ui/tests/tools-local-state.test.ts
solid-ui/tests/trust-field-state.test.ts
solid-ui/tests/trust-summary-block-state.test.ts
solid-ui/tests/trust-summary-blocks.test.ts
solid-ui/tests/ui-command-fallback-render.test.ts
solid-ui/tests/ui-command-fallback-state.test.ts
solid-ui/tests/upload-response-state.test.ts
solid-ui/tests/usage-billing-summary-state.test.ts
solid-ui/tests/usage-storage-state.test.ts
solid-ui/tests/usage-view-async-action-state.test.ts
solid-ui/tests/usage-view-billing-action-handlers.test.ts
solid-ui/tests/usage-view-billing-mounted-state.test.ts
solid-ui/tests/usage-view-bindings-state.test.ts
solid-ui/tests/usage-view-failure-state.test.ts
solid-ui/tests/usage-view-formatting-state.test.ts
solid-ui/tests/usage-view-interaction-state.test.ts
solid-ui/tests/usage-view-operator-action-handlers.test.ts
solid-ui/tests/usage-view-operator-interaction-state.test.ts
solid-ui/tests/usage-view-operator-local-persistence.test.ts
solid-ui/tests/usage-view-operator-mounted-state.test.ts
solid-ui/tests/usage-view-operator-remediation-persistence-state.test.ts
solid-ui/tests/usage-view-operator-remediation-sync-state.test.ts
solid-ui/tests/usage-view-operator-runtime-remediation-handlers.test.ts
solid-ui/tests/usage-view-operator-ui-handlers.test.ts
solid-ui/tests/usage-view-render-action-state.test.ts
solid-ui/tests/usage-view-resource-state.test.ts
solid-ui/tests/usage-view-section-props-state.test.ts
solid-ui/tests/usage-view-state-committers.test.ts
solid-ui/tests/view-customizer-local-state.test.ts
solid-ui/tests/view-dispatcher-routing.test.ts
solid-ui/tests/view-names.test.ts
solid-ui/tests/view-preload.test.ts
solid-ui/tests/view-routing-state.test.ts
solid-ui/tests/view-routing.test.ts
solid-ui/tests/viewport-class.test.ts
solid-ui/tests/viewport-flags.test.ts
solid-ui/tests/vim-navigation-preference.test.ts
solid-ui/tests/visible-error-text.test.ts
solid-ui/tests/welcome-screen-failure-state.test.ts
solid-ui/tests/workflow-approval-state.test.ts
solid-ui/tests/workflow-async-state.test.ts
solid-ui/tests/workflow-canvas-state.test.ts
solid-ui/tests/workflow-collection-state.test.ts
solid-ui/tests/workflow-composer-state.test.ts
solid-ui/tests/workflow-describe-intent-analysis.test.ts
solid-ui/tests/workflow-dom-state.test.ts
solid-ui/tests/workflow-editor-failure-state.test.ts
solid-ui/tests/workflow-export-state.test.ts
solid-ui/tests/workflow-family-state.test.ts
solid-ui/tests/workflow-graph-copy.test.ts
solid-ui/tests/workflow-graph-draft-state.test.ts
solid-ui/tests/workflow-graph-edit-state.test.ts
solid-ui/tests/workflow-history-copy.test.ts
solid-ui/tests/workflow-inspector-state.test.ts
solid-ui/tests/workflow-intent-build-state.test.ts
solid-ui/tests/workflow-json-editor-state.test.ts
solid-ui/tests/workflow-link-state.test.ts
solid-ui/tests/workflow-live-run-stream-state.test.ts
solid-ui/tests/workflow-panel-state.test.ts
solid-ui/tests/workflow-persistence-state.test.ts
solid-ui/tests/workflow-rail-state.test.ts
solid-ui/tests/workflow-regeneration-state.test.ts
solid-ui/tests/workflow-review-local-state.test.ts
solid-ui/tests/workflow-run-approval-review.test.ts
solid-ui/tests/workflow-shared-timestamp-format.test.ts
solid-ui/tests/workflow-template-scaffold.test.ts
solid-ui/tests/workflow-timeline-card-presentation.test.ts
solid-ui/tests/workflow-timeline-trigger-presentation.test.ts
solid-ui/tests/workflow-utility-state.test.ts
solid-ui/tests/workflow-wait-resume-failure-state.test.ts
solid-ui/tests/workflows-local-state.test.ts
solid-ui/tests/workspace-assist.test.ts
solid-ui/tests/workspace-setup-banner-failure-state.test.ts
solid-ui/tests/workspace-setup-banner-local-state.test.ts
solid-ui/tests/workspace-setup-state.test.ts
solid-ui/tests/workspace-update-state.test.ts
temp_release_snippet.txt
tests/
tmp_backup_raw.txt
tmp_restore_raw.txt
typescript-sdk/tests/
ui/components/BentoCard.tsx
ui/components/DecisionOutcomeDiary.tsx
ui/components/GoalProgressRing.tsx
ui/components/MoodIndicator.tsx
wedding-build-output-latest.txt
wedding-test-output-latest.txt
wedding-test-output.txt
```

## Other Status Entries

_None._

