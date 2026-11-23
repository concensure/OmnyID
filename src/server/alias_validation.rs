// -- Agent Alias Registry ------------------------------------------------------

const ALIAS_RESERVED: &[&str] = &[
    "admin",
    "administrator",
    "support",
    "system",
    "root",
    "api",
    "www",
    "mail",
    "smtp",
    "imap",
    "pop3",
    "ftp",
    "ssh",
    "host",
    "server",
    "help",
    "info",
    "contact",
    "security",
    "abuse",
    "noreply",
    "no-reply",
    "postmaster",
    "webmaster",
    "hostmaster",
    "daemon",
    "mailer",
    "omnyid",
    "agenton",
    "aetherix",
    "omny-id",
    "agent-on",
    "billing",
    "payments",
    "invoice",
    "account",
    "accounts",
    "signup",
    "signin",
    "login",
    "logout",
    "register",
];

pub(super) fn validate_alias(alias: &str) -> Result<(), String> {
    let alias = alias.trim();
    if alias.len() < 7 {
        return Err("Alias must be at least 7 characters.".into());
    }
    if alias.len() > 48 {
        return Err("Alias must be 48 characters or fewer.".into());
    }
    if !alias
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return Err("Only lowercase letters (a–z), digits, and hyphens are allowed.".into());
    }
    if alias.starts_with('-') || alias.ends_with('-') {
        return Err("Alias cannot start or end with a hyphen.".into());
    }
    if alias.contains("--") {
        return Err("Alias cannot contain consecutive hyphens.".into());
    }
    if ALIAS_RESERVED.contains(&alias) {
        return Err("This alias is reserved and cannot be claimed.".into());
    }
    Ok(())
}
