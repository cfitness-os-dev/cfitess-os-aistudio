//! Internal RH messages and revocable private calendar feeds. No provider calls.
use crate::models::AppDatabaseState;
use crate::rbac::{can_access_site_scope, evaluate_permission, PermissionTarget};
use crate::routes::{append_audit, err_resp, resolve_session_actor, SharedState};
use crate::seed::persist_state;
use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::{Duration, NaiveDate, NaiveTime, TimeZone, Utc};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeSet, HashMap};

type Failure = (StatusCode, Json<Value>);
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollaborationStore {
    #[serde(default)]
    pub messages: Vec<Message>,
    #[serde(default)]
    pub calendars: HashMap<String, CalendarGrant>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub actor_id: String,
    pub club_id: String,
    pub operation_id: String,
    pub fingerprint: String,
    pub subject: String,
    pub body: String,
    pub recipient_ids: Vec<String>,
    pub created_at: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarGrant {
    pub token_hash: String,
    pub club_ids: Vec<String>,
    pub created_at: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublishMessage {
    pub operation_id: String,
    pub subject: String,
    pub body: String,
    pub recipient_ids: Vec<String>,
}
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MessagePage {
    pub before: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IssueCalendar {
    pub club_ids: Vec<String>,
}

fn bad(text: &str) -> Failure {
    err_resp(StatusCode::BAD_REQUEST, text)
}
fn site(club: &str) -> Result<&'static str, Failure> {
    match club {
        "carre-de-soie" => Ok("club-carre-soie"),
        "beynost" => Ok("club-beynost"),
        _ => Err(bad("Club inconnu.")),
    }
}
fn club_name(club: &str) -> &'static str {
    if club == "beynost" {
        "Beynost"
    } else {
        "Carré de Soie"
    }
}
fn random_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}
fn hash(text: &str) -> String {
    hex::encode(Sha256::digest(text.as_bytes()))
}
async fn actor(state: &SharedState, headers: &HeaderMap) -> Result<String, Failure> {
    if !headers
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .is_some_and(|h| h.starts_with("Bearer "))
    {
        return Err(err_resp(
            StatusCode::UNAUTHORIZED,
            "Connectez-vous à votre compte.",
        ));
    }
    Ok(resolve_session_actor(state, headers).await?.0)
}
fn active(db: &AppDatabaseState, actor: &str) -> bool {
    db.employees.iter().any(|e| e.id == actor && e.active)
}
fn may_publish(db: &AppDatabaseState, actor: &str, club: &str) -> bool {
    let Ok(site) = site(club) else {
        return false;
    };
    active(db, actor)
        && db.employees.iter().any(|e| {
            e.id == actor
                && e.site_accesses.iter().any(|a| {
                    a.site_id == site
                        && matches!(
                            a.profile_id.as_str(),
                            "admin_systeme" | "master_avance" | "planificateur_avance"
                        )
                })
        })
}
fn recipient_allowed(db: &AppDatabaseState, actor: &str, club: &str, target: &str) -> bool {
    let Ok(site) = site(club) else {
        return false;
    };
    let Some(employee) = db.employees.iter().find(|e| e.id == target && e.active) else {
        return false;
    };
    let Some(access) = employee.site_accesses.iter().find(|a| a.site_id == site) else {
        return false;
    };
    evaluate_permission(
        db,
        actor,
        site,
        "ORG04-07",
        Some(PermissionTarget {
            site_id: Some(site),
            target_employee_id: Some(target),
            target_team_ids: &access.team_ids,
            lock_state: None,
        }),
    )
    .allowed
}
fn check_publisher(db: &AppDatabaseState, actor: &str, club: &str) -> Result<(), Failure> {
    site(club)?;
    if !may_publish(db, actor, club) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "La communication RH est réservée aux responsables autorisés dans ce club.",
        ));
    }
    Ok(())
}
fn name(db: &AppDatabaseState, id: &str) -> String {
    db.employees
        .iter()
        .find(|e| e.id == id)
        .map(|e| format!("{} {}", e.first_name, e.last_name))
        .unwrap_or_else(|| "Collaborateur".into())
}
fn workspace(
    db: &AppDatabaseState,
    actor: &str,
    club: &str,
    before: Option<&str>,
) -> Result<Value, Failure> {
    check_publisher(db, actor, club)?;
    let recipient_ids: BTreeSet<&str> = db
        .employees
        .iter()
        .filter(|e| recipient_allowed(db, actor, club, &e.id))
        .map(|e| e.id.as_str())
        .collect();
    let history: Vec<&Message> = db
        .personal_workspace
        .collaboration
        .messages
        .iter()
        .rev()
        .filter(|m| m.actor_id == actor && m.club_id == club)
        .collect();
    let start = match before {
        None => 0,
        Some(id) => history
            .iter()
            .position(|m| m.id == id)
            .map(|i| i + 1)
            .ok_or_else(|| bad("La page demandée n’est plus disponible."))?,
    };
    let page: Vec<&Message> = history.iter().skip(start).take(50).copied().collect();
    let next = if start + page.len() < history.len() {
        page.last().map(|m| m.id.clone())
    } else {
        None
    };
    let messages: Vec<Value> = page.iter().map(|m| {
        let receipts: Vec<Value> = m.recipient_ids.iter().filter(|id|recipient_ids.contains(id.as_str())).map(|id| {
            let data = crate::personal_workspace::person(db,id);
            let row = data["notifications"].as_array().and_then(|rows|rows.iter().find(|row|row["rhMessageId"]==m.id));
            json!({"employeeId":id,"employeeName":name(db,id),"read":row.is_some_and(|r|r["read"]==true),"readAt":row.and_then(|r|r["readAt"].as_str())})
        }).collect();
        json!({"id":m.id,"subject":m.subject,"body":m.body,"createdAt":m.created_at,"recipientCount":m.recipient_ids.len(),"receipts":receipts})
    }).collect();
    Ok(
        json!({"actorId":actor,"clubId":club,"channel":"internal","recipients":recipient_ids.iter().map(|id|json!({"id":id,"name":name(db,id)})).collect::<Vec<_>>(),"messages":messages,"nextCursor":next}),
    )
}
pub async fn get_messages(
    State(state): State<SharedState>,
    Path(club): Path<String>,
    Query(page): Query<MessagePage>,
    headers: HeaderMap,
) -> Result<Json<Value>, Failure> {
    let actor = actor(&state, &headers).await?;
    let db = state.db.read().await;
    Ok(Json(workspace(&db, &actor, &club, page.before.as_deref())?))
}
pub async fn publish_message(
    State(state): State<SharedState>,
    Path(club): Path<String>,
    headers: HeaderMap,
    Json(command): Json<PublishMessage>,
) -> Result<Json<Value>, Failure> {
    let actor = actor(&state, &headers).await?;
    let mut db = state.db.write().await;
    check_publisher(&db, &actor, &club)?;
    let subject = command.subject.trim();
    let body = command.body.replace("\r\n", "\n");
    let body = body.trim();
    if subject.is_empty()
        || subject.chars().count() > 160
        || subject.chars().any(char::is_control)
        || body.is_empty()
        || body.chars().count() > 10_000
        || body
            .chars()
            .any(|c| c.is_control() && c != '\n' && c != '\t')
    {
        return Err(bad("Renseignez un objet de 160 caractères maximum et un message de 10 000 caractères maximum."));
    }
    if !(16..=80).contains(&command.operation_id.len())
        || !command
            .operation_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err(bad("Identifiant de publication invalide."));
    }
    if command.recipient_ids.is_empty() || command.recipient_ids.len() > 200 {
        return Err(bad("Choisissez entre 1 et 200 destinataires."));
    }
    let ids: Vec<String> = command
        .recipient_ids
        .into_iter()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    if ids
        .iter()
        .any(|id| !recipient_allowed(&db, &actor, &club, id))
    {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Un destinataire n’est pas autorisé dans votre périmètre. Actualisez la liste.",
        ));
    }
    let fingerprint = hash(&serde_json::to_string(&(subject, body, &ids)).unwrap());
    if let Some(previous) = db
        .personal_workspace
        .collaboration
        .messages
        .iter()
        .find(|m| {
            m.actor_id == actor && m.club_id == club && m.operation_id == command.operation_id
        })
    {
        if previous.fingerprint != fingerprint {
            return Err(err_resp(
                StatusCode::CONFLICT,
                "Cette publication a déjà été utilisée avec un autre contenu.",
            ));
        }
        let id = previous.id.clone();
        let mut response = workspace(&db, &actor, &club, None)?;
        response["publishedMessageId"] = json!(id);
        return Ok(Json(response));
    }
    let now = Utc::now().to_rfc3339();
    let id = format!("hr-msg-{}", random_token());
    let sender = name(&db, &actor);
    let mut next = db.clone();
    for employee in &ids {
        let mut personal = crate::personal_workspace::person(&next, employee);
        let Some(notifications) = personal["notifications"].as_array_mut() else {
            return Err(err_resp(
                StatusCode::CONFLICT,
                "Les notifications d’un destinataire nécessitent une vérification.",
            ));
        };
        notifications.insert(0,json!({"id":id,"rhMessageId":id,"employeeId":employee,"clubId":club,"createdAt":now,"title":subject,"message":body,"senderName":sender,"type":"rh_message","read":false,"readAt":null}));
        next.personal_workspace
            .people
            .insert(employee.clone(), personal);
    }
    next.personal_workspace
        .collaboration
        .messages
        .push(Message {
            id: id.clone(),
            actor_id: actor.clone(),
            club_id: club.clone(),
            operation_id: command.operation_id,
            fingerprint,
            subject: subject.into(),
            body: body.into(),
            recipient_ids: ids.clone(),
            created_at: now,
        });
    append_audit(
        &mut next,
        &actor,
        "Communication RH",
        format!(
            "Publication interne : {} destinataire(s), référence {}",
            ids.len(),
            id
        ),
        site(&club)?,
        "MC09",
        None,
        None,
    );
    persist_state(&state.data_dir, &next).map_err(|_| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Publication non enregistrée. Votre saisie est conservée.",
        )
    })?;
    *db = next;
    let mut response = workspace(&db, &actor, &club, None)?;
    response["publishedMessageId"] = json!(id);
    Ok(Json(response))
}

