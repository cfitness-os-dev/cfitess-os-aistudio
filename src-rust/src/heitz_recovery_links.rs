//! Explicit browser navigation only: no vendor request, credential, document or payment inference.
use crate::routes::{err_resp, SharedState};
use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LinkQuery {
    revision: String,
}

fn links(raw: Option<String>, center: i64, client: i64) -> Option<Value> {
    if center <= 0 || client <= 0 || client > 9_007_199_254_740_991 {
        return None;
    }
    let root = raw?;
    let rest = root
        .strip_prefix("https://")
        .or_else(|| root.strip_prefix("http://"))?;
    if root
        .chars()
        .any(|c| c.is_whitespace() || c.is_control() || c == '\\')
    {
        return None;
    }
    let (authority, path) = rest.split_once('/')?;
    // Require the exact operator-verified CRM root, including its centre. No login,
    // credentials, query parameters, fragment, arbitrary route template or autologin.
    if path != format!("app/heitz/{center}/crm/") {
        return None;
    }
    let mut parts = authority.split(':');
    let host = parts.next()?;
    if host.is_empty()
        || !host.split('.').all(|label| {
            !label.is_empty()
                && !label.starts_with('-')
                && !label.ends_with('-')
                && label
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-')
        })
    {
        return None;
    }
    if let Some(port) = parts.next() {
        if port.parse::<u16>().ok().filter(|v| *v > 0).is_none() {
            return None;
        }
    }
    if parts.next().is_some() {
        return None;
    }
    let page = |name| format!("{root}#/app/client/{client}/{name}");
    Some(
        json!({"financial":page("financial"),"documents":page("document"),"subscriptions":page("subscriptions")}),
    )
}

pub async fn get(
    State(s): State<SharedState>,
    Path(id): Path<String>,
    Query(q): Query<LinkQuery>,
    h: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if !h
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("Bearer "))
    {
        return Err(err_resp(
            StatusCode::UNAUTHORIZED,
            "Reconnectez-vous pour consulter les accès Heitz.",
        ));
    }
    let (actor, _) = crate::routes::resolve_session_actor(&s, &h).await?;
    let db = s.db.read().await;
    let c = db
        .recovery_cases
        .iter()
        .find(|c| c.id == id)
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Dossier introuvable."))?;
    if !crate::recovery_evidence::allowed(&db, &actor, c, false) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Lecture financière non autorisée pour ce club.",
        ));
    }
    if q.revision != crate::recovery_evidence::revision(&db, c) {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "Le dossier a changé. Actualisez-le avant de consulter Heitz.",
        ));
    }
    if crate::heitz_live::heitz_demo_offline() {
        return Ok(Json(json!({"actorId":actor,"caseId":id,"clubId":c.club_id,"revision":q.revision,"configured":false,"urls":null,"demoOffline":true,"notice":"Démonstration sur données fictives : les accès à Heitz sont désactivés."})));
    }
    let client = crate::heitz_recovery_readers::source_id(&db, c)?;
    let (var, center) = match c.club_id.as_str() {
        "carre-de-soie" => (
            "CFITNESS_HEITZ_CRM_ROOT_CDS",
            crate::heitz_live::heitz_center_id_cds(),
        ),
        "beynost" => (
            "CFITNESS_HEITZ_CRM_ROOT_BEY",
            crate::heitz_live::heitz_center_id_bey(),
        ),
        _ => return Err(err_resp(StatusCode::CONFLICT, "Club Heitz non confirmé.")),
    };
    let urls = links(std::env::var(var).ok(), center, client);
    Ok(Json(
        json!({"actorId":actor,"caseId":id,"clubId":c.club_id,"revision":q.revision,"configured":urls.is_some(),"urls":urls,"demoOffline":false,"notice":"Ouverture dans Heitz, avec sa propre connexion. Aucun règlement ni document importé et aucune preuve validée automatiquement."}),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dossier_links_require_an_exact_root_and_center_without_secrets() {
        let root = "https://heitz.example.test/app/heitz/3845/crm/";
        let v = links(Some(root.into()), 3845, 501).unwrap();
        assert_eq!(v["financial"], format!("{root}#/app/client/501/financial"));
        assert_eq!(v["documents"], format!("{root}#/app/client/501/document"));
        assert!(links(None, 3845, 501).is_none());
        for raw in [
            "javascript:alert(1)",
            "https://user:secret@heitz.test/app/heitz/3845/crm/",
            "https://heitz.test/app/heitz/4967/crm/",
            "https://heitz.test/app/heitz/3845/crm/?token=x",
            "https://heitz.test/app/heitz/3845/crm/#/app/login",
            "https://heitz.test:0/app/heitz/3845/crm/",
            "https://heitz.test:123:456/app/heitz/3845/crm/",
            "https://heitz.test/app/heitz/3845/crm/ ",
            "https://heitz.test\\@evil.test/app/heitz/3845/crm/",
        ] {
            assert!(links(Some(raw.into()), 3845, 501).is_none(), "{raw}");
        }
        assert!(links(
            Some("http://192.0.2.1:8081/app/heitz/3845/crm/".into()),
            3845,
            501
        )
        .is_some());
    }
}
