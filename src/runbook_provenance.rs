//! Companion records use the existing action provenance contract, privately stored.
use crate::{
    message::{AfpProvenanceHash, AfpProvenanceRecordContent},
    provenance_record::build_action_provenance_record_afp,
    runbook_contract::*,
    runbook_runtime::RunbookRuntime,
    runbook_store::digest,
};
use serde_json::{Value, json};
use sqlx::{Postgres, Transaction};

impl RunbookRuntime<'_, '_> {
    pub(crate) async fn attach_provenance(
        &self,
        owner: &str,
        instance: &RunbookInstance,
        trace: &mut StepTrace,
        read_packet_hash: Option<&str>,
        tx: &mut Transaction<'_, Postgres>,
    ) -> Result<()> {
        let definition = self.definition(owner, instance, tx).await?;
        let dispatch_id = digest(&json!([
            "runbook_dispatch.v1",
            owner,
            instance.trigger_event_id
        ]));
        let dispatch = self
            .store
            .read_kind(owner, "runbook_dispatch", Some(&dispatch_id), None, tx)
            .await?
            .pop()
            .ok_or("dispatch_missing")?;
        let trigger_hash = dispatch["content"]["event_hash"]
            .as_str()
            .ok_or("invalid_dispatch")?;
        let packet_hash = if let Some(hash) = read_packet_hash {
            Some(hash.to_owned())
        } else if let Some(id) = &instance.evidence_packet_ref {
            let packet = self
                .store
                .read_kind(owner, "runbook_evidence", Some(id), None, tx)
                .await?
                .pop()
                .ok_or("evidence_missing")?;
            Some(
                crate::runbook_read::parse_receipt(owner, &packet)?
                    .packet
                    .hash,
            )
        } else {
            None
        };
        let hash = |label: &str, sha256: String| AfpProvenanceHash {
            label: label.into(),
            sha256,
        };
        let inputs = vec![
            hash("definition", digest(&json!(definition))),
            hash("trigger", trigger_hash.into()),
            hash(
                "evidence_packet",
                packet_hash.unwrap_or_else(|| digest(&Value::Null)),
            ),
            hash("step_input", trace.input_hash.clone()),
            // Current executors have no approval grant. Hash explicit absence;
            // future approval execution must resolve/hash its actual authority.
            hash("approval", digest(&json!(trace.approval_ref))),
        ];
        let outputs = trace
            .output_hash
            .iter()
            .map(|h| hash("step_output", h.clone()))
            .collect();
        let mut refs = vec![
            instance.definition_ref.clone(),
            instance.trigger_event_id.clone(),
        ];
        refs.extend(trace.input_refs.clone());
        refs.extend(trace.output_refs.clone());
        refs.extend(instance.evidence_packet_ref.clone());
        let refs = crate::proactive_provenance::dedupe_provenance_refs(refs);
        let ref_slices = refs.iter().map(String::as_str).collect::<Vec<_>>();
        let mut value = build_action_provenance_record_afp(
            owner,
            &instance.thread_id,
            Some(&trace.trace_id),
            "runbook_runtime",
            "runbook_step",
            "Runbook step receipt",
            &ref_slices,
            inputs,
            outputs,
            None,
            Some(
                json!({"runbook_id":instance.runbook_id,"runbook_version":instance.runbook_version,
                "instance_id":instance.instance_id,"revision":instance.revision,"step_id":trace.step_id,
                "status":trace.status,"approval_ref":trace.approval_ref,"model":trace.model,
                "prompt_version":trace.prompt_version,"input_tokens":trace.input_tokens,
                "output_tokens":trace.output_tokens,"cost_microunits":trace.cost_microunits,
                "authority":"audit_only"}),
            ),
        );
        let id = digest(&json!(["runbook_provenance.v1", owner, trace.trace_id]));
        value["id"] = json!(id);
        value["content"]["record_id"] = json!(id);
        value["from"] = json!(owner);
        value["metadata"] = json!({"private":true,"store":true,"provenance":true});
        value["references"] = json!([]);
        value["supertags"] = json!(["runbook_provenance"]);
        self.store.append(owner, value, tx).await?;
        trace.provenance_ref = Some(id);
        Ok(())
    }
}

pub(crate) fn validate(owner: &str, value: &Value) -> Result<()> {
    let content: AfpProvenanceRecordContent = serde_json::from_value(value["content"].clone())
        .map_err(|_| "invalid_runbook_provenance")?;
    let parent = value["parent_id"]
        .as_str()
        .ok_or("invalid_runbook_provenance")?;
    let id = digest(&json!(["runbook_provenance.v1", owner, parent]));
    if value["protocol"] != "afp-v1"
        || value["id"] != id
        || content.record_id != id
        || value["from"] != owner
        || value["to"] != json!([owner])
        || value["type"] != "provenance_record"
        || value["subtype"] != "action"
        || value["metadata"] != json!({"private":true,"store":true,"provenance":true})
        || value["references"] != json!([])
        || value["supertags"] != json!(["runbook_provenance"])
        || value["store_in_relational"] != true
        || content.actor != "runbook_runtime"
        || content.action_type != "runbook_step"
        || value["content"].to_string().len() > 32768
        || content
            .context
            .as_ref()
            .and_then(|c| c["authority"].as_str())
            != Some("audit_only")
        || content
            .input_hashes
            .iter()
            .chain(&content.output_hashes)
            .any(|h| h.sha256.len() != 64 || !h.sha256.bytes().all(|b| b.is_ascii_hexdigit()))
    {
        return Err("invalid_runbook_provenance");
    }
    Ok(())
}
