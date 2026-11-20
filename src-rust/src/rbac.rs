use crate::models::{
    AppDatabaseState, Employee, EmployeeSiteAccess, LeaveRequest, PermissionControlState,
    PermissionRow, RedactedEmployeeView, ResolvedPermEntry, RoleProfile, Scope, SessionContext,
    Shift, SiteKpis, TimeclockAnomaly,
};
use std::collections::{HashMap, HashSet};

pub struct PermissionTarget<'a> {
    pub site_id: Option<&'a str>,
    pub target_employee_id: Option<&'a str>,
    pub target_team_ids: &'a [String],
    pub lock_state: Option<&'a str>,
}

pub struct PermissionResult {
    pub allowed: bool,
    pub state: PermissionControlState,
    pub effective_scope: Scope,
    pub reason: String,
}

fn is_self_only_action(action_id: &str) -> bool {
    matches!(
        action_id,
        "ORG04-18" | "ORG04-19" | "ORG04-20" | "ORG04-21" | "ORG04-22"
    )
}

pub fn get_control_state(row: Option<&PermissionRow>) -> PermissionControlState {
    match row {
        None => PermissionControlState::NonPropose,
        Some(r) if !r.exposed => PermissionControlState::NonPropose,
        Some(r) if r.disabled == Some(true) => PermissionControlState::GriseDesactive,
        Some(r) if r.checked == Some(true) => PermissionControlState::Autorise,
        Some(_) => PermissionControlState::Decoche,
    }
}

pub fn resolve_site_access<'a>(
    employee: &'a Employee,
    requested_site_id: &str,
) -> Option<&'a EmployeeSiteAccess> {
    if requested_site_id == "all" {
        employee
            .site_accesses
            .iter()
            .find(|a| a.is_primary)
            .or_else(|| employee.site_accesses.first())
    } else {
        employee
            .site_accesses
            .iter()
            .find(|a| a.site_id == requested_site_id)
    }
}

pub fn evaluate_permission(
    state: &AppDatabaseState,
    actor_id: &str,
    active_site_id: &str,
    action_id: &str,
    target: Option<PermissionTarget<'_>>,
) -> PermissionResult {
    let Some(actor) = state.employees.iter().find(|e| e.id == actor_id) else {
        return PermissionResult {
            allowed: false,
            state: PermissionControlState::NonPropose,
            effective_scope: Scope::SelfOnly,
            reason: "Compte inexistant.".into(),
        };
    };

    if !actor.active {
        return PermissionResult {
            allowed: false,
            state: PermissionControlState::NonPropose,
            effective_scope: Scope::SelfOnly,
            reason: "Compte archivé.".into(),
        };
    }

    let target_site_id = target
        .as_ref()
        .and_then(|t| t.site_id)
        .unwrap_or(active_site_id);

    let Some(access) = resolve_site_access(actor, target_site_id) else {
        return PermissionResult {
            allowed: false,
            state: PermissionControlState::NonPropose,
            effective_scope: Scope::SelfOnly,
            reason: "Établissement hors périmètre de rattachement.".into(),
        };
    };

    let Some(profile) = state.profiles.iter().find(|p| p.id == access.profile_id) else {
        return PermissionResult {
            allowed: false,
            state: PermissionControlState::NonPropose,
            effective_scope: Scope::SelfOnly,
            reason: "Profil introuvable.".into(),
        };
    };

    let row = profile.rows.iter().find(|r| r.action_id == action_id);
    let ctrl_state = get_control_state(row);
    let declared_scope = Scope::from_str_strict(&profile.scope_selected).unwrap_or(Scope::SelfOnly);

    if ctrl_state != PermissionControlState::Autorise {
        return PermissionResult {
            allowed: false,
            state: ctrl_state,
            effective_scope: declared_scope,
            reason: format!("Action {} non autorisée sur {}.", action_id, profile.name),
        };
    }

    if is_self_only_action(action_id) {
        if let Some(ref t) = target {
            if let Some(target_emp) = t.target_employee_id {
                if target_emp != actor_id {
                    return PermissionResult {
                        allowed: false,
                        state: PermissionControlState::Autorise,
                        effective_scope: Scope::SelfOnly,
                        reason: format!("L'action personnelle {} est limitée à soi-même.", action_id),
                    };
                }
            }
        }
        return PermissionResult {
            allowed: true,
            state: PermissionControlState::Autorise,
            effective_scope: Scope::SelfOnly,
            reason: "Autorisé sur son propre dossier.".into(),
        };
    }

    if let Some(ref t) = target {
        if let Some(target_emp) = t.target_employee_id {
            if target_emp != actor_id {
                match declared_scope {
                    Scope::SelfOnly => {
                        return PermissionResult {
                            allowed: false,
                            state: PermissionControlState::Autorise,
                            effective_scope: Scope::SelfOnly,
                            reason: "Portée limitée à soi-même.".into(),
                        };
                    }
                    Scope::Teams => {
                        let manages_target_team = t
                            .target_team_ids
                            .iter()
                            .any(|tid| access.managed_team_ids.contains(tid));
                        if !manages_target_team {
                            return PermissionResult {
                                allowed: false,
                                state: PermissionControlState::Autorise,
                                effective_scope: Scope::Teams,
                                reason: "Donnée hors de vos équipes encadrées (managedTeamIds).".into(),
                            };
                        }
                    }
                    Scope::Sites => {}
                }
            }
        }

        if (action_id == "ORG04-01" || action_id == "ORG04-02")
            && t.lock_state.is_some()
            && t.lock_state != Some("none")
        {
            let lock_state = t.lock_state.unwrap_or("none");
            let req_action = if lock_state == "red" {
                "ORG04-05"
            } else {
                "ORG04-04"
            };
            let lock_row = profile.rows.iter().find(|r| r.action_id == req_action);
            if get_control_state(lock_row) != PermissionControlState::Autorise {
                return PermissionResult {
                    allowed: false,
                    state: get_control_state(lock_row),
                    effective_scope: declared_scope,
                    reason: format!(
                        "Période verrouillée ({}) : droit {} requis.",
                        lock_state, req_action
                    ),
                };
            }
        }
    }

    PermissionResult {
        allowed: true,
        state: PermissionControlState::Autorise,
        effective_scope: declared_scope,
        reason: "Autorisé.".into(),
    }
}

