//! Canonical per-club HR pilotage KPIs, live operational summary and budgeted missions.
use crate::models::{AppDatabaseState, MissionRecord, SiteKpis};
use crate::rbac::{
    can_access_finances, can_access_reports, can_access_site_scope, evaluate_permission,
    is_admin_employee,
};
use crate::routes::{append_audit, err_resp, is_demo_mode, resolve_session_actor, SharedState};
use crate::seed::persist_state;
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

type Failure = (StatusCode, Json<Value>);

fn err(code: StatusCode, msg: &str) -> Failure {
    err_resp(code, msg)
}

fn round2(val: f64) -> f64 {
    (val * 100.0).round() / 100.0
}

fn parse_club_site(raw: &str) -> Result<(&'static str, &'static str), Failure> {
    match raw.trim() {
        "carre-de-soie" | "club-carre-soie" => Ok(("carre-de-soie", "club-carre-soie")),
        "beynost" | "club-beynost" => Ok(("beynost", "club-beynost")),
        _ => Err(err(StatusCode::BAD_REQUEST, "Établissement inconnu.")),
    }
}

async fn require_actor(state: &SharedState, headers: &HeaderMap) -> Result<String, Failure> {
    if !headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("Bearer "))
    {
        return Err(err(
            StatusCode::UNAUTHORIZED,
            "Connectez-vous pour accéder au pilotage et aux missions de l'établissement.",
        ));
    }
    Ok(resolve_session_actor(state, headers).await?.0)
}

fn clean_text(raw: &str, max: usize, required: bool, field: &str) -> Result<String, Failure> {
    let v = raw.trim();
    if (required && v.is_empty())
        || v.chars().count() > max
        || v.chars().any(|c| c.is_control() && c != '\n')
    {
        return Err(err(
            StatusCode::BAD_REQUEST,
            &format!("{field} invalide (1 à {max} caractères, sans caractères de contrôle)."),
        ));
    }
    Ok(v.into())
}

fn check_opt_non_neg(value: Option<f64>, max: f64, field: &str) -> Result<Option<f64>, Failure> {
    match value {
        None => Ok(None),
        Some(v) if v.is_finite() && v >= 0.0 && v <= max => Ok(Some(round2(v))),
        _ => Err(err(
            StatusCode::BAD_REQUEST,
            &format!("{field} invalide (valeur comprise entre 0 et {max} attendue)."),
        )),
    }
}

fn site_has(db: &AppDatabaseState, actor_id: &str, site_id: &str, action: &str) -> bool {
    evaluate_permission(db, actor_id, site_id, action, None).allowed
}

fn can_read(db: &AppDatabaseState, actor_id: &str, site_id: &str) -> bool {
    if !can_access_site_scope(db, actor_id, site_id) {
        return false;
    }
    if is_admin_employee(db, actor_id) || can_access_reports(db, actor_id, Some(site_id)) {
        return true;
    }
    ["ORG04-38", "ORG04-40"]
        .iter()
        .any(|action| site_has(db, actor_id, site_id, action))
}

fn can_view_finances(db: &AppDatabaseState, actor_id: &str, site_id: &str) -> bool {
    can_access_finances(db, actor_id, Some(site_id))
}

fn can_edit_operational_kpis(db: &AppDatabaseState, actor_id: &str, site_id: &str) -> bool {
    is_admin_employee(db, actor_id)
        || can_access_reports(db, actor_id, Some(site_id))
        || site_has(db, actor_id, site_id, "ORG04-32")
}

fn can_manage_missions(db: &AppDatabaseState, actor_id: &str, site_id: &str) -> bool {
    is_admin_employee(db, actor_id)
        || site_has(db, actor_id, site_id, "ORG04-41")
        || site_has(db, actor_id, site_id, "ORG04-42")
}

fn site_missions(db: &AppDatabaseState, site_id: &str) -> Vec<MissionRecord> {
    db.missions
        .iter()
        .filter(|m| m.site_id == site_id)
        .cloned()
        .collect()
}

