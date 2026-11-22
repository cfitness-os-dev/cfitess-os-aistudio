use crate::clock_terminals::{authenticate_terminal, authenticated_employee};
use crate::models::AppDatabaseState;
use crate::rbac::{can_access_site_scope, evaluate_permission, PermissionTarget};
use crate::routes::{append_audit, err_resp, SharedState};
use crate::seed::persist_state;
use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    response::Response,
    Json,
};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path as FsPath, PathBuf};

type Failure = (StatusCode, Json<Value>);

const MIN_PHOTO_BYTES: usize = 16;
const MAX_PHOTO_BYTES: usize = 512 * 1024; // 512 Ko max
const PHOTO_TTL_SECONDS: i64 = 120; // 2 minutes entre capture et pointage

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PunchPhotoRecord {
    pub id: String,
    pub site_id: String,
    pub terminal_id: String,
    pub employee_id: String,
    pub content_type: String,
    pub file_name: String,
    pub byte_size: usize,
    pub sha256_hex: String,
    pub captured_at: String,
    pub expires_at: String,
    pub consumed_at: Option<String>,
    pub consumed_by_entry_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CapturePhotoPayload {
    pub image_base64: String,
}

fn club_site(raw: &str) -> Result<(&'static str, &'static str), Failure> {
    match raw {
        "carre-de-soie" | "club-carre-soie" => Ok(("carre-de-soie", "club-carre-soie")),
        "beynost" | "club-beynost" => Ok(("beynost", "club-beynost")),
        _ => Err(err_resp(StatusCode::BAD_REQUEST, "Club inconnu.")),
    }
}

/// Décodeur Base64 standard (RFC 4648) sans dépendance externe.
fn decode_base64_strict(input: &str) -> Result<Vec<u8>, Failure> {
    let trimmed = input.trim();
    let payload = if let Some(idx) = trimmed.find(";base64,") {
        &trimmed[idx + 8..]
    } else {
        trimmed
    };
    let clean: Vec<u8> = payload
        .bytes()
        .filter(|b| !b.is_ascii_whitespace())
        .collect();
    if clean.is_empty() || clean.len() % 4 != 0 {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Encodage Base64 de la photo invalide.",
        ));
    }

    let val = |c: u8| -> Option<u8> {
        match c {
            b'A'..=b'Z' => Some(c - b'A'),
            b'a'..=b'z' => Some(c - b'a' + 26),
            b'0'..=b'9' => Some(c - b'0' + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    };

    let mut out = Vec::with_capacity((clean.len() / 4) * 3);
    for chunk in clean.chunks_exact(4) {
        let a = val(chunk[0])
            .ok_or_else(|| err_resp(StatusCode::BAD_REQUEST, "Caractère Base64 invalide."))?;
        let b = val(chunk[1])
            .ok_or_else(|| err_resp(StatusCode::BAD_REQUEST, "Caractère Base64 invalide."))?;
        out.push((a << 2) | (b >> 4));
        if chunk[2] != b'=' {
            let c = val(chunk[2])
                .ok_or_else(|| err_resp(StatusCode::BAD_REQUEST, "Caractère Base64 invalide."))?;
            out.push((b << 4) | (c >> 2));
            if chunk[3] != b'=' {
                let d = val(chunk[3]).ok_or_else(|| {
                    err_resp(StatusCode::BAD_REQUEST, "Caractère Base64 invalide.")
                })?;
                out.push((c << 6) | d);
            }
        } else if chunk[3] != b'=' {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Padding Base64 invalide.",
            ));
        }
    }
    Ok(out)
}

/// Détection stricte du format image par magic bytes (JPEG, PNG ou WebP).
fn detect_image_format(bytes: &[u8]) -> Option<(&'static str, &'static str)> {
    if bytes.len() >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF {
        return Some(("image/jpeg", "jpg"));
    }
    if bytes.len() >= 8
        && bytes[0..8] == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
    {
        return Some(("image/png", "png"));
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some(("image/webp", "webp"));
    }
    None
}

