use crate::clock_terminals::*;
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
    let data_dir =
        std::env::temp_dir().join(format!("terminal-integrity-{}", rand::random::<u128>()));
    let mut db = load_or_init_state(&data_dir);
    db.clock_terminals.push(ClockTerminal {
        id: "fixture-terminal".into(),
        site_id: "club-beynost".into(),
        room_id: "room-cours".into(),
        room_label: "Salle de cours fictive".into(),
        label: "Tablette fictive".into(),
        status: "active".into(),
        failed_pairing_attempts: 0,
        pairing_code: None,
        device_secret_hash: Some(hash_terminal_token("fixture-device")),
        created_at: chrono::Utc::now().to_rfc3339(),
        paired_at: None,
        last_seen_at: None,
    });
    db.personal_workspace
        .clock_policies
        .entry("emp-chloe".into())
        .or_default()
        .insert(
            "beynost".into(),
            crate::clock_policy::ClockPolicy {
                terminal_allowed: true,
                ..Default::default()
            },
        );
    Arc::new(SharedAppState {
        db: RwLock::new(db),
        data_dir,
        sessions: RwLock::new(HashMap::new()),
        login_attempts: RwLock::new(HashMap::new()),
    })
}
async fn employee(s: &SharedState, id: &str) -> HeaderMap {
    let token = format!("fixture-session-{}", rand::random::<u128>());
    s.sessions.write().await.insert(
        token.clone(),
        (id.into(), chrono::Utc::now().timestamp() + 3600),
    );
    let mut h = HeaderMap::new();
    h.insert("authorization", format!("Bearer {token}").parse().unwrap());
    h.insert(
        "x-cfitness-terminal-token",
        "fixture-device".parse().unwrap(),
    );
    h
}
async fn punch(
    s: &SharedState,
    h: &HeaderMap,
    kind: &str,
    photo: Option<&str>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    post_terminal_punch(
        State(s.clone()),
        h.clone(),
        Json(TerminalPunchPayload {
            employee_id: "emp-chloe".into(),
            punch_type: kind.into(),
            photo_proof: photo.map(str::to_string),
        }),
    )
    .await
}
#[tokio::test]
async fn terminal_needs_individual_identity_and_rejects_impersonation_without_mutation() {
    let s = state();
    let mut h = HeaderMap::new();
    h.insert(
        "x-cfitness-terminal-token",
        "fixture-device".parse().unwrap(),
    );
    let before = serde_json::to_value(&*s.db.read().await).unwrap();
    assert_eq!(
        punch(&s, &h, "arrivee", None).await.unwrap_err().0,
        StatusCode::UNAUTHORIZED
    );
    let admin = employee(&s, "emp-mario").await;
    assert_eq!(
        punch(&s, &admin, "arrivee", None).await.unwrap_err().0,
        StatusCode::FORBIDDEN
    );
    let mut missing_device = employee(&s, "emp-chloe").await;
    missing_device.remove("x-cfitness-terminal-token");
    assert_eq!(
        punch(&s, &missing_device, "arrivee", None)
            .await
            .unwrap_err()
            .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(serde_json::to_value(&*s.db.read().await).unwrap(), before);
    std::fs::remove_dir_all(&s.data_dir).unwrap();
}
#[tokio::test]
async fn terminal_cannot_claim_unstored_or_empty_photo_as_evidence() {
    let s = state();
    let h = employee(&s, "emp-chloe").await;
    let before = serde_json::to_value(&*s.db.read().await).unwrap();
    for photo in ["", "not-an-image", "data:image/jpeg;base64,fake"] {
        assert_eq!(
            punch(&s, &h, "arrivee", Some(photo)).await.unwrap_err().0,
            StatusCode::CONFLICT
        );
    }
    assert_eq!(serde_json::to_value(&*s.db.read().await).unwrap(), before);
    let data = punch(&s, &h, "arrivee", None).await.unwrap().0;
    assert_eq!(data["entry"]["photoProofPresent"], false);
    assert_eq!(data["photoCaptureAvailable"], false);
    std::fs::remove_dir_all(&s.data_dir).unwrap();
}
#[tokio::test]
async fn first_terminal_punch_preserves_personal_catalog_and_supports_followup_actions() {
    let s = state();
    let h = employee(&s, "emp-chloe").await;
    let initial = crate::personal_workspace::get_workspace(
        State(s.clone()),
        Path("beynost".into()),
        h.clone(),
    )
    .await
    .unwrap()
    .0;
    let _ = punch(&s, &h, "arrivee", None).await.unwrap();
    let after = crate::personal_workspace::get_workspace(
        State(s.clone()),
        Path("beynost".into()),
        h.clone(),
    )
    .await
    .unwrap()
    .0;
    for key in ["tasks", "notifications", "documents", "progress"] {
        assert_eq!(initial[key], after[key], "lost personal collection {key}");
    }
    let task = crate::personal_workspace::post_workspace_action(
        State(s.clone()),
        Path("beynost".into()),
        h,
        Json(
            serde_json::from_value(
                json!({"action":"add_task","title":"Après premier pointage tablette"}),
            )
            .unwrap(),
        ),
    )
    .await
    .unwrap()
    .0;
    assert!(task["tasks"]
        .as_array()
        .unwrap()
        .iter()
        .any(|r| r["title"] == "Après premier pointage tablette"));
    assert_eq!(task["timeEntries"].as_array().unwrap().len(), 1);
    std::fs::remove_dir_all(&s.data_dir).unwrap();
}
#[tokio::test]
async fn terminal_management_requires_real_bearer_and_does_not_reveal_pairing_code() {
    let s = state();
    let mut spoof = HeaderMap::new();
    spoof.insert("x-cfitness-actor-id", "emp-mario".parse().unwrap());
    spoof.insert("x-cfitness-site-id", "club-beynost".parse().unwrap());
    assert_eq!(
        get_club_terminals(State(s.clone()), Path("beynost".into()), spoof)
            .await
            .unwrap_err()
            .0,
        StatusCode::UNAUTHORIZED
    );
    let admin = employee(&s, "emp-mario").await;
    let created = post_create_terminal(
        State(s.clone()),
        Path("beynost".into()),
        admin.clone(),
        Json(CreateTerminalPayload {
            room_id: "room-b".into(),
            room_label: "Autre salle fictive".into(),
            label: "En attente".into(),
        }),
    )
    .await
    .unwrap()
    .0;
    assert!(created["pairingCode"].is_string());
    let rows = get_club_terminals(State(s.clone()), Path("beynost".into()), admin)
        .await
        .unwrap()
        .0;
    for row in rows["terminals"].as_array().unwrap() {
        assert!(row.get("pairingCode").is_none());
        assert!(row.get("deviceSecretHash").is_none());
    }
    std::fs::remove_dir_all(&s.data_dir).unwrap();
}
#[tokio::test]
async fn terminal_failure_revoke_and_club_changes_preserve_original_time_entry() {
    let s = state();
    let h = employee(&s, "emp-chloe").await;
    let first = punch(&s, &h, "arrivee", None).await.unwrap().0;
    let before = serde_json::to_value(&*s.db.read().await).unwrap();
    let disk = std::fs::read(s.data_dir.join("cfitness_state.json")).unwrap();
    std::fs::create_dir(s.data_dir.join("cfitness_state.json.tmp")).unwrap();
    assert_eq!(
        punch(&s, &h, "depart", None).await.unwrap_err().0,
        StatusCode::INTERNAL_SERVER_ERROR
    );
    assert_eq!(serde_json::to_value(&*s.db.read().await).unwrap(), before);
    assert_eq!(
        std::fs::read(s.data_dir.join("cfitness_state.json")).unwrap(),
        disk
    );
    std::fs::remove_dir(s.data_dir.join("cfitness_state.json.tmp")).unwrap();
    s.db.write().await.clock_terminals[0].site_id = "club-carre-soie".into();
    assert_eq!(
        punch(&s, &h, "depart", None).await.unwrap_err().0,
        StatusCode::FORBIDDEN
    );
    {
        let mut db = s.db.write().await;
        db.clock_terminals[0].site_id = "club-beynost".into();
        db.clock_terminals[0].status = "revoked".into();
    }
    assert_eq!(
        punch(&s, &h, "depart", None).await.unwrap_err().0,
        StatusCode::FORBIDDEN
    );
    let loaded = load_or_init_state(&s.data_dir);
    assert_eq!(
        loaded.personal_workspace.people["emp-chloe"]["timeEntries"][0],
        first["entry"]
    );
    std::fs::remove_dir_all(&s.data_dir).unwrap();
}
