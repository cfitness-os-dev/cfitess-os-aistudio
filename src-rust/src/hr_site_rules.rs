//! Canonical per-club HR settings, absence motives, staffing needs and owner-only badgeuse rules.
use crate::hr_organisation::site_permission;
use crate::models::{AppDatabaseState, Position, SiteAbsenceMotiveConfig, SiteStaffingNeed};
use crate::rbac::{can_access_site_scope, evaluate_permission, is_owner_or_super_admin};
use crate::routes::{append_audit, err_resp, is_demo_mode, resolve_session_actor, SharedState};
use crate::seed::persist_state;
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

type Failure = (StatusCode, Json<Value>);

fn err(code: StatusCode, msg: &str) -> Failure {
    err_resp(code, msg)
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
            "Connectez-vous pour accéder aux paramètres RH de l'établissement.",
        ));
    }
    Ok(resolve_session_actor(state, headers).await?.0)
}

fn is_valid_hhmm(value: &str) -> bool {
    let trimmed = value.trim();
    let parts: Vec<&str> = trimmed.split(':').collect();
    if parts.len() != 2 || parts[0].len() != 2 || parts[1].len() != 2 {
        return false;
    }
    let Ok(h) = parts[0].parse::<u32>() else {
        return false;
    };
    let Ok(m) = parts[1].parse::<u32>() else {
        return false;
    };
    h <= 23 && m <= 59
}

