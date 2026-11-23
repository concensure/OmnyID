use std::collections::{BTreeSet, HashSet};
use std::time::Duration;

use chrono::Utc;
use futures_util::future::join_all;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::Row;
use tokio::task::JoinHandle;
use tracing::{info, warn};
use ulid::Ulid;

use crate::{
    afp::Message as ProtoMessage,
    coordination_bus::{CoordFamily, DaemonCursor, coordination_bus},
    daemon_registry,
    db::Db,
    entity_extractor::extract_from_afp_content,
    knowledge_curator::{
        BacklinkKind, BacklinkRecord, CuratorPolicy, CuratorRunAudit, CuratorRunStatus,
        CuratorTriggerKind, DaemonKind, KnowledgeCard,
    },
    message::{
        AFP_SUBTYPE_KNOWLEDGE_LINK_ENTITY, AFP_SUBTYPE_KNOWLEDGE_LINK_RELATIONSHIP,
        AFP_TYPE_BACKLINK_OVERRIDE, AFP_TYPE_KNOWLEDGE_LINK, AFP_TYPE_PARSED_DOCUMENT,
        AFP_TYPE_RELATION_LINK, AFP_TYPE_TRANSCRIPT, AfpEntityMention, AfpKnowledgeLinkContent,
        AfpRelationship, BacklinkOverrideContent, FolderRuleContent,
    },
    summarizer::{generate_embedding_with_ollama, generate_summary_and_embedding},
};

const CURATOR_MODEL_VERSION: &str = "local-summary-v1";

/// Minimum seconds between passes when Bridge A wakeups are active.
const CURATOR_MIN_IDLE_SECS: u64 = 2;
const CURATOR_DEFAULT_IDLE_SECS: u64 = 20;
const CURATOR_MAX_IDLE_SECS: u64 = 120;

fn next_curator_idle_secs(current_idle_secs: u64, processed_count: Option<u32>) -> u64 {
    match processed_count {
        Some(total) if total > 0 => CURATOR_DEFAULT_IDLE_SECS,
        Some(_) | None => (current_idle_secs * 2).min(CURATOR_MAX_IDLE_SECS),
    }
}

pub fn start_knowledge_curator_daemon(
    db: Db,
    mut shutdown: crate::daemon_runtime::ShutdownRx,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        info!("Knowledge Curator daemon started");
        // GAP-072: exponential idle backoff — ramp up to 120s when nothing is
        // processed, snap back to 20s the moment a message is processed.
        // GAP-083: exits cleanly when shutdown signal fires.
        let mut idle_secs: u64 = CURATOR_DEFAULT_IDLE_SECS;
        // Subscribe before the loop so we never miss a wakeup between passes.
        let mut wake = coordination_bus().subscribe();
        let mut cursor = DaemonCursor::new(&[
            CoordFamily::Ingestion,
            CoordFamily::Watcher,
            CoordFamily::Other,
        ]);
        loop {
            let pass_result = if cursor.should_run() {
                let r = run_curator_pass_with_count(&db).await;
                cursor.commit();
                r
            } else {
                Ok(0)
            };
            match pass_result {
                Ok(total) if total > 0 => {
                    idle_secs = next_curator_idle_secs(idle_secs, Some(total));
                }
                Ok(_) => {
                    idle_secs = next_curator_idle_secs(idle_secs, Some(0));
                }
                Err(err) => {
                    warn!(%err, "Knowledge Curator pass failed");
                    idle_secs = next_curator_idle_secs(idle_secs, None);
                }
            }
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(idle_secs)) => {}
                // Bridge A: new ingestion or watcher AFP — wake immediately.
                res = wake.recv() => {
                    use tokio::sync::broadcast::error::RecvError;
                    match res {
                        Ok(w) => {
                            if matches!(w.family, CoordFamily::Ingestion | CoordFamily::Watcher | CoordFamily::Other) {
                                idle_secs = CURATOR_MIN_IDLE_SECS;
                            }
                        }
                        Err(RecvError::Lagged(_)) => { idle_secs = CURATOR_MIN_IDLE_SECS; }
                        Err(RecvError::Closed) => break,
                    }
                }
                _ = shutdown.changed() => {
                    if *shutdown.borrow() {
                        info!("Knowledge Curator daemon: graceful shutdown");
                        break;
                    }
                }
            }
        }
    })
}

pub async fn run_curator_backfill_pass(
    db: &Db,
    user_id: &str,
    limit: i64,
) -> Result<u32, sqlx::Error> {
    let Some(registration) =
        daemon_registry::get_active_daemon_for_kind(db, user_id, DaemonKind::KnowledgeCurator)
            .await?
    else {
        return Ok(0);
    };
    let processed = process_user_queue(
        db,
        user_id,
        &registration.daemon_id,
        &registration.policy_config,
        limit,
    )
    .await?;
    if processed > 0 {
        daemon_registry::record_heartbeat(db, &registration.daemon_id, user_id, 0, processed, 0, 0)
            .await?;
    }
    Ok(processed)
}

async fn run_curator_pass_with_count(db: &Db) -> Result<u32, sqlx::Error> {
    let user_ids = db.list_user_ids().await?;
    let handles: Vec<_> = user_ids
        .into_iter()
        .map(|user_id| {
            let db = db.clone();
            tokio::spawn(async move {
                let registration = daemon_registry::get_active_daemon_for_kind(
                    &db,
                    &user_id,
                    DaemonKind::KnowledgeCurator,
                )
                .await;
                let Ok(Some(registration)) = registration else {
                    return 0u32;
                };
                if let Err(err) = db.ensure_user_private_schema(&user_id).await {
                    warn!(%err, %user_id, "Curator failed to ensure tenant schema");
                    return 0u32;
                }
                let processed = process_user_queue(
                    &db,
                    &user_id,
                    &registration.daemon_id,
                    &registration.policy_config,
                    12,
                )
                .await
                .unwrap_or_else(|err| {
                    warn!(%err, %user_id, "Curator pass failed for user");
                    0
                });
                if processed > 0 {
                    let _ = daemon_registry::record_heartbeat(
                        &db,
                        &registration.daemon_id,
                        &user_id,
                        0,
                        processed,
                        0,
                        0,
                    )
                    .await;
                }
                processed
            })
        })
        .collect();
    let results = join_all(handles).await;
    let total = results.into_iter().filter_map(|r| r.ok()).sum();
    Ok(total)
}

#[allow(dead_code)]
async fn run_curator_pass(db: &Db) -> Result<(), sqlx::Error> {
    let user_ids = db.list_user_ids().await?;
    let handles: Vec<_> = user_ids
        .into_iter()
        .map(|user_id| {
            let db = db.clone();
            tokio::spawn(async move {
                let registration = daemon_registry::get_active_daemon_for_kind(
                    &db,
                    &user_id,
                    DaemonKind::KnowledgeCurator,
                )
                .await;
                let Ok(Some(registration)) = registration else {
                    return;
                };
                if let Err(err) = db.ensure_user_private_schema(&user_id).await {
                    warn!(%err, %user_id, "Curator failed to ensure tenant schema");
                    return;
                }
                let processed = process_user_queue(
                    &db,
                    &user_id,
                    &registration.daemon_id,
                    &registration.policy_config,
                    12,
                )
                .await
                .unwrap_or_else(|err| {
                    warn!(%err, %user_id, "Curator pass failed for user");
                    0
                });
                if processed > 0 {
                    let _ = daemon_registry::record_heartbeat(
                        &db,
                        &registration.daemon_id,
                        &user_id,
                        0,
                        processed,
                        0,
                        0,
                    )
                    .await;
                }
            })
        })
        .collect();
    join_all(handles).await;
    Ok(())
}

async fn process_user_queue(
    db: &Db,
    user_id: &str,
    daemon_id: &str,
    policy: &CuratorPolicy,
    limit: i64,
) -> Result<u32, sqlx::Error> {
    let rows = sqlx::query(&format!(
        r#"
        SELECT
            m.id,
            m.thread_id,
            m.type,
            m.summary,
            m.content,
            m.supertags,
            m.metadata,
            m."references",
            m.timestamp::text AS timestamp
        FROM {} m
        LEFT JOIN afp_knowledge_cards kc
          ON kc.user_id = $1
         AND kc.source_id = m.id
        WHERE kc.source_id IS NULL
          AND m.type NOT IN (
              'daemon_heartbeat',
              'sync_error',
              'archived_notice',
              'knowledge_card',
              'backlink_update',
              'merge_suggestion',
              'insight',
              'system_health',
              'folder_rule',
              'area_rules',
              'passive_event',
              'tag_update'
          )
          AND COALESCE(m.content->'omnyid_storage'->>'mode', '') <> 'ciphertext_only'
          AND COALESCE(m.metadata->>'branch_id', m.content->>'branch_id', '') = ''
        ORDER BY m.timestamp ASC
        LIMIT $2
        "#,
        tenant_messages_table(user_id)
    ))
    .bind(user_id)
    .bind(limit)
    .fetch_all(&db.pool)
    .await?;

    let mut processed = 0u32;
    for row in rows {
        let source_id: String = match row.try_get("id") {
            Ok(id) => id,
            Err(e) => {
                warn!(%e, %user_id, "curator: skipping row with undecodable id");
                continue;
            }
        };
        match process_source_message(db, user_id, daemon_id, policy, &row).await {
            Ok(n) => processed += n,
            Err(err) => {
                // Poison-message protection: record a skip card so this message is excluded
                // from future queue queries (LEFT JOIN afp_knowledge_cards) rather than
                // blocking the user's queue indefinitely on a bad message.
                warn!(%err, %source_id, %user_id, "curator: message processing failed; inserting poison-skip card");
                let skip_card = poison_skip_knowledge_card(user_id, &source_id);
                if let Err(skip_err) = upsert_knowledge_card(db, &skip_card).await {
                    warn!(%skip_err, %source_id, "curator: failed to insert poison-skip card; message will retry next pass");
                }
            }
        }
    }
    Ok(processed)
}

