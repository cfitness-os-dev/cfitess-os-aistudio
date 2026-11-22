use crate::models::AppDatabaseState;
use crate::rbac::{can_access_site_scope, evaluate_permission, PermissionTarget};
use crate::routes::{append_audit, err_resp, resolve_session_actor, SharedState};
use crate::seed::persist_state;
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::Utc;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

type Failure = (StatusCode, Json<Value>);
const PAIRING_TTL_SECONDS: i64 = 600;
const MAX_PAIRING_ATTEMPTS: u32 = 5;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClockTerminal {
    pub id: String,
    pub site_id: String,
    pub room_id: String,
    pub room_label: String,
    pub label: String,
    pub status: String, // pending_pairing | active | revoked | pairing_locked | pairing_expired
    #[serde(default)]
    pub failed_pairing_attempts: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pairing_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_secret_hash: Option<String>,
    pub created_at: String,
    pub paired_at: Option<String>,
    pub last_seen_at: Option<String>,
}

fn pairing_expiry(terminal: &ClockTerminal) -> Option<chrono::DateTime<Utc>> {
    chrono::DateTime::parse_from_rfc3339(&terminal.created_at)
        .ok()?
        .with_timezone(&Utc)
        .checked_add_signed(chrono::Duration::seconds(PAIRING_TTL_SECONDS))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateTerminalPayload {
    pub room_id: String,
    pub room_label: String,
    pub label: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PairTerminalPayload {
    pub terminal_id: String,
    pub pairing_code: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RevokeTerminalPayload {
    #[serde(default)]
    pub reason: Option<String>,
}

fn club_site(raw: &str) -> Result<(&'static str, &'static str), Failure> {
    match raw {
        "carre-de-soie" | "club-carre-soie" => Ok(("carre-de-soie", "club-carre-soie")),
        "beynost" | "club-beynost" => Ok(("beynost", "club-beynost")),
        _ => Err(err_resp(StatusCode::BAD_REQUEST, "Club inconnu.")),
    }
}

pub fn hash_terminal_token(token: &str) -> String {
    format!("{:x}", Sha256::digest(token.as_bytes()))
}

fn can_manage_terminals(db: &AppDatabaseState, actor_id: &str, site_id: &str) -> bool {
    evaluate_permission(
        db,
        actor_id,
        site_id,
        "ORG04-37",
        Some(PermissionTarget {
            site_id: Some(site_id),
            target_employee_id: Some(actor_id),
            target_team_ids: &[],
            lock_state: None,
        }),
    )
    .allowed
}

/// A shared device identity never replaces the employee's authenticated session.
pub(crate) async fn authenticated_employee(
    state: &SharedState,
    headers: &HeaderMap,
) -> Result<String, Failure> {
    if !headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.starts_with("Bearer "))
        .unwrap_or(false)
    {
        return Err(err_resp(
            StatusCode::UNAUTHORIZED,
            "Connectez-vous avec votre compte personnel pour cette action.",
        ));
    }
    Ok(resolve_session_actor(state, headers).await?.0)
}

/// Lister les terminaux d'un club (réservé aux managers/admins habilités)
pub async fn get_club_terminals(
    State(state): State<SharedState>,
    Path(raw_club): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, Failure> {
    let (_, site_id) = club_site(&raw_club)?;
    let actor_id = authenticated_employee(&state, &headers).await?;
    let db = state.db.read().await;

    if !can_access_site_scope(&db, &actor_id, site_id)
        || !can_manage_terminals(&db, &actor_id, site_id)
    {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Vos droits ne permettent pas d’administrer les appareils de pointage de ce club.",
        ));
    }

    let rows: Vec<Value> = db
        .clock_terminals
        .iter()
        .filter(|t| t.site_id == site_id)
        .map(|t| {
            json!({
                "id": t.id,
                "siteId": t.site_id,
                "roomId": t.room_id,
                "roomLabel": t.room_label,
                "label": t.label,
                "status": t.status,
                "pairingExpiresAt": if t.status == "pending_pairing" { pairing_expiry(t) } else { None },
                "hasSecret": t.device_secret_hash.is_some(),
                "createdAt": t.created_at,
                "pairedAt": t.paired_at,
                "lastSeenAt": t.last_seen_at
            })
        })
        .collect();

    Ok(Json(json!({ "siteId": site_id, "terminals": rows })))
}

/// Enregistrer un nouveau terminal et émettre un code d'appairage à 6 chiffres
pub async fn post_create_terminal(
    State(state): State<SharedState>,
    Path(raw_club): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<CreateTerminalPayload>,
) -> Result<Json<Value>, Failure> {
    let (_, site_id) = club_site(&raw_club)?;
    let actor_id = authenticated_employee(&state, &headers).await?;
    let mut db = state.db.write().await;

    if !can_access_site_scope(&db, &actor_id, site_id)
        || !can_manage_terminals(&db, &actor_id, site_id)
    {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Droits insuffisants pour enregistrer un terminal dans ce club.",
        ));
    }

    let label = payload.label.trim();
    if label.is_empty() || label.chars().count() > 100 {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Indiquez un nom de terminal valide (1 à 100 caractères).",
        ));
    }
    let room_label = payload.room_label.trim();
    if room_label.is_empty() || room_label.chars().count() > 100 {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Indiquez une salle valide (1 à 100 caractères).",
        ));
    }
    let room_id = payload.room_id.trim();
    if room_id.is_empty() || room_id.chars().count() > 100 {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Indiquez un identifiant de salle valide (1 à 100 caractères).",
        ));
    }

    // Génération d'un code d'appairage aléatoire à 6 chiffres
    let mut rng = rand::thread_rng();
    let mut rand_bytes = [0u8; 4];
    rng.fill_bytes(&mut rand_bytes);
    let code_num = (u32::from_be_bytes(rand_bytes) % 900_000) + 100_000;
    let pairing_code = format!("{:06}", code_num);

    let terminal_id = format!("term-{}", rand::random::<u128>());
    let now = Utc::now().to_rfc3339();

    let new_term = ClockTerminal {
        id: terminal_id.clone(),
        site_id: site_id.to_string(),
        room_id: payload.room_id.trim().to_string(),
        room_label: room_label.to_string(),
        label: label.to_string(),
        status: "pending_pairing".into(),
        failed_pairing_attempts: 0,
        pairing_code: Some(pairing_code.clone()),
        device_secret_hash: None,
        created_at: now,
        paired_at: None,
        last_seen_at: None,
    };

    let mut next = db.clone();
    next.clock_terminals.push(new_term.clone());

    append_audit(
        &mut next,
        &actor_id,
        "TERMINAL_CREATE",
        format!(
            "Création terminal {} ({}) pour {} - salle {}",
            terminal_id, label, site_id, room_label
        ),
        site_id,
        &terminal_id,
        None,
        Some("pending_pairing".into()),
    );

    persist_state(&state.data_dir, &next).map_err(|err| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec de persistance du terminal : {err}"),
        )
    })?;
    *db = next;

    Ok(Json(json!({
        "terminalId": terminal_id,
        "siteId": site_id,
        "roomId": new_term.room_id,
        "roomLabel": new_term.room_label,
        "label": new_term.label,
        "status": new_term.status,
        "pairingCode": pairing_code,
        "pairingExpiresAt": pairing_expiry(&new_term),
        "createdAt": new_term.created_at
    })))
}

