//! Safe availability evidence from vendor-controlled limited-date offers.
//!
//! Search receives only a generic, fresh availability signal. Offer titles,
//! prices, inclusions, conditions and the vendor's wider calendar remain
//! server-side until the canonical shortlist selects a top-three vendor.

use chrono::{DateTime, NaiveDate, Utc};
use serde_json::json;
use sqlx::Row;

use super::WeddingVendorSearchSource;
use crate::db::Db;

#[derive(Clone, Debug, Eq, PartialEq)]
struct SafeSpecialEvidence {
    vendor_id: String,
    availability_scope: String,
    last_confirmed_at: DateTime<Utc>,
    confirmation_expires_at: DateTime<Utc>,
}

pub(super) fn discovery_rollout_allowed(email: &str) -> bool {
    rollout_allowed_from(
        std::env::var("OMNYID_WEDDING_VENDOR_SPECIALS_DISCOVERY_ENABLED").as_deref() == Ok("true"),
        &std::env::var("OMNYID_WEDDING_VENDOR_SPECIALS_DISCOVERY_ALLOWLIST").unwrap_or_default(),
        email,
    )
}

fn rollout_allowed_from(enabled: bool, allowlist: &str, email: &str) -> bool {
    enabled
        && allowlist
            .split(',')
            .map(|value| value.trim().to_ascii_lowercase())
            .any(|value| value == "*" || (!value.is_empty() && value == email.trim().to_ascii_lowercase()))
}

pub(super) async fn attach_active_special_evidence(
    db: &Db,
    sources: &mut [WeddingVendorSearchSource],
    selected_date: NaiveDate,
    guest_count: Option<u32>,
) -> Result<usize, sqlx::Error> {
    let vendor_ids = sources
        .iter()
        .filter_map(|source| source.vendor_id.clone())
        .collect::<Vec<_>>();
    if vendor_ids.is_empty() {
        return Ok(0);
    }
    let guest_count = guest_count.map(i64::from);
    let rows = sqlx::query(
        r#"SELECT DISTINCT ON (slot.vendor_id)
                  slot.vendor_id,slot.availability_scope,slot.last_confirmed_at,slot.confirmation_expires_at
           FROM wedding_vendor_special_offer_slots slot
           JOIN wedding_vendor_special_offers offer
             ON offer.offer_id=slot.offer_id AND offer.vendor_id=slot.vendor_id
           WHERE slot.vendor_id=ANY($1)
             AND slot.local_date=$2
             AND slot.state IN ('available','enquiry_received')
             AND slot.confirmation_expires_at>NOW()
             AND offer.publication_state='active'
             AND offer.approved_revision=offer.revision
             AND (offer.valid_from IS NULL OR offer.valid_from<=$2)
             AND (offer.valid_until IS NULL OR offer.valid_until>=$2)
             AND ($3::bigint IS NULL OR offer.guest_min IS NULL OR offer.guest_min<=$3)
             AND ($3::bigint IS NULL OR offer.guest_max IS NULL OR offer.guest_max>=$3)
             AND ($3::bigint IS NULL OR slot.maximum_capacity IS NULL OR slot.maximum_capacity>=$3)
           ORDER BY slot.vendor_id,slot.last_confirmed_at DESC,slot.slot_id"#,
    )
    .bind(&vendor_ids)
    .bind(selected_date)
    .bind(guest_count)
    .fetch_all(&db.pool)
    .await?;
    let evidence = rows
        .into_iter()
        .map(|row| SafeSpecialEvidence {
            vendor_id: row.get("vendor_id"),
            availability_scope: row.get("availability_scope"),
            last_confirmed_at: row.get("last_confirmed_at"),
            confirmation_expires_at: row.get("confirmation_expires_at"),
        })
        .collect::<Vec<_>>();
    Ok(annotate_sources(sources, selected_date, &evidence))
}

fn annotate_sources(
    sources: &mut [WeddingVendorSearchSource],
    selected_date: NaiveDate,
    evidence: &[SafeSpecialEvidence],
) -> usize {
    let mut attached = 0;
    for source in sources {
        let Some(item) = source
            .vendor_id
            .as_deref()
            .and_then(|vendor_id| evidence.iter().find(|item| item.vendor_id == vendor_id))
        else {
            continue;
        };
        source.availability = Some(json!({
            "state":if item.availability_scope == "vendor_confirmed" { "confirmed_available" } else { "likely_available" },
            "date_from":selected_date.to_string(),
            "date_to":selected_date.to_string(),
            "confidence":1.0,
            "checked_at":item.last_confirmed_at.to_rfc3339(),
            "valid_until":item.confirmation_expires_at.to_rfc3339(),
            "source":"vendor_limited_special",
            "notes":if item.availability_scope == "vendor_confirmed" { "The vendor directly confirmed this opening. Exact package details are shown only if this vendor reaches your current top three." } else { "The vendor calendar shows this date open; an enquiry is still needed. Exact package details are shown only if this vendor reaches your current top three." }
        }));
        source.limited_special = Some(json!({
            "available_on_date":selected_date.to_string(),
            "last_confirmed_at":item.last_confirmed_at.to_rfc3339(),
            "confirmation_expires_at":item.confirmation_expires_at.to_rfc3339(),
            "indicative_only":true
        }));
        attached += 1;
    }
    attached
}

#[cfg(test)]
mod tests {
    use super::*;

    fn source(vendor_id: &str) -> WeddingVendorSearchSource {
        WeddingVendorSearchSource {
            title: vendor_id.to_string(),
            vendor_id: Some(vendor_id.to_string()),
            ..WeddingVendorSearchSource::default()
        }
    }

    #[test]
    fn rollout_is_false_default_and_allowlisted() {
        assert!(!rollout_allowed_from(
            false,
            "couple@example.com",
            "couple@example.com"
        ));
        assert!(!rollout_allowed_from(
            true,
            "other@example.com",
            "couple@example.com"
        ));
        assert!(rollout_allowed_from(
            true,
            " Other@example.com, COUPLE@example.com ",
            "couple@example.com"
        ));
        assert!(rollout_allowed_from(true, "*", "any-authenticated@example.com"));
    }

    #[test]
    fn generic_evidence_never_serializes_package_or_price() {
        let now = Utc::now();
        let mut sources = vec![source("vendor-a"), source("vendor-b")];
        let count = annotate_sources(
            &mut sources,
            NaiveDate::from_ymd_opt(2027, 7, 12).unwrap(),
            &[SafeSpecialEvidence {
                vendor_id: "vendor-a".to_string(),
                availability_scope: "vendor_confirmed".to_string(),
                last_confirmed_at: now,
                confirmation_expires_at: now + chrono::Duration::days(7),
            }],
        );
        assert_eq!(count, 1);
        assert_eq!(
            sources[0].availability.as_ref().unwrap()["state"],
            "confirmed_available"
        );
        let serialized = serde_json::to_string(&sources[0]).unwrap();
        assert!(serialized.contains("limited_special"));
        for forbidden in [
            "minimum_spend",
            "per_head",
            "inclusions",
            "offer_id",
            "slot_id",
        ] {
            assert!(!serialized.contains(forbidden), "leaked {forbidden}");
        }
        assert!(sources[1].limited_special.is_none());
    }
}
