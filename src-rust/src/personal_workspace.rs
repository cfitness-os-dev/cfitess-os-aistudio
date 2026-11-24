use crate::models::{AppDatabaseState, LeaveRequest};
use crate::rbac::{can_access_site_scope, evaluate_permission, PermissionTarget};
use crate::routes::{append_audit, err_resp, is_demo_mode, resolve_session_actor, SharedState};
use crate::seed::persist_state;
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;

#[path = "personal_leave_withdrawal.rs"]
mod leave_withdrawal;

// Only these action handlers can mutate the store. No client state replacement.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceStore {
    #[serde(default)]
    pub clock_policies: HashMap<String, HashMap<String, crate::clock_policy::ClockPolicy>>,
    pub people: HashMap<String, Value>,
    pub checklists: HashMap<String, Vec<Value>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Action {
    pub action: String,
    pub id: Option<String>,
    pub title: Option<String>,
    pub category: Option<String>,
    pub completed: Option<bool>,
    pub selected_option: Option<usize>,
    pub motive: Option<String>,
    pub motive_id: Option<String>,
    pub document_ids: Option<Vec<String>>,
    pub expected_revision: Option<String>,
    pub start_period: Option<String>,
    pub end_period: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub comment: Option<String>,
    pub consent: Option<bool>,
    pub punch_type: Option<String>,
}

