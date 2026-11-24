//! Scenario message timing only. No provider, public-holiday or legal-send policy.
use super::*;
use chrono::{Datelike, LocalResult, NaiveTime, TimeZone, Timelike};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MessageWindow {
    pub timezone: String,
    pub weekdays: Vec<u8>,
    pub start_time: String,
    pub end_time: String,
}

fn minutes(value: &str) -> Option<u32> {
    if value.len() != 5 || value.as_bytes()[2] != b':' {
        return None;
    }
    let t = NaiveTime::parse_from_str(value, "%H:%M").ok()?;
    if t.format("%H:%M").to_string() != value {
        return None;
    }
    Some(t.hour() * 60 + t.minute())
}
pub fn valid(window: &MessageWindow) -> bool {
    window.timezone == "Europe/Paris"
        && !window.weekdays.is_empty()
        && window.weekdays.len() <= 7
        && window.weekdays.iter().all(|d| (1..=7).contains(d))
        && window.weekdays.iter().collect::<HashSet<_>>().len() == window.weekdays.len()
        && matches!((minutes(&window.start_time),minutes(&window.end_time)),(Some(start),Some(end)) if start<end)
}

/// Opening inclusive, closing exclusive. DST follows the actual Paris wall clock.
pub fn next_allowed(window: &MessageWindow, now: DateTime<Utc>) -> Result<DateTime<Utc>, String> {
    if !valid(window) {
        return Err(
            "Jours ou horaires restaurés invalides : parcours arrêté pour vérification.".into(),
        );
    }
    let paris = chrono_tz::Europe::Paris;
    let local = now.with_timezone(&paris);
    let start = minutes(&window.start_time).unwrap();
    let end = minutes(&window.end_time).unwrap();
    let minute = local.hour() * 60 + local.minute();
    if window
        .weekdays
        .contains(&(local.weekday().number_from_monday() as u8))
        && minute >= start
        && minute < end
    {
        return Ok(now);
    }
    for days in 0..=7 {
        let day = local
            .date_naive()
            .checked_add_signed(Duration::days(days))
            .ok_or("Date hors limites")?;
        if !window
            .weekdays
            .contains(&(day.weekday().number_from_monday() as u8))
        {
            continue;
        }
        for m in start..end {
            let naive = day.and_hms_opt(m / 60, m % 60, 0).unwrap();
            let candidates = match paris.from_local_datetime(&naive) {
                LocalResult::Single(at) => vec![at.with_timezone(&Utc)],
                LocalResult::Ambiguous(a, b) => vec![a.with_timezone(&Utc), b.with_timezone(&Utc)],
                LocalResult::None => vec![],
            };
            if let Some(at) = candidates.into_iter().filter(|at| *at >= now).min() {
                return Ok(at);
            }
        }
    }
    Err("Aucune ouverture horaire trouvée : parcours arrêté pour vérification.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn at(s: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(s).unwrap().with_timezone(&Utc)
    }
    #[test]
    fn shared_contract_validates_windows() {
        let cases: Value = serde_json::from_str(include_str!(
            "../../contracts/lead-message-window-cases.json"
        ))
        .unwrap();
        for c in cases.as_array().unwrap() {
            let w = serde_json::from_value::<MessageWindow>(c["value"].clone());
            assert_eq!(
                w.map(|w| valid(&w)).unwrap_or(false),
                c["valid"].as_bool().unwrap(),
                "{}",
                c["name"]
            );
        }
    }
    #[test]
    fn boundaries_weekends_and_paris_seasons() {
        let w = MessageWindow {
            timezone: "Europe/Paris".into(),
            weekdays: vec![1, 2, 3, 4, 5],
            start_time: "09:00".into(),
            end_time: "18:00".into(),
        };
        for (input, expected) in [
            ("2026-11-23T07:59:00Z", "2026-11-23T08:00:00Z"),
            ("2026-11-23T08:00:30Z", "2026-11-23T08:00:30Z"),
            ("2026-11-27T17:00:00Z", "2026-11-30T08:00:00Z"),
            ("2027-07-05T06:30:00Z", "2027-07-05T07:00:00Z"),
        ] {
            assert_eq!(next_allowed(&w, at(input)).unwrap(), at(expected));
        }
    }
    #[test]
    fn dst_gap_skips_nonexistent_minutes_and_fold_uses_real_clock() {
        let mut w = MessageWindow {
            timezone: "Europe/Paris".into(),
            weekdays: vec![7],
            start_time: "02:00".into(),
            end_time: "03:30".into(),
        };
        assert_eq!(
            next_allowed(&w, at("2027-03-28T00:00:00Z")).unwrap(),
            at("2027-03-28T01:00:00Z")
        );
        w.end_time = "02:30".into();
        assert_eq!(
            next_allowed(&w, at("2027-03-28T00:00:00Z")).unwrap(),
            at("2027-04-04T00:00:00Z")
        );
        assert_eq!(
            next_allowed(&w, at("2027-10-31T01:15:00Z")).unwrap(),
            at("2027-10-31T01:15:00Z")
        );
    }
    #[tokio::test]
    async fn delayed_message_survives_restart_without_advancing_cursor_and_tasks_keep_their_due_time(
    ) {
        let state = super::super::tests::state();
        let now = at("2026-11-27T18:00:00Z");
        let mut db = state.db.write().await;
        let (_, p) = super::super::tests::setup(&mut db, now);
        let d = &mut db.lead_scenarios.scenarios[0].versions[0].definition;
        d.message_window = Some(MessageWindow {
            timezone: "Europe/Paris".into(),
            weekdays: vec![1, 2, 3, 4, 5],
            start_time: "09:00".into(),
            end_time: "18:00".into(),
        });
        d.steps[0].subject = Some("Bienvenue".into());
        let scenario = db.lead_scenarios.scenarios[0].clone();
        enroll(&mut db, &scenario, &p, now).unwrap();
        process(&mut db, "carre-de-soie", now);
        assert_eq!(db.lead_scenarios.enrollments[0].cursor, 0);
        assert_eq!(
            db.lead_scenarios.enrollments[0].history[0].status,
            "deferred"
        );
        assert_eq!(
            db.lead_scenarios.enrollments[0].next_at,
            at("2026-11-30T08:00:00Z").to_rfc3339()
        );
        assert!(db.lead_scenarios.email_outbox.is_empty());
        assert!(!process(
            &mut db,
            "carre-de-soie",
            now + Duration::seconds(5)
        ));
        persist_state(&state.data_dir, &db).unwrap();
        let mut restored = crate::seed::load_or_init_state(&state.data_dir);
        process(&mut restored, "carre-de-soie", at("2026-11-30T08:00:00Z"));
        assert_eq!(restored.lead_scenarios.email_outbox.len(), 1);
        assert_eq!(restored.lead_scenarios.enrollments[0].cursor, 1);
        process(&mut restored, "carre-de-soie", at("2026-11-30T18:00:00Z"));
        assert_eq!(
            restored.lead_scenarios.enrollments[0]
                .history
                .last()
                .unwrap()
                .status,
            "task_created"
        );
        assert_eq!(restored.lead_scenarios.email_outbox.len(), 1);
        drop(db);
        std::fs::remove_dir_all(&state.data_dir).unwrap();
    }
    #[tokio::test]
    async fn suppression_at_opening_and_exit_before_opening_are_rechecked() {
        let state = super::super::tests::state();
        let now = at("2026-11-27T18:00:00Z");
        let mut db = state.db.write().await;
        let (_, p) = super::super::tests::setup(&mut db, now);
        let d = &mut db.lead_scenarios.scenarios[0].versions[0].definition;
        d.message_window = Some(MessageWindow {
            timezone: "Europe/Paris".into(),
            weekdays: vec![1],
            start_time: "09:00".into(),
            end_time: "18:00".into(),
        });
        let scenario = db.lead_scenarios.scenarios[0].clone();
        enroll(&mut db, &scenario, &p, now).unwrap();
        process(&mut db, "carre-de-soie", now);
        apply(
            &mut db,
            "carre-de-soie",
            "emp-mario",
            Command::SuppressEmail {
                prospect_id: p.id.clone(),
                reason: "Retrait fictif avant ouverture".into(),
            },
            now,
        )
        .unwrap();
        process(&mut db, "carre-de-soie", at("2026-11-30T08:00:00Z"));
        assert_eq!(
            db.lead_scenarios.enrollments[0]
                .history
                .last()
                .unwrap()
                .status,
            "skipped"
        );
        assert!(db.lead_scenarios.email_outbox.is_empty());
        let e = &mut db.lead_scenarios.enrollments[0];
        e.status = "running".into();
        e.next_at = at("2026-12-07T08:00:00Z").to_rfc3339();
        e.definition.exit_rules = Some(ExitRules {
            stop_on_reply: true,
            status_ids: vec![],
            stop_if_no_longer_matches: false,
        });
        db.lead_prospects
            .iter_mut()
            .find(|c| c.id == p.id)
            .unwrap()
            .last_inbound_reply_at = Some((now + Duration::minutes(1)).to_rfc3339());
        process(&mut db, "carre-de-soie", now + Duration::minutes(2));
        assert_eq!(db.lead_scenarios.enrollments[0].status, "stopped");
        drop(db);
        std::fs::remove_dir_all(&state.data_dir).unwrap();
    }
    #[tokio::test]
    async fn invalid_restored_window_stops_without_preparing_a_message() {
        let state = super::super::tests::state();
        let now = at("2026-11-23T10:00:00Z");
        let mut db = state.db.write().await;
        let (_, p) = super::super::tests::setup(&mut db, now);
        let scenario = db.lead_scenarios.scenarios[0].clone();
        enroll(&mut db, &scenario, &p, now).unwrap();
        db.lead_scenarios.enrollments[0].definition.message_window = Some(MessageWindow {
            timezone: "UTC".into(),
            weekdays: vec![],
            start_time: "invalid".into(),
            end_time: "invalid".into(),
        });
        process(&mut db, "carre-de-soie", now);
        assert_eq!(db.lead_scenarios.enrollments[0].status, "stopped");
        assert!(db.lead_scenarios.email_outbox.is_empty());
        drop(db);
        std::fs::remove_dir_all(&state.data_dir).unwrap();
    }
}
