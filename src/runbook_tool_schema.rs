//! Deliberately small, closed schema subset for exact runbook tool contracts.
//! Unsupported keywords/types are rejected, never silently ignored.
use crate::runbook_contract::Result;
use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase", deny_unknown_fields)]
enum Schema {
    Object {
        properties: BTreeMap<String, Schema>,
        required: Vec<String>,
        #[serde(rename = "additionalProperties")]
        additional_properties: bool,
    },
    Array {
        items: Box<Schema>,
        #[serde(rename = "maxItems")]
        max_items: usize,
    },
    String {
        #[serde(rename = "maxLength")]
        max_length: usize,
        #[serde(rename = "enum", default)]
        choices: Option<Vec<String>>,
    },
    Integer {
        minimum: i64,
        maximum: i64,
    },
    Boolean,
    Null,
}

/// A validated schema is immutable and contains no dispatch authority.
#[derive(Debug, Clone)]
pub struct ToolSchema(Schema);

/// Both directions are mandatory. A missing provider schema never means allow-all.
pub struct ToolContract {
    input: ToolSchema,
    output: ToolSchema,
}

impl ToolContract {
    pub fn parse(value: &Value) -> Result<Self> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Wire {
            version: u32,
            input_schema: Value,
            output_schema: Value,
        }
        bounded(value, 32768)?;
        let wire: Wire =
            serde_json::from_value(value.clone()).map_err(|_| "invalid_tool_contract")?;
        if wire.version != 1 {
            return Err("unsupported_tool_contract_version");
        }
        Ok(Self {
            input: ToolSchema::parse(&wire.input_schema)?,
            output: ToolSchema::parse(&wire.output_schema)?,
        })
    }
    pub fn validate_input(&self, input: &Value) -> Result<()> {
        self.input.validate(input)
    }
    /// Accept only the structured result channel, never text masquerading as JSON.
    /// An error or unexpected parallel payload cannot be converted into success.
    pub fn validate_result<'a>(&self, result: &'a Value) -> Result<&'a Value> {
        bounded(result, 32768)?;
        let object = result.as_object().ok_or("invalid_tool_result")?;
        if object
            .keys()
            .any(|k| !matches!(k.as_str(), "structuredContent" | "content" | "isError"))
            || object
                .get("isError")
                .is_some_and(|v| v != &Value::Bool(false))
            || object
                .get("content")
                .is_some_and(|v| v.as_array().is_none_or(|a| !a.is_empty()))
        {
            return Err("invalid_tool_result");
        }
        let output = object
            .get("structuredContent")
            .ok_or("structured_tool_result_required")?;
        self.output.validate(output)?;
        Ok(output)
    }
}

fn bounded(value: &Value, bytes: usize) -> Result<()> {
    // Check depth/nodes before serialization or recursive deserialization.
    let mut pending = vec![(value, 0)];
    let mut nodes = 0;
    let mut size = 0usize;
    while let Some((v, depth)) = pending.pop() {
        nodes += 1;
        if nodes > 2048 || depth > 20 {
            return Err("tool_value_too_complex");
        }
        match v {
            Value::Object(m) => {
                if pending.len().saturating_add(m.len()) > 2048 {
                    return Err("tool_value_too_complex");
                }
                size = size.saturating_add(m.keys().map(|s| s.len()).sum::<usize>());
                pending.extend(m.values().map(|v| (v, depth + 1)));
            }
            Value::Array(a) => {
                if pending.len().saturating_add(a.len()) > 2048 {
                    return Err("tool_value_too_complex");
                }
                pending.extend(a.iter().map(|v| (v, depth + 1)));
            }
            Value::String(s) => size = size.saturating_add(s.len()),
            _ => (),
        }
        if size > bytes {
            return Err("tool_value_too_large");
        }
    }
    if value.to_string().len() > bytes {
        return Err("tool_value_too_large");
    }
    Ok(())
}

impl ToolSchema {
    pub fn parse(value: &Value) -> Result<Self> {
        bounded(value, 16384)?;
        let schema: Schema =
            serde_json::from_value(value.clone()).map_err(|_| "unsupported_tool_schema")?;
        schema.check(0, &mut 0)?;
        if !matches!(schema, Schema::Object { .. }) {
            return Err("tool_schema_root_must_be_object");
        }
        Ok(Self(schema))
    }
    pub fn validate(&self, value: &Value) -> Result<()> {
        bounded(value, 32768)?;
        self.0.accept(value)
    }
}

impl Schema {
    fn check(&self, depth: usize, nodes: &mut usize) -> Result<()> {
        *nodes += 1;
        if depth > 8 || *nodes > 128 {
            return Err("tool_schema_too_complex");
        }
        match self {
            Self::Object {
                properties,
                required,
                additional_properties,
            } => {
                if *additional_properties
                    || properties.len() > 32
                    || required.len() > properties.len()
                    || required.iter().collect::<BTreeSet<_>>().len() != required.len()
                    || required.iter().any(|k| !properties.contains_key(k))
                    || properties
                        .keys()
                        .any(|k| k.is_empty() || k.len() > 128 || k.chars().any(char::is_control))
                {
                    return Err("invalid_closed_tool_object");
                }
                for s in properties.values() {
                    s.check(depth + 1, nodes)?;
                }
            }
            Self::Array { items, max_items } => {
                if *max_items > 64 {
                    return Err("unbounded_tool_array");
                }
                items.check(depth + 1, nodes)?;
            }
            Self::String {
                max_length,
                choices,
            } => {
                if *max_length > 8192 {
                    return Err("unbounded_tool_string");
                }
                if let Some(choices) = choices {
                    if choices.is_empty()
                        || choices.len() > 64
                        || choices.iter().collect::<BTreeSet<_>>().len() != choices.len()
                        || choices.iter().any(|s| {
                            s.chars().count() > *max_length || s.chars().any(char::is_control)
                        })
                    {
                        return Err("invalid_tool_enum");
                    }
                }
            }
            Self::Integer { minimum, maximum } if minimum > maximum => {
                return Err("invalid_tool_integer_range")
            }
            _ => (),
        }
        Ok(())
    }
    fn accept(&self, value: &Value) -> Result<()> {
        let valid = match self {
            Self::Object {
                properties,
                required,
                ..
            } => {
                let m = value.as_object().ok_or("tool_schema_mismatch")?;
                if required.iter().any(|k| !m.contains_key(k))
                    || m.keys().any(|k| !properties.contains_key(k))
                {
                    return Err("tool_schema_mismatch");
                }
                for (k, v) in m {
                    properties[k].accept(v)?;
                }
                true
            }
            Self::Array { items, max_items } => {
                let a = value.as_array().ok_or("tool_schema_mismatch")?;
                if a.len() > *max_items {
                    return Err("tool_schema_mismatch");
                }
                for v in a {
                    items.accept(v)?;
                }
                true
            }
            Self::String {
                max_length,
                choices,
            } => value.as_str().is_some_and(|s| {
                s.chars().count() <= *max_length
                    && !s.chars().any(|c| c.is_control() && c != '\n' && c != '\t')
                    && choices.as_ref().is_none_or(|a| a.iter().any(|c| c == s))
            }),
            Self::Integer { minimum, maximum } => value
                .as_i64()
                .is_some_and(|n| n >= *minimum && n <= *maximum),
            Self::Boolean => value.is_boolean(),
            Self::Null => value.is_null(),
        };
        if valid {
            Ok(())
        } else {
            Err("tool_schema_mismatch")
        }
    }
}
