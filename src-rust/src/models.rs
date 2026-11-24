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
pub struct CounterAdjustmentRecord {
    pub id: String,
    pub employee_id: String,
    pub site_id: String,
    pub actor_id: String,
    pub actor_name: String,
    pub timestamp: String,
    pub reason: String,
    pub before: EmployeeCounter,
    pub after: EmployeeCounter,
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
    #[serde(default)]
    pub retention_rate_pct: Option<f64>,
    #[serde(default)]
    pub monthly_target_eur: Option<f64>,
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

fn default_theme_mode() -> String {
    "dark".to_string()
}

fn default_accent_color() -> String {
    "violet".to_string()
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
    #[serde(default = "default_theme_mode")]
    pub theme_mode: String,
    #[serde(default = "default_accent_color")]
    pub accent_color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModuleDelegation {
    pub employee_id: String,
    pub site_id: String,
    pub module: String,
    #[serde(default)]
    pub actions: Vec<String>,
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
pub struct LeadFormFieldRecord {
    pub id: String,
    pub label: String,
    #[serde(rename = "type")]
    pub field_type: String,
    pub required: bool,
    #[serde(default)]
    pub options: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeadFormSampleResponseRecord {
    pub id: String,
    pub full_name: String,
    pub email: String,
    pub phone: String,
    pub rgpd_consent: bool,
    #[serde(default)]
    pub answers: serde_json::Value,
    pub submitted_at: String,
    #[serde(default)]
    pub linked_prospect_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeadFormRecord {
    pub id: String,
    pub name: String,
    pub club_id: String,
    pub published: bool,
    #[serde(default)]
    pub section_titles: Vec<String>,
    #[serde(default)]
    pub fields: Vec<LeadFormFieldRecord>,
    pub responses_count: u32,
    #[serde(default)]
    pub sample_responses: Vec<LeadFormSampleResponseRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeadProspectRecord {
    pub id: String,
    #[serde(default)]
    pub gender: String,
    pub first_name: String,
    pub last_name: String,
    pub email: String,
    #[serde(default)]
    pub phone: String,
    #[serde(default)]
    pub street: String,
    #[serde(default)]
    pub postal_code: String,
    #[serde(default)]
    pub city: String,
    #[serde(default)]
    pub birth_date: String,
    #[serde(default)]
    pub comment: String,
    pub club_id: String,
    pub source: String,
    pub stage: String,
    #[serde(default)]
    pub lead_status: String,
    pub rgpd_consent: bool,
    #[serde(default)]
    pub segments: Vec<String>,
    #[serde(default)]
    pub trial_date: Option<String>,
    #[serde(default)]
    pub assigned_to_id: Option<String>,
    #[serde(default)]
    pub last_visit_at: Option<String>,
    #[serde(default)]
    pub days_without_visit: u32,
    #[serde(default)]
    pub last_inbound_reply_at: Option<String>,
    #[serde(default)]
    pub archived_at: Option<String>,
    #[serde(default)]
    pub converted_offer: Option<String>,
    #[serde(default)]
    pub is_archived: bool,
    #[serde(default)]
    pub archive_reason: Option<String>,
    #[serde(default)]
    pub client_scope: Option<String>,
    #[serde(default)]
    pub client_club_ids: Vec<String>,
    #[serde(default)]
    pub has_active_vacation: bool,
    #[serde(default)]
    pub last_commercial_touch_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeadAlertRecord {
    pub id: String,
    pub club_id: String,
    pub event_type: String,
    pub title: String,
    pub message: String,
    pub prospect_id: Option<String>,
    #[serde(default)]
    pub recipient_ids: Vec<String>,
    #[serde(default)]
    pub alert_rule_id: Option<String>,
    #[serde(default)]
    pub channel: String,
    #[serde(default)]
    pub recipient_employee_ids: Vec<String>,
    #[serde(default)]
    pub recipient_channels: Vec<String>,
    pub simulation_mode: bool,
    pub acknowledged: bool,
    #[serde(default)]
    pub acknowledged_by: Option<String>,
    #[serde(default)]
    pub acknowledged_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessedWebhookEvent {
    pub event_key: String,
    pub source: String,
    pub club_id: String,
    pub processed_at: String,
    pub response_summary: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeadSchedulerStatus {
    pub enabled: bool,
    pub frequency_seconds: u64,
    pub timezone: String,
    pub actor_identity: String,
    #[serde(default)]
    pub last_archive_run_at: Option<String>,
    #[serde(default)]
    pub last_reminder_run_at: Option<String>,
    #[serde(default)]
    pub last_run_error: Option<String>,
    #[serde(default)]
    pub total_runs: u64,
    #[serde(default)]
    pub last_archived_count: usize,
    #[serde(default)]
    pub last_reminders_emitted: usize,
}

impl Default for LeadSchedulerStatus {
    fn default() -> Self {
        Self {
            enabled: true,
            frequency_seconds: 900,
            timezone: "Europe/Paris".to_string(),
            actor_identity: "system-scheduler".to_string(),
            last_archive_run_at: None,
            last_reminder_run_at: None,
            last_run_error: None,
            total_runs: 0,
            last_archived_count: 0,
            last_reminders_emitted: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeadAppointmentRecord {
    pub id: String,
    pub club_id: String,
    pub coach_id: String,
    pub type_name: String,
    #[serde(default)]
    pub prospect_id: Option<String>,
    #[serde(default)]
    pub prospect_name: Option<String>,
    #[serde(default)]
    pub prospect_email: Option<String>,
    #[serde(default)]
    pub activity_id: Option<String>,
    pub date: String,
    pub start_time: String,
    pub duration_minutes: u32,
    pub capacity_max: u32,
    pub current_booked_count: u32,
    pub payment_status: String,
    #[serde(default = "default_rdv_status")]
    pub status: String,
}

fn default_rdv_status() -> String {
    "confirme".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeadActivityRecord {
    pub id: String,
    #[serde(rename = "type")]
    pub activity_type: String,
    pub title: String,
    #[serde(default)]
    pub prospect_id: Option<String>,
    pub prospect_name: String,
    pub club_id: String,
    pub due_at: String,
    pub status: String,
    pub assigned_to_id: String,
    pub status_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryCaseRecord {
    pub id: String,
    pub member_id: String,
    pub member_name: String,
    pub club_id: String,
    pub phone: String,
    pub email: String,
    pub contract_label: String,
    pub amount_due_eur: f64,
    pub days_overdue: u32,
    pub unpaid_reason: String,
    #[serde(default)]
    pub billed_months: Vec<String>,
    pub has_signed_contract: bool,
    pub has_id_and_rib: bool,
    pub has_cgv_accepted: bool,
    #[serde(default)]
    pub missing_docs: Vec<String>,
    pub status: String,
    pub relance_count: u32,
    pub last_action_note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionRecord {
    pub id: String,
    pub site_id: String,
    pub title: String,
    pub budget_hours: f64,
    pub logged_hours: f64,
    pub hourly_budget_eur: f64,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrchestratorDecisionRecord {
    pub id: String,
    pub timestamp: String,
    pub trigger_event: String,
    pub source_system: String,
    pub assigned_agent: String,
    pub agent_color: String,
    pub proposed_action: String,
    #[serde(default)]
    pub conflict_avoided_note: Option<String>,
    pub requires_human_approval: bool,
    pub status: String,
    pub club_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaintenanceTicketRecord {
    pub id: String,
    pub club_id: String,
    pub equipment_name: String,
    pub category: String,
    pub issue_description: String,
    pub priority: String,
    pub status: String,
    pub supplier_name: String,
    pub estimated_cost_eur: f64,
    #[serde(default)]
    pub used_part_name: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseOrderRecord {
    pub id: String,
    pub reference: String,
    pub club_id: String,
    pub supplier: String,
    pub items_summary: String,
    pub amount_ht_eur: f64,
    pub date: String,
    pub status: String,
    #[serde(default)]
    pub linked_stock_id: Option<String>,
    #[serde(default)]
    pub ordered_qty: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StockItemRecord {
    pub id: String,
    pub club_id: String,
    pub name: String,
    #[serde(default)]
    pub barcode: Option<String>,
    pub category: String,
    pub current_qty: u32,
    pub min_threshold: u32,
    pub unit: String,
    pub supplier: String,
    pub unit_priceht: f64,
    pub auto_order_prepared: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeitzMemberRecord {
    pub id: String,
    pub badge_code: String,
    pub rfid_bluetooth_enabled: bool,
    #[serde(default)]
    pub mywellness_member_id: Option<String>,
    pub first_name: String,
    pub last_name: String,
    pub phone: String,
    #[serde(default)]
    pub email: Option<String>,
    pub home_club_id: String,
    pub subscription_name: String,
    pub active_subscription: bool,
    pub fin_balance_eur: f64,
    pub fin_balance_state: i32,
    #[serde(default)]
    pub technogym_moves30d: u32,
    #[serde(default)]
    pub days_since_last_workout: u32,
    #[serde(default)]
    pub loyalty_points: u32,
    #[serde(default)]
    pub referrals_count: u32,
    #[serde(default)]
    pub last_reward_label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClubSocialChannels {
    pub club_id: String,
    pub website_url: String,
    pub club_page_url: String,
    pub instagram_handle: String,
    pub instagram_url: String,
    pub facebook_url: String,
    pub tiktok_handle: String,
    pub tiktok_url: String,
    pub youtube_url: String,
    pub google_business_url: String,
    pub google_rating: f64,
    pub google_reviews_count: u32,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SocialPostRecord {
    pub id: String,
    pub club_id: String,
    pub platform: String,
    pub format: String,
    pub title: String,
    pub caption: String,
    pub scheduled_date: String,
    pub status: String,
    pub author_name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteAbsenceMotiveConfig {
    pub id: String,
    pub site_id: String,
    pub label: String,
    pub category: String,
    pub active: bool,
    pub employee_requestable: bool,
    pub included_in_annualization: bool,
    pub requires_document: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteStaffingNeed {
    pub id: String,
    pub site_id: String,
    pub position_id: String,
    pub day_of_week: String,
    pub kind: String,
    pub start_time: String,
    pub end_time: String,
    pub min_headcount: u32,
    pub active: bool,
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppDatabaseState {
    #[serde(default)]
    pub leave_policy: crate::hr_leave_policy::Store,
    #[serde(default)]
    pub lead_scenarios: crate::lead_scenarios::Store,
    #[serde(default)]
    pub personal_workspace: crate::personal_workspace::WorkspaceStore,
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
    #[serde(default)]
    pub lead_forms: Vec<LeadFormRecord>,
    #[serde(default)]
    pub lead_prospects: Vec<LeadProspectRecord>,
    #[serde(default)]
    pub lead_appointments: Vec<LeadAppointmentRecord>,
    #[serde(default)]
    pub lead_activities: Vec<LeadActivityRecord>,
    #[serde(default)]
    pub lead_settings_by_club: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub lead_alerts: Vec<LeadAlertRecord>,
    #[serde(default)]
    pub processed_lead_events: Vec<ProcessedWebhookEvent>,
    #[serde(default)]
    pub lead_scheduler_status: LeadSchedulerStatus,
    // Habilitations nominatives explicites (délégation module par module).
    // Les profils admin/manager conservent leurs accès par défaut ; ces listes
    // permettent d'ouvrir un module à un collaborateur précis sans changer son rôle.
    #[serde(default)]
    pub finance_authorized_employee_ids: Vec<String>,
    #[serde(default)]
    pub recovery_authorized_employee_ids: Vec<String>,
    #[serde(default)]
    pub stock_authorized_employee_ids: Vec<String>,
    #[serde(default)]
    pub reports_authorized_employee_ids: Vec<String>,
    #[serde(default)]
    pub module_delegations: Vec<ModuleDelegation>,
    #[serde(default)]
    pub password_hashes_by_employee: HashMap<String, String>,
    #[serde(default)]
    pub recovery_cases: Vec<RecoveryCaseRecord>,
    #[serde(default)]
    pub stock_items: Vec<StockItemRecord>,
    #[serde(default)]
    pub maintenance_tickets: Vec<MaintenanceTicketRecord>,
    #[serde(default)]
    pub orchestrator_decisions: Vec<OrchestratorDecisionRecord>,
    #[serde(default)]
    pub purchase_orders: Vec<PurchaseOrderRecord>,
    #[serde(default)]
    pub agent_autonomy_modes: HashMap<String, String>,
    #[serde(default)]
    pub missions: Vec<MissionRecord>,
    #[serde(default)]
    pub heitz_members: Vec<HeitzMemberRecord>,
    #[serde(default)]
    pub social_channels_by_club: HashMap<String, ClubSocialChannels>,
    #[serde(default)]
    pub social_posts: Vec<SocialPostRecord>,
    #[serde(default)]
    pub clock_terminals: Vec<crate::clock_terminals::ClockTerminal>,
    #[serde(default)]
    pub punch_photos: Vec<crate::punch_photos::PunchPhotoRecord>,
    #[serde(default)]
    pub photo_policy_by_club: HashMap<String, String>,
    #[serde(default)]
    pub course_occurrences: Vec<crate::course_attendance::CourseOccurrence>,
    #[serde(default)]
    pub course_attendances: Vec<crate::course_attendance::CourseAttendanceRecord>,
    #[serde(default)]
    pub club_displays: Vec<crate::club_displays::ClubDisplayScreen>,
    #[serde(default)]
    pub employee_counter_history: Vec<CounterAdjustmentRecord>,
    #[serde(default)]
    pub site_absence_motives: Vec<SiteAbsenceMotiveConfig>,
    #[serde(default)]
    pub site_staffing_needs: Vec<SiteStaffingNeed>,
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