fn poison_skip_knowledge_card(user_id: &str, source_id: &str) -> KnowledgeCard {
    KnowledgeCard {
        card_id: stable_knowledge_card_id(user_id, source_id),
        user_id: user_id.to_string(),
        source_id: source_id.to_string(),
        summary: None,
        supertags: vec![],
        entities: vec![],
        model_version: "poison-skip".to_string(),
        created_at: Utc::now().to_rfc3339(),
        curator_run_id: String::new(),
        card_json: json!({
            "skip": true,
            "reason": "processing_error",
        }),
    }
}

fn ineligible_knowledge_card(
    user_id: &str,
    source_id: &str,
    reason: &'static str,
) -> KnowledgeCard {
    KnowledgeCard {
        card_id: stable_knowledge_card_id(user_id, source_id),
        user_id: user_id.to_string(),
        source_id: source_id.to_string(),
        summary: None,
        supertags: vec![],
        entities: vec![],
        model_version: "ineligible-skip-v1".to_string(),
        created_at: Utc::now().to_rfc3339(),
        curator_run_id: String::new(),
        card_json: json!({
            "skip": true,
            "reason": reason,
        }),
    }
}

async fn process_source_message(
    db: &Db,
    user_id: &str,
    daemon_id: &str,
    policy: &CuratorPolicy,
    row: &sqlx::postgres::PgRow,
) -> Result<u32, sqlx::Error> {
    let started_at = Utc::now();
    let source_id: String = row.get("id");
    let thread_id: String = row.get("thread_id");
    let message_type: String = row.get("type");
    let content: Value = row.try_get("content").unwrap_or_else(|_| json!({}));
    let metadata = row.try_get::<Option<Value>, _>("metadata").ok().flatten();
    if let Some(skip_reason) = curator_ineligible_reason(&message_type, &content, metadata.as_ref())
    {
        // A durable internal marker keeps the source out of later queue scans.
        // Do not append an audit row for policy-ineligible work: doing both on
        // every pass previously retried the same source forever and grew the
        // audit table without performing any useful work.
        let skip_card = ineligible_knowledge_card(user_id, &source_id, skip_reason);
        upsert_knowledge_card(db, &skip_card).await?;
        return Ok(1);
    }
    let refs = row
        .try_get::<Value, _>("references")
        .unwrap_or_else(|_| Value::Array(vec![]));
    let timestamp: String = row.get("timestamp");
    let existing_summary = row.try_get::<Option<String>, _>("summary").ok().flatten();
    let source_text = flatten_text(&content, existing_summary.as_deref());
    let run_id = Ulid::new().to_string();
    let metadata_ephemeral = metadata
        .as_ref()
        .and_then(|value| value.get("ephemeral_output"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let top_level_supertags = row
        .try_get::<Vec<String>, _>("supertags")
        .unwrap_or_default();
    let retention_ephemeral = top_level_supertags
        .iter()
        .any(|tag| tag.eq_ignore_ascii_case("retention:keep_nothing"));

    // Phase A fast-skip: too short or recognised noise pattern.
    let skip_reason = if metadata_ephemeral || retention_ephemeral {
        Some("ephemeral_ingest_output")
    } else if source_text.trim().len() < 24 {
        Some("non_substantive")
    } else if is_noise_message(source_text.trim(), &message_type) {
        Some("noise")
    } else {
        None
    };
    if let Some(skip_reason) = skip_reason {
        let skip_card = ineligible_knowledge_card(user_id, &source_id, skip_reason);
        upsert_knowledge_card(db, &skip_card).await?;
        return Ok(1);
    }

    // Load folder scope first, then layer any per-message / per-thread override
    // on top (highest priority in the rules hierarchy).
    let mut scope = load_folder_scope(db, user_id, &thread_id, &content, metadata.as_ref()).await?;
    if let Some(override_rules) = load_backlink_override(db, user_id, &source_id, &thread_id).await
    {
        // Per-message override wins: merge suppress flag and threshold/scope.
        if override_rules.suppress_backlinks {
            scope.suppress_backlinks = true;
        }
        if override_rules.threshold.is_some() {
            scope.backlink_threshold = override_rules.threshold;
        }
        if override_rules.search_scope != BacklinkSearchScope::SameFolder
            || scope.search_scope == BacklinkSearchScope::SameFolder
        {
            scope.search_scope = override_rules.search_scope;
        }
    }
    // Use the real Ollama embedding when available; the sync helper is only
    // kept for the non-async db.rs storage path.
    let ollama_url = std::env::var("OLLAMA_URL").ok();
    let embed_model = std::env::var("OLLAMA_EMBED_MODEL").ok();
    let embedding =
        generate_embedding_with_ollama(ollama_url.as_deref(), embed_model.as_deref(), &source_text)
            .await;
    let (summary, _) = generate_summary_and_embedding(&json!({ "text": source_text }));
    let entities = extract_entities(&source_text);
    let source_refs = extract_reference_ids(&refs);
    // Merge folder-level tag suggestions with user-defined supertag definitions
    // (definitions are checked first so user-authored rules always appear in output).
    let definition_tags =
        apply_supertag_definitions(db, user_id, &source_text, scope.folder_id.as_deref()).await;
    let mut combined_tag_hints = definition_tags;
    for tag in &scope.tag_suggestions {
        if !combined_tag_hints.contains(tag) {
            combined_tag_hints.push(tag.clone());
        }
    }
    let supertags = suggest_supertags(&source_text, &combined_tag_hints, &entities);
    let backlink_threshold = scope
        .backlink_threshold
        .unwrap_or(policy.backlink_similarity_threshold);
    let semantic_links_created = if should_emit_semantic_topology_links(
        &message_type,
        metadata.as_ref(),
        &top_level_supertags,
        &supertags,
    ) {
        store_semantic_topology_links(
            db,
            user_id,
            &thread_id,
            &source_id,
            &message_type,
            &content,
            &source_refs,
            &supertags,
        )
        .await?
    } else {
        0
    };

    let candidates = if let Some(embedding) = embedding.as_deref() {
        find_similarity_candidates(
            db,
            user_id,
            &source_id,
            embedding,
            &scope.search_scope,
            scope.folder_id.as_deref(),
            10,
        )
        .await?
    } else {
        Vec::new()
    };

    let mut backlinks_created = 0u32;
    if !scope.suppress_backlinks {
        for candidate in candidates {
            let overlap = jaccard(&entities, &candidate.entities);
            let supertag_overlap = if supertags.is_empty() || candidate.supertags.is_empty() {
                0.0
            } else {
                let left = supertags
                    .iter()
                    .map(|tag| tag.to_ascii_lowercase())
                    .collect::<BTreeSet<_>>();
                let right = candidate
                    .supertags
                    .iter()
                    .map(|tag| tag.to_ascii_lowercase())
                    .collect::<BTreeSet<_>>();
                jaccard(&left, &right)
            };
            let thread_bonus =
                if candidate.thread_id == thread_id || source_refs.contains(&candidate.id) {
                    1.0
                } else {
                    0.0
                };
            let score = 0.5 * candidate.similarity
                + 0.2 * overlap
                + 0.15 * supertag_overlap
                + 0.15 * thread_bonus;
            if score < backlink_threshold {
                continue;
            }
            let record = BacklinkRecord {
                backlink_id: stable_backlink_id(
                    user_id,
                    &source_id,
                    &candidate.id,
                    &BacklinkKind::SemanticSimilarity,
                    "mentions",
                ),
                user_id: user_id.to_string(),
                source_id: source_id.clone(),
                target_id: candidate.id.clone(),
                link_kind: BacklinkKind::SemanticSimilarity,
                ref_type: "mentions".to_string(),
                similarity: Some(score),
                entities: entities
                    .iter()
                    .filter(|value| candidate.entities.contains(*value))
                    .cloned()
                    .collect(),
                created_at: Utc::now().to_rfc3339(),
                curator_run_id: run_id.clone(),
            };
            store_backlink_update_message(db, user_id, &record).await?;
            db.upsert_backlink_record(&record).await?;
            backlinks_created += 1;
        }
    }

    // Phase B gate: skip knowledge card generation when the user's daily LLM
    // token budget is at or above 80%.  Backlinks are already written above, so
    // the message is still indexed; the card will be generated on the next
    // curator pass once the budget window resets.
    let phase_b_enabled = policy.knowledge_cards_enabled && {
        let tokens_today = query_daily_token_usage(db, user_id).await;
        let budget_pct = if policy.max_tokens_per_day == 0 {
            0.0
        } else {
            tokens_today as f32 / policy.max_tokens_per_day as f32
        };
        budget_pct < 0.80
    };

    if !phase_b_enabled {
        record_curator_audit(
            db,
            &CuratorRunAudit {
                run_id,
                user_id: user_id.to_string(),
                daemon_id: daemon_id.to_string(),
                source_message_id: Some(source_id),
                trigger_kind: CuratorTriggerKind::NewMessage,
                backlinks_created,
                cards_created: 0,
                insights_created: 0,
                tokens_used: 0,
                duration_ms: Some((Utc::now() - started_at).num_milliseconds().max(0) as u32),
                status: CuratorRunStatus::Partial,
                error_message: Some("phase_b_skipped: token_budget_near_limit".to_string()),
                created_at: Utc::now().to_rfc3339(),
            },
        )
        .await?;
        return Ok(1);
    }

    let card = KnowledgeCard {
        card_id: stable_knowledge_card_id(user_id, &source_id),
        user_id: user_id.to_string(),
        source_id: source_id.clone(),
        summary: Some(summary.clone()),
        supertags: supertags.clone(),
        entities: entities.iter().cloned().collect(),
        card_json: json!({
            "source_id": source_id,
            "thread_id": thread_id,
            "message_type": message_type,
            "folder_id": scope.folder_id,
            "summary": summary,
            "suggested_supertags": supertags,
            "related_matches": backlinks_created,
            "semantic_links_created": semantic_links_created,
        }),
        model_version: CURATOR_MODEL_VERSION.to_string(),
        created_at: timestamp,
        curator_run_id: run_id.clone(),
    };
    upsert_knowledge_card(db, &card).await?;
    store_knowledge_card_message(db, user_id, &card).await?;

    record_curator_audit(
        db,
        &CuratorRunAudit {
            run_id,
            user_id: user_id.to_string(),
            daemon_id: daemon_id.to_string(),
            source_message_id: Some(card.source_id.clone()),
            trigger_kind: CuratorTriggerKind::NewMessage,
            backlinks_created,
            cards_created: 1,
            insights_created: 0,
            tokens_used: 0,
            duration_ms: Some((Utc::now() - started_at).num_milliseconds().max(0) as u32),
            status: CuratorRunStatus::Completed,
            error_message: None,
            created_at: Utc::now().to_rfc3339(),
        },
    )
    .await?;

    Ok(1)
}

async fn load_folder_scope(
    db: &Db,
    user_id: &str,
    thread_id: &str,
    content: &Value,
    metadata: Option<&Value>,
) -> Result<FolderScope, sqlx::Error> {
    let folder_id = content
        .get("folder_id")
        .and_then(Value::as_str)
        .or_else(|| {
            metadata
                .and_then(|value| value.get("folder_id"))
                .and_then(Value::as_str)
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| thread_id.strip_prefix("folder:").map(str::to_string));
    let Some(folder_id_value) = folder_id.clone() else {
        return Ok(FolderScope {
            folder_id: None,
            tag_suggestions: Vec::new(),
            suppress_backlinks: false,
            backlink_threshold: None,
            search_scope: BacklinkSearchScope::SameFolder,
        });
    };
    let row = sqlx::query(&format!(
        r#"
        SELECT content
        FROM {}
        WHERE type = 'folder_rule'
          AND content->>'folder_id' = $1
        ORDER BY timestamp DESC
        LIMIT 1
        "#,
        tenant_messages_table(user_id)
    ))
    .bind(&folder_id_value)
    .fetch_optional(&db.pool)
    .await?;
    let rule = row
        .and_then(|row| row.try_get::<Value, _>("content").ok())
        .and_then(|value| serde_json::from_value::<FolderRuleContent>(value).ok());
    let tag_suggestions = rule
        .as_ref()
        .map(|value| value.tag_suggestions.clone())
        .unwrap_or_default();
    let parsed_rules = rule
        .as_ref()
        .and_then(|value| value.backlink_rules.as_deref())
        .map(parse_backlink_rules)
        .unwrap_or_default();
    Ok(FolderScope {
        folder_id,
        tag_suggestions,
        suppress_backlinks: parsed_rules.suppress_backlinks,
        backlink_threshold: parsed_rules.threshold,
        search_scope: parsed_rules.search_scope,
    })
}

async fn find_similarity_candidates(
    db: &Db,
    user_id: &str,
    source_id: &str,
    embedding: &[f32],
    search_scope: &BacklinkSearchScope,
    folder_id: Option<&str>,
    limit: i64,
) -> Result<Vec<CandidateMessage>, sqlx::Error> {
    let mut sql = format!(
        r#"
        SELECT
            id,
            thread_id,
            content,
            summary,
            metadata,
            supertags,
            1 - (embedding <=> ($2::real[])::vector) AS similarity
        FROM {}
        WHERE id <> $1
          AND embedding IS NOT NULL
          AND timestamp > NOW() - INTERVAL '60 days'
          AND COALESCE((metadata->>'ephemeral_output')::boolean, FALSE) = FALSE
        "#,
        tenant_messages_table(user_id)
    );
    let rows = match (search_scope, folder_id) {
        (BacklinkSearchScope::AllFolders, _) | (_, None) => {
            sql.push_str(" ORDER BY embedding <=> ($2::real[])::vector LIMIT $3");
            sqlx::query(&sql)
                .bind(source_id)
                .bind(embedding)
                .bind(limit)
                .fetch_all(&db.pool)
                .await?
        }
        (BacklinkSearchScope::SameFolder, Some(folder_id)) => {
            sql.push_str(" AND (thread_id = $3 OR content->>'folder_id' = $4)");
            sql.push_str(" ORDER BY embedding <=> ($2::real[])::vector LIMIT $5");
            sqlx::query(&sql)
                .bind(source_id)
                .bind(embedding)
                .bind(format!("folder:{folder_id}"))
                .bind(folder_id)
                .bind(limit)
                .fetch_all(&db.pool)
                .await?
        }
        (BacklinkSearchScope::FolderAndGlobal, Some(folder_id)) => {
            sql.push_str(
                " AND (thread_id = $3 OR content->>'folder_id' = $4 OR thread_id = $5 OR content->>'folder_id' = 'global')",
            );
            sql.push_str(" ORDER BY embedding <=> ($2::real[])::vector LIMIT $6");
            sqlx::query(&sql)
                .bind(source_id)
                .bind(embedding)
                .bind(format!("folder:{folder_id}"))
                .bind(folder_id)
                .bind("folder:global")
                .bind(limit)
                .fetch_all(&db.pool)
                .await?
        }
    };
    Ok(rows
        .into_iter()
        .map(|row| {
            let content = row
                .try_get::<Value, _>("content")
                .unwrap_or_else(|_| json!({}));
            let summary = row.try_get::<Option<String>, _>("summary").ok().flatten();
            let supertags = row
                .try_get::<Vec<String>, _>("supertags")
                .unwrap_or_default();
            CandidateMessage {
                id: row.get("id"),
                thread_id: row.get("thread_id"),
                similarity: row
                    .try_get::<Option<f64>, _>("similarity")
                    .ok()
                    .flatten()
                    .unwrap_or(0.0) as f32,
                entities: extract_entities(&flatten_text(&content, summary.as_deref())),
                supertags,
            }
        })
        .collect())
}

fn curator_ineligible_reason(
    message_type: &str,
    content: &Value,
    metadata: Option<&Value>,
) -> Option<&'static str> {
    if message_type == "passive_event" {
        return Some("passive_event");
    }
    if json_path_str(content, &["omnyid_storage", "mode"]) == Some("ciphertext_only")
        || json_path_str(content, &["mode"]) == Some("ciphertext_only")
    {
        return Some("ciphertext_only");
    }
    if metadata
        .and_then(|value| json_path_str(value, &["branch_id"]))
        .or_else(|| json_path_str(content, &["branch_id"]))
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false)
    {
        return Some("branch_message");
    }
    if metadata
        .and_then(|value| value.get("store"))
        .and_then(Value::as_bool)
        == Some(false)
    {
        return Some("metadata_store_false");
    }
    None
}

fn json_path_str<'a>(value: &'a Value, path: &[&str]) -> Option<&'a str> {
    let mut cursor = value;
    for part in path {
        cursor = cursor.get(*part)?;
    }
    cursor.as_str()
}

