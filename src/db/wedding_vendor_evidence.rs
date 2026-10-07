// @locs-version: 2.0
use super::{Db, WeddingVendorUpsertRecord, WeddingVendorUserContactRecord};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::Row;
use std::collections::HashMap;
use ulid::Ulid;

/// Ordered lowest to highest; a higher index wins on write.
pub const VENDOR_ATTRIBUTE_AUTHORITIES: [&str; 7] = [
    "inferred",
    "editorial",
    "directory",
    "independent_aggregate",
    "primary_official",
    "vendor_reply",
    "operator",
];

pub const VENDOR_ATTRIBUTE_STATUSES: [&str; 4] =
    ["known", "estimated", "unknown", "not_applicable"];

pub const VENDOR_AVAILABILITY_STATES: [&str; 8] = [
    "confirmed_available",
    "likely_available",
    "unknown",
    "enquiry_sent",
    "awaiting_response",
    "temporary_hold",
    "confirmed_unavailable",
    "booked",
];

/// Doubled so an attribute's preferred authority can sit between two neighbours.
const AUTHORITY_RANK_STEP: i32 = 2;

/// Rank of `authority` for a key whose spec prefers `preferred`. Attributes such as Google
/// ratings are best sourced from an independent aggregate, so that authority outranks a
/// venue's own claim but still loses to an operator or a vendor's direct reply.
pub fn vendor_attribute_authority_rank(authority: &str, preferred: &str) -> Option<i32> {
    let index = VENDOR_ATTRIBUTE_AUTHORITIES
        .iter()
        .position(|candidate| *candidate == authority)? as i32;
    let base = index * AUTHORITY_RANK_STEP;
    let vendor_reply_rank = 5 * AUTHORITY_RANK_STEP;
    let primary_official_rank = 4 * AUTHORITY_RANK_STEP;
    if authority == preferred && base < vendor_reply_rank {
        return Some(base.max(primary_official_rank + 1));
    }
    Some(base)
}

