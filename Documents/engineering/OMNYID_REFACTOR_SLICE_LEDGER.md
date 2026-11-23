# OMNYID Refactor Slice Ledger

This file tracks incremental refactors so each extraction is auditable.
Update this ledger for every subsequent refactor.

## Entry Format
- Date (AEST):
- Source file:
- New/extracted files:
- Function/struct slice moved:
- Router or callsite rewiring:
- Validation run:
- Rollback artifact:

---

## 2026-04-18 (AEST) — `db.rs` modular extraction
- Source file: `src/db.rs`
- New/extracted files:
  - `src/db/models.rs`
  - `src/db/migration_catalog.rs`
  - `src/db/tests.rs`
  - `src/db/tenant_roundtrip.rs`
- Function/struct slice moved:
  - Migration catalog constant: `MIGRATIONS`
  - Record model structs: `AliasRecord` through `SyncDevicePolicyRecord`
  - Inline `db` test module split into `tests.rs` + `tenant_roundtrip.rs`
- Router or callsite rewiring:
  - `src/db.rs` now declares modules and re-exports:
    - `pub use migration_catalog::MIGRATIONS;`
    - `pub use models::*;`
- Validation run:
  - `cargo test --lib` => passed (467/467)
- Rollback artifact:
  - `src/db.rs.rollback.20260418-095125.bak`

## 2026-04-18 (AEST) — `server/mod.rs` cost/profit extraction
- Source file: `src/server/mod.rs`
- New/extracted files:
  - `src/server/cost_controls.rs`
- Function/struct slice moved:
  - Cost/profit/public snapshot handlers and supporting request types:
    - `cost_summary_http`, `profit_summary_http`, `profit_margin_scan_http`, `profit_admin_http`,
      `template_cost_profiles_http`, `sign_public_snapshot_manifest_http`,
      `chile_trip_cost_example_http`, `get_budget_http`, `upsert_budget_http`, `get_run_context_http`,
      plus margin-alert helper and request payload structs.
- Router or callsite rewiring:
  - Main router switched to `.merge(cost_controls::routes())`.
- Validation run:
  - `cargo test --lib` => passed (467/467)
- Rollback artifact:
  - `src/server/mod.rs.rollback.20260418-093625.bak`

## 2026-04-18 (AEST) — `server/mod.rs` user integrations extraction
- Source file: `src/server/mod.rs`
- New/extracted files:
  - `src/server/user_integrations.rs`
- Function/struct slice moved:
  - Gmail OAuth handlers:
    - `gmail_status_http`, `gmail_connect_url_http`, `gmail_callback_http`
  - Calendar handlers/types:
    - `CalendarListQuery`, `calendar_list_http`, `CalendarCreateRequest`, `calendar_create_http`, `calendar_delete_http`
  - Alias handlers/types/validation:
    - `ALIAS_RESERVED`, `validate_alias`, `AliasCheckQuery`, `alias_check_http`, `alias_mine_http`,
      `AliasClaimBody`, `alias_claim_http`, `AliasChangeBody`, `alias_change_http`
- Router or callsite rewiring:
  - Main router switched from inline route definitions to `.merge(user_integrations::routes())`.
- Validation run:
  - `cargo test --lib` => passed (467/467)
- Rollback artifact:
  - `src/server/mod.rs.rollback.20260418-102616.bak`

## 2026-04-18 (AEST) — `server/mod.rs` workspace routes extraction
- Source file: `src/server/mod.rs`
- New/extracted files:
  - `src/server/workspace_routes.rs`
- Function/struct slice moved:
  - Runtime workspace handlers:
    - `runtime_workspace_files_http`, `runtime_workspace_file_http`, `runtime_workspace_file_save_http`
  - Workspace thread helpers:
    - `WorkspaceThreadReadQuery`, `WorkspaceThreadGrepQuery`,
      `workspace_thread_read_http`, `workspace_thread_summary_http`, `workspace_thread_grep_http`
- Router or callsite rewiring:
  - Main router switched to `.merge(workspace_routes::routes())` for:
    - `/runtime/workspace-files`
    - `/runtime/workspace-file`
    - `/agent/fs/thread/{thread_id}/summary`
    - `/agent/fs/grep`
  - `/agent/fs/thread/{thread_id}` now points to `workspace_routes::workspace_thread_read_http`.
  - In-module tests updated to call `super::workspace_routes::...` symbols.
