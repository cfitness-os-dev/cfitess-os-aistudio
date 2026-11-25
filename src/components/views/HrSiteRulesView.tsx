import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Users,
} from 'lucide-react';
import { useCfos } from '../../context/CfosContext';
import { useLeadDraftGuard } from '../useLeadDraftGuard';
import { confirmLeadDraftNavigation } from '../../domain/leadDraftGuard';
import { LeaveCounterRulesPanel } from './LeaveCounterRulesPanel';
import { HrLeaveAccrualPanel } from './HrLeaveAccrualPanel';
import { HrLeaveCarryPanel } from './HrLeaveCarryPanel';
import {
  DAY_OF_WEEK_LABELS,
  fetchHrSiteRules,
  MOTIVE_CATEGORY_LABELS,
  mutateHrSiteRules,
  validateBaseRulesForm,
  validateStaffingNeedForm,
  type HrSiteRulesCommand,
  type HrSiteRulesSnapshot,
  type SiteAbsenceMotiveConfig,
  type SiteStaffingNeed,
} from '../../domain/hrSiteRules';
import type { ClubId } from '../../types/cfos';

type RulesTab = 'rules' | 'counters' | 'absences' | 'needs' | 'accrual' | 'carryovers';

interface HrSiteRulesViewProps {
  clubId: ClubId;
  onMutated?: () => void;
}

