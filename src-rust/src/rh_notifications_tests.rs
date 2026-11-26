use super::*;
use crate::{routes::SharedAppState, seed::load_or_init_state_with_mode};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;
fn state() -> SharedState {
    let dir = std::env::temp_dir().join(format!("notifications-{}", rand::random::<u128>()));
    Arc::new(SharedAppState {
        db: RwLock::new(load_or_init_state_with_mode(&dir, true)),
        data_dir: dir,
        sessions: RwLock::new(HashMap::new()),
        login_attempts: RwLock::new(HashMap::new()),
    })
}
async fn headers(s: &SharedState, actor: &str) -> HeaderMap {
    let token = format!("test-{}", rand::random::<u128>());
    s.sessions
        .write()
        .await
        .insert(token.clone(), (actor.into(), Utc::now().timestamp() + 3600));
    let mut h = HeaderMap::new();
    h.insert("authorization", format!("Bearer {token}").parse().unwrap());
    h
}
async fn fixture(s: &SharedState, n: usize) {
    let mut db = s.db.write().await;
    let mut person = crate::personal_workspace::person(&db, "emp-chloe");
    person["notifications"] = json!([]);
    db.personal_workspace
        .people
        .insert("emp-chloe".into(), person);
    for i in 0..n {
        add(
            &mut db,
            "emp-chloe",
            "beynost",
            &format!("event-{i}"),
            "Information",
            "Message fictif",
            "rh_message",
            "notifications",
        )
        .unwrap();
    }
}
async fn mark(s: &SharedState, h: &HeaderMap, ids: Vec<String>) -> Result<Json<Value>, Failure> {
    read(
        State(s.clone()),
        Path("beynost".into()),
        Query(Page::default()),
        h.clone(),
        Json(Read { ids }),
    )
    .await
}
#[tokio::test]
async fn own_inbox_rejects_missing_session_club_and_cross_user_ids() {
    let s = state();
    fixture(&s, 1).await;
    let chloe = headers(&s, "emp-chloe").await;
    let mario = headers(&s, "emp-mario").await;
    assert_eq!(
        get(
            State(s.clone()),
            Path("beynost".into()),
            Query(Page::default()),
            HeaderMap::new()
        )
        .await
        .unwrap_err()
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        get(
            State(s.clone()),
            Path("carre-de-soie".into()),
            Query(Page::default()),
            chloe
        )
        .await
        .unwrap_err()
        .0,
        StatusCode::FORBIDDEN
    );
    let id = rows(&*s.db.read().await, "emp-chloe", "beynost").unwrap()[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    assert_eq!(
        mark(&s, &mario, vec![id]).await.unwrap_err().0,
        StatusCode::NOT_FOUND
    );
}
#[tokio::test]
async fn actual_count_and_batch_read_survive_reload_with_first_read_preserved() {
    let s = state();
    fixture(&s, 3).await;
    let h = headers(&s, "emp-chloe").await;
    let initial = view(
        &*s.db.read().await,
        "emp-chloe",
        "beynost",
        &Page::default(),
    )
    .unwrap();
    let ids = initial["notifications"]
        .as_array()
        .unwrap()
        .iter()
        .map(|n| n["id"].as_str().unwrap().to_string())
        .collect();
    let marked = mark(&s, &h, ids).await.unwrap().0;
    assert_eq!(marked["unreadCount"], 0);
    let first = marked["notifications"][0]["readAt"].clone();
    assert!(first.is_string());
    let id = marked["notifications"][0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let _ = mark(&s, &h, vec![id]).await.unwrap();
    let loaded = load_or_init_state_with_mode(&s.data_dir, true);
    assert_eq!(
        view(&loaded, "emp-chloe", "beynost", &Page::default()).unwrap()["notifications"][0]
            ["readAt"],
        first
    );
}
#[tokio::test]
async fn mixed_batch_and_disk_failure_never_mark_any_notification_read() {
    let s = state();
    fixture(&s, 1).await;
    let h = headers(&s, "emp-chloe").await;
    let id = rows(&*s.db.read().await, "emp-chloe", "beynost").unwrap()[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    assert_eq!(
        mark(&s, &h, vec![id.clone(), "foreign".into()])
            .await
            .unwrap_err()
            .0,
        StatusCode::NOT_FOUND
    );
    let before = serde_json::to_value(&*s.db.read().await).unwrap();
    std::fs::create_dir(s.data_dir.join("cfitness_state.json.tmp")).unwrap();
    assert_eq!(
        mark(&s, &h, vec![id]).await.unwrap_err().0,
        StatusCode::INTERNAL_SERVER_ERROR
    );
    assert_eq!(serde_json::to_value(&*s.db.read().await).unwrap(), before);
}
#[tokio::test]
async fn pagination_and_unread_filter_keep_actual_total_and_stable_cursor() {
    let s = state();
    fixture(&s, 53).await;
    let mut db = s.db.write().await;
    let first = view(&db, "emp-chloe", "beynost", &Page::default()).unwrap();
    assert_eq!(first["total"], 53);
    assert_eq!(first["notifications"].as_array().unwrap().len(), 50);
    let next = first["nextCursor"].as_str().unwrap().to_string();
    let second = view(
        &db,
        "emp-chloe",
        "beynost",
        &Page {
            before: Some(next.clone()),
            unread_only: false,
        },
    )
    .unwrap();
    assert_eq!(second["notifications"].as_array().unwrap().len(), 3);
    let person = db.personal_workspace.people.get_mut("emp-chloe").unwrap();
    mark_read(&mut person["notifications"][49], &Utc::now().to_rfc3339());
    let unread = view(
        &db,
        "emp-chloe",
        "beynost",
        &Page {
            before: Some(next),
            unread_only: true,
        },
    )
    .unwrap();
    assert_eq!(unread["unreadCount"], 52);
    assert_eq!(unread["notifications"].as_array().unwrap().len(), 3);
}
#[tokio::test]
async fn leave_events_notify_authorized_managers_then_employee_without_private_reason() {
    let s = state();
    let before = s.db.read().await.clone();
    let mut next = before.clone();
    next.leave_requests.push(LeaveRequest {
        id: "notify-leave".into(),
        employee_id: "emp-chloe".into(),
        site_id: "club-beynost".into(),
        start_date: "2026-12-14".into(),
        end_date: "2026-12-15".into(),
        status: "pending".into(),
        motive: "SECRET MEDICAL".into(),
        comment: "SECRET COMMENT".into(),
    });
    leave_changes(&before, &mut next).unwrap();
    assert!(rows(&next, "emp-mario", "beynost")
        .unwrap()
        .iter()
        .any(|n| n["title"] == "Nouvelle demande d’absence"));
    assert!(!rows(&next, "emp-sarah", "beynost")
        .unwrap()
        .iter()
        .any(|n| n["title"] == "Nouvelle demande d’absence"));
    let before = next.clone();
    next.leave_requests.last_mut().unwrap().status = "approved".into();
    leave_changes(&before, &mut next).unwrap();
    let messages = rows(&next, "emp-chloe", "beynost").unwrap();
    assert!(messages
        .iter()
        .any(|n| n["title"] == "Demande d’absence validée"));
    assert!(!serde_json::to_string(&messages).unwrap().contains("SECRET"));
    let count = messages.len();
    leave_changes(&before, &mut next).unwrap();
    assert_eq!(rows(&next, "emp-chloe", "beynost").unwrap().len(), count);
}
