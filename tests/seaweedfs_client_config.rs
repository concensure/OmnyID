//! Regression evidence for constructing the SeaweedFS S3 client.
//!
//! AWS SDK v1 requires an explicit behaviour version for a service config.
//! Without one, `Client::from_conf` panics before any network request is made.

use omnyid_homeserver::daemon_runtime::seaweedfs_client;

#[test]
fn seaweedfs_client_uses_an_explicit_aws_behavior_version() {
    // This integration-test binary contains only this test, so its temporary
    // process environment cannot race another test in the same process.
    unsafe {
        std::env::set_var("OMNYID_SEAWEEDFS_S3_ENDPOINT", "http://127.0.0.1:8333");
        std::env::set_var("OMNYID_SEAWEEDFS_ACCESS_KEY", "synthetic-access-key");
        std::env::set_var("OMNYID_SEAWEEDFS_SECRET_KEY", "synthetic-secret-key");
        std::env::set_var("OMNYID_SEAWEEDFS_BUCKET", "synthetic-test-bucket");
    }

    assert!(seaweedfs_client().is_some());
}
