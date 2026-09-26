//! cli_executor.rs — AFP-native sandboxed CLI tool executor.
//!
//! Processes AFP messages with `type = "tool_call"` and
//! `metadata.tool_call.tool_name = "cli_execute"`, runs the requested shell
//! command under sandboxing and timeout constraints, then returns a matching
//! AFP `type = "tool_result"` message.
//!
//! # Wire format
//!
//! **Inbound** (`type = "tool_call"`):
//! ```json
//! {
//!   "protocol": "afp-v1",
//!   "type": "tool_call",
//!   "metadata": {
//!     "tool_call": {
//!       "call_id": "call_cli_456",
//!       "connector_family": "cli",
//!       "tool_name": "cli_execute",
//!       "parameters": {
//!         "command": "ls -la ./reports",
//!         "working_dir": "/home/user/project",
//!         "timeout_seconds": 30,
//!         "safe_mode": true
//!       },
//!       "policy": { "max_retries": 1, "require_approval": true }
//!     }
//!   }
//! }
//! ```
//!
//! **Outbound** (`type = "tool_result"`):
//! ```json
//! {
//!   "protocol": "afp-v1",
//!   "type": "tool_result",
//!   "metadata": {
//!     "tool_result": {
//!       "call_id": "call_cli_456",
//!       "status": "success",
//!       "data": { "stdout": "...", "stderr": "", "exit_code": 0 },
//!       "latency_ms": 45
//!     }
//!   }
//! }
//! ```
//!
//! # Sandboxing
//!
//! - `safe_mode = true`: blocks destructive command prefixes before spawn.
//! - Timeout: `tokio::time::timeout` hard-kills the subprocess.
//! - Working directory is resolved against an optional `OMNYID_CLI_WORKDIR_ROOT`
//!   env var so path traversal outside the root is rejected.
//! - On Linux the child process environment is cleared to a minimal PATH/HOME.
//!   seccomp filter support is reserved for a future `seccomp` feature flag.

use serde::{Deserialize, Serialize};
use tokio::process::Command;

use crate::message::{AFPMessage, AfpToolCallMetadata, AfpToolResultMetadata};

// ── Parameters ────────────────────────────────────────────────────────────────

/// Parameters carried in `metadata.tool_call.parameters` for `cli_execute`.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AfpCliExecuteParams {
    /// Shell command to run (passed to `sh -c` on Linux, `cmd /C` on Windows).
    pub command: String,
    /// Optional working directory; validated against `OMNYID_CLI_WORKDIR_ROOT`.
    #[serde(default)]
    pub working_dir: Option<String>,
    /// Hard timeout in seconds (default: 30).
    #[serde(default = "AfpCliExecuteParams::default_timeout")]
    pub timeout_seconds: u32,
    /// When `true` a built-in blocklist of destructive commands is enforced
    /// before the process is spawned.  Defaults to `true`; callers must
    /// explicitly set `safe_mode: false` to opt out (and should justify why).
    #[serde(default = "AfpCliExecuteParams::default_safe_mode")]
    pub safe_mode: bool,
}

impl AfpCliExecuteParams {
    fn default_timeout() -> u32 {
        30
    }

    fn default_safe_mode() -> bool {
        true
    }
}

fn cli_unsafe_mode_enabled() -> bool {
    matches!(
        std::env::var("OMNYID_CLI_ALLOW_UNSAFE_MODE")
            .ok()
            .as_deref()
            .map(str::trim)
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("1" | "true" | "yes" | "on")
    )
}

// ── Safe-mode blocklist ───────────────────────────────────────────────────────

