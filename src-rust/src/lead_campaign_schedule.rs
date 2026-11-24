//! Persistent SMS simulation schedules. No provider transport.
use super::*;
use chrono::{LocalResult, NaiveDateTime, TimeZone};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledRun {
    pub id: String,
    pub campaign_revision: u64,
    pub scheduled_at: String,
    pub local_date_time: String,
    pub timezone: String,
    pub status: String,
    pub actor_id: String,
    pub created_at: String,
    pub message: messages::Message,
    pub finished_at: Option<String>,
    pub reason: Option<String>,
    pub cancelled_by: Option<String>,
}

fn instant(local: &str, timezone: &str) -> Result<DateTime<Utc>, Failure> {
    if timezone != "Europe/Paris" {
        return Err(bad("Choisissez le fuseau Europe/Paris des clubs."));
    }
    let naive = NaiveDateTime::parse_from_str(local, "%Y-%m-%dT%H:%M")
        .map_err(|_| bad("Indiquez une date et une heure valides, à la minute."))?;
    match chrono_tz::Europe::Paris.from_local_datetime(&naive) {
        LocalResult::Single(at) => Ok(at.with_timezone(&Utc)),
        LocalResult::Ambiguous(_, _) => Err(bad(
            "Cette heure existe deux fois au changement d’heure. Choisissez une autre heure.",
        )),
        LocalResult::None => Err(bad(
            "Cette heure n’existe pas au changement d’heure. Choisissez une autre heure.",
        )),
    }
}

pub fn apply(
    db: &mut AppDatabaseState,
    club: &str,
    actor: &str,
    command: &Command,
    now: DateTime<Utc>,
) -> Result<(), Failure> {
    if !is_demo_mode() {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "La programmation prépare uniquement des simulations en démonstration.",
        ));
    }
    match command {
        Command::ScheduleCampaign {
            campaign_id,
            expected_revision,
            local_date_time,
            timezone,
        } => {
            let at = instant(local_date_time, timezone)?;
            if at <= now || at > now + Duration::days(366) {
                return Err(bad(
                    "Choisissez une heure future dans les douze prochains mois.",
                ));
            }
            let c = db
                .lead_scenarios
                .campaigns
                .iter()
                .find(|c| c.id == *campaign_id && c.club_id == club)
                .ok_or_else(|| {
                    err_resp(StatusCode::NOT_FOUND, "Campagne introuvable dans ce club.")
                })?;
            if c.revision != *expected_revision
                || c.archived
                || c.channel != "sms"
                || c.simulated_revisions.contains(&c.revision)
                || c.schedules.iter().any(|s| s.status == "scheduled")
            {
                return Err(err_resp(StatusCode::CONFLICT,"Cette version ne peut pas être programmée : rechargez ou annulez la programmation en cours."));
            }
            let message = db
                .lead_scenarios
                .templates
                .iter()
                .find(|t| {
                    t.id == c.template_id
                        && t.club_id == club
                        && !t.archived
                        && t.message.channel == "sms"
                })
                .ok_or_else(|| {
                    err_resp(
                        StatusCode::CONFLICT,
                        "Choisissez un modèle SMS disponible dans ce club.",
                    )
                })?
                .message
                .clone();
            messages::validate_message(&message)?;
            let revision = c.revision;
            let c = db
                .lead_scenarios
                .campaigns
                .iter_mut()
                .find(|c| c.id == *campaign_id && c.club_id == club)
                .unwrap();
            c.schedules.push(ScheduledRun {
                id: format!("schedule-{}", rand::random::<u128>()),
                campaign_revision: revision,
                scheduled_at: at.to_rfc3339(),
                local_date_time: local_date_time.clone(),
                timezone: timezone.clone(),
                status: "scheduled".into(),
                actor_id: actor.into(),
                created_at: now.to_rfc3339(),
                message,
                finished_at: None,
                reason: None,
                cancelled_by: None,
            });
        }
        Command::CancelCampaignSchedule {
            campaign_id,
            expected_revision,
            schedule_id,
            reason,
        } => {
            if reason.trim().is_empty() || reason.chars().count() > 2000 {
                return Err(bad(
                    "Indiquez un motif d’annulation de 1 à 2 000 caractères.",
                ));
            }
            let c = db
                .lead_scenarios
                .campaigns
                .iter_mut()
                .find(|c| c.id == *campaign_id && c.club_id == club)
                .ok_or_else(|| {
                    err_resp(StatusCode::NOT_FOUND, "Campagne introuvable dans ce club.")
                })?;
            if c.revision != *expected_revision {
                return Err(err_resp(
                    StatusCode::CONFLICT,
                    "La campagne a changé. Rechargez avant d’annuler.",
                ));
            }
            let schedule = c
                .schedules
                .iter_mut()
                .find(|s| s.id == *schedule_id)
                .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Programmation introuvable."))?;
            if schedule.status != "scheduled" {
                return Err(err_resp(
                    StatusCode::CONFLICT,
                    "Cette programmation est déjà terminée ou annulée.",
                ));
            }
            schedule.status = "cancelled".into();
            schedule.finished_at = Some(now.to_rfc3339());
            schedule.reason = Some(reason.trim().into());
            schedule.cancelled_by = Some(actor.into());
        }
        _ => return Err(bad("Commande de programmation invalide.")),
    }
    Ok(())
}

