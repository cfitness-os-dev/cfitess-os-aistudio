use crate::models::{PurchaseOrderRecord, StockItemRecord};
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
pub struct CreateStockItemPayload {
    pub club_id: String,
    pub name: String,
    pub barcode: Option<String>,
    pub category: Option<String>,
    pub current_qty: u32,
    pub min_threshold: Option<u32>,
    pub unit: Option<String>,
    pub supplier: Option<String>,
    pub unit_priceht: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchImportStocksPayload {
    pub rows: Vec<CreateStockItemPayload>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct AdjustStockPayload {
    pub delta: Option<i32>,
    pub set_qty: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePurchaseOrderPayload {
    pub club_id: String,
    pub reference: Option<String>,
    pub supplier: String,
    pub items_summary: String,
    pub amount_ht_eur: Option<f64>,
    pub date: Option<String>,
    pub status: Option<String>,
    pub linked_stock_id: Option<String>,
    pub ordered_qty: Option<u32>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct UpdatePurchaseOrderStatusPayload {
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

fn build_stock_record(
    payload: CreateStockItemPayload,
    club_id: &str,
    seq: usize,
) -> StockItemRecord {
    let min_threshold = payload
        .min_threshold
        .unwrap_or_else(|| ((payload.current_qty as f64) * 0.3).round().max(5.0) as u32);
    let clean_barcode = payload
        .barcode
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    StockItemRecord {
        id: format!("stk-{}-{:03}", Utc::now().timestamp_millis(), seq),
        club_id: club_id.to_string(),
        name: payload.name.trim().to_string(),
        barcode: clean_barcode,
        category: payload
            .category
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("Badges & TPV")
            .to_string(),
        current_qty: payload.current_qty,
        min_threshold,
        unit: payload
            .unit
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("unités")
            .to_string(),
        supplier: payload
            .supplier
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("FitSupply Pro Lyon")
            .to_string(),
        unit_priceht: payload
            .unit_priceht
            .filter(|p| p.is_finite() && *p >= 0.0)
            .unwrap_or(0.0),
        auto_order_prepared: payload.current_qty < min_threshold,
    }
}

pub async fn get_stocks(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Vec<StockItemRecord>>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;

    let allowed = is_admin_employee(&db, &actor_id)
        || can_access_module_action(&db, &actor_id, Some(&site_id), "stocks", "view");
    if !allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : consultation des stocks non autorisée pour ce profil.",
        ));
    }

    let clubs = authorized_clubs_for_actor(&db, &actor_id);
    let visible: Vec<StockItemRecord> = db
        .stock_items
        .iter()
        .filter(|item| clubs.contains(&item.club_id))
        .cloned()
        .collect();
    Ok(Json(visible))
}

pub async fn post_stock_item(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<CreateStockItemPayload>,
) -> Result<(StatusCode, Json<StockItemRecord>), (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    if payload.name.trim().is_empty() {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Le nom du produit est obligatoire.",
        ));
    }
    let Some(club_id) = normalize_club_id(&payload.club_id) else {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            format!("Club inconnu pour cet article : {}", payload.club_id),
        ));
    };
    let target_site_id = club_to_site_id(club_id);
    let clubs = authorized_clubs_for_actor(&db, &actor_id);
    let can_edit = is_admin_employee(&db, &actor_id)
        || (clubs.contains(club_id)
            && can_access_module_action(&db, &actor_id, Some(target_site_id), "stocks", "edit"));
    if !can_edit {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : création d'article stock non autorisée sur ce club.",
        ));
    }

    let item = build_stock_record(payload, club_id, db.stock_items.len() + 1);
    let snapshot = db.clone();
    db.stock_items.insert(0, item.clone());
    append_audit(
        &mut db,
        &actor_id,
        "Stock & Achats (Création)",
        format!(
            "Ajout article {} ({} {}) sur {}",
            item.name, item.current_qty, item.unit, item.club_id
        ),
        target_site_id,
        &item.id,
        None,
        Some(item.current_qty.to_string()),
    );

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance ajout stock : {}", err_msg),
        ));
    }

    Ok((StatusCode::CREATED, Json(item)))
}