/// Command prefixes/substrings blocked in `safe_mode`.
///
/// Checked case-insensitively against the full command string.
///
/// IMPORTANT: substring matching is bypassable via shell quoting tricks
/// (e.g. `'r'm` or `$'rm'`). This blocklist is a defence-in-depth layer,
/// not a replacement for OS-level sandboxing (namespaces, seccomp, etc.).
/// The most robust protection is to run the executor inside a container or
/// restricted OS user with no write access to sensitive paths.
const SAFE_MODE_BLOCKLIST: &[&str] = &[
    // Filesystem destruction
    "rm ",
    "rm\t",
    "rmdir",
    "mkfs",
    "dd ",
    "dd\t",
    "shred ",
    "truncate ",
    "tee ", // can overwrite arbitrary files: `cmd | tee /etc/passwd`
    "tee\t",
    // Privilege escalation
    "sudo",
    "su ",
    "su\t",
    "doas ",
    "pkexec",
    "chmod 777",
    "chown ",
    "chown\t",
    // Process / system control
    "kill ",
    "kill\t",
    "pkill",
    "killall",
    "shutdown",
    "reboot",
    "halt",
    "poweroff",
    // Raw network
    "curl ",
    "curl\t",
    "wget ",
    "wget\t",
    "nc ",
    "nc\t",
    "ncat ",
    "ncat\t",
    "netcat",
    "socat ",
    // Device writes
    "> /dev/",
    ">/dev/",
    // Shell invocation (nested or alternative)
    // NOTE: the executor itself uses `sh -c`; blocking these prevents a second
    // shell layer that could side-step individual command rules above.
    "sh ", // catches `sh -c`, `sh script`, etc.
    "sh\t",
    "bash ",
    "bash\t",
    "bash -c",
    "bash --norc",
    "zsh ",
    "zsh\t",
    "dash ",
    "dash\t",
    "ksh ",
    "ksh\t",
    "csh ",
    "csh\t",
    "tcsh ",
    "tcsh\t",
    "fish ",
    "fish\t",
    // Inline code execution in scripting runtimes
    "python -c",
    "python3 -c",
    "python -m", // `python -m http.server`, `python -m pty`, etc.
    "python3 -m",
    "python ", // block running arbitrary .py scripts too
    "python\t",
    "python3 ",
    "python3\t",
    "perl ",
    "perl\t",
    "ruby ",
    "ruby\t",
    "php ",
    "php\t",
    "node -e",
    "node --eval",
    "node -p",
    "node ", // block running arbitrary .js scripts
    "node\t",
    "deno ",
    "deno\t",
    // Shell built-ins / eval
    "exec ",
    "exec\t",
    "eval ",
    "eval\t",
    // Utility piping vectors
    "xargs ", // `echo rm -rf / | xargs sh`
    "xargs\t",
    "env ", // `env bash -c ...`
    "env\t",
    "nohup ", // background execution escaping timeout
    "at ",    // schedule commands to run later
    "crontab",
    // Compression/archival with execute side-effects
    "tar ", // `tar --to-command=...`
    "tar\t",
    // Subshell / command substitution — catches `$(cmd)` and backtick forms
    "$(",
    "`",
    // ANSI-C quoting tricks used to smuggle blocked command names: `$'rm'`
    "$'",
    // base64-decode-and-pipe patterns
    "base64 -d",
    "base64 --decode",
    "openssl enc",
    // LD_PRELOAD and dynamic linker tricks for privilege escalation
    "ld_preload",
    "ld_library_path",
    // Proc filesystem write access (often used to override kernel params)
    "> /proc/",
    ">/proc/",
    // Docker-in-Docker and container escapes via host socket
    "docker ",
    "docker\t",
    "podman ",
    "podman\t",
    // Python-based shell spawns (catches `python3 -c "import pty; pty.spawn..."`)
    "pty.spawn",
    "subprocess",
    "os.system",
    "os.popen",
];

fn is_safe_mode_allowed_char(ch: char) -> bool {
    ch.is_ascii_alphanumeric()
        || matches!(
            ch,
            '.' | '_' | '-' | '/' | '\\' | ':' | '=' | '+' | ',' | '%' | '@'
        )
}

