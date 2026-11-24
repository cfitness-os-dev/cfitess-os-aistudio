//! Club-owned campaign drafts and local simulations, sharing scenario auth/atomic storage.
use super::*;
fn bad(message: &str) -> Failure {
    err_resp(StatusCode::UNPROCESSABLE_ENTITY, message)
}

fn default_channel() -> String {
    "email".into()
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Campaign {
    pub id: String,
    pub club_id: String,
    pub revision: u64,
    pub name: String,
    #[serde(default = "default_channel")]
    pub channel: String,
    #[serde(default)]
    pub segment_ids: Vec<String>,
    pub template_id: String,
    pub status_ids: Vec<String>,
    pub source_ids: Vec<String>,
    pub archived: bool,
    pub updated_at: String,
    pub simulated_revisions: Vec<u64>,
    #[serde(default)]
    pub runs: Vec<Value>,
}

pub fn targets(db: &AppDatabaseState, campaign: &Campaign) -> Value {
    let mut eligible = vec![];
    let mut excluded = vec![];
    let mut seen = HashSet::new();
    for p in db
        .lead_prospects
        .iter()
        .filter(|p| p.club_id == campaign.club_id)
    {
        if !campaign.status_ids.is_empty()
            && !campaign.status_ids.contains(&p.stage)
            && !campaign.status_ids.contains(&p.lead_status)
        {
            continue;
        }
        if !campaign.source_ids.is_empty() && !campaign.source_ids.contains(&p.source) {
            continue;
        }
        if !campaign.segment_ids.is_empty()
            && !campaign.segment_ids.iter().any(|s| p.segments.contains(s))
        {
            continue;
        }
        let mut reason = if p.is_archived {
            Some("Contact archivé")
        } else if p.stage == "Perdu" || p.lead_status == "Perdu / Sans suite" {
            Some("Contact perdu")
        } else if p.lead_status == "Clients en vacances"
            || p.segments.iter().any(|s| s == "Vacances")
        {
            Some("Contact en vacances")
        } else if !p.rgpd_consent {
            Some("Consentement général absent")
        } else {
            None
        };
        if reason.is_none() {
            reason = if campaign.channel == "sms" {
                sms::excluded(db, &campaign.club_id, &p.phone)
            } else if campaign.channel != "email" {
                Some("Canal de campagne invalide")
            } else if !brevo::valid_address(&p.email) {
                Some("Adresse email invalide")
            } else if brevo::suppressed(
                &db.lead_scenarios.email_suppressions,
                &campaign.club_id,
                &p.email,
            ) {
                Some("Adresse exclue des emails")
            } else {
                None
            };
        }
        let key = if campaign.channel == "sms" {
            sms::normalize_phone(&p.phone).unwrap_or_default()
        } else {
            brevo::normalized(&p.email)
        };
        if reason.is_none() && !seen.insert(key) {
            reason = Some("Coordonnées déjà retenues");
        }
        if let Some(reason) = reason {
            excluded.push(json!({"prospectId":p.id,"reason":reason}));
        } else {
            eligible.push(p.id.clone());
        }
    }
    json!({"eligibleIds":eligible,"excluded":excluded})
}

pub fn apply(
    db: &mut AppDatabaseState,
    club: &str,
    actor: &str,
    command: &Command,
    now: DateTime<Utc>,
) -> Result<(), Failure> {
    match command {
        Command::SaveCampaign {
            campaign_id,
            expected_revision,
            name,
            template_id,
            status_ids,
            source_ids,
            segment_ids,
        } => {
            if name.trim().is_empty()
                || name.chars().count() > 200
                || status_ids.len() > 100
                || source_ids.len() > 100
                || segment_ids.len() > 100
            {
                return Err(bad("Nom ou ciblage de campagne invalide."));
            }
            if status_ids.iter().any(|s| {
                !statuses().contains(s)
                    && !db
                        .lead_prospects
                        .iter()
                        .any(|p| p.club_id == club && (&p.stage == s || &p.lead_status == s))
            }) || source_ids.iter().any(|s| !sources(db, club).contains(s))
            {
                return Err(bad("Ciblage absent du référentiel de ce club."));
            }
            if segment_ids.iter().any(|s| {
                !db.lead_prospects
                    .iter()
                    .any(|p| p.club_id == club && p.segments.contains(s))
            }) {
                return Err(bad("Segment absent de ce club."));
            }
            let template = db
                .lead_scenarios
                .templates
                .iter()
                .find(|t| t.id == *template_id && t.club_id == club && !t.archived)
                .ok_or_else(|| {
                    err_resp(StatusCode::NOT_FOUND, "Modèle introuvable dans ce club.")
                })?;
            if !matches!(template.message.channel.as_str(), "email" | "sms") {
                return Err(bad("Choisissez un modèle email ou SMS."));
            }
            let channel = template.message.channel.clone();
            if let Some(id) = campaign_id {
                let c = db
                    .lead_scenarios
                    .campaigns
                    .iter_mut()
                    .find(|c| c.id == *id && c.club_id == club)
                    .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Campagne introuvable."))?;
                if Some(c.revision) != *expected_revision || c.archived {
                    return Err(err_resp(
                        StatusCode::CONFLICT,
                        "La campagne a changé ou est archivée. Rechargez-la.",
                    ));
                }
                if c.channel != channel {
                    return Err(bad(
                        "Le canal d’une campagne enregistrée ne peut pas changer.",
                    ));
                }
                c.segment_ids = segment_ids.clone();
                c.revision += 1;
                c.name = name.trim().into();
                c.template_id = template_id.clone();
                c.status_ids = status_ids.clone();
                c.source_ids = source_ids.clone();
                c.updated_at = now.to_rfc3339();
            } else {
                if expected_revision.is_some() {
                    return Err(bad("Une nouvelle campagne ne possède pas de révision."));
                }
                db.lead_scenarios.campaigns.push(Campaign {
                    id: format!("campaign-{}", rand::random::<u128>()),
                    club_id: club.into(),
                    revision: 1,
                    channel,
                    segment_ids: segment_ids.clone(),
                    name: name.trim().into(),
                    template_id: template_id.clone(),
                    status_ids: status_ids.clone(),
                    source_ids: source_ids.clone(),
                    archived: false,
                    updated_at: now.to_rfc3339(),
                    simulated_revisions: vec![],
                    runs: vec![],
                });
            }
        }
        Command::SimulateCampaign {
            campaign_id,
            expected_revision,
        }
        | Command::ArchiveCampaign {
            campaign_id,
            expected_revision,
        } => {
            let idx = db
                .lead_scenarios
                .campaigns
                .iter()
                .position(|c| c.id == *campaign_id && c.club_id == club)
                .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Campagne introuvable."))?;
            let c = db.lead_scenarios.campaigns[idx].clone();
            if c.revision != *expected_revision || c.archived {
                return Err(err_resp(
                    StatusCode::CONFLICT,
                    "La campagne a changé ou est archivée. Rechargez-la.",
                ));
            }
            if matches!(command, Command::ArchiveCampaign { .. }) {
                db.lead_scenarios.campaigns[idx].archived = true;
                db.lead_scenarios.campaigns[idx].revision += 1;
                return Ok(());
            }
            if !is_demo_mode() {
                return Err(err_resp(
                    StatusCode::CONFLICT,
                    "Simulation disponible uniquement en démonstration. Aucun envoi réel raccordé.",
                ));
            }
            if c.simulated_revisions.contains(&c.revision) {
                return Ok(());
            }
            let message = db
                .lead_scenarios
                .templates
                .iter()
                .find(|t| t.id == c.template_id && t.club_id == club && !t.archived)
                .ok_or_else(|| {
                    err_resp(
                        StatusCode::CONFLICT,
                        "Le modèle est archivé ou indisponible.",
                    )
                })?
                .message
                .clone();
            if message.channel != c.channel {
                return Err(err_resp(
                    StatusCode::CONFLICT,
                    "Le canal du modèle a changé. Choisissez un modèle du canal de cette campagne.",
                ));
            }
            let audience = targets(db, &c);
            let mut outcomes = vec![];
            for id in audience["eligibleIds"].as_array().unwrap() {
                let p = db
                    .lead_prospects
                    .iter()
                    .find(|p| Some(p.id.as_str()) == id.as_str() && p.club_id == club)
                    .unwrap();
                let values = messages::context(db, p);
                let result = messages::render(&message.subject, &values).and_then(|subject| {
                    messages::render(&messages::text_body(&message), &values)
                        .map(|text| (subject, text))
                });
                if c.channel == "sms" {
                    match result.and_then(|(_, text)| {
                        sms::prepare(
                            club,
                            &format!("campaign:{}:{}", c.id, c.revision),
                            &p.id,
                            &p.phone,
                            &text,
                            &now.to_rfc3339(),
                        )
                    }) {
                        Ok(prepared) => {
                            let estimate = json!(prepared.estimate);
                            if !db
                                .lead_scenarios
                                .sms_outbox
                                .iter()
                                .any(|r| r.id == prepared.id)
                            {
                                db.lead_scenarios.sms_outbox.push(prepared);
                            }
                            outcomes.push(
                                json!({"prospectId":p.id,"status":"simulated","estimate":estimate}),
                            );
                        }
                        Err(reason) => outcomes
                            .push(json!({"prospectId":p.id,"status":"excluded","reason":reason})),
                    }
                    continue;
                }
                match result.and_then(|(subject, text)| {
                    brevo::prepare(
                        club,
                        &format!("campaign:{}:{}", c.id, c.revision),
                        &p.id,
                        "campaign-email",
                        1,
                        &p.email,
                        &subject,
                        &text,
                        &now.to_rfc3339(),
                    )
                    .map_err(str::to_string)
                }) {
                    Ok(mut prepared) => {
                        prepared.payload["tags"] = json!(["cfitness-os", "lead-campaign", club]);
                        if !db
                            .lead_scenarios
                            .email_outbox
                            .iter()
                            .any(|r| r.id == prepared.id)
                        {
                            db.lead_scenarios.email_outbox.push(prepared);
                        }
                        outcomes.push(json!({"prospectId":p.id,"status":"simulated"}));
                    }
                    Err(reason) => outcomes
                        .push(json!({"prospectId":p.id,"status":"excluded","reason":reason})),
                }
            }
            db.lead_scenarios.campaigns[idx]
                .simulated_revisions
                .push(c.revision);
            let estimated_segments: usize = outcomes
                .iter()
                .filter_map(|o| o["estimate"]["segments"].as_u64())
                .map(|v| v as usize)
                .sum();
            db.lead_scenarios.campaigns[idx].runs.push(json!({"revision":c.revision,"at":now.to_rfc3339(),"actorId":actor,"message":message,"audience":audience,"outcomes":outcomes,"estimatedSegments":estimated_segments,"simulationOnly":true}));
        }
        _ => return Err(bad("Commande de campagne invalide.")),
    }
    Ok(())
}