fn photo_disk_path(data_dir: &FsPath, site_id: &str, file_name: &str) -> PathBuf {
    data_dir.join("punch_photos").join(site_id).join(file_name)
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

/// Capture et stockage privé d'une preuve photo depuis un terminal appairé.
pub async fn post_capture_punch_photo(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<CapturePhotoPayload>,
) -> Result<Json<Value>, Failure> {
    let actor_id = authenticated_employee(&state, &headers).await?;
    let mut db = state.db.write().await;
    let terminal = authenticate_terminal(&db, &headers).await?;

    let short_club = match terminal.site_id.as_str() {
        "club-carre-soie" => "carre-de-soie",
        "club-beynost" => "beynost",
        _ => {
            return Err(err_resp(
                StatusCode::FORBIDDEN,
                "L'établissement de cet appareil n'est pas reconnu.",
            ))
        }
    };

    let Some(employee) = db.employees.iter().find(|e| e.id == actor_id) else {
        return Err(err_resp(StatusCode::NOT_FOUND, "Collaborateur introuvable."));
    };
    if !employee.active || !can_access_site_scope(&db, &actor_id, &terminal.site_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Vous n'avez pas d'affectation active dans ce club.",
        ));
    }
    let pol = crate::clock_policy::policy(&db, &actor_id, short_club);
    if !pol.terminal_allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Votre profil ne dispose pas du droit de pointage sur les terminaux de ce club.",
        ));
    }

    let bytes = decode_base64_strict(&payload.image_base64)?;
    if bytes.len() < MIN_PHOTO_BYTES || bytes.len() > MAX_PHOTO_BYTES {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            format!(
                "Taille de photo invalide ({} octets). Limite autorisée : {} à {} octets.",
                bytes.len(),
                MIN_PHOTO_BYTES,
                MAX_PHOTO_BYTES
            ),
        ));
    }

    let Some((content_type, ext)) = detect_image_format(&bytes) else {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Format image non supporté : seules les captures JPEG, PNG ou WebP valides sont acceptées.",
        ));
    };

    let photo_id = format!("photo-{}", rand::random::<u128>());
    let file_name = format!("{photo_id}.{ext}");
    let disk_path = photo_disk_path(&state.data_dir, &terminal.site_id, &file_name);
    if let Some(parent) = disk_path.parent() {
        fs::create_dir_all(parent).map_err(|err| {
            err_resp(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Impossible de préparer le stockage privé des photos : {err}"),
            )
        })?;
    }

    let tmp_path = disk_path.with_extension(format!("{ext}.tmp"));
    fs::write(&tmp_path, &bytes).map_err(|err| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec d'écriture de la photo : {err}"),
        )
    })?;
    fs::rename(&tmp_path, &disk_path).map_err(|err| {
        let _ = fs::remove_file(&tmp_path);
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec de finalisation du fichier photo : {err}"),
        )
    })?;

    let now = Utc::now();
    let expires_at = now + Duration::seconds(PHOTO_TTL_SECONDS);
    let digest = sha256_hex(&bytes);

    let record = PunchPhotoRecord {
        id: photo_id.clone(),
        site_id: terminal.site_id.clone(),
        terminal_id: terminal.id.clone(),
        employee_id: actor_id.clone(),
        content_type: content_type.into(),
        file_name,
        byte_size: bytes.len(),
        sha256_hex: digest.clone(),
        captured_at: now.to_rfc3339(),
        expires_at: expires_at.to_rfc3339(),
        consumed_at: None,
        consumed_by_entry_id: None,
    };

    let mut next = db.clone();
    next.punch_photos.push(record.clone());
    append_audit(
        &mut next,
        &actor_id,
        "PUNCH_PHOTO_CAPTURED",
        format!(
            "Preuve photo {} capturée sur {} ({} octets, sha256:{})",
            photo_id,
            terminal.label,
            bytes.len(),
            &digest[..12]
        ),
        &terminal.site_id,
        &photo_id,
        None,
        Some("captured".into()),
    );

    if let Err(err) = persist_state(&state.data_dir, &next) {
        let _ = fs::remove_file(&disk_path);
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec de persistance de la preuve photo : {err}"),
        ));
    }
    *db = next;

    Ok(Json(json!({
        "photoId": record.id,
        "contentType": record.content_type,
        "byteSize": record.byte_size,
        "sha256": record.sha256_hex,
        "capturedAt": record.captured_at,
        "expiresAt": record.expires_at
    })))
}

