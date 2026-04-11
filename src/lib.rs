pub mod afp {
    tonic::include_proto!("afp");
}

pub mod agent_id;
pub mod agent_template;
pub mod agentcard;
pub mod audit_chain;
pub mod crypto;
pub mod db;
pub mod differential_privacy;
pub mod export;
pub mod federation;
pub mod gateway;
pub mod inference;
pub mod integration;
pub mod local_sync;
pub mod master_orchestrator;
pub mod mcp_server;
pub mod message;
pub mod metrics;
pub mod personalization;
pub mod policy_engine;
pub mod post_quantum;
pub mod query;
pub mod relay;
pub mod secret_manager;
pub mod server;
pub mod summarizer;
pub mod sync_worker;
pub mod webauthn;
pub mod workflow_supervisor;
