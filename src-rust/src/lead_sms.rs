//! Local SMS simulations only. No provider client, key, webhook or send method.
use super::*;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preference {
    pub club_id: String,
    pub phone: String,
    pub granted: bool,
    pub stopped: bool,
    pub revision: u64,
    pub reason: String,
    pub actor_id: String,
    pub updated_at: String,
    pub history: Vec<Value>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Estimate {
    pub encoding: String,
    pub units: usize,
    pub segments: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedSms {
    pub id: String,
    pub club_id: String,
    pub prospect_id: String,
    pub origin_id: String,
    pub created_at: String,
    pub phone: String,
    pub content: String,
    pub estimate: Estimate,
    pub status: String,
    pub provider_connected: bool,
    pub stop_instruction_verified: bool,
}
pub fn normalize_phone(value: &str) -> Option<String> {
    if value
        .chars()
        .any(|c| !c.is_ascii_digit() && !"+ ()-.".contains(c))
    {
        return None;
    }
    let value: String = value.chars().filter(|c| !" ()-.".contains(*c)).collect();
    let normalized = if let Some(rest) = value.strip_prefix("00") {
        format!("+{rest}")
    } else if value.len() == 10 && (value.starts_with("06") || value.starts_with("07")) {
        format!("+33{}", &value[1..])
    } else {
        value
    };
    let digits = normalized.strip_prefix('+')?;
    if !(8..=15).contains(&digits.len())
        || digits.starts_with('0')
        || !digits.bytes().all(|b| b.is_ascii_digit())
    {
        return None;
    }
    // French national trunk zero is not valid within an E.164 international number.
    if digits.starts_with("330") {
        return None;
    }
    Some(normalized)
}
pub fn estimate(text: &str) -> Estimate {
    let basic="@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
    let extended = "^{}\\[~]|€\u{000c}";
    let gsm = text
        .chars()
        .all(|c| basic.contains(c) || extended.contains(c));
    let units = if gsm {
        text.chars()
            .map(|c| if extended.contains(c) { 2 } else { 1 })
            .sum()
    } else {
        text.encode_utf16().count()
    };
    let (single, multipart) = if gsm { (160, 153) } else { (70, 67) };
    Estimate {
        encoding: if gsm { "GSM-7" } else { "Unicode" }.into(),
        units,
        segments: if units == 0 {
            0
        } else if units <= single {
            1
        } else {
            (units + multipart - 1) / multipart
        },
    }
}
pub fn excluded(db: &AppDatabaseState, club: &str, phone: &str) -> Option<&'static str> {
    let phone = match normalize_phone(phone) {
        Some(p) => p,
        None => return Some("Numéro SMS invalide"),
    };
    match db
        .lead_scenarios
        .sms_preferences
        .iter()
        .find(|p| p.club_id == club && p.phone == phone)
    {
        Some(p) if p.stopped => Some("Refus STOP SMS enregistré"),
        Some(p) if p.granted => None,
        _ => Some("Consentement SMS explicite absent"),
    }
}
pub fn prepare(
    club: &str,
    origin: &str,
    prospect: &str,
    phone: &str,
    content: &str,
    at: &str,
) -> Result<PreparedSms, String> {
    let phone = normalize_phone(phone).ok_or("Numéro SMS invalide")?;
    if content.trim().is_empty() || content.encode_utf16().count() > 20000 {
        return Err("Message SMS vide ou trop long.".into());
    }
    let key = serde_json::to_vec(&(club, origin, &phone)).map_err(|_| "SMS invalide")?;
    Ok(PreparedSms {
        id: format!("sms-sim-{:x}", Sha256::digest(key)),
        club_id: club.into(),
        prospect_id: prospect.into(),
        origin_id: origin.into(),
        created_at: at.into(),
        phone,
        content: content.into(),
        estimate: estimate(content),
        status: "simulated".into(),
        provider_connected: false,
        stop_instruction_verified: false,
    })
}
pub fn preference(
    db: &mut AppDatabaseState,
    club: &str,
    actor: &str,
    id: &str,
    granted: bool,
    stop: bool,
    revision: Option<u64>,
    reason: &str,
    now: DateTime<Utc>,
) -> Result<(), Failure> {
    if !is_demo_mode() {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "Les préférences de recette SMS sont réservées à la démonstration.",
        ));
    }
    if reason.trim().is_empty() || reason.chars().count() > 2000 {
        return Err(err_resp(
            StatusCode::UNPROCESSABLE_ENTITY,
            "Indiquez la preuve ou le motif de cette préférence SMS.",
        ));
    }
    let contact = db
        .lead_prospects
        .iter()
        .find(|p| p.id == id && p.club_id == club)
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Contact introuvable dans ce club."))?;
    let phone = normalize_phone(&contact.phone)
        .ok_or_else(|| err_resp(StatusCode::UNPROCESSABLE_ENTITY, "Numéro SMS invalide."))?;
    let idx = db
        .lead_scenarios
        .sms_preferences
        .iter()
        .position(|p| p.club_id == club && p.phone == phone);
    if !stop && idx.map(|i| db.lead_scenarios.sms_preferences[i].revision) != revision {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "La préférence SMS a changé. Rechargez avant de la modifier.",
        ));
    }
    if granted
        && idx
            .map(|i| db.lead_scenarios.sms_preferences[i].stopped)
            .unwrap_or(false)
    {
        return Err(err_resp(StatusCode::CONFLICT,"Un STOP ne peut pas être annulé par cette commande. Le parcours de réabonnement reste à raccorder."));
    }
    let event = json!({"granted":granted&&!stop,"stop":stop,"actorId":actor,"at":now.to_rfc3339(),"reason":reason.trim(),"source":"demo_manual"});
    if let Some(i) = idx {
        let p = &mut db.lead_scenarios.sms_preferences[i];
        p.stopped |= stop;
        p.granted = granted && !p.stopped;
        p.revision += 1;
        p.reason = reason.trim().into();
        p.actor_id = actor.into();
        p.updated_at = now.to_rfc3339();
        p.history.push(event);
    } else {
        db.lead_scenarios.sms_preferences.push(Preference {
            club_id: club.into(),
            phone,
            granted: granted && !stop,
            stopped: stop,
            revision: 1,
            reason: reason.trim().into(),
            actor_id: actor.into(),
            updated_at: now.to_rfc3339(),
            history: vec![event],
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn estimates_match_shared_typescript_contract() {
        let cases: Value =
            serde_json::from_str(include_str!("../../contracts/lead-sms-cases.json")).unwrap();
        for c in cases.as_array().unwrap() {
            let e = estimate(c["text"].as_str().unwrap());
            assert_eq!(json!(e), c["estimate"]);
        }
    }
    #[test]
    fn phone_normalization_and_identity_are_conservative() {
        assert_eq!(
            normalize_phone("06 00 00 00 00"),
            Some("+33600000000".into())
        );
        assert_eq!(
            normalize_phone("0033 6 00 00 00 00"),
            Some("+33600000000".into())
        );
        for bad in [
            "abc0600000000",
            "+330600000000",
            "06000",
            "+33+600000000",
            "001234",
        ] {
            assert!(normalize_phone(bad).is_none(), "{bad}");
        }
        let a = prepare("beynost", "origin", "p", "0600000000", "Bonjour", "now").unwrap();
        let b = prepare(
            "beynost",
            "origin",
            "duplicate",
            "+33600000000",
            "Autre",
            "later",
        )
        .unwrap();
        assert_eq!(a.id, b.id);
        assert!(!a.provider_connected);
    }
}
