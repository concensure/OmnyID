// @locs-version: 2.0
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WeddingVendorPhotoRecord {
    pub photo_id: String,
    pub vendor_id: String,
    pub slot: i32,
    pub photo_url: String,
    pub alt_text: Option<String>,
    pub source_label: Option<String>,
    pub source_url: Option<String>,
    pub retrieved_at: Option<String>,
    pub licence_metadata: Value,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WeddingVendorRecord {
    pub vendor_id: String,
    pub vendor_slug: String,
    pub vendor_name: String,
    pub category: String,
    pub service_area: String,
    pub address: Option<String>,
    pub website_url: Option<String>,
    pub contact_phone: Option<String>,
    pub contact_email: Option<String>,
    pub source_url: Option<String>,
    pub source_label: Option<String>,
    pub source_checked_at: Option<String>,
    pub status: String,
    pub notes: Option<String>,
    pub evidence: Value,
    pub caveat_labels: Vec<String>,
    pub created_by_user_id: Option<String>,
    pub updated_by_user_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub photos: Vec<WeddingVendorPhotoRecord>,
    pub user_contact: Option<WeddingVendorUserContactRecord>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WeddingVendorUpsertRecord {
    pub vendor_slug: String,
    pub vendor_name: String,
    pub category: String,
    pub service_area: String,
    pub address: Option<String>,
    pub website_url: Option<String>,
    pub contact_phone: Option<String>,
    pub contact_email: Option<String>,
    pub source_url: Option<String>,
    pub source_label: Option<String>,
    pub source_checked_at: Option<String>,
    pub status: String,
    pub notes: Option<String>,
    pub evidence: Value,
    pub caveat_labels: Vec<String>,
    pub photos: Vec<WeddingVendorPhotoUpsertRecord>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WeddingVendorPhotoUpsertRecord {
    pub slot: i32,
    pub photo_url: String,
    pub alt_text: Option<String>,
    pub source_label: Option<String>,
    pub source_url: Option<String>,
    pub retrieved_at: Option<String>,
    pub licence_metadata: Value,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WeddingVendorUserContactRecord {
    pub contact_id: String,
    pub user_id: String,
    pub vendor_id: String,
    pub contact_method: String,
    pub last_contact_at: String,
    pub response_received_at: Option<String>,
    pub follow_up_due_at: Option<String>,
    pub thread_id: Option<String>,
    pub receipt_ref: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WeddingVendorReplyMatch {
    pub vendor_id: String,
    pub vendor_label: String,
    pub thread_id: Option<String>,
    pub receipt_ref: Option<String>,
}
