use ed25519_dalek::SigningKey;
use rand::RngCore;

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn main() {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    let format = args
        .windows(2)
        .find(|pair| pair[0] == "--format")
        .map(|pair| pair[1].as_str())
        .unwrap_or("env");

    let mut signing_seed = [0u8; 32];
    let mut encryption_key = [0u8; 32];
    rand::rng().fill_bytes(&mut signing_seed);
    rand::rng().fill_bytes(&mut encryption_key);

    let signing_key = SigningKey::from_bytes(&signing_seed);
    let public_key = signing_key.verifying_key().to_bytes();

    let payload = serde_json::json!({
        "OMNYID_SIGNING_KEY_HEX": hex(&signing_seed),
        "OMNYID_PUBLIC_KEY_HEX": hex(&public_key),
        "OMNYID_ENCRYPTION_KEY_HEX": hex(&encryption_key),
        "OMNYID_ENCRYPT_BY_DEFAULT": "true",
        "OMNYID_REQUIRE_ENCRYPTION": "true",
        "OMNYID_ALLOW_INSECURE_UNSIGNED": "false"
    });

    if format == "json" {
        println!(
            "{}",
            serde_json::to_string_pretty(&payload).expect("json serialization")
        );
        return;
    }

    let object = payload.as_object().expect("payload object");
    for (key, value) in object {
        println!("{key}={}", value.as_str().unwrap_or_default());
    }
}
