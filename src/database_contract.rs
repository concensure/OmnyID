//! Versioned AFP contracts for the generic Database surface.
//!
//! Database is a projection over account-scoped AFP messages. This module does
//! not persist rows or introduce a second database store; it normalizes the
//! mounted `database_record` family and the older neutral `database` family at
//! one compatibility boundary.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeMap;

pub const DATABASE_CONTRACT_VERSION: u16 = 1;
pub const LEGACY_DATABASE_ID: &str = "database:legacy";
pub const DEFAULT_DATABASE_TABLE: &str = "default";
pub const DATABASE_CONTRACT_KINDS: &[&str] = &[
    "database_record",
    "database_record_update",
    "database_schema_update",
    "database_definition",
    "database_profile",
    "database_saved_view",
    "database_archive",
    "database_projection_receipt",
];

const RESERVED_RECORD_KEYS: &[&str] = &[
    "kind",
    "contract_version",
    "database_id",
    "record_id",
    "revision",
    "base_revision",
    "table",
    "database",
    "data",
    "fields",
    "record",
    "source_refs",
    "idempotency_key",
    "operation",
    "scope",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DatabaseSourceReference {
    pub message_id: String,
    pub kind: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DatabaseScope {
    pub account_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wedding_plan_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DatabaseRecordContract {
    pub kind: String,
    pub contract_version: u16,
    pub database_id: String,
    pub record_id: String,
    pub revision: u64,
    pub table: String,
    pub data: BTreeMap<String, Value>,
    pub idempotency_key: String,
    #[serde(default)]
    pub source_refs: Vec<DatabaseSourceReference>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DatabaseRecordRevisionContract {
    pub kind: String,
    pub contract_version: u16,
    pub database_id: String,
    pub target_record_id: String,
    pub base_revision: u64,
    pub revision: u64,
    pub table: String,
    #[serde(default)]
    pub patch: BTreeMap<String, Value>,
    pub operation: DatabaseRevisionOperation,
    pub idempotency_key: String,
    #[serde(default)]
    pub source_refs: Vec<DatabaseSourceReference>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DatabaseSchemaContract {
    pub kind: String,
    pub contract_version: u16,
    pub database_id: String,
    pub table: String,
    pub column: DatabaseColumnContract,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DatabaseColumnContract {
    pub key: String,
    pub label: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DatabaseRevisionOperation {
    Upsert,
    Tombstone,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DatabaseDefinitionContract {
    pub kind: String,
    pub contract_version: u16,
    pub database_id: String,
    pub name: String,
    pub default_table: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub profile_id: Option<String>,
    pub scope: DatabaseScope,
    pub revision: u64,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DatabaseProfileContract {
    pub kind: String,
    pub contract_version: u16,
    pub profile_id: String,
    pub profile_version: u32,
    pub label: String,
    #[serde(default)]
    pub required_fields: Vec<String>,
    #[serde(default)]
    pub optional_fields: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DatabaseSavedViewContract {
    pub kind: String,
    pub contract_version: u16,
    pub database_id: String,
    pub view_id: String,
    pub name: String,
    pub revision: u64,
    #[serde(default)]
    pub columns: Vec<String>,
    #[serde(default)]
    pub sort: Vec<DatabaseSortRule>,
    #[serde(default)]
    pub filters: Vec<DatabaseFilterRule>,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DatabaseSortRule {
    pub field: String,
    pub direction: DatabaseSortDirection,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DatabaseSortDirection {
    Ascending,
    Descending,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DatabaseFilterRule {
    pub field: String,
    pub operator: DatabaseFilterOperator,
    pub value: Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DatabaseFilterOperator {
    Equals,
    NotEquals,
    Contains,
    IsEmpty,
    IsNotEmpty,
    Before,
    After,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DatabaseArchiveContract {
    pub kind: String,
    pub contract_version: u16,
    pub database_id: String,
    pub archived: bool,
    pub revision: u64,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DatabaseProjectionReceiptContract {
    pub kind: String,
    pub contract_version: u16,
    pub database_id: String,
    pub projector_id: String,
    pub projector_version: u32,
    pub source_cursor: String,
    pub source_fingerprint: String,
    #[serde(default)]
    pub affected_record_ids: Vec<String>,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum NormalizedDatabaseEvent {
    Record(DatabaseRecordContract),
    Revision(DatabaseRecordRevisionContract),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DatabaseContractError {
    NotDatabaseMessage,
    Malformed(&'static str),
    UnsupportedVersion(u64),
    CrossAccountReference,
}

#[derive(Debug, Clone, Copy)]
pub struct DatabaseMessageContext<'a> {
    pub message_id: &'a str,
    pub message_type: &'a str,
    pub expected_account_id: Option<&'a str>,
}

pub fn normalize_database_message(
    context: DatabaseMessageContext<'_>,
    content: &Value,
    metadata: Option<&Value>,
) -> Result<NormalizedDatabaseEvent, DatabaseContractError> {
    let object = content
        .as_object()
        .ok_or(DatabaseContractError::Malformed("content"))?;
    validate_account_scope(object, metadata, context.expected_account_id)?;
    validate_contract_version(object)?;

    let kind = string_field(object, "kind").unwrap_or(context.message_type);
    if kind == "database_record_update" {
        return normalize_revision(context, object, metadata);
    }
    if context.message_type != "database"
        && context.message_type != "database_record"
        && kind != "database_record"
    {
        return Err(DatabaseContractError::NotDatabaseMessage);
    }
    normalize_record(context, object, metadata)
}

pub fn validate_definition_scope(
    definition: &DatabaseDefinitionContract,
    expected_account_id: &str,
) -> Result<(), DatabaseContractError> {
    if definition.kind != "database_definition"
        || definition.contract_version != DATABASE_CONTRACT_VERSION
    {
        return Err(DatabaseContractError::Malformed("definition_contract"));
    }
    validate_common_identifier(&definition.database_id, "database_id")?;
    validate_common_identifier(&definition.scope.account_id, "account_id")?;
    if definition.scope.account_id != expected_account_id {
        return Err(DatabaseContractError::CrossAccountReference);
    }
    if definition.name.trim().is_empty() || definition.name.chars().count() > 120 {
        return Err(DatabaseContractError::Malformed("database_name"));
    }
    validate_table_name(&definition.default_table)?;
    if let Some(profile_id) = definition.profile_id.as_deref() {
        validate_common_identifier(profile_id, "profile_id")?;
    }
    if let Some(plan_id) = definition.scope.wedding_plan_id.as_deref() {
        validate_common_identifier(plan_id, "wedding_plan_id")?;
    }
    validate_revision(definition.revision)?;
    validate_idempotency_key(&definition.idempotency_key)
}

pub fn validate_saved_view(view: &DatabaseSavedViewContract) -> Result<(), DatabaseContractError> {
    if view.kind != "database_saved_view" || view.contract_version != DATABASE_CONTRACT_VERSION {
        return Err(DatabaseContractError::Malformed("saved_view_contract"));
    }
    validate_common_identifier(&view.database_id, "database_id")?;
    validate_common_identifier(&view.view_id, "view_id")?;
    validate_revision(view.revision)?;
    validate_idempotency_key(&view.idempotency_key)?;
    if view.name.trim().is_empty() || view.name.chars().count() > 120 {
        return Err(DatabaseContractError::Malformed("view_name"));
    }
    if view.columns.len() > 100 || view.sort.len() > 12 || view.filters.len() > 24 {
        return Err(DatabaseContractError::Malformed("view_bounds"));
    }
    for field in view
        .columns
        .iter()
        .chain(view.sort.iter().map(|rule| &rule.field))
        .chain(view.filters.iter().map(|rule| &rule.field))
    {
        validate_field_name(field)?;
    }
    Ok(())
}

fn normalize_record(
    context: DatabaseMessageContext<'_>,
    object: &Map<String, Value>,
    metadata: Option<&Value>,
) -> Result<NormalizedDatabaseEvent, DatabaseContractError> {
    let canonical = object.contains_key("contract_version");
    if canonical
        && (string_field(object, "database_id").is_none()
            || string_field(object, "record_id").is_none()
            || integer_field(object, "revision").is_none()
            || string_field(object, "idempotency_key").is_none())
    {
        return Err(DatabaseContractError::Malformed("canonical_record"));
    }
    let database_id = database_id(object, metadata);
    let record_id = string_field(object, "record_id")
        .or_else(|| metadata_string(metadata, "record_id"))
        .unwrap_or(context.message_id)
        .to_string();
    let revision = integer_field(object, "revision").unwrap_or(1);
    let table = table_name(object, metadata);
    let data = record_data(object)?;
    let source_refs = source_references(object)?;
    let idempotency_key = string_field(object, "idempotency_key")
        .map(str::to_string)
        .unwrap_or_else(|| {
            format!("database:{database_id}:record:{record_id}:revision:{revision}")
        });

    validate_common_identifier(&database_id, "database_id")?;
    validate_common_identifier(&record_id, "record_id")?;
    validate_revision(revision)?;
    validate_table_name(&table)?;
    validate_idempotency_key(&idempotency_key)?;
    validate_source_references(&source_refs)?;

    Ok(NormalizedDatabaseEvent::Record(DatabaseRecordContract {
        kind: "database_record".to_string(),
        contract_version: DATABASE_CONTRACT_VERSION,
        database_id,
        record_id,
        revision,
        table,
        data,
        idempotency_key,
        source_refs,
    }))
}

fn normalize_revision(
    context: DatabaseMessageContext<'_>,
    object: &Map<String, Value>,
    metadata: Option<&Value>,
) -> Result<NormalizedDatabaseEvent, DatabaseContractError> {
    let canonical = object.contains_key("contract_version");
    if canonical
        && (string_field(object, "database_id").is_none()
            || integer_field(object, "base_revision").is_none()
            || integer_field(object, "revision").is_none()
            || string_field(object, "idempotency_key").is_none())
    {
        return Err(DatabaseContractError::Malformed("canonical_revision"));
    }
    let database_id = database_id(object, metadata);
    let target_record_id = string_field(object, "target_record_id")
        .ok_or(DatabaseContractError::Malformed("target_record_id"))?
        .to_string();
    let base_revision = integer_field(object, "base_revision").unwrap_or(0);
    let revision = integer_field(object, "revision").unwrap_or(0);
    let table = table_name(object, metadata);
    let operation = match string_field(object, "operation").unwrap_or("upsert") {
        "upsert" => DatabaseRevisionOperation::Upsert,
        "tombstone" => DatabaseRevisionOperation::Tombstone,
        _ => return Err(DatabaseContractError::Malformed("operation")),
    };
    let patch: BTreeMap<String, Value> = object
        .get("patch")
        .or_else(|| object.get("data"))
        .and_then(Value::as_object)
        .map(|value| value.clone().into_iter().collect())
        .unwrap_or_default();
    let source_refs = source_references(object)?;
    let idempotency_key = string_field(object, "idempotency_key")
        .map(str::to_string)
        .unwrap_or_else(|| format!("legacy-update:{}", context.message_id));

    validate_common_identifier(&database_id, "database_id")?;
    validate_common_identifier(&target_record_id, "target_record_id")?;
    validate_table_name(&table)?;
    validate_idempotency_key(&idempotency_key)?;
    validate_source_references(&source_refs)?;
    if revision > 0 && (base_revision == 0 || revision != base_revision + 1) {
        return Err(DatabaseContractError::Malformed("revision_sequence"));
    }
    if operation == DatabaseRevisionOperation::Upsert && patch.is_empty() {
        return Err(DatabaseContractError::Malformed("patch"));
    }

    Ok(NormalizedDatabaseEvent::Revision(
        DatabaseRecordRevisionContract {
            kind: "database_record_update".to_string(),
            contract_version: DATABASE_CONTRACT_VERSION,
            database_id,
            target_record_id,
            base_revision,
            revision,
            table,
            patch,
            operation,
            idempotency_key,
            source_refs,
        },
    ))
}

fn validate_contract_version(object: &Map<String, Value>) -> Result<(), DatabaseContractError> {
    let Some(raw_version) = object.get("contract_version") else {
        return Ok(());
    };
    let version = raw_version
        .as_u64()
        .ok_or(DatabaseContractError::Malformed("contract_version"))?;
    if version != u64::from(DATABASE_CONTRACT_VERSION) {
        return Err(DatabaseContractError::UnsupportedVersion(version));
    }
    Ok(())
}

fn validate_account_scope(
    object: &Map<String, Value>,
    metadata: Option<&Value>,
    expected_account_id: Option<&str>,
) -> Result<(), DatabaseContractError> {
    let Some(expected) = expected_account_id else {
        return Ok(());
    };
    let declared = object
        .get("scope")
        .and_then(Value::as_object)
        .and_then(|scope| string_field(scope, "account_id"))
        .or_else(|| metadata_string(metadata, "account_id"));
    if declared.is_some_and(|value| value != expected) {
        return Err(DatabaseContractError::CrossAccountReference);
    }
    Ok(())
}

fn database_id(object: &Map<String, Value>, metadata: Option<&Value>) -> String {
    string_field(object, "database_id")
        .or_else(|| metadata_string(metadata, "database_id"))
        .unwrap_or(LEGACY_DATABASE_ID)
        .to_string()
}

fn table_name(object: &Map<String, Value>, metadata: Option<&Value>) -> String {
    string_field(object, "table")
        .or_else(|| string_field(object, "database"))
        .or_else(|| metadata_string(metadata, "database_table"))
        .unwrap_or(DEFAULT_DATABASE_TABLE)
        .to_string()
}

fn record_data(
    object: &Map<String, Value>,
) -> Result<BTreeMap<String, Value>, DatabaseContractError> {
    if let Some(candidate) = object
        .get("data")
        .or_else(|| object.get("fields"))
        .or_else(|| object.get("record"))
    {
        let value = candidate
            .as_object()
            .ok_or(DatabaseContractError::Malformed("data"))?;
        return Ok(value.clone().into_iter().collect());
    }
    Ok(object
        .iter()
        .filter(|(key, _)| !RESERVED_RECORD_KEYS.contains(&key.as_str()))
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect())
}

fn source_references(
    object: &Map<String, Value>,
) -> Result<Vec<DatabaseSourceReference>, DatabaseContractError> {
    let Some(value) = object.get("source_refs") else {
        return Ok(vec![]);
    };
    serde_json::from_value(value.clone())
        .map_err(|_| DatabaseContractError::Malformed("source_refs"))
}

fn validate_source_references(
    references: &[DatabaseSourceReference],
) -> Result<(), DatabaseContractError> {
    if references.len() > 64 {
        return Err(DatabaseContractError::Malformed("source_refs"));
    }
    for reference in references {
        validate_common_identifier(&reference.message_id, "source_message_id")?;
        validate_common_identifier(&reference.kind, "source_kind")?;
    }
    Ok(())
}

fn validate_common_identifier(
    value: &str,
    field: &'static str,
) -> Result<(), DatabaseContractError> {
    let value = value.trim();
    if value.is_empty()
        || value.chars().count() > 160
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "-_:./".contains(character))
    {
        return Err(DatabaseContractError::Malformed(field));
    }
    Ok(())
}

fn validate_field_name(value: &str) -> Result<(), DatabaseContractError> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 120 || value.chars().any(char::is_control) {
        return Err(DatabaseContractError::Malformed("field"));
    }
    Ok(())
}

fn validate_table_name(value: &str) -> Result<(), DatabaseContractError> {
    if value.trim().is_empty() || value.chars().count() > 120 || value.chars().any(char::is_control)
    {
        return Err(DatabaseContractError::Malformed("table"));
    }
    Ok(())
}

fn validate_revision(revision: u64) -> Result<(), DatabaseContractError> {
    if revision == 0 {
        return Err(DatabaseContractError::Malformed("revision"));
    }
    Ok(())
}

fn validate_idempotency_key(value: &str) -> Result<(), DatabaseContractError> {
    let value = value.trim();
    if value.len() < 8 || value.len() > 240 || value.chars().any(char::is_control) {
        return Err(DatabaseContractError::Malformed("idempotency_key"));
    }
    Ok(())
}

fn string_field<'a>(object: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
    object
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn metadata_string<'a>(metadata: Option<&'a Value>, key: &str) -> Option<&'a str> {
    metadata
        .and_then(Value::as_object)
        .and_then(|object| string_field(object, key))
}

fn integer_field(object: &Map<String, Value>, key: &str) -> Option<u64> {
    object.get(key).and_then(Value::as_u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn context<'a>(message_id: &'a str, message_type: &'a str) -> DatabaseMessageContext<'a> {
        DatabaseMessageContext {
            message_id,
            message_type,
            expected_account_id: Some("account-a"),
        }
    }

    #[test]
    fn mounted_and_neutral_shapes_normalize_to_the_same_record_contract() {
        let mounted = normalize_database_message(
            context("message-mounted", "database_record"),
            &serde_json::json!({
                "kind": "database_record",
                "database_id": "db-clients",
                "record_id": "record-1",
                "table": "clients",
                "data": {"name": "Acme"}
            }),
            Some(&serde_json::json!({"account_id": "account-a"})),
        )
        .expect("mounted record");
        let neutral = normalize_database_message(
            context("message-neutral", "database"),
            &serde_json::json!({"name": "Acme"}),
            Some(&serde_json::json!({
                "account_id": "account-a",
                "database_id": "db-clients",
                "record_id": "record-1",
                "database_table": "clients"
            })),
        )
        .expect("neutral record");

        assert_eq!(mounted, neutral);
    }

    #[test]
    fn undeclared_legacy_records_get_stable_message_identity_and_legacy_database() {
        let event = normalize_database_message(
            context("message-1", "database"),
            &serde_json::json!({"name": "Acme", "status": "active"}),
            None,
        )
        .expect("legacy record");
        let NormalizedDatabaseEvent::Record(record) = event else {
            panic!("expected record")
        };
        assert_eq!(record.database_id, LEGACY_DATABASE_ID);
        assert_eq!(record.record_id, "message-1");
        assert_eq!(record.revision, 1);
        assert_eq!(record.data["name"], "Acme");
    }

    #[test]
    fn cross_account_scope_and_bad_source_references_fail_closed() {
        let cross_account = normalize_database_message(
            context("message-1", "database_record"),
            &serde_json::json!({
                "kind": "database_record",
                "scope": {"account_id": "account-b"},
                "data": {"name": "Acme"}
            }),
            None,
        );
        assert_eq!(
            cross_account,
            Err(DatabaseContractError::CrossAccountReference)
        );

        let malformed = normalize_database_message(
            context("message-1", "database_record"),
            &serde_json::json!({
                "kind": "database_record",
                "data": {"name": "Acme"},
                "source_refs": [{"message_id": "bad id", "kind": "task"}]
            }),
            None,
        );
        assert_eq!(
            malformed,
            Err(DatabaseContractError::Malformed("source_message_id"))
        );
    }

    #[test]
    fn revisions_require_monotonic_version_metadata_when_canonical() {
        let event = normalize_database_message(
            context("revision-1", "note:ledger_update"),
            &serde_json::json!({
                "kind": "database_record_update",
                "contract_version": 1,
                "database_id": "db-clients",
                "target_record_id": "record-1",
                "base_revision": 1,
                "revision": 2,
                "table": "clients",
                "patch": {"status": "active"},
                "idempotency_key": "record-1-revision-2"
            }),
            None,
        )
        .expect("revision");
        let NormalizedDatabaseEvent::Revision(revision) = event else {
            panic!("expected revision")
        };
        assert_eq!(revision.base_revision, 1);
        assert_eq!(revision.revision, 2);

        let conflict = normalize_database_message(
            context("revision-2", "note:ledger_update"),
            &serde_json::json!({
                "kind": "database_record_update",
                "base_revision": 1,
                "revision": 4,
                "target_record_id": "record-1",
                "patch": {"status": "wrong"}
            }),
            None,
        );
        assert_eq!(
            conflict,
            Err(DatabaseContractError::Malformed("revision_sequence"))
        );
    }

    #[test]
    fn definition_and_saved_view_validators_bound_scope_and_query_shape() {
        let definition = DatabaseDefinitionContract {
            kind: "database_definition".to_string(),
            contract_version: DATABASE_CONTRACT_VERSION,
            database_id: "db-clients".to_string(),
            name: "Clients".to_string(),
            default_table: "clients".to_string(),
            profile_id: None,
            scope: DatabaseScope {
                account_id: "account-a".to_string(),
                wedding_plan_id: None,
            },
            revision: 1,
            idempotency_key: "definition-db-clients-1".to_string(),
        };
        assert_eq!(validate_definition_scope(&definition, "account-a"), Ok(()));
        assert_eq!(
            validate_definition_scope(&definition, "account-b"),
            Err(DatabaseContractError::CrossAccountReference)
        );

        let view = DatabaseSavedViewContract {
            kind: "database_saved_view".to_string(),
            contract_version: DATABASE_CONTRACT_VERSION,
            database_id: "db-clients".to_string(),
            view_id: "view-active".to_string(),
            name: "Active".to_string(),
            revision: 1,
            columns: vec!["name".to_string()],
            sort: vec![],
            filters: vec![],
            idempotency_key: "view-active-revision-1".to_string(),
        };
        assert_eq!(validate_saved_view(&view), Ok(()));

        let mut invalid_view = view;
        invalid_view.filters = (0..25)
            .map(|index| DatabaseFilterRule {
                field: format!("field_{index}"),
                operator: DatabaseFilterOperator::Equals,
                value: Value::Null,
            })
            .collect();
        assert_eq!(
            validate_saved_view(&invalid_view),
            Err(DatabaseContractError::Malformed("view_bounds"))
        );
    }

    #[test]
    fn registry_names_every_versioned_database_contract_and_canonical_shapes_fail_closed() {
        assert_eq!(DATABASE_CONTRACT_KINDS.len(), 8);
        assert!(DATABASE_CONTRACT_KINDS.contains(&"database_projection_receipt"));

        let incomplete = normalize_database_message(
            context("message-1", "database_record"),
            &serde_json::json!({
                "kind": "database_record",
                "contract_version": 1,
                "data": {"name": "Acme"}
            }),
            None,
        );
        assert_eq!(
            incomplete,
            Err(DatabaseContractError::Malformed("canonical_record"))
        );
    }
}
