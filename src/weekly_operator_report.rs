use std::{collections::BTreeMap, process::Command, time::Duration};

use chrono::{Datelike, Days, NaiveDate, Timelike, Utc};
use chrono_tz::Australia::Sydney;
use sha2::{Digest, Sha256};
use sqlx::Row;
use tokio::task::JoinHandle;
use tracing::{info, warn};

use crate::{daemon_runtime::ShutdownRx, db::Db};

const RECIPIENT: &str = "concensure@gmail.com";
const POLL_INTERVAL: Duration = Duration::from_secs(60 * 60);

#[derive(Clone, Debug, Default, PartialEq, Eq)]
struct ReportStats {
    registrations: i64,
    verified_registrations: i64,
    registered_weddings: i64,
    activated_weddings: i64,
    returned_weddings: i64,
    engaged_weddings: i64,
    site_visits: i64,
    binder_errors: i64,
    browser_interruptions: i64,
    load_buckets: BTreeMap<String, i64>,
    lcp_buckets: BTreeMap<String, i64>,
    disk_used_bytes: Option<u64>,
    disk_total_bytes: Option<u64>,
}

fn enabled() -> bool {
    std::env::var("OMNYID_WEEKLY_OPERATOR_REPORT_ENABLED")
        .ok()
        .is_some_and(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
}

fn configured_recipient() -> Option<String> {
    let recipient = std::env::var("OMNYID_WEEKLY_OPERATOR_REPORT_RECIPIENT").ok()?;
    let recipient = recipient.trim().to_ascii_lowercase();
    (recipient == RECIPIENT).then_some(recipient)
}

fn due_report_week(now: chrono::DateTime<Utc>) -> Option<NaiveDate> {
    let local = now.with_timezone(&Sydney);
    if local.weekday() == chrono::Weekday::Mon && local.hour() < 8 {
        return None;
    }
    local
        .date_naive()
        .checked_sub_days(Days::new(local.weekday().num_days_from_monday() as u64))
}

fn recipient_digest(recipient: &str) -> String {
    hex::encode(Sha256::digest(recipient.as_bytes()))
}

async fn claim_report(
    db: &Db,
    report_week: NaiveDate,
    recipient: &str,
) -> Result<bool, sqlx::Error> {
    let claimed = sqlx::query(
        r#"
        INSERT INTO weekly_operator_report_receipts (report_week, recipient_digest, status)
        VALUES ($1, $2, 'sending')
        ON CONFLICT (report_week) DO UPDATE
        SET status='sending', recipient_digest=EXCLUDED.recipient_digest, attempted_at=NOW()
        WHERE weekly_operator_report_receipts.status='failed'
          AND weekly_operator_report_receipts.attempted_at < NOW() - INTERVAL '1 hour'
        RETURNING report_week
        "#,
    )
    .bind(report_week)
    .bind(recipient_digest(recipient))
    .fetch_optional(&db.pool)
    .await?;
    Ok(claimed.is_some())
}

async fn finish_report(db: &Db, report_week: NaiveDate, accepted: bool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE weekly_operator_report_receipts
        SET status=$2, accepted_at=CASE WHEN $2='accepted' THEN NOW() ELSE NULL END
        WHERE report_week=$1
        "#,
    )
    .bind(report_week)
    .bind(if accepted { "accepted" } else { "failed" })
    .execute(&db.pool)
    .await?;
    Ok(())
}

