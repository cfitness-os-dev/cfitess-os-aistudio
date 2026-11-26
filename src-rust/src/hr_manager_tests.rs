use crate::hr_manager::*;
use crate::models::LeaveRequest;
use crate::routes::{SharedAppState, SharedState};
use crate::seed::load_or_init_state;
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::Utc;
use serde_json::{json, Value};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;

fn state() -> SharedState {
    let data_dir = std::env::temp_dir().join(format!("hr-manager-{}", rand::random::<u128>()));
    Arc::new(SharedAppState {
        db: RwLock::new(load_or_init_state(&data_dir)),
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
    let mut h = HeaderMap::new();
    h.insert("authorization", format!("Bearer {token}").parse().unwrap());
    h
}
async fn leave(state: &SharedState, id: &str, employee: &str, site: &str) {
    state.db.write().await.leave_requests.push(LeaveRequest {
        id: id.into(),
        employee_id: employee.into(),
        site_id: site.into(),
        motive: "CP".into(),
        start_date: Utc::now().date_naive().to_string(),
        end_date: Utc::now().date_naive().to_string(),
        status: "pending".into(),
        comment: "Demande du salarié".into(),
    });
}
async fn punch(state: &SharedState, employee: &str, club: &str) -> Value {
    // This fixture tests review rights; pointage requires a separate explicit grant.
    state
        .db
        .write()
        .await
        .personal_workspace
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
    let h = headers(state, employee).await;
    crate::personal_workspace::post_workspace_action(
        State(state.clone()),
        Path(club.into()),
        h,
        Json(serde_json::from_value(json!({"action":"punch","punchType":"arrivee"})).unwrap()),
    )
    .await
    .unwrap()
    .0["timeEntries"][0]
        .clone()
}
async fn decide(
    state: &SharedState,
    h: &HeaderMap,
    club: &str,
    id: &str,
    status: &str,
    expected: &str,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let expected_revision = {
        let db = state.db.read().await;
        db.leave_requests
            .iter()
            .find(|row| row.id == id)
            .map(request_revision)
            .unwrap_or_default()
    };
    decide_request(
        State(state.clone()),
        Path((club.into(), id.into())),
        h.clone(),
        Json(Decision {
            status: status.into(),
            expected_status: expected.into(),
            expected_revision,
            note: "Recette du responsable".into(),
        }),
    )
    .await
}
async fn review(
    state: &SharedState,
    h: &HeaderMap,
    id: &str,
    version: Option<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    review_entry(
        State(state.clone()),
        Path(("beynost".into(), id.into())),
        h.clone(),
        Json(EntryReview {
            employee_id: "emp-chloe".into(),
            note: "Horaire vérifié, original conservé".into(),
            expected_version: version,
        }),
    )
    .await
}

#[tokio::test]
async fn decision_is_canonical_persistent_and_rejects_self_other_club_and_stale_status() {
    let s = state();
    let admin = headers(&s, "emp-mario").await;
    let chloe = headers(&s, "emp-chloe").await;
    leave(&s, "request-chloe", "emp-chloe", "club-beynost").await;
    assert_eq!(
        decide(
            &s,
            &chloe,
            "beynost",
            "request-chloe",
            "approved",
            "pending"
        )
        .await
        .unwrap_err()
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        decide(
            &s,
            &admin,
            "carre-de-soie",
            "request-chloe",
            "approved",
            "pending"
        )
        .await
        .unwrap_err()
        .0,
        StatusCode::NOT_FOUND
    );
    let data = decide(
        &s,
        &admin,
        "beynost",
        "request-chloe",
        "approved",
        "pending",
    )
    .await
    .unwrap()
    .0;
    assert!(data["requests"]
        .as_array()
        .unwrap()
        .iter()
        .any(|r| r["id"] == "request-chloe" && r["status"] == "approved"));
    assert_eq!(
        decide(
            &s,
            &admin,
            "beynost",
            "request-chloe",
            "rejected",
            "pending"
        )
        .await
        .unwrap_err()
        .0,
        StatusCode::CONFLICT
    );
    let own =
        crate::personal_workspace::get_workspace(State(s.clone()), Path("beynost".into()), chloe)
            .await
            .unwrap()
            .0;
    assert!(own["leaves"]
        .as_array()
        .unwrap()
        .iter()
        .any(|r| r["id"] == "request-chloe" && r["status"] == "approved"));
    let loaded = load_or_init_state(&s.data_dir);
    assert!(loaded.leave_requests.iter().any(|r| r.id == "request-chloe"
        && r.status == "approved"
        && r.comment.starts_with("Demande du salarié")));
    std::fs::remove_dir_all(&s.data_dir).unwrap();
}

#[tokio::test]
async fn notes_preserve_original_timestamp_are_visible_to_employee_and_require_current_version() {
    let s = state();
    let admin = headers(&s, "emp-mario").await;
    let chloe = headers(&s, "emp-chloe").await;
    let entry = punch(&s, "emp-chloe", "beynost").await;
    let id = entry["id"].as_str().unwrap();
    assert_eq!(
        review(&s, &chloe, id, None).await.unwrap_err().0,
        StatusCode::FORBIDDEN
    );
    let data = review(&s, &admin, id, None).await.unwrap().0;
    let row = data["timeEntries"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["id"] == id)
        .unwrap();
    assert_eq!(row["timestamp"], entry["timestamp"]);
    assert_eq!(row["type"], entry["type"]);
    assert!(row["review"]["version"].is_string());
    assert_eq!(
        review(&s, &admin, id, None).await.unwrap_err().0,
        StatusCode::CONFLICT
    );
    let own =
        crate::personal_workspace::get_workspace(State(s.clone()), Path("beynost".into()), chloe)
            .await
            .unwrap()
            .0;
    assert_eq!(
        own["timeEntries"][0]["review"]["note"],
        "Horaire vérifié, original conservé"
    );
    assert!(serde_json::from_value::<EntryReview>(
        json!({"employeeId":"emp-chloe","note":"x","timestamp":"fake"})
    )
    .is_err());
    std::fs::remove_dir_all(&s.data_dir).unwrap();
}

#[tokio::test]
async fn team_management_is_distinct_from_membership_and_limits_reads_and_decisions() {
    let s = state();
    {
        let mut db = s.db.write().await;
        let mut profile = db.profiles[0].clone();
        profile.id = "test-managed-team".into();
        profile.scope_selected = "teams".into();
        for row in &mut profile.rows {
            row.exposed = true;
            row.disabled = Some(false);
            row.checked = Some(true);
        }
        db.profiles.push(profile);
        for employee in &mut db.employees {
            if let Some(access) = employee
                .site_accesses
                .iter_mut()
                .find(|a| a.site_id == "club-carre-soie")
            {
                match employee.id.as_str() {
                    "emp-sarah" => {
                        access.profile_id = "test-managed-team".into();
                        access.team_ids = vec!["other".into()];
                        access.managed_team_ids = vec!["managed".into()];
                    }
                    "emp-maxime" => access.team_ids = vec!["managed".into()],
                    "emp-karim" => access.team_ids = vec!["other".into()],
                    _ => {}
                }
            }
        }
    }
    leave(&s, "team-yes", "emp-maxime", "club-carre-soie").await;
    leave(&s, "team-no", "emp-karim", "club-carre-soie").await;
    let _ = punch(&s, "emp-maxime", "carre-de-soie").await;
    let _ = punch(&s, "emp-karim", "carre-de-soie").await;
    let manager = headers(&s, "emp-sarah").await;
    let data = get_workspace(
        State(s.clone()),
        Path("carre-de-soie".into()),
        manager.clone(),
    )
    .await
    .unwrap()
    .0;
    assert!(data["requests"]
        .as_array()
        .unwrap()
        .iter()
        .any(|r| r["id"] == "team-yes"));
    assert!(data["requests"]
        .as_array()
        .unwrap()
        .iter()
        .all(|r| r["id"] != "team-no"));
    assert!(data["timeEntries"]
        .as_array()
        .unwrap()
        .iter()
        .any(|r| r["employeeId"] == "emp-maxime"));
    assert!(data["timeEntries"]
        .as_array()
        .unwrap()
        .iter()
        .all(|r| r["employeeId"] != "emp-karim"));
    assert_eq!(
        decide(
            &s,
            &manager,
            "carre-de-soie",
            "team-no",
            "approved",
            "pending"
        )
        .await
        .unwrap_err()
        .0,
        StatusCode::FORBIDDEN
    );
    let _ = decide(
        &s,
        &manager,
        "carre-de-soie",
        "team-yes",
        "approved",
        "pending",
    )
    .await
    .unwrap();
    std::fs::remove_dir_all(&s.data_dir).unwrap();
}

#[tokio::test]
async fn persistence_failure_keeps_requests_entries_and_audit_unchanged() {
    let s = state();
    let admin = headers(&s, "emp-mario").await;
    leave(&s, "failure", "emp-chloe", "club-beynost").await;
    let entry = punch(&s, "emp-chloe", "beynost").await;
    let before = serde_json::to_value(&*s.db.read().await).unwrap();
    let disk = std::fs::read(s.data_dir.join("cfitness_state.json")).unwrap();
    std::fs::create_dir(s.data_dir.join("cfitness_state.json.tmp")).unwrap();
    assert_eq!(
        decide(&s, &admin, "beynost", "failure", "approved", "pending")
            .await
            .unwrap_err()
            .0,
        StatusCode::INTERNAL_SERVER_ERROR
    );
    assert_eq!(
        review(&s, &admin, entry["id"].as_str().unwrap(), None)
            .await
            .unwrap_err()
            .0,
        StatusCode::INTERNAL_SERVER_ERROR
    );
    assert_eq!(serde_json::to_value(&*s.db.read().await).unwrap(), before);
    assert_eq!(
        std::fs::read(s.data_dir.join("cfitness_state.json")).unwrap(),
        disk
    );
    std::fs::remove_dir_all(&s.data_dir).unwrap();
}

#[tokio::test]
async fn only_approved_absences_in_the_active_club_affect_commercial_assignment() {
    let s = state();
    leave(&s, "available", "emp-maxime", "club-carre-soie").await;
    let mut db = s.db.write().await;
    db.lead_prospects.clear();
    assert_eq!(
        crate::routes::resolve_available_commercial_for_club(&db, "carre-de-soie"),
        "emp-maxime"
    );
    db.leave_requests
        .iter_mut()
        .find(|r| r.id == "available")
        .unwrap()
        .status = "approved".into();
    assert_ne!(
        crate::routes::resolve_available_commercial_for_club(&db, "carre-de-soie"),
        "emp-maxime"
    );
    let row = db
        .leave_requests
        .iter_mut()
        .find(|r| r.id == "available")
        .unwrap();
    row.site_id = "club-beynost".into();
    assert_eq!(
        crate::routes::resolve_available_commercial_for_club(&db, "carre-de-soie"),
        "emp-maxime"
    );
    drop(db);
    std::fs::remove_dir_all(&s.data_dir).unwrap();
}
