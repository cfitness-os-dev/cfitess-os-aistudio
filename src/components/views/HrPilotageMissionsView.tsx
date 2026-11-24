import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Briefcase,
  Building2,
  CheckCircle2,
  Download,
  Lock,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useCfos } from '../../context/CfosContext';
import { useLeadDraftGuard } from '../useLeadDraftGuard';
import {
  buildPilotageCsv,
  fetchHrPilotage,
  formatOptionalMetric,
  mutateHrPilotage,
  validateKpisForm,
  validateMissionForm,
  type ClubMissionDto,
  type HrPilotageCommand,
  type HrPilotageSnapshot,
} from '../../domain/hrPilotage';
import type { ClubId } from '../../types/cfos';

type PilotageTab = 'kpis' | 'missions';
type MissionFilter = 'all' | 'active' | 'done';

interface HrPilotageMissionsViewProps {
  clubId: ClubId;
  onMutated?: () => void;
}

export function HrPilotageMissionsView({ clubId, onMutated }: HrPilotageMissionsViewProps) {
  const { currentUser } = useCfos();
  const [tab, setTab] = useState<PilotageTab>('kpis');
  const [snapshot, setSnapshot] = useState<HrPilotageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [kpiDirty, setKpiDirty] = useState(false);
  const [kpiForm, setKpiForm] = useState({
    periodLabel: '',
    workedHours: '',
    retentionRatePct: '',
    revenueEur: '',
    payrollMassEur: '',
    productivityPerHour: '',
    monthlyTargetEur: '',
  });

  const [missionFilter, setMissionFilter] = useState<MissionFilter>('all');
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [missionForm, setMissionForm] = useState({
    title: '',
    budgetHours: '10',
    loggedHours: '0',
    hourlyBudgetEur: '26',
  });

  useLeadDraftGuard(kpiDirty || !!missionForm.title.trim() || !!editingMissionId);

  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const submittingRef = useRef(false);

  const syncFormsFromSnapshot = (data: HrPilotageSnapshot) => {
    const toText = (v: number | null) => (v === null ? '' : String(v));
    setKpiForm({
      periodLabel: data.kpis.periodLabel,
      workedHours: toText(data.kpis.workedHours),
      retentionRatePct: toText(data.kpis.retentionRatePct),
      revenueEur: toText(data.kpis.revenueEur),
      payrollMassEur: toText(data.kpis.payrollMassEur),
      productivityPerHour: toText(data.kpis.productivityPerHour),
      monthlyTargetEur: toText(data.kpis.monthlyTargetEur),
    });
    setKpiDirty(false);
  };

  async function loadPilotage(preserveDrafts = false) {
    const ticket = ++seqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const data = await fetchHrPilotage(currentUser.id, clubId, controller.signal);
      if (controller.signal.aborted || ticket !== seqRef.current) return;
      setSnapshot(data);
      if (!preserveDrafts) {
        syncFormsFromSnapshot(data);
      }
    } catch (err) {
      if (!controller.signal.aborted && ticket === seqRef.current) {
        setSnapshot(null);
        setError(
          err instanceof Error
            ? err.message
            : 'Impossible de charger les indicateurs et missions de l’établissement.',
        );
      }
    } finally {
      if (!controller.signal.aborted && ticket === seqRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    setNotice('');
    setError('');
    setEditingMissionId(null);
    setMissionForm({ title: '', budgetHours: '10', loggedHours: '0', hourlyBudgetEur: '26' });
    void loadPilotage(false);
    return () => {
      seqRef.current += 1;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, clubId]);

  const sendMutation = async (
    command: HrPilotageCommand,
    successMsg: string,
    after?: () => void,
  ) => {
    if (!snapshot || submittingRef.current || busy) return false;
    submittingRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await mutateHrPilotage(
        currentUser.id,
        clubId,
        snapshot.revision,
        command,
      );
      setSnapshot(updated);
      syncFormsFromSnapshot(updated);
      after?.();
      onMutated?.();
      setNotice(successMsg);
      return true;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Action refusée par le serveur. Aucune modification enregistrée.',
      );
      return false;
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  };

  const filteredMissions = useMemo(() => {
    if (!snapshot) return [];
    if (missionFilter === 'all') return snapshot.missions;
    return snapshot.missions.filter((m) => m.status === missionFilter);
  }, [snapshot, missionFilter]);

  const startEditMission = (m: ClubMissionDto) => {
    setEditingMissionId(m.id);
    setMissionForm({
      title: m.title,
      budgetHours: String(m.budgetHours),
      loggedHours: String(m.loggedHours),
      hourlyBudgetEur: m.hourlyBudgetEur !== null ? String(m.hourlyBudgetEur) : '26',
    });
  };

  const resetMissionForm = () => {
    setEditingMissionId(null);
    setMissionForm({ title: '', budgetHours: '10', loggedHours: '0', hourlyBudgetEur: '26' });
  };

  const handleExportCsv = () => {
    if (!snapshot) return;
    const csv = buildPilotageCsv(snapshot);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pilotage-missions-${clubId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const buttonPrimary =
    'cf-brand-gradient text-white px-4 py-2 rounded-xl min-h-[44px] text-sm font-semibold disabled:opacity-40 cursor-pointer';
  const buttonSecondary =
    'cf-card-secondary px-3 py-2 rounded-xl min-h-[44px] text-sm font-medium hover:border-violet-500/60 disabled:opacity-40 cursor-pointer';
  const inputCls = 'cf-input w-full min-w-0 min-h-[44px] px-3 py-2 rounded-xl text-sm';

  const clubLabel = clubId === 'beynost' ? 'Beynost' : 'Carré de Soie';

  return (
    <section
      className="space-y-4 min-w-0"
      aria-label="Pilotage et missions de l’établissement"
      aria-busy={loading || busy}
    >
      <header className="cf-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-violet-400 shrink-0" />
            <span>Pilotage, indicateurs et missions</span>
          </h2>
          <p className="text-xs cf-muted">
            <Building2 className="w-3.5 h-3.5 inline mr-1 text-cyan-400" />
            Club actif : <strong className="text-slate-200">{clubLabel}</strong>
            {snapshot?.site.siret ? ` · SIRET ${snapshot.site.siret}` : ''}
            {snapshot?.demoMode ? ' · Environnement de test' : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {snapshot && (
            <button
              type="button"
              className={buttonSecondary}
              disabled={loading || busy}
              onClick={handleExportCsv}
            >
              <span className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                Exporter CSV
              </span>
            </button>
          )}
          <button
            type="button"
            className={buttonSecondary}
            disabled={loading || busy}
            onClick={() => void loadPilotage(false)}
          >
            <span className="flex items-center gap-2">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </span>
          </button>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="cf-card p-4 border border-red-500/60 bg-red-950/30 text-red-100 text-sm space-y-2"
        >
          <p>{error}</p>
          <button type="button" className={buttonSecondary} onClick={() => void loadPilotage(false)}>
            Recharger la version serveur
          </button>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="cf-card p-3 border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{notice}</span>
        </div>
      )}

      {loading && !snapshot ? (
        <div className="cf-card p-6 text-sm cf-muted">
          Chargement du pilotage et des missions de {clubLabel}…
        </div>
      ) : !snapshot ? (
        <div className="cf-card p-6 text-sm cf-muted">
          Données de pilotage indisponibles pour votre profil sur {clubLabel}.
        </div>
      ) : (
        <>
          <nav
            className="flex flex-wrap gap-2"
            aria-label="Rubriques de pilotage et missions"
          >
            <button
              type="button"
              onClick={() => setTab('kpis')}
              className={tab === 'kpis' ? buttonPrimary : buttonSecondary}
            >
              Indicateurs du club
            </button>
            <button
              type="button"
              onClick={() => setTab('missions')}
              className={tab === 'missions' ? buttonPrimary : buttonSecondary}
            >
              Missions budgétées ({snapshot.missions.length})
            </button>
          </nav>

          {tab === 'kpis' && (
            <div className="space-y-4">
              {/* Synthèse opérationnelle issue de la base serveur */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="cf-card p-3 space-y-1 min-w-0">
                  <div className="cf-muted">Effectif actif du club</div>
                  <div className="text-lg font-bold">
                    {snapshot.operationalSummary.activeEmployeesCount}
                  </div>
                </div>
                <div className="cf-card p-3 space-y-1 min-w-0">
                  <div className="cf-muted">Shifts publiés</div>
                  <div className="text-lg font-bold">
                    {snapshot.operationalSummary.publishedShiftsCount}
                  </div>
                </div>
                <div className="cf-card p-3 space-y-1 min-w-0">
                  <div className="cf-muted">Absences en attente</div>
                  <div className="text-lg font-bold">
                    {snapshot.operationalSummary.pendingLeaveRequestsCount}
                  </div>
                </div>
                <div className="cf-card p-3 space-y-1 min-w-0">
                  <div className="cf-muted">Anomalies pointeuse à revoir</div>
                  <div className="text-lg font-bold">
                    {snapshot.operationalSummary.openAnomaliesCount}
                  </div>
                </div>
              </div>

              {/* Cartes de lecture honnêtes (jamais 0 € si absent ou masqué) */}
              <div className="cf-card p-4 space-y-3 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    <span>
                      Indicateurs enregistrés — {snapshot.kpis.periodLabel || 'Période non renseignée'}
                    </span>
                  </h3>
                  {!snapshot.capabilities.canViewFinances && (
                    <span className="text-xs px-2.5 py-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-200 inline-flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      Données financières masquées (RBAC)
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  <div className="cf-card-secondary p-3 space-y-1">
                    <div className="cf-muted">Heures travaillées / planifiées</div>
                    <div className="text-base font-bold">
                      {formatOptionalMetric(snapshot.kpis.workedHours, 'h', 1)}
                    </div>
                  </div>
                  <div className="cf-card-secondary p-3 space-y-1">
                    <div className="cf-muted">Taux de rétention adhérents</div>
                    <div className="text-base font-bold">
                      {formatOptionalMetric(snapshot.kpis.retentionRatePct, '%', 1)}
                    </div>
                  </div>
                  <div className="cf-card-secondary p-3 space-y-1">
                    <div className="cf-muted">Heures missions (réalisées / prévues)</div>
                    <div className="text-base font-bold">
                      {snapshot.operationalSummary.totalMissionLoggedHours} h /{' '}
                      {snapshot.operationalSummary.totalMissionBudgetHours} h
                    </div>
                  </div>
                  {snapshot.capabilities.canViewFinances && (
                    <>
                      <div className="cf-card-secondary p-3 space-y-1">
                        <div className="cf-muted">Chiffre d’affaires mensuel</div>
                        <div className="text-base font-bold">
                          {formatOptionalMetric(snapshot.kpis.revenueEur, '€', 0)}
                        </div>
                      </div>
                      <div className="cf-card-secondary p-3 space-y-1">
                        <div className="cf-muted">Masse salariale</div>
                        <div className="text-base font-bold">
                          {formatOptionalMetric(snapshot.kpis.payrollMassEur, '€', 0)}
                        </div>
                      </div>
                      <div className="cf-card-secondary p-3 space-y-1">
                        <div className="cf-muted">Productivité horaire & objectif</div>
                        <div className="text-base font-bold">
                          {formatOptionalMetric(snapshot.kpis.productivityPerHour, '€/h', 2)} · Obj.{' '}
                          {formatOptionalMetric(snapshot.kpis.monthlyTargetEur, '€', 0)}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Formulaire d'édition des indicateurs */}
              <form
                className="cf-card p-4 space-y-4 min-w-0"
                onSubmit={(e) => {
                  e.preventDefault();
                  const validated = validateKpisForm({
                    ...kpiForm,
                    canEditFinancialKpis: snapshot.capabilities.canEditFinancialKpis,
                  });
                  if ('error' in validated) {
                    setError(validated.error);
                    return;
                  }
                  void sendMutation(
                    validated.payload,
                    `Indicateurs enregistrés pour ${clubLabel}.`,
                  );
                }}
              >
                <h3 className="font-bold text-sm">Mettre à jour les indicateurs de {clubLabel}</h3>
                <fieldset
                  disabled={busy || !snapshot.capabilities.canEditOperationalKpis}
                  className="space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <label className="block space-y-1">
                      <span>Libellé de période</span>
                      <input
                        required
                        maxLength={80}
                        className={inputCls}
                        value={kpiForm.periodLabel}
                        onChange={(e) => {
                          setKpiDirty(true);
                          setKpiForm((f) => ({ ...f, periodLabel: e.target.value }));
                        }}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span>Heures travaillées (h)</span>
                      <input
                        type="number"
                        step="0.5"
                        min={0}
                        max={100000}
                        className={inputCls}
                        placeholder="Non renseigné"
                        value={kpiForm.workedHours}
                        onChange={(e) => {
                          setKpiDirty(true);
                          setKpiForm((f) => ({ ...f, workedHours: e.target.value }));
                        }}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span>Rétention adhérents (%)</span>
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        max={100}
                        className={inputCls}
                        placeholder="Non renseigné"
                        value={kpiForm.retentionRatePct}
                        onChange={(e) => {
                          setKpiDirty(true);
                          setKpiForm((f) => ({ ...f, retentionRatePct: e.target.value }));
                        }}
                      />
                    </label>
                  </div>

                  {snapshot.capabilities.canEditFinancialKpis && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      <label className="block space-y-1">
                        <span>Chiffre d’affaires (€)</span>
                        <input
                          type="number"
                          step="1"
                          min={0}
                          className={inputCls}
                          placeholder="Non renseigné"
                          value={kpiForm.revenueEur}
                          onChange={(e) => {
                            setKpiDirty(true);
                            setKpiForm((f) => ({ ...f, revenueEur: e.target.value }));
                          }}
                        />
                      </label>
                      <label className="block space-y-1">
                        <span>Masse salariale (€)</span>
                        <input
                          type="number"
                          step="1"
                          min={0}
                          className={inputCls}
                          placeholder="Non renseigné"
                          value={kpiForm.payrollMassEur}
                          onChange={(e) => {
                            setKpiDirty(true);
                            setKpiForm((f) => ({ ...f, payrollMassEur: e.target.value }));
                          }}
                        />
                      </label>
                      <label className="block space-y-1">
                        <span>Productivité horaire (€/h)</span>
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          className={inputCls}
                          placeholder="Non renseigné"
                          value={kpiForm.productivityPerHour}
                          onChange={(e) => {
                            setKpiDirty(true);
                            setKpiForm((f) => ({ ...f, productivityPerHour: e.target.value }));
                          }}
                        />
                      </label>
                      <label className="block space-y-1">
                        <span>Objectif mensuel (€)</span>
                        <input
                          type="number"
                          step="1"
                          min={0}
                          className={inputCls}
                          placeholder="Non renseigné"
                          value={kpiForm.monthlyTargetEur}
                          onChange={(e) => {
                            setKpiDirty(true);
                            setKpiForm((f) => ({ ...f, monthlyTargetEur: e.target.value }));
                          }}
                        />
                      </label>
                    </div>
                  )}

                  {snapshot.capabilities.canEditOperationalKpis && (
                    <button type="submit" className={buttonPrimary} disabled={busy}>
                      Enregistrer les indicateurs du club
                    </button>
                  )}
                </fieldset>
              </form>
            </div>
          )}

          {tab === 'missions' && (
            <div className="space-y-4">
              {!snapshot.site.missionsModuleActive && (
                <div
                  role="status"
                  className="cf-card p-4 border border-amber-500/50 bg-amber-950/30 text-amber-200 text-xs flex items-start gap-2"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <strong>Module Missions désactivé sur {clubLabel}</strong> : la création de
                    nouvelles missions est bloquée tant que l’option n’est pas activée dans{' '}
                    <em>Paramètres RH</em>. Les missions existantes restent consultables et
                    clôturables.
                  </div>
                </div>
              )}

              {snapshot.capabilities.canManageMissions &&
                (snapshot.site.missionsModuleActive || editingMissionId) && (
                  <form
                    className="cf-card p-4 space-y-4 min-w-0"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const budgetNum = Number(missionForm.budgetHours);
                      const loggedNum = Number(missionForm.loggedHours || '0');
                      const hourlyNum = snapshot.capabilities.canViewFinances
                        ? Number(missionForm.hourlyBudgetEur || '26')
                        : undefined;
                      const errMsg = validateMissionForm({
                        title: missionForm.title,
                        budgetHours: budgetNum,
                        hourlyBudgetEur: hourlyNum,
                        canViewFinances: snapshot.capabilities.canViewFinances,
                      });
                      if (errMsg) {
                        setError(errMsg);
                        return;
                      }
                      if (editingMissionId) {
                        void sendMutation(
                          {
                            action: 'update_mission',
                            id: editingMissionId,
                            title: missionForm.title.trim(),
                            budgetHours: budgetNum,
                            loggedHours: Number.isFinite(loggedNum) ? loggedNum : undefined,
                            hourlyBudgetEur: hourlyNum,
                          },
                          `Mission mise à jour pour ${clubLabel}.`,
                          resetMissionForm,
                        );
                      } else {
                        void sendMutation(
                          {
                            action: 'create_mission',
                            title: missionForm.title.trim(),
                            budgetHours: budgetNum,
                            loggedHours: Number.isFinite(loggedNum) ? loggedNum : 0,
                            hourlyBudgetEur: hourlyNum,
                          },
                          `Mission créée sur ${clubLabel}.`,
                          resetMissionForm,
                        );
                      }
                    }}
                  >
                    <h3 className="font-bold flex items-center gap-2 text-sm">
                      <Plus className="w-4 h-4 text-violet-400" />
                      <span>
                        {editingMissionId
                          ? 'Modifier la mission'
                          : `Créer une mission sur ${clubLabel}`}
                      </span>
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      <label className="block space-y-1 sm:col-span-2">
                        <span>Intitulé de la mission</span>
                        <input
                          required
                          maxLength={120}
                          className={inputCls}
                          placeholder="Ex. Audit matériel cardio Q4"
                          value={missionForm.title}
                          onChange={(e) =>
                            setMissionForm((f) => ({ ...f, title: e.target.value }))
                          }
                        />
                      </label>
                      <label className="block space-y-1">
                        <span>Budget d’heures</span>
                        <input
                          required
                          type="number"
                          step="0.5"
                          min={0.5}
                          max={2000}
                          className={inputCls}
                          value={missionForm.budgetHours}
                          onChange={(e) =>
                            setMissionForm((f) => ({ ...f, budgetHours: e.target.value }))
                          }
                        />
                      </label>
                      <label className="block space-y-1">
                        <span>Heures réalisées</span>
                        <input
                          type="number"
                          step="0.5"
                          min={0}
                          max={6000}
                          className={inputCls}
                          value={missionForm.loggedHours}
                          onChange={(e) =>
                            setMissionForm((f) => ({ ...f, loggedHours: e.target.value }))
                          }
                        />
                      </label>
                      {snapshot.capabilities.canViewFinances && (
                        <label className="block space-y-1">
                          <span>Taux horaire budgété (€/h)</span>
                          <input
                            type="number"
                            step="0.5"
                            min={0}
                            max={500}
                            className={inputCls}
                            value={missionForm.hourlyBudgetEur}
                            onChange={(e) =>
                              setMissionForm((f) => ({
                                ...f,
                                hourlyBudgetEur: e.target.value,
                              }))
                            }
                          />
                        </label>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        className={buttonPrimary}
                        disabled={busy || !missionForm.title.trim()}
                      >
                        {editingMissionId ? 'Enregistrer la mission' : 'Créer la mission'}
                      </button>
                      {editingMissionId && (
                        <button
                          type="button"
                          className={buttonSecondary}
                          onClick={resetMissionForm}
                        >
                          Annuler
                        </button>
                      )}
                    </div>
                  </form>
                )}

              <div className="cf-card p-4 space-y-3 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold flex items-center gap-2 text-sm">
                    <Briefcase className="w-4 h-4 text-cyan-400" />
                    <span>
                      Missions sur {clubLabel} ({filteredMissions.length})
                    </span>
                  </h3>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {(
                      [
                        ['all', `Toutes (${snapshot.missions.length})`],
                        ['active', `En cours (${snapshot.operationalSummary.activeMissionsCount})`],
                        ['done', `Terminées (${snapshot.operationalSummary.completedMissionsCount})`],
                      ] as Array<[MissionFilter, string]>
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setMissionFilter(id)}
                        className={missionFilter === id ? buttonPrimary : buttonSecondary}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredMissions.length === 0 ? (
                  <p className="text-xs cf-muted">
                    Aucune mission ne correspond au filtre sélectionné sur {clubLabel}.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {filteredMissions.map((m) => (
                      <div
                        key={m.id}
                        className="cf-card-secondary p-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="font-semibold flex flex-wrap items-center gap-2">
                            <span>{m.title}</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] ${
                                m.status === 'done'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-cyan-500/20 text-cyan-300'
                              }`}
                            >
                              {m.status === 'done' ? 'Terminée' : 'En cours'}
                            </span>
                          </div>
                          <div className="cf-muted flex flex-wrap gap-3">
                            <span>
                              Heures : {m.loggedHours} h / {m.budgetHours} h
                            </span>
                            {snapshot.capabilities.canViewFinances && (
                              <span>
                                Coût engagé : {formatOptionalMetric(m.loggedCostEur, '€', 0)} /{' '}
                                {formatOptionalMetric(m.estimatedBudgetEur, '€', 0)} (
                                {formatOptionalMetric(m.hourlyBudgetEur, '€/h', 0)})
                              </span>
                            )}
                          </div>
                        </div>

                        {snapshot.capabilities.canManageMissions && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={buttonSecondary}
                              disabled={busy}
                              onClick={() =>
                                void sendMutation(
                                  { action: 'update_mission', id: m.id, addHours: 1 },
                                  `+1 h enregistrée sur « ${m.title} ».`,
                                )
                              }
                            >
                              +1 h
                            </button>
                            <button
                              type="button"
                              className={buttonSecondary}
                              disabled={busy}
                              onClick={() =>
                                void sendMutation(
                                  {
                                    action: 'update_mission',
                                    id: m.id,
                                    status: m.status === 'done' ? 'active' : 'done',
                                  },
                                  m.status === 'done'
                                    ? `Mission « ${m.title} » réouverte.`
                                    : `Mission « ${m.title} » marquée terminée.`,
                                )
                              }
                            >
                              {m.status === 'done' ? 'Réouvrir' : 'Terminer'}
                            </button>
                            <button
                              type="button"
                              className={buttonSecondary}
                              disabled={busy}
                              onClick={() => startEditMission(m)}
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              className={buttonSecondary}
                              disabled={busy}
                              onClick={() =>
                                void sendMutation(
                                  { action: 'delete_mission', id: m.id },
                                  `Mission « ${m.title} » supprimée.`,
                                )
                              }
                            >
                              <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                              Supprimer
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