/// Appairer une tablette physique : vérifie le code d'appairage, génère le secret matériel et active le terminal
pub async fn post_pair_terminal(
    State(state): State<SharedState>,
    Json(payload): Json<PairTerminalPayload>,
) -> Result<Json<Value>, Failure> {
    let terminal_id = payload.terminal_id.trim();
    let pairing_code = payload.pairing_code.trim();

    if terminal_id.is_empty()
        || terminal_id.len() > 128
        || pairing_code.len() != 6
        || !pairing_code.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Identifiant de terminal et code d'appairage requis.",
        ));
    }

    let mut db = state.db.write().await;
    let Some(idx) = db.clock_terminals.iter().position(|t| t.id == terminal_id) else {
        return Err(err_resp(StatusCode::NOT_FOUND, "Terminal introuvable."));
    };

    let terminal = &db.clock_terminals[idx];
    if terminal.status == "revoked" {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Ce terminal a été révoqué par la direction.",
        ));
    }

    if terminal.status == "pairing_locked"
        || terminal.failed_pairing_attempts >= MAX_PAIRING_ATTEMPTS
    {
        return Err(err_resp(StatusCode::TOO_MANY_REQUESTS,"Appairage bloqué après trop d’essais. Faites enregistrer de nouveau cet appareil par une personne habilitée."));
    }
    if terminal.status != "pending_pairing" {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "Cet appareil n’est plus en attente d’appairage.",
        ));
    }
    let now = Utc::now();
    let expired = pairing_expiry(terminal)
        .map(|expiry| {
            now >= expiry || now < expiry - chrono::Duration::seconds(PAIRING_TTL_SECONDS)
        })
        .unwrap_or(true);
    if expired {
        let mut next = db.clone();
        let row = &mut next.clock_terminals[idx];
        row.status = "pairing_expired".into();
        row.pairing_code = None;
        let site = row.site_id.clone();
        append_audit(
            &mut next,
            "SYSTEM_TERMINAL",
            "TERMINAL_PAIRING_EXPIRED",
            "Code d’appairage expiré".into(),
            &site,
            terminal_id,
            Some("pending_pairing".into()),
            Some("pairing_expired".into()),
        );
        persist_state(&state.data_dir, &next).map_err(|_| {
            err_resp(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Expiration non enregistrée. Aucun appairage confirmé.",
            )
        })?;
        *db = next;
        return Err(err_resp(StatusCode::UNAUTHORIZED,"Le code d’appairage a expiré. Faites enregistrer de nouveau cet appareil par une personne habilitée."));
    }

    if terminal.pairing_code.as_deref() != Some(pairing_code) {
        let mut next = db.clone();
        let row = &mut next.clock_terminals[idx];
        row.failed_pairing_attempts = row.failed_pairing_attempts.saturating_add(1);
        let locked = row.failed_pairing_attempts >= MAX_PAIRING_ATTEMPTS;
        if locked {
            row.status = "pairing_locked".into();
            row.pairing_code = None;
        }
        let site = row.site_id.clone();
        let attempts = row.failed_pairing_attempts;
        append_audit(
            &mut next,
            "SYSTEM_TERMINAL",
            "TERMINAL_PAIRING_REFUSED",
            format!("Essai d’appairage refusé ({attempts}/{MAX_PAIRING_ATTEMPTS})"),
            &site,
            terminal_id,
            None,
            Some(
                if locked {
                    "pairing_locked"
                } else {
                    "pending_pairing"
                }
                .into(),
            ),
        );
        persist_state(&state.data_dir, &next).map_err(|_| {
            err_resp(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Essai non enregistré. Aucun appairage confirmé.",
            )
        })?;
        *db = next;
        return Err(err_resp(
            if locked {
                StatusCode::TOO_MANY_REQUESTS
            } else {
                StatusCode::UNAUTHORIZED
            },
            if locked {
                "Appairage bloqué après trop d’essais. Contactez une personne habilitée."
            } else {
                "Code d’appairage invalide."
            },
        ));
    }

    // Génération du secret matériel (64 caractères hexadécimaux cryptographiques)
    let mut rng = rand::thread_rng();
    let mut secret_bytes = [0u8; 32];
    rng.fill_bytes(&mut secret_bytes);
    let device_token = hex::encode(secret_bytes);
    let secret_hash = hash_terminal_token(&device_token);

    let now = Utc::now().to_rfc3339();
    let mut next = db.clone();
    let term = &mut next.clock_terminals[idx];
    term.status = "active".into();
    term.failed_pairing_attempts = 0;
    term.pairing_code = None; // Invalidation du code d'appairage une fois utilisé
    term.device_secret_hash = Some(secret_hash);
    term.paired_at = Some(now.clone());
    term.last_seen_at = Some(now);

    let site_id = term.site_id.clone();
    let room_id = term.room_id.clone();
    let room_label = term.room_label.clone();
    let label = term.label.clone();

    append_audit(
        &mut next,
        "SYSTEM_TERMINAL",
        "TERMINAL_PAIRED",
        format!(
            "Terminal {terminal_id} ({label}) appairé avec succès sur {site_id} / {room_label}"
        ),
        &site_id,
        terminal_id,
        Some("pending_pairing".into()),
        Some("active".into()),
    );

    persist_state(&state.data_dir, &next).map_err(|err| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec de persistance de l'appairage : {err}"),
        )
    })?;
    *db = next;

    Ok(Json(json!({
        "terminalId": terminal_id,
        "siteId": site_id,
        "roomId": room_id,
        "roomLabel": room_label,
        "label": label,
        "status": "active",
        "deviceToken": device_token
    })))
}

