use std::{collections::BTreeMap, env};

use serde::Serialize;
use sqlx::{PgPool, Row};

#[derive(Debug, Clone, Copy)]
struct LegacyMapping {
    legacy_type: &'static str,
    canonical_type: &'static str,
    canonical_subtype: &'static str,
}

#[derive(Debug, Serialize)]
struct AuditReport {
    total_messages: i64,
    legacy_type_counts: Vec<TypeCount>,
    metadata_legacy_type_counts: Vec<TypeCount>,
    canonical_counts: Vec<CanonicalCount>,
    suggested_mappings: Vec<SuggestedMapping>,
}

#[derive(Debug, Serialize)]
struct TypeCount {
    key: String,
    count: i64,
}

#[derive(Debug, Serialize)]
struct CanonicalCount {
    message_type: String,
    subtype: String,
    count: i64,
}

#[derive(Debug, Serialize)]
struct SuggestedMapping {
    legacy_type: String,
    stored_count: i64,
    canonical_type: String,
    canonical_subtype: String,
}

const LEGACY_MAPPINGS: &[LegacyMapping] = &[
    LegacyMapping {
        legacy_type: "agent_provisioned",
        canonical_type: "agent",
        canonical_subtype: "provisioned",
    },
    LegacyMapping {
        legacy_type: "agent_plan",
        canonical_type: "agent",
        canonical_subtype: "plan",
    },
    LegacyMapping {
        legacy_type: "agent_step",
        canonical_type: "agent",
        canonical_subtype: "step",
    },
    LegacyMapping {
        legacy_type: "agent_result",
        canonical_type: "agent",
        canonical_subtype: "result",
    },
    LegacyMapping {
        legacy_type: "agent_research_result",
        canonical_type: "agent",
        canonical_subtype: "research_result",
    },
    LegacyMapping {
        legacy_type: "agent_approval_request",
        canonical_type: "agent",
        canonical_subtype: "approval_request",
    },
    LegacyMapping {
        legacy_type: "agent_approval_granted",
        canonical_type: "agent",
        canonical_subtype: "approval_granted",
    },
    LegacyMapping {
        legacy_type: "agent_approval_rejected",
        canonical_type: "agent",
        canonical_subtype: "approval_rejected",
    },
    LegacyMapping {
        legacy_type: "agent_conflict_detected",
        canonical_type: "agent",
        canonical_subtype: "conflict_detected",
    },
    LegacyMapping {
        legacy_type: "agent_escalation",
        canonical_type: "agent",
        canonical_subtype: "escalation",
    },
    LegacyMapping {
        legacy_type: "agent_triage",
        canonical_type: "agent",
        canonical_subtype: "triage",
    },
    LegacyMapping {
        legacy_type: "agent_message",
        canonical_type: "agent",
        canonical_subtype: "message",
    },
    LegacyMapping {
        legacy_type: "task_update",
        canonical_type: "task",
        canonical_subtype: "status",
    },
    LegacyMapping {
        legacy_type: "email_incoming",
        canonical_type: "email",
        canonical_subtype: "incoming",
    },
    LegacyMapping {
        legacy_type: "email_outgoing",
        canonical_type: "email",
        canonical_subtype: "outgoing",
    },
    LegacyMapping {
        legacy_type: "action_reply",
        canonical_type: "action",
        canonical_subtype: "reply",
    },
    LegacyMapping {
        legacy_type: "action_forward",
        canonical_type: "action",
        canonical_subtype: "forward",
    },
    LegacyMapping {
        legacy_type: "public_article",
        canonical_type: "research",
        canonical_subtype: "public_article",
    },
    LegacyMapping {
        legacy_type: "block_update",
        canonical_type: "note",
        canonical_subtype: "block_update",
    },
];

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = env::args().skip(1).collect::<Vec<_>>();
    if args.iter().any(|arg| arg == "-h" || arg == "--help") {
        print_help();
        return Ok(());
    }

    let json_output = args.iter().any(|arg| arg == "--json");
    let limit = parse_limit(&args).unwrap_or(25);
    let database_url = env::var("DATABASE_URL")
        .map_err(|_| "DATABASE_URL is required to run omnyid_taxonomy_audit")?;

    let pool = PgPool::connect(&database_url).await?;
    let report = build_report(&pool, limit).await?;

    if json_output {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        print_human_report(&report, limit);
    }

    Ok(())
}

