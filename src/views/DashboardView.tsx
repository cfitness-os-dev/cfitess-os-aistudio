import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock,
  EyeOff,
  FileWarning,
  Shield,
  TrendingUp,
  UserCheck,
} from 'lucide-react';
import type { DashboardPayload } from '../domain/apiEngine';
import { cleanUiTree } from '../domain/cleanModeSanitizer';
import { computeShiftNetMinutes, formatMinutesAsHours } from '../domain/rbac';
import { useCfos } from '../context/CfosContext';

interface DashboardViewProps {
  dashboard: DashboardPayload;
  onOpenPlanning: () => void;
  onOpenPreferences: () => void;
}

function formatEur(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'Non renseigné';
  return `${val.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
}

export function DashboardView({
  dashboard,
  onOpenPlanning,
  onOpenPreferences,
}: DashboardViewProps) {
  const { isTechnicalMode } = useCfos();
  const {
    session,
    myShifts,
    myRequests,
    teamRequests,
    anomalies,
    kpis,
    visibleEmployees,
    positions,
    sites,
  } = dashboard;

  const canManageTeam =
    session.resolvedPermissions['ORG04-17']?.allowed ||
    session.resolvedPermissions['ORG04-35']?.allowed ||
    session.resolvedPermissions['ORG04-38']?.allowed ||
    visibleEmployees.length > 1;

  const positionById = new Map(positions.map((p) => [p.id, p]));
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const incompletePayrollEmployees = visibleEmployees.filter(
    (e) => e.hrFileStatus !== 'complete'
  );

  return cleanUiTree(
    <div className="space-y-6">
      {/* En-tête synthétique collaborateur */}
      <div className="cf-card p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs cf-mono text-violet-300">
            {isTechnicalMode && (
              <>
                <span>MC01 • NAV01 / ACC01</span>
                <span>•</span>
              </>
            )}
            <span>Matricule {session.employee.matricule}</span>
          </div>
          <h1 className="text-xl font-bold">
            Bonjour {session.employee.firstName} {session.employee.lastName}
          </h1>
          <p className="text-sm cf-muted">
            Profil actif :{' '}
            <strong className="text-slate-100">{session.activeProfile.name}</strong>
            {isTechnicalMode && (
              <>
                {' '}(portée <span className="cf-mono text-emerald-400">{session.activeProfile.scopeSelected}</span>)
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onOpenPlanning}
            className="cf-brand-gradient text-white text-xs font-semibold px-4 py-2.5 rounded-btn shadow-md shadow-violet-950/25"
          >
            {isTechnicalMode ? 'Ouvrir mon planning (MC03)' : 'Ouvrir mon planning'}
          </button>
          <button
            type="button"
            onClick={onOpenPreferences}
            className="cf-card-secondary text-xs font-medium px-4 py-2.5 rounded-btn hover:border-violet-500/60"
          >
            Mes préférences & flux .ics
          </button>
        </div>
      </div>

      {/* Bloc 1 : Mon espace collaborateur (commun à tous les profils) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider cf-muted flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-violet-400" />
            Mon espace collaborateur (Portée personnelle)
          </h2>
          {isTechnicalMode && (
            <span className="text-xs cf-mono cf-muted">TST01 • TST02</span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Prochains shifts */}
          <div className="cf-card p-4 space-y-3 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-cyan-400" />
                Mes prochains shifts publiés ({myShifts.length})
              </div>
              <span className="text-[11px] cf-mono cf-muted">
                Durée nette déduite de la pause
              </span>
            </div>

            {myShifts.length === 0 ? (
              <div className="cf-card-secondary p-4 text-xs cf-muted">
                Aucun shift planifié sur le périmètre sélectionné ({session.activeSiteId}).
              </div>
            ) : (
              <div className="space-y-2.5">
                {myShifts.map((sh) => {
                  const pos = positionById.get(sh.positionId);
                  const club = siteById.get(sh.siteId);
                  const netMin = computeShiftNetMinutes(
                    sh.startTime,
                    sh.endTime,
                    sh.breakMinutes
                  );
                  return (
                    <div
                      key={sh.id}
                      className="cf-card-secondary p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="cf-mono text-xs font-semibold text-cyan-300">
                            {sh.date}
                          </span>
                          <span className="text-sm font-semibold">
                            {sh.startTime} – {sh.endTime}
                          </span>
                          <span className="text-xs cf-mono px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-200 border border-violet-500/30">
                            Net : {formatMinutesAsHours(netMin)} (pause {sh.breakMinutes}m)
                          </span>
                          {sh.lockState === 'red' && (
                            <span className="text-[10px] cf-mono px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/40">
                              Verrou rouge
                            </span>
                          )}
                        </div>
                        <div className="text-xs cf-muted">
                          Poste : <span className="text-slate-200">{pos?.label ?? sh.positionId}</span>{' '}
                          • Club : {club?.name ?? sh.siteId}
                          {sh.missionLabel ? ` • Mission : ${sh.missionLabel}` : ''}
                        </div>
                        {sh.tasks.length > 0 && (
                          <div className="text-[11px] cf-muted">
                            Tâches : {sh.tasks.join(' · ')}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Compteurs & Demandes propres */}
          <div className="cf-card p-4 space-y-4">
            <div className="font-semibold text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              Mes compteurs RH
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="cf-card-secondary p-3">
                <div className="cf-muted">CP N acquis</div>
                <div className="text-lg font-bold cf-mono mt-0.5">
                  {session.employee.counter.cpNAcquired} j
                </div>
              </div>
              <div className="cf-card-secondary p-3">
                <div className="cf-muted">CP N pris</div>
                <div className="text-lg font-bold cf-mono mt-0.5">
                  {session.employee.counter.cpNTaken} j
                </div>
              </div>
              <div className="cf-card-secondary p-3">
                <div className="cf-muted">Reliquat N-1</div>
                <div className="text-lg font-bold cf-mono mt-0.5 text-emerald-400">
                  {session.employee.counter.cpNMinus1Remaining} j
                </div>
              </div>
              <div className="cf-card-secondary p-3">
                <div className="cf-muted">
                  {session.employee.counter.rttDaysRemaining !== undefined &&
                  session.employee.counter.rttDaysRemaining !== null
                    ? 'RTT restants'
                    : 'Annualisation'}
                </div>
                <div className="text-lg font-bold cf-mono mt-0.5 text-violet-300">
                  {session.employee.counter.rttDaysRemaining !== undefined &&
                  session.employee.counter.rttDaysRemaining !== null
                    ? `${session.employee.counter.rttDaysRemaining} j`
                    : session.employee.counter.annualizationBalanceHours !== undefined
                    ? `${session.employee.counter.annualizationBalanceHours > 0 ? '+' : ''}${session.employee.counter.annualizationBalanceHours} h`
                    : 'N/A'}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-[var(--cf-border)] space-y-2">
              <div className="text-xs font-semibold">Mes demandes ({myRequests.length})</div>
              {myRequests.length === 0 ? (
                <div className="text-xs cf-muted">Aucune demande d’absence en cours.</div>
              ) : (
                myRequests.map((req) => (
                  <div key={req.id} className="cf-card-secondary p-2.5 text-xs">
                    <div className="flex items-center justify-between font-medium">
                      <span>{req.motive}</span>
                      <span className="cf-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                        {req.status}
                      </span>
                    </div>
                    <div className="cf-muted mt-0.5">
                      {req.startDate} → {req.endDate}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Bloc 2 : Espace Gestion & Pilotage (conditionné par RBAC serveur) */}
      {canManageTeam ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider cf-muted flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Espace Gestion & Pilotage ({session.activeProfile.name})
            </h2>
            {isTechnicalMode && (
              <span className="text-xs cf-mono text-emerald-400">
                TST24 • TST32 • TST33
              </span>
            )}
          </div>

          {/* KPIs multi-sites avec distinction explicite null vs 0 € (TST24) */}
          {kpis.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {kpis.map((kpi) => {
                const club = siteById.get(kpi.siteId);
                return (
                  <div key={kpi.siteId} className="cf-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-sm">
                          {club?.name ?? kpi.siteId}
                        </div>
                        <div className="text-xs cf-muted">{kpi.periodLabel}</div>
                      </div>
                      {isTechnicalMode && (kpi.revenueEur === null || kpi.productivityPerHour === null) && (
                        <span className="text-[10px] cf-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          TST24 : absent ≠ 0 €
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 text-xs">
                      <div className="cf-card-secondary p-3">
                        <div className="cf-muted">Chiffre d’affaires</div>
                        <div
                          className={`text-base font-bold cf-mono mt-0.5 ${
                            kpi.revenueEur === null ? 'text-amber-300 italic' : ''
                          }`}
                        >
                          {formatEur(kpi.revenueEur)}
                        </div>
                      </div>
                      <div className="cf-card-secondary p-3">
                        <div className="cf-muted">Productivité / heure</div>
                        <div
                          className={`text-base font-bold cf-mono mt-0.5 ${
                            kpi.productivityPerHour === null
                              ? 'text-amber-300 italic'
                              : ''
                          }`}
                        >
                          {kpi.productivityPerHour === null
                            ? 'Non renseigné'
                            : `${kpi.productivityPerHour.toFixed(2)} €/h`}
                        </div>
                      </div>
                      <div className="cf-card-secondary p-3">
                        <div className="cf-muted">Masse salariale</div>
                        <div className="text-base font-bold cf-mono mt-0.5">
                          {formatEur(kpi.payrollMassEur)}
                        </div>
                      </div>
                      <div className="cf-card-secondary p-3">
                        <div className="cf-muted">Heures planifiées</div>
                        <div className="text-base font-bold cf-mono mt-0.5">
                          {kpi.workedHours ?? 'Non renseigné'} h
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Validations équipe, Anomalies badgeuse, Alertes dossiers */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="cf-card p-4 space-y-2.5">
              {(() => {
                const pendingTeamRequests = teamRequests.filter(
                  (req) => req.status === 'pending'
                );
                return (
                  <>
                    <div className="font-semibold text-sm flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-400" />
                      Demandes à valider ({pendingTeamRequests.length})
                    </div>
                    {pendingTeamRequests.length === 0 ? (
                      <div className="text-xs cf-muted">Aucune demande en attente sur votre périmètre.</div>
                    ) : (
                      pendingTeamRequests.map((req) => (
                        <div key={req.id} className="cf-card-secondary p-3 text-xs space-y-1">
                          <div className="flex justify-between font-medium">
                            <span>{req.motive}</span>
                            <span className="cf-mono text-amber-300">{req.status}</span>
                          </div>
                          <div className="cf-muted">
                            {req.startDate} → {req.endDate} ({req.siteId})
                          </div>
                        </div>
                      ))
                    )}
                  </>
                );
              })()}
            </div>

            <div className="cf-card p-4 space-y-2.5">
              <div className="font-semibold text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                Anomalies badgeuse ({anomalies.length})
              </div>
              {anomalies.length === 0 ? (
                <div className="text-xs cf-muted">Aucune anomalie visible.</div>
              ) : (
                anomalies.map((anom) => (
                  <div key={anom.id} className="cf-card-secondary p-3 text-xs space-y-1">
                    <div className="flex justify-between font-medium">
                      <span>{anom.date}</span>
                      <span className="cf-mono text-amber-300">
                        {anom.deltaMinutes > 0 ? `+${anom.deltaMinutes}` : anom.deltaMinutes} min
                      </span>
                    </div>
                    <div className="cf-muted">
                      Prévu {anom.plannedRange} · Badgé {anom.punchedRange}
                    </div>
                    <div className="text-[11px] text-emerald-400">
                      {anom.hasProofPhoto ? 'Preuve photo tablette jointe' : 'Sans photo'}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="cf-card p-4 space-y-2.5">
              <div className="font-semibold text-sm flex items-center gap-2">
                <FileWarning className="w-4 h-4 text-rose-400" />
                Dossiers RH incomplets ({incompletePayrollEmployees.length})
              </div>
              {incompletePayrollEmployees.map((emp) => (
                <div key={emp.id} className="cf-card-secondary p-3 text-xs space-y-1">
                  <div className="font-semibold">
                    {emp.firstName} {emp.lastName}
                  </div>
                  <div className="cf-mono text-[11px] text-rose-300">
                    Statut : {emp.hrFileStatus}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tableau des collaborateurs visibles + démonstration du masquage serveur TST33 */}
          <div className="cf-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-violet-400" />
                Effectif visible sur ce périmètre ({visibleEmployees.length})
              </div>
              {isTechnicalMode && (
                <span className="text-[11px] cf-mono cf-muted">
                  Masquage serveur IBAN / NIR / Salaires si droit ORG04-10 absent (TST33)
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="cf-muted border-b border-[var(--cf-border)]">
                  <tr>
                    <th className="py-2 pr-3">Collaborateur</th>
                    <th className="py-2 pr-3">Contrat</th>
                    <th className="py-2 pr-3">
                      {isTechnicalMode ? 'Rémunération (ORG04-10)' : 'Rémunération'}
                    </th>
                    <th className="py-2 pr-3">
                      {isTechnicalMode ? 'IBAN / NIR (ORG04-10)' : 'IBAN / NIR'}
                    </th>
                    <th className="py-2">Statut dossier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--cf-border)]">
                  {visibleEmployees.map((emp) => (
                    <tr key={emp.id}>
                        <td className="py-2.5 pr-3 font-medium">
                          {emp.firstName} {emp.lastName}{' '}
                          <span className="cf-mono text-[10px] cf-muted">
                            ({emp.matricule})
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 cf-mono">
                          {emp.contract?.contractType} ({emp.contract?.regime})
                        </td>
                        <td className="py-2.5 pr-3">
                          {emp.contract?.monthlyGrossEur != null ? (
                            <span className="cf-mono text-emerald-300">
                              {emp.contract.monthlyGrossEur.toLocaleString('fr-FR')} €/mois
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-300 cf-mono text-[11px]">
                              <EyeOff className="w-3.5 h-3.5" />
                              {isTechnicalMode ? 'Masqué (ORG04-10)' : 'Masqué'}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 cf-mono text-[11px]">
                          {emp.sensitiveBank ? (
                            <span>
                              {emp.sensitiveBank.ibanMasked} • {emp.sensitiveBank.bic}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-300">
                              <EyeOff className="w-3.5 h-3.5" />
                              {isTechnicalMode ? 'Non transmis par l’API' : 'Masqué'}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`cf-mono text-[11px] px-2 py-0.5 rounded-full ${
                              emp.hrFileStatus === 'complete'
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-rose-500/15 text-rose-300'
                            }`}
                          >
                            {emp.hrFileStatus}
                          </span>
                        </td>
                      </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : (
        <div className="cf-card-secondary p-4 text-xs cf-muted flex items-center gap-2">
          <Shield className="w-4 h-4 text-violet-400" />
          Espace gestion et pilotage masqué : le profil{' '}
          <strong>{session.activeProfile.name}</strong> est strictement cantonné à ses
          données propres{isTechnicalMode ? ' (TST31)' : ''}.
        </div>
      )}
    </div>,
    isTechnicalMode
  );
}