fn stable_knowledge_card_id(user_id: &str, source_id: &str) -> String {
    stable_curator_lineage_id("knowledge-card", &[user_id, source_id])
}

fn stable_backlink_id(
    user_id: &str,
    source_id: &str,
    target_id: &str,
    link_kind: &BacklinkKind,
    ref_type: &str,
) -> String {
    stable_curator_lineage_id(
        "backlink",
        &[
            user_id,
            source_id,
            target_id,
            backlink_kind_slug(link_kind),
            ref_type,
        ],
    )
}

fn stable_curator_lineage_id(prefix: &str, parts: &[&str]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(prefix.as_bytes());
    for part in parts {
        hasher.update([0x1f]);
        hasher.update(part.as_bytes());
    }
    format!("{prefix}.{}", hex::encode(hasher.finalize()))
}

fn stable_semantic_link_id(
    user_id: &str,
    source_id: &str,
    message_type: &str,
    subtype: &str,
    relationship_id: &str,
) -> String {
    stable_curator_lineage_id(
        "semantic-link",
        &[user_id, source_id, message_type, subtype, relationship_id],
    )
}

fn backlink_kind_slug(kind: &BacklinkKind) -> &'static str {
    match kind {
        BacklinkKind::SemanticSimilarity => "semantic_similarity",
        BacklinkKind::EntityOverlap => "entity_overlap",
        BacklinkKind::ExplicitRef => "explicit_ref",
        BacklinkKind::TemporalProximity => "temporal_proximity",
    }
}

