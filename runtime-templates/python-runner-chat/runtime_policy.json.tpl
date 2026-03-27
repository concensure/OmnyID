{
  "runtime_mode": "signed_in_hosted",
  "runtime_family": "python-runner-chat",
  "agent_id": "{{PRIMARY_AGENT_ID}}",
  "owner_user_id": "{{OWNER_USER_ID}}",
  "owner_email": "{{OWNER_EMAIL}}",
  "chat_port": {{CHAT_PORT}},
  "sandbox_policy": {
    "runtime_isolation": "per_workspace_container",
    "run_as_non_root": true,
    "read_only_root_filesystem": true,
    "no_new_privileges": true,
    "cap_drop": ["ALL"],
    "seccomp_profile": "docker-default",
    "apparmor_profile": "docker-default",
    "docker_socket_mount": false,
    "host_networking": false,
    "writable_mounts": [
      "/workspace/data/files",
      "/workspace/data/db",
      "/workspace/data/vector",
      "/workspace/logs",
      "/tmp"
    ]
  },
  "resource_policy": {
    "interactive": {
      "cpu_limit": "{{CPU_LIMIT}}",
      "memory_limit": "{{MEMORY_LIMIT}}",
      "pids_limit": {{PIDS_LIMIT}},
      "max_runtime_seconds": {{MAX_RUNTIME_SECONDS}}
    },
    "background": {
      "max_runtime_seconds": {{BACKGROUND_MAX_RUNTIME_SECONDS}}
    },
    "recycle_policy": {
      "recycle_after_hours": 24,
      "recycle_after_runs": 100
    }
  },
  "network_policy": {
    "mode": "application_allowlist",
    "default": "deny",
    "generic_http_requires_allowlist": true,
    "allowed_hosts": [
      "api.omnyid.com",
      "wt.omnyid.com"
    ]
  },
  "model_policy": {
    "mode": "omnyid_managed_default",
    "byok_available": true,
    "trial_mode": false,
    "default_provider": "omnyid_managed",
    "default_model": "gpt-5.4-mini",
    "allowed_providers": [
      "omnyid_managed",
      "openai",
      "ollama"
    ],
    "allowed_models": [
      "gpt-5.4-mini",
      "gpt-5.4",
      "ollama/local"
    ],
    "per_run_input_token_cap": 16000,
    "per_run_output_token_cap": 4000,
    "daily_spend_cap_usd": 5.0,
    "monthly_spend_cap_usd": 25.0
  },
  "tool_policy": {
    "web": {
      "enabled": true,
      "allowlisted_hosts": []
    },
    "google_api": {
      "enabled": false,
      "allowlisted_hosts": [
        "googleapis.com",
        "www.googleapis.com"
      ]
    },
    "stripe": {
      "enabled": false,
      "allowlisted_hosts": [
        "api.stripe.com"
      ]
    },
    "file_access": {
      "enabled": true
    },
    "vector_store": {
      "enabled": true,
      "engine": "chromadb"
    },
    "simple_db": {
      "enabled": true,
      "engine": "duckdb"
    },
    "scheduler": {
      "enabled": true
    },
    "afp_agent": {
      "enabled": true
    }
  },
  "review_required_capabilities": [
    "ecommerce",
    "stripe",
    "google_api",
    "web_browse",
    "python_sandbox",
    "file_ops"
  ],
  "channel_policy": {
    "web_chat": {
      "enabled": true
    },
    "api_endpoint": {
      "enabled": true
    },
    "afp_agent_endpoint": {
      "enabled": true
    }
  },
  "governance": {
    "roles": [
      "owner",
      "operator",
      "viewer"
    ],
    "support_access_default": "disabled"
  },
  "audit_scope": [
    "deploy",
    "tool_policy",
    "model_policy",
    "prompt_versions",
    "support_access"
  ]
}
