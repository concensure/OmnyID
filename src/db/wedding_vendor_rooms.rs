// @locs-version: 2.0
use super::Db;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::Row;
use std::collections::HashMap;
use ulid::Ulid;

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

#[derive(Clone, Debug, Deserialize)]
pub struct WeddingVendorRoomExternalPhoto {
    pub slot: i32,
    pub photo_url: String,
    pub alt_text: Option<String>,
    pub source_label: Option<String>,
    pub source_url: Option<String>,
}

#[derive(Clone, Debug)]
pub struct WeddingVendorRoomUpsertRecord {
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
    /// None leaves existing photos untouched; Some replaces only the listed slots.
    pub external_photos: Option<Vec<WeddingVendorRoomExternalPhoto>>,
}

impl Db {
    /// Creates or updates a room keyed by (vendor_id, room_name) and returns its room_id.
    pub async fn upsert_wedding_vendor_room(
        &self,
        vendor_id: &str,
        input: &WeddingVendorRoomUpsertRecord,
    ) -> Result<String, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let row = sqlx::query(
            r#"
            INSERT INTO wedding_vendor_rooms (
                room_id, vendor_id, room_name, sort_order, description, capacity_seated,
                capacity_standing, pricing_label, price_from_cents, minimum_spend_cents,
                minimum_spend_note, inclusions, availability_note, source_url, source_label,
                source_checked_at, evidence
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                    $16::date, $17)
            ON CONFLICT (vendor_id, room_name) DO UPDATE SET
                sort_order = EXCLUDED.sort_order,
                description = EXCLUDED.description,
                capacity_seated = EXCLUDED.capacity_seated,
                capacity_standing = EXCLUDED.capacity_standing,
                pricing_label = EXCLUDED.pricing_label,
                price_from_cents = EXCLUDED.price_from_cents,
                minimum_spend_cents = EXCLUDED.minimum_spend_cents,
                minimum_spend_note = EXCLUDED.minimum_spend_note,
                inclusions = EXCLUDED.inclusions,
                availability_note = EXCLUDED.availability_note,
                source_url = EXCLUDED.source_url,
                source_label = EXCLUDED.source_label,
                source_checked_at = EXCLUDED.source_checked_at,
                evidence = EXCLUDED.evidence,
                updated_at = NOW()
            RETURNING room_id
            "#,
        )
        .bind(Ulid::new().to_string())
        .bind(vendor_id)
        .bind(&input.room_name)
        .bind(input.sort_order)
        .bind(&input.description)
        .bind(input.capacity_seated)
        .bind(input.capacity_standing)
        .bind(&input.pricing_label)
        .bind(input.price_from_cents)
        .bind(input.minimum_spend_cents)
        .bind(&input.minimum_spend_note)
        .bind(&input.inclusions)
        .bind(&input.availability_note)
        .bind(&input.source_url)
        .bind(&input.source_label)
        .bind(&input.source_checked_at)
        .bind(&input.evidence)
        .fetch_one(&mut *tx)
        .await?;
        let room_id: String = row.get("room_id");
        for photo in input.external_photos.iter().flatten() {
            sqlx::query(
                r#"
                INSERT INTO wedding_vendor_room_photos (
                    photo_id, room_id, slot, photo_url, alt_text, source_label, source_url,
                    retrieved_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                ON CONFLICT (room_id, slot) DO UPDATE SET
                    storage_bucket = NULL,
                    storage_key = NULL,
                    content_type = NULL,
                    photo_url = EXCLUDED.photo_url,
                    alt_text = EXCLUDED.alt_text,
                    source_label = EXCLUDED.source_label,
                    source_url = EXCLUDED.source_url,
                    retrieved_at = NOW()
                "#,
            )
            .bind(Ulid::new().to_string())
            .bind(&room_id)
            .bind(photo.slot)
            .bind(&photo.photo_url)
            .bind(&photo.alt_text)
            .bind(&photo.source_label)
            .bind(&photo.source_url)
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        Ok(room_id)
    }

    /// Deletes a room and returns the object-store keys of its photos, or None when the room
    /// does not belong to the vendor. Callers delete the stored objects afterwards.
    pub async fn delete_wedding_vendor_room(
        &self,
        vendor_id: &str,
        room_id: &str,
    ) -> Result<Option<Vec<String>>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let keys = sqlx::query(
            r#"
            SELECT photo.storage_key
            FROM wedding_vendor_room_photos photo
            JOIN wedding_vendor_rooms room ON room.room_id = photo.room_id
            WHERE room.room_id = $1 AND room.vendor_id = $2 AND photo.storage_key IS NOT NULL
            "#,
        )
        .bind(room_id)
        .bind(vendor_id)
        .fetch_all(&mut *tx)
        .await?
        .into_iter()
        .map(|row| row.get::<String, _>("storage_key"))
        .collect::<Vec<_>>();
        let deleted =
            sqlx::query("DELETE FROM wedding_vendor_rooms WHERE room_id = $1 AND vendor_id = $2")
                .bind(room_id)
                .bind(vendor_id)
                .execute(&mut *tx)
                .await?
                .rows_affected();
        tx.commit().await?;
        Ok((deleted > 0).then_some(keys))
    }

