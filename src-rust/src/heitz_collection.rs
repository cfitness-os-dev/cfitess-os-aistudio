//! Validate already-supported read responses. Tickets are not payment evidence or revenue.
use serde_json::{json, Value};

/// Only the exact legacy reader label identifies the old unqualified ticket aggregate.
pub fn invalidate_legacy_revenue(
    kpis: &mut [crate::models::SiteKpis],
    allow_cds: bool,
    allow_bey: bool,
) -> usize {
    let mut count = 0;
    for kpi in kpis {
        if ((kpi.site_id == "club-carre-soie" && allow_cds)
            || (kpi.site_id == "club-beynost" && allow_bey))
            && kpi.period_label.starts_with("Sync Heitz Cloud (")
            && kpi.revenue_eur.is_some()
        {
            kpi.revenue_eur = None;
            count += 1;
        }
    }
    count
}

pub fn amount(row: &Value, aliases: &[&str]) -> Result<f64, String> {
    let mut found = None;
    for key in aliases {
        if let Some(raw) = row.get(*key) {
            let value = raw
                .as_f64()
                .filter(|n| n.is_finite())
                .ok_or("Montant Heitz absent ou invalide : aucun zéro ne peut être supposé.")?;
            if found.is_some_and(|previous| previous != value) {
                return Err("Montants Heitz contradictoires : rapprochement nécessaire.".into());
            }
            found = Some(value);
        }
    }
    found.ok_or_else(|| "Montant Heitz absent : aucun zéro ne peut être supposé.".into())
}

pub fn tickets(
    value: &Value,
    cds: i64,
    bey: i64,
    allow_cds: bool,
    allow_bey: bool,
) -> Result<Vec<Value>, String> {
    let rows = value.as_array().ok_or("Liste de tickets Heitz invalide.")?;
    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();
    for row in rows {
        let center = row
            .get("creationIdCenter")
            .and_then(Value::as_i64)
            .ok_or("Centre du ticket Heitz absent ou invalide ; aucun club déduit du SIRET.")?;
        let club = if center == cds {
            "carre-de-soie"
        } else if center == bey {
            "beynost"
        } else {
            return Err(
                "Centre du ticket Heitz non rattaché ; collecte financière à vérifier.".into(),
            );
        };
        if (club == "carre-de-soie" && !allow_cds) || (club == "beynost" && !allow_bey) {
            continue;
        }
        let id = row
            .get("id")
            .and_then(Value::as_i64)
            .filter(|id| *id > 0)
            .ok_or("Identifiant du ticket Heitz absent ou invalide.")?;
        if !seen.insert(id) {
            return Err("Ticket Heitz répété : collecte financière refusée.".into());
        }
        let amount = amount(row, &["printTotal", "_ticketTotal"])?;
        result.push(json!({
            "idTicket":id,"clubId":club,"amountTtcEur":amount,
            "ticketNumber":row.get("number").and_then(Value::as_str),
            "date":row.get("date").and_then(Value::as_str),
            "sellerName":row.get("sellerName").and_then(Value::as_str),
            "idEmpSeller":row.get("sellerIdEmp").and_then(Value::as_i64),
            "operation":row.get("operation").and_then(Value::as_str),
            "status":row.get("status").and_then(Value::as_str),
            "representsPayment":false
        }));
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn legacy_ticket_aggregate_is_invalidated_only_for_an_authorized_club() {
        let mut rows = crate::seed::create_initial_seed_state().kpis;
        for kpi in &mut rows {
            kpi.period_label = "Sync Heitz Cloud (2026-11-25)".into();
            kpi.revenue_eur = Some(999.0);
        }
        assert_eq!(invalidate_legacy_revenue(&mut rows, true, false), 1);
        assert!(rows
            .iter()
            .find(|k| k.site_id == "club-carre-soie")
            .unwrap()
            .revenue_eur
            .is_none());
        assert_eq!(
            rows.iter()
                .find(|k| k.site_id == "club-beynost")
                .unwrap()
                .revenue_eur,
            Some(999.0)
        );
        for kpi in &mut rows {
            kpi.period_label = "Période comptable vérifiée".into();
            kpi.revenue_eur = Some(100.0);
        }
        assert_eq!(invalidate_legacy_revenue(&mut rows, true, true), 0);
    }
    #[test]
    fn financial_unknown_zero_and_conflicting_fields_remain_distinct() {
        assert_eq!(amount(&json!({"a":0}), &["a", "b"]).unwrap(), 0.0);
        assert_eq!(
            amount(&json!({"a":-40.5,"b":-40.5}), &["a", "b"]).unwrap(),
            -40.5
        );
        for v in [
            json!({}),
            json!({"a":null}),
            json!({"a":"0"}),
            json!({"a":0,"b":-40}),
            json!({"a":null,"b":0}),
        ] {
            assert!(amount(&v, &["a", "b"]).is_err());
        }
    }
    #[test]
    fn ticket_credit_is_preserved_and_is_not_turned_into_payment_or_revenue() {
        let v = tickets(
            &json!([{"id":1,"creationIdCenter":3845,"printTotal":-25.0}]),
            3845,
            4967,
            true,
            false,
        )
        .unwrap();
        assert_eq!(v[0]["amountTtcEur"], -25.0);
        assert_eq!(v[0]["representsPayment"], false);
        assert!(v[0]["status"].is_null());
        assert!(v[0]["date"].is_null());
        assert!(tickets(
            &json!([{"id":1,"creationIdCenter":4967,"printTotal":80}]),
            3845,
            4967,
            true,
            false
        )
        .unwrap()
        .is_empty());
    }
    #[test]
    fn malformed_or_unassigned_tickets_cannot_look_like_successful_zero_collection() {
        for v in [
            json!({}),
            json!([{"id":1,"siret":"81865131700013","printTotal":20}]),
            json!([{"id":1,"creationIdCenter":9999,"printTotal":20}]),
            json!([{"id":1,"creationIdCenter":3845}]),
            json!([{"id":1,"creationIdCenter":3845,"printTotal":10},{"id":1,"creationIdCenter":3845,"printTotal":10}]),
        ] {
            assert!(tickets(&v, 3845, 4967, true, true).is_err());
        }
        assert!(tickets(&json!([]), 3845, 4967, true, true)
            .unwrap()
            .is_empty());
    }
}
