import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  DatabaseBackup,
  Download,
  History,
  KeyRound,
  Lock,
  Plus,
  Save,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useEffect, useState, type ChangeEvent } from 'react';
import { useCfos } from '../context/CfosContext';
import { cleanUiTree } from '../domain/cleanModeSanitizer';
import type { DashboardPayload } from '../domain/apiEngine';
import { ApiClientError, clientApi, type ApiAuthContext } from '../domain/clientApi';
import {
  EMPLOYEE_CSV_TEMPLATE,
  getProfileDisplayLabel,
  parseEmployeesCsv,
} from '../domain/employeeCsv';
import { getControlState } from '../domain/rbac';
import type {
  AppDatabaseState,
  AuditEvent,
  ProfileId,
  RoleProfile,
  Scope,
} from '../domain/types';

interface AdminRightsViewProps {
  auth: ApiAuthContext;
  dashboard: DashboardPayload;
  onRefreshDashboard: () => Promise<void>;
}

type AdminTab =
  | 'org_sites'
  | 'permissions'
  | 'delegations_security'
  | 'import_csv'
  | 'audit'
  | 'backup';

type DelegationModuleId = 'finances' | 'reports' | 'recovery' | 'stocks';
type DelegationActionId = 'view' | 'edit' | 'export';

interface ModuleDelegationRecord {
  employeeId: string;
  siteId: string;
  module: DelegationModuleId;
  actions: string[];
}

const DELEGATION_MODULES: Array<{ id: DelegationModuleId; label: string }> = [
  { id: 'finances', label: 'Finances & Pilotage' },
  { id: 'reports', label: 'Rapports & Exports' },
  { id: 'recovery', label: 'Recouvrement impayés' },
  { id: 'stocks', label: 'Stocks & Achats' },
];

const DELEGATION_ACTIONS: Array<{ id: DelegationActionId; label: string }> = [
  { id: 'view', label: 'Lecture' },
  { id: 'edit', label: 'Modification' },
  { id: 'export', label: 'Export' },
];