export function HrSiteRulesView({ clubId, onMutated }: HrSiteRulesViewProps) {
  const { currentUser } = useCfos();
  const [tab, setTab] = useState<RulesTab>('rules');
  const [snapshot, setSnapshot] = useState<HrSiteRulesSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Form states
  const [baseForm, setBaseForm] = useState({
    dayStartHour: '06:00',
    breakAlertEnabled: true,
    breakAlertHours: 6,
    consecutiveDaysBlocking: false,
    complementaryMaxHours: 10,
    smartPlannerBreakMaxHours: 2,
    alertsLayout: 'split_13_6',
    missionsModuleActive: true,
    reportRulesVisible: true,
  });
  const [baseDirty, setBaseDirty] = useState(false);

  const [counterForm, setCounterForm] = useState({
    acquisitionMode: '',
    annualizationPeriod: '',
    sundayHoursInAnnualization: false,
    rttHoursCounterActive: false,
  });
  const [counterDirty, setCounterDirty] = useState(false);

  const [motiveSearch, setMotiveSearch] = useState('');
  const [editingMotiveId, setEditingMotiveId] = useState<string | null>(null);
  const [motiveForm, setMotiveForm] = useState<{
    label: string;
    category: SiteAbsenceMotiveConfig['category'];
    active: boolean;
    employeeRequestable: boolean;
    includedInAnnualization: boolean;
    requiresDocument: boolean;
  }>({
    label: '',
    category: 'conges',
    active: true,
    employeeRequestable: true,
    includedInAnnualization: true,
    requiresDocument: false,
  });

  const [editingNeedId, setEditingNeedId] = useState<string | null>(null);
  const [needForm, setNeedForm] = useState<{
    positionId: string;
    dayOfWeek: SiteStaffingNeed['dayOfWeek'];
    kind: 'fixed' | 'variable';
    startTime: string;
    endTime: string;
    minHeadcount: number;
    active: boolean;
    note: string;
  }>({
    positionId: '',
    dayOfWeek: 'weekdays',
    kind: 'fixed',
    startTime: '09:00',
    endTime: '18:00',
    minHeadcount: 1,
    active: true,
    note: '',
  });

  useLeadDraftGuard(
    baseDirty ||
      counterDirty ||
      !!motiveForm.label.trim() ||
      !!editingMotiveId ||
      !!editingNeedId ||
      !!needForm.note.trim(),
  );

  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const submittingRef = useRef(false);

  const syncFormsFromSnapshot = (data: HrSiteRulesSnapshot) => {
    setBaseForm({
      dayStartHour: data.settings.dayStartHour,
      breakAlertEnabled: data.settings.breakAlertEnabled,
      breakAlertHours: data.settings.breakAlertHours,
      consecutiveDaysBlocking: data.settings.consecutiveDaysBlocking,
      complementaryMaxHours: data.settings.complementaryMaxHours,
      smartPlannerBreakMaxHours: data.settings.smartPlannerBreakMaxHours,
      alertsLayout: data.settings.alertsLayout,
      missionsModuleActive: data.settings.missionsModuleActive,
      reportRulesVisible: data.settings.reportRulesVisible,
    });
    setBaseDirty(false);
    setCounterForm({
      acquisitionMode: data.settings.acquisitionMode,
      annualizationPeriod: data.settings.annualizationPeriod,
      sundayHoursInAnnualization: data.settings.sundayHoursInAnnualization,
      rttHoursCounterActive: data.settings.rttHoursCounterActive,
    });
    setCounterDirty(false);
    setNeedForm((prev) => ({
      ...prev,
      positionId: data.positions.some((p) => p.id === prev.positionId)
        ? prev.positionId
        : (data.positions[0]?.id ?? ''),
    }));
  };

  async function loadRules(preserveDrafts = false) {
    const ticket = ++seqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const data = await fetchHrSiteRules(currentUser.id, clubId, controller.signal);
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
            : 'Impossible de charger les paramètres RH de l’établissement.',
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
    setEditingMotiveId(null);
    setEditingNeedId(null);
    setMotiveForm({
      label: '',
      category: 'conges',
      active: true,
      employeeRequestable: true,
      includedInAnnualization: true,
      requiresDocument: false,
    });
    void loadRules(false);
    return () => {
      seqRef.current += 1;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, clubId]);

  const sendMutation = async (
    command: HrSiteRulesCommand,
    successMsg: string,
    after?: () => void,
  ) => {
    if (!snapshot || submittingRef.current || busy) return false;
    submittingRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await mutateHrSiteRules(
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
          : 'Enregistrement refusé. Aucune modification confirmée.',
      );
      return false;
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  };

  const filteredMotives = useMemo(() => {
    if (!snapshot) return [];
    const q = motiveSearch.trim().toLocaleLowerCase('fr');
    if (!q) return snapshot.motives;
    return snapshot.motives.filter((m) =>
      `${m.label} ${MOTIVE_CATEGORY_LABELS[m.category] ?? m.category}`
        .toLocaleLowerCase('fr')
        .includes(q),
    );
  }, [snapshot, motiveSearch]);

  const positionNameById = useMemo(
    () => new Map((snapshot?.positions ?? []).map((p) => [p.id, p.label])),
    [snapshot?.positions],
  );

  const buttonPrimary =
    'cf-brand-gradient text-white px-4 py-2 rounded-xl min-h-[44px] text-sm font-semibold disabled:opacity-40 cursor-pointer';
  const buttonSecondary =
    'cf-card-secondary px-3 py-2 rounded-xl min-h-[44px] text-sm font-medium hover:border-violet-500/60 disabled:opacity-40 cursor-pointer';
  const inputCls = 'cf-input w-full min-w-0 min-h-[44px] px-3 py-2 rounded-xl text-sm';

  const clubLabel = clubId === 'beynost' ? 'Beynost' : 'Carré de Soie';

  return (
    <section
      className="space-y-4 min-w-0"
      aria-label="Paramètres RH par établissement"
      aria-busy={loading || busy}
    >
      <header className="cf-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-violet-400 shrink-0" />
            <span>Paramètres RH de l’établissement</span>
          </h2>
          <p className="text-xs cf-muted">
            <Building2 className="w-3.5 h-3.5 inline mr-1 text-cyan-400" />
            Club actif : <strong className="text-slate-200">{clubLabel}</strong>
            {snapshot?.site.siret ? ` · SIRET ${snapshot.site.siret}` : ''}
            {snapshot?.demoMode ? ' · Environnement de test' : ''}
          </p>
        </div>
        <button
          type="button"
          className={buttonSecondary}
          disabled={loading || busy}
          onClick={() => void loadRules(false)}
        >
          <span className="flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </span>
        </button>
      </header>

      {error && (
        <div role="alert" className="cf-card p-4 border border-red-500/60 bg-red-950/30 text-red-100 text-sm space-y-2">
          <p>{error}</p>
          <button type="button" className={buttonSecondary} onClick={() => void loadRules(false)}>
            Recharger la version serveur
          </button>
        </div>
      )}

      {notice && (
        <div role="status" className="cf-card p-3 border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{notice}</span>
        </div>
      )}

      {loading && !snapshot ? (
        <div className="cf-card p-6 text-sm cf-muted">Chargement des paramètres de {clubLabel}…</div>
      ) : !snapshot ? (
        <div className="cf-card p-6 text-sm cf-muted">
          Paramètres indisponibles pour votre profil sur {clubLabel}.
        </div>
      ) : (
        <>
          <nav aria-label="Rubriques des paramètres de l’établissement" className="flex flex-wrap gap-2">
            {(
              [
                ['rules', 'Règles, alertes & badgeuse'],
                ['counters', 'Compteurs & annualisation'],
                ['accrual', 'Acquisition et report'],
                ['carryovers', 'Reports exceptionnels'],
                ['absences', `Motifs d’absence (${snapshot.motives.length})`],
                ['needs', `Besoins en personnel (${snapshot.staffingNeeds.length})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => { if (id===tab || confirmLeadDraftNavigation(()=>setTab(id))) setTab(id); }}
                className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                  tab === id
                    ? 'cf-brand-gradient text-white'
                    : 'cf-card-secondary hover:border-violet-500/50'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === 'accrual' && <HrLeaveAccrualPanel key={`${currentUser.id}:${clubId}`} actorId={currentUser.id} club={clubId} />}
          {tab === 'carryovers' && <HrLeaveCarryPanel key={`${currentUser.id}:${clubId}`} actorId={currentUser.id} club={clubId} />}

          {(tab === 'counters' || tab === 'absences') && <LeaveCounterRulesPanel key={`${currentUser.id}:${clubId}`} actorId={currentUser.id} club={clubId} />}

          {tab === 'rules' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
              <form
                className="cf-card p-4 space-y-3 min-w-0"
                onSubmit={(e) => {
                  e.preventDefault();
                  const msg = validateBaseRulesForm(baseForm);
                  if (msg) {
                    setError(msg);
                    return;
                  }
                  void sendMutation(
                    {
                      action: 'save_base_rules',
                      ...baseForm,
                    },
                    `Règles et alertes enregistrées pour ${clubLabel}.`,
                  );
                }}
              >
                <h3 className="font-bold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-violet-400" />
                  <span>Règles planning, alertes et rapports</span>
                </h3>
                <fieldset
                  disabled={busy || !snapshot.capabilities.canEditRules}
                  className="space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <label className="block space-y-1">
                      <span>Heure de début de journée</span>
                      <input
                        required
                        pattern="\d{2}:\d{2}"
                        className={inputCls}
                        value={baseForm.dayStartHour}
                        onChange={(e) => {
                          setBaseDirty(true);
                          setBaseForm((f) => ({ ...f, dayStartHour: e.target.value }));
                        }}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span>Seuil d’alerte pause (heures)</span>
                      <input
                        required
                        type="number"
                        min={1}
                        max={12}
                        className={inputCls}
                        value={baseForm.breakAlertHours}
                        onChange={(e) => {
                          setBaseDirty(true);
                          setBaseForm((f) => ({
                            ...f,
                            breakAlertHours: Number(e.target.value),
                          }));
                        }}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span>Plafond heures complémentaires (h)</span>
                      <input
                        required
                        type="number"
                        min={1}
                        max={48}
                        className={inputCls}
                        value={baseForm.complementaryMaxHours}
                        onChange={(e) => {
                          setBaseDirty(true);
                          setBaseForm((f) => ({
                            ...f,
                            complementaryMaxHours: Number(e.target.value),
                          }));
                        }}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span>Pause max planification auto (h)</span>
                      <input
                        required
                        type="number"
                        min={1}
                        max={12}
                        className={inputCls}
                        value={baseForm.smartPlannerBreakMaxHours}
                        onChange={(e) => {
                          setBaseDirty(true);
                          setBaseForm((f) => ({
                            ...f,
                            smartPlannerBreakMaxHours: Number(e.target.value),
                          }));
                        }}
                      />
                    </label>
                    <label className="block space-y-1 sm:col-span-2">
                      <span>Disposition des alertes planning</span>
                      <select
                        className={inputCls}
                        disabled={!snapshot.capabilities.canEditAlertsAndReport}
                        value={baseForm.alertsLayout}
                        onChange={(e) => {
                          setBaseDirty(true);
                          setBaseForm((f) => ({ ...f, alertsLayout: e.target.value }));
                        }}
                      >
                        <option value="split_13_6">Par catégorie (séparées)</option>
                        <option value="single_list">Liste unique</option>
                      </select>
                    </label>
                  </div>

                  <div className="space-y-2 text-xs">
                    <label className="flex items-center gap-2 min-h-[36px]">
                      <input
                        type="checkbox"
                        disabled={!snapshot.capabilities.canEditAlertsAndReport}
                        checked={baseForm.breakAlertEnabled}
                        onChange={(e) => {
                          setBaseDirty(true);
                          setBaseForm((f) => ({ ...f, breakAlertEnabled: e.target.checked }));
                        }}
                      />
                      <span>Activer l’alerte de pause minimale</span>
                    </label>
                    <label className="flex items-center gap-2 min-h-[36px]">
                      <input
                        type="checkbox"
                        checked={baseForm.consecutiveDaysBlocking}
                        onChange={(e) => {
                          setBaseDirty(true);
                          setBaseForm((f) => ({
                            ...f,
                            consecutiveDaysBlocking: e.target.checked,
                          }));
                        }}
                      />
                      <span>Bloquer les dépassements de jours consécutifs</span>
                    </label>
                    <label className="flex items-center gap-2 min-h-[36px]">
                      <input
                        type="checkbox"
                        checked={baseForm.missionsModuleActive}
                        onChange={(e) => {
                          setBaseDirty(true);
                          setBaseForm((f) => ({
                            ...f,
                            missionsModuleActive: e.target.checked,
                          }));
                        }}
                      />
                      <span>Activer le module Missions sur ce club</span>
                    </label>
                    <label className="flex items-center gap-2 min-h-[36px]">
                      <input
                        type="checkbox"
                        disabled={!snapshot.capabilities.canEditAlertsAndReport}
                        checked={baseForm.reportRulesVisible}
                        onChange={(e) => {
                          setBaseDirty(true);
                          setBaseForm((f) => ({
                            ...f,
                            reportRulesVisible: e.target.checked,
                          }));
                        }}
                      />
                      <span>Afficher les règles du rapport RH</span>
                    </label>
                  </div>

                  {snapshot.capabilities.canEditRules && (
                    <button type="submit" className={buttonPrimary} disabled={busy}>
                      Enregistrer les règles de l’établissement
                    </button>
                  )}
                </fieldset>
              </form>

              <div className="cf-card p-4 space-y-3 min-w-0">
                <h3 className="font-bold flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Paramètres de badgeuse du club</span>
                </h3>
                <p className="text-xs cf-muted">
                  La modification des règles de badgeage est strictement réservée au propriétaire ou super administrateur de {clubLabel}.
                </p>

                <div className="cf-card-secondary p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span>Fréquence de badgeage</span>
                  <button
                    type="button"
                    className={buttonSecondary}
                    disabled={busy || !snapshot.capabilities.canEditBadgeSettings}
                    onClick={() =>
                      void sendMutation(
                        {
                          action: 'save_badge_settings',
                          badgeFrequency:
                            snapshot.settings.badgeFrequency === 'each_shift'
                              ? 'consecutive_shift_series'
                              : 'each_shift',
                          tabletBreakBadging: snapshot.settings.tabletBreakBadging,
                        },
                        `Fréquence de badgeage enregistrée pour ${clubLabel}.`,
                      )
                    }
                  >
                    {snapshot.settings.badgeFrequency === 'each_shift'
                      ? 'Chaque shift'
                      : 'Série consécutive'}
                  </button>
                </div>

                <div className="cf-card-secondary p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span>Badgeage des pauses sur tablette</span>
                  <button
                    type="button"
                    className={buttonSecondary}
                    aria-pressed={snapshot.settings.tabletBreakBadging}
                    disabled={busy || !snapshot.capabilities.canEditBadgeSettings}
                    onClick={() =>
                      void sendMutation(
                        {
                          action: 'save_badge_settings',
                          badgeFrequency:
                            snapshot.settings.badgeFrequency === 'consecutive_shift_series'
                              ? 'consecutive_shift_series'
                              : 'each_shift',
                          tabletBreakBadging: !snapshot.settings.tabletBreakBadging,
                        },
                        `Badgeage des pauses mis à jour pour ${clubLabel}.`,
                      )
                    }
                  >
                    {snapshot.settings.tabletBreakBadging ? 'Activé' : 'Désactivé'}
                  </button>
                </div>

                {!snapshot.capabilities.canEditBadgeSettings && (
                  <p className="text-xs text-amber-300">
                    Consultation uniquement : seuls le propriétaire ou super administrateur de ce club peuvent modifier la badgeuse.
                  </p>
                )}
              </div>
            </div>
          )}

          {tab === 'counters' && (
            <form
              className="cf-card p-4 space-y-4 min-w-0"
              onSubmit={(e) => {
                e.preventDefault();
                void sendMutation(
                  {
                    action: 'save_counter_rules',
                    ...counterForm,
                  },
                  `Règles des compteurs et d’annualisation enregistrées pour ${clubLabel}.`,
                );
              }}
            >
              <h3 className="font-bold flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-cyan-400" />
                <span>Compteurs activables et paramètres d’annualisation</span>
              </h3>
              <p className="text-xs cf-muted">
                Ces réglages configurent les libellés et compteurs actifs de l’établissement sans déclencher de calcul de paie ou de débit automatique non validé.
              </p>

              <fieldset
                disabled={busy || !snapshot.capabilities.canEditRules}
                className="space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <label className="block space-y-1">
                    <span>Mode d’acquisition des congés payés</span>
                    <input
                      required
                      maxLength={80}
                      className={inputCls}
                      value={counterForm.acquisitionMode}
                      onChange={(e) => {
                        setCounterDirty(true);
                        setCounterForm((f) => ({ ...f, acquisitionMode: e.target.value }));
                      }}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span>Période d’annualisation</span>
                    <input
                      required
                      maxLength={80}
                      className={inputCls}
                      value={counterForm.annualizationPeriod}
                      onChange={(e) => {
                        setCounterDirty(true);
                        setCounterForm((f) => ({
                          ...f,
                          annualizationPeriod: e.target.value,
                        }));
                      }}
                    />
                  </label>
                </div>

                <div className="space-y-2 text-xs">
                  <label className="flex items-center gap-2 min-h-[36px]">
                    <input
                      type="checkbox"
                      checked={counterForm.sundayHoursInAnnualization}
                      onChange={(e) => {
                        setCounterDirty(true);
                        setCounterForm((f) => ({
                          ...f,
                          sundayHoursInAnnualization: e.target.checked,
                        }));
                      }}
                    />
                    <span>Inclure les heures du dimanche dans l’annualisation</span>
                  </label>
                  <label className="flex items-center gap-2 min-h-[36px]">
                    <input
                      type="checkbox"
                      checked={counterForm.rttHoursCounterActive}
                      onChange={(e) => {
                        setCounterDirty(true);
                        setCounterForm((f) => ({
                          ...f,
                          rttHoursCounterActive: e.target.checked,
                        }));
                      }}
                    />
                    <span>Activer le compteur RTT sur les contrats en heures</span>
                  </label>
                </div>

                <div className="cf-card-secondary p-3 text-xs">
                  Motifs actifs pris en compte dans l’annualisation :{' '}
                  <strong>
                    {snapshot.settings.annualizationIncludedMotives} /{' '}
                    {snapshot.settings.annualizationTotalMotives}
                  </strong>
                </div>

                {snapshot.capabilities.canEditRules && (
                  <button type="submit" className={buttonPrimary} disabled={busy}>
                    Enregistrer les paramètres de compteurs
                  </button>
                )}
              </fieldset>
            </form>
          )}

          {tab === 'absences' && (
            <div className="space-y-4 min-w-0">
              {snapshot.capabilities.canEditAbsences && (
                <form
                  className="cf-card p-4 space-y-3 min-w-0"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendMutation(
                      {
                        action: 'save_absence_motive',
                        ...(editingMotiveId ? { id: editingMotiveId } : {}),
                        ...motiveForm,
                      },
                      editingMotiveId
                        ? `Motif « ${motiveForm.label} » mis à jour pour ${clubLabel}.`
                        : `Motif « ${motiveForm.label} » ajouté pour ${clubLabel}.`,
                      () => {
                        setEditingMotiveId(null);
                        setMotiveForm({
                          label: '',
                          category: 'conges',
                          active: true,
                          employeeRequestable: true,
                          includedInAnnualization: true,
                          requiresDocument: false,
                        });
                      },
                    );
                  }}
                >
                  <h3 className="font-bold flex items-center gap-2">
                    <Plus className="w-4 h-4 text-violet-400" />
                    <span>
                      {editingMotiveId
                        ? 'Modifier un motif d’absence'
                        : 'Ajouter un motif d’absence sur ce club'}
                    </span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <label className="block space-y-1">
                      <span>Libellé du motif</span>
                      <input
                        required
                        maxLength={100}
                        className={inputCls}
                        placeholder="Ex. Congé paternité"
                        value={motiveForm.label}
                        onChange={(e) =>
                          setMotiveForm((f) => ({ ...f, label: e.target.value }))
                        }
                      />
                    </label>
                    <label className="block space-y-1">
                      <span>Catégorie</span>
                      <select
                        className={inputCls}
                        value={motiveForm.category}
                        onChange={(e) =>
                          setMotiveForm((f) => ({
                            ...f,
                            category: e.target.value as SiteAbsenceMotiveConfig['category'],
                          }))
                        }
                      >
                        {Object.entries(MOTIVE_CATEGORY_LABELS).map(([k, lbl]) => (
                          <option key={k} value={k}>
                            {lbl}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs">
                    <label className="flex items-center gap-2 min-h-[36px]">
                      <input
                        type="checkbox"
                        checked={motiveForm.active}
                        onChange={(e) =>
                          setMotiveForm((f) => ({ ...f, active: e.target.checked }))
                        }
                      />
                      <span>Actif</span>
                    </label>
                    <label className="flex items-center gap-2 min-h-[36px]">
                      <input
                        type="checkbox"
                        checked={motiveForm.employeeRequestable}
                        onChange={(e) =>
                          setMotiveForm((f) => ({
                            ...f,
                            employeeRequestable: e.target.checked,
                          }))
                        }
                      />
                      <span>Demandable par le salarié</span>
                    </label>
                    <label className="flex items-center gap-2 min-h-[36px]">
                      <input
                        type="checkbox"
                        checked={motiveForm.includedInAnnualization}
                        onChange={(e) =>
                          setMotiveForm((f) => ({
                            ...f,
                            includedInAnnualization: e.target.checked,
                          }))
                        }
                      />
                      <span>Inclus dans l’annualisation</span>
                    </label>
                    <label className="flex items-center gap-2 min-h-[36px]">
                      <input
                        type="checkbox"
                        checked={motiveForm.requiresDocument}
                        onChange={(e) =>
                          setMotiveForm((f) => ({
                            ...f,
                            requiresDocument: e.target.checked,
                          }))
                        }
                      />
                      <span>Justificatif requis</span>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className={buttonPrimary}
                      disabled={busy || !motiveForm.label.trim()}
                    >
                      {editingMotiveId ? 'Mettre à jour le motif' : 'Ajouter le motif'}
                    </button>
                    {editingMotiveId && (
                      <button
                        type="button"
                        className={buttonSecondary}
                        onClick={() => {
                          setEditingMotiveId(null);
                          setMotiveForm({
                            label: '',
                            category: 'conges',
                            active: true,
                            employeeRequestable: true,
                            includedInAnnualization: true,
                            requiresDocument: false,
                          });
                        }}
                      >
                        Annuler l’édition
                      </button>
                    )}
                  </div>
                </form>
              )}

              <div className="cf-card p-4 space-y-3 min-w-0">
                <label className="block space-y-1 text-xs">
                  <span className="cf-muted flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5" />
                    Filtrer les motifs d’absence
                  </span>
                  <input
                    type="search"
                    className={inputCls}
                    placeholder="Nom ou catégorie"
                    value={motiveSearch}
                    onChange={(e) => setMotiveSearch(e.target.value)}
                  />
                </label>

                <div className="space-y-2">
                  {filteredMotives.map((m) => (
                    <article
                      key={m.id}
                      className="cf-card-secondary p-3 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="font-semibold text-sm break-words">
                          {m.label}{' '}
                          <span className="text-[11px] font-normal cf-muted">
                            · {MOTIVE_CATEGORY_LABELS[m.category] ?? m.category}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 text-[11px]">
                          <span className={`px-2 py-0.5 rounded ${m.active ? 'bg-emerald-500/20 text-emerald-200' : 'bg-slate-700/60 cf-muted'}`}>
                            {m.active ? 'Actif' : 'Désactivé'}
                          </span>
                          {m.employeeRequestable && (
                            <span className="px-2 py-0.5 rounded bg-violet-500/20 text-violet-200">
                              Demandable salarié
                            </span>
                          )}
                          {m.includedInAnnualization && (
                            <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-200">
                              Annualisation
                            </span>
                          )}
                          {m.requiresDocument && (
                            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-200">
                              Justificatif requis
                            </span>
                          )}
                        </div>
                      </div>
                      {snapshot.capabilities.canEditAbsences && (
                        <button
                          type="button"
                          className={buttonSecondary}
                          disabled={busy}
                          onClick={() => {
                            setEditingMotiveId(m.id);
                            setMotiveForm({
                              label: m.label,
                              category: m.category,
                              active: m.active,
                              employeeRequestable: m.employeeRequestable,
                              includedInAnnualization: m.includedInAnnualization,
                              requiresDocument: m.requiresDocument,
                            });
                          }}
                        >
                          Modifier
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'needs' && (
            <div className="space-y-4 min-w-0">
              {snapshot.capabilities.canEditStaffingNeeds && (
                <form
                  className="cf-card p-4 space-y-3 min-w-0"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const errMsg = validateStaffingNeedForm(needForm);
                    if (errMsg) {
                      setError(errMsg);
                      return;
                    }
                    void sendMutation(
                      {
                        action: 'save_staffing_need',
                        ...(editingNeedId ? { id: editingNeedId } : {}),
                        ...needForm,
                      },
                      editingNeedId
                        ? `Besoin en personnel mis à jour pour ${clubLabel}.`
                        : `Besoin en personnel ajouté pour ${clubLabel}.`,
                      () => {
                        setEditingNeedId(null);
                        setNeedForm((f) => ({ ...f, note: '' }));
                      },
                    );
                  }}
                >
                  <h3 className="font-bold flex items-center gap-2">
                    <Users className="w-4 h-4 text-cyan-400" />
                    <span>
                      {editingNeedId
                        ? 'Modifier un besoin en personnel'
                        : 'Ajouter un besoin en personnel (lié aux postes du club)'}
                    </span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                    <label className="block space-y-1">
                      <span>Poste du club</span>
                      <select
                        required
                        className={inputCls}
                        value={needForm.positionId}
                        onChange={(e) =>
                          setNeedForm((f) => ({ ...f, positionId: e.target.value }))
                        }
                      >
                        {snapshot.positions.map((pos) => (
                          <option key={pos.id} value={pos.id}>
                            {pos.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-1">
                      <span>Jour ou plage</span>
                      <select
                        className={inputCls}
                        value={needForm.dayOfWeek}
                        onChange={(e) =>
                          setNeedForm((f) => ({
                            ...f,
                            dayOfWeek: e.target.value as SiteStaffingNeed['dayOfWeek'],
                          }))
                        }
                      >
                        {Object.entries(DAY_OF_WEEK_LABELS).map(([k, lbl]) => (
                          <option key={k} value={k}>
                            {lbl}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-1">
                      <span>Type de besoin</span>
                      <select
                        className={inputCls}
                        value={needForm.kind}
                        onChange={(e) =>
                          setNeedForm((f) => ({
                            ...f,
                            kind: e.target.value as 'fixed' | 'variable',
                          }))
                        }
                      >
                        <option value="fixed">Besoin fixe</option>
                        <option value="variable">Besoin variable</option>
                      </select>
                    </label>
                    <label className="block space-y-1">
                      <span>Heure de début</span>
                      <input
                        required
                        type="time"
                        className={inputCls}
                        value={needForm.startTime}
                        onChange={(e) =>
                          setNeedForm((f) => ({ ...f, startTime: e.target.value }))
                        }
                      />
                    </label>
                    <label className="block space-y-1">
                      <span>Heure de fin</span>
                      <input
                        required
                        type="time"
                        className={inputCls}
                        value={needForm.endTime}
                        onChange={(e) =>
                          setNeedForm((f) => ({ ...f, endTime: e.target.value }))
                        }
                      />
                    </label>
                    <label className="block space-y-1">
                      <span>Effectif minimal</span>
                      <input
                        required
                        type="number"
                        min={1}
                        max={30}
                        className={inputCls}
                        value={needForm.minHeadcount}
                        onChange={(e) =>
                          setNeedForm((f) => ({
                            ...f,
                            minHeadcount: Number(e.target.value),
                          }))
                        }
                      />
                    </label>
                    <label className="block space-y-1 sm:col-span-2 lg:col-span-3">
                      <span>Précision (optionnelle)</span>
                      <input
                        maxLength={200}
                        className={inputCls}
                        placeholder="Ex. Permanence accueil heures de pointe"
                        value={needForm.note}
                        onChange={(e) =>
                          setNeedForm((f) => ({ ...f, note: e.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className={buttonPrimary}
                      disabled={busy || !needForm.positionId}
                    >
                      {editingNeedId ? 'Mettre à jour le besoin' : 'Ajouter le besoin'}
                    </button>
                    {editingNeedId && (
                      <button
                        type="button"
                        className={buttonSecondary}
                        onClick={() => {
                          setEditingNeedId(null);
                          setNeedForm((f) => ({ ...f, note: '' }));
                        }}
                      >
                        Annuler
                      </button>
                    )}
                  </div>
                </form>
              )}

              <div className="cf-card p-4 space-y-3 min-w-0">
                <h3 className="font-bold text-sm">
                  Besoins configurés sur {clubLabel} ({snapshot.staffingNeeds.length})
                </h3>
                {snapshot.staffingNeeds.length === 0 ? (
                  <p className="text-xs cf-muted">
                    Aucun besoin en personnel configuré sur cet établissement.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {snapshot.staffingNeeds.map((need) => (
                      <article
                        key={need.id}
                        className="cf-card-secondary p-3 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="font-semibold text-sm break-words">
                            {positionNameById.get(need.positionId) ?? need.positionId} ·{' '}
                            {DAY_OF_WEEK_LABELS[need.dayOfWeek] ?? need.dayOfWeek}
                          </div>
                          <div className="cf-muted">
                            {need.kind === 'fixed' ? 'Besoin fixe' : 'Besoin variable'} ·{' '}
                            {need.startTime}–{need.endTime} · {need.minHeadcount} personne(s)
                            {need.note ? ` · ${need.note}` : ''}
                          </div>
                        </div>
                        {snapshot.capabilities.canEditStaffingNeeds && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={buttonSecondary}
                              disabled={busy}
                              onClick={() => {
                                setEditingNeedId(need.id);
                                setNeedForm({
                                  positionId: need.positionId,
                                  dayOfWeek: need.dayOfWeek,
                                  kind: need.kind,
                                  startTime: need.startTime,
                                  endTime: need.endTime,
                                  minHeadcount: need.minHeadcount,
                                  active: need.active,
                                  note: need.note,
                                });
                              }}
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              className={buttonSecondary}
                              disabled={busy}
                              onClick={() =>
                                void sendMutation(
                                  { action: 'remove_staffing_need', id: need.id },
                                  `Besoin supprimé pour ${clubLabel}.`,
                                )
                              }
                            >
                              <span className="flex items-center gap-1">
                                <Trash2 className="w-3.5 h-3.5" />
                                Supprimer
                              </span>
                            </button>
                          </div>
                        )}
                      </article>
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
