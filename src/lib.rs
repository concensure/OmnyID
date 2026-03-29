pub mod afp {
    tonic::include_proto!("afp");
}

pub mod agent_id;
pub mod agentcard;
pub mod crypto;
pub mod federation;
pub mod integration;
pub mod local_sync;
pub mod message;
pub mod relay;
pub mod server;