type Failure = (StatusCode, Json<Value>);
fn bad(message: &str) -> Failure {
    err_resp(StatusCode::BAD_REQUEST, message)
}
fn fixture() -> Value {
    if is_demo_mode() {
        serde_json::from_str(include_str!("../../contracts/personal-workspace-demo.json"))
            .expect("valid demo workspace")
    } else {
        json!({})
    }
}
fn items(source: &Value, key: &str) -> Vec<Value> {
    source[key].as_array().cloned().unwrap_or_default()
}
fn items_mut<'a>(source: &'a mut Value, key: &str) -> Result<&'a mut Vec<Value>, Failure> {
    source
        .get_mut(key)
        .and_then(Value::as_array_mut)
        .ok_or_else(|| {
            err_resp(
                StatusCode::CONFLICT,
                "Les données personnelles nécessitent une vérification par le responsable.",
            )
        })
}
fn club(raw: &str) -> Result<(&'static str, &'static str), Failure> {
    match raw {
        "carre-de-soie" => Ok(("carre-de-soie", "club-carre-soie")),
        "beynost" => Ok(("beynost", "club-beynost")),
        _ => Err(bad("Club inconnu.")),
    }
}
pub(crate) fn person(db: &AppDatabaseState, actor: &str) -> Value {
    db.personal_workspace.people.get(actor).cloned().unwrap_or_else(|| {
        let seed = fixture();
        let own = |key: &str| items(&seed, key).into_iter().filter(|row| row["employeeId"] == actor).collect::<Vec<_>>();
        json!({"tasks":own("tasks"),"notifications":own("notifications"),"documents":own("documents"),"progress":own("progress"),"timeEntries":[]})
    })
}
fn checklist(db: &AppDatabaseState, club_id: &str) -> Vec<Value> {
    db.personal_workspace
        .checklists
        .get(club_id)
        .cloned()
        .unwrap_or_else(|| {
            items(&fixture(), "checklists")
                .into_iter()
                .filter(|row| row["clubId"] == club_id)
                .collect()
        })
}
fn scoped_rows(person: &Value, key: &str, club_id: &str) -> Vec<Value> {
    items(person, key)
        .into_iter()
        .filter(|row| row["clubId"].is_null() || row["clubId"] == club_id)
        .collect()
}
pub(crate) fn punch_availability(data: &Value, club_id: &str) -> Value {
    let rows = items(data, "timeEntries");
    let last = rows.last();
    let previous = last.and_then(|r| r["type"].as_str());
    let same_club = last.map(|r| r["clubId"] == club_id).unwrap_or(true);
    let allowed: &[&str] = match previous {
        None | Some("depart") => &["arrivee"],
        Some("arrivee") | Some("fin_pause") if same_club => &["debut_pause", "depart"],
        Some("debut_pause") if same_club => &["fin_pause"],
        _ => &[],
    };
    let open_club = last
        .filter(|_| previous != Some("depart"))
        .and_then(|row| row["clubId"].as_str());
    json!({"allowedTypes": allowed, "openClubId": open_club})
}
fn can_request_leave(db: &AppDatabaseState, actor: &str, site: &str) -> bool {
    evaluate_permission(
        db,
        actor,
        site,
        "ORG04-19",
        Some(PermissionTarget {
            site_id: Some(site),
            target_employee_id: Some(actor),
            target_team_ids: &[],
            lock_state: None,
        }),
    )
    .allowed
}
async fn personal_actor(state: &SharedState, headers: &HeaderMap) -> Result<String, Failure> {
    if !headers
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .map(|h| h.starts_with("Bearer "))
        .unwrap_or(false)
    {
        return Err(err_resp(
            StatusCode::UNAUTHORIZED,
            "Connectez-vous à votre espace personnel.",
        ));
    }
    Ok(resolve_session_actor(state, headers).await?.0)
}
fn view(db: &AppDatabaseState, actor: &str, club_id: &str, site: &str) -> Value {
    let data = person(db, actor);
    let policy = crate::clock_policy::policy(db, actor, club_id);
    let mut availability = punch_availability(&data, club_id);
    if !policy.personal_allowed {
        availability["allowedTypes"] = json!([]);
    }
    let mut training = items(&fixture(), "training");
    for row in &mut training {
        if let Some(object) = row.as_object_mut() {
            object.remove("quizCorrectIndex");
        }
    }
    json!({
        "employeeId":actor,"clubId":club_id,"demoMode":is_demo_mode(),"signatureProviderAvailable":false,"canRequestLeave":can_request_leave(db,actor,site),
        "tasks":scoped_rows(&data,"tasks",club_id),"notifications":scoped_rows(&data,"notifications",club_id),
        "documents":items(&data,"documents"),"training":training,"progress":items(&data,"progress"),
        "timeEntries":scoped_rows(&data,"timeEntries",club_id),"punchAvailability":availability,"clockingPolicy":{"personalAllowed":policy.personal_allowed,"terminalAllowed":policy.terminal_allowed,"terminalReady":false},"checklists":checklist(db,club_id),
        "shifts":db.shifts.iter().filter(|row|row.employee_id.as_deref()==Some(actor) && row.site_id==site && row.published).collect::<Vec<_>>(),
        "requestMotives":crate::hr_leave_policy::motives(db,site).into_iter().filter(|m|m.active&&m.employee_requestable).collect::<Vec<_>>(),
        "leaves":db.leave_requests.iter().filter(|row|row.employee_id==actor && row.site_id==site).map(|row|{
            let mut value=serde_json::to_value(row).unwrap();
            value["policy"]=crate::hr_leave_policy::request_view(db,actor,row);value
        }).collect::<Vec<_>>()
    })
}