/// Révoquer un terminal (bloque immédiatement tout usage futur)
pub async fn post_revoke_terminal(
    State(state): State<SharedState>,
    Path((raw_club, terminal_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(payload): Json<RevokeTerminalPayload>,
) -> Result<Json<Value>, Failure> {
    let (_, site_id) = club_site(&raw_club)?;
    let actor_id = authenticated_employee(&state, &headers).await?;
    let mut db = state.db.write().await;

    if !can_access_site_scope(&db, &actor_id, site_id)
        || !can_manage_terminals(&db, &actor_id, site_id)
    {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Droits insuffisants pour révoquer un terminal dans ce club.",
        ));
    }

    let Some(idx) = db
        .clock_terminals
        .iter()
        .position(|t| t.id == terminal_id && t.site_id == site_id)
    else {
        return Err(err_resp(
            StatusCode::NOT_FOUND,
            "Terminal introuvable dans ce club.",
        ));
    };

    let mut next = db.clone();
    let term = &mut next.clock_terminals[idx];
    let prev_status = term.status.clone();
    term.status = "revoked".into();
    term.pairing_code = None;

    let reason = payload
        .reason
        .unwrap_or_else(|| "Révocation manuelle".into());

    append_audit(
        &mut next,
        &actor_id,
        "TERMINAL_REVOKED",
        format!("Terminal {terminal_id} révoqué : {reason}"),
        site_id,
        &terminal_id,
        Some(prev_status),
        Some("revoked".into()),
    );

    persist_state(&state.data_dir, &next).map_err(|err| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec de persistance de la révocation : {err}"),
        )
    })?;
    *db = next;

    Ok(Json(json!({
        "terminalId": terminal_id,
        "siteId": site_id,
        "status": "revoked"
    })))
}

