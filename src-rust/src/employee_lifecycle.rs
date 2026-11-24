use crate::models::{
    AppDatabaseState, CounterAdjustmentRecord, Employee, EmployeeCounter, EmployeeSiteAccess,
    SensitiveBankInfo,
};
use crate::rbac::{
    can_access_site_scope, evaluate_permission, is_owner_or_super_admin, PermissionTarget,
};
use crate::routes::{append_audit, err_resp, is_demo_mode, resolve_session_actor, SharedState};
use crate::seed::persist_state;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use chrono::{NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

type Failure = (StatusCode, Json<Value>);

fn require_bearer(headers: &HeaderMap) -> Result<(), Failure> {
    let ok = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("Bearer "));
    if !ok {
        return Err(err_resp(
            StatusCode::UNAUTHORIZED,
            "Connectez-vous pour accéder aux dossiers RH.",
        ));
    }
    Ok(())
}

fn parse_club_site(raw: &str) -> Result<(&'static str, &'static str), Failure> {
    match raw.trim() {
        "carre-de-soie" | "club-carre-soie" => Ok(("carre-de-soie", "club-carre-soie")),
        "beynost" | "club-beynost" => Ok(("beynost", "club-beynost")),
        _ => Err(err_resp(StatusCode::BAD_REQUEST, "Établissement inconnu.")),
    }
}

pub(crate) fn allowed_on_target(
    db: &AppDatabaseState,
    actor_id: &str,
    site_id: &str,
    target: &Employee,
    action_id: &str,
) -> bool {
    let Some(access) = target.site_accesses.iter().find(|a| a.site_id == site_id) else {
        return false;
    };
    evaluate_permission(
        db,
        actor_id,
        site_id,
        action_id,
        Some(PermissionTarget {
            site_id: Some(site_id),
            target_employee_id: Some(&target.id),
            target_team_ids: &access.team_ids,
            lock_state: None,
        }),
    )
    .allowed
}

pub(crate) fn dossier_revision(emp: &Employee) -> String {
    let payload = json!({
        "firstName": emp.first_name,
        "lastName": emp.last_name,
        "birthName": emp.birth_name,
        "email": emp.email,
        "phone": emp.phone,
        "matricule": emp.matricule,
        "active": emp.active,
        "hrFileStatus": emp.hr_file_status,
        "contract": emp.contract,
    });
    format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&payload).expect("serializable dossier"))
    )
}

