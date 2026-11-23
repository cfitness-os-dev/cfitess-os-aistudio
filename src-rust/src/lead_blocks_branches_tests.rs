use super::*;
fn block(kind: &str, id: &str) -> email_blocks::Block {
    email_blocks::Block {
        id: id.into(),
        kind: kind.into(),
        text: "Bonjour %prenom%".into(),
        label: "Réserver".into(),
        url: "https://example.test/rdv".into(),
        image: "https://example.test/image.png".into(),
        alt: "Illustration".into(),
        html: "<p>Bonjour %prenom%</p>".into(),
        links: vec![email_blocks::Link {
            label: "Club".into(),
            url: "https://example.test".into(),
        }],
        style: email_blocks::Style {
            font: "Arial".into(),
            font_size: 16,
            align: "left".into(),
            text_color: "#123456".into(),
            background_color: "#ffffff".into(),
            radius: 8,
            padding: [10, 20, 10, 20],
            image_width: 400,
            height: 50,
            image_position: "left".into(),
            thickness: 2,
        },
    }
}
#[test]
fn twelve_blocks_render_and_html_preview_is_isolated_without_loading_remote_media() {
    let mut doc = email_blocks::Document {
        version: 1,
        blocks: email_blocks::KINDS
            .iter()
            .enumerate()
            .map(|(i, k)| block(k, &i.to_string()))
            .collect(),
    };
    assert!(email_blocks::validate(&doc).is_ok());
    let values = HashMap::from([
        ("prenom".into(), "<script>nom</script>".into()),
        (
            "unsubscribe-url".into(),
            "https://example.test/unsubscribe".into(),
        ),
    ]);
    let html = email_blocks::render(&doc, &values, true).unwrap();
    assert!(html.contains("&lt;script&gt;nom&lt;/script&gt;"));
    assert!(!html.contains("<script>nom</script>"));
    assert!(html.contains("Image distante non chargée"));
    assert!(!html.contains("src=\"https://example.test/image.png"));
    assert!(html.contains("@media(max-width:767px)"));
    assert!(html.contains("Se désabonner"));
    assert!(!html.contains(" href="));
    let isolated = email_blocks::preview_document(&html);
    assert!(isolated.contains("default-src 'none'"));
    assert!(isolated.contains("form-action 'none'"));
    doc.blocks[5].html="<script>alert(1)</script><iframe src='https://example.test'></iframe><img src='x' onerror='alert(1)'><a href='javascript:alert(1)' style='background:url(https://example.test)'>Lien</a>".into();
    let sanitized = email_blocks::render(&doc, &values, true).unwrap();
    assert!(!sanitized.contains("<script>"));
    assert!(!sanitized.contains("onerror="));
    assert!(!sanitized.contains("javascript:"));
    assert!(!sanitized.contains("<iframe"));
    assert!(email_blocks::render(&doc, &HashMap::new(), true).is_err());
    let mut unsafe_doc = doc.clone();
    unsafe_doc.blocks[0].url = "https://user:secret@example.test".into();
    assert!(email_blocks::validate(&unsafe_doc).is_err());
    unsafe_doc = doc.clone();
    unsafe_doc.blocks[0].style.background_color = "red;position:fixed".into();
    assert!(email_blocks::validate(&unsafe_doc).is_err());
    unsafe_doc = doc.clone();
    unsafe_doc.blocks[0].image = "data:image/svg+xml;base64,PHN2Zz4=".into();
    assert!(email_blocks::validate(&unsafe_doc).is_err());
    unsafe_doc = doc;
    unsafe_doc.blocks[0].image = "data:image/png;base64,PHNjcmlwdD4=".into();
    assert!(email_blocks::validate(&unsafe_doc).is_err());
}

#[tokio::test]
async fn branch_decision_persists_and_only_the_selected_path_runs_after_restart() {
    for yes in [true, false] {
        let s = tests::state();
        let now = Utc::now();
        let mut db = s.db.write().await;
        let (id, mut p) = tests::setup(&mut db, now);
        p.stage = if yes { "Client" } else { "Nouveau" }.into();
        db.lead_prospects
            .iter_mut()
            .find(|v| v.id == p.id)
            .unwrap()
            .stage = p.stage.clone();
        let mut d = tests::definition();
        let mut condition = d.steps[0].clone();
        condition.id = "condition".into();
        condition.kind = "condition".into();
        condition.content = None;
        condition.branch = Some(Branch {
            predicate: "status".into(),
            values: vec!["Client".into()],
            yes_step_id: Some("yes".into()),
            no_step_id: Some("no".into()),
        });
        let mut a = d.steps[0].clone();
        a.id = "yes".into();
        a.content = Some("Parcours oui".into());
        a.next = Some(Next { step_id: None });
        a.delay.amount = 5;
        let mut b = a.clone();
        b.id = "no".into();
        b.content = Some("Parcours non".into());
        d.steps = vec![condition, a, b];
        assert!(validate(&d, "carre-de-soie", &db).is_ok());
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
        let scenario = db.lead_scenarios.scenarios[0].clone();
        enroll(&mut db, &scenario, &p, now).unwrap();
        process(&mut db, "carre-de-soie", now);
        assert_eq!(
            db.lead_scenarios.enrollments[0].history[0].status,
            "branched"
        );
        let expected = if yes { 1 } else { 2 };
        assert_eq!(db.lead_scenarios.enrollments[0].cursor, expected);
        crate::seed::persist_state(&s.data_dir, &db).unwrap();
        drop(db);
        let mut restored = crate::seed::load_or_init_state(&s.data_dir);
        // Change current status after the decision. The chosen path must not be recalculated.
        restored
            .lead_prospects
            .iter_mut()
            .find(|v| v.id == p.id)
            .unwrap()
            .stage = if yes { "Nouveau" } else { "Client" }.into();
        process(&mut restored, "carre-de-soie", now + Duration::minutes(4));
        assert_eq!(restored.lead_scenarios.enrollments[0].history.len(), 1);
        process(&mut restored, "carre-de-soie", now + Duration::minutes(5));
        let e = &restored.lead_scenarios.enrollments[0];
        assert_eq!(e.status, "completed");
        assert_eq!(e.history.len(), 2);
        assert_eq!(e.history[1].step_id, if yes { "yes" } else { "no" });
        process(&mut restored, "carre-de-soie", now + Duration::minutes(20));
        assert_eq!(restored.lead_scenarios.enrollments[0].history.len(), 2);
        d.steps[0].branch.as_mut().unwrap().yes_step_id = Some("condition".into());
        assert!(validate(&d, "carre-de-soie", &restored).is_err());
        d.steps[0].branch.as_mut().unwrap().yes_step_id = Some("yes".into());
        d.steps[1].enabled = false;
        assert!(validate(&d, "carre-de-soie", &restored).is_err());
        d.steps[1].enabled = true;
        d.steps[1].next = Some(Next {
            step_id: Some("condition".into()),
        });
        assert!(validate(&d, "carre-de-soie", &restored).is_err());
        std::fs::remove_dir_all(&s.data_dir).unwrap();
    }
}
