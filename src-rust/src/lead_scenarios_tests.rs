use super::*;
use crate::routes::SharedAppState;
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;

fn state() -> SharedState {
    let dir = std::env::temp_dir().join(format!("scenario-test-{}", rand::random::<u128>()));
    Arc::new(SharedAppState {
        db: RwLock::new(crate::seed::load_or_init_state(&dir)),
        data_dir: dir,
        sessions: RwLock::new(HashMap::new()),
        login_attempts: RwLock::new(HashMap::new()),
    })
}
async fn headers(s: &SharedState, emp: &str, op: &str) -> HeaderMap {
    let token = format!("test-{}", rand::random::<u128>());
    s.sessions
        .write()
        .await
        .insert(token.clone(), (emp.into(), Utc::now().timestamp() + 600));
    let mut h = HeaderMap::new();
    h.insert("authorization", format!("Bearer {token}").parse().unwrap());
    h.insert("x-cfitness-operation-id", op.parse().unwrap());
    h
}
fn definition() -> Definition {
    Definition {
        schema_version: 1,
        club_id: "carre-de-soie".into(),
        name: "Bienvenue".into(),
        mode: "manual".into(),
        active: false,
        enrollment_locked: false,
        conditions: None,
        steps: vec![
            Step {
                id: "email".into(),
                kind: "email".into(),
                enabled: true,
                delay: Delay {
                    amount: 0,
                    unit: "minutes".into(),
                },
                template_id: None,
                content: Some("Bienvenue %prenom%".into()),
                comment: "".into(),
            },
            Step {
                id: "call".into(),
                kind: "call_task".into(),
                enabled: true,
                delay: Delay {
                    amount: 5,
                    unit: "minutes".into(),
                },
                template_id: None,
                content: None,
                comment: "Appeler pour préparer la visite".into(),
            },
        ],
    }
}
fn setup(db: &mut AppDatabaseState, now: DateTime<Utc>) -> (String, LeadProspectRecord) {
    let p = db
        .lead_prospects
        .iter()
        .find(|p| p.club_id == "carre-de-soie")
        .unwrap()
        .clone();
    let mut p = p;
    p.id = "scenario-contact".into();
    p.assigned_to_id = Some("emp-maxime".into());
    p.rgpd_consent = true;
    p.email = "fictif@example.test".into();
    p.phone = "0600000000".into();
    p.is_archived = false;
    db.lead_prospects.push(p.clone());
    apply(
        db,
        "carre-de-soie",
        "emp-daniel",
        Command::Save {
            scenario_id: None,
            expected_revision: None,
            definition: definition(),
        },
        now,
    )
    .unwrap();
    let id = db.lead_scenarios.scenarios.last().unwrap().id.clone();
    apply(
        db,
        "carre-de-soie",
        "emp-daniel",
        Command::Publish {
            scenario_id: id.clone(),
            expected_revision: 1,
        },
        now,
    )
    .unwrap();
    apply(
        db,
        "carre-de-soie",
        "emp-daniel",
        Command::Status {
            scenario_id: id.clone(),
            expected_revision: 2,
            active: true,
            enrollment_locked: false,
        },
        now,
    )
    .unwrap();
    (id, p)
}
#[tokio::test]
async fn durable_versions_delays_locking_pause_and_task_idempotence() {
    let s = state();
    let now = Utc::now();
    let mut db = s.db.write().await;
    let (id, p) = setup(&mut db, now);
    let scenario = db.lead_scenarios.scenarios[0].clone();
    assert!(enroll(&mut db, &scenario, &p, now).unwrap());
    assert!(!enroll(&mut db, &scenario, &p, now).unwrap());
    assert!(process(&mut db, "carre-de-soie", now));
    assert_eq!(
        db.lead_scenarios.enrollments[0].history[0].status,
        "simulated"
    );
    assert!(!process(
        &mut db,
        "carre-de-soie",
        now + Duration::minutes(4)
    ));
    // Publishing v2 does not rewrite the enrollment snapshot/version.
    let mut changed = definition();
    changed.steps[1].comment = "Nouveau contenu v2".into();
    apply(
        &mut db,
        "carre-de-soie",
        "emp-daniel",
        Command::Save {
            scenario_id: Some(id.clone()),
            expected_revision: Some(3),
            definition: changed,
        },
        now,
    )
    .unwrap();
    apply(
        &mut db,
        "carre-de-soie",
        "emp-daniel",
        Command::Publish {
            scenario_id: id.clone(),
            expected_revision: 4,
        },
        now,
    )
    .unwrap();
    apply(
        &mut db,
        "carre-de-soie",
        "emp-daniel",
        Command::Status {
            scenario_id: id.clone(),
            expected_revision: 5,
            active: true,
            enrollment_locked: true,
        },
        now,
    )
    .unwrap();
    let locked = db.lead_scenarios.scenarios[0].clone();
    assert!(enroll(&mut db, &locked, &p, now).is_err());
    crate::seed::persist_state(&s.data_dir, &db).unwrap();
    let mut loaded = crate::seed::load_or_init_state(&s.data_dir);
    assert_eq!(loaded.lead_scenarios.enrollments[0].version, 1);
    assert!(process(
        &mut loaded,
        "carre-de-soie",
        now + Duration::minutes(5)
    ));
    assert!(!process(
        &mut loaded,
        "carre-de-soie",
        now + Duration::minutes(5)
    ));
    let tasks: Vec<_> = loaded
        .lead_activities
        .iter()
        .filter(|a| a.id.starts_with("scenario-task-"))
        .collect();
    assert_eq!(tasks.len(), 1);
    assert_eq!(tasks[0].title, "Appeler pour préparer la visite");
    assert_eq!(loaded.lead_scenarios.enrollments[0].status, "completed");
    drop(db);
    std::fs::remove_dir_all(&s.data_dir).unwrap();
}
#[tokio::test]
async fn commands_require_bearer_club_role_and_revision_and_preserve_disk_on_failure() {
    let s = state();
    let h = headers(&s, "emp-daniel", "create").await;
    let mk = || Command::Save {
        scenario_id: None,
        expected_revision: None,
        definition: definition(),
    };
    let err = command(
        State(s.clone()),
        Path("carre-de-soie".into()),
        HeaderMap::new(),
        Json(mk()),
    )
    .await
    .unwrap_err();
    assert_eq!(err.0, StatusCode::UNAUTHORIZED);
    let forbidden = headers(&s, "emp-chloe", "forbidden").await;
    assert_eq!(
        command(
            State(s.clone()),
            Path("carre-de-soie".into()),
            forbidden,
            Json(mk())
        )
        .await
        .unwrap_err()
        .0,
        StatusCode::FORBIDDEN
    );
    let _ = command(
        State(s.clone()),
        Path("carre-de-soie".into()),
        h.clone(),
        Json(mk()),
    )
    .await
    .unwrap();
    let _ = command(
        State(s.clone()),
        Path("carre-de-soie".into()),
        h,
        Json(mk()),
    )
    .await
    .unwrap();
    assert_eq!(s.db.read().await.lead_scenarios.scenarios.len(), 1);
    let h = headers(&s, "emp-daniel", "create").await;
    let mut different = definition();
    different.name = "Autre".into();
    assert_eq!(
        command(
            State(s.clone()),
            Path("carre-de-soie".into()),
            h,
            Json(Command::Save {
                scenario_id: None,
                expected_revision: None,
                definition: different
            })
        )
        .await
        .unwrap_err()
        .0,
        StatusCode::CONFLICT
    );
    let before = serde_json::to_value(&*s.db.read().await).unwrap();
    let disk = std::fs::read(s.data_dir.join("cfitness_state.json")).unwrap();
    std::fs::create_dir(s.data_dir.join("cfitness_state.json.tmp")).unwrap();
    let h = headers(&s, "emp-daniel", "disk-fail").await;
    assert_eq!(
        command(
            State(s.clone()),
            Path("carre-de-soie".into()),
            h,
            Json(mk())
        )
        .await
        .unwrap_err()
        .0,
        StatusCode::INTERNAL_SERVER_ERROR
    );
    assert_eq!(before, serde_json::to_value(&*s.db.read().await).unwrap());
    assert_eq!(
        disk,
        std::fs::read(s.data_dir.join("cfitness_state.json")).unwrap()
    );
    std::fs::remove_dir_all(&s.data_dir).unwrap();
}
#[tokio::test]
async fn inconsistent_restored_cursor_stops_without_panicking_or_creating_activity() {
    let s = state();
    let now = Utc::now();
    let mut db = s.db.write().await;
    let (_, p) = setup(&mut db, now);
    let scenario = db.lead_scenarios.scenarios[0].clone();
    enroll(&mut db, &scenario, &p, now).unwrap();
    db.lead_scenarios.enrollments[0].cursor = usize::MAX;
    let activity_count = db.lead_activities.len();
    assert!(process(&mut db, "carre-de-soie", now));
    assert_eq!(db.lead_scenarios.enrollments[0].status, "stopped");
    assert_eq!(
        db.lead_scenarios.enrollments[0].history[0].status,
        "stopped"
    );
    assert_eq!(db.lead_activities.len(), activity_count);
    drop(db);
    std::fs::remove_dir_all(&s.data_dir).unwrap();
}
#[tokio::test]
async fn automatic_conditions_consent_pause_revocation_and_cross_club() {
    let s = state();
    let now = Utc::now();
    let mut db = s.db.write().await;
    let (id, mut p) = setup(&mut db, now);
    let mut d = definition();
    d.mode = "automatic".into();
    d.conditions = Some(Conditions {
        status_ids: vec![p.stage.clone()],
        source_ids: vec![p.source.clone()],
        require_assigned_commercial: true,
    });
    db.lead_scenarios.scenarios[0].versions[0].definition = d;
    p.rgpd_consent = false;
    db.lead_prospects
        .iter_mut()
        .find(|x| x.id == p.id)
        .unwrap()
        .rgpd_consent = false;
    process(&mut db, "carre-de-soie", now);
    let e = db
        .lead_scenarios
        .enrollments
        .iter()
        .find(|e| e.prospect_id == p.id)
        .unwrap();
    assert_eq!(e.history[0].status, "skipped");
    assert!(db
        .lead_scenarios
        .enrollments
        .iter()
        .all(|e| e.club_id == "carre-de-soie"));
    apply(
        &mut db,
        "carre-de-soie",
        "emp-daniel",
        Command::Status {
            scenario_id: id.clone(),
            expected_revision: 3,
            active: false,
            enrollment_locked: false,
        },
        now,
    )
    .unwrap();
    let before = db
        .lead_scenarios
        .enrollments
        .iter()
        .map(|e| e.history.len())
        .sum::<usize>();
    process(&mut db, "carre-de-soie", now + Duration::minutes(10));
    assert_eq!(
        before,
        db.lead_scenarios
            .enrollments
            .iter()
            .map(|e| e.history.len())
            .sum::<usize>()
    );
    db.lead_scenarios.scenarios[0].active = true;
    db.employees
        .iter_mut()
        .find(|e| e.id == "emp-daniel")
        .unwrap()
        .active = false;
    process(&mut db, "carre-de-soie", now + Duration::minutes(10));
    assert_eq!(
        before,
        db.lead_scenarios
            .enrollments
            .iter()
            .map(|e| e.history.len())
            .sum::<usize>()
    );
    drop(db);
    std::fs::remove_dir_all(&s.data_dir).unwrap();
}
