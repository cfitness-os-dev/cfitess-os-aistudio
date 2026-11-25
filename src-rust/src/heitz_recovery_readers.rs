//! On-demand source readings. No business writes, file downloads or signature inference.
use crate::{
    models::{AppDatabaseState, RecoveryCaseRecord},
    routes::{err_resp, SharedState},
};
use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
type Failure = (StatusCode, Json<Value>);
const MAX_ROWS: usize = 2000;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReadingQuery {
    revision: String,
}

pub(crate) fn source_id(db: &AppDatabaseState, c: &RecoveryCaseRecord) -> Result<i64, Failure> {
    let raw = c.member_id.strip_prefix("hz-").ok_or_else(|| {
        err_resp(
            StatusCode::CONFLICT,
            "Rapprochez ce dossier avec une fiche Heitz synchronisée.",
        )
    })?;
    let id = raw
        .parse::<i64>()
        .ok()
        .filter(|id| *id > 0 && *id <= 9_007_199_254_740_991 && id.to_string() == raw)
        .ok_or_else(|| {
            err_resp(
                StatusCode::CONFLICT,
                "Identité Heitz non confirmée pour ce dossier.",
            )
        })?;
    // A manually created dossier cannot authorize arbitrary vendor IDs or clubs.
    if c.id != format!("rec-hz-{}", c.member_id)
        || !db.heitz_members.iter().any(|m| {
            m.id == c.member_id
                && m.home_club_id == c.club_id
                && m.data_source.as_deref() == Some("HeitzSystem Cloud")
        })
    {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "Une fiche et un club confirmés par la synchronisation Heitz sont nécessaires.",
        ));
    }
    Ok(id)
}
fn rows(v: &Value) -> Result<&Vec<Value>, String> {
    let rows = v.as_array().ok_or("Format de liste non reconnu.")?;
    if rows.len() > MAX_ROWS || rows.iter().any(|r| !r.is_object()) {
        return Err(
            "Liste trop volumineuse ou mal formée : aucun résultat partiel confirmé.".into(),
        );
    }
    Ok(rows)
}
fn text(v: &Value, key: &str) -> Result<Value, String> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(Value::Null),
        Some(Value::String(s)) if s.chars().count() <= 1000 => Ok(json!(s)),
        _ => Err("Champ textuel non reconnu.".into()),
    }
}
fn date(v: &Value, key: &str, required: bool) -> Result<Value, String> {
    let value = text(v, key)?;
    if value.is_null() && !required {
        return Ok(value);
    }
    let s = value.as_str().ok_or("Date non fournie.")?;
    DateTime::parse_from_rfc3339(s).map_err(|_| "Date source non reconnue.")?;
    Ok(value)
}
fn check_client(v: &Value, id: i64) -> Result<(), String> {
    if let Some(client) = v.get("idClient") {
        if client.as_i64() != Some(id) {
            return Err("La réponse ne correspond pas à l’adhérent demandé.".into());
        }
    }
    Ok(())
}
fn project(v: &Value, id: i64, kind: &str) -> Result<Vec<Value>, String> {
    let mut result = Vec::new();
    let mut ids = std::collections::HashSet::new();
    for row in rows(v)? {
        check_client(row, id)?;
        if kind == "provisional" {
            result.push(json!({"date":date(row,"date",true)?,"valuePayment":crate::heitz_collection::amount(row,&["valuePayment"])?,"valueSale":crate::heitz_collection::amount(row,&["valueSale"])?,"valuePoints":crate::heitz_collection::amount(row,&["valuePoints"])?}));
        } else {
            // Subscription list examples omit their schema: only a positive ID and
            // the accessLabel already used by the existing reader are projected.
            let record_id = row
                .get("id")
                .and_then(Value::as_i64)
                .filter(|n| *n > 0 && *n <= 9_007_199_254_740_991)
                .ok_or("Identifiant source absent ou non reconnu.")?;
            if !ids.insert(record_id) {
                return Err("Identifiant source répété : liste à vérifier.".into());
            }
            if kind == "subscriptions" {
                result.push(json!({"id":record_id,"accessLabel":text(row,"accessLabel")?}));
            } else {
                let manual = match row.get("processManually") {
                    None | Some(Value::Null) => Value::Null,
                    Some(Value::Bool(b)) => json!(b),
                    _ => return Err("Mode de traitement non reconnu.".into()),
                };
                result.push(json!({"id":record_id,"next":date(row,"next",false)?,"last":date(row,"last",false)?,"label":text(row,"label")?,"totalSale":text(row,"totalSale")?,"totalPayment":text(row,"totalPayment")?,"totalPoints":text(row,"totalPoints")?,"access":text(row,"access")?,"period":text(row,"period")?,"processManually":manual}));
            }
        }
    }
    Ok(result)
}
fn section(raw: Result<Value, String>, id: i64, kind: &str) -> Value {
    match raw.and_then(|v| project(&v, id, kind)) {
        Ok(rows) => json!({"status":"loaded","items":rows,"completeHistoryVerified":false}),
        Err(_) => {
            json!({"status":"unavailable","items":null,"completeHistoryVerified":false,"message":"Source non confirmée : droits, disponibilité ou format à vérifier. Aucun zéro ni liste vide n’est supposé."})
        }
    }
}
pub async fn get(
    State(s): State<SharedState>,
    Path(id): Path<String>,
    Query(q): Query<ReadingQuery>,
    h: HeaderMap,
) -> Result<Json<Value>, Failure> {
    if !h
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("Bearer "))
    {
        return Err(err_resp(
            StatusCode::UNAUTHORIZED,
            "Reconnectez-vous pour consulter les sources Heitz.",
        ));
    }
    let (actor, _) = crate::routes::resolve_session_actor(&s, &h).await?;
    let (client, club) = {
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
                "Le dossier a changé. Actualisez-le avant la lecture Heitz.",
            ));
        }
        (source_id(&db, c)?, c.club_id.clone())
    };
    let token = crate::heitz_live::authenticate_heitz_token()
        .await
        .map_err(|_| {
            err_resp(
                StatusCode::BAD_GATEWAY,
                "Connexion de lecture Heitz non disponible. Aucun résultat confirmé.",
            )
        })?;
    let paths = [
        format!("/api/userScheduledPayments/provisional?idClient={client}"),
        format!("/api/userScheduledPayments/display?idClient={client}"),
        format!("/api/userSubscriptions?idClient={client}"),
    ];
    let (a, b, c) = tokio::join!(
        crate::heitz_live::heitz_http_request("GET", &paths[0], Some(&token), None, 12),
        crate::heitz_live::heitz_http_request("GET", &paths[1], Some(&token), None, 12),
        crate::heitz_live::heitz_http_request("GET", &paths[2], Some(&token), None, 12)
    );
    // Permissions and dossier identity can change while the provider is responding.
    {
        let db = s.db.read().await;
        let c = db
            .recovery_cases
            .iter()
            .find(|c| c.id == id)
            .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Dossier introuvable."))?;
        if !crate::recovery_evidence::allowed(&db, &actor, c, false) {
            return Err(err_resp(
                StatusCode::FORBIDDEN,
                "Ce dossier ne relève plus de vos droits.",
            ));
        }
        if crate::recovery_evidence::revision(&db, c) != q.revision
            || source_id(&db, c)? != client
            || c.club_id != club
        {
            return Err(err_resp(StatusCode::CONFLICT,"Le dossier a changé pendant la lecture. Recommencez depuis les informations actualisées."));
        }
    }
    let provisional = section(a, client, "provisional");
    let display = section(b, client, "display");
    let subscriptions = section(c, client, "subscriptions");
    let partial = [&provisional, &display, &subscriptions]
        .iter()
        .any(|v| v["status"] != "loaded");
    Ok(Json(
        json!({"actorId":actor,"caseId":id,"clubId":club,"revision":q.revision,"collectedAtUtc":Utc::now().to_rfc3339(),"partial":partial,"provisional":provisional,"display":display,"subscriptions":subscriptions,"paymentsCollected":false,"contractOriginalsCollected":false,"termsOriginalsCollected":false,"signatureStatus":"not_checked","documents":{"status":"targeting_to_qualify","message":"Les documents de cet adhérent ne sont pas encore disponibles ici. Consultez son dossier Heitz. Aucun téléchargement n’a été lancé."},"notice":"Échéances prévues et abonnements actifs : aucun encaissement ni signature déduits. Aucun changement effectué dans Heitz."}),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn forecasts_preserve_known_zero_and_negative_amounts_but_never_infer_receipts() {
        let v = json!([{"date":"2026-11-30T23:00:00Z","valuePayment":0,"valueSale":-12,"valuePoints":0,"private":"not projected"}]);
        let r = project(&v, 501, "provisional").unwrap();
        assert_eq!(r[0]["valuePayment"], 0.0);
        assert_eq!(r[0]["valueSale"], -12.0);
        assert!(r[0].get("private").is_none());
        for v in [
            json!({}),
            json!([{"date":"bad","valuePayment":0}]),
            json!([{"idClient":502,"date":"2026-11-30T23:00:00Z","valuePayment":0,"valueSale":0,"valuePoints":0}]),
        ] {
            assert!(project(&v, 501, "provisional").is_err());
        }
    }
    #[test]
    fn display_keeps_formatted_amounts_as_text_and_failure_is_not_an_empty_list() {
        let v = json!([{"id":1,"totalPayment":"12.00 EUR - PRELEVEMENT","totalSale":"12.00 EUR (TVA 20%)"}]);
        let r = project(&v, 501, "display").unwrap();
        assert!(r[0]["totalPayment"].is_string());
        assert!(r[0]["next"].is_null());
        assert!(section(Err("private upstream detail".into()), 501, "display")["items"].is_null());
        assert_eq!(section(Ok(json!([])), 501, "display")["items"], json!([]));
        assert!(project(&json!([{"id":1},{"id":1}]), 501, "subscriptions").is_err());
    }
}