pub(crate) fn counter_revision(emp: &Employee) -> String {
    format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&emp.counter).expect("serializable counter"))
    )
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DossierContractView {
    pub id: String,
    pub site_id: String,
    pub contract_type: String,
    pub regime: String,
    pub weekly_hours: Option<u32>,
    pub annual_days: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub monthly_gross_eur: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hourly_rate_eur: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loaded_cost_factor: Option<f64>,
    pub effective_from: String,
    pub effective_to: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DossierSiteAccessView {
    pub site_id: String,
    pub site_name: String,
    pub is_primary: bool,
    pub profile_id: String,
    pub profile_name: String,
    pub show_on_planning: bool,
    pub team_ids: Vec<String>,
    pub team_names: Vec<String>,
    pub managed_team_ids: Vec<String>,
    pub managed_team_names: Vec<String>,
    pub position_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DossierPermissionsView {
    pub is_self: bool,
    pub can_view_sensitive: bool,
    pub can_view_counters: bool,
    pub can_edit_identity: bool,
    pub can_toggle_active: bool,
    pub can_edit_contract: bool,
    pub can_edit_salary: bool,
    pub can_edit_counters: bool,
    pub can_edit_site_access: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmployeeDossierView {
    pub id: String,
    pub first_name: String,
    pub last_name: String,
    pub birth_name: Option<String>,
    pub matricule: String,
    pub active: bool,
    pub hr_file_status: String,
    pub dossier_revision: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub counter_revision: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sensitive_bank: Option<SensitiveBankInfo>,
    pub contract: DossierContractView,
    pub site_accesses: Vec<DossierSiteAccessView>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub counter: Option<EmployeeCounter>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub counter_history: Option<Vec<CounterAdjustmentRecord>>,
    pub permissions: DossierPermissionsView,
}

fn enrich_site_access(db: &AppDatabaseState, acc: &EmployeeSiteAccess) -> DossierSiteAccessView {
    let site_name = db
        .sites
        .iter()
        .find(|s| s.id == acc.site_id)
        .map(|s| s.name.clone())
        .unwrap_or_else(|| acc.site_id.clone());
    let profile_name = db
        .profiles
        .iter()
        .find(|p| p.id == acc.profile_id)
        .map(|p| p.name.clone())
        .unwrap_or_else(|| acc.profile_id.clone());
    let resolve_team_names = |ids: &[String]| -> Vec<String> {
        ids.iter()
            .map(|tid| {
                db.teams
                    .iter()
                    .find(|t| t.id == *tid)
                    .map(|t| t.name.clone())
                    .unwrap_or_else(|| tid.clone())
            })
            .collect()
    };
    DossierSiteAccessView {
        site_id: acc.site_id.clone(),
        site_name,
        is_primary: acc.is_primary,
        profile_id: acc.profile_id.clone(),
        profile_name,
        show_on_planning: acc.show_on_planning,
        team_ids: acc.team_ids.clone(),
        team_names: resolve_team_names(&acc.team_ids),
        managed_team_ids: acc.managed_team_ids.clone(),
        managed_team_names: resolve_team_names(&acc.managed_team_ids),
        position_ids: acc.position_ids.clone(),
    }
}

pub fn build_dossier_view(
    db: &AppDatabaseState,
    actor_id: &str,
    site_id: &str,
    target: &Employee,
) -> Option<EmployeeDossierView> {
    if !target.site_accesses.iter().any(|a| a.site_id == site_id) {
        return None;
    }
    let is_self = actor_id == target.id;
    let can_view_file = is_self || allowed_on_target(db, actor_id, site_id, target, "ORG04-07");
    if !can_view_file {
        return None;
    }

    let can_view_sensitive =
        is_self || allowed_on_target(db, actor_id, site_id, target, "ORG04-10");
    let can_view_counters =
        is_self || allowed_on_target(db, actor_id, site_id, target, "ORG04-16");
    let can_edit_identity = allowed_on_target(db, actor_id, site_id, target, "ORG04-08");
    let can_toggle_active = allowed_on_target(db, actor_id, site_id, target, "ORG04-09");
    let can_edit_contract = allowed_on_target(db, actor_id, site_id, target, "ORG04-12")
        || allowed_on_target(db, actor_id, site_id, target, "ORG04-13");
    let can_edit_salary = allowed_on_target(db, actor_id, site_id, target, "ORG04-11");
    let can_edit_counters = allowed_on_target(db, actor_id, site_id, target, "ORG04-16")
        && (allowed_on_target(db, actor_id, site_id, target, "ORG04-08")
            || allowed_on_target(db, actor_id, site_id, target, "ORG04-12"));
    let can_edit_site_access = is_owner_or_super_admin(db, actor_id, site_id)
        || (allowed_on_target(db, actor_id, site_id, target, "ORG04-08")
            && (allowed_on_target(db, actor_id, site_id, target, "ORG04-12")
                || allowed_on_target(db, actor_id, site_id, target, "ORG04-14")));

    let actor_sites: Vec<&str> = db
        .employees
        .iter()
        .find(|e| e.id == actor_id)
        .map(|e| e.site_accesses.iter().map(|a| a.site_id.as_str()).collect())
        .unwrap_or_default();

    let site_accesses = target
        .site_accesses
        .iter()
        .filter(|acc| is_self || actor_sites.contains(&acc.site_id.as_str()))
        .map(|acc| enrich_site_access(db, acc))
        .collect();

    let contract = DossierContractView {
        id: target.contract.id.clone(),
        site_id: target.contract.site_id.clone(),
        contract_type: target.contract.contract_type.clone(),
        regime: target.contract.regime.clone(),
        weekly_hours: target.contract.weekly_hours,
        annual_days: target.contract.annual_days,
        monthly_gross_eur: if can_view_sensitive {
            target.contract.monthly_gross_eur
        } else {
            None
        },
        hourly_rate_eur: if can_view_sensitive {
            target.contract.hourly_rate_eur
        } else {
            None
        },
        loaded_cost_factor: if can_view_sensitive {
            Some(target.contract.loaded_cost_factor)
        } else {
            None
        },
        effective_from: target.contract.effective_from.clone(),
        effective_to: target.contract.effective_to.clone(),
    };

    let counter_history = if can_view_counters {
        let mut rows: Vec<CounterAdjustmentRecord> = db
            .employee_counter_history
            .iter()
            .filter(|h| h.employee_id == target.id)
            .cloned()
            .collect();
        rows.sort_by(|a, b| b.timestamp.cmp(&a.timestamp).then(b.id.cmp(&a.id)));
        Some(rows)
    } else {
        None
    };

    Some(EmployeeDossierView {
        id: target.id.clone(),
        first_name: target.first_name.clone(),
        last_name: target.last_name.clone(),
        birth_name: target.birth_name.clone(),
        matricule: target.matricule.clone(),
        active: target.active,
        hr_file_status: target.hr_file_status.clone(),
        dossier_revision: dossier_revision(target),
        counter_revision: if can_view_counters {
            Some(counter_revision(target))
        } else {
            None
        },
        email: if can_view_sensitive {
            Some(target.email.clone())
        } else {
            None
        },
        phone: if can_view_sensitive {
            Some(target.phone.clone())
        } else {
            None
        },
        sensitive_bank: if can_view_sensitive {
            Some(target.sensitive_bank.clone())
        } else {
            None
        },
        contract,
        site_accesses,
        counter: if can_view_counters {
            Some(target.counter.clone())
        } else {
            None
        },
        counter_history,
        permissions: DossierPermissionsView {
            is_self,
            can_view_sensitive,
            can_view_counters,
            can_edit_identity,
            can_toggle_active,
            can_edit_contract,
            can_edit_salary,
            can_edit_counters,
            can_edit_site_access,
        },
    })
}

fn reference_payload(db: &AppDatabaseState, actor_id: &str) -> (Value, Value, Value) {
    let actor_sites: Vec<&str> = db
        .employees
        .iter()
        .find(|e| e.id == actor_id)
        .map(|e| e.site_accesses.iter().map(|a| a.site_id.as_str()).collect())
        .unwrap_or_default();
    let sites = json!(db
        .sites
        .iter()
        .filter(|s| actor_sites.contains(&s.id.as_str()))
        .map(|s| json!({"id": s.id, "name": s.name}))
        .collect::<Vec<_>>());
    let teams = json!(db
        .teams
        .iter()
        .filter(|t| actor_sites.contains(&t.site_id.as_str()))
        .map(|t| json!({"id": t.id, "siteId": t.site_id, "name": t.name}))
        .collect::<Vec<_>>());
    let profiles = json!(db
        .profiles
        .iter()
        .map(|p| json!({"id": p.id, "name": p.name, "scopeSelected": p.scope_selected}))
        .collect::<Vec<_>>());
    (sites, teams, profiles)
}

pub async fn get_hr_dossiers(
    State(state): State<SharedState>,
    Path(raw_club): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, Failure> {
    require_bearer(&headers)?;
    let (club_id, site_id) = parse_club_site(&raw_club)?;
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;
    if !can_access_site_scope(&db, &actor_id, site_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Cet établissement est hors de votre périmètre.",
        ));
    }
    let employees: Vec<EmployeeDossierView> = db
        .employees
        .iter()
        .filter_map(|e| build_dossier_view(&db, &actor_id, site_id, e))
        .collect();
    let (sites, teams, profiles) = reference_payload(&db, &actor_id);
    Ok(Json(json!({
        "actorId": actor_id,
        "clubId": club_id,
        "siteId": site_id,
        "demoMode": is_demo_mode(),
        "sites": sites,
        "teams": teams,
        "profiles": profiles,
        "employees": employees,
    })))
}

pub async fn get_my_dossier(
    State(state): State<SharedState>,
    Path(raw_club): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, Failure> {
    require_bearer(&headers)?;
    let (club_id, site_id) = parse_club_site(&raw_club)?;
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;
    if !can_access_site_scope(&db, &actor_id, site_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Cet établissement est hors de votre périmètre.",
        ));
    }
    let me = db
        .employees
        .iter()
        .find(|e| e.id == actor_id)
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Dossier collaborateur introuvable."))?;
    let dossier = build_dossier_view(&db, &actor_id, site_id, me)
        .ok_or_else(|| err_resp(StatusCode::FORBIDDEN, "Accès au dossier impossible sur ce club."))?;
    let (sites, teams, _) = reference_payload(&db, &actor_id);
    Ok(Json(json!({
        "actorId": actor_id,
        "clubId": club_id,
        "siteId": site_id,
        "demoMode": is_demo_mode(),
        "sites": sites,
        "teams": teams,
        "dossier": dossier,
    })))
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct PatchAdminEmployeePayload {
    pub site_id: Option<String>,
    pub expected_revision: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub birth_name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub matricule: Option<String>,
    pub active: Option<bool>,
    pub hr_file_status: Option<String>,
    pub contract_type: Option<String>,
    pub regime: Option<String>,
    pub weekly_hours: Option<u32>,
    pub annual_days: Option<u32>,
    pub effective_from: Option<String>,
    pub effective_to: Option<String>,
    pub monthly_gross_eur: Option<f64>,
    pub hourly_rate_eur: Option<f64>,
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct UpdateEmployeeCountersPayload {
    pub site_id: Option<String>,
    pub expected_revision: String,
    pub reason: String,
    pub cp_n_acquired: Option<f64>,
    pub cp_n_taken: Option<f64>,
    pub cp_n_minus1_remaining: Option<f64>,
    pub rtt_days_remaining: Option<f64>,
    pub clear_rtt: Option<bool>,
    pub annualization_balance_hours: Option<f64>,
    pub clear_annualization: Option<bool>,
}

fn resolve_target_site(
    payload_site: Option<&str>,
    headers: &HeaderMap,
    session_site: &str,
) -> Result<String, Failure> {
    let raw = payload_site
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .or_else(|| {
            headers
                .get("x-cfitness-site-id")
                .and_then(|v| v.to_str().ok())
                .map(str::trim)
                .filter(|s| !s.is_empty() && *s != "all")
        })
        .unwrap_or(session_site);
    Ok(parse_club_site(raw)?.1.to_string())
}

pub async fn patch_admin_employee(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(raw_emp_id): Path<String>,
    Json(patch): Json<PatchAdminEmployeePayload>,
) -> Result<Json<Value>, Failure> {
    require_bearer(&headers)?;
    let (actor_id, session_site) = resolve_session_actor(&state, &headers).await?;
    let target_site_id = resolve_target_site(patch.site_id.as_deref(), &headers, &session_site)?;
    let mut db = state.db.write().await;

    if !can_access_site_scope(&db, &actor_id, &target_site_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : cet établissement est hors de votre périmètre.",
        ));
    }

    let target_id = raw_emp_id.trim().to_string();
    let Some(idx) = db.employees.iter().position(|e| e.id == target_id) else {
        return Err(err_resp(
            StatusCode::NOT_FOUND,
            format!("Collaborateur introuvable : {}", target_id),
        ));
    };
    let target_emp = db.employees[idx].clone();
    if !target_emp
        .site_accesses
        .iter()
        .any(|a| a.site_id == target_site_id)
    {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Ce collaborateur n'est pas rattaché à l'établissement sélectionné.",
        ));
    }

    let touches_identity = patch.first_name.is_some()
        || patch.last_name.is_some()
        || patch.birth_name.is_some()
        || patch.email.is_some()
        || patch.phone.is_some()
        || patch.matricule.is_some()
        || patch.hr_file_status.is_some();
    let touches_active = patch.active.is_some();
    let touches_contract = patch.contract_type.is_some()
        || patch.regime.is_some()
        || patch.weekly_hours.is_some()
        || patch.annual_days.is_some()
        || patch.effective_from.is_some()
        || patch.effective_to.is_some();
    let touches_salary = patch.monthly_gross_eur.is_some() || patch.hourly_rate_eur.is_some();

    if !touches_identity && !touches_active && !touches_contract && !touches_salary {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Aucune modification de dossier ou contrat fournie.",
        ));
    }

    if touches_identity && !allowed_on_target(&db, &actor_id, &target_site_id, &target_emp, "ORG04-08") {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : droits insuffisants pour modifier la fiche collaborateur.",
        ));
    }
    if touches_active && !allowed_on_target(&db, &actor_id, &target_site_id, &target_emp, "ORG04-09") {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : droits insuffisants pour archiver ou réactiver un compte.",
        ));
    }
    if touches_contract
        && !allowed_on_target(&db, &actor_id, &target_site_id, &target_emp, "ORG04-12")
        && !allowed_on_target(&db, &actor_id, &target_site_id, &target_emp, "ORG04-13")
    {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : droits insuffisants pour modifier le contrat ou le volume horaire.",
        ));
    }
    if touches_salary && !allowed_on_target(&db, &actor_id, &target_site_id, &target_emp, "ORG04-11") {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : droits insuffisants pour modifier les données salariales.",
        ));
    }

    if let Some(ref exp_rev) = patch.expected_revision {
        if exp_rev.trim() != dossier_revision(&target_emp) {
            return Err(err_resp(
                StatusCode::CONFLICT,
                "Ce dossier a été modifié entre-temps. Actualisez avant d'enregistrer.",
            ));
        }
    }

    if let Some(ref reason) = patch.reason {
        if reason.trim().chars().count() > 1000 {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Le motif ne doit pas dépasser 1000 caractères.",
            ));
        }
    }

    if patch.active == Some(false) {
        if target_id == actor_id {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Vous ne pouvez pas désactiver votre propre compte.",
            ));
        }
        let target_is_admin = target_emp
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
        let trimmed = first_name.trim();
        if trimmed.is_empty() || trimmed.chars().count() > 100 {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Le prénom du collaborateur doit contenir entre 1 et 100 caractères.",
            ));
        }
    }
    if let Some(ref last_name) = patch.last_name {
        let trimmed = last_name.trim();
        if trimmed.is_empty() || trimmed.chars().count() > 100 {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Le nom du collaborateur doit contenir entre 1 et 100 caractères.",
            ));
        }
    }
    if let Some(ref birth_name) = patch.birth_name {
        if birth_name.trim().chars().count() > 100 {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Le nom de naissance ne doit pas dépasser 100 caractères.",
            ));
        }
    }
    if let Some(ref email) = patch.email {
        let clean_email = email.trim().to_ascii_lowercase();
        if clean_email.is_empty() || !clean_email.contains('@') || clean_email.chars().count() > 200 {
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
    if let Some(ref phone) = patch.phone {
        if phone.trim().chars().count() > 40 {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Le numéro de téléphone ne doit pas dépasser 40 caractères.",
            ));
        }
    }
    if let Some(ref matricule) = patch.matricule {
        let trimmed = matricule.trim();
        if trimmed.is_empty() || trimmed.chars().count() > 40 {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Le matricule doit contenir entre 1 et 40 caractères.",
            ));
        }
    }
    if let Some(ref status) = patch.hr_file_status {
        if !matches!(status.trim(), "complete" | "incomplete" | "pending") {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Statut de dossier invalide (attendu : complete, incomplete ou pending).",
            ));
        }
    }
    if let Some(ref ct) = patch.contract_type {
        let trimmed = ct.trim();
        if !matches!(trimmed, "CDI" | "CDD" | "Alternance" | "Apprentissage" | "Stage") {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Type de contrat invalide (CDI, CDD, Alternance, Apprentissage ou Stage).",
            ));
        }
    }
    if let Some(ref regime) = patch.regime {
        if !matches!(regime.trim(), "hours" | "forfait_jours") {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Régime de contrat invalide (hours ou forfait_jours).",
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
    if let Some(days) = patch.annual_days {
        if !(1..=235).contains(&days) {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Le forfait jours annuel doit être compris entre 1 et 235 jours.",
            ));
        }
    }
    if let Some(gross) = patch.monthly_gross_eur {
        if !gross.is_finite() || !(0.0..=100_000.0).contains(&gross) {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Le salaire brut mensuel doit être un montant valide positif.",
            ));
        }
    }
    if let Some(hourly) = patch.hourly_rate_eur {
        if !hourly.is_finite() || !(0.0..=1_000.0).contains(&hourly) {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Le taux horaire doit être un montant valide positif.",
            ));
        }
    }

    let mut next = db.clone();
    let prev_active = next.employees[idx].active;
    let prev_label = format!(
        "{} {} (actif={}, contrat={} / {:?}h / {:?}j)",
        next.employees[idx].first_name,
        next.employees[idx].last_name,
        prev_active,
        next.employees[idx].contract.contract_type,
        next.employees[idx].contract.weekly_hours,
        next.employees[idx].contract.annual_days
    );

    if let Some(v) = patch.first_name {
        next.employees[idx].first_name = v.trim().to_string();
    }
    if let Some(v) = patch.last_name {
        next.employees[idx].last_name = v.trim().to_string();
    }
    if let Some(v) = patch.birth_name {
        let clean = v.trim().to_string();
        next.employees[idx].birth_name = if clean.is_empty() { None } else { Some(clean) };
    }
    if let Some(v) = patch.email {
        next.employees[idx].email = v.trim().to_ascii_lowercase();
    }
    if let Some(v) = patch.phone {
        next.employees[idx].phone = v.trim().to_string();
    }
    if let Some(v) = patch.matricule {
        next.employees[idx].matricule = v.trim().to_string();
    }
    if let Some(v) = patch.active {
        next.employees[idx].active = v;
    }
    if let Some(v) = patch.hr_file_status {
        next.employees[idx].hr_file_status = v.trim().to_string();
    }
    if let Some(v) = patch.contract_type {
        next.employees[idx].contract.contract_type = v.trim().to_string();
    }
    if let Some(v) = patch.regime {
        let clean = v.trim().to_string();
        if clean == "forfait_jours" {
            next.employees[idx].contract.weekly_hours = None;
            if next.employees[idx].contract.annual_days.is_none() && patch.annual_days.is_none() {
                next.employees[idx].contract.annual_days = Some(218);
            }
        } else {
            next.employees[idx].contract.annual_days = None;
            if next.employees[idx].contract.weekly_hours.is_none() && patch.weekly_hours.is_none() {
                next.employees[idx].contract.weekly_hours = Some(35);
            }
        }
        next.employees[idx].contract.regime = clean;
    }
    if let Some(v) = patch.weekly_hours {
        next.employees[idx].contract.weekly_hours = Some(v);
        if next.employees[idx].contract.regime == "forfait_jours" {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Passez le contrat en régime horaire avant de fixer un volume hebdomadaire.",
            ));
        }
    }
    if let Some(v) = patch.annual_days {
        next.employees[idx].contract.annual_days = Some(v);
        if next.employees[idx].contract.regime == "hours" {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Passez le contrat en forfait jours avant de fixer un nombre de jours annuel.",
            ));
        }
    }
    if let Some(ref eff_from) = patch.effective_from {
        let clean = eff_from.trim();
        if NaiveDate::parse_from_str(clean, "%Y-%m-%d").is_err() {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Date de début de contrat invalide (AAAA-MM-JJ attendue).",
            ));
        }
        next.employees[idx].contract.effective_from = clean.to_string();
    }
    if let Some(ref eff_to) = patch.effective_to {
        let clean = eff_to.trim();
        if clean.is_empty() {
            next.employees[idx].contract.effective_to = None;
        } else {
            if NaiveDate::parse_from_str(clean, "%Y-%m-%d").is_err() {
                return Err(err_resp(
                    StatusCode::BAD_REQUEST,
                    "Date de fin de contrat invalide (AAAA-MM-JJ attendue).",
                ));
            }
            next.employees[idx].contract.effective_to = Some(clean.to_string());
        }
    }
    if let Some(ref end_str) = next.employees[idx].contract.effective_to {
        if let (Ok(start), Ok(end)) = (
            NaiveDate::parse_from_str(&next.employees[idx].contract.effective_from, "%Y-%m-%d"),
            NaiveDate::parse_from_str(end_str, "%Y-%m-%d"),
        ) {
            if end < start {
                return Err(err_resp(
                    StatusCode::BAD_REQUEST,
                    "La date de fin du contrat ne peut pas être antérieure à la date de début.",
                ));
            }
        }
    }
    if let Some(v) = patch.monthly_gross_eur {
        next.employees[idx].contract.monthly_gross_eur = Some((v * 100.0).round() / 100.0);
    }
    if let Some(v) = patch.hourly_rate_eur {
        next.employees[idx].contract.hourly_rate_eur = Some((v * 100.0).round() / 100.0);
    }

    let updated = next.employees[idx].clone();
    let action_type = match (prev_active, updated.active) {
        (true, false) => "Désactivation compte",
        (false, true) => "Réactivation compte",
        _ => "Mise à jour dossier RH",
    };
    let after_label = format!(
        "{} {} (actif={}, contrat={} / {:?}h / {:?}j)",
        updated.first_name,
        updated.last_name,
        updated.active,
        updated.contract.contract_type,
        updated.contract.weekly_hours,
        updated.contract.annual_days
    );
    let reason_note = patch
        .reason
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| format!(" — motif : {s}"))
        .unwrap_or_default();

    append_audit(
        &mut next,
        &actor_id,
        action_type,
        format!("Mise à jour dossier {} ({}){}", updated.id, target_site_id, reason_note),
        &target_site_id,
        &updated.id,
        Some(prev_label),
        Some(after_label),
    );

    persist_state(&state.data_dir, &next).map_err(|err_msg| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance fiche collaborateur : {}", err_msg),
        )
    })?;
    *db = next;

    let dossier = build_dossier_view(&db, &actor_id, &target_site_id, &db.employees[idx]);
    drop(db);

    if !updated.active {
        state
            .sessions
            .write()
            .await
            .retain(|_, (sid, _)| sid != &target_id);
    }

    let mut emp_json = json!({
        "id": updated.id,
        "firstName": updated.first_name,
        "lastName": updated.last_name,
        "matricule": updated.matricule,
        "active": updated.active,
        "hrFileStatus": updated.hr_file_status,
        "contractType": updated.contract.contract_type,
        "regime": updated.contract.regime,
        "weeklyHours": updated.contract.weekly_hours,
        "annualDays": updated.contract.annual_days,
        "dossierRevision": dossier_revision(&updated),
    });
    if let Some(ref view) = dossier {
        if view.permissions.can_view_sensitive {
            emp_json["email"] = json!(updated.email);
            emp_json["phone"] = json!(updated.phone);
        }
    }

    Ok(Json(json!({
        "ok": true,
        "employee": emp_json,
        "dossier": dossier,
    })))
}