/// Vérifie et consomme une preuve photo capturée lors de l'enregistrement d'un pointage terminal.
pub(crate) fn consume_punch_photo(
    db: &mut AppDatabaseState,
    data_dir: &FsPath,
    photo_id: &str,
    employee_id: &str,
    terminal_id: &str,
    site_id: &str,
    entry_id: &str,
) -> Result<PunchPhotoRecord, Failure> {
    let trimmed = photo_id.trim();
    if trimmed.is_empty() {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "Identifiant de preuve photo manquant ou vide.",
        ));
    }

    let Some(idx) = db.punch_photos.iter().position(|p| p.id == trimmed) else {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "Preuve photo introuvable ou non stockée sur le serveur.",
        ));
    };

    let record = &db.punch_photos[idx];
    if record.employee_id != employee_id
        || record.terminal_id != terminal_id
        || record.site_id != site_id
    {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Cette preuve photo n'appartient pas à votre session ou à cet appareil.",
        ));
    }

    if record.consumed_by_entry_id.is_some() {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "Cette preuve photo a déjà été utilisée pour un autre pointage.",
        ));
    }

    let expires = DateTime::parse_from_rfc3339(&record.expires_at)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|_| err_resp(StatusCode::CONFLICT, "Horodatage d'expiration photo invalide."))?;
    if Utc::now() > expires {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "La preuve photo a expiré. Veuillez reprendre une capture avant de pointer.",
        ));
    }

    let disk_path = photo_disk_path(data_dir, &record.site_id, &record.file_name);
    let stored_bytes = fs::read(&disk_path).map_err(|_| {
        err_resp(
            StatusCode::CONFLICT,
            "Le fichier binaire de la preuve photo est introuvable sur le serveur.",
        )
    })?;
    if sha256_hex(&stored_bytes) != record.sha256_hex {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "Intégrité de la preuve photo compromise.",
        ));
    }

    let slot = &mut db.punch_photos[idx];
    slot.consumed_at = Some(Utc::now().to_rfc3339());
    slot.consumed_by_entry_id = Some(entry_id.to_string());
    Ok(slot.clone())
}

