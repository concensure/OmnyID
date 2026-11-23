//! Phase audit traces do not stand in for a completed wait dependency.
use super::*;

impl RunbookRuntime<'_, '_> {
    pub(super) async fn trace_schedule(
        &self,
        owner: &str,
        instance: &RunbookInstance,
        parent: &str,
        record_id: &str,
        schedule: &FollowUpSchedule,
        tx: &mut Transaction<'_, Postgres>,
    ) -> Result<()> {
        if instance.instance_id != schedule.instance_id {
            return Err("schedule_instance_mismatch");
        }
        let now = Utc::now();
        let status = match schedule.status {
            ScheduleStatus::Scheduled => TraceStatus::Waiting,
            ScheduleStatus::Delivered => TraceStatus::Completed,
            ScheduleStatus::Cancelled => TraceStatus::Denied,
            ScheduleStatus::Expired => TraceStatus::Failed,
        };
        let id = digest(&json!([
            "runbook_schedule_trace.v1",
            owner,
            schedule.schedule_id,
            schedule.revision
        ]));
        let mut trace = StepTrace {
            trace_id: id.clone(),
            instance_id: instance.instance_id.clone(),
            step_id: schedule.step_id.clone(),
            step_kind: StepKind::Wait,
            status,
            input_refs: vec![parent.into()],
            output_refs: vec![record_id.into()],
            input_hash: digest(&json!([
                parent,
                schedule.requested_revision,
                schedule.due_at,
                schedule.expires_at
            ])),
            output_hash: Some(digest(&json!(schedule))),
            tool_id: None,
            model: None,
            prompt_version: None,
            input_tokens: 0,
            output_tokens: 0,
            cost_microunits: 0,
            approval_ref: None,
            provenance_ref: None,
            started_at: now,
            completed_at: (status != TraceStatus::Waiting).then_some(now),
        };
        self.attach_provenance(owner, instance, &mut trace, None, tx)
            .await?;
        let mut value = build_runtime_afp(owner, Some(parent), &RuntimeRecord::Trace(trace), now)?;
        value["id"] = json!(id);
        self.store.append(owner, value, tx).await
    }
}
