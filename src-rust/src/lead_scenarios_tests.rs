use super::*;
use crate::routes::SharedAppState;
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;

#[tokio::test]
async fn brevo_outbox_persists_once_and_exclusion_blocks_future_steps_and_duplicate_addresses() {
    let state=state(); let now=Utc::now(); let mut db=state.db.write().await;
    let (_,p)=setup(&mut db,now);
    let mut scenario=db.lead_scenarios.scenarios[0].clone();
    let mut email=scenario.versions[0].definition.steps[0].clone();
    email.subject=Some("Bonjour %prenom%".into());
    let mut second=email.clone(); second.id="second-email".into(); second.delay.amount=5;
    scenario.versions[0].definition.steps=vec![email,second];
    db.lead_scenarios.scenarios[0]=scenario.clone();
    enroll(&mut db,&scenario,&p,now).unwrap();
    process(&mut db,"carre-de-soie",now);
    assert_eq!(db.lead_scenarios.email_outbox.len(),1);
    apply(&mut db,"carre-de-soie","emp-mario",Command::SuppressEmail{prospect_id:p.id.clone(),reason:"Demande fictive du contact".into()},now).unwrap();
    persist_state(&state.data_dir,&db).unwrap();
    let mut restored=crate::seed::load_or_init_state(&state.data_dir);
    process(&mut restored,"carre-de-soie",now+Duration::minutes(6));
    assert_eq!(restored.lead_scenarios.email_outbox.len(),1);
    assert_eq!(restored.lead_scenarios.enrollments[0].history[1].status,"skipped");
    let mut duplicate=p.clone(); duplicate.id="duplicate-email".into(); duplicate.email=p.email.to_uppercase();
    restored.lead_prospects.push(duplicate.clone());
    enroll(&mut restored,&scenario,&duplicate,now).unwrap();
    process(&mut restored,"carre-de-soie",now);
    assert_eq!(restored.lead_scenarios.email_outbox.len(),1);
    assert_eq!(restored.lead_scenarios.enrollments[1].history[0].status,"skipped");
    assert_eq!(snapshot(&restored,"beynost","emp-mario")["emailOutbox"],json!([]));
    assert_eq!(snapshot(&restored,"beynost","emp-mario")["emailSuppressions"],json!([]));
    assert!(apply(&mut restored,"beynost","emp-mario",Command::SuppressEmail{prospect_id:p.id,reason:"Test".into()},now).is_err());
    drop(db); std::fs::remove_dir_all(&state.data_dir).unwrap();
}

#[test]
fn email_composition_is_safe_structured_text_and_rejects_unsafe_urls() {
    let mut message = messages::Message {
        name: "Visite".into(),
        channel: "email".into(),
        subject: "Bonjour".into(),
        body: "Votre séance".into(),
        email_document: None,
        email_layout: Some(messages::EmailLayout {
            heading: "Bienvenue".into(),
            button_label: "Réserver".into(),
            button_url: "https://example.test/rdv".into(),
            footer: "À bientôt".into(),
            font: "Arial".into(),
        }),
    };
    assert!(messages::validate_message(&message).is_ok());
    assert_eq!(
        messages::text_body(&message),
        "Bienvenue\n\nVotre séance\n\nRéserver : https://example.test/rdv\n\nÀ bientôt"
    );
    for url in [
        "javascript:alert(1)",
        "https://user:secret@example.test",
        "http://example.test",
    ] {
        message.email_layout.as_mut().unwrap().button_url = url.into();
        assert!(messages::validate_message(&message).is_err());
    }
}

#[tokio::test]
async fn status_and_target_exit_rules_stop_pending_steps_without_removing_existing_activities() {
    for mode in ["status", "target"] {
        let s = state();
        let now = Utc::now();
        let mut db = s.db.write().await;
        let (_, p) = setup(&mut db, now);
        let mut scenario = db.lead_scenarios.scenarios[0].clone();
        let definition = &mut scenario.versions[0].definition;
        definition.mode = "automatic".into();
        definition.conditions = Some(Conditions {
            status_ids: vec![p.stage.clone()],
            source_ids: vec![p.source.clone()],
            require_assigned_commercial: true,
        });
        definition.exit_rules = Some(ExitRules {
            stop_on_reply: false,
            status_ids: if mode == "status" {
                vec!["Client".into()]
            } else {
                vec![]
            },
            stop_if_no_longer_matches: mode == "target",
        });
        db.lead_scenarios.scenarios[0] = scenario.clone();
        enroll(&mut db, &scenario, &p, now).unwrap();
        let record = db.lead_prospects.iter_mut().find(|x| x.id == p.id).unwrap();
        if mode == "status" {
            record.stage = "Client".into();
        } else {
            record.source = "Source différente".into();
        }
        let before = db.lead_activities.len();
        process(&mut db, "carre-de-soie", now);
        assert_eq!(db.lead_scenarios.enrollments[0].status, "stopped");
        assert_eq!(
            db.lead_scenarios.enrollments[0].history[0].status,
            "stopped"
        );
        assert_eq!(db.lead_activities.len(), before);
        drop(db);
        std::fs::remove_dir_all(&s.data_dir).unwrap();
    }
}

