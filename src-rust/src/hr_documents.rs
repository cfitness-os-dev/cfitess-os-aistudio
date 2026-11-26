//! Private employee files. Metadata in state; bytes outside the public frontend.
use crate::{
    models::AppDatabaseState,
    rbac::{can_access_site_scope, evaluate_permission, PermissionTarget},
    routes::{append_audit, err_resp, resolve_session_actor, SharedState},
    seed::persist_state,
};
use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::{Cursor, Read, Write};
pub const MAX_BYTES: usize = 4 * 1024 * 1024;
pub const CATEGORIES: [&str; 6] = [
    "Contrats",
    "Sécu soc et Mutuelle",
    "Justificatifs",
    "Fiches de paie",
    "Feuilles d’heures",
    "Autre",
];
type Failure = (StatusCode, Json<Value>);
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Store {
    #[serde(default)]
    pub files: Vec<Document>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: String,
    pub employee_id: String,
    pub club_id: String,
    pub actor_id: String,
    pub operation_id: String,
    pub fingerprint: String,
    pub title: String,
    pub category: String,
    pub file_name: String,
    pub media_type: String,
    pub byte_length: usize,
    pub sha256: String,
    pub created_at: String,
    pub acknowledged_at: Option<String>,
    pub archived_at: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Upload {
    pub employee_id: String,
    pub operation_id: String,
    pub title: String,
    pub category: String,
    pub file_name: String,
    pub media_type: String,
    pub base64: String,
}
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Page {
    pub before: Option<String>,
    #[serde(default)]
    pub include_archived: bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Acknowledge {
    pub consent: bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Archive {
    pub archived: bool,
}
fn bad(text: &str) -> Failure {
    err_resp(StatusCode::BAD_REQUEST, text)
}
fn site(club: &str) -> Result<&'static str, Failure> {
    match club {
        "beynost" => Ok("club-beynost"),
        "carre-de-soie" => Ok("club-carre-soie"),
        _ => Err(bad("Club inconnu.")),
    }
}
async fn actor(state: &SharedState, h: &HeaderMap) -> Result<String, Failure> {
    if !h
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("Bearer "))
    {
        return Err(err_resp(
            StatusCode::UNAUTHORIZED,
            "Connectez-vous pour consulter les documents.",
        ));
    }
    Ok(resolve_session_actor(state, h).await?.0)
}
fn check(db: &AppDatabaseState, actor: &str, club: &str) -> Result<(), Failure> {
    if !can_access_site_scope(db, actor, site(club)?) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Documents non autorisés dans ce club.",
        ));
    }
    Ok(())
}
fn permission(db: &AppDatabaseState, actor: &str, club: &str, target: &str, action: &str) -> bool {
    let Ok(site) = site(club) else { return false };
    let Some(e) = db.employees.iter().find(|e| e.id == target) else {
        return false;
    };
    let Some(access) = e.site_accesses.iter().find(|a| a.site_id == site) else {
        return false;
    };
    evaluate_permission(
        db,
        actor,
        site,
        action,
        Some(PermissionTarget {
            site_id: Some(site),
            target_employee_id: Some(target),
            target_team_ids: &access.team_ids,
            lock_state: None,
        }),
    )
    .allowed
}
fn manage(db: &AppDatabaseState, actor: &str, club: &str, target: &str) -> bool {
    permission(db, actor, club, target, "ORG04-14")
}
fn upload_allowed(db: &AppDatabaseState, actor: &str, club: &str, target: &str) -> bool {
    db.employees.iter().any(|e| e.id == target && e.active)
        && (manage(db, actor, club, target)
            || (actor == target && permission(db, actor, club, target, "ORG04-21")))
}
fn employee_name(db: &AppDatabaseState, id: &str) -> String {
    db.employees
        .iter()
        .find(|e| e.id == id)
        .map(|e| format!("{} {}", e.first_name, e.last_name))
        .unwrap_or_else(|| "Collaborateur".into())
}
fn view(
    db: &AppDatabaseState,
    actor: &str,
    club: &str,
    own: bool,
    page: &Page,
) -> Result<Value, Failure> {
    check(db, actor, club)?;
    let targets: Vec<_> = db
        .employees
        .iter()
        .filter(|e| {
            if own {
                e.id == actor
            } else {
                manage(db, actor, club, &e.id)
            }
        })
        .collect();
    if !own && targets.is_empty() {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Vous n’avez pas accès aux documents des équipes dans ce club.",
        ));
    }
    let all: Vec<_> = db
        .personal_workspace
        .documents
        .files
        .iter()
        .rev()
        .filter(|d| {
            d.club_id == club
                && (if own {
                    d.employee_id == actor && d.archived_at.is_none()
                } else {
                    manage(db, actor, club, &d.employee_id)
                        && (page.include_archived || d.archived_at.is_none())
                })
        })
        .collect();
    let start = match page.before.as_deref() {
        None => 0,
        Some(id) => all
            .iter()
            .position(|d| d.id == id)
            .map(|i| i + 1)
            .ok_or_else(|| {
                bad("Cette page n’est plus disponible. Revenez aux documents récents.")
            })?,
    };
    let selected: Vec<_> = all.iter().skip(start).take(50).collect();
    let next = if start + selected.len() < all.len() {
        selected.last().map(|d| d.id.clone())
    } else {
        None
    };
    let files:Vec<_>=selected.iter().map(|d|json!({"id":d.id,"employeeId":d.employee_id,"employeeName":employee_name(db,&d.employee_id),
        "title":d.title,"category":d.category,"fileName":d.file_name,"mediaType":d.media_type,"byteLength":d.byte_length,
        "createdAt":d.created_at,"acknowledgedAt":d.acknowledged_at,"archivedAt":d.archived_at})).collect();
    let recipients:Vec<_>=targets.iter().map(|e|json!({"id":e.id,"name":employee_name(db,&e.id),"canUpload":upload_allowed(db,actor,club,&e.id)})).collect();
    Ok(
        json!({"actorId":actor,"clubId":club,"own":own,"employees":recipients,"documents":files,"nextCursor":next,
        "canUpload":upload_allowed(db,actor,club,actor),"maxBytes":MAX_BYTES,"categories":CATEGORIES}),
    )
}
pub async fn own(
    State(s): State<SharedState>,
    Path(club): Path<String>,
    Query(page): Query<Page>,
    h: HeaderMap,
) -> Result<Json<Value>, Failure> {
    let actor = actor(&s, &h).await?;
    Ok(Json(view(&*s.db.read().await, &actor, &club, true, &page)?))
}
pub async fn workspace(
    State(s): State<SharedState>,
    Path(club): Path<String>,
    Query(page): Query<Page>,
    h: HeaderMap,
) -> Result<Json<Value>, Failure> {
    let actor = actor(&s, &h).await?;
    Ok(Json(view(
        &*s.db.read().await,
        &actor,
        &club,
        false,
        &page,
    )?))
}
fn validate(c: &Upload) -> Result<Vec<u8>, Failure> {
    if c.title.trim().is_empty()
        || c.title.chars().count() > 160
        || c.title.chars().any(char::is_control)
        || !CATEGORIES.contains(&c.category.as_str())
        || c.file_name.trim().is_empty()
        || c.file_name.chars().count() > 180
        || c.file_name
            .chars()
            .any(|v| v.is_control() || matches!(v, '/' | '\\'))
        || !(16..=80).contains(&c.operation_id.len())
        || !c
            .operation_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err(bad(
            "Renseignez un titre, un dossier et un nom de fichier valides.",
        ));
    }
    if c.base64.len() > MAX_BYTES.div_ceil(3) * 4 {
        return Err(bad("Le fichier dépasse la limite de 4 Mo."));
    }
    let bytes = STANDARD
        .decode(&c.base64)
        .map_err(|_| bad("Le fichier n’a pas pu être lu."))?;
    if bytes.is_empty() || bytes.len() > MAX_BYTES {
        return Err(bad("Le fichier doit contenir entre 1 octet et 4 Mo."));
    }
    let lower = c.file_name.to_lowercase();
    match c.media_type.as_str() {
        "application/pdf" if lower.ends_with(".pdf") => {
            if !bytes.starts_with(b"%PDF-")
                || !bytes.windows(5).rev().take(1024).any(|w| w == b"%%EOF")
            {
                return Err(bad("Le contenu ne correspond pas à un fichier PDF."));
            }
        }
        "image/png" | "image/jpeg" => {
            let expected = if c.media_type == "image/png" {
                image::ImageFormat::Png
            } else {
                image::ImageFormat::Jpeg
            };
            if !(if expected == image::ImageFormat::Png {
                lower.ends_with(".png")
            } else {
                lower.ends_with(".jpg") || lower.ends_with(".jpeg")
            }) {
                return Err(bad("L’extension du fichier ne correspond pas à son type."));
            }
            let mut reader = image::ImageReader::new(Cursor::new(&bytes))
                .with_guessed_format()
                .map_err(|_| bad("Image illisible."))?;
            if reader.format() != Some(expected) {
                return Err(bad("Le contenu ne correspond pas au type d’image."));
            }
            let mut limits = image::Limits::default();
            limits.max_image_width = Some(4096);
            limits.max_image_height = Some(4096);
            limits.max_alloc = Some(32 * 1024 * 1024);
            reader.limits(limits);
            reader
                .decode()
                .map_err(|_| bad("Image illisible ou trop grande (4096 pixels maximum)."))?;
        }
        _ => return Err(bad("Formats acceptés : PDF, PNG et JPEG.")),
    }
    Ok(bytes)
}
fn bytes_path(s: &SharedState, id: &str) -> std::path::PathBuf {
    s.data_dir.join("rh-documents").join(id)
}
fn save(s: &SharedState, db: &AppDatabaseState) -> Result<(), Failure> {
    persist_state(&s.data_dir, db).map_err(|_| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Document non enregistré. Aucun changement confirmé.",
        )
    })
}
pub async fn upload(
    State(s): State<SharedState>,
    Path(club): Path<String>,
    h: HeaderMap,
    Json(c): Json<Upload>,
) -> Result<Json<Value>, Failure> {
    let actor = actor(&s, &h).await?;
    let mut stored = s.db.write().await;
    check(&stored, &actor, &club)?;
    if !upload_allowed(&stored, &actor, &club, &c.employee_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Import non autorisé pour ce collaborateur dans ce club.",
        ));
    }
    let bytes = validate(&c)?;
    let digest = hex::encode(Sha256::digest(&bytes));
    let fingerprint = hex::encode(Sha256::digest(
        serde_json::to_vec(&(
            &c.employee_id,
            c.title.trim(),
            &c.category,
            &c.file_name,
            &c.media_type,
            &digest,
        ))
        .unwrap(),
    ));
    if let Some(previous) = stored
        .personal_workspace
        .documents
        .files
        .iter()
        .find(|d| d.actor_id == actor && d.club_id == club && d.operation_id == c.operation_id)
    {
        if previous.fingerprint != fingerprint {
            return Err(err_resp(
                StatusCode::CONFLICT,
                "Cet import a déjà été utilisé avec un autre document.",
            ));
        }
        return Ok(Json(
            json!({"actorId":actor,"clubId":club,"documentId":previous.id}),
        ));
    }
    if stored
        .personal_workspace
        .documents
        .files
        .iter()
        .filter(|d| d.club_id == club)
        .fold(0usize, |total, d| total.saturating_add(d.byte_length))
        .saturating_add(bytes.len())
        > 200 * 1024 * 1024
    {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "L’espace documentaire de ce club a atteint sa limite. Contactez la direction.",
        ));
    }
    let id = format!("rh-doc-{:032x}", rand::random::<u128>());
    let mut next = stored.clone();
    let now = Utc::now().to_rfc3339();
    next.personal_workspace.documents.files.push(Document {
        id: id.clone(),
        employee_id: c.employee_id.clone(),
        club_id: club.clone(),
        actor_id: actor.clone(),
        operation_id: c.operation_id,
        fingerprint,
        title: c.title.trim().into(),
        category: c.category,
        file_name: c.file_name,
        media_type: c.media_type,
        byte_length: bytes.len(),
        sha256: digest,
        created_at: now,
        acknowledged_at: None,
        archived_at: None,
    });
    crate::rh_notifications::add(
        &mut next,
        &c.employee_id,
        &club,
        &format!("document-published:{id}"),
        "Document disponible",
        "Un document a été ajouté à votre espace personnel.",
        "rh_document",
        "documents",
    )?;
    if actor == c.employee_id {
        let managers: Vec<_> = next
            .employees
            .iter()
            .filter(|e| e.id != actor && manage(&next, &e.id, &club, &c.employee_id))
            .map(|e| e.id.clone())
            .collect();
        for manager in managers {
            crate::rh_notifications::add(
                &mut next,
                &manager,
                &club,
                &format!("document-deposited:{id}"),
                "Document à consulter",
                "Un collaborateur a ajouté un document dans son dossier RH.",
                "rh_document",
                "team-documents",
            )?;
        }
    }
    append_audit(
        &mut next,
        &actor,
        "RH_DOCUMENT_UPLOADED",
        format!("Document ajouté : {id}"),
        site(&club)?,
        "MC06",
        None,
        None,
    );
    let folder = s.data_dir.join("rh-documents");
    std::fs::create_dir_all(&folder).map_err(|_| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Stockage documentaire indisponible.",
        )
    })?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&folder, std::fs::Permissions::from_mode(0o700)).map_err(
            |_| {
                err_resp(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Protection du stockage indisponible.",
                )
            },
        )?;
    }
    let path = bytes_path(&s, &id);
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&path).map_err(|_| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Le fichier n’a pas été enregistré.",
        )
    })?;
    if file
        .write_all(&bytes)
        .and_then(|_| file.sync_all())
        .is_err()
    {
        drop(file);
        let _ = std::fs::remove_file(&path);
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Le fichier n’a pas été enregistré.",
        ));
    }
    drop(file);
    if let Err(error) = save(&s, &next) {
        let _ = std::fs::remove_file(&path);
        return Err(error);
    }
    *stored = next;
    Ok(Json(json!({"actorId":actor,"clubId":club,"documentId":id})))
}
pub async fn download(
    State(s): State<SharedState>,
    Path((club, id)): Path<(String, String)>,
    h: HeaderMap,
) -> Result<Response, Failure> {
    let actor = actor(&s, &h).await?;
    let db = s.db.read().await;
    check(&db, &actor, &club)?;
    let d = db
        .personal_workspace
        .documents
        .files
        .iter()
        .find(|d| {
            d.id == id
                && d.club_id == club
                && (manage(&db, &actor, &club, &d.employee_id)
                    || (d.employee_id == actor && d.archived_at.is_none()))
        })
        .ok_or_else(|| {
            err_resp(
                StatusCode::NOT_FOUND,
                "Document introuvable dans votre périmètre.",
            )
        })?;
    let file = std::fs::File::open(bytes_path(&s, &d.id)).map_err(|_| {
        err_resp(
            StatusCode::SERVICE_UNAVAILABLE,
            "Le fichier n’est pas disponible. Contactez votre responsable.",
        )
    })?;
    let mut bytes = Vec::with_capacity(d.byte_length.min(MAX_BYTES));
    file.take((MAX_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| {
            err_resp(
                StatusCode::SERVICE_UNAVAILABLE,
                "Le fichier ne peut pas être lu.",
            )
        })?;
    if bytes.len() != d.byte_length || hex::encode(Sha256::digest(&bytes)) != d.sha256 {
        return Err(err_resp(
            StatusCode::SERVICE_UNAVAILABLE,
            "Le fichier nécessite une vérification.",
        ));
    }
    Ok((
        [
            ("content-type", d.media_type.as_str()),
            ("content-disposition", "attachment; filename=document-rh"),
            ("cache-control", "private, no-store"),
            ("x-content-type-options", "nosniff"),
            ("referrer-policy", "no-referrer"),
        ],
        bytes,
    )
        .into_response())
}
pub async fn acknowledge(
    State(s): State<SharedState>,
    Path((club, id)): Path<(String, String)>,
    h: HeaderMap,
    Json(c): Json<Acknowledge>,
) -> Result<Json<Value>, Failure> {
    let actor = actor(&s, &h).await?;
    let mut stored = s.db.write().await;
    check(&stored, &actor, &club)?;
    if !c.consent {
        return Err(bad("Confirmez avoir pris connaissance du document."));
    }
    let mut next = stored.clone();
    let d = next
        .personal_workspace
        .documents
        .files
        .iter_mut()
        .find(|d| {
            d.id == id && d.club_id == club && d.employee_id == actor && d.archived_at.is_none()
        })
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Document personnel introuvable."))?;
    if d.acknowledged_at.is_none() {
        d.acknowledged_at = Some(Utc::now().to_rfc3339());
        let author = d.actor_id.clone();
        if author != actor && manage(&next, &author, &club, &actor) {
            crate::rh_notifications::add(
                &mut next,
                &author,
                &club,
                &format!("document-ack:{id}"),
                "Document consulté",
                "Un collaborateur a confirmé avoir pris connaissance d’un document.",
                "rh_document",
                "team-documents",
            )?;
        }
        append_audit(
            &mut next,
            &actor,
            "RH_DOCUMENT_ACKNOWLEDGED",
            format!("Prise de connaissance déclarée : {id} ; aucune signature contractuelle."),
            site(&club)?,
            "MC06",
            None,
            None,
        );
        save(&s, &next)?;
        *stored = next;
    }
    Ok(Json(view(&stored, &actor, &club, true, &Page::default())?))
}
pub async fn archive(
    State(s): State<SharedState>,
    Path((club, id)): Path<(String, String)>,
    h: HeaderMap,
    Json(c): Json<Archive>,
) -> Result<Json<Value>, Failure> {
    let actor = actor(&s, &h).await?;
    let mut stored = s.db.write().await;
    check(&stored, &actor, &club)?;
    let d = stored
        .personal_workspace
        .documents
        .files
        .iter()
        .find(|d| d.id == id && d.club_id == club && manage(&stored, &actor, &club, &d.employee_id))
        .ok_or_else(|| {
            err_resp(
                StatusCode::NOT_FOUND,
                "Document introuvable dans votre périmètre.",
            )
        })?;
    if d.archived_at.is_some() != c.archived {
        let mut next = stored.clone();
        next.personal_workspace
            .documents
            .files
            .iter_mut()
            .find(|d| d.id == id)
            .unwrap()
            .archived_at = if c.archived {
            Some(Utc::now().to_rfc3339())
        } else {
            None
        };
        append_audit(
            &mut next,
            &actor,
            if c.archived {
                "RH_DOCUMENT_ARCHIVED"
            } else {
                "RH_DOCUMENT_RESTORED"
            },
            format!("Archivage du document {id} : {}", c.archived),
            site(&club)?,
            "MC06",
            None,
            None,
        );
        save(&s, &next)?;
        *stored = next;
    }
    Ok(Json(view(
        &stored,
        &actor,
        &club,
        false,
        &Page {
            include_archived: true,
            ..Page::default()
        },
    )?))
}
#[cfg(test)]
#[path = "hr_documents_tests.rs"]
mod tests;
