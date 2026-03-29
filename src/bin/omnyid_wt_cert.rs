use std::{env, path::PathBuf};

use wtransport::{Identity, tls::Sha256DigestFmt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = env::args().skip(1);
    let first_arg = args.next();
    if matches!(first_arg.as_deref(), Some("-h" | "--help")) {
        print_help();
        return Ok(());
    }

    let output_dir = first_arg
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("secrets/dev-webtransport"));
    let sans = collect_subject_alt_names(args.collect());

    let identity = Identity::self_signed(&sans)?;
    tokio::fs::create_dir_all(&output_dir).await?;

    let cert_path = output_dir.join("wt-cert.pem");
    let key_path = output_dir.join("wt-key.pem");
    identity
        .certificate_chain()
        .store_pemfile(&cert_path)
        .await?;
    identity
        .private_key()
        .store_secret_pemfile(&key_path)
        .await?;

    let primary_cert = identity
        .certificate_chain()
        .as_slice()
        .first()
        .ok_or("generated identity did not contain a certificate")?;
    let digest = primary_cert.hash().fmt(Sha256DigestFmt::DottedHex);

    println!("Generated Omnyid WebTransport development certificate.");
    println!("Certificate: {}", cert_path.display());
    println!("Private key: {}", key_path.display());
    println!("Certificate SHA-256: {digest}");
    println!("Suggested env:");
    println!("OMNYID_ENABLE_WEBTRANSPORT=true");
    println!("OMNYID_WEBTRANSPORT_CERT_PATH={}", cert_path.display());
    println!("OMNYID_WEBTRANSPORT_KEY_PATH={}", key_path.display());

    Ok(())
}

fn print_help() {
    println!("omnyid_wt_cert [output_dir] [san1 san2 ...]");
    println!("Generates a self-signed WebTransport development certificate and private key.");
    println!("Default output directory: secrets/dev-webtransport");
    println!("Default SANs: example.com, relay.example.com");
}

fn collect_subject_alt_names(input: Vec<String>) -> Vec<String> {
    if input.is_empty() {
        return vec![
            "example.com".to_string(),
            "relay.example.com".to_string(),
        ];
    }

    input
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect()
}