fn afp_message_reference(target: &str, link_type: &str, label: Option<&str>) -> Value {
    let mut reference = serde_json::Map::new();
    reference.insert("type".to_string(), Value::String("message".to_string()));
    reference.insert("target".to_string(), Value::String(target.to_string()));
    if let Some(label) = label.map(str::trim).filter(|value| !value.is_empty()) {
        reference.insert("label".to_string(), Value::String(label.to_string()));
    }
    reference.insert(
        "metadata".to_string(),
        json!({
            "link_type": link_type,
        }),
    );
    Value::Object(reference)
}

fn should_emit_semantic_topology_links(
    message_type: &str,
    metadata: Option<&Value>,
    source_supertags: &[String],
    suggested_supertags: &[String],
) -> bool {
    if matches!(message_type, AFP_TYPE_PARSED_DOCUMENT | AFP_TYPE_TRANSCRIPT) {
        return true;
    }

    let metadata_mode = metadata
        .and_then(|value| value.get("knowledge_pipeline"))
        .and_then(Value::as_str)
        .map(str::trim);
    if metadata_mode == Some("connected_notes_ingest") {
        return true;
    }

    let knowledge_mode = metadata
        .and_then(|value| value.get("knowledge_mode"))
        .and_then(Value::as_str)
        .map(str::trim);
    if matches!(knowledge_mode, Some("connected_notes" | "zettelkasten")) {
        return true;
    }

    source_supertags
        .iter()
        .chain(suggested_supertags.iter())
        .any(|tag| {
            tag.eq_ignore_ascii_case("knowledge:connected_notes")
                || tag.eq_ignore_ascii_case("knowledge:zettelkasten")
                || tag.eq_ignore_ascii_case("resource:zettelkasten")
                || tag.eq_ignore_ascii_case("knowledge_mode:connected_notes")
                || tag.eq_ignore_ascii_case("knowledge_mode:zettelkasten")
        })
}

fn semantic_entity_relationship_id(entity: &AfpEntityMention) -> Option<String> {
    let kind = entity.kind.trim().to_ascii_lowercase();
    let canonical = entity.canonical.trim().to_ascii_lowercase();
    if kind.is_empty() || canonical.is_empty() {
        return None;
    }
    Some(format!(
        "entity:{}:{}",
        slugify_semantic_token(&kind),
        slugify_semantic_token(&canonical)
    ))
}

fn semantic_relationship_id(relationship: &AfpRelationship) -> Option<String> {
    let subject = relationship.subject.trim();
    let predicate = relationship.predicate.trim();
    let object = relationship.object.trim();
    if subject.is_empty() || predicate.is_empty() || object.is_empty() {
        return None;
    }
    Some(format!(
        "relationship:{}:{}:{}",
        slugify_semantic_token(subject),
        slugify_semantic_token(predicate),
        slugify_semantic_token(object)
    ))
}

fn slugify_semantic_token(value: &str) -> String {
    let mut slug = String::with_capacity(value.len());
    let mut last_was_sep = false;
    for ch in value.chars() {
        let normalized = if ch.is_ascii_alphanumeric() {
            Some(ch.to_ascii_lowercase())
        } else {
            None
        };
        match normalized {
            Some(ch) => {
                slug.push(ch);
                last_was_sep = false;
            }
            None if !last_was_sep && !slug.is_empty() => {
                slug.push('_');
                last_was_sep = true;
            }
            None => {}
        }
    }
    slug.trim_matches('_').to_string()
}

fn dedupe_semantic_entities(entities: Vec<AfpEntityMention>) -> Vec<AfpEntityMention> {
    let mut deduped: std::collections::BTreeMap<String, AfpEntityMention> =
        std::collections::BTreeMap::new();
    for entity in entities {
        let Some(relationship_id) = semantic_entity_relationship_id(&entity) else {
            continue;
        };
        match deduped.get(&relationship_id) {
            Some(existing) if existing.confidence >= entity.confidence => {}
            _ => {
                deduped.insert(relationship_id, entity);
            }
        }
    }
    let mut deduped = deduped.into_values().collect::<Vec<_>>();
    deduped.sort_by(|left, right| {
        right
            .confidence
            .partial_cmp(&left.confidence)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.kind.cmp(&right.kind))
            .then_with(|| left.canonical.cmp(&right.canonical))
    });
    deduped
}

fn dedupe_semantic_relationships(relationships: Vec<AfpRelationship>) -> Vec<AfpRelationship> {
    let mut deduped: std::collections::BTreeMap<String, AfpRelationship> =
        std::collections::BTreeMap::new();
    for relationship in relationships {
        let Some(relationship_id) = semantic_relationship_id(&relationship) else {
            continue;
        };
        match deduped.get(&relationship_id) {
            Some(existing) if existing.confidence >= relationship.confidence => {}
            _ => {
                deduped.insert(relationship_id, relationship);
            }
        }
    }
    let mut deduped = deduped.into_values().collect::<Vec<_>>();
    deduped.sort_by(|left, right| {
        right
            .confidence
            .partial_cmp(&left.confidence)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.predicate.cmp(&right.predicate))
            .then_with(|| left.subject.cmp(&right.subject))
            .then_with(|| left.object.cmp(&right.object))
    });
    deduped
}

fn build_semantic_topology_message(
    user_id: &str,
    thread_id: &str,
    source_id: &str,
    source_message_type: &str,
    message_type: &str,
    subtype: &str,
    link_type: &str,
    relationship_id: &str,
    confidence: Option<f64>,
    entities: Vec<AfpEntityMention>,
    relationships: Vec<AfpRelationship>,
    source_refs: &[String],
    supertags: &[String],
) -> (ProtoMessage, Value) {
    let content = AfpKnowledgeLinkContent {
        source_message_id: source_id.to_string(),
        thread_id: thread_id.to_string(),
        extracted_at: Utc::now().to_rfc3339(),
        entities,
        relationships,
        extractor_version: Some("heuristic-v1".to_string()),
        link_type: Some(link_type.to_string()),
        relationship_id: Some(relationship_id.to_string()),
        confidence,
        source_refs: source_refs.iter().cloned().collect(),
        ..Default::default()
    };
    let content_value = serde_json::to_value(&content).unwrap_or(Value::Null);
    let message_id = format!(
        "msg.{}",
        stable_semantic_link_id(user_id, source_id, message_type, subtype, relationship_id)
    );
    let message = ProtoMessage {
        protocol: "afp-v1".to_string(),
        id: message_id,
        thread_id: format!("thread.semantic.{}", source_id),
        parent_id: String::new(),
        from: "omnyid://daemon/knowledge-curator".to_string(),
        to: vec!["omnyid://workspace/user".to_string()],
        timestamp: Utc::now().to_rfc3339(),
        r#type: message_type.to_string(),
        kind: None,
        supertags: supertags.to_vec(),
        content: content_value.to_string(),
        signature: String::new(),
        encryption: "{}".to_string(),
        views: "[]".to_string(),
        references: json!([afp_message_reference(
            source_id,
            "derived_from",
            Some("source material")
        )])
        .to_string(),
        attachments: "[]".to_string(),
        store_in_relational: false,
        subtype: subtype.to_string(),
        metadata: json!({
            "user_id": user_id,
            "source_message_id": source_id,
            "source_message_type": source_message_type,
            "relationship_id": relationship_id,
            "link_type": link_type,
            "extractor": "heuristic-v1",
        })
        .to_string(),
    };
    (message, content_value)
}