pub fn can_access_site_scope(
    state: &AppDatabaseState,
    actor_id: &str,
    site_id: &str,
) -> bool {
    let Some(actor) = state.employees.iter().find(|e| e.id == actor_id && e.active) else {
        return false;
    };
    if site_id == "all" {
        let Some(primary) = resolve_site_access(actor, "all") else {
            return false;
        };
        let Some(profile) = state.profiles.iter().find(|p| p.id == primary.profile_id) else {
            return false;
        };
        let scope = Scope::from_str_strict(&profile.scope_selected).unwrap_or(Scope::SelfOnly);
        return actor.site_accesses.len() > 1
            && scope == Scope::Sites
            && (evaluate_permission(state, actor_id, &primary.site_id, "ORG04-07", None).allowed
                || evaluate_permission(state, actor_id, &primary.site_id, "ORG04-38", None).allowed);
    }
    actor.site_accesses.iter().any(|a| a.site_id == site_id)
}

pub fn redact_employee_for_actor(
    state: &AppDatabaseState,
    actor_id: &str,
    active_site_id: &str,
    target_emp: &Employee,
) -> Option<RedactedEmployeeView> {
    let is_self = actor_id == target_emp.id;
    let target_site_access = if active_site_id == "all" {
        target_emp
            .site_accesses
            .iter()
            .find(|a| a.is_primary)
            .or_else(|| target_emp.site_accesses.first())?
    } else {
        target_emp
            .site_accesses
            .iter()
            .find(|a| a.site_id == active_site_id)?
    };

    let can_view_file = is_self
        || evaluate_permission(
            state,
            actor_id,
            &target_site_access.site_id,
            "ORG04-07",
            Some(PermissionTarget {
                site_id: Some(&target_site_access.site_id),
                target_employee_id: Some(&target_emp.id),
                target_team_ids: &target_site_access.team_ids,
                lock_state: None,
            }),
        )
        .allowed;

    if !can_view_file {
        return None;
    }

    let can_view_sensitive = is_self
        || evaluate_permission(
            state,
            actor_id,
            &target_site_access.site_id,
            "ORG04-10",
            Some(PermissionTarget {
                site_id: Some(&target_site_access.site_id),
                target_employee_id: Some(&target_emp.id),
                target_team_ids: &target_site_access.team_ids,
                lock_state: None,
            }),
        )
        .allowed;

    let mut contract = target_emp.contract.clone();
    if !can_view_sensitive {
        contract.monthly_gross_eur = None;
        contract.hourly_rate_eur = None;
    }

    Some(RedactedEmployeeView {
        id: target_emp.id.clone(),
        first_name: target_emp.first_name.clone(),
        last_name: target_emp.last_name.clone(),
        matricule: target_emp.matricule.clone(),
        active: target_emp.active,
        hr_file_status: target_emp.hr_file_status.clone(),
        site_accesses: target_emp.site_accesses.clone(),
        counter: target_emp.counter.clone(),
        email: if can_view_sensitive {
            Some(target_emp.email.clone())
        } else {
            None
        },
        phone: if can_view_sensitive {
            Some(target_emp.phone.clone())
        } else {
            None
        },
        sensitive_bank: if can_view_sensitive {
            Some(target_emp.sensitive_bank.clone())
        } else {
            None
        },
        contract,
    })
}

