use crate::models::{
    ContractSummary, Employee, EmployeeCounter, EmployeeSiteAccess, NotificationPrefs,
    SensitiveBankInfo, UserPreferences,
};
use crate::rbac::{is_admin_employee, normalize_site_id};
use crate::routes::{append_audit, err_resp, resolve_session_actor, SharedState};
use crate::seed::persist_state;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportEmployeeRow {
    pub first_name: String,
    pub last_name: String,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub phone: Option<String>,
    #[serde(default)]
    pub matricule: Option<String>,
    #[serde(default)]
    pub site_ids: Vec<String>,
    #[serde(default)]
    pub profile_id: Option<String>,
    #[serde(default)]
    pub contract_type: Option<String>,
    #[serde(default)]
    pub weekly_hours: Option<u32>,
    #[serde(default)]
    pub initial_password: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportEmployeesPayload {
    pub rows: Vec<ImportEmployeeRow>,
}

fn default_imported_preferences() -> UserPreferences {
    UserPreferences {
        language: "Français".to_string(),
        notifications: NotificationPrefs {
            email_enabled: true,
            sms_enabled: false,
            frequency: "daily".to_string(),
            digest_hour: "08:30".to_string(),
            include_activity_report: false,
        },
        calendar_feed_token: String::new(),
        calendar_feed_enabled: false,
        sso_enabled: false,
        sso_provider: "OIDC / SAML (non activé)".to_string(),
        sso_domain: String::new(),
        theme_mode: "dark".to_string(),
        accent_color: "violet".to_string(),
    }
}

fn default_team_and_positions(
    db: &crate::models::AppDatabaseState,
    site_id: &str,
    profile_id: &str,
) -> (Vec<String>, Vec<String>, Vec<String>) {
    let all_teams: Vec<String> = db
        .teams
        .iter()
        .filter(|t| t.site_id == site_id)
        .map(|t| t.id.clone())
        .collect();
    let managed = match profile_id {
        "admin_systeme" | "master_avance" | "planificateur_avance" | "planificateur_standard" => {
            all_teams.clone()
        }
        _ => vec![],
    };
    let positions: Vec<String> = db
        .positions
        .iter()
        .find(|p| p.site_id == site_id && p.active)
        .map(|p| vec![p.id.clone()])
        .unwrap_or_default();
    (all_teams, managed, positions)
}

pub async fn post_admin_employees_import_csv(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<ImportEmployeesPayload>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    if !is_admin_employee(&db, &actor_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : import CSV des collaborateurs réservé à l'administrateur.",
        ));
    }

    if payload.rows.is_empty() {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Aucune ligne collaborateur à importer.",
        ));
    }
    if payload.rows.len() > 250 {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Lot limité à 250 collaborateurs maximum par import CSV.",
        ));
    }

    let snapshot = db.clone();
    let base_ts = Utc::now().timestamp_millis();
    let mut created_ids: Vec<String> = Vec::new();
    let mut skipped_count: usize = 0;
    let mut errors: Vec<String> = Vec::new();

    for (idx, row) in payload.rows.into_iter().enumerate() {
        let row_num = idx + 1;
        let first_name = row.first_name.trim().to_string();
        let last_name = row.last_name.trim().to_string();
        if first_name.is_empty() || last_name.is_empty() {
            errors.push(format!("Ligne {} : prénom et nom obligatoires.", row_num));
            continue;
        }

        let mut valid_sites: Vec<String> = Vec::new();
        for raw_site in &row.site_ids {
            let norm = normalize_site_id(raw_site);
            if db.sites.iter().any(|s| s.id == norm) && !valid_sites.contains(&norm) {
                valid_sites.push(norm);
            }
        }
        if valid_sites.is_empty() {
            errors.push(format!(
                "Ligne {} ({} {}) : aucun établissement valide.",
                row_num, first_name, last_name
            ));
            continue;
        }

        let profile_id = row
            .profile_id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("employe_standard")
            .to_string();
        if !db.profiles.iter().any(|p| p.id == profile_id) {
            errors.push(format!(
                "Ligne {} ({} {}) : profil RH inconnu « {} ».",
                row_num, first_name, last_name, profile_id
            ));
            continue;
        }

        let clean_pwd = row
            .initial_password
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        if let Some(ref pwd) = clean_pwd {
            if pwd.chars().count() < 12 {
                errors.push(format!(
                    "Ligne {} ({} {}) : mot de passe initial inférieur à 12 caractères.",
                    row_num, first_name, last_name
                ));
                continue;
            }
        }

        let slug = format!("{}.{}", first_name.to_lowercase(), last_name.to_lowercase())
            .replace(' ', "-");
        let email = row
            .email
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_ascii_lowercase)
            .unwrap_or_else(|| format!("{}@c.fitness", slug));

        if db
            .employees
            .iter()
            .any(|e| e.email.eq_ignore_ascii_case(&email))
        {
            skipped_count += 1;
            errors.push(format!(
                "Ligne {} ({}) : Doublon email ignoré.",
                row_num, email
            ));
            continue;
        }

        let new_id = format!("emp-imp-{}-{:03}", base_ts, row_num);
        let matricule = row
            .matricule
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| format!("CF-EMP-{:03}", db.employees.len() + 1));
        let phone = row
            .phone
            .as_deref()
            .map(str::trim)
            .unwrap_or("")
            .to_string();
        let contract_type = row
            .contract_type
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("CDI")
            .to_string();
        let weekly_hours = row.weekly_hours.unwrap_or(35);

        let site_accesses: Vec<EmployeeSiteAccess> = valid_sites
            .iter()
            .enumerate()
            .map(|(s_idx, sid)| {
                let (team_ids, managed_team_ids, position_ids) =
                    default_team_and_positions(&db, sid, &profile_id);
                EmployeeSiteAccess {
                    site_id: sid.clone(),
                    is_primary: s_idx == 0,
                    profile_id: profile_id.clone(),
                    show_on_planning: profile_id != "admin_systeme",
                    team_ids,
                    managed_team_ids,
                    position_ids,
                }
            })
            .collect();

        let primary_site = valid_sites[0].clone();
        let new_emp = Employee {
            id: new_id.clone(),
            first_name,
            last_name,
            birth_name: None,
            matricule,
            email,
            phone,
            active: true,
            hr_file_status: "complete".into(),
            site_accesses,
            sensitive_bank: SensitiveBankInfo {
                payment_mode: "Virement".into(),
                iban_masked: String::new(),
                bic: String::new(),
                nir_masked: String::new(),
            },
            contract: ContractSummary {
                id: format!("ctr-{}", new_id),
                site_id: primary_site,
                contract_type,
                regime: "hours".into(),
                weekly_hours: Some(weekly_hours),
                annual_days: None,
                monthly_gross_eur: None,
                hourly_rate_eur: None,
                loaded_cost_factor: 1.42,
                effective_from: Utc::now().format("%Y-%m-%d").to_string(),
                effective_to: None,
            },
            counter: EmployeeCounter {
                cp_n_acquired: 0.0,
                cp_n_taken: 0.0,
                cp_n_minus1_remaining: 0.0,
                rtt_days_remaining: None,
                annualization_balance_hours: None,
            },
        };

        db.employees.push(new_emp);
        db.preferences_by_employee
            .insert(new_id.clone(), default_imported_preferences());
        if let Some(pwd) = clean_pwd {
            db.password_hashes_by_employee
                .insert(new_id.clone(), crate::auth_passwords::hash_password(&pwd));
        }
        created_ids.push(new_id);
    }

    let created_count = created_ids.len();
    if created_count > 0 {
        append_audit(
            &mut db,
            &actor_id,
            "Import CSV collaborateurs",
            format!(
                "{} collaborateur(s) importé(s), {} doublon(s) ignoré(s).",
                created_count, skipped_count
            ),
            "org",
            &format!("{} compte(s)", created_count),
            None,
            Some(created_ids.join(", ")),
        );
        if let Err(err_msg) = persist_state(&state.data_dir, &db) {
            *db = snapshot;
            return Err(err_resp(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Échec persistance import CSV collaborateurs : {}", err_msg),
            ));
        }
    }

    Ok((
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "createdCount": created_count,
            "skippedCount": skipped_count,
            "createdIds": created_ids,
            "errors": errors,
        })),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth_passwords::verify_password_hash;
    use crate::routes::SharedAppState;
    use crate::seed::load_or_init_state;
    use axum::http::{header, HeaderValue};
    use std::collections::HashMap;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    fn test_state() -> SharedState {
        static TEST_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
        let seq = TEST_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "cfos_imp_test_{}_{}",
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
            "imp-session-{}-{}",
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
    async fn import_csv_creates_multi_club_employees_and_hashes_passwords() {
        let state = test_state();
        let headers = session_headers(&state, "emp-mario", "club-carre-soie").await;
        let payload = ImportEmployeesPayload {
            rows: vec![ImportEmployeeRow {
                first_name: "Claire".into(),
                last_name: "Dupont".into(),
                email: Some("claire.dupont@c.fitness".into()),
                phone: Some("0612345678".into()),
                matricule: Some("CF-201".into()),
                site_ids: vec!["cds".into(), "beynost".into()],
                profile_id: Some("planificateur_avance".into()),
                contract_type: Some("CDI".into()),
                weekly_hours: Some(39),
                initial_password: Some("BienvenueCfit2026!".into()),
            }],
        };

        let (status, Json(body)) =
            post_admin_employees_import_csv(State(state.clone()), headers, Json(payload))
                .await
                .expect("import admin valide");
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["createdCount"], 1);
        assert_eq!(body["skippedCount"], 0);

        let new_id = body["createdIds"][0].as_str().unwrap().to_string();
        let db = state.db.read().await;
        let emp = db.employees.iter().find(|e| e.id == new_id).unwrap();
        assert_eq!(emp.site_accesses.len(), 2);
        assert_eq!(emp.site_accesses[0].site_id, "club-carre-soie");
        assert_eq!(emp.site_accesses[1].site_id, "club-beynost");
        assert_eq!(emp.contract.weekly_hours, Some(39));
        let stored_hash = db.password_hashes_by_employee.get(&new_id).unwrap();
        assert!(verify_password_hash("BienvenueCfit2026!", stored_hash));
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[tokio::test]
    async fn import_csv_skips_duplicate_emails_and_reports_invalid_rows() {
        let state = test_state();
        let headers = session_headers(&state, "emp-mario", "club-carre-soie").await;
        let payload = ImportEmployeesPayload {
            rows: vec![
                ImportEmployeeRow {
                    first_name: "Doublon".into(),
                    last_name: "Mario".into(),
                    email: Some("mario.carvalho@cfitness.fr".into()),
                    phone: None,
                    matricule: None,
                    site_ids: vec!["club-carre-soie".into()],
                    profile_id: None,
                    contract_type: None,
                    weekly_hours: None,
                    initial_password: None,
                },
                ImportEmployeeRow {
                    first_name: "Pass".into(),
                    last_name: "Court".into(),
                    email: Some("pass.court@c.fitness".into()),
                    phone: None,
                    matricule: None,
                    site_ids: vec!["club-beynost".into()],
                    profile_id: None,
                    contract_type: None,
                    weekly_hours: None,
                    initial_password: Some("court".into()),
                },
                ImportEmployeeRow {
                    first_name: "Lucas".into(),
                    last_name: "Martin".into(),
                    email: Some("lucas.martin@c.fitness".into()),
                    phone: None,
                    matricule: None,
                    site_ids: vec!["club-beynost".into()],
                    profile_id: Some("employe_standard".into()),
                    contract_type: Some("CDD".into()),
                    weekly_hours: Some(24),
                    initial_password: None,
                },
            ],
        };

        let (_, Json(body)) =
            post_admin_employees_import_csv(State(state.clone()), headers, Json(payload))
                .await
                .unwrap();
        assert_eq!(body["createdCount"], 1);
        assert_eq!(body["skippedCount"], 1);
        assert_eq!(body["errors"].as_array().unwrap().len(), 2);
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[tokio::test]
    async fn import_csv_rejects_non_admin_with_403() {
        let state = test_state();
        let headers = session_headers(&state, "emp-maxime", "club-carre-soie").await;
        let payload = ImportEmployeesPayload {
            rows: vec![ImportEmployeeRow {
                first_name: "Test".into(),
                last_name: "Refuse".into(),
                email: None,
                phone: None,
                matricule: None,
                site_ids: vec!["club-carre-soie".into()],
                profile_id: None,
                contract_type: None,
                weekly_hours: None,
                initial_password: None,
            }],
        };

        let (status, _) = post_admin_employees_import_csv(State(state.clone()), headers, Json(payload))
            .await
            .unwrap_err();
        assert_eq!(status, StatusCode::FORBIDDEN);
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }
}
