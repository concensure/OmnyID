use tracing_subscriber;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    omnyid_homeserver::server::run().await;
}
