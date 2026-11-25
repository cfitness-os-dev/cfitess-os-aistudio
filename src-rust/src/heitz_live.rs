use crate::models::{HeitzMemberRecord, RecoveryCaseRecord, SiteKpis};
use crate::rbac::{
    can_access_finances, can_access_recovery, can_access_site_scope, is_admin_employee,
    is_manager_employee,
};
use crate::routes::{append_audit, err_resp, is_demo_mode, resolve_session_actor, SharedState};
use crate::seed::persist_state;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use chrono::{Timelike, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

pub const DEFAULT_HEITZ_CENTER_CDS: i64 = 3845;
pub const DEFAULT_HEITZ_CENTER_BEY: i64 = 4967;
const HEITZ_MAX_PAGES: usize = 100;

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

pub fn is_heitz_worker_enabled() -> bool {
    if !is_heitz_live_configured() {
        return false;
    }
    match std::env::var("CFITNESS_HEITZ_WORKER") {
        Ok(val) => {
            let trimmed = val.trim().to_ascii_lowercase();
            matches!(trimmed.as_str(), "1" | "true" | "yes" | "on")
        }
        Err(_) => !is_demo_mode(),
    }
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

async fn heitz_fetch_paginated<F>(
    token: &str,
    page_size: usize,
    timeout_secs: u64,
    build_path: F,
) -> Result<Vec<Value>, String>
where
    F: Fn(usize, usize) -> String,
{
    let mut all_items: Vec<Value> = Vec::new();
    let mut seen_ids: HashSet<i64> = HashSet::new();

    for page in 0..HEITZ_MAX_PAGES {
        let offset = page * page_size;
        let path = build_path(offset, page_size);
        let val = heitz_http_request("GET", &path, Some(token), None, timeout_secs).await?;
        let Some(arr) = val.as_array() else {
            return Err(format!("Réponse paginée Heitz non-tableau sur {}", path));
        };

        if arr.len() > page_size {
            return Err(
                "Pagination Heitz incohérente : page supérieure à la taille demandée.".into(),
            );
        }
        for item in arr {
            let id_num = item.get("id").and_then(Value::as_i64).filter(|id| *id > 0)
                .ok_or("Identifiant de pagination Heitz absent ou invalide : résultat incomplet refusé.")?;
            if !seen_ids.insert(id_num) {
                return Err(
                    "Pagination Heitz répétée ou instable : résultat incomplet refusé.".into(),
                );
            }
            all_items.push(item.clone());
        }
        if arr.len() < page_size {
            return Ok(all_items);
        }
    }

    Err("Limite de pagination Heitz atteinte : résultat incomplet refusé.".into())
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
    let resp =
        heitz_http_request("POST", "/api/developer/getToken?v=2", None, Some(&body), 12).await?;
    let token = resp
        .get("token")
        .and_then(|t| t.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Jeton absent dans la réponse /api/developer/getToken?v=2.".to_string())?;
    Ok(token.to_string())
}

fn infer_club_id_from_heitz_id(_id_val: i64, center_hint: Option<i64>) -> &'static str {
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
    "unassigned"
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

static HEITZ_SYNC_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
#[cfg(test)]
static HEITZ_LIVE_TEST_ENV: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

fn extract_fmi_presence(fmi_val: &Value, current_hour: u32) -> (i64, i64, i64, i64) {
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
    let mut current_present = 0i64;
    if let Some(pres) = fmi_val.get("internalPresent").and_then(|v| v.as_object()) {
        for h in 0..=23 {
            if let Some(val) = pres.get(&format!("H{}", h)).and_then(|v| v.as_i64()) {
                if val > peak_present {
                    peak_present = val;
                }
            }
        }
        // Conserve strictement 0 s'il s'agit de la mesure connue la plus récente.
        let mut found = false;
        for h in (0..=current_hour.min(23)).rev() {
            if let Some(val) = pres.get(&format!("H{}", h)).and_then(|v| v.as_i64()) {
                current_present = val;
                found = true;
                break;
            }
        }
        if !found {
            for h in ((current_hour.min(23) + 1)..=23).rev() {
                if let Some(val) = pres.get(&format!("H{}", h)).and_then(|v| v.as_i64()) {
                    current_present = val;
                    break;
                }
            }
        }
    }

    (entries_today, exits_today, current_present, peak_present)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeitzSyncSummary {
    pub ok: bool,
    pub partial_sync: bool,
    pub warnings: Vec<String>,
    pub synced_members_count: usize,
    pub carre_de_soie_members: usize,
    pub beynost_members: usize,
    pub unassigned_center_members: usize,
    pub active_recovery_cases: usize,
    pub preserved_recovery_cases: usize,
    pub active_employees_count: usize,
    pub rooms_count: usize,
    pub entries_today: i64,
    pub current_present: i64,
    pub synced_at_utc: String,
}

pub async fn run_heitz_live_sync(
    state: &SharedState,
    actor_id: &str,
) -> Result<HeitzSyncSummary, String> {
    run_heitz_live_sync_scoped(state, actor_id, true, true).await
}

pub async fn run_heitz_live_sync_scoped(
    state: &SharedState,
    actor_id: &str,
    allow_cds: bool,
    allow_bey: bool,
) -> Result<HeitzSyncSummary, String> {
    let _sync_guard = HEITZ_SYNC_LOCK.lock().await;
    if !allow_cds && !allow_bey {
        return Err("Aucun club autorisé pour la synchronisation Heitz.".to_string());
    }

    let token = authenticate_heitz_token().await?;
    let now = Utc::now();
    let today = now.format("%Y-%m-%d").to_string();
    let current_hour = now.hour();
    let cds_center = heitz_center_id_cds();
    let bey_center = heitz_center_id_bey();
    let mut warnings: Vec<String> = Vec::new();
    let mut partial_sync = false;

    // 1. Passages paginés du jour (erreur non silencieuse)
    let mut client_center_by_passage: HashMap<i64, i64> = HashMap::new();
    let mut client_access_by_passage: HashMap<i64, i64> = HashMap::new();
    match heitz_fetch_paginated(&token, 100, 15, |skip, limit| {
        format!(
            "/api/userPassages/browse?_limit={}&_skip={}&start={}",
            limit, skip, today
        )
    })
    .await
    {
        Ok(arr) => {
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
        Err(err) => {
            partial_sync = true;
            warnings.push(format!(
                "Passages portillons partiels/indisponibles : {}",
                err
            ));
        }
    }

    // 2. Récupération paginée complète des adhérents :
    // En cas d'échec, aucune mutation de db.heitz_members ou db.recovery_cases n'est effectuée.
    let users_items = heitz_fetch_paginated(&token, 120, 15, |offset, limit| {
        format!(
            "/api/users/search?_offset={}&_orderBy=id:ASC&_include=3&_limit={}&finBalance=true",
            offset, limit
        )
    })
    .await?;

    // Lecture FMI, collaborateurs, salles et tickets paginés
    let fmi_res = heitz_http_request(
        "GET",
        &format!("/api/fmi/date/{}?internal=true&external=true", today),
        Some(&token),
        None,
        12,
    )
    .await;
    let (entries_today, current_present) = match fmi_res {
        Ok(fmi_val) => {
            let (entries, _exits, present, _peak) = extract_fmi_presence(&fmi_val, current_hour);
            (entries, present)
        }
        Err(err) => {
            partial_sync = true;
            warnings.push(format!("Compteur FMI indisponible : {}", err));
            (0, 0)
        }
    };

    let active_employees_count = match heitz_http_request(
        "GET",
        "/api/employee/list?status=active",
        Some(&token),
        None,
        12,
    )
    .await
    {
        Ok(v) => v.as_array().map(|a| a.len()).unwrap_or(0),
        Err(err) => {
            partial_sync = true;
            warnings.push(format!("Liste collaborateurs Heitz indisponible : {}", err));
            0
        }
    };

    let rooms_count = match heitz_http_request(
        "GET",
        "/api/planning/configuration/rooms",
        Some(&token),
        None,
        12,
    )
    .await
    {
        Ok(v) => v.as_array().map(|a| a.len()).unwrap_or(0),
        Err(err) => {
            partial_sync = true;
            warnings.push(format!("Salles planning Heitz indisponibles : {}", err));
            0
        }
    };

    let tickets_res = heitz_fetch_paginated(&token, 100, 15, |offset, limit| {
        format!(
            "/api/ticket?_limit={}&_offset={}&_sortBy=date&_sortOrder=DESC&detailed=true",
            limit, offset
        )
    })
    .await;

    let mut rev_cds = 0.0f64;
    let mut rev_bey = 0.0f64;
    let tickets_complete = match &tickets_res {
        Ok(t_arr) => {
            for t in t_arr {
                let amount = t
                    .get("printTotal")
                    .and_then(|v| v.as_f64())
                    .or_else(|| t.get("_ticketTotal").and_then(|v| v.as_f64()))
                    .unwrap_or(0.0);
                let siret = t.get("siret").and_then(|v| v.as_str()).unwrap_or("");
                let ctr = t
                    .get("creationIdCenter")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0);
                if ctr == bey_center || siret.starts_with("852722529") {
                    rev_bey += amount.max(0.0);
                } else if ctr == cds_center || siret.starts_with("818651317") {
                    rev_cds += amount.max(0.0);
                }
            }
            true
        }
        Err(err) => {
            partial_sync = true;
            warnings.push(format!("Tickets TPV Heitz indisponibles : {}", err));
            false
        }
    };

    let synced_at_utc = now.to_rfc3339();
    let mut seen_ids: HashSet<i64> = HashSet::new();
    let mut incoming_members: Vec<HeitzMemberRecord> = Vec::new();

    // Snapshot des fiches existantes pour préserver les attributs locaux vérifiés
    let prev_members_by_id: HashMap<String, HeitzMemberRecord> = {
        let db = state.db.read().await;
        db.heitz_members
            .iter()
            .map(|m| (m.id.clone(), m.clone()))
            .collect()
    };

    for u in users_items {
        let Some(uid) = u.get("id").and_then(|v| v.as_i64()) else {
            continue;
        };
        if uid <= 0 || !seen_ids.insert(uid) {
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

        let center_hint = u
            .get("center")
            .and_then(|v| v.as_i64())
            .or_else(|| u.get("idCenter").and_then(|v| v.as_i64()))
            .or_else(|| client_center_by_passage.get(&uid).copied());
        let club_id = infer_club_id_from_heitz_id(uid, center_hint).to_string();

        // Respect strict du périmètre autorisé
        if (club_id == "carre-de-soie" && !allow_cds)
            || (club_id == "beynost" && !allow_bey)
            || (club_id == "unassigned" && !(allow_cds && allow_bey))
        {
            continue;
        }

        let fin_balance = u
            .get("_finBalance")
            .and_then(|v| v.as_f64())
            .or_else(|| u.get("finBalance").and_then(|v| v.as_f64()))
            .ok_or("Solde Heitz absent ou invalide : impossible de confirmer un solde nul.")?;

        let subs = u.get("_subscriptions").and_then(|v| v.as_array());
        let mut sub_label = String::from("Adhérent Heitz");
        let mut badge_num: Option<i64> = client_access_by_passage.get(&uid).copied();
        let mut has_active_sub = false;

        if let Some(sub_list) = subs {
            for s in sub_list {
                let canceled = s
                    .get("canceled")
                    .is_some_and(|c| !c.is_null() && c != &json!(false));
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
                    badge_num = s
                        .get("idAccess")
                        .and_then(|v| v.as_i64())
                        .filter(|&v| v > 0);
                }
                if !canceled {
                    has_active_sub = true;
                }
            }
        }
        if client_center_by_passage.contains_key(&uid) {
            has_active_sub = true;
        }

        let has_real_badge = badge_num.is_some();
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

        let id = format!("hz-{}", uid);
        let prev = prev_members_by_id.get(&id);
        if prev.is_some_and(|p| p.home_club_id != club_id) {
            partial_sync = true;
            warnings.push("Rattachement d’un adhérent modifié ou non confirmé : fiche conservée, rapprochement manuel requis.".into());
            continue;
        }
        let seen_today = client_center_by_passage.contains_key(&uid);

        incoming_members.push(HeitzMemberRecord {
            id,
            badge_code,
            rfid_bluetooth_enabled: has_real_badge,
            mywellness_member_id: prev.and_then(|p| p.mywellness_member_id.clone()),
            first_name,
            last_name,
            phone,
            email,
            home_club_id: club_id,
            subscription_name: sub_label,
            active_subscription: has_active_sub,
            fin_balance_eur: fin_balance,
            fin_balance_state: if fin_balance < 0.0 { 0 } else { 1 },
            // Aucune estimation de MOVEs ni points fidélité inventée
            technogym_moves30d: prev.map(|p| p.technogym_moves30d).unwrap_or(0),
            days_since_last_workout: if seen_today {
                0
            } else {
                prev.map(|p| p.days_since_last_workout).unwrap_or(0)
            },
            loyalty_points: prev.map(|p| p.loyalty_points).unwrap_or(0),
            referrals_count: prev.map(|p| p.referrals_count).unwrap_or(0),
            last_reward_label: prev.and_then(|p| p.last_reward_label.clone()),
            data_source: Some("HeitzSystem Cloud".to_string()),
            last_synced_at_utc: Some(synced_at_utc.clone()),
            last_workout_known: Some(seen_today),
            loyalty_points_known: Some(false),
        });
    }

    let cds_count = incoming_members
        .iter()
        .filter(|m| m.home_club_id == "carre-de-soie")
        .count();
    let bey_count = incoming_members
        .iter()
        .filter(|m| m.home_club_id == "beynost")
        .count();
    let unassigned_center_members = incoming_members
        .iter()
        .filter(|m| m.home_club_id == "unassigned")
        .count();

    // 3. Rapprochement atomique sans perte ni remise à zéro du recouvrement
    let (active_recovery_count, preserved_recovery_count) = {
        let mut db = state.db.write().await;
        let snapshot = db.clone();

        let in_scope_club = |club_id: &str| -> bool {
            (club_id == "carre-de-soie" && allow_cds)
                || (club_id == "beynost" && allow_bey)
                || (club_id == "unassigned" && allow_cds && allow_bey)
        };

        // A missing row is never a deletion event, including for imports/manual rows.
        let mut next_members = db.heitz_members.clone();
        for incoming in &incoming_members {
            if let Some(old) = next_members.iter_mut().find(|m| m.id == incoming.id) {
                let mut refreshed = incoming.clone();
                refreshed.mywellness_member_id = old.mywellness_member_id.clone();
                refreshed.technogym_moves30d = old.technogym_moves30d;
                refreshed.loyalty_points = old.loyalty_points;
                refreshed.referrals_count = old.referrals_count;
                refreshed.last_reward_label = old.last_reward_label.clone();
                *old = refreshed;
            } else {
                next_members.push(incoming.clone());
            }
        }
        db.heitz_members = next_members;

        let incoming_by_id: HashMap<&str, &HeitzMemberRecord> = incoming_members
            .iter()
            .map(|m| (m.id.as_str(), m))
            .collect();

        // Rapprochement par ID stable sur recovery_cases :
        // - Préserve tous les dossiers manuels et tous les dossiers hors périmètre
        // - Préserve status, relance_count, last_action_note, missing_docs, compliance_verified des dossiers rec-hz-* existants
        // - Ne réinitialise jamais un dossier actif ayant des relances ; bascule en "regularise" si solde revenu >= 0
        let mut next_recovery: Vec<RecoveryCaseRecord> = Vec::new();
        let mut matched_member_ids: HashSet<String> = HashSet::new();
        let mut preserved_count = 0usize;

        for rc in &db.recovery_cases {
            if !rc.id.starts_with("rec-hz-") || !in_scope_club(&rc.club_id) {
                next_recovery.push(rc.clone());
                continue;
            }
            matched_member_ids.insert(rc.member_id.clone());

            if let Some(member) = incoming_by_id.get(rc.member_id.as_str()) {
                if member.fin_balance_eur < 0.0 {
                    let mut updated = rc.clone();
                    updated.member_name = format!("{} {}", member.first_name, member.last_name);
                    updated.club_id = member.home_club_id.clone();
                    updated.phone = member.phone.clone();
                    updated.email = member.email.clone().unwrap_or_default();
                    updated.contract_label = member.subscription_name.clone();
                    updated.amount_due_eur = member.fin_balance_eur.abs();
                    updated.source_provenance = Some("HeitzSystem Cloud".to_string());
                    updated.last_synced_at_utc = Some(synced_at_utc.clone());
                    preserved_count += 1;
                    next_recovery.push(updated);
                } else {
                    // Conserve l'historique d'un dossier suivi localement dont la dette est soldée
                    let mut settled = rc.clone();
                    settled.amount_due_eur = 0.0;
                    settled.status = "regularise".to_string();
                    settled.last_synced_at_utc = Some(synced_at_utc.clone());
                    if !settled.last_action_note.contains("Solde revenu à 0 €") {
                        settled.last_action_note = format!(
                            "{} · Solde revenu à 0 € sur Heitz Cloud ({})",
                            settled.last_action_note, today
                        );
                    }
                    preserved_count += 1;
                    next_recovery.push(settled);
                }
            } else {
                // Adhérent absent de la réponse : ne jamais perdre l'historique local
                preserved_count += 1;
                next_recovery.push(rc.clone());
            }
        }

        // Création des nouveaux dossiers débiteurs sans champs inventés
        for member in &incoming_members {
            if member.fin_balance_eur >= 0.0 || matched_member_ids.contains(&member.id) {
                continue;
            }
            if member.home_club_id == "unassigned" {
                continue;
            }
            next_recovery.push(RecoveryCaseRecord {
                id: format!("rec-hz-{}", member.id),
                member_id: member.id.clone(),
                member_name: format!("{} {}", member.first_name, member.last_name),
                club_id: member.home_club_id.clone(),
                phone: member.phone.clone(),
                email: member.email.clone().unwrap_or_default(),
                contract_label: member.subscription_name.clone(),
                amount_due_eur: member.fin_balance_eur.abs(),
                days_overdue: 0,
                unpaid_reason: "Solde débiteur HeitzSystem Cloud (motif détaillé non exposé par l'API)".to_string(),
                billed_months: vec![],
                has_signed_contract: false,
                has_id_and_rib: false,
                has_cgv_accepted: false,
                missing_docs: vec![
                    "Contrat, pièce d'identité/RIB et CGV à vérifier dans HeitzSystem".to_string(),
                ],
                status: "a_relancer".to_string(),
                relance_count: 0,
                last_action_note: format!(
                    "Dossier ouvert depuis HeitzSystem Cloud ({}) — pièces et ancienneté à vérifier",
                    today
                ),
                overdue_days_known: Some(false),
                compliance_verified: Some(false),
                source_provenance: Some("HeitzSystem Cloud".to_string()),
                last_synced_at_utc: Some(synced_at_utc.clone()),
            });
        }

        db.recovery_cases = next_recovery;

        // Club legal settings belong to organisation settings, not a reader sync.

        // KPI mis à jour uniquement si la lecture paginée des tickets a réussi intégralement
        if tickets_complete {
            let period_label = format!("Sync Heitz Cloud ({})", today);
            if allow_cds {
                if let Some(kpi_cds) = db.kpis.iter_mut().find(|k| k.site_id == "club-carre-soie") {
                    kpi_cds.period_label = period_label.clone();
                    kpi_cds.revenue_eur = Some(rev_cds);
                } else {
                    db.kpis.push(SiteKpis {
                        site_id: "club-carre-soie".into(),
                        period_label: period_label.clone(),
                        revenue_eur: Some(rev_cds),
                        productivity_per_hour: None,
                        payroll_mass_eur: None,
                        worked_hours: None,
                        retention_rate_pct: None,
                        monthly_target_eur: None,
                    });
                }
            }
            if allow_bey {
                if let Some(kpi_bey) = db.kpis.iter_mut().find(|k| k.site_id == "club-beynost") {
                    kpi_bey.period_label = period_label;
                    kpi_bey.revenue_eur = Some(rev_bey);
                } else {
                    db.kpis.push(SiteKpis {
                        site_id: "club-beynost".into(),
                        period_label,
                        revenue_eur: Some(rev_bey),
                        productivity_per_hour: None,
                        payroll_mass_eur: None,
                        worked_hours: None,
                        retention_rate_pct: None,
                        monthly_target_eur: None,
                    });
                }
            }
        }

        let active_rec = db
            .recovery_cases
            .iter()
            .filter(|r| r.status != "regularise" && in_scope_club(&r.club_id))
            .count();

        let scope_site = if allow_cds {
            "club-carre-soie"
        } else {
            "club-beynost"
        };
        append_audit(
            &mut db,
            actor_id,
            "Synchronisation Heitz Cloud temps réel",
            format!(
                "Synchro {} ({}) : {} adhérents (CDS #{}: {}, Beynost #{}: {}, non rattachés: {}), {} dossiers recouvrement préservés, {} salles, {} collaborateurs, FMI {} entrées{}",
                if partial_sync { "partielle" } else { "complète" },
                synced_at_utc,
                cds_count + bey_count + unassigned_center_members,
                cds_center,
                cds_count,
                bey_center,
                bey_count,
                unassigned_center_members,
                preserved_count,
                rooms_count,
                active_employees_count,
                entries_today,
                if warnings.is_empty() {
                    String::new()
                } else {
                    format!(" · Avertissements: {}", warnings.join(" ; "))
                }
            ),
            scope_site,
            "Heitz-WS Cloud0302",
            None,
            None,
        );

        if let Err(err_msg) = persist_state(&state.data_dir, &db) {
            *db = snapshot;
            return Err(format!(
                "Échec persistance synchronisation Heitz : {}",
                err_msg
            ));
        }

        (active_rec, preserved_count)
    };

    Ok(HeitzSyncSummary {
        ok: true,
        partial_sync,
        warnings,
        synced_members_count: cds_count + bey_count + unassigned_center_members,
        carre_de_soie_members: cds_count,
        beynost_members: bey_count,
        unassigned_center_members,
        active_recovery_cases: active_recovery_count,
        preserved_recovery_cases: preserved_recovery_count,
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
    let (allow_cds, allow_bey) = {
        let db = state.db.read().await;
        let admin = is_admin_employee(&db, &actor_id);
        let cds = can_access_site_scope(&db, &actor_id, "club-carre-soie")
            && (admin || is_manager_employee(&db, &actor_id, Some("club-carre-soie")));
        let bey = can_access_site_scope(&db, &actor_id, "club-beynost")
            && (admin || is_manager_employee(&db, &actor_id, Some("club-beynost")));
        if !cds && !bey {
            return Err(err_resp(
                StatusCode::FORBIDDEN,
                "Synchronisation Heitz Cloud réservée à la direction et aux responsables du club (403 Forbidden).",
            ));
        }
        (cds, bey)
    };
    match run_heitz_live_sync_scoped(&state, &actor_id, allow_cds, allow_bey).await {
        Ok(summary) => Ok(Json(summary)),
        Err(err) => Err(err_resp(StatusCode::BAD_GATEWAY, err)),
    }
}

pub async fn get_heitz_live_overview(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let (
        allow_cds,
        allow_bey,
        can_fin_cds,
        can_fin_bey,
        synced_count,
        unassigned_count,
        member_pseudonyms,
    ) = {
        let db = state.db.read().await;
        let cds = can_access_site_scope(&db, &actor_id, "club-carre-soie");
        let bey = can_access_site_scope(&db, &actor_id, "club-beynost");
        if !cds && !bey {
            return Err(err_resp(
                StatusCode::FORBIDDEN,
                "Aucun club autorisé pour consulter les indicateurs Heitz.",
            ));
        }
        let admin = is_admin_employee(&db, &actor_id);
        let fin_cds = cds
            && (admin
                || is_manager_employee(&db, &actor_id, Some("club-carre-soie"))
                || can_access_finances(&db, &actor_id, Some("club-carre-soie"))
                || can_access_recovery(&db, &actor_id, Some("club-carre-soie")));
        let fin_bey = bey
            && (admin
                || is_manager_employee(&db, &actor_id, Some("club-beynost"))
                || can_access_finances(&db, &actor_id, Some("club-beynost"))
                || can_access_recovery(&db, &actor_id, Some("club-beynost")));

        let mut pseudonyms: HashMap<String, String> = HashMap::new();
        for m in &db.heitz_members {
            let initial = m
                .last_name
                .trim()
                .chars()
                .next()
                .map(|c| format!("{}.", c.to_uppercase()))
                .unwrap_or_default();
            let display = format!("{} {}", m.first_name.trim(), initial)
                .trim()
                .to_string();
            if !display.is_empty() {
                pseudonyms.insert(m.id.clone(), display.clone());
                if !m.badge_code.trim().is_empty() {
                    pseudonyms.insert(m.badge_code.clone(), display);
                }
            }
        }
        let scoped_count = db
            .heitz_members
            .iter()
            .filter(|m| {
                (m.home_club_id == "carre-de-soie" && cds) || (m.home_club_id == "beynost" && bey)
            })
            .count();
        let unassigned = if admin {
            db.heitz_members
                .iter()
                .filter(|m| m.home_club_id == "unassigned")
                .count()
        } else {
            0
        };
        (
            cds,
            bey,
            fin_cds,
            fin_bey,
            scoped_count,
            unassigned,
            pseudonyms,
        )
    };

    let can_see_any_financial = can_fin_cds || can_fin_bey;
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
            "unassignedCenterMembersCount": unassigned_count,
            "fmiToday": null,
            "recentPassages": [],
            "recentTickets": [],
            "financesRedactedRgpd": !can_see_any_financial,
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
                "unassignedCenterMembersCount": unassigned_count,
                "error": err,
                "fmiToday": null,
                "recentPassages": [],
                "recentTickets": [],
                "financesRedactedRgpd": !can_see_any_financial,
                "rooms": [],
            })));
        }
    };

    let now = Utc::now();
    let today = now.format("%Y-%m-%d").to_string();
    let current_hour = now.hour();
    let mut warnings: Vec<String> = Vec::new();

    let fmi_today = match heitz_http_request(
        "GET",
        &format!("/api/fmi/date/{}?internal=true&external=true", today),
        Some(&token),
        None,
        10,
    )
    .await
    {
        Ok(fmi_val) => {
            let (entries_today, exits_today, current_present, peak_present) =
                extract_fmi_presence(&fmi_val, current_hour);
            Some(json!({
                "date": today,
                "entriesToday": entries_today,
                "exitsToday": exits_today,
                "currentPresent": current_present,
                "peakPresent": peak_present,
            }))
        }
        Err(err) => {
            warnings.push(format!("FMI indisponible : {}", err));
            None
        }
    };

    let mut recent_passages: Vec<Value> = Vec::new();
    match heitz_http_request(
        "GET",
        &format!("/api/userPassages/browse?_limit=30&_skip=0&start={}", today),
        Some(&token),
        None,
        10,
    )
    .await
    {
        Ok(passages_raw) => {
            if let Some(arr) = passages_raw.as_array() {
                for p in arr {
                    let ctr = p
                        .get("idCenter")
                        .and_then(|v| v.as_i64())
                        .or_else(|| p.get("idPassCenter").and_then(|v| v.as_i64()));
                    let club_id = match ctr {
                        Some(c) if c == bey_center => "beynost",
                        Some(c) if c == cds_center => "carre-de-soie",
                        _ => "unassigned",
                    };
                    if (club_id == "carre-de-soie" && !allow_cds)
                        || (club_id == "beynost" && !allow_bey)
                        || (club_id == "unassigned" && !(allow_cds && allow_bey))
                    {
                        continue;
                    }
                    let id_client = p.get("idClient").and_then(|v| v.as_i64()).unwrap_or(0);
                    let id_access = p.get("idAccess").and_then(|v| v.as_i64()).unwrap_or(0);
                    let err_code = p.get("errorCode").and_then(|v| v.as_i64()).unwrap_or(0);
                    let ts = p.get("in").and_then(|v| v.as_str()).unwrap_or("");
                    let member_id = format!("hz-{}", id_client);
                    let badge_code =
                        format!("HZ-{}", if id_access > 0 { id_access } else { id_client });
                    let display_name = member_pseudonyms
                        .get(&member_id)
                        .or_else(|| member_pseudonyms.get(&badge_code))
                        .cloned()
                        .unwrap_or_else(|| badge_code.clone());
                    recent_passages.push(json!({
                        "id": format!("hz-pass-{}", p.get("id").and_then(|v| v.as_i64()).unwrap_or(0)),
                        "clubId": club_id,
                        "idCenter": ctr.unwrap_or(0),
                        "memberId": member_id,
                        "memberDisplayName": display_name,
                        "badgeCode": badge_code,
                        "timestamp": ts,
                        "granted": err_code == 0,
                        "errorCode": err_code,
                        "reason": if err_code == 0 {
                            format!("Entrée validée (centre #{})", ctr.unwrap_or(0))
                        } else {
                            "Passage refusé — Vérification dossier à l'accueil".to_string()
                        },
                    }));
                }
            }
        }
        Err(err) => warnings.push(format!("Passages indisponibles : {}", err)),
    }

    let mut recent_tickets: Vec<Value> = Vec::new();
    if can_see_any_financial {
        match heitz_http_request(
            "GET",
            "/api/ticket?_limit=25&_offset=0&_sortBy=date&_sortOrder=DESC&detailed=true",
            Some(&token),
            None,
            10,
        )
        .await
        {
            Ok(tickets_raw) => {
                if let Some(arr) = tickets_raw.as_array() {
                    for t in arr {
                        let siret = t.get("siret").and_then(|v| v.as_str()).unwrap_or("");
                        let ctr = t
                            .get("creationIdCenter")
                            .and_then(|v| v.as_i64())
                            .unwrap_or(0);
                        let club_id = if ctr == bey_center || siret.starts_with("852722529") {
                            "beynost"
                        } else if ctr == cds_center || siret.starts_with("818651317") {
                            "carre-de-soie"
                        } else {
                            "unassigned"
                        };
                        if (club_id == "carre-de-soie" && !can_fin_cds)
                            || (club_id == "beynost" && !can_fin_bey)
                            || (club_id == "unassigned" && !(can_fin_cds && can_fin_bey))
                        {
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
            }
            Err(err) => warnings.push(format!("Tickets TPV indisponibles : {}", err)),
        }
    }

    let rooms: Vec<Value> = match heitz_http_request(
        "GET",
        "/api/planning/configuration/rooms",
        Some(&token),
        None,
        10,
    )
    .await
    {
        Ok(rooms_raw) => rooms_raw
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
            .unwrap_or_default(),
        Err(err) => {
            warnings.push(format!("Salles indisponibles : {}", err));
            vec![]
        }
    };

    Ok(Json(json!({
        "configured": true,
        "liveConnected": true,
        "partialOverview": !warnings.is_empty(),
        "warnings": warnings,
        "baseUrl": base_url,
        "centerIds": {
            "carre-de-soie": cds_center,
            "beynost": bey_center,
        },
        "syncedMembersCount": synced_count,
        "unassignedCenterMembersCount": unassigned_count,
        "fmiToday": fmi_today,
        "recentPassages": recent_passages,
        "recentTickets": recent_tickets,
        "financesRedactedRgpd": !can_see_any_financial,
        "rooms": rooms,
        "checkedAtUtc": now.to_rfc3339(),
    })))
}

pub fn spawn_heitz_live_sync_worker(state: SharedState) {
    if !is_heitz_worker_enabled() {
        tracing::info!(
            "Worker périodique Heitz Cloud désactivé (mode démo ou CFITNESS_HEITZ_WORKER=0)."
        );
        return;
    }
    tokio::spawn(async move {
        tracing::info!(
            "Connecteur Heitz Cloud détecté ({} · centres #{} Carré de Soie / #{} Beynost) : lancement de la synchronisation initiale...",
            heitz_base_url(),
            heitz_center_id_cds(),
            heitz_center_id_bey()
        );
        match run_heitz_live_sync(&state, "system-heitz-sync").await {
            Ok(summary) => {
                tracing::info!(
                    "Synchronisation Heitz Cloud réussie (partielle={}) : {} adhérents (CDS: {}, Beynost: {}, non rattachés: {}), {} entrées FMI aujourd'hui.",
                    summary.partial_sync,
                    summary.synced_members_count,
                    summary.carre_de_soie_members,
                    summary.beynost_members,
                    summary.unassigned_center_members,
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
            if let Err(err) = run_heitz_live_sync(&state, "system-heitz-sync").await {
                tracing::warn!("Échec synchronisation périodique Heitz Cloud : {}", err);
            }
        }
    });
}

#[cfg(test)]
#[path = "heitz_sync_tests.rs"]
mod sync_tests;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Employee, EmployeeSiteAccess, SensitiveBankInfo, ContractSummary, EmployeeCounter};
    use crate::routes::SharedAppState;
    use crate::seed::try_load_or_init_state;
    use axum::http::header;
    use std::sync::Arc;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;
    use tokio::sync::RwLock;


    fn test_headers(state_sessions: &mut HashMap<String, (String, i64)>, actor_id: &str) -> HeaderMap {
        let token = format!(
            "hl-session-{}-{}",
            actor_id,
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        );
        state_sessions.insert(token.clone(), (actor_id.to_string(), Utc::now().timestamp() + 3600));
        let mut h = HeaderMap::new();
        h.insert(
            header::AUTHORIZATION,
            axum::http::HeaderValue::from_str(&format!("Bearer {}", token)).unwrap(),
        );
        h
    }

    #[tokio::test]
    async fn heitz_live_sync_paginates_preserves_recovery_avoids_estimates_and_handles_failures() {
        let _guard = HEITZ_LIVE_TEST_ENV.lock().await;
        let fail_users = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let fail_fmi = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let fmi_zero = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(true));

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let fu = fail_users.clone();
        let ff = fail_fmi.clone();
        let fz = fmi_zero.clone();

        // Génère >240 adhérents, >100 passages, >60 tickets et un adhérent sans centre connu
        tokio::spawn(async move {
            loop {
                let Ok((mut socket, _)) = listener.accept().await else {
                    break;
                };
                let fu = fu.clone();
                let ff = ff.clone();
                let fz = fz.clone();
                tokio::spawn(async move {
                    let mut buf = vec![0u8; 4096];
                    let n = socket.read(&mut buf).await.unwrap_or(0);
                    let req = String::from_utf8_lossy(&buf[..n]);
                    let first_line = req.lines().next().unwrap_or("");
                    let path_part = first_line.split_whitespace().nth(1).unwrap_or("/");

                    if fu.load(std::sync::atomic::Ordering::Relaxed) && path_part.starts_with("/api/users/search") {
                        let resp = "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}";
                        let _ = socket.write_all(resp.as_bytes()).await;
                        return;
                    }
                    if ff.load(std::sync::atomic::Ordering::Relaxed) && path_part.starts_with("/api/fmi/date/") {
                        let resp = "HTTP/1.1 503 Service Unavailable\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}";
                        let _ = socket.write_all(resp.as_bytes()).await;
                        return;
                    }

                    let body_json = if path_part.contains("/api/developer/getToken") {
                        r##"{"token":"mock-heitz-uuid-token-2026"}"##.to_string()
                    } else if path_part.starts_with("/api/userPassages/browse") {
                        let skip: usize = path_part
                            .split("_skip=")
                            .nth(1)
                            .and_then(|s| s.split('&').next())
                            .and_then(|s| s.parse().ok())
                            .unwrap_or(0);
                        let end = (skip + 100).min(115);
                        let items: Vec<Value> = (skip..end)
                            .map(|i| {
                                let is_bey = i % 2 == 0;
                                json!({
                                    "id": 900000 + i as i64,
                                    "idClient": if i == 0 { 4967046791741i64 } else { 3845031974405i64 + i as i64 },
                                    "idAccess": 880000 + i as i64,
                                    "idPassCenter": if is_bey { 4967 } else { 3845 },
                                    "idCenter": if is_bey { 4967 } else { 3845 },
                                    "errorCode": 0,
                                    "in": "2026-11-25T09:10:00Z"
                                })
                            })
                            .collect();
                        serde_json::to_string(&items).unwrap()
                    } else if path_part.starts_with("/api/users/search") {
                        let offset: usize = path_part
                            .split("_offset=")
                            .nth(1)
                            .and_then(|s| s.split('&').next())
                            .and_then(|s| s.parse().ok())
                            .unwrap_or(0);
                        // 255 adhérents + 1 compte technique + 1 centre inconnu -> 255/256 réels paginés sur 3 pages (120 + 120 + 17)
                        let total = 257usize;
                        let end = (offset + 120).min(total);
                        let items: Vec<Value> = (offset..end)
                            .map(|i| {
                                if i == 0 {
                                    json!({
                                        "id": 4967046791741i64,
                                        "firstName": "CLAIRE",
                                        "lastName": "BERNARD",
                                        "type": 0,
                                        "idCenter": 4967,
                                        "_finBalance": 0.0,
                                        "_subscriptions": [{"idAccess": 4967046791852i64, "accessLabel": "ULTIME", "canceled": null}]
                                    })
                                } else if i == 1 {
                                    json!({
                                        "id": 3845031974405i64,
                                        "firstName": "NICOLAS",
                                        "lastName": "DUPONT",
                                        "type": 0,
                                        "idCenter": 3845,
                                        "_finBalance": -39.90,
                                        "_subscriptions": [{"accessLabel": "LIBERTE BI-CLUB", "canceled": null}]
                                    })
                                } else if i == 2 {
                                    // Centre inconnu (sans idCenter et préfixe 9999...) -> doit devenir "unassigned"
                                    json!({
                                        "id": 9999000012345i64,
                                        "firstName": "ALEX",
                                        "lastName": "INCONNU",
                                        "type": 0,
                                        "_finBalance": 0.0,
                                        "_subscriptions": []
                                    })
                                } else if i == 3 {
                                    json!({"id": 3845, "firstName": ".", "lastName": "C.FITNESS", "type": 4, "_finBalance": 0.0, "_subscriptions": []})
                                } else {
                                    json!({
                                        "id": 3845000100000i64 + i as i64,
                                        "firstName": format!("PRENOM{}", i),
                                        "lastName": "TEST",
                                        "type": 0,
                                        "idCenter": if i % 2 == 0 { 3845 } else { 4967 },
                                        "_finBalance": 0.0,
                                        "_subscriptions": [{"idAccess": 700000 + i as i64, "accessLabel": "ABO", "canceled": null}]
                                    })
                                }
                            })
                            .collect();
                        serde_json::to_string(&items).unwrap()
                    } else if path_part.starts_with("/api/fmi/date/") {
                        if fz.load(std::sync::atomic::Ordering::Relaxed) {
                            let h = Utc::now().hour();
                            let prev_h = if h > 0 { h - 1 } else { 23 };
                            json!({
                                "internalIn": {"H24": 120},
                                "internalOut": {"H24": 120},
                                "internalPresent": {
                                    format!("H{}", prev_h): 42,
                                    format!("H{}", h): 0
                                }
                            })
                            .to_string()
                        } else {
                            r##"{"internalIn":{"H24":836},"internalOut":{"H24":597},"internalPresent":{"H18":305,"H20":239}}"##.to_string()
                        }
                    } else if path_part.starts_with("/api/employee/list") {
                        r##"[{"id":384502580009,"firstName":"DANIEL","lastName":"CARVALHO"}]"##.to_string()
                    } else if path_part.starts_with("/api/planning/configuration/rooms") {
                        r##"[{"id":384502580175,"label":"BOX CROSSFIT","color":"#c0c0c0","dontUse":false,"creationIdCtr":3845}]"##.to_string()
                    } else if path_part.starts_with("/api/ticket") {
                        let offset: usize = path_part
                            .split("_offset=")
                            .nth(1)
                            .and_then(|s| s.split('&').next())
                            .and_then(|s| s.parse().ok())
                            .unwrap_or(0);
                        let total = 115usize;
                        let end = (offset + 100).min(total);
                        let items: Vec<Value> = (offset..end)
                            .map(|i| {
                                json!({
                                    "id": 500000 + i as i64,
                                    "number": format!("T{}", i),
                                    "printTotal": 10.0,
                                    "creationIdCenter": if i % 2 == 0 { 3845 } else { 4967 },
                                    "date": "2026-11-25T09:00:00Z"
                                })
                            })
                            .collect();
                        serde_json::to_string(&items).unwrap()
                    } else {
                        "[]".to_string()
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
            "cfos_heitz_68_test_{}",
            Utc::now().timestamp_nanos_opt().unwrap_or(0)
        ));
        std::fs::create_dir_all(&tmp).unwrap();
        let mut initial_db = try_load_or_init_state(&tmp).unwrap();

        // Prépare un dossier rec-hz existant avec suivi local (relance_count = 2, statut = "mise_en_demeure") + un dossier manuel
        initial_db.recovery_cases.push(RecoveryCaseRecord {
            id: "rec-hz-hz-3845031974405".into(),
            member_id: "hz-3845031974405".into(),
            member_name: "NICOLAS DUPONT".into(),
            club_id: "carre-de-soie".into(),
            phone: "".into(),
            email: "".into(),
            contract_label: "LIBERTE BI-CLUB".into(),
            amount_due_eur: 20.0,
            days_overdue: 18,
            unpaid_reason: "Rejet SEPA vérifié".into(),
            billed_months: vec!["2026-10".into()],
            has_signed_contract: true,
            has_id_and_rib: true,
            has_cgv_accepted: true,
            missing_docs: vec![],
            status: "mise_en_demeure".into(),
            relance_count: 2,
            last_action_note: "Relance manuelle déjà envoyée".into(),
            overdue_days_known: Some(true),
            compliance_verified: Some(true),
            source_provenance: Some("Manuel + Heitz".into()),
            last_synced_at_utc: None,
        });
        initial_db.recovery_cases.push(RecoveryCaseRecord {
            id: "rec-manual-keep".into(),
            member_id: "manual-1".into(),
            member_name: "Dossier Manuel".into(),
            club_id: "beynost".into(),
            phone: "".into(),
            email: "".into(),
            contract_label: "Manuel".into(),
            amount_due_eur: 50.0,
            days_overdue: 10,
            unpaid_reason: "Manuel".into(),
            billed_months: vec![],
            has_signed_contract: false,
            has_id_and_rib: false,
            has_cgv_accepted: false,
            missing_docs: vec![],
            status: "a_relancer".into(),
            relance_count: 1,
            last_action_note: "A garder absolument".into(),
            overdue_days_known: Some(true),
            compliance_verified: Some(false),
            source_provenance: None,
            last_synced_at_utc: None,
        });

        let state = Arc::new(SharedAppState {
            db: RwLock::new(initial_db),
            data_dir: tmp.clone(),
            sessions: RwLock::new(HashMap::new()),
            login_attempts: RwLock::new(HashMap::new()),
        });

        std::env::set_var("HEITZ_WS_URL", format!("http://{}", addr));
        std::env::set_var("HEITZ_DEV_ID", "test-dev-id");
        std::env::set_var("HEITZ_DEV_KEY", "test-dev-key");

        // 1. Synchro complète avec >240 adhérents, >100 passages, >60 tickets, centre inconnu et FMI=0
        let summary = run_heitz_live_sync(&state, "system-heitz-sync")
            .await
            .expect("Sync complète OK");
        assert!(!summary.partial_sync);
        assert_eq!(summary.synced_members_count, 256, "Pagination >240 adhérents hors compte technique");
        assert_eq!(summary.unassigned_center_members, 1, "Centre inconnu détecté explicitement");
        assert_eq!(summary.current_present, 0, "FMI présence 0 à l'heure courante conservée");

        {
            let db = state.db.read().await;
            let unknown_member = db.heitz_members.iter().find(|m| m.id == "hz-9999000012345").unwrap();
            assert_eq!(unknown_member.home_club_id, "unassigned");

            let nicolas = db.heitz_members.iter().find(|m| m.id == "hz-3845031974405").unwrap();
            assert!(!nicolas.rfid_bluetooth_enabled, "Pas de badge physique -> false");
            assert_eq!(nicolas.loyalty_points, 0, "Aucune fidélité inventée");
            assert_eq!(nicolas.technogym_moves30d, 0, "Aucun MOVE inventé");
            assert_eq!(nicolas.loyalty_points_known, Some(false));

            // Dossier recouvrement préservé et mis à jour
            let nicolas_rec = db
                .recovery_cases
                .iter()
                .find(|r| r.id == "rec-hz-hz-3845031974405")
                .unwrap();
            assert_eq!(nicolas_rec.status, "mise_en_demeure");
            assert_eq!(nicolas_rec.relance_count, 2);
            assert_eq!(nicolas_rec.amount_due_eur, 39.90);
            assert_eq!(nicolas_rec.last_action_note, "Relance manuelle déjà envoyée");

            // Dossier manuel conservé
            assert!(db.recovery_cases.iter().any(|r| r.id == "rec-manual-keep"));

            // KPI mis à jour avec les vrais tickets (>60 tickets : 58 CDS * 10 = 580, 57 BEY * 10 = 570)
            let kpi_cds = db.kpis.iter().find(|k| k.site_id == "club-carre-soie").unwrap();
            assert_eq!(kpi_cds.revenue_eur, Some(580.0));
        }

        // 2. Panne partielle FMI : partial_sync=true, avertissement explicite, données adhérents/recouvrement préservées
        fail_fmi.store(true, std::sync::atomic::Ordering::Relaxed);
        let partial = run_heitz_live_sync(&state, "system-heitz-sync").await.unwrap();
        assert!(partial.partial_sync);
        assert!(!partial.warnings.is_empty());
        fail_fmi.store(false, std::sync::atomic::Ordering::Relaxed);

        // 3. Panne recherche utilisateurs : Err retourné sans toucher heitz_members ni recovery_cases
        let before_count = state.db.read().await.heitz_members.len();
        let before_rec = state.db.read().await.recovery_cases.len();
        fail_users.store(true, std::sync::atomic::Ordering::Relaxed);
        assert!(run_heitz_live_sync(&state, "system-heitz-sync").await.is_err());
        assert_eq!(state.db.read().await.heitz_members.len(), before_count);
        assert_eq!(state.db.read().await.recovery_cases.len(), before_rec);
        fail_users.store(false, std::sync::atomic::Ordering::Relaxed);

        // 4. Droits mixtes : Manager Carré de Soie / simple employé Beynost
        {
            let mut db = state.db.write().await;
            db.employees.push(Employee {
                id: "emp-mix-cds".into(),
                first_name: "Mix".into(),
                last_name: "Manager".into(),
                birth_name: None,
                matricule: "MIX-01".into(),
                email: "mix@cfitness.fr".into(),
                phone: "".into(),
                active: true,
                hr_file_status: "complete".into(),
                site_accesses: vec![
                    EmployeeSiteAccess {
                        site_id: "club-carre-soie".into(),
                        is_primary: true,
                        profile_id: "master_avance".into(),
                        show_on_planning: true,
                        team_ids: vec![],
                        managed_team_ids: vec![],
                        position_ids: vec![],
                    },
                    EmployeeSiteAccess {
                        site_id: "club-beynost".into(),
                        is_primary: false,
                        profile_id: "employe_standard".into(),
                        show_on_planning: true,
                        team_ids: vec![],
                        managed_team_ids: vec![],
                        position_ids: vec![],
                    },
                ],
                sensitive_bank: SensitiveBankInfo {
                    payment_mode: "Virement".into(),
                    iban_masked: "".into(),
                    bic: "".into(),
                    nir_masked: "".into(),
                },
                contract: ContractSummary {
                    id: "ctr-mix".into(),
                    site_id: "club-carre-soie".into(),
                    contract_type: "CDI".into(),
                    regime: "hours".into(),
                    weekly_hours: Some(35),
                    annual_days: None,
                    monthly_gross_eur: None,
                    hourly_rate_eur: None,
                    loaded_cost_factor: 1.3,
                    effective_from: "2026-01-01".into(),
                    effective_to: None,
                },
                counter: EmployeeCounter {
                    cp_n_acquired: 0.0,
                    cp_n_taken: 0.0,
                    cp_n_minus1_remaining: 0.0,
                    rtt_days_remaining: None,
                    annualization_balance_hours: None,
                },
            });
        }
        let mix_headers = {
            let mut sessions = state.sessions.write().await;
            test_headers(&mut sessions, "emp-mix-cds")
        };

        let Json(overview) = get_heitz_live_overview(State(state.clone()), mix_headers.clone())
            .await
            .unwrap();
        let tickets = overview["recentTickets"].as_array().unwrap();
        assert!(!tickets.is_empty(), "Manager CDS voit les tickets de CDS");
        assert!(
            tickets.iter().all(|t| t["clubId"] == "carre-de-soie"),
            "Salarié standard sur Beynost ne voit aucun ticket Beynost"
        );

        // La synchro lancée par Manager CDS ne doit muter ni supprimer les adhérents/recouvrement Beynost
        let bey_before: Vec<HeitzMemberRecord> = state
            .db
            .read()
            .await
            .heitz_members
            .iter()
            .filter(|m| m.home_club_id == "beynost")
            .cloned()
            .collect();
        let Json(scoped_summary) =
            post_heitz_sync_live(State(state.clone()), mix_headers).await.unwrap();
        assert_eq!(scoped_summary.beynost_members, 0);
        let bey_after: Vec<HeitzMemberRecord> = state
            .db
            .read()
            .await
            .heitz_members
            .iter()
            .filter(|m| m.home_club_id == "beynost")
            .cloned()
            .collect();
        assert_eq!(bey_after.len(), bey_before.len());

        // 5. Worker désactivé en démo sans CFITNESS_HEITZ_WORKER=1
        std::env::set_var("CFITNESS_DEMO_MODE", "1");
        std::env::remove_var("CFITNESS_HEITZ_WORKER");
        assert!(!is_heitz_worker_enabled());
        std::env::set_var("CFITNESS_HEITZ_WORKER", "1");
        assert!(is_heitz_worker_enabled());
        std::env::set_var("CFITNESS_HEITZ_WORKER", "0");
        assert!(!is_heitz_worker_enabled());

        std::env::remove_var("CFITNESS_DEMO_MODE");
        std::env::remove_var("CFITNESS_HEITZ_WORKER");
        std::env::remove_var("HEITZ_WS_URL");
        std::env::remove_var("HEITZ_DEV_ID");
        std::env::remove_var("HEITZ_DEV_KEY");
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
