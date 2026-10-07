// @locs-version: 2.0
use super::Db;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::Row;
use std::collections::HashMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WeddingVendorRoomPhotoRecord {
    pub slot: i32,
    pub storage_bucket: Option<String>,
    pub storage_key: Option<String>,
    pub photo_url: Option<String>,
    pub content_type: Option<String>,
    pub alt_text: Option<String>,
    pub source_label: Option<String>,
    pub source_url: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WeddingVendorRoomRecord {
    pub room_id: String,
    pub vendor_id: String,
    pub room_name: String,
    pub sort_order: i32,
    pub description: Option<String>,
    pub capacity_seated: Option<i32>,
    pub capacity_standing: Option<i32>,
    pub pricing_label: Option<String>,
    pub price_from_cents: Option<i64>,
    pub minimum_spend_cents: Option<i64>,
    pub minimum_spend_note: Option<String>,
    pub inclusions: Vec<String>,
    pub availability_note: Option<String>,
    pub source_url: Option<String>,
    pub source_label: Option<String>,
    pub source_checked_at: Option<String>,
    pub evidence: Value,
    pub photos: Vec<WeddingVendorRoomPhotoRecord>,
}

impl Db {
    /// Rooms for the given vendors, grouped by vendor_id and ordered by sort_order.
    pub async fn list_wedding_vendor_rooms(
        &self,
        vendor_ids: &[String],
    ) -> Result<HashMap<String, Vec<WeddingVendorRoomRecord>>, sqlx::Error> {
        let mut by_vendor: HashMap<String, Vec<WeddingVendorRoomRecord>> = HashMap::new();
        if vendor_ids.is_empty() {
            return Ok(by_vendor);
        }
        let room_rows = sqlx::query(
            r#"
            SELECT room_id, vendor_id, room_name, sort_order, description, capacity_seated,
                   capacity_standing, pricing_label, price_from_cents, minimum_spend_cents,
                   minimum_spend_note, inclusions, availability_note, source_url, source_label,
                   source_checked_at::text AS source_checked_at, evidence
            FROM wedding_vendor_rooms
            WHERE vendor_id = ANY($1)
            ORDER BY vendor_id ASC, sort_order ASC, room_name ASC
            "#,
        )
        .bind(vendor_ids)
        .fetch_all(&self.pool)
        .await?;
        let room_ids = room_rows
            .iter()
            .map(|row| row.get::<String, _>("room_id"))
            .collect::<Vec<_>>();
        let mut photos_by_room: HashMap<String, Vec<WeddingVendorRoomPhotoRecord>> = HashMap::new();
        if !room_ids.is_empty() {
            let photo_rows = sqlx::query(
                r#"
                SELECT room_id, slot, storage_bucket, storage_key, photo_url, content_type,
                       alt_text, source_label, source_url
                FROM wedding_vendor_room_photos
                WHERE room_id = ANY($1)
                ORDER BY room_id ASC, slot ASC
                "#,
            )
            .bind(&room_ids)
            .fetch_all(&self.pool)
            .await?;
            for row in photo_rows {
                photos_by_room.entry(row.get("room_id")).or_default().push(
                    WeddingVendorRoomPhotoRecord {
                        slot: row.get("slot"),
                        storage_bucket: row.get("storage_bucket"),
                        storage_key: row.get("storage_key"),
                        photo_url: row.get("photo_url"),
                        content_type: row.get("content_type"),
                        alt_text: row.get("alt_text"),
                        source_label: row.get("source_label"),
                        source_url: row.get("source_url"),
                    },
                );
            }
        }
        for row in room_rows {
            let room_id: String = row.get("room_id");
            let vendor_id: String = row.get("vendor_id");
            by_vendor
                .entry(vendor_id.clone())
                .or_default()
                .push(WeddingVendorRoomRecord {
                    photos: photos_by_room.remove(&room_id).unwrap_or_default(),
                    room_id,
                    vendor_id,
                    room_name: row.get("room_name"),
                    sort_order: row.get("sort_order"),
                    description: row.get("description"),
                    capacity_seated: row.get("capacity_seated"),
                    capacity_standing: row.get("capacity_standing"),
                    pricing_label: row.get("pricing_label"),
                    price_from_cents: row.get("price_from_cents"),
                    minimum_spend_cents: row.get("minimum_spend_cents"),
                    minimum_spend_note: row.get("minimum_spend_note"),
                    inclusions: row.get("inclusions"),
                    availability_note: row.get("availability_note"),
                    source_url: row.get("source_url"),
                    source_label: row.get("source_label"),
                    source_checked_at: row.get("source_checked_at"),
                    evidence: row.get("evidence"),
                });
        }
        Ok(by_vendor)
    }
}