async fn load_report_stats(
    db: &Db,
    from: NaiveDate,
    through: NaiveDate,
) -> Result<ReportStats, sqlx::Error> {
    let until = through.checked_add_days(Days::new(1)).unwrap_or(through);
    let users = sqlx::query(
        r#"
        SELECT COUNT(*)::bigint AS registrations,
               COUNT(*) FILTER (WHERE email_verified)::bigint AS verified
        FROM users
        WHERE created_at >= ($1::date::timestamp AT TIME ZONE 'Australia/Sydney')
          AND created_at < ($2::date::timestamp AT TIME ZONE 'Australia/Sydney')
        "#,
    )
    .bind(from)
    .bind(until)
    .fetch_one(&db.pool)
    .await?;
    let growth = db.growth_period_facts(from, through).await?;
    let engagement = sqlx::query(
        r#"
        SELECT COUNT(DISTINCT (owner_user_id, wedding_plan_id))::bigint AS engaged
        FROM growth_wedding_activity_daily
        WHERE activity_date BETWEEN $1 AND $2
        "#,
    )
    .bind(from)
    .bind(through)
    .fetch_one(&db.pool)
    .await?;
    let reliability = sqlx::query(
        r#"
        SELECT
          COUNT(*) FILTER (WHERE event='wedding_binder_error')::bigint AS binder_errors,
          COUNT(*) FILTER (WHERE event='public_page_interruption')::bigint AS interruptions
        FROM wedding_site_events
        WHERE occurred_at >= ($1::date::timestamp AT TIME ZONE 'Australia/Sydney')
          AND occurred_at < ($2::date::timestamp AT TIME ZONE 'Australia/Sydney')
        "#,
    )
    .bind(from)
    .bind(until)
    .fetch_one(&db.pool)
    .await?;
    let performance = sqlx::query(
        r#"
        SELECT props->>'load_bucket' AS load_bucket,
               props->>'lcp_bucket' AS lcp_bucket,
               COUNT(*)::bigint AS count
        FROM wedding_site_events
        WHERE event='public_page_performance'
          AND occurred_at >= ($1::date::timestamp AT TIME ZONE 'Australia/Sydney')
          AND occurred_at < ($2::date::timestamp AT TIME ZONE 'Australia/Sydney')
        GROUP BY 1,2
        "#,
    )
    .bind(from)
    .bind(until)
    .fetch_all(&db.pool)
    .await?;
    let mut load_buckets = BTreeMap::new();
    let mut lcp_buckets = BTreeMap::new();
    for row in performance {
        let count = row.try_get::<i64, _>("count")?;
        if let Some(bucket) = row.try_get::<Option<String>, _>("load_bucket")? {
            *load_buckets.entry(bucket).or_default() += count;
        }
        if let Some(bucket) = row.try_get::<Option<String>, _>("lcp_bucket")? {
            *lcp_buckets.entry(bucket).or_default() += count;
        }
    }
    let disk = read_disk_metrics();
    Ok(ReportStats {
        registrations: users.try_get("registrations")?,
        verified_registrations: users.try_get("verified")?,
        registered_weddings: growth.registered_weddings,
        activated_weddings: growth.activated_acquired_weddings,
        returned_weddings: growth.returned_weddings_days_1_to_7,
        engaged_weddings: engagement.try_get("engaged")?,
        site_visits: growth.first_party_landing_sessions,
        binder_errors: reliability.try_get("binder_errors")?,
        browser_interruptions: reliability.try_get("interruptions")?,
        load_buckets,
        lcp_buckets,
        disk_used_bytes: disk.map(|value| value.0),
        disk_total_bytes: disk.map(|value| value.1),
    })
}

fn parse_df_bytes(stdout: &str) -> Option<(u64, u64)> {
    stdout
        .lines()
        .skip(1)
        .filter_map(|line| {
            let parts = line.split_whitespace().collect::<Vec<_>>();
            let total = parts.get(1)?.parse::<u64>().ok()?;
            let used = parts.get(2)?.parse::<u64>().ok()?;
            (used <= total).then_some((used, total))
        })
        .next()
}

fn read_disk_metrics() -> Option<(u64, u64)> {
    let root = std::env::var("OMNYID_WEEKLY_REPORT_DISK_ROOT")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "/".to_string());
    let output = Command::new("df")
        .args(["-B1", root.as_str()])
        .output()
        .ok()?;
    output.status.success().then_some(())?;
    parse_df_bytes(&String::from_utf8(output.stdout).ok()?)
}

fn bytes_label(value: Option<u64>) -> String {
    value
        .map(|bytes| format!("{:.1} GB", bytes as f64 / 1_073_741_824.0))
        .unwrap_or_else(|| "not available".to_string())
}

fn bucket_label(buckets: &BTreeMap<String, i64>) -> String {
    if buckets.is_empty() {
        return "no privacy-safe samples yet".to_string();
    }
    buckets
        .iter()
        .map(|(key, count)| format!("{key}: {count}"))
        .collect::<Vec<_>>()
        .join(", ")
}