pub async fn post_stocks_import(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<BatchImportStocksPayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    if payload.rows.is_empty() {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Aucune ligne article à importer.",
        ));
    }
    if payload.rows.len() > 500 {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Import stock limité à 500 références maximum par lot.",
        ));
    }

    let is_global_admin = is_admin_employee(&db, &actor_id);
    let allowed_view = is_global_admin
        || can_access_module_action(&db, &actor_id, Some(&site_id), "stocks", "edit");
    if !allowed_view {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : import de stock réservé aux profils habilités.",
        ));
    }

    let clubs = authorized_clubs_for_actor(&db, &actor_id);
    let snapshot = db.clone();
    let mut created_items: Vec<StockItemRecord> = Vec::new();

    for (idx, row) in payload.rows.into_iter().enumerate() {
        if row.name.trim().is_empty() {
            continue;
        }
        let Some(club_id) = normalize_club_id(&row.club_id) else {
            continue;
        };
        let target_site = club_to_site_id(club_id);
        let can_club = is_global_admin
            || (clubs.contains(club_id)
                && can_access_module_action(&db, &actor_id, Some(target_site), "stocks", "edit"));
        if !can_club {
            continue;
        }
        let item = build_stock_record(row, club_id, db.stock_items.len() + idx + 1);
        created_items.push(item);
    }

    if created_items.is_empty() {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Aucune ligne valide et autorisée trouvée dans l'import CSV stock.",
        ));
    }

    for item in created_items.iter().rev() {
        db.stock_items.insert(0, item.clone());
    }

    let created_count = created_items.len();
    append_audit(
        &mut db,
        &actor_id,
        "Stock & Achats (Import CSV)",
        format!("Import CSV de {} référence(s) stock", created_count),
        "org",
        &format!("{} articles", created_count),
        None,
        None,
    );

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance import CSV stock : {}", err_msg),
        ));
    }

    Ok(Json(json!({
        "ok": true,
        "createdCount": created_count,
        "items": created_items,
    })))
}

pub async fn patch_stock_adjust(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(raw_item_id): Path<String>,
    Json(payload): Json<AdjustStockPayload>,
) -> Result<Json<StockItemRecord>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    let item_id = raw_item_id.trim().to_string();
    let Some(idx) = db.stock_items.iter().position(|s| s.id == item_id) else {
        return Err(err_resp(
            StatusCode::NOT_FOUND,
            format!("Article stock introuvable : {}", item_id),
        ));
    };

    let item_club = db.stock_items[idx].club_id.clone();
    let target_site_id = club_to_site_id(&item_club);
    let clubs = authorized_clubs_for_actor(&db, &actor_id);
    let can_edit = is_admin_employee(&db, &actor_id)
        || (clubs.contains(&item_club)
            && can_access_module_action(&db, &actor_id, Some(target_site_id), "stocks", "edit"));
    if !can_edit {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : ajustement de stock non autorisé sur ce club.",
        ));
    }

    let prev_qty = db.stock_items[idx].current_qty;
    let next_qty = if let Some(exact) = payload.set_qty {
        exact
    } else if let Some(delta) = payload.delta {
        let computed = (prev_qty as i64) + (delta as i64);
        computed.max(0) as u32
    } else {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Indiquez delta ou setQty pour ajuster le stock.",
        ));
    };

    let snapshot = db.clone();
    db.stock_items[idx].current_qty = next_qty;
    db.stock_items[idx].auto_order_prepared = next_qty < db.stock_items[idx].min_threshold;
    let updated = db.stock_items[idx].clone();

    append_audit(
        &mut db,
        &actor_id,
        "Stock & Achats (Mouvement)",
        format!("Stock {} : {} -> {}", updated.name, prev_qty, updated.current_qty),
        target_site_id,
        &updated.id,
        Some(prev_qty.to_string()),
        Some(updated.current_qty.to_string()),
    );

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance mouvement stock : {}", err_msg),
        ));
    }

    Ok(Json(updated))
}

pub async fn delete_stock_item(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(raw_item_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    let item_id = raw_item_id.trim().to_string();
    let Some(idx) = db.stock_items.iter().position(|s| s.id == item_id) else {
        return Err(err_resp(
            StatusCode::NOT_FOUND,
            format!("Article stock introuvable : {}", item_id),
        ));
    };

    let item_club = db.stock_items[idx].club_id.clone();
    let target_site_id = club_to_site_id(&item_club);
    let clubs = authorized_clubs_for_actor(&db, &actor_id);
    let can_edit = is_admin_employee(&db, &actor_id)
        || (clubs.contains(&item_club)
            && can_access_module_action(&db, &actor_id, Some(target_site_id), "stocks", "edit"));
    if !can_edit {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : suppression d'article non autorisée sur ce club.",
        ));
    }

    let snapshot = db.clone();
    let removed = db.stock_items.remove(idx);
    append_audit(
        &mut db,
        &actor_id,
        "Stock & Achats (Suppression)",
        format!("Suppression référence stock {}", removed.name),
        target_site_id,
        &removed.id,
        Some(removed.current_qty.to_string()),
        None,
    );

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance suppression stock : {}", err_msg),
        ));
    }

    Ok(Json(json!({ "ok": true, "deletedId": removed.id })))
}

