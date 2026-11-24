//! Canonical club/team/position configuration; no provider calls.
use crate::models::{AppDatabaseState, Position, Scope, Team};
use crate::rbac::{
    can_access_site_scope, evaluate_permission, normalize_site_id, validate_delegation_update,
};
use crate::routes::{append_audit, err_resp, resolve_session_actor, SharedState};
use crate::seed::persist_state;
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;

type Failure = (StatusCode, Json<Value>);
fn error(code: StatusCode, text: &str) -> Failure {
    err_resp(code, text)
}
pub(crate) fn site_permission(
    db: &AppDatabaseState,
    actor: &str,
    site: &str,
    action: &str,
) -> bool {
    let permission = evaluate_permission(db, actor, site, action, None);
    permission.allowed && permission.effective_scope == Scope::Sites
}
pub(crate) fn organisation_permission(db: &AppDatabaseState, actor: &str, action: &str) -> bool {
    !db.sites.is_empty()
        && db
            .sites
            .iter()
            .all(|s| site_permission(db, actor, &s.id, action))
}
async fn actor(state: &SharedState, headers: &HeaderMap) -> Result<String, Failure> {
    if !headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("Bearer "))
    {
        return Err(error(
            StatusCode::UNAUTHORIZED,
            "Connectez-vous pour consulter les réglages RH.",
        ));
    }
    Ok(resolve_session_actor(state, headers).await?.0)
}
fn readable(db: &AppDatabaseState, actor: &str, site: &str) -> bool {
    can_access_site_scope(db, actor, site)
        && ["ORG04-27", "ORG04-28", "ORG04-31", "ORG04-32"]
            .iter()
            .any(|action| evaluate_permission(db, actor, site, action, None).allowed)
}
fn audit_configuration(db: &AppDatabaseState, site: &str) -> Value {
    json!({
        "organization":db.organization,
        "site":db.sites.iter().find(|s|s.id==site),
        "teams":db.teams.iter().filter(|t|t.site_id==site).collect::<Vec<_>>(),
        "positions":db.positions.iter().filter(|p|p.site_id==site).collect::<Vec<_>>(),
        "profiles":db.profiles
    })
}
fn snapshot(db: &AppDatabaseState, actor: &str, site: &str) -> Value {
    let club = db.sites.iter().find(|s| s.id == site).expect("known site");
    let teams: Vec<_> = db.teams.iter().filter(|t| t.site_id == site).collect();
    let positions: Vec<_> = db.positions.iter().filter(|p| p.site_id == site).collect();
    // Opaque concurrency token excludes employee/private HR fields and session data.
    let revision = format!(
        "{:x}",
        Sha256::digest(
            serde_json::to_vec(&(&db.organization, club, &teams, &positions, &db.profiles))
                .unwrap()
        )
    );
    let organisation = organisation_permission(db, actor, "ORG04-32");
    let profiles = organisation_permission(db, actor, "ORG04-31");
    json!({
        "demoMode":crate::routes::is_demo_mode(), "actorId":actor, "siteId":site, "revision":revision, "site":club, "teams":teams, "positions":positions,
        "organization":if organisation { serde_json::to_value(&db.organization).unwrap() } else { Value::Null },
        "profiles":if evaluate_permission(db, actor, site, "ORG04-31", None).allowed { serde_json::to_value(&db.profiles).unwrap() } else { json!([]) },
        "capabilities":{"manageTeams":site_permission(db,actor,site,"ORG04-27"),
            "editClub":site_permission(db,actor,site,"ORG04-32") || crate::rbac::is_owner_or_super_admin(db,actor,site),
            "editOrganization":organisation,"editProfiles":profiles}
    })
}
pub async fn get(
    State(state): State<SharedState>,
    Path(raw): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, Failure> {
    let actor = actor(&state, &headers).await?;
    let db = state.db.read().await;
    let site = normalize_site_id(&raw);
    if !db.sites.iter().any(|s| s.id == site) {
        return Err(error(StatusCode::NOT_FOUND, "Club introuvable."));
    }
    if !readable(&db, &actor, &site) {
        return Err(error(
            StatusCode::FORBIDDEN,
            "Réglages RH hors de votre périmètre.",
        ));
    }
    Ok(Json(snapshot(&db, &actor, &site)))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Mutation {
    pub expected_revision: String,
    pub command: Command,
}
#[derive(Deserialize)]
#[serde(
    tag = "action",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Command {
    SaveTeam {
        id: Option<String>,
        name: String,
    },
    RemoveTeam {
        id: String,
    },
    SavePosition {
        id: Option<String>,
        label: String,
        color: String,
        default_break_minutes: u32,
        active: bool,
    },
    SaveClub {
        name: String,
        address: String,
        city: String,
        siret: String,
    },
    SaveOrganization {
        name: String,
        legal_name: String,
        siren: String,
        vat_number: String,
        sector: String,
        contact_email: String,
        meal_allowance_eur: f64,
        billing_notice: String,
    },
    SaveProfile {
        profile_id: String,
        scope_selected: String,
        checked_map: HashMap<String, bool>,
    },
}
fn text(value: &str, max: usize, required: bool) -> Result<String, Failure> {
    let v = value.trim();
    if (required && v.is_empty())
        || v.chars().count() > max
        || v.chars().any(|c| c.is_control() && c != '\n')
    {
        return Err(error(
            StatusCode::BAD_REQUEST,
            "Champ vide, trop long ou contenant des caractères interdits.",
        ));
    }
    Ok(v.into())
}
fn identifier(value: &str, length: usize) -> bool {
    value.is_empty() || (value.len() == length && value.bytes().all(|b| b.is_ascii_digit()))
}
fn valid_email(value: &str) -> bool {
    let parts: Vec<_> = value.split('@').collect();
    parts.len() == 2
        && !parts[0].is_empty()
        && parts[1].contains('.')
        && !value
            .chars()
            .any(|c| c.is_whitespace() || c.is_control() || "<>\";,".contains(c))
}
pub(crate) fn validate_organization(org: &crate::models::Organization) -> Result<(), Failure> {
    text(&org.name, 120, true)?;
    text(&org.legal_name, 200, true)?;
    text(&org.vat_number, 40, false)?;
    text(&org.sector, 120, false)?;
    text(&org.billing_notice, 2000, false)?;
    if !identifier(&org.siren, 9)
        || !org.meal_allowance_eur.is_finite()
        || !(0.0..=1000.0).contains(&org.meal_allowance_eur)
    {
        return Err(error(
            StatusCode::BAD_REQUEST,
            "SIREN ou indemnité repas invalide.",
        ));
    }
    let email = org.contact_email.trim();
    if email.len() > 254 || (!email.is_empty() && (!valid_email(email))) {
        return Err(error(
            StatusCode::BAD_REQUEST,
            "Adresse email de contact invalide.",
        ));
    }
    Ok(())
}
fn audit_diff(before: &Value, after: &Value) -> (String, String) {
    let mut old = serde_json::Map::new();
    let mut new = serde_json::Map::new();
    for key in ["site", "organization", "teams", "positions", "profiles"] {
        if before[key] == after[key] {
            continue;
        }
        if let (Some(left), Some(right)) = (before[key].as_array(), after[key].as_array()) {
            old.insert(
                key.into(),
                json!(left
                    .iter()
                    .filter(|x| !right.iter().any(|y| x["id"] == y["id"] && x == &y))
                    .collect::<Vec<_>>()),
            );
            new.insert(
                key.into(),
                json!(right
                    .iter()
                    .filter(|x| !left.iter().any(|y| x["id"] == y["id"] && x == &y))
                    .collect::<Vec<_>>()),
            );
        } else {
            old.insert(key.into(), before[key].clone());
            new.insert(key.into(), after[key].clone());
        }
    }
    (
        Value::Object(old).to_string(),
        Value::Object(new).to_string(),
    )
}
pub async fn post(
    State(state): State<SharedState>,
    Path(raw): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<Mutation>,
) -> Result<Json<Value>, Failure> {
    let actor = actor(&state, &headers).await?;
    let site = normalize_site_id(&raw);
    let mut db = state.db.write().await;
    if !db.sites.iter().any(|s| s.id == site) {
        return Err(error(StatusCode::NOT_FOUND, "Club introuvable."));
    }
    if !readable(&db, &actor, &site) {
        return Err(error(
            StatusCode::FORBIDDEN,
            "Réglages RH hors de votre périmètre.",
        ));
    }
    let current = snapshot(&db, &actor, &site);
    if current["revision"].as_str() != Some(payload.expected_revision.as_str()) {
        return Err(error(
            StatusCode::CONFLICT,
            "Les réglages ont changé. Actualisez avant d’enregistrer ; votre saisie est conservée.",
        ));
    }
    let mut next = db.clone();
    let (action, label) = match payload.command {
        Command::SaveTeam { id, name } => {
            if !site_permission(&db, &actor, &site, "ORG04-27") {
                return Err(error(
                    StatusCode::FORBIDDEN,
                    "Gestion des équipes non autorisée sur ce club.",
                ));
            }
            let name = text(&name, 100, true)?;
            if next.teams.iter().any(|t| {
                t.site_id == site
                    && Some(&t.id) != id.as_ref()
                    && t.name.trim().to_lowercase() == name.to_lowercase()
            }) {
                return Err(error(
                    StatusCode::CONFLICT,
                    "Une équipe porte déjà ce nom dans ce club.",
                ));
            }
            if let Some(id) = id {
                let row = next
                    .teams
                    .iter_mut()
                    .find(|t| t.id == id && t.site_id == site)
                    .ok_or_else(|| {
                        error(StatusCode::NOT_FOUND, "Équipe introuvable dans ce club.")
                    })?;
                row.name = name.clone();
            } else {
                next.teams.push(Team {
                    id: format!("team-{:032x}", rand::random::<u128>()),
                    site_id: site.clone(),
                    name: name.clone(),
                });
            }
            ("HR_TEAM_SAVE", name)
        }
        Command::RemoveTeam { id } => {
            if !site_permission(&db, &actor, &site, "ORG04-27") {
                return Err(error(
                    StatusCode::FORBIDDEN,
                    "Gestion des équipes non autorisée sur ce club.",
                ));
            }
            let row = next
                .teams
                .iter()
                .find(|t| t.id == id && t.site_id == site)
                .ok_or_else(|| error(StatusCode::NOT_FOUND, "Équipe introuvable dans ce club."))?;
            let name = row.name.clone();
            if next.employees.iter().any(|e| {
                e.site_accesses
                    .iter()
                    .any(|a| a.team_ids.contains(&id) || a.managed_team_ids.contains(&id))
            }) {
                return Err(error(StatusCode::CONFLICT,"Cette équipe est encore attribuée ou encadrée. Retirez d’abord ses affectations."));
            }
            next.teams.retain(|t| t.id != id);
            ("HR_TEAM_REMOVE", name)
        }
        Command::SavePosition {
            id,
            label,
            color,
            default_break_minutes,
            active,
        } => {
            if !site_permission(&db, &actor, &site, "ORG04-27") {
                return Err(error(
                    StatusCode::FORBIDDEN,
                    "Gestion des postes non autorisée sur ce club.",
                ));
            }
            let label = text(&label, 100, true)?;
            if color.len() != 7
                || !color.starts_with('#')
                || !color[1..].bytes().all(|c| c.is_ascii_hexdigit())
                || default_break_minutes > 180
            {
                return Err(error(
                    StatusCode::BAD_REQUEST,
                    "Couleur ou pause du poste invalide.",
                ));
            }
            let unchanged_label = id.as_ref().is_some_and(|id| {
                next.positions.iter().any(|p| {
                    &p.id == id
                        && p.site_id == site
                        && p.label.trim().to_lowercase() == label.to_lowercase()
                })
            });
            if !unchanged_label
                && next.positions.iter().any(|p| {
                    p.site_id == site
                        && Some(&p.id) != id.as_ref()
                        && p.label.trim().to_lowercase() == label.to_lowercase()
                })
            {
                return Err(error(
                    StatusCode::CONFLICT,
                    "Un poste porte déjà ce nom dans ce club.",
                ));
            }
            if let Some(id) = id {
                let row = next
                    .positions
                    .iter_mut()
                    .find(|p| p.id == id && p.site_id == site)
                    .ok_or_else(|| {
                        error(StatusCode::NOT_FOUND, "Poste introuvable dans ce club.")
                    })?;
                row.label = label.clone();
                row.color = color;
                row.default_break_minutes = default_break_minutes;
                row.active = active;
            } else {
                next.positions.push(Position {
                    id: format!("position-{:032x}", rand::random::<u128>()),
                    site_id: site.clone(),
                    label: label.clone(),
                    color,
                    default_break_minutes,
                    active,
                });
            }
            ("HR_POSITION_SAVE", label)
        }
        Command::SaveClub {
            name,
            address,
            city,
            siret,
        } => {
            if current["capabilities"]["editClub"] != true {
                return Err(error(
                    StatusCode::FORBIDDEN,
                    "Modification de ce club non autorisée.",
                ));
            }
            let row = next.sites.iter_mut().find(|s| s.id == site).unwrap();
            row.name = text(&name, 120, true)?;
            row.address = text(&address, 250, false)?;
            row.city = text(&city, 120, false)?;
            row.siret = text(&siret, 14, false)?;
            if !identifier(&row.siret, 14) {
                return Err(error(
                    StatusCode::BAD_REQUEST,
                    "Le SIRET doit être vide ou contenir 14 chiffres.",
                ));
            }
            ("HR_CLUB_SAVE", row.name.clone())
        }
        Command::SaveOrganization {
            name,
            legal_name,
            siren,
            vat_number,
            sector,
            contact_email,
            meal_allowance_eur,
            billing_notice,
        } => {
            if !organisation_permission(&db, &actor, "ORG04-32") {
                return Err(error(
                    StatusCode::FORBIDDEN,
                    "L’organisation est commune aux clubs : autorisation requise sur chaque club.",
                ));
            }
            let org = &mut next.organization;
            org.name = name.trim().into();
            org.legal_name = legal_name.trim().into();
            org.siren = siren.trim().into();
            org.vat_number = vat_number.trim().into();
            org.sector = sector.trim().into();
            org.contact_email = contact_email.trim().into();
            org.meal_allowance_eur = meal_allowance_eur;
            org.billing_notice = billing_notice.trim().into();
            validate_organization(org)?;
            ("HR_ORGANIZATION_SAVE", org.name.clone())
        }
        Command::SaveProfile {
            profile_id,
            scope_selected,
            checked_map,
        } => {
            if !organisation_permission(&db, &actor, "ORG04-31") {
                return Err(error(
                    StatusCode::FORBIDDEN,
                    "Les profils sont communs aux clubs : autorisation requise sur chaque club.",
                ));
            }
            validate_delegation_update(
                &db,
                &actor,
                &site,
                &profile_id,
                &scope_selected,
                &checked_map,
            )
            .map_err(|why| {
                err_resp(
                    StatusCode::FORBIDDEN,
                    why.replace("(TST34)", "")
                        .replace("Refus serveur (403) : ", ""),
                )
            })?;
            let row = next
                .profiles
                .iter_mut()
                .find(|p| p.id == profile_id)
                .ok_or_else(|| error(StatusCode::NOT_FOUND, "Profil introuvable."))?;
            row.scope_selected = scope_selected;
            for r in &mut row.rows {
                if let Some(checked) = checked_map.get(&r.action_id) {
                    r.checked = Some(*checked);
                }
            }
            ("HR_PROFILE_SAVE", row.name.clone())
        }
    };
    // Audit full configuration diffs, never the employee/payroll/session store.
    let after = snapshot(&next, &actor, &site);
    let (before_summary, after_summary) = audit_diff(
        &audit_configuration(&db, &site),
        &audit_configuration(&next, &site),
    );
    if before_summary == "{}" && after_summary == "{}" {
        return Ok(Json(after));
    }
    append_audit(
        &mut next,
        &actor,
        action,
        format!("Réglages RH : {label}"),
        &site,
        &label,
        Some(before_summary),
        Some(after_summary),
    );
    persist_state(&state.data_dir, &next).map_err(|_| {
        error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Enregistrement impossible. Aucun changement confirmé.",
        )
    })?;
    *db = next;
    Ok(Json(snapshot(&db, &actor, &site)))
}