#[tokio::test]
async fn templates_freeze_at_publication_render_once_and_reject_cross_club_or_archived_references()
{
    let s = state();
    let now = Utc::now();
    let mut db = s.db.write().await;
    let (id, p) = setup(&mut db, now);
    let message = messages::Message {
        email_document: None,
        email_layout: None,
        name: "Accueil".into(),
        channel: "email".into(),
        subject: "Bonjour %prenom%".into(),
        body: "Bienvenue au %club%, %prenom%".into(),
    };
    apply(
        &mut db,
        "carre-de-soie",
        "emp-daniel",
        Command::SaveTemplate {
            template_id: None,
            expected_revision: None,
            message: message.clone(),
        },
        now,
    )
    .unwrap();
    let tpl = db.lead_scenarios.templates[0].id.clone();
    let mut d = definition();
    d.steps[0].template_id = Some(tpl.clone());
    d.steps[0].content = None;
    apply(
        &mut db,
        "carre-de-soie",
        "emp-daniel",
        Command::Save {
            scenario_id: Some(id.clone()),
            expected_revision: Some(3),
            definition: d.clone(),
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
    let frozen = db.lead_scenarios.scenarios[0].versions.last().unwrap();
    assert!(frozen.definition.steps[0].template_id.is_none());
    assert_eq!(
        frozen.definition.steps[0].subject.as_deref(),
        Some("Bonjour %prenom%")
    );
    let mut changed = message;
    changed.body = "Nouveau modèle".into();
    apply(
        &mut db,
        "carre-de-soie",
        "emp-daniel",
        Command::SaveTemplate {
            template_id: Some(tpl.clone()),
            expected_revision: Some(1),
            message: changed,
        },
        now,
    )
    .unwrap();
    let scenario = db.lead_scenarios.scenarios[0].clone();
    enroll(&mut db, &scenario, &p, now).unwrap();
    process(&mut db, "carre-de-soie", now);
    let entry = &db.lead_scenarios.enrollments[0].history[0];
    assert_eq!(entry.status, "simulated");
    assert!(entry
        .rendered_content
        .as_ref()
        .unwrap()
        .starts_with("Bienvenue au "));
    assert_eq!(
        entry.rendered_subject.as_deref(),
        Some(format!("Bonjour {}", p.first_name).as_str())
    );
    let mut foreign = d.clone();
    foreign.club_id = "beynost".into();
    assert!(validate(&foreign, "beynost", &db).is_err());
    apply(
        &mut db,
        "carre-de-soie",
        "emp-daniel",
        Command::ArchiveTemplate {
            template_id: tpl,
            expected_revision: 2,
        },
        now,
    )
    .unwrap();
    assert!(validate(&d, "carre-de-soie", &db).is_err());
    let restored: AppDatabaseState =
        serde_json::from_value(serde_json::to_value(&*db).unwrap()).unwrap();
    assert_eq!(restored.lead_scenarios.templates.len(), 1);
    assert_eq!(
        restored.lead_scenarios.enrollments[0].history[0].rendered_content,
        entry_content(&db)
    );
    assert_eq!(
        messages::render(
            "%prenom% remise 10%",
            &HashMap::from([("prenom".into(), "%nom%".into())])
        )
        .unwrap(),
        "%nom% remise 10%"
    );
    assert!(messages::render("%rdv-date%", &HashMap::new()).is_err());
    drop(db);
    std::fs::remove_dir_all(&s.data_dir).unwrap();
}
fn entry_content(db: &AppDatabaseState) -> Option<String> {
    db.lead_scenarios.enrollments[0].history[0]
        .rendered_content
        .clone()
}

#[tokio::test]
async fn exit_rules_stop_before_due_and_whatsapp_fallbacks_never_invent_channel_evidence() {
    let s = state();
    let now = Utc::now();
    let mut db = s.db.write().await;
    let (_, p) = setup(&mut db, now);
    let mut scenario = db.lead_scenarios.scenarios[0].clone();
    scenario.versions[0].definition.exit_rules = Some(ExitRules {
        stop_on_reply: true,
        status_ids: vec![],
        stop_if_no_longer_matches: false,
    });
    scenario.versions[0].definition.steps[0].delay.amount = 50;
    db.lead_scenarios.scenarios[0] = scenario.clone();
    enroll(&mut db, &scenario, &p, now).unwrap();
    db.lead_prospects
        .iter_mut()
        .find(|x| x.id == p.id)
        .unwrap()
        .last_inbound_reply_at = Some((now + Duration::seconds(1)).to_rfc3339());
    process(&mut db, "carre-de-soie", now + Duration::seconds(2));
    assert_eq!(db.lead_scenarios.enrollments[0].status, "stopped");
    assert_eq!(
        db.lead_scenarios.enrollments[0].history[0].status,
        "stopped"
    );
    let mut wa = definition();
    wa.steps.truncate(1);
    wa.steps[0].kind = "whatsapp".into();
    wa.steps[0].whatsapp = Some(WhatsAppOptions {
        mode: "direct".into(),
        closed_action: "sms".into(),
        fallback_template_id: None,
        fallback_content: Some("Bonjour %prenom%".into()),
    });
    assert!(validate(&wa, "carre-de-soie", &db).is_ok());
    db.lead_scenarios.enrollments.clear();
    db.lead_scenarios.scenarios[0].versions[0].definition = wa.clone();
    let scenario = db.lead_scenarios.scenarios[0].clone();
    enroll(&mut db, &scenario, &p, now).unwrap();
    process(&mut db, "carre-de-soie", now);
    assert_eq!(
        db.lead_scenarios.enrollments[0].history[0].status,
        "skipped"
    );
    assert!(db.lead_scenarios.enrollments[0].history[0]
        .rendered_content
        .is_none());
    wa.steps[0].whatsapp.as_mut().unwrap().fallback_content = Some("".into());
    assert!(validate(&wa, "carre-de-soie", &db).is_err());
    drop(db);
    std::fs::remove_dir_all(&s.data_dir).unwrap();
}

#[tokio::test]
async fn template_commands_require_role_revision_and_durable_write() {
    let s = state();
    let message = messages::Message {
        email_document: None,
        email_layout: None,
        name: "SMS".into(),
        channel: "sms".into(),
        subject: "".into(),
        body: "Bonjour %prenom%".into(),
    };
    let make = || Command::SaveTemplate {
        template_id: None,
        expected_revision: None,
        message: message.clone(),
    };
    let h = headers(&s, "emp-maxime", "forbidden-template").await;
    assert_eq!(
        command(
            State(s.clone()),
            Path("carre-de-soie".into()),
            h,
            Json(make())
        )
        .await
        .unwrap_err()
        .0,
        StatusCode::FORBIDDEN
    );
    let h = headers(&s, "emp-daniel", "saved-template").await;
    let _ = command(
        State(s.clone()),
        Path("carre-de-soie".into()),
        h.clone(),
        Json(make()),
    )
    .await
    .unwrap();
    let _ = command(
        State(s.clone()),
        Path("carre-de-soie".into()),
        h,
        Json(make()),
    )
    .await
    .unwrap();
    assert_eq!(s.db.read().await.lead_scenarios.templates.len(), 1);
    let template = s.db.read().await.lead_scenarios.templates[0].clone();
    let h = headers(&s, "emp-daniel", "stale-template").await;
    let stale = Command::SaveTemplate {
        template_id: Some(template.id),
        expected_revision: Some(99),
        message: message.clone(),
    };
    assert_eq!(
        command(
            State(s.clone()),
            Path("carre-de-soie".into()),
            h,
            Json(stale)
        )
        .await
        .unwrap_err()
        .0,
        StatusCode::CONFLICT
    );
    let before = std::fs::read(s.data_dir.join("cfitness_state.json")).unwrap();
    std::fs::create_dir(s.data_dir.join("cfitness_state.json.tmp")).unwrap();
    let h = headers(&s, "emp-daniel", "failed-template").await;
    assert_eq!(
        command(
            State(s.clone()),
            Path("carre-de-soie".into()),
            h,
            Json(make())
        )
        .await
        .unwrap_err()
        .0,
        StatusCode::INTERNAL_SERVER_ERROR
    );
    assert_eq!(s.db.read().await.lead_scenarios.templates.len(), 1);
    assert_eq!(
        before,
        std::fs::read(s.data_dir.join("cfitness_state.json")).unwrap()
    );
    std::fs::remove_dir_all(&s.data_dir).unwrap();
}

pub(super) fn state() -> SharedState {
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
pub(super) fn definition() -> Definition {
    Definition {
        schema_version: 1,
        club_id: "carre-de-soie".into(),
        name: "Bienvenue".into(),
        mode: "manual".into(),
        active: false,
        enrollment_locked: false,
        conditions: None,
        exit_rules: None,
        message_window: None,
        steps: vec![
            Step {
                id: "email".into(),
                kind: "email".into(),
                next: None,
                branch: None,
                email_document: None,
                subject: None,
                whatsapp: None,
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
                next: None,
                branch: None,
                email_document: None,
                subject: None,
                whatsapp: None,
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
pub(super) fn setup(db: &mut AppDatabaseState, now: DateTime<Utc>) -> (String, LeadProspectRecord) {
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
