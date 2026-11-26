use super::*;
use crate::routes::SharedAppState;
use crate::seed::load_or_init_state_with_mode;
use std::sync::Arc;
use tokio::sync::RwLock;
fn state() -> SharedState {
    let dir = std::env::temp_dir().join(format!("rh-scheduled-{}", rand::random::<u128>()));
    Arc::new(SharedAppState {
        db: RwLock::new(load_or_init_state_with_mode(&dir, true)),
        data_dir: dir,
        sessions: RwLock::new(HashMap::new()),
        login_attempts: RwLock::new(HashMap::new()),
    })
}
async fn headers(s: &SharedState, who: &str) -> HeaderMap {
    let token = random_token();
    s.sessions
        .write()
        .await
        .insert(token.clone(), (who.into(), Utc::now().timestamp() + 3600));
    let mut h = HeaderMap::new();
    h.insert("authorization", format!("Bearer {token}").parse().unwrap());
    h
}
fn command(op: &str) -> Schedule {
    Schedule {
        operation_id: op.into(),
        subject: "Consigne".into(),
        body: "Préparer le cours".into(),
        recipient_ids: vec!["emp-chloe".into()],
        scheduled_at: Utc::now() + Duration::hours(2),
    }
}
async fn schedule(s: &SharedState, h: &HeaderMap, c: Schedule) -> Result<Json<Value>, Failure> {
    create(State(s.clone()), Path("beynost".into()), h.clone(), Json(c)).await
}
fn notifications(db: &AppDatabaseState) -> usize {
    crate::personal_workspace::person(db, "emp-chloe")["notifications"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|r| r["rhMessageId"].is_string())
        .count()
}
#[tokio::test]
async fn scheduling_validates_dates_session_club_recipients_and_retries() {
    let s = state();
    let h = headers(&s, "emp-mario").await;
    assert_eq!(
        schedule(&s, &HeaderMap::new(), command("schedule-test-0001"))
            .await
            .unwrap_err()
            .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        schedule(
            &s,
            &headers(&s, "emp-chloe").await,
            command("schedule-test-0001")
        )
        .await
        .unwrap_err()
        .0,
        StatusCode::FORBIDDEN
    );
    for date in [Utc::now(), Utc::now() + Duration::days(367)] {
        let mut c = command("schedule-test-0001");
        c.scheduled_at = date;
        assert_eq!(
            schedule(&s, &h, c).await.unwrap_err().0,
            StatusCode::BAD_REQUEST
        );
    }
    let mut c = command("schedule-test-0001");
    c.recipient_ids.push("unknown".into());
    assert_eq!(
        schedule(&s, &h, c).await.unwrap_err().0,
        StatusCode::FORBIDDEN
    );
    let date = command("schedule-test-0001").scheduled_at;
    let mut c = command("schedule-test-0001");
    c.scheduled_at = date;
    let first = schedule(&s, &h, c).await.unwrap().0;
    let mut c = command("schedule-test-0001");
    c.scheduled_at = date;
    assert_eq!(
        schedule(&s, &h, c).await.unwrap().0["scheduledMessageId"],
        first["scheduledMessageId"]
    );
    let mut c = command("schedule-test-0001");
    c.scheduled_at = date;
    c.subject = "Autre".into();
    assert_eq!(
        schedule(&s, &h, c).await.unwrap_err().0,
        StatusCode::CONFLICT
    );
    let db = s.db.read().await;
    assert_eq!(notifications(&db), 0);
    assert!(db.personal_workspace.collaboration.messages.is_empty());
}
#[tokio::test]
async fn due_publication_is_atomic_once_and_survives_restart() {
    let s = state();
    let h = headers(&s, "emp-mario").await;
    let _ = schedule(&s, &h, command("schedule-test-0002"))
        .await
        .unwrap();
    let due = Utc::now() + Duration::hours(3);
    assert_eq!(dispatch_due(&s, Utc::now()).await.unwrap(), 0);
    let (a, b) = tokio::join!(dispatch_due(&s, due), dispatch_due(&s, due));
    assert_eq!(a.unwrap() + b.unwrap(), 1);
    let db = s.db.read().await;
    assert_eq!(notifications(&db), 1);
    assert_eq!(db.personal_workspace.collaboration.messages.len(), 1);
    let row = &db.personal_workspace.collaboration.scheduled_messages[0];
    assert_eq!(row.status, "published");
    assert!(row.published_message_id.is_some());
    let reloaded = load_or_init_state_with_mode(&s.data_dir, true);
    assert_eq!(
        serde_json::to_value(&*db).unwrap(),
        serde_json::to_value(reloaded).unwrap()
    );
}
#[tokio::test]
async fn cancellation_is_owned_club_scoped_idempotent_and_never_dispatches() {
    let s = state();
    let h = headers(&s, "emp-mario").await;
    let value = schedule(&s, &h, command("schedule-test-0003"))
        .await
        .unwrap()
        .0;
    let id = value["scheduledMessageId"].as_str().unwrap();
    let other = headers(&s, "emp-daniel").await;
    assert_eq!(
        cancel(State(s.clone()), Path(("beynost".into(), id.into())), other)
            .await
            .unwrap_err()
            .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        cancel(
            State(s.clone()),
            Path(("carre-de-soie".into(), id.into())),
            h.clone()
        )
        .await
        .unwrap_err()
        .0,
        StatusCode::NOT_FOUND
    );
    let _ = cancel(
        State(s.clone()),
        Path(("beynost".into(), id.into())),
        h.clone(),
    )
    .await
    .unwrap();
    let audit = s.db.read().await.audit_log.len();
    let _ = cancel(State(s.clone()), Path(("beynost".into(), id.into())), h)
        .await
        .unwrap();
    assert_eq!(s.db.read().await.audit_log.len(), audit);
    assert_eq!(
        dispatch_due(&s, Utc::now() + Duration::hours(3))
            .await
            .unwrap(),
        0
    );
    assert_eq!(notifications(&*s.db.read().await), 0);
}
#[tokio::test]
async fn revoked_publisher_or_one_recipient_blocks_entire_audience() {
    for revoke_author in [true, false] {
        let s = state();
        let h = headers(&s, "emp-mario").await;
        let mut c = command("schedule-test-0004");
        c.recipient_ids.push("emp-mario".into());
        let _ = schedule(&s, &h, c).await.unwrap();
        {
            let mut db = s.db.write().await;
            let employee = db
                .employees
                .iter_mut()
                .find(|e| {
                    e.id == if revoke_author {
                        "emp-mario"
                    } else {
                        "emp-chloe"
                    }
                })
                .unwrap();
            employee
                .site_accesses
                .retain(|a| a.site_id != "club-beynost");
        }
        assert_eq!(
            dispatch_due(&s, Utc::now() + Duration::hours(3))
                .await
                .unwrap(),
            1
        );
        let db = s.db.read().await;
        assert_eq!(
            db.personal_workspace.collaboration.scheduled_messages[0].status,
            "blocked"
        );
        assert_eq!(notifications(&db), 0);
        assert!(db.personal_workspace.collaboration.messages.is_empty());
    }
}
#[tokio::test]
async fn disk_failure_rolls_back_creation_cancellation_and_dispatch() {
    let s = state();
    let h = headers(&s, "emp-mario").await;
    let value = schedule(&s, &h, command("schedule-test-0005"))
        .await
        .unwrap()
        .0;
    let id = value["scheduledMessageId"].as_str().unwrap();
    let before = serde_json::to_value(&*s.db.read().await).unwrap();
    let disk = std::fs::read(s.data_dir.join("cfitness_state.json")).unwrap();
    let blocker = s.data_dir.join("cfitness_state.json.tmp");
    std::fs::create_dir(&blocker).unwrap();
    assert_eq!(
        schedule(&s, &h, command("schedule-test-0006"))
            .await
            .unwrap_err()
            .0,
        StatusCode::INTERNAL_SERVER_ERROR
    );
    assert_eq!(
        cancel(
            State(s.clone()),
            Path(("beynost".into(), id.into())),
            h.clone()
        )
        .await
        .unwrap_err()
        .0,
        StatusCode::INTERNAL_SERVER_ERROR
    );
    assert_eq!(
        dispatch_due(&s, Utc::now() + Duration::hours(3))
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
    std::fs::remove_dir(blocker).unwrap();
    assert_eq!(
        dispatch_due(&s, Utc::now() + Duration::hours(3))
            .await
            .unwrap(),
        1
    );
}
#[tokio::test]
async fn malformed_recipient_inbox_cannot_leave_partial_delivery() {
    let s = state();
    let h = headers(&s, "emp-mario").await;
    let mut c = command("schedule-test-0007");
    c.recipient_ids.push("emp-mario".into());
    let _ = schedule(&s, &h, c).await.unwrap();
    {
        let mut db = s.db.write().await;
        let mut person = crate::personal_workspace::person(&db, "emp-mario");
        person["notifications"] = json!("invalid");
        db.personal_workspace
            .people
            .insert("emp-mario".into(), person);
    }
    dispatch_due(&s, Utc::now() + Duration::hours(3))
        .await
        .unwrap();
    let db = s.db.read().await;
    assert_eq!(notifications(&db), 0);
    assert!(db.personal_workspace.collaboration.messages.is_empty());
    assert_eq!(
        db.personal_workspace.collaboration.scheduled_messages[0].status,
        "blocked"
    );
}
#[tokio::test]
async fn lists_are_own_paginated_and_isolated_by_club() {
    let s = state();
    let h = headers(&s, "emp-mario").await;
    let _ = schedule(&s, &h, command("schedule-test-0008"))
        .await
        .unwrap();
    let mut db = s.db.write().await;
    let template = db.personal_workspace.collaboration.scheduled_messages[0].clone();
    for i in 0..52 {
        let mut r = template.clone();
        r.id = format!("row-{i}");
        db.personal_workspace
            .collaboration
            .scheduled_messages
            .push(r);
    }
    let first = view(&db, "emp-mario", "beynost", None).unwrap();
    assert_eq!(first["scheduledMessages"].as_array().unwrap().len(), 50);
    let second = view(&db, "emp-mario", "beynost", first["nextCursor"].as_str()).unwrap();
    assert_eq!(second["scheduledMessages"].as_array().unwrap().len(), 3);
    assert!(
        view(&db, "emp-mario", "carre-de-soie", None).unwrap()["scheduledMessages"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert!(view(
        &db,
        "emp-mario",
        "carre-de-soie",
        first["nextCursor"].as_str()
    )
    .is_err());
}
