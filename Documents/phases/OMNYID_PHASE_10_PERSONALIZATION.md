# Omnyid Phase 10 LoRA Genome Personalization

## Phase 10: LoRA Genome Personalization

Status: in progress

Purpose: prepare the personalization layer without leaking user data or obscuring training control.

## What Was Landed

### Personalization Event Contract

- [src/personalization.rs](/c:/Users/joes/Desktop/projects/Agenton/src/personalization.rs) now defines:
  - `FeedbackSignal`
  - `PersonalizationEvent`
  - `LoraArtifact`
  - `TrainingSchedule`
- This gives the repo a first-class schema for approvals, rejections, edits, and ignored suggestions as AFP-adjacent events.

### Local Training Baseline

- `TrainingSchedule::weekly_default()` encodes the intended weekly cadence and requires device-local execution by default.
- The tests in [src/personalization.rs](/c:/Users/joes/Desktop/projects/Agenton/src/personalization.rs) keep the initial contract focused on local capture plus versioned artifact lifecycle.

### Durable Personalization Tables

- [postgres/migrations/0002_workflow_state.sql](/c:/Users/joes/Desktop/projects/Agenton/postgres/migrations/0002_workflow_state.sql) now adds:
  - `personalization_events`
  - `lora_artifacts`
- [src/db.rs](/c:/Users/joes/Desktop/projects/Agenton/src/db.rs) now includes:
  - `record_personalization_event(...)`
  - `upsert_lora_artifact(...)`

## Still Remaining In Phase 10

- connect feedback capture to real agent actions and UI approvals
- design the local or self-hosted fine-tune runner
- add evaluation dashboards and rollback controls
- wire artifact storage, activation, and rollback into the homeserver and UI

## Notes

Phase 10 is intentionally only at the contract stage. That is the right posture until the shared-thread inbox, local sync, and approval flows are stronger.
