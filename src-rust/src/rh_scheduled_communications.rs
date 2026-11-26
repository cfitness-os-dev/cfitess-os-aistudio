//! Persistent internal-only scheduled publication. No external transport.
use super::*;
use chrono::DateTime;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledMessage {
    pub id: String,
    pub actor_id: String,
    pub club_id: String,
    pub operation_id: String,
    pub fingerprint: String,
    pub subject: String,
    pub body: String,
    pub recipient_ids: Vec<String>,
    pub scheduled_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub status: String,
    pub finished_at: Option<DateTime<Utc>>,
    pub published_message_id: Option<String>,
    pub reason: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Schedule {
    pub operation_id: String,
    pub subject: String,
    pub body: String,
    pub recipient_ids: Vec<String>,
    pub scheduled_at: DateTime<Utc>,
}
fn view(
    db: &AppDatabaseState,
    actor: &str,
    club: &str,
    before: Option<&str>,
) -> Result<Value, Failure> {
    check_publisher(db, actor, club)?;
    let all: Vec<_> = db
        .personal_workspace
        .collaboration
        .scheduled_messages
        .iter()
        .rev()
        .filter(|r| r.actor_id == actor && r.club_id == club)
        .collect();
    let start = match before {
        None => 0,
        Some(id) => all
            .iter()
            .position(|r| r.id == id)
            .map(|i| i + 1)
            .ok_or_else(|| bad("Cette page n’est plus disponible."))?,
    };
    let page: Vec<_> = all.iter().skip(start).take(50).collect();
    let next = if all.len() > start + page.len() {
        page.last().map(|r| r.id.clone())
    } else {
        None
    };
    let rows: Vec<Value> = page
        .iter()
        .map(|r| {
            json!({
                "id":r.id,"subject":r.subject,"body":r.body,"scheduledAt":r.scheduled_at,
                "createdAt":r.created_at,"status":r.status,"finishedAt":r.finished_at,
                "publishedMessageId":r.published_message_id,"reason":r.reason,
                "recipientCount":r.recipient_ids.len()
            })
        })
        .collect();
    Ok(
        json!({"actorId":actor,"clubId":club,"scheduledMessages":rows,"nextCursor":next,
        "schedulerEnabled":enabled()}),
    )
}
pub async fn get(
    State(state): State<SharedState>,
    Path(club): Path<String>,
    Query(page): Query<MessagePage>,
    headers: HeaderMap,
) -> Result<Json<Value>, Failure> {
    let actor = actor(&state, &headers).await?;
    Ok(Json(view(
        &*state.db.read().await,
        &actor,
        &club,
        page.before.as_deref(),
    )?))
}
pub async fn create(
    State(state): State<SharedState>,
    Path(club): Path<String>,
    headers: HeaderMap,
    Json(command): Json<Schedule>,
) -> Result<Json<Value>, Failure> {
    let actor = actor(&state, &headers).await?;
    let mut stored = state.db.write().await;
    let mut next = stored.clone();
    check_publisher(&next, &actor, &club)?;
    // The same publication contract is validated now and again at delivery.
    let publication = PublishMessage {
        operation_id: command.operation_id.clone(),
        subject: command.subject,
        body: command.body,
        recipient_ids: command.recipient_ids,
    };
    let (subject, body, recipient_ids, message_fingerprint) =
        validate_message(&next, &actor, &club, &publication)?;
    let fingerprint =
        hash(&serde_json::to_string(&(message_fingerprint, command.scheduled_at)).unwrap());
    if let Some(previous) = next
        .personal_workspace
        .collaboration
        .scheduled_messages
        .iter()
        .find(|r| {
            r.actor_id == actor && r.club_id == club && r.operation_id == command.operation_id
        })
    {
        if previous.fingerprint != fingerprint {
            return Err(err_resp(
                StatusCode::CONFLICT,
                "Cette programmation a déjà été utilisée avec un autre contenu.",
            ));
        }
        let mut result = view(&next, &actor, &club, None)?;
        result["scheduledMessageId"] = json!(previous.id);
        return Ok(Json(result));
    }
    if next
        .personal_workspace
        .collaboration
        .messages
        .iter()
        .any(|m| m.actor_id == actor && m.club_id == club && m.operation_id == command.operation_id)
    {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "Cette opération correspond déjà à un message publié.",
        ));
    }
    let now = Utc::now();
    if command.scheduled_at < now + Duration::minutes(1)
        || command.scheduled_at > now + Duration::days(366)
    {
        return Err(bad(
            "Choisissez une date dans au moins une minute et dans les douze prochains mois.",
        ));
    }
    if next
        .personal_workspace
        .collaboration
        .scheduled_messages
        .iter()
        .filter(|r| r.actor_id == actor && r.club_id == club && r.status == "scheduled")
        .count()
        >= 100
    {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "Vous avez déjà 100 messages en attente dans ce club.",
        ));
    }
    let id = format!("hr-scheduled-{}", random_token());
    next.personal_workspace
        .collaboration
        .scheduled_messages
        .push(ScheduledMessage {
            id: id.clone(),
            actor_id: actor.clone(),
            club_id: club.clone(),
            operation_id: command.operation_id,
            fingerprint,
            subject,
            body,
            recipient_ids,
            scheduled_at: command.scheduled_at,
            created_at: now,
            status: "scheduled".into(),
            finished_at: None,
            published_message_id: None,
            reason: None,
        });
    append_audit(
        &mut next,
        &actor,
        "RH_MESSAGE_SCHEDULED",
        format!("Message programmé : {id}"),
        site(&club)?,
        "MC09",
        None,
        None,
    );
    save(&state, &next)?;
    *stored = next;
    let mut result = view(&stored, &actor, &club, None)?;
    result["scheduledMessageId"] = json!(id);
    Ok(Json(result))
}
fn save(state: &SharedState, db: &AppDatabaseState) -> Result<(), Failure> {
    persist_state(&state.data_dir,db).map_err(|_|err_resp(StatusCode::INTERNAL_SERVER_ERROR,
        "L’enregistrement n’a pas été confirmé. Réessayez ; aucune publication partielle n’a été conservée."))
}
pub async fn cancel(
    State(state): State<SharedState>,
    Path((club, id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Json<Value>, Failure> {
    let actor = actor(&state, &headers).await?;
    let mut stored = state.db.write().await;
    check_publisher(&stored, &actor, &club)?;
    let mut next = stored.clone();
    let row = next
        .personal_workspace
        .collaboration
        .scheduled_messages
        .iter_mut()
        .find(|r| r.id == id && r.actor_id == actor && r.club_id == club)
        .ok_or_else(|| {
            err_resp(
                StatusCode::NOT_FOUND,
                "Programmation introuvable dans votre espace.",
            )
        })?;
    if row.status == "cancelled" {
        return Ok(Json(view(&stored, &actor, &club, None)?));
    }
    if row.status != "scheduled" {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "Ce message a déjà été traité. Il ne peut plus être annulé.",
        ));
    }
    row.status = "cancelled".into();
    row.finished_at = Some(Utc::now());
    append_audit(
        &mut next,
        &actor,
        "RH_MESSAGE_CANCELLED",
        format!("Programmation annulée : {id}"),
        site(&club)?,
        "MC09",
        None,
        None,
    );
    save(&state, &next)?;
    *stored = next;
    Ok(Json(view(&stored, &actor, &club, None)?))
}
pub async fn dispatch_due(state: &SharedState, now: DateTime<Utc>) -> Result<usize, Failure> {
    let mut stored = state.db.write().await;
    let indices: Vec<usize> = stored
        .personal_workspace
        .collaboration
        .scheduled_messages
        .iter()
        .enumerate()
        .filter(|(_, r)| r.status == "scheduled" && r.scheduled_at <= now)
        .take(50)
        .map(|(i, _)| i)
        .collect();
    if indices.is_empty() {
        return Ok(0);
    }
    let mut next = stored.clone();
    for i in &indices {
        let row = next.personal_workspace.collaboration.scheduled_messages[*i].clone();
        // A separate candidate discards partial in-memory effects if any recipient is invalid.
        let mut candidate = next.clone();
        let result = deliver_message(
            &mut candidate,
            &row.actor_id,
            &row.club_id,
            PublishMessage {
                operation_id: format!("scheduled-{}", hash(&row.id)),
                subject: row.subject.clone(),
                body: row.body.clone(),
                recipient_ids: row.recipient_ids.clone(),
            },
            now,
        );
        match result {
            Ok(id) => {
                next = candidate;
                let r = &mut next.personal_workspace.collaboration.scheduled_messages[*i];
                r.status = "published".into();
                r.published_message_id = Some(id);
            }
            Err(_) => {
                let r = &mut next.personal_workspace.collaboration.scheduled_messages[*i];
                r.status = "blocked".into();
                r.reason = Some("Publication suspendue : droits, destinataires ou boîte de réception à vérifier. Aucun destinataire n’a reçu ce message. Créez une nouvelle programmation après vérification.".into());
            }
        }
        next.personal_workspace.collaboration.scheduled_messages[*i].finished_at = Some(now);
        append_audit(
            &mut next,
            &row.actor_id,
            "RH_MESSAGE_SCHEDULE_PROCESSED",
            format!("Programmation traitée : {}", row.id),
            site(&row.club_id)?,
            "MC09",
            None,
            None,
        );
    }
    save(state, &next)?;
    *stored = next;
    Ok(indices.len())
}
fn enabled() -> bool {
    std::env::var("CFITNESS_RH_SCHEDULER")
        .map(|v| v != "0")
        .unwrap_or(true)
}
pub fn spawn_worker(state: SharedState) {
    if !enabled() {
        return;
    }
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(15));
        loop {
            interval.tick().await;
            if dispatch_due(&state, Utc::now()).await.is_err() {
                tracing::error!("Publication RH programmée non enregistrée ; nouvelle tentative au prochain passage.");
            }
        }
    });
}
#[cfg(test)]
#[path = "rh_scheduled_communications_tests.rs"]
mod tests;
