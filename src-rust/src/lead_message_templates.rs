//! Club-owned reusable messages. Plain text only: no executable HTML is rendered.
use super::*;

pub const VARIABLES: &[&str] = &[
    "prenom",
    "nom",
    "club",
    "telephone-club",
    "adresse-club",
    "url-rdv-club",
    "url-club",
    "prenom-commercial",
    "rdv-date",
    "rdv-heure",
    "date",
    "heure",
    "prix",
    "unsubscribe-url",
];

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Message {
    pub name: String,
    pub channel: String,
    pub subject: String,
    pub body: String,
    #[serde(default)]
    pub email_layout: Option<EmailLayout>,
    #[serde(default)]
    pub email_document: Option<email_blocks::Document>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EmailLayout {
    pub heading: String,
    pub button_label: String,
    pub button_url: String,
    pub footer: String,
    pub font: String,
}
pub fn valid_button_url(value: &str) -> bool {
    let Some(rest) = value.strip_prefix("https://") else {
        return false;
    };
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    !authority.is_empty()
        && !value.chars().any(|c| {
            c.is_whitespace() || c.is_control() || matches!(c, '<' | '>' | '"' | '\'' | '\\')
        })
        && !authority.contains(['@', '%'])
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Template {
    pub id: String,
    pub club_id: String,
    pub revision: u64,
    pub message: Message,
    pub archived: bool,
    pub updated_at: String,
}
pub fn tags(text: &str) -> Vec<String> {
    let mut result = vec![];
    let mut rest = text;
    while let Some(start) = rest.find('%') {
        rest = &rest[start + 1..];
        let Some(end) = rest.find('%') else { break };
        let key = &rest[..end];
        if !key.is_empty()
            && key
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
        {
            result.push(key.to_string());
            rest = &rest[end + 1..];
        }
    }
    result
}
pub fn validate_text(text: &str) -> Result<(), Failure> {
    if tags(text).iter().any(|t| !VARIABLES.contains(&t.as_str())) {
        return Err(err_resp(
            StatusCode::UNPROCESSABLE_ENTITY,
            "Variable inconnue. Utilisez les variables proposées.",
        ));
    }
    Ok(())
}
pub fn validate_message(m: &Message) -> Result<(), Failure> {
    if m.name.trim().is_empty()
        || m.name.encode_utf16().count() > 120
        || !matches!(m.channel.as_str(), "email" | "sms" | "whatsapp")
        || m.body.trim().is_empty()
        || m.body.encode_utf16().count() > 20000
        || m.subject.encode_utf16().count() > 200
        || m.subject.contains(['\r', '\n'])
        || (m.channel == "email" && m.subject.trim().is_empty())
        || (m.channel != "email" && !m.subject.is_empty())
    {
        return Err(err_resp(
            StatusCode::UNPROCESSABLE_ENTITY,
            "Modèle invalide : nom, canal, message et objet email sont requis et bornés.",
        ));
    }
    validate_text(&m.subject)?;
    validate_text(&m.body)?;
    if let Some(layout) = &m.email_layout {
        if m.channel != "email"
            || layout.heading.encode_utf16().count() > 300
            || layout.footer.encode_utf16().count() > 2000
            || layout.button_label.encode_utf16().count() > 120
            || layout.button_url.len() > 2000
            || layout.font.len() > 80
            || layout.font.is_empty()
            || layout
                .font
                .chars()
                .any(|c| !c.is_ascii_alphanumeric() && c != ' ' && c != '-')
            || (layout.button_label.trim().is_empty() != layout.button_url.is_empty())
            || (!layout.button_url.is_empty() && !valid_button_url(&layout.button_url))
        {
            return Err(err_resp(StatusCode::UNPROCESSABLE_ENTITY, "Présentation email invalide. Le bouton exige un libellé et une adresse HTTPS sans identifiant."));
        }
        validate_text(&layout.heading)?;
        validate_text(&layout.footer)?;
        validate_text(&layout.button_label)?;
    }
    if let Some(document) = &m.email_document {
        if m.channel != "email" || m.email_layout.is_some() {
            return Err(err_resp(
                StatusCode::UNPROCESSABLE_ENTITY,
                "Choisissez une seule présentation email.",
            ));
        }
        email_blocks::validate(document)?;
    }
    Ok(())
}
pub fn text_body(m: &Message) -> String {
    if let Some(doc) = &m.email_document {
        return email_blocks::text(doc);
    }
    if let Some(layout) = &m.email_layout {
        [
            layout.heading.clone(),
            m.body.clone(),
            if layout.button_url.is_empty() {
                String::new()
            } else {
                format!("{} : {}", layout.button_label, layout.button_url)
            },
            layout.footer.clone(),
        ]
        .into_iter()
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
    } else {
        m.body.clone()
    }
}
pub fn find<'a>(
    db: &'a AppDatabaseState,
    club: &str,
    id: &str,
    channel: &str,
) -> Result<&'a Template, Failure> {
    db.lead_scenarios
        .templates
        .iter()
        .find(|t| t.club_id == club && t.id == id && t.message.channel == channel && !t.archived)
        .ok_or_else(|| {
            err_resp(
                StatusCode::UNPROCESSABLE_ENTITY,
                "Choisissez un modèle actif du bon canal et de ce club.",
            )
        })
}
pub fn materialize(d: &Definition, db: &AppDatabaseState) -> Result<Definition, Failure> {
    let mut result = d.clone();
    for step in &mut result.steps {
        if let Some(id) = &step.template_id {
            let t = find(db, &d.club_id, id, &step.kind)?;
            step.content = Some(text_body(&t.message));
            step.subject = Some(t.message.subject.clone());
            step.email_document = t.message.email_document.clone();
            step.template_id = None;
        }
        if let Some(document) = &step.email_document {
            step.content = Some(email_blocks::text(document));
        }
        if let Some(wa) = &mut step.whatsapp {
            if let Some(id) = &wa.fallback_template_id {
                let t = find(db, &d.club_id, id, "whatsapp")?;
                wa.fallback_content = Some(t.message.body.clone());
                wa.fallback_template_id = None;
            }
        }
    }
    Ok(result)
}
pub fn render(text: &str, values: &HashMap<String, String>) -> Result<String, String> {
    let mut out = String::new();
    let mut rest = text;
    // Single pass: never interpret tags that came from a contact's name or another value.
    while let Some(start) = rest.find('%') {
        out.push_str(&rest[..start]);
        rest = &rest[start..];
        if let Some(end) = rest[1..].find('%') {
            let key = &rest[1..end + 1];
            if !key.is_empty()
                && key
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
            {
                let value = values
                    .get(key)
                    .filter(|v| !v.trim().is_empty())
                    .ok_or_else(|| format!("Variable %{key}% indisponible : message exclu."))?;
                out.push_str(value);
                rest = &rest[end + 2..];
                continue;
            }
        }
        out.push('%');
        rest = &rest[1..];
    }
    out.push_str(rest);
    Ok(out)
}
pub fn context(db: &AppDatabaseState, p: &LeadProspectRecord) -> HashMap<String, String> {
    let mut values = HashMap::from([
        ("prenom".into(), p.first_name.clone()),
        ("nom".into(), p.last_name.clone()),
    ]);
    if let Some(s) = db
        .sites
        .iter()
        .find(|s| Some(s.id.as_str()) == site(&p.club_id).ok())
    {
        values.insert("club".into(), s.name.clone());
        values.insert("adresse-club".into(), s.address.clone());
    }
    if let Some(e) = valid_assignee(db, p)
        .as_ref()
        .and_then(|id| db.employees.iter().find(|e| &e.id == id && e.active))
    {
        values.insert("prenom-commercial".into(), e.first_name.clone());
    }
    // No fabricated appointment, club telephone, offer price or timestamp timezone.
    values
}