/// Called only under the common DB lock on a clone, persisted before publication.
pub fn process_due(db: &mut AppDatabaseState, club: &str, now: DateTime<Utc>) -> bool {
    if !is_demo_mode() {
        return false;
    }
    let mut changed = false;
    for ci in 0..db.lead_scenarios.campaigns.len() {
        if db.lead_scenarios.campaigns[ci].club_id != club {
            continue;
        }
        for si in 0..db.lead_scenarios.campaigns[ci].schedules.len() {
            let schedule = db.lead_scenarios.campaigns[ci].schedules[si].clone();
            if schedule.status != "scheduled" {
                continue;
            }
            let parsed = DateTime::parse_from_rfc3339(&schedule.scheduled_at);
            if parsed.as_ref().is_ok_and(|at| at.with_timezone(&Utc) > now) {
                continue;
            }
            let c = db.lead_scenarios.campaigns[ci].clone();
            let result = if parsed.is_err()
                || schedule.timezone != "Europe/Paris"
                || schedule.message.channel != "sms"
                || c.channel != "sms"
                || c.revision != schedule.campaign_revision
                || c.archived
                || c.simulated_revisions.contains(&c.revision)
            {
                Err(err_resp(
                    StatusCode::CONFLICT,
                    "Programmation incohérente ou version déjà simulée. Aucun message préparé.",
                ))
            } else if authorize(db, &schedule.actor_id, club).is_err() {
                Err(err_resp(StatusCode::FORBIDDEN,"Le responsable n’a plus les droits requis pour ce club. Aucun message préparé."))
            } else {
                simulate(db, &c, &schedule.actor_id, now, &schedule.message)
            };
            let s = &mut db.lead_scenarios.campaigns[ci].schedules[si];
            s.finished_at = Some(now.to_rfc3339());
            match result {
                Ok(()) => s.status = "simulated".into(),
                Err(_) => {
                    s.status = "failed".into();
                    s.reason=Some("Simulation impossible : version, données ou droits du responsable à vérifier. Aucune livraison réelle.".into());
                }
            }
            changed = true;
        }
    }
    changed
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paris_schedule_rejects_dst_gaps_ambiguities_and_other_timezones() {
        assert_eq!(
            instant("2027-01-15T12:00", "Europe/Paris")
                .unwrap()
                .to_rfc3339(),
            "2027-01-15T11:00:00+00:00"
        );
        assert_eq!(
            instant("2027-07-15T12:00", "Europe/Paris")
                .unwrap()
                .to_rfc3339(),
            "2027-07-15T10:00:00+00:00"
        );
        assert!(instant("2027-03-28T02:30", "Europe/Paris").is_err());
        assert!(instant("2027-10-31T02:30", "Europe/Paris").is_err());
        assert!(instant("2027-01-15T12:00", "UTC").is_err());
        assert!(instant("2027-02-31T12:00", "Europe/Paris").is_err());
    }
}
