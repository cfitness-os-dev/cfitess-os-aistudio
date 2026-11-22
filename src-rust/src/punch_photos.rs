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
use image::{ImageFormat, ImageReader, Limits};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Cursor;
use std::path::{Path as FsPath, PathBuf};

type Failure = (StatusCode, Json<Value>);

const MIN_PHOTO_BYTES: usize = 16;
const MAX_PHOTO_BYTES: usize = 512 * 1024; // 512 Ko max
const MAX_BASE64_CHARS: usize = (MAX_PHOTO_BYTES * 4 / 3) + 128;
const PHOTO_TTL_SECONDS: i64 = 120; // 2 minutes entre capture et pointage
const MAX_PENDING_PHOTOS_PER_ACTOR: usize = 5;

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

/// Décodeur Base64 standard strict (RFC 4648) : borne la taille avant allocation et refuse tout padding interne.
fn decode_base64_strict(input: &str) -> Result<Vec<u8>, Failure> {
    let trimmed = input.trim();
    let payload = if let Some(idx) = trimmed.find(";base64,") {
        &trimmed[idx + 8..]
    } else {
        trimmed
    };
    if payload.len() > MAX_BASE64_CHARS {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Charge Base64 trop volumineuse.",
        ));
    }
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

    let total_chunks = clean.len() / 4;
    let mut out = Vec::with_capacity(total_chunks * 3);
    for (idx, chunk) in clean.chunks_exact(4).enumerate() {
        let is_last = idx + 1 == total_chunks;
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
            } else if !is_last {
                return Err(err_resp(
                    StatusCode::BAD_REQUEST,
                    "Padding Base64 interdit avant la fin.",
                ));
            }
        } else if chunk[3] != b'=' || !is_last {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Padding Base64 invalide.",
            ));
        }
    }
    Ok(out)
}

/// Décode réellement les pixels de l'image avec limites strictes (dimensions 1..=4096, mémoire <= 32 Mo),
/// puis réencode proprement sans métadonnées annexes (EXIF/GPS/chunks inconnus).
fn decode_and_sanitize_image(bytes: &[u8]) -> Option<(&'static str, &'static str, Vec<u8>)> {
    let mut reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .ok()?;
    let format = reader.format()?;
    let (content_type, ext, out_format) = match format {
        ImageFormat::Jpeg => ("image/jpeg", "jpg", ImageFormat::Jpeg),
        ImageFormat::Png => ("image/png", "png", ImageFormat::Png),
        ImageFormat::WebP => ("image/png", "png", ImageFormat::Png),
        _ => return None,
    };

    let mut limits = Limits::default();
    limits.max_image_width = Some(4096);
    limits.max_image_height = Some(4096);
    limits.max_alloc = Some(32 * 1024 * 1024);
    reader.limits(limits);

    let img = reader.decode().ok()?;
    let (w, h) = (img.width(), img.height());
    if w == 0 || h == 0 || w > 4096 || h > 4096 {
        return None;
    }

    let mut sanitized = Vec::new();
    let mut cursor = Cursor::new(&mut sanitized);
    match out_format {
        ImageFormat::Jpeg => {
            let rgb = img.to_rgb8();
            rgb.write_to(&mut cursor, ImageFormat::Jpeg).ok()?;
        }
        _ => {
            img.write_to(&mut cursor, ImageFormat::Png).ok()?;
        }
    }

    if sanitized.is_empty() || sanitized.len() > MAX_PHOTO_BYTES {
        return None;
    }
    Some((content_type, ext, sanitized))
}

/// Vérifie qu'un flux d'octets est une vraie image décodable (JPEG, PNG ou WebP).
fn detect_image_format(bytes: &[u8]) -> Option<(&'static str, &'static str)> {
    decode_and_sanitize_image(bytes).map(|(ct, ext, _)| (ct, ext))
}

