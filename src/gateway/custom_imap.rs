use imap::ClientBuilder;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CustomImapConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ImapFetchedMessage {
    pub uid: u32,
    pub raw_email: Vec<u8>,
}

pub async fn fetch_recent_messages(
    config: CustomImapConfig,
    last_seen_uid: Option<u32>,
    fetch_limit: usize,
) -> Result<Vec<ImapFetchedMessage>, String> {
    tokio::task::spawn_blocking(move || {
        fetch_recent_messages_blocking(config, last_seen_uid, fetch_limit)
    })
    .await
    .map_err(|err| format!("custom IMAP worker join failed: {err}"))?
}

fn fetch_recent_messages_blocking(
    config: CustomImapConfig,
    last_seen_uid: Option<u32>,
    fetch_limit: usize,
) -> Result<Vec<ImapFetchedMessage>, String> {
    let client = ClientBuilder::new(&config.host, config.port)
        .connect()
        .map_err(|err| format!("custom IMAP connect failed: {err}"))?;
    let mut session = client
        .login(&config.username, &config.password)
        .map_err(|err| format!("custom IMAP login failed: {}", err.0))?;

    session
        .select("INBOX")
        .map_err(|err| format!("custom IMAP select INBOX failed: {err}"))?;

    let all_uids = session
        .uid_search("ALL")
        .map_err(|err| format!("custom IMAP uid search failed: {err}"))?
        .into_iter()
        .collect::<Vec<_>>();
    let pending_uids = select_pending_uids(all_uids, last_seen_uid, fetch_limit);

    let mut messages = Vec::with_capacity(pending_uids.len());
    for uid in pending_uids {
        let fetched = session
            .uid_fetch(uid.to_string(), "RFC822")
            .map_err(|err| format!("custom IMAP uid fetch failed for {uid}: {err}"))?;
        let raw_email = fetched
            .iter()
            .find_map(|message| message.body().map(|body| body.to_vec()))
            .ok_or_else(|| format!("custom IMAP message {uid} did not contain RFC822 body"))?;
        messages.push(ImapFetchedMessage { uid, raw_email });
    }

    let _ = session.logout();
    Ok(messages)
}

fn select_pending_uids(
    mut uids: Vec<u32>,
    last_seen_uid: Option<u32>,
    fetch_limit: usize,
) -> Vec<u32> {
    uids.sort_unstable();
    let mut pending = if let Some(last_seen_uid) = last_seen_uid {
        uids.into_iter()
            .filter(|uid| *uid > last_seen_uid)
            .collect::<Vec<_>>()
    } else if uids.len() > fetch_limit {
        uids.split_off(uids.len() - fetch_limit)
    } else {
        uids
    };

    if pending.len() > fetch_limit {
        pending = pending.split_off(pending.len() - fetch_limit);
    }

    pending
}

#[cfg(test)]
mod tests {
    use super::select_pending_uids;

    #[test]
    fn select_pending_uids_uses_checkpoint_when_present() {
        let pending = select_pending_uids(vec![4, 1, 2, 6, 7], Some(4), 10);
        assert_eq!(pending, vec![6, 7]);
    }

    #[test]
    fn select_pending_uids_limits_initial_backfill() {
        let pending = select_pending_uids(vec![1, 2, 3, 4, 5], None, 3);
        assert_eq!(pending, vec![3, 4, 5]);
    }
}
