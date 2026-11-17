//! Bounded, reference-only retrieval. Returned content is private evidence, never
//! authority, instructions, or searchable AFP metadata. No history/search fallback.
use crate::{
    background_watcher_runtime::{RELEVANCE_DECRYPT_THRESHOLD, score_metadata_relevance},
    crypto,
    db::tenant_schema_name,
    runbook_contract::{MAX_REFS, Result},
    runbook_store::{RunbookStore, digest},
    runbook_validation::identifier,
    state_snapshot::StateSnapshotContent,
    state_synthesizer_contract::SynthesizerToMasterHandoff,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeSet;

const MAX_RECORD_BYTES: usize = 65536;
const MAX_PACKET_BYTES: usize = 262144;

/// Limits come from trusted executor/account policy, never evidence content.
#[derive(Debug, Clone)]
pub struct EvidenceRequest {
    pub refs: Vec<String>,
    pub required_fields: Vec<String>,
    pub evidence_limit: usize,
    pub decrypt_limit: usize,
    pub byte_limit: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EvidenceItem {
    pub reference: String,
    pub content: Value,
    pub hash: String,
    pub relevance: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EvidenceOmission {
    pub reference: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EvidencePacket {
    pub included: Vec<EvidenceItem>,
    pub omitted: Vec<EvidenceOmission>,
    pub missing_required_fields: Vec<String>,
    pub snapshot_ref: Option<String>,
    pub handoff: Option<SynthesizerToMasterHandoff>,
    pub confidence: String,
    pub decrypt_attempts: usize,
    pub hash: String,
}

impl RunbookStore<'_> {
    /// Authentication must derive owner before calling. An account-row lock keeps
    /// deletion from racing this read; each exact record is locked through commit.
    pub async fn resolve_evidence(
        &self,
        owner: &str,
        request: &EvidenceRequest,
    ) -> Result<EvidencePacket> {
        if request.refs.len() > MAX_REFS
            || request.evidence_limit == 0
            || request.evidence_limit > MAX_REFS
            || request.decrypt_limit > MAX_REFS
            || request.byte_limit == 0
            || request.byte_limit > MAX_PACKET_BYTES
            || request.required_fields.len() > 16
            || request
                .required_fields
                .iter()
                .any(|s| !identifier(s) || s.contains(':'))
        {
            return Err("invalid_evidence_budget");
        }
        // Reject query syntax before any database access, including in omitted refs.
        for reference in &request.refs {
            let (_, id) = reference
                .split_once(':')
                .ok_or("untyped_evidence_reference")?;
            if !identifier(reference) || id.is_empty() || id.contains(':') {
                return Err("invalid_evidence_reference");
            }
        }
        let mut tx = self.begin(owner).await?;
        let mut packet = EvidencePacket {
            included: vec![],
            omitted: vec![],
            missing_required_fields: vec![],
            snapshot_ref: None,
            handoff: None,
            confidence: "low".into(),
            decrypt_attempts: 0,
            hash: String::new(),
        };
        let mut seen = BTreeSet::new();
        let mut bytes = 0;
        for reference in &request.refs {
            if !seen.insert(reference) {
                continue;
            }
            let (kind, id) = reference.split_once(':').unwrap();
            let omit = |packet: &mut EvidencePacket, reason: &str| {
                packet.omitted.push(EvidenceOmission {
                    reference: reference.clone(),
                    reason: reason.into(),
                })
            };
            if !matches!(kind, "message" | "private_message" | "snapshot") {
                omit(&mut packet, "unsupported_reference_kind");
                continue;
            }
            if packet.included.len() >= request.evidence_limit {
                omit(&mut packet, "evidence_limit");
                continue;
            }
            // Fetch only headers first. Ciphertext/body are fetched after relevance
            // and count/byte budgets have been checked. Never fall across stores.
            let private = kind != "message";
            let table = format!("\"{}\".messages", tenant_schema_name(owner));
            let header_sql = if private {
                format!(
                    "SELECT jsonb_build_object('protocol','afp-v1','id',id,'thread_id',thread_id,'parent_id',COALESCE(parent_id,''),'from',from_agent,'to',to_agents,'timestamp',to_char(timestamp AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'),'type',type,'subtype',subtype,'metadata',metadata,'encrypted',encryption IS NOT NULL,'size',octet_length(content::text)+COALESCE(octet_length(encryption::text),0)+COALESCE(octet_length(metadata::text),0)) FROM {table} WHERE id=$1 AND COALESCE(octet_length(metadata::text),0)<=65536 FOR SHARE"
                )
            } else {
                "SELECT (payload - 'content' - 'encryption' - 'views' - 'attachments') || jsonb_build_object('encrypted',payload->'encryption' IS NOT NULL AND payload->'encryption'<>'null'::jsonb,'size',octet_length(payload::text)) FROM afp_messages WHERE id=$1 AND owner_user_id=$2 AND octet_length(payload::text)<=65536 FOR SHARE".into()
            };
            let mut query = sqlx::query_scalar::<_, Value>(&header_sql).bind(id);
            if !private {
                query = query.bind(owner);
            }
            let header = query
                .fetch_optional(&mut *tx)
                .await
                .map_err(|_| "storage_unavailable")?;
            let Some(header) = header else {
                omit(&mut packet, "missing_or_unavailable");
                continue;
            };
            if header["id"] != id {
                return Err("evidence_identity_mismatch");
            }
            let size = header["size"].as_u64().unwrap_or(u64::MAX);
            if size > MAX_RECORD_BYTES as u64
                || size > request.byte_limit.saturating_sub(bytes) as u64
            {
                omit(&mut packet, "byte_budget");
                continue;
            }
            let relevance = score_metadata_relevance(
                header["type"].as_str().unwrap_or(""),
                header["subtype"].as_str().unwrap_or(""),
                header["from"].as_str().unwrap_or(""),
                &header["metadata"],
            );
            let encrypted = header["encrypted"] == true;
            if encrypted && relevance.score < RELEVANCE_DECRYPT_THRESHOLD {
                omit(&mut packet, "metadata_relevance");
                continue;
            }
            if encrypted && packet.decrypt_attempts >= request.decrypt_limit {
                omit(&mut packet, "decrypt_budget");
                continue;
            }
            // Charge attempted reads too: malformed/stale content cannot buy an
            // unbounded succession of replacement reads or decrypt attempts.
            bytes += size as usize;
            let body_sql = if private {
                format!(
                    "SELECT jsonb_build_object('content',content,'encryption',encryption) FROM {table} WHERE id=$1"
                )
            } else {
                "SELECT jsonb_build_object('content',payload->'content','encryption',payload->'encryption') FROM afp_messages WHERE id=$1 AND owner_user_id=$2".into()
            };
            let mut query = sqlx::query_scalar::<_, Value>(&body_sql).bind(id);
            if !private {
                query = query.bind(owner);
            }
            let body = query
                .fetch_one(&mut *tx)
                .await
                .map_err(|_| "storage_unavailable")?;
            let content = if encrypted {
                packet.decrypt_attempts += 1;
                let aad = json!({"protocol":header["protocol"],"id":header["id"],"thread_id":header["thread_id"],
                    "parent_id":header["parent_id"].as_str().unwrap_or(""),"from":header["from"],"to":header["to"],
                    "timestamp":header["timestamp"],"type":header["type"],"subtype":header["subtype"],"metadata":header["metadata"]});
                let Some(content) =
                    crypto::decrypt_content(&body["encryption"], &aad, &self.encryption_key)
                else {
                    omit(&mut packet, "decryption_unavailable");
                    continue;
                };
                content
            } else {
                body["content"].clone()
            };
            if kind == "snapshot" || header["type"] == "state_snapshot" {
                if header["type"] != "state_snapshot" || packet.snapshot_ref.is_some() {
                    omit(&mut packet, "invalid_snapshot");
                    continue;
                }
                let Ok(snapshot) = serde_json::from_value::<StateSnapshotContent>(content.clone())
                else {
                    omit(&mut packet, "invalid_snapshot");
                    continue;
                };
                if DateTime::parse_from_rfc3339(&snapshot.staleness_at)
                    .map(|at| at <= Utc::now())
                    .unwrap_or(true)
                {
                    omit(&mut packet, "stale_snapshot");
                    continue;
                }
                let handoff = header["metadata"]
                    .get("synthesizer_handoff")
                    .cloned()
                    .and_then(|v| serde_json::from_value::<SynthesizerToMasterHandoff>(v).ok());
                if handoff.as_ref().is_some_and(|h| h.snapshot_ref != id) {
                    omit(&mut packet, "snapshot_handoff_mismatch");
                    continue;
                }
                packet.snapshot_ref = Some(reference.clone());
                packet.handoff = handoff;
            }
            packet.included.push(EvidenceItem {
                reference: reference.clone(),
                hash: digest(&content),
                content,
                relevance: relevance.score,
            });
        }
        // Presence means a non-null top-level structured fact; no string extraction,
        // inference, or field values supplied by another evidence item's instructions.
        packet.missing_required_fields = request
            .required_fields
            .iter()
            .filter(|field| {
                !packet.included.iter().any(|item| {
                    item.content
                        .get(field.as_str())
                        .is_some_and(|v| !v.is_null())
                })
            })
            .cloned()
            .collect();
        packet.confidence =
            if packet.included.is_empty() || !packet.missing_required_fields.is_empty() {
                "low"
            } else if !packet.omitted.is_empty() {
                "partial"
            } else {
                "bounded"
            }
            .into();
        packet.hash = digest(&json!(packet));
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(packet)
    }
}
