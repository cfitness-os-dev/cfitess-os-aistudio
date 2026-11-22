use crate::models::AppDatabaseState;
use crate::rbac::{can_access_site_scope, is_owner_or_super_admin};
use crate::routes::{append_audit, err_resp, resolve_session_actor, SharedState};
use crate::seed::persist_state;
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClockPolicy {
    pub personal_allowed: bool,
    pub terminal_allowed: bool,
    pub revision: String,
    pub updated_at: String,
    pub updated_by: String,
}
type Failure = (StatusCode, Json<Value>);
fn site(club: &str) -> Result<&'static str, Failure> {
    match club {
        "carre-de-soie" => Ok("club-carre-soie"),
        "beynost" => Ok("club-beynost"),
        _ => Err(err_resp(StatusCode::BAD_REQUEST, "Club inconnu.")),
    }
}
pub(crate) fn policy(db: &AppDatabaseState, employee: &str, club: &str) -> ClockPolicy {
    db.personal_workspace
        .clock_policies
        .get(employee)
        .and_then(|clubs| clubs.get(club))
        .cloned()
        .unwrap_or_default()
}
fn permitted(db: &AppDatabaseState, actor: &str, employee: &str, site: &str) -> bool {
    can_access_site_scope(db, employee, site) && is_owner_or_super_admin(db, actor, site)
}
async fn actor(state: &SharedState, headers: &HeaderMap) -> Result<String, Failure> {
    if !headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.starts_with("Bearer "))
        .unwrap_or(false)
    {
        return Err(err_resp(
            StatusCode::UNAUTHORIZED,
            "Connectez-vous pour consulter les autorisations de pointage.",
        ));
    }
    Ok(resolve_session_actor(state, headers).await?.0)
}
fn view(db: &AppDatabaseState, actor: &str, club: &str, site: &str) -> Result<Value, Failure> {
    let rows = db.employees.iter().filter(|employee|permitted(db,actor,&employee.id,site)).map(|employee|json!({
        "employeeId":employee.id,"employeeName":format!("{} {}",employee.first_name,employee.last_name),"employeeReference":employee.matricule,
        "policy":policy(db,&employee.id,club),"canEdit":employee.id != actor
    })).collect::<Vec<_>>();
    if rows.is_empty() {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Vos droits ne permettent pas de gérer les modes de pointage de ce club.",
        ));
    }
    Ok(json!({"actorId":actor,"clubId":club,"terminalReady":false,"rows":rows}))
}
pub async fn get_policies(
    State(state): State<SharedState>,
    Path(club): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, Failure> {
    let site = site(&club)?;
    let actor = actor(&state, &headers).await?;
    let db = state.db.read().await;
    Ok(Json(view(&db, &actor, &club, site)?))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdatePolicy {
    pub personal_allowed: bool,
    pub terminal_allowed: bool,
    pub expected_revision: Option<String>,
    pub reason: String,
}
pub async fn put_policy(
    State(state): State<SharedState>,
    Path((club, employee)): Path<(String, String)>,
    headers: HeaderMap,
    Json(payload): Json<UpdatePolicy>,
) -> Result<Json<Value>, Failure> {
    let site = site(&club)?;
    let actor = actor(&state, &headers).await?;
    let mut db = state.db.write().await;
    if actor == employee || !permitted(&db, &actor, &employee, site) {
        return Err(err_resp(StatusCode::FORBIDDEN,"Une autre personne habilitée doit attribuer vos droits ; la gestion reste limitée à votre périmètre."));
    }
    let current = policy(&db, &employee, &club);
    let expected = payload.expected_revision.as_deref().unwrap_or("");
    if current.revision != expected {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "Ces droits ont changé. Actualisez avant d’enregistrer.",
        ));
    }
    let reason = payload.reason.trim();
    if reason.is_empty() || reason.chars().count() > 1000 {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Indiquez un motif de 1 à 1000 caractères.",
        ));
    }
    let updated = ClockPolicy {
        personal_allowed: payload.personal_allowed,
        terminal_allowed: payload.terminal_allowed,
        revision: format!("clock-policy-{}", rand::random::<u128>()),
        updated_at: chrono::Utc::now().to_rfc3339(),
        updated_by: actor.clone(),
    };
    let mut next = db.clone();
    next.personal_workspace
        .clock_policies
        .entry(employee.clone())
        .or_default()
        .insert(club.clone(), updated.clone());
    append_audit(
        &mut next,
        &actor,
        "CLOCKING_POLICY_UPDATE",
        reason.into(),
        site,
        &employee,
        Some(serde_json::to_string(&current).unwrap()),
        Some(serde_json::to_string(&updated).unwrap()),
    );
    persist_state(&state.data_dir, &next).map_err(|_| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Autorisations non enregistrées. Aucun changement confirmé.",
        )
    })?;
    *db = next;
    Ok(Json(view(&db, &actor, &club, site)?))
}