fn compute_revision(db: &AppDatabaseState, site_id: &str, can_fin: bool) -> String {
    let site = db.sites.iter().find(|s| s.id == site_id).expect("known site");
    let kpis = db.kpis.iter().find(|k| k.site_id == site_id);
    let missions = site_missions(db, site_id);
    format!(
        "{:x}",
        Sha256::digest(
            serde_json::to_vec(&(site.settings.missions_module_active, kpis, &missions, can_fin))
                .expect("serializable pilotage")
        )
    )
}

fn snapshot(db: &AppDatabaseState, actor_id: &str, club_id: &str, site_id: &str) -> Value {
    let site = db.sites.iter().find(|s| s.id == site_id).expect("known site");
    let view_finances = can_view_finances(db, actor_id, site_id);
    let edit_ops = can_edit_operational_kpis(db, actor_id, site_id);
    let edit_fin = edit_ops && view_finances;
    let manage_missions = can_manage_missions(db, actor_id, site_id);

    let kpi = db.kpis.iter().find(|k| k.site_id == site_id);
    let missions = site_missions(db, site_id);

    let active_employees_count = db
        .employees
        .iter()
        .filter(|e| {
            e.active
                && e.site_accesses.iter().any(|a| a.site_id == site_id)
        })
        .count();
    let published_shifts_count = db
        .shifts
        .iter()
        .filter(|s| s.site_id == site_id && s.published)
        .count();
    let pending_leave_requests_count = db
        .leave_requests
        .iter()
        .filter(|r| r.site_id == site_id && r.status == "pending")
        .count();
    let open_anomalies_count = db
        .anomalies
        .iter()
        .filter(|a| a.site_id == site_id && a.status == "to_review")
        .count();

    let active_missions_count = missions.iter().filter(|m| m.status == "active").count();
    let completed_missions_count = missions.iter().filter(|m| m.status == "done").count();
    let total_budget_hours = round2(missions.iter().map(|m| m.budget_hours).sum());
    let total_logged_hours = round2(missions.iter().map(|m| m.logged_hours).sum());

    let mission_dtos: Vec<Value> = missions
        .iter()
        .map(|m| {
            let hourly = if view_finances {
                Some(round2(m.hourly_budget_eur))
            } else {
                None
            };
            let est_budget = if view_finances {
                Some(round2(m.budget_hours * m.hourly_budget_eur))
            } else {
                None
            };
            let logged_cost = if view_finances {
                Some(round2(m.logged_hours * m.hourly_budget_eur))
            } else {
                None
            };
            json!({
                "id": m.id,
                "siteId": m.site_id,
                "title": m.title,
                "budgetHours": round2(m.budget_hours),
                "loggedHours": round2(m.logged_hours),
                "hourlyBudgetEur": hourly,
                "estimatedBudgetEur": est_budget,
                "loggedCostEur": logged_cost,
                "status": m.status,
            })
        })
        .collect();

    json!({
        "demoMode": is_demo_mode(),
        "actorId": actor_id,
        "clubId": club_id,
        "siteId": site_id,
        "revision": compute_revision(db, site_id, view_finances),
        "site": {
            "id": site.id,
            "name": site.name,
            "siret": site.siret,
            "missionsModuleActive": site.settings.missions_module_active,
        },
        "kpis": {
            "periodLabel": kpi.map(|k| k.period_label.clone()).unwrap_or_default(),
            "workedHours": kpi.and_then(|k| k.worked_hours).map(round2),
            "retentionRatePct": kpi.and_then(|k| k.retention_rate_pct).map(round2),
            "revenueEur": if view_finances { kpi.and_then(|k| k.revenue_eur).map(round2) } else { None },
            "payrollMassEur": if view_finances { kpi.and_then(|k| k.payroll_mass_eur).map(round2) } else { None },
            "productivityPerHour": if view_finances { kpi.and_then(|k| k.productivity_per_hour).map(round2) } else { None },
            "monthlyTargetEur": if view_finances { kpi.and_then(|k| k.monthly_target_eur).map(round2) } else { None },
        },
        "operationalSummary": {
            "activeEmployeesCount": active_employees_count,
            "publishedShiftsCount": published_shifts_count,
            "pendingLeaveRequestsCount": pending_leave_requests_count,
            "openAnomaliesCount": open_anomalies_count,
            "activeMissionsCount": active_missions_count,
            "completedMissionsCount": completed_missions_count,
            "totalMissionBudgetHours": total_budget_hours,
            "totalMissionLoggedHours": total_logged_hours,
        },
        "missions": mission_dtos,
        "capabilities": {
            "canViewFinances": view_finances,
            "canEditOperationalKpis": edit_ops,
            "canEditFinancialKpis": edit_fin,
            "canManageMissions": manage_missions,
        },
    })
}