pub fn filter_shifts_for_actor(
    state: &AppDatabaseState,
    actor_id: &str,
    active_site_id: &str,
) -> Vec<Shift> {
    let Some(actor) = state.employees.iter().find(|e| e.id == actor_id) else {
        return vec![];
    };

    state
        .shifts
        .iter()
        .filter(|shift| {
            if active_site_id != "all" && shift.site_id != active_site_id {
                return false;
            }
            if resolve_site_access(actor, &shift.site_id).is_none() {
                return false;
            }

            match &shift.employee_id {
                Some(eid) if eid == actor_id => {
                    shift.published
                        || evaluate_permission(state, actor_id, &shift.site_id, "ORG04-02", None)
                            .allowed
                }
                None => {
                    evaluate_permission(state, actor_id, &shift.site_id, "ORG04-01", None).allowed
                        || evaluate_permission(state, actor_id, &shift.site_id, "ORG04-02", None)
                            .allowed
                }
                Some(eid) => {
                    let target_teams: Vec<String> = state
                        .employees
                        .iter()
                        .find(|e| &e.id == eid)
                        .and_then(|e| e.site_accesses.iter().find(|a| a.site_id == shift.site_id))
                        .map(|a| a.team_ids.clone())
                        .unwrap_or_default();

                    evaluate_permission(
                        state,
                        actor_id,
                        &shift.site_id,
                        "ORG04-07",
                        Some(PermissionTarget {
                            site_id: Some(&shift.site_id),
                            target_employee_id: Some(eid),
                            target_team_ids: &target_teams,
                            lock_state: None,
                        }),
                    )
                    .allowed
                }
            }
        })
        .cloned()
        .collect()
}

pub fn filter_requests_for_actor(
    state: &AppDatabaseState,
    actor_id: &str,
    active_site_id: &str,
) -> Vec<LeaveRequest> {
    state
        .leave_requests
        .iter()
        .filter(|req| {
            if active_site_id != "all" && req.site_id != active_site_id {
                return false;
            }
            if req.employee_id == actor_id {
                return true;
            }
            let target_teams: Vec<String> = state
                .employees
                .iter()
                .find(|e| e.id == req.employee_id)
                .and_then(|e| e.site_accesses.iter().find(|a| a.site_id == req.site_id))
                .map(|a| a.team_ids.clone())
                .unwrap_or_default();

            evaluate_permission(
                state,
                actor_id,
                &req.site_id,
                "ORG04-17",
                Some(PermissionTarget {
                    site_id: Some(&req.site_id),
                    target_employee_id: Some(&req.employee_id),
                    target_team_ids: &target_teams,
                    lock_state: None,
                }),
            )
            .allowed
        })
        .cloned()
        .collect()
}

pub fn filter_anomalies_for_actor(
    state: &AppDatabaseState,
    actor_id: &str,
    active_site_id: &str,
) -> Vec<TimeclockAnomaly> {
    state
        .anomalies
        .iter()
        .filter(|anom| {
            if active_site_id != "all" && anom.site_id != active_site_id {
                return false;
            }
            if anom.employee_id == actor_id {
                return true;
            }
            let target_teams: Vec<String> = state
                .employees
                .iter()
                .find(|e| e.id == anom.employee_id)
                .and_then(|e| e.site_accesses.iter().find(|a| a.site_id == anom.site_id))
                .map(|a| a.team_ids.clone())
                .unwrap_or_default();

            evaluate_permission(
                state,
                actor_id,
                &anom.site_id,
                "ORG04-35",
                Some(PermissionTarget {
                    site_id: Some(&anom.site_id),
                    target_employee_id: Some(&anom.employee_id),
                    target_team_ids: &target_teams,
                    lock_state: None,
                }),
            )
            .allowed
        })
        .cloned()
        .collect()
}

