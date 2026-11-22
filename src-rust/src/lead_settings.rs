use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LeadSettings {
    pub sms_credits: u32,
    pub sales_script: String,
    pub archive_threshold_days: u32,
    pub notif_email: String,
    pub notif_mobile: String,
    pub whatsapp_number: String,
    #[serde(default)]
    pub client_pass_offer: String,
    pub auto_assign_enabled: bool,
    pub auto_unassign_on_leave: bool,
    pub dropout_threshold_days: u32,
    pub dropout_reset_on_badge: bool,
    pub auto_archive_enabled: bool,
    pub archive_target_stage: String,
    pub enabled_alert_ids: Vec<String>,
    pub selected_pass_offer_ids: Vec<String>,
    pub client_pass_target_scope: String,
    pub ui_language: String,
}

pub fn valid_club(club_id: &str) -> bool {
    matches!(club_id, "carre-de-soie" | "beynost")
}

impl LeadSettings {
    pub fn validate(&self, club_id: &str) -> Result<(), String> {
        if !valid_club(club_id) { return Err("Club inconnu.".into()); }
        if !(1..=730).contains(&self.archive_threshold_days) {
            return Err("Le délai d’archivage doit être compris entre 1 et 730 jours.".into());
        }
        if !(1..=180).contains(&self.dropout_threshold_days) {
            return Err("Le seuil de décrochage doit être compris entre 1 et 180 jours.".into());
        }
        for (name, text, max) in [
            ("Script commercial", self.sales_script.as_str(), 16000),
            ("Email", self.notif_email.as_str(), 254),
            ("Mobile", self.notif_mobile.as_str(), 40),
            ("WhatsApp", self.whatsapp_number.as_str(), 40),
            ("Offre", self.client_pass_offer.as_str(), 256),
        ] {
            if text.encode_utf16().count() > max { return Err(format!("{} : longueur invalide.", name)); }
        }
        if !self.notif_email.is_empty() {
            let parts: Vec<_> = self.notif_email.split('@').collect();
            if parts.len() != 2 || parts[0].is_empty() || !parts[1].contains('.')
                || parts[1].starts_with('.') || parts[1].ends_with('.')
                || self.notif_email.chars().any(char::is_whitespace) {
                return Err("L’adresse email de notification est invalide.".into());
            }
        }
        for phone in [&self.notif_mobile, &self.whatsapp_number] {
            let digits = phone.chars().filter(char::is_ascii_digit).count();
            if !phone.is_empty() && (!(8..=15).contains(&digits)
                || phone.matches('+').count() > 1
                || (phone.contains('+') && !phone.starts_with('+'))
                || !phone.chars().all(|c| c.is_ascii_digit() || "+ ().-".contains(c))) {
                return Err("Le numéro de téléphone est invalide (8 à 15 chiffres).".into());
            }
        }
        if !matches!(self.archive_target_stage.as_str(), "Archivé" | "Froid")
            || !matches!(self.client_pass_target_scope.as_str(), "club" | "enseigne")
            || !matches!(self.ui_language.as_str(), "fr" | "en") {
            return Err("Une option des réglages est invalide.".into());
        }
        for ids in [&self.enabled_alert_ids, &self.selected_pass_offer_ids] {
            let mut seen = HashSet::new();
            if ids.len() > 256 || ids.iter().any(|id| id.trim().is_empty()
                || id.encode_utf16().count() > 128 || !seen.insert(id)) {
                return Err("La sélection contient un identifiant invalide ou un doublon.".into());
            }
        }
        let allowed_alerts: HashSet<String> = (545..=552).map(|n| format!("LEAD-{:04}", n)).collect();
        if self.enabled_alert_ids.iter().any(|id| !allowed_alerts.contains(id)) {
            return Err("Une alerte sélectionnée est inconnue.".into());
        }
        // External IDs need not use our demo prefixes; reject explicit cross-club demo IDs.
        let other_prefix = if club_id == "beynost" { "HZ-CDS-" } else { "HZ-BEY-" };
        if self.selected_pass_offer_ids.iter().any(|id| id.starts_with(other_prefix)) {
            return Err("Une offre sélectionnée appartient à l’autre club.".into());
        }
        Ok(())
    }
}

