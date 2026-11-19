export type Scope = 'self' | 'teams' | 'sites';

export type PermissionControlState =
  | 'non_propose'
  | 'decoche'
  | 'grise_desactive'
  | 'autorise';

export type PlanningLockState = 'none' | 'blue' | 'green' | 'red';

export type ProfileId =
  | 'admin_systeme'
  | 'master_avance'
  | 'lecture_seule_avancee'
  | 'planificateur_avance'
  | 'planificateur_standard'
  | 'employe_standard';

export type McSectionId =
  | 'MC01'
  | 'MC02'
  | 'MC03'
  | 'MC04'
  | 'MC05'
  | 'MC06'
  | 'MC07'
  | 'MC08'
  | 'MC09'
  | 'MC10'
  | 'MC11'
  | 'MC12'
  | 'MC13';

export interface PermissionRow {
  actionId: string; // ORG04-01 .. ORG04-44
  label: string;
  group: string;
  exposed: boolean;
  checked: boolean | null;
  disabled: boolean | null;
  editableControl: boolean;
}

export interface RoleProfile {
  id: ProfileId;
  name: string;
  sourceScreen: string;
  scopeSelected: Scope;
  scopeOptions: Scope[];
  scopeEditable: boolean;
  cardOtherActionsCount: number;
  exposedActionCount: number;
  rows: PermissionRow[];
}

export interface Organization {
  id: string;
  name: string;
  legalName: string;
  siren: string;
  vatNumber: string;
  sector: string;
  contactEmail: string;
  mealAllowanceEur: number;
  billingNotice: string; // Référence ORG02 à arbitrer
}

export interface SiteHrSettings {
  badgeFrequency: 'each_shift' | 'consecutive_shift_series';
  tabletBreakBadging: boolean;
  dayStartHour: string;
  breakAlertHours: number;
  breakAlertEnabled: boolean;
  consecutiveDaysBlocking: boolean;
  complementaryMaxHours: number;
  smartPlannerBreakMaxHours: number;
  alertsLayout: 'split_13_6' | 'single_list';
  missionsModuleActive: boolean;
  reportRulesVisible: boolean;
  annualizationPeriod: string;
  acquisitionMode: 'jours_ouvrables' | 'jours_ouvres' | 'jours_calendaires';
  annualizationTotalMotives: number;
  annualizationIncludedMotives: number;
  sundayHoursInAnnualization: boolean;
  rttHoursCounterActive: boolean;
}

export interface Site {
  id: string;
  name: string;
  address: string;
  city: string;
  timezone: string;
  siret: string;
  settings: SiteHrSettings;
}

export interface Position {
  id: string; // ID technique obligatoire (doublons de libellés observés sur PAR17)
  siteId: string;
  label: string;
  color: string;
  defaultBreakMinutes: number;
  active: boolean;
}

export interface Team {
  id: string;
  siteId: string;
  name: string;
}

export interface EmployeeSiteAccess {
  siteId: string;
  isPrimary: boolean;
  profileId: ProfileId;
  showOnPlanning: boolean;
  teamIds: string[];
  managedTeamIds?: string[];
  positionIds: string[];
}

export interface SensitiveBankInfo {
  paymentMode: 'Virement' | 'Chèque';
  ibanMasked: string;
  bic: string;
  nirMasked: string;
}

export interface ContractSummary {
  id: string;
  siteId: string;
  contractType: 'CDI' | 'CDD' | 'Alternance';
  regime: 'hours' | 'forfait_jours';
  weeklyHours?: number;
  annualDays?: number;
  monthlyGrossEur: number;
  hourlyRateEur: number;
  loadedCostFactor: number;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface EmployeeCounter {
  cpNAcquired: number;
  cpNTaken: number;
  cpNMinus1Remaining: number;
  rttDaysRemaining?: number;
  annualizationBalanceHours?: number;
}

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  birthName?: string;
  matricule: string;
  email: string;
  phone: string;
  active: boolean;
  hrFileStatus: 'complete' | 'pending_employee' | 'incomplete_payroll';
  siteAccesses: EmployeeSiteAccess[];
  sensitiveBank: SensitiveBankInfo;
  contract: ContractSummary;
  counter: EmployeeCounter;
}