#[derive(Clone, Debug)]
pub struct VendorAttributeWrite {
    pub attribute_key: String,
    pub value: Option<Value>,
    pub status: String,
    pub confidence: Option<f32>,
    pub authority: String,
    pub preferred_authority: String,
    pub source_url: Option<String>,
    pub source_label: Option<String>,
    pub valid_until: Option<String>,
    pub notes: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VendorAttributeRecord {
    pub vendor_id: String,
    pub attribute_key: String,
    pub value: Option<Value>,
    pub status: String,
    pub confidence: Option<f32>,
    pub authority: String,
    pub source_url: Option<String>,
    pub source_label: Option<String>,
    pub retrieved_at: String,
    pub valid_until: Option<String>,
    pub notes: Option<String>,
}

#[derive(Clone, Debug)]
pub struct VendorAvailabilityInput {
    pub user_id: String,
    pub vendor_id: String,
    pub wedding_plan_id: String,
    pub state: String,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub source: String,
    pub source_ref: Option<String>,
    pub confidence: Option<f32>,
    pub valid_until: Option<String>,
    pub notes: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VendorAvailabilityRecord {
    pub availability_id: String,
    pub vendor_id: String,
    pub wedding_plan_id: String,
    pub state: String,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub source: String,
    pub source_ref: Option<String>,
    pub confidence: Option<f32>,
    pub checked_at: String,
    pub valid_until: Option<String>,
    pub notes: Option<String>,
}

const AVAILABILITY_COLUMNS: &str = r#"
    availability_id,
    vendor_id,
    wedding_plan_id,
    state,
    date_from::text AS date_from,
    date_to::text AS date_to,
    source,
    source_ref,
    confidence,
    checked_at::text AS checked_at,
    valid_until::text AS valid_until,
    notes
"#;

fn availability_from_row(row: &sqlx::postgres::PgRow) -> VendorAvailabilityRecord {
    VendorAvailabilityRecord {
        availability_id: row.get("availability_id"),
        vendor_id: row.get("vendor_id"),
        wedding_plan_id: row.get("wedding_plan_id"),
        state: row.get("state"),
        date_from: row.get("date_from"),
        date_to: row.get("date_to"),
        source: row.get("source"),
        source_ref: row.get("source_ref"),
        confidence: row.get("confidence"),
        checked_at: row.get("checked_at"),
        valid_until: row.get("valid_until"),
        notes: row.get("notes"),
    }
}

impl Db {
    /// Returns whether the row was written. A skipped write is the correct outcome when a
    /// less authoritative source disagrees with a fresher, stronger one, not an error.
    pub async fn upsert_wedding_vendor_attribute(
        &self,
        vendor_id: &str,
        write: &VendorAttributeWrite,
        user_id: Option<&str>,
    ) -> Result<bool, sqlx::Error> {
        let Some(new_rank) =
            vendor_attribute_authority_rank(&write.authority, &write.preferred_authority)
        else {
            return Err(sqlx::Error::Protocol(format!(
                "unknown vendor attribute authority '{}'; use one of {:?}",
                write.authority, VENDOR_ATTRIBUTE_AUTHORITIES
            )));
        };
        let authorities = VENDOR_ATTRIBUTE_AUTHORITIES
            .iter()
            .map(|authority| authority.to_string())
            .collect::<Vec<_>>();
        let ranks = VENDOR_ATTRIBUTE_AUTHORITIES
            .iter()
            .filter_map(|authority| {
                vendor_attribute_authority_rank(authority, &write.preferred_authority)
            })
            .collect::<Vec<_>>();
        let row = sqlx::query(
            r#"
            INSERT INTO wedding_vendor_attributes (
                vendor_id, attribute_key, value, status, confidence, authority,
                source_url, source_label, valid_until, notes, updated_by_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10, $11)
            ON CONFLICT (vendor_id, attribute_key) DO UPDATE SET
                value = EXCLUDED.value,
                status = EXCLUDED.status,
                confidence = EXCLUDED.confidence,
                authority = EXCLUDED.authority,
                source_url = EXCLUDED.source_url,
                source_label = EXCLUDED.source_label,
                retrieved_at = NOW(),
                valid_until = EXCLUDED.valid_until,
                notes = EXCLUDED.notes,
                updated_by_user_id = EXCLUDED.updated_by_user_id
            WHERE wedding_vendor_attributes.status = 'unknown'
                OR (
                    wedding_vendor_attributes.valid_until IS NOT NULL
                    AND wedding_vendor_attributes.valid_until < NOW()
                )
                OR $12::int >= COALESCE((
                    SELECT ranked.rank
                    FROM unnest($13::text[], $14::int[]) AS ranked(authority, rank)
                    WHERE ranked.authority = wedding_vendor_attributes.authority
                ), 0)
            RETURNING vendor_id
            "#,
        )
        .bind(vendor_id)
        .bind(&write.attribute_key)
        .bind(&write.value)
        .bind(&write.status)
        .bind(write.confidence)
        .bind(&write.authority)
        .bind(&write.source_url)
        .bind(&write.source_label)
        .bind(&write.valid_until)
        .bind(&write.notes)
        .bind(user_id)
        .bind(new_rank)
        .bind(&authorities)
        .bind(&ranks)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.is_some())
    }

    pub async fn list_wedding_vendor_attributes(
        &self,
        vendor_ids: &[String],
    ) -> Result<HashMap<String, Vec<VendorAttributeRecord>>, sqlx::Error> {
        if vendor_ids.is_empty() {
            return Ok(HashMap::new());
        }
        let rows = sqlx::query(
            r#"
            SELECT
                vendor_id,
                attribute_key,
                value,
                status,
                confidence,
                authority,
                source_url,
                source_label,
                retrieved_at::text AS retrieved_at,
                valid_until::text AS valid_until,
                notes
            FROM wedding_vendor_attributes
            WHERE vendor_id = ANY($1)
            ORDER BY vendor_id, attribute_key
            "#,
        )
        .bind(vendor_ids)
        .fetch_all(&self.pool)
        .await?;
        let mut grouped: HashMap<String, Vec<VendorAttributeRecord>> = HashMap::new();
        for row in rows {
            let record = VendorAttributeRecord {
                vendor_id: row.get("vendor_id"),
                attribute_key: row.get("attribute_key"),
                value: row.get("value"),
                status: row.get("status"),
                confidence: row.get("confidence"),
                authority: row.get("authority"),
                source_url: row.get("source_url"),
                source_label: row.get("source_label"),
                retrieved_at: row.get("retrieved_at"),
                valid_until: row.get("valid_until"),
                notes: row.get("notes"),
            };
            grouped
                .entry(record.vendor_id.clone())
                .or_default()
                .push(record);
        }
        Ok(grouped)
    }