async fn store_semantic_topology_links(
    db: &Db,
    user_id: &str,
    thread_id: &str,
    source_id: &str,
    source_message_type: &str,
    content: &Value,
    source_refs: &HashSet<String>,
    supertags: &[String],
) -> Result<u32, sqlx::Error> {
    let extracted = extract_from_afp_content(content);
    let mut entity_keep_ids = Vec::new();
    let mut relationship_keep_ids = Vec::new();
    let mut created = 0u32;
    let source_refs_vec = source_refs.iter().cloned().collect::<Vec<_>>();

    for entity in dedupe_semantic_entities(extracted.entities)
        .into_iter()
        .take(8)
    {
        let Some(relationship_id) = semantic_entity_relationship_id(&entity) else {
            continue;
        };
        let (message, content_value) = build_semantic_topology_message(
            user_id,
            thread_id,
            source_id,
            source_message_type,
            AFP_TYPE_KNOWLEDGE_LINK,
            AFP_SUBTYPE_KNOWLEDGE_LINK_ENTITY,
            "shared_entity",
            &relationship_id,
            Some(entity.confidence),
            vec![entity],
            vec![],
            &source_refs_vec,
            supertags,
        );
        entity_keep_ids.push(message.id.clone());
        db.upsert_private_message(user_id, &message, content_value)
            .await?;
        created += 1;
    }

    for relationship in dedupe_semantic_relationships(extracted.relationships)
        .into_iter()
        .take(6)
    {
        let Some(relationship_id) = semantic_relationship_id(&relationship) else {
            continue;
        };
        let (message, content_value) = build_semantic_topology_message(
            user_id,
            thread_id,
            source_id,
            source_message_type,
            AFP_TYPE_RELATION_LINK,
            AFP_SUBTYPE_KNOWLEDGE_LINK_RELATIONSHIP,
            "shared_relationship",
            &relationship_id,
            Some(relationship.confidence),
            vec![],
            vec![relationship],
            &source_refs_vec,
            supertags,
        );
        relationship_keep_ids.push(message.id.clone());
        db.upsert_private_message(user_id, &message, content_value)
            .await?;
        created += 1;
    }

    let reference_targets = vec![source_id.to_string()];
    db.prune_private_messages_by_reference_targets(
        user_id,
        AFP_TYPE_KNOWLEDGE_LINK,
        AFP_SUBTYPE_KNOWLEDGE_LINK_ENTITY,
        "omnyid://daemon/knowledge-curator",
        &reference_targets,
        &entity_keep_ids,
    )
    .await?;
    db.prune_private_messages_by_reference_targets(
        user_id,
        AFP_TYPE_RELATION_LINK,
        AFP_SUBTYPE_KNOWLEDGE_LINK_RELATIONSHIP,
        "omnyid://daemon/knowledge-curator",
        &reference_targets,
        &relationship_keep_ids,
    )
    .await?;

    Ok(created)
}

async fn store_backlink_update_message(
    db: &Db,
    user_id: &str,
    record: &BacklinkRecord,
) -> Result<(), sqlx::Error> {
    let content = json!({
        "source_id": record.source_id,
        "target_id": record.target_id,
        "similarity": record.similarity,
        "entities": record.entities,
    });
    let message_id = format!("msg.{}", record.backlink_id);
    let keep_ids = vec![message_id.clone()];
    let reference_targets = vec![record.source_id.clone(), record.target_id.clone()];
    let message = ProtoMessage {
        protocol: "afp-v1".to_string(),
        id: message_id,
        thread_id: format!("thread.{}", record.backlink_id),
        parent_id: String::new(),
        from: "omnyid://daemon/knowledge-curator".to_string(),
        to: vec!["omnyid://workspace/user".to_string()],
        timestamp: Utc::now().to_rfc3339(),
        r#type: "backlink_update".to_string(),
        kind: None,
        supertags: vec![],
        content: content.to_string(),
        signature: String::new(),
        encryption: "{}".to_string(),
        views: "[]".to_string(),
        references: json!([
            afp_message_reference(&record.source_id, "related_to", Some("similar source")),
            afp_message_reference(&record.target_id, "related_to", Some("similar target"))
        ])
        .to_string(),
        attachments: "[]".to_string(),
        store_in_relational: false,
        subtype: "semantic_similarity".to_string(),
        metadata: json!({
            "user_id": user_id,
            "backlink_id": record.backlink_id,
            "similarity_score": record.similarity,
            "match_reason": "semantic_similarity",
            "curator_run_id": record.curator_run_id,
            "entities": record.entities,
        })
        .to_string(),
    };
    db.upsert_private_message(user_id, &message, content)
        .await?;
    db.prune_private_messages_by_reference_targets(
        user_id,
        "backlink_update",
        "semantic_similarity",
        "omnyid://daemon/knowledge-curator",
        &reference_targets,
        &keep_ids,
    )
    .await?;
    Ok(())
}

async fn store_knowledge_card_message(
    db: &Db,
    user_id: &str,
    card: &KnowledgeCard,
) -> Result<(), sqlx::Error> {
    let content = json!({
        "card_id": card.card_id,
        "source_id": card.source_id,
        "summary": card.summary,
        "supertags": card.supertags,
        "entities": card.entities,
        "card_json": card.card_json,
        "model_version": card.model_version,
    });
    let message_id = format!("msg.{}", card.card_id);
    let keep_ids = vec![message_id.clone()];
    let reference_targets = vec![card.source_id.clone()];
    let message = ProtoMessage {
        protocol: "afp-v1".to_string(),
        id: message_id,
        thread_id: format!("thread.knowledge.{}", card.source_id),
        parent_id: String::new(),
        from: "omnyid://daemon/knowledge-curator".to_string(),
        to: vec!["omnyid://workspace/user".to_string()],
        timestamp: Utc::now().to_rfc3339(),
        r#type: "knowledge_card".to_string(),
        kind: None,
        supertags: card.supertags.clone(),
        content: content.to_string(),
        signature: String::new(),
        encryption: "{}".to_string(),
        views: "[]".to_string(),
        references: json!([afp_message_reference(
            &card.source_id,
            "derived_from",
            Some("source material")
        )])
        .to_string(),
        attachments: "[]".to_string(),
        store_in_relational: false,
        subtype: "auto_summary".to_string(),
        metadata: json!({
            "source_id": card.source_id,
            "supertags": card.supertags,
        })
        .to_string(),
    };
    db.upsert_private_message(user_id, &message, content)
        .await?;
    db.prune_private_messages_by_reference_targets(
        user_id,
        "knowledge_card",
        "auto_summary",
        "omnyid://daemon/knowledge-curator",
        &reference_targets,
        &keep_ids,
    )
    .await?;
    Ok(())
}

async fn upsert_knowledge_card(db: &Db, card: &KnowledgeCard) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO afp_knowledge_cards (
            card_id,
            user_id,
            source_id,
            summary,
            supertags,
            entities,
            card_json,
            model_version,
            created_at,
            updated_at,
            curator_run_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, NOW(), $10)
        ON CONFLICT (card_id) DO UPDATE SET
            summary = EXCLUDED.summary,
            supertags = EXCLUDED.supertags,
            entities = EXCLUDED.entities,
            card_json = EXCLUDED.card_json,
            model_version = EXCLUDED.model_version,
            updated_at = NOW(),
            curator_run_id = EXCLUDED.curator_run_id
        "#,
    )
    .bind(&card.card_id)
    .bind(&card.user_id)
    .bind(&card.source_id)
    .bind(&card.summary)
    .bind(&card.supertags)
    .bind(&card.entities)
    .bind(&card.card_json)
    .bind(&card.model_version)
    .bind(&card.created_at)
    .bind(&card.curator_run_id)
    .execute(&db.pool)
    .await?;
    Ok(())
}

async fn record_curator_audit(db: &Db, audit: &CuratorRunAudit) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO curator_run_audit (
            run_id,
            user_id,
            daemon_id,
            source_message_id,
            trigger_kind,
            backlinks_created,
            cards_created,
            insights_created,
            tokens_used,
            duration_ms,
            status,
            error_message,
            created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::timestamptz)
        ON CONFLICT (run_id) DO NOTHING
        "#,
    )
    .bind(&audit.run_id)
    .bind(&audit.user_id)
    .bind(&audit.daemon_id)
    .bind(audit.source_message_id.as_deref().unwrap_or("system"))
    .bind(match audit.trigger_kind {
        CuratorTriggerKind::NewMessage => "new_message",
        CuratorTriggerKind::DeepMaintenance => "deep_maintenance",
        CuratorTriggerKind::Reindex => "reindex",
    })
    .bind(audit.backlinks_created as i32)
    .bind(audit.cards_created as i32)
    .bind(audit.insights_created as i32)
    .bind(audit.tokens_used as i32)
    .bind(audit.duration_ms.map(|value| value as i32))
    .bind(match audit.status {
        CuratorRunStatus::Completed => "completed",
        CuratorRunStatus::Failed => "failed",
        CuratorRunStatus::Skipped => "skipped",
        CuratorRunStatus::Partial => "partial",
    })
    .bind(&audit.error_message)
    .bind(&audit.created_at)
    .execute(&db.pool)
    .await?;
    Ok(())
}

fn flatten_text(content: &Value, summary: Option<&str>) -> String {
    if let Some(summary) = summary.filter(|value| !value.trim().is_empty()) {
        return summary.to_string();
    }
    let mut chunks = Vec::new();
    for key in ["subject", "title", "content", "body", "description", "text"] {
        if let Some(value) = content.get(key).and_then(Value::as_str) {
            if !value.trim().is_empty() {
                chunks.push(value.trim().to_string());
            }
        }
    }
    if chunks.is_empty() {
        content.to_string()
    } else {
        chunks.join("\n")
    }
}

