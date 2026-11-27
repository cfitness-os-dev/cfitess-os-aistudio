use super::*;
use crate::routes::SharedAppState;
use std::{sync::Arc,collections::HashMap};
use tokio::sync::RwLock;
fn state()->SharedState {
 let dir=std::env::temp_dir().join(format!("lead-contacts-{}",rand::random::<u128>()));
 Arc::new(SharedAppState{db:RwLock::new(crate::seed::load_or_init_state_with_mode(&dir,true)),data_dir:dir,sessions:RwLock::new(HashMap::new()),login_attempts:RwLock::new(HashMap::new())})
}
async fn headers(s:&SharedState,id:&str)->HeaderMap {
 let token=format!("{:032x}",rand::random::<u128>());s.sessions.write().await.insert(token.clone(),(id.into(),Utc::now().timestamp()+3600));
 let mut h=HeaderMap::new();h.insert("authorization",format!("Bearer {token}").parse().unwrap());h
}
fn command(op:&str)->Command {
 serde_json::from_value(json!({"operationId":op,"fields":{"clubId":"carre-de-soie","firstName":"Contact","lastName":"Fictif","phone":"0600000001","email":"contact-write@example.invalid","goal":"Objectif fictif","notes":"Note fictive","rgpdConsent":false}})).unwrap()
}
async fn send(s:&SharedState,h:&HeaderMap,c:Command)->Result<Json<Value>,Failure>{create(State(s.clone()),h.clone(),Json(c)).await}
fn patch(op:&str,revision:&str,fields:Value)->Command{serde_json::from_value(json!({"operationId":op,"expectedRevision":revision,"fields":fields})).unwrap()}
async fn edit(s:&SharedState,h:&HeaderMap,id:&str,c:Command)->Result<Json<Value>,Failure>{update(State(s.clone()),Path(id.into()),h.clone(),Json(c)).await}
fn finish(s:&SharedState){std::fs::remove_dir_all(&s.data_dir).unwrap();}
#[tokio::test]
async fn commercial_creation_and_owned_edit_are_persisted_with_distinct_goal_and_notes(){
 let s=state();let h=headers(&s,"emp-maxime").await;
 let v=send(&s,&h,command("contact-create-0001")).await.unwrap().0;
 assert_eq!(v["actorId"],"emp-maxime");assert_eq!(v["clubId"],"carre-de-soie");
 assert_eq!(v["contact"]["goal"],"Objectif fictif");assert_eq!(v["contact"]["notes"],"Note fictive");
 let id=v["contact"]["id"].as_str().unwrap();let revision=v["contact"]["revision"].as_str().unwrap();
 let edited=edit(&s,&h,id,patch("contact-update-0001",revision,json!({"notes":"Nouvelle note","stage":"Contacté","segments":["Relance","Relance"]}))).await.unwrap().0;
 assert_eq!(edited["contact"]["stage"],"Contacté");assert_eq!(edited["contact"]["segments"],json!(["Relance"]));
 let disk:AppDatabaseState=serde_json::from_slice(&std::fs::read(s.data_dir.join("cfitness_state.json")).unwrap()).unwrap();
 let p=disk.lead_prospects.iter().find(|p|p.id==id).unwrap();assert_eq!(p.stage,"Contacté");
 assert_eq!(disk.lead_contacts.details[id].notes,"Nouvelle note");assert_eq!(disk.lead_contacts.details[id].goal,"Objectif fictif");finish(&s);
}
#[tokio::test]
async fn bearer_club_active_profile_and_assignee_or_creator_are_required(){
 let s=state();let maxime=headers(&s,"emp-maxime").await;let chloe=headers(&s,"emp-chloe").await;
 assert_eq!(send(&s,&HeaderMap::new(),command("contact-create-0001")).await.unwrap_err().0,StatusCode::UNAUTHORIZED);
 assert_eq!(send(&s,&chloe,command("contact-create-0001")).await.unwrap_err().0,StatusCode::FORBIDDEN);
 let v=send(&s,&maxime,command("contact-create-0001")).await.unwrap().0;let id=v["contact"]["id"].as_str().unwrap();
 assert_eq!(edit(&s,&chloe,id,patch("contact-update-0001",v["contact"]["revision"].as_str().unwrap(),json!({"notes":"forbidden"}))).await.unwrap_err().0,StatusCode::FORBIDDEN);
 {let mut db=s.db.write().await;let e=db.employees.iter_mut().find(|e|e.id=="emp-maxime").unwrap();e.site_accesses.iter_mut().for_each(|a|a.profile_id="lecture_seule_avancee".into());}
 assert_eq!(send(&s,&maxime,command("contact-create-0002")).await.unwrap_err().0,StatusCode::FORBIDDEN);
 {s.db.write().await.employees.iter_mut().find(|e|e.id=="emp-mario").unwrap().active=false;}
 let admin=headers(&s,"emp-mario").await;assert_eq!(send(&s,&admin,command("contact-create-0003")).await.unwrap_err().0,StatusCode::FORBIDDEN);finish(&s);
}
#[tokio::test]
async fn duplicate_phone_and_email_reject_new_commands_without_mutation(){
 let s=state();let h=headers(&s,"emp-maxime").await;let _ = send(&s,&h,command("contact-create-0001")).await.unwrap();
 let before=serde_json::to_vec(&*s.db.read().await).unwrap();
 let mut same_phone=command("contact-create-0002");same_phone.fields.email=Some("other@example.invalid".into());same_phone.fields.phone=Some("+33 6 00 00 00 01".into());
 assert_eq!(send(&s,&h,same_phone).await.unwrap_err().0,StatusCode::CONFLICT);
 let mut same_email=command("contact-create-0003");same_email.fields.phone=Some("0600000002".into());same_email.fields.email=Some("CONTACT-WRITE@EXAMPLE.INVALID".into());
 assert_eq!(send(&s,&h,same_email).await.unwrap_err().0,StatusCode::CONFLICT);
 assert_eq!(before,serde_json::to_vec(&*s.db.read().await).unwrap());finish(&s);
}
#[tokio::test]
async fn operation_receipt_survives_restart_and_changed_replay_is_refused(){
 let s=state();let h=headers(&s,"emp-maxime").await;
 let first=send(&s,&h,command("contact-create-0001")).await.unwrap().0;
 let second=send(&s,&h,command("contact-create-0001")).await.unwrap().0;assert_eq!(first["contact"]["id"],second["contact"]["id"]);assert_eq!(second["replayed"],true);
 let restarted=Arc::new(SharedAppState{db:RwLock::new(crate::seed::load_or_init_state_with_mode(&s.data_dir,true)),data_dir:s.data_dir.clone(),sessions:RwLock::new(HashMap::new()),login_attempts:RwLock::new(HashMap::new())});
 let h2=headers(&restarted,"emp-maxime").await;let third=send(&restarted,&h2,command("contact-create-0001")).await.unwrap().0;
 assert_eq!(first["contact"]["id"],third["contact"]["id"]);assert_eq!(third["replayed"],true);
 let mut changed=command("contact-create-0001");changed.fields.last_name=Some("Changed".into());assert_eq!(send(&restarted,&h2,changed).await.unwrap_err().0,StatusCode::CONFLICT);finish(&s);
}
#[tokio::test]
async fn failed_persistence_keeps_memory_disk_receipts_and_retry_intact(){
 let s=state();let h=headers(&s,"emp-maxime").await;let path=s.data_dir.join("cfitness_state.json");let disk=std::fs::read(&path).unwrap();let memory=serde_json::to_vec(&*s.db.read().await).unwrap();
 let blocker=s.data_dir.join("cfitness_state.json.tmp");std::fs::create_dir(&blocker).unwrap();
 assert_eq!(send(&s,&h,command("contact-create-0001")).await.unwrap_err().0,StatusCode::INTERNAL_SERVER_ERROR);
 assert_eq!(disk,std::fs::read(&path).unwrap());assert_eq!(memory,serde_json::to_vec(&*s.db.read().await).unwrap());
 std::fs::remove_dir(&blocker).unwrap();let v=send(&s,&h,command("contact-create-0001")).await.unwrap().0;
 let revision=v["contact"]["revision"].as_str().unwrap();let id=v["contact"]["id"].as_str().unwrap();
 let before=serde_json::to_vec(&*s.db.read().await).unwrap();std::fs::create_dir(&blocker).unwrap();
 assert_eq!(edit(&s,&h,id,patch("contact-update-0001",revision,json!({"notes":"must not persist"}))).await.unwrap_err().0,StatusCode::INTERNAL_SERVER_ERROR);
 assert_eq!(before,serde_json::to_vec(&*s.db.read().await).unwrap());std::fs::remove_dir(&blocker).unwrap();finish(&s);
}
#[tokio::test]
async fn stale_revision_is_rejected_and_successful_update_replay_does_not_reapply(){
 let s=state();let h=headers(&s,"emp-maxime").await;let v=send(&s,&h,command("contact-create-0001")).await.unwrap().0;
 let id=v["contact"]["id"].as_str().unwrap();let revision=v["contact"]["revision"].as_str().unwrap();
 let cmd=patch("contact-update-0001",revision,json!({"notes":"first"}));let first=edit(&s,&h,id,cmd.clone()).await.unwrap().0;
 let again=edit(&s,&h,id,cmd).await.unwrap().0;assert_eq!(again["replayed"],true);assert_eq!(first["contact"]["revision"],again["contact"]["revision"]);
 assert_eq!(edit(&s,&h,id,patch("contact-update-0002",revision,json!({"notes":"overwrite"}))).await.unwrap_err().0,StatusCode::CONFLICT);
 assert_eq!(s.db.read().await.lead_contacts.details[id].notes,"first");finish(&s);
}
#[tokio::test]
async fn manual_heitz_conversion_and_implicit_transfer_are_refused(){
 let s=state();let h=headers(&s,"emp-maxime").await;let v=send(&s,&h,command("contact-create-0001")).await.unwrap().0;
 let id=v["contact"]["id"].as_str().unwrap();let revision=v["contact"]["revision"].as_str().unwrap();
 assert_eq!(edit(&s,&h,id,patch("contact-update-0001",revision,json!({"stage":"Adhérent"}))).await.unwrap_err().0,StatusCode::BAD_REQUEST);
 assert_eq!(edit(&s,&h,id,patch("contact-update-0002",revision,json!({"clubId":"beynost"}))).await.unwrap_err().0,StatusCode::BAD_REQUEST);finish(&s);
}
#[tokio::test]
async fn malformed_fields_are_refused_before_any_state_change(){
 let s=state();let h=headers(&s,"emp-maxime").await;
 for fields in [json!({"firstName":""}),json!({"phone":"bad","email":""}),json!({"phone":"","email":""}),json!({"email":"bad\r\ninjection@example.invalid"}),json!({"notes":"x".repeat(10001)}),json!({"birthDate":"2026-02-30"})] {
   let mut c=command("contact-create-0001");let mut value=serde_json::to_value(&c.fields).unwrap();for (k,v) in fields.as_object().unwrap(){value[k]=v.clone();}
   c.fields=serde_json::from_value(value).unwrap();assert_eq!(send(&s,&h,c).await.unwrap_err().0,StatusCode::BAD_REQUEST);
 }
 assert!(s.db.read().await.lead_contacts.receipts.is_empty());
 let mut raw=serde_json::to_value(command("contact-create-0001")).unwrap();raw["fields"]["assignedToId"]=json!("emp-mario");assert!(serde_json::from_value::<Command>(raw).is_err());finish(&s);
}

