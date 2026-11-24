//! Persistent, simulation-only scenario engine. Never calls an external provider.
use crate::{
    models::{AppDatabaseState, LeadActivityRecord, LeadProspectRecord},
    rbac::can_access_site_scope,
    routes::{append_audit, err_resp, is_demo_mode, SharedState},
    seed::persist_state,
};
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
type Failure = (StatusCode, Json<Value>);
#[path = "lead_brevo.rs"]
mod brevo;
#[path = "lead_campaigns.rs"]
mod campaigns;
#[path = "lead_email_blocks.rs"]
mod email_blocks;
#[path = "lead_message_templates.rs"]
mod messages;

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExitRules {
    pub stop_on_reply: bool,
    pub status_ids: Vec<String>,
    pub stop_if_no_longer_matches: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WhatsAppOptions {
    pub mode: String,
    pub closed_action: String,
    pub fallback_template_id: Option<String>,
    pub fallback_content: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Branch {
    pub predicate: String,
    pub values: Vec<String>,
    #[serde(deserialize_with = "explicit_destination")]
    pub yes_step_id: Option<String>,
    #[serde(deserialize_with = "explicit_destination")]
    pub no_step_id: Option<String>,
}
fn explicit_destination<'de, D: serde::Deserializer<'de>>(
    value: D,
) -> Result<Option<String>, D::Error> {
    Option::<String>::deserialize(value)
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Next {
    #[serde(deserialize_with = "explicit_destination")]
    pub step_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Conditions {
    pub status_ids: Vec<String>,
    pub source_ids: Vec<String>,
    pub require_assigned_commercial: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Delay {
    pub amount: u32,
    pub unit: String,
}
impl Delay {
    fn seconds(&self) -> Option<i64> {
        let factor = match self.unit.as_str() {
            "minutes" => 60,
            "hours" => 3600,
            "days" => 86400,
            _ => return None,
        };
        Some(i64::from(self.amount) * factor)
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Step {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub enabled: bool,
    pub delay: Delay,
    pub template_id: Option<String>,
    pub content: Option<String>,
    pub comment: String,
    #[serde(default)]
    pub subject: Option<String>,
    #[serde(default)]
    pub whatsapp: Option<WhatsAppOptions>,
    #[serde(default)]
    pub email_document: Option<email_blocks::Document>,
    #[serde(default)]
    pub branch: Option<Branch>,
    #[serde(default)]
    pub next: Option<Next>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Definition {
    pub schema_version: u32,
    pub club_id: String,
    pub name: String,
    pub mode: String,
    pub active: bool,
    pub enrollment_locked: bool,
    pub conditions: Option<Conditions>,
    pub steps: Vec<Step>,
    #[serde(default)]
    pub exit_rules: Option<ExitRules>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    pub number: u32,
    pub definition: Definition,
    pub published_at: String,
    pub published_by: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scenario {
    pub id: String,
    pub club_id: String,
    pub revision: u64,
    pub draft: Definition,
    pub versions: Vec<Version>,
    pub active: bool,
    pub enrollment_locked: bool,
    pub archived: bool,
    pub updated_at: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Execution {
    pub step_id: String,
    pub at: String,
    pub status: String,
    pub detail: String,
    pub activity_id: Option<String>,
    #[serde(default)]
    pub rendered_subject: Option<String>,
    #[serde(default)]
    pub rendered_content: Option<String>,
    #[serde(default)]
    pub rendered_html: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Enrollment {
    pub id: String,
    pub scenario_id: String,
    pub club_id: String,
    pub prospect_id: String,
    pub prospect_name: String,
    pub version: u32,
    pub definition: Definition,
    pub status: String,
    pub cursor: usize,
    pub next_at: String,
    pub created_at: String,
    pub history: Vec<Execution>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Store {
    #[serde(default)]
    pub campaigns: Vec<campaigns::Campaign>,
    #[serde(default)]
    pub email_outbox: Vec<brevo::PreparedEmail>,
    #[serde(default)]
    pub email_suppressions: Vec<brevo::Suppression>,
    #[serde(default)]
    pub templates: Vec<messages::Template>,
    pub scenarios: Vec<Scenario>,
    pub enrollments: Vec<Enrollment>,
    #[serde(default)]
    pub receipts: HashMap<String, String>,
    #[serde(default)]
    pub results: HashMap<String, CommandResult>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResult {
    pub campaign_id: Option<String>,
    pub scenario_id: Option<String>,
    pub template_id: Option<String>,
}
fn command_snapshot(
    db: &AppDatabaseState,
    club: &str,
    actor: &str,
    result: Option<&CommandResult>,
) -> Value {
    let mut payload = snapshot(db, club, actor);
    payload["commandResult"] = json!(result);
    payload
}

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/api/lead/scenarios/:club", get(workspace).post(command))
        .route(
            "/api/lead/scenarios/:club/email-preview",
            axum::routing::post(email_preview),
        )
        .layer(axum::extract::DefaultBodyLimit::max(8 * 1024 * 1024))
}
async fn email_preview(
    State(state): State<SharedState>,
    Path(club): Path<String>,
    headers: HeaderMap,
    Json(message): Json<messages::Message>,
) -> Result<Json<Value>, Failure> {
    let actor = actor(&state, &headers).await?;
    {
        let db = state.db.read().await;
        authorize(&db, &actor, &club)?;
    }
    messages::validate_message(&message)?;
    let doc = message.email_document.as_ref().ok_or_else(|| {
        err_resp(
            StatusCode::UNPROCESSABLE_ENTITY,
            "Choisissez un document email à prévisualiser.",
        )
    })?;
    let values: HashMap<String, String> = [
        ("prenom", "Camille"),
        ("nom", "Exemple"),
        ("club", "Club de démonstration"),
        ("telephone-club", "00 00 00 00 00"),
        ("adresse-club", "Adresse fictive"),
        ("url-rdv-club", "https://example.test/rdv"),
        ("url-club", "https://example.test"),
        ("prenom-commercial", "Alex"),
        ("rdv-date", "01/12/2026"),
        ("rdv-heure", "10:00"),
        ("date", "01/12/2026"),
        ("heure", "10:00"),
        ("prix", "39,90 €"),
        ("unsubscribe-url", "https://example.test/desabonnement"),
    ]
    .into_iter()
    .map(|(k, v)| (k.into(), v.into()))
    .collect();
    let html = email_blocks::render(doc, &values, true)
        .map_err(|message| err_resp(StatusCode::UNPROCESSABLE_ENTITY, &message))?;
    Ok(Json(
        json!({"actorId":actor,"clubId":club,"html":email_blocks::preview_document(&html),"text":messages::render(&email_blocks::text(doc),&values).unwrap_or_default(),"fictitious":true}),
    ))
}
fn site(club: &str) -> Result<&'static str, Failure> {
    match club {
        "carre-de-soie" => Ok("club-carre-soie"),
        "beynost" => Ok("club-beynost"),
        _ => Err(err_resp(StatusCode::BAD_REQUEST, "Club inconnu.")),
    }
}
async fn actor(state: &SharedState, headers: &HeaderMap) -> Result<String, Failure> {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .filter(|t| !t.is_empty())
        .ok_or_else(|| {
            err_resp(
                StatusCode::UNAUTHORIZED,
                "Reconnectez-vous pour accéder aux scénarios.",
            )
        })?;
    state
        .sessions
        .read()
        .await
        .get(token)
        .filter(|(_, expiry)| *expiry > Utc::now().timestamp())
        .map(|(id, _)| id.clone())
        .ok_or_else(|| err_resp(StatusCode::UNAUTHORIZED, "Votre session a expiré."))
}
fn can_manage(db: &AppDatabaseState, actor: &str, club: &str) -> bool {
    let Ok(site) = site(club) else { return false };
    let Some(emp) = db.employees.iter().find(|e| e.id == actor && e.active) else {
        return false;
    };
    let Some(access) = emp.site_accesses.iter().find(|a| a.site_id == site) else {
        return false;
    };
    let Some(profile) = db.profiles.iter().find(|p| p.id == access.profile_id) else {
        return false;
    };
    // A club-wide definition must not be editable through an unrelated HR action or a team scope.
    profile.scope_selected == "sites"
        && matches!(
            profile.id.as_str(),
            "admin_systeme" | "master_avance" | "planificateur_avance"
        )
}
fn authorize(db: &AppDatabaseState, actor: &str, club: &str) -> Result<(), Failure> {
    site(club)?;
    if !can_manage(db, actor, club) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "La gestion des communications est réservée aux responsables habilités de ce club.",
        ));
    }
    Ok(())
}
pub fn statuses() -> Vec<String> {
    [
        "Nouveau",
        "Jamais consulté",
        "Froid",
        "Tiède",
        "Chaud",
        "Accueil Club",
        "RDV fixé",
        "Séance effectuée",
        "Relance en cours",
        "Client",
        "Client enseigne",
        "Perdu / Sans suite",
    ]
    .iter()
    .map(|v| v.to_string())
    .collect()
}
fn sources(db: &AppDatabaseState, club: &str) -> Vec<String> {
    let mut values = db
        .lead_prospects
        .iter()
        .filter(|p| p.club_id == club)
        .map(|p| p.source.clone())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>();
    values.sort();
    values.dedup();
    values
}
fn validate(d: &Definition, club: &str, db: &AppDatabaseState) -> Result<(), Failure> {
    let bad = |msg: &str| err_resp(StatusCode::UNPROCESSABLE_ENTITY, msg);
    if d.schema_version != 1 || d.club_id != club {
        return Err(bad("Version ou club du scénario invalide."));
    }
    if d.name.trim().is_empty() || d.name.chars().count() > 120 {
        return Err(bad("Indiquez un nom de 1 à 120 caractères."));
    }
    if d.mode != "automatic" && d.mode != "manual" {
        return Err(bad("Choisissez un mode automatique ou manuel."));
    }
    if d.mode == "manual" && d.conditions.is_some() {
        return Err(bad(
            "Un scénario manuel ne contient pas de conditions automatiques.",
        ));
    }
    if d.mode == "automatic" {
        let c = d
            .conditions
            .as_ref()
            .ok_or_else(|| bad("Définissez les conditions d'inscription."))?;
        let known = statuses();
        let known_sources = sources(db, club);
        if c.status_ids.is_empty()
            || c.status_ids.len() > 200
            || c.source_ids.len() > 200
            || c.status_ids.iter().any(|s| {
                !known.contains(s)
                    && !db
                        .lead_prospects
                        .iter()
                        .any(|p| p.club_id == club && (p.stage == *s || p.lead_status == *s))
            })
            || c.source_ids.iter().any(|s| !known_sources.contains(s))
            || c.status_ids.iter().collect::<HashSet<_>>().len() != c.status_ids.len()
            || c.source_ids.iter().collect::<HashSet<_>>().len() != c.source_ids.len()
        {
            return Err(bad(
                "Choisissez des statuts et sources distincts du club courant.",
            ));
        }
    }
    if d.steps.is_empty() || d.steps.len() > 100 || !d.steps.iter().any(|s| s.enabled) {
        return Err(bad("Ajoutez de 1 à 100 étapes, dont une activée."));
    }
    let mut ids = HashSet::new();
    for step in &d.steps {
        if step.id.trim().is_empty()
            || step.id.len() > 100
            || step.id.trim() != step.id
            || !ids.insert(&step.id)
        {
            return Err(bad("Chaque étape doit avoir un identifiant distinct."));
        }
        if !matches!(
            step.kind.as_str(),
            "email" | "sms" | "whatsapp" | "email_task" | "sms_task" | "call_task" | "condition"
        ) {
            return Err(bad("Type d'étape inconnu."));
        }
        if step.delay.seconds().is_none() || step.delay.amount > 525600 {
            return Err(bad(
                "Délai invalide : utilisez un entier positif ou nul et une unité connue.",
            ));
        }
        if let Some(next) = &step.next {
            if step.kind == "condition" {
                return Err(bad("Une condition utilise ses destinations Oui et Non."));
            }
            if let Some(target) = &next.step_id {
                let index = d.steps.iter().position(|s| s.id == step.id).unwrap_or(0);
                if !d
                    .steps
                    .iter()
                    .enumerate()
                    .any(|(i, s)| i > index && s.id == *target && s.enabled)
                {
                    return Err(bad(
                        "La suite doit rejoindre une étape activée plus loin, ou terminer.",
                    ));
                }
            }
        }
        if let Some(doc) = &step.email_document {
            if step.kind != "email" || step.template_id.is_some() {
                return Err(bad("Document email incompatible avec cette étape."));
            }
            email_blocks::validate(doc)?;
        }
        if step.kind == "condition" {
            let b = step
                .branch
                .as_ref()
                .ok_or_else(|| bad("Définissez la condition et ses deux destinations."))?;
            if step.comment.encode_utf16().count() > 2000
                || step.template_id.is_some()
                || step.content.is_some()
                || step.subject.is_some()
                || step.whatsapp.is_some()
                || !matches!(
                    b.predicate.as_str(),
                    "reply" | "consent" | "assigned" | "status" | "source" | "segment"
                )
                || b.values.len() > 200
                || b.values.iter().collect::<HashSet<_>>().len() != b.values.len()
            {
                return Err(bad("Étape conditionnelle invalide."));
            }
            let uses_values = matches!(b.predicate.as_str(), "status" | "source" | "segment");
            if uses_values == b.values.is_empty() {
                return Err(bad("Sélectionnez les valeurs de la condition."));
            }
            for value in &b.values {
                let known = match b.predicate.as_str() {
                    "status" => {
                        statuses().contains(value)
                            || db.lead_prospects.iter().any(|p| {
                                p.club_id == club && (&p.stage == value || &p.lead_status == value)
                            })
                    }
                    "source" => sources(db, club).contains(value),
                    "segment" => db
                        .lead_prospects
                        .iter()
                        .any(|p| p.club_id == club && p.segments.contains(value)),
                    _ => false,
                };
                if !known {
                    return Err(bad("Valeur de condition inconnue dans ce club."));
                }
            }
            let index = d.steps.iter().position(|s| s.id == step.id).unwrap_or(0);
            for target in [&b.yes_step_id, &b.no_step_id].into_iter().flatten() {
                if !d
                    .steps
                    .iter()
                    .enumerate()
                    .any(|(i, s)| i > index && s.id == *target && s.enabled)
                {
                    return Err(bad("Une branche doit rejoindre une étape activée plus loin dans le parcours, ou terminer."));
                }
            }
            continue;
        } else if step.branch.is_some() {
            return Err(bad(
                "Les destinations conditionnelles exigent une étape Condition.",
            ));
        }
        if let Some(id) = &step.template_id {
            messages::find(db, club, id, &step.kind)?;
            if step.content.is_some() {
                return Err(bad(
                    "Choisissez un modèle ou un message libre, pas les deux.",
                ));
            }
        }
        if let Some(subject) = &step.subject {
            if step.kind != "email"
                || subject.chars().count() > 200
                || subject.contains(['\r', '\n'])
            {
                return Err(bad("Objet email invalide."));
            }
            messages::validate_text(subject)?;
        }
        if let Some(content) = &step.content {
            messages::validate_text(content)?;
        }
        if let Some(wa) = &step.whatsapp {
            if step.kind != "whatsapp"
                || !matches!(wa.mode.as_str(), "direct" | "template")
                || !matches!(wa.closed_action.as_str(), "skip" | "template" | "sms")
                || (wa.mode == "template" && step.template_id.is_none())
            {
                return Err(bad("Options WhatsApp incohérentes."));
            }
            match wa.closed_action.as_str() {
                "template" => {
                    messages::find(
                        db,
                        club,
                        wa.fallback_template_id
                            .as_deref()
                            .ok_or_else(|| bad("Choisissez le modèle WhatsApp de repli."))?,
                        "whatsapp",
                    )?;
                    if wa.fallback_content.is_some() {
                        return Err(bad("Le repli modèle ne contient pas de SMS libre."));
                    }
                }
                "sms" => {
                    let content = wa
                        .fallback_content
                        .as_deref()
                        .filter(|s| !s.trim().is_empty() && s.chars().count() <= 20000)
                        .ok_or_else(|| bad("Renseignez explicitement le SMS de repli."))?;
                    messages::validate_text(content)?;
                    if wa.fallback_template_id.is_some() {
                        return Err(bad("Le repli SMS ne contient pas de modèle WhatsApp."));
                    }
                }
                _ => {
                    if wa.fallback_template_id.is_some() || wa.fallback_content.is_some() {
                        return Err(bad("Retirez le contenu de repli inutilisé."));
                    }
                }
            }
        }
        if step.comment.chars().count() > 2000 {
            return Err(bad("Commentaire trop long."));
        }
        if step.kind.ends_with("_task") {
            if step.comment.trim().is_empty()
                || step.content.is_some()
                || step.template_id.is_some()
            {
                return Err(bad(
                    "Décrivez la tâche dans son commentaire, sans envoi automatique.",
                ));
            }
        } else if step.template_id.is_none()
            && step
                .content
                .as_ref()
                .map(|s| s.trim().is_empty() || s.chars().count() > 20000)
                .unwrap_or(true)
        {
            return Err(bad("Renseignez un message de 1 à 20 000 caractères."));
        }
    }
    if let Some(rules) = &d.exit_rules {
        if rules.status_ids.len() > 200
            || rules.status_ids.iter().collect::<HashSet<_>>().len() != rules.status_ids.len()
            || rules.status_ids.iter().any(|s| {
                !statuses().contains(s)
                    && !db
                        .lead_prospects
                        .iter()
                        .any(|p| p.club_id == club && (&p.stage == s || &p.lead_status == s))
            })
            || (rules.stop_if_no_longer_matches && d.mode != "automatic")
        {
            return Err(bad(
                "Conditions de sortie invalides pour ce club ou ce mode.",
            ));
        }
    }
    Ok(())
}
fn eligible(d: &Definition, p: &LeadProspectRecord, db: &AppDatabaseState) -> bool {
    if p.club_id != d.club_id || p.is_archived {
        return false;
    }
    let Some(c) = &d.conditions else {
        return d.mode == "manual";
    };
    c.status_ids
        .iter()
        .any(|s| s == &p.stage || s == &p.lead_status)
        && (c.source_ids.is_empty() || c.source_ids.contains(&p.source))
        && (!c.require_assigned_commercial || valid_assignee(db, p).is_some())
}
fn valid_assignee(db: &AppDatabaseState, p: &LeadProspectRecord) -> Option<String> {
    let id = p.assigned_to_id.as_ref()?;
    let emp = db.employees.iter().find(|e| &e.id == id && e.active)?;
    if can_access_site_scope(db, &emp.id, site(&p.club_id).ok()?) {
        Some(id.clone())
    } else {
        None
    }
}
fn snapshot(db: &AppDatabaseState, club: &str, actor: &str) -> Value {
    let mut all_statuses = statuses();
    for p in db.lead_prospects.iter().filter(|p| p.club_id == club) {
        for s in [&p.stage, &p.lead_status] {
            if !s.is_empty() && !all_statuses.contains(s) {
                all_statuses.push(s.clone());
            }
        }
    }
    let segments: HashSet<_> = db
        .lead_prospects
        .iter()
        .filter(|p| p.club_id == club)
        .flat_map(|p| p.segments.clone())
        .collect();
    json!({"actorId":actor,"clubId":club,"simulationOnly":true,"simulationAvailable":is_demo_mode(),"emailDelivery":brevo::status(),
        "campaigns":db.lead_scenarios.campaigns.iter().filter(|c|c.club_id==club).map(|c|json!({"campaign":c,"audience":campaigns::targets(db,c)})).collect::<Vec<_>>(),
        "emailOutbox":db.lead_scenarios.email_outbox.iter().filter(|r|r.club_id==club).collect::<Vec<_>>(),
        "emailSuppressions":db.lead_scenarios.email_suppressions.iter().filter(|r|r.club_id==club).collect::<Vec<_>>(),
        "sources":sources(db,club),"statusIds":all_statuses,"segments":segments,"templates":db.lead_scenarios.templates.iter().filter(|t|t.club_id==club).collect::<Vec<_>>(),
        "scenarios":db.lead_scenarios.scenarios.iter().filter(|s|s.club_id==club).collect::<Vec<_>>(),
        "enrollments":db.lead_scenarios.enrollments.iter().filter(|e|e.club_id==club).collect::<Vec<_>>(),
        "prospects":db.lead_prospects.iter().filter(|p|p.club_id==club).map(|p|json!({"id":p.id,"name":format!("{} {}",p.first_name,p.last_name),"status":p.stage,"source":p.source})).collect::<Vec<_>>()})
}
async fn workspace(
    State(state): State<SharedState>,
    Path(club): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, Failure> {
    let actor = actor(&state, &headers).await?;
    let db = state.db.read().await;
    authorize(&db, &actor, &club)?;
    Ok(Json(snapshot(&db, &club, &actor)))
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum Command {
    SaveCampaign {
        #[serde(rename = "campaignId")]
        campaign_id: Option<String>,
        #[serde(rename = "expectedRevision")]
        expected_revision: Option<u64>,
        name: String,
        #[serde(rename = "templateId")]
        template_id: String,
        #[serde(rename = "statusIds")]
        status_ids: Vec<String>,
        #[serde(rename = "sourceIds")]
        source_ids: Vec<String>,
    },
    SimulateCampaign {
        #[serde(rename = "campaignId")]
        campaign_id: String,
        #[serde(rename = "expectedRevision")]
        expected_revision: u64,
    },
    ArchiveCampaign {
        #[serde(rename = "campaignId")]
        campaign_id: String,
        #[serde(rename = "expectedRevision")]
        expected_revision: u64,
    },
    SuppressEmail {
        #[serde(rename = "prospectId")]
        prospect_id: String,
        reason: String,
    },
    SaveTemplate {
        #[serde(rename = "templateId")]
        template_id: Option<String>,
        #[serde(rename = "expectedRevision")]
        expected_revision: Option<u64>,
        message: messages::Message,
    },
    ArchiveTemplate {
        #[serde(rename = "templateId")]
        template_id: String,
        #[serde(rename = "expectedRevision")]
        expected_revision: u64,
    },
    CopyTemplate {
        #[serde(rename = "templateId")]
        template_id: String,
        #[serde(rename = "destinationClubId")]
        destination_club_id: String,
    },
    Save {
        #[serde(rename = "scenarioId")]
        scenario_id: Option<String>,
        #[serde(rename = "expectedRevision")]
        expected_revision: Option<u64>,
        definition: Definition,
    },
    Publish {
        #[serde(rename = "scenarioId")]
        scenario_id: String,
        #[serde(rename = "expectedRevision")]
        expected_revision: u64,
    },
    Status {
        #[serde(rename = "scenarioId")]
        scenario_id: String,
        #[serde(rename = "expectedRevision")]
        expected_revision: u64,
        active: bool,
        #[serde(rename = "enrollmentLocked")]
        enrollment_locked: bool,
    },
    Archive {
        #[serde(rename = "scenarioId")]
        scenario_id: String,
        #[serde(rename = "expectedRevision")]
        expected_revision: u64,
    },
    Copy {
        #[serde(rename = "scenarioId")]
        scenario_id: String,
        #[serde(rename = "expectedRevision")]
        expected_revision: u64,
        #[serde(rename = "destinationClubId")]
        destination_club_id: String,
    },
    Enroll {
        #[serde(rename = "scenarioId")]
        scenario_id: String,
        #[serde(rename = "prospectId")]
        prospect_id: String,
    },
    Stop {
        #[serde(rename = "enrollmentId")]
        enrollment_id: String,
        reason: String,
    },
    Run {},
}
fn index(db: &AppDatabaseState, club: &str, id: &str, rev: u64) -> Result<usize, Failure> {
    let idx = db
        .lead_scenarios
        .scenarios
        .iter()
        .position(|s| s.id == id && s.club_id == club)
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Scénario introuvable dans ce club."))?;
    if db.lead_scenarios.scenarios[idx].revision != rev {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "Le scénario a changé. Rechargez sa dernière version avant de modifier.",
        ));
    }
    Ok(idx)
}
fn enroll(
    db: &mut AppDatabaseState,
    s: &Scenario,
    p: &LeadProspectRecord,
    now: DateTime<Utc>,
) -> Result<bool, Failure> {
    if !s.active || s.enrollment_locked || s.archived {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "Ce scénario n'accepte pas de nouvelles inscriptions.",
        ));
    }
    let v = s.versions.last().ok_or_else(|| {
        err_resp(
            StatusCode::CONFLICT,
            "Publiez une version avant d'inscrire un contact.",
        )
    })?;
    if p.club_id != s.club_id || p.is_archived {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "Ce contact n'est pas admissible dans ce club.",
        ));
    }
    if db
        .lead_scenarios
        .enrollments
        .iter()
        .any(|e| e.scenario_id == s.id && e.prospect_id == p.id)
    {
        return Ok(false);
    }
    let first = v
        .definition
        .steps
        .iter()
        .position(|st| st.enabled)
        .ok_or_else(|| err_resp(StatusCode::CONFLICT, "Aucune étape activée."))?;
    db.lead_scenarios.enrollments.push(Enrollment {
        id: format!("enr-{}", rand::random::<u128>()),
        scenario_id: s.id.clone(),
        club_id: s.club_id.clone(),
        prospect_id: p.id.clone(),
        prospect_name: format!("{} {}", p.first_name, p.last_name),
        version: v.number,
        definition: v.definition.clone(),
        status: "running".into(),
        cursor: first,
        next_at: (now + Duration::seconds(v.definition.steps[first].delay.seconds().unwrap_or(0)))
            .to_rfc3339(),
        created_at: now.to_rfc3339(),
        history: vec![],
    });
    Ok(true)
}
fn apply(
    db: &mut AppDatabaseState,
    club: &str,
    actor: &str,
    cmd: Command,
    now: DateTime<Utc>,
) -> Result<(), Failure> {
    match cmd {
        cmd @ Command::SaveCampaign { .. }
        | cmd @ Command::SimulateCampaign { .. }
        | cmd @ Command::ArchiveCampaign { .. } => campaigns::apply(db, club, actor, &cmd, now)?,
        Command::SuppressEmail {
            prospect_id,
            reason,
        } => {
            if !is_demo_mode() {
                return Err(err_resp(
                    StatusCode::CONFLICT,
                    "Les exclusions de recette sont réservées à la démonstration.",
                ));
            }
            if reason.trim().is_empty() || reason.chars().count() > 2000 {
                return Err(err_resp(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "Indiquez le motif de l’exclusion email.",
                ));
            }
            let p = db
                .lead_prospects
                .iter()
                .find(|p| p.id == prospect_id && p.club_id == club)
                .ok_or_else(|| {
                    err_resp(StatusCode::NOT_FOUND, "Contact introuvable dans ce club.")
                })?;
            if !brevo::valid_address(&p.email) {
                return Err(err_resp(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "Ce contact n’a pas d’adresse email valide.",
                ));
            }
            if !brevo::suppressed(&db.lead_scenarios.email_suppressions, club, &p.email) {
                db.lead_scenarios
                    .email_suppressions
                    .push(brevo::Suppression {
                        club_id: club.into(),
                        email: brevo::normalized(&p.email),
                        reason: reason.trim().into(),
                        actor_id: actor.into(),
                        created_at: now.to_rfc3339(),
                    });
            }
        }
        Command::SaveTemplate {
            template_id,
            expected_revision,
            message,
        } => {
            messages::validate_message(&message)?;
            if let Some(id) = template_id {
                let t = db
                    .lead_scenarios
                    .templates
                    .iter_mut()
                    .find(|t| t.id == id && t.club_id == club)
                    .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Modèle introuvable."))?;
                if Some(t.revision) != expected_revision || t.archived {
                    return Err(err_resp(
                        StatusCode::CONFLICT,
                        "Modèle modifié ou archivé. Rechargez la liste.",
                    ));
                }
                if t.message.channel != message.channel {
                    return Err(err_resp(
                        StatusCode::CONFLICT,
                        "Le canal d’un modèle existant ne peut pas changer.",
                    ));
                }
                t.message = message;
                t.revision += 1;
                t.updated_at = now.to_rfc3339();
            } else {
                if expected_revision.is_some() {
                    return Err(err_resp(StatusCode::BAD_REQUEST, "Révision inattendue."));
                }
                db.lead_scenarios.templates.push(messages::Template {
                    id: format!("tpl-{}", rand::random::<u128>()),
                    club_id: club.into(),
                    revision: 1,
                    message,
                    archived: false,
                    updated_at: now.to_rfc3339(),
                });
            }
        }
        Command::ArchiveTemplate {
            template_id,
            expected_revision,
        } => {
            let t = db
                .lead_scenarios
                .templates
                .iter_mut()
                .find(|t| t.id == template_id && t.club_id == club)
                .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Modèle introuvable."))?;
            if t.revision != expected_revision {
                return Err(err_resp(StatusCode::CONFLICT, "Le modèle a changé."));
            }
            t.archived = true;
            t.revision += 1;
            t.updated_at = now.to_rfc3339();
        }
        Command::CopyTemplate {
            template_id,
            destination_club_id,
        } => {
            authorize(db, actor, &destination_club_id)?;
            let mut t = db
                .lead_scenarios
                .templates
                .iter()
                .find(|t| t.id == template_id && t.club_id == club)
                .cloned()
                .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Modèle introuvable."))?;
            t.id = format!("tpl-{}", rand::random::<u128>());
            t.club_id = destination_club_id;
            t.revision = 1;
            t.archived = false;
            t.updated_at = now.to_rfc3339();
            db.lead_scenarios.templates.push(t);
        }
        Command::Save {
            scenario_id,
            expected_revision,
            definition,
        } => {
            validate(&definition, club, db)?;
            if let Some(id) = scenario_id {
                let idx = index(
                    db,
                    club,
                    &id,
                    expected_revision
                        .ok_or_else(|| err_resp(StatusCode::BAD_REQUEST, "Révision requise."))?,
                )?;
                let s = &mut db.lead_scenarios.scenarios[idx];
                if s.archived {
                    return Err(err_resp(StatusCode::CONFLICT, "Ce scénario est archivé."));
                }
                s.draft = definition;
                s.revision += 1;
                s.updated_at = now.to_rfc3339();
            } else {
                if expected_revision.is_some() {
                    return Err(err_resp(
                        StatusCode::BAD_REQUEST,
                        "Une création ne porte pas de révision existante.",
                    ));
                }
                db.lead_scenarios.scenarios.push(Scenario {
                    id: format!("scn-{}", rand::random::<u128>()),
                    club_id: club.into(),
                    revision: 1,
                    draft: definition,
                    versions: vec![],
                    active: false,
                    enrollment_locked: false,
                    archived: false,
                    updated_at: now.to_rfc3339(),
                });
            }
        }
        Command::Publish {
            scenario_id,
            expected_revision,
        } => {
            let idx = index(db, club, &scenario_id, expected_revision)?;
            validate(&db.lead_scenarios.scenarios[idx].draft, club, db)?;
            let frozen = messages::materialize(&db.lead_scenarios.scenarios[idx].draft, db)?;
            let s = &mut db.lead_scenarios.scenarios[idx];
            if s.archived {
                return Err(err_resp(StatusCode::CONFLICT, "Ce scénario est archivé."));
            }
            s.versions.push(Version {
                number: s.versions.len() as u32 + 1,
                definition: frozen,
                published_at: now.to_rfc3339(),
                published_by: actor.into(),
            });
            s.revision += 1;
            s.updated_at = now.to_rfc3339();
        }
        Command::Status {
            scenario_id,
            expected_revision,
            active,
            enrollment_locked,
        } => {
            if active && !is_demo_mode() {
                return Err(err_resp(StatusCode::CONFLICT,"Aucun canal fournisseur réel n’est raccordé : activation réservée à la démonstration."));
            }
            let idx = index(db, club, &scenario_id, expected_revision)?;
            let s = &mut db.lead_scenarios.scenarios[idx];
            if s.archived || (active && s.versions.is_empty()) {
                return Err(err_resp(
                    StatusCode::CONFLICT,
                    "Publiez une version non archivée avant l'activation.",
                ));
            }
            s.active = active;
            s.enrollment_locked = enrollment_locked;
            s.revision += 1;
            s.updated_at = now.to_rfc3339();
        }
        Command::Archive {
            scenario_id,
            expected_revision,
        } => {
            let idx = index(db, club, &scenario_id, expected_revision)?;
            let s = &mut db.lead_scenarios.scenarios[idx];
            s.archived = true;
            s.enrollment_locked = true;
            s.revision += 1;
            s.updated_at = now.to_rfc3339();
        }
        Command::Copy {
            scenario_id,
            expected_revision,
            destination_club_id,
        } => {
            authorize(db, actor, &destination_club_id)?;
            let idx = index(db, club, &scenario_id, expected_revision)?;
            let mut definition = db.lead_scenarios.scenarios[idx].draft.clone();
            definition.club_id = destination_club_id.clone();
            definition.name = format!(
                "{} (copie)",
                definition.name.chars().take(100).collect::<String>()
            );
            db.lead_scenarios.scenarios.push(Scenario {
                id: format!("scn-{}", rand::random::<u128>()),
                club_id: destination_club_id,
                revision: 1,
                draft: definition,
                versions: vec![],
                active: false,
                enrollment_locked: true,
                archived: false,
                updated_at: now.to_rfc3339(),
            });
        }
        Command::Enroll {
            scenario_id,
            prospect_id,
        } => {
            if !is_demo_mode() {
                return Err(err_resp(
                    StatusCode::CONFLICT,
                    "Inscription simulée disponible uniquement en démonstration.",
                ));
            }
            let s = db
                .lead_scenarios
                .scenarios
                .iter()
                .find(|s| s.id == scenario_id && s.club_id == club)
                .cloned()
                .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Scénario introuvable."))?;
            let p = db
                .lead_prospects
                .iter()
                .find(|p| p.id == prospect_id && p.club_id == club)
                .cloned()
                .ok_or_else(|| {
                    err_resp(StatusCode::NOT_FOUND, "Contact introuvable dans ce club.")
                })?;
            let version = s
                .versions
                .last()
                .ok_or_else(|| err_resp(StatusCode::CONFLICT, "Publiez une version."))?;
            if version.definition.mode != "manual" {
                return Err(err_resp(
                    StatusCode::CONFLICT,
                    "Ce scénario inscrit automatiquement les contacts répondant aux conditions.",
                ));
            }
            enroll(db, &s, &p, now)?;
        }
        Command::Stop {
            enrollment_id,
            reason,
        } => {
            if reason.trim().is_empty() || reason.chars().count() > 2000 {
                return Err(err_resp(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "Indiquez un motif d'arrêt (2 000 caractères maximum).",
                ));
            }
            let e = db
                .lead_scenarios
                .enrollments
                .iter_mut()
                .find(|e| e.id == enrollment_id && e.club_id == club)
                .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Inscription introuvable."))?;
            if e.status != "running" {
                return Err(err_resp(
                    StatusCode::CONFLICT,
                    "Ce parcours est déjà terminé ou arrêté.",
                ));
            }
            e.status = "stopped".into();
            e.history.push(Execution {
                step_id: "stop".into(),
                at: now.to_rfc3339(),
                status: "stopped".into(),
                detail: reason.trim().into(),
                activity_id: None,
                rendered_subject: None,
                rendered_content: None,
                rendered_html: None,
            });
        }
        Command::Run {} => {
            if !is_demo_mode() {
                return Err(err_resp(StatusCode::CONFLICT,"L'exécution simulée est disponible uniquement dans l'environnement de démonstration."));
            }
            process(db, club, now);
        }
    }
    Ok(())
}
async fn command(
    State(state): State<SharedState>,
    Path(club): Path<String>,
    headers: HeaderMap,
    Json(cmd): Json<Command>,
) -> Result<Json<Value>, Failure> {
    let actor = actor(&state, &headers).await?;
    let mut db = state.db.write().await;
    authorize(&db, &actor, &club)?;
    let operation = headers
        .get("x-cfitness-operation-id")
        .and_then(|h| h.to_str().ok())
        .filter(|s| {
            !s.is_empty()
                && s.len() <= 120
                && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        })
        .ok_or_else(|| {
            err_resp(
                StatusCode::BAD_REQUEST,
                "Identifiant de commande manquant ou invalide.",
            )
        })?;
    let key = format!("{actor}:{club}:{operation}");
    let fingerprint = format!(
        "{:x}",
        Sha256::digest(
            serde_json::to_vec(&cmd)
                .map_err(|_| err_resp(StatusCode::BAD_REQUEST, "Commande invalide."))?
        )
    );
    if let Some(previous) = db.lead_scenarios.receipts.get(&key) {
        if previous != &fingerprint {
            return Err(err_resp(
                StatusCode::CONFLICT,
                "Cette commande a déjà été utilisée pour un contenu différent.",
            ));
        }
        return Ok(Json(command_snapshot(
            &db,
            &club,
            &actor,
            db.lead_scenarios.results.get(&key),
        )));
    }
    let mut next = db.clone();
    apply(&mut next, &club, &actor, cmd, Utc::now())?;
    let result = CommandResult {
        campaign_id: next
            .lead_scenarios
            .campaigns
            .iter()
            .find(|c| !db.lead_scenarios.campaigns.iter().any(|old| old.id == c.id))
            .map(|c| c.id.clone()),
        scenario_id: next
            .lead_scenarios
            .scenarios
            .iter()
            .find(|s| !db.lead_scenarios.scenarios.iter().any(|old| old.id == s.id))
            .map(|s| s.id.clone()),
        template_id: next
            .lead_scenarios
            .templates
            .iter()
            .find(|t| !db.lead_scenarios.templates.iter().any(|old| old.id == t.id))
            .map(|t| t.id.clone()),
    };
    next.lead_scenarios
        .results
        .insert(key.clone(), result.clone());
    next.lead_scenarios.receipts.insert(key, fingerprint);
    append_audit(
        &mut next,
        &actor,
        "LEAD_SCENARIO_COMMAND",
        "Modification des scénarios enregistrée".into(),
        site(&club)?,
        "lead-scenarios",
        None,
        None,
    );
    persist_state(&state.data_dir, &next).map_err(|_| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Impossible d'enregistrer. Votre modification n'a pas été appliquée.",
        )
    })?;
    *db = next;
    Ok(Json(command_snapshot(&db, &club, &actor, Some(&result))))
}

/// Entire batch is committed under the shared DB lock. No network or external side effect.
fn process(db: &mut AppDatabaseState, club: &str, now: DateTime<Utc>) -> bool {
    let before = serde_json::to_string(&db.lead_scenarios).unwrap_or_default();
    let scenarios = db
        .lead_scenarios
        .scenarios
        .iter()
        .filter(|s| s.club_id == club)
        .cloned()
        .collect::<Vec<_>>();
    for s in &scenarios {
        if !s.active || s.enrollment_locked || s.archived {
            continue;
        }
        let Some(v) = s.versions.last() else { continue };
        if v.definition.mode != "automatic" || !can_manage(db, &v.published_by, club) {
            continue;
        }
        let candidates = db
            .lead_prospects
            .iter()
            .filter(|p| eligible(&v.definition, p, db))
            .cloned()
            .collect::<Vec<_>>();
        for p in candidates {
            let _ = enroll(db, s, &p, now);
        }
    }
    for idx in 0..db.lead_scenarios.enrollments.len() {
        let mut e = db.lead_scenarios.enrollments[idx].clone();
        if e.club_id != club || e.status != "running" {
            continue;
        }
        // Disabled scenarios pause existing runs; locked/archived scenarios allow them to drain.
        if !scenarios.iter().any(|s| s.id == e.scenario_id && s.active) {
            continue;
        }
        if !scenarios
            .iter()
            .find(|s| s.id == e.scenario_id)
            .and_then(|s| s.versions.iter().find(|v| v.number == e.version))
            .map(|v| can_manage(db, &v.published_by, club))
            .unwrap_or(false)
        {
            continue;
        }
        let Some(p) = db
            .lead_prospects
            .iter()
            .find(|p| p.id == e.prospect_id && p.club_id == club)
            .cloned()
        else {
            e.status = "stopped".into();
            db.lead_scenarios.enrollments[idx] = e;
            continue;
        };
        let due = DateTime::parse_from_rfc3339(&e.next_at)
            .map(|d| d.with_timezone(&Utc))
            .ok();
        let exit = e.definition.exit_rules.as_ref().and_then(|rules| {
            if rules.stop_on_reply
                && p.last_inbound_reply_at
                    .as_deref()
                    .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
                    .zip(DateTime::parse_from_rfc3339(&e.created_at).ok())
                    .map(|(reply, started)| reply > started)
                    .unwrap_or(false)
            {
                Some("Réponse entrante reçue depuis l’inscription : parcours arrêté.")
            } else if rules
                .status_ids
                .iter()
                .any(|s| s == &p.stage || s == &p.lead_status)
            {
                Some("Le contact a atteint un statut de sortie : parcours arrêté.")
            } else if rules.stop_if_no_longer_matches && !eligible(&e.definition, &p, db) {
                Some("Le contact ne correspond plus au ciblage : parcours arrêté.")
            } else {
                None
            }
        });
        if let Some(reason) = exit {
            e.status = "stopped".into();
            e.history.push(Execution {
                step_id: "stop".into(),
                at: now.to_rfc3339(),
                status: "stopped".into(),
                detail: reason.into(),
                activity_id: None,
                rendered_subject: None,
                rendered_content: None,
                rendered_html: None,
            });
            db.lead_scenarios.enrollments[idx] = e;
            continue;
        }
        if due.map(|d| d > now).unwrap_or(true) {
            continue;
        }
        if p.is_archived {
            e.status = "stopped".into();
            e.history.push(Execution {
                step_id: "stop".into(),
                at: now.to_rfc3339(),
                status: "stopped".into(),
                detail: "Contact archivé : parcours arrêté.".into(),
                activity_id: None,
                rendered_subject: None,
                rendered_content: None,
                rendered_html: None,
            });
            db.lead_scenarios.enrollments[idx] = e;
            continue;
        }
        // Only one step per enrollment per tick: delays are relative to actual completion, not browser time.
        let Some(step) = e.definition.steps.get(e.cursor) else {
            e.status = "stopped".into();
            e.history.push(Execution {
                step_id: "stop".into(),
                at: now.to_rfc3339(),
                status: "stopped".into(),
                detail:
                    "Parcours incohérent : aucune étape à cette position. Vérification requise."
                        .into(),
                activity_id: None,
                rendered_subject: None,
                rendered_content: None,
                rendered_html: None,
            });
            db.lead_scenarios.enrollments[idx] = e;
            continue;
        };
        let mut result = Execution {
            step_id: step.id.clone(),
            at: now.to_rfc3339(),
            status: "simulated".into(),
            detail: "Message simulé ; aucun envoi externe.".into(),
            activity_id: None,
            rendered_subject: None,
            rendered_content: None,
            rendered_html: None,
        };
        if step.kind == "condition" {
            if let Some(branch) = &step.branch {
                let needs_values =
                    matches!(branch.predicate.as_str(), "status" | "source" | "segment");
                if !matches!(
                    branch.predicate.as_str(),
                    "reply" | "consent" | "assigned" | "status" | "source" | "segment"
                ) || (needs_values && branch.values.is_empty())
                    || (!needs_values && !branch.values.is_empty())
                {
                    e.status = "stopped".into();
                    result.status = "stopped".into();
                    result.detail = "Condition restaurée invalide : parcours arrêté.".into();
                    e.history.push(result);
                    db.lead_scenarios.enrollments[idx] = e;
                    continue;
                }
                let yes = match branch.predicate.as_str() {
                    "consent" => p.rgpd_consent,
                    "assigned" => valid_assignee(db, &p).is_some(),
                    "status" => branch
                        .values
                        .iter()
                        .any(|v| v == &p.stage || v == &p.lead_status),
                    "source" => branch.values.contains(&p.source),
                    "segment" => branch.values.iter().any(|v| p.segments.contains(v)),
                    "reply" => p
                        .last_inbound_reply_at
                        .as_deref()
                        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
                        .zip(DateTime::parse_from_rfc3339(&e.created_at).ok())
                        .map(|(reply, start)| reply > start)
                        .unwrap_or(false),
                    _ => false,
                };
                let target = if yes {
                    &branch.yes_step_id
                } else {
                    &branch.no_step_id
                };
                if let Some(id) = target {
                    if let Some((index, next)) = e
                        .definition
                        .steps
                        .iter()
                        .enumerate()
                        .find(|(i, s)| *i > e.cursor && s.id == *id && s.enabled)
                    {
                        result.status = "branched".into();
                        result.detail = format!(
                            "Condition : {}. Suite vers l’étape {}.",
                            if yes { "Oui" } else { "Non" },
                            index + 1
                        );
                        e.cursor = index;
                        e.next_at = (now + Duration::seconds(next.delay.seconds().unwrap_or(0)))
                            .to_rfc3339();
                    } else {
                        e.status = "stopped".into();
                        result.status = "stopped".into();
                        result.detail =
                            "Destination conditionnelle invalide : parcours arrêté.".into();
                    }
                } else {
                    e.status = "completed".into();
                    result.status = "branched".into();
                    result.detail = format!(
                        "Condition : {}. Fin du parcours.",
                        if yes { "Oui" } else { "Non" }
                    );
                }
            } else {
                e.status = "stopped".into();
                result.status = "stopped".into();
                result.detail = "Condition absente : parcours arrêté.".into();
            }
            e.history.push(result);
            db.lead_scenarios.enrollments[idx] = e;
            continue;
        }
        if step.kind.ends_with("_task") {
            if let Some(assigned) = valid_assignee(db, &p) {
                let id = format!("scenario-task-{}-{}", e.id, step.id);
                if !db.lead_activities.iter().any(|a| a.id == id) {
                    db.lead_activities.push(LeadActivityRecord {
                        id: id.clone(),
                        activity_type: match step.kind.as_str() {
                            "call_task" => "SCHEDULED_CALL",
                            "email_task" => "SCHEDULED_EMAIL",
                            _ => "SCHEDULED_SMS",
                        }
                        .into(),
                        title: step.comment.clone(),
                        prospect_id: Some(p.id.clone()),
                        prospect_name: e.prospect_name.clone(),
                        club_id: club.into(),
                        due_at: now.to_rfc3339(),
                        status: "todo".into(),
                        assigned_to_id: assigned,
                        status_label: "À traiter".into(),
                    });
                }
                result.status = "task_created".into();
                result.detail = "Tâche ajoutée aux Activités du commercial assigné.".into();
                result.activity_id = Some(id);
            } else {
                result.status = "skipped".into();
                result.detail = "Aucun commercial actif affecté à ce contact dans le club.".into();
            }
        } else if step.kind == "email"
            && brevo::suppressed(&db.lead_scenarios.email_suppressions, club, &p.email)
        {
            result.status = "skipped".into();
            result.detail =
                "Email exclu : ce destinataire est dans la liste d’exclusion du club.".into();
        } else if !p.rgpd_consent {
            result.status = "skipped".into();
            result.detail = "Message exclu : consentement absent.".into();
        } else if (step.kind == "email" && p.email.trim().is_empty())
            || (step.kind != "email" && p.phone.trim().is_empty())
        {
            result.status = "skipped".into();
            result.detail = "Message exclu : coordonnées du canal absentes.".into();
        } else if step.kind == "whatsapp" {
            result.status = "skipped".into();
            result.detail="WhatsApp non exécuté : compte, modèle ou fenêtre de conversation propres à ce canal non vérifiés. Aucun repli ni envoi.".into();
        }
        if result.status == "simulated" {
            let values = messages::context(db, &p);
            match messages::render(step.content.as_deref().unwrap_or(""), &values).and_then(
                |body| {
                    messages::render(step.subject.as_deref().unwrap_or(""), &values)
                        .map(|subject| (body, subject))
                },
            ) {
                Ok((_, subject)) if subject.contains(['\r', '\n']) => {
                    result.status = "skipped".into();
                    result.detail = "Objet email invalide après remplacement des variables.".into();
                }
                Ok((body, subject)) => {
                    result.rendered_content = Some(body);
                    result.rendered_subject = Some(subject);
                    if let Some(doc) = &step.email_document {
                        match email_blocks::render(doc, &values, true) {
                            Ok(html) => {
                                result.rendered_html = Some(email_blocks::preview_document(&html))
                            }
                            Err(reason) => {
                                result.status = "skipped".into();
                                result.detail = reason;
                                result.rendered_content = None;
                                result.rendered_subject = None;
                            }
                        }
                    }
                }
                Err(reason) => {
                    result.status = "skipped".into();
                    result.detail = reason;
                }
            }
        }
        if step.kind == "email" && result.status == "simulated" {
            match brevo::prepare(
                club,
                &e.id,
                &p.id,
                &step.id,
                e.version,
                &p.email,
                result.rendered_subject.as_deref().unwrap_or(""),
                result.rendered_content.as_deref().unwrap_or(""),
                &now.to_rfc3339(),
            ) {
                Ok(prepared) => {
                    if !db
                        .lead_scenarios
                        .email_outbox
                        .iter()
                        .any(|r| r.id == prepared.id)
                    {
                        db.lead_scenarios.email_outbox.push(prepared);
                    }
                    result.detail = "Email préparé pour Brevo en simulation locale ; aucun appel externe ni livraison. Coordination avec Heitz à valider.".into();
                }
                Err(reason) => {
                    result.detail =
                        format!("Simulation seulement ; préparation Brevo bloquée : {reason}");
                }
            }
        }
        e.history.push(result);
        let next_index = if let Some(next) = &step.next {
            if let Some(id) = &next.step_id {
                let found = e
                    .definition
                    .steps
                    .iter()
                    .enumerate()
                    .find(|(i, s)| *i > e.cursor && s.id == *id && s.enabled)
                    .map(|(i, _)| i);
                if found.is_none() {
                    e.status = "stopped".into();
                    e.history.push(Execution {
                        step_id: "stop".into(),
                        at: now.to_rfc3339(),
                        status: "stopped".into(),
                        detail: "Suite invalide : parcours arrêté.".into(),
                        activity_id: None,
                        rendered_subject: None,
                        rendered_content: None,
                        rendered_html: None,
                    });
                    db.lead_scenarios.enrollments[idx] = e;
                    continue;
                }
                found
            } else {
                None
            }
        } else {
            e.definition
                .steps
                .iter()
                .enumerate()
                .skip(e.cursor + 1)
                .find(|(_, s)| s.enabled)
                .map(|(i, _)| i)
        };
        if let Some(next) = next_index {
            e.cursor = next;
            e.next_at = (now
                + Duration::seconds(e.definition.steps[next].delay.seconds().unwrap_or(0)))
            .to_rfc3339();
        } else {
            e.status = "completed".into();
        }
        db.lead_scenarios.enrollments[idx] = e;
    }
    before != serde_json::to_string(&db.lead_scenarios).unwrap_or_default()
}
pub fn spawn_worker(state: SharedState) {
    // Explicitly simulation-only; never run a hypothetical provider adapter in production.
    if !is_demo_mode() || std::env::var("CFITNESS_SCENARIOS_WORKER").as_deref() == Ok("0") {
        return;
    }
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(std::time::Duration::from_secs(5));
        loop {
            tick.tick().await;
            let mut db = state.db.write().await;
            let mut next = db.clone();
            let now = Utc::now();
            let mut changed = false;
            for club in ["carre-de-soie", "beynost"] {
                changed |= process(&mut next, club, now);
            }
            if changed {
                match persist_state(&state.data_dir, &next) {
                    Ok(()) => *db = next,
                    Err(error) => tracing::error!("Scenario batch not committed: {error}"),
                }
            }
        }
    });
}

#[cfg(test)]
#[path = "lead_scenarios_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "lead_blocks_branches_tests.rs"]
mod blocks_branches_tests;