- Validation run:
  - `cargo test --lib` => passed (467/467)
- Rollback artifact:
  - `src/server/mod.rs.rollback.20260418-103158.bak`

## 2026-04-18 (AEST) — `server/mod.rs` feed routes extraction
- Source file: `src/server/mod.rs`
- New/extracted files:
  - `src/server/feed_routes.rs`
- Function/struct slice moved:
  - Public/social feed handlers:
    - `public_feed_http`, `feed_search_http`, `feed_follow_http`, `feed_unfollow_http`, `feed_following_http`, `feed_engage_http`
  - Request payload type:
    - `EngageRequest`
- Router or callsite rewiring:
  - Main router switched from inline feed routes to `.merge(feed_routes::routes())` for:
    - `/feed/public`
    - `/feed/search`
    - `/feed/follow/{agent_id}`
    - `/feed/following`
    - `/feed/engage`
- Validation run:
  - `cargo test --lib` => passed (467/467)
- Rollback artifact:
  - `src/server/mod.rs.rollback.20260418-103158.bak`

## 2026-04-18 (AEST) — `server/mod.rs` runtime lifecycle extraction
- Source file: `src/server/mod.rs`
- New/extracted files:
  - `src/server/runtime_routes.rs`
- Function/struct slice moved:
  - Runtime lifecycle/config handlers:
    - `runtime_deploy_http`
    - `runtime_action_http`
    - `runtime_destroy_http`
    - `runtime_logs_http`
    - `runtime_runner_config_http`
    - `runtime_runner_config_action_http`
- Router or callsite rewiring:
  - Main router switched from inline runtime routes to `.merge(runtime_routes::routes())` for:
    - `/runtime/deploy`
    - `/runtime/action`
    - `/runtime/destroy`
    - `/runtime/logs`
    - `/runtime/runner-config`
- Validation run:
  - `cargo test --lib` => passed (467/467)
- Rollback artifact:
  - `src/server/mod.rs.rollback.20260418-111714.bak`

## 2026-04-18 (AEST) — `server/mod.rs` account/support extraction
- Source file: `src/server/mod.rs`
- New/extracted files:
  - `src/server/account_routes.rs`
- Function/struct slice moved:
  - Account/support/session handlers:
    - `support_access_http`
    - `support_access_history_http`
    - `account_sessions_http`
    - `account_sessions_action_http`
    - `update_support_access_http`
    - `account_delete_http`
- Router or callsite rewiring:
  - Main router switched from inline account/support routes to `.merge(account_routes::routes())` for:
    - `/dashboard/sessions`
    - `/dashboard/support-access`
    - `/dashboard/support-access/history`
    - `/dashboard/account/delete`
- Validation run:
  - `cargo test --lib` => passed (467/467)
- Rollback artifact:
  - `src/server/mod.rs.rollback.20260418-114122.bak`

## 2026-04-18 (AEST) — `server/mod.rs` dashboard/onboarding + installer extraction
- Source file: `src/server/mod.rs`
- New/extracted files:
  - `src/server/dashboard_routes.rs`
- Function slice moved:
  - Dashboard/onboarding handlers:
    - `dashboard_bootstrap_http`
    - `dashboard_export_http`
    - `update_onboarding_http`
    - `onboarding_bundle_http`
    - `service_adapter_bundle_http`
  - Local installer handlers:
    - `local_windows_installer_http`
    - `local_unix_installer_http`
- Router or callsite rewiring:
  - Main router switched from inline routes to `.merge(dashboard_routes::routes())` for:
    - `/dashboard/bootstrap`
    - `/dashboard/export`
    - `/dashboard/onboarding`
    - `/dashboard/onboarding-bundle`
    - `/dashboard/service-adapter-bundle`
  - Main router switched from inline installer routes to `.merge(dashboard_routes::installer_routes())` for:
    - `/installers/local/windows.ps1`
    - `/installers/local/unix.sh`
- Validation run:
  - `cargo test --lib` => passed (467/467)
