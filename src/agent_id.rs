#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentId {
    pub full: String,
    pub localpart: String,
    pub domain: String,
}

impl AgentId {
    pub fn parse(input: &str) -> Option<Self> {
        let trimmed = input.trim();
        let remainder = trimmed.strip_prefix("agent:")?;
        let (localpart, domain) = remainder.split_once('@')?;
        if localpart.is_empty() || domain.is_empty() {
            return None;
        }
        if !is_valid_localpart(localpart) || !is_valid_domain(domain) {
            return None;
        }

        Some(Self {
            full: trimmed.to_string(),
            localpart: localpart.to_string(),
            domain: domain.to_string(),
        })
    }
}

fn is_valid_localpart(value: &str) -> bool {
    value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-' | '+'))
}

fn is_valid_domain(value: &str) -> bool {
    if value.starts_with('.') || value.ends_with('.') {
        return false;
    }

    value.split('.').all(|label| {
        !label.is_empty()
            && label
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
            && !label.starts_with('-')
            && !label.ends_with('-')
    })
}

#[cfg(test)]
mod tests {
    use super::AgentId;

    #[test]
    fn parses_valid_agent_id() {
        let agent_id = AgentId::parse("agent:alice.ops@omnyid.ai").expect("agent id");
        assert_eq!(agent_id.localpart, "alice.ops");
        assert_eq!(agent_id.domain, "omnyid.ai");
    }

    #[test]
    fn rejects_invalid_agent_ids() {
        assert!(AgentId::parse("alice@omnyid.ai").is_none());
        assert!(AgentId::parse("agent:@omnyid.ai").is_none());
        assert!(AgentId::parse("agent:alice@-omnyid.ai").is_none());
        assert!(AgentId::parse("agent:alice@omnyid..ai").is_none());
    }
}
