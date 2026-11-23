/*
 * @module-id: rust.noise-channel
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Noise Protocol transport layer for OmnyID agent-to-agent sessions.
///
/// Implements the Noise_XX_25519_ChaChaPoly_BLAKE2s pattern which provides:
///   - Mutual authentication (both peers verify each other's static keys)
///   - Forward secrecy via ephemeral Diffie-Hellman
///   - Identity hiding (static keys are encrypted during handshake)
///
/// # Usage
///
/// **Initiator side** (agent opening a new relay session):
/// ```ignore
/// let static_keypair = NoiseKeypair::generate();
/// let mut handshake = NoiseHandshake::initiator(&static_keypair, remote_static_pubkey)?;
/// let msg1 = handshake.write_message(&[])?;      // send to responder
/// handshake.read_message(&msg2_from_responder)?;  // receive reply
/// let msg3 = handshake.write_message(&[])?;       // send final message
/// let transport = handshake.into_transport()?;
/// ```
///
/// **Responder side** (homeserver accepting a relay connection):
/// ```ignore
/// let static_keypair = NoiseKeypair::generate();
/// let mut handshake = NoiseHandshake::responder(&static_keypair)?;
/// handshake.read_message(&msg1_from_initiator)?;
/// let msg2 = handshake.write_message(&[])?;
/// handshake.read_message(&msg3_from_initiator)?;
/// let transport = handshake.into_transport()?;
/// ```
use snow::{Builder, HandshakeState, TransportState, params::NoiseParams};

/// Noise_XX pattern with X25519 DH, ChaCha20-Poly1305 AEAD, and BLAKE2s hash.
const NOISE_PATTERN: &str = "Noise_XX_25519_ChaChaPoly_BLAKE2s";

/// Maximum Noise transport message size (spec limit).
const MAX_MESSAGE_LEN: usize = 65535;

#[derive(Debug)]
pub struct NoiseError(String);

impl std::fmt::Display for NoiseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "NoiseError: {}", self.0)
    }
}

impl From<snow::Error> for NoiseError {
    fn from(e: snow::Error) -> Self {
        NoiseError(e.to_string())
    }
}

/// A Noise static keypair (X25519).
pub struct NoiseKeypair {
    pub public: Vec<u8>,
    pub private: Vec<u8>,
}

impl NoiseKeypair {
    /// Generate a fresh ephemeral static keypair.
    pub fn generate() -> Result<Self, NoiseError> {
        let params: NoiseParams = NOISE_PATTERN
            .parse()
            .map_err(|e: snow::Error| NoiseError(e.to_string()))?;
        let keypair = Builder::new(params)
            .generate_keypair()
            .map_err(NoiseError::from)?;
        Ok(NoiseKeypair {
            public: keypair.public,
            private: keypair.private,
        })
    }

    /// Reconstruct from serialised bytes (e.g., from secure storage).
    pub fn from_bytes(private: Vec<u8>, public: Vec<u8>) -> Self {
        NoiseKeypair { public, private }
    }
}

/// Noise handshake state machine.
pub struct NoiseHandshake {
    state: HandshakeState,
}

impl NoiseHandshake {
    /// Create an initiator handshake.
    /// `remote_static_pubkey` is the responder's known public key (from AgentCard).
    pub fn initiator(
        local_keypair: &NoiseKeypair,
        remote_static_pubkey: &[u8],
    ) -> Result<Self, NoiseError> {
        let params: NoiseParams = NOISE_PATTERN
            .parse()
            .map_err(|e: snow::Error| NoiseError(e.to_string()))?;
        let state = Builder::new(params)
            .local_private_key(&local_keypair.private)
            .remote_public_key(remote_static_pubkey)
            .build_initiator()
            .map_err(NoiseError::from)?;
        Ok(NoiseHandshake { state })
    }

    /// Create a responder handshake.
    /// The remote key is authenticated during the handshake itself (XX pattern).
    pub fn responder(local_keypair: &NoiseKeypair) -> Result<Self, NoiseError> {
        let params: NoiseParams = NOISE_PATTERN
            .parse()
            .map_err(|e: snow::Error| NoiseError(e.to_string()))?;
        let state = Builder::new(params)
            .local_private_key(&local_keypair.private)
            .build_responder()
            .map_err(NoiseError::from)?;
        Ok(NoiseHandshake { state })
    }

    /// Write the next handshake message (optionally embedding a payload).
    pub fn write_message(&mut self, payload: &[u8]) -> Result<Vec<u8>, NoiseError> {
        let mut buf = vec![0u8; MAX_MESSAGE_LEN];
        let len = self
            .state
            .write_message(payload, &mut buf)
            .map_err(NoiseError::from)?;
        buf.truncate(len);
        Ok(buf)
    }

    /// Consume the next handshake message from the remote peer.
    pub fn read_message(&mut self, message: &[u8]) -> Result<Vec<u8>, NoiseError> {
        let mut buf = vec![0u8; MAX_MESSAGE_LEN];
        let len = self
            .state
            .read_message(message, &mut buf)
            .map_err(NoiseError::from)?;
        buf.truncate(len);
        Ok(buf)
    }

    /// Returns true when the handshake is complete and ready to transition.
    pub fn is_handshake_finished(&self) -> bool {
        self.state.is_handshake_finished()
    }

    /// Returns the remote peer's authenticated static public key.
    /// Only valid after handshake completion.
    pub fn remote_static_pubkey(&self) -> Option<&[u8]> {
        self.state.get_remote_static()
    }

    /// Transition to transport mode.  Must be called only after the handshake
    /// is complete (`is_handshake_finished() == true`).
    pub fn into_transport(self) -> Result<NoiseTransport, NoiseError> {
        let transport = self.state.into_transport_mode().map_err(NoiseError::from)?;
        Ok(NoiseTransport { state: transport })
    }
}

/// Established Noise transport â€” encrypts/decrypts application messages.
pub struct NoiseTransport {
    state: TransportState,
}

impl NoiseTransport {
    /// Encrypt a plaintext application message.  Returns the ciphertext frame.
    pub fn encrypt(&mut self, plaintext: &[u8]) -> Result<Vec<u8>, NoiseError> {
        let mut buf = vec![0u8; plaintext.len() + 16]; // + MAC
        let len = self
            .state
            .write_message(plaintext, &mut buf)
            .map_err(NoiseError::from)?;
        buf.truncate(len);
        Ok(buf)
    }

    /// Decrypt an inbound ciphertext frame.  Returns the plaintext.
    pub fn decrypt(&mut self, ciphertext: &[u8]) -> Result<Vec<u8>, NoiseError> {
        let mut buf = vec![0u8; ciphertext.len()];
        let len = self
            .state
            .read_message(ciphertext, &mut buf)
            .map_err(NoiseError::from)?;
        buf.truncate(len);
        Ok(buf)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Full Noise_XX handshake + transport round-trip between two in-process peers.
    #[test]
    fn xx_handshake_and_transport_round_trip() {
        let alice_kp = NoiseKeypair::generate().unwrap();
        let bob_kp = NoiseKeypair::generate().unwrap();

        let mut alice = NoiseHandshake::initiator(&alice_kp, &bob_kp.public).unwrap();
        let mut bob = NoiseHandshake::responder(&bob_kp).unwrap();

        // XX: -> e
        let msg1 = alice.write_message(&[]).unwrap();
        bob.read_message(&msg1).unwrap();

        // XX: <- e, ee, s, es
        let msg2 = bob.write_message(&[]).unwrap();
        alice.read_message(&msg2).unwrap();

        // XX: -> s, se
        let msg3 = alice.write_message(&[]).unwrap();
        bob.read_message(&msg3).unwrap();

        assert!(alice.is_handshake_finished());
        assert!(bob.is_handshake_finished());

        // Verify mutual authentication â€” each peer sees the other's static key
        assert_eq!(
            alice.remote_static_pubkey().unwrap(),
            bob_kp.public.as_slice()
        );
        assert_eq!(
            bob.remote_static_pubkey().unwrap(),
            alice_kp.public.as_slice()
        );

        let mut alice_transport = alice.into_transport().unwrap();
        let mut bob_transport = bob.into_transport().unwrap();

        // Alice sends â†’ Bob decrypts
        let plaintext = b"hello from alice";
        let ciphertext = alice_transport.encrypt(plaintext).unwrap();
        let decrypted = bob_transport.decrypt(&ciphertext).unwrap();
        assert_eq!(decrypted, plaintext);

        // Bob sends â†’ Alice decrypts
        let reply = b"hello from bob";
        let ciphertext2 = bob_transport.encrypt(reply).unwrap();
        let decrypted2 = alice_transport.decrypt(&ciphertext2).unwrap();
        assert_eq!(decrypted2, reply);
    }

    #[test]
    fn tampered_ciphertext_is_rejected() {
        let alice_kp = NoiseKeypair::generate().unwrap();
        let bob_kp = NoiseKeypair::generate().unwrap();

        let mut alice = NoiseHandshake::initiator(&alice_kp, &bob_kp.public).unwrap();
        let mut bob = NoiseHandshake::responder(&bob_kp).unwrap();

        let msg1 = alice.write_message(&[]).unwrap();
        bob.read_message(&msg1).unwrap();
        let msg2 = bob.write_message(&[]).unwrap();
        alice.read_message(&msg2).unwrap();
        let msg3 = alice.write_message(&[]).unwrap();
        bob.read_message(&msg3).unwrap();

        let mut alice_transport = alice.into_transport().unwrap();
        let mut bob_transport = bob.into_transport().unwrap();

        let mut ciphertext = alice_transport.encrypt(b"secret data").unwrap();
        // Flip a byte in the ciphertext to simulate tampering
        if let Some(byte) = ciphertext.last_mut() {
            *byte ^= 0xFF;
        }
        let result = bob_transport.decrypt(&ciphertext);
        assert!(result.is_err(), "tampered ciphertext must be rejected");
    }
}