function resolveAdminBearer(auth: ApiAuthContext): string | null {
  if (auth.token && auth.token.trim().length > 0) {
    return auth.token.trim();
  }
  if (typeof window === 'undefined') return null;
  try {
    const storedToken = window.sessionStorage.getItem('cfos_bearer_token');
    const storedActor = window.sessionStorage.getItem('cfos_bearer_actor_id');
    if (storedToken && storedActor === auth.actorId) {
      return storedToken;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

async function adminFetchJson<T>(
  path: string,
  auth: ApiAuthContext,
  init?: RequestInit
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('x-cfitness-actor-id', auth.actorId);
  headers.set('x-cfitness-site-id', auth.siteId);
  const bearer = resolveAdminBearer(auth);
  if (bearer && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${bearer}`);
  }
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    let errMsg = `Erreur serveur HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload?.error) errMsg = payload.error;
    } catch {
      // Garde le message HTTP générique si réponse non JSON
    }
    throw new ApiClientError(response.status, errMsg);
  }
  return (await response.json()) as T;
}

const STATE_BADGES: Record<
  ReturnType<typeof getControlState>,
  { label: string; cls: string }
> = {
  autorise: {
    label: 'Autorisé',
    cls: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
  },
  decoche: {
    label: 'Décoché (éditable)',
    cls: 'bg-slate-700/40 text-slate-300 border border-slate-600/50',
  },
  grise_desactive: {
    label: 'Grisé verrouillé',
    cls: 'bg-amber-500/15 text-amber-300 border border-amber-500/35',
  },
  non_propose: {
    label: 'Non proposé',
    cls: 'bg-slate-900/70 text-slate-500 border border-slate-800',
  },
};

export function AdminRightsView({
  auth,
  dashboard,
  onRefreshDashboard,
}: AdminRightsViewProps) {
  const { isTechnicalMode } = useCfos();
  const [activeTab, setActiveTab] = useState<AdminTab>('permissions');
  const [statusMsg, setStatusMsg] = useState<{
    kind: 'ok' | 'err';
    text: string;
  } | null>(null);

  // État ORG01 / ORG02
  const [orgForm, setOrgForm] = useState(dashboard.organization);
  const [org02Policy, setOrg02Policy] = useState<
    AppDatabaseState['org02BillingPolicy']
  >(dashboard.org02BillingPolicy);

  // État Matrice de droits (ORG03 / ORG04 / DRO01-05)
  const [profiles, setProfiles] = useState<RoleProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] =
    useState<ProfileId>('planificateur_standard');
  const [draftScope, setDraftScope] = useState<Scope>('teams');
  const [draftChecks, setDraftChecks] = useState<Record<string, boolean>>({});
  const [loadingProfiles, setLoadingProfiles] = useState(false);

  // État Journal JOU01
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditQuery, setAuditQuery] = useState('');
  const [auditActionType, setAuditActionType] = useState('ALL');
  const [auditSiteFilter, setAuditSiteFilter] = useState('all');

  // État Backup / Restore TST28
  const [backupPreview, setBackupPreview] = useState('');
  const [restoreInput, setRestoreInput] = useState('');

  // État Délégations structurées & Mots de passe serveur
  const [delegations, setDelegations] = useState<ModuleDelegationRecord[]>([]);
  const [delegationsDirty, setDelegationsDirty] = useState(false);
  const [savingDelegations, setSavingDelegations] = useState(false);
  const [delEmpId, setDelEmpId] = useState<string>('');
  const [delSiteId, setDelSiteId] = useState<string>('');
  const [delModule, setDelModule] = useState<DelegationModuleId>('finances');
  const [delActions, setDelActions] = useState<DelegationActionId[]>(['view']);
  const [resetEmpId, setResetEmpId] = useState<string>('');
  const [resetPwd, setResetPwd] = useState('');
  const [resetPwdConfirm, setResetPwdConfirm] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // État Import CSV collaborateurs
  const [csvInput, setCsvInput] = useState('');
  const [importingCsv, setImportingCsv] = useState(false);
  const [importReport, setImportReport] = useState<{
    createdCount: number;
    skippedCount: number;
    errors: string[];
  } | null>(null);

  // État Fiche & activation compte collaborateur
  const [editEmpId, setEditEmpId] = useState<string>('');
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editMatricule, setEditMatricule] = useState('');
  const [editContractType, setEditContractType] = useState('CDI');
  const [editWeeklyHours, setEditWeeklyHours] = useState('35');
  const [savingEmployeeEdit, setSavingEmployeeEdit] = useState(false);

  useEffect(() => {
    setOrgForm(dashboard.organization);
    setOrg02Policy(dashboard.org02BillingPolicy);
  }, [dashboard.organization, dashboard.org02BillingPolicy]);

  async function loadProfiles() {
    setLoadingProfiles(true);
    try {
      const data = await clientApi.getAdminProfiles(auth);
      setProfiles(data);
      const current =
        data.find((p) => p.id === selectedProfileId) ?? data[0];
      if (current) {
        hydrateProfileDraft(current);
      }
    } catch (e) {
      setStatusMsg({
        kind: 'err',
        text: e instanceof Error ? e.message : 'Erreur lecture matrice droits.',
      });
    } finally {
      setLoadingProfiles(false);
    }
  }

  function hydrateProfileDraft(profile: RoleProfile) {
    setSelectedProfileId(profile.id);
    setDraftScope(profile.scopeSelected);
    const checks: Record<string, boolean> = {};
    for (const row of profile.rows) {
      if (row.exposed) {
        checks[row.actionId] = Boolean(row.checked);
      }
    }
    setDraftChecks(checks);
  }

  async function loadAudit() {
    try {
      const events = await clientApi.getAuditLog(auth, {
        query: auditQuery,
        actionType: auditActionType,
        siteFilter: auditSiteFilter,
      });
      setAuditEvents(events);
    } catch (e) {
      setStatusMsg({
        kind: 'err',
        text: e instanceof Error ? e.message : 'Erreur lecture journal JOU01.',
      });
    }
  }

  async function loadDelegations() {
    try {
      const data = await adminFetchJson<ModuleDelegationRecord[]>(
        '/api/admin/delegations',
        auth
      );
      setDelegations(Array.isArray(data) ? data : []);
      setDelegationsDirty(false);
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 403) {
        return;
      }
      setStatusMsg({
        kind: 'err',
        text:
          e instanceof Error
            ? e.message
            : 'Erreur lecture des délégations par club.',
      });
    }
  }

  useEffect(() => {
    void loadProfiles();
    void loadAudit();
    void loadDelegations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.actorId, auth.siteId]);

  useEffect(() => {
    const visible = dashboard.visibleEmployees;
    if (visible.length === 0) return;

    const currentDelEmp = visible.find((e) => e.id === delEmpId) ?? visible[0];
    if (currentDelEmp && currentDelEmp.id !== delEmpId) {
      setDelEmpId(currentDelEmp.id);
    }
    if (currentDelEmp) {
      const attachedSiteIds = currentDelEmp.siteAccesses.map((a) => a.siteId);
      if (!attachedSiteIds.includes(delSiteId)) {
        const preferredSite =
          auth.siteId !== 'all' && attachedSiteIds.includes(auth.siteId)
            ? auth.siteId
            : (attachedSiteIds[0] ?? dashboard.sites[0]?.id ?? 'club-carre-soie');
        setDelSiteId(preferredSite);
      }
    }

    if (!visible.some((e) => e.id === resetEmpId)) {
      setResetEmpId(visible[0].id);
    }

    const editTarget = visible.find((e) => e.id === editEmpId) ?? visible[0];
    if (editTarget && editTarget.id !== editEmpId) {
      hydrateEmployeeEditForm(editTarget);
    }
  }, [
    dashboard.visibleEmployees,
    dashboard.sites,
    auth.siteId,
    delEmpId,
    delSiteId,
    resetEmpId,
    editEmpId,
  ]);

  function hydrateEmployeeEditForm(
    emp: DashboardPayload['visibleEmployees'][number]
  ) {
    setEditEmpId(emp.id);
    setEditFirstName(emp.firstName);
    setEditLastName(emp.lastName);
    setEditEmail(emp.email ?? '');
    setEditPhone(emp.phone ?? '');
    setEditMatricule(emp.matricule);
    setEditContractType(emp.contract?.contractType ?? 'CDI');
    setEditWeeklyHours(
      emp.contract?.weeklyHours !== undefined
        ? String(emp.contract.weeklyHours)
        : '35'
    );
  }

  const activeProfileObj = profiles.find((p) => p.id === selectedProfileId);
  const csSite = dashboard.sites.find((s) => s.id === 'club-carre-soie');
  const beySite = dashboard.sites.find((s) => s.id === 'club-beynost');
  const entretienDuplicates = dashboard.positions.filter(
    (p) => p.label === 'Entretien'
  );

  async function handleSaveOrg() {
    setStatusMsg(null);
    try {
      await clientApi.updateOrganization(auth, orgForm);
      await onRefreshDashboard();
      await loadAudit();
      setStatusMsg({
        kind: 'ok',
        text: 'Organisation ORG01 mise à jour et tracée dans JOU01.',
      });
    } catch (e) {
      const msg = e instanceof ApiClientError ? e.message : String(e);
      setStatusMsg({ kind: 'err', text: msg });
    }
  }

  async function handleChangeOrg02(
    policy: AppDatabaseState['org02BillingPolicy']
  ) {
    setStatusMsg(null);
    try {
      const res = await clientApi.updateOrg02Policy(auth, policy);
      setOrg02Policy(res.policy);
      await onRefreshDashboard();
      await loadAudit();
      setStatusMsg({
        kind: 'ok',
        text: `Décision périmètre ORG02 enregistrée : ${res.policy}`,
      });
    } catch (e) {
      const msg = e instanceof ApiClientError ? e.message : String(e);
      setStatusMsg({ kind: 'err', text: msg });
    }
  }

  async function handleSaveProfile() {
    if (!activeProfileObj) return;
    setStatusMsg(null);
    try {
      const updated = await clientApi.updateRoleProfile(
        auth,
        activeProfileObj.id,
        draftScope,
        draftChecks
      );
      setProfiles((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p))
      );
      hydrateProfileDraft(updated);
      await onRefreshDashboard();
      await loadAudit();
      setStatusMsg({
        kind: 'ok',
        text: `Profil « ${updated.name} » enregistré côté serveur (effet immédiat TST35 & trace JOU01).`,
      });
    } catch (e) {
      const msg =
        e instanceof ApiClientError
          ? `HTTP ${e.status} — ${e.message}`
          : String(e);
      setStatusMsg({ kind: 'err', text: msg });
    }
  }

  async function handleExportCsv() {
    setStatusMsg(null);
    try {
      const csv = await clientApi.downloadAuditCsv(auth);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'cfitness_journal_activite_fictif.csv';
      link.click();
      URL.revokeObjectURL(url);
      setStatusMsg({
        kind: 'ok',
        text: 'Export CSV du journal JOU01 généré (ADM14-J01).',
      });
    } catch (e) {
      setStatusMsg({
        kind: 'err',
        text: e instanceof Error ? e.message : 'Échec export CSV.',
      });
    }
  }

  async function handleExportBackup() {
    setStatusMsg(null);
    try {
      const res = await clientApi.exportBackup(auth);
      setBackupPreview(res.backupJson);
      setRestoreInput(res.backupJson);
      setStatusMsg({
        kind: 'ok',
        text: 'Sauvegarde JSON complète générée côté serveur (TST28).',
      });
    } catch (e) {
      setStatusMsg({
        kind: 'err',
        text: e instanceof Error ? e.message : 'Export refusé.',
      });
    }
  }

  async function handleRestoreBackup() {
    setStatusMsg(null);
    try {
      const res = await clientApi.restoreBackup(auth, restoreInput);
      await onRefreshDashboard();
      await loadProfiles();
      await loadAudit();
      setStatusMsg({
        kind: 'ok',
        text: `Restauration validée côté serveur à ${res.restoredAt} (TST28).`,
      });
    } catch (e) {
      setStatusMsg({
        kind: 'err',
        text: e instanceof Error ? e.message : 'Restauration échouée.',
      });
    }
  }

  function handleSelectDelEmployee(nextEmpId: string) {
    setDelEmpId(nextEmpId);
    const emp = dashboard.visibleEmployees.find((e) => e.id === nextEmpId);
    if (!emp) return;
    const attachedIds = emp.siteAccesses.map((a) => a.siteId);
    if (!attachedIds.includes(delSiteId)) {
      const preferredSite =
        auth.siteId !== 'all' && attachedIds.includes(auth.siteId)
          ? auth.siteId
          : (attachedIds[0] ?? delSiteId);
      setDelSiteId(preferredSite);
    }
  }

  function handleToggleDelAction(action: DelegationActionId) {
    setDelActions((prev) =>
      prev.includes(action)
        ? prev.filter((item) => item !== action)
        : [...prev, action]
    );
  }

  function handleAddOrUpdateDelegation() {
    setStatusMsg(null);
    if (!delEmpId || !delSiteId) {
      setStatusMsg({
        kind: 'err',
        text: 'Sélectionnez un collaborateur et un établissement.',
      });
      return;
    }
    if (delActions.length === 0) {
      setStatusMsg({
        kind: 'err',
        text: 'Sélectionnez au moins une action autorisée (Lecture, Modification ou Export).',
      });
      return;
    }
    const cleanActions = [...delActions].sort();
    setDelegations((prev) => {
      const existingIdx = prev.findIndex(
        (d) =>
          d.employeeId === delEmpId &&
          d.siteId === delSiteId &&
          d.module === delModule
      );
      const nextEntry: ModuleDelegationRecord = {
        employeeId: delEmpId,
        siteId: delSiteId,
        module: delModule,
        actions: cleanActions,
      };
      if (existingIdx >= 0) {
        return prev.map((row, idx) => (idx === existingIdx ? nextEntry : row));
      }
      return [...prev, nextEntry];
    });
    setDelegationsDirty(true);
  }

  function handleRemoveDelegation(idxToRemove: number) {
    setDelegations((prev) => prev.filter((_, idx) => idx !== idxToRemove));
    setDelegationsDirty(true);
  }

  async function handleSaveDelegations() {
    setStatusMsg(null);
    setSavingDelegations(true);
    try {
      const saved = await adminFetchJson<ModuleDelegationRecord[]>(
        '/api/admin/delegations',
        auth,
        {
          method: 'PUT',
          body: JSON.stringify({ delegations }),
        }
      );
      setDelegations(Array.isArray(saved) ? saved : []);
      setDelegationsDirty(false);
      await onRefreshDashboard();
      await loadAudit();
      setStatusMsg({
        kind: 'ok',
        text: `Délégations par club enregistrées côté serveur (${Array.isArray(saved) ? saved.length : 0} règle(s)).`,
      });
    } catch (e) {
      const msg =
        e instanceof ApiClientError
          ? `HTTP ${e.status} — ${e.message}`
          : String(e);
      setStatusMsg({ kind: 'err', text: msg });
    } finally {
      setSavingDelegations(false);
    }
  }

  async function handleResetEmployeePassword() {
    setStatusMsg(null);
    const cleanPwd = resetPwd.trim();
    const cleanConfirm = resetPwdConfirm.trim();
    if (!resetEmpId) {
      setStatusMsg({
        kind: 'err',
        text: 'Sélectionnez le collaborateur cible.',
      });
      return;
    }
    if (cleanPwd.length < 12) {
      setStatusMsg({
        kind: 'err',
        text: 'Le nouveau mot de passe doit comporter au moins 12 caractères.',
      });
      return;
    }
    if (cleanPwd !== cleanConfirm) {
      setStatusMsg({
        kind: 'err',
        text: 'Les deux saisies du mot de passe ne correspondent pas.',
      });
      return;
    }
    setSavingPassword(true);
    try {
      await adminFetchJson<{ ok: boolean; employeeId: string }>(
        `/api/admin/employees/${encodeURIComponent(resetEmpId)}/password`,
        auth,
        {
          method: 'PUT',
          body: JSON.stringify({ newSecret: cleanPwd }),
        }
      );
      setResetPwd('');
      setResetPwdConfirm('');
      await loadAudit();
      const targetEmp = dashboard.visibleEmployees.find(
        (e) => e.id === resetEmpId
      );
      const targetLabel = targetEmp
        ? `${targetEmp.firstName} ${targetEmp.lastName}`
        : resetEmpId;
      setStatusMsg({
        kind: 'ok',
        text: `Mot de passe serveur mis à jour pour ${targetLabel} ; ses sessions actives ont été révoquées.`,
      });
    } catch (e) {
      const msg =
        e instanceof ApiClientError
          ? `HTTP ${e.status} — ${e.message}`
          : String(e);
      setStatusMsg({ kind: 'err', text: msg });
    } finally {
      setSavingPassword(false);
    }
  }

  const parsedCsv = parseEmployeesCsv(csvInput);

  function handleDownloadCsvTemplate() {
    const blob = new Blob(['\uFEFF' + EMPLOYEE_CSV_TEMPLATE], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modele_collaborateurs_cfitness.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleCsvFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCsvInput(reader.result);
        setImportReport(null);
      }
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  }

  async function handleImportCsvSubmit() {
    setStatusMsg(null);
    setImportReport(null);
    const validRows = parsedCsv.rows
      .filter((r) => r.errors.length === 0)
      .map((r) => r.payload);
    if (validRows.length === 0) {
      setStatusMsg({
        kind: 'err',
        text: 'Aucune ligne valide à importer dans le CSV.',
      });
      return;
    }

    setImportingCsv(true);
    try {
      const res = await adminFetchJson<{
        ok: boolean;
        createdCount: number;
        skippedCount: number;
        createdIds: string[];
        errors: string[];
      }>('/api/admin/employees/import-csv', auth, {
        method: 'POST',
        body: JSON.stringify({ rows: validRows }),
      });
      setImportReport({
        createdCount: res.createdCount,
        skippedCount: res.skippedCount,
        errors: Array.isArray(res.errors) ? res.errors : [],
      });
      await onRefreshDashboard();
      await loadAudit();
      setStatusMsg({
        kind: 'ok',
        text: `Import CSV terminé : ${res.createdCount} collaborateur(s) créé(s), ${res.skippedCount} doublon(s) ignoré(s).`,
      });
    } catch (e) {
      const msg =
        e instanceof ApiClientError
          ? `HTTP ${e.status} — ${e.message}`
          : String(e);
      setStatusMsg({ kind: 'err', text: msg });
    } finally {
      setImportingCsv(false);
    }
  }

  async function patchEmployeeLifecycle(
    empId: string,
    payload: Record<string, unknown>,
    successMessage: string
  ) {
    setStatusMsg(null);
    setSavingEmployeeEdit(true);
    try {
      const res = await adminFetchJson<{
        ok: boolean;
        employee: {
          id: string;
          firstName: string;
          lastName: string;
          email: string;
          phone: string;
          matricule: string;
          active: boolean;
          contractType: string;
          weeklyHours?: number | null;
        };
      }>(`/api/admin/employees/${encodeURIComponent(empId)}`, auth, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      await onRefreshDashboard();
      await loadAudit();
      if (res.employee) {
        setEditFirstName(res.employee.firstName);
        setEditLastName(res.employee.lastName);
        setEditEmail(res.employee.email);
        setEditPhone(res.employee.phone);
        setEditMatricule(res.employee.matricule);
        setEditContractType(res.employee.contractType);
        if (res.employee.weeklyHours) {
          setEditWeeklyHours(String(res.employee.weeklyHours));
        }
      }
      setStatusMsg({ kind: 'ok', text: successMessage });
    } catch (e) {
      const msg =
        e instanceof ApiClientError
          ? `HTTP ${e.status} — ${e.message}`
          : String(e);
      setStatusMsg({ kind: 'err', text: msg });
    } finally {
      setSavingEmployeeEdit(false);
    }
  }

  async function handleSaveEmployeeDetails() {
    if (!editEmpId) return;
    const hours = Number.parseInt(editWeeklyHours, 10);
    await patchEmployeeLifecycle(
      editEmpId,
      {
        firstName: editFirstName,
        lastName: editLastName,
        email: editEmail,
        phone: editPhone,
        matricule: editMatricule,
        contractType: editContractType,
        ...(Number.isFinite(hours) && hours > 0 ? { weeklyHours: hours } : {}),
      },
      `Fiche collaborateur mise à jour pour ${editFirstName} ${editLastName}.`
    );
  }

  async function handleToggleEmployeeActive(nextActive: boolean) {
    if (!editEmpId) return;
    await patchEmployeeLifecycle(
      editEmpId,
      { active: nextActive },
      nextActive
        ? `Compte réactivé pour ${editFirstName} ${editLastName}.`
        : `Compte désactivé pour ${editFirstName} ${editLastName} ; ses sessions actives ont été révoquées.`
    );
  }

  return cleanUiTree(
    <div className="space-y-5">
      <div className="cf-card p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          {isTechnicalMode && (
            <div className="text-xs cf-mono text-violet-300">
              MC11 • ORG01–ORG04 • DRO01–DRO05 • JOU01
            </div>
          )}
          <h1 className="text-xl font-bold mt-0.5">
            Organisation, Établissements &amp; Droits d&apos;accès
          </h1>
          <p className="text-xs cf-muted mt-1">
            {isTechnicalMode
              ? 'Toutes les vérifications d’élévation de privilèges (TST34), révocations (TST35) et écritures sont contrôlées côté serveur.'
              : 'Gestion des profils, des établissements et de la sécurité des accès.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'permissions' as const, label: isTechnicalMode ? 'Matrice Droits (6×44)' : 'Droits & Rôles', icon: ShieldCheck },
            { id: 'delegations_security' as const, label: 'Comptes, Délégations & Mots de passe', icon: KeyRound },
            { id: 'import_csv' as const, label: 'Import CSV collaborateurs', icon: Upload },
            { id: 'org_sites' as const, label: 'Organisation & Clubs', icon: Building2 },
            { id: 'audit' as const, label: isTechnicalMode ? 'Journal JOU01 & CSV' : 'Journal d’activité', icon: History },
            { id: 'backup' as const, label: isTechnicalMode ? 'Sauvegarde TST28' : 'Sauvegarde', icon: DatabaseBackup },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2 rounded-btn text-xs font-medium flex items-center gap-1.5 transition-all ${
                  active
                    ? 'cf-brand-gradient text-white shadow-sm'
                    : 'cf-card-secondary hover:border-violet-500/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-4 rounded-card border text-xs flex items-center gap-2.5 ${
            statusMsg.kind === 'ok'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              : 'bg-red-950/50 border-red-500/50 text-red-200'
          }`}
        >
          {statusMsg.kind === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Onglet 1 : Matrice des 6 profils × 44 actions */}
      {activeTab === 'permissions' && (
        <div className="space-y-4">
          <div className="cf-card-secondary p-3.5 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-amber-300">Note AMB14-06 :</strong> La
              carte « Administrateur système » de l’écran ORG04 annonce « +53
              autres actions » (total théorique 55) alors que le panneau
              détaillé canonique expose <strong>44 lignes vérifiées</strong>{' '}
              (ORG04-01 à ORG04-44). Les 11 actions non observées ne sont jamais
              inventées.
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Liste des 6 profils */}
            <div className="cf-card p-3 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider cf-muted px-2 py-1">
                6 Profils canoniques ({profiles.length})
              </div>
              {loadingProfiles ? (
                <div className="text-xs cf-muted p-2">Chargement...</div>
              ) : (
                profiles.map((prof) => {
                  const selected = prof.id === selectedProfileId;
                  const authorizedCount = prof.rows.filter(
                    (r) => getControlState(r) === 'autorise'
                  ).length;
                  return (
                    <button
                      key={prof.id}
                      type="button"
                      onClick={() => hydrateProfileDraft(prof)}
                      className={`w-full text-left p-3 rounded-btn transition-all border ${
                        selected
                          ? 'cf-brand-gradient text-white border-transparent'
                          : 'cf-card-secondary hover:border-violet-500/50'
                      }`}
                    >
                      <div className="font-semibold text-xs">{prof.name}</div>
                      <div
                        className={`text-[11px] mt-1 flex items-center justify-between ${
                          selected ? 'text-white/85' : 'cf-muted'
                        }`}
                      >
                        <span className="cf-mono">{prof.sourceScreen}</span>
                        <span>
                          {authorizedCount}/{prof.exposedActionCount} actives
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Panneau détaillé 44 actions */}
            {activeProfileObj && (
              <div className="cf-card p-4 lg:col-span-3 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--cf-border)]">
                  <div>
                    <h2 className="font-bold text-base">
                      {activeProfileObj.name}
                    </h2>
                    <p className="text-xs cf-muted">
                      Source {activeProfileObj.sourceScreen} • Actions exposées
                      : {activeProfileObj.exposedActionCount} / 44
                      {activeProfileObj.cardOtherActionsCount > 0
                        ? ` (+${activeProfileObj.cardOtherActionsCount} carte)`
                        : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      htmlFor="scope-draft"
                      className="text-xs cf-muted font-medium"
                    >
                      Portée :
                    </label>
                    <select
                      id="scope-draft"
                      disabled={!activeProfileObj.scopeEditable}
                      value={draftScope}
                      onChange={(e) => setDraftScope(e.target.value as Scope)}
                      className="cf-input text-xs px-2.5 py-1.5 cf-mono disabled:opacity-50"
                    >
                      {(['self', 'teams', 'sites'] as Scope[]).map((sc) => (
                        <option key={sc} value={sc}>
                          {sc}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={handleSaveProfile}
                      className="cf-brand-gradient text-white text-xs font-semibold px-3.5 py-2 rounded-btn flex items-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Enregistrer droits
                    </button>
                  </div>
                </div>

                {/* Légende 4 états */}
                <div className="flex flex-wrap gap-2 text-[11px]">
                  {(['autorise', 'decoche', 'grise_desactive', 'non_propose'] as const).map(
                    (st) => (
                      <span
                        key={st}
                        className={`px-2 py-0.5 rounded-full cf-mono ${STATE_BADGES[st].cls}`}
                      >
                        {STATE_BADGES[st].label}
                      </span>
                    )
                  )}
                </div>

                <div className="max-h-[480px] overflow-y-auto pr-1 space-y-1.5">
                  {activeProfileObj.rows.map((row) => {
                    const effectiveChecked = row.exposed
                      ? draftChecks[row.actionId] ?? Boolean(row.checked)
                      : null;
                    const simRow = {
                      ...row,
                      checked: effectiveChecked,
                    };
                    const state = getControlState(simRow);
                    const badge = STATE_BADGES[state];
                    const canToggle = row.exposed && row.editableControl;

                    return (
                      <label
                        key={row.actionId}
                        className={`flex items-center justify-between gap-3 p-2.5 rounded-btn border text-xs ${
                          !row.exposed
                            ? 'opacity-50 border-slate-800/70 bg-slate-950/30'
                            : 'cf-card-secondary'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            disabled={!canToggle}
                            checked={Boolean(effectiveChecked)}
                            onChange={(e) =>
                              setDraftChecks((prev) => ({
                                ...prev,
                                [row.actionId]: e.target.checked,
                              }))
                            }
                            className="rounded accent-violet-500 disabled:opacity-40"
                          />
                          <div className="min-w-0">
                            <div className="font-medium truncate">
                              <span className="cf-mono text-[11px] text-violet-300 mr-2">
                                {row.actionId}
                              </span>
                              {row.label}
                            </div>
                            <div className="text-[10px] cf-muted">{row.group}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {row.disabled && (
                            <Lock className="w-3.5 h-3.5 text-amber-400" />
                          )}
                          <span
                            className={`text-[10px] cf-mono px-2 py-0.5 rounded-full ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Onglet 2 : Organisation ORG01, ORG02 et comparaison Carré de Soie vs Beynost */}
      {activeTab === 'org_sites' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Fiche ORG01 */}
            <div className="cf-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm">
                  Organisation (ORG01 — ORG04-32 requis)
                </h2>
                <button
                  type="button"
                  onClick={handleSaveOrg}
                  className="cf-brand-gradient text-white text-xs font-semibold px-3 py-1.5 rounded-btn flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  Enregistrer
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="cf-muted block mb-1">Nom affiché</label>
                  <input
                    type="text"
                    value={orgForm.name}
                    onChange={(e) =>
                      setOrgForm((p) => ({ ...p, name: e.target.value }))
                    }
                    className="cf-input w-full px-3 py-2"
                  />
                </div>
                <div>
                  <label className="cf-muted block mb-1">Raison sociale</label>
                  <input
                    type="text"
                    value={orgForm.legalName}
                    onChange={(e) =>
                      setOrgForm((p) => ({ ...p, legalName: e.target.value }))
                    }
                    className="cf-input w-full px-3 py-2"
                  />
                </div>
                <div>
                  <label className="cf-muted block mb-1">SIREN fictif</label>
                  <input
                    type="text"
                    value={orgForm.siren}
                    onChange={(e) =>
                      setOrgForm((p) => ({ ...p, siren: e.target.value }))
                    }
                    className="cf-input w-full px-3 py-2 cf-mono"
                  />
                </div>
                <div>
                  <label className="cf-muted block mb-1">Indemnité repas (€)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={orgForm.mealAllowanceEur}
                    onChange={(e) =>
                      setOrgForm((p) => ({
                        ...p,
                        mealAllowanceEur: Number(e.target.value) || 0,
                      }))
                    }
                    className="cf-input w-full px-3 py-2 cf-mono"
                  />
                </div>
              </div>
            </div>

            {/* Périmètre ORG02 */}
            <div className="cf-card p-5 space-y-3">
              <h2 className="font-semibold text-sm">
                Décision périmètre ORG02 (Abonnement & Facturation source)
              </h2>
              <p className="text-xs cf-muted">{orgForm.billingNotice}</p>
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleChangeOrg02('exclude_skello_saas')}
                  className={`w-full text-left p-3 rounded-btn border text-xs ${
                    org02Policy === 'exclude_skello_saas'
                      ? 'border-violet-500 bg-violet-500/15'
                      : 'cf-card-secondary'
                  }`}
                >
                  <div className="font-semibold">
                    Exclure la facturation SaaS tiers (Recommandé logiciel interne)
                  </div>
                  <div className="cf-muted mt-0.5">
                    Conserve ORG02 uniquement en archive de traçabilité V1.16.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleChangeOrg02('keep_internal_admin')}
                  className={`w-full text-left p-3 rounded-btn border text-xs ${
                    org02Policy === 'keep_internal_admin'
                      ? 'border-violet-500 bg-violet-500/15'
                      : 'cf-card-secondary'
                  }`}
                >
                  <div className="font-semibold">
                    Conserver une section facturation multi-clubs CFitness
                  </div>
                  <div className="cf-muted mt-0.5">
                    Prépare une facturation interne ultérieure par établissement.
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Comparaison Carré de Soie vs Beynost */}
          {csSite && beySite && (
            <div className="cf-card p-5 space-y-3">
              <h2 className="font-semibold text-sm">
                Paramètres distincts par établissement (PAR01–PAR17)
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="cf-muted border-b border-[var(--cf-border)]">
                    <tr>
                      <th className="py-2 pr-4">Paramètre RH (V1.16)</th>
                      <th className="py-2 pr-4">{csSite.name}</th>
                      <th className="py-2">{beySite.name}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--cf-border)] cf-mono">
                    <tr>
                      <td className="py-2 pr-4 font-sans">Fréquence badgeage</td>
                      <td className="py-2 pr-4">{csSite.settings.badgeFrequency}</td>
                      <td className="py-2">{beySite.settings.badgeFrequency}</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-sans">Début de journée</td>
                      <td className="py-2 pr-4">{csSite.settings.dayStartHour}</td>
                      <td className="py-2">{beySite.settings.dayStartHour}</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-sans">Alerte pause / Blocage</td>
                      <td className="py-2 pr-4">
                        {csSite.settings.breakAlertHours}h (actif :{' '}
                        {String(csSite.settings.breakAlertEnabled)})
                      </td>
                      <td className="py-2">
                        {beySite.settings.breakAlertHours}h (actif :{' '}
                        {String(beySite.settings.breakAlertEnabled)})
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-sans">Plafond heures compl.</td>
                      <td className="py-2 pr-4">{csSite.settings.complementaryMaxHours}h</td>
                      <td className="py-2">{beySite.settings.complementaryMaxHours}h</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-sans">Disposition alertes</td>
                      <td className="py-2 pr-4">{csSite.settings.alertsLayout}</td>
                      <td className="py-2">{beySite.settings.alertsLayout}</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-sans">Module Missions</td>
                      <td className="py-2 pr-4">
                        {String(csSite.settings.missionsModuleActive)}
                      </td>
                      <td className="py-2">
                        {String(beySite.settings.missionsModuleActive)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-sans">Règles sur rapports</td>
                      <td className="py-2 pr-4">
                        {String(csSite.settings.reportRulesVisible)}
                      </td>
                      <td className="py-2">
                        {String(beySite.settings.reportRulesVisible)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {entretienDuplicates.length > 0 && (
                <div className="cf-card-secondary p-3 text-xs">
                  <strong>Postes PAR17 à libellé identique (« Entretien ») :</strong>{' '}
                  {entretienDuplicates.map((p) => (
                    <span
                      key={p.id}
                      className="cf-mono text-[11px] px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 mr-2"
                    >
                      {p.id} ({p.label})
                    </span>
                  ))}
                  — distingués uniquement par identifiant technique unique (OBJ10).
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Onglet 3 : Journal JOU01 & Export CSV */}
      {activeTab === 'audit' && (
        <div className="cf-card p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-sm">
                Journal d’activité immuable (JOU01 / ADM14-J01)
              </h2>
              <p className="text-xs cf-muted">
                Historisation obligatoire : horodatage, auteur, type, cible, avant/après.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportCsv}
              className="cf-brand-gradient text-white text-xs font-semibold px-3.5 py-2 rounded-btn flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Exporter CSV
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
            <input
              type="text"
              placeholder="Rechercher auteur, cible, résumé..."
              value={auditQuery}
              onChange={(e) => setAuditQuery(e.target.value)}
              className="cf-input px-3 py-2 sm:col-span-2"
            />
            <select
              value={auditSiteFilter}
              onChange={(e) => setAuditSiteFilter(e.target.value)}
              className="cf-input px-3 py-2"
            >
              <option value="all">Tous périmètres</option>
              <option value="org">Organisation</option>
              <option value="club-carre-soie">Carré de Soie</option>
              <option value="club-beynost">Beynost</option>
            </select>
            <div className="flex gap-2">
              <select
                value={auditActionType}
                onChange={(e) => setAuditActionType(e.target.value)}
                className="cf-input px-3 py-2 flex-1"
              >
                <option value="ALL">Tous types</option>
                <option value="Modification de permissions">Droits</option>
                <option value="Modification de shift">Shifts</option>
                <option value="Mise à jour organisation">Organisation</option>
                <option value="Révocation flux calendrier">Flux .ics</option>
                <option value="Sécurité compte">Mot de passe</option>
              </select>
              <button
                type="button"
                onClick={() => void loadAudit()}
                className="cf-card-secondary px-3 py-2 font-medium hover:border-violet-500/60"
              >
                Filtrer
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="cf-muted border-b border-[var(--cf-border)]">
                <tr>
                  <th className="py-2 pr-3">Horodatage</th>
                  <th className="py-2 pr-3">Auteur</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Cible</th>
                  <th className="py-2">Détail & Diff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--cf-border)]">
                {auditEvents.map((ev) => (
                  <tr key={ev.id}>
                    <td className="py-2.5 pr-3 cf-mono text-[11px] whitespace-nowrap">
                      {ev.timestamp.replace('T', ' ').slice(0, 19)}
                    </td>
                    <td className="py-2.5 pr-3 font-medium">{ev.actorName}</td>
                    <td className="py-2.5 pr-3">
                      <span className="cf-mono text-[10px] px-2 py-0.5 rounded bg-violet-500/15 text-violet-300">
                        {ev.actionType}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 cf-mono text-[11px]">
                      {ev.targetLabel}
                    </td>
                    <td className="py-2.5">
                      <div>{ev.summary}</div>
                      {(ev.beforeSummary || ev.afterSummary) && (
                        <div className="cf-mono text-[10px] cf-muted mt-0.5">
                          Avant : {ev.beforeSummary ?? '—'} → Après :{' '}
                          {ev.afterSummary ?? '—'}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Onglet 5 : Comptes, Délégations par club & Mots de passe serveur */}
      {activeTab === 'delegations_security' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Section 1 : Délégations structurées par club */}
          <div className="cf-card p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-violet-400" />
                  Délégations par club et module
                </h2>
                <p className="text-xs cf-muted mt-0.5">
                  Accorde un accès ciblé (Finances, Rapports, Recouvrement ou
                  Stocks) à un collaborateur sur un établissement précis.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleSaveDelegations()}
                disabled={savingDelegations}
                className="cf-brand-gradient text-white text-xs font-semibold px-3.5 py-2 rounded-btn flex items-center gap-1.5 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {savingDelegations
                  ? 'Enregistrement...'
                  : 'Enregistrer les délégations'}
              </button>
            </div>

            {delegationsDirty && (
              <div className="text-[11px] px-3 py-2 rounded-btn bg-amber-500/15 border border-amber-500/40 text-amber-200">
                Modifications en attente : cliquez sur « Enregistrer les
                délégations » pour appliquer côté serveur.
              </div>
            )}

            <div className="cf-card-secondary p-3.5 space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <label className="block space-y-1">
                  <span className="cf-muted">Collaborateur</span>
                  <select
                    value={delEmpId}
                    onChange={(e) => handleSelectDelEmployee(e.target.value)}
                    className="cf-input w-full px-2.5 py-2"
                  >
                    {dashboard.visibleEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.firstName} {emp.lastName} ({emp.matricule})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="cf-muted">Établissement</span>
                  <select
                    value={delSiteId}
                    onChange={(e) => setDelSiteId(e.target.value)}
                    className="cf-input w-full px-2.5 py-2"
                  >
                    {(
                      dashboard.visibleEmployees
                        .find((e) => e.id === delEmpId)
                        ?.siteAccesses.map((a) => {
                          const foundSite = dashboard.sites.find(
                            (s) => s.id === a.siteId
                          );
                          return {
                            id: a.siteId,
                            name: foundSite?.name ?? a.siteId,
                          };
                        }) ?? dashboard.sites
                    ).map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="cf-muted">Module</span>
                  <select
                    value={delModule}
                    onChange={(e) =>
                      setDelModule(e.target.value as DelegationModuleId)
                    }
                    className="cf-input w-full px-2.5 py-2"
                  >
                    {DELEGATION_MODULES.map((mod) => (
                      <option key={mod.id} value={mod.id}>
                        {mod.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="cf-muted">Actions autorisées :</span>
                  {DELEGATION_ACTIONS.map((act) => (
                    <label
                      key={act.id}
                      className="inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={delActions.includes(act.id)}
                        onChange={() => handleToggleDelAction(act.id)}
                        className="accent-violet-500"
                      />
                      <span>{act.label}</span>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleAddOrUpdateDelegation}
                  className="cf-card px-3 py-1.5 font-semibold text-xs flex items-center gap-1.5 hover:border-violet-500/60"
                >
                  <Plus className="w-3.5 h-3.5 text-violet-400" />
                  Ajouter / Mettre à jour
                </button>
              </div>
            </div>

            {delegations.length === 0 ? (
              <div className="cf-card-secondary p-4 text-xs cf-muted">
                Aucune délégation nominative active. Les droits par défaut de la
                matrice s’appliquent.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="cf-muted border-b border-[var(--cf-border)]">
                    <tr>
                      <th className="py-2 pr-3">Collaborateur</th>
                      <th className="py-2 pr-3">Établissement</th>
                      <th className="py-2 pr-3">Module</th>
                      <th className="py-2 pr-3">Actions</th>
                      <th className="py-2 text-right">Retirer</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--cf-border)]">
                    {delegations.map((del, idx) => {
                      const emp = dashboard.visibleEmployees.find(
                        (e) => e.id === del.employeeId
                      );
                      const site = dashboard.sites.find(
                        (s) => s.id === del.siteId
                      );
                      const modLabel =
                        DELEGATION_MODULES.find((m) => m.id === del.module)
                          ?.label ?? del.module;
                      return (
                        <tr
                          key={`${del.employeeId}-${del.siteId}-${del.module}`}
                        >
                          <td className="py-2.5 pr-3 font-medium">
                            {emp
                              ? `${emp.firstName} ${emp.lastName}`
                              : del.employeeId}
                          </td>
                          <td className="py-2.5 pr-3">
                            {site?.name ?? del.siteId}
                          </td>
                          <td className="py-2.5 pr-3">{modLabel}</td>
                          <td className="py-2.5 pr-3">
                            <div className="flex flex-wrap gap-1">
                              {del.actions.map((act) => {
                                const actLabel =
                                  DELEGATION_ACTIONS.find((a) => a.id === act)
                                    ?.label ?? act;
                                return (
                                  <span
                                    key={act}
                                    className="px-2 py-0.5 rounded bg-violet-500/15 text-violet-300 text-[10px] font-medium"
                                  >
                                    {actLabel}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          <td className="py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveDelegation(idx)}
                              aria-label="Retirer cette délégation"
                              className="p-1.5 rounded hover:bg-red-500/20 text-red-300 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 2 : Mot de passe serveur administrateur */}
          <div className="cf-card p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-emerald-400" />
                Mot de passe serveur &amp; révocation de session
              </h2>
              <p className="text-xs cf-muted mt-0.5">
                Définit ou réinitialise le mot de passe personnel chiffré
                (PBKDF2) d’un collaborateur et révoque immédiatement ses
                sessions ouvertes.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleResetEmployeePassword();
              }}
              className="space-y-3 text-xs"
            >
              <label className="block space-y-1">
                <span className="cf-muted">Collaborateur cible</span>
                <select
                  value={resetEmpId}
                  onChange={(e) => setResetEmpId(e.target.value)}
                  className="cf-input w-full px-3 py-2"
                >
                  {dashboard.visibleEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.matricule})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="cf-muted">
                  Nouveau mot de passe (12 caractères minimum)
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  value={resetPwd}
                  onChange={(e) => setResetPwd(e.target.value)}
                  placeholder="Au moins 12 caractères..."
                  className="cf-input w-full px-3 py-2"
                />
              </label>

              <label className="block space-y-1">
                <span className="cf-muted">Confirmer le nouveau mot de passe</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  value={resetPwdConfirm}
                  onChange={(e) => setResetPwdConfirm(e.target.value)}
                  placeholder="Répétez le mot de passe..."
                  className="cf-input w-full px-3 py-2"
                />
              </label>

              <div className="cf-card-secondary p-3 text-[11px] cf-muted flex items-start gap-2">
                <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Dès la validation, le code PIN de démonstration éventuel ne
                  permet plus de se connecter sur ce compte ; seul le mot de
                  passe défini ici est accepté.
                </span>
              </div>

              <div className="pt-1 flex justify-end">
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="cf-brand-gradient text-white text-xs font-semibold px-4 py-2 rounded-btn flex items-center gap-1.5 disabled:opacity-50"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  {savingPassword
                    ? 'Mise à jour...'
                    : 'Enregistrer le mot de passe'}
                </button>
              </div>
            </form>
          </div>
          </div>

          {/* Section 3 : Fiche collaborateur & Activation / Désactivation de compte */}
          <div className="cf-card p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  {(dashboard.visibleEmployees.find((e) => e.id === editEmpId)
                    ?.active ?? true) ? (
                    <UserCheck className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <UserX className="w-4 h-4 text-amber-400" />
                  )}
                  Fiche &amp; statut du compte collaborateur
                </h2>
                <p className="text-xs cf-muted mt-0.5">
                  Modifiez les coordonnées et le contrat d&apos;un collaborateur
                  ou désactivez son accès lors d&apos;un départ (révocation
                  immédiate des sessions sans perdre l&apos;historique).
                </p>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                  (dashboard.visibleEmployees.find((e) => e.id === editEmpId)
                    ?.active ?? true)
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/35'
                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/35'
                }`}
              >
                {(dashboard.visibleEmployees.find((e) => e.id === editEmpId)
                  ?.active ?? true)
                  ? 'Compte actif'
                  : 'Compte désactivé'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <label className="block space-y-1 md:col-span-2">
                <span className="cf-muted">Collaborateur</span>
                <select
                  value={editEmpId}
                  onChange={(e) => {
                    const nextEmp = dashboard.visibleEmployees.find(
                      (emp) => emp.id === e.target.value
                    );
                    if (nextEmp) hydrateEmployeeEditForm(nextEmp);
                  }}
                  className="cf-input w-full px-3 py-2"
                >
                  {dashboard.visibleEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.matricule}) —{' '}
                      {emp.active ? 'Actif' : 'Désactivé'}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="cf-muted">Prénom</span>
                <input
                  type="text"
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  className="cf-input w-full px-3 py-2"
                />
              </label>

              <label className="block space-y-1">
                <span className="cf-muted">Nom</span>
                <input
                  type="text"
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                  className="cf-input w-full px-3 py-2"
                />
              </label>

              <label className="block space-y-1 md:col-span-2">
                <span className="cf-muted">Email professionnel</span>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="cf-input w-full px-3 py-2"
                />
              </label>

              <label className="block space-y-1">
                <span className="cf-muted">Téléphone</span>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="cf-input w-full px-3 py-2"
                />
              </label>

              <label className="block space-y-1">
                <span className="cf-muted">Matricule</span>
                <input
                  type="text"
                  value={editMatricule}
                  onChange={(e) => setEditMatricule(e.target.value)}
                  className="cf-input w-full px-3 py-2"
                />
              </label>

              <label className="block space-y-1">
                <span className="cf-muted">Type de contrat</span>
                <select
                  value={editContractType}
                  onChange={(e) => setEditContractType(e.target.value)}
                  className="cf-input w-full px-3 py-2"
                >
                  {['CDI', 'CDD', 'Alternance', 'Stage', 'Indépendant'].map(
                    (ct) => (
                      <option key={ct} value={ct}>
                        {ct}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="cf-muted">Heures hebdomadaires</span>
                <input
                  type="number"
                  min={1}
                  max={48}
                  value={editWeeklyHours}
                  onChange={(e) => setEditWeeklyHours(e.target.value)}
                  className="cf-input w-full px-3 py-2"
                />
              </label>

              <div className="md:col-span-2 flex flex-wrap items-end justify-end gap-2">
                {(dashboard.visibleEmployees.find((e) => e.id === editEmpId)
                  ?.active ?? true) ? (
                  <button
                    type="button"
                    disabled={savingEmployeeEdit || !editEmpId}
                    onClick={() => void handleToggleEmployeeActive(false)}
                    className="px-3.5 py-2 rounded-btn border border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    Désactiver le compte
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={savingEmployeeEdit || !editEmpId}
                    onClick={() => void handleToggleEmployeeActive(true)}
                    className="px-3.5 py-2 rounded-btn border border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    Réactiver le compte
                  </button>
                )}

                <button
                  type="button"
                  disabled={savingEmployeeEdit || !editEmpId}
                  onClick={() => void handleSaveEmployeeDetails()}
                  className="cf-brand-gradient text-white px-4 py-2 rounded-btn text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingEmployeeEdit ? 'Enregistrement...' : 'Enregistrer la fiche'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Onglet 6 : Import CSV collaborateurs */}
      {activeTab === 'import_csv' && (
        <div className="cf-card p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Upload className="w-4 h-4 text-emerald-400" />
                Import CSV en masse des collaborateurs (Carré de Soie &amp; Beynost)
              </h2>
              <p className="text-xs cf-muted mt-0.5">
                Importe vos vrais collaborateurs directement en base serveur locale (sans rien commiter sur GitHub). Les mots de passe saisis (&ge; 12 car.) sont hachés immédiatement en PBKDF2.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDownloadCsvTemplate}
                className="cf-card-secondary px-3.5 py-2 text-xs font-medium flex items-center gap-1.5 hover:border-violet-500/60"
              >
                <Download className="w-3.5 h-3.5" />
                Télécharger modèle CSV
              </button>
              <label className="cf-card-secondary px-3.5 py-2 text-xs font-medium flex items-center gap-1.5 hover:border-violet-500/60 cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-violet-400" />
                <span>Charger un fichier .csv</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCsvFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="space-y-2 text-xs">
            <div className="cf-muted">
              Colonnes reconnues (séparateur <code className="cf-mono">;</code> ou <code className="cf-mono">,</code>) :{' '}
              <code className="cf-mono">prenom;nom;email;telephone;matricule;clubs;profil;contrat;heures_hebdo;mot_de_passe_initial</code>
            </div>
            <textarea
              value={csvInput}
              onChange={(e) => {
                setCsvInput(e.target.value);
                setImportReport(null);
              }}
              rows={7}
              placeholder={EMPLOYEE_CSV_TEMPLATE}
              className="cf-input w-full p-3 cf-mono text-[11px]"
            />
          </div>

          {parsedCsv.rows.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-300 font-semibold">
                    {parsedCsv.validCount} ligne(s) valide(s)
                  </span>
                  {parsedCsv.invalidCount > 0 && (
                    <span className="px-2.5 py-1 rounded bg-red-500/15 text-red-300 font-semibold">
                      {parsedCsv.invalidCount} ligne(s) avec erreur
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleImportCsvSubmit()}
                  disabled={parsedCsv.validCount === 0 || importingCsv}
                  className="cf-brand-gradient text-white px-4 py-2 rounded-btn text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {importingCsv
                    ? 'Import en cours...'
                    : `Importer ${parsedCsv.validCount} collaborateur(s)`}
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="cf-muted border-b border-[var(--cf-border)]">
                    <tr>
                      <th className="py-2 pr-3">Ligne</th>
                      <th className="py-2 pr-3">Collaborateur</th>
                      <th className="py-2 pr-3">Clubs</th>
                      <th className="py-2 pr-3">Profil</th>
                      <th className="py-2 pr-3">Contrat</th>
                      <th className="py-2 pr-3">Mot de passe</th>
                      <th className="py-2">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--cf-border)]">
                    {parsedCsv.rows.map((row) => (
                      <tr key={row.lineNumber}>
                        <td className="py-2 pr-3 cf-mono text-[11px]">
                          #{row.lineNumber}
                        </td>
                        <td className="py-2 pr-3">
                          <div className="font-medium">
                            {row.payload.firstName} {row.payload.lastName}
                          </div>
                          <div className="text-[11px] cf-muted">
                            {row.payload.email ?? 'email auto @c.fitness'}
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-[11px]">
                          {row.payload.siteIds
                            .map((sid) =>
                              sid === 'club-carre-soie'
                                ? 'Carré de Soie'
                                : sid === 'club-beynost'
                                ? 'Beynost'
                                : sid
                            )
                            .join(' + ') || '—'}
                        </td>
                        <td className="py-2 pr-3 text-[11px]">
                          {getProfileDisplayLabel(row.payload.profileId)}
                        </td>
                        <td className="py-2 pr-3 text-[11px]">
                          {row.payload.contractType ?? 'CDI'}
                          {row.payload.weeklyHours ? ` · ${row.payload.weeklyHours}h` : ''}
                        </td>
                        <td className="py-2 pr-3 text-[11px]">
                          {row.payload.initialPassword ? (
                            <span className="text-emerald-300">Fourni (PBKDF2)</span>
                          ) : (
                            <span className="cf-muted">À définir ensuite</span>
                          )}
                        </td>
                        <td className="py-2 text-[11px]">
                          {row.errors.length === 0 ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-medium">
                              Prêt
                            </span>
                          ) : (
                            <span className="text-red-300">
                              {row.errors.join(' ')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {importReport && (
            <div className="cf-card-secondary p-3.5 text-xs space-y-1.5">
              <div className="font-semibold text-emerald-300">
                Résultat serveur : {importReport.createdCount} créé(s), {importReport.skippedCount} doublon(s) ignoré(s).
              </div>
              {importReport.errors.length > 0 && (
                <ul className="list-disc pl-4 text-amber-200 space-y-0.5">
                  {importReport.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Onglet 4 : Sauvegarde & Restauration JSON TST28 */}
      {activeTab === 'backup' && (
        <div className="cf-card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-sm">
                Sauvegarde & Restauration complète (TST28)
              </h2>
              <p className="text-xs cf-muted">
                Exporte et restaure l’état complet (profils, sites, salariés
                fictifs, shifts, audit) sous contrôle serveur ORG04-31.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleExportBackup}
                className="cf-card-secondary px-3.5 py-2 text-xs font-medium flex items-center gap-1.5 hover:border-violet-500/60"
              >
                <Download className="w-3.5 h-3.5" />
                Générer snapshot JSON
              </button>
              <button
                type="button"
                onClick={handleRestoreBackup}
                disabled={!restoreInput.trim()}
                className="cf-brand-gradient text-white px-3.5 py-2 rounded-btn text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
              >
                <Upload className="w-3.5 h-3.5" />
                Restaurer le JSON
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            <div>
              <div className="cf-muted mb-1.5">Dernier export JSON :</div>
              <textarea
                readOnly
                value={backupPreview}
                rows={12}
                placeholder="Cliquez sur « Générer snapshot JSON » pour inspecter ou archiver l’état..."
                className="cf-input w-full p-3 cf-mono text-[11px]"
              />
            </div>
            <div>
              <div className="cf-muted mb-1.5">Archive JSON à restaurer :</div>
              <textarea
                value={restoreInput}
                onChange={(e) => setRestoreInput(e.target.value)}
                rows={12}
                placeholder="Collez ici un snapshot JSON valide CFitness OS..."
                className="cf-input w-full p-3 cf-mono text-[11px]"
              />
            </div>
          </div>
        </div>
      )}
    </div>,
    isTechnicalMode
  );
}