    /// Records an uploaded object-store photo for a room slot. Returns None when the room does
    /// not belong to the vendor, otherwise the storage key it replaced (if any) so the caller
    /// can remove the superseded object.
    pub async fn set_wedding_vendor_room_stored_photo(
        &self,
        vendor_id: &str,
        room_id: &str,
        slot: i32,
        storage_bucket: &str,
        storage_key: &str,
        alt_text: Option<&str>,
    ) -> Result<Option<Option<String>>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let owned = sqlx::query(
            "SELECT 1 FROM wedding_vendor_rooms WHERE room_id = $1 AND vendor_id = $2 FOR UPDATE",
        )
        .bind(room_id)
        .bind(vendor_id)
        .fetch_optional(&mut *tx)
        .await?
        .is_some();
        if !owned {
            return Ok(None);
        }
        let previous = sqlx::query(
            "SELECT storage_key FROM wedding_vendor_room_photos WHERE room_id = $1 AND slot = $2",
        )
        .bind(room_id)
        .bind(slot)
        .fetch_optional(&mut *tx)
        .await?
        .and_then(|row| row.get::<Option<String>, _>("storage_key"));
        sqlx::query(
            r#"
            INSERT INTO wedding_vendor_room_photos (
                photo_id, room_id, slot, storage_bucket, storage_key, content_type, alt_text,
                retrieved_at
            )
            VALUES ($1, $2, $3, $4, $5, 'image/webp', $6, NOW())
            ON CONFLICT (room_id, slot) DO UPDATE SET
                storage_bucket = EXCLUDED.storage_bucket,
                storage_key = EXCLUDED.storage_key,
                content_type = EXCLUDED.content_type,
                photo_url = NULL,
                alt_text = EXCLUDED.alt_text,
                retrieved_at = NOW()
            "#,
        )
        .bind(Ulid::new().to_string())
        .bind(room_id)
        .bind(slot)
        .bind(storage_bucket)
        .bind(storage_key)
        .bind(alt_text)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(Some(previous))
    }

    /// Object-store key for a room photo, only while its vendor is active.
    pub async fn wedding_vendor_room_photo_storage_key(
        &self,
        room_id: &str,
        slot: i32,
    ) -> Result<Option<String>, sqlx::Error> {
        Ok(sqlx::query(
            r#"
            SELECT photo.storage_key
            FROM wedding_vendor_room_photos photo
            JOIN wedding_vendor_rooms room ON room.room_id = photo.room_id
            JOIN wedding_vendors vendor ON vendor.vendor_id = room.vendor_id
            WHERE photo.room_id = $1 AND photo.slot = $2 AND vendor.status = 'active'
            "#,
        )
        .bind(room_id)
        .bind(slot)
        .fetch_optional(&self.pool)
        .await?
        .and_then(|row| row.get::<Option<String>, _>("storage_key")))
    }

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

#[cfg(test)]
mod tests {
    use super::*;

