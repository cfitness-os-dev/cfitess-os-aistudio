import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  DatabaseBackup,
  Download,
  History,
  Lock,
  Save,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DashboardPayload } from '../domain/apiEngine';
import { ApiClientError, clientApi, type ApiAuthContext } from '../domain/clientApi';
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

type AdminTab = 'org_sites' | 'permissions' | 'audit' | 'backup';

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

  useEffect(() => {
    void loadProfiles();
    void loadAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.actorId, auth.siteId]);

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

  return (
    <div className="space-y-5">
      <div className="cf-card p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="text-xs cf-mono text-violet-300">
            MC11 • ORG01–ORG04 • DRO01–DRO05 • JOU01
          </div>
          <h1 className="text-xl font-bold mt-0.5">
            Organisation, Multi-Établissements & Matrice des droits
          </h1>
          <p className="text-xs cf-muted mt-1">
            Toutes les vérifications d’élévation de privilèges (TST34),
            révocations (TST35) et écritures sont contrôlées côté serveur.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'permissions' as const, label: 'Matrice Droits (6×44)', icon: ShieldCheck },
            { id: 'org_sites' as const, label: 'Organisation & Clubs', icon: Building2 },
            { id: 'audit' as const, label: 'Journal JOU01 & CSV', icon: History },
            { id: 'backup' as const, label: 'Sauvegarde TST28', icon: DatabaseBackup },
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
    </div>
  );
}
