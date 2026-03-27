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
/// Maps to an Electric `GET /v1/shape?table=<table>&where=<where_clause>` subscription.
/// The `agent_id` placeholder must be substituted client-side before the request is sent.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct SliceShapeDescriptor {
    /// The Postgres table name to subscribe to.
    pub table: String,
    /// Optional Electric `where` filter (SQL predicate, may contain `$agent_id` placeholder).
    pub where_clause: Option<String>,
    /// Whether this shape carries ciphertext that requires local key material.
    pub requires_key_material: bool,
    /// Conflict resolution strategy for local writes.
    pub conflict_mode: ConflictMode,
}

/// Map every sync slice name to its ElectricSQL shape descriptor.
pub fn shape_descriptors_for_slices(slices: &[SyncSliceSpec]) -> Vec<SliceShapeDescriptor> {
    slices.iter().map(|spec| {
        let (table, where_clause) = match spec.name {
            SyncSliceName::InboxSummaries => (
                "messages",
                Some("(type IN ('email_incoming','email_outgoing','task_update') OR (type = 'email' AND subtype IN ('incoming','outgoing')) OR (type = 'task' AND subtype = 'status')) AND content->>'omnyid_encrypted' IS NULL".to_string()),
            ),
            SyncSliceName::ThreadMetadata => (
                "messages",
                Some("thread_id IS NOT NULL".to_string()),
            ),
            SyncSliceName::PageStructures => (
                "messages",
                Some("type = 'block_update' OR (type = 'note' AND subtype = 'block_update')".to_string()),
            ),
            SyncSliceName::ActionStates => (
                "action_audit_log",
                None,
            ),
            SyncSliceName::CiphertextBlobs => (
                "messages",
                Some("content->>'omnyid_encrypted' = 'true'".to_string()),
            ),
            SyncSliceName::LayoutConfig => (
                "messages",
                Some("type = 'layout_config' OR (type = 'agent' AND subtype = 'layout_config')".to_string()),
            ),
        };
        SliceShapeDescriptor {
            table: table.to_string(),
            where_clause,
            requires_key_material: spec.includes_ciphertext,
            conflict_mode: spec.conflict_mode.clone(),
        }
    }).collect()
}

#[cfg(test)]
mod tests {
    use super::{
        ConflictMode, DeviceClass, SyncPolicyProfile, SyncSliceName, default_sync_profile,
        default_sync_slices, parse_device_class, requires_local_key_material,
        sync_slices_for_device,
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
}