    fn room(name: &str, price: Option<i64>) -> WeddingVendorRoomUpsertRecord {
        WeddingVendorRoomUpsertRecord {
            room_name: name.to_string(),
            sort_order: 1,
            description: None,
            capacity_seated: Some(80),
            capacity_standing: None,
            pricing_label: Some("From $5,000".to_string()),
            price_from_cents: price,
            minimum_spend_cents: None,
            minimum_spend_note: None,
            inclusions: vec!["Tables".to_string()],
            availability_note: None,
            source_url: None,
            source_label: None,
            source_checked_at: Some("2026-10-09".to_string()),
            evidence: serde_json::json!({}),
            external_photos: Some(vec![WeddingVendorRoomExternalPhoto {
                slot: 1,
                photo_url: "https://cdn.example/room.jpg".to_string(),
                alt_text: None,
                source_label: None,
                source_url: None,
            }]),
        }
    }

    #[tokio::test]
    async fn local_postgres_room_upsert_photo_and_delete_round_trip() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }
        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
        let db = Db::new(&database_url)
            .await
            .expect("connect local postgres");
        let vendor_id = format!("test-rooms-{}", Ulid::new());
        sqlx::query(
            "INSERT INTO wedding_vendors (vendor_id, vendor_slug, vendor_name, category, service_area) VALUES ($1, $1, 'Rooms Test', 'venue', 'Sydney')",
        )
        .bind(&vendor_id)
        .execute(&db.pool)
        .await
        .expect("insert vendor");

        let room_id = db
            .upsert_wedding_vendor_room(&vendor_id, &room("Barn", Some(500_000)))
            .await
            .expect("insert room");
        let again = db
            .upsert_wedding_vendor_room(&vendor_id, &room("Barn", Some(650_000)))
            .await
            .expect("update room by name");
        assert_eq!(room_id, again, "same name must update, not duplicate");

        let rooms = db
            .list_wedding_vendor_rooms(&[vendor_id.clone()])
            .await
            .expect("list rooms");
        let barn = &rooms[&vendor_id][0];
        assert_eq!(rooms[&vendor_id].len(), 1);
        assert_eq!(barn.price_from_cents, Some(650_000));
        assert_eq!(
            barn.photos[0].photo_url.as_deref(),
            Some("https://cdn.example/room.jpg")
        );

        let replaced = db
            .set_wedding_vendor_room_stored_photo(&vendor_id, &room_id, 1, "bucket", "key-1", None)
            .await
            .expect("store photo")
            .expect("room belongs to vendor");
        assert_eq!(replaced, None, "an external photo has no object to delete");
        let replaced = db
            .set_wedding_vendor_room_stored_photo(&vendor_id, &room_id, 1, "bucket", "key-2", None)
            .await
            .expect("replace photo")
            .expect("room belongs to vendor");
        assert_eq!(replaced.as_deref(), Some("key-1"));
        assert!(
            db.set_wedding_vendor_room_stored_photo("other-vendor", &room_id, 1, "b", "k", None)
                .await
                .expect("foreign vendor")
                .is_none()
        );
        assert_eq!(
            db.wedding_vendor_room_photo_storage_key(&room_id, 1)
                .await
                .expect("lookup"),
            Some("key-2".to_string())
        );
        sqlx::query("UPDATE wedding_vendors SET status = 'hidden' WHERE vendor_id = $1")
            .bind(&vendor_id)
            .execute(&db.pool)
            .await
            .expect("hide vendor");
        assert_eq!(
            db.wedding_vendor_room_photo_storage_key(&room_id, 1)
                .await
                .expect("lookup hidden"),
            None,
            "hidden vendors must not serve photos"
        );

        assert!(
            db.delete_wedding_vendor_room("other-vendor", &room_id)
                .await
                .expect("foreign delete")
                .is_none()
        );
        let keys = db
            .delete_wedding_vendor_room(&vendor_id, &room_id)
            .await
            .expect("delete room")
            .expect("room deleted");
        assert_eq!(keys, vec!["key-2".to_string()]);

        sqlx::query("DELETE FROM wedding_vendors WHERE vendor_id = $1")
            .bind(&vendor_id)
            .execute(&db.pool)
            .await
            .expect("cleanup vendor");
    }
}