- Rollback artifact:
  - `src/server/mod.rs.rollback.20260418-115629.bak`

## 2026-04-18 (AEST) — `server/mod.rs` runtime resilience + device sync extraction
- Source file: `src/server/mod.rs`
- New/extracted files:
  - `src/server/dashboard_runtime_routes.rs`
- Function slice moved:
  - Runtime resilience handlers:
    - `runtime_backups_http`
    - `runtime_backups_action_http`
    - `runtime_backup_manifest_http`
    - `runtime_restore_drills_http`
    - `runtime_restore_drill_create_http`
    - `runtime_updates_http`
    - `runtime_updates_action_http`
    - `runtime_recovery_packet_http`
  - Device sync handlers:
    - `device_bootstrap_bundle_http`
    - `device_sync_policies_http`
    - `device_sync_policies_action_http`
- Router or callsite rewiring:
  - Main router switched from inline routes to `.merge(dashboard_runtime_routes::routes())` for:
    - `/dashboard/runtime-backups`
    - `/dashboard/runtime-backups/{backup_id}`
    - `/dashboard/runtime-restore-drills`
    - `/dashboard/runtime-updates`
    - `/dashboard/runtime-recovery-packet`
    - `/dashboard/device-bootstrap-bundle`
    - `/dashboard/device-sync-policies`
- Validation run:
  - `cargo test --lib` => passed (467/467)
- Rollback artifact:
  - `src/server/mod.rs.rollback.20260418-125208.bak`

## 2026-04-18 (AEST) — `server/mod.rs` ui decision route extraction
- Source file: `src/server/mod.rs`
- New/extracted files:
  - `src/server/ui_decision_routes.rs`
- Function slice moved:
  - `ui_decision_http`
- Router or callsite rewiring:
  - Main router switched from inline decision route to `.merge(ui_decision_routes::routes())` for:
    - `/ui/decision`
  - In-module test callsite updated from `super::ui_decision_http(...)` to `super::ui_decision_routes::ui_decision_http(...)`
- Validation run:
  - `cargo test --lib` => passed (467/467)
- Rollback artifact:
  - `src/server/mod.rs.rollback.20260418-132115.bak`

## 2026-04-18 (AEST) — `server/mod.rs` user preferences + daemon routes extraction
- Source file: `src/server/mod.rs`
- New/extracted files:
  - `src/server/user_management_routes.rs`
- Function slice moved:
  - `agent_preferences_get_http`
  - `agent_preferences_set_http`
  - `daemons_list_http`
  - `daemon_heartbeat_http`
  - `daemon_revoke_http`
- Router or callsite rewiring:
  - Main router switched from inline routes to `.merge(user_management_routes::routes())` for:
    - `/user/agent-preferences`
    - `/daemons`
    - `/daemons/{daemon_id}/heartbeat`
    - `/daemons/{daemon_id}/revoke`
- Validation run:
  - `cargo test --lib` => passed (467/467)
- Rollback artifact:
  - `src/server/mod.rs.rollback.20260418-141755.bak`

## 2026-04-18 (AEST) — `server/mod.rs` knowledge curator route extraction
- Source file: `src/server/mod.rs`
- New/extracted files:
  - `src/server/knowledge_routes.rs`
- Function/constant slice moved:
  - `note_backlinks_http`
  - `user_supertags_http`
  - `note_backlink_override_http`
  - `backlinks_graph_http`
  - `install_default_supertags_http`
  - `DEFAULT_SUPERTAG_TAXONOMY`
- Router or callsite rewiring:
  - Main router switched from inline routes to `.merge(knowledge_routes::routes())` for:
    - `/notes/backlinks/{message_id}`
    - `/notes/{message_id}/backlink-override`
    - `/notes/supertags`
    - `/backlinks/graph`
    - `/notes/supertags/install-defaults`
- Validation run:
  - `cargo test --lib` => passed (467/467)
- Rollback artifact:
  - `src/server/mod.rs.rollback.20260418-144630.bak`

## 2026-04-18 (AEST) — `server/mod.rs` export routes extraction
- Source file: `src/server/mod.rs`
- New/extracted files:
  - `src/server/export_routes.rs`
