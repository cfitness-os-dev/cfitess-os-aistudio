use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Scope {
    SelfOnly,
    Teams,
    Sites,
}

// Sérialisation compatible TypeScript ('self' | 'teams' | 'sites')
impl Scope {
    pub fn as_str(&self) -> &'static str {
        match self {
            Scope::SelfOnly => "self",
            Scope::Teams => "teams",
            Scope::Sites => "sites",
        }
    }

    pub fn from_str_strict(val: &str) -> Option<Self> {
        match val {
            "self" => Some(Scope::SelfOnly),
            "teams" => Some(Scope::Teams),
            "sites" => Some(Scope::Sites),
            _ => None,
        }
    }

    pub fn rank(&self) -> u8 {
        match self {
            Scope::SelfOnly => 1,
            Scope::Teams => 2,
            Scope::Sites => 3,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PermissionControlState {
    NonPropose,
    Decoche,
    GriseDesactive,
    Autorise,
}

impl PermissionControlState {
    pub fn as_str(&self) -> &'static str {
        match self {
            PermissionControlState::NonPropose => "non_propose",
            PermissionControlState::Decoche => "decoche",
            PermissionControlState::GriseDesactive => "grise_desactive",
            PermissionControlState::Autorise => "autorise",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionRow {
    pub action_id: String,
    pub label: String,
    pub group: String,
    pub exposed: bool,
    pub checked: Option<bool>,
    pub disabled: Option<bool>,
    pub editable_control: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoleProfile {
    pub id: String,
    pub name: String,
    pub source_screen: String,
    pub scope_selected: String,
    pub scope_options: Vec<String>,
    pub scope_editable: bool,
    pub card_other_actions_count: u32,
    pub exposed_action_count: u32,
    pub rows: Vec<PermissionRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Organization {
    pub id: String,
    pub name: String,
    pub legal_name: String,
    pub siren: String,
    pub vat_number: String,
    pub sector: String,
    pub contact_email: String,
    pub meal_allowance_eur: f64,
    pub billing_notice: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteHrSettings {
    pub badge_frequency: String,
    pub tablet_break_badging: bool,
    pub day_start_hour: String,
    pub break_alert_hours: u32,
    pub break_alert_enabled: bool,
    pub consecutive_days_blocking: bool,
    pub complementary_max_hours: u32,
    pub smart_planner_break_max_hours: u32,
    pub alerts_layout: String,
    pub missions_module_active: bool,
    pub report_rules_visible: bool,
    pub annualization_period: String,
    pub acquisition_mode: String,
    pub annualization_total_motives: u32,
    pub annualization_included_motives: u32,
    pub sunday_hours_in_annualization: bool,
    pub rtt_hours_counter_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Site {
    pub id: String,
    pub name: String,
    pub address: String,
    pub city: String,
    pub timezone: String,
    pub siret: String,
    pub settings: SiteHrSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Position {
    pub id: String,
    pub site_id: String,
    pub label: String,
    pub color: String,
    pub default_break_minutes: u32,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Team {
    pub id: String,
    pub site_id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmployeeSiteAccess {
    pub site_id: String,
    pub is_primary: bool,
    pub profile_id: String,
    pub show_on_planning: bool,
    pub team_ids: Vec<String>,
    #[serde(default)]
    pub managed_team_ids: Vec<String>,
    pub position_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SensitiveBankInfo {
    pub payment_mode: String,
    pub iban_masked: String,
    pub bic: String,
    pub nir_masked: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContractSummary {
    pub id: String,
    pub site_id: String,
    pub contract_type: String,
    pub regime: String,
    pub weekly_hours: Option<u32>,
    pub annual_days: Option<u32>,
    pub monthly_gross_eur: Option<f64>,
    pub hourly_rate_eur: Option<f64>,
    pub loaded_cost_factor: f64,
    pub effective_from: String,
    pub effective_to: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmployeeCounter {
    #[serde(rename = "cpNAcquired")]
    pub cp_n_acquired: f64,
    #[serde(rename = "cpNTaken")]
    pub cp_n_taken: f64,
    #[serde(rename = "cpNMinus1Remaining")]
    pub cp_n_minus1_remaining: f64,
    pub rtt_days_remaining: Option<f64>,
    pub annualization_balance_hours: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Employee {
    pub id: String,
    pub first_name: String,
    pub last_name: String,
    pub birth_name: Option<String>,
    pub matricule: String,
    pub email: String,
    pub phone: String,
    pub active: bool,
    pub hr_file_status: String,
    pub site_accesses: Vec<EmployeeSiteAccess>,
    pub sensitive_bank: SensitiveBankInfo,
    pub contract: ContractSummary,
    pub counter: EmployeeCounter,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedactedEmployeeView {
    pub id: String,
    pub first_name: String,
    pub last_name: String,
    pub matricule: String,
    pub active: bool,
    pub hr_file_status: String,
    pub site_accesses: Vec<EmployeeSiteAccess>,
    pub counter: EmployeeCounter,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phone: Option<String>,
    pub sensitive_bank: Option<SensitiveBankInfo>,
    pub contract: ContractSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shift {
    pub id: String,
    pub site_id: String,
    pub date: String,
    pub start_time: String,
    pub end_time: String,
    pub break_minutes: u32,
    pub employee_id: Option<String>,
    pub position_id: String,
    pub mission_label: Option<String>,
    pub tasks: Vec<String>,
    pub lock_state: String,
    pub published: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaveRequest {
    pub id: String,
    pub employee_id: String,
    pub site_id: String,
    pub motive: String,
    pub start_date: String,
    pub end_date: String,
    pub status: String,
    pub comment: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeclockAnomaly {
    pub id: String,
    pub employee_id: String,
    pub site_id: String,
    pub date: String,
    pub planned_range: String,
    pub punched_range: String,
    pub delta_minutes: i32,
    pub has_proof_photo: bool,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteKpis {
    pub site_id: String,
    pub period_label: String,
    pub revenue_eur: Option<f64>,
    pub productivity_per_hour: Option<f64>,
    pub payroll_mass_eur: Option<f64>,
    pub worked_hours: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEvent {
    pub id: String,
    pub timestamp: String,
    pub actor_id: String,
    pub actor_name: String,
    pub action_type: String,
    pub summary: String,
    pub site_id: String,
    pub target_label: String,
    pub before_summary: Option<String>,
    pub after_summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationPrefs {
    pub email_enabled: bool,
    pub sms_enabled: bool,
    pub frequency: String,
    pub digest_hour: String,
    pub include_activity_report: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPreferences {
    pub language: String,
    pub notifications: NotificationPrefs,
    pub calendar_feed_token: String,
    pub calendar_feed_enabled: bool,
    pub sso_enabled: bool,
    pub sso_provider: String,
    pub sso_domain: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AmbiguityRecord {
    pub id: String,
    pub title: String,
    pub description: String,
    pub decision_status: String,
    pub resolution_note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppDatabaseState {
    pub version: String,
    pub organization: Organization,
    pub sites: Vec<Site>,
    pub positions: Vec<Position>,
    pub teams: Vec<Team>,
    pub profiles: Vec<RoleProfile>,
    pub employees: Vec<Employee>,
    pub shifts: Vec<Shift>,
    pub leave_requests: Vec<LeaveRequest>,
    pub anomalies: Vec<TimeclockAnomaly>,
    pub kpis: Vec<SiteKpis>,
    pub audit_log: Vec<AuditEvent>,
    pub preferences_by_employee: HashMap<String, UserPreferences>,
    pub ambiguities: Vec<AmbiguityRecord>,
    pub org02_billing_policy: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedPermEntry {
    pub state: String,
    pub allowed: bool,
    pub scope: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionContext {
    pub employee: Employee,
    pub active_site_id: String,
    pub active_access: EmployeeSiteAccess,
    pub active_profile: RoleProfile,
    pub resolved_permissions: HashMap<String, ResolvedPermEntry>,
    pub visible_sections: Vec<String>,
}
