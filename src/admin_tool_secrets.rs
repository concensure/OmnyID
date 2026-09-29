/*
 * @module-id: rust.admin-tool-secrets
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use std::path::{Path, PathBuf};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AdminToolSecret {
    pub provider_id: &'static str,
    pub label: &'static str,
    pub secret: String,
    pub source: AdminToolSecretSource,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AdminToolSecretSource {
    EnvVar(&'static str),
    File { env_var: &'static str, path: String },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AdminToolSecretStatus {
    pub provider_id: &'static str,
    pub label: &'static str,
    pub configured: bool,
    pub source_label: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AdminToolSecretSpec {
    pub provider_id: &'static str,
    pub label: &'static str,
    pub value_env: &'static [&'static str],
    pub file_env: &'static [&'static str],
}

pub const BRAVE_SEARCH_SPEC: AdminToolSecretSpec = AdminToolSecretSpec {
    provider_id: "brave_search",
    label: "Brave Search",
    value_env: &[
        "OMNYID_ADMIN_BRAVE_SEARCH_API_KEY",
        "OMNYID_BRAVE_SEARCH_API_KEY",
        "BRAVE_SEARCH_API_KEY",
    ],
    file_env: &[
        "OMNYID_ADMIN_BRAVE_SEARCH_API_KEY_FILE",
        "OMNYID_BRAVE_SEARCH_API_KEY_FILE",
        "BRAVE_SEARCH_API_KEY_FILE",
    ],
};

pub const GOOGLE_PLACES_SPEC: AdminToolSecretSpec = AdminToolSecretSpec {
    provider_id: "google_places",
    label: "Google Places API",
    value_env: &[
        "OMNYID_ADMIN_GOOGLE_PLACES_API_KEY",
        "OMNYID_GOOGLE_PLACES_API_KEY",
        "GOOGLE_PLACES_API_KEY",
        "OMNYID_GOOGLE_MAPS_KEY",
    ],
    file_env: &[
        "OMNYID_ADMIN_GOOGLE_PLACES_API_KEY_FILE",
        "OMNYID_GOOGLE_PLACES_API_KEY_FILE",
        "GOOGLE_PLACES_API_KEY_FILE",
        "OMNYID_GOOGLE_MAPS_KEY_FILE",
    ],
};

pub const GOOGLE_MAPS_SPEC: AdminToolSecretSpec = AdminToolSecretSpec {
    provider_id: "google_maps",
    label: "Google Maps Platform",
    value_env: &["OMNYID_ADMIN_GOOGLE_MAPS_KEY", "OMNYID_GOOGLE_MAPS_KEY"],
    file_env: &[
        "OMNYID_ADMIN_GOOGLE_MAPS_KEY_FILE",
        "OMNYID_GOOGLE_MAPS_KEY_FILE",
    ],
};

pub const GOOGLE_CALENDAR_SPEC: AdminToolSecretSpec = AdminToolSecretSpec {
    provider_id: "google_calendar",
    label: "Google Calendar API",
    value_env: &[
        "OMNYID_ADMIN_GOOGLE_CALENDAR_CLIENT_SECRET",
        "OMNYID_GOOGLE_CALENDAR_CLIENT_SECRET",
        "GOOGLE_CALENDAR_CLIENT_SECRET",
        "GOOGLE_CLIENT_SECRET",
    ],
    file_env: &[
        "OMNYID_ADMIN_GOOGLE_CALENDAR_CLIENT_SECRET_FILE",
        "OMNYID_GOOGLE_CALENDAR_CLIENT_SECRET_FILE",
        "GOOGLE_CALENDAR_CLIENT_SECRET_FILE",
        "GOOGLE_CLIENT_SECRET_FILE",
    ],
};

pub const WEATHER_API_SPEC: AdminToolSecretSpec = AdminToolSecretSpec {
    provider_id: "weatherapi",
    label: "WeatherAPI",
    value_env: &[
        "OMNYID_ADMIN_WEATHERAPI_KEY",
        "OMNYID_WEATHERAPI_KEY",
        "WEATHERAPI_KEY",
    ],
    file_env: &[
        "OMNYID_ADMIN_WEATHERAPI_KEY_FILE",
        "OMNYID_WEATHERAPI_KEY_FILE",
        "WEATHERAPI_KEY_FILE",
    ],
};

pub const ANTHROPIC_LLM_SPEC: AdminToolSecretSpec = AdminToolSecretSpec {
    provider_id: "anthropic_llm",
    label: "Anthropic hosted LLM",
    value_env: &[
        "OMNYID_ADMIN_ANTHROPIC_KEY",
        "OMNYID_ANTHROPIC_KEY",
        "ANTHROPIC_API_KEY",
    ],
    file_env: &[
        "OMNYID_ADMIN_ANTHROPIC_KEY_FILE",
        "OMNYID_ANTHROPIC_KEY_FILE",
        "ANTHROPIC_API_KEY_FILE",
    ],
};

pub const OPENAI_LLM_SPEC: AdminToolSecretSpec = AdminToolSecretSpec {
    provider_id: "openai_llm",
    label: "OpenAI-compatible hosted LLM",
    value_env: &[
        "OMNYID_ADMIN_OPENAI_API_KEY",
        "OMNYID_OPENAI_API_KEY",
        "OPENAI_API_KEY",
    ],
    file_env: &[
        "OMNYID_ADMIN_OPENAI_API_KEY_FILE",
        "OMNYID_OPENAI_API_KEY_FILE",
        "OPENAI_API_KEY_FILE",
    ],
};

pub const RUNPOD_LLM_SPEC: AdminToolSecretSpec = AdminToolSecretSpec {
    provider_id: "runpod_llm",
    label: "RunPod hosted LLM",
    value_env: &[
        "OMNYID_ADMIN_RUNPOD_API_KEY",
        "OMNYID_RUNPOD_API_KEY",
        "RUNPOD_API_KEY",
    ],
    file_env: &[
        "OMNYID_ADMIN_RUNPOD_API_KEY_FILE",
        "OMNYID_RUNPOD_API_KEY_FILE",
        "RUNPOD_API_KEY_FILE",
    ],
};

pub const NVIDIA_LLM_SPEC: AdminToolSecretSpec = AdminToolSecretSpec {
    provider_id: "nvidia_llm",
    label: "NVIDIA NIM hosted LLM",
    value_env: &[
        "OMNYID_ADMIN_NVIDIA_API_KEY",
        "OMNYID_NVIDIA_API_KEY",
        "NVIDIA_API_KEY",
    ],
    file_env: &[
        "OMNYID_ADMIN_NVIDIA_API_KEY_FILE",
        "OMNYID_NVIDIA_API_KEY_FILE",
        "NVIDIA_API_KEY_FILE",
    ],
};

pub const STRIPE_SPEC: AdminToolSecretSpec = AdminToolSecretSpec {
    provider_id: "stripe",
    label: "Stripe",
    value_env: &[
        "OMNYID_ADMIN_STRIPE_SECRET_KEY",
        "OMNYID_STRIPE_SECRET_KEY",
        "STRIPE_SECRET_KEY",
    ],
    file_env: &[
        "OMNYID_ADMIN_STRIPE_SECRET_KEY_FILE",
        "OMNYID_STRIPE_SECRET_KEY_FILE",
        "STRIPE_SECRET_KEY_FILE",
    ],
};

pub const TWILIO_SPEC: AdminToolSecretSpec = AdminToolSecretSpec {
    provider_id: "twilio",
    label: "Twilio Messaging",
    value_env: &[
        "OMNYID_ADMIN_TWILIO_AUTH_TOKEN",
        "OMNYID_TWILIO_AUTH_TOKEN",
        "TWILIO_AUTH_TOKEN",
    ],
    file_env: &[
        "OMNYID_ADMIN_TWILIO_AUTH_TOKEN_FILE",
        "OMNYID_TWILIO_AUTH_TOKEN_FILE",
        "TWILIO_AUTH_TOKEN_FILE",
    ],
};

pub const CLOUDINARY_SPEC: AdminToolSecretSpec = AdminToolSecretSpec {
    provider_id: "cloudinary",
    label: "Cloudinary",
    value_env: &[
        "OMNYID_ADMIN_CLOUDINARY_API_SECRET",
        "OMNYID_CLOUDINARY_API_SECRET",
        "CLOUDINARY_API_SECRET",
    ],
    file_env: &[
        "OMNYID_ADMIN_CLOUDINARY_API_SECRET_FILE",
        "OMNYID_CLOUDINARY_API_SECRET_FILE",
        "CLOUDINARY_API_SECRET_FILE",
    ],
};

pub const WEDDING_ADMIN_TOOL_SPECS: &[AdminToolSecretSpec] = &[
    BRAVE_SEARCH_SPEC,
    GOOGLE_PLACES_SPEC,
    GOOGLE_MAPS_SPEC,
    GOOGLE_CALENDAR_SPEC,
    WEATHER_API_SPEC,
    ANTHROPIC_LLM_SPEC,
    OPENAI_LLM_SPEC,
    RUNPOD_LLM_SPEC,
    NVIDIA_LLM_SPEC,
    STRIPE_SPEC,
    TWILIO_SPEC,
    CLOUDINARY_SPEC,
];

fn clean_secret(value: String) -> Option<String> {
    let value = value.trim().to_string();
    (!value.is_empty() && !value.chars().any(char::is_control)).then_some(value)
}

fn clean_path(value: String) -> Option<PathBuf> {
    let value = value.trim();
    if value.is_empty() || value.chars().any(char::is_control) {
        return None;
    }
    Some(PathBuf::from(value))
}

fn read_secret_file(path: &Path) -> Option<String> {
    std::fs::read_to_string(path).ok().and_then(clean_secret)
}

pub fn resolve_admin_tool_secret(spec: AdminToolSecretSpec) -> Option<AdminToolSecret> {
    for env_var in spec.file_env {
        let Some(path) = std::env::var(env_var).ok().and_then(clean_path) else {
            continue;
        };
        let Some(secret) = read_secret_file(&path) else {
            continue;
        };
        return Some(AdminToolSecret {
            provider_id: spec.provider_id,
            label: spec.label,
            secret,
            source: AdminToolSecretSource::File {
                env_var,
                path: path.display().to_string(),
            },
        });
    }
    for env_var in spec.value_env {
        let Some(secret) = std::env::var(env_var).ok().and_then(clean_secret) else {
            continue;
        };
        return Some(AdminToolSecret {
            provider_id: spec.provider_id,
            label: spec.label,
            secret,
            source: AdminToolSecretSource::EnvVar(env_var),
        });
    }
    None
}

pub fn admin_tool_secret_status(spec: AdminToolSecretSpec) -> AdminToolSecretStatus {
    let resolved = resolve_admin_tool_secret(spec);
    AdminToolSecretStatus {
        provider_id: spec.provider_id,
        label: spec.label,
        configured: resolved.is_some(),
        source_label: resolved.map(|secret| match secret.source {
            AdminToolSecretSource::EnvVar(env_var) => format!("env:{env_var}"),
            AdminToolSecretSource::File { env_var, .. } => format!("file:{env_var}"),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
            .lock()
            .expect("env lock")
    }

    fn clear_google_places_secret_env() {
        for key in GOOGLE_PLACES_SPEC
            .value_env
            .iter()
            .chain(GOOGLE_PLACES_SPEC.file_env.iter())
        {
            unsafe {
                std::env::remove_var(key);
            }
        }
    }

    #[test]
    fn secret_status_does_not_expose_value() {
        let status = AdminToolSecretStatus {
            provider_id: "weatherapi",
            label: "WeatherAPI",
            configured: true,
            source_label: Some("env:OMNYID_ADMIN_WEATHERAPI_KEY".to_string()),
        };
        let debug = format!("{status:?}");
        assert!(!debug.contains("super-secret-key"));
        assert!(debug.contains("OMNYID_ADMIN_WEATHERAPI_KEY"));
    }

    #[test]
    fn resolver_prefers_file_backed_names() {
        assert!(GOOGLE_PLACES_SPEC.file_env[0].contains("ADMIN"));
        assert!(GOOGLE_PLACES_SPEC.value_env[0].contains("ADMIN"));
        assert_eq!(GOOGLE_PLACES_SPEC.provider_id, "google_places");
    }

    #[test]
    fn resolver_accepts_provider_native_google_places_key_env() {
        let _env = env_lock();
        clear_google_places_secret_env();
        unsafe {
            std::env::set_var("GOOGLE_PLACES_API_KEY", "secret-google-places-key");
        }

        let resolved = resolve_admin_tool_secret(GOOGLE_PLACES_SPEC).expect("google places key");

        assert_eq!(resolved.secret, "secret-google-places-key");
        assert_eq!(
            resolved.source,
            AdminToolSecretSource::EnvVar("GOOGLE_PLACES_API_KEY")
        );
        unsafe {
            std::env::remove_var("GOOGLE_PLACES_API_KEY");
        }
    }

    #[test]
    fn resolver_accepts_provider_native_google_places_key_file_env() {
        let _env = env_lock();
        clear_google_places_secret_env();
        let path = std::env::temp_dir().join(format!(
            "omnyid-google-places-secret-{}.txt",
            std::process::id()
        ));
        std::fs::write(&path, "secret-google-places-file-key\n").expect("write secret file");
        unsafe {
            std::env::set_var("GOOGLE_PLACES_API_KEY_FILE", path.display().to_string());
        }

        let resolved =
            resolve_admin_tool_secret(GOOGLE_PLACES_SPEC).expect("google places file key");

        assert_eq!(resolved.secret, "secret-google-places-file-key");
        assert!(matches!(
            resolved.source,
            AdminToolSecretSource::File {
                env_var: "GOOGLE_PLACES_API_KEY_FILE",
                ..
            }
        ));
        unsafe {
            std::env::remove_var("GOOGLE_PLACES_API_KEY_FILE");
        }
        let _ = std::fs::remove_file(path);
    }
}
