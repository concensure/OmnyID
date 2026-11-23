use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

const GENERIC_REGISTRY_JSON: &str = include_str!("../../schemas/quotation/generic.v1.json");
const VENUE_REGISTRY_JSON: &str = include_str!("../../schemas/quotation/venue.v1.json");

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RegistryField {
    pub key: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    pub value_type: String,
    #[serde(default)]
    pub allowed_units: Vec<String>,
    #[serde(default)]
    pub allowed_bases: Vec<String>,
    pub comparison_group: String,
    pub applicability: String,
    pub materiality: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub formula_id: Option<String>,
    pub clarification_template: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CategoryRegistry {
    pub registry_id: String,
    pub version: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extends: Option<String>,
    pub fields: Vec<RegistryField>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResolvedCategoryRegistry {
    pub registry_id: String,
    pub version: String,
    pub fingerprint: String,
    pub fields: BTreeMap<String, RegistryField>,
    pub aliases: BTreeMap<String, String>,
}

fn parse_registry(source: &str) -> Result<CategoryRegistry, String> {
    serde_json::from_str(source).map_err(|error| format!("invalid embedded registry: {error}"))
}

fn validate_field(field: &RegistryField) -> Result<(), String> {
    if field.key.trim().is_empty()
        || field.value_type.trim().is_empty()
        || field.comparison_group.trim().is_empty()
        || field.applicability.trim().is_empty()
        || field.materiality.trim().is_empty()
        || field.clarification_template.trim().is_empty()
    {
        return Err(format!("registry field {} is incomplete", field.key));
    }
    if !matches!(
        field.value_type.as_str(),
        "money" | "integer" | "decimal" | "boolean" | "enum" | "text" | "date" | "duration"
    ) {
        return Err(format!("field {} has unsupported value_type", field.key));
    }
    for basis in &field.allowed_bases {
        if !matches!(
            basis.as_str(),
            "fixed" | "per_person" | "per_item" | "per_hour" | "percentage" | "minimum_spend"
        ) {
            return Err(format!("field {} has unsupported basis {basis}", field.key));
        }
    }
    Ok(())
}

pub fn resolve_category_registry(registry_id: &str) -> Result<ResolvedCategoryRegistry, String> {
    let generic = parse_registry(GENERIC_REGISTRY_JSON)?;
    let selected = match registry_id {
        "generic" | "generic.v1" => generic.clone(),
        "venue" | "venue.v1" => parse_registry(VENUE_REGISTRY_JSON)?,
        other => return Err(format!("unknown quotation category registry {other}")),
    };
    let mut field_list = if selected.extends.as_deref() == Some("generic.v1") {
        generic.fields
    } else {
        Vec::new()
    };
    field_list.extend(selected.fields.clone());

    let mut fields = BTreeMap::new();
    let mut aliases = BTreeMap::new();
    let mut all_names = BTreeSet::new();
    for field in field_list {
        validate_field(&field)?;
        if !all_names.insert(field.key.to_ascii_lowercase()) {
            return Err(format!("duplicate registry key {}", field.key));
        }
        for alias in &field.aliases {
            let normalized = alias.trim().to_ascii_lowercase();
            if normalized.is_empty() || !all_names.insert(normalized.clone()) {
                return Err(format!("duplicate or empty alias {alias}"));
            }
            aliases.insert(normalized, field.key.clone());
        }
        fields.insert(field.key.clone(), field);
    }
    let fingerprint_source =
        serde_json::to_vec(&(&selected.registry_id, &selected.version, &fields))
            .map_err(|error| error.to_string())?;
    let fingerprint = hex::encode(Sha256::digest(fingerprint_source));
    Ok(ResolvedCategoryRegistry {
        registry_id: selected.registry_id,
        version: selected.version,
        fingerprint,
        fields,
        aliases,
    })
}

impl ResolvedCategoryRegistry {
    pub fn canonical_key(&self, source_key: &str) -> Option<&str> {
        let normalized = source_key.trim().to_ascii_lowercase();
        if let Some((key, _)) = self.fields.get_key_value(&normalized) {
            return Some(key.as_str());
        }
        self.aliases.get(&normalized).map(String::as_str)
    }
}