- Function/struct slice moved:
  - `user_export_messages`
  - `export_mbox_http`
  - `export_afp_archive_http`
  - `export_json_ld_http`
  - `export_file_http`
  - `ExportFileRequest`
- Router or callsite rewiring:
  - Main router switched from inline routes to `.merge(export_routes::routes())` for:
    - `/export/mbox`
    - `/export/afp-archive`
    - `/export/json-ld`
    - `/export/file`
- Validation run:
  - `cargo test --lib` => passed (467/467)
- Rollback artifact:
  - `src/server/mod.rs.rollback.20260418-144630.bak`

## 2026-04-18 (AEST) — `server/mod.rs` protocol/introspection routes extraction
- Source file: `src/server/mod.rs`
- New/extracted files:
  - `src/server/protocol_routes.rs`
- Function slice moved:
  - `mcp_http`
  - `verify_thread_chain_http`
- Router or callsite rewiring:
  - Main router switched from inline routes to `.merge(protocol_routes::routes())` for:
    - `/thread/{id}/verify`
    - `/mcp`
- Validation run:
  - `cargo test --lib` => passed (467/467)
- Rollback artifact:
  - `src/server/mod.rs.rollback.20260418-151234.bak`

## 2026-04-18 (AEST) — `server/mod.rs` federation relay extraction
- Source file: `src/server/mod.rs`
- New/extracted files:
  - `src/server/federation_routes.rs`
- Function slice moved:
  - `federation_relay_http`
- Router or callsite rewiring:
  - Main router switched from inline route to `.merge(federation_routes::routes())` for:
    - `/federation/relay`
- Validation run:
  - `cargo test --lib` => passed (467/467)
- Rollback artifact:
  - `src/server/mod.rs.rollback.20260418-152438.bak`

## 2026-04-18 (AEST) â€” `server/mod.rs` agent setup + focus routes extraction
- Source file: `src/server/mod.rs`
- New/extracted files:
  - `src/server/agent_setup_routes.rs`
- Function/struct slice moved:
  - `anon_fingerprint`
  - `dashboard_session_http`
  - `OnboardingAnswers`
  - `agent_onboarding_http`
  - `list_focus_items_http`
  - `CreateFocusItemRequest`
  - `create_focus_item_http`
  - `UpdateFocusItemRequest`
  - `update_focus_item_http`
- Router or callsite rewiring:
  - Main router switched from inline routes to `.merge(agent_setup_routes::routes())` for:
    - `/dashboard/session`
    - `/agent/onboarding`
    - `/agent/focus`
    - `/agent/focus/{id}`
- Validation run:
  - `cargo test --lib` => passed (467/467)
- Rollback artifact:
  - `src/server/mod.rs.rollback.20260418-153910.bak`

## 2026-04-18 (AEST) - `server/mod.rs` agent trigger route extraction
- Source file: `src/server/mod.rs`
- New/extracted files:
  - `src/server/agent_trigger_routes.rs`
- Function/struct slice moved:
  - `CreateTriggerRequest`
  - `create_trigger_http`
  - `delete_trigger_http`
- Router or callsite rewiring:
  - Main router switched from inline routes to `.merge(agent_trigger_routes::routes())` for:
    - `/agent/trigger`
    - `/agent/trigger/{id}`
- Validation run:
  - `cargo test --lib` => passed (467/467)
- Rollback artifact:
  - `src/server/mod.rs.rollback.20260418-154731.bak`

## 2026-04-18 (AEST) - `server/mod.rs` agent capability route extraction
- Source file: `src/server/mod.rs`
- New/extracted files:
  - `src/server/agent_capability_routes.rs`
- Function/struct slice moved:
  - `CreateCapabilityRequest`
  - `create_capability_http`
  - `list_capabilities_http`
  - `delete_capability_http`
- Router or callsite rewiring:
  - Main router switched from inline routes to `.merge(agent_capability_routes::routes())` for:
    - `/agent/capability`
    - `/agent/capability/{id}`
- Validation run:
  - `cargo test --lib` => passed (467/467)
- Rollback artifact:
  - `src/server/mod.rs.rollback.20260418-155425.bak`
