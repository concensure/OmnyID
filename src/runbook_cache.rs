//! Store-lifetime bounded parsed-definition cache. Never bypasses ledger reads,
//! account locks, signature verification or decryption. No global plaintext cache.
use crate::{
    runbook_contract::Result,
    runbook_registry::{DefinitionRecord, parse_definition_afp},
    runbook_store::digest,
};
use serde_json::{Value, json};
use std::collections::BTreeMap;

#[derive(Default)]
pub(crate) struct DefinitionCache {
    entries: BTreeMap<String, (String, String, u64, DefinitionRecord)>,
}

impl DefinitionCache {
    pub fn parse(&mut self, owner: &str, message: &Value) -> Result<DefinitionRecord> {
        // Hash the entire verified envelope: cached content cannot excuse tampered
        // parents, metadata, recipients, timestamps or signatures.
        let key = digest(&json!([owner, message["content"]["version"], message]));
        if let Some((_, _, _, record)) = self.entries.get(&key) {
            return Ok(record.clone());
        }
        let record = parse_definition_afp(owner, message)?;
        let version = u64::from(record.definition.version);
        self.entries.retain(|_, (o, id, v, _)| {
            o != owner || id != &record.definition.runbook_id || *v >= version
        });
        // Older immutable versions can be read for frozen instances, but must not
        // evict/repopulate entries invalidated by a newer definition.
        let newer = self
            .entries
            .values()
            .any(|(o, id, v, _)| o == owner && id == &record.definition.runbook_id && *v > version);
        if !newer {
            if self.entries.len() >= 128 {
                self.entries.clear();
            }
            self.entries.insert(
                key,
                (
                    owner.into(),
                    record.definition.runbook_id.clone(),
                    version,
                    record.clone(),
                ),
            );
        }
        Ok(record)
    }

    pub fn clear(&mut self) {
        self.entries.clear();
    }
}
