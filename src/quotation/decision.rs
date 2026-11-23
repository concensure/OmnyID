use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuotationSelection {
    pub selection_id: String,
    pub comparison_id: String,
    /// AFP message id of the exact comparison revision reviewed by the user.
    pub comparison_revision: String,
    pub quotation_id: String,
    pub quotation_version_id: String,
    pub vendor_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supersedes_selection_id: Option<String>,
    pub actor_id: String,
    pub user_authority: bool,
    pub occurred_at: String,
    pub idempotency_key: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SelectionError {
    InvalidSelection,
}

fn bounded(value: &str, max: usize) -> bool {
    let value = value.trim();
    !value.is_empty() && value.chars().count() <= max && !value.chars().any(char::is_control)
}

pub fn validate_selection(selection: &QuotationSelection) -> Result<(), SelectionError> {
    if !bounded(&selection.selection_id, 180)
        || !bounded(&selection.comparison_id, 180)
        || !bounded(&selection.comparison_revision, 180)
        || !bounded(&selection.quotation_id, 180)
        || !bounded(&selection.quotation_version_id, 180)
        || !bounded(&selection.vendor_id, 180)
        || !bounded(&selection.actor_id, 180)
        || !bounded(&selection.idempotency_key, 180)
        || selection
            .supersedes_selection_id
            .as_deref()
            .is_some_and(|value| !bounded(value, 180))
        || !selection.user_authority
        || chrono::DateTime::parse_from_rfc3339(&selection.occurred_at).is_err()
    {
        return Err(SelectionError::InvalidSelection);
    }
    Ok(())
}

pub fn selection_fingerprint(selection: &QuotationSelection) -> String {
    let bytes = serde_json::to_vec(selection).unwrap_or_default();
    hex::encode(Sha256::digest(bytes))
}