pub async fn get_purchase_orders(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Vec<PurchaseOrderRecord>>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;

    let allowed = is_admin_employee(&db, &actor_id)
        || can_access_module_action(&db, &actor_id, Some(&site_id), "stocks", "view");
    if !allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : consultation des bons de commande non autorisée.",
        ));
    }

    let authorized = authorized_clubs_for_actor(&db, &actor_id);
    let orders: Vec<PurchaseOrderRecord> = db
        .purchase_orders
        .iter()
        .filter(|po| authorized.contains(&po.club_id))
        .cloned()
        .collect();
    Ok(Json(orders))
}

pub async fn post_purchase_order(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<CreatePurchaseOrderPayload>,
) -> Result<(StatusCode, Json<PurchaseOrderRecord>), (StatusCode, Json<Value>)> {
    let (actor_id, _site_id) = resolve_session_actor(&state, &headers).await?;
    if payload.items_summary.trim().is_empty() {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Le récapitulatif des articles du bon de commande est requis.",
        ));
    }
    let Some(club_id) = normalize_club_id(&payload.club_id) else {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Club invalide pour le bon de commande.",
        ));
    };

    let mut db = state.db.write().await;
    let authorized = authorized_clubs_for_actor(&db, &actor_id);
    if !authorized.contains(club_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : club hors de votre périmètre d'habilitation.",
        ));
    }
    let allowed = is_admin_employee(&db, &actor_id)
        || can_access_module_action(
            &db,
            &actor_id,
            Some(club_to_site_id(club_id)),
            "stocks",
            "edit",
        );
    if !allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : création de bon de commande non autorisée.",
        ));
    }

    let seq = db.purchase_orders.len() + 1;
    let status = match payload.status.as_deref().map(str::trim) {
        Some("Brouillon IA") | Some("Commande envoyée") | Some("Livré & Réceptionné") => {
            payload.status.unwrap().trim().to_string()
        }
        _ => "Commande envoyée".to_string(),
    };
    let po = PurchaseOrderRecord {
        id: format!("po-{}-{:03}", Utc::now().timestamp_millis(), seq),
        reference: payload
            .reference
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| format!("BC-{}-{:04}", Utc::now().format("%Y"), 410 + seq)),
        club_id: club_id.to_string(),
        supplier: if payload.supplier.trim().is_empty() {
            "FitSupply Pro Lyon".to_string()
        } else {
            payload.supplier.trim().to_string()
        },
        items_summary: payload.items_summary.trim().to_string(),
        amount_ht_eur: payload
            .amount_ht_eur
            .filter(|a| a.is_finite() && *a >= 0.0)
            .unwrap_or(0.0),
        date: payload
            .date
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| Utc::now().format("%Y-%m-%d").to_string()),
        status,
        linked_stock_id: payload
            .linked_stock_id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        ordered_qty: payload.ordered_qty,
    };

    let snapshot = db.clone();
    db.purchase_orders.insert(0, po.clone());

    append_audit(
        &mut db,
        &actor_id,
        "Stock & Achats (Bon de Commande)",
        format!(
            "Création bon de commande {} ({}) sur {}",
            po.reference, po.items_summary, club_id
        ),
        club_to_site_id(club_id),
        "purchase_orders",
        None,
        Some(po.reference.clone()),
    );

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance bon de commande : {}", err_msg),
        ));
    }

    Ok((StatusCode::CREATED, Json(po)))
}

