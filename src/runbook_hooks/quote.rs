//! Canonical quotation ingress. The source remains in the owner's private
//! ledger; the daemon projection contains references only, never vendor prose.
use super::{HookPolicy, keys};
use crate::{
    db::{Db, tenant_schema_name},
    runbook_contract::Result,
    runbook_evidence::EvidenceRequest,
    runbook_store::{RunbookStore, digest},
    runbook_validation::identifier,
};
use serde_json::{Value, json};

/// Call after authenticated canonical quotation persistence. Re-read the stored
/// record (including on HTTP replay); a caller-supplied quote cannot trigger it.
/// Existing event hooks only match instances and never start execution.
pub async fn bridge_normalised_quote(db: &Db, owner: &str, id: &str) -> Result<()> {
    if !HookPolicy::from_env().event_allowed(owner, "passive_event") {
        return Ok(());
    }
    if !identifier(owner) || !identifier(id) || id.contains(':') {
        return Err("invalid_quote_reference");
    }
    let (encryption, signing) = keys()?;
    let store = RunbookStore::new(db, encryption, signing);
    let reference = format!("private_message:{id}");
    let packet = store
        .resolve_evidence(
            owner,
            &EvidenceRequest {
                refs: vec![reference.clone()],
                required_fields: vec![],
                evidence_limit: 1,
                decrypt_limit: 1,
                byte_limit: 65536,
            },
        )
        .await?;
    let item = packet
        .included
        .first()
        .ok_or("quote_evidence_unavailable")?;
    let quote: crate::quotation::NormalisedQuotation =
        serde_json::from_value(item.content["quotation"].clone())
            .map_err(|_| "invalid_canonical_quote")?;
    if quote.identity.context_namespace != "wedding_planner"
        || !crate::quotation::validate_normalised_quotation(&quote).is_empty()
    {
        return Err("invalid_canonical_quote");
    }
    // The persisted envelope determines time and thread, so an HTTP retry cannot
    // change event identity or the frozen dispatch hash.
    let table = format!("\"{}\".messages", tenant_schema_name(owner));
    let header: Value = sqlx::query_scalar(&format!(
        "SELECT jsonb_build_object('type',type,'kind',kind,'subtype',subtype,'thread_id',thread_id,'timestamp',to_char(timestamp AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')) FROM {table} WHERE id=$1"
    )).bind(id).fetch_optional(&db.pool).await.map_err(|_| "storage_unavailable")?
        .ok_or("quote_evidence_unavailable")?;
    if header["type"] != "ledger"
        || header["kind"] != header["subtype"]
        || !matches!(
            header["kind"].as_str(),
            Some("quotation_normalisation_confirmed" | "quotation_normalisation_corrected")
        )
    {
        return Err("invalid_canonical_quote");
    }
    let event = json!({
        "protocol":"afp-v1", "id":digest(&json!(["runbook_quote_ingress.v1",owner,id])),
        "type":"passive_event", "from":"runbook_ingress", "to":[owner],
        "thread_id":header["thread_id"], "timestamp":header["timestamp"],
        "content":{"event_type":"wedding_vendor_quote_received","event_at":header["timestamp"],
            "confidence":1.0,"source_refs":[reference],"normalised_quote_ref":reference}
    });
    // Confidence describes receipt of a validated record, not commercial truth.
    // No wedding date is inferred: the existing bounded question flow asks for it.
    crate::runbook_event::normalize_stored_event(owner, owner, &event)?;
    db.insert_daemon_afp_message(&event)
        .await
        .map_err(|_| "storage_unavailable")
}