fn extract_entities(text: &str) -> BTreeSet<String> {
    const STOPWORDS: &[&str] = &[
        "about", "after", "again", "agent", "also", "been", "email", "from", "have", "into",
        "just", "message", "note", "that", "this", "thread", "with", "your",
    ];
    text.split(|ch: char| !ch.is_ascii_alphanumeric() && ch != '#')
        .map(|token| token.trim_matches('#').to_lowercase())
        .filter(|token| token.len() >= 4 && !STOPWORDS.contains(&token.as_str()))
        .take(16)
        .collect()
}

fn suggest_supertags(
    text: &str,
    folder_suggestions: &[String],
    entities: &BTreeSet<String>,
) -> Vec<String> {
    let lowercase = text.to_lowercase();
    let mut suggestions = Vec::new();
    for suggestion in folder_suggestions {
        if lowercase.contains(&suggestion.to_lowercase()) {
            suggestions.push(suggestion.clone());
        }
    }
    for entity in entities.iter().take(4) {
        let label = entity[..1].to_uppercase() + &entity[1..];
        if !suggestions
            .iter()
            .any(|value| value.eq_ignore_ascii_case(&label))
        {
            suggestions.push(label);
        }
    }
    suggestions.truncate(6);
    suggestions
}

fn extract_reference_ids(value: &Value) -> HashSet<String> {
    value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| match item {
            Value::String(value) => Some(value.to_string()),
            Value::Object(map) => map
                .get("target")
                .and_then(Value::as_str)
                .map(str::to_string),
            _ => None,
        })
        .collect()
}

fn jaccard(left: &BTreeSet<String>, right: &BTreeSet<String>) -> f32 {
    if left.is_empty() || right.is_empty() {
        return 0.0;
    }
    let intersection = left.intersection(right).count() as f32;
    let union = left.union(right).count() as f32;
    if union == 0.0 {
        0.0
    } else {
        intersection / union
    }
}

fn tenant_messages_table(user_id: &str) -> String {
    format!("\"{}\".messages", tenant_schema_name(user_id))
}

use crate::db::tenant_schema_name;

struct FolderScope {
    folder_id: Option<String>,
    tag_suggestions: Vec<String>,
    suppress_backlinks: bool,
    backlink_threshold: Option<f32>,
    search_scope: BacklinkSearchScope,
}

struct CandidateMessage {
    id: String,
    thread_id: String,
    similarity: f32,
    entities: BTreeSet<String>,
    supertags: Vec<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
enum BacklinkSearchScope {
    #[default]
    SameFolder,
    FolderAndGlobal,
    AllFolders,
}

#[derive(Clone, Debug, Default, PartialEq)]
struct ParsedBacklinkRules {
    suppress_backlinks: bool,
    threshold: Option<f32>,
    search_scope: BacklinkSearchScope,
}

/// Query `afp_supertag_definitions` and return any tag names whose keyword
/// rules match the source text.  Folder-scoped definitions are filtered by
/// `folder_id`; definitions with an empty `folder_scope` apply everywhere.
///
/// This runs before the LLM supertag suggestion so user-defined tags always
/// appear in the output — without an extra LLM call.
async fn apply_supertag_definitions(
    db: &Db,
    user_id: &str,
    source_text: &str,
    folder_id: Option<&str>,
) -> Vec<String> {
    let rows = sqlx::query(
        r#"
        SELECT tag_name, keywords, folder_scope
        FROM afp_supertag_definitions
        WHERE user_id = $1
        "#,
    )
    .bind(user_id)
    .fetch_all(&db.pool)
    .await
    .unwrap_or_default();

    let lower_text = source_text.to_lowercase();
    let mut matched = Vec::new();

    for row in rows {
        let tag_name: String = row.try_get("tag_name").unwrap_or_default();
        let keywords: Vec<String> = row.try_get("keywords").unwrap_or_default();
        let folder_scope: Vec<String> = row.try_get("folder_scope").unwrap_or_default();

        // Skip if this definition is scoped to other folders.
        if !folder_scope.is_empty() {
            let in_scope = folder_id
                .map(|fid| folder_scope.iter().any(|s| s == fid))
                .unwrap_or(false);
            if !in_scope {
                continue;
            }
        }

        // Match if any keyword is a substring of the source text.
        let keyword_hit = keywords
            .iter()
            .any(|kw| lower_text.contains(&kw.to_lowercase()));
        if keyword_hit && !matched.contains(&tag_name) {
            matched.push(tag_name);
        }
    }

    matched
}

/// Returns true for messages that carry no substantive knowledge value and
/// should be skipped by both Phase A (backlinks) and Phase B (card generation).
///
/// Heuristics only — no LLM call.  False-positive rate is acceptable; the
/// curator will process the message on the next backfill pass if it was wrong.
fn is_noise_message(source_text: &str, message_type: &str) -> bool {
    // Daemon-internal types are already excluded upstream; this catches stragglers.
    if matches!(
        message_type,
        "daemon_heartbeat" | "sync_error" | "archived_notice" | "backlink_override"
    ) {
        return true;
    }

    let lower = source_text.to_lowercase();

    // OTP / verification codes
    let otp_signals = [
        "your verification code",
        "your one-time code",
        "your otp is",
        "enter this code",
        "security code:",
        "confirmation code:",
        "don't share this code",
    ];
    if otp_signals.iter().any(|sig| lower.contains(sig)) {
        return true;
    }

    // Newsletter / marketing noise
    let newsletter_signals = [
        "unsubscribe",
        "view in browser",
        "you are receiving this",
        "you're receiving this because",
        "manage preferences",
        "email preferences",
        "no longer want to receive",
        "click here to unsubscribe",
    ];
    let newsletter_hits = newsletter_signals
        .iter()
        .filter(|sig| lower.contains(*sig))
        .count();
    if newsletter_hits >= 2 {
        return true;
    }

    // Transactional receipts with no discussion value
    let transactional_signals = [
        "your order has been",
        "order confirmation",
        "payment received",
        "payment of",
        "your receipt from",
        "your invoice",
        "refund processed",
        "shipment tracking",
        "your package has",
    ];
    let transactional_hits = transactional_signals
        .iter()
        .filter(|sig| lower.contains(*sig))
        .count();
    if transactional_hits >= 2 {
        return true;
    }

    false
}

/// Query today's LLM token usage for a user from the curator_run_audit table.
/// Used to gate Phase B (knowledge card generation) when the daily budget is
/// approaching its limit.
async fn query_daily_token_usage(db: &Db, user_id: &str) -> u32 {
    sqlx::query(
        r#"
        SELECT COALESCE(SUM(tokens_used), 0)::bigint AS total
        FROM curator_run_audit
        WHERE user_id = $1
          AND created_at > NOW() - INTERVAL '1 day'
        "#,
    )
    .bind(user_id)
    .fetch_one(&db.pool)
    .await
    .ok()
    .and_then(|row| row.try_get::<i64, _>("total").ok())
    .map(|value| value as u32)
    .unwrap_or(0)
}

/// Load the most-recently-created `backlink_override` AFP message for a source
/// message id (or its thread id).  Returns `None` when no override exists.
async fn load_backlink_override(
    db: &Db,
    user_id: &str,
    source_id: &str,
    thread_id: &str,
) -> Option<ParsedBacklinkRules> {
    let row = sqlx::query(&format!(
        r#"
        SELECT content
        FROM {}
        WHERE type = $1
          AND (
              content->>'source_id' = $2
           OR content->>'thread_id' = $3
          )
        ORDER BY timestamp DESC
        LIMIT 1
        "#,
        tenant_messages_table(user_id)
    ))
    .bind(AFP_TYPE_BACKLINK_OVERRIDE)
    .bind(source_id)
    .bind(thread_id)
    .fetch_optional(&db.pool)
    .await
    .ok()??;

    let override_content: BacklinkOverrideContent = row
        .try_get::<serde_json::Value, _>("content")
        .ok()
        .and_then(|value| serde_json::from_value(value).ok())?;

    let mut parsed = override_content
        .rules
        .as_deref()
        .map(parse_backlink_rules)
        .unwrap_or_default();

    // The `suppress` flag takes precedence over any rule text.
    if override_content.suppress {
        parsed.suppress_backlinks = true;
    }
    Some(parsed)
}

fn parse_backlink_rules(rules: &str) -> ParsedBacklinkRules {
    let normalized = rules.trim().to_lowercase();
    let mut parsed = ParsedBacklinkRules::default();

    if normalized.contains("scope=all")
        || normalized.contains("scope: all")
        || normalized.contains("all folders")
    {
        parsed.search_scope = BacklinkSearchScope::AllFolders;
    } else if normalized.contains("scope=folder+global")
        || normalized.contains("scope: folder+global")
        || normalized.contains("folder + global")
        || normalized.contains("this folder + global")
        || normalized.contains("global")
    {
        parsed.search_scope = BacklinkSearchScope::FolderAndGlobal;
    } else if normalized.contains("scope=same_folder")
        || normalized.contains("scope: same_folder")
        || normalized.contains("same folder")
        || normalized.contains("only within this folder")
    {
        parsed.search_scope = BacklinkSearchScope::SameFolder;
    }

    parsed.suppress_backlinks = normalized.contains("do not link")
        || normalized.contains("don't link")
        || normalized.contains("never link")
        || normalized.contains("disable backlinks")
        || normalized.contains("suppress backlinks")
        || normalized.contains("suppress=true")
        || normalized.contains("suppress: true")
        || normalized.contains("backlinks=false")
        || normalized.contains("backlinks: false");

    for token in
        normalized.split(|ch: char| ch.is_whitespace() || matches!(ch, ',' | ';' | ':' | '=' | '|'))
    {
        if let Ok(value) = token.parse::<f32>() {
            if (0.0..=1.0).contains(&value) {
                parsed.threshold = Some(value);
                break;
            }
        }
    }
    if parsed.threshold.is_none() && normalized.contains("strict") {
        parsed.threshold = Some(0.9);
    }
    if parsed.threshold.is_none()
        && (normalized.contains("loose") || normalized.contains("aggressive"))
    {
        parsed.threshold = Some(0.72);
    }
    parsed
}

#[cfg(test)]
mod tests {
    use super::{
        BacklinkSearchScope, CURATOR_DEFAULT_IDLE_SECS, CURATOR_MAX_IDLE_SECS, ParsedBacklinkRules,
        afp_message_reference, curator_ineligible_reason, dedupe_semantic_entities,
        dedupe_semantic_relationships, is_noise_message, next_curator_idle_secs,
        parse_backlink_rules, poison_skip_knowledge_card, run_curator_backfill_pass,
        semantic_entity_relationship_id, semantic_relationship_id,
        should_emit_semantic_topology_links, slugify_semantic_token,
    };
    use crate::{
        afp::Message,
        daemon_registry::{DaemonManifest, spawn_daemon},
        db::{Db, UserRecord},
        knowledge_curator::DaemonKind,
        message::{AfpEntityMention, AfpRelationship},
    };
    use serde_json::json;
    use ulid::Ulid;