pub async fn patch_purchase_order_status(
    State(state): State<SharedState>,
    Path(order_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<UpdatePurchaseOrderStatusPayload>,
) -> Result<Json<PurchaseOrderRecord>, (StatusCode, Json<Value>)> {
    let (actor_id, _site_id) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    let (idx, club_id) = {
        let pos = db
            .purchase_orders
            .iter()
            .position(|po| po.id == order_id)
            .ok_or_else(|| {
                err_resp(
                    StatusCode::NOT_FOUND,
                    format!("Bon de commande « {} » introuvable.", order_id),
                )
            })?;
        (pos, db.purchase_orders[pos].club_id.clone())
    };

    let authorized = authorized_clubs_for_actor(&db, &actor_id);
    if !authorized.contains(&club_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : club hors de votre périmètre d'habilitation.",
        ));
    }
    let allowed = is_admin_employee(&db, &actor_id)
        || can_access_module_action(
            &db,
            &actor_id,
            Some(club_to_site_id(&club_id)),
            "stocks",
            "edit",
        );
    if !allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : mise à jour de bon de commande non autorisée.",
        ));
    }

    let old_status = db.purchase_orders[idx].status.clone();
    let next_status = if payload.advance.unwrap_or(false) {
        match old_status.as_str() {
            "Brouillon IA" => "Commande envoyée".to_string(),
            _ => "Livré & Réceptionné".to_string(),
        }
    } else if let Some(explicit) = payload.status.as_deref().map(str::trim) {
        match explicit {
            "Brouillon IA" | "Commande envoyée" | "Livré & Réceptionné" => explicit.to_string(),
            _ => {
                return Err(err_resp(
                    StatusCode::BAD_REQUEST,
                    "Statut de commande invalide. Valeurs supportées : Brouillon IA, Commande envoyée, Livré & Réceptionné.",
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
    db.purchase_orders[idx].status = next_status.clone();

    // Si la commande passe au statut "Livré & Réceptionné", incrémenter automatiquement le stock lié
    if old_status != "Livré & Réceptionné" && next_status == "Livré & Réceptionné" {
        let linked_id = db.purchase_orders[idx].linked_stock_id.clone();
        let qty = db.purchase_orders[idx].ordered_qty.unwrap_or(0);
        if let (Some(stock_id), true) = (linked_id, qty > 0) {
            if let Some(item) = db
                .stock_items
                .iter_mut()
                .find(|s| s.id == stock_id && s.club_id == club_id)
            {
                item.current_qty = item.current_qty.saturating_add(qty);
                item.auto_order_prepared = item.current_qty < item.min_threshold;
            }
        }
    }

    let updated = db.purchase_orders[idx].clone();

    append_audit(
        &mut db,
        &actor_id,
        "Stock & Achats (Réception Commande)",
        format!(
            "Statut bon de commande {} : {} -> {}",
            updated.reference, old_status, updated.status
        ),
        club_to_site_id(&club_id),
        "purchase_orders",
        Some(old_status),
        Some(updated.status.clone()),
    );

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance statut bon de commande : {}", err_msg),
        ));
    }

    Ok(Json(updated))
}

pub async fn delete_purchase_order(
    State(state): State<SharedState>,
    Path(order_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, _site_id) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    let (idx, club_id) = {
        let pos = db
            .purchase_orders
            .iter()
            .position(|po| po.id == order_id)
            .ok_or_else(|| {
                err_resp(
                    StatusCode::NOT_FOUND,
                    format!("Bon de commande « {} » introuvable.", order_id),
                )
            })?;
        (pos, db.purchase_orders[pos].club_id.clone())
    };

    let authorized = authorized_clubs_for_actor(&db, &actor_id);
    if !authorized.contains(&club_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : club hors de votre périmètre d'habilitation.",
        ));
    }
    let allowed = is_admin_employee(&db, &actor_id)
        || can_access_module_action(
            &db,
            &actor_id,
            Some(club_to_site_id(&club_id)),
            "stocks",
            "edit",
        );
    if !allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : suppression de bon de commande non autorisée.",
        ));
    }

    let snapshot = db.clone();
    let removed = db.purchase_orders.remove(idx);

    append_audit(
        &mut db,
        &actor_id,
        "Stock & Achats (Suppression Commande)",
        format!("Suppression bon de commande {}", removed.reference),
        club_to_site_id(&club_id),
        "purchase_orders",
        Some(removed.reference.clone()),
        None,
    );

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance suppression bon de commande : {}", err_msg),
        ));
    }

    Ok(Json(json!({ "ok": true, "deletedId": removed.id })))
}

