//! Offline preparation only: deliberately no HTTP client, API key or send method.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedEmail {
    pub id: String,
    pub club_id: String,
    pub enrollment_id: String,
    pub prospect_id: String,
    pub step_id: String,
    pub version: u32,
    pub created_at: String,
    pub status: String,
    pub payload: Value,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Suppression {
    pub club_id: String,
    pub email: String,
    pub reason: String,
    pub actor_id: String,
    pub created_at: String,
}
pub fn normalized(email: &str) -> String { email.trim().to_ascii_lowercase() }
pub fn suppressed(rows: &[Suppression], club: &str, email: &str) -> bool {
    rows.iter().any(|row| row.club_id == club && row.email == normalized(email))
}
pub fn valid_address(email: &str) -> bool {
    let parts: Vec<_> = email.split('@').collect();
    email.len() <= 254 && parts.len() == 2 && !parts[0].is_empty() && parts[1].contains('.')
        && !email.chars().any(|c| c.is_whitespace() || c.is_control() || "<>\";,".contains(c))
}
pub fn prepare(
    club: &str, enrollment: &str, prospect: &str, step: &str, version: u32,
    email: &str, subject: &str, text: &str, at: &str,
) -> Result<PreparedEmail, &'static str> {
    if !valid_address(email) { return Err("Adresse email invalide."); }
    if subject.trim().is_empty() || subject.len() > 300 || subject.contains(['\r','\n']) {
        return Err("Renseignez un objet email valide avant de préparer le message Brevo.");
    }
    if text.trim().is_empty() { return Err("Le contenu de l’email est vide."); }
    // JSON tuple prevents ambiguous composite keys. Version is immutable at enrollment.
    let key = serde_json::to_vec(&(club,enrollment,step,version)).map_err(|_| "Message invalide.")?;
    let id = format!("brevo-sim-{:x}", Sha256::digest(key));
    Ok(PreparedEmail {
        id: id.clone(), club_id: club.into(), enrollment_id: enrollment.into(),
        prospect_id: prospect.into(), step_id: step.into(), version,
        created_at: at.into(), status: "simulated".into(),
        payload: json!({
            "sender":{"name":"C.Fitness — simulation", "email":"simulation@example.test"},
            "to":[{"email":email.trim()}], "subject":subject, "textContent":text,
            "tags":["cfitness-os","lead-scenario",club],
            "headers":{"X-Sib-Sandbox":"drop", "X-Mailin-custom":id}
        }),
    })
}
pub fn status() -> Value {
    json!({"provider":"brevo", "mode":"offline_simulation", "realSendingEnabled":false,
        "heitzCoordination":"unverified", "senderVerified":false,
        "deliveryProof":false, "apiKeyRequiredForSimulation":false})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn payload_is_sandboxed_single_recipient_and_deduplicates_by_immutable_execution() {
        let a=prepare("beynost","enroll","p","step",1,"one@example.test","Visite","Bonjour","now").unwrap();
        let b=prepare("beynost","enroll","p","step",1,"two@example.test","Autre","Bonjour","later").unwrap();
        assert_eq!(a.id,b.id);
        assert_ne!(a.id,prepare("beynost","enroll","p","step",2,"one@example.test","Visite","Bonjour","now").unwrap().id);
        assert_eq!(a.payload["headers"]["X-Sib-Sandbox"],"drop");
        assert_eq!(a.payload["to"].as_array().unwrap().len(),1);
        assert!(prepare("beynost","e","p","s",1,"bad@example.test\r\nBcc:a@example.test","x","x","now").is_err());
        assert!(prepare("beynost","e","p","s",1,"a@example.test","","x","now").is_err());
        assert_eq!(status()["realSendingEnabled"],false);
    }
    #[test]
    fn exclusions_are_normalized_and_isolated_by_club() {
        let rows=vec![Suppression{club_id:"beynost".into(),email:normalized(" A@Example.test "),reason:"Refus".into(),actor_id:"a".into(),created_at:"now".into()}];
        assert!(suppressed(&rows,"beynost","a@EXAMPLE.test"));
        assert!(!suppressed(&rows,"carre-de-soie","a@example.test"));
    }
}
