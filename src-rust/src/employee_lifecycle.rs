use crate::rbac::is_admin_employee;
use crate::routes::{append_audit, err_resp, resolve_session_actor, SharedState};
use crate::seed::persist_state;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct PatchAdminEmployeePayload {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub matricule: Option<String>,
    pub active: Option<bool>,
    pub contract_type: Option<String>,
    pub weekly_hours: Option<u32>,
}

pub async fn patch_admin_employee(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(raw_emp_id): Path<String>,
    Json(patch): Json<PatchAdminEmployeePayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    if !is_admin_employee(&db, &actor_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : édition et activation des fiches collaborateurs réservées à l'administrateur.",
        ));
    }

    let target_id = raw_emp_id.trim().to_string();
    let Some(idx) = db.employees.iter().position(|e| e.id == target_id) else {
        return Err(err_resp(
            StatusCode::NOT_FOUND,
            format!("Collaborateur introuvable : {}", target_id),
        ));
    };

    if patch.active == Some(false) {
        if target_id == actor_id {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Vous ne pouvez pas désactiver votre propre compte administrateur.",
            ));
        }
        let target_is_admin = db.employees[idx]
            .site_accesses
            .iter()
            .any(|sa| sa.profile_id == "admin_systeme");
        if target_is_admin {
            let other_active_admin_exists = db.employees.iter().any(|e| {
                e.id != target_id
                    && e.active
                    && e.site_accesses
                        .iter()
                        .any(|sa| sa.profile_id == "admin_systeme")
            });
            if !other_active_admin_exists {
                return Err(err_resp(
                    StatusCode::BAD_REQUEST,
                    "Impossible de désactiver le dernier administrateur actif.",
                ));
            }
        }
    }

    if let Some(ref first_name) = patch.first_name {
        if first_name.trim().is_empty() {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Le prénom du collaborateur ne peut pas être vide.",
            ));
        }
    }
    if let Some(ref last_name) = patch.last_name {
        if last_name.trim().is_empty() {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Le nom du collaborateur ne peut pas être vide.",
            ));
        }
    }
    if let Some(ref email) = patch.email {
        let clean_email = email.trim().to_ascii_lowercase();
        if clean_email.is_empty() || !clean_email.contains('@') {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Adresse email collaborateur invalide.",
            ));
        }
        if db
            .employees
            .iter()
            .any(|e| e.id != target_id && e.email.eq_ignore_ascii_case(&clean_email))
        {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                format!("Cet email est déjà utilisé par un autre compte ({}).", clean_email),
            ));
        }
    }
    if let Some(ref matricule) = patch.matricule {
        if matricule.trim().is_empty() {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Le matricule ne peut pas être vide.",
            ));
        }
    }
    if let Some(hours) = patch.weekly_hours {
        if !(1..=48).contains(&hours) {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "La durée hebdomadaire doit être comprise entre 1 et 48 heures.",
            ));
        }
    }

    let snapshot = db.clone();
    let prev_active = db.employees[idx].active;
    let prev_label = format!(
        "{} {} (actif={})",
        db.employees[idx].first_name, db.employees[idx].last_name, prev_active
    );

    if let Some(v) = patch.first_name {
        db.employees[idx].first_name = v.trim().to_string();
    }
    if let Some(v) = patch.last_name {
        db.employees[idx].last_name = v.trim().to_string();
    }
    if let Some(v) = patch.email {
        db.employees[idx].email = v.trim().to_ascii_lowercase();
    }
    if let Some(v) = patch.phone {
        db.employees[idx].phone = v.trim().to_string();
    }
    if let Some(v) = patch.matricule {
        db.employees[idx].matricule = v.trim().to_string();
    }
    if let Some(v) = patch.active {
        db.employees[idx].active = v;
    }
    if let Some(v) = patch.contract_type {
        let clean = v.trim();
        if !clean.is_empty() {
            db.employees[idx].contract.contract_type = clean.to_string();
        }
    }
    if let Some(v) = patch.weekly_hours {
        db.employees[idx].contract.weekly_hours = Some(v);
    }

    let updated = db.employees[idx].clone();
    let action_type = match (prev_active, updated.active) {
        (true, false) => "Désactivation compte",
        (false, true) => "Réactivation compte",
        _ => "Mise à jour collaborateur",
    };
    let after_label = format!(
        "{} {} (actif={})",
        updated.first_name, updated.last_name, updated.active
    );

    append_audit(
        &mut db,
        &actor_id,
        action_type,
        format!("Mise à jour fiche {} ({})", updated.email, updated.id),
        &updated.contract.site_id,
        &updated.id,
        Some(prev_label),
        Some(after_label),
    );

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance fiche collaborateur : {}", err_msg),
        ));
    }
    drop(db);

    if !updated.active {
        state
            .sessions
            .write()
            .await
            .retain(|_, (sid, _)| sid != &target_id);
    }

    Ok(Json(json!({
        "ok": true,
        "employee": {
            "id": updated.id,
            "firstName": updated.first_name,
            "lastName": updated.last_name,
            "email": updated.email,
            "phone": updated.phone,
            "matricule": updated.matricule,
            "active": updated.active,
            "contractType": updated.contract.contract_type,
            "weeklyHours": updated.contract.weekly_hours,
        }
    })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routes::SharedAppState;
    use crate::seed::load_or_init_state;
    use axum::http::{header, HeaderValue};
    use chrono::Utc;
    use std::collections::HashMap;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    fn test_state() -> SharedState {
        static TEST_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
        let seq = TEST_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "cfos_life_test_{}_{}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default(),
            seq
        ));
        Arc::new(SharedAppState {
            db: RwLock::new(load_or_init_state(&dir)),
            data_dir: dir,
            sessions: RwLock::new(HashMap::new()),
            login_attempts: RwLock::new(HashMap::new()),
        })
    }

    async fn session_headers(state: &SharedState, actor_id: &str, site_id: &str) -> HeaderMap {
        let token = format!(
            "life-session-{}-{}",
            actor_id,
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        );
        state.sessions.write().await.insert(
            token.clone(),
            (actor_id.to_string(), Utc::now().timestamp() + 3600),
        );
        let mut headers = HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {token}")).unwrap(),
        );
        headers.insert(
            "x-cfitness-site-id",
            HeaderValue::from_str(site_id).unwrap(),
        );
        headers
    }

    #[tokio::test]
    async fn admin_can_update_employee_fields_and_deactivate_revoking_sessions() {
        let state = test_state();
        let headers = session_headers(&state, "emp-mario", "club-carre-soie").await;
        let _victim_headers = session_headers(&state, "emp-maxime", "club-carre-soie").await;
        assert!(state
            .sessions
            .read()
            .await
            .values()
            .any(|(sid, _)| sid == "emp-maxime"));

        let Json(res) = patch_admin_employee(
            State(state.clone()),
            headers,
            Path("emp-maxime".into()),
            Json(PatchAdminEmployeePayload {
                first_name: Some("Maxime-Pro".into()),
                phone: Some("06 99 88 77 66".into()),
                contract_type: Some("CDD".into()),
                weekly_hours: Some(32),
                active: Some(false),
                ..Default::default()
            }),
        )
        .await
        .expect("admin peut modifier et désactiver un compte");

        assert_eq!(res["ok"], true);
        assert_eq!(res["employee"]["firstName"], "Maxime-Pro");
        assert_eq!(res["employee"]["active"], false);
        assert_eq!(res["employee"]["weeklyHours"], 32);
        assert!(!state
            .sessions
            .read()
            .await
            .values()
            .any(|(sid, _)| sid == "emp-maxime"));

        let reloaded = load_or_init_state(&state.data_dir);
        let emp = reloaded.employees.iter().find(|e| e.id == "emp-maxime").unwrap();
        assert!(!emp.active);
        assert_eq!(emp.first_name, "Maxime-Pro");
        assert_eq!(emp.contract.contract_type, "CDD");
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[tokio::test]
    async fn admin_cannot_deactivate_self_or_last_admin() {
        let state = test_state();
        let headers = session_headers(&state, "emp-mario", "club-carre-soie").await;
        let (status, _) = patch_admin_employee(
            State(state.clone()),
            headers.clone(),
            Path("emp-mario".into()),
            Json(PatchAdminEmployeePayload {
                active: Some(false),
                ..Default::default()
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(status, StatusCode::BAD_REQUEST);

        // Désactiver tous les admins sauf emp-admin puis tenter de désactiver emp-admin
        {
            let mut db = state.db.write().await;
            for emp in &mut db.employees {
                if emp.id != "emp-admin" {
                    emp.active = false;
                }
            }
        }
        let headers_admin = session_headers(&state, "emp-admin", "club-carre-soie").await;
        let (status_last, _) = patch_admin_employee(
            State(state.clone()),
            headers_admin,
            Path("emp-admin".into()),
            Json(PatchAdminEmployeePayload {
                active: Some(false),
                ..Default::default()
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(status_last, StatusCode::BAD_REQUEST);
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[tokio::test]
    async fn non_admin_cannot_patch_employee() {
        let state = test_state();
        let headers = session_headers(&state, "emp-maxime", "club-carre-soie").await;
        let (status, _) = patch_admin_employee(
            State(state.clone()),
            headers,
            Path("emp-chloe".into()),
            Json(PatchAdminEmployeePayload {
                first_name: Some("Hack".into()),
                ..Default::default()
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(status, StatusCode::FORBIDDEN);
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }
}