fn tokenize_safe_mode_command(command: &str) -> Result<Vec<String>, String> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err("safe_mode command cannot be blank".to_string());
    }

    if trimmed.chars().any(|ch| ch.is_ascii_control()) {
        return Err("safe_mode command contains control characters".to_string());
    }

    let forbidden_shell_chars = [
        ';', '&', '|', '>', '<', '$', '(', ')', '{', '}', '[', ']', '*', '?', '!', '~', '"', '\'',
        '`',
    ];
    if trimmed
        .chars()
        .any(|ch| forbidden_shell_chars.contains(&ch))
    {
        return Err(
            "safe_mode command contains shell syntax; use direct argv-style commands only"
                .to_string(),
        );
    }

    let argv = trimmed
        .split_whitespace()
        .map(str::to_string)
        .collect::<Vec<_>>();
    if argv.is_empty() {
        return Err("safe_mode command cannot be blank".to_string());
    }

    for token in &argv {
        if !token.chars().all(is_safe_mode_allowed_char) {
            return Err(format!(
                "safe_mode token '{}' contains unsupported characters",
                token
            ));
        }
    }

    Ok(argv)
}

fn is_windows_shell_builtin(command: &str) -> bool {
    matches!(
        command.trim().to_ascii_lowercase().as_str(),
        "assoc"
            | "break"
            | "call"
            | "cd"
            | "chdir"
            | "cls"
            | "copy"
            | "date"
            | "del"
            | "dir"
            | "echo"
            | "endlocal"
            | "erase"
            | "exit"
            | "for"
            | "ftype"
            | "goto"
            | "if"
            | "md"
            | "mkdir"
            | "mklink"
            | "move"
            | "path"
            | "pause"
            | "popd"
            | "prompt"
            | "pushd"
            | "rd"
            | "ren"
            | "rename"
            | "rmdir"
            | "set"
            | "setlocal"
            | "shift"
            | "start"
            | "time"
            | "title"
            | "type"
            | "ver"
            | "verify"
            | "vol"
    )
}

// ── Executor ──────────────────────────────────────────────────────────────────

pub struct CliExecutor;