pub async fn get(
    State(state): State<SharedState>,
    Path(raw_club): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, Failure> {
    let actor = require_actor(&state, &headers).await?;
    let (club_id, site_id) = parse_club_site(&raw_club)?;
    let db = state.db.read().await;
    if !db.sites.iter().any(|s| s.id == site_id) {
        return Err(err(StatusCode::NOT_FOUND, "Établissement introuvable."));
    }
    if !can_read(&db, &actor, site_id) {
        return Err(err(
            StatusCode::FORBIDDEN,
            "Accès refusé aux indicateurs et missions de cet établissement.",
        ));
    }
    Ok(Json(snapshot(&db, &actor, club_id, site_id)))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mutation {
    expected_revision: String,
    command: Command,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum Command {
    SaveSiteKpis {
        period_label: String,
        worked_hours: Option<f64>,
        retention_rate_pct: Option<f64>,
        revenue_eur: Option<f64>,
        payroll_mass_eur: Option<f64>,
        productivity_per_hour: Option<f64>,
        monthly_target_eur: Option<f64>,
    },
    CreateMission {
        title: String,
        budget_hours: f64,
        logged_hours: Option<f64>,
        hourly_budget_eur: Option<f64>,
    },
    UpdateMission {
        id: String,
        title: Option<String>,
        budget_hours: Option<f64>,
        logged_hours: Option<f64>,
        add_hours: Option<f64>,
        hourly_budget_eur: Option<f64>,
        status: Option<String>,
    },
    DeleteMission {
        id: String,
    },
}

pub async fn post(
    State(state): State<SharedState>,
    Path(raw_club): Path<String>,
    headers: HeaderMap,
    Json(mutation): Json<Mutation>,
) -> Result<Json<Value>, Failure> {
    let actor = require_actor(&state, &headers).await?;
    let (club_id, site_id) = parse_club_site(&raw_club)?;
    let mut db = state.db.write().await;

    if !db.sites.iter().any(|s| s.id == site_id) {
        return Err(err(StatusCode::NOT_FOUND, "Établissement introuvable."));
    }
    if !can_read(&db, &actor, site_id) {
        return Err(err(
            StatusCode::FORBIDDEN,
            "Établissement hors de votre périmètre de rattachement.",
        ));
    }

    let view_finances = can_view_finances(&db, &actor, site_id);
    if mutation.expected_revision.trim().is_empty()
        || mutation.expected_revision.trim() != compute_revision(&db, site_id, view_finances)
    {
        return Err(err(
            StatusCode::CONFLICT,
            "Les données de pilotage ou missions ont été modifiées entre-temps. Actualisez avant d'enregistrer.",
        ));
    }

    let mut next = db.clone();
    let site_missions_enabled = next
        .sites
        .iter()
        .find(|s| s.id == site_id)
        .map(|s| s.settings.missions_module_active)
        .unwrap_or(false);

    let (audit_type, audit_summary, target_id) = match mutation.command {
        Command::SaveSiteKpis {
            period_label,
            worked_hours,
            retention_rate_pct,
            revenue_eur,
            payroll_mass_eur,
            productivity_per_hour,
            monthly_target_eur,
        } => {
            if !can_edit_operational_kpis(&db, &actor, site_id) {
                return Err(err(
                    StatusCode::FORBIDDEN,
                    "Droits insuffisants pour modifier les indicateurs de cet établissement.",
                ));
            }
            let has_financial_input = revenue_eur.is_some()
                || payroll_mass_eur.is_some()
                || productivity_per_hour.is_some()
                || monthly_target_eur.is_some();
            if has_financial_input && !view_finances {
                return Err(err(
                    StatusCode::FORBIDDEN,
                    "Droits financiers requis pour modifier les indicateurs financiers de cet établissement.",
                ));
            }
            let clean_period = clean_text(&period_label, 80, true, "Libellé de période")?;
            let clean_worked = check_opt_non_neg(worked_hours, 100_000.0, "Heures travaillées")?;
            let clean_retention =
                check_opt_non_neg(retention_rate_pct, 100.0, "Taux de rétention")?;

            let (clean_rev, clean_payroll, clean_prod, clean_target) = if view_finances {
                (
                    check_opt_non_neg(revenue_eur, 50_000_000.0, "Chiffre d'affaires")?,
                    check_opt_non_neg(payroll_mass_eur, 50_000_000.0, "Masse salariale")?,
                    check_opt_non_neg(productivity_per_hour, 50_000.0, "Productivité horaire")?,
                    check_opt_non_neg(monthly_target_eur, 50_000_000.0, "Objectif mensuel")?,
                )
            } else {
                let existing = next.kpis.iter().find(|k| k.site_id == site_id);
                (
                    existing.and_then(|k| k.revenue_eur),
                    existing.and_then(|k| k.payroll_mass_eur),
                    existing.and_then(|k| k.productivity_per_hour),
                    existing.and_then(|k| k.monthly_target_eur),
                )
            };

            if let Some(row) = next.kpis.iter_mut().find(|k| k.site_id == site_id) {
                row.period_label = clean_period.clone();
                row.worked_hours = clean_worked;
                row.retention_rate_pct = clean_retention;
                row.revenue_eur = clean_rev;
                row.payroll_mass_eur = clean_payroll;
                row.productivity_per_hour = clean_prod;
                row.monthly_target_eur = clean_target;
            } else {
                next.kpis.push(SiteKpis {
                    site_id: site_id.into(),
                    period_label: clean_period.clone(),
                    revenue_eur: clean_rev,
                    productivity_per_hour: clean_prod,
                    payroll_mass_eur: clean_payroll,
                    worked_hours: clean_worked,
                    retention_rate_pct: clean_retention,
                    monthly_target_eur: clean_target,
                });
            }

            (
                "HR_PILOTAGE_KPIS_UPDATE",
                format!("Mise à jour indicateurs pilotage ({site_id} — {clean_period})"),
                site_id.to_string(),
            )
        }
        Command::CreateMission {
            title,
            budget_hours,
            logged_hours,
            hourly_budget_eur,
        } => {
            if !can_manage_missions(&db, &actor, site_id) {
                return Err(err(
                    StatusCode::FORBIDDEN,
                    "Droits insuffisants pour créer une mission sur cet établissement.",
                ));
            }
            if !site_missions_enabled {
                return Err(err(
                    StatusCode::BAD_REQUEST,
                    "Le module Missions est désactivé sur cet établissement (Paramètres RH).",
                ));
            }
            if hourly_budget_eur.is_some() && !view_finances {
                return Err(err(
                    StatusCode::FORBIDDEN,
                    "Droits financiers requis pour définir un taux horaire budgétaire.",
                ));
            }
            let clean_title = clean_text(&title, 120, true, "Intitulé de la mission")?;
            if next
                .missions
                .iter()
                .any(|m| m.site_id == site_id && m.status == "active" && m.title.eq_ignore_ascii_case(&clean_title))
            {
                return Err(err(
                    StatusCode::CONFLICT,
                    "Une mission active portant déjà ce titre existe sur cet établissement.",
                ));
            }
            if !budget_hours.is_finite() || budget_hours <= 0.0 || budget_hours > 2_000.0 {
                return Err(err(
                    StatusCode::BAD_REQUEST,
                    "Le budget d'heures doit être compris entre 0,5 et 2000 heures.",
                ));
            }
            let budget = round2(budget_hours);
            let logged = match logged_hours {
                None => 0.0,
                Some(h) if h.is_finite() && h >= 0.0 && h <= budget * 3.0 => round2(h),
                _ => {
                    return Err(err(
                        StatusCode::BAD_REQUEST,
                        "Les heures réalisées initiales sont invalides.",
                    ))
                }
            };
            let hourly = match hourly_budget_eur {
                None => 26.0,
                Some(r) if r.is_finite() && (0.0..=500.0).contains(&r) => round2(r),
                _ => {
                    return Err(err(
                        StatusCode::BAD_REQUEST,
                        "Le taux horaire budgété doit être compris entre 0 et 500 €.",
                    ))
                }
            };
            let id = format!(
                "mis-{}-{}",
                Utc::now().timestamp_millis(),
                next.missions.len() + 1
            );
            next.missions.insert(
                0,
                MissionRecord {
                    id: id.clone(),
                    site_id: site_id.into(),
                    title: clean_title.clone(),
                    budget_hours: budget,
                    logged_hours: logged,
                    hourly_budget_eur: hourly,
                    status: "active".into(),
                },
            );
            (
                "HR_PILOTAGE_MISSION_CREATE",
                format!("Création mission « {clean_title} » ({budget} h) sur {site_id}"),
                id,
            )
        }
        Command::UpdateMission {
            id,
            title,
            budget_hours,
            logged_hours,
            add_hours,
            hourly_budget_eur,
            status,
        } => {
            if !can_manage_missions(&db, &actor, site_id) {
                return Err(err(
                    StatusCode::FORBIDDEN,
                    "Droits insuffisants pour modifier une mission sur cet établissement.",
                ));
            }
            if hourly_budget_eur.is_some() && !view_finances {
                return Err(err(
                    StatusCode::FORBIDDEN,
                    "Droits financiers requis pour modifier le taux horaire budgétaire.",
                ));
            }
            let clean_id = id.trim().to_string();
            let idx = next
                .missions
                .iter()
                .position(|m| m.id == clean_id && m.site_id == site_id)
                .ok_or_else(|| err(StatusCode::NOT_FOUND, "Mission introuvable sur cet établissement."))?;

            if let Some(raw_title) = title {
                let t = clean_text(&raw_title, 120, true, "Intitulé de la mission")?;
                if next.missions.iter().any(|m| {
                    m.site_id == site_id
                        && m.id != clean_id
                        && m.status == "active"
                        && m.title.eq_ignore_ascii_case(&t)
                }) {
                    return Err(err(
                        StatusCode::CONFLICT,
                        "Une mission active portant déjà ce titre existe sur cet établissement.",
                    ));
                }
                next.missions[idx].title = t;
            }
            if let Some(bh) = budget_hours {
                if !bh.is_finite() || bh <= 0.0 || bh > 2_000.0 {
                    return Err(err(
                        StatusCode::BAD_REQUEST,
                        "Le budget d'heures doit être compris entre 0,5 et 2000 heures.",
                    ));
                }
                next.missions[idx].budget_hours = round2(bh);
            }
            if let Some(lh) = logged_hours {
                if !lh.is_finite() || lh < 0.0 || lh > 6_000.0 {
                    return Err(err(
                        StatusCode::BAD_REQUEST,
                        "Les heures réalisées doivent être comprises entre 0 et 6000 heures.",
                    ));
                }
                next.missions[idx].logged_hours = round2(lh);
            }
            if let Some(delta) = add_hours {
                if !delta.is_finite() || delta < -500.0 || delta > 500.0 {
                    return Err(err(StatusCode::BAD_REQUEST, "Ajout d'heures invalide."));
                }
                next.missions[idx].logged_hours =
                    round2((next.missions[idx].logged_hours + delta).clamp(0.0, 6_000.0));
            }
            if let Some(hb) = hourly_budget_eur {
                if !hb.is_finite() || !(0.0..=500.0).contains(&hb) {
                    return Err(err(
                        StatusCode::BAD_REQUEST,
                        "Le taux horaire budgété doit être compris entre 0 et 500 €.",
                    ));
                }
                next.missions[idx].hourly_budget_eur = round2(hb);
            }
            if let Some(st) = status {
                let s = st.trim();
                if !matches!(s, "active" | "done") {
                    return Err(err(
                        StatusCode::BAD_REQUEST,
                        "Statut de mission invalide (active ou done).",
                    ));
                }
                next.missions[idx].status = s.into();
            }

            let m = &next.missions[idx];
            (
                "HR_PILOTAGE_MISSION_UPDATE",
                format!(
                    "Mise à jour mission « {} » ({}h/{}h, {}) sur {site_id}",
                    m.title, m.logged_hours, m.budget_hours, m.status
                ),
                clean_id,
            )
        }
        Command::DeleteMission { id } => {
            if !can_manage_missions(&db, &actor, site_id) {
                return Err(err(
                    StatusCode::FORBIDDEN,
                    "Droits insuffisants pour supprimer une mission sur cet établissement.",
                ));
            }
            let clean_id = id.trim().to_string();
            let before = next.missions.len();
            next.missions
                .retain(|m| !(m.id == clean_id && m.site_id == site_id));
            if next.missions.len() == before {
                return Err(err(StatusCode::NOT_FOUND, "Mission introuvable sur cet établissement."));
            }
            (
                "HR_PILOTAGE_MISSION_DELETE",
                format!("Suppression mission {clean_id} sur {site_id}"),
                clean_id,
            )
        }
    };

    append_audit(
        &mut next,
        &actor,
        audit_type,
        audit_summary,
        site_id,
        &target_id,
        None,
        None,
    );
    persist_state(&state.data_dir, &next)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &format!("Échec persistance : {e}")))?;
    *db = next;
    Ok(Json(snapshot(&db, &actor, club_id, site_id)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routes::SharedAppState;
    use crate::seed::load_or_init_state;
    use std::collections::HashMap;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    fn test_state() -> SharedState {
        let dir = std::env::temp_dir().join(format!("cfos_pilotage_{}", rand::random::<u128>()));
        Arc::new(SharedAppState {
            db: RwLock::new(load_or_init_state(&dir)),
            data_dir: dir,
            sessions: RwLock::new(HashMap::new()),
            login_attempts: RwLock::new(HashMap::new()),
        })
    }

    async fn headers_for(state: &SharedState, actor_id: &str) -> HeaderMap {
        let token = format!("pil-{}", rand::random::<u128>());
        state
            .sessions
            .write()
            .await
            .insert(token.clone(), (actor_id.into(), Utc::now().timestamp() + 3600));
        let mut headers = HeaderMap::new();
        headers.insert("authorization", format!("Bearer {token}").parse().unwrap());
        headers
    }

    #[tokio::test]
    async fn rbac_financial_redaction_and_missions_module_gate() {
        let state = test_state();
        assert_eq!(
            get(State(state.clone()), Path("carre-de-soie".into()), HeaderMap::new())
                .await
                .unwrap_err()
                .0,
            StatusCode::UNAUTHORIZED
        );

        for actor in ["emp-chloe", "emp-maxime"] {
            let h = headers_for(&state, actor).await;
            assert_eq!(
                get(State(state.clone()), Path("beynost".into()), h)
                    .await
                    .unwrap_err()
                    .0,
                StatusCode::FORBIDDEN
            );
        }

        // lecture_seule_avancee can view Beynost operationally (redacted), never mutate
        let ro_h = headers_for(&state, "emp-readonly").await;
        let Json(ro_snap) = get(State(state.clone()), Path("beynost".into()), ro_h.clone())
            .await
            .unwrap();
        assert_eq!(ro_snap["capabilities"]["canViewFinances"], false);
        assert_eq!(ro_snap["capabilities"]["canEditOperationalKpis"], false);
        assert_eq!(ro_snap["capabilities"]["canManageMissions"], false);
        assert!(ro_snap["kpis"]["revenueEur"].is_null());
        assert_eq!(
            post(
                State(state.clone()),
                Path("beynost".into()),
                ro_h,
                Json(Mutation {
                    expected_revision: ro_snap["revision"].as_str().unwrap().into(),
                    command: Command::CreateMission {
                        title: "Refus lecture seule".into(),
                        budget_hours: 4.0,
                        logged_hours: None,
                        hourly_budget_eur: None,
                    },
                }),
            )
            .await
            .unwrap_err()
            .0,
            StatusCode::FORBIDDEN
        );

        // Sarah is manager on Carre de Soie with reports access but NO finances access
        let sarah = headers_for(&state, "emp-sarah").await;
        assert_eq!(
            get(State(state.clone()), Path("beynost".into()), sarah.clone())
                .await
                .unwrap_err()
                .0,
            StatusCode::FORBIDDEN
        );
        let Json(cs_sarah) = get(State(state.clone()), Path("carre-de-soie".into()), sarah.clone())
            .await
            .unwrap();
        assert_eq!(cs_sarah["capabilities"]["canViewFinances"], false);
        assert_eq!(cs_sarah["capabilities"]["canEditOperationalKpis"], true);
        assert_eq!(cs_sarah["capabilities"]["canEditFinancialKpis"], false);
        assert!(cs_sarah["kpis"]["workedHours"].is_number());
        assert!(cs_sarah["kpis"]["revenueEur"].is_null());
        assert!(cs_sarah["kpis"]["payrollMassEur"].is_null());
        assert!(cs_sarah["missions"][0]["hourlyBudgetEur"].is_null());

        let rev = cs_sarah["revision"].as_str().unwrap().to_string();
        // Sarah cannot edit financial KPIs
        assert_eq!(
            post(
                State(state.clone()),
                Path("carre-de-soie".into()),
                sarah.clone(),
                Json(Mutation {
                    expected_revision: rev.clone(),
                    command: Command::SaveSiteKpis {
                        period_label: "Novembre 2026".into(),
                        worked_hours: Some(435.0),
                        retention_rate_pct: Some(92.0),
                        revenue_eur: Some(99_999.0),
                        payroll_mass_eur: None,
                        productivity_per_hour: None,
                        monthly_target_eur: None,
                    },
                }),
            )
            .await
            .unwrap_err()
            .0,
            StatusCode::FORBIDDEN
        );
        // Sarah CAN save operational KPIs without altering existing financial figures in DB
        let Json(cs_after_ops) = post(
            State(state.clone()),
            Path("carre-de-soie".into()),
            sarah,
            Json(Mutation {
                expected_revision: rev,
                command: Command::SaveSiteKpis {
                    period_label: "Novembre 2026".into(),
                    worked_hours: Some(435.0),
                    retention_rate_pct: Some(92.0),
                    revenue_eur: None,
                    payroll_mass_eur: None,
                    productivity_per_hour: None,
                    monthly_target_eur: None,
                },
            }),
        )
        .await
        .unwrap();
        assert_eq!(cs_after_ops["kpis"]["workedHours"], 435.0);
        assert!(cs_after_ops["kpis"]["revenueEur"].is_null());

        // Mario sees financial figures intact and is blocked (400) creating a mission on Carre de Soie (missions disabled)
        let mario = headers_for(&state, "emp-mario").await;
        let Json(cs_mario) = get(State(state.clone()), Path("carre-de-soie".into()), mario.clone())
            .await
            .unwrap();
        assert_eq!(cs_mario["kpis"]["revenueEur"], 48200.0);
        assert_eq!(cs_mario["site"]["missionsModuleActive"], false);
        assert_eq!(
            post(
                State(state.clone()),
                Path("carre-de-soie".into()),
                mario,
                Json(Mutation {
                    expected_revision: cs_mario["revision"].as_str().unwrap().into(),
                    command: Command::CreateMission {
                        title: "Doit echouer".into(),
                        budget_hours: 10.0,
                        logged_hours: None,
                        hourly_budget_eur: Some(25.0),
                    },
                }),
            )
            .await
            .unwrap_err()
            .0,
            StatusCode::BAD_REQUEST
        );

        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[tokio::test]
    async fn crud_kpis_missions_concurrency_and_disk_rollback() {
        let state = test_state();
        let mario = headers_for(&state, "emp-mario").await;
        let Json(initial) = get(State(state.clone()), Path("beynost".into()), mario.clone())
            .await
            .unwrap();
        assert_eq!(initial["site"]["missionsModuleActive"], true);
        let rev0 = initial["revision"].as_str().unwrap().to_string();

        // 1. Save Beynost KPIs
        let Json(after_kpi) = post(
            State(state.clone()),
            Path("beynost".into()),
            mario.clone(),
            Json(Mutation {
                expected_revision: rev0.clone(),
                command: Command::SaveSiteKpis {
                    period_label: "Décembre 2026".into(),
                    worked_hours: Some(325.5),
                    retention_rate_pct: Some(90.5),
                    revenue_eur: Some(46500.0),
                    payroll_mass_eur: Some(11200.0),
                    productivity_per_hour: Some(142.86),
                    monthly_target_eur: Some(47000.0),
                },
            }),
        )
        .await
        .unwrap();
        assert_eq!(after_kpi["kpis"]["revenueEur"], 46500.0);
        let rev1 = after_kpi["revision"].as_str().unwrap().to_string();

        // Stale revision returns 409
        assert_eq!(
            post(
                State(state.clone()),
                Path("beynost".into()),
                mario.clone(),
                Json(Mutation {
                    expected_revision: rev0,
                    command: Command::CreateMission {
                        title: "Mission périmée".into(),
                        budget_hours: 10.0,
                        logged_hours: None,
                        hourly_budget_eur: None,
                    },
                }),
            )
            .await
            .unwrap_err()
            .0,
            StatusCode::CONFLICT
        );

        // 2. Create, update (+add_hours, done), reject cross-club edit
        let Json(after_create) = post(
            State(state.clone()),
            Path("beynost".into()),
            mario.clone(),
            Json(Mutation {
                expected_revision: rev1,
                command: Command::CreateMission {
                    title: "Signalétique accueil hiver".into(),
                    budget_hours: 12.0,
                    logged_hours: Some(2.0),
                    hourly_budget_eur: Some(30.0),
                },
            }),
        )
        .await
        .unwrap();
        let created_id = after_create["missions"][0]["id"].as_str().unwrap().to_string();
        assert_eq!(after_create["missions"][0]["estimatedBudgetEur"], 360.0);
        let rev2 = after_create["revision"].as_str().unwrap().to_string();

        // Cross-club mission ID (mis-03 belongs to Carre de Soie) must return 404
        assert_eq!(
            post(
                State(state.clone()),
                Path("beynost".into()),
                mario.clone(),
                Json(Mutation {
                    expected_revision: rev2.clone(),
                    command: Command::DeleteMission { id: "mis-03".into() },
                }),
            )
            .await
            .unwrap_err()
            .0,
            StatusCode::NOT_FOUND
        );

        let Json(after_update) = post(
            State(state.clone()),
            Path("beynost".into()),
            mario.clone(),
            Json(Mutation {
                expected_revision: rev2,
                command: Command::UpdateMission {
                    id: created_id.clone(),
                    title: None,
                    budget_hours: None,
                    logged_hours: None,
                    add_hours: Some(3.5),
                    hourly_budget_eur: None,
                    status: Some("done".into()),
                },
            }),
        )
        .await
        .unwrap();
        assert_eq!(after_update["missions"][0]["loggedHours"], 5.5);
        assert_eq!(after_update["missions"][0]["status"], "done");
        let rev3 = after_update["revision"].as_str().unwrap().to_string();

        // 3. Disk failure rollback preserves memory, disk and audit cleanly
        let before_mem = serde_json::to_value(&*state.db.read().await).unwrap();
        let before_disk = std::fs::read(state.data_dir.join("cfitness_state.json")).unwrap();
        std::fs::create_dir(state.data_dir.join("cfitness_state.json.tmp")).unwrap();
        assert_eq!(
            post(
                State(state.clone()),
                Path("beynost".into()),
                mario.clone(),
                Json(Mutation {
                    expected_revision: rev3.clone(),
                    command: Command::DeleteMission {
                        id: created_id.clone(),
                    },
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
        std::fs::remove_dir(state.data_dir.join("cfitness_state.json.tmp")).unwrap();

        let Json(after_del) = post(
            State(state.clone()),
            Path("beynost".into()),
            mario,
            Json(Mutation {
                expected_revision: rev3,
                command: Command::DeleteMission {
                    id: created_id.clone(),
                },
            }),
        )
        .await
        .unwrap();
        assert!(!after_del["missions"]
            .as_array()
            .unwrap()
            .iter()
            .any(|m| m["id"] == created_id));

        let _ = std::fs::remove_dir_all(&state.data_dir);
    }
}
