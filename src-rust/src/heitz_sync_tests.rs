use super::*;
use crate::routes::SharedAppState;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    sync::{Mutex, RwLock},
};

#[test]
fn club_ids_are_not_guessed_from_a_member_identifier() {
    assert_eq!(
        infer_club_id_from_heitz_id(38450001234, Some(9999)),
        "unassigned"
    );
    assert_eq!(infer_club_id_from_heitz_id(38450001234, None), "unassigned");
    assert_eq!(
        infer_club_id_from_heitz_id(100, Some(3845)),
        "carre-de-soie"
    );
    assert_eq!(infer_club_id_from_heitz_id(100, Some(4967)), "beynost");
}

struct EnvRestore(Vec<(&'static str, Option<String>)>);
impl EnvRestore {
    fn set(values: &[(&'static str, String)]) -> Self {
        let previous = values
            .iter()
            .map(|(key, value)| {
                let old = std::env::var(key).ok();
                std::env::set_var(key, value);
                (*key, old)
            })
            .collect();
        Self(previous)
    }
}
impl Drop for EnvRestore {
    fn drop(&mut self) {
        for (key, old) in &self.0 {
            match old {
                Some(v) => std::env::set_var(key, v),
                None => std::env::remove_var(key),
            }
        }
    }
}

#[tokio::test]
async fn pagination_failures_empty_results_disk_failure_and_restart_preserve_local_work() {
    let _env_lock = HEITZ_LIVE_TEST_ENV.lock().await;
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let mode = Arc::new(AtomicUsize::new(0));
    let offsets = Arc::new(Mutex::new(Vec::new()));
    let mode_server = mode.clone();
    let offsets_server = offsets.clone();
    let server = tokio::spawn(async move {
        loop {
            let Ok((mut socket, _)) = listener.accept().await else {
                break;
            };
            let mode = mode_server.clone();
            let offsets = offsets_server.clone();
            tokio::spawn(async move {
                let mut buffer = vec![0; 8192];
                let count = socket.read(&mut buffer).await.unwrap();
                let request = String::from_utf8_lossy(&buffer[..count]);
                let first = request.lines().next().unwrap_or("");
                let phase = mode.load(Ordering::SeqCst);
                let mut status = "200 OK";
                let body = if first.contains("/api/developer/getToken") {
                    json!({"token":"local-mock-token"})
                } else if first.contains("/fictive/bounded?offset=") {
                    let offset = first
                        .split("offset=")
                        .nth(1)
                        .unwrap()
                        .split_whitespace()
                        .next()
                        .unwrap()
                        .parse::<usize>()
                        .unwrap();
                    json!([{"id":offset+1}])
                } else if first.contains("/api/users/search") {
                    let offset = first
                        .split("_offset=")
                        .nth(1)
                        .unwrap()
                        .split('&')
                        .next()
                        .unwrap()
                        .parse::<usize>()
                        .unwrap();
                    offsets.lock().await.push(offset);
                    if phase == 2 && offset >= 120 {
                        status = "503 Service Unavailable";
                        json!({"error":"fictive outage"})
                    } else if phase == 3 && offset >= 120 {
                        json!({"unexpected":"not a page"})
                    } else if phase == 6 {
                        json!([])
                    } else {
                        let start = if phase == 4 { 0 } else { offset };
                        let mut rows = (start..(start+120).min(241)).map(|i| {
                            let mut row = json!({"id":100+i,"firstName":"Fictif","lastName":format!("Test{}",i),"type":0,
                                "idCenter":if phase==7 {9999}else{3845},"_finBalance":if i==0 {if phase==1 {-55.0}else if phase==10 {0.0}else{-40.0}}else{0.0},"_subscriptions":[]});
                            if phase==14 && i==0 { row["finBalance"]=json!(0); }
                            if phase==9 && i==0 { row.as_object_mut().unwrap().remove("_finBalance"); }
                            if phase==11 && i==0 { row.as_object_mut().unwrap().remove("id"); }
                            if phase==12 && i==0 { row["id"]=json!(0); } row
                        }).collect::<Vec<_>>();
                        if phase == 13 && offset == 0 {
                            rows.push(rows[0].clone());
                        }
                        json!(rows)
                    }
                } else if first.contains("/api/ticket") && phase == 15 {
                    json!([{"id":1,"creationIdCenter":3845}])
                } else if first.contains("/api/fmi/date/") {
                    if phase == 5 {
                        status = "503 Service Unavailable";
                        json!({"error":"fictive FMI outage"})
                    } else {
                        json!({"internalIn":{"H24":0},"internalPresent":{"H0":0}})
                    }
                } else if first.contains("/api/ticket") && phase == 8 {
                    status = "503 Service Unavailable";
                    json!({"error":"fictive ticket outage"})
                } else {
                    json!([])
                };
                let raw = body.to_string();
                let response=format!("HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",status,raw.len(),raw);
                socket.write_all(response.as_bytes()).await.unwrap();
            });
        }
    });
    let _env = EnvRestore::set(&[
        ("HEITZ_WS_URL", format!("http://{}", address)),
        ("HEITZ_DEV_ID", "fictive-id".into()),
        ("HEITZ_DEV_KEY", "fictive-key".into()),
        ("HEITZ_CENTER_ID_CDS", "3845".into()),
        ("HEITZ_CENTER_ID_BEY", "4967".into()),
    ]);
    let folder = std::env::temp_dir().join(format!(
        "heitz-preservation-{:032x}",
        rand::random::<u128>()
    ));
    std::fs::create_dir(&folder).unwrap();
    let mut initial = crate::seed::create_initial_seed_state();
    initial.heitz_members.clear();
    initial.recovery_cases.clear();
    initial.heitz_members.push(serde_json::from_value(json!({"id":"local-retained","badgeCode":"LOCAL-FICTIF","rfidBluetoothEnabled":false,"firstName":"Local","lastName":"Fictif","phone":"","homeClubId":"beynost","subscriptionName":"À vérifier","activeSubscription":false,"finBalanceEur":0,"finBalanceState":1})).unwrap());
    crate::seed::persist_state(&folder, &initial).unwrap();
    let state = Arc::new(SharedAppState {
        db: RwLock::new(initial),
        data_dir: folder.clone(),
        sessions: RwLock::new(HashMap::new()),
        login_attempts: RwLock::new(HashMap::new()),
    });
    let result = run_heitz_live_sync(&state, "service-test").await.unwrap();
    assert_eq!(result.synced_members_count, 241);
    assert_eq!(*offsets.lock().await, vec![0, 120, 240]);
    {
        let mut db = state.db.write().await;
        assert_eq!(db.heitz_members.len(), 242);
        assert!(db.heitz_members.iter().any(|m| m.id == "hz-100")); // No arbitrary >10000 cutoff.
        assert!(db.heitz_members.iter().any(|m| m.id == "hz-340"));
        let debt = db
            .recovery_cases
            .iter_mut()
            .find(|r| r.member_id == "hz-100")
            .unwrap();
        debt.status = "en_cours".into();
        debt.relance_count = 4;
        debt.last_action_note = "Suivi local fictif conservé".into();
        debt.days_overdue = 42;
        debt.billed_months = vec!["2026-09".into()];
        debt.has_signed_contract = false;
        let member = db
            .heitz_members
            .iter_mut()
            .find(|m| m.id == "hz-100")
            .unwrap();
        member.mywellness_member_id = Some("local-link".into());
        member.technogym_moves30d = 734;
        crate::seed::persist_state(&folder, &db).unwrap();
    }
    mode.store(1, Ordering::SeqCst);
    run_heitz_live_sync(&state, "service-test").await.unwrap();
    {
        let db = state.db.read().await;
        let debt = db
            .recovery_cases
            .iter()
            .find(|r| r.member_id == "hz-100")
            .unwrap();
        assert_eq!(debt.amount_due_eur, 55.0);
        assert_eq!(debt.relance_count, 4);
        assert_eq!(debt.status, "en_cours");
        assert_eq!(debt.last_action_note, "Suivi local fictif conservé");
        assert_eq!(debt.days_overdue, 42);
        assert_eq!(debt.billed_months, vec!["2026-09"]);
        assert!(!debt.has_signed_contract);
        let m = db.heitz_members.iter().find(|m| m.id == "hz-100").unwrap();
        assert_eq!(m.technogym_moves30d, 734);
        assert_eq!(m.mywellness_member_id.as_deref(), Some("local-link"));
    }
    for phase in [2, 3, 4, 9, 11, 12, 13, 14] {
        let memory = serde_json::to_value(&*state.db.read().await).unwrap();
        let disk = std::fs::read(folder.join("cfitness_state.json")).unwrap();
        mode.store(phase, Ordering::SeqCst);
        assert!(
            run_heitz_live_sync(&state, "service-test").await.is_err(),
            "phase {}",
            phase
        );
        assert_eq!(
            serde_json::to_value(&*state.db.read().await).unwrap(),
            memory,
            "memory phase {}",
            phase
        );
        assert_eq!(
            std::fs::read(folder.join("cfitness_state.json")).unwrap(),
            disk,
            "disk phase {}",
            phase
        );
    }
    mode.store(1, Ordering::SeqCst);
    let blocker = folder.join("cfitness_state.json.tmp");
    std::fs::create_dir(&blocker).unwrap();
    let memory = serde_json::to_value(&*state.db.read().await).unwrap();
    let disk = std::fs::read(folder.join("cfitness_state.json")).unwrap();
    assert!(run_heitz_live_sync(&state, "service-test").await.is_err());
    assert_eq!(
        serde_json::to_value(&*state.db.read().await).unwrap(),
        memory
    );
    assert_eq!(
        std::fs::read(folder.join("cfitness_state.json")).unwrap(),
        disk
    );
    std::fs::remove_dir(blocker).unwrap();
    mode.store(15, Ordering::SeqCst);
    let partial_financial = run_heitz_live_sync(&state, "service-test").await.unwrap();
    assert!(partial_financial.partial_sync);
    assert!(partial_financial.financial_collection["ticketsRead"].is_null());
    mode.store(5, Ordering::SeqCst);
    let partial = run_heitz_live_sync(&state, "service-test").await.unwrap();
    assert!(partial.partial_sync && !partial.warnings.is_empty());
    assert!(
        heitz_fetch_paginated("local-mock-token", 1, 5, |offset, _| format!(
            "/fictive/bounded?offset={}",
            offset
        ))
        .await
        .is_err()
    );
    mode.store(6, Ordering::SeqCst);
    run_heitz_live_sync(&state, "service-test").await.unwrap();
    let db = state.db.read().await;
    assert_eq!(db.heitz_members.len(), 242);
    assert_eq!(db.recovery_cases[0].relance_count, 4);
    let reloaded = crate::seed::try_load_or_init_state(&folder).unwrap();
    assert_eq!(
        serde_json::to_value(&reloaded).unwrap(),
        serde_json::to_value(&*db).unwrap()
    );
    drop(db);
    mode.store(10, Ordering::SeqCst);
    run_heitz_live_sync(&state, "service-test").await.unwrap();
    let db = state.db.read().await;
    let debt = db
        .recovery_cases
        .iter()
        .find(|r| r.member_id == "hz-100")
        .unwrap();
    assert_eq!(debt.status, "regularise");
    assert_eq!(debt.amount_due_eur, 0.0);
    assert_eq!(debt.relance_count, 4);
    assert!(debt
        .last_action_note
        .contains("Suivi local fictif conservé"));
    let settled_revision = debt.source_balance_revision.clone();
    assert!(settled_revision.is_some());
    drop(db);
    mode.store(1, Ordering::SeqCst);
    run_heitz_live_sync(&state, "service-test").await.unwrap();
    let reopened = state
        .db
        .read()
        .await
        .recovery_cases
        .iter()
        .find(|r| r.member_id == "hz-100")
        .unwrap()
        .clone();
    assert_eq!(reopened.status, "a_relancer");
    assert_eq!(reopened.amount_due_eur, 55.0);
    assert_eq!(reopened.relance_count, 4);
    assert!(reopened
        .last_action_note
        .contains("rapprochement nécessaire"));
    assert_ne!(reopened.source_balance_revision, settled_revision);
    run_heitz_live_sync(&state, "service-test").await.unwrap();
    assert_eq!(
        state
            .db
            .read()
            .await
            .recovery_cases
            .iter()
            .find(|r| r.member_id == "hz-100")
            .unwrap()
            .source_balance_revision,
        reopened.source_balance_revision
    );
    server.abort();
    std::fs::remove_dir_all(folder).unwrap();
}
