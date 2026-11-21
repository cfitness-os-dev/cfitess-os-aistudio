use crate::models::MaintenanceTicketRecord;
use crate::rbac::{can_access_module_action, is_admin_employee};
use crate::routes::{
    append_audit, authorized_clubs_for_actor, err_resp, resolve_session_actor, SharedState,
};
use crate::seed::persist_state;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMaintenanceTicketPayload {
    pub club_id: String,
    pub equipment_name: String,
    pub category: String,
    pub issue_description: String,
    pub priority: String,
    pub supplier_name: Option<String>,
    pub estimated_cost_eur: Option<f64>,
    pub used_stock_id: Option<String>,
    pub used_part_name: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct UpdateMaintenanceTicketStatusPayload {
    pub status: Option<String>,
    pub advance: Option<bool>,
}

fn normalize_club_id(raw: &str) -> Option<&'static str> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "carre-de-soie" | "club-carre-soie" | "cds" => Some("carre-de-soie"),
        "beynost" | "club-beynost" | "bey" => Some("beynost"),
        _ => None,
    }
}

fn club_to_site_id(club_id: &str) -> &'static str {
    if club_id == "beynost" {
        "club-beynost"
    } else {
        "club-carre-soie"
    }
}

fn fallback_supplier_for_category(category: &str) -> &'static str {
    match category.trim() {
        "Technogym / Checkup" | "Cardio (Tapis, Vélos, Rameurs)" => "Technogym France SAV",
        "Portillons Heitz RFID/BT" => "Heitz System Support",
        "Poids, Haltères & Barres" | "Câbles, Poulies & Sellerie" => {
            "Technicien Interne / FitSupply"
        }
        "CVC / Sauna / Douches" => "ClimRhône Maintenance",
        _ => "Prestataire Maintenance Club",
    }
}

pub async fn get_maintenance_tickets(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Vec<MaintenanceTicketRecord>>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;

    let allowed = is_admin_employee(&db, &actor_id)
        || can_access_module_action(&db, &actor_id, Some(&site_id), "maintenance", "view")
        || can_access_module_action(&db, &actor_id, Some(&site_id), "stocks", "view");
    if !allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : consultation des tickets de maintenance non autorisée.",
        ));
    }

    let authorized_clubs = authorized_clubs_for_actor(&db, &actor_id);
    let mut list: Vec<MaintenanceTicketRecord> = db
        .maintenance_tickets
        .iter()
        .filter(|t| {
            normalize_club_id(&t.club_id)
                .map(|c| authorized_clubs.contains(c))
                .unwrap_or(false)
        })
        .cloned()
        .collect();

    list.reverse();
    Ok(Json(list))
}

