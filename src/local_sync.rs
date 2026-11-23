use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SyncSliceName {
    InboxSummaries,
    ThreadMetadata,
    PageStructures,
    ActionStates,
    CiphertextBlobs,
    LayoutConfig,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConflictMode {
    AppendOnly,
    LastWriterWins,
    Crdt,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DeviceClass {
    Desktop,
    Mobile,
    Watch,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SyncPolicyProfile {
    Full,
    Balanced,
    Lightweight,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct SyncSliceSpec {
    pub name: SyncSliceName,
    pub includes_ciphertext: bool,
    pub local_cache_required: bool,
    pub conflict_mode: ConflictMode,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct DeviceBootstrap {
    pub device_id: String,
    pub agent_id: String,
    pub electric_project_url: String,
    pub encrypted_seed_ref: String,
    pub pglite_path: String,
}

pub fn parse_device_class(value: &str) -> Option<DeviceClass> {
    match value.trim() {
        "desktop" => Some(DeviceClass::Desktop),
        "mobile" => Some(DeviceClass::Mobile),
        "watch" => Some(DeviceClass::Watch),
        _ => None,
    }
}

pub fn default_sync_profile(device_class: &DeviceClass) -> SyncPolicyProfile {
    match device_class {
        DeviceClass::Desktop => SyncPolicyProfile::Full,
        DeviceClass::Mobile => SyncPolicyProfile::Balanced,
        DeviceClass::Watch => SyncPolicyProfile::Lightweight,
    }
}

pub fn default_sync_slices() -> Vec<SyncSliceSpec> {
    vec![
        SyncSliceSpec {
            name: SyncSliceName::InboxSummaries,
            includes_ciphertext: false,
            local_cache_required: true,
            conflict_mode: ConflictMode::LastWriterWins,
        },
        SyncSliceSpec {
            name: SyncSliceName::ThreadMetadata,
            includes_ciphertext: false,
            local_cache_required: true,
            conflict_mode: ConflictMode::AppendOnly,
        },
        SyncSliceSpec {
            name: SyncSliceName::PageStructures,
            includes_ciphertext: true,
            local_cache_required: true,
            conflict_mode: ConflictMode::Crdt,
        },
        SyncSliceSpec {
            name: SyncSliceName::ActionStates,
            includes_ciphertext: false,
            local_cache_required: true,
            conflict_mode: ConflictMode::AppendOnly,
        },
        SyncSliceSpec {
            name: SyncSliceName::CiphertextBlobs,
            includes_ciphertext: true,
            local_cache_required: true,
            conflict_mode: ConflictMode::AppendOnly,
        },
        SyncSliceSpec {
            name: SyncSliceName::LayoutConfig,
            includes_ciphertext: false,
            local_cache_required: true,
            conflict_mode: ConflictMode::Crdt,
        },
    ]
}

pub fn sync_slices_for_device(
    device_class: &DeviceClass,
    profile: &SyncPolicyProfile,
) -> Vec<SyncSliceSpec> {
    let base = default_sync_slices();
    match (device_class, profile) {
        (DeviceClass::Desktop, SyncPolicyProfile::Full) => base,
        (DeviceClass::Desktop, SyncPolicyProfile::Balanced) => base
            .into_iter()
            .filter(|slice| slice.name != SyncSliceName::PageStructures)
            .collect(),
        (DeviceClass::Desktop, SyncPolicyProfile::Lightweight) => base
            .into_iter()
            .filter(|slice| {
                matches!(
                    slice.name,
                    SyncSliceName::InboxSummaries
                        | SyncSliceName::ThreadMetadata
                        | SyncSliceName::ActionStates
                        | SyncSliceName::LayoutConfig
                )
            })
            .collect(),
        (DeviceClass::Mobile, SyncPolicyProfile::Full) => base
            .into_iter()
            .filter(|slice| slice.name != SyncSliceName::PageStructures)
            .collect(),
        (DeviceClass::Mobile, SyncPolicyProfile::Balanced) => base
            .into_iter()
            .filter(|slice| {
                matches!(
                    slice.name,
                    SyncSliceName::InboxSummaries
                        | SyncSliceName::ThreadMetadata
                        | SyncSliceName::ActionStates
                        | SyncSliceName::CiphertextBlobs
                )
            })
            .collect(),
        (DeviceClass::Mobile, SyncPolicyProfile::Lightweight) => base
            .into_iter()
            .filter(|slice| {
                matches!(
                    slice.name,
                    SyncSliceName::InboxSummaries
                        | SyncSliceName::ThreadMetadata
                        | SyncSliceName::ActionStates
                )
            })
            .collect(),
        (DeviceClass::Watch, SyncPolicyProfile::Full) => base
            .into_iter()
            .filter(|slice| {
                matches!(
                    slice.name,
                    SyncSliceName::InboxSummaries
                        | SyncSliceName::ThreadMetadata
                        | SyncSliceName::ActionStates
                        | SyncSliceName::CiphertextBlobs
                )
            })
            .collect(),
        (DeviceClass::Watch, SyncPolicyProfile::Balanced) => base
            .into_iter()
            .filter(|slice| {
                matches!(
                    slice.name,
                    SyncSliceName::InboxSummaries
                        | SyncSliceName::ThreadMetadata
                        | SyncSliceName::ActionStates
                )
            })
            .collect(),
        (DeviceClass::Watch, SyncPolicyProfile::Lightweight) => base
            .into_iter()
            .filter(|slice| {
                matches!(
                    slice.name,
                    SyncSliceName::InboxSummaries | SyncSliceName::ActionStates
                )
            })
            .collect(),
    }
}

pub fn requires_local_key_material(slices: &[SyncSliceSpec]) -> bool {
    slices.iter().any(|slice| slice.includes_ciphertext)
}

/// ElectricSQL-compatible shape descriptor for one sync slice.
///
/// Maps to an Electric `GET /v1/shape/<table>?schema=<schema>&where=<where_clause>` subscription.
/// The `agent_id` placeholder must be substituted client-side before the request is sent.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct SliceShapeDescriptor {
    /// Optional Postgres schema name to subscribe within.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
    /// The Postgres table name to subscribe to.
    pub table: String,
    /// The local replica table name to hydrate within PGLite.
    pub local_table: String,
    /// Optional Electric `where` filter (SQL predicate, may contain `$agent_id` placeholder).
    pub where_clause: Option<String>,
    /// Whether this shape carries ciphertext that requires local key material.
    pub requires_key_material: bool,
    /// Conflict resolution strategy for local writes.
    pub conflict_mode: ConflictMode,
}

fn sql_string_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn public_message_agent_filter(public_agent_ids: &[String]) -> Option<String> {
    if public_agent_ids.is_empty() {
        return None;
    }
    let agent_array = public_agent_ids
        .iter()
        .map(|agent_id| sql_string_literal(agent_id))
        .collect::<Vec<_>>()
        .join(", ");
    Some(format!(
        "((from_agent = ANY(ARRAY[{agent_array}])) OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(to_agents) AS recipient WHERE recipient = ANY(ARRAY[{agent_array}])))"
    ))
}

fn message_shape_where_clause(slice_name: &SyncSliceName) -> Option<String> {
    match slice_name {
        SyncSliceName::InboxSummaries => Some(
            "(type IN ('email_incoming','email_outgoing','task_update') OR (type = 'email' AND subtype IN ('incoming','outgoing')) OR (type = 'task' AND subtype = 'status')) AND content->>'omnyid_encrypted' IS NULL".to_string(),
        ),
        SyncSliceName::ThreadMetadata => Some("thread_id IS NOT NULL".to_string()),
        SyncSliceName::PageStructures => {
            Some("type = 'block_update' OR (type = 'note' AND subtype = 'block_update')".to_string())
        }
        SyncSliceName::CiphertextBlobs => Some("content->>'omnyid_encrypted' = 'true'".to_string()),
        SyncSliceName::LayoutConfig => Some(
            "type = 'layout_config' OR (type = 'agent' AND subtype = 'layout_config')"
                .to_string(),
        ),
        SyncSliceName::ActionStates => None,
    }
}

fn slice_supports_public_agent_overlay(slice_name: &SyncSliceName) -> bool {
    matches!(
        slice_name,
        SyncSliceName::InboxSummaries
            | SyncSliceName::ThreadMetadata
            | SyncSliceName::CiphertextBlobs
    )
}

fn local_table_name(slice_name: &SyncSliceName, is_public_overlay: bool) -> &'static str {
    match slice_name {
        SyncSliceName::ActionStates => "action_audit_log",
        SyncSliceName::InboxSummaries => {
            if is_public_overlay {
                "messages_shared_inbox"
            } else {
                "messages_private_inbox"
            }
        }
        SyncSliceName::ThreadMetadata => {
            if is_public_overlay {
                "messages_shared_threads"
            } else {
                "messages_private_threads"
            }
        }
        SyncSliceName::PageStructures => "messages_private_pages",
        SyncSliceName::CiphertextBlobs => {
            if is_public_overlay {
                "messages_shared_ciphertext"
            } else {
                "messages_private_ciphertext"
            }
        }
        SyncSliceName::LayoutConfig => "messages_private_layout",
    }
}

/// Map every sync slice name to its ElectricSQL shape descriptor.
///
/// `user_id` should be the authenticated user's ID; when provided, tenant-private slices
/// point to that user's schema so Electric reads the correct per-user tables. Pass `None`
/// only for anonymous or system-level shape requests where public-schema access is intended.
pub fn shape_descriptors_for_slices(
    slices: &[SyncSliceSpec],
    user_id: Option<&str>,
    public_agent_ids: Option<&[String]>,
) -> Vec<SliceShapeDescriptor> {
    let tenant_schema = user_id.map(crate::db::tenant_schema_name);
    slices
        .iter()
        .flat_map(|spec| {
            if spec.name == SyncSliceName::ActionStates {
                return vec![SliceShapeDescriptor {
                    schema: tenant_schema.clone(),
                    table: "action_audit_log".to_string(),
                    local_table: local_table_name(&spec.name, false).to_string(),
                    where_clause: None,
                    requires_key_material: spec.includes_ciphertext,
                    conflict_mode: spec.conflict_mode.clone(),
                }];
            }

            let base_where = message_shape_where_clause(&spec.name);
            let mut descriptors = Vec::new();
            descriptors.push(SliceShapeDescriptor {
                schema: tenant_schema.clone(),
                table: "messages".to_string(),
                local_table: local_table_name(&spec.name, false).to_string(),
                where_clause: base_where.clone(),
                requires_key_material: spec.includes_ciphertext,
                conflict_mode: spec.conflict_mode.clone(),
            });

            if slice_supports_public_agent_overlay(&spec.name) {
                if let Some(public_filter) = public_agent_ids.and_then(public_message_agent_filter)
                {
                    let public_where = base_where
                        .as_deref()
                        .map(|base| format!("({base}) AND {public_filter}"))
                        .or_else(|| Some(public_filter));
                    descriptors.push(SliceShapeDescriptor {
                        schema: None,
                        table: "messages".to_string(),
                        local_table: local_table_name(&spec.name, true).to_string(),
                        where_clause: public_where,
                        requires_key_material: spec.includes_ciphertext,
                        conflict_mode: spec.conflict_mode.clone(),
                    });
                }
            }

            descriptors
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{
        ConflictMode, DeviceClass, SyncPolicyProfile, SyncSliceName, default_sync_profile,
        default_sync_slices, parse_device_class, requires_local_key_material,
        shape_descriptors_for_slices, sync_slices_for_device,
    };

    #[test]
    fn default_sync_plan_preserves_core_inbox_and_thread_slices() {
        let slices = default_sync_slices();
        assert!(
            slices
                .iter()
                .any(|slice| slice.name == SyncSliceName::InboxSummaries)
        );
        assert!(
            slices
                .iter()
                .any(|slice| slice.name == SyncSliceName::ThreadMetadata)
        );
        assert!(
            slices
                .iter()
                .any(|slice| slice.name == SyncSliceName::CiphertextBlobs)
        );
    }

    #[test]
    fn ciphertext_sync_requires_local_key_material() {
        let slices = default_sync_slices();
        assert!(requires_local_key_material(&slices));
        assert!(slices.iter().any(|slice| {
            slice.name == SyncSliceName::PageStructures && slice.conflict_mode == ConflictMode::Crdt
        }));
    }

    #[test]
    fn watch_lightweight_profile_stays_summary_only() {
        let slices = sync_slices_for_device(&DeviceClass::Watch, &SyncPolicyProfile::Lightweight);
        assert_eq!(slices.len(), 2);
        assert!(slices.iter().all(|slice| !slice.includes_ciphertext));
        assert!(!requires_local_key_material(&slices));
    }

    #[test]
    fn mobile_balanced_profile_keeps_ciphertext_but_not_page_structures() {
        let slices = sync_slices_for_device(&DeviceClass::Mobile, &SyncPolicyProfile::Balanced);
        assert!(
            slices
                .iter()
                .any(|slice| slice.name == SyncSliceName::CiphertextBlobs)
        );
        assert!(
            !slices
                .iter()
                .any(|slice| slice.name == SyncSliceName::PageStructures)
        );
    }

    #[test]
    fn device_class_parsing_and_defaults_are_stable() {
        assert_eq!(parse_device_class("desktop"), Some(DeviceClass::Desktop));
        assert_eq!(parse_device_class("mobile"), Some(DeviceClass::Mobile));
        assert_eq!(parse_device_class("watch"), Some(DeviceClass::Watch));
        assert_eq!(
            default_sync_profile(&DeviceClass::Desktop),
            SyncPolicyProfile::Full
        );
        assert_eq!(
            default_sync_profile(&DeviceClass::Mobile),
            SyncPolicyProfile::Balanced
        );
        assert_eq!(
            default_sync_profile(&DeviceClass::Watch),
            SyncPolicyProfile::Lightweight
        );
    }

    #[test]
    fn action_state_shape_descriptor_does_not_emit_invalid_user_id_filter() {
        let descriptors = shape_descriptors_for_slices(
            &[super::SyncSliceSpec {
                name: SyncSliceName::ActionStates,
                includes_ciphertext: false,
                local_cache_required: true,
                conflict_mode: ConflictMode::LastWriterWins,
            }],
            Some("user_01"),
            None,
        );

        assert_eq!(descriptors.len(), 1);
        assert_eq!(descriptors[0].schema.as_deref(), Some("user_user_01"));
        assert_eq!(descriptors[0].table, "action_audit_log");
        assert_eq!(descriptors[0].local_table, "action_audit_log");
        assert!(descriptors[0].where_clause.is_none());
    }

    #[test]
    fn tenant_message_slice_descriptors_do_not_emit_invalid_owner_user_filters() {
        let descriptors = shape_descriptors_for_slices(
            &[
                super::SyncSliceSpec {
                    name: SyncSliceName::InboxSummaries,
                    includes_ciphertext: false,
                    local_cache_required: true,
                    conflict_mode: ConflictMode::LastWriterWins,
                },
                super::SyncSliceSpec {
                    name: SyncSliceName::ThreadMetadata,
                    includes_ciphertext: false,
                    local_cache_required: true,
                    conflict_mode: ConflictMode::LastWriterWins,
                },
                super::SyncSliceSpec {
                    name: SyncSliceName::CiphertextBlobs,
                    includes_ciphertext: true,
                    local_cache_required: true,
                    conflict_mode: ConflictMode::AppendOnly,
                },
            ],
            Some("user_01"),
            None,
        );

        assert_eq!(descriptors.len(), 3);
        assert!(
            descriptors
                .iter()
                .all(|descriptor| descriptor.schema.as_deref() == Some("user_user_01"))
        );
        assert!(
            descriptors
                .iter()
                .all(|descriptor| descriptor.table == "messages")
        );
        assert_eq!(
            descriptors
                .iter()
                .map(|descriptor| descriptor.local_table.as_str())
                .collect::<Vec<_>>(),
            vec![
                "messages_private_inbox",
                "messages_private_threads",
                "messages_private_ciphertext",
            ]
        );
        assert!(descriptors.iter().all(|descriptor| {
            !descriptor
                .where_clause
                .as_deref()
                .unwrap_or_default()
                .contains("owner_user_id")
        }));
    }

    #[test]
    fn anonymous_shape_descriptors_leave_schema_unset() {
        let descriptors = shape_descriptors_for_slices(
            &[super::SyncSliceSpec {
                name: SyncSliceName::ThreadMetadata,
                includes_ciphertext: false,
                local_cache_required: true,
                conflict_mode: ConflictMode::LastWriterWins,
            }],
            None,
            None,
        );

        assert_eq!(descriptors.len(), 1);
        assert!(descriptors[0].schema.is_none());
        assert_eq!(descriptors[0].table, "messages");
        assert_eq!(descriptors[0].local_table, "messages_private_threads");
    }

    #[test]
    fn authenticated_message_slices_include_public_agent_scoped_shape() {
        let agent_ids = vec![
            "omnyid://agent/alpha".to_string(),
            "omnyid://agent/beta".to_string(),
        ];
        let descriptors = shape_descriptors_for_slices(
            &[super::SyncSliceSpec {
                name: SyncSliceName::ThreadMetadata,
                includes_ciphertext: false,
                local_cache_required: true,
                conflict_mode: ConflictMode::LastWriterWins,
            }],
            Some("user_01"),
            Some(&agent_ids),
        );

        assert_eq!(descriptors.len(), 2);
        assert_eq!(descriptors[0].schema.as_deref(), Some("user_user_01"));
        assert_eq!(descriptors[0].local_table, "messages_private_threads");
        assert_eq!(
            descriptors[0].where_clause.as_deref(),
            Some("thread_id IS NOT NULL")
        );
        assert!(descriptors[1].schema.is_none());
        assert_eq!(descriptors[1].local_table, "messages_shared_threads");
        let public_where = descriptors[1].where_clause.as_deref().unwrap_or_default();
        assert!(public_where.contains("thread_id IS NOT NULL"));
        assert!(public_where.contains("from_agent = ANY"));
        assert!(public_where.contains("omnyid://agent/alpha"));
        assert!(public_where.contains("omnyid://agent/beta"));
    }

    #[test]
    fn layout_config_does_not_emit_public_agent_overlay_shape() {
        let agent_ids = vec!["omnyid://agent/alpha".to_string()];
        let descriptors = shape_descriptors_for_slices(
            &[super::SyncSliceSpec {
                name: SyncSliceName::LayoutConfig,
                includes_ciphertext: false,
                local_cache_required: true,
                conflict_mode: ConflictMode::Crdt,
            }],
            Some("user_01"),
            Some(&agent_ids),
        );

        assert_eq!(descriptors.len(), 1);
        assert_eq!(descriptors[0].schema.as_deref(), Some("user_user_01"));
        assert_eq!(descriptors[0].table, "messages");
        assert_eq!(descriptors[0].local_table, "messages_private_layout");
        assert_eq!(
            descriptors[0].where_clause.as_deref(),
            Some("type = 'layout_config' OR (type = 'agent' AND subtype = 'layout_config')")
        );
    }

    #[test]
    fn authenticated_dual_source_message_shapes_use_distinct_local_tables() {
        let agent_ids = vec!["omnyid://agent/alpha".to_string()];
        let descriptors = shape_descriptors_for_slices(
            &[super::SyncSliceSpec {
                name: SyncSliceName::InboxSummaries,
                includes_ciphertext: false,
                local_cache_required: true,
                conflict_mode: ConflictMode::LastWriterWins,
            }],
            Some("user_01"),
            Some(&agent_ids),
        );

        assert_eq!(descriptors.len(), 2);
        assert_eq!(descriptors[0].table, "messages");
        assert_eq!(descriptors[1].table, "messages");
        assert_eq!(descriptors[0].local_table, "messages_private_inbox");
        assert_eq!(descriptors[1].local_table, "messages_shared_inbox");
        assert_ne!(descriptors[0].local_table, descriptors[1].local_table);
    }
}