pub fn filter_kpis_for_actor(
    state: &AppDatabaseState,
    actor_id: &str,
    active_site_id: &str,
) -> Vec<SiteKpis> {
    state
        .kpis
        .iter()
        .filter_map(|kpi| {
            if active_site_id != "all" && kpi.site_id != active_site_id {
                return None;
            }
            let can_view_indicators = can_access_reports(state, actor_id)
                || evaluate_permission(
                    state,
                    actor_id,
                    &kpi.site_id,
                    "ORG04-38",
                    Some(PermissionTarget {
                        site_id: Some(&kpi.site_id),
                        target_employee_id: None,
                        target_team_ids: &[],
                        lock_state: None,
                    }),
                )
                .allowed;
            if !can_view_indicators {
                return None;
            }
            // Le CA, la masse salariale et la productivité ne sont transmis
            // qu'aux profils financièrement habilités (ticket #3 / #19).
            // Les autres reçoivent la ligne KPI sans ces champs, jamais
            // les valeurs chargées puis cachées côté navigateur.
            if can_access_finances(state, actor_id) {
                Some(kpi.clone())
            } else {
                let mut redacted = kpi.clone();
                redacted.revenue_eur = None;
                redacted.payroll_mass_eur = None;
                redacted.productivity_per_hour = None;
                Some(redacted)
            }
        })
        .collect()
}

pub fn validate_delegation_update(
    state: &AppDatabaseState,
    actor_id: &str,
    active_site_id: &str,
    target_profile_id: &str,
    next_scope_str: &str,
    updated_checked: &HashMap<String, bool>,
) -> Result<(), String> {
    let can_edit = evaluate_permission(state, actor_id, active_site_id, "ORG04-31", None);
    if !can_edit.allowed {
        return Err(format!("Refus serveur (403) : {}", can_edit.reason));
    }

    let actor = state
        .employees
        .iter()
        .find(|e| e.id == actor_id)
        .ok_or_else(|| "Acteur introuvable.".to_string())?;
    let actor_access =
        resolve_site_access(actor, active_site_id).ok_or_else(|| "Accès site absent.".to_string())?;
    let actor_profile = state
        .profiles
        .iter()
        .find(|p| p.id == actor_access.profile_id)
        .ok_or_else(|| "Profil acteur introuvable.".to_string())?;

    let target_profile = state
        .profiles
        .iter()
        .find(|p| p.id == target_profile_id)
        .ok_or_else(|| "Profil cible introuvable.".to_string())?;

    if !target_profile.scope_editable && next_scope_str != target_profile.scope_selected {
        return Err(format!(
            "Le périmètre de {} n'est pas modifiable.",
            target_profile.name
        ));
    }

    let next_scope =
        Scope::from_str_strict(next_scope_str).ok_or_else(|| "Portée invalide.".to_string())?;
    let actor_scope =
        Scope::from_str_strict(&actor_profile.scope_selected).unwrap_or(Scope::SelfOnly);

    if next_scope.rank() > actor_scope.rank() {
        return Err(format!(
            "Délégation refusée (TST34) : portée {} supérieure à la vôtre ({}).",
            next_scope.as_str(),
            actor_scope.as_str()
        ));
    }

    for (action_id, &want_checked) in updated_checked {
        let Some(target_row) = target_profile.rows.iter().find(|r| &r.action_id == action_id)
        else {
            return Err(format!(
                "Action {} inconnue sur {}.",
                action_id, target_profile.name
            ));
        };
        if !target_row.exposed {
            return Err(format!(
                "Action {} non proposée sur {}.",
                action_id, target_profile.name
            ));
        }
        if !target_row.editable_control && target_row.checked.unwrap_or(false) != want_checked {
            return Err(format!(
                "Contrôle grisé/verrouillé pour {} sur {}.",
                action_id, target_profile.name
            ));
        }
        if want_checked && !target_row.checked.unwrap_or(false) {
            let actor_row = actor_profile.rows.iter().find(|r| &r.action_id == action_id);
            if get_control_state(actor_row) != PermissionControlState::Autorise {
                return Err(format!(
                    "Délégation refusée (TST34) : vous ne détenez pas la capacité {} ({}).",
                    action_id, target_row.label
                ));
            }
        }
    }

    Ok(())
}

fn has_profile(state: &AppDatabaseState, actor_id: &str, profile_id: &str) -> bool {
    state.employees.iter().any(|e| {
        e.id == actor_id
            && e.site_accesses
                .iter()
                .any(|access| access.profile_id == profile_id)
    })
}

pub fn is_admin_employee(state: &AppDatabaseState, actor_id: &str) -> bool {
    has_profile(state, actor_id, "admin_systeme")
}