#[tokio::test]
async fn concurrent_identical_creation_returns_one_record_and_one_receipt(){
 let s=state();let h=headers(&s,"emp-maxime").await;
 let (a,b)=tokio::join!(send(&s,&h,command("concurrent-create-0001")),send(&s,&h,command("concurrent-create-0001")));
 let a=a.unwrap().0;let b=b.unwrap().0;assert_eq!(a["contact"]["id"],b["contact"]["id"]);
 assert_ne!(a["replayed"],b["replayed"]);assert_eq!(s.db.read().await.lead_contacts.receipts.len(),1);finish(&s);
}
#[tokio::test]
async fn concurrent_distinct_creation_of_same_identity_rejects_duplicate(){
 let s=state();let h=headers(&s,"emp-maxime").await;
 let (a,b)=tokio::join!(send(&s,&h,command("concurrent-create-0001")),send(&s,&h,command("concurrent-create-0002")));
 assert_eq!(usize::from(a.is_ok())+usize::from(b.is_ok()),1);
 let failure=if a.is_err(){a.unwrap_err()}else{b.unwrap_err()};assert_eq!(failure.0,StatusCode::CONFLICT);
 assert_eq!(s.db.read().await.lead_contacts.receipts.len(),1);finish(&s);
}
#[tokio::test]
async fn same_club_does_not_authorize_editing_a_colleagues_contact(){
 let s=state();let h=headers(&s,"emp-maxime").await;
 let v=send(&s,&h,command("contact-create-0001")).await.unwrap().0;
 {let mut db=s.db.write().await;let access=db.employees.iter().find(|e|e.id=="emp-maxime").unwrap().site_accesses.clone();let other=db.employees.iter_mut().find(|e|e.id=="emp-chloe").unwrap();other.site_accesses=access;}
 let other=headers(&s,"emp-chloe").await;
 let id=v["contact"]["id"].as_str().unwrap();let revision=v["contact"]["revision"].as_str().unwrap();
 assert_eq!(edit(&s,&other,id,patch("contact-update-0002",revision,json!({"notes":"forbidden"}))).await.unwrap_err().0,StatusCode::FORBIDDEN);finish(&s);
}
#[test]
fn details_deserialization_preserves_legacy_entries_without_new_fields(){
 let d:Details=serde_json::from_value(json!({"notes":"legacy note"})).unwrap();assert_eq!(d.notes,"legacy note");assert!(d.goal.is_empty());assert!(d.created_by.is_empty());
}