pub async fn post_maintenance_ticket(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<CreateMaintenanceTicketPayload>,
) -> Result<(StatusCode, Json<MaintenanceTicketRecord>), (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let clean_equip = payload.equipment_name.trim();
    if clean_equip.is_empty() {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Le nom de l'équipement concerné est obligatoire.",
        ));
    }

    let norm_club = normalize_club_id(&payload.club_id).ok_or_else(|| {
        err_resp(
            StatusCode::BAD_REQUEST,
            "Club invalide. Valeurs supportées : carre-de-soie, beynost.",
        )
    })?;

    let mut db = state.db.write().await;

    let allowed = is_admin_employee(&db, &actor_id)
        || can_access_module_action(
            &db,
            &actor_id,
            Some(club_to_site_id(norm_club)),
            "maintenance",
            "edit",
        )
        || can_access_module_action(
            &db,
            &actor_id,
            Some(club_to_site_id(norm_club)),
            "stocks",
            "edit",
        )
        || can_access_module_action(
            &db,
            &actor_id,
            Some(&site_id),
            "maintenance",
            "create",
        );
    if !allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : création de ticket de maintenance non autorisée pour ce profil.",
        ));
    }

    let authorized_clubs = authorized_clubs_for_actor(&db, &actor_id);
    if !authorized_clubs.contains(norm_club) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : vous n'êtes pas habilité sur ce club.",
        ));
    }

    let mut used_part_name = payload
        .used_part_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    // Décrémentation atomique de la pièce de stock liée si renseignée
    if let Some(stock_id) = payload.used_stock_id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        if let Some(item) = db
            .stock_items
            .iter_mut()
            .find(|s| s.id == stock_id && s.club_id == norm_club)
        {
            item.current_qty = item.current_qty.saturating_sub(1);
            item.auto_order_prepared = item.current_qty < item.min_threshold;
            if used_part_name.is_none() {
                used_part_name = Some(item.name.clone());
            }
        }
    }

    let supplier_name = payload
        .supplier_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| fallback_supplier_for_category(&payload.category))
        .to_string();

    let cost = payload
        .estimated_cost_eur
        .filter(|c| c.is_finite() && *c >= 0.0)
        .unwrap_or(0.0);

    let ticket = MaintenanceTicketRecord {
        id: format!("mnt-{}", Utc::now().timestamp_millis()),
        club_id: norm_club.to_string(),
        equipment_name: clean_equip.to_string(),
        category: payload.category.trim().to_string(),
        issue_description: if payload.issue_description.trim().is_empty() {
            "Contrôle demandé par l'équipe club.".to_string()
        } else {
            payload.issue_description.trim().to_string()
        },
        priority: payload.priority.trim().to_string(),
        status: "Signalé (Agent Maintenance)".to_string(),
        supplier_name: supplier_name.clone(),
        estimated_cost_eur: cost,
        used_part_name,
        created_at: Utc::now().format("%Y-%m-%d").to_string(),
    };

    let snapshot = db.clone();
    db.maintenance_tickets.push(ticket.clone());

    append_audit(
        &mut db,
        &actor_id,
        "Maintenance & SAV (Création)",
        format!(
            "Création du ticket SAV « {} » ({}) · Prestataire : {}",
            ticket.equipment_name, norm_club, supplier_name
        ),
        club_to_site_id(norm_club),
        "maintenance_tickets",
        None,
        Some(ticket.equipment_name.clone()),
    );

    if let Err(e) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            &format!("Échec de persistance atomique du ticket SAV : {e}"),
        ));
    }

    Ok((StatusCode::CREATED, Json(ticket)))
}

pub async fn patch_maintenance_ticket_status(
    State(state): State<SharedState>,
    Path(ticket_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<UpdateMaintenanceTicketStatusPayload>,
) -> Result<Json<MaintenanceTicketRecord>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    let (ticket_index, ticket_club) = {
        let pos = db
            .maintenance_tickets
            .iter()
            .position(|t| t.id == ticket_id)
            .ok_or_else(|| {
                err_resp(
                    StatusCode::NOT_FOUND,
                    &format!("Ticket de maintenance « {ticket_id} » introuvable."),
                )
            })?;
        (pos, db.maintenance_tickets[pos].club_id.clone())
    };

    let allowed = is_admin_employee(&db, &actor_id)
        || can_access_module_action(
            &db,
            &actor_id,
            Some(club_to_site_id(&ticket_club)),
            "maintenance",
            "edit",
        )
        || can_access_module_action(
            &db,
            &actor_id,
            Some(club_to_site_id(&ticket_club)),
            "stocks",
            "edit",
        )
        || can_access_module_action(&db, &actor_id, Some(&site_id), "maintenance", "edit");
    if !allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : mise à jour de statut ticket non autorisée.",
        ));
    }

    let authorized_clubs = authorized_clubs_for_actor(&db, &actor_id);
    if !authorized_clubs.contains(ticket_club.as_str()) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : vous n'êtes pas habilité sur le club de ce ticket.",
        ));
    }

    let next_status = if payload.advance.unwrap_or(false) {
        match db.maintenance_tickets[ticket_index].status.as_str() {
            "Signalé (Agent Maintenance)" => "Pièce commandée".to_string(),
            "Pièce commandée" => "Technicien planifié".to_string(),
            "Technicien planifié" => "Résolu".to_string(),
            _ => "Signalé (Agent Maintenance)".to_string(),
        }
    } else if let Some(explicit) = payload.status.as_deref().map(str::trim) {
        match explicit {
            "Signalé (Agent Maintenance)" | "Pièce commandée" | "Technicien planifié" | "Résolu" => {
                explicit.to_string()
            }
            _ => {
                return Err(err_resp(
                    StatusCode::BAD_REQUEST,
                    "Statut invalide. Valeurs supportées : Signalé (Agent Maintenance), Pièce commandée, Technicien planifié, Résolu.",
                ));
            }
        }
    } else {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Aucun statut ou directive d'avancement fournie.",
        ));
    };

    let snapshot = db.clone();
    let old_status = db.maintenance_tickets[ticket_index].status.clone();
    db.maintenance_tickets[ticket_index].status = next_status.clone();
    let updated = db.maintenance_tickets[ticket_index].clone();

    append_audit(
        &mut db,
        &actor_id,
        "Maintenance & SAV (Mouvement)",
        format!(
            "Mise à jour statut ticket « {} » : {} → {}",
            updated.equipment_name, old_status, updated.status
        ),
        club_to_site_id(&ticket_club),
        "maintenance_tickets",
        Some(old_status),
        Some(updated.status.clone()),
    );

    if let Err(e) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            &format!("Échec de persistance atomique du statut du ticket : {e}"),
        ));
    }

    Ok(Json(updated))
}