    #[test]
    fn curator_idle_backoff_resets_when_work_is_processed() {
        assert_eq!(
            next_curator_idle_secs(80, Some(3)),
            CURATOR_DEFAULT_IDLE_SECS
        );
    }

    #[test]
    fn curator_idle_backoff_doubles_until_capped_when_idle_or_failed() {
        assert_eq!(next_curator_idle_secs(20, Some(0)), 40);
        assert_eq!(next_curator_idle_secs(80, Some(0)), CURATOR_MAX_IDLE_SECS);
        assert_eq!(
            next_curator_idle_secs(CURATOR_MAX_IDLE_SECS, None),
            CURATOR_MAX_IDLE_SECS
        );
    }

    // ── Noise filter tests ────────────────────────────────────────────────────

    #[test]
    fn noise_filter_rejects_otp_message() {
        assert!(is_noise_message(
            "Your verification code is 483920. Don't share this code.",
            "email_incoming"
        ));
    }

    #[test]
    fn noise_filter_rejects_newsletter_with_two_signals() {
        assert!(is_noise_message(
            "You are receiving this because you subscribed. Click here to unsubscribe.",
            "email_incoming"
        ));
    }

    #[test]
    fn noise_filter_rejects_transactional_receipt() {
        assert!(is_noise_message(
            "Your receipt from ACME Corp. Payment received for order #12345.",
            "email_incoming"
        ));
    }

    #[test]
    fn noise_filter_passes_substantive_email() {
        assert!(!is_noise_message(
            "Hi Alice, I wanted to follow up on the Q2 budget discussion we had last week.",
            "email_incoming"
        ));
    }

    #[test]
    fn noise_filter_passes_note_type() {
        assert!(!is_noise_message(
            "Project kickoff notes for OmnyID.",
            "note"
        ));
    }

    #[test]
    fn noise_filter_blocks_daemon_heartbeat_type() {
        assert!(is_noise_message("metrics data", "daemon_heartbeat"));
    }

    #[test]
    fn noise_filter_does_not_block_single_newsletter_signal() {
        // One signal alone should not trigger — avoids false positives on
        // legitimate emails that happen to mention "unsubscribe" in context.
        assert!(!is_noise_message(
            "I decided to unsubscribe from the conference mailing list — let me know if you need the contact.",
            "email_incoming"
        ));
    }

    #[test]
    fn curator_ineligible_reason_blocks_unusable_inputs() {
        assert_eq!(
            curator_ineligible_reason("passive_event", &json!({}), None),
            Some("passive_event")
        );
        assert_eq!(
            curator_ineligible_reason(
                "note",
                &json!({ "omnyid_storage": { "mode": "ciphertext_only" } }),
                None,
            ),
            Some("ciphertext_only")
        );
        assert_eq!(
            curator_ineligible_reason("note", &json!({}), Some(&json!({ "branch_id": "br_1" }))),
            Some("branch_message")
        );
        assert_eq!(
            curator_ineligible_reason("note", &json!({}), Some(&json!({ "store": false }))),
            Some("metadata_store_false")
        );
        assert_eq!(
            curator_ineligible_reason("note", &json!({ "body": "keep" }), None),
            None
        );
    }

    #[test]
    fn parses_explicit_threshold_and_scope() {
        let parsed = parse_backlink_rules("scope=folder+global threshold=0.84");
        assert_eq!(
            parsed,
            ParsedBacklinkRules {
                suppress_backlinks: false,
                threshold: Some(0.84),
                search_scope: BacklinkSearchScope::FolderAndGlobal,
            }
        );
    }

    #[test]
    fn parses_suppression_phrases() {
        let parsed = parse_backlink_rules("Do not link this folder to anything outside itself");
        assert!(parsed.suppress_backlinks);
        assert_eq!(parsed.search_scope, BacklinkSearchScope::SameFolder);
    }

    #[test]
    fn parses_loose_all_folders_rule() {
        let parsed = parse_backlink_rules("scope: all; aggressive");
        assert_eq!(parsed.search_scope, BacklinkSearchScope::AllFolders);
        assert_eq!(parsed.threshold, Some(0.72));
    }

    #[test]
    fn semantic_topology_link_gate_accepts_connected_notes_and_zettelkasten_inputs() {
        assert!(should_emit_semantic_topology_links(
            "note",
            Some(&json!({
                "knowledge_pipeline": "connected_notes_ingest"
            })),
            &[],
            &[]
        ));
        assert!(should_emit_semantic_topology_links(
            "note",
            Some(&json!({
                "knowledge_mode": "zettelkasten"
            })),
            &[],
            &[]
        ));
        assert!(should_emit_semantic_topology_links(
            "note",
            None,
            &["resource:zettelkasten".to_string()],
            &[]
        ));
    }

    #[test]
    fn semantic_topology_link_gate_accepts_parsed_sources_and_rejects_unmarked_notes() {
        assert!(should_emit_semantic_topology_links(
            "parsed_document",
            None,
            &[],
            &[]
        ));
        assert!(should_emit_semantic_topology_links(
            "transcript",
            None,
            &[],
            &[]
        ));
        assert!(!should_emit_semantic_topology_links(
            "note",
            Some(&json!({
                "origin": "workspace"
            })),
            &[],
            &[]
        ));
    }

    #[test]
    fn semantic_ids_are_slugged_and_stable() {
        let entity = AfpEntityMention {
            kind: "Metric".to_string(),
            name: "Q1 2026".to_string(),
            canonical: "Q1 2026".to_string(),
            context_snippet: None,
            confidence: 0.9,
        };
        let relationship = AfpRelationship {
            subject: "Professor Smith".to_string(),
            predicate: "teaches".to_string(),
            object: "Market Failures".to_string(),
            confidence: 0.7,
        };

        assert_eq!(slugify_semantic_token("Q1 2026"), "q1_2026");
        assert_eq!(
            semantic_entity_relationship_id(&entity).as_deref(),
            Some("entity:metric:q1_2026")
        );
        assert_eq!(
            semantic_relationship_id(&relationship).as_deref(),
            Some("relationship:professor_smith:teaches:market_failures")
        );
    }

    #[test]
    fn semantic_dedupers_keep_single_best_membership_per_identity() {
        let entities = dedupe_semantic_entities(vec![
            AfpEntityMention {
                kind: "metric".to_string(),
                name: "Q1 2026".to_string(),
                canonical: "q1_2026".to_string(),
                context_snippet: None,
                confidence: 0.6,
            },
            AfpEntityMention {
                kind: "metric".to_string(),
                name: "Q1 2026".to_string(),
                canonical: "q1_2026".to_string(),
                context_snippet: None,
                confidence: 0.9,
            },
        ]);
        let relationships = dedupe_semantic_relationships(vec![
            AfpRelationship {
                subject: "Professor Smith".to_string(),
                predicate: "teaches".to_string(),
                object: "Market Failures".to_string(),
                confidence: 0.4,
            },
            AfpRelationship {
                subject: "Professor Smith".to_string(),
                predicate: "teaches".to_string(),
                object: "Market Failures".to_string(),
                confidence: 0.8,
            },
        ]);

        assert_eq!(entities.len(), 1);
        assert_eq!(entities[0].confidence, 0.9);
        assert_eq!(relationships.len(), 1);
        assert_eq!(relationships[0].confidence, 0.8);
    }