    pub async fn record_wedding_vendor_availability(
        &self,
        input: &VendorAvailabilityInput,
    ) -> Result<VendorAvailabilityRecord, sqlx::Error> {
        let availability_id = Ulid::new().to_string();
        let query = format!(
            r#"
            INSERT INTO wedding_vendor_availability (
                availability_id, user_id, vendor_id, wedding_plan_id, state,
                date_from, date_to, source, source_ref, confidence, valid_until, notes
            )
            VALUES (
                $1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, $10, $11::timestamptz, $12
            )
            RETURNING {AVAILABILITY_COLUMNS}
            "#
        );
        let row = sqlx::query(&query)
            .bind(&availability_id)
            .bind(&input.user_id)
            .bind(&input.vendor_id)
            .bind(&input.wedding_plan_id)
            .bind(&input.state)
            .bind(&input.date_from)
            .bind(&input.date_to)
            .bind(&input.source)
            .bind(&input.source_ref)
            .bind(input.confidence)
            .bind(&input.valid_until)
            .bind(&input.notes)
            .fetch_one(&self.pool)
            .await?;
        Ok(availability_from_row(&row))
    }

    pub async fn latest_wedding_vendor_availability(
        &self,
        user_id: &str,
        wedding_plan_id: &str,
        vendor_ids: &[String],
    ) -> Result<HashMap<String, VendorAvailabilityRecord>, sqlx::Error> {
        if vendor_ids.is_empty() {
            return Ok(HashMap::new());
        }
        let query = format!(
            r#"
            SELECT DISTINCT ON (vendor_id) {AVAILABILITY_COLUMNS}
            FROM wedding_vendor_availability
            WHERE user_id = $1 AND wedding_plan_id = $2 AND vendor_id = ANY($3)
            ORDER BY vendor_id, checked_at DESC, availability_id DESC
            "#
        );
        let rows = sqlx::query(&query)
            .bind(user_id)
            .bind(wedding_plan_id)
            .bind(vendor_ids)
            .fetch_all(&self.pool)
            .await?;
        Ok(rows
            .iter()
            .map(|row| {
                let record = availability_from_row(row);
                (record.vendor_id.clone(), record)
            })
            .collect())
    }

    /// Official-site evidence for vendors already known by slug, so a repeat search can skip
    /// a paid canonical-resolution call.
    pub async fn official_website_cache_by_slug(
        &self,
        slugs: &[String],
    ) -> Result<HashMap<String, VendorAttributeRecord>, sqlx::Error> {
        if slugs.is_empty() {
            return Ok(HashMap::new());
        }
        let rows = sqlx::query(
            r#"
            SELECT
                v.vendor_slug,
                a.vendor_id,
                a.attribute_key,
                a.value,
                a.status,
                a.confidence,
                a.authority,
                a.source_url,
                a.source_label,
                a.retrieved_at::text AS retrieved_at,
                a.valid_until::text AS valid_until,
                a.notes
            FROM wedding_vendors v
            JOIN wedding_vendor_attributes a ON a.vendor_id = v.vendor_id
            WHERE v.vendor_slug = ANY($1) AND a.attribute_key = 'official_website'
            "#,
        )
        .bind(slugs)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .iter()
            .map(|row| {
                (
                    row.get::<String, _>("vendor_slug"),
                    VendorAttributeRecord {
                        vendor_id: row.get("vendor_id"),
                        attribute_key: row.get("attribute_key"),
                        value: row.get("value"),
                        status: row.get("status"),
                        confidence: row.get("confidence"),
                        authority: row.get("authority"),
                        source_url: row.get("source_url"),
                        source_label: row.get("source_label"),
                        retrieved_at: row.get("retrieved_at"),
                        valid_until: row.get("valid_until"),
                        notes: row.get("notes"),
                    },
                )
            })
            .collect())
    }