pub fn is_manager_employee(state: &AppDatabaseState, actor_id: &str) -> bool {
    is_admin_employee(state, actor_id) || has_profile(state, actor_id, "master_avance")
}

/// Finances : Direction ou habilitation nominative explicite (ticket #3).
pub fn can_access_finances(state: &AppDatabaseState, actor_id: &str) -> bool {
    is_admin_employee(state, actor_id)
        || state
            .finance_authorized_employee_ids
            .iter()
            .any(|id| id == actor_id)
}

/// Rapports : admin/manager par défaut, ou délégation nominative.
pub fn can_access_reports(state: &AppDatabaseState, actor_id: &str) -> bool {
    is_manager_employee(state, actor_id)
        || state
            .reports_authorized_employee_ids
            .iter()
            .any(|id| id == actor_id)
}

/// Recouvrement : admin/manager par défaut, ou délégation nominative.
#[allow(dead_code)]
pub fn can_access_recovery(state: &AppDatabaseState, actor_id: &str) -> bool {
    is_manager_employee(state, actor_id)
        || state
            .recovery_authorized_employee_ids
            .iter()
            .any(|id| id == actor_id)
}

/// Stock & Achats : admin/manager par défaut, ou délégation nominative.
#[allow(dead_code)]
pub fn can_access_stocks(state: &AppDatabaseState, actor_id: &str) -> bool {
    is_manager_employee(state, actor_id)
        || state
            .stock_authorized_employee_ids
            .iter()
            .any(|id| id == actor_id)
}

pub fn get_visible_sections_for_session(
    state: &AppDatabaseState,
    actor_id: &str,
    active_site_id: &str,
) -> Vec<String> {
    let mut sections: Vec<String> = vec![
        "MC01".into(),
        "MC02".into(),
        "MC03".into(),
        "MC04".into(),
        "MC05".into(),
        "MC06".into(),
    ];

    let has = |aid: &str| evaluate_permission(state, actor_id, active_site_id, aid, None).allowed;

    if can_access_finances(state, actor_id) {
        sections.push("MC07".into());
    }
    if can_access_reports(state, actor_id) {
        sections.push("MC08".into());
    }
    if is_manager_employee(state, actor_id) {
        sections.push("MC09".into());
    }
    if has("ORG04-27")
        || has("ORG04-28")
        || has("ORG04-29")
        || has("ORG04-30")
        || has("ORG04-34")
        || has("ORG04-37")
    {
        sections.push("MC10".into());
    }
    if has("ORG04-31") || has("ORG04-32") || has("ORG04-33") {
        sections.push("MC11".into());
    }
    if has("ORG04-31") || has("ORG04-33") {
        sections.push("MC12".into());
    }
    sections.push("MC13".into());
    sections
}

pub fn build_session_context(
    state: &AppDatabaseState,
    actor_id: &str,
    requested_site_id: &str,
) -> Option<SessionContext> {
    let employee = state.employees.iter().find(|e| e.id == actor_id)?.clone();
    let active_site_id = if requested_site_id == "all" && can_access_site_scope(state, actor_id, "all") {
        "all".to_string()
    } else if requested_site_id != "all"
        && employee
            .site_accesses
            .iter()
            .any(|a| a.site_id == requested_site_id)
    {
        requested_site_id.to_string()
    } else {
        employee
            .site_accesses
            .iter()
            .find(|a| a.is_primary)
            .or_else(|| employee.site_accesses.first())
            .map(|a| a.site_id.clone())
            .unwrap_or_else(|| "club-carre-soie".to_string())
    };

    let active_access = resolve_site_access(&employee, &active_site_id)?.clone();
    let active_profile: RoleProfile = state
        .profiles
        .iter()
        .find(|p| p.id == active_access.profile_id)?
        .clone();

    let mut resolved_permissions = HashMap::new();
    for row in &active_profile.rows {
        let res = evaluate_permission(state, actor_id, &active_site_id, &row.action_id, None);
        resolved_permissions.insert(
            row.action_id.clone(),
            ResolvedPermEntry {
                state: res.state.as_str().to_string(),
                allowed: res.allowed,
                scope: res.effective_scope.as_str().to_string(),
            },
        );
    }

    let visible_sections = get_visible_sections_for_session(state, actor_id, &active_site_id);
    let _allowed_sites_set: HashSet<&str> = employee
        .site_accesses
        .iter()
        .map(|a| a.site_id.as_str())
        .collect();

    Some(SessionContext {
        employee,
        active_site_id,
        active_access,
        active_profile,
        resolved_permissions,
        visible_sections,
    })
}
