use hmac::{Hmac, Mac};
use rand::rngs::OsRng;
use rand::RngCore;
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

pub const DEFAULT_PBKDF2_ITERATIONS: u32 = 100_000;
const MIN_ALLOWED_ITERATIONS: u32 = 10_000;
const MAX_ALLOWED_ITERATIONS: u32 = 2_000_000;

fn configured_pbkdf2_iterations() -> u32 {
    std::env::var("CFITNESS_PBKDF2_ITERATIONS")
        .ok()
        .and_then(|v| v.trim().parse::<u32>().ok())
        .unwrap_or(DEFAULT_PBKDF2_ITERATIONS)
        .clamp(MIN_ALLOWED_ITERATIONS, MAX_ALLOWED_ITERATIONS)
}

fn pbkdf2_sha256_32(password: &[u8], salt: &[u8], iterations: u32) -> [u8; 32] {
    let mut initial = Vec::with_capacity(salt.len() + 4);
    initial.extend_from_slice(salt);
    initial.extend_from_slice(&1u32.to_be_bytes());

    let mut mac =
        HmacSha256::new_from_slice(password).expect("HMAC-SHA256 accepte toute taille de clé");
    mac.update(&initial);
    let mut u: [u8; 32] = mac.finalize().into_bytes().into();
    let mut t = u;

    for _ in 1..iterations {
        let mut mac =
            HmacSha256::new_from_slice(password).expect("HMAC-SHA256 accepte toute taille de clé");
        mac.update(&u);
        u = mac.finalize().into_bytes().into();
        for (dst, src) in t.iter_mut().zip(u.iter()) {
            *dst ^= *src;
        }
    }

    t
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

pub fn hash_password(password: &str) -> String {
    hash_password_with_iterations(password, configured_pbkdf2_iterations())
}

pub fn hash_password_with_iterations(password: &str, iterations: u32) -> String {
    let safe_iterations = iterations.clamp(MIN_ALLOWED_ITERATIONS, MAX_ALLOWED_ITERATIONS);
    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    let dk = pbkdf2_sha256_32(password.as_bytes(), &salt, safe_iterations);
    format!(
        "pbkdf2_sha256${}${}${}",
        safe_iterations,
        hex::encode(salt),
        hex::encode(dk)
    )
}

pub fn verify_password_hash(password: &str, encoded: &str) -> bool {
    let parts: Vec<&str> = encoded.split('$').collect();
    if parts.len() != 4 || parts[0] != "pbkdf2_sha256" {
        return false;
    }
    let Ok(iterations) = parts[1].parse::<u32>() else {
        return false;
    };
    if !(MIN_ALLOWED_ITERATIONS..=MAX_ALLOWED_ITERATIONS).contains(&iterations) {
        return false;
    }
    let Ok(salt) = hex::decode(parts[2]) else {
        return false;
    };
    let Ok(expected_dk) = hex::decode(parts[3]) else {
        return false;
    };
    if salt.len() < 8 || expected_dk.len() != 32 {
        return false;
    }
    let computed = pbkdf2_sha256_32(password.as_bytes(), &salt, iterations);
    constant_time_eq(&computed, &expected_dk)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pbkdf2_matches_rfc7914_test_vectors() {
        // RFC 7914 / NIST PBKDF2-HMAC-SHA256: "password", "salt", 1 & 4096 itérations
        let dk1 = pbkdf2_sha256_32(b"password", b"salt", 1);
        assert_eq!(
            hex::encode(dk1),
            "120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b"
        );
        let dk4096 = pbkdf2_sha256_32(b"password", b"salt", 4096);
        assert_eq!(
            hex::encode(dk4096),
            "c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a"
        );
    }

    #[test]
    fn password_hash_uses_unique_salts_and_rejects_bad_secrets_or_formats() {
        let h1 = hash_password_with_iterations("CFitnessProd!2026", MIN_ALLOWED_ITERATIONS);
        let h2 = hash_password_with_iterations("CFitnessProd!2026", MIN_ALLOWED_ITERATIONS);
        assert_ne!(h1, h2);
        assert!(h1.starts_with("pbkdf2_sha256$10000$"));
        assert!(verify_password_hash("CFitnessProd!2026", &h1));
        assert!(verify_password_hash("CFitnessProd!2026", &h2));
        assert!(!verify_password_hash("MauvaisMotDePasse!", &h1));
        assert!(!verify_password_hash("CFitnessProd!2026", "invalid-format"));
        assert!(!verify_password_hash(
            "CFitnessProd!2026",
            "pbkdf2_sha256$1$0011223344556677$00"
        ));
    }

    #[test]
    fn constant_time_equality_compares_all_bytes_strictly() {
        assert!(constant_time_eq(b"abcdef", b"abcdef"));
        assert!(!constant_time_eq(b"abcdef", b"abcdeg"));
        assert!(!constant_time_eq(b"abcdef", b"abcde"));
    }
}