/// Consultation privée d'une photo de pointage réservée aux responsables RH (ORG04-37).
pub async fn get_punch_photo(
    State(state): State<SharedState>,
    Path((raw_club, photo_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, Failure> {
    let (_, site_id) = club_site(&raw_club)?;
    let actor_id = authenticated_employee(&state, &headers).await?;
    let db = state.db.read().await;

    if !can_access_site_scope(&db, &actor_id, site_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé aux preuves photo de ce club.",
        ));
    }

    let can_manage = evaluate_permission(
        &db,
        &actor_id,
        site_id,
        "ORG04-37",
        Some(PermissionTarget {
            site_id: Some(site_id),
            target_employee_id: Some(&actor_id),
            target_team_ids: &[],
            lock_state: None,
        }),
    )
    .allowed;
    if !can_manage {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Seuls les responsables habilités peuvent consulter les photos de pointage.",
        ));
    }

    let Some(record) = db
        .punch_photos
        .iter()
        .find(|p| p.id == photo_id && p.site_id == site_id)
    else {
        return Err(err_resp(StatusCode::NOT_FOUND, "Preuve photo introuvable."));
    };

    let disk_path = photo_disk_path(&state.data_dir, &record.site_id, &record.file_name);
    let bytes = fs::read(&disk_path).map_err(|_| {
        err_resp(
            StatusCode::NOT_FOUND,
            "Fichier photo indisponible sur le disque.",
        )
    })?;

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, record.content_type.as_str())
        .header(header::CACHE_CONTROL, "private, no-store")
        .body(Body::from(bytes))
        .map_err(|_| {
            err_resp(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Erreur de construction de la réponse photo.",
            )
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock_terminals::{hash_terminal_token, ClockTerminal};
    use crate::routes::SharedAppState;
    use crate::seed::load_or_init_state;
    use axum::http::HeaderValue;
    use std::collections::HashMap;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    fn test_state() -> SharedState {
        let dir = std::env::temp_dir().join(format!("punch_photo_test_{}", rand::random::<u128>()));
        Arc::new(SharedAppState {
            db: RwLock::new(load_or_init_state(&dir)),
            data_dir: dir,
            sessions: RwLock::new(HashMap::new()),
            login_attempts: RwLock::new(HashMap::new()),
        })
    }

    async fn auth_headers(state: &SharedState, emp_id: &str, terminal_token: &str) -> HeaderMap {
        let token = format!("session-{emp_id}-{}", rand::random::<u128>());
        state.sessions.write().await.insert(
            token.clone(),
            (emp_id.into(), Utc::now().timestamp() + 3600),
        );
        let mut h = HeaderMap::new();
        h.insert("authorization", format!("Bearer {token}").parse().unwrap());
        h.insert(
            "x-cfitness-terminal-token",
            HeaderValue::from_str(terminal_token).unwrap(),
        );
        h
    }

    #[tokio::test]
    async fn capture_consume_and_private_read_enforce_integrity_and_rbac() {
        let state = test_state();
        let term_token = "secret-term-photo-01";

        {
            let mut db = state.db.write().await;
            db.clock_terminals.push(ClockTerminal {
                id: "term-photo-cds".into(),
                site_id: "club-carre-soie".into(),
                room_id: "accueil".into(),
                room_label: "Accueil".into(),
                label: "Tablette Accueil CDS".into(),
                status: "active".into(),
                failed_pairing_attempts: 0,
                pairing_code: None,
                device_secret_hash: Some(hash_terminal_token(term_token)),
                created_at: Utc::now().to_rfc3339(),
                paired_at: Some(Utc::now().to_rfc3339()),
                last_seen_at: Some(Utc::now().to_rfc3339()),
            });
            db.personal_workspace
                .clock_policies
                .entry("emp-karim".into())
                .or_default()
                .insert(
                    "carre-de-soie".into(),
                    crate::clock_policy::ClockPolicy {
                        personal_allowed: false,
                        terminal_allowed: true,
                        revision: "1".into(),
                        updated_at: Utc::now().to_rfc3339(),
                        updated_by: "emp-daniel".into(),
                    },
                );
        }

        let headers_karim = auth_headers(&state, "emp-karim", term_token).await;

        // 1. Rejet d'un faux contenu texte (non image)
        let bad = post_capture_punch_photo(
            State(state.clone()),
            headers_karim.clone(),
            Json(CapturePhotoPayload {
                image_base64: "SGVsbG8gd29ybGQgbm90IGFuIGltYWdl".into(), // "Hello world not an image"
            }),
        )
        .await
        .expect_err("non-image base64 must be rejected");
        assert_eq!(bad.0, StatusCode::BAD_REQUEST);

        // 2. Capture d'un JPEG valide (magic bytes FF D8 FF + payload >= 16 octets)
        // Base64 de 18 octets commençant par FF D8 FF E0 ...
        let jpeg_b64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/";
        let Json(captured) = post_capture_punch_photo(
            State(state.clone()),
            headers_karim.clone(),
            Json(CapturePhotoPayload {
                image_base64: jpeg_b64.into(),
            }),
        )
        .await
        .expect("valid JPEG capture must succeed");
        let photo_id = captured["photoId"].as_str().unwrap().to_string();
        assert_eq!(captured["contentType"], "image/jpeg");

        // 3. Rejet de consommation pour un autre salarié (403)
        {
            let mut db = state.db.write().await;
            let err_wrong_emp = consume_punch_photo(
                &mut db,
                &state.data_dir,
                &photo_id,
                "emp-chloe",
                "term-photo-cds",
                "club-carre-soie",
                "entry-1",
            )
            .expect_err("cross-employee consumption must be forbidden");
            assert_eq!(err_wrong_emp.0, StatusCode::FORBIDDEN);

            // 4. Consommation légitime par Karim
            let consumed = consume_punch_photo(
                &mut db,
                &state.data_dir,
                &photo_id,
                "emp-karim",
                "term-photo-cds",
                "club-carre-soie",
                "entry-1",
            )
            .expect("valid consumption must succeed");
            assert_eq!(consumed.consumed_by_entry_id.as_deref(), Some("entry-1"));

            // 5. Rejet de réutilisation (usage unique -> 409)
            let err_reuse = consume_punch_photo(
                &mut db,
                &state.data_dir,
                &photo_id,
                "emp-karim",
                "term-photo-cds",
                "club-carre-soie",
                "entry-2",
            )
            .expect_err("reusing a consumed photo must return 409");
            assert_eq!(err_reuse.0, StatusCode::CONFLICT);
        }

        // 6. Lecture privée : refusée pour un salarié non manager (403), autorisée pour Daniel (200)
        let err_read_karim = get_punch_photo(
            State(state.clone()),
            Path(("carre-de-soie".into(), photo_id.clone())),
            headers_karim,
        )
        .await
        .expect_err("non-manager must not read punch photo");
        assert_eq!(err_read_karim.0, StatusCode::FORBIDDEN);

        let headers_daniel = auth_headers(&state, "emp-daniel", term_token).await;
        let ok_read = get_punch_photo(
            State(state.clone()),
            Path(("carre-de-soie".into(), photo_id)),
            headers_daniel,
        )
        .await
        .expect("admin must be able to read punch photo");
        assert_eq!(ok_read.status(), StatusCode::OK);

        let _ = fs::remove_dir_all(&state.data_dir);
    }
}
