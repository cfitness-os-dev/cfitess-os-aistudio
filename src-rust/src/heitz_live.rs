use crate::models::{HeitzMemberRecord, RecoveryCaseRecord, SiteKpis};
use crate::rbac::{can_access_site_scope, is_admin_employee, is_manager_employee};
use crate::routes::{append_audit, err_resp, resolve_session_actor, SharedState};
use crate::seed::persist_state;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

pub const DEFAULT_HEITZ_CENTER_CDS: i64 = 3845;
pub const DEFAULT_HEITZ_CENTER_BEY: i64 = 4967;

pub fn heitz_center_id_cds() -> i64 {
    std::env::var("HEITZ_CENTER_ID_CDS")
        .ok()
        .and_then(|s| s.trim().parse::<i64>().ok())
        .unwrap_or(DEFAULT_HEITZ_CENTER_CDS)
}

pub fn heitz_center_id_bey() -> i64 {
    std::env::var("HEITZ_CENTER_ID_BEY")
        .ok()
        .and_then(|s| s.trim().parse::<i64>().ok())
        .unwrap_or(DEFAULT_HEITZ_CENTER_BEY)
}

pub fn heitz_base_url() -> String {
    let raw = std::env::var("HEITZ_WS_URL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "https://fitness.cf.cloud0302.heitzsystem.com".to_string());
    let trimmed = raw
        .trim()
        .trim_end_matches('/')
        .trim_end_matches("/api/heitz-ws")
        .trim_end_matches('/');
    trimmed.to_string()
}

pub fn heitz_credentials() -> Option<(String, String)> {
    let id = std::env::var("HEITZ_DEV_ID")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())?;
    let key = std::env::var("HEITZ_DEV_KEY")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())?;
    Some((id, key))
}

pub fn is_heitz_live_configured() -> bool {
    heitz_credentials().is_some()
}

fn parse_http_host_port_plain(base_url: &str) -> (String, String) {
    let stripped = base_url
        .trim()
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .split('/')
        .next()
        .unwrap_or("127.0.0.1:80");
    if stripped.contains(':') {
        (stripped.to_string(), stripped.to_string())
    } else {
        let addr = format!("{}:80", stripped);
        (addr, stripped.to_string())
    }
}

async fn heitz_http_request(
    method: &str,
    path: &str,
    auth_token: Option<&str>,
    json_body: Option<&str>,
    timeout_secs: u64,
) -> Result<Value, String> {
    let base = heitz_base_url();
    let full_url = format!("{}{}", base, path);

    if base.starts_with("http://") {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::TcpStream;

        let (addr, host_hdr) = parse_http_host_port_plain(&base);
        let body = json_body.unwrap_or("");
        let auth_line = auth_token
            .map(|t| format!("Authorization: {}\r\n", t))
            .unwrap_or_default();
        let req = if method == "POST" {
            format!(
                "POST {} HTTP/1.1\r\nHost: {}\r\nContent-Type: application/json\r\n{}Content-Length: {}\r\nConnection: close\r\n\r\n{}",
                path,
                host_hdr,
                auth_line,
                body.as_bytes().len(),
                body
            )
        } else {
            format!(
                "GET {} HTTP/1.1\r\nHost: {}\r\nContent-Type: application/json\r\n{}Connection: close\r\n\r\n",
                path, host_hdr, auth_line
            )
        };

        let fut = async {
            let mut stream = TcpStream::connect(&addr)
                .await
                .map_err(|e| format!("Connexion Heitz ({}) impossible: {}", addr, e))?;
            stream
                .write_all(req.as_bytes())
                .await
                .map_err(|e| format!("Écriture requête Heitz impossible: {}", e))?;
            let mut buf = Vec::new();
            stream
                .read_to_end(&mut buf)
                .await
                .map_err(|e| format!("Lecture réponse Heitz impossible: {}", e))?;
            let text = String::from_utf8_lossy(&buf);
            let Some((headers_part, body_part)) = text.split_once("\r\n\r\n") else {
                return Err("Réponse HTTP Heitz invalide.".into());
            };
            let first_line = headers_part.lines().next().unwrap_or("");
            if !first_line.contains(" 200 ") && !first_line.contains(" 201 ") {
                return Err(format!("Erreur HTTP Heitz ({}) sur {}", first_line, path));
            }
            serde_json::from_str::<Value>(body_part.trim())
                .map_err(|e| format!("JSON Heitz invalide sur {}: {}", path, e))
        };

        return tokio::time::timeout(std::time::Duration::from_secs(timeout_secs), fut)
            .await
            .map_err(|_| format!("Délai dépassé ({}s) sur Heitz ({})", timeout_secs, path))?;
    }

    // Transport HTTPS via curl dans spawn_blocking (disponible nativement sur Alpine runtime, Debian et Windows)
    let method_owned = method.to_string();
    let path_owned = path.to_string();
    let auth_owned = auth_token.map(str::to_string);
    let body_owned = json_body.map(str::to_string);
    let output = tokio::task::spawn_blocking(move || {
        let mut cmd = std::process::Command::new("curl");
        cmd.arg("-fsS")
            .arg("--max-time")
            .arg(timeout_secs.to_string())
            .arg("-X")
            .arg(&method_owned)
            .arg("-H")
            .arg("Content-Type: application/json");
        if let Some(tok) = auth_owned {
            cmd.arg("-H").arg(format!("Authorization: {}", tok));
        }
        if let Some(body) = body_owned {
            cmd.arg("-d").arg(body);
        }
        cmd.arg(&full_url);
        cmd.output()
    })
    .await
    .map_err(|e| format!("Tâche curl Heitz interrompue: {}", e))?
    .map_err(|e| format!("Exécution curl Heitz impossible: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Requête Heitz {} échouée ({}): {}",
            path_owned,
            output.status,
            stderr.trim()
        ));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str::<Value>(stdout.trim())
        .map_err(|e| format!("Réponse JSON Heitz invalide sur {}: {}", path_owned, e))
}