async fn build_report(pool: &PgPool, limit: i64) -> Result<AuditReport, sqlx::Error> {
    let total_messages = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM messages")
        .fetch_one(pool)
        .await?;
    let has_subtype = has_column(pool, "messages", "subtype").await?;
    let has_metadata = has_column(pool, "messages", "metadata").await?;

    let legacy_names = LEGACY_MAPPINGS.iter().map(|item| item.legacy_type).collect::<Vec<_>>();

    let legacy_type_counts = sqlx::query(
        r#"
        SELECT type AS key, COUNT(*) AS count
        FROM messages
        WHERE type = ANY($1)
        GROUP BY type
        ORDER BY COUNT(*) DESC, type ASC
        "#,
    )
    .bind(&legacy_names)
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| TypeCount {
        key: row.try_get("key").unwrap_or_default(),
        count: row.try_get("count").unwrap_or_default(),
    })
    .collect::<Vec<_>>();

    let metadata_legacy_type_counts = if has_metadata {
        sqlx::query(
            r#"
            SELECT metadata->>'legacy_type' AS key, COUNT(*) AS count
            FROM messages
            WHERE metadata ? 'legacy_type'
            GROUP BY metadata->>'legacy_type'
            ORDER BY COUNT(*) DESC, metadata->>'legacy_type' ASC
            "#,
        )
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|row| TypeCount {
            key: row.try_get("key").unwrap_or_default(),
            count: row.try_get("count").unwrap_or_default(),
        })
        .collect::<Vec<_>>()
    } else {
        Vec::new()
    };

    let canonical_counts = if has_subtype {
        sqlx::query(
            r#"
            SELECT type AS message_type, COALESCE(subtype, '') AS subtype, COUNT(*) AS count
            FROM messages
            GROUP BY type, COALESCE(subtype, '')
            ORDER BY COUNT(*) DESC, type ASC, COALESCE(subtype, '') ASC
            LIMIT $1
            "#,
        )
        .bind(limit)
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|row| CanonicalCount {
            message_type: row.try_get("message_type").unwrap_or_default(),
            subtype: row.try_get("subtype").unwrap_or_default(),
            count: row.try_get("count").unwrap_or_default(),
        })
        .collect::<Vec<_>>()
    } else {
        sqlx::query(
            r#"
            SELECT type AS message_type, '' AS subtype, COUNT(*) AS count
            FROM messages
            GROUP BY type
            ORDER BY COUNT(*) DESC, type ASC
            LIMIT $1
            "#,
        )
        .bind(limit)
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|row| CanonicalCount {
            message_type: row.try_get("message_type").unwrap_or_default(),
            subtype: row.try_get("subtype").unwrap_or_default(),
            count: row.try_get("count").unwrap_or_default(),
        })
        .collect::<Vec<_>>()
    };

    let legacy_count_map = legacy_type_counts
        .iter()
        .map(|item| (item.key.clone(), item.count))
        .collect::<BTreeMap<_, _>>();

    let suggested_mappings = LEGACY_MAPPINGS
        .iter()
        .filter_map(|mapping| {
            let stored_count = *legacy_count_map.get(mapping.legacy_type)?;
            Some(SuggestedMapping {
                legacy_type: mapping.legacy_type.to_string(),
                stored_count,
                canonical_type: mapping.canonical_type.to_string(),
                canonical_subtype: mapping.canonical_subtype.to_string(),
            })
        })
        .collect::<Vec<_>>();

    Ok(AuditReport {
        total_messages,
        legacy_type_counts,
        metadata_legacy_type_counts,
        canonical_counts,
        suggested_mappings,
    })
}

async fn has_column(pool: &PgPool, table_name: &str, column_name: &str) -> Result<bool, sqlx::Error> {
    let present = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = $1
              AND column_name = $2
        )
        "#,
    )
    .bind(table_name)
    .bind(column_name)
    .fetch_one(pool)
    .await?;
    Ok(present)
}

fn print_human_report(report: &AuditReport, limit: i64) {
    println!("OmnyID Message Taxonomy Audit");
    println!("Total messages: {}", report.total_messages);
    println!();

    println!("Legacy flat types still stored:");
    if report.legacy_type_counts.is_empty() {
        println!("  none");
    } else {
        for item in &report.legacy_type_counts {
            println!("  {:<28} {}", item.key, item.count);
        }
    }
    println!();

    println!("Canonical type/subtype counts (top {limit}):");
    for item in &report.canonical_counts {
        let subtype = if item.subtype.is_empty() {
            "∅"
        } else {
            &item.subtype
        };
        println!(
            "  {:<18} {:<22} {}",
            item.message_type, subtype, item.count
        );
    }
    println!();

    println!("Messages carrying metadata.legacy_type:");
    if report.metadata_legacy_type_counts.is_empty() {
        println!("  none");
    } else {
        for item in &report.metadata_legacy_type_counts {
            println!("  {:<28} {}", item.key, item.count);
        }
    }
    println!();

    println!("Suggested legacy -> canonical mappings with stored residue:");
    if report.suggested_mappings.is_empty() {
        println!("  none");
    } else {
        for item in &report.suggested_mappings {
            println!(
                "  {:<24} {:>6} rows  ->  {}:{}",
                item.legacy_type, item.stored_count, item.canonical_type, item.canonical_subtype
            );
        }
    }
}

fn parse_limit(args: &[String]) -> Option<i64> {
    args.windows(2)
        .find(|pair| pair[0] == "--limit")
        .and_then(|pair| pair[1].parse::<i64>().ok())
        .filter(|value| *value > 0)
}

fn print_help() {
    println!("omnyid_taxonomy_audit [--json] [--limit N]");
    println!("Read-only audit of stored AFP message taxonomy in the messages table.");
    println!("Requires DATABASE_URL in the environment.");
    println!("Examples:");
    println!("  omnyid_taxonomy_audit");
    println!("  omnyid_taxonomy_audit --limit 50");
    println!("  omnyid_taxonomy_audit --json");
}

#[cfg(test)]
mod tests {
    use super::{LEGACY_MAPPINGS, parse_limit};

    #[test]
    fn parse_limit_reads_positive_value() {
        let args = vec!["--limit".to_string(), "40".to_string()];
        assert_eq!(parse_limit(&args), Some(40));
    }

    #[test]
    fn parse_limit_rejects_zero_or_invalid_value() {
        let zero = vec!["--limit".to_string(), "0".to_string()];
        let invalid = vec!["--limit".to_string(), "abc".to_string()];
        assert_eq!(parse_limit(&zero), None);
        assert_eq!(parse_limit(&invalid), None);
    }

    #[test]
    fn legacy_mapping_table_includes_key_normalizations() {
        assert!(LEGACY_MAPPINGS
            .iter()
            .any(|item| item.legacy_type == "agent_plan"
                && item.canonical_type == "agent"
                && item.canonical_subtype == "plan"));
        assert!(LEGACY_MAPPINGS
            .iter()
            .any(|item| item.legacy_type == "task_update"
                && item.canonical_type == "task"
                && item.canonical_subtype == "status"));
    }
}