#[cfg(test)]
mod tests {
    use super::*;
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
            "cfos_stk_test_{}_{}",
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
            "stk-session-{}-{}",
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
    async fn stocks_crud_and_barcode_adjust_persist_to_disk() {
        let state = test_state();
        let headers = session_headers(&state, "emp-mario", "club-carre-soie").await;

        let (status, Json(created)) = post_stock_item(
            State(state.clone()),
            headers.clone(),
            Json(CreateStockItemPayload {
                club_id: "carre-de-soie".into(),
                name: "Boisson Protéinée Vanille".into(),
                barcode: Some("3760999888777".into()),
                category: Some("Nutrition / Bar".into()),
                current_qty: 12,
                min_threshold: Some(10),
                unit: Some("bouteilles".into()),
                supplier: Some("FitSupply Pro Lyon".into()),
                unit_priceht: Some(2.1),
            }),
        )
        .await
        .expect("création stock admin");
        assert_eq!(status, StatusCode::CREATED);
        assert!(!created.auto_order_prepared);

        let Json(adjusted) = patch_stock_adjust(
            State(state.clone()),
            headers.clone(),
            Path(created.id.clone()),
            Json(AdjustStockPayload {
                delta: Some(-5),
                set_qty: None,
            }),
        )
        .await
        .expect("mouvement stock");
        assert_eq!(adjusted.current_qty, 7);
        assert!(adjusted.auto_order_prepared);

        let reloaded = load_or_init_state(&state.data_dir);
        let persisted = reloaded
            .stock_items
            .iter()
            .find(|s| s.id == created.id)
            .unwrap();
        assert_eq!(persisted.current_qty, 7);

        let Json(del_res) = delete_stock_item(State(state.clone()), headers, Path(created.id))
            .await
            .expect("suppression stock");
        assert_eq!(del_res["ok"], true);
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[tokio::test]
    async fn stocks_batch_import_persists_valid_club_items() {
        let state = test_state();
        let headers = session_headers(&state, "emp-sarah", "club-carre-soie").await;
        let Json(res) = post_stocks_import(
            State(state.clone()),
            headers,
            Json(BatchImportStocksPayload {
                rows: vec![
                    CreateStockItemPayload {
                        club_id: "carre-de-soie".into(),
                        name: "Eau Minérale 50cl".into(),
                        barcode: None,
                        category: Some("Nutrition / Bar".into()),
                        current_qty: 100,
                        min_threshold: Some(24),
                        unit: None,
                        supplier: None,
                        unit_priceht: Some(0.35),
                    },
                    CreateStockItemPayload {
                        club_id: "beynost".into(),
                        name: "Article Hors Périmètre Sarah".into(),
                        barcode: None,
                        category: None,
                        current_qty: 10,
                        min_threshold: None,
                        unit: None,
                        supplier: None,
                        unit_priceht: None,
                    },
                ],
            }),
        )
        .await
        .expect("import stock partiel sur club autorisé");
        assert_eq!(res["createdCount"], 1);
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[tokio::test]
    async fn stocks_routes_enforce_rbac_and_club_isolation_403() {
        let state = test_state();
        let maxime_headers = session_headers(&state, "emp-maxime", "club-carre-soie").await;
        let (status, _) = get_stocks(State(state.clone()), maxime_headers)
            .await
            .unwrap_err();
        assert_eq!(status, StatusCode::FORBIDDEN);
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[tokio::test]
    async fn purchase_orders_crud_and_delivery_increments_linked_stock() {
        let state = test_state();
        let headers = session_headers(&state, "emp-admin", "club-beynost").await;

        // Initial stock "stk-1" on Beynost has current_qty = 4, min_threshold = 10
        // Initial purchase order "po-1" on Beynost is linked to "stk-1" with ordered_qty = 25 and status "Brouillon IA"
        let Json(step1) = patch_purchase_order_status(
            State(state.clone()),
            Path("po-1".into()),
            headers.clone(),
            Json(UpdatePurchaseOrderStatusPayload {
                advance: Some(true),
                status: None,
            }),
        )
        .await
        .expect("envoi commande po-1");
        assert_eq!(step1.status, "Commande envoyée");

        // Réceptionner la commande -> doit passer à "Livré & Réceptionné" et incrémenter stk-1 de +25 (4 -> 29)
        let Json(step2) = patch_purchase_order_status(
            State(state.clone()),
            Path("po-1".into()),
            headers,
            Json(UpdatePurchaseOrderStatusPayload {
                advance: Some(true),
                status: None,
            }),
        )
        .await
        .expect("réception commande po-1");
        assert_eq!(step2.status, "Livré & Réceptionné");

        let db = state.db.read().await;
        let stk1 = db.stock_items.iter().find(|s| s.id == "stk-1").unwrap();
        assert_eq!(stk1.current_qty, 29);
        assert!(!stk1.auto_order_prepared);
        drop(db);
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }
}