    #[test]
    fn curator_reference_builder_emits_canonical_afp_message_references() {
        assert_eq!(
            afp_message_reference("msg_1", "derived_from", Some("source material")),
            json!({
                "type": "message",
                "target": "msg_1",
                "label": "source material",
                "metadata": {
                    "link_type": "derived_from"
                }
            })
        );
    }

    #[test]
    fn curator_runtime_uses_shared_db_tenant_schema_helper() {
        let source = include_str!("curator_runtime.rs");
        let test_start = source.find("#[cfg(test)]").expect("test module marker");
        let main_source = &source[..test_start];
        assert!(main_source.contains("use crate::db::tenant_schema_name;"));
        assert!(!main_source.contains("fn tenant_schema_name("));
        assert!(source.contains("format!(\"\\\"{}\\\".messages\", tenant_schema_name(user_id))"));
    }

    #[test]
    fn poison_skip_card_is_sanitized_and_excludes_raw_internal_errors() {
        let card = poison_skip_knowledge_card("user_test", "msg_test");
        assert_eq!(card.user_id, "user_test");
        assert_eq!(card.source_id, "msg_test");
        assert_eq!(card.model_version, "poison-skip");
        assert_eq!(card.summary, None);
        assert_eq!(
            card.card_json.get("skip").and_then(|value| value.as_bool()),
            Some(true)
        );
        assert_eq!(
            card.card_json
                .get("reason")
                .and_then(|value| value.as_str()),
            Some("processing_error")
        );
        assert!(card.card_json.get("error").is_none());
    }

    #[tokio::test]
    async fn local_postgres_folder_rule_scope_changes_backlink_output_end_to_end() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
        let Ok(db) = Db::new(&database_url).await else {
            return;
        };

        let control_user = create_test_user(&db, "curator_control").await;
        let ruled_user = create_test_user(&db, "curator_ruled").await;

        register_curator(&db, &control_user.id).await;
        register_curator(&db, &ruled_user.id).await;

        let control_source = store_note_message(
            &db,
            &control_user.id,
            "folder:work",
            json!({
                "title": "Project Apollo standup notes",
                "body": "Project Apollo budget and schedule update for the work folder.",
                "folder_id": "work"
            }),
        )
        .await;
        let _control_global = store_note_message(
            &db,
            &control_user.id,
            "folder:global",
            json!({
                "title": "Apollo global summary",
                "body": "Global reference for Project Apollo budget and schedule update.",
                "folder_id": "global"
            }),
        )
        .await;

        let ruled_source = store_note_message(
            &db,
            &ruled_user.id,
            "folder:work",
            json!({
                "title": "Project Apollo standup notes",
                "body": "Project Apollo budget and schedule update for the work folder.",
                "folder_id": "work"
            }),
        )
        .await;
        let ruled_global = store_note_message(
            &db,
            &ruled_user.id,
            "folder:global",
            json!({
                "title": "Apollo global summary",
                "body": "Global reference for Project Apollo budget and schedule update.",
                "folder_id": "global"
            }),
        )
        .await;
        let _rule = store_folder_rule(
            &db,
            &ruled_user.id,
            "work",
            "scope=folder+global threshold=0.75",
        )
        .await;

        run_curator_backfill_pass(&db, &control_user.id, 10)
            .await
            .expect("run control curator");
        run_curator_backfill_pass(&db, &ruled_user.id, 10)
            .await
            .expect("run ruled curator");

        let control_backlinks = db
            .list_backlinks_for_message(&control_user.id, &control_source)
            .await
            .expect("list control backlinks");
        let ruled_backlinks = db
            .list_backlinks_for_message(&ruled_user.id, &ruled_source)
            .await
            .expect("list ruled backlinks");

        assert!(
            control_backlinks.is_empty(),
            "without folder_rule, same-folder scope should not backlink to global notes"
        );
        assert!(
            ruled_backlinks
                .iter()
                .any(|link| link.target_id == ruled_global),
            "folder_rule scope=folder+global should allow backlink to global note"
        );
    }

    #[tokio::test]
    async fn local_postgres_folder_rule_suppression_blocks_backlinks_end_to_end() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
        let Ok(db) = Db::new(&database_url).await else {
            return;
        };

        let user = create_test_user(&db, "curator_suppress").await;
        register_curator(&db, &user.id).await;

        let source_id = store_note_message(
            &db,
            &user.id,
            "folder:work",
            json!({
                "title": "Budget follow-up",
                "body": "Budget follow-up for Project Apollo including schedule, risks, and owners.",
                "folder_id": "work"
            }),
        )
        .await;
        let target_id = store_note_message(
            &db,
            &user.id,
            "folder:work",
            json!({
                "title": "Apollo budget review",
                "body": "Apollo budget review including schedule, risks, and owners for the work folder.",
                "folder_id": "work"
            }),
        )
        .await;
        let _rule =
            store_folder_rule(&db, &user.id, "work", "do not link; scope=same_folder").await;

        run_curator_backfill_pass(&db, &user.id, 10)
            .await
            .expect("run suppressing curator");

        let backlinks = db
            .list_backlinks_for_message(&user.id, &source_id)
            .await
            .expect("list backlinks");
        assert!(
            backlinks.is_empty(),
            "suppression rule should block backlink creation even for similar same-folder notes"
        );

        let reverse_backlinks = db
            .list_backlinks_for_message(&user.id, &target_id)
            .await
            .expect("list reverse backlinks");
        assert!(reverse_backlinks.is_empty());
    }

    async fn create_test_user(db: &Db, prefix: &str) -> UserRecord {
        let suffix = Ulid::new().to_string().to_lowercase();
        let user = UserRecord {
            id: format!("{prefix}_{suffix}"),
            email: format!("{prefix}-{suffix}@omnyid.test"),
            password_hash: Some("smoke-hash".to_string()),
            auth_provider: "password".to_string(),
            google_sub: None,
            display_name: format!("{prefix} {suffix}"),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        db.create_user(&user).await.expect("create user");
        user
    }

    async fn register_curator(db: &Db, user_id: &str) {
        spawn_daemon(
            db,
            DaemonManifest {
                user_id: user_id.to_string(),
                daemon_kind: DaemonKind::KnowledgeCurator,
                workflow_id: None,
                delegated_key_id: format!("test:knowledge_curator:{user_id}"),
                policy_config: json!({}),
            },
        )
        .await
        .expect("register curator daemon");
    }

    async fn store_note_message(
        db: &Db,
        user_id: &str,
        thread_id: &str,
        content: serde_json::Value,
    ) -> String {
        let message_id = format!("msg_{}", Ulid::new().to_string().to_lowercase());
        let message = Message {
            protocol: "afp-v1".to_string(),
            id: message_id.clone(),
            thread_id: thread_id.to_string(),
            parent_id: String::new(),
            from: format!("omnyid://workspace/{user_id}"),
            to: vec![],
            timestamp: chrono::Utc::now().to_rfc3339(),
            r#type: "note".to_string(),
            kind: None,
            supertags: vec![],
            content: content.to_string(),
            signature: String::new(),
            encryption: "{}".to_string(),
            views: "[]".to_string(),
            references: "[]".to_string(),
            attachments: "[]".to_string(),
            store_in_relational: true,
            subtype: String::new(),
            metadata: json!({"origin": "curator_integration_test"}).to_string(),
        };
        db.store_private_message(user_id, &message, content)
            .await
            .expect("store note message");
        message_id
    }

    async fn store_folder_rule(
        db: &Db,
        user_id: &str,
        folder_id: &str,
        backlink_rules: &str,
    ) -> String {
        let message_id = format!("folder_rule_{}", Ulid::new().to_string().to_lowercase());
        let content = json!({
            "folder_id": folder_id,
            "backlink_rules": backlink_rules,
            "tag_suggestions": ["Apollo", "Budget"]
        });
        let message = Message {
            protocol: "afp-v1".to_string(),
            id: message_id.clone(),
            thread_id: format!("folder:{folder_id}"),
            parent_id: String::new(),
            from: format!("omnyid://workspace/{user_id}"),
            to: vec![],
            timestamp: chrono::Utc::now().to_rfc3339(),
            r#type: "folder_rule".to_string(),
            kind: None,
            supertags: vec![],
            content: content.to_string(),
            signature: String::new(),
            encryption: "{}".to_string(),
            views: "[]".to_string(),
            references: "[]".to_string(),
            attachments: "[]".to_string(),
            store_in_relational: true,
            subtype: String::new(),
            metadata: json!({"origin": "curator_integration_test", "folder_id": folder_id})
                .to_string(),
        };
        db.store_private_message(user_id, &message, content)
            .await
            .expect("store folder_rule");
        message_id
    }
}