fn delegate(db:&mut AppDatabaseState,actor:&str,club:&str,actions:&[&str]){
 db.module_delegations.retain(|d|d.employee_id!=actor || !d.module.eq_ignore_ascii_case("lead"));
 db.module_delegations.push(crate::models::ModuleDelegation{employee_id:actor.into(),site_id:club.into(),module:"lead".into(),actions:actions.iter().map(|v|v.to_string()).collect()});
}
#[tokio::test]
async fn explicit_lead_write_allows_employee_contact_work_without_changing_rh_profile(){
 let s=state();let h=headers(&s,"emp-chloe").await;let mut cmd=command("delegation-create-001");cmd.fields.club_id=Some("beynost".into());
 s.db.write().await.module_delegations.retain(|d|d.employee_id!="emp-chloe" || d.module!="lead");
 assert_eq!(send(&s,&h,cmd.clone()).await.unwrap_err().0,StatusCode::FORBIDDEN);
 let before=serde_json::to_value(&s.db.read().await.employees.iter().find(|e|e.id=="emp-chloe").unwrap().site_accesses).unwrap();
 {delegate(&mut *s.db.write().await,"emp-chloe","club-beynost",&["write"]);}
 let created=send(&s,&h,cmd.clone()).await.unwrap().0;assert_eq!(created["contact"]["canEdit"],true);
 let id=created["contact"]["id"].as_str().unwrap();let rev=created["contact"]["revision"].as_str().unwrap();
 assert_eq!(edit(&s,&h,id,patch("delegation-update-001",rev,json!({"notes":"Shared delegated note"}))).await.unwrap().0["contact"]["notes"],"Shared delegated note");
 let db=s.db.read().await;let emp=db.employees.iter().find(|e|e.id=="emp-chloe").unwrap();
 assert_eq!(before,serde_json::to_value(&emp.site_accesses).unwrap());
 assert_eq!(emp.site_accesses[0].profile_id,"employe_standard");
 assert!(!crate::rbac::is_manager_employee(&db,"emp-chloe",Some("club-beynost")));
 assert!(!crate::hr_organisation::organisation_permission(&db,"emp-chloe","ORG04-31"));
 assert!(!crate::rbac::can_access_finances(&db,"emp-chloe",Some("club-beynost")));drop(db);finish(&s);
}
#[tokio::test]
async fn view_only_and_other_club_explicit_policies_override_legacy_profile(){
 let s=state();let h=headers(&s,"emp-maxime").await;
 for (club,actions) in [("carre-de-soie",vec!["view"]),("beynost",vec!["write"]),("carre-de-soie",Vec::new())]{
  delegate(&mut *s.db.write().await,"emp-maxime",club,&actions);
  assert_eq!(send(&s,&h,command("delegation-create-001")).await.unwrap_err().0,StatusCode::FORBIDDEN);
 }
 finish(&s);
}
#[tokio::test]
async fn create_and_update_are_independent_and_wildcard_is_scoped(){
 let s=state();let h=headers(&s,"emp-chloe").await;let mut cmd=command("delegation-create-001");cmd.fields.club_id=Some("beynost".into());
 delegate(&mut *s.db.write().await,"emp-chloe","beynost",&["create"]);
 let v=send(&s,&h,cmd.clone()).await.unwrap().0;assert_eq!(v["contact"]["canEdit"],false);
 let id=v["contact"]["id"].as_str().unwrap();let rev=v["contact"]["revision"].as_str().unwrap();
 assert_eq!(edit(&s,&h,id,patch("delegation-update-001",rev,json!({"notes":"Denied"}))).await.unwrap_err().0,StatusCode::FORBIDDEN);
 delegate(&mut *s.db.write().await,"emp-chloe","beynost",&["update"]);
 assert_eq!(send(&s,&h,cmd.clone()).await.unwrap_err().0,StatusCode::FORBIDDEN);
 assert!(edit(&s,&h,id,patch("delegation-update-001",rev,json!({"notes":"Allowed"}))).await.is_ok());
 delegate(&mut *s.db.write().await,"emp-chloe","beynost",&["*"]);
 let mut other=command("delegation-create-002");other.fields.club_id=Some("carre-de-soie".into());
 assert_eq!(send(&s,&h,other).await.unwrap_err().0,StatusCode::FORBIDDEN);finish(&s);
}
#[tokio::test]
async fn revoked_rights_reject_receipt_replay_and_workspace_edit_capability(){
 let s=state();let h=headers(&s,"emp-chloe").await;let mut cmd=command("delegation-create-001");cmd.fields.club_id=Some("beynost".into());
 delegate(&mut *s.db.write().await,"emp-chloe","beynost",&["write"]);
 let v=send(&s,&h,cmd.clone()).await.unwrap().0;let id=v["contact"]["id"].as_str().unwrap();let rev=v["contact"]["revision"].as_str().unwrap();
 let edit_cmd=patch("delegation-update-001",rev,json!({"notes":"Before revocation"}));
 let _=edit(&s,&h,id,edit_cmd.clone()).await.unwrap();
 delegate(&mut *s.db.write().await,"emp-chloe","beynost",&["view"]);
 let before=serde_json::to_vec(&*s.db.read().await).unwrap();
 assert_eq!(send(&s,&h,cmd).await.unwrap_err().0,StatusCode::FORBIDDEN);
 assert_eq!(edit(&s,&h,id,edit_cmd).await.unwrap_err().0,StatusCode::FORBIDDEN);
 let db=s.db.read().await;let p=db.lead_prospects.iter().find(|p|p.id==id).unwrap();assert_eq!(view_for(&db,"emp-chloe",p)["canEdit"],false);
 assert_eq!(before,serde_json::to_vec(&*db).unwrap());drop(db);finish(&s);
}
#[tokio::test]
async fn lead_delegation_does_not_override_contact_ownership_or_active_account(){
 let s=state();let h=headers(&s,"emp-maxime").await;let v=send(&s,&h,command("delegation-create-001")).await.unwrap().0;
 let id=v["contact"]["id"].as_str().unwrap();let rev=v["contact"]["revision"].as_str().unwrap();
 {let mut db=s.db.write().await;let access=db.employees.iter().find(|e|e.id=="emp-maxime").unwrap().site_accesses.clone();db.employees.iter_mut().find(|e|e.id=="emp-chloe").unwrap().site_accesses=access;delegate(&mut db,"emp-chloe","carre-de-soie",&["write"]);}
 let chloe=headers(&s,"emp-chloe").await;
 assert_eq!(edit(&s,&chloe,id,patch("delegation-update-001",rev,json!({"notes":"Forbidden colleague edit"}))).await.unwrap_err().0,StatusCode::FORBIDDEN);
 s.db.write().await.employees.iter_mut().find(|e|e.id=="emp-chloe").unwrap().active=false;
 assert_eq!(send(&s,&chloe,command("delegation-create-002")).await.unwrap_err().0,StatusCode::FORBIDDEN);finish(&s);
}

#[tokio::test]
async fn generic_edit_alias_is_supported_but_read_and_export_do_not_write(){
 let s=state();let h=headers(&s,"emp-chloe").await;let mut cmd=command("delegation-create-001");cmd.fields.club_id=Some("beynost".into());
 delegate(&mut *s.db.write().await,"emp-chloe","beynost",&["view","export"]);
 assert_eq!(send(&s,&h,cmd.clone()).await.unwrap_err().0,StatusCode::FORBIDDEN);
 delegate(&mut *s.db.write().await,"emp-chloe","beynost",&["edit"]);
 let v=send(&s,&h,cmd).await.unwrap().0;assert_eq!(v["contact"]["canEdit"],true);
 let id=v["contact"]["id"].as_str().unwrap();let rev=v["contact"]["revision"].as_str().unwrap();
 assert!(edit(&s,&h,id,patch("delegation-update-001",rev,json!({"notes":"Generic edit alias"}))).await.is_ok());finish(&s);
}
