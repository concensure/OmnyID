/*
 * @module-id: rust.server.wedding-vendor-search-source-policy
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum WeddingVendorSourcePolicy {
    DirectoryOnly,
    OnlineCapable,
}

impl WeddingVendorSourcePolicy {
    pub(super) fn parse(value: Option<&str>) -> Result<Self, &'static str> {
        match value.map(str::trim).filter(|value| !value.is_empty()) {
            None | Some("online_capable") => Ok(Self::OnlineCapable),
            Some("directory_only") => Ok(Self::DirectoryOnly),
            Some(_) => Err("source_policy must be directory_only or online_capable"),
        }
    }

    pub(super) fn receipt_label(self) -> &'static str {
        match self {
            Self::DirectoryOnly => "directory_only",
            Self::OnlineCapable => "online_capable",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::WeddingVendorSourcePolicy;

    #[test]
    fn defaults_to_online_capable_for_backward_compatibility() {
        assert_eq!(WeddingVendorSourcePolicy::parse(None), Ok(WeddingVendorSourcePolicy::OnlineCapable));
        assert_eq!(WeddingVendorSourcePolicy::parse(Some("online_capable")), Ok(WeddingVendorSourcePolicy::OnlineCapable));
    }

    #[test]
    fn accepts_only_the_explicit_directory_first_policy() {
        assert_eq!(WeddingVendorSourcePolicy::parse(Some(" directory_only ")), Ok(WeddingVendorSourcePolicy::DirectoryOnly));
        assert!(WeddingVendorSourcePolicy::parse(Some("all_sources")).is_err());
    }
}