fn round2(val: f64) -> f64 {
    (val * 100.0).round() / 100.0
}

fn counters_equal(a: &EmployeeCounter, b: &EmployeeCounter) -> bool {
    (a.cp_n_acquired - b.cp_n_acquired).abs() < 1e-9
        && (a.cp_n_taken - b.cp_n_taken).abs() < 1e-9
        && (a.cp_n_minus1_remaining - b.cp_n_minus1_remaining).abs() < 1e-9
        && a.rtt_days_remaining == b.rtt_days_remaining
        && a.annualization_balance_hours == b.annualization_balance_hours
}

pub async fn put_admin_employee_counters(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(raw_emp_id): Path<String>,
    Json(patch): Json<UpdateEmployeeCountersPayload>,
) -> Result<Json<Value>, Failure> {
    require_bearer(&headers)?;
    let (actor_id, session_site) = resolve_session_actor(&state, &headers).await?;
    let target_site_id = resolve_target_site(patch.site_id.as_deref(), &headers, &session_site)?;
    let mut db = state.db.write().await;

    if !can_access_site_scope(&db, &actor_id, &target_site_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : cet établissement est hors de votre périmètre.",
        ));
    }

    let target_id = raw_emp_id.trim().to_string();
    let Some(idx) = db.employees.iter().position(|e| e.id == target_id) else {
        return Err(err_resp(
            StatusCode::NOT_FOUND,
            format!("Collaborateur introuvable : {}", target_id),
        ));
    };
    let target_emp = db.employees[idx].clone();
    if !target_emp
        .site_accesses
        .iter()
        .any(|a| a.site_id == target_site_id)
    {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Ce collaborateur n'est pas rattaché à l'établissement sélectionné.",
        ));
    }

    let allowed = allowed_on_target(&db, &actor_id, &target_site_id, &target_emp, "ORG04-16")
        && (allowed_on_target(&db, &actor_id, &target_site_id, &target_emp, "ORG04-08")
            || allowed_on_target(&db, &actor_id, &target_site_id, &target_emp, "ORG04-12"));
    if !allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : correction des compteurs réservée aux profils RH habilités sur ce club et cette équipe.",
        ));
    }

    if patch.expected_revision.trim().is_empty()
        || patch.expected_revision.trim() != counter_revision(&target_emp)
    {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "Les compteurs ont été modifiés entre-temps. Actualisez avant de corriger.",
        ));
    }

    let reason = patch.reason.trim().to_string();
    if reason.is_empty() || reason.chars().count() > 1000 {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Indiquez un motif de correction entre 1 et 1000 caractères.",
        ));
    }

    let mut next_counter = target_emp.counter.clone();
    if let Some(v) = patch.cp_n_acquired {
        if !v.is_finite() || !(0.0..=100.0).contains(&v) {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "CP N acquis invalide (attendu entre 0 et 100 jours).",
            ));
        }
        next_counter.cp_n_acquired = round2(v);
    }
    if let Some(v) = patch.cp_n_taken {
        if !v.is_finite() || !(0.0..=100.0).contains(&v) {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "CP N pris invalide (attendu entre 0 et 100 jours).",
            ));
        }
        next_counter.cp_n_taken = round2(v);
    }
    if let Some(v) = patch.cp_n_minus1_remaining {
        if !v.is_finite() || !(0.0..=100.0).contains(&v) {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Reliquat CP N-1 invalide (attendu entre 0 et 100 jours).",
            ));
        }
        next_counter.cp_n_minus1_remaining = round2(v);
    }
    if patch.clear_rtt == Some(true) {
        next_counter.rtt_days_remaining = None;
    } else if let Some(v) = patch.rtt_days_remaining {
        if !v.is_finite() || !(0.0..=50.0).contains(&v) {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Solde RTT invalide (attendu entre 0 et 50 jours).",
            ));
        }
        next_counter.rtt_days_remaining = Some(round2(v));
    }
    if patch.clear_annualization == Some(true) {
        next_counter.annualization_balance_hours = None;
    } else if let Some(v) = patch.annualization_balance_hours {
        if !v.is_finite() || !(-500.0..=500.0).contains(&v) {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Solde d'annualisation invalide (attendu entre -500 et +500 heures).",
            ));
        }
        next_counter.annualization_balance_hours = Some(round2(v));
    }

    if counters_equal(&target_emp.counter, &next_counter) {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Aucune modification détectée sur les compteurs.",
        ));
    }

    let actor_name = db
        .employees
        .iter()
        .find(|e| e.id == actor_id)
        .map(|e| format!("{} {}", e.first_name, e.last_name))
        .unwrap_or_else(|| actor_id.clone());

    let before = target_emp.counter.clone();
    let record = CounterAdjustmentRecord {
        id: format!("cnt-{}", rand::random::<u128>()),
        employee_id: target_id.clone(),
        site_id: target_site_id.clone(),
        actor_id: actor_id.clone(),
        actor_name,
        timestamp: Utc::now().to_rfc3339(),
        reason: reason.clone(),
        before: before.clone(),
        after: next_counter.clone(),
    };

    let before_summary = format!(
        "CP N={}/{}, N-1={}, RTT={:?}, Ann={:?}",
        before.cp_n_acquired,
        before.cp_n_taken,
        before.cp_n_minus1_remaining,
        before.rtt_days_remaining,
        before.annualization_balance_hours
    );
    let after_summary = format!(
        "CP N={}/{}, N-1={}, RTT={:?}, Ann={:?}",
        next_counter.cp_n_acquired,
        next_counter.cp_n_taken,
        next_counter.cp_n_minus1_remaining,
        next_counter.rtt_days_remaining,
        next_counter.annualization_balance_hours
    );

    let mut next = db.clone();
    next.employees[idx].counter = next_counter.clone();
    next.employee_counter_history.push(record.clone());
    append_audit(
        &mut next,
        &actor_id,
        "HR_COUNTER_ADJUSTMENT",
        format!("Correction compteurs {} ({}) : {}", target_id, target_site_id, reason),
        &target_site_id,
        &target_id,
        Some(before_summary),
        Some(after_summary),
    );

    persist_state(&state.data_dir, &next).map_err(|err_msg| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance compteurs collaborateur : {}", err_msg),
        )
    })?;
    *db = next;

    let rev = counter_revision(&db.employees[idx]);
    let dossier = build_dossier_view(&db, &actor_id, &target_site_id, &db.employees[idx]);
    let history = dossier
        .as_ref()
        .and_then(|d| d.counter_history.clone())
        .unwrap_or_else(|| vec![record]);

    Ok(Json(json!({
        "ok": true,
        "counter": next_counter,
        "counterRevision": rev,
        "history": history,
        "dossier": dossier,
        // Rétrocompatibilité champs directs EmployeeCounter
        "cpNAcquired": next_counter.cp_n_acquired,
        "cpNTaken": next_counter.cp_n_taken,
        "cpNMinus1Remaining": next_counter.cp_n_minus1_remaining,
        "rttDaysRemaining": next_counter.rtt_days_remaining,
        "annualizationBalanceHours": next_counter.annualization_balance_hours,
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

        let rev = {
            let db = state.db.read().await;
            dossier_revision(db.employees.iter().find(|e| e.id == "emp-maxime").unwrap())
        };

        let Json(res) = patch_admin_employee(
            State(state.clone()),
            headers,
            Path("emp-maxime".into()),
            Json(PatchAdminEmployeePayload {
                site_id: Some("carre-de-soie".into()),
                expected_revision: Some(rev),
                first_name: Some("Maxime-Pro".into()),
                phone: Some("06 99 88 77 66".into()),
                contract_type: Some("CDD".into()),
                weekly_hours: Some(32),
                active: Some(false),
                reason: Some("Renouvellement CDD 32h".into()),
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
    async fn non_admin_and_forged_headers_cannot_patch_employee() {
        let state = test_state();
        let headers = session_headers(&state, "emp-chloe", "club-beynost").await;
        let (status, _) = patch_admin_employee(
            State(state.clone()),
            headers,
            Path("emp-chloe".into()),
            Json(PatchAdminEmployeePayload {
                site_id: Some("beynost".into()),
                first_name: Some("Hack".into()),
                ..Default::default()
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(status, StatusCode::FORBIDDEN);

        let mut forged = HeaderMap::new();
        forged.insert("x-cfitness-actor-id", HeaderValue::from_static("emp-mario"));
        assert_eq!(
            get_hr_dossiers(State(state.clone()), Path("carre-de-soie".into()), forged)
                .await
                .unwrap_err()
                .0,
            StatusCode::UNAUTHORIZED
        );
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[tokio::test]
    async fn counters_update_persists_history_and_is_visible_on_both_sides() {
        let state = test_state();
        let mario = session_headers(&state, "emp-mario", "club-beynost").await;
        let chloe = session_headers(&state, "emp-chloe", "club-beynost").await;

        let rev = {
            let db = state.db.read().await;
            counter_revision(db.employees.iter().find(|e| e.id == "emp-chloe").unwrap())
        };

        let Json(updated) = put_admin_employee_counters(
            State(state.clone()),
            mario.clone(),
            Path("emp-chloe".into()),
            Json(UpdateEmployeeCountersPayload {
                site_id: Some("beynost".into()),
                expected_revision: rev.clone(),
                reason: "Régularisation reliquat validé par direction".into(),
                cp_n_acquired: Some(25.0),
                cp_n_taken: Some(10.0),
                cp_n_minus1_remaining: Some(3.5),
                rtt_days_remaining: Some(8.0),
                annualization_balance_hours: Some(4.5),
                ..Default::default()
            }),
        )
        .await
        .expect("admin peut mettre à jour les compteurs CP/RTT avec motif");

        assert_eq!(updated["counter"]["cpNAcquired"], 25.0);
        assert_eq!(updated["counter"]["rttDaysRemaining"], 8.0);
        assert_eq!(updated["history"].as_array().unwrap().len(), 1);
        assert_eq!(
            updated["history"][0]["reason"],
            "Régularisation reliquat validé par direction"
        );

        // Stale revision must be rejected with 409 CONFLICT
        let err = put_admin_employee_counters(
            State(state.clone()),
            mario.clone(),
            Path("emp-chloe".into()),
            Json(UpdateEmployeeCountersPayload {
                site_id: Some("beynost".into()),
                expected_revision: rev,
                reason: "Conflit".into(),
                cp_n_acquired: Some(26.0),
                ..Default::default()
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(err.0, StatusCode::CONFLICT);

        // Relecture côté responsable ET côté salarié (même vérité canonique)
        let Json(hr_view) = get_hr_dossiers(
            State(state.clone()),
            Path("beynost".into()),
            mario,
        )
        .await
        .unwrap();
        let hr_chloe = hr_view["employees"]
            .as_array()
            .unwrap()
            .iter()
            .find(|e| e["id"] == "emp-chloe")
            .unwrap();

        let Json(me_view) = get_my_dossier(
            State(state.clone()),
            Path("beynost".into()),
            chloe,
        )
        .await
        .unwrap();
        assert_eq!(me_view["dossier"]["counter"], hr_chloe["counter"]);
        assert_eq!(
            me_view["dossier"]["counterHistory"],
            hr_chloe["counterHistory"]
        );

        let reloaded = load_or_init_state(&state.data_dir);
        assert_eq!(reloaded.employee_counter_history.len(), 1);
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[tokio::test]
    async fn rbac_redaction_multi_club_team_scope_and_disk_rollback() {
        let state = test_state();

        // 1. Lecture seule à Beynost (emp-readonly): pas de champs sensibles ni de mutation
        let ro = session_headers(&state, "emp-readonly", "club-beynost").await;
        let Json(ro_view) = get_hr_dossiers(
            State(state.clone()),
            Path("beynost".into()),
            ro.clone(),
        )
        .await
        .unwrap();
        let ro_chloe = ro_view["employees"]
            .as_array()
            .unwrap()
            .iter()
            .find(|e| e["id"] == "emp-chloe")
            .unwrap();
        assert!(ro_chloe.get("sensitiveBank").is_none());
        assert!(ro_chloe.get("email").is_none());
        assert!(ro_chloe.get("phone").is_none());
        assert!(ro_chloe["contract"].get("monthlyGrossEur").is_none());
        assert!(ro_chloe["contract"].get("hourlyRateEur").is_none());
        assert!(ro_chloe["contract"].get("loadedCostFactor").is_none());
        assert!(ro_chloe.get("counter").is_some()); // ORG04-16 = true sur lecture_seule_avancee
        assert_eq!(ro_chloe["permissions"]["canEditCounters"], false);
        assert_eq!(ro_chloe["permissions"]["canEditIdentity"], false);

        // 2. Planificateur standard (emp-maxime): appartient à accueil+coaching mais n'encadre QUE team-cs-accueil
        let maxime = session_headers(&state, "emp-maxime", "club-carre-soie").await;
        let Json(max_view) = get_hr_dossiers(
            State(state.clone()),
            Path("carre-de-soie".into()),
            maxime.clone(),
        )
        .await
        .unwrap();
        let max_ids: Vec<&str> = max_view["employees"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|e| e["id"].as_str())
            .collect();
        // emp-karim est uniquement team-cs-coaching => invisible et interdit pour emp-maxime
        assert!(!max_ids.contains(&"emp-karim"));
        assert!(max_ids.contains(&"emp-accueil-cs"));
        let err_karim = patch_admin_employee(
            State(state.clone()),
            maxime,
            Path("emp-karim".into()),
            Json(PatchAdminEmployeePayload {
                site_id: Some("carre-de-soie".into()),
                weekly_hours: Some(30),
                ..Default::default()
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(err_karim.0, StatusCode::FORBIDDEN);

        // 3. Même collaborateur multi-club avec droits différents (emp-master: master_avance CS, lecture_seule Beynost)
        let master_cs = session_headers(&state, "emp-master", "club-carre-soie").await;
        let master_bey = session_headers(&state, "emp-master", "club-beynost").await;
        let rev_chloe = {
            let db = state.db.read().await;
            counter_revision(db.employees.iter().find(|e| e.id == "emp-chloe").unwrap())
        };
        assert_eq!(
            put_admin_employee_counters(
                State(state.clone()),
                master_bey,
                Path("emp-chloe".into()),
                Json(UpdateEmployeeCountersPayload {
                    site_id: Some("beynost".into()),
                    expected_revision: rev_chloe,
                    reason: "Tentative lecture seule Beynost".into(),
                    cp_n_acquired: Some(12.0),
                    ..Default::default()
                }),
            )
            .await
            .unwrap_err()
            .0,
            StatusCode::FORBIDDEN
        );
        let rev_accueil = {
            let db = state.db.read().await;
            counter_revision(db.employees.iter().find(|e| e.id == "emp-accueil-cs").unwrap())
        };
        assert!(
            put_admin_employee_counters(
                State(state.clone()),
                master_cs,
                Path("emp-accueil-cs".into()),
                Json(UpdateEmployeeCountersPayload {
                    site_id: Some("carre-de-soie".into()),
                    expected_revision: rev_accueil,
                    reason: "Correction autorisée Carré de Soie".into(),
                    cp_n_acquired: Some(22.0),
                    ..Default::default()
                }),
            )
            .await
            .is_ok()
        );

        // 4. Planificateur sans ORG04-16 (emp-planif-std) ne doit pas recevoir `counter` ni `counterHistory`
        let planif_std = session_headers(&state, "emp-planif-std", "club-carre-soie").await;
        let Json(pstd_view) = get_hr_dossiers(
            State(state.clone()),
            Path("carre-de-soie".into()),
            planif_std,
        )
        .await
        .unwrap();
        let pstd_accueil = pstd_view["employees"]
            .as_array()
            .unwrap()
            .iter()
            .find(|e| e["id"] == "emp-accueil-cs")
            .unwrap();
        assert!(pstd_accueil.get("counter").is_none());
        assert!(pstd_accueil.get("counterHistory").is_none());

        // 5. Échec disque => rollback complet (mémoire, disque, audit inchangés)
        let mario = session_headers(&state, "emp-mario", "club-carre-soie").await;
        let before_mem = serde_json::to_value(&*state.db.read().await).unwrap();
        let before_disk = std::fs::read(state.data_dir.join("cfitness_state.json")).unwrap();
        std::fs::create_dir(state.data_dir.join("cfitness_state.json.tmp")).unwrap();
        let rev_accueil_2 = {
            let db = state.db.read().await;
            counter_revision(db.employees.iter().find(|e| e.id == "emp-accueil-cs").unwrap())
        };
        assert_eq!(
            put_admin_employee_counters(
                State(state.clone()),
                mario,
                Path("emp-accueil-cs".into()),
                Json(UpdateEmployeeCountersPayload {
                    site_id: Some("carre-de-soie".into()),
                    expected_revision: rev_accueil_2,
                    reason: "Ne doit pas persister".into(),
                    cp_n_acquired: Some(30.0),
                    ..Default::default()
                }),
            )
            .await
            .unwrap_err()
            .0,
            StatusCode::INTERNAL_SERVER_ERROR
        );
        assert_eq!(serde_json::to_value(&*state.db.read().await).unwrap(), before_mem);
        assert_eq!(
            std::fs::read(state.data_dir.join("cfitness_state.json")).unwrap(),
            before_disk
        );
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[tokio::test]
    async fn state_without_counter_history_reloads_cleanly_under_49() {
        let state = test_state();
        let state_path = state.data_dir.join("cfitness_state.json");
        let mut raw: Value = serde_json::from_slice(&std::fs::read(&state_path).unwrap()).unwrap();
        raw.as_object_mut().unwrap().remove("employeeCounterHistory");
        std::fs::write(&state_path, serde_json::to_vec_pretty(&raw).unwrap()).unwrap();
        let reloaded = crate::seed::try_load_or_init_state(&state.data_dir).unwrap();
        assert!(reloaded.employee_counter_history.is_empty());
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }
}
