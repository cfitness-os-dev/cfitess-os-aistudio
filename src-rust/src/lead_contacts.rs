//! Shared prospect writes only. No Heitz, provider, messaging or payment calls.
use crate::{models::{AppDatabaseState,LeadProspectRecord}, routes::{SharedState,resolve_session_actor,err_resp,append_audit,actor_has_lead_admin_write_on_club},seed::persist_state};
use axum::{extract::{State,Path},http::{HeaderMap,StatusCode},Json};
use chrono::{Utc,NaiveDate};
use serde::{Serialize,Deserialize};
use serde_json::{Value,json};
use sha2::{Digest,Sha256};
use std::collections::HashMap;
type Failure=(StatusCode,Json<Value>);
#[derive(Clone,Debug,Default,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Store {
    #[serde(default)] pub details:HashMap<String,Details>,
    #[serde(default)] pub receipts:HashMap<String,Receipt>,
}
#[derive(Clone,Debug,Default,Serialize,Deserialize)]
#[serde(rename_all="camelCase",default)]
pub struct Details { pub goal:String,pub notes:String,pub address:String,pub created_by:String }
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Receipt { pub fingerprint:String,pub prospect_id:String }
#[derive(Clone,Debug,Default,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields,default)]
pub struct Fields {
    pub club_id:Option<String>,pub first_name:Option<String>,pub last_name:Option<String>,
    pub phone:Option<String>,pub email:Option<String>,pub source:Option<String>,
    pub goal:Option<String>,pub notes:Option<String>,pub address:Option<String>,
    pub comment:Option<String>,pub gender:Option<String>,pub street:Option<String>,
    pub postal_code:Option<String>,pub city:Option<String>,pub birth_date:Option<String>,
    pub rgpd_consent:Option<bool>,pub stage:Option<String>,pub lead_status:Option<String>,
    pub segments:Option<Vec<String>>,
}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Command { pub operation_id:String,#[serde(default)] pub expected_revision:Option<String>,pub fields:Fields }
fn bad(message:&str)->Failure {err_resp(StatusCode::BAD_REQUEST,message)}
fn site(club:&str)->Option<&'static str> {match club {"beynost"=>Some("club-beynost"),"carre-de-soie"=>Some("club-carre-soie"),_=>None}}
fn write_scope(db:&AppDatabaseState,actor:&str,club:&str)->bool {
    let Some(site)=site(club) else{return false;};
    let Some(emp)=db.employees.iter().find(|e|e.id==actor && e.active) else{return false;};
    actor_has_lead_admin_write_on_club(db,actor,club) || emp.site_accesses.iter().any(|a|a.site_id==site && a.profile_id=="planificateur_standard")
}
pub fn can_edit(db:&AppDatabaseState,actor:&str,p:&LeadProspectRecord)->bool {
    write_scope(db,actor,&p.club_id) && (actor_has_lead_admin_write_on_club(db,actor,&p.club_id)
      || p.assigned_to_id.as_deref()==Some(actor)
      || db.lead_contacts.details.get(&p.id).is_some_and(|d|d.created_by==actor))
}
pub fn view(db:&AppDatabaseState,p:&LeadProspectRecord)->Value {
    let mut value=serde_json::to_value(p).expect("prospect serialization");
    let d=db.lead_contacts.details.get(&p.id);
    value["goal"]=json!(d.map(|d|d.goal.as_str()).unwrap_or(&p.comment));
    value["notes"]=json!(d.map(|d|d.notes.as_str()).unwrap_or(&p.comment));
    value["address"]=json!(d.map(|d|d.address.as_str()).unwrap_or(""));
    let revision=hex::encode(Sha256::digest(serde_json::to_vec(&value).expect("contact serialization")));
    value["revision"]=json!(revision);value
}
pub fn view_for(db:&AppDatabaseState,actor:&str,p:&LeadProspectRecord)->Value {
    let mut v=view(db,p);v["canEdit"]=json!(can_edit(db,actor,p));v
}
async fn actor(s:&SharedState,h:&HeaderMap)->Result<String,Failure> {
    if !h.get("authorization").and_then(|v|v.to_str().ok()).is_some_and(|v|v.starts_with("Bearer ")) {
      return Err(err_resp(StatusCode::UNAUTHORIZED,"Reconnectez-vous pour enregistrer un prospect."));
    }
    Ok(resolve_session_actor(s,h).await?.0)
}
fn operation(c:&Command)->Result<(),Failure> {
    if !(16..=100).contains(&c.operation_id.len()) || !c.operation_id.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'||b==b'_') {
      return Err(bad("Référence d’enregistrement invalide."));
    }
    if c.fields.first_name.as_ref().is_some_and(|v|v.trim().is_empty()) || c.fields.last_name.as_ref().is_some_and(|v|v.trim().is_empty()) {
      return Err(bad("Prénom et nom sont obligatoires."));
    }
    for (v,max) in [(&c.fields.first_name,100),(&c.fields.last_name,100),(&c.fields.phone,40),(&c.fields.email,254),(&c.fields.source,100),(&c.fields.goal,2000),(&c.fields.notes,10000),(&c.fields.comment,10000),(&c.fields.address,1000),(&c.fields.gender,50),(&c.fields.street,400),(&c.fields.postal_code,40),(&c.fields.city,120),(&c.fields.birth_date,10),(&c.fields.stage,80),(&c.fields.lead_status,80)] {
      if v.as_ref().is_some_and(|s|s.chars().count()>max || s.chars().any(|c|c.is_control() && c!='\n' && c!='\t')) {
        return Err(bad("Un champ est trop long ou contient des caractères non autorisés."));
      }
    }
    if c.fields.source.as_ref().is_some_and(|v|v.trim().is_empty()) {return Err(bad("La provenance ne peut pas être vide."));}
    if c.fields.birth_date.as_ref().is_some_and(|v|!v.is_empty() && NaiveDate::parse_from_str(v,"%Y-%m-%d").is_err()) {return Err(bad("Date de naissance invalide."));}
    if c.fields.segments.as_ref().is_some_and(|s|s.len()>50 || s.iter().any(|v|v.trim().is_empty()||v.chars().count()>100||v.chars().any(char::is_control))) {
      return Err(bad("Liste de segments invalide."));
    }
    Ok(())
}
fn phone(raw:&str)->Result<String,Failure> {
    let cleaned:String=raw.chars().filter(|c|!c.is_whitespace() && !matches!(c,'.'|'-'|'('|')')).collect();
    if cleaned.is_empty(){return Ok(cleaned);}
    let cleaned=if let Some(rest)=cleaned.strip_prefix("+33"){format!("0{rest}")}else{cleaned};
    let valid=(cleaned.len()==10 && cleaned.starts_with('0') && cleaned.as_bytes()[1]!=b'0' && cleaned.bytes().all(|b|b.is_ascii_digit()))
      || (cleaned.starts_with('+') && (10..=15).contains(&(cleaned.len()-1)) && cleaned[1..].bytes().all(|b|b.is_ascii_digit()));
    if !valid{return Err(bad("Numéro de téléphone invalide."));}Ok(cleaned)
}
fn validate_contact(p:&mut LeadProspectRecord)->Result<(),Failure> {
    if p.first_name.trim().is_empty()||p.last_name.trim().is_empty(){return Err(bad("Prénom et nom sont obligatoires."));}
    p.phone=phone(&p.phone)?;p.email=p.email.trim().to_lowercase();
    if !p.email.is_empty() && (p.email.matches('@').count()!=1||p.email.starts_with('@')||p.email.ends_with('@')||p.email.chars().any(|c|c.is_whitespace()||c.is_control()||matches!(c,'<'|'>'|';'|','))) {return Err(bad("Adresse e-mail invalide."));}
    if p.email.is_empty()&&p.phone.is_empty(){return Err(bad("Renseignez au moins un téléphone ou une adresse e-mail."));}
    Ok(())
}
fn fingerprint(kind:&str,target:&str,c:&Command)->String {hex::encode(Sha256::digest(serde_json::to_vec(&(kind,target,c)).expect("command serialization")))}
fn duplicate(db:&AppDatabaseState,p:&LeadProspectRecord)->bool {
    db.lead_prospects.iter().any(|r|r.id!=p.id && r.club_id==p.club_id &&
      ((!p.email.is_empty() && r.email.eq_ignore_ascii_case(&p.email)) || (!p.phone.is_empty() && phone(&r.phone).ok().as_deref()==Some(&p.phone))))
}
fn apply(p:&mut LeadProspectRecord,d:&mut Details,f:&Fields)->Result<(),Failure> {
    macro_rules! text {($field:ident)=>{if let Some(v)=&f.$field{p.$field=v.trim().into();}}}
    text!(first_name);text!(last_name);text!(email);text!(phone);text!(source);text!(comment);
    text!(gender);text!(street);text!(postal_code);text!(city);text!(birth_date);
    if let Some(v)=&f.goal{d.goal=v.trim().into();}
    if let Some(v)=&f.notes{d.notes=v.trim().into();}
    if let Some(v)=&f.address{d.address=v.trim().into();}
    if let Some(v)=f.rgpd_consent{p.rgpd_consent=v;}
    if let Some(v)=&f.segments{let mut values=v.clone();values.iter_mut().for_each(|s|*s=s.trim().into());values.sort();values.dedup();p.segments=values;}
    if let Some(stage)=f.stage.as_ref().or(f.lead_status.as_ref()) {
      if !matches!(stage.as_str(),"Nouveau"|"Contacté"|"Séance planifiée"|"Venu"|"Perdu") {return Err(bad("Cette étape ne peut pas être attribuée ici. L’adhésion est confirmée par Heitz."));}
      if f.stage.as_ref().zip(f.lead_status.as_ref()).is_some_and(|(a,b)|a!=b){return Err(bad("Les étapes demandées sont contradictoires."));}
      p.stage=stage.clone();p.lead_status=stage.clone();
    }
    validate_contact(p)
}
fn reply(db:&AppDatabaseState,actor:&str,c:&Command,p:&LeadProspectRecord,replayed:bool)->Json<Value> {
    Json(json!({"ok":true,"actorId":actor,"clubId":p.club_id,"operationId":c.operation_id,"replayed":replayed,"contact":view_for(db,actor,p)}))
}
pub async fn create(State(s):State<SharedState>,h:HeaderMap,Json(c):Json<Command>)->Result<Json<Value>,Failure> {
    let actor=actor(&s,&h).await?;operation(&c)?;
    let club=c.fields.club_id.as_deref().ok_or_else(||bad("Choisissez un club."))?;
    let mut db=s.db.write().await;
    if !write_scope(&db,&actor,club){return Err(err_resp(StatusCode::FORBIDDEN,"Vous ne pouvez pas créer de prospect dans ce club."));}
    let key=format!("{actor}:{}",c.operation_id);let hash=fingerprint("create","",&c);
    if let Some(receipt)=db.lead_contacts.receipts.get(&key) {
      if receipt.fingerprint!=hash{return Err(err_resp(StatusCode::CONFLICT,"Cet enregistrement a déjà été utilisé pour une autre saisie."));}
      let p=db.lead_prospects.iter().find(|p|p.id==receipt.prospect_id && p.club_id==club).ok_or_else(||err_resp(StatusCode::CONFLICT,"Ce contact a évolué. Actualisez la liste."))?;
      return Ok(reply(&db,&actor,&c,p,true));
    }
    if db.lead_contacts.receipts.len()>=100000||db.lead_prospects.len()>=10000{return Err(err_resp(StatusCode::CONFLICT,"La capacité de cet espace nécessite une intervention de la direction."));}
    let id=format!("pr-{}",hex::encode(rand::random::<[u8;16]>()));
    let mut p=LeadProspectRecord{id:id.clone(),gender:String::new(),first_name:String::new(),last_name:String::new(),email:String::new(),phone:String::new(),street:String::new(),postal_code:String::new(),city:String::new(),birth_date:String::new(),comment:String::new(),club_id:club.into(),source:"Saisie collaborateur".into(),stage:"Nouveau".into(),lead_status:"Nouveau".into(),rgpd_consent:false,segments:vec![],trial_date:None,assigned_to_id:Some(crate::routes::resolve_available_commercial_for_club(&db,club)),last_visit_at:None,days_without_visit:0,last_inbound_reply_at:None,archived_at:None,converted_offer:None,is_archived:false,archive_reason:None,client_scope:None,client_club_ids:vec![],has_active_vacation:false,last_commercial_touch_at:None,created_at:Utc::now().to_rfc3339()};
    let mut details=Details{created_by:actor.clone(),..Default::default()};apply(&mut p,&mut details,&c.fields)?;
    if duplicate(&db,&p){return Err(err_resp(StatusCode::CONFLICT,"Un contact avec ce téléphone ou cet e-mail existe déjà dans ce club. Ouvrez sa fiche."));}
    let mut next=db.clone();next.lead_prospects.insert(0,p.clone());next.lead_contacts.details.insert(id.clone(),details);
    next.lead_contacts.receipts.insert(key,Receipt{fingerprint:hash,prospect_id:id.clone()});
    append_audit(&mut next,&actor,"lead.contact.created","Prospect enregistré".into(),site(club).unwrap(),&id,None,Some("Nouveau".into()));
    persist_state(&s.data_dir,&next).map_err(|_|err_resp(StatusCode::INTERNAL_SERVER_ERROR,"Enregistrement non confirmé. Votre saisie est conservée."))?;
    *db=next;Ok(reply(&db,&actor,&c,&p,false))
}
pub async fn update(State(s):State<SharedState>,Path(id):Path<String>,h:HeaderMap,Json(c):Json<Command>)->Result<Json<Value>,Failure> {
    let actor=actor(&s,&h).await?;operation(&c)?;
    if c.fields.club_id.is_some(){return Err(bad("Utilisez le transfert dédié pour changer de club."));}
    let mut db=s.db.write().await;
    let index=db.lead_prospects.iter().position(|p|p.id==id).ok_or_else(||err_resp(StatusCode::NOT_FOUND,"Contact introuvable."))?;
    let current=&db.lead_prospects[index];
    if !can_edit(&db,&actor,current){return Err(err_resp(StatusCode::FORBIDDEN,"Vous ne pouvez pas modifier ce contact."));}
    let key=format!("{actor}:{}",c.operation_id);let hash=fingerprint("update",&id,&c);
    if let Some(receipt)=db.lead_contacts.receipts.get(&key) {
      if receipt.fingerprint!=hash{return Err(err_resp(StatusCode::CONFLICT,"Cette modification a déjà été utilisée pour une autre saisie."));}
      return Ok(reply(&db,&actor,&c,current,true));
    }
    if c.expected_revision.as_deref()!=view(&db,current)["revision"].as_str(){return Err(err_resp(StatusCode::CONFLICT,"Cette fiche a évolué. Actualisez-la avant d’enregistrer ; votre saisie est conservée."));}
    if db.lead_contacts.receipts.len()>=100000{return Err(err_resp(StatusCode::CONFLICT,"L’historique nécessite une intervention de la direction."));}
    if (current.converted_offer.is_some()||matches!(current.stage.as_str(),"Client"|"Client enseigne"|"Adhérent")) &&
       (c.fields.first_name.is_some()||c.fields.last_name.is_some()||c.fields.phone.is_some()||c.fields.email.is_some()||c.fields.stage.is_some()||c.fields.lead_status.is_some()) {
      return Err(err_resp(StatusCode::CONFLICT,"L’identité et l’adhésion de cet adhérent se vérifient dans Heitz."));
    }
    let mut p=current.clone();let mut details=db.lead_contacts.details.get(&id).cloned().unwrap_or_else(||Details{goal:p.comment.clone(),notes:p.comment.clone(),..Default::default()});
    apply(&mut p,&mut details,&c.fields)?;
    if duplicate(&db,&p){return Err(err_resp(StatusCode::CONFLICT,"Ce téléphone ou cet e-mail correspond déjà à un autre contact du club."));}
    let mut next=db.clone();next.lead_prospects[index]=p.clone();next.lead_contacts.details.insert(id.clone(),details);
    next.lead_contacts.receipts.insert(key,Receipt{fingerprint:hash,prospect_id:id.clone()});
    append_audit(&mut next,&actor,"lead.contact.updated","Fiche prospect modifiée".into(),site(&p.club_id).unwrap(),&id,None,Some(p.stage.clone()));
    persist_state(&s.data_dir,&next).map_err(|_|err_resp(StatusCode::INTERNAL_SERVER_ERROR,"Modification non confirmée. Votre saisie est conservée."))?;
    *db=next;Ok(reply(&db,&actor,&c,&p,false))
}
#[cfg(test)]
#[path="lead_contacts_tests.rs"]
mod tests;
