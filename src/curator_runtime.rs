use std::collections::{BTreeSet, HashSet};
use std::time::Duration;

use chrono::Utc;
use serde_json::{Value, json};
use sqlx::Row;
use tracing::{info, warn};
use ulid::Ulid;

use crate::{
    afp::Message as ProtoMessage,
    daemon_registry,
    db::Db,
    knowledge_curator::{
        BacklinkKind, BacklinkRecord, CuratorPolicy, CuratorRunAudit, CuratorRunStatus,
        CuratorTriggerKind, DaemonKind, KnowledgeCard,
    },
    message::{BacklinkOverrideContent, AFP_TYPE_BACKLINK_OVERRIDE, FolderRuleContent},
    summarizer::{generate_summary_and_embedding, generate_embedding_with_ollama},
};

const CURATOR_MODEL_VERSION: &str = "local-summary-v1";

pub async fn start_knowledge_curator_daemon(db: Db) {
    tokio::spawn(async move {
        info!("Knowledge Curator daemon started");
        loop {
            if let Err(err) = run_curator_pass(&db).await {
                warn!(%err, "Knowledge Curator pass failed");
            }
            tokio::time::sleep(Duration::from_secs(20)).await;
        }
    });
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

async fn run_curator_pass(db: &Db) -> Result<(), sqlx::Error> {
    for user_id in db.list_user_ids().await? {
        let Some(registration) =
            daemon_registry::get_active_daemon_for_kind(db, &user_id, DaemonKind::KnowledgeCurator)
                .await?
        else {
            continue;
        };
        let processed = process_user_queue(
            db,
            &user_id,
            &registration.daemon_id,
            &registration.policy_config,
            12,
        )
        .await?;
        if processed > 0 {
            daemon_registry::record_heartbeat(
                db,
                &registration.daemon_id,
                &user_id,
                0,
                processed,
                0,
                0,
            )
            .await?;
        }
    }
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
              'tag_update'
          )
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
        processed += process_source_message(db, user_id, daemon_id, policy, &row).await?;
    }
    Ok(processed)
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
    let refs = row
        .try_get::<Value, _>("references")
        .unwrap_or_else(|_| Value::Array(vec![]));
    let timestamp: String = row.get("timestamp");
    let existing_summary = row.try_get::<Option<String>, _>("summary").ok().flatten();
    let source_text = flatten_text(&content, existing_summary.as_deref());
    let run_id = Ulid::new().to_string();

    // Phase A fast-skip: too short or recognised noise pattern.
    let skip = source_text.trim().len() < 24
        || is_noise_message(source_text.trim(), &message_type);
    if skip {
        record_curator_audit(
            db,
            &CuratorRunAudit {
                run_id,
                user_id: user_id.to_string(),
                daemon_id: daemon_id.to_string(),
                source_message_id: Some(source_id),
                trigger_kind: CuratorTriggerKind::NewMessage,
                backlinks_created: 0,
                cards_created: 0,
                insights_created: 0,
                tokens_used: 0,
                duration_ms: Some((Utc::now() - started_at).num_milliseconds().max(0) as u32),
                status: CuratorRunStatus::Skipped,
                error_message: None,
                created_at: Utc::now().to_rfc3339(),
            },
        )
        .await?;
        return Ok(1);
    }

    // Load folder scope first, then layer any per-message / per-thread override
    // on top (highest priority in the rules hierarchy).
    let mut scope =
        load_folder_scope(db, user_id, &thread_id, &content, metadata.as_ref()).await?;
    if let Some(override_rules) =
        load_backlink_override(db, user_id, &source_id, &thread_id).await
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
    let embedding = generate_embedding_with_ollama(
        ollama_url.as_deref(),
        embed_model.as_deref(),
        &source_text,
    )
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

    let candidates = find_similarity_candidates(
        db,
        user_id,
        &source_id,
        &embedding,
        &scope.search_scope,
        scope.folder_id.as_deref(),
        10,
    )
    .await?;

    let mut backlinks_created = 0u32;
    if !scope.suppress_backlinks {
        for candidate in candidates {
            let overlap = jaccard(&entities, &candidate.entities);
            let thread_bonus =
                if candidate.thread_id == thread_id || source_refs.contains(&candidate.id) {
                    1.0
                } else {
                    0.0
                };
            let score = 0.6 * candidate.similarity + 0.25 * overlap + 0.15 * thread_bonus;
            if score < backlink_threshold {
                continue;
            }
            let record = BacklinkRecord {
                backlink_id: Ulid::new().to_string(),
                user_id: user_id.to_string(),
                source_id: source_id.clone(),
                target_id: candidate.id.clone(),
                link_kind: BacklinkKind::SemanticSimilarity,
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
        card_id: Ulid::new().to_string(),
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
            1 - (embedding <=> $2) AS similarity
        FROM {}
        WHERE id <> $1
          AND embedding IS NOT NULL
          AND timestamp > NOW() - INTERVAL '60 days'
        "#,
        tenant_messages_table(user_id)
    );
    let rows = match (search_scope, folder_id) {
        (BacklinkSearchScope::AllFolders, _) | (_, None) => {
            sql.push_str(" ORDER BY embedding <=> $2 LIMIT $3");
            sqlx::query(&sql)
                .bind(source_id)
                .bind(embedding)
                .bind(limit)
                .fetch_all(&db.pool)
                .await?
        }
        (BacklinkSearchScope::SameFolder, Some(folder_id)) => {
            sql.push_str(" AND (thread_id = $3 OR content->>'folder_id' = $4)");
            sql.push_str(" ORDER BY embedding <=> $2 LIMIT $5");
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
            sql.push_str(" ORDER BY embedding <=> $2 LIMIT $6");
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
            CandidateMessage {
                id: row.get("id"),
                thread_id: row.get("thread_id"),
                similarity: row
                    .try_get::<Option<f64>, _>("similarity")
                    .ok()
                    .flatten()
                    .unwrap_or(0.0) as f32,
                entities: extract_entities(&flatten_text(&content, summary.as_deref())),
            }
        })
        .collect())
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
    let message = ProtoMessage {
        protocol: "afp-v1".to_string(),
        id: format!("backlink.{}", Ulid::new()),
        thread_id: format!("thread.backlink.{}", record.source_id),
        parent_id: String::new(),
        from: "omnyid://daemon/knowledge-curator".to_string(),
        to: vec!["omnyid://workspace/user".to_string()],
        timestamp: Utc::now().to_rfc3339(),
        r#type: "backlink_update".to_string(),
        content: content.to_string(),
        signature: String::new(),
        encryption: "{}".to_string(),
        views: "[]".to_string(),
        references: json!([record.source_id, record.target_id]).to_string(),
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
    let _ = db.store_private_message(user_id, &message, content).await?;
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
    let message = ProtoMessage {
        protocol: "afp-v1".to_string(),
        id: format!("knowledge-card.{}", Ulid::new()),
        thread_id: format!("thread.knowledge.{}", card.source_id),
        parent_id: String::new(),
        from: "omnyid://daemon/knowledge-curator".to_string(),
        to: vec!["omnyid://workspace/user".to_string()],
        timestamp: Utc::now().to_rfc3339(),
        r#type: "knowledge_card".to_string(),
        content: content.to_string(),
        signature: String::new(),
        encryption: "{}".to_string(),
        views: "[]".to_string(),
        references: json!([card.source_id]).to_string(),
        attachments: "[]".to_string(),
        store_in_relational: false,
        subtype: "auto_summary".to_string(),
        metadata: json!({
            "source_id": card.source_id,
            "supertags": card.supertags,
        })
        .to_string(),
    };
    let _ = db.store_private_message(user_id, &message, content).await?;
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

fn tenant_schema_name(user_id: &str) -> String {
    let mut schema = String::from("user_");
    for ch in user_id.chars().flat_map(|c| c.to_lowercase()) {
        schema.push(if ch.is_ascii_alphanumeric() { ch } else { '_' });
        if schema.len() >= 60 {
            break;
        }
    }
    if schema == "user_" {
        schema.push_str("tenant");
    }
    schema
}

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
        BacklinkSearchScope, ParsedBacklinkRules, is_noise_message, parse_backlink_rules,
        run_curator_backfill_pass,
    };
    use crate::{
        afp::Message,
        daemon_registry::{DaemonManifest, spawn_daemon},
        db::{Db, UserRecord},
        knowledge_curator::DaemonKind,
    };
    use serde_json::json;
    use ulid::Ulid;

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
        assert!(!is_noise_message("Project kickoff notes for OmnyID.", "note"));
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
