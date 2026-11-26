use super::*;
use crate::routes::SharedAppState;
use crate::seed::load_or_init_state_with_mode;
use std::sync::Arc;
use tokio::sync::RwLock;
fn state() -> SharedState {
    let dir = std::env::temp_dir().join(format!("hr-collaboration-{}", rand::random::<u128>()));
    Arc::new(SharedAppState {
        db: RwLock::new(load_or_init_state_with_mode(&dir, true)),
        data_dir: dir,
        sessions: RwLock::new(HashMap::new()),
        login_attempts: RwLock::new(HashMap::new()),
    })
}
async fn headers(s: &SharedState, id: &str) -> HeaderMap {
    let token = random_token();
    s.sessions
        .write()
        .await
        .insert(token.clone(), (id.into(), Utc::now().timestamp() + 3600));
    let mut h = HeaderMap::new();
    h.insert("authorization", format!("Bearer {token}").parse().unwrap());
    h
}
fn command(op: &str) -> PublishMessage {
    PublishMessage {
        operation_id: op.into(),
        subject: "Procédure avant cours".into(),
        body: "Vérifier la salle\nMerci à tous.".into(),
        recipient_ids: vec!["emp-chloe".into()],
    }
}
async fn send(s: &SharedState, h: &HeaderMap, c: PublishMessage) -> Result<Json<Value>, Failure> {
    publish_message(State(s.clone()), Path("beynost".into()), h.clone(), Json(c)).await
}
async fn issue(s: &SharedState, h: &HeaderMap) -> Value {
    issue_calendar(
        State(s.clone()),
        h.clone(),
        Json(IssueCalendar {
            club_ids: vec!["beynost".into()],
        }),
    )
    .await
    .unwrap()
    .0
}
async fn feed(s: &SharedState, url: &Value) -> Result<Response, Failure> {
    calendar_feed(
        State(s.clone()),
        Path(
            url["relativeUrl"]
                .as_str()
                .unwrap()
                .rsplit('/')
                .next()
                .unwrap()
                .into(),
        ),
    )
    .await
}
#[tokio::test]
async fn publication_requires_session_and_exact_club_manager_role() {
    let s = state();
    assert_eq!(
        send(&s, &HeaderMap::new(), command("operation-test-0001"))
            .await
            .unwrap_err()
            .0,
        StatusCode::UNAUTHORIZED
    );
    let h = headers(&s, "emp-chloe").await;
    assert_eq!(
        send(&s, &h, command("operation-test-0001"))
            .await
            .unwrap_err()
            .0,
        StatusCode::FORBIDDEN
    );
    let h = headers(&s, "emp-mario").await;
    {
        let mut db = s.db.write().await;
        let e = db
            .employees
            .iter_mut()
            .find(|e| e.id == "emp-mario")
            .unwrap();
        e.site_accesses
            .iter_mut()
            .find(|a| a.site_id == "club-beynost")
            .unwrap()
            .profile_id = "lecture_seule_avancee".into();
    }
    assert_eq!(
        send(&s, &h, command("operation-test-0001"))
            .await
            .unwrap_err()
            .0,
        StatusCode::FORBIDDEN
    );
    assert!(s
        .db
        .read()
        .await
        .personal_workspace
        .collaboration
        .messages
        .is_empty());
}
#[tokio::test]
async fn internal_message_read_receipt_and_reload_are_persistent() {
    let s = state();
    let h = headers(&s, "emp-mario").await;
    let published = send(&s, &h, command("operation-test-0002"))
        .await
        .unwrap()
        .0;
    let id = published["publishedMessageId"].as_str().unwrap();
    assert_eq!(published["messages"][0]["receipts"][0]["read"], false);
    let reader = headers(&s, "emp-chloe").await;
    let action = || serde_json::from_value(json!({"action":"read_notification","id":id})).unwrap();
    let _ = crate::personal_workspace::post_workspace_action(
        State(s.clone()),
        Path("beynost".into()),
        reader.clone(),
        Json(action()),
    )
    .await
    .unwrap();
    let first = workspace(&*s.db.read().await, "emp-mario", "beynost", None).unwrap();
    assert_eq!(first["messages"][0]["receipts"][0]["read"], true);
    assert!(first["messages"][0]["receipts"][0]["readAt"].is_string());
    let _ = crate::personal_workspace::post_workspace_action(
        State(s.clone()),
        Path("beynost".into()),
        reader,
        Json(action()),
    )
    .await
    .unwrap();
    let reloaded = load_or_init_state_with_mode(&s.data_dir, true);
    assert_eq!(
        workspace(&reloaded, "emp-mario", "beynost", None).unwrap()["messages"],
        first["messages"]
    );
    assert!(
        workspace(&reloaded, "emp-mario", "carre-de-soie", None).unwrap()["messages"]
            .as_array()
            .unwrap()
            .is_empty()
    );
}
#[tokio::test]
async fn retries_are_idempotent_even_when_concurrent_and_reject_changed_content() {
    let s = state();
    let h = headers(&s, "emp-mario").await;
    let (a, b) = tokio::join!(
        send(&s, &h, command("operation-test-0003")),
        send(&s, &h, command("operation-test-0003"))
    );
    assert_eq!(
        a.unwrap().0["publishedMessageId"],
        b.unwrap().0["publishedMessageId"]
    );
    assert_eq!(
        s.db.read()
            .await
            .personal_workspace
            .collaboration
            .messages
            .len(),
        1
    );
    assert_eq!(person_notifications(&*s.db.read().await).len(), 1);
    let mut changed = command("operation-test-0003");
    changed.body = "autre".into();
    assert_eq!(
        send(&s, &h, changed).await.unwrap_err().0,
        StatusCode::CONFLICT
    );
}
fn person_notifications(db: &AppDatabaseState) -> Vec<Value> {
    crate::personal_workspace::person(db, "emp-chloe")["notifications"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|n| n["rhMessageId"].is_string())
        .cloned()
        .collect()
}
#[tokio::test]
async fn disk_failure_leaves_messages_notifications_audit_and_old_calendar_unchanged() {
    let s = state();
    let h = headers(&s, "emp-mario").await;
    let old = issue(&s, &h).await;
    let before = serde_json::to_value(&*s.db.read().await).unwrap();
    let disk = std::fs::read(s.data_dir.join("cfitness_state.json")).unwrap();
    let blocker = s.data_dir.join("cfitness_state.json.tmp");
    std::fs::create_dir(&blocker).unwrap();
    assert_eq!(
        send(&s, &h, command("operation-test-0004"))
            .await
            .unwrap_err()
            .0,
        StatusCode::INTERNAL_SERVER_ERROR
    );
    assert_eq!(
        issue_calendar(
            State(s.clone()),
            h.clone(),
            Json(IssueCalendar {
                club_ids: vec!["beynost".into()]
            })
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
    assert!(feed(&s, &old).await.is_ok());
    std::fs::remove_dir(blocker).unwrap();
    assert!(send(&s, &h, command("operation-test-0004")).await.is_ok());
}
#[tokio::test]
async fn unauthorized_or_inactive_recipient_rejects_whole_publication() {
    let s = state();
    let h = headers(&s, "emp-mario").await;
    let mut c = command("operation-test-0005");
    c.recipient_ids.push("unknown-person".into());
    assert_eq!(send(&s, &h, c).await.unwrap_err().0, StatusCode::FORBIDDEN);
    s.db.write()
        .await
        .employees
        .iter_mut()
        .find(|e| e.id == "emp-chloe")
        .unwrap()
        .active = false;
    assert_eq!(
        send(&s, &h, command("operation-test-0005"))
            .await
            .unwrap_err()
            .0,
        StatusCode::FORBIDDEN
    );
    assert!(s
        .db
        .read()
        .await
        .personal_workspace
        .collaboration
        .messages
        .is_empty());
}
#[tokio::test]
async fn calendar_token_is_hashed_revocable_and_rechecks_current_access() {
    let s = state();
    let h = headers(&s, "emp-chloe").await;
    let old = issue(&s, &h).await;
    let token = old["relativeUrl"]
        .as_str()
        .unwrap()
        .trim_start_matches("/api/calendar/")
        .trim_end_matches(".ics");
    assert!(!serde_json::to_string(&*s.db.read().await)
        .unwrap()
        .contains(token));
    let res = feed(&s, &old).await.unwrap();
    assert_eq!(res.headers()["cache-control"], "private, no-store");
    assert_eq!(
        res.headers()["content-type"],
        "text/calendar; charset=utf-8"
    );
    let new = issue(&s, &h).await;
    assert_eq!(feed(&s, &old).await.unwrap_err().0, StatusCode::NOT_FOUND);
    assert!(feed(&s, &new).await.is_ok());
    assert_eq!(
        calendar_feed(State(s.clone()), Path("cal-emp-chloe.ics".into()))
            .await
            .unwrap_err()
            .0,
        StatusCode::NOT_FOUND
    );
    let reloaded = load_or_init_state_with_mode(&s.data_dir, true);
    assert!(reloaded
        .personal_workspace
        .collaboration
        .calendars
        .contains_key("emp-chloe"));
    s.db.write()
        .await
        .employees
        .iter_mut()
        .find(|e| e.id == "emp-chloe")
        .unwrap()
        .site_accesses
        .clear();
    assert_eq!(feed(&s, &new).await.unwrap_err().0, StatusCode::NOT_FOUND);
}
#[tokio::test]
async fn calendar_exports_only_own_published_work_and_generic_approved_absence() {
    let s = state();
    let mut db = s.db.write().await;
    db.shifts.clear();
    db.leave_requests.clear();
    let day = Utc::now().date_naive();
    let shift = crate::models::Shift {
        id: "own".into(),
        site_id: "club-beynost".into(),
        date: day.to_string(),
        start_time: "22:00".into(),
        end_time: "06:00".into(),
        employee_id: Some("emp-chloe".into()),
        position_id: "none".into(),
        mission_label: Some("SECRET-MISSION".into()),
        tasks: vec!["SECRET-TASK".into()],
        break_minutes: 0,
        lock_state: "open".into(),
        published: true,
    };
    db.shifts.push(shift.clone());
    let mut other = shift.clone();
    other.id = "other".into();
    other.employee_id = Some("emp-mario".into());
    db.shifts.push(other);
    let mut draft = shift;
    draft.id = "draft".into();
    draft.published = false;
    db.shifts.push(draft);
    db.leave_requests.push(crate::models::LeaveRequest {
        id: "leave".into(),
        employee_id: "emp-chloe".into(),
        site_id: "club-beynost".into(),
        start_date: day.to_string(),
        end_date: day.to_string(),
        status: "approved".into(),
        motive: "SECRET-MEDICAL".into(),
        comment: "SECRET-COMMENT".into(),
    });
    let out = calendar(&db, "emp-chloe", &["beynost".into()]).unwrap();
    assert_eq!(out.matches("BEGIN:VEVENT").count(), 2);
    assert!(!out.contains("SECRET"));
    assert!(out.contains("SUMMARY:Absence validée"));
    assert!(out.contains(&format!(
        "DTEND;VALUE=DATE:{}",
        day.succ_opt().unwrap().format("%Y%m%d")
    )));
    let start = local(day, NaiveTime::from_hms_opt(22, 0, 0).unwrap()).unwrap();
    assert!(out.contains(&format!("DTSTART:{}", start.format("%Y%m%dT%H%M%SZ"))));
    db.leave_policy.requests.insert(
        "leave".into(),
        crate::hr_leave_policy::RequestDetails {
            motive_id: "x".into(),
            document_ids: vec![],
            motive_label_at_request: "secret".into(),
            start_period: "pm".into(),
            end_period: "pm".into(),
        },
    );
    let half = calendar(&db, "emp-chloe", &["beynost".into()]).unwrap();
    assert!(half.contains(&format!(
        "DTSTART:{}",
        local(day, NaiveTime::from_hms_opt(12, 0, 0).unwrap())
            .unwrap()
            .format("%Y%m%dT%H%M%SZ")
    )));
    db.shifts[0].start_time = "invalid".into();
    assert_eq!(
        calendar(&db, "emp-chloe", &["beynost".into()])
            .unwrap_err()
            .0,
        StatusCode::SERVICE_UNAVAILABLE
    );
}
#[test]
fn calendar_folding_escaping_and_paris_dst_are_valid() {
    let mut output = String::new();
    line(
        &mut output,
        &format!(
            "SUMMARY:{}",
            escape(&format!("{};x,y\nBEGIN:VEVENT", "é".repeat(150)))
        ),
    );
    assert!(output.split("\r\n").all(|row| row.len() <= 75));
    assert!(!output.contains("\nBEGIN:VEVENT"));
    assert!(output.contains("\\;x\\,y\\nBEGIN:VEVENT"));
    assert_eq!(
        local(
            NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
            NaiveTime::from_hms_opt(8, 0, 0).unwrap()
        )
        .unwrap()
        .format("%H")
        .to_string(),
        "07"
    );
    assert_eq!(
        local(
            NaiveDate::from_ymd_opt(2026, 7, 15).unwrap(),
            NaiveTime::from_hms_opt(8, 0, 0).unwrap()
        )
        .unwrap()
        .format("%H")
        .to_string(),
        "06"
    );
    assert!(local(
        NaiveDate::from_ymd_opt(2026, 3, 29).unwrap(),
        NaiveTime::from_hms_opt(2, 30, 0).unwrap()
    )
    .is_none());
}

#[tokio::test]
async fn managed_teams_limit_recipient_lists_and_atomic_publication() {
    let s = state();
    let h = headers(&s, "emp-sarah").await;
    {
        let mut db = s.db.write().await;
        let profile = db
            .profiles
            .iter_mut()
            .find(|p| p.id == "planificateur_avance")
            .unwrap();
        profile.scope_selected = "teams".into();
        for row in &mut profile.rows {
            row.exposed = true;
            row.disabled = Some(false);
            row.checked = Some(true);
        }
        for e in &mut db.employees {
            if let Some(a) = e
                .site_accesses
                .iter_mut()
                .find(|a| a.site_id == "club-carre-soie")
            {
                match e.id.as_str() {
                    "emp-sarah" => {
                        a.profile_id = "planificateur_avance".into();
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
    let data = get_messages(
        State(s.clone()),
        Path("carre-de-soie".into()),
        Query(MessagePage::default()),
        h.clone(),
    )
    .await
    .unwrap()
    .0;
    assert!(data["recipients"]
        .as_array()
        .unwrap()
        .iter()
        .any(|r| r["id"] == "emp-maxime"));
    assert!(!data["recipients"]
        .as_array()
        .unwrap()
        .iter()
        .any(|r| r["id"] == "emp-karim"));
    let mut c = command("operation-teams-001");
    c.recipient_ids = vec!["emp-maxime".into(), "emp-karim".into()];
    assert_eq!(
        publish_message(State(s.clone()), Path("carre-de-soie".into()), h, Json(c))
            .await
            .unwrap_err()
            .0,
        StatusCode::FORBIDDEN
    );
    assert!(s
        .db
        .read()
        .await
        .personal_workspace
        .collaboration
        .messages
        .is_empty());
}
#[tokio::test]
async fn history_paginates_only_own_club_messages() {
    let s = state();
    let mut db = s.db.write().await;
    for i in 0..53 {
        db.personal_workspace.collaboration.messages.push(Message {
            id: format!("page-{i}"),
            actor_id: "emp-mario".into(),
            club_id: if i == 52 {
                "carre-de-soie".into()
            } else {
                "beynost".into()
            },
            operation_id: format!("operation-page-{i}"),
            fingerprint: "test".into(),
            subject: "Information".into(),
            body: "Message".into(),
            recipient_ids: vec!["emp-chloe".into()],
            created_at: Utc::now().to_rfc3339(),
        });
    }
    let first = workspace(&db, "emp-mario", "beynost", None).unwrap();
    assert_eq!(first["messages"].as_array().unwrap().len(), 50);
    let second = workspace(&db, "emp-mario", "beynost", first["nextCursor"].as_str()).unwrap();
    assert_eq!(second["messages"].as_array().unwrap().len(), 2);
    assert!(second["nextCursor"].is_null());
    assert!(workspace(&db, "emp-mario", "beynost", Some("page-52")).is_err());
    assert!(workspace(&db, "emp-sarah", "beynost", Some("page-51")).is_err());
}

#[tokio::test]
async fn audience_metadata_is_limited_to_the_authorized_club_and_recipients() {
    let s = state();
    let mut db = s.db.write().await;
    db.teams.push(crate::models::Team {
        id: "test-bey-team".into(),
        site_id: "club-beynost".into(),
        name: "Équipe Beynost".into(),
    });
    db.teams.push(crate::models::Team {
        id: "test-cds-team".into(),
        site_id: "club-carre-soie".into(),
        name: "Équipe autre club".into(),
    });
    let employee = db
        .employees
        .iter_mut()
        .find(|e| e.id == "emp-chloe")
        .unwrap();
    employee.hr_file_status = "awaiting_employee".into();
    employee
        .site_accesses
        .iter_mut()
        .find(|a| a.site_id == "club-beynost")
        .unwrap()
        .team_ids = vec!["test-bey-team".into(), "test-cds-team".into()];
    let data = workspace(&db, "emp-mario", "beynost", None).unwrap();
    let recipient = data["recipients"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["id"] == "emp-chloe")
        .unwrap();
    assert_eq!(recipient["fileStatus"], "awaiting_employee");
    assert_eq!(
        recipient["teams"],
        json!([{"id":"test-bey-team","name":"Équipe Beynost"}])
    );
    assert!(!data["recipients"]
        .as_array()
        .unwrap()
        .iter()
        .any(|r| r["id"] == "emp-sarah"));
}