pub async fn delete_maintenance_ticket(
    State(state): State<SharedState>,
    Path(ticket_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, _site_id) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    let (pos, ticket_club, ticket_name) = {
        let p = db
            .maintenance_tickets
            .iter()
            .position(|t| t.id == ticket_id)
            .ok_or_else(|| {
                err_resp(
                    StatusCode::NOT_FOUND,
                    &format!("Ticket de maintenance « {ticket_id} » introuvable."),
                )
            })?;
        (p, db.maintenance_tickets[p].club_id.clone(), db.maintenance_tickets[p].equipment_name.clone())
    };

    let allowed = is_admin_employee(&db, &actor_id)
        || can_access_module_action(
            &db,
            &actor_id,
            Some(club_to_site_id(&ticket_club)),
            "maintenance",
            "delete",
        );
    if !allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : suppression de ticket réservée aux administrateurs.",
        ));
    }

    let authorized_clubs = authorized_clubs_for_actor(&db, &actor_id);
    if !authorized_clubs.contains(ticket_club.as_str()) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : vous n'êtes pas habilité sur le club de ce ticket.",
        ));
    }

    let snapshot = db.clone();
    db.maintenance_tickets.remove(pos);

    append_audit(
        &mut db,
        &actor_id,
        "Maintenance & SAV (Suppression)",
        format!("Suppression du ticket SAV « {ticket_name} » ({ticket_id})"),
        club_to_site_id(&ticket_club),
        "maintenance_tickets",
        Some(ticket_name),
        None,
    );

    if let Err(e) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            &format!("Échec de persistance atomique de la suppression du ticket : {e}"),
        ));
    }

    Ok(Json(json!({
        "deleted": true,
        "ticketId": ticket_id
    })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::StockItemRecord;
    use crate::routes::SharedAppState;
    use crate::seed::load_or_init_state;
    use axum::http::{header, HeaderValue};
    use std::collections::HashMap;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    fn test_state() -> SharedState {
        static TEST_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
        let seq = TEST_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "cfos_maint_test_{}_{}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default(),
            seq
        ));
        Arc::new(SharedAppState {
            db: RwLock::new(load_or_init_state(&dir)),
            data_dir: dir,
            sessions: RwLock::new(HashMap::new()),
            login_attempts: RwLock::new(HashMap::new()),
        })
    }

    async fn session_headers(state: &SharedState, actor_id: &str, site_id: &str) -> HeaderMap {
        let token = format!(
            "maint-session-{}-{}",
            actor_id,
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        );
        state.sessions.write().await.insert(
            token.clone(),
            (actor_id.to_string(), Utc::now().timestamp() + 3600),
        );
        let mut headers = HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {token}")).unwrap(),
        );
        headers.insert(
            "x-cfitness-site-id",
            HeaderValue::from_str(site_id).unwrap(),
        );
        headers
    }

    #[tokio::test]
    async fn test_get_maintenance_tickets_admin() {
        let state = test_state();
        let headers = session_headers(&state, "emp-admin", "club-carre-soie").await;

        let res = get_maintenance_tickets(State(state), headers).await;
        assert!(res.is_ok());
        let tickets = res.unwrap().0;
        assert!(!tickets.is_empty());
    }

    #[tokio::test]
    async fn test_post_maintenance_ticket_and_stock_link() {
        let state = test_state();
        // Insert a known stock item on beynost
        {
            let mut db = state.db.write().await;
            db.stock_items.push(StockItemRecord {
                id: "stk-test-maint".into(),
                club_id: "beynost".into(),
                name: "Câble test maintenance".into(),
                barcode: None,
                category: "Pièces Détachées & Maintenance".into(),
                current_qty: 5,
                min_threshold: 3,
                unit: "unités".into(),
                supplier: "FitSupply Pro Lyon".into(),
                unit_priceht: 25.0,
                auto_order_prepared: false,
            });
        }

        let headers = session_headers(&state, "emp-admin", "club-beynost").await;

        let payload = CreateMaintenanceTicketPayload {
            club_id: "beynost".into(),
            equipment_name: "Tapis Course Technogym #4".into(),
            category: "Cardio (Tapis, Vélos, Rameurs)".into(),
            issue_description: "Bruit courroie".into(),
            priority: "Urgente".into(),
            supplier_name: None,
            estimated_cost_eur: Some(180.0),
            used_stock_id: Some("stk-test-maint".into()),
            used_part_name: None,
        };

        let res = post_maintenance_ticket(State(state.clone()), headers, Json(payload)).await;
        assert!(res.is_ok());
        let (status, Json(ticket)) = res.unwrap();
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(ticket.equipment_name, "Tapis Course Technogym #4");
        assert_eq!(ticket.used_part_name, Some("Câble test maintenance".into()));
        assert_eq!(ticket.status, "Signalé (Agent Maintenance)");

        // Vérifier que le stock a bien été décrémenté de 1 (5 -> 4)
        let db = state.db.read().await;
        let item = db.stock_items.iter().find(|s| s.id == "stk-test-maint").unwrap();
        assert_eq!(item.current_qty, 4);
    }

    #[tokio::test]
    async fn test_patch_maintenance_ticket_advance_status() {
        let state = test_state();
        let headers = session_headers(&state, "emp-admin", "club-beynost").await;

        // Target ticket "mnt-2" on Beynost, initially "Signalé (Agent Maintenance)"
        let res = patch_maintenance_ticket_status(
            State(state.clone()),
            Path("mnt-2".into()),
            headers.clone(),
            Json(UpdateMaintenanceTicketStatusPayload {
                advance: Some(true),
                status: None,
            }),
        )
        .await;
        assert!(res.is_ok());
        let updated = res.unwrap().0;
        assert_eq!(updated.status, "Pièce commandée");

        // Advance once more
        let res2 = patch_maintenance_ticket_status(
            State(state.clone()),
            Path("mnt-2".into()),
            headers,
            Json(UpdateMaintenanceTicketStatusPayload {
                advance: Some(true),
                status: None,
            }),
        )
        .await;
        assert!(res2.is_ok());
        assert_eq!(res2.unwrap().0.status, "Technicien planifié");
    }

    #[tokio::test]
    async fn test_unauthorized_club_rejected() {
        let state = test_state();
        // emp-accueil-cs is only authorized for Carré de Soie
        let headers = session_headers(&state, "emp-accueil-cs", "club-carre-soie").await;

        // Try to create ticket on Beynost
        let payload = CreateMaintenanceTicketPayload {
            club_id: "beynost".into(),
            equipment_name: "Machine test".into(),
            category: "Technogym / Checkup".into(),
            issue_description: "test".into(),
            priority: "Normale".into(),
            supplier_name: None,
            estimated_cost_eur: None,
            used_stock_id: None,
            used_part_name: None,
        };

        let res = post_maintenance_ticket(State(state), headers, Json(payload)).await;
        assert!(res.is_err());
        let (status, _) = res.unwrap_err();
        assert_eq!(status, StatusCode::FORBIDDEN);
    }
}
