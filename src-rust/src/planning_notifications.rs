//! Notifications for meaningful published planning changes, never draft-only edits.
use crate::models::{AppDatabaseState, Shift};
use axum::{http::StatusCode, Json};
use serde_json::{json, Value};
type Failure = (StatusCode, Json<Value>);
fn recipient(shift: &Shift) -> Option<(&str, &str)> {
    let club = match shift.site_id.as_str() {
        "club-beynost" => "beynost",
        "club-carre-soie" => "carre-de-soie",
        _ => return None,
    };
    shift
        .employee_id
        .as_deref()
        .map(|employee| (employee, club))
}
fn same_assignment(a: &Shift, b: &Shift) -> bool {
    a.employee_id == b.employee_id && a.site_id == b.site_id
}
fn content(s: &Shift) -> Value {
    json!([
        s.date,
        s.start_time,
        s.end_time,
        s.break_minutes,
        s.position_id,
        s.mission_label,
        s.tasks
    ])
}
pub fn changes(db: &mut AppDatabaseState, before: &[Shift]) -> Result<(), Failure> {
    let after = db.shifts.clone();
    for old in before.iter().filter(|s| s.published) {
        let current = after.iter().find(|s| s.id == old.id);
        if current.is_none_or(|s| !s.published || !same_assignment(old, s)) {
            if let Some((employee, club)) = recipient(old) {
                crate::rh_notifications::add(db,employee,club,&format!("planning-remove:{}:{:032x}",old.id,rand::random::<u128>()),"Un horaire a été retiré de votre planning",&format!("Le créneau du {} de {} à {} n’est plus publié dans votre planning. Consultez Mon planning pour la version actuelle.",old.date,old.start_time,old.end_time),"rh_planning","planning")?;
            }
        }
    }
    for new in after.iter().filter(|s| s.published) {
        let old = before.iter().find(|s| s.id == new.id);
        let fresh = old.is_none_or(|s| !s.published || !same_assignment(s, new));
        if fresh || old.is_some_and(|s| content(s) != content(new)) {
            if let Some((employee, club)) = recipient(new) {
                crate::rh_notifications::add(db,employee,club,&format!("planning-update:{}:{:032x}",new.id,rand::random::<u128>()),if fresh{"Un horaire vient d’être publié"}else{"Votre planning a été modifié"},&format!("Le créneau du {} de {} à {} est publié dans votre planning. Consultez Mon planning pour le détail et les pauses.",new.date,new.start_time,new.end_time),"rh_planning","planning")?;
            }
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn state() -> AppDatabaseState {
        let dir =
            std::env::temp_dir().join(format!("planning-notifications-{}", rand::random::<u128>()));
        let mut db = crate::seed::load_or_init_state_with_mode(&dir, true);
        db.shifts.clear();
        for id in ["emp-mario", "emp-chloe"] {
            let mut person = crate::personal_workspace::person(&db, id);
            person["notifications"] = json!([]);
            db.personal_workspace.people.insert(id.into(), person);
        }
        db
    }
    fn shift() -> Shift {
        Shift {
            id: "test-shift".into(),
            site_id: "club-beynost".into(),
            employee_id: Some("emp-chloe".into()),
            date: "2026-12-18".into(),
            start_time: "09:00".into(),
            end_time: "17:00".into(),
            break_minutes: 30,
            position_id: "pos".into(),
            tasks: vec!["PRIVATE TASK".into()],
            mission_label: Some("PRIVATE MISSION".into()),
            lock_state: "none".into(),
            published: false,
        }
    }
    fn count(db: &AppDatabaseState, id: &str) -> usize {
        db.personal_workspace.people[id]["notifications"]
            .as_array()
            .unwrap()
            .len()
    }
    #[test]
    fn drafts_and_locks_do_not_emit_but_publish_and_edits_do() {
        let mut db = state();
        let s = shift();
        db.shifts.push(s.clone());
        changes(&mut db, &[]).unwrap();
        assert_eq!(count(&db, "emp-chloe"), 0);
        let before = db.shifts.clone();
        db.shifts[0].tasks.push("new draft task".into());
        changes(&mut db, &before).unwrap();
        assert_eq!(count(&db, "emp-chloe"), 0);
        let before = db.shifts.clone();
        db.shifts[0].published = true;
        changes(&mut db, &before).unwrap();
        assert_eq!(count(&db, "emp-chloe"), 1);
        let before = db.shifts.clone();
        db.shifts[0].lock_state = "locked".into();
        changes(&mut db, &before).unwrap();
        assert_eq!(count(&db, "emp-chloe"), 1);
        let before = db.shifts.clone();
        db.shifts[0].end_time = "18:00".into();
        changes(&mut db, &before).unwrap();
        assert_eq!(count(&db, "emp-chloe"), 2);
        let before = db.shifts.clone();
        changes(&mut db, &before).unwrap();
        assert_eq!(count(&db, "emp-chloe"), 2);
        assert!(!serde_json::to_string(
            &db.personal_workspace.people["emp-chloe"]["notifications"]
        )
        .unwrap()
        .contains("PRIVATE"));
    }
    #[test]
    fn reassignment_unpublishing_and_delete_notify_only_affected_owners() {
        let mut db = state();
        let mut s = shift();
        s.published = true;
        db.shifts.push(s);
        let before = db.shifts.clone();
        db.shifts[0].employee_id = Some("emp-mario".into());
        changes(&mut db, &before).unwrap();
        assert_eq!(count(&db, "emp-chloe"), 1);
        assert_eq!(count(&db, "emp-mario"), 1);
        let before = db.shifts.clone();
        db.shifts[0].published = false;
        changes(&mut db, &before).unwrap();
        assert_eq!(count(&db, "emp-mario"), 2);
        let before = db.shifts.clone();
        db.shifts.clear();
        changes(&mut db, &before).unwrap();
        assert_eq!(count(&db, "emp-mario"), 2);
        let mut s = shift();
        s.published = true;
        db.shifts.push(s);
        let before = db.shifts.clone();
        db.shifts.clear();
        changes(&mut db, &before).unwrap();
        assert_eq!(count(&db, "emp-chloe"), 2);
    }
    #[test]
    fn repeated_publish_cycles_are_distinct_events_but_unassigned_slots_are_silent() {
        let mut db = state();
        let mut s = shift();
        s.published = true;
        s.employee_id = None;
        db.shifts.push(s);
        changes(&mut db, &[]).unwrap();
        assert_eq!(count(&db, "emp-chloe"), 0);
        db.shifts[0].employee_id = Some("emp-chloe".into());
        for _ in 0..2 {
            let before = db.shifts.clone();
            db.shifts[0].published = false;
            changes(&mut db, &before).unwrap();
            let before = db.shifts.clone();
            db.shifts[0].published = true;
            changes(&mut db, &before).unwrap();
        }
        assert_eq!(count(&db, "emp-chloe"), 4);
    }
}