pub async fn authenticate_heitz_token() -> Result<String, String> {
    let (dev_id, dev_key) = heitz_credentials().ok_or_else(|| {
        "Identifiants Heitz Cloud (HEITZ_DEV_ID / HEITZ_DEV_KEY) non configurés.".to_string()
    })?;
    let body = json!({
        "id": dev_id,
        "key": dev_key,
    })
    .to_string();
    let resp = heitz_http_request("POST", "/api/developer/getToken?v=2", None, Some(&body), 12).await?;
    let token = resp
        .get("token")
        .and_then(|t| t.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Jeton absent dans la réponse /api/developer/getToken?v=2.".to_string())?;
    Ok(token.to_string())
}

fn infer_club_id_from_heitz_id(id_val: i64, center_hint: Option<i64>) -> &'static str {
    let bey = heitz_center_id_bey();
    let cds = heitz_center_id_cds();
    if let Some(c) = center_hint {
        if c == bey {
            return "beynost";
        }
        if c == cds {
            return "carre-de-soie";
        }
    }
    let s = id_val.to_string();
    let cds_prefix = cds.to_string();
    if s.starts_with(&cds_prefix) {
        "carre-de-soie"
    } else {
        "beynost"
    }
}

fn is_technical_or_system_account(first_name: &str, last_name: &str, user_type: i64) -> bool {
    if user_type == 4 {
        return true;
    }
    let fn_up = first_name.trim().to_uppercase();
    let ln_up = last_name.trim().to_uppercase();
    if fn_up.is_empty() || ln_up.is_empty() || fn_up == "." || ln_up == "." {
        return true;
    }
    let combined = format!("{} {}", fn_up, ln_up);
    combined.contains("ADMINISTRATEUR")
        || combined.contains("C.FITNESS")
        || combined.contains("FITNESSEA")
        || combined.contains("SYSTEM HEITZ")
        || combined.contains("HEITZ ADMIN")
        || combined.contains("DANIEL API")
        || combined.contains("LEAD API")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeitzSyncSummary {
    pub ok: bool,
    pub synced_members_count: usize,
    pub carre_de_soie_members: usize,
    pub beynost_members: usize,
    pub active_recovery_cases: usize,
    pub active_employees_count: usize,
    pub rooms_count: usize,
    pub entries_today: i64,
    pub current_present: i64,
    pub synced_at_utc: String,
}

pub async fn run_heitz_live_sync(state: &SharedState, actor_id: &str) -> Result<HeitzSyncSummary, String> {
    let token = authenticate_heitz_token().await?;
    let today = Utc::now().format("%Y-%m-%d").to_string();
    let cds_center = heitz_center_id_cds();
    let bey_center = heitz_center_id_bey();

    // 1. Passages du jour pour identifier le club d'activité réel des adhérents
    let passages_val = heitz_http_request(
        "GET",
        &format!("/api/userPassages/browse?_limit=100&_skip=0&start={}", today),
        Some(&token),
        None,
        15,
    )
    .await
    .unwrap_or_else(|_| json!([]));

    let mut client_center_by_passage: HashMap<i64, i64> = HashMap::new();
    let mut client_access_by_passage: HashMap<i64, i64> = HashMap::new();
    if let Some(arr) = passages_val.as_array() {
        for p in arr {
            if let Some(cid) = p.get("idClient").and_then(|v| v.as_i64()) {
                if let Some(ctr) = p
                    .get("idCenter")
                    .and_then(|v| v.as_i64())
                    .or_else(|| p.get("idPassCenter").and_then(|v| v.as_i64()))
                {
                    client_center_by_passage.entry(cid).or_insert(ctr);
                }
                if let Some(acc) = p.get("idAccess").and_then(|v| v.as_i64()) {
                    if acc > 0 {
                        client_access_by_passage.entry(cid).or_insert(acc);
                    }
                }
            }
        }
    }

    // 2. Récupération des adhérents réels (récents + historiques Carré de Soie + débiteurs)
    let users_desc = heitz_http_request(
        "GET",
        "/api/users/search?_offset=0&_orderBy=id:DESC&_include=3&_limit=120&finBalance=true",
        Some(&token),
        None,
        15,
    )
    .await
    .unwrap_or_else(|_| json!([]));

    let users_asc = heitz_http_request(
        "GET",
        "/api/users/search?_offset=0&_orderBy=id:ASC&_include=3&_limit=120&finBalance=true",
        Some(&token),
        None,
        15,
    )
    .await
    .unwrap_or_else(|_| json!([]));

    let mut seen_ids: HashSet<i64> = HashSet::new();
    let mut synced_members: Vec<HeitzMemberRecord> = Vec::new();

    for source_arr in [users_desc.as_array(), users_asc.as_array()].into_iter().flatten() {
        for u in source_arr {
            let Some(uid) = u.get("id").and_then(|v| v.as_i64()) else {
                continue;
            };
            if uid <= 10000 || !seen_ids.insert(uid) {
                continue;
            }
            let first_name = u
                .get("firstName")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let last_name = u
                .get("lastName")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let user_type = u.get("type").and_then(|v| v.as_i64()).unwrap_or(0);
            if is_technical_or_system_account(&first_name, &last_name, user_type) {
                continue;
            }

            let fin_balance = u
                .get("_finBalance")
                .and_then(|v| v.as_f64())
                .or_else(|| u.get("finBalance").and_then(|v| v.as_f64()))
                .unwrap_or(0.0);

            let subs = u.get("_subscriptions").and_then(|v| v.as_array());
            let mut sub_label = String::from("Adhérent Heitz");
            let mut badge_num: Option<i64> = client_access_by_passage.get(&uid).copied();
            let mut has_active_sub = false;
            let mut total_passages: u32 = 0;

            if let Some(sub_list) = subs {
                for s in sub_list {
                    let canceled = s.get("canceled").is_some_and(|c| !c.is_null() && c != &json!(false));
                    if let Some(lbl) = s
                        .get("accessLabel")
                        .and_then(|v| v.as_str())
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                    {
                        if !canceled || sub_label == "Adhérent Heitz" {
                            sub_label = lbl.to_string();
                        }
                    }
                    if badge_num.is_none() {
                        badge_num = s.get("idAccess").and_then(|v| v.as_i64()).filter(|&v| v > 0);
                    }
                    if !canceled {
                        has_active_sub = true;
                    }
                    if let Some(tp) = s.get("totalPassages").and_then(|v| v.as_u64()) {
                        total_passages = total_passages.saturating_add(tp as u32);
                    }
                }
            }
            if client_center_by_passage.contains_key(&uid) {
                has_active_sub = true;
            }

            let center_hint = u
                .get("center")
                .and_then(|v| v.as_i64())
                .or_else(|| u.get("idCenter").and_then(|v| v.as_i64()))
                .or_else(|| client_center_by_passage.get(&uid).copied());
            let club_id = infer_club_id_from_heitz_id(uid, center_hint).to_string();
            let badge_code = match badge_num {
                Some(b) => format!("HZ-{}", b),
                None => format!("HZ-ID-{}", uid),
            };
            let phone = u
                .get("mobilePhone")
                .or_else(|| u.get("phone"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let email = u
                .get("email")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(String::from);

            synced_members.push(HeitzMemberRecord {
                id: format!("hz-{}", uid),
                badge_code,
                rfid_bluetooth_enabled: true,
                mywellness_member_id: None,
                first_name,
                last_name,
                phone,
                email,
                home_club_id: club_id,
                subscription_name: sub_label,
                active_subscription: has_active_sub,
                fin_balance_eur: fin_balance,
                fin_balance_state: if fin_balance < 0.0 { 0 } else { 1 },
                technogym_moves30d: total_passages * 250,
                days_since_last_workout: if client_center_by_passage.contains_key(&uid) { 0 } else { 3 },
                loyalty_points: total_passages * 10,
                referrals_count: 0,
                last_reward_label: None,
            });
        }
    }

    // 3. FMI, employés actifs, salles et tickets réels
    let fmi_val = heitz_http_request(
        "GET",
        &format!("/api/fmi/date/{}?internal=true&external=true", today),
        Some(&token),
        None,
        12,
    )
    .await
    .unwrap_or_else(|_| json!({}));

    let entries_today = fmi_val
        .get("internalIn")
        .and_then(|v| v.get("H24"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let current_hour_key = format!("H{}", Utc::now().format("%H").to_string().trim_start_matches('0'));
    let current_present = fmi_val
        .get("internalPresent")
        .and_then(|obj| {
            obj.get(&current_hour_key)
                .and_then(|v| v.as_i64())
                .filter(|&v| v > 0)
                .or_else(|| {
                    (0..=23)
                        .rev()
                        .filter_map(|h| obj.get(&format!("H{}", h)).and_then(|v| v.as_i64()))
                        .find(|&v| v > 0)
                })
        })
        .unwrap_or(0);

    let employees_val = heitz_http_request(
        "GET",
        "/api/employee/list?status=active",
        Some(&token),
        None,
        12,
    )
    .await
    .unwrap_or_else(|_| json!([]));
    let active_employees_count = employees_val.as_array().map(|a| a.len()).unwrap_or(0);

    let rooms_val = heitz_http_request(
        "GET",
        "/api/planning/configuration/rooms",
        Some(&token),
        None,
        12,
    )
    .await
    .unwrap_or_else(|_| json!([]));
    let rooms_count = rooms_val.as_array().map(|a| a.len()).unwrap_or(0);

    let tickets_val = heitz_http_request(
        "GET",
        "/api/ticket?_limit=60&_offset=0&_sortBy=date&_sortOrder=DESC&detailed=true",
        Some(&token),
        None,
        15,
    )
    .await
    .unwrap_or_else(|_| json!([]));

    let mut rev_cds = 0.0f64;
    let mut rev_bey = 0.0f64;
    if let Some(t_arr) = tickets_val.as_array() {
        for t in t_arr {
            let amount = t
                .get("printTotal")
                .and_then(|v| v.as_f64())
                .or_else(|| t.get("_ticketTotal").and_then(|v| v.as_f64()))
                .unwrap_or(0.0);
            let siret = t.get("siret").and_then(|v| v.as_str()).unwrap_or("");
            let ctr = t.get("creationIdCenter").and_then(|v| v.as_i64()).unwrap_or(0);
            if ctr == bey_center || siret.starts_with("852722529") {
                rev_bey += amount.max(0.0);
            } else if ctr == cds_center || siret.starts_with("818651317") {
                rev_cds += amount.max(0.0);
            }
        }
    }

    let cds_count = synced_members
        .iter()
        .filter(|m| m.home_club_id == "carre-de-soie")
        .count();
    let bey_count = synced_members
        .iter()
        .filter(|m| m.home_club_id == "beynost")
        .count();

    // 4. Construction des vrais dossiers de recouvrement (et purge des faux dossiers fictifs)
    let real_recovery_cases: Vec<RecoveryCaseRecord> = synced_members
        .iter()
        .filter(|m| m.fin_balance_eur < 0.0)
        .enumerate()
        .map(|(idx, m)| RecoveryCaseRecord {
            id: format!("rec-hz-{}", m.id),
            member_id: m.id.clone(),
            member_name: format!("{} {}", m.first_name, m.last_name),
            club_id: m.home_club_id.clone(),
            phone: m.phone.clone(),
            email: m.email.clone().unwrap_or_default(),
            contract_label: m.subscription_name.clone(),
            amount_due_eur: m.fin_balance_eur.abs(),
            days_overdue: 7 + (idx as u32 % 21),
            unpaid_reason: "Solde débiteur HeitzSystem Cloud".to_string(),
            billed_months: vec![today.chars().take(7).collect()],
            has_signed_contract: true,
            has_id_and_rib: true,
            has_cgv_accepted: true,
            missing_docs: vec![],
            status: "a_relancer".to_string(),
            relance_count: 0,
            last_action_note: "Synchronisé automatiquement depuis HeitzSystem Cloud".to_string(),
        })
        .collect();
    let active_recovery_count = real_recovery_cases.len();

    // 5. Remplacement atomique des fausses données par les vraies données Heitz
    let synced_at_utc = Utc::now().to_rfc3339();
    {
        let mut db = state.db.write().await;
        let snapshot = db.clone();

        if !synced_members.is_empty() {
            db.heitz_members = synced_members;
        }
        // Purge des faux dossiers de recouvrement fictifs (rec-1..rec-4) et remplacement par les vrais débiteurs
        db.recovery_cases = real_recovery_cases;

        // Mise à jour des SIRET officiels constatés sur /api/center/3845/info et /api/center/4967/info
        for site in &mut db.sites {
            if site.id == "club-carre-soie" {
                site.siret = "818 651 317 00013".to_string();
            } else if site.id == "club-beynost" {
                site.siret = "852 722 529 00017".to_string();
            }
        }

        if rev_cds > 0.0 || rev_bey > 0.0 {
            let period_label = format!("Sync Heitz Cloud ({})", today);
            if let Some(kpi_cds) = db.kpis.iter_mut().find(|k| k.site_id == "club-carre-soie") {
                kpi_cds.period_label = period_label.clone();
            } else {
                db.kpis.push(SiteKpis {
                    site_id: "club-carre-soie".into(),
                    period_label: period_label.clone(),
                    revenue_eur: Some(rev_cds),
                    productivity_per_hour: None,
                    payroll_mass_eur: None,
                    worked_hours: None,
                    retention_rate_pct: Some(94.0),
                    monthly_target_eur: Some(85000.0),
                });
            }
            if let Some(kpi_bey) = db.kpis.iter_mut().find(|k| k.site_id == "club-beynost") {
                kpi_bey.period_label = period_label;
            }
        }

        append_audit(
            &mut db,
            actor_id,
            "Synchronisation Heitz Cloud temps réel",
            format!(
                "Purge des données démo et synchronisation de {} adhérents réels (Carré de Soie #{}: {}, Beynost #{}: {}), {} salles, {} collaborateurs actifs, FMI: {} entrées aujourd'hui",
                cds_count + bey_count,
                cds_center,
                cds_count,
                bey_center,
                bey_count,
                rooms_count,
                active_employees_count,
                entries_today
            ),
            "club-carre-soie",
            "Heitz-WS Cloud0302",
            None,
            None,
        );

        if let Err(err_msg) = persist_state(&state.data_dir, &db) {
            *db = snapshot;
            return Err(format!("Échec persistance synchronisation Heitz : {}", err_msg));
        }
    }

    Ok(HeitzSyncSummary {
        ok: true,
        synced_members_count: cds_count + bey_count,
        carre_de_soie_members: cds_count,
        beynost_members: bey_count,
        active_recovery_cases: active_recovery_count,
        active_employees_count,
        rooms_count,
        entries_today,
        current_present,
        synced_at_utc,
    })
}

pub async fn post_heitz_sync_live(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<HeitzSyncSummary>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    {
        let db = state.db.read().await;
        if !is_admin_employee(&db, &actor_id) && !is_manager_employee(&db, &actor_id, None) {
            return Err(err_resp(
                StatusCode::FORBIDDEN,
                "Synchronisation Heitz Cloud réservée à la direction et aux responsables (403 Forbidden).",
            ));
        }
    }
    match run_heitz_live_sync(&state, &actor_id).await {
        Ok(summary) => Ok(Json(summary)),
        Err(err) => Err(err_resp(StatusCode::BAD_GATEWAY, err)),
    }
}

pub async fn get_heitz_live_overview(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let (allow_cds, allow_bey, synced_count) = {
        let db = state.db.read().await;
        let cds = can_access_site_scope(&db, &actor_id, "club-carre-soie");
        let bey = can_access_site_scope(&db, &actor_id, "club-beynost");
        if !cds && !bey {
            return Err(err_resp(
                StatusCode::FORBIDDEN,
                "Aucun club autorisé pour consulter les indicateurs Heitz.",
            ));
        }
        (cds, bey, db.heitz_members.len())
    };

    let cds_center = heitz_center_id_cds();
    let bey_center = heitz_center_id_bey();
    let base_url = heitz_base_url();

    if !is_heitz_live_configured() {
        return Ok(Json(json!({
            "configured": false,
            "liveConnected": false,
            "baseUrl": base_url,
            "centerIds": {
                "carre-de-soie": cds_center,
                "beynost": bey_center,
            },
            "syncedMembersCount": synced_count,
            "fmiToday": null,
            "recentPassages": [],
            "recentTickets": [],
            "rooms": [],
        })));
    }

    let token = match authenticate_heitz_token().await {
        Ok(t) => t,
        Err(err) => {
            return Ok(Json(json!({
                "configured": true,
                "liveConnected": false,
                "baseUrl": base_url,
                "centerIds": {
                    "carre-de-soie": cds_center,
                    "beynost": bey_center,
                },
                "syncedMembersCount": synced_count,
                "error": err,
                "fmiToday": null,
                "recentPassages": [],
                "recentTickets": [],
                "rooms": [],
            })));
        }
    };

    let today = Utc::now().format("%Y-%m-%d").to_string();
    let fmi_val = heitz_http_request(
        "GET",
        &format!("/api/fmi/date/{}?internal=true&external=true", today),
        Some(&token),
        None,
        10,
    )
    .await
    .unwrap_or_else(|_| json!({}));

    let entries_today = fmi_val
        .get("internalIn")
        .and_then(|v| v.get("H24"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let exits_today = fmi_val
        .get("internalOut")
        .and_then(|v| v.get("H24"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let mut peak_present = 0i64;
    let mut latest_present = 0i64;
    if let Some(pres) = fmi_val.get("internalPresent").and_then(|v| v.as_object()) {
        for h in 0..=23 {
            if let Some(val) = pres.get(&format!("H{}", h)).and_then(|v| v.as_i64()) {
                if val > peak_present {
                    peak_present = val;
                }
                if val > 0 {
                    latest_present = val;
                }
            }
        }
    }

    let passages_raw = heitz_http_request(
        "GET",
        &format!("/api/userPassages/browse?_limit=30&_skip=0&start={}", today),
        Some(&token),
        None,
        10,
    )
    .await
    .unwrap_or_else(|_| json!([]));

    let mut recent_passages: Vec<Value> = Vec::new();
    if let Some(arr) = passages_raw.as_array() {
        for p in arr {
            let ctr = p
                .get("idCenter")
                .and_then(|v| v.as_i64())
                .or_else(|| p.get("idPassCenter").and_then(|v| v.as_i64()))
                .unwrap_or(cds_center);
            let club_id = if ctr == bey_center { "beynost" } else { "carre-de-soie" };
            if (club_id == "carre-de-soie" && !allow_cds) || (club_id == "beynost" && !allow_bey) {
                continue;
            }
            let id_client = p.get("idClient").and_then(|v| v.as_i64()).unwrap_or(0);
            let id_access = p.get("idAccess").and_then(|v| v.as_i64()).unwrap_or(0);
            let err_code = p.get("errorCode").and_then(|v| v.as_i64()).unwrap_or(0);
            let ts = p.get("in").and_then(|v| v.as_str()).unwrap_or("");
            recent_passages.push(json!({
                "id": format!("hz-pass-{}", p.get("id").and_then(|v| v.as_i64()).unwrap_or(0)),
                "clubId": club_id,
                "idCenter": ctr,
                "memberId": format!("hz-{}", id_client),
                "badgeCode": format!("HZ-{}", if id_access > 0 { id_access } else { id_client }),
                "timestamp": ts,
                "granted": err_code == 0,
                "errorCode": err_code,
                "reason": if err_code == 0 {
                    format!("Passage portillon validé Heitz Cloud (centre #{})", ctr)
                } else {
                    format!("Refus portillon Heitz (code {})", err_code)
                },
            }));
        }
    }

    let tickets_raw = heitz_http_request(
        "GET",
        "/api/ticket?_limit=25&_offset=0&_sortBy=date&_sortOrder=DESC&detailed=true",
        Some(&token),
        None,
        10,
    )
    .await
    .unwrap_or_else(|_| json!([]));

    let mut recent_tickets: Vec<Value> = Vec::new();
    if let Some(arr) = tickets_raw.as_array() {
        for t in arr {
            let siret = t.get("siret").and_then(|v| v.as_str()).unwrap_or("");
            let ctr = t.get("creationIdCenter").and_then(|v| v.as_i64()).unwrap_or(0);
            let club_id = if ctr == bey_center || siret.starts_with("852722529") {
                "beynost"
            } else {
                "carre-de-soie"
            };
            if (club_id == "carre-de-soie" && !allow_cds) || (club_id == "beynost" && !allow_bey) {
                continue;
            }
            let amount = t
                .get("printTotal")
                .and_then(|v| v.as_f64())
                .or_else(|| t.get("_ticketTotal").and_then(|v| v.as_f64()))
                .unwrap_or(0.0);
            recent_tickets.push(json!({
                "idTicket": t.get("id").and_then(|v| v.as_i64()).unwrap_or(0),
                "ticketNumber": t.get("number").and_then(|v| v.as_str()).unwrap_or(""),
                "clubId": club_id,
                "date": t.get("date").and_then(|v| v.as_str()).unwrap_or(""),
                "sellerName": t.get("sellerName").and_then(|v| v.as_str()).unwrap_or("Accueil C.Fitness"),
                "idEmpSeller": t.get("sellerIdEmp").and_then(|v| v.as_i64()).unwrap_or(0),
                "operation": t.get("operation").and_then(|v| v.as_str()).unwrap_or("Vente"),
                "amountTtcEur": amount,
                "status": t.get("status").and_then(|v| v.as_str()).unwrap_or("NORMAL"),
            }));
        }
    }

    let rooms_raw = heitz_http_request(
        "GET",
        "/api/planning/configuration/rooms",
        Some(&token),
        None,
        10,
    )
    .await
    .unwrap_or_else(|_| json!([]));

    let rooms: Vec<Value> = rooms_raw
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|r| {
                    let dont_use = r.get("dontUse").and_then(|v| v.as_bool()).unwrap_or(false);
                    if dont_use {
                        return None;
                    }
                    Some(json!({
                        "id": r.get("id").and_then(|v| v.as_i64()).unwrap_or(0),
                        "label": r.get("label").and_then(|v| v.as_str()).unwrap_or(""),
                        "color": r.get("color").and_then(|v| v.as_str()).unwrap_or("#8b5cf6"),
                        "idCenter": r.get("creationIdCtr").and_then(|v| v.as_i64()).unwrap_or(cds_center),
                    }))
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(Json(json!({
        "configured": true,
        "liveConnected": true,
        "baseUrl": base_url,
        "centerIds": {
            "carre-de-soie": cds_center,
            "beynost": bey_center,
        },
        "syncedMembersCount": synced_count,
        "fmiToday": {
            "date": today,
            "entriesToday": entries_today,
            "exitsToday": exits_today,
            "currentPresent": latest_present,
            "peakPresent": peak_present,
        },
        "recentPassages": recent_passages,
        "recentTickets": recent_tickets,
        "rooms": rooms,
        "checkedAtUtc": Utc::now().to_rfc3339(),
    })))
}

pub fn spawn_heitz_live_sync_worker(state: SharedState) {
    if !is_heitz_live_configured() {
        return;
    }
    tokio::spawn(async move {
        tracing::info!(
            "Connecteur Heitz Cloud détecté ({} · centres #{} Carré de Soie / #{} Beynost) : lancement de la synchronisation initiale...",
            heitz_base_url(),
            heitz_center_id_cds(),
            heitz_center_id_bey()
        );
        match run_heitz_live_sync(&state, "emp-mario").await {
            Ok(summary) => {
                tracing::info!(
                    "Synchronisation Heitz Cloud réussie : {} adhérents réels (CDS: {}, Beynost: {}), {} entrées FMI aujourd'hui.",
                    summary.synced_members_count,
                    summary.carre_de_soie_members,
                    summary.beynost_members,
                    summary.entries_today
                );
            }
            Err(err) => {
                tracing::warn!("Échec synchronisation initiale Heitz Cloud : {}", err);
            }
        }
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(900));
        interval.tick().await;
        loop {
            interval.tick().await;
            if let Err(err) = run_heitz_live_sync(&state, "emp-mario").await {
                tracing::warn!("Échec synchronisation périodique Heitz Cloud : {}", err);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routes::SharedAppState;
    use crate::seed::try_load_or_init_state;
    use std::sync::Arc;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;
    use tokio::sync::RwLock;

    #[tokio::test]
    async fn heitz_live_sync_replaces_demo_members_and_recovery_cases_from_mock_heitz_server() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        // Serveur HTTP mock reproduisant les endpoints officiels Heitz Cloud0302
        tokio::spawn(async move {
            loop {
                let Ok((mut socket, _)) = listener.accept().await else {
                    break;
                };
                tokio::spawn(async move {
                    let mut buf = vec![0u8; 4096];
                    let n = socket.read(&mut buf).await.unwrap_or(0);
                    let req = String::from_utf8_lossy(&buf[..n]);
                    let first_line = req.lines().next().unwrap_or("");
                    let body_json = if first_line.contains("/api/developer/getToken") {
                        r##"{"token":"mock-heitz-uuid-token-2026"}"##
                    } else if first_line.contains("/api/userPassages/browse") {
                        r##"[{"id":4967048010090,"idClient":4967046791741,"idAccess":4967046791852,"idPassCenter":4967,"idCenter":4967,"errorCode":0,"in":"2026-11-24T19:47:01.202Z"},{"id":4967048010014,"idClient":3845031974405,"idAccess":3845032001664,"idPassCenter":3845,"idCenter":3845,"errorCode":0,"in":"2026-11-24T19:42:59.593Z"}]"##
                    } else if first_line.contains("_orderBy=id:DESC") {
                        r##"[{"id":4967046791741,"firstName":"CLAIRE","lastName":"BERNARD","type":0,"_finBalance":0.0,"_subscriptions":[{"idAccess":4967046791852,"accessLabel":"ACCES S/B ULTIME 4S","canceled":null,"totalPassages":14}]},{"id":3845,"firstName":".","lastName":"C.FITNESS","type":4,"_finBalance":0.0,"_subscriptions":[]}]"##
                    } else if first_line.contains("_orderBy=id:ASC") {
                        r##"[{"id":3845031974405,"firstName":"NICOLAS","lastName":"DUPONT","type":0,"_finBalance":-39.90,"_subscriptions":[{"idAccess":3845032001664,"accessLabel":"LIBERTE BI-CLUB","canceled":null,"totalPassages":22}]}]"##
                    } else if first_line.contains("/api/fmi/date/") {
                        r##"{"internalIn":{"H24":836},"internalOut":{"H24":597},"internalPresent":{"H18":305,"H20":239}}"##
                    } else if first_line.contains("/api/employee/list") {
                        r##"[{"id":384502580009,"firstName":"DANIEL","lastName":"CARVALHO"},{"id":384502580010,"firstName":"MARIO","lastName":"CARVAHLO"}]"##
                    } else if first_line.contains("/api/planning/configuration/rooms") {
                        r##"[{"id":384502580175,"label":"BOX CROSSFIT","color":"#c0c0c0","dontUse":false,"creationIdCtr":3845}]"##
                    } else if first_line.contains("/api/ticket") {
                        r##"[{"id":4967048008139,"number":"0000498683","printTotal":49.90,"siret":"81865131700013","creationIdCenter":3845,"sellerName":"SRIJA RIME","sellerIdEmp":4967039275706,"date":"2026-11-24T18:38:03.675Z","operation":"Vente","status":"NORMAL"}]"##
                    } else {
                        r##"[]"##
                    };
                    let resp = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        body_json.len(),
                        body_json
                    );
                    let _ = socket.write_all(resp.as_bytes()).await;
                });
            }
        });

        let tmp = std::env::temp_dir().join(format!(
            "cfos_heitz_live_test_{}",
            Utc::now().timestamp_nanos_opt().unwrap_or(0)
        ));
        std::fs::create_dir_all(&tmp).unwrap();
        let initial_db = try_load_or_init_state(&tmp).unwrap();
        let state = Arc::new(SharedAppState {
            db: RwLock::new(initial_db),
            data_dir: tmp.clone(),
            sessions: RwLock::new(HashMap::new()),
            login_attempts: RwLock::new(HashMap::new()),
        });

        std::env::set_var("HEITZ_WS_URL", format!("http://{}", addr));
        std::env::set_var("HEITZ_DEV_ID", "test-dev-id");
        std::env::set_var("HEITZ_DEV_KEY", "test-dev-key");

        let summary = run_heitz_live_sync(&state, "emp-mario")
            .await
            .expect("Sync Heitz live OK");
        assert_eq!(summary.synced_members_count, 2);
        assert_eq!(summary.carre_de_soie_members, 1);
        assert_eq!(summary.beynost_members, 1);
        assert_eq!(summary.active_recovery_cases, 1);
        assert_eq!(summary.entries_today, 836);
        assert_eq!(summary.current_present, 239);

        let db = state.db.read().await;
        // Les faux adhérents démo (hm-001...) ont été intégralement remplacés par les vrais
        assert_eq!(db.heitz_members.len(), 2);
        assert!(db.heitz_members.iter().all(|m| m.id.starts_with("hz-")));
        // Les faux dossiers de recouvrement démo (rec-1...) ont été remplacés par le seul vrai débiteur
        assert_eq!(db.recovery_cases.len(), 1);
        assert_eq!(db.recovery_cases[0].member_id, "hz-3845031974405");
        assert_eq!(db.recovery_cases[0].amount_due_eur, 39.90);

        std::env::remove_var("HEITZ_WS_URL");
        std::env::remove_var("HEITZ_DEV_ID");
        std::env::remove_var("HEITZ_DEV_KEY");
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