pub async fn get_workspace(
    State(state): State<SharedState>,
    Path(raw): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, Failure> {
    let (club_id, site) = club(&raw)?;
    let actor = personal_actor(&state, &headers).await?;
    let db = state.db.read().await;
    if !can_access_site_scope(&db, &actor, site) {
        return Err(err_resp(StatusCode::FORBIDDEN, "Accès refusé à ce club."));
    }
    Ok(Json(view(&db, &actor, club_id, site)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routes::SharedAppState;
    use crate::seed::load_or_init_state;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    fn state() -> SharedState {
        let data_dir =
            std::env::temp_dir().join(format!("personal-workspace-{}", rand::random::<u128>()));
        let mut db = load_or_init_state(&data_dir);
        // Explicit fixture grants for tests of transitions, not a runtime/demo exemption.
        for employee in ["emp-chloe", "emp-mario"] {
            for club in ["carre-de-soie", "beynost"] {
                db.personal_workspace
                    .clock_policies
                    .entry(employee.into())
                    .or_default()
                    .insert(
                        club.into(),
                        crate::clock_policy::ClockPolicy {
                            personal_allowed: true,
                            ..Default::default()
                        },
                    );
            }
        }
        Arc::new(SharedAppState {
            db: RwLock::new(db),
            data_dir,
            sessions: RwLock::new(HashMap::new()),
            login_attempts: RwLock::new(HashMap::new()),
        })
    }
    async fn headers(state: &SharedState, actor: &str) -> HeaderMap {
        let token = format!("test-{}", rand::random::<u128>());
        state
            .sessions
            .write()
            .await
            .insert(token.clone(), (actor.into(), Utc::now().timestamp() + 3600));
        let mut headers = HeaderMap::new();
        headers.insert("authorization", format!("Bearer {token}").parse().unwrap());
        headers
    }
    async fn get(state: &SharedState, headers: &HeaderMap, club_id: &str) -> Value {
        get_workspace(State(state.clone()), Path(club_id.into()), headers.clone())
            .await
            .unwrap()
            .0
    }
    async fn action(
        state: &SharedState,
        headers: &HeaderMap,
        club_id: &str,
        body: Value,
    ) -> Result<Json<Value>, Failure> {
        post_workspace_action(
            State(state.clone()),
            Path(club_id.into()),
            headers.clone(),
            Json(serde_json::from_value(body).unwrap()),
        )
        .await
    }

    #[tokio::test]
    async fn workspace_uses_session_identity_club_and_never_exposes_quiz_answers() {
        let state = state();
        let chloe = headers(&state, "emp-chloe").await;
        let data = get(&state, &chloe, "beynost").await;
        assert_eq!(data["employeeId"], "emp-chloe");
        for key in ["tasks", "notifications", "documents", "progress"] {
            assert!(items(&data, key)
                .iter()
                .all(|r| r["employeeId"] == "emp-chloe"));
        }
        assert!(items(&data, "training")
            .iter()
            .all(|r| r.get("quizCorrectIndex").is_none()));
        assert_eq!(
            get_workspace(State(state.clone()), Path("carre-de-soie".into()), chloe)
                .await
                .unwrap_err()
                .0,
            StatusCode::FORBIDDEN
        );
        assert!(serde_json::from_value::<Action>(
            json!({"action":"add_task","title":"x","employeeId":"emp-mario"})
        )
        .is_err());
        std::fs::remove_dir_all(&state.data_dir).unwrap();
    }

    #[tokio::test]
    async fn personal_actions_persist_and_leaves_use_existing_rh_table() {
        let state = state();
        let chloe = headers(&state, "emp-chloe").await;
        let data = action(
            &state,
            &chloe,
            "beynost",
            json!({"action":"add_task","title":"Tâche de recette"}),
        )
        .await
        .unwrap()
        .0;
        let task = items(&data, "tasks")
            .into_iter()
            .find(|r| r["title"] == "Tâche de recette")
            .unwrap();
        let _ = action(
            &state,
            &chloe,
            "beynost",
            json!({"action":"set_task","id":task["id"],"completed":true}),
        )
        .await
        .unwrap();
        let _ = action(&state,&chloe,"beynost",json!({"action":"request_leave","motive":"CP","startDate":"2027-02-01","endDate":"2027-02-03"})).await.unwrap();
        let persisted = load_or_init_state(&state.data_dir);
        assert!(persisted
            .leave_requests
            .iter()
            .any(|r| r.employee_id == "emp-chloe"
                && r.site_id == "club-beynost"
                && r.start_date == "2027-02-01"
                && r.status == "pending"));
        assert!(
            items(&persisted.personal_workspace.people["emp-chloe"], "tasks")
                .iter()
                .any(|r| r["id"] == task["id"] && r["completed"] == true)
        );
        assert_eq!(action(&state,&chloe,"beynost",json!({"action":"request_leave","motive":"CP","startDate":"2027-02-01","endDate":"2027-02-03"})).await.unwrap_err().0,StatusCode::CONFLICT);
        std::fs::remove_dir_all(&state.data_dir).unwrap();
    }

    #[tokio::test]
    async fn bad_quiz_and_disk_failure_preserve_memory_disk_and_audit() {
        let state = state();
        let chloe = headers(&state, "emp-chloe").await;
        let before = serde_json::to_value(&*state.db.read().await).unwrap();
        let bytes = std::fs::read(state.data_dir.join("cfitness_state.json")).unwrap();
        let module = items(&fixture(), "training").remove(0);
        assert_eq!(
            action(
                &state,
                &chloe,
                "beynost",
                json!({"action":"answer_quiz","id":module["id"],"selectedOption":1})
            )
            .await
            .unwrap_err()
            .0,
            StatusCode::UNPROCESSABLE_ENTITY
        );
        std::fs::create_dir(state.data_dir.join("cfitness_state.json.tmp")).unwrap();
        assert_eq!(
            action(
                &state,
                &chloe,
                "beynost",
                json!({"action":"add_task","title":"Ne doit pas apparaître"})
            )
            .await
            .unwrap_err()
            .0,
            StatusCode::INTERNAL_SERVER_ERROR
        );
        assert_eq!(
            serde_json::to_value(&*state.db.read().await).unwrap(),
            before
        );
        assert_eq!(
            std::fs::read(state.data_dir.join("cfitness_state.json")).unwrap(),
            bytes
        );
        std::fs::remove_dir_all(&state.data_dir).unwrap();
    }

    #[tokio::test]
    async fn clock_commands_match_server_transitions_across_clubs_and_restart() {
        let state = state();
        let mario = headers(&state, "emp-mario").await;
        let all = ["arrivee", "debut_pause", "fin_pause", "depart"];
        for (next, expected) in [
            ("arrivee", vec!["arrivee"]),
            ("debut_pause", vec!["debut_pause", "depart"]),
            ("fin_pause", vec!["fin_pause"]),
            ("depart", vec!["debut_pause", "depart"]),
        ] {
            let before = get(&state, &mario, "carre-de-soie").await;
            assert_eq!(before["punchAvailability"]["allowedTypes"], json!(expected));
            for invalid in all.iter().filter(|kind| !expected.contains(kind)) {
                let disk = std::fs::read(state.data_dir.join("cfitness_state.json")).unwrap();
                assert_eq!(
                    action(
                        &state,
                        &mario,
                        "carre-de-soie",
                        json!({"action":"punch","punchType":invalid})
                    )
                    .await
                    .unwrap_err()
                    .0,
                    StatusCode::CONFLICT
                );
                assert_eq!(
                    std::fs::read(state.data_dir.join("cfitness_state.json")).unwrap(),
                    disk
                );
            }
            let result = action(
                &state,
                &mario,
                "carre-de-soie",
                json!({"action":"punch","punchType":next}),
            )
            .await
            .unwrap()
            .0;
            let other = get(&state, &mario, "beynost").await;
            if next != "depart" {
                assert_eq!(other["punchAvailability"]["allowedTypes"], json!([]));
                assert_eq!(other["punchAvailability"]["openClubId"], "carre-de-soie");
                assert_eq!(
                    action(
                        &state,
                        &mario,
                        "beynost",
                        json!({"action":"punch","punchType":"arrivee"})
                    )
                    .await
                    .unwrap_err()
                    .0,
                    StatusCode::CONFLICT
                );
            } else {
                assert_eq!(
                    other["punchAvailability"],
                    json!({"allowedTypes":["arrivee"],"openClubId":null})
                );
            }
            let loaded = load_or_init_state(&state.data_dir);
            assert_eq!(
                view(&loaded, "emp-mario", "carre-de-soie", "club-carre-soie")["punchAvailability"],
                result["punchAvailability"]
            );
        }
        let _ = action(
            &state,
            &mario,
            "beynost",
            json!({"action":"punch","punchType":"arrivee"}),
        )
        .await
        .unwrap();
        let before = get(&state, &mario, "beynost").await;
        std::fs::create_dir(state.data_dir.join("cfitness_state.json.tmp")).unwrap();
        assert_eq!(
            action(
                &state,
                &mario,
                "beynost",
                json!({"action":"punch","punchType":"depart"})
            )
            .await
            .unwrap_err()
            .0,
            StatusCode::INTERNAL_SERVER_ERROR
        );
        assert_eq!(get(&state, &mario, "beynost").await, before);
        std::fs::remove_dir_all(&state.data_dir).unwrap();
    }

    #[tokio::test]
    async fn punch_order_and_document_consent_are_not_automatic() {
        let state = state();
        let chloe = headers(&state, "emp-chloe").await;
        assert_eq!(
            action(
                &state,
                &chloe,
                "beynost",
                json!({"action":"punch","punchType":"depart"})
            )
            .await
            .unwrap_err()
            .0,
            StatusCode::CONFLICT
        );
        for kind in ["arrivee", "debut_pause", "fin_pause", "depart"] {
            let _ = action(
                &state,
                &chloe,
                "beynost",
                json!({"action":"punch","punchType":kind}),
            )
            .await
            .unwrap();
        }
        assert_eq!(
            get(&state, &chloe, "beynost").await["timeEntries"]
                .as_array()
                .unwrap()
                .len(),
            4
        );
        assert_eq!(
            action(
                &state,
                &chloe,
                "beynost",
                json!({"action":"acknowledge_demo_document","id":"missing","consent":false})
            )
            .await
            .unwrap_err()
            .0,
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            action(
                &state,
                &chloe,
                "beynost",
                json!({"action":"acknowledge_demo_document","id":"someone-else","consent":true})
            )
            .await
            .unwrap_err()
            .0,
            StatusCode::NOT_FOUND
        );
        std::fs::remove_dir_all(&state.data_dir).unwrap();
    }

    #[tokio::test]
    async fn revoked_leave_permission_and_header_only_identity_are_refused() {
        let state = state();
        let chloe = headers(&state, "emp-chloe").await;
        {
            let mut db = state.db.write().await;
            let profile_id = db
                .employees
                .iter()
                .find(|e| e.id == "emp-chloe")
                .unwrap()
                .site_accesses
                .iter()
                .find(|a| a.site_id == "club-beynost")
                .unwrap()
                .profile_id
                .clone();
            let profile = db.profiles.iter_mut().find(|p| p.id == profile_id).unwrap();
            profile
                .rows
                .iter_mut()
                .find(|r| r.action_id == "ORG04-19")
                .unwrap()
                .checked = Some(false);
        }
        assert_eq!(
            get(&state, &chloe, "beynost").await["canRequestLeave"],
            false
        );
        assert_eq!(action(&state,&chloe,"beynost",json!({"action":"request_leave","motive":"CP","startDate":"2027-05-01","endDate":"2027-05-02"})).await.unwrap_err().0,StatusCode::FORBIDDEN);
        let mut spoof = HeaderMap::new();
        spoof.insert("x-cfitness-actor-id", "emp-chloe".parse().unwrap());
        assert_eq!(
            get_workspace(State(state.clone()), Path("beynost".into()), spoof)
                .await
                .unwrap_err()
                .0,
            StatusCode::UNAUTHORIZED
        );
        std::fs::remove_dir_all(&state.data_dir).unwrap();
    }
}

pub async fn post_workspace_action(
    State(state): State<SharedState>,
    Path(raw): Path<String>,
    headers: HeaderMap,
    Json(action): Json<Action>,
) -> Result<Json<Value>, Failure> {
    let (club_id, site) = club(&raw)?;
    let actor = personal_actor(&state, &headers).await?;
    let mut db = state.db.write().await;
    if !can_access_site_scope(&db, &actor, site) {
        return Err(err_resp(StatusCode::FORBIDDEN, "Accès refusé à ce club."));
    }
    let mut next = db.clone();
    let mut data = person(&next, &actor);
    let now = Utc::now().to_rfc3339();
    let id = action.id.as_deref().unwrap_or("");
    let row_id = || format!("personal-{}", rand::random::<u128>());
    match action.action.as_str() {
        "add_task" => {
            let title = action.title.as_deref().unwrap_or("").trim();
            if title.is_empty() || title.chars().count() > 300 {
                return Err(bad("Indiquez une tâche de 1 à 300 caractères."));
            }
            let category = action.category.as_deref().unwrap_or("RH & Administratif");
            if ![
                "Accueil & TPV",
                "Relance CRM (ex-LEADS)",
                "Suivi Mywellness",
                "RH & Administratif",
            ]
            .contains(&category)
            {
                return Err(bad("Catégorie de tâche invalide."));
            }
            items_mut(&mut data,"tasks")?.push(json!({"id":row_id(),"employeeId":actor,"clubId":club_id,"title":title,"completed":false,"date":Utc::now().date_naive().to_string(),"category":category,"dueTime":"","priority":"Normale"}));
        }
        "set_task" | "read_notification" => {
            let key = if action.action == "set_task" {
                "tasks"
            } else {
                "notifications"
            };
            let row = items_mut(&mut data, key)?
                .iter_mut()
                .find(|r| r["id"] == id && (r["clubId"].is_null() || r["clubId"] == club_id))
                .ok_or_else(|| {
                    err_resp(
                        StatusCode::NOT_FOUND,
                        "Élément introuvable dans votre espace.",
                    )
                })?;
            if key == "tasks" {
                row["completed"] = json!(action
                    .completed
                    .ok_or_else(|| bad("État de la tâche requis."))?);
            } else {
                row["read"] = json!(true);
            }
        }
        "set_checklist" => {
            let mut rows = checklist(&next, club_id);
            let row = rows.iter_mut().find(|r| r["id"] == id).ok_or_else(|| {
                err_resp(StatusCode::NOT_FOUND, "Contrôle introuvable dans ce club.")
            })?;
            let done = action
                .completed
                .ok_or_else(|| bad("État du contrôle requis."))?;
            row["checkedBy"] = if done { json!(actor) } else { Value::Null };
            row["checkedAt"] = if done { json!(now) } else { Value::Null };
            next.personal_workspace
                .checklists
                .insert(club_id.into(), rows);
        }
        "answer_quiz" => {
            let module = items(&fixture(), "training")
                .into_iter()
                .find(|r| r["id"] == id)
                .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Formation introuvable."))?;
            let answer = action
                .selected_option
                .ok_or_else(|| bad("Sélectionnez une réponse."))?;
            if answer >= items(&module, "quizOptions").len() {
                return Err(bad("Réponse invalide."));
            }
            if module["quizCorrectIndex"].as_u64() != Some(answer as u64) {
                return Err(err_resp(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "Réponse incorrecte. Relisez la formation puis réessayez.",
                ));
            }
            let rows = items_mut(&mut data, "progress")?;
            rows.retain(|r| r["moduleId"] != id);
            rows.push(json!({"employeeId":actor,"moduleId":id,"completed":true,"scorePct":100,"completedAt":now}));
        }
        "cancel_leave" => {
            if !can_request_leave(&next, &actor, site) {
                return Err(err_resp(StatusCode::FORBIDDEN, "Votre profil ne permet pas de retirer une demande dans ce club."));
            }
            leave_withdrawal::apply(&mut next, &actor, site, id, action.comment.as_deref().unwrap_or(""))?;
        }
        "attach_leave_documents" => {
            if !can_request_leave(&next,&actor,site) {return Err(err_resp(StatusCode::FORBIDDEN,"Votre profil ne permet pas de joindre des justificatifs dans ce club."));}
            crate::hr_leave_policy::attach_documents(&mut next,&actor,site,id,action.document_ids.as_deref().unwrap_or(&[]),action.expected_revision.as_deref().unwrap_or(""))?;
        }
        "request_leave" => {
            if !can_request_leave(&next, &actor, site) {
                return Err(err_resp(
                    StatusCode::FORBIDDEN,
                    "Votre profil ne permet pas de demander une absence dans ce club.",
                ));
            }
            let start = action.start_date.as_deref().unwrap_or("");
            let end = action.end_date.as_deref().unwrap_or("");
            let parsed_start = NaiveDate::parse_from_str(start, "%Y-%m-%d")
                .map_err(|_| bad("Date de début invalide."))?;
            let parsed_end = NaiveDate::parse_from_str(end, "%Y-%m-%d")
                .map_err(|_| bad("Date de fin invalide."))?;
            if parsed_end < parsed_start || (parsed_end - parsed_start).num_days() > 366 {
                return Err(bad("La période d’absence est invalide."));
            }
            let motive = action.motive.as_deref().unwrap_or("");
            let details=crate::hr_leave_policy::prepare_request(&next,&actor,site,action.motive_id.as_deref(),motive,action.document_ids.as_deref().unwrap_or(&[]),start,end,action.start_period.as_deref().unwrap_or("am"),action.end_period.as_deref().unwrap_or("pm"))?;
            let display_motive=if action.motive_id.is_some(){details.motive_label_at_request.clone()}else{motive.to_string()};
            let comment = action.comment.unwrap_or_default();
            if comment.chars().count() > 1000 {
                return Err(bad("Commentaire trop long."));
            }
            let request_id=row_id();
            next.leave_policy.requests.insert(request_id.clone(),details);
            next.leave_requests.push(LeaveRequest {
                id: request_id,
                employee_id: actor.clone(),
                site_id: site.into(),
                motive: display_motive,
                start_date: start.into(),
                end_date: end.into(),
                status: "pending".into(),
                comment,
            });
        }
        "punch" => {
            if !crate::clock_policy::policy(&next, &actor, club_id).personal_allowed {
                return Err(err_resp(StatusCode::FORBIDDEN,"Le pointage depuis votre compte n’est pas autorisé dans ce club. Contactez votre responsable pour utiliser une pointeuse autorisée."));
            }
            let kind = action.punch_type.as_deref().unwrap_or("");
            let available = punch_availability(&data, club_id);
            let valid = available["allowedTypes"]
                .as_array()
                .unwrap()
                .iter()
                .any(|v| v == kind);
            if !valid {
                return Err(err_resp(
                    StatusCode::CONFLICT,
                    "Ce pointage ne suit pas le précédent. Vérifiez votre historique.",
                ));
            }
            let rows = items_mut(&mut data, "timeEntries")?;
            rows.push(json!({"id":row_id(),"employeeId":actor,"clubId":club_id,"timestamp":now,"type":kind,"source":"authenticated_personal"}));
        }
        "acknowledge_demo_document" => {
            if !is_demo_mode() {
                return Err(err_resp(
                    StatusCode::CONFLICT,
                    "Le fournisseur de signature réelle n’est pas configuré.",
                ));
            }
            if action.consent != Some(true) {
                return Err(bad("Votre confirmation explicite est requise."));
            }
            let row = items_mut(&mut data, "documents")?
                .iter_mut()
                .find(|r| r["id"] == id)
                .ok_or_else(|| {
                    err_resp(StatusCode::NOT_FOUND, "Document personnel introuvable.")
                })?;
            if row["acknowledgedAt"].is_string() {
                return Err(err_resp(
                    StatusCode::CONFLICT,
                    "Cette simulation est déjà confirmée.",
                ));
            }
            row["acknowledgedAt"] = json!(now);
            row["acknowledgementMode"] = json!("demo_only_not_qualified_signature");
        }
        _ => return Err(bad("Action personnelle inconnue.")),
    }
    next.personal_workspace.people.insert(actor.clone(), data);
    append_audit(
        &mut next,
        &actor,
        "PERSONAL_WORKSPACE_ACTION",
        action.action.clone(),
        site,
        id,
        None,
        None,
    );
    persist_state(&state.data_dir, &next).map_err(|_| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Enregistrement impossible. Aucun changement confirmé.",
        )
    })?;
    *db = next;
    Ok(Json(view(&db, &actor, club_id, site)))
}