/// Vérifie l'authenticité d'un terminal à partir du header `x-cfitness-terminal-token`
pub async fn authenticate_terminal(
    db: &AppDatabaseState,
    headers: &HeaderMap,
) -> Result<ClockTerminal, Failure> {
    let token = headers
        .get("x-cfitness-terminal-token")
        .and_then(|h| h.to_str().ok())
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .ok_or_else(|| {
            err_resp(
                StatusCode::UNAUTHORIZED,
                "Jeton d'authentification terminal manquant (x-cfitness-terminal-token requis).",
            )
        })?;

    let expected_hash = hash_terminal_token(token);
    let term = db
        .clock_terminals
        .iter()
        .find(|t| t.device_secret_hash.as_deref() == Some(&expected_hash))
        .cloned()
        .ok_or_else(|| {
            err_resp(
                StatusCode::UNAUTHORIZED,
                "Terminal non reconnu ou jeton invalide.",
            )
        })?;

    if term.status != "active" {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            format!("Ce terminal est {} et ne peut plus opérer.", term.status),
        ));
    }

    Ok(term)
}

/// Endpoint /api/terminals/whoami permettant à la tablette de valider son identité et sa localisation
pub async fn get_terminal_whoami(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, Failure> {
    let db = state.db.read().await;
    let term = authenticate_terminal(&db, &headers).await?;
    Ok(Json(json!({
        "terminalId": term.id,
        "siteId": term.site_id,
        "roomId": term.room_id,
        "roomLabel": term.room_label,
        "label": term.label,
        "status": term.status,
        "pairedAt": term.paired_at,
        "photoCaptureAvailable": false
    })))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TerminalPunchPayload {
    pub employee_id: String,
    pub punch_type: String,
    #[serde(default)]
    pub photo_proof: Option<String>,
}

/// Pointage serveur avec identité du terminal ET du salarié.
pub async fn post_terminal_punch(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<TerminalPunchPayload>,
) -> Result<Json<Value>, Failure> {
    let actor_id = authenticated_employee(&state, &headers).await?;
    if actor_id != payload.employee_id {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Vous ne pouvez pointer que pour votre propre compte.",
        ));
    }
    let mut db = state.db.write().await;
    let term = authenticate_terminal(&db, &headers).await?;

    let short_club = match term.site_id.as_str() {
        "club-carre-soie" => "carre-de-soie",
        "club-beynost" => "beynost",
        _ => {
            return Err(err_resp(
                StatusCode::FORBIDDEN,
                "L’établissement de cet appareil n’est pas reconnu.",
            ))
        }
    };

    let Some(employee) = db.employees.iter().find(|e| e.id == payload.employee_id) else {
        return Err(err_resp(
            StatusCode::NOT_FOUND,
            "Collaborateur introuvable.",
        ));
    };

    if !employee.active || !can_access_site_scope(&db, &payload.employee_id, &term.site_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Vous n'avez pas d'affectation active dans ce club.",
        ));
    }

    // Contrôle du droit terminal_allowed issu de la politique P0
    let pol = crate::clock_policy::policy(&db, &payload.employee_id, short_club);
    if !pol.terminal_allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Votre profil ne dispose pas du droit de pointage sur les terminaux de ce club.",
        ));
    }

    let mut person = crate::personal_workspace::person(&db, &actor_id);

    let mut rows = person["timeEntries"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let last = rows.last();
    let previous = last
        .and_then(|r| r["type"].as_str())
        .map(ToString::to_string);
    let availability = crate::personal_workspace::punch_availability(&person, short_club);
    if !availability["allowedTypes"]
        .as_array()
        .unwrap()
        .iter()
        .any(|value| value == &payload.punch_type)
    {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "Ce pointage ne suit pas le précédent. Vérifiez votre historique.",
        ));
    }

    let photo_policy = crate::punch_photos::club_photo_policy(&db, &term.site_id);
    if photo_policy == "required" && payload.photo_proof.is_none() {
        return Err(err_resp(
            StatusCode::UNPROCESSABLE_ENTITY,
            "Une preuve photo est obligatoire pour pointer sur les terminaux de ce club.",
        ));
    }

    let punch_id = format!("terminal-punch-{}", rand::random::<u128>());
    let now = Utc::now().to_rfc3339();
    let mut next = db.clone();

    let consumed_photo = if let Some(ref photo_id) = payload.photo_proof {
        Some(crate::punch_photos::consume_punch_photo(
            &mut next,
            &state.data_dir,
            photo_id,
            &payload.employee_id,
            &term.id,
            &term.site_id,
            &punch_id,
        )?)
    } else {
        None
    };

    let entry = json!({
        "id": punch_id,
        "employeeId": payload.employee_id,
        "clubId": short_club,
        "timestamp": now,
        "type": payload.punch_type,
        "source": "terminal",
        "terminalId": term.id,
        "roomLabel": term.room_label,
        "photoProofPresent": consumed_photo.is_some(),
        "photoProofId": consumed_photo.as_ref().map(|p| p.id.clone()),
        "photoSha256": consumed_photo.as_ref().map(|p| p.sha256_hex.clone())
    });

    rows.push(entry.clone());
    person["timeEntries"] = Value::Array(rows);

    next.personal_workspace
        .people
        .insert(payload.employee_id.clone(), person);

    append_audit(
        &mut next,
        &payload.employee_id,
        "TERMINAL_PUNCH",
        format!(
            "Pointage {} enregistré depuis terminal {} ({}) - photo : {}",
            payload.punch_type,
            term.id,
            term.room_label,
            consumed_photo
                .as_ref()
                .map(|p| p.id.as_str())
                .unwrap_or("non fournie")
        ),
        &term.site_id,
        &payload.employee_id,
        previous,
        Some(payload.punch_type.clone()),
    );

    persist_state(&state.data_dir, &next).map_err(|err| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec de persistance du pointage : {err}"),
        )
    })?;
    *db = next;

    Ok(Json(json!({
        "status": "recorded",
        "entry": entry,
        "photoCaptureAvailable": false
    })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routes::SharedAppState;
    use crate::seed::load_or_init_state;
    use axum::http::{header, HeaderValue};
    use std::collections::HashMap;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    fn test_state() -> SharedState {
        let dir = std::env::temp_dir().join(format!("term_test_{}", rand::random::<u128>()));
        Arc::new(SharedAppState {
            db: RwLock::new(load_or_init_state(&dir)),
            data_dir: dir,
            sessions: RwLock::new(HashMap::new()),
            login_attempts: RwLock::new(HashMap::new()),
        })
    }

    async fn admin_headers(state: &SharedState) -> HeaderMap {
        let token = format!("admin-{}", rand::random::<u64>());
        state.sessions.write().await.insert(
            token.clone(),
            ("emp-mario".into(), Utc::now().timestamp() + 3600),
        );
        let mut headers = HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {token}")).unwrap(),
        );
        headers.insert(
            "x-cfitness-actor-id",
            HeaderValue::from_str("emp-mario").unwrap(),
        );
        headers.insert(
            "x-cfitness-site-id",
            HeaderValue::from_str("club-carre-soie").unwrap(),
        );
        headers
    }

    async fn pending(state: &SharedState) -> (String, String) {
        let h = admin_headers(state).await;
        let row = post_create_terminal(
            State(state.clone()),
            Path("beynost".into()),
            h,
            Json(CreateTerminalPayload {
                room_id: "fixture-room".into(),
                room_label: "Salle fictive".into(),
                label: "Appareil fictif".into(),
            }),
        )
        .await
        .unwrap()
        .0;
        assert!(row["pairingExpiresAt"].is_string());
        (
            row["terminalId"].as_str().unwrap().into(),
            row["pairingCode"].as_str().unwrap().into(),
        )
    }
    async fn pair(state: &SharedState, id: &str, code: &str) -> Result<Json<Value>, Failure> {
        post_pair_terminal(
            State(state.clone()),
            Json(PairTerminalPayload {
                terminal_id: id.into(),
                pairing_code: code.into(),
            }),
        )
        .await
    }
    #[tokio::test]
    async fn pairing_attempt_limit_survives_storage_reload_and_blocks_even_correct_code() {
        let state = test_state();
        let (id, code) = pending(&state).await;
        let wrong = if code == "000000" { "000001" } else { "000000" };
        for attempt in 1..=MAX_PAIRING_ATTEMPTS {
            let status = pair(&state, &id, wrong).await.unwrap_err().0;
            assert_eq!(
                status,
                if attempt == MAX_PAIRING_ATTEMPTS {
                    StatusCode::TOO_MANY_REQUESTS
                } else {
                    StatusCode::UNAUTHORIZED
                }
            );
            let loaded = load_or_init_state(&state.data_dir);
            let term = loaded.clock_terminals.iter().find(|t| t.id == id).unwrap();
            assert_eq!(term.failed_pairing_attempts, attempt);
            assert!(term.device_secret_hash.is_none());
            *state.db.write().await = loaded;
        }
        assert_eq!(
            pair(&state, &id, &code).await.unwrap_err().0,
            StatusCode::TOO_MANY_REQUESTS
        );
        let db = state.db.read().await;
        let row = db.clock_terminals.iter().find(|t| t.id == id).unwrap();
        assert_eq!(row.status, "pairing_locked");
        assert!(row.pairing_code.is_none());
        drop(db);
        std::fs::remove_dir_all(&state.data_dir).unwrap();
    }
    #[tokio::test]
    async fn pairing_expires_and_refuses_invalid_or_future_server_creation_time() {
        let state = test_state();
        for created in [
            (Utc::now() - chrono::Duration::seconds(PAIRING_TTL_SECONDS + 1)).to_rfc3339(),
            (Utc::now() + chrono::Duration::minutes(1)).to_rfc3339(),
            "invalid-time".into(),
        ] {
            let (id, code) = pending(&state).await;
            state
                .db
                .write()
                .await
                .clock_terminals
                .iter_mut()
                .find(|t| t.id == id)
                .unwrap()
                .created_at = created;
            assert_eq!(
                pair(&state, &id, &code).await.unwrap_err().0,
                StatusCode::UNAUTHORIZED
            );
            let db = load_or_init_state(&state.data_dir);
            let row = db.clock_terminals.iter().find(|t| t.id == id).unwrap();
            assert_eq!(row.status, "pairing_expired");
            assert!(row.pairing_code.is_none());
            assert!(row.device_secret_hash.is_none());
        }
        std::fs::remove_dir_all(&state.data_dir).unwrap();
    }
    #[tokio::test]
    async fn pairing_failure_counter_and_device_secret_are_not_published_on_disk_failure() {
        let state = test_state();
        let (id, code) = pending(&state).await;
        let before = serde_json::to_value(&*state.db.read().await).unwrap();
        let disk = std::fs::read(state.data_dir.join("cfitness_state.json")).unwrap();
        std::fs::create_dir(state.data_dir.join("cfitness_state.json.tmp")).unwrap();
        for candidate in ["000000", code.as_str()] {
            assert_eq!(
                pair(&state, &id, candidate).await.unwrap_err().0,
                StatusCode::INTERNAL_SERVER_ERROR
            );
            assert_eq!(
                serde_json::to_value(&*state.db.read().await).unwrap(),
                before
            );
            assert_eq!(
                std::fs::read(state.data_dir.join("cfitness_state.json")).unwrap(),
                disk
            );
        }
        std::fs::remove_dir(state.data_dir.join("cfitness_state.json.tmp")).unwrap();
        let result = pair(&state, &id, &code).await.unwrap().0;
        assert_eq!(result["status"], "active");
        assert!(result["deviceToken"].is_string());
        assert_eq!(
            pair(&state, &id, &code).await.unwrap_err().0,
            StatusCode::CONFLICT
        );
        std::fs::remove_dir_all(&state.data_dir).unwrap();
    }

    #[tokio::test]
    async fn terminal_lifecycle_create_pair_whoami_and_revoke() {
        let state = test_state();
        let headers = admin_headers(&state).await;

        // 1. Création d'un terminal en attente d'appairage
        let Json(created) = post_create_terminal(
            State(state.clone()),
            Path("carre-de-soie".into()),
            headers.clone(),
            Json(CreateTerminalPayload {
                room_id: "room-cours-co-cs".into(),
                room_label: "Salle Cours Collectifs".into(),
                label: "Tablette Salle A".into(),
            }),
        )
        .await
        .expect("create terminal OK");

        let terminal_id = created["terminalId"].as_str().unwrap().to_string();
        let pairing_code = created["pairingCode"].as_str().unwrap().to_string();
        assert_eq!(created["status"], "pending_pairing");
        assert_eq!(created["siteId"], "club-carre-soie");

        // 2. Échec avec mauvais code d'appairage
        let err_bad_code = post_pair_terminal(
            State(state.clone()),
            Json(PairTerminalPayload {
                terminal_id: terminal_id.clone(),
                pairing_code: "999999".into(),
            }),
        )
        .await
        .expect_err("bad code must fail");
        assert_eq!(err_bad_code.0, StatusCode::UNAUTHORIZED);

        // 3. Appairage réussi
        let Json(paired) = post_pair_terminal(
            State(state.clone()),
            Json(PairTerminalPayload {
                terminal_id: terminal_id.clone(),
                pairing_code: pairing_code.clone(),
            }),
        )
        .await
        .expect("pair terminal OK");

        assert_eq!(paired["status"], "active");
        let device_token = paired["deviceToken"].as_str().unwrap().to_string();
        assert!(!device_token.is_empty());

        // 4. WhoAmI avec le jeton matériel authentifié
        let mut term_headers = HeaderMap::new();
        term_headers.insert(
            "x-cfitness-terminal-token",
            HeaderValue::from_str(&device_token).unwrap(),
        );
        let Json(me) = get_terminal_whoami(State(state.clone()), term_headers.clone())
            .await
            .expect("whoami OK");
        assert_eq!(me["terminalId"], terminal_id);
        assert_eq!(me["siteId"], "club-carre-soie");
        assert_eq!(me["roomLabel"], "Salle Cours Collectifs");

        // 5. Révocation par l'administrateur
        let Json(revoked) = post_revoke_terminal(
            State(state.clone()),
            Path(("carre-de-soie".into(), terminal_id.clone())),
            headers.clone(),
            Json(RevokeTerminalPayload {
                reason: Some("Remplacement matériel".into()),
            }),
        )
        .await
        .expect("revoke OK");
        assert_eq!(revoked["status"], "revoked");

        // 6. Requête ultérieure du terminal révoqué immédiatement refusée (403)
        let err_revoked_call = get_terminal_whoami(State(state.clone()), term_headers)
            .await
            .expect_err("revoked terminal must fail");
        assert_eq!(err_revoked_call.0, StatusCode::FORBIDDEN);

        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[tokio::test]
    async fn terminal_rbac_and_cross_club_isolation() {
        let state = test_state();

        // 1. Appel whoami sans header de jeton matériel -> 401
        let empty_headers = HeaderMap::new();
        let err_no_token = get_terminal_whoami(State(state.clone()), empty_headers)
            .await
            .expect_err("missing token must return 401");
        assert_eq!(err_no_token.0, StatusCode::UNAUTHORIZED);

        // 2. Profil coach sans délégation terminaux -> 403 sur création
        let coach_token = "coach-token-cs".to_string();
        state.sessions.write().await.insert(
            coach_token.clone(),
            ("emp-chloe".into(), Utc::now().timestamp() + 3600),
        );
        let mut coach_headers = HeaderMap::new();
        coach_headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {coach_token}")).unwrap(),
        );
        coach_headers.insert(
            "x-cfitness-actor-id",
            HeaderValue::from_str("emp-chloe").unwrap(),
        );
        coach_headers.insert(
            "x-cfitness-site-id",
            HeaderValue::from_str("club-beynost").unwrap(),
        );

        let err_coach = post_create_terminal(
            State(state.clone()),
            Path("beynost".into()),
            coach_headers,
            Json(CreateTerminalPayload {
                room_id: "room-cours-co-bey".into(),
                room_label: "Salle Cours".into(),
                label: "Tablette Coach".into(),
            }),
        )
        .await
        .expect_err("unauthorized employee must fail");
        assert_eq!(err_coach.0, StatusCode::FORBIDDEN);

        // 3. Admin Carré de Soie crée un terminal CDS
        let admin = admin_headers(&state).await;
        let Json(created) = post_create_terminal(
            State(state.clone()),
            Path("carre-de-soie".into()),
            admin.clone(),
            Json(CreateTerminalPayload {
                room_id: "room-plateau-cs".into(),
                room_label: "Plateau Musculation".into(),
                label: "Tablette Plateau".into(),
            }),
        )
        .await
        .expect("create OK");
        let term_id = created["terminalId"].as_str().unwrap().to_string();

        // 4. Tentative de révocation du terminal CDS via la route Beynost -> 404 introuvable dans ce club
        let err_cross_revoke = post_revoke_terminal(
            State(state.clone()),
            Path(("beynost".into(), term_id.clone())),
            admin,
            Json(RevokeTerminalPayload { reason: None }),
        )
        .await
        .expect_err("cross-club revocation must return 404");
        assert_eq!(err_cross_revoke.0, StatusCode::NOT_FOUND);

        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[tokio::test]
    async fn terminal_punch_enforces_terminal_allowed_policy_and_transitions() {
        let state = test_state();

        // 1. Créer et activer un terminal pour Carré de Soie
        let token = "term-token-cs-01";
        let term = ClockTerminal {
            id: "term-cs-accueil".into(),
            site_id: "club-carre-soie".into(),
            room_id: "room-accueil".into(),
            room_label: "Accueil & Banque".into(),
            label: "Tablette Accueil CS".into(),
            status: "active".into(),
            failed_pairing_attempts: 0,
            pairing_code: None,
            device_secret_hash: Some(hash_terminal_token(token)),
            created_at: Utc::now().to_rfc3339(),
            paired_at: Some(Utc::now().to_rfc3339()),
            last_seen_at: Some(Utc::now().to_rfc3339()),
        };
        {
            let mut db = state.db.write().await;
            db.clock_terminals.push(term);
        }

        let mut term_headers = admin_headers(&state).await;
        term_headers.insert(
            "x-cfitness-terminal-token",
            HeaderValue::from_str(token).unwrap(),
        );

        // 2. Par défaut en P0, terminal_allowed == false -> pointage refusé (403)
        let err_not_allowed = post_terminal_punch(
            State(state.clone()),
            term_headers.clone(),
            Json(TerminalPunchPayload {
                employee_id: "emp-mario".into(),
                punch_type: "arrivee".into(),
                photo_proof: None,
            }),
        )
        .await
        .expect_err("terminal punch without terminal_allowed must fail 403");
        assert_eq!(err_not_allowed.0, StatusCode::FORBIDDEN);

        // 3. Attribution explicite de la politique terminal_allowed pour Mario sur Carré de Soie
        {
            let mut db = state.db.write().await;
            let mut policies = db
                .personal_workspace
                .clock_policies
                .get("emp-mario")
                .cloned()
                .unwrap_or_default();
            policies.insert(
                "carre-de-soie".into(),
                crate::clock_policy::ClockPolicy {
                    personal_allowed: false,
                    terminal_allowed: true,
                    revision: "rev-test".into(),
                    updated_at: Utc::now().to_rfc3339(),
                    updated_by: "emp-admin".into(),
                },
            );
            db.personal_workspace
                .clock_policies
                .insert("emp-mario".into(), policies);
        }

        // 4. Pointage d'arrivée réussi
        let Json(res_ok) = post_terminal_punch(
            State(state.clone()),
            term_headers.clone(),
            Json(TerminalPunchPayload {
                employee_id: "emp-mario".into(),
                punch_type: "arrivee".into(),
                photo_proof: None,
            }),
        )
        .await
        .expect("terminal punch arrivee OK");

        assert_eq!(res_ok["status"], "recorded");
        assert_eq!(res_ok["entry"]["source"], "terminal");
        assert_eq!(res_ok["entry"]["terminalId"], "term-cs-accueil");
        assert_eq!(res_ok["entry"]["photoProofPresent"], false);

        // 5. Deuxième arrivée consécutive refusée par le contrôle de transition (409 Conflict)
        let err_double = post_terminal_punch(
            State(state.clone()),
            term_headers,
            Json(TerminalPunchPayload {
                employee_id: "emp-mario".into(),
                punch_type: "arrivee".into(),
                photo_proof: None,
            }),
        )
        .await
        .expect_err("consecutive arrivee must return 409");
        assert_eq!(err_double.0, StatusCode::CONFLICT);

        let _ = std::fs::remove_dir_all(&state.data_dir);
    }
}