impl CliExecutor {
    /// Execute a `type = "tool_call"` AFP message whose `tool_name` is
    /// `cli_execute` and return the corresponding `type = "tool_result"` message.
    ///
    /// Returns `Err` only on structural failures (malformed message). Command
    /// execution failures (non-zero exit, timeout, blocked) are represented as
    /// `status = "error"` inside the returned result message.
    pub async fn execute(msg: &AFPMessage) -> Result<AFPMessage, String> {
        let tool_call = Self::parse_tool_call(msg)?;

        if tool_call.tool_name != "cli_execute" {
            return Err(format!(
                "CliExecutor only handles cli_execute, got '{}'",
                tool_call.tool_name
            ));
        }

        if tool_call.connector_family != "cli" && !tool_call.connector_family.is_empty() {
            return Err(format!(
                "CliExecutor requires connector_family = \"cli\", got '{}'",
                tool_call.connector_family
            ));
        }

        let params: AfpCliExecuteParams = serde_json::from_value(tool_call.parameters.clone())
            .map_err(|e| format!("invalid cli_execute parameters: {e}"))?;

        Ok(Self::run(msg, &tool_call, &params).await)
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    fn parse_tool_call(msg: &AFPMessage) -> Result<AfpToolCallMetadata, String> {
        let meta = msg
            .metadata
            .as_ref()
            .ok_or("tool_call message has no metadata")?;

        // Accept both flat metadata (type = "tool_call") and nested .tool_call
        let tc_val = meta
            .get("tool_call")
            .cloned()
            .unwrap_or_else(|| meta.clone());

        serde_json::from_value(tc_val)
            .map_err(|e| format!("cannot deserialise AfpToolCallMetadata: {e}"))
    }

    async fn run(
        msg: &AFPMessage,
        tool_call: &AfpToolCallMetadata,
        params: &AfpCliExecuteParams,
    ) -> AFPMessage {
        let start = std::time::Instant::now();

        if !params.safe_mode && !cli_unsafe_mode_enabled() {
            return Self::result_msg(
                msg,
                tool_call,
                "error",
                None,
                Some(
                    "unsafe cli execution is disabled by server policy; set OMNYID_CLI_ALLOW_UNSAFE_MODE=true to permit safe_mode=false"
                        .to_string(),
                ),
                0,
            );
        }

        // ── safe_mode blocklist check ─────────────────────────────────────────
        let safe_argv = if params.safe_mode {
            let lower = params.command.to_lowercase();
            for blocked in SAFE_MODE_BLOCKLIST {
                if lower.contains(blocked) {
                    return Self::result_msg(
                        msg,
                        tool_call,
                        "error",
                        None,
                        Some(format!(
                            "command blocked by safe_mode policy: matched '{blocked}'"
                        )),
                        0,
                    );
                }
            }
            match tokenize_safe_mode_command(&params.command) {
                Ok(argv) => Some(argv),
                Err(reason) => {
                    return Self::result_msg(msg, tool_call, "error", None, Some(reason), 0);
                }
            }
        } else {
            None
        };

        // ── Working directory validation ──────────────────────────────────────
        let working_dir: Option<std::path::PathBuf> = match &params.working_dir {
            None => None,
            Some(dir) => {
                let path = std::path::Path::new(dir);
                // Reject path traversal attempts
                if path
                    .components()
                    .any(|c| c == std::path::Component::ParentDir)
                {
                    return Self::result_msg(
                        msg,
                        tool_call,
                        "error",
                        None,
                        Some(format!(
                            "working_dir rejected: path traversal detected in '{dir}'"
                        )),
                        0,
                    );
                }
                // Optionally sandbox inside OMNYID_CLI_WORKDIR_ROOT
                if let Ok(root) = std::env::var("OMNYID_CLI_WORKDIR_ROOT") {
                    let abs = std::path::Path::new(&root).join(path);
                    if !abs.starts_with(&root) {
                        return Self::result_msg(
                            msg,
                            tool_call,
                            "error",
                            None,
                            Some(format!(
                                "working_dir '{dir}' escapes OMNYID_CLI_WORKDIR_ROOT"
                            )),
                            0,
                        );
                    }
                    Some(abs)
                } else {
                    Some(path.to_path_buf())
                }
            }
        };

        // ── Spawn ─────────────────────────────────────────────────────────────
        let mut cmd = Self::build_command(
            &params.command,
            safe_argv.as_deref(),
            working_dir.as_deref(),
        );
        let timeout = std::time::Duration::from_secs(params.timeout_seconds as u64);

        match tokio::time::timeout(timeout, cmd.output()).await {
            Err(_) => Self::result_msg(
                msg,
                tool_call,
                "error",
                None,
                Some(format!(
                    "command timed out after {} s",
                    params.timeout_seconds
                )),
                params.timeout_seconds * 1_000,
            ),
            Ok(Err(spawn_err)) => Self::result_msg(
                msg,
                tool_call,
                "error",
                None,
                Some(format!("failed to spawn process: {spawn_err}")),
                start.elapsed().as_millis() as u32,
            ),
            Ok(Ok(output)) => {
                let exit_code = output.status.code().unwrap_or(-1);
                let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
                let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
                let status = if output.status.success() {
                    "success"
                } else {
                    "error"
                };
                let error = if output.status.success() {
                    None
                } else {
                    Some(format!("exit code {exit_code}"))
                };
                Self::result_msg(
                    msg,
                    tool_call,
                    status,
                    Some(serde_json::json!({
                        "stdout": stdout,
                        "stderr": stderr,
                        "exit_code": exit_code,
                    })),
                    error,
                    start.elapsed().as_millis() as u32,
                )
            }
        }
    }

    fn build_command(
        command: &str,
        safe_argv: Option<&[String]>,
        working_dir: Option<&std::path::Path>,
    ) -> Command {
        let mut cmd = if let Some(argv) = safe_argv {
            if cfg!(target_os = "windows") && is_windows_shell_builtin(&argv[0]) {
                let mut c = Command::new("cmd");
                c.args(["/C", command]);
                c
            } else {
                let mut c = Command::new(&argv[0]);
                if argv.len() > 1 {
                    c.args(&argv[1..]);
                }
                c
            }
        } else if cfg!(target_os = "windows") {
            let mut c = Command::new("cmd");
            c.args(["/C", command]);
            c
        } else {
            let mut c = Command::new("sh");
            c.args(["-c", command]);
            c
        };

        if let Some(dir) = working_dir {
            cmd.current_dir(dir);
        }

        // On Linux: clear environment to a minimal safe set.
        #[cfg(target_os = "linux")]
        {
            cmd.env_clear()
                .env(
                    "PATH",
                    "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
                )
                .env("HOME", "/tmp")
                .env("TMPDIR", "/tmp");
        }

        cmd
    }

    fn result_msg(
        original: &AFPMessage,
        tool_call: &AfpToolCallMetadata,
        status: &str,
        data: Option<serde_json::Value>,
        error: Option<String>,
        latency_ms: u32,
    ) -> AFPMessage {
        let tool_result = AfpToolResultMetadata {
            call_id: tool_call.call_id.clone(),
            status: status.to_string(),
            data,
            error,
            tokens_used: 0,
            cost_cents: 0,
            latency_ms,
            provider_request_id: None,
        };

        AFPMessage {
            protocol: "afp-v1".to_string(),
            id: ulid::Ulid::new().to_string(),
            thread_id: original.thread_id.clone(),
            parent_id: Some(original.id.clone()),
            from: "cli-executor".to_string(),
            to: vec![original.from.clone()],
            timestamp: chrono::Utc::now().to_rfc3339(),
            r#type: "tool_result".to_string(),
            kind: None,
            supertags: vec![],
            subtype: None,
            content: serde_json::Value::Object(Default::default()),
            metadata: Some(serde_json::json!({ "tool_result": tool_result })),
            signature: String::new(),
            encryption: None,
            views: vec![],
            references: vec![],
            typed_refs: vec![],
            attachments: vec![],
            store_in_relational: !tool_call.ephemeral_result,
            prev_hash: None,
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn cli_env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn make_tool_call_msg(command: &str, safe_mode: bool, working_dir: Option<&str>) -> AFPMessage {
        let params = serde_json::json!({
            "command": command,
            "working_dir": working_dir,
            "timeout_seconds": 10,
            "safe_mode": safe_mode,
        });
        let tool_call = AfpToolCallMetadata {
            call_id: "call_test_001".into(),
            connector_family: "cli".into(),
            tool_name: "cli_execute".into(),
            parameters: params,
            ephemeral_result: false,
            mcp_server_url: None,
            a2a_agent_endpoint: None,
        };
        AFPMessage {
            protocol: "afp-v1".to_string(),
            id: "msg_test_001".to_string(),
            thread_id: "thread_test".to_string(),
            from: "master-agent".to_string(),
            to: vec!["cli-executor".to_string()],
            r#type: "tool_call".to_string(),
            kind: None,
            supertags: vec![],
            metadata: Some(serde_json::json!({ "tool_call": tool_call })),
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn safe_mode_blocks_rm_command() {
        let msg = make_tool_call_msg("rm -rf /tmp/test", true, None);
        let result = CliExecutor::execute(&msg).await.unwrap();
        assert_eq!(result.r#type, "tool_result");
        let meta = result.metadata.as_ref().unwrap();
        let tr: AfpToolResultMetadata =
            serde_json::from_value(meta["tool_result"].clone()).unwrap();
        assert_eq!(tr.status, "error");
        assert!(tr.error.as_ref().unwrap().contains("safe_mode"));
    }

    #[tokio::test]
    async fn safe_mode_blocks_sudo_command() {
        let msg = make_tool_call_msg("sudo cat /etc/shadow", true, None);
        let result = CliExecutor::execute(&msg).await.unwrap();
        let meta = result.metadata.as_ref().unwrap();
        let tr: AfpToolResultMetadata =
            serde_json::from_value(meta["tool_result"].clone()).unwrap();
        assert_eq!(tr.status, "error");
        assert!(tr.error.as_ref().unwrap().contains("safe_mode"));
    }

    #[tokio::test]
    async fn safe_mode_blocks_command_substitution_syntax() {
        let msg = make_tool_call_msg("echo $(whoami)", true, None);
        let result = CliExecutor::execute(&msg).await.unwrap();
        let meta = result.metadata.as_ref().unwrap();
        let tr: AfpToolResultMetadata =
            serde_json::from_value(meta["tool_result"].clone()).unwrap();
        assert_eq!(tr.status, "error");
        assert!(
            tr.error.as_ref().unwrap().contains("shell syntax")
                || tr.error.as_ref().unwrap().contains("safe_mode")
        );
    }

    #[tokio::test]
    async fn path_traversal_in_working_dir_is_rejected() {
        let msg = make_tool_call_msg("ls", true, Some("../../etc"));
        let result = CliExecutor::execute(&msg).await.unwrap();
        let meta = result.metadata.as_ref().unwrap();
        let tr: AfpToolResultMetadata =
            serde_json::from_value(meta["tool_result"].clone()).unwrap();
        assert_eq!(tr.status, "error");
        assert!(tr.error.as_ref().unwrap().contains("path traversal"));
    }

    #[tokio::test]
    async fn unsafe_mode_is_rejected_without_server_opt_in() {
        let _guard = cli_env_lock().lock().expect("lock cli env");
        let previous = std::env::var("OMNYID_CLI_ALLOW_UNSAFE_MODE").ok();
        unsafe {
            std::env::remove_var("OMNYID_CLI_ALLOW_UNSAFE_MODE");
        }

        let msg = make_tool_call_msg("echo hello", false, None);
        let result = CliExecutor::execute(&msg).await.unwrap();
        let meta = result.metadata.as_ref().unwrap();
        let tr: AfpToolResultMetadata =
            serde_json::from_value(meta["tool_result"].clone()).unwrap();
        assert_eq!(tr.status, "error");
        assert!(
            tr.error
                .as_ref()
                .unwrap()
                .contains("unsafe cli execution is disabled")
        );

        unsafe {
            if let Some(value) = previous {
                std::env::set_var("OMNYID_CLI_ALLOW_UNSAFE_MODE", value);
            } else {
                std::env::remove_var("OMNYID_CLI_ALLOW_UNSAFE_MODE");
            }
        }
    }

    #[tokio::test]
    async fn unsafe_mode_can_be_explicitly_enabled_by_server_policy() {
        let _guard = cli_env_lock().lock().expect("lock cli env");
        let previous = std::env::var("OMNYID_CLI_ALLOW_UNSAFE_MODE").ok();
        unsafe {
            std::env::set_var("OMNYID_CLI_ALLOW_UNSAFE_MODE", "true");
        }

        let msg = make_tool_call_msg("echo hello", false, None);
        let result = CliExecutor::execute(&msg).await.unwrap();
        let meta = result.metadata.as_ref().unwrap();
        let tr: AfpToolResultMetadata =
            serde_json::from_value(meta["tool_result"].clone()).unwrap();
        assert_eq!(tr.status, "success");

        unsafe {
            if let Some(value) = previous {
                std::env::set_var("OMNYID_CLI_ALLOW_UNSAFE_MODE", value);
            } else {
                std::env::remove_var("OMNYID_CLI_ALLOW_UNSAFE_MODE");
            }
        }
    }

    #[tokio::test]
    async fn wrong_tool_name_returns_err() {
        let mut msg = make_tool_call_msg("ls", false, None);
        // Mutate tool_name to something else
        if let Some(ref mut meta) = msg.metadata {
            if let Some(tc) = meta.get_mut("tool_call") {
                tc["tool_name"] = serde_json::json!("search_web");
            }
        }
        let result = CliExecutor::execute(&msg).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cli_execute"));
    }

    #[tokio::test]
    async fn result_message_has_correct_shape() {
        #[cfg(not(target_os = "windows"))]
        let msg = make_tool_call_msg("printf hello", true, None);
        #[cfg(target_os = "windows")]
        let msg = make_tool_call_msg("where cmd", true, None);
        let result = CliExecutor::execute(&msg).await.unwrap();
        assert_eq!(result.r#type, "tool_result");
        assert_eq!(result.thread_id, "thread_test");
        assert_eq!(result.parent_id.as_deref(), Some("msg_test_001"));
        assert_eq!(result.from, "cli-executor");
        assert_eq!(result.to, vec!["master-agent"]);
        assert!(result.store_in_relational); // ephemeral_result = false
        let meta = result.metadata.as_ref().unwrap();
        let tr: AfpToolResultMetadata =
            serde_json::from_value(meta["tool_result"].clone()).unwrap();
        assert_eq!(tr.call_id, "call_test_001");
        assert_eq!(tr.status, "success");
        let data = tr.data.as_ref().unwrap();
        #[cfg(not(target_os = "windows"))]
        assert!(data["stdout"].as_str().unwrap().contains("hello"));
        #[cfg(target_os = "windows")]
        assert!(
            data["stdout"]
                .as_str()
                .unwrap()
                .to_ascii_lowercase()
                .contains("cmd")
        );
        assert_eq!(data["exit_code"].as_i64().unwrap(), 0);
    }

    #[test]
    fn safe_mode_tokenizer_rejects_shell_metacharacters() {
        let err = tokenize_safe_mode_command("echo hello && whoami").expect_err("should reject");
        assert!(err.contains("shell syntax"));
    }

    #[test]
    fn safe_mode_tokenizer_accepts_simple_argv_style_commands() {
        let argv = tokenize_safe_mode_command("printf hello").expect("argv");
        assert_eq!(argv, vec!["printf".to_string(), "hello".to_string()]);
    }

    #[test]
    fn safe_mode_build_command_uses_direct_process_spawn_when_argv_is_present() {
        let source = include_str!("cli_executor.rs");
        let start = source
            .find("fn build_command(")
            .expect("build_command exists");
        let end = source[start..]
            .find("\n    fn result_msg(")
            .map(|offset| start + offset)
            .expect("result_msg follows build_command");
        let function_source = &source[start..end];

        assert!(function_source.contains("if let Some(argv) = safe_argv"));
        assert!(function_source.contains("Command::new(&argv[0])"));
        assert!(function_source.contains("} else if cfg!(target_os = \"windows\")"));
    }

    #[tokio::test]
    async fn nonzero_exit_code_yields_error_status() {
        // `false` always exits with code 1 on both Linux and Windows
        #[cfg(not(target_os = "windows"))]
        let cmd = "false";
        #[cfg(target_os = "windows")]
        let cmd = "exit 1";
        let msg = make_tool_call_msg(cmd, true, None);
        let result = CliExecutor::execute(&msg).await.unwrap();
        let meta = result.metadata.as_ref().unwrap();
        let tr: AfpToolResultMetadata =
            serde_json::from_value(meta["tool_result"].clone()).unwrap();
        assert_eq!(tr.status, "error");
        let exit_code = tr.data.as_ref().unwrap()["exit_code"].as_i64().unwrap();
        assert_ne!(exit_code, 0);
    }
}