export interface Shift {
  id: string;
  siteId: string;
  date: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  breakMinutes: number;
  employeeId: string | null; // null = shift non assigné (TST04)
  positionId: string;
  missionLabel?: string;
  tasks: string[];
  lockState: PlanningLockState;
  published: boolean;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  siteId: string;
  motive: string;
  startDate: string;
  endDate: string;
  status: 'pending' | 'accepted' | 'refused' | 'cancelled';
  comment: string;
}

export interface TimeclockAnomaly {
  id: string;
  employeeId: string;
  siteId: string;
  date: string;
  plannedRange: string;
  punchedRange: string;
  deltaMinutes: number;
  hasProofPhoto: boolean;
  status: 'to_review' | 'validated' | 'ignored';
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actionType: string;
  summary: string;
  siteId: string | 'org';
  targetLabel: string;
  beforeSummary?: string;
  afterSummary?: string;
}

export interface UserPreferences {
  language: string;
  notifications: {
    emailEnabled: boolean;
    smsEnabled: boolean;
    frequency: 'immediate' | 'daily' | 'weekly';
    digestHour: string;
    includeActivityReport: boolean;
  };
  calendarFeedToken: string;
  calendarFeedEnabled: boolean;
  ssoEnabled: boolean;
  ssoProvider: string;
  ssoDomain: string;
}

export interface SiteKpis {
  siteId: string;
  periodLabel: string;
  revenueEur: number | null; // null = donnée absente distincte de 0 (TST24)
  productivityPerHour: number | null;
  payrollMassEur: number | null;
  workedHours: number | null;
}

export interface AmbiguityRecord {
  id: string; // AMB14-01 .. AMB14-10
  title: string;
  description: string;
  decisionStatus: 'open' | 'decided';
  resolutionNote: string;
}

export interface AppDatabaseState {
  version: string;
  organization: Organization;
  sites: Site[];
  positions: Position[];
  teams: Team[];
  profiles: RoleProfile[];
  employees: Employee[];
  shifts: Shift[];
  leaveRequests: LeaveRequest[];
  anomalies: TimeclockAnomaly[];
  kpis: SiteKpis[];
  auditLog: AuditEvent[];
  preferencesByEmployee: Record<string, UserPreferences>;
  ambiguities: AmbiguityRecord[];
  org02BillingPolicy: 'exclude_skello_saas' | 'keep_internal_admin';
}

export interface SessionContext {
  employee: Employee;
  activeSiteId: string | 'all';
  activeAccess: EmployeeSiteAccess;
  activeProfile: RoleProfile;
  resolvedPermissions: Record<
    string,
    {
      state: PermissionControlState;
      allowed: boolean;
      scope: Scope;
    }
  >;
  visibleSections: McSectionId[];
}

export interface PermissionCheckResult {
  allowed: boolean;
  state: PermissionControlState;
  effectiveScope: Scope;
  reason: string;
}

export interface RedactedEmployeeView {
  id: string;
  firstName: string;
  lastName: string;
  matricule: string;
  active: boolean;
  hrFileStatus: Employee['hrFileStatus'];
  siteAccesses: EmployeeSiteAccess[];
  counter: EmployeeCounter;
  // Champs protégés : absents/redacted côté serveur si ORG04-10 non accordé sur la cible
  email?: string;
  phone?: string;
  sensitiveBank?: SensitiveBankInfo | null;
  contract?: Omit<ContractSummary, 'monthlyGrossEur' | 'hourlyRateEur'> & {
    monthlyGrossEur?: number | null;
    hourlyRateEur?: number | null;
  };
}
