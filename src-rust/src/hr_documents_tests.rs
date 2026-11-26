use super::*;
use crate::routes::SharedAppState;
use crate::seed::load_or_init_state_with_mode;
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;
fn state() -> SharedState {
    let dir = std::env::temp_dir().join(format!("rh-documents-{}", rand::random::<u128>()));
    Arc::new(SharedAppState {
        db: RwLock::new(load_or_init_state_with_mode(&dir, true)),
        data_dir: dir,
        sessions: RwLock::new(HashMap::new()),
        login_attempts: RwLock::new(HashMap::new()),
    })
}
async fn headers(s: &SharedState, who: &str) -> HeaderMap {
    let token = format!("{:032x}", rand::random::<u128>());
    s.sessions
        .write()
        .await
        .insert(token.clone(), (who.into(), Utc::now().timestamp() + 3600));
    let mut h = HeaderMap::new();
    h.insert("authorization", format!("Bearer {token}").parse().unwrap());
    h
}
fn command(op: &str) -> Upload {
    Upload {
        operation_id: op.into(),
        employee_id: "emp-chloe".into(),
        title: "Notice fictive".into(),
        category: "Autre".into(),
        file_name: "notice.pdf".into(),
        media_type: "application/pdf".into(),
        base64: STANDARD.encode(b"%PDF-1.4\nFichier de test fictif\n%%EOF\n"),
    }
}
async fn send(s: &SharedState, h: &HeaderMap, c: Upload) -> Result<Json<Value>, Failure> {
    upload(State(s.clone()), Path("beynost".into()), h.clone(), Json(c)).await
}
async fn file(s: &SharedState, h: &HeaderMap, id: &str) -> Result<Response, Failure> {
    download(
        State(s.clone()),
        Path(("beynost".into(), id.into())),
        h.clone(),
    )
    .await
}
#[tokio::test]
async fn imports_require_session_club_and_explicit_document_rights() {
    let s = state();
    let owner = headers(&s, "emp-chloe").await;
    assert_eq!(
        send(&s, &HeaderMap::new(), command("document-op-0001"))
            .await
            .unwrap_err()
            .0,
        StatusCode::UNAUTHORIZED
    );
    assert!(send(&s, &owner, command("document-op-0001")).await.is_ok());
    let mut c = command("document-op-0002");
    c.employee_id = "emp-mario".into();
    assert_eq!(
        send(&s, &owner, c).await.unwrap_err().0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        workspace(
            State(s.clone()),
            Path("beynost".into()),
            Query(Page::default()),
            owner.clone()
        )
        .await
        .unwrap_err()
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        own(
            State(s.clone()),
            Path("carre-de-soie".into()),
            Query(Page::default()),
            owner
        )
        .await
        .unwrap_err()
        .0,
        StatusCode::FORBIDDEN
    );
}
#[tokio::test]
async fn upload_retry_is_atomic_and_preserves_original_private_bytes() {
    let s = state();
    let admin = headers(&s, "emp-mario").await;
    let (a, b) = tokio::join!(
        send(&s, &admin, command("document-op-0003")),
        send(&s, &admin, command("document-op-0003"))
    );
    let id = a.unwrap().0["documentId"].as_str().unwrap().to_string();
    assert_eq!(b.unwrap().0["documentId"], id);
    assert_eq!(
        s.db.read().await.personal_workspace.documents.files.len(),
        1
    );
    let mut changed = command("document-op-0003");
    changed.title = "Changed".into();
    assert_eq!(
        send(&s, &admin, changed).await.unwrap_err().0,
        StatusCode::CONFLICT
    );
    let owner = headers(&s, "emp-chloe").await;
    let response = file(&s, &owner, &id).await.unwrap();
    assert_eq!(response.headers()["cache-control"], "private, no-store");
    assert_eq!(response.headers()["x-content-type-options"], "nosniff");
    let bytes = axum::body::to_bytes(response.into_body(), MAX_BYTES)
        .await
        .unwrap();
    assert_eq!(
        bytes.as_ref(),
        STANDARD.decode(command("document-op-0003").base64).unwrap()
    );
    let other = headers(&s, "emp-lea").await;
    assert_eq!(
        file(&s, &other, &id).await.unwrap_err().0,
        StatusCode::NOT_FOUND
    );
    let reloaded = load_or_init_state_with_mode(&s.data_dir, true);
    assert_eq!(reloaded.personal_workspace.documents.files[0].id, id);
    assert_eq!(
        std::fs::read_dir(s.data_dir.join("rh-documents"))
            .unwrap()
            .count(),
        1
    );
}
#[tokio::test]
async fn failed_metadata_write_cleans_only_new_file_and_preserves_existing_document() {
    let s = state();
    let h = headers(&s, "emp-mario").await;
    let id = send(&s, &h, command("document-op-0004")).await.unwrap().0["documentId"]
        .as_str()
        .unwrap()
        .to_owned();
    let before = serde_json::to_value(&*s.db.read().await).unwrap();
    let disk = std::fs::read(s.data_dir.join("cfitness_state.json")).unwrap();
    let blocker = s.data_dir.join("cfitness_state.json.tmp");
    std::fs::create_dir(&blocker).unwrap();
    assert_eq!(
        send(&s, &h, command("document-op-0005"))
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
        std::fs::read_dir(s.data_dir.join("rh-documents"))
            .unwrap()
            .count(),
        1
    );
    assert!(file(&s, &h, &id).await.is_ok());
    std::fs::remove_dir(blocker).unwrap();
    assert!(send(&s, &h, command("document-op-0005")).await.is_ok());
}
#[tokio::test]
async fn acknowledgement_is_own_explicit_idempotent_and_not_a_signature() {
    let s = state();
    let admin = headers(&s, "emp-mario").await;
    let owner = headers(&s, "emp-chloe").await;
    let id = send(&s, &admin, command("document-op-0006"))
        .await
        .unwrap()
        .0["documentId"]
        .as_str()
        .unwrap()
        .to_owned();
    let path = || Path(("beynost".into(), id.clone()));
    assert_eq!(
        acknowledge(
            State(s.clone()),
            path(),
            admin,
            Json(Acknowledge { consent: true })
        )
        .await
        .unwrap_err()
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        acknowledge(
            State(s.clone()),
            path(),
            owner.clone(),
            Json(Acknowledge { consent: false })
        )
        .await
        .unwrap_err()
        .0,
        StatusCode::BAD_REQUEST
    );
    let first = acknowledge(
        State(s.clone()),
        path(),
        owner.clone(),
        Json(Acknowledge { consent: true }),
    )
    .await
    .unwrap()
    .0;
    let audit = s.db.read().await.audit_log.len();
    let second = acknowledge(
        State(s.clone()),
        path(),
        owner,
        Json(Acknowledge { consent: true }),
    )
    .await
    .unwrap()
    .0;
    assert_eq!(
        first["documents"][0]["acknowledgedAt"],
        second["documents"][0]["acknowledgedAt"]
    );
    assert_eq!(s.db.read().await.audit_log.len(), audit);
    assert!(first["documents"][0].get("signatureProof").is_none());
    assert!(
        crate::personal_workspace::person(&*s.db.read().await, "emp-mario")["notifications"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["type"] == "rh_document")
    );
}
#[tokio::test]
async fn archive_is_manager_scoped_reversible_and_keeps_historical_employee_files() {
    let s = state();
    let manager = headers(&s, "emp-mario").await;
    let owner = headers(&s, "emp-chloe").await;
    let id = send(&s, &owner, command("document-op-0007"))
        .await
        .unwrap()
        .0["documentId"]
        .as_str()
        .unwrap()
        .to_owned();
    let path = || Path(("beynost".into(), id.clone()));
    assert_eq!(
        archive(
            State(s.clone()),
            path(),
            owner.clone(),
            Json(Archive { archived: true })
        )
        .await
        .unwrap_err()
        .0,
        StatusCode::NOT_FOUND
    );
    let _ = archive(
        State(s.clone()),
        path(),
        manager.clone(),
        Json(Archive { archived: true }),
    )
    .await
    .unwrap();
    assert_eq!(
        file(&s, &owner, &id).await.unwrap_err().0,
        StatusCode::NOT_FOUND
    );
    assert!(file(&s, &manager, &id).await.is_ok());
    let _ = archive(
        State(s.clone()),
        path(),
        manager.clone(),
        Json(Archive { archived: false }),
    )
    .await
    .unwrap();
    assert!(file(&s, &owner, &id).await.is_ok());
    s.db.write()
        .await
        .employees
        .iter_mut()
        .find(|e| e.id == "emp-chloe")
        .unwrap()
        .active = false;
    assert!(file(&s, &manager, &id).await.is_ok());
    assert_eq!(
        file(&s, &owner, &id).await.unwrap_err().0,
        StatusCode::FORBIDDEN
    );
}
#[tokio::test]
async fn missing_or_tampered_bytes_fail_instead_of_returning_empty_or_wrong_content() {
    let s = state();
    let h = headers(&s, "emp-mario").await;
    let id = send(&s, &h, command("document-op-0008")).await.unwrap().0["documentId"]
        .as_str()
        .unwrap()
        .to_owned();
    std::fs::write(bytes_path(&s, &id), b"changed").unwrap();
    assert_eq!(
        file(&s, &h, &id).await.unwrap_err().0,
        StatusCode::SERVICE_UNAVAILABLE
    );
    std::fs::remove_file(bytes_path(&s, &id)).unwrap();
    assert_eq!(
        file(&s, &h, &id).await.unwrap_err().0,
        StatusCode::SERVICE_UNAVAILABLE
    );
}
#[test]
fn content_validation_rejects_forged_types_paths_size_and_unknown_categories() {
    for mode in [
        "type",
        "extension",
        "path",
        "category",
        "base64",
        "empty",
        "oversize",
    ] {
        let mut c = command("document-op-0009");
        match mode {
            "type" => c.media_type = "text/html".into(),
            "extension" => c.file_name = "notice.docx".into(),
            "path" => c.file_name = "../notice.pdf".into(),
            "category" => c.category = "Unknown".into(),
            "base64" => c.base64 = "!!!!".into(),
            "empty" => c.base64 = String::new(),
            "oversize" => c.base64 = STANDARD.encode(vec![1; MAX_BYTES + 1]),
            _ => {}
        }
        assert!(validate(&c).is_err(), "{mode}");
    }
}
#[tokio::test]
async fn document_list_and_download_recheck_managed_teams_and_pagination() {
    let s = state();
    let h = headers(&s, "emp-mario").await;
    let mut c = command("document-op-0010");
    c.employee_id = "emp-maxime".into();
    let value = upload(State(s.clone()), Path("carre-de-soie".into()), h, Json(c))
        .await
        .unwrap()
        .0;
    {
        let mut db = s.db.write().await;
        let profile = db
            .profiles
            .iter_mut()
            .find(|p| p.id == "planificateur_avance")
            .unwrap();
        profile.scope_selected = "teams".into();
        for row in &mut profile.rows {
            if row.action_id == "ORG04-14" {
                row.exposed = true;
                row.checked = Some(true);
                row.disabled = Some(false);
            }
        }
        for employee in &mut db.employees {
            if let Some(a) = employee
                .site_accesses
                .iter_mut()
                .find(|a| a.site_id == "club-carre-soie")
            {
                if employee.id == "emp-sarah" {
                    a.profile_id = "planificateur_avance".into();
                    a.managed_team_ids = vec!["managed-test".into()];
                }
                if employee.id == "emp-maxime" {
                    a.team_ids = vec!["managed-test".into()];
                }
            }
        }
        assert_eq!(
            view(&db, "emp-sarah", "carre-de-soie", false, &Page::default()).unwrap()["documents"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        db.employees
            .iter_mut()
            .find(|e| e.id == "emp-maxime")
            .unwrap()
            .site_accesses
            .iter_mut()
            .find(|a| a.site_id == "club-carre-soie")
            .unwrap()
            .team_ids = vec!["outside".into()];
        assert!(
            view(&db, "emp-sarah", "carre-de-soie", false, &Page::default()).unwrap()["documents"]
                .as_array()
                .unwrap()
                .is_empty()
        );
        let template = db.personal_workspace.documents.files[0].clone();
        for i in 0..51 {
            let mut copy = template.clone();
            copy.id = format!("page-{i}");
            db.personal_workspace.documents.files.push(copy);
        }
        let first = view(&db, "emp-mario", "carre-de-soie", false, &Page::default()).unwrap();
        assert_eq!(first["documents"].as_array().unwrap().len(), 50);
        let second = view(
            &db,
            "emp-mario",
            "carre-de-soie",
            false,
            &Page {
                before: first["nextCursor"].as_str().map(str::to_owned),
                include_archived: false,
            },
        )
        .unwrap();
        assert_eq!(second["documents"].as_array().unwrap().len(), 2);
    }
    let sarah = headers(&s, "emp-sarah").await;
    assert_eq!(
        download(
            State(s.clone()),
            Path((
                "carre-de-soie".into(),
                value["documentId"].as_str().unwrap().into()
            )),
            sarah
        )
        .await
        .unwrap_err()
        .0,
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn acknowledgement_archival_and_restore_do_not_confirm_failed_writes() {
    let s = state();
    let manager = headers(&s, "emp-mario").await;
    let owner = headers(&s, "emp-chloe").await;
    let id = send(&s, &manager, command("document-op-0011"))
        .await
        .unwrap()
        .0["documentId"]
        .as_str()
        .unwrap()
        .to_owned();
    let path = || Path(("beynost".into(), id.clone()));
    let blocker = s.data_dir.join("cfitness_state.json.tmp");
    let before = serde_json::to_value(&*s.db.read().await).unwrap();
    std::fs::create_dir(&blocker).unwrap();
    assert_eq!(
        acknowledge(
            State(s.clone()),
            path(),
            owner,
            Json(Acknowledge { consent: true })
        )
        .await
        .unwrap_err()
        .0,
        StatusCode::INTERNAL_SERVER_ERROR
    );
    assert_eq!(
        archive(
            State(s.clone()),
            path(),
            manager.clone(),
            Json(Archive { archived: true })
        )
        .await
        .unwrap_err()
        .0,
        StatusCode::INTERNAL_SERVER_ERROR
    );
    assert_eq!(serde_json::to_value(&*s.db.read().await).unwrap(), before);
    std::fs::remove_dir(&blocker).unwrap();
    let _ = archive(
        State(s.clone()),
        path(),
        manager.clone(),
        Json(Archive { archived: true }),
    )
    .await
    .unwrap();
    let before = serde_json::to_value(&*s.db.read().await).unwrap();
    std::fs::create_dir(&blocker).unwrap();
    assert_eq!(
        archive(
            State(s.clone()),
            path(),
            manager,
            Json(Archive { archived: false })
        )
        .await
        .unwrap_err()
        .0,
        StatusCode::INTERNAL_SERVER_ERROR
    );
    assert_eq!(serde_json::to_value(&*s.db.read().await).unwrap(), before);
}

#[test]
fn real_png_and_jpeg_are_decoded_and_oversized_dimensions_are_refused() {
    for (format, mime, name) in [
        (image::ImageFormat::Png, "image/png", "test.png"),
        (image::ImageFormat::Jpeg, "image/jpeg", "test.jpg"),
    ] {
        let mut bytes = Vec::new();
        image::DynamicImage::new_rgb8(2, 2)
            .write_to(&mut Cursor::new(&mut bytes), format)
            .unwrap();
        let mut c = command("document-op-0012");
        c.file_name = name.into();
        c.media_type = mime.into();
        c.base64 = STANDARD.encode(&bytes);
        assert_eq!(validate(&c).unwrap(), bytes);
    }
    let mut bytes = Vec::new();
    image::DynamicImage::new_rgb8(4097, 1)
        .write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png)
        .unwrap();
    let mut c = command("document-op-0013");
    c.file_name = "large.png".into();
    c.media_type = "image/png".into();
    c.base64 = STANDARD.encode(bytes);
    assert!(validate(&c).is_err());
}