/// Read old two-club form records without leaking aliases into the new write contract.
/// Legacy keys belonging to the selected club take precedence over stale canonical values.
pub fn canonical_settings(club_id: &str, defaults: Value, stored: Option<&Value>) -> Result<Value, String> {
    let mut value = defaults;
    if let Some(stored) = stored {
        let object = stored.as_object().ok_or("Réglages enregistrés invalides.")?;
        for (key, target) in value.as_object_mut().ok_or("Réglages par défaut invalides.")?.iter_mut() {
            if let Some(source) = object.get(key) { *target = source.clone(); }
        }
        let aliases = if club_id == "beynost" {
            vec![("notifEmailBeynost", "notifEmail"),
                ("notifMobileBeynost", "notifMobile"), ("whatsappNumberBeynost", "whatsappNumber")]
        } else {
            vec![("notifMobileCds", "notifMobile"),
                ("whatsappNumberCds", "whatsappNumber")]
        };
        for (old, new) in aliases {
            if let Some(source) = object.get(old) { value[new] = source.clone(); }
        }
        // Old forms saved both clubs' demo offer IDs in one array.
        if let Some(ids) = value["selectedPassOfferIds"].as_array_mut() {
            let other = if club_id == "beynost" { "HZ-CDS-" } else { "HZ-BEY-" };
            ids.retain(|id| !id.as_str().map(|id| id.starts_with(other)).unwrap_or(false));
        }
    }
    let parsed: LeadSettings = serde_json::from_value(value).map_err(|_| "Réglages enregistrés incomplets ou invalides.")?;
    parsed.validate(club_id)?;
    serde_json::to_value(parsed).map_err(|_| "Réglages non sérialisables.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn shared_frontend_backend_contract_cases() {
        let fixture: Value = serde_json::from_str(include_str!("../../contracts/lead-settings-cases.json")).unwrap();
        for case in fixture["cases"].as_array().unwrap() {
            let mut input = fixture["base"].clone();
            input[case["field"].as_str().unwrap()] = case["value"].clone();
            let valid = serde_json::from_value::<LeadSettings>(input)
                .map(|settings| settings.validate("carre-de-soie").is_ok()).unwrap_or(false);
            assert_eq!(valid, case["valid"].as_bool().unwrap(), "{}", case["name"]);
        }
        let mut unknown = fixture["base"].clone();
        unknown["notifMobileCds"] = json!("0612345678");
        assert!(serde_json::from_value::<LeadSettings>(unknown).is_err());
    }

    #[test]
    fn old_two_club_settings_are_migrated_without_cross_club_values() {
        let fixture: Value = serde_json::from_str(include_str!("../../contracts/lead-settings-cases.json")).unwrap();
        let mut legacy = fixture["base"].clone();
        legacy["notifEmailBeynost"] = json!("beynost@club.fr");
        legacy["notifMobileBeynost"] = json!("0612345678");
        legacy["notifMobileCds"] = json!("0698765432");
        legacy["smsCreditsCds"] = json!(999999);
        legacy["selectedPassOfferIds"] = json!(["HZ-CDS-ABO-PASS", "HZ-BEY-ABO-PASS"]);
        let cds = canonical_settings("carre-de-soie", fixture["base"].clone(), Some(&legacy)).unwrap();
        let bey = canonical_settings("beynost", fixture["base"].clone(), Some(&legacy)).unwrap();
        assert_eq!(cds["notifMobile"], "0698765432");
        assert_eq!(cds["notifEmail"], fixture["base"]["notifEmail"]);
        assert_eq!(cds["smsCredits"], fixture["base"]["smsCredits"]);
        assert_eq!(bey["notifMobile"], "0612345678");
        assert_eq!(bey["notifEmail"], "beynost@club.fr");
        assert_eq!(cds["selectedPassOfferIds"], json!(["HZ-CDS-ABO-PASS"]));
        assert_eq!(bey["selectedPassOfferIds"], json!(["HZ-BEY-ABO-PASS"]));
        assert!(cds.get("notifMobileCds").is_none());
        assert!(bey.get("notifEmailBeynost").is_none());
    }
}