/// Retourne la liste des fichiers disque expirés à supprimer APRÈS succès de persist_state.
fn collect_and_prune_expired_unconsumed_photos(
    db: &mut AppDatabaseState,
    data_dir: &FsPath,
) -> Vec<PathBuf> {
    let now = Utc::now();
    let mut to_delete = Vec::new();
    db.punch_photos.retain(|p| {
        if p.consumed_by_entry_id.is_some() {
            return true;
        }
        let expired = DateTime::parse_from_rfc3339(&p.expires_at)
            .map(|dt| now > dt.with_timezone(&Utc))
            .unwrap_or(true);
        if expired {
            to_delete.push(photo_disk_path(data_dir, &p.site_id, &p.file_name));
            false
        } else {
            true
        }
    });
    to_delete
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

    let Some((content_type, ext, bytes)) = decode_and_sanitize_image(&bytes) else {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Image invalide ou non décodable : seules les captures JPEG, PNG ou WebP complètes sont acceptées.",
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
    let expired_files_to_remove =
        collect_and_prune_expired_unconsumed_photos(&mut next, &state.data_dir);
    let pending_count = next
        .punch_photos
        .iter()
        .filter(|p| {
            p.consumed_by_entry_id.is_none()
                && p.employee_id == actor_id
                && p.terminal_id == terminal.id
        })
        .count();
    if pending_count >= MAX_PENDING_PHOTOS_PER_ACTOR {
        let _ = fs::remove_file(&disk_path);
        return Err(err_resp(
            StatusCode::TOO_MANY_REQUESTS,
            "Trop de captures photo en attente sur cet appareil. Validez votre pointage ou patientez.",
        ));
    }
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

    // Suppression disque des captures expirées uniquement APRÈS succès de persist_state
    for old_path in expired_files_to_remove {
        if let Err(err) = fs::remove_file(&old_path) {
            tracing::warn!("Suppression fichier photo expiré {:?} échouée : {err}", old_path);
        }
    }

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

    let Some(record) = db
        .punch_photos
        .iter()
        .find(|p| p.id == photo_id && p.site_id == site_id)
    else {
        return Err(err_resp(StatusCode::NOT_FOUND, "Preuve photo introuvable."));
    };

    let target_teams: Vec<String> = db
        .employees
        .iter()
        .find(|e| e.id == record.employee_id)
        .and_then(|e| e.site_accesses.iter().find(|s| s.site_id == site_id))
        .map(|s| s.team_ids.clone())
        .unwrap_or_default();

    let can_manage = evaluate_permission(
        &db,
        &actor_id,
        site_id,
        "ORG04-37",
        Some(PermissionTarget {
            site_id: Some(site_id),
            target_employee_id: Some(&record.employee_id),
            target_team_ids: &target_teams,
            lock_state: None,
        }),
    )
    .allowed;
    if !can_manage {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Seuls les responsables habilités sur l'équipe du salarié peuvent consulter cette photo.",
        ));
    }

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

        // 1a. Rejet d'un Base64 avec padding interne illégal
        let bad_b64 = post_capture_punch_photo(
            State(state.clone()),
            headers_karim.clone(),
            Json(CapturePhotoPayload {
                image_base64: "AA==AA==AA==AA==AA==AA==".into(),
            }),
        )
        .await
        .expect_err("mid-stream base64 padding must be rejected");
        assert_eq!(bad_b64.0, StatusCode::BAD_REQUEST);

        // 1b. Rejet d'un JPEG tronqué sans marqueur de fin EOI (FF D9)
        let truncated_jpeg = post_capture_punch_photo(
            State(state.clone()),
            headers_karim.clone(),
            Json(CapturePhotoPayload {
                image_base64: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/".into(),
            }),
        )
        .await
        .expect_err("truncated JPEG without EOI must be rejected");
        assert_eq!(truncated_jpeg.0, StatusCode::BAD_REQUEST);

        // 1c. Rejet des contre-exemples d'octets nuls / CRC invalides / VP8X sans pixels
        let fake_jpeg = [0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xd9];
        assert!(detect_image_format(&fake_jpeg).is_none());
        let fake_webp = [b'R', b'I', b'F', b'F', 8, 0, 0, 0, b'W', b'E', b'B', b'P', 0, 0, 0, 0];
        assert!(detect_image_format(&fake_webp).is_none());
        let mut fake_vp8x = b"RIFF".to_vec();
        fake_vp8x.extend_from_slice(&22u32.to_le_bytes());
        fake_vp8x.extend_from_slice(b"WEBPVP8X");
        fake_vp8x.extend_from_slice(&10u32.to_le_bytes());
        fake_vp8x.extend_from_slice(&[0; 10]);
        assert!(detect_image_format(&fake_vp8x).is_none());
        let mut fake_png = vec![0x89, b'P', b'N', b'G', 13, 10, 26, 10];
        fake_png.extend_from_slice(&13u32.to_be_bytes());
        fake_png.extend_from_slice(b"IHDR");
        fake_png.extend_from_slice(&1u32.to_be_bytes());
        fake_png.extend_from_slice(&1u32.to_be_bytes());
        fake_png.extend_from_slice(&[8, 2, 0, 0, 0]);
        fake_png.extend_from_slice(&[0; 4]);
        fake_png.extend_from_slice(&1u32.to_be_bytes());
        fake_png.extend_from_slice(b"IDAT");
        fake_png.push(0);
        fake_png.extend_from_slice(&[0; 4]);
        fake_png.extend_from_slice(&[0, 0, 0, 0, b'I', b'E', b'N', b'D', 0xae, 0x42, 0x60, 0x82]);
        assert!(detect_image_format(&fake_png).is_none());

        // 2. Capture d'une vraie image PNG 1x1 complète et décodable (IHDR + IDAT + IEND)
        let valid_png_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
        let Json(captured) = post_capture_punch_photo(
            State(state.clone()),
            headers_karim.clone(),
            Json(CapturePhotoPayload {
                image_base64: valid_png_b64.into(),
            }),
        )
        .await
        .expect("complete valid PNG capture must succeed");
        let photo_id = captured["photoId"].as_str().unwrap().to_string();
        assert_eq!(captured["contentType"], "image/png");

        // 3. Parcours complet via la route finale post_terminal_punch
        let Json(punch_res) = crate::clock_terminals::post_terminal_punch(
            State(state.clone()),
            headers_karim.clone(),
            Json(crate::clock_terminals::TerminalPunchPayload {
                employee_id: "emp-karim".into(),
                punch_type: "arrivee".into(),
                photo_proof: Some(photo_id.clone()),
            }),
        )
        .await
        .expect("terminal punch with real stored photo must succeed");
        assert_eq!(punch_res["status"], "recorded");
        assert_eq!(punch_res["entry"]["photoProofPresent"], true);
        assert_eq!(punch_res["entry"]["photoProofId"], photo_id);

        // 4. Rejet de réutilisation de la même photo sur un second pointage (usage unique -> 409)
        let err_reuse = crate::clock_terminals::post_terminal_punch(
            State(state.clone()),
            headers_karim.clone(),
            Json(crate::clock_terminals::TerminalPunchPayload {
                employee_id: "emp-karim".into(),
                punch_type: "debut_pause".into(),
                photo_proof: Some(photo_id.clone()),
            }),
        )
        .await
        .expect_err("reusing a consumed photo must return 409");
        assert_eq!(err_reuse.0, StatusCode::CONFLICT);

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