    pub async fn wedding_vendor_user_contacts_by_vendor(
        &self,
        user_id: &str,
        vendor_ids: &[String],
    ) -> Result<HashMap<String, WeddingVendorUserContactRecord>, sqlx::Error> {
        if vendor_ids.is_empty() {
            return Ok(HashMap::new());
        }
        let rows = sqlx::query(
            r#"
            SELECT
                contact_id,
                user_id,
                vendor_id,
                contact_method,
                last_contact_at::text AS last_contact_at,
                response_received_at::text AS response_received_at,
                follow_up_due_at::text AS follow_up_due_at,
                thread_id,
                receipt_ref,
                notes,
                created_at::text AS created_at,
                updated_at::text AS updated_at
            FROM wedding_vendor_user_contacts
            WHERE user_id = $1 AND vendor_id = ANY($2)
            "#,
        )
        .bind(user_id)
        .bind(vendor_ids)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .iter()
            .map(|row| {
                let record = WeddingVendorUserContactRecord {
                    contact_id: row.get("contact_id"),
                    user_id: row.get("user_id"),
                    vendor_id: row.get("vendor_id"),
                    contact_method: row.get("contact_method"),
                    last_contact_at: row.get("last_contact_at"),
                    response_received_at: row.get("response_received_at"),
                    follow_up_due_at: row.get("follow_up_due_at"),
                    thread_id: row.get("thread_id"),
                    receipt_ref: row.get("receipt_ref"),
                    notes: row.get("notes"),
                    created_at: row.get("created_at"),
                    updated_at: row.get("updated_at"),
                };
                (record.vendor_id.clone(), record)
            })
            .collect())
    }

    /// Returns the vendor_id of the inserted or already-existing row so callers can attach
    /// evidence to it. An existing website is only replaced when the incoming one is
    /// confirmed official; otherwise a first-seen value is kept.
    pub async fn upsert_discovered_wedding_vendor(
        &self,
        input: &WeddingVendorUpsertRecord,
        discovered_by_user_id: &str,
        website_is_official: bool,
    ) -> Result<String, sqlx::Error> {
        let vendor_id = Ulid::new().to_string();
        // A vendor already known under another slug (renamed listing, directory spelling) is
        // merged into that row rather than duplicated; the conflict clause below then only
        // fills fields the existing row lacks.
        let existing_slug = self.find_existing_vendor_slug(input).await?;
        let vendor_slug = existing_slug.as_deref().unwrap_or(&input.vendor_slug);
        let row = sqlx::query(
            r#"
            INSERT INTO wedding_vendors (
                vendor_id,
                vendor_slug,
                vendor_name,
                category,
                service_area,
                address,
                website_url,
                contact_phone,
                contact_email,
                source_url,
                source_label,
                source_checked_at,
                status,
                notes,
                evidence,
                caveat_labels,
                created_by_user_id,
                updated_by_user_id
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::date,
                $13, $14, $15, $16, $17, $17
            )
            ON CONFLICT (vendor_slug) DO UPDATE SET
                address = COALESCE(wedding_vendors.address, EXCLUDED.address),
                website_url = CASE
                    WHEN $18 AND EXCLUDED.website_url IS NOT NULL THEN EXCLUDED.website_url
                    ELSE COALESCE(wedding_vendors.website_url, EXCLUDED.website_url)
                END,
                contact_phone = COALESCE(wedding_vendors.contact_phone, EXCLUDED.contact_phone),
                contact_email = COALESCE(wedding_vendors.contact_email, EXCLUDED.contact_email),
                source_url = COALESCE(wedding_vendors.source_url, EXCLUDED.source_url),
                source_label = COALESCE(wedding_vendors.source_label, EXCLUDED.source_label),
                source_checked_at = COALESCE(EXCLUDED.source_checked_at, wedding_vendors.source_checked_at),
                notes = COALESCE(wedding_vendors.notes, EXCLUDED.notes),
                evidence = COALESCE(wedding_vendors.evidence, '{}'::jsonb) || EXCLUDED.evidence,
                caveat_labels = (
                    SELECT ARRAY(
                        SELECT DISTINCT label
                        FROM unnest(wedding_vendors.caveat_labels || EXCLUDED.caveat_labels) AS label
                        WHERE label IS NOT NULL AND btrim(label) <> ''
                        ORDER BY label
                    )
                ),
                updated_by_user_id = EXCLUDED.updated_by_user_id,
                updated_at = NOW()
            RETURNING vendor_id
            "#,
        )
        .bind(&vendor_id)
        .bind(vendor_slug)
        .bind(&input.vendor_name)
        .bind(&input.category)
        .bind(&input.service_area)
        .bind(&input.address)
        .bind(&input.website_url)
        .bind(&input.contact_phone)
        .bind(&input.contact_email)
        .bind(&input.source_url)
        .bind(&input.source_label)
        .bind(&input.source_checked_at)
        .bind(&input.status)
        .bind(&input.notes)
        .bind(&input.evidence)
        .bind(&input.caveat_labels)
        .bind(discovered_by_user_id)
        .bind(website_is_official)
        .fetch_one(&self.pool)
        .await?;
        let resolved_id: String = row.get("vendor_id");
        self.backfill_missing_vendor_photos(&resolved_id, &input.photos)
            .await?;
        Ok(resolved_id)
    }

    /// Slug of an existing vendor that is the same business by name, website host or phone.
    async fn find_existing_vendor_slug(
        &self,
        input: &WeddingVendorUpsertRecord,
    ) -> Result<Option<String>, sqlx::Error> {
        sqlx::query_scalar(
            r#"
            SELECT vendor_slug
            FROM wedding_vendors
            WHERE vendor_slug = $1
               OR (category = $2
                   AND lower(regexp_replace(vendor_name, '[^a-zA-Z0-9]', '', 'g')) =
                       lower(regexp_replace($3, '[^a-zA-Z0-9]', '', 'g')))
               OR ($4::text IS NOT NULL
                   AND lower(regexp_replace(coalesce(website_url, ''), '^https?://(www\.)?([^/]+).*$', '\2')) =
                       lower(regexp_replace($4, '^https?://(www\.)?([^/]+).*$', '\2')))
               OR ($5::text IS NOT NULL AND length($5) >= 8
                   AND regexp_replace(coalesce(contact_phone, ''), '\D', '', 'g') = $5)
            ORDER BY (vendor_slug = $1) DESC, (status = 'active') DESC, created_at ASC
            LIMIT 1
            "#,
        )
        .bind(&input.vendor_slug)
        .bind(&input.category)
        .bind(&input.vendor_name)
        .bind(input.website_url.as_deref())
        .bind(
            input
                .contact_phone
                .as_deref()
                .map(|phone| phone.chars().filter(char::is_ascii_digit).collect::<String>())
                .filter(|digits| !digits.is_empty()),
        )
        .fetch_optional(&self.pool)
        .await
    }

    /// Adds discovered photos only to empty slots; curated photos are never replaced.
    async fn backfill_missing_vendor_photos(
        &self,
        vendor_id: &str,
        photos: &[crate::db::WeddingVendorPhotoUpsertRecord],
    ) -> Result<(), sqlx::Error> {
        for photo in photos.iter().take(3) {
            sqlx::query(
                r#"
                INSERT INTO wedding_vendor_photos (
                    photo_id, vendor_id, slot, photo_url, alt_text, source_label,
                    source_url, retrieved_at, licence_metadata
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9)
                ON CONFLICT (vendor_id, slot) DO NOTHING
                "#,
            )
            .bind(Ulid::new().to_string())
            .bind(vendor_id)
            .bind(photo.slot)
            .bind(&photo.photo_url)
            .bind(&photo.alt_text)
            .bind(&photo.source_label)
            .bind(&photo.source_url)
            .bind(&photo.retrieved_at)
            .bind(&photo.licence_metadata)
            .execute(&self.pool)
            .await?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rank(authority: &str, preferred: &str) -> i32 {
        vendor_attribute_authority_rank(authority, preferred).expect("known authority")
    }

    #[test]
    fn authority_rank_orders_operator_above_official_above_directory() {
        assert!(rank("operator", "primary_official") > rank("vendor_reply", "primary_official"));
        assert!(
            rank("vendor_reply", "primary_official") > rank("primary_official", "primary_official")
        );
        assert!(
            rank("primary_official", "primary_official") > rank("directory", "primary_official")
        );
        assert!(rank("directory", "primary_official") > rank("editorial", "primary_official"));
        assert!(rank("editorial", "primary_official") > rank("inferred", "primary_official"));
    }

    #[test]
    fn preferred_aggregate_authority_beats_official_but_not_operator_or_reply() {
        let preferred = "independent_aggregate";
        assert!(rank("independent_aggregate", preferred) > rank("primary_official", preferred));
        assert!(rank("independent_aggregate", preferred) < rank("vendor_reply", preferred));
        assert!(rank("independent_aggregate", preferred) < rank("operator", preferred));
        assert!(
            rank("independent_aggregate", "primary_official")
                < rank("primary_official", "primary_official")
        );
    }

    #[test]
    fn unknown_authority_has_no_rank() {
        assert!(vendor_attribute_authority_rank("rumour", "primary_official").is_none());
    }

    #[test]
    fn availability_state_list_matches_the_migration_check_constraint() {
        let migration =
            include_str!("../../postgres/migrations/0094_wedding_vendor_ranking_evidence.sql");
        for state in VENDOR_AVAILABILITY_STATES {
            assert!(
                migration.contains(&format!("'{state}'")),
                "{state} missing from migration"
            );
        }
        for authority in VENDOR_ATTRIBUTE_AUTHORITIES {
            assert!(
                migration.contains(&format!("'{authority}'")),
                "{authority} missing from migration"
            );
        }
        for status in VENDOR_ATTRIBUTE_STATUSES {
            assert!(
                migration.contains(&format!("'{status}'")),
                "{status} missing from migration"
            );
        }
    }

    fn write(
        authority: &str,
        value: i64,
        status: &str,
        valid_until: Option<&str>,
    ) -> VendorAttributeWrite {
        VendorAttributeWrite {
            attribute_key: "capacity_seated_max".to_string(),
            value: Some(serde_json::json!(value)),
            status: status.to_string(),
            confidence: Some(0.9),
            authority: authority.to_string(),
            preferred_authority: "primary_official".to_string(),
            source_url: None,
            source_label: None,
            valid_until: valid_until.map(str::to_string),
            notes: None,
        }
    }

    async fn smoke_db() -> Option<(Db, String)> {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return None;
        }
        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
        let db = Db::new(&database_url).await.ok()?;
        let vendor_id = format!("test-evidence-{}", Ulid::new());
        sqlx::query(
            "INSERT INTO wedding_vendors (vendor_id, vendor_slug, vendor_name, category, service_area) VALUES ($1, $1, 'Evidence Test', 'venue', 'Sydney')",
        )
        .bind(&vendor_id)
        .execute(&db.pool)
        .await
        .ok()?;
        Some((db, vendor_id))
    }

    async fn stored_value(db: &Db, vendor_id: &str) -> i64 {
        let records = db
            .list_wedding_vendor_attributes(&[vendor_id.to_string()])
            .await
            .expect("list attributes");
        records[vendor_id][0]
            .value
            .as_ref()
            .and_then(Value::as_i64)
            .expect("numeric value")
    }

    #[tokio::test]
    async fn local_postgres_attribute_writes_follow_authority_precedence() {
        let Some((db, vendor_id)) = smoke_db().await else {
            return;
        };
        let apply = |w: VendorAttributeWrite| {
            let db = db.clone();
            let vendor_id = vendor_id.clone();
            async move {
                db.upsert_wedding_vendor_attribute(&vendor_id, &w, None)
                    .await
                    .expect("upsert")
            }
        };

        assert!(apply(write("primary_official", 100, "known", None)).await);
        // Lower authority is skipped silently.
        assert!(!apply(write("directory", 160, "known", None)).await);
        assert_eq!(stored_value(&db, &vendor_id).await, 100);
        // Equal authority replaces (fresher observation).
        assert!(apply(write("primary_official", 110, "known", None)).await);
        // Higher authority replaces.
        assert!(apply(write("operator", 140, "known", None)).await);
        assert!(!apply(write("primary_official", 120, "known", None)).await);
        assert_eq!(stored_value(&db, &vendor_id).await, 140);

        // An expired row yields to lower authority.
        assert!(
            apply(write(
                "operator",
                150,
                "known",
                Some("2000-01-01T00:00:00Z")
            ))
            .await
        );
        assert!(apply(write("directory", 90, "estimated", None)).await);
        assert_eq!(stored_value(&db, &vendor_id).await, 90);

        // An existing unknown row is always replaceable.
        assert!(apply(write("operator", 0, "unknown", None)).await);
        assert!(apply(write("inferred", 70, "estimated", None)).await);
        assert_eq!(stored_value(&db, &vendor_id).await, 70);

        sqlx::query("DELETE FROM wedding_vendors WHERE vendor_id = $1")
            .bind(&vendor_id)
            .execute(&db.pool)
            .await
            .expect("cleanup");
    }

    #[tokio::test]
    async fn local_postgres_latest_availability_and_discovered_vendor_website_rules() {
        let Some((db, vendor_id)) = smoke_db().await else {
            return;
        };
        let user_id = format!("test-user-{}", Ulid::new());
        sqlx::query(
            "INSERT INTO users (id, email, auth_provider, display_name) VALUES ($1, $2, 'password', 'Evidence Test')",
        )
        .bind(&user_id)
        .bind(format!("{user_id}@example.invalid"))
        .execute(&db.pool)
        .await
        .expect("insert test user");
        {
            let input = |state: &str| VendorAvailabilityInput {
                user_id: user_id.clone(),
                vendor_id: vendor_id.clone(),
                wedding_plan_id: "plan-test".to_string(),
                state: state.to_string(),
                date_from: Some("2027-03-20".to_string()),
                date_to: None,
                source: "user".to_string(),
                source_ref: None,
                confidence: Some(0.8),
                valid_until: None,
                notes: None,
            };
            db.record_wedding_vendor_availability(&input("enquiry_sent"))
                .await
                .expect("first");
            db.record_wedding_vendor_availability(&input("confirmed_available"))
                .await
                .expect("second");
            let latest = db
                .latest_wedding_vendor_availability(&user_id, "plan-test", &[vendor_id.clone()])
                .await
                .expect("latest");
            assert_eq!(latest[&vendor_id].state, "confirmed_available");
            assert_eq!(latest[&vendor_id].date_from.as_deref(), Some("2027-03-20"));
            let other_plan = db
                .latest_wedding_vendor_availability(&user_id, "other-plan", &[vendor_id.clone()])
                .await
                .expect("other plan");
            assert!(other_plan.is_empty());
        }

        let slug = format!("test-discovered-{}", Ulid::new());
        let record = |website: Option<&str>| WeddingVendorUpsertRecord {
            vendor_slug: slug.clone(),
            vendor_name: "Discovered Test".to_string(),
            category: "venue".to_string(),
            service_area: "Sydney".to_string(),
            address: None,
            website_url: website.map(str::to_string),
            contact_phone: None,
            contact_email: None,
            source_url: None,
            source_label: None,
            source_checked_at: None,
            status: "hidden".to_string(),
            notes: None,
            evidence: serde_json::json!({}),
            caveat_labels: vec![],
            photos: vec![],
        };
        let operator = user_id.clone();
        {
            let first = db
                .upsert_discovered_wedding_vendor(
                    &record(Some("https://first.example/")),
                    &operator,
                    false,
                )
                .await
                .expect("insert");
            let kept = db
                .upsert_discovered_wedding_vendor(
                    &record(Some("https://second.example/")),
                    &operator,
                    false,
                )
                .await
                .expect("keep");
            assert_eq!(first, kept);
            let replaced = db
                .upsert_discovered_wedding_vendor(
                    &record(Some("https://official.example/")),
                    &operator,
                    true,
                )
                .await
                .expect("replace");
            assert_eq!(first, replaced);
            let website: Option<String> =
                sqlx::query_scalar("SELECT website_url FROM wedding_vendors WHERE vendor_id = $1")
                    .bind(&first)
                    .fetch_one(&db.pool)
                    .await
                    .expect("website");
            assert_eq!(website.as_deref(), Some("https://official.example/"));
            sqlx::query("DELETE FROM wedding_vendors WHERE vendor_id = $1")
                .bind(&first)
                .execute(&db.pool)
                .await
                .expect("cleanup discovered");
        }
        sqlx::query("DELETE FROM wedding_vendors WHERE vendor_id = $1")
            .bind(&vendor_id)
            .execute(&db.pool)
            .await
            .expect("cleanup");
        sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(&user_id)
            .execute(&db.pool)
            .await
            .expect("cleanup user");
    }

    #[tokio::test]
    async fn local_postgres_discovered_vendor_merges_duplicates_and_fills_gaps() {
        let Some((db, vendor_id)) = smoke_db().await else {
            return;
        };
        let user_id = format!("test-user-{}", Ulid::new());
        sqlx::query(
            "INSERT INTO users (id, email, auth_provider, display_name) VALUES ($1, $2, 'password', 'Merge Test')",
        )
        .bind(&user_id)
        .bind(format!("{user_id}@example.invalid"))
        .execute(&db.pool)
        .await
        .expect("insert test user");
        let incoming = |slug: &str, name: &str, phone: Option<&str>| WeddingVendorUpsertRecord {
            vendor_slug: slug.to_string(),
            vendor_name: name.to_string(),
            category: "venue".to_string(),
            service_area: "Sydney".to_string(),
            address: Some("1 Test Street".to_string()),
            website_url: None,
            contact_phone: phone.map(str::to_string),
            contact_email: None,
            source_url: None,
            source_label: None,
            source_checked_at: None,
            status: "hidden".to_string(),
            notes: None,
            evidence: serde_json::json!({}),
            caveat_labels: vec![],
            photos: vec![crate::db::WeddingVendorPhotoUpsertRecord {
                slot: 1,
                photo_url: "https://cdn.example/merge.jpg".to_string(),
                alt_text: None,
                source_label: None,
                source_url: None,
                retrieved_at: None,
                licence_metadata: serde_json::json!({}),
            }],
        };
        let merged = db
            .upsert_discovered_wedding_vendor(
                &incoming(
                    "evidence-test-sydney",
                    "Evidence  Test!",
                    Some("02 9000 1234"),
                ),
                &user_id,
                false,
            )
            .await
            .expect("merge by name");
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM wedding_vendors WHERE vendor_id = $1 OR vendor_slug = 'evidence-test-sydney'",
        )
        .bind(&vendor_id)
        .fetch_one(&db.pool)
        .await
        .expect("count");
        assert_eq!(
            merged, vendor_id,
            "same name must resolve to the existing vendor"
        );
        assert_eq!(count, 1, "no duplicate row may be created");
        let photos: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM wedding_vendor_photos WHERE vendor_id = $1")
                .bind(&vendor_id)
                .fetch_one(&db.pool)
                .await
                .expect("photos");
        assert_eq!(photos, 1, "missing photo is backfilled");
        let again = db
            .upsert_discovered_wedding_vendor(
                &incoming(
                    "other-slug",
                    "Totally Different Name",
                    Some("(02) 9000-1234"),
                ),
                &user_id,
                false,
            )
            .await
            .expect("merge by phone");
        assert_eq!(
            again, vendor_id,
            "same phone must resolve to the existing vendor"
        );
        sqlx::query("DELETE FROM wedding_vendors WHERE vendor_id = $1")
            .bind(&vendor_id)
            .execute(&db.pool)
            .await
            .expect("cleanup");
        sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(&user_id)
            .execute(&db.pool)
            .await
            .expect("cleanup user");
    }
}