fn hhmm_minutes(value: &str) -> u32 {
    let parts: Vec<&str> = value.trim().split(':').collect();
    parts[0].parse::<u32>().unwrap_or(0) * 60 + parts[1].parse::<u32>().unwrap_or(0)
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

pub(crate) fn default_motives_for_site(site_id: &str) -> Vec<SiteAbsenceMotiveConfig> {
    let rows = [
        ("cp", "Congé payé", "conges", true, true, true, false),
        ("rtt", "RTT", "recuperation", true, true, true, false),
        ("maladie", "Maladie", "maladie", true, true, false, true),
        ("recup", "Récupération", "recuperation", true, true, true, false),
        ("famille", "Événement familial", "evenement_familial", true, true, true, true),
        ("sans_solde", "Congé sans solde", "conges", true, true, false, false),
        ("formation", "Formation", "autre", true, false, true, false),
        ("autorisee", "Absence autorisée", "autre", true, true, false, false),
    ];
    rows.iter()
        .map(
            |(slug, label, cat, active, req, ann, doc)| SiteAbsenceMotiveConfig {
                id: format!("mot-{site_id}-{slug}"),
                site_id: site_id.into(),
                label: (*label).into(),
                category: (*cat).into(),
                active: *active,
                employee_requestable: *req,
                included_in_annualization: *ann,
                requires_document: *doc,
            },
        )
        .collect()
}

fn effective_motives(db: &AppDatabaseState, site_id: &str) -> Vec<SiteAbsenceMotiveConfig> {
    let stored: Vec<SiteAbsenceMotiveConfig> = db
        .site_absence_motives
        .iter()
        .filter(|m| m.site_id == site_id)
        .cloned()
        .collect();
    if stored.is_empty() {
        default_motives_for_site(site_id)
    } else {
        stored
    }
}

fn effective_needs(db: &AppDatabaseState, site_id: &str) -> Vec<SiteStaffingNeed> {
    db.site_staffing_needs
        .iter()
        .filter(|n| n.site_id == site_id)
        .cloned()
        .collect()
}

fn compute_revision(db: &AppDatabaseState, site_id: &str) -> String {
    let site = db.sites.iter().find(|s| s.id == site_id).expect("known site");
    let motives = effective_motives(db, site_id);
    let needs = effective_needs(db, site_id);
    format!(
        "{:x}",
        Sha256::digest(
            serde_json::to_vec(&(&site.settings, &motives, &needs))
                .expect("serializable site rules")
        )
    )
}

fn can_read(db: &AppDatabaseState, actor_id: &str, site_id: &str) -> bool {
    if !can_access_site_scope(db, actor_id, site_id) {
        return false;
    }
    if is_owner_or_super_admin(db, actor_id, site_id) {
        return true;
    }
    ["ORG04-28", "ORG04-29", "ORG04-30"]
        .iter()
        .any(|action| evaluate_permission(db, actor_id, site_id, action, None).allowed)
}

fn can_edit_rules(db: &AppDatabaseState, actor_id: &str, site_id: &str) -> bool {
    is_owner_or_super_admin(db, actor_id, site_id) || site_permission(db, actor_id, site_id, "ORG04-29")
}

fn can_edit_alerts_and_report(db: &AppDatabaseState, actor_id: &str, site_id: &str) -> bool {
    is_owner_or_super_admin(db, actor_id, site_id) || site_permission(db, actor_id, site_id, "ORG04-30")
}

fn snapshot(db: &AppDatabaseState, actor_id: &str, club_id: &str, site_id: &str) -> Value {
    let site = db.sites.iter().find(|s| s.id == site_id).expect("known site");
    let motives = effective_motives(db, site_id);
    let needs = effective_needs(db, site_id);
    let positions: Vec<&Position> = db
        .positions
        .iter()
        .filter(|p| p.site_id == site_id)
        .collect();
    let edit_rules = can_edit_rules(db, actor_id, site_id);
    let edit_alerts = can_edit_alerts_and_report(db, actor_id, site_id);
    let edit_badge = is_owner_or_super_admin(db, actor_id, site_id);
    json!({
        "demoMode": is_demo_mode(),
        "actorId": actor_id,
        "clubId": club_id,
        "siteId": site_id,
        "revision": compute_revision(db, site_id),
        "site": {
            "id": site.id,
            "name": site.name,
            "siret": site.siret,
            "timezone": site.timezone,
        },
        "settings": site.settings,
        "motives": motives,
        "staffingNeeds": needs,
        "positions": positions,
        "capabilities": {
            "canEditRules": edit_rules,
            "canEditAlertsAndReport": edit_alerts,
            "canEditAbsences": edit_rules,
            "canEditStaffingNeeds": edit_rules,
            "canEditBadgeSettings": edit_badge,
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
            "Accès refusé aux paramètres RH de cet établissement.",
        ));
    }
    Ok(Json(snapshot(&db, &actor, club_id, site_id)))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Mutation {
    pub expected_revision: String,
    pub command: Command,
}

#[derive(Debug, Deserialize)]
#[serde(
    tag = "action",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Command {
    SaveBaseRules {
        day_start_hour: String,
        break_alert_enabled: bool,
        break_alert_hours: u32,
        consecutive_days_blocking: bool,
        complementary_max_hours: u32,
        smart_planner_break_max_hours: u32,
        alerts_layout: String,
        missions_module_active: bool,
        report_rules_visible: bool,
    },
    SaveCounterRules {
        acquisition_mode: String,
        annualization_period: String,
        sunday_hours_in_annualization: bool,
        rtt_hours_counter_active: bool,
    },
    SaveBadgeSettings {
        badge_frequency: String,
        tablet_break_badging: bool,
    },
    SaveAbsenceMotive {
        id: Option<String>,
        label: String,
        category: String,
        active: bool,
        employee_requestable: bool,
        included_in_annualization: bool,
        requires_document: bool,
    },
    SaveStaffingNeed {
        id: Option<String>,
        position_id: String,
        day_of_week: String,
        kind: String,
        start_time: String,
        end_time: String,
        min_headcount: u32,
        active: bool,
        #[serde(default)]
        note: String,
    },
    RemoveStaffingNeed {
        id: String,
    },
}

fn ensure_site_motives_materialized(db: &mut AppDatabaseState, site_id: &str) {
    if !db.site_absence_motives.iter().any(|m| m.site_id == site_id) {
        db.site_absence_motives
            .extend(default_motives_for_site(site_id));
    }
}

fn recompute_motive_counts(db: &mut AppDatabaseState, site_id: &str) {
    let motives: Vec<&SiteAbsenceMotiveConfig> = db
        .site_absence_motives
        .iter()
        .filter(|m| m.site_id == site_id && m.active)
        .collect();
    let total = motives.len() as u32;
    let included = motives
        .iter()
        .filter(|m| m.included_in_annualization)
        .count() as u32;
    if let Some(site) = db.sites.iter_mut().find(|s| s.id == site_id) {
        site.settings.annualization_total_motives = total;
        site.settings.annualization_included_motives = included;
    }
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
    if !can_access_site_scope(&db, &actor, site_id) {
        return Err(err(
            StatusCode::FORBIDDEN,
            "Établissement hors de votre périmètre de rattachement.",
        ));
    }

    if mutation.expected_revision.trim().is_empty()
        || mutation.expected_revision.trim() != compute_revision(&db, site_id)
    {
        return Err(err(
            StatusCode::CONFLICT,
            "Les paramètres de cet établissement ont été modifiés entre-temps. Actualisez avant d'enregistrer.",
        ));
    }

    let site_idx = db
        .sites
        .iter()
        .position(|s| s.id == site_id)
        .expect("site checked");
    let mut next = db.clone();

    let (audit_type, audit_summary, target_id) = match mutation.command {
        Command::SaveBaseRules {
            day_start_hour,
            break_alert_enabled,
            break_alert_hours,
            consecutive_days_blocking,
            complementary_max_hours,
            smart_planner_break_max_hours,
            alerts_layout,
            missions_module_active,
            report_rules_visible,
        } => {
            if !can_edit_rules(&db, &actor, site_id) {
                return Err(err(
                    StatusCode::FORBIDDEN,
                    "Droits insuffisants pour modifier les règles de l'établissement.",
                ));
            }
            let current = &db.sites[site_idx].settings;
            let alerts_changed = current.alerts_layout != alerts_layout.trim()
                || current.report_rules_visible != report_rules_visible
                || current.break_alert_enabled != break_alert_enabled
                || current.break_alert_hours != break_alert_hours;
            if alerts_changed && !can_edit_alerts_and_report(&db, &actor, site_id) {
                return Err(err(
                    StatusCode::FORBIDDEN,
                    "Droits insuffisants pour modifier les alertes ou règles du rapport.",
                ));
            }
            let hour = day_start_hour.trim().to_string();
            if !is_valid_hhmm(&hour) {
                return Err(err(
                    StatusCode::BAD_REQUEST,
                    "Heure de début de journée invalide (format attendu HH:MM).",
                ));
            }
            if !(1..=12).contains(&break_alert_hours) {
                return Err(err(
                    StatusCode::BAD_REQUEST,
                    "Le seuil d'alerte pause doit être compris entre 1 et 12 heures.",
                ));
            }
            if !(1..=48).contains(&complementary_max_hours) {
                return Err(err(
                    StatusCode::BAD_REQUEST,
                    "Le plafond d'heures complémentaires doit être compris entre 1 et 48 heures.",
                ));
            }
            if !(1..=12).contains(&smart_planner_break_max_hours) {
                return Err(err(
                    StatusCode::BAD_REQUEST,
                    "La pause maximale de planification doit être comprise entre 1 et 12 heures.",
                ));
            }
            let layout = alerts_layout.trim().to_string();
            if !matches!(layout.as_str(), "split_13_6" | "single_list") {
                return Err(err(
                    StatusCode::BAD_REQUEST,
                    "Disposition des alertes invalide (split_13_6 ou single_list).",
                ));
            }
            let s = &mut next.sites[site_idx].settings;
            s.day_start_hour = hour;
            s.break_alert_enabled = break_alert_enabled;
            s.break_alert_hours = break_alert_hours;
            s.consecutive_days_blocking = consecutive_days_blocking;
            s.complementary_max_hours = complementary_max_hours;
            s.smart_planner_break_max_hours = smart_planner_break_max_hours;
            s.alerts_layout = layout;
            s.missions_module_active = missions_module_active;
            s.report_rules_visible = report_rules_visible;
            (
                "HR_SITE_RULES_UPDATE",
                format!("Mise à jour des règles de base ({site_id})"),
                site_id.to_string(),
            )
        }
        Command::SaveCounterRules {
            acquisition_mode,
            annualization_period,
            sunday_hours_in_annualization,
            rtt_hours_counter_active,
        } => {
            if !can_edit_rules(&db, &actor, site_id) {
                return Err(err(
                    StatusCode::FORBIDDEN,
                    "Droits insuffisants pour modifier les règles de compteurs et d'annualisation.",
                ));
            }
            let acq = clean_text(&acquisition_mode, 80, true, "Mode d'acquisition CP")?;
            let period = clean_text(&annualization_period, 80, true, "Période d'annualisation")?;
            let s = &mut next.sites[site_idx].settings;
            s.acquisition_mode = acq;
            s.annualization_period = period;
            s.sunday_hours_in_annualization = sunday_hours_in_annualization;
            s.rtt_hours_counter_active = rtt_hours_counter_active;
            (
                "HR_COUNTER_RULES_UPDATE",
                format!("Mise à jour des compteurs et annualisation ({site_id})"),
                site_id.to_string(),
            )
        }
        Command::SaveBadgeSettings {
            badge_frequency,
            tablet_break_badging,
        } => {
            if !is_owner_or_super_admin(&db, &actor, site_id) {
                return Err(err(
                    StatusCode::FORBIDDEN,
                    "Les réglages de badgeuse sont réservés au propriétaire ou super administrateur de ce club.",
                ));
            }
            let freq = badge_frequency.trim().to_string();
            if !matches!(freq.as_str(), "each_shift" | "consecutive_shift_series") {
                return Err(err(
                    StatusCode::BAD_REQUEST,
                    "Fréquence de badgeage invalide (each_shift ou consecutive_shift_series).",
                ));
            }
            let s = &mut next.sites[site_idx].settings;
            s.badge_frequency = freq;
            s.tablet_break_badging = tablet_break_badging;
            (
                "HR_BADGE_SETTINGS_UPDATE",
                format!("Mise à jour des réglages badgeuse ({site_id})"),
                site_id.to_string(),
            )
        }
        Command::SaveAbsenceMotive {
            id,
            label,
            category,
            active,
            employee_requestable,
            included_in_annualization,
            requires_document,
        } => {
            if !can_edit_rules(&db, &actor, site_id) {
                return Err(err(
                    StatusCode::FORBIDDEN,
                    "Droits insuffisants pour modifier les motifs d'absence.",
                ));
            }
            let clean_label = clean_text(&label, 100, true, "Libellé du motif")?;
            let clean_cat = category.trim().to_string();
            if !matches!(
                clean_cat.as_str(),
                "conges" | "maladie" | "evenement_familial" | "recuperation" | "autre"
            ) {
                return Err(err(
                    StatusCode::BAD_REQUEST,
                    "Catégorie de motif invalide.",
                ));
            }
            ensure_site_motives_materialized(&mut next, site_id);
            let target_id = id
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string);

            let duplicate = next.site_absence_motives.iter().any(|m| {
                m.site_id == site_id
                    && m.label.eq_ignore_ascii_case(&clean_label)
                    && target_id.as_deref() != Some(m.id.as_str())
            });
            if duplicate {
                return Err(err(
                    StatusCode::CONFLICT,
                    "Un motif portant déjà ce nom existe sur cet établissement.",
                ));
            }

            let saved_id = if let Some(tid) = target_id {
                let row = next
                    .site_absence_motives
                    .iter_mut()
                    .find(|m| m.id == tid && m.site_id == site_id)
                    .ok_or_else(|| err(StatusCode::NOT_FOUND, "Motif d'absence introuvable sur ce club."))?;
                row.label = clean_label.clone();
                row.category = clean_cat;
                row.active = active;
                row.employee_requestable = employee_requestable;
                row.included_in_annualization = included_in_annualization;
                row.requires_document = requires_document;
                tid
            } else {
                let new_id = format!("mot-{}-{}", club_id, rand::random::<u32>());
                next.site_absence_motives.push(SiteAbsenceMotiveConfig {
                    id: new_id.clone(),
                    site_id: site_id.into(),
                    label: clean_label.clone(),
                    category: clean_cat,
                    active,
                    employee_requestable,
                    included_in_annualization,
                    requires_document,
                });
                new_id
            };
            recompute_motive_counts(&mut next, site_id);
            (
                "HR_ABSENCE_MOTIVE_SAVE",
                format!("Motif d'absence « {clean_label} » enregistré ({site_id})"),
                saved_id,
            )
        }
        Command::SaveStaffingNeed {
            id,
            position_id,
            day_of_week,
            kind,
            start_time,
            end_time,
            min_headcount,
            active,
            note,
        } => {
            if !can_edit_rules(&db, &actor, site_id) {
                return Err(err(
                    StatusCode::FORBIDDEN,
                    "Droits insuffisants pour modifier les besoins en personnel.",
                ));
            }
            let pos_id = position_id.trim().to_string();
            if !next
                .positions
                .iter()
                .any(|p| p.id == pos_id && p.site_id == site_id)
            {
                return Err(err(
                    StatusCode::BAD_REQUEST,
                    "Choisissez un poste rattaché à cet établissement.",
                ));
            }
            let day = day_of_week.trim().to_string();
            if !matches!(
                day.as_str(),
                "monday"
                    | "tuesday"
                    | "wednesday"
                    | "thursday"
                    | "friday"
                    | "saturday"
                    | "sunday"
                    | "weekdays"
                    | "weekend"
            ) {
                return Err(err(StatusCode::BAD_REQUEST, "Jour ou plage hebdomadaire invalide."));
            }
            let clean_kind = kind.trim().to_string();
            if !matches!(clean_kind.as_str(), "fixed" | "variable") {
                return Err(err(
                    StatusCode::BAD_REQUEST,
                    "Type de besoin invalide (fixed ou variable).",
                ));
            }
            let start = start_time.trim().to_string();
            let end = end_time.trim().to_string();
            if !is_valid_hhmm(&start) || !is_valid_hhmm(&end) || hhmm_minutes(&start) >= hhmm_minutes(&end) {
                return Err(err(
                    StatusCode::BAD_REQUEST,
                    "Plage horaire invalide : l'heure de fin doit être postérieure à l'heure de début (HH:MM).",
                ));
            }
            if !(1..=30).contains(&min_headcount) {
                return Err(err(
                    StatusCode::BAD_REQUEST,
                    "L'effectif minimal doit être compris entre 1 et 30 personnes.",
                ));
            }
            let clean_note = clean_text(&note, 200, false, "Note")?;
            let target_id = id
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string);

            let saved_id = if let Some(tid) = target_id {
                let row = next
                    .site_staffing_needs
                    .iter_mut()
                    .find(|n| n.id == tid && n.site_id == site_id)
                    .ok_or_else(|| err(StatusCode::NOT_FOUND, "Besoin en personnel introuvable sur ce club."))?;
                row.position_id = pos_id;
                row.day_of_week = day;
                row.kind = clean_kind;
                row.start_time = start;
                row.end_time = end;
                row.min_headcount = min_headcount;
                row.active = active;
                row.note = clean_note;
                tid
            } else {
                let new_id = format!("need-{}-{}", club_id, rand::random::<u32>());
                next.site_staffing_needs.push(SiteStaffingNeed {
                    id: new_id.clone(),
                    site_id: site_id.into(),
                    position_id: pos_id,
                    day_of_week: day,
                    kind: clean_kind,
                    start_time: start,
                    end_time: end,
                    min_headcount,
                    active,
                    note: clean_note,
                });
                new_id
            };
            (
                "HR_STAFFING_NEED_SAVE",
                format!("Besoin en personnel enregistré ({site_id})"),
                saved_id,
            )
        }
        Command::RemoveStaffingNeed { id } => {
            if !can_edit_rules(&db, &actor, site_id) {
                return Err(err(
                    StatusCode::FORBIDDEN,
                    "Droits insuffisants pour supprimer un besoin en personnel.",
                ));
            }
            let tid = id.trim();
            let before_len = next.site_staffing_needs.len();
            next.site_staffing_needs
                .retain(|n| !(n.id == tid && n.site_id == site_id));
            if next.site_staffing_needs.len() == before_len {
                return Err(err(
                    StatusCode::NOT_FOUND,
                    "Besoin en personnel introuvable sur ce club.",
                ));
            }
            (
                "HR_STAFFING_NEED_REMOVE",
                format!("Suppression d'un besoin en personnel ({site_id})"),
                tid.to_string(),
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

    persist_state(&state.data_dir, &next).map_err(|e| {
        err(
            StatusCode::INTERNAL_SERVER_ERROR,
            &format!("Échec persistance des paramètres RH : {e}"),
        )
    })?;
    *db = next;
    Ok(Json(snapshot(&db, &actor, club_id, site_id)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routes::SharedAppState;
    use crate::seed::load_or_init_state;
    use chrono::Utc;
    use std::collections::HashMap;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    fn test_state() -> SharedState {
        let dir = std::env::temp_dir().join(format!("cfos_site_rules_{}", rand::random::<u128>()));
        Arc::new(SharedAppState {
            db: RwLock::new(load_or_init_state(&dir)),
            data_dir: dir,
            sessions: RwLock::new(HashMap::new()),
            login_attempts: RwLock::new(HashMap::new()),
        })
    }

    async fn headers_for(state: &SharedState, actor_id: &str) -> HeaderMap {
        let token = format!("rules-{}", rand::random::<u128>());
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
    async fn rbac_owner_only_badge_settings_and_cross_club_isolation() {
        let state = test_state();
        let forged = HeaderMap::new();
        assert_eq!(
            get(State(state.clone()), Path("carre-de-soie".into()), forged)
                .await
                .unwrap_err()
                .0,
            StatusCode::UNAUTHORIZED
        );

        for actor in ["emp-chloe", "emp-readonly", "emp-maxime"] {
            let h = headers_for(&state, actor).await;
            assert_eq!(
                get(State(state.clone()), Path("beynost".into()), h)
                    .await
                    .unwrap_err()
                    .0,
                StatusCode::FORBIDDEN
            );
        }

        // emp-master is master_avance on Carre de Soie (ORG04-29 + ORG04-37) and lecture_seule_avancee on Beynost
        let master = headers_for(&state, "emp-master").await;
        assert_eq!(
            get(State(state.clone()), Path("beynost".into()), master.clone())
                .await
                .unwrap_err()
                .0,
            StatusCode::FORBIDDEN
        );
        let Json(cs) = get(State(state.clone()), Path("carre-de-soie".into()), master.clone())
            .await
            .unwrap();
        assert_eq!(cs["capabilities"]["canEditRules"], true);
        assert_eq!(cs["capabilities"]["canEditBadgeSettings"], false);

        // Master cannot change badgeuse settings (strictly owner/superadmin)
        let rev = cs["revision"].as_str().unwrap().to_string();
        assert_eq!(
            post(
                State(state.clone()),
                Path("carre-de-soie".into()),
                master.clone(),
                Json(Mutation {
                    expected_revision: rev.clone(),
                    command: Command::SaveBadgeSettings {
                        badge_frequency: "consecutive_shift_series".into(),
                        tablet_break_badging: false,
                    },
                }),
            )
            .await
            .unwrap_err()
            .0,
            StatusCode::FORBIDDEN
        );

        // Mario (admin_systeme) CAN update badge settings
        let mario = headers_for(&state, "emp-mario").await;
        let Json(updated) = post(
            State(state.clone()),
            Path("carre-de-soie".into()),
            mario,
            Json(Mutation {
                expected_revision: rev,
                command: Command::SaveBadgeSettings {
                    badge_frequency: "consecutive_shift_series".into(),
                    tablet_break_badging: false,
                },
            }),
        )
        .await
        .unwrap();
        assert_eq!(updated["settings"]["badgeFrequency"], "consecutive_shift_series");
        assert_eq!(updated["settings"]["tabletBreakBadging"], false);

        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[tokio::test]
    async fn crud_rules_motives_needs_conflict_and_disk_rollback() {
        let state = test_state();
        let mario = headers_for(&state, "emp-mario").await;
        let Json(initial) = get(State(state.clone()), Path("beynost".into()), mario.clone())
            .await
            .unwrap();
        let rev0 = initial["revision"].as_str().unwrap().to_string();

        // 1. Save base rules
        let Json(after_rules) = post(
            State(state.clone()),
            Path("beynost".into()),
            mario.clone(),
            Json(Mutation {
                expected_revision: rev0.clone(),
                command: Command::SaveBaseRules {
                    day_start_hour: "06:00".into(),
                    break_alert_enabled: true,
                    break_alert_hours: 6,
                    consecutive_days_blocking: true,
                    complementary_max_hours: 12,
                    smart_planner_break_max_hours: 3,
                    alerts_layout: "split_13_6".into(),
                    missions_module_active: false,
                    report_rules_visible: true,
                },
            }),
        )
        .await
        .unwrap();
        assert_eq!(after_rules["settings"]["dayStartHour"], "06:00");
        assert_eq!(after_rules["settings"]["alertsLayout"], "split_13_6");
        let rev1 = after_rules["revision"].as_str().unwrap().to_string();

        // Stale revision must be 409
        assert_eq!(
            post(
                State(state.clone()),
                Path("beynost".into()),
                mario.clone(),
                Json(Mutation {
                    expected_revision: rev0,
                    command: Command::SaveCounterRules {
                        acquisition_mode: "2,5j/mois".into(),
                        annualization_period: "2026-2027".into(),
                        sunday_hours_in_annualization: false,
                        rtt_hours_counter_active: true,
                    },
                }),
            )
            .await
            .unwrap_err()
            .0,
            StatusCode::CONFLICT
        );

        // 2. Add absence motive & reject duplicate
        let Json(after_motive) = post(
            State(state.clone()),
            Path("beynost".into()),
            mario.clone(),
            Json(Mutation {
                expected_revision: rev1,
                command: Command::SaveAbsenceMotive {
                    id: None,
                    label: "Paternité".into(),
                    category: "evenement_familial".into(),
                    active: true,
                    employee_requestable: true,
                    included_in_annualization: true,
                    requires_document: true,
                },
            }),
        )
        .await
        .unwrap();
        assert_eq!(after_motive["motives"].as_array().unwrap().len(), 9);
        let rev2 = after_motive["revision"].as_str().unwrap().to_string();
        assert_eq!(
            post(
                State(state.clone()),
                Path("beynost".into()),
                mario.clone(),
                Json(Mutation {
                    expected_revision: rev2.clone(),
                    command: Command::SaveAbsenceMotive {
                        id: None,
                        label: "paternité".into(),
                        category: "evenement_familial".into(),
                        active: true,
                        employee_requestable: true,
                        included_in_annualization: true,
                        requires_document: true,
                    },
                }),
            )
            .await
            .unwrap_err()
            .0,
            StatusCode::CONFLICT
        );

        // 3. Reject cross-club position and reversed hours for staffing need; accept valid need then remove
        let bey_pos_id = after_motive["positions"][0]["id"].as_str().unwrap().to_string();
        assert_eq!(
            post(
                State(state.clone()),
                Path("beynost".into()),
                mario.clone(),
                Json(Mutation {
                    expected_revision: rev2.clone(),
                    command: Command::SaveStaffingNeed {
                        id: None,
                        position_id: "pos-cs-accueil".into(),
                        day_of_week: "monday".into(),
                        kind: "fixed".into(),
                        start_time: "09:00".into(),
                        end_time: "12:00".into(),
                        min_headcount: 2,
                        active: true,
                        note: String::new(),
                    },
                }),
            )
            .await
            .unwrap_err()
            .0,
            StatusCode::BAD_REQUEST
        );
        let Json(after_need) = post(
            State(state.clone()),
            Path("beynost".into()),
            mario.clone(),
            Json(Mutation {
                expected_revision: rev2,
                command: Command::SaveStaffingNeed {
                    id: None,
                    position_id: bey_pos_id,
                    day_of_week: "weekdays".into(),
                    kind: "fixed".into(),
                    start_time: "09:00".into(),
                    end_time: "18:00".into(),
                    min_headcount: 2,
                    active: true,
                    note: "Accueil continu".into(),
                },
            }),
        )
        .await
        .unwrap();
        assert_eq!(after_need["staffingNeeds"].as_array().unwrap().len(), 1);
        let rev3 = after_need["revision"].as_str().unwrap().to_string();
        let need_id = after_need["staffingNeeds"][0]["id"].as_str().unwrap().to_string();

        // 4. Disk failure rolls back memory/disk/audit cleanly
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
                    command: Command::RemoveStaffingNeed { id: need_id.clone() },
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

        let Json(after_remove) = post(
            State(state.clone()),
            Path("beynost".into()),
            mario,
            Json(Mutation {
                expected_revision: rev3,
                command: Command::RemoveStaffingNeed { id: need_id },
            }),
        )
        .await
        .unwrap();
        assert!(after_remove["staffingNeeds"].as_array().unwrap().is_empty());

        // 5. #49 backward compatibility: reload without new fields
        let path = state.data_dir.join("cfitness_state.json");
        let mut raw: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        raw.as_object_mut().unwrap().remove("siteAbsenceMotives");
        raw.as_object_mut().unwrap().remove("siteStaffingNeeds");
        std::fs::write(&path, serde_json::to_vec_pretty(&raw).unwrap()).unwrap();
        let reloaded = crate::seed::try_load_or_init_state(&state.data_dir).unwrap();
        assert!(reloaded.site_absence_motives.is_empty());
        assert!(reloaded.site_staffing_needs.is_empty());

        let _ = std::fs::remove_dir_all(&state.data_dir);
    }
}