fn calendar_enabled(db: &AppDatabaseState, actor: &str) -> bool {
    db.preferences_by_employee
        .get(actor)
        .map(|p| p.calendar_feed_enabled)
        .unwrap_or(true)
}
pub async fn calendar_status(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, Failure> {
    let actor = actor(&state, &headers).await?;
    let db = state.db.read().await;
    if !active(&db, &actor) {
        return Err(err_resp(StatusCode::FORBIDDEN, "Compte indisponible."));
    }
    let grant = db.personal_workspace.collaboration.calendars.get(&actor);
    Ok(Json(
        json!({"actorId":actor,"enabled":calendar_enabled(&db,&actor),"issued":grant.is_some(),"clubIds":grant.map(|g|g.club_ids.clone()).unwrap_or_default(),"createdAt":grant.map(|g|g.created_at.clone())}),
    ))
}
pub async fn issue_calendar(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(command): Json<IssueCalendar>,
) -> Result<Json<Value>, Failure> {
    let actor = actor(&state, &headers).await?;
    let mut db = state.db.write().await;
    if !active(&db, &actor) || !calendar_enabled(&db, &actor) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Activez votre calendrier dans vos préférences avant de créer un lien.",
        ));
    }
    let ids: Vec<String> = command
        .club_ids
        .into_iter()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    if ids.is_empty() || ids.len() > 2 {
        return Err(bad("Sélectionnez au moins un club autorisé."));
    }
    for club in &ids {
        if !can_access_site_scope(&db, &actor, site(club)?) {
            return Err(err_resp(StatusCode::FORBIDDEN, "Club non autorisé."));
        }
    }
    let token = random_token();
    let now = Utc::now().to_rfc3339();
    let mut next = db.clone();
    next.personal_workspace.collaboration.calendars.insert(
        actor.clone(),
        CalendarGrant {
            token_hash: hash(&token),
            club_ids: ids.clone(),
            created_at: now.clone(),
        },
    );
    append_audit(
        &mut next,
        &actor,
        "Calendrier personnel",
        "Création ou renouvellement du lien privé ; ancien lien invalidé.".into(),
        "org",
        "MC13",
        None,
        None,
    );
    persist_state(&state.data_dir, &next).map_err(|_| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Le lien n’a pas été créé. Réessayez.",
        )
    })?;
    *db = next;
    Ok(Json(
        json!({"actorId":actor,"relativeUrl":format!("/api/calendar/{}.ics",token),"clubIds":ids,"createdAt":now}),
    ))
}
fn escape(text: &str) -> String {
    text.replace('\\', "\\\\")
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .replace('\n', "\\n")
        .replace(',', "\\,")
        .replace(';', "\\;")
        .chars()
        .filter(|c| !c.is_control())
        .collect()
}
fn line(output: &mut String, value: &str) {
    let mut bytes = 0;
    for c in value.chars() {
        if bytes + c.len_utf8() > 75 {
            output.push_str("\r\n ");
            bytes = 1;
        }
        output.push(c);
        bytes += c.len_utf8();
    }
    output.push_str("\r\n");
}
fn local(date: NaiveDate, time: NaiveTime) -> Option<chrono::DateTime<Utc>> {
    chrono_tz::Europe::Paris
        .from_local_datetime(&date.and_time(time))
        .earliest()
        .map(|d| d.with_timezone(&Utc))
}
fn calendar(db: &AppDatabaseState, owner: &str, clubs: &[String]) -> Result<String, Failure> {
    let sites: BTreeSet<&str> = clubs
        .iter()
        .filter_map(|c| site(c).ok())
        .filter(|s| can_access_site_scope(db, owner, s))
        .collect();
    if sites.is_empty() {
        return Err(err_resp(StatusCode::NOT_FOUND, "Calendrier indisponible."));
    }
    let now = Utc::now();
    let from = (now - Duration::days(90)).date_naive();
    let until = (now + Duration::days(366)).date_naive();
    let stamp = now.format("%Y%m%dT%H%M%SZ").to_string();
    let mut out = String::new();
    for value in [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//C.Fitness OS//Calendrier personnel//FR",
        "CALSCALE:GREGORIAN",
        "X-WR-CALNAME:Mon planning C.Fitness",
    ] {
        line(&mut out, value);
    }
    let invalid = || {
        err_resp(
            StatusCode::SERVICE_UNAVAILABLE,
            "Un horaire du planning nécessite une vérification.",
        )
    };
    for shift in db.shifts.iter().filter(|s| {
        s.employee_id.as_deref() == Some(owner) && s.published && sites.contains(s.site_id.as_str())
    }) {
        let date = NaiveDate::parse_from_str(&shift.date, "%Y-%m-%d").map_err(|_| invalid())?;
        if date < from || date > until {
            continue;
        }
        let start = NaiveTime::parse_from_str(&shift.start_time, "%H:%M").map_err(|_| invalid())?;
        let end = NaiveTime::parse_from_str(&shift.end_time, "%H:%M").map_err(|_| invalid())?;
        let end_day = if end <= start {
            date.succ_opt().ok_or_else(invalid)?
        } else {
            date
        };
        let a = local(date, start).ok_or_else(invalid)?;
        let b = local(end_day, end).ok_or_else(invalid)?;
        if b <= a {
            return Err(invalid());
        }
        let club = if shift.site_id == "club-beynost" {
            "beynost"
        } else {
            "carre-de-soie"
        };
        let title = db
            .positions
            .iter()
            .find(|p| p.id == shift.position_id)
            .map(|p| p.label.as_str())
            .unwrap_or("Horaire de travail");
        for value in [
            "BEGIN:VEVENT".into(),
            format!(
                "UID:shift-{}@cfitness-os",
                hash(&format!("{}:{}:{}", owner, shift.site_id, shift.id))
            ),
            format!("DTSTAMP:{}", stamp),
            format!("DTSTART:{}", a.format("%Y%m%dT%H%M%SZ")),
            format!("DTEND:{}", b.format("%Y%m%dT%H%M%SZ")),
            format!("SUMMARY:{}", escape(title)),
            format!("LOCATION:{}", escape(club_name(club))),
            "CLASS:PRIVATE".into(),
            "END:VEVENT".into(),
        ] {
            line(&mut out, &value);
        }
    }
    for leave in db.leave_requests.iter().filter(|r| {
        r.employee_id == owner
            && sites.contains(r.site_id.as_str())
            && matches!(r.status.as_str(), "approved" | "accepted")
    }) {
        let start =
            NaiveDate::parse_from_str(&leave.start_date, "%Y-%m-%d").map_err(|_| invalid())?;
        let end = NaiveDate::parse_from_str(&leave.end_date, "%Y-%m-%d").map_err(|_| invalid())?;
        if end < from || start > until {
            continue;
        }
        if end < start {
            return Err(invalid());
        }
        // Only generic unavailability is exported, never leave reason/comment/medical documents.
        let details = db.leave_policy.requests.get(&leave.id);
        let start_period = details.map(|d| d.start_period.as_str()).unwrap_or("am");
        let end_period = details.map(|d| d.end_period.as_str()).unwrap_or("pm");
        if !matches!(start_period, "am" | "pm") || !matches!(end_period, "am" | "pm") {
            return Err(invalid());
        }
        line(&mut out, "BEGIN:VEVENT");
        line(
            &mut out,
            &format!(
                "UID:leave-{}@cfitness-os",
                hash(&format!("{}:{}", owner, leave.id))
            ),
        );
        line(&mut out, &format!("DTSTAMP:{}", stamp));
        if start_period == "am" && end_period == "pm" {
            line(
                &mut out,
                &format!("DTSTART;VALUE=DATE:{}", start.format("%Y%m%d")),
            );
            line(
                &mut out,
                &format!(
                    "DTEND;VALUE=DATE:{}",
                    end.succ_opt().ok_or_else(invalid)?.format("%Y%m%d")
                ),
            );
        } else {
            let start_time =
                NaiveTime::from_hms_opt(if start_period == "pm" { 12 } else { 0 }, 0, 0).unwrap();
            let (end_day, end_hour) = if end_period == "am" {
                (end, 12)
            } else {
                (end.succ_opt().ok_or_else(invalid)?, 0)
            };
            let a = local(start, start_time).ok_or_else(invalid)?;
            let b = local(end_day, NaiveTime::from_hms_opt(end_hour, 0, 0).unwrap())
                .ok_or_else(invalid)?;
            if b <= a {
                return Err(invalid());
            }
            line(&mut out, &format!("DTSTART:{}", a.format("%Y%m%dT%H%M%SZ")));
            line(&mut out, &format!("DTEND:{}", b.format("%Y%m%dT%H%M%SZ")));
        }
        for value in ["SUMMARY:Absence validée", "CLASS:PRIVATE", "END:VEVENT"] {
            line(&mut out, value);
        }
    }
    line(&mut out, "END:VCALENDAR");
    Ok(out)
}
pub async fn calendar_feed(
    State(state): State<SharedState>,
    Path(raw): Path<String>,
) -> Result<Response, Failure> {
    let token = raw.strip_suffix(".ics").unwrap_or("");
    if token.len() != 64 || !token.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(err_resp(StatusCode::NOT_FOUND, "Calendrier indisponible."));
    }
    let digest = hash(token);
    let db = state.db.read().await;
    let (owner, grant) = db
        .personal_workspace
        .collaboration
        .calendars
        .iter()
        .find(|(owner, grant)| {
            grant.token_hash == digest && active(&db, owner) && calendar_enabled(&db, owner)
        })
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Calendrier indisponible."))?;
    let output = calendar(&db, owner, &grant.club_ids)?;
    Ok((
        [
            ("content-type", "text/calendar; charset=utf-8"),
            ("cache-control", "private, no-store"),
            (
                "content-disposition",
                "attachment; filename=mon-planning-cfitness.ics",
            ),
            ("referrer-policy", "no-referrer"),
        ],
        output,
    )
        .into_response())
}

#[cfg(test)]
#[path = "hr_collaboration_tests.rs"]
mod tests;
