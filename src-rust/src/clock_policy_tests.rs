use crate::clock_policy::*;
use crate::routes::{SharedAppState, SharedState};
use crate::seed::load_or_init_state;
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde_json::{json, Value};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;
fn state() -> SharedState {
    let data_dir = std::env::temp_dir().join(format!("clock-policy-{}", rand::random::<u128>()));
    Arc::new(SharedAppState {
        db: RwLock::new(load_or_init_state(&data_dir)),
        data_dir,
        sessions: RwLock::new(HashMap::new()),
        login_attempts: RwLock::new(HashMap::new()),
    })
}
async fn headers(s: &SharedState, actor: &str) -> HeaderMap {
    let token = format!("fixture-{}", rand::random::<u128>());
    s.sessions.write().await.insert(
        token.clone(),
        (actor.into(), chrono::Utc::now().timestamp() + 3600),
    );
    let mut h = HeaderMap::new();
    h.insert("authorization", format!("Bearer {token}").parse().unwrap());
    h
}
async fn set(
    s: &SharedState,
    h: &HeaderMap,
    employee: &str,
    club: &str,
    allowed: bool,
    revision: Option<&str>,
    reason: &str,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    put_policy(
        State(s.clone()),
        Path((club.into(), employee.into())),
        h.clone(),
        Json(UpdatePolicy {
            personal_allowed: allowed,
            terminal_allowed: true,
            expected_revision: revision.map(str::to_string),
            reason: reason.into(),
        }),
    )
    .await
}
async fn own(s: &SharedState, h: &HeaderMap, club: &str) -> Value {
    crate::personal_workspace::get_workspace(State(s.clone()), Path(club.into()), h.clone())
        .await
        .unwrap()
        .0
}
async fn punch(
    s: &SharedState,
    h: &HeaderMap,
    club: &str,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    crate::personal_workspace::post_workspace_action(
        State(s.clone()),
        Path(club.into()),
        h.clone(),
        Json(serde_json::from_value(json!({"action":"punch","punchType":"arrivee"})).unwrap()),
    )
    .await
}
#[tokio::test]
async fn default_deny_explicit_per_club_grant_revocation_restart_and_no_admin_exemption() {
    let s = state();
    let mario = headers(&s, "emp-mario").await;
    let daniel = headers(&s, "emp-daniel").await;
    assert_eq!(
        punch(&s, &mario, "beynost").await.unwrap_err().0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        own(&s, &mario, "beynost").await["punchAvailability"]["allowedTypes"],
        json!([])
    );
    assert_eq!(
        set(&s, &mario, "emp-mario", "beynost", true, None, "Auto")
            .await
            .unwrap_err()
            .0,
        StatusCode::FORBIDDEN
    );
    let _ = set(
        &s,
        &daniel,
        "emp-mario",
        "beynost",
        true,
        None,
        "Mission autorisée",
    )
    .await
    .unwrap();
    assert_eq!(
        own(&s, &mario, "beynost").await["clockingPolicy"]["personalAllowed"],
        true
    );
    assert_eq!(
        punch(&s, &mario, "carre-de-soie").await.unwrap_err().0,
        StatusCode::FORBIDDEN
    );
    let loaded = load_or_init_state(&s.data_dir);
    assert!(policy(&loaded, "emp-mario", "beynost").personal_allowed);
    let row = punch(&s, &mario, "beynost").await.unwrap().0;
    assert_eq!(row["timeEntries"].as_array().unwrap().len(), 1);
    let revision = policy(&*s.db.read().await, "emp-mario", "beynost").revision;
    let _ = set(
        &s,
        &daniel,
        "emp-mario",
        "beynost",
        false,
        Some(&revision),
        "Fin de mission",
    )
    .await
    .unwrap();
    assert_eq!(
        punch(&s, &mario, "beynost").await.unwrap_err().0,
        StatusCode::FORBIDDEN
    );
    let history = own(&s, &mario, "beynost").await;
    assert_eq!(history["timeEntries"].as_array().unwrap().len(), 1);
    assert_eq!(history["clockingPolicy"]["terminalReady"], false);
    assert_eq!(history["clockingPolicy"]["terminalAllowed"], true);
    assert_eq!(
        set(
            &s,
            &daniel,
            "emp-mario",
            "beynost",
            true,
            Some(&revision),
            "Ancien écran"
        )
        .await
        .unwrap_err()
        .0,
        StatusCode::CONFLICT
    );
    std::fs::remove_dir_all(&s.data_dir).unwrap();
}
#[tokio::test]
async fn policy_auth_scope_reason_and_disk_failure_preserve_state_and_audit() {
    let s = state();
    let admin = headers(&s, "emp-mario").await;
    let chloe = headers(&s, "emp-chloe").await;
    assert_eq!(
        get_policies(State(s.clone()), Path("beynost".into()), HeaderMap::new())
            .await
            .unwrap_err()
            .0,
        StatusCode::UNAUTHORIZED
    );
    let mut spoof = HeaderMap::new();
    spoof.insert("x-cfitness-actor-id", "emp-mario".parse().unwrap());
    assert_eq!(
        get_policies(State(s.clone()), Path("beynost".into()), spoof)
            .await
            .unwrap_err()
            .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        get_policies(State(s.clone()), Path("beynost".into()), chloe.clone())
            .await
            .unwrap_err()
            .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        set(&s, &chloe, "emp-mario", "beynost", true, None, "x")
            .await
            .unwrap_err()
            .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        set(&s, &admin, "emp-chloe", "carre-de-soie", true, None, "x")
            .await
            .unwrap_err()
            .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        set(&s, &admin, "emp-chloe", "unknown", true, None, "x")
            .await
            .unwrap_err()
            .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        set(&s, &admin, "emp-chloe", "beynost", true, None, " ")
            .await
            .unwrap_err()
            .0,
        StatusCode::BAD_REQUEST
    );
    assert!(serde_json::from_value::<UpdatePolicy>(
        json!({"personalAllowed":true,"terminalAllowed":true,"reason":"x","actorId":"emp-mario"})
    )
    .is_err());
    let before = serde_json::to_value(&*s.db.read().await).unwrap();
    let disk = std::fs::read(s.data_dir.join("cfitness_state.json")).unwrap();
    std::fs::create_dir(s.data_dir.join("cfitness_state.json.tmp")).unwrap();
    assert_eq!(
        set(
            &s,
            &admin,
            "emp-chloe",
            "beynost",
            true,
            None,
            "Autorisation"
        )
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
    assert_eq!(
        punch(&s, &chloe, "beynost").await.unwrap_err().0,
        StatusCode::FORBIDDEN
    );
    std::fs::remove_dir_all(&s.data_dir).unwrap();
}
#[tokio::test]
async fn managed_teams_determine_targets_not_simple_membership() {
    let s = state();
    {
        let mut db = s.db.write().await;
        let mut profile = db.profiles[0].clone();
        profile.id = "policy-test-teams".into();
        profile.scope_selected = "teams".into();
        for row in &mut profile.rows {
            row.exposed = true;
            row.disabled = Some(false);
            row.checked = Some(true);
        }
        db.profiles.push(profile);
        for e in &mut db.employees {
            if let Some(a) = e
                .site_accesses
                .iter_mut()
                .find(|a| a.site_id == "club-carre-soie")
            {
                match e.id.as_str() {
                    "emp-sarah" => {
                        a.profile_id = "policy-test-teams".into();
                        a.team_ids = vec!["other".into()];
                        a.managed_team_ids = vec!["managed".into()];
                    }
                    "emp-maxime" => a.team_ids = vec!["managed".into()],
                    "emp-karim" => a.team_ids = vec!["other".into()],
                    _ => {}
                }
            }
        }
    }
    let sarah = headers(&s, "emp-sarah").await;
    let result = get_policies(
        State(s.clone()),
        Path("carre-de-soie".into()),
        sarah.clone(),
    )
    .await
    .unwrap()
    .0;
    assert!(result["rows"]
        .as_array()
        .unwrap()
        .iter()
        .any(|r| r["employeeId"] == "emp-maxime"));
    assert!(!result["rows"]
        .as_array()
        .unwrap()
        .iter()
        .any(|r| r["employeeId"] == "emp-karim"));
    let _ = set(
        &s,
        &sarah,
        "emp-maxime",
        "carre-de-soie",
        true,
        None,
        "Équipe gérée",
    )
    .await
    .unwrap();
    assert_eq!(
        set(
            &s,
            &sarah,
            "emp-karim",
            "carre-de-soie",
            true,
            None,
            "Même équipe seulement"
        )
        .await
        .unwrap_err()
        .0,
        StatusCode::FORBIDDEN
    );
    std::fs::remove_dir_all(&s.data_dir).unwrap();
}