fn credential_reminders(today: NaiveDate) -> Vec<String> {
    [
        (
            "Cloudflare email routing token",
            "OMNYID_EMAIL_ROUTING_TOKEN_EXPIRES_ON",
        ),
        (
            "Cloudflare platform token",
            "OMNYID_CLOUDFLARE_API_KEY_EXPIRES_ON",
        ),
        ("OpenRouter API key", "OPENROUTER_API_KEY_EXPIRES_ON"),
    ]
    .into_iter()
    .map(|(label, key)| {
        let date = std::env::var(key)
            .ok()
            .and_then(|value| NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d").ok());
        match date {
            Some(date) => {
                let days = date.signed_duration_since(today).num_days();
                if days < 0 {
                    format!(
                        "- {label}: expiry/rotation date passed {} days ago ({date}).",
                        -days
                    )
                } else if days <= 30 {
                    format!("- {label}: due in {days} days ({date}).")
                } else {
                    format!("- {label}: recorded for {date} ({days} days away).")
                }
            }
            None => {
                format!("- {label}: no expiry/rotation date is recorded; confirm provider policy.")
            }
        }
    })
    .collect()
}

fn report_body(from: NaiveDate, through: NaiveDate, stats: &ReportStats) -> String {
    let disk_percent = stats
        .disk_used_bytes
        .zip(stats.disk_total_bytes)
        .filter(|(_, total)| *total > 0)
        .map(|(used, total)| format!("{:.1}%", used as f64 * 100.0 / total as f64))
        .unwrap_or_else(|| "not available".to_string());
    let reminders = credential_reminders(through).join("\n");
    format!(
        "OmnyID weekly operator report\nReporting window: {from} to {through} (Australia/Sydney)\n\nUser growth\n- New accounts: {} ({} email verified)\n- Attributed Wedding registrations: {}\n- Wedding activations: {}\n- Wedding accounts with meaningful activity: {}\n- Day 1-7 returns among the acquired cohort: {}\n\nPublic experience\n- First-party Wedding site visits: {}\n- Page-load buckets: {}\n- Largest-contentful-paint buckets: {}\n- Browser interruptions: {}\n- Binder submission errors: {}\n\nOracle capacity\n- Disk: {} used of {} ({disk_percent})\n\nCredential reminders\n{reminders}\n\nNotes\nPerformance values are coarse first-party buckets, not visitor-level traces. No email addresses, page text, tokens, or private wedding content are included. Provider acceptance means the report was accepted for delivery; it is not an inbox-read receipt.\n",
        stats.registrations,
        stats.verified_registrations,
        stats.registered_weddings,
        stats.activated_weddings,
        stats.engaged_weddings,
        stats.returned_weddings,
        stats.site_visits,
        bucket_label(&stats.load_buckets),
        bucket_label(&stats.lcp_buckets),
        stats.browser_interruptions,
        stats.binder_errors,
        bytes_label(stats.disk_used_bytes),
        bytes_label(stats.disk_total_bytes),
    )
}

async fn run_due_report(db: &Db, now: chrono::DateTime<Utc>) -> Result<(), String> {
    let Some(report_week) = due_report_week(now) else {
        return Ok(());
    };
    let recipient = configured_recipient().ok_or_else(|| {
        format!("OMNYID_WEEKLY_OPERATOR_REPORT_RECIPIENT must be exactly {RECIPIENT}")
    })?;
    if !claim_report(db, report_week, &recipient)
        .await
        .map_err(|error| error.to_string())?
    {
        return Ok(());
    }
    let through = report_week
        .checked_sub_days(Days::new(1))
        .ok_or("invalid report week")?;
    let from = through
        .checked_sub_days(Days::new(6))
        .ok_or("invalid report start")?;
    let result = async {
        let stats = load_report_stats(db, from, through)
            .await
            .map_err(|error| error.to_string())?;
        let subject = format!("OmnyID weekly growth and operations — {from} to {through}");
        crate::gateway::smtp_out::send_transactional_email(
            &recipient,
            &subject,
            &report_body(from, through, &stats),
        )
        .await
    }
    .await;
    finish_report(db, report_week, result.is_ok())
        .await
        .map_err(|error| error.to_string())?;
    result
}

pub fn start_weekly_operator_report(db: Db, mut shutdown: ShutdownRx) -> JoinHandle<()> {
    tokio::spawn(async move {
        if !enabled() {
            info!("Weekly operator report disabled");
            return;
        }
        info!(recipient = RECIPIENT, "Weekly operator report started");
        loop {
            if let Err(error) = run_due_report(&db, Utc::now()).await {
                warn!(%error, "Weekly operator report attempt failed");
            }
            tokio::select! {
                _ = tokio::time::sleep(POLL_INTERVAL) => {}
                changed = shutdown.changed() => {
                    if changed.is_err() || *shutdown.borrow() { break; }
                }
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schedule_waits_until_monday_morning_in_sydney() {
        let before = chrono::DateTime::parse_from_rfc3339("2026-11-01T20:30:00Z")
            .unwrap()
            .to_utc();
        let after = chrono::DateTime::parse_from_rfc3339("2026-11-01T21:30:00Z")
            .unwrap()
            .to_utc();
        assert_eq!(due_report_week(before), None);
        assert_eq!(due_report_week(after), NaiveDate::from_ymd_opt(2026, 11, 2));
    }

    #[test]
    fn disk_parser_and_report_are_content_bounded() {
        assert_eq!(
            parse_df_bytes(
                "Filesystem 1B-blocks Used Available Use% Mounted\n/dev/sda 100 79 21 79% /\n"
            ),
            Some((79, 100))
        );
        let body = report_body(
            NaiveDate::from_ymd_opt(2026, 10, 26).unwrap(),
            NaiveDate::from_ymd_opt(2026, 11, 1).unwrap(),
            &ReportStats::default(),
        );
        assert!(body.contains("New accounts: 0"));
        assert!(!body.contains('@'));
    }
}
