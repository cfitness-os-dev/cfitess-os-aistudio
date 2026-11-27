import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  EyeOff,
  FileText,
  History,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { useCfos } from '../../context/CfosContext';
import {
  clubIdToSiteId,
  fetchHrDossiers,
  fetchMyDossier,
  formatEurOptional,
  formatOptionalNumber,
  formatParisDateTime,
  hrFileStatusLabel,
  patchEmployeeDossier,
  regimeLabel,
  updateEmployeeCounters,
  updateEmployeeSiteAccesses,
  validateContractForm,
  validateCounterForm,
  type EmployeeDossierView,
  type HrDossiersWorkspace,
  type PersonalDossierResponse,
  type SiteAccessUpdateInput,
} from '../../domain/hrEmployeeDossier';
import type { ClubId } from '../../types/cfos';
import { PersonalCarryPanel } from './PersonalCarryPanel';

type DossierTab = 'identity' | 'contract' | 'counters';

interface HrEmployeeDossierViewProps {
  clubId: ClubId;
  personalOnly?: boolean;
  initialTab?: DossierTab;
  onDossierMutated?: () => void;
}

const CONTRACT_TYPES = ['CDI', 'CDD', 'Alternance', 'Apprentissage', 'Stage'] as const;

export function HrEmployeeDossierView({
  clubId,
  personalOnly = false,
  initialTab = 'identity',
  onDossierMutated,
}: HrEmployeeDossierViewProps) {
  const { currentUser } = useCfos();
  const [tab, setTab] = useState<DossierTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>(currentUser.id);

  const [hrData, setHrData] = useState<HrDossiersWorkspace | null>(null);
  const [meData, setMeData] = useState<PersonalDossierResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [identityOpen, setIdentityOpen] = useState(false);
  const [identityForm, setIdentityForm] = useState({
    firstName: '',
    lastName: '',
    birthName: '',
    email: '',
    phone: '',
    matricule: '',
    hrFileStatus: 'complete',
    reason: '',
  });

  const [contractOpen, setContractOpen] = useState(false);
  const [contractForm, setContractForm] = useState({
    contractType: 'CDI',
    regime: 'hours',
    weeklyHours: '35',
    annualDays: '218',
    effectiveFrom: '',
    effectiveTo: '',
    monthlyGrossEur: '',
    hourlyRateEur: '',
    reason: '',
  });

  const [counterForm, setCounterForm] = useState({
    cpNAcquired: '0',
    cpNTaken: '0',
    cpNMinus1Remaining: '0',
    rttDaysRemaining: '',
    annualizationBalanceHours: '',
    reason: '',
  });

  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const submittingRef = useRef(false);

  const siteId = clubIdToSiteId(clubId);

  async function loadDossiers(preserveForms = false) {
    const ticket = ++seqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError('');
    try {
      if (personalOnly) {
        const res = await fetchMyDossier(currentUser.id, clubId, controller.signal);
        if (controller.signal.aborted || ticket !== seqRef.current) return;
        setMeData(res);
        setHrData(null);
      } else {
        const res = await fetchHrDossiers(currentUser.id, clubId, controller.signal);
        if (controller.signal.aborted || ticket !== seqRef.current) return;
        setHrData(res);
        setMeData(null);
        setSelectedId((prev) =>
          res.employees.some((e) => e.id === prev)
            ? prev
            : (res.employees.find((e) => e.id === currentUser.id)?.id ??
              res.employees[0]?.id ??
              ''),
        );
      }
      if (!preserveForms) {
        setIdentityOpen(false);
        setContractOpen(false);
      }
    } catch (err) {
      if (!controller.signal.aborted && ticket === seqRef.current) {
        setError(
          err instanceof Error
            ? err.message
            : 'Impossible de charger les dossiers collaborateurs.',
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
    void loadDossiers();
    return () => {
      seqRef.current += 1;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, clubId, personalOnly]);

  const filteredEmployees = useMemo(() => {
    if (!hrData) return [];
    const q = searchQuery.trim().toLocaleLowerCase('fr');
    if (!q) return hrData.employees;
    return hrData.employees.filter((emp) =>
      `${emp.firstName} ${emp.lastName} ${emp.matricule}`
        .toLocaleLowerCase('fr')
        .includes(q),
    );
  }, [hrData, searchQuery]);

  const selected: EmployeeDossierView | null = useMemo(() => {
    if (personalOnly) return meData?.dossier ?? null;
    if (!hrData) return null;
    return (
      filteredEmployees.find((e) => e.id === selectedId) ??
      hrData.employees.find((e) => e.id === selectedId) ??
      filteredEmployees[0] ??
      hrData.employees[0] ??
      null
    );
  }, [personalOnly, meData, hrData, filteredEmployees, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setIdentityForm({
      firstName: selected.firstName,
      lastName: selected.lastName,
      birthName: selected.birthName ?? '',
      email: selected.email ?? '',
      phone: selected.phone ?? '',
      matricule: selected.matricule,
      hrFileStatus: selected.hrFileStatus,
      reason: '',
    });
    setContractForm({
      contractType: selected.contract.contractType,
      regime: selected.contract.regime,
      weeklyHours:
        selected.contract.weeklyHours !== null && selected.contract.weeklyHours !== undefined
          ? String(selected.contract.weeklyHours)
          : '',
      annualDays:
        selected.contract.annualDays !== null && selected.contract.annualDays !== undefined
          ? String(selected.contract.annualDays)
          : '',
      effectiveFrom: selected.contract.effectiveFrom,
      effectiveTo: selected.contract.effectiveTo ?? '',
      monthlyGrossEur:
        selected.contract.monthlyGrossEur !== null &&
        selected.contract.monthlyGrossEur !== undefined
          ? String(selected.contract.monthlyGrossEur)
          : '',
      hourlyRateEur:
        selected.contract.hourlyRateEur !== null && selected.contract.hourlyRateEur !== undefined
          ? String(selected.contract.hourlyRateEur)
          : '',
      reason: '',
    });
    if (selected.counter) {
      setCounterForm({
        cpNAcquired: String(selected.counter.cpNAcquired),
        cpNTaken: String(selected.counter.cpNTaken),
        cpNMinus1Remaining: String(selected.counter.cpNMinus1Remaining),
        rttDaysRemaining:
          selected.counter.rttDaysRemaining !== null &&
          selected.counter.rttDaysRemaining !== undefined
            ? String(selected.counter.rttDaysRemaining)
            : '',
        annualizationBalanceHours:
          selected.counter.annualizationBalanceHours !== null &&
          selected.counter.annualizationBalanceHours !== undefined
            ? String(selected.counter.annualizationBalanceHours)
            : '',
        reason: '',
      });
    }
  }, [selected?.id, selected?.dossierRevision, selected?.counterRevision]);

  const applyServerDossierUpdate = async (
    action: () => Promise<EmployeeDossierView | void>,
    successMsg: string,
  ) => {
    if (submittingRef.current || busy) return;
    submittingRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await loadDossiers(true);
      onDossierMutated?.();
      setNotice(successMsg);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Enregistrement refusé. Aucune modification confirmée.',
      );
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  };

  const buttonPrimary =
    'cf-brand-gradient text-white px-4 py-2 rounded-xl min-h-[44px] text-sm font-semibold disabled:opacity-40 cursor-pointer';
  const buttonSecondary =
    'cf-card-secondary px-3 py-2 rounded-xl min-h-[44px] text-sm font-medium hover:border-violet-500/60 disabled:opacity-40 cursor-pointer';
  const inputCls = 'cf-input w-full min-w-0 min-h-[44px] px-3 py-2 rounded-xl text-sm';

  const clubLabel = clubId === 'beynost' ? 'Beynost' : 'Carré de Soie';
  const availableSites = personalOnly ? (meData?.sites ?? []) : (hrData?.sites ?? []);
  const availableTeams = personalOnly ? (meData?.teams ?? []) : (hrData?.teams ?? []);
  const availableProfiles = hrData?.profiles ?? [];

  const handleSaveSiteAccesses = async (
    emp: EmployeeDossierView,
    nextAccesses: SiteAccessUpdateInput[],
    msg: string,
  ) => {
    await applyServerDossierUpdate(async () => {
      await updateEmployeeSiteAccesses(currentUser.id, clubId, emp.id, nextAccesses);
    }, msg);
  };

  return (
    <section
      className="space-y-4 min-w-0"
      aria-label={personalOnly ? 'Mon dossier salarié' : 'Dossiers collaborateurs et RH'}
      aria-busy={loading || busy}
    >
      <header className="cf-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-violet-400 shrink-0" />
            <span>{personalOnly ? 'Mon dossier salarié' : 'Dossiers collaborateurs, contrats et compteurs'}</span>
          </h2>
          <p className="text-xs cf-muted">
            Établissement : <strong className="text-slate-200">{clubLabel}</strong>
            {!personalOnly && hrData && ` · ${hrData.employees.length} fiche(s) accessible(s) sur ce périmètre`}
          </p>
        </div>
        <button
          type="button"
          className={buttonSecondary}
          disabled={loading || busy}
          onClick={() => void loadDossiers(true)}
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
          {!selected && (
            <button type="button" className={buttonPrimary} onClick={() => void loadDossiers()}>
              Réessayer
            </button>
          )}
        </div>
      )}

      {notice && (
        <div role="status" className="cf-card p-3 border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{notice}</span>
        </div>
      )}

      {loading && !selected ? (
        <div className="cf-card p-6 text-sm cf-muted">Chargement du référentiel salarié…</div>
      ) : !selected ? (
        <div className="cf-card p-6 text-sm cf-muted">
          Aucun dossier collaborateur accessible dans votre périmètre pour {clubLabel}.
        </div>
      ) : (
        <div className={personalOnly ? 'space-y-4 min-w-0' : 'grid grid-cols-1 lg:grid-cols-4 gap-4 min-w-0'}>
          {!personalOnly && hrData && (
            <aside className="cf-card p-3 space-y-3 min-w-0">
              <label className="block space-y-1">
                <span className="text-xs font-semibold cf-muted flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5" />
                  Rechercher un collaborateur
                </span>
                <input
                  type="search"
                  className={inputCls}
                  placeholder="Nom, prénom ou matricule"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </label>

              <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
                {filteredEmployees.map((emp) => {
                  const active = emp.id === selected.id;
                  return (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(emp.id);
                        setIdentityOpen(false);
                        setContractOpen(false);
                        setNotice('');
                        setError('');
                      }}
                      className={`w-full text-left p-2.5 rounded-xl border transition-all min-h-[44px] cursor-pointer ${
                        active
                          ? 'cf-brand-gradient text-white border-transparent shadow-sm'
                          : 'cf-card-secondary hover:border-violet-500/50'
                      }`}
                    >
                      <div className="font-semibold text-sm truncate">
                        {emp.firstName} {emp.lastName}
                      </div>
                      <div className={`text-[11px] flex items-center justify-between gap-2 ${active ? 'text-white/85' : 'cf-muted'}`}>
                        <span>{emp.matricule}</span>
                        <span>{emp.active ? 'Actif' : 'Archivé'}</span>
                      </div>
                    </button>
                  );
                })}
                {filteredEmployees.length === 0 && (
                  <p className="text-xs cf-muted p-2">Aucun collaborateur ne correspond à votre recherche.</p>
                )}
              </div>
            </aside>
          )}

          <div className={personalOnly ? 'cf-card p-4 sm:p-5 space-y-4 min-w-0' : 'lg:col-span-3 cf-card p-4 sm:p-5 space-y-4 min-w-0'}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--cf-border)] pb-3">
              <div className="min-w-0">
                <h3 className="text-lg font-bold break-words">
                  {selected.firstName} {selected.lastName}
                  {selected.birthName ? ` (née ${selected.birthName})` : ''}
                </h3>
                <p className="text-xs cf-muted">
                  Matricule {selected.matricule} · Dossier : {hrFileStatusLabel(selected.hrFileStatus)} · Compte : {selected.active ? 'Actif' : 'Archivé'}
                </p>
              </div>
              <nav aria-label="Rubriques du dossier" className="flex flex-wrap gap-2">
                {(
                  [
                    ['identity', 'Identité & rattachements'],
                    ['contract', 'Contrat & rémunération'],
                    ['counters', 'Compteurs & historique'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                      tab === id ? 'cf-brand-gradient text-white' : 'cf-card-secondary hover:border-violet-500/50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            </div>

            {tab === 'identity' && (
              <div className="space-y-4 text-sm min-w-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="cf-card-secondary p-4 space-y-1.5 min-w-0">
                    <div className="text-xs font-semibold cf-muted">Identité &amp; coordonnées</div>
                    <div>Nom complet : <strong>{selected.firstName} {selected.lastName}</strong></div>
                    <div>Matricule : <span className="font-mono">{selected.matricule}</span></div>
                    {selected.permissions.canViewSensitive ? (
                      <>
                        <div className="break-words">E-mail : {selected.email || 'Non renseigné'}</div>
                        <div>Téléphone : {selected.phone || 'Non renseigné'}</div>
                      </>
                    ) : (
                      <div className="text-amber-300 text-xs flex items-center gap-1.5 pt-1">
                        <EyeOff className="w-4 h-4 shrink-0" />
                        Coordonnées personnelles et données sensibles réservées aux profils habilités.
                      </div>
                    )}
                  </div>

                  <div className="cf-card-secondary p-4 space-y-2 min-w-0">
                    <div className="text-xs font-semibold cf-muted">Statut administratif</div>
                    <div>État du dossier : <strong>{hrFileStatusLabel(selected.hrFileStatus)}</strong></div>
                    <div>Statut du compte : <strong>{selected.active ? 'Actif' : 'Archivé'}</strong></div>
                    {!personalOnly && (selected.permissions.canEditIdentity || selected.permissions.canToggleActive) && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {selected.permissions.canEditIdentity && (
                          <button
                            type="button"
                            className={buttonSecondary}
                            disabled={busy}
                            onClick={() => setIdentityOpen((v) => !v)}
                          >
                            {identityOpen ? 'Fermer l’édition' : 'Modifier la fiche'}
                          </button>
                        )}
                        {selected.permissions.canToggleActive && selected.id !== currentUser.id && (
                          <button
                            type="button"
                            className={buttonSecondary}
                            disabled={busy}
                            onClick={() =>
                              void applyServerDossierUpdate(
                                () =>
                                  patchEmployeeDossier(currentUser.id, clubId, selected.id, {
                                    siteId,
                                    expectedRevision: selected.dossierRevision,
                                    active: !selected.active,
                                    reason: selected.active
                                      ? 'Archivage du dossier collaborateur'
                                      : 'Réactivation du dossier collaborateur',
                                  }),
                                selected.active
                                  ? 'Compte collaborateur archivé.'
                                  : 'Compte collaborateur réactivé.',
                              )
                            }
                          >
                            {selected.active ? 'Archiver le compte' : 'Réactiver le compte'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {!personalOnly && identityOpen && selected.permissions.canEditIdentity && (
                  <form
                    className="cf-card-secondary p-4 border border-violet-500/40 space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void applyServerDossierUpdate(async () => {
                        const updated = await patchEmployeeDossier(
                          currentUser.id,
                          clubId,
                          selected.id,
                          {
                            siteId,
                            expectedRevision: selected.dossierRevision,
                            firstName: identityForm.firstName,
                            lastName: identityForm.lastName,
                            birthName: identityForm.birthName,
                            matricule: identityForm.matricule,
                            hrFileStatus: identityForm.hrFileStatus,
                            ...(selected.permissions.canViewSensitive
                              ? {
                                  email: identityForm.email,
                                  phone: identityForm.phone,
                                }
                              : {}),
                            reason: identityForm.reason || undefined,
                          },
                        );
                        setIdentityOpen(false);
                        return updated;
                      }, 'Fiche collaborateur enregistrée.');
                    }}
                  >
                    <h4 className="font-semibold text-violet-300">Modifier l’identité du dossier</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="block space-y-1 text-xs">
                        <span>Prénom</span>
                        <input
                          required
                          maxLength={100}
                          className={inputCls}
                          value={identityForm.firstName}
                          onChange={(e) => setIdentityForm((f) => ({ ...f, firstName: e.target.value }))}
                        />
                      </label>
                      <label className="block space-y-1 text-xs">
                        <span>Nom</span>
                        <input
                          required
                          maxLength={100}
                          className={inputCls}
                          value={identityForm.lastName}
                          onChange={(e) => setIdentityForm((f) => ({ ...f, lastName: e.target.value }))}
                        />
                      </label>
                      <label className="block space-y-1 text-xs">
                        <span>Nom de naissance</span>
                        <input
                          maxLength={100}
                          className={inputCls}
                          value={identityForm.birthName}
                          onChange={(e) => setIdentityForm((f) => ({ ...f, birthName: e.target.value }))}
                        />
                      </label>
                      <label className="block space-y-1 text-xs">
                        <span>Matricule</span>
                        <input
                          required
                          maxLength={40}
                          className={inputCls}
                          value={identityForm.matricule}
                          onChange={(e) => setIdentityForm((f) => ({ ...f, matricule: e.target.value }))}
                        />
                      </label>
                      {selected.permissions.canViewSensitive && (
                        <>
                          <label className="block space-y-1 text-xs">
                            <span>Adresse e-mail</span>
                            <input
                              required
                              type="email"
                              maxLength={200}
                              className={inputCls}
                              value={identityForm.email}
                              onChange={(e) => setIdentityForm((f) => ({ ...f, email: e.target.value }))}
                            />
                          </label>
                          <label className="block space-y-1 text-xs">
                            <span>Téléphone</span>
                            <input
                              maxLength={40}
                              className={inputCls}
                              value={identityForm.phone}
                              onChange={(e) => setIdentityForm((f) => ({ ...f, phone: e.target.value }))}
                            />
                          </label>
                        </>
                      )}
                      <label className="block space-y-1 text-xs">
                        <span>Statut du dossier</span>
                        <select
                          className={inputCls}
                          value={identityForm.hrFileStatus}
                          onChange={(e) => setIdentityForm((f) => ({ ...f, hrFileStatus: e.target.value }))}
                        >
                          <option value="complete">Complet</option>
                          <option value="incomplete">Incomplet</option>
                          <option value="pending">En attente de validation</option>
                        </select>
                      </label>
                      <label className="block space-y-1 text-xs">
                        <span>Motif de mise à jour (optionnel)</span>
                        <input
                          maxLength={1000}
                          className={inputCls}
                          value={identityForm.reason}
                          onChange={(e) => setIdentityForm((f) => ({ ...f, reason: e.target.value }))}
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" className={buttonSecondary} onClick={() => setIdentityOpen(false)}>
                        Annuler
                      </button>
                      <button type="submit" className={buttonPrimary} disabled={busy}>
                        Enregistrer la fiche
                      </button>
                    </div>
                  </form>
                )}

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-cyan-400" />
                      <span>Rattachements établissements, profils et équipes</span>
                    </h4>
                    {!personalOnly && selected.permissions.canEditSiteAccess && availableSites.length > 1 && (
                      <div className="flex flex-wrap gap-1.5">
                        {availableSites.map((s) => {
                          const attached = selected.siteAccesses.some((a) => a.siteId === s.id);
                          const canToggle = !attached || selected.siteAccesses.length > 1;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              disabled={busy || !canToggle}
                              onClick={() => {
                                const current = selected.siteAccesses.map((a) => ({
                                  siteId: a.siteId,
                                  isPrimary: a.isPrimary,
                                  profileId: a.profileId,
                                  teamIds: a.teamIds,
                                  managedTeamIds: a.managedTeamIds,
                                  showOnPlanning: a.showOnPlanning,
                                  positionIds: a.positionIds,
                                }));
                                const next = attached
                                  ? current.filter((a) => a.siteId !== s.id)
                                  : [
                                      ...current,
                                      {
                                        siteId: s.id,
                                        isPrimary: current.length === 0,
                                        profileId: 'employe_standard',
                                        teamIds: [],
                                        managedTeamIds: [],
                                        showOnPlanning: true,
                                        positionIds: [],
                                      },
                                    ];
                                if (next.length > 0 && !next.some((a) => a.isPrimary)) {
                                  next[0].isPrimary = true;
                                }
                                void handleSaveSiteAccesses(
                                  selected,
                                  next,
                                  attached
                                    ? `Rattachement retiré sur ${s.name}.`
                                    : `Rattachement ajouté sur ${s.name}.`,
                                );
                              }}
                              className={buttonSecondary}
                            >
                              {attached ? `Retirer ${s.name}` : `Rattacher à ${s.name}`}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {selected.siteAccesses.map((acc) => {
                    const clubTeams = availableTeams.filter((t) => t.siteId === acc.siteId);
                    const canEditThisClub = !personalOnly && selected.permissions.canEditSiteAccess;
                    return (
                      <article key={acc.siteId} className="cf-card-secondary p-4 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <strong>{acc.siteName}</strong>{' '}
                            <span className="text-xs px-2 py-0.5 rounded bg-violet-500/20 text-violet-200">
                              {acc.isPrimary ? 'Principal' : 'Secondaire'}
                            </span>
                          </div>
                          {canEditThisClub && availableProfiles.length > 0 ? (
                            <label className="flex items-center gap-2 text-xs">
                              <span className="cf-muted">Profil :</span>
                              <select
                                aria-label={`Profil sur ${acc.siteName}`}
                                className="cf-input min-h-[44px] px-2.5 py-1.5 text-xs"
                                value={acc.profileId}
                                disabled={busy || acc.profileId === 'admin_systeme'}
                                onChange={(e) => {
                                  const nextProfile = e.target.value;
                                  const nonManager =
                                    nextProfile === 'employe_standard' ||
                                    nextProfile === 'lecture_seule_avancee';
                                  const next = selected.siteAccesses.map((item) => ({
                                    siteId: item.siteId,
                                    isPrimary: item.isPrimary,
                                    profileId: item.siteId === acc.siteId ? nextProfile : item.profileId,
                                    teamIds: item.teamIds,
                                    managedTeamIds:
                                      item.siteId === acc.siteId && nonManager ? [] : item.managedTeamIds,
                                    showOnPlanning: item.showOnPlanning,
                                    positionIds: item.positionIds,
                                  }));
                                  void handleSaveSiteAccesses(
                                    selected,
                                    next,
                                    `Profil mis à jour sur ${acc.siteName}.`,
                                  );
                                }}
                              >
                                {availableProfiles.map((p) => (
                                  <option
                                    key={p.id}
                                    value={p.id}
                                    disabled={p.id === 'admin_systeme' && acc.profileId !== 'admin_systeme'}
                                  >
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : (
                            <span className="text-xs font-medium text-violet-200">
                              Profil : {acc.profileName}
                            </span>
                          )}
                        </div>

                        <div className="space-y-1 text-xs">
                          <div className="cf-muted">Équipes d’appartenance (rattaché au quotidien) :</div>
                          <div className="flex flex-wrap gap-1.5">
                            {clubTeams.map((tm) => {
                              const activeTeam = acc.teamIds.includes(tm.id);
                              return (
                                <button
                                  key={tm.id}
                                  type="button"
                                  disabled={!canEditThisClub || busy}
                                  onClick={() => {
                                    const nextTeams = activeTeam
                                      ? acc.teamIds.filter((id) => id !== tm.id)
                                      : [...acc.teamIds, tm.id];
                                    const next = selected.siteAccesses.map((item) => ({
                                      siteId: item.siteId,
                                      isPrimary: item.isPrimary,
                                      profileId: item.profileId,
                                      teamIds: item.siteId === acc.siteId ? nextTeams : item.teamIds,
                                      managedTeamIds: item.managedTeamIds,
                                      showOnPlanning: item.showOnPlanning,
                                      positionIds: item.positionIds,
                                    }));
                                    void handleSaveSiteAccesses(
                                      selected,
                                      next,
                                      `Équipes d’appartenance mises à jour sur ${acc.siteName}.`,
                                    );
                                  }}
                                  className={`min-h-[36px] px-2.5 py-1 rounded-lg border text-xs ${
                                    activeTeam
                                      ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-200 font-semibold'
                                      : 'border-slate-600/60 cf-muted'
                                  } ${canEditThisClub ? 'cursor-pointer' : 'opacity-80 cursor-default'}`}
                                >
                                  {tm.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-1 text-xs">
                          <div className="cf-muted">Équipes encadrées (responsabilité de validation) :</div>
                          <div className="flex flex-wrap gap-1.5">
                            {acc.profileId === 'employe_standard' ||
                            acc.profileId === 'lecture_seule_avancee' ? (
                              <span className="cf-muted">Aucune (profil sans encadrement)</span>
                            ) : (
                              clubTeams.map((tm) => {
                                const activeManaged = acc.managedTeamIds.includes(tm.id);
                                return (
                                  <button
                                    key={`managed-${tm.id}`}
                                    type="button"
                                    disabled={!canEditThisClub || busy}
                                    onClick={() => {
                                      const nextManaged = activeManaged
                                        ? acc.managedTeamIds.filter((id) => id !== tm.id)
                                        : [...acc.managedTeamIds, tm.id];
                                      const next = selected.siteAccesses.map((item) => ({
                                        siteId: item.siteId,
                                        isPrimary: item.isPrimary,
                                        profileId: item.profileId,
                                        teamIds: item.teamIds,
                                        managedTeamIds:
                                          item.siteId === acc.siteId ? nextManaged : item.managedTeamIds,
                                        showOnPlanning: item.showOnPlanning,
                                        positionIds: item.positionIds,
                                      }));
                                      void handleSaveSiteAccesses(
                                        selected,
                                        next,
                                        `Équipes encadrées mises à jour sur ${acc.siteName}.`,
                                      );
                                    }}
                                    className={`min-h-[36px] px-2.5 py-1 rounded-lg border text-xs ${
                                      activeManaged
                                        ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-200 font-semibold'
                                        : 'border-slate-600/60 cf-muted'
                                    } ${canEditThisClub ? 'cursor-pointer' : 'opacity-80 cursor-default'}`}
                                  >
                                    {tm.name}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === 'contract' && (
              <div className="space-y-4 text-sm min-w-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="cf-card-secondary p-4 space-y-2 min-w-0">
                    <div className="text-xs font-semibold cf-muted flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-violet-400" />
                      Contrat actif
                    </div>
                    <div>
                      Type &amp; régime :{' '}
                      <strong>
                        {selected.contract.contractType} · {regimeLabel(selected.contract.regime)}
                      </strong>
                    </div>
                    <div>
                      Volume :{' '}
                      <strong>
                        {selected.contract.regime === 'forfait_jours'
                          ? formatOptionalNumber(selected.contract.annualDays, 'jours / an')
                          : formatOptionalNumber(selected.contract.weeklyHours, 'h / semaine')}
                      </strong>
                    </div>
                    <div>Date de début : {selected.contract.effectiveFrom || 'Non renseigné'}</div>
                    <div>Date de fin : {selected.contract.effectiveTo ?? 'Contrat sans terme fixé'}</div>
                    {!personalOnly && (selected.permissions.canEditContract || selected.permissions.canEditSalary) && (
                      <div className="pt-2">
                        <button
                          type="button"
                          className={buttonSecondary}
                          disabled={busy}
                          onClick={() => setContractOpen((v) => !v)}
                        >
                          {contractOpen ? 'Fermer l’édition du contrat' : 'Modifier le contrat / avenant'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="cf-card-secondary p-4 space-y-2 min-w-0">
                    <div className="text-xs font-semibold cf-muted flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      Rémunération &amp; coordonnées bancaires
                    </div>
                    {selected.permissions.canViewSensitive ? (
                      <>
                        <div>
                          Brut mensuel : <strong>{formatEurOptional(selected.contract.monthlyGrossEur)}</strong>
                        </div>
                        <div>
                          Taux horaire : <strong>{formatEurOptional(selected.contract.hourlyRateEur)}</strong>
                        </div>
                        <div>IBAN : <span className="font-mono">{selected.sensitiveBank?.ibanMasked ?? 'Non renseigné'}</span></div>
                        <div>NIR : <span className="font-mono">{selected.sensitiveBank?.nirMasked ?? 'Non renseigné'}</span></div>
                      </>
                    ) : (
                      <div className="text-amber-300 text-xs flex items-center gap-1.5 pt-1">
                        <EyeOff className="w-4 h-4 shrink-0" />
                        Données salariales et bancaires masquées selon vos droits.
                      </div>
                    )}
                  </div>
                </div>

                {!personalOnly && contractOpen && (selected.permissions.canEditContract || selected.permissions.canEditSalary) && (
                  <form
                    className="cf-card-secondary p-4 border border-violet-500/40 space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const validationError = validateContractForm({
                        regime: contractForm.regime,
                        weeklyHours: contractForm.weeklyHours,
                        annualDays: contractForm.annualDays,
                        effectiveFrom: contractForm.effectiveFrom,
                        effectiveTo: contractForm.effectiveTo,
                      });
                      if (validationError) {
                        setError(validationError);
                        return;
                      }
                      void applyServerDossierUpdate(async () => {
                        const payload: Parameters<typeof patchEmployeeDossier>[3] = {
                          siteId,
                          expectedRevision: selected.dossierRevision,
                          reason: contractForm.reason || undefined,
                        };
                        if (selected.permissions.canEditContract) {
                          payload.contractType = contractForm.contractType;
                          payload.regime = contractForm.regime;
                          if (contractForm.regime === 'forfait_jours') {
                            payload.annualDays = Number(contractForm.annualDays);
                          } else {
                            payload.weeklyHours = Number(contractForm.weeklyHours);
                          }
                          payload.effectiveFrom = contractForm.effectiveFrom.trim();
                          payload.effectiveTo = contractForm.effectiveTo.trim();
                        }
                        if (selected.permissions.canEditSalary) {
                          if (contractForm.monthlyGrossEur.trim()) {
                            payload.monthlyGrossEur = Number(contractForm.monthlyGrossEur);
                          }
                          if (contractForm.hourlyRateEur.trim()) {
                            payload.hourlyRateEur = Number(contractForm.hourlyRateEur);
                          }
                        }
                        const updated = await patchEmployeeDossier(
                          currentUser.id,
                          clubId,
                          selected.id,
                          payload,
                        );
                        setContractOpen(false);
                        return updated;
                      }, 'Contrat enregistré.');
                    }}
                  >
                    <h4 className="font-semibold text-violet-300">Mettre à jour le contrat</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {selected.permissions.canEditContract && (
                        <>
                          <label className="block space-y-1 text-xs">
                            <span>Type de contrat</span>
                            <select
                              className={inputCls}
                              value={contractForm.contractType}
                              onChange={(e) => setContractForm((f) => ({ ...f, contractType: e.target.value }))}
                            >
                              {CONTRACT_TYPES.map((ct) => (
                                <option key={ct} value={ct}>{ct}</option>
                              ))}
                            </select>
                          </label>
                          <label className="block space-y-1 text-xs">
                            <span>Régime</span>
                            <select
                              className={inputCls}
                              value={contractForm.regime}
                              onChange={(e) => setContractForm((f) => ({ ...f, regime: e.target.value }))}
                            >
                              <option value="hours">Horaire hebdomadaire</option>
                              <option value="forfait_jours">Forfait jours</option>
                            </select>
                          </label>
                          {contractForm.regime === 'forfait_jours' ? (
                            <label className="block space-y-1 text-xs">
                              <span>Forfait (jours / an)</span>
                              <input
                                required
                                type="number"
                                min={1}
                                max={235}
                                className={inputCls}
                                value={contractForm.annualDays}
                                onChange={(e) => setContractForm((f) => ({ ...f, annualDays: e.target.value }))}
                              />
                            </label>
                          ) : (
                            <label className="block space-y-1 text-xs">
                              <span>Durée hebdomadaire (heures)</span>
                              <input
                                required
                                type="number"
                                min={1}
                                max={48}
                                className={inputCls}
                                value={contractForm.weeklyHours}
                                onChange={(e) => setContractForm((f) => ({ ...f, weeklyHours: e.target.value }))}
                              />
                            </label>
                          )}
                          <label className="block space-y-1 text-xs">
                            <span>Date de début</span>
                            <input
                              required
                              type="date"
                              className={inputCls}
                              value={contractForm.effectiveFrom}
                              onChange={(e) => setContractForm((f) => ({ ...f, effectiveFrom: e.target.value }))}
                            />
                          </label>
                          <label className="block space-y-1 text-xs">
                            <span>Date de fin (optionnelle)</span>
                            <input
                              type="date"
                              className={inputCls}
                              value={contractForm.effectiveTo}
                              onChange={(e) => setContractForm((f) => ({ ...f, effectiveTo: e.target.value }))}
                            />
                          </label>
                        </>
                      )}
                      {selected.permissions.canEditSalary && (
                        <>
                          <label className="block space-y-1 text-xs">
                            <span>Brut mensuel (€)</span>
                            <input
                              type="number"
                              step="0.01"
                              min={0}
                              className={inputCls}
                              value={contractForm.monthlyGrossEur}
                              onChange={(e) => setContractForm((f) => ({ ...f, monthlyGrossEur: e.target.value }))}
                            />
                          </label>
                          <label className="block space-y-1 text-xs">
                            <span>Taux horaire (€/h)</span>
                            <input
                              type="number"
                              step="0.01"
                              min={0}
                              className={inputCls}
                              value={contractForm.hourlyRateEur}
                              onChange={(e) => setContractForm((f) => ({ ...f, hourlyRateEur: e.target.value }))}
                            />
                          </label>
                        </>
                      )}
                      <label className="block space-y-1 text-xs sm:col-span-2 lg:col-span-3">
                        <span>Objet ou motif de modification (optionnel)</span>
                        <input
                          maxLength={1000}
                          className={inputCls}
                          placeholder="Ex. Avenant passage 35h"
                          value={contractForm.reason}
                          onChange={(e) => setContractForm((f) => ({ ...f, reason: e.target.value }))}
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" className={buttonSecondary} onClick={() => setContractOpen(false)}>
                        Annuler
                      </button>
                      <button type="submit" className={buttonPrimary} disabled={busy}>
                        Enregistrer le contrat
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {tab === 'counters' && (
              <div className="space-y-4 text-sm min-w-0">
                {!selected.permissions.canViewCounters || !selected.counter ? (
                  <div className="cf-card-secondary p-4 text-amber-300 text-sm flex items-center gap-2">
                    <EyeOff className="w-4 h-4 shrink-0" />
                    <span>La consultation des compteurs de congés est restreinte selon vos droits.</span>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="cf-card-secondary p-3.5">
                        <div className="text-xs cf-muted">Congés payés acquis (N)</div>
                        <div className="text-lg font-bold">{selected.counter.cpNAcquired} j</div>
                      </div>
                      <div className="cf-card-secondary p-3.5">
                        <div className="text-xs cf-muted">Congés payés pris (N)</div>
                        <div className="text-lg font-bold">{selected.counter.cpNTaken} j</div>
                      </div>
                      <div className="cf-card-secondary p-3.5">
                        <div className="text-xs cf-muted">Reliquat CP N-1</div>
                        <div className="text-lg font-bold">{selected.counter.cpNMinus1Remaining} j</div>
                      </div>
                      <div className="cf-card-secondary p-3.5">
                        <div className="text-xs cf-muted">RTT &amp; Annualisation</div>
                        <div className="text-sm font-semibold">
                          RTT : {formatOptionalNumber(selected.counter.rttDaysRemaining, 'j')}
                        </div>
                        <div className="text-sm font-semibold">
                          Annualisation : {formatOptionalNumber(selected.counter.annualizationBalanceHours, 'h')}
                        </div>
                      </div>
                    </div>

                    <p className="text-xs cf-muted flex items-center gap-1.5">
                      <CalendarClock className="w-4 h-4 shrink-0 text-cyan-400" />
                      Ces soldes correspondent à votre dossier RH. Seules les acquisitions et déductions validées sont prises en compte.
                    </p>

                    {personalOnly && selected.id === currentUser.id && <PersonalCarryPanel key={`${currentUser.id}:${clubId}`} actorId={currentUser.id} club={clubId} />}

                    {!personalOnly && selected.permissions.canEditCounters && (
                      <form
                        className="cf-card-secondary p-4 border border-violet-500/40 space-y-3"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const validationError = validateCounterForm(counterForm);
                          if (validationError) {
                            setError(validationError);
                            return;
                          }
                          const rev = selected.counterRevision ?? '';
                          void applyServerDossierUpdate(async () => {
                            const updated = await updateEmployeeCounters(
                              currentUser.id,
                              clubId,
                              selected.id,
                              {
                                siteId,
                                expectedRevision: rev,
                                reason: counterForm.reason.trim(),
                                cpNAcquired: Number(counterForm.cpNAcquired),
                                cpNTaken: Number(counterForm.cpNTaken),
                                cpNMinus1Remaining: Number(counterForm.cpNMinus1Remaining),
                                ...(counterForm.rttDaysRemaining.trim()
                                  ? { rttDaysRemaining: Number(counterForm.rttDaysRemaining) }
                                  : { clearRtt: true }),
                                ...(counterForm.annualizationBalanceHours.trim()
                                  ? {
                                      annualizationBalanceHours: Number(
                                        counterForm.annualizationBalanceHours,
                                      ),
                                    }
                                  : { clearAnnualization: true }),
                              },
                            );
                            setCounterForm((f) => ({ ...f, reason: '' }));
                            return updated;
                          }, 'Correction des compteurs enregistrée avec historique.');
                        }}
                      >
                        <h4 className="font-semibold text-violet-300">Corriger les compteurs (avec motif obligatoire)</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          <label className="block space-y-1 text-xs">
                            <span>CP N acquis (j)</span>
                            <input
                              required
                              type="number"
                              step="0.5"
                              min={0}
                              max={100}
                              className={inputCls}
                              value={counterForm.cpNAcquired}
                              onChange={(e) => setCounterForm((f) => ({ ...f, cpNAcquired: e.target.value }))}
                            />
                          </label>
                          <label className="block space-y-1 text-xs">
                            <span>CP N pris (j)</span>
                            <input
                              required
                              type="number"
                              step="0.5"
                              min={0}
                              max={100}
                              className={inputCls}
                              value={counterForm.cpNTaken}
                              onChange={(e) => setCounterForm((f) => ({ ...f, cpNTaken: e.target.value }))}
                            />
                          </label>
                          <label className="block space-y-1 text-xs">
                            <span>Reliquat CP N-1 (j)</span>
                            <input
                              required
                              type="number"
                              step="0.5"
                              min={0}
                              max={100}
                              className={inputCls}
                              value={counterForm.cpNMinus1Remaining}
                              onChange={(e) =>
                                setCounterForm((f) => ({ ...f, cpNMinus1Remaining: e.target.value }))
                              }
                            />
                          </label>
                          <label className="block space-y-1 text-xs">
                            <span>Solde RTT (j, vide si non applicable)</span>
                            <input
                              type="number"
                              step="0.5"
                              min={0}
                              max={50}
                              className={inputCls}
                              placeholder="Non renseigné"
                              value={counterForm.rttDaysRemaining}
                              onChange={(e) =>
                                setCounterForm((f) => ({ ...f, rttDaysRemaining: e.target.value }))
                              }
                            />
                          </label>
                          <label className="block space-y-1 text-xs">
                            <span>Annualisation (heures, vide si absent)</span>
                            <input
                              type="number"
                              step="0.5"
                              min={-500}
                              max={500}
                              className={inputCls}
                              placeholder="Non renseigné"
                              value={counterForm.annualizationBalanceHours}
                              onChange={(e) =>
                                setCounterForm((f) => ({
                                  ...f,
                                  annualizationBalanceHours: e.target.value,
                                }))
                              }
                            />
                          </label>
                          <label className="block space-y-1 text-xs sm:col-span-2 lg:col-span-3">
                            <span>Motif de correction (obligatoire)</span>
                            <textarea
                              required
                              maxLength={1000}
                              className="cf-input w-full min-w-0 min-h-[72px] p-3 rounded-xl text-sm"
                              placeholder="Ex. Régularisation suite au relevé paie de novembre"
                              value={counterForm.reason}
                              onChange={(e) => setCounterForm((f) => ({ ...f, reason: e.target.value }))}
                            />
                          </label>
                        </div>
                        <div className="flex justify-end">
                          <button
                            type="submit"
                            className={buttonPrimary}
                            disabled={busy || !counterForm.reason.trim()}
                          >
                            Enregistrer la correction des compteurs
                          </button>
                        </div>
                      </form>
                    )}

                    <div className="space-y-2">
                      <h4 className="font-semibold flex items-center gap-2">
                        <History className="w-4 h-4 text-violet-400" />
                        <span>Historique des corrections ({selected.counterHistory?.length ?? 0})</span>
                      </h4>
                      {!selected.counterHistory?.length ? (
                        <p className="text-xs cf-muted">Aucune correction enregistrée pour ce collaborateur.</p>
                      ) : (
                        <div className="space-y-2">
                          {selected.counterHistory.map((entry) => (
                            <article key={entry.id} className="cf-card-secondary p-3 rounded-xl space-y-1 text-xs">
                              <div className="flex flex-wrap justify-between gap-2">
                                <strong>{entry.actorName}</strong>
                                <span className="cf-muted">{formatParisDateTime(entry.timestamp)}</span>
                              </div>
                              <p className="break-words">Motif : {entry.reason}</p>
                              <p className="cf-muted break-words">
                                Avant : CP {entry.before.cpNAcquired}/{entry.before.cpNTaken} (N-1 : {entry.before.cpNMinus1Remaining}), RTT : {formatOptionalNumber(entry.before.rttDaysRemaining, 'j')}, Ann. : {formatOptionalNumber(entry.before.annualizationBalanceHours, 'h')}
                              </p>
                              <p className="text-emerald-300 break-words">
                                Après : CP {entry.after.cpNAcquired}/{entry.after.cpNTaken} (N-1 : {entry.after.cpNMinus1Remaining}), RTT : {formatOptionalNumber(entry.after.rttDaysRemaining, 'j')}, Ann. : {formatOptionalNumber(entry.after.annualizationBalanceHours, 'h')}
                              </p>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
