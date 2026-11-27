import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useCfos } from "../../context/CfosContext";
import { LeaveDecisionPanel, LeavePolicySummary } from './LeaveDecisionPanel';
import { confirmLeadDraftNavigation } from '../../domain/leadDraftGuard';
import { useLeadDraftGuard } from '../useLeadDraftGuard';
import type { ClubId } from "../../types/cfos";
import {
  csvCell,
  entryDay,
  fetchHrWorkspace,
  HrWorkflowEditor,
  statusLabel,
} from "../../domain/hrWorkflow";

function ReviewDisclosure({ enabled, label, children }: {
  enabled: boolean;
  label: string;
  children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return (
    <details className="rounded-xl border border-current/15 p-3">
      <summary className="min-h-[44px] cursor-pointer py-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
        {label}
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

function displayLeaveDate(value: string) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return parts ? parts[3] + "/" + parts[2] + "/" + parts[1] : value;
}

export function HrWorkflowView({
  tab,
  personalOnly,
}: {
  tab: "requests" | "time";
  personalOnly: boolean;
}) {
  const { currentUser, clubFilter, authorizedClubIds } = useCfos();
  const club = (
    clubFilter === "all" ? authorizedClubIds[0] : clubFilter
  ) as ClubId;
  return (
    <Workflow
      key={`${currentUser.id}:${club}:${personalOnly}:${tab}`}
      actorId={currentUser.id}
      club={club}
      personal={personalOnly}
      tab={tab}
    />
  );
}
function Workflow({
  actorId,
  club,
  personal,
  tab,
}: {
  actorId: string;
  club: ClubId;
  personal: boolean;
  tab: "requests" | "time";
}) {
  const { setActiveSection } = useCfos();
  const editor = useMemo(
    () =>
      new HrWorkflowEditor((mutation) =>
        fetchHrWorkspace(actorId, club, personal, mutation),
      ),
    [actorId, club, personal],
  );
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot);
  useEffect(() => {
    void editor.load();
    return () => editor.cancel();
  }, [editor]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [draftEpoch,setDraftEpoch]=useState(0);
  useLeadDraftGuard(Object.values(notes).some(note=>!!note.trim()));
  const changeFilter=(change:()=>void)=>{
    const apply=()=>{setDraftEpoch(value=>value+1);setNotes({});change();};
    if(confirmLeadDraftNavigation(apply))apply();
  };
  const requestRows = (state.data?.requests ?? []).filter(
    (row) =>
      row.employeeName
        .toLocaleLowerCase("fr")
        .includes(query.toLocaleLowerCase("fr")) &&
      (status === "all" || statusLabel(row.status) === status) &&
      (!start || row.endDate >= start) &&
      (!end || row.startDate <= end),
  );
  const entryRows = (state.data?.timeEntries ?? []).filter(
    (row) =>
      row.employeeName
        .toLocaleLowerCase("fr")
        .includes(query.toLocaleLowerCase("fr")) &&
      (!start || entryDay(row.timestamp) >= start) &&
      (!end || entryDay(row.timestamp) <= end),
  );
  const button =
    "cf-brand-gradient text-white px-3 py-2 rounded-xl min-h-[44px] text-sm font-semibold disabled:opacity-50";
  const input = "cf-input w-full min-w-0 px-3 py-2 min-h-[44px] rounded-xl";
  const secondaryButton = "cf-input px-3 py-2 rounded-xl min-h-[44px] text-sm font-semibold disabled:opacity-50";
  const hasFilters = !!(query || start || end || (tab === "requests" && status !== "all"));
  const resultCount = tab === "requests" ? requestRows.length : entryRows.length;
  const exportRows = () => {
    const rows =
      tab === "requests"
        ? [
            [
              "Collaborateur",
              "Club",
              "Type",
              "Début",
              "Fin",
              "Début de journée",
              "Fin de journée",
              "Statut",
              "CP période en cours décomptés",
              "Reliquat décompté",
              "RTT décomptés",
              "Commentaire",
            ],
            ...requestRows.map((row) => [
              row.employeeName,
              club,
              row.motive,
              row.startDate,
              row.endDate,
              row.policy?.startPeriod==='pm'?'Après-midi':'Matin',
              row.policy?.endPeriod==='am'?'Fin de matinée':'Fin de journée',
              statusLabel(row.status),
              row.policy?.activeSettlement?.allocations.cpN??'',
              row.policy?.activeSettlement?.allocations.cpNMinus1??'',
              row.policy?.activeSettlement?.allocations.rtt??'',
              row.comment,
            ]),
          ]
        : [
            [
              "Collaborateur",
              "Club",
              "Horodatage UTC",
              "Pointage",
              "Note du responsable",
            ],
            ...entryRows.map((row) => [
              row.employeeName,
              club,
              row.timestamp,
              row.type,
              row.review?.note ?? "",
            ]),
          ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${tab === "requests" ? "absences" : "pointages"}-${club}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const punchLabel: Record<string, string> = {
    arrivee: "Arrivée",
    depart: "Départ",
    debut_pause: "Début de pause",
    fin_pause: "Fin de pause",
  };
  return (
    <section
      className="p-3 sm:p-5 space-y-4"
      aria-label={
        tab === "requests"
          ? "Demandes d’absence enregistrées"
          : "Pointages enregistrés"
      }
    >
      <header className="cf-card p-4 space-y-2">
        <h2 className="text-lg font-bold">
          {personal ? "Mes " : ""}
          {tab === "requests" ? "Demandes d’absence" : "Pointages"}
        </h2>
        <p>
          {club === "beynost" ? "Beynost" : "Carré de Soie"} ·{" "}
          {personal
            ? "Mon compte uniquement"
            : "Salariés dans votre périmètre autorisé"}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className={secondaryButton}
            disabled={state.loading || state.saving}
            onClick={() => { const refresh=()=>void editor.load(); if(confirmLeadDraftNavigation(refresh))refresh(); }}
          >
            Actualiser
          </button>
          <button
            className={secondaryButton}
            disabled={!state.data || state.loading || state.saving}
            onClick={exportRows}
          >
            Exporter la sélection (CSV)
          </button>
          <button
            className={secondaryButton}
            onClick={() => {
              setActiveSection("my-day", "personal");
              window.history.replaceState(
                null,
                "",
                `/mon-compte/personal?personalTab=${tab === "requests" ? "leave" : "time"}`,
              );
            }}
          >
            Ouvrir mes {tab === "requests" ? "demandes" : "pointages"}
          </button>
        </div>
        <p className="cf-muted text-sm">
          {tab === "requests"
            ? "Les décisions mettent à jour la demande d’origine. Pour les motifs associés à un compteur, confirmez les jours à décompter ; toute reprise compense le mouvement enregistré."
            : "Les horaires d’origine restent conservés. Une annotation ne corrige pas automatiquement un horaire ni la paie."}
        </p>
      </header>
      <div className="cf-card p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label>
          Rechercher un collaborateur
          <input
            className={input}
            value={query}
            onChange={(e) => {const value=e.target.value;changeFilter(()=>setQuery(value));}}
          />
        </label>
        {tab === "requests" && (
          <label>
            État des demandes
            <select
              className={input}
              value={status}
              onChange={(e) => {const value=e.target.value;changeFilter(()=>setStatus(value));}}
            >
              {["all", "En attente", "Validée", "Refusée", "Annulée"].map((value) => (
                <option key={value} value={value}>
                  {value === "all" ? "Tous les états" : value}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          À partir du
          <input
            type="date"
            className={input}
            value={start}
            onChange={(e) => {const value=e.target.value;changeFilter(()=>setStart(value));}}
          />
        </label>
        <label>
          Jusqu’au
          <input
            type="date"
            className={input}
            min={start}
            value={end}
            onChange={(e) => {const value=e.target.value;changeFilter(()=>setEnd(value));}}
          />
        </label>
      </div>
      {state.loading && <p role="status">Chargement des données RH…</p>}
      {state.error && (
        <p role="alert" className="cf-card p-4 border-red-500">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="cf-card p-4 text-emerald-500">
          {state.message}
        </p>
      )}
      {state.data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p role="status">{resultCount} résultat(s) dans le périmètre affiché.</p>
            {hasFilters && (
              <button className={secondaryButton} disabled={state.loading || state.saving}
                onClick={() => changeFilter(() => { setQuery(""); setStatus("all"); setStart(""); setEnd(""); })}>
                Effacer les filtres
              </button>
            )}
          </div>
          {!state.loading && !state.error && resultCount === 0 && (
            <div className="cf-card p-5 space-y-2">
              <h3 className="font-semibold">
                {hasFilters ? "Aucun résultat avec ces filtres" : tab === "requests" ? "Aucune demande d’absence sur ce périmètre" : "Aucun pointage sur ce périmètre"}
              </h3>
              <p className="cf-muted text-sm">
                {hasFilters ? "Élargissez la période ou effacez les filtres pour retrouver les éléments disponibles." : "Les nouveaux éléments apparaîtront ici après leur enregistrement."}
              </p>
            </div>
          )}
          {tab === "requests"
            ? requestRows.map((row) => (
                <article className="cf-card p-4 space-y-3" key={`${row.id}:${draftEpoch}`}>
                  <h3 className="font-bold">
                    {row.employeeName} · {row.motive}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <p>{displayLeaveDate(row.startDate)} → {displayLeaveDate(row.endDate)}</p>
                    <span className="cf-input rounded-full px-3 py-1 font-semibold">{statusLabel(row.status)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words">
                    {row.comment}
                  </p>
                  {row.policy && <LeavePolicySummary policy={row.policy} />}
                  <ReviewDisclosure enabled={row.canDecide}
                    label={statusLabel(row.status) === "En attente" ? "Traiter cette demande" : "Revoir la décision"}>
                  {row.canDecide && row.policy && (row.policy.counterFamily !== 'none' || row.policy.hasActiveSettlement) ? <LeaveDecisionPanel row={row} actorId={actorId} club={club} locked={state.loading||state.saving} onChanged={()=>editor.load(true)} onSimpleDecision={(status,note)=>editor.save({kind:'request',id:row.id,status,expectedStatus:row.status,expectedRevision:row.revision,note})} /> : row.canDecide ? (
                    <div className="space-y-2">
                      <label className="block">
                        Motif pour {row.employeeName}
                        <textarea
                          className={input}
                          maxLength={1000}
                          disabled={state.saving}
                          value={notes[row.id] ?? ""}
                          onChange={(e) =>
                            setNotes({ ...notes, [row.id]: e.target.value })
                          }
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          ["approved", "Valider"],
                          ["rejected", "Refuser"],
                          ["pending", "Remettre en attente"],
                        ]
                          .filter(
                            ([next]) =>
                              statusLabel(next) !== statusLabel(row.status),
                          )
                          .map(([next, label]) => (
                            <button
                              key={next}
                              className={button}
                              disabled={
                                state.saving || state.loading ||
                                (next === 'approved' && (row.policy?.missingDocument || row.policy?.active===false || (!!row.policy?.requiresDocument && !row.policy.canViewDocuments))) ||
                                (next !== "approved" && !notes[row.id]?.trim())
                              }
                              onClick={async () => {
                                if (
                                  await editor.save({
                                    kind: "request",
                                    id: row.id,
                                    status: next,
                                    expectedStatus: row.status,
                                    expectedRevision: row.revision,
                                    note: notes[row.id] ?? "",
                                  })
                                )
                                  setNotes((previous) => ({
                                    ...previous,
                                    [row.id]: "",
                                  }));
                              }}
                            >
                              {label} la demande de {row.employeeName}
                            </button>
                          ))}
                      </div>
                    </div>
                  ) : (
                    <p className="cf-muted text-sm">
                      {row.status === "cancelled"
                        ? "Demande retirée par le collaborateur. Historique conservé ; aucune décision possible."
                        : row.employeeId === actorId
                        ? "Consultation uniquement. Une autre personne habilitée traite vos propres demandes."
                        : "Consultation uniquement. Vos droits ne permettent pas de traiter cette demande."}
                    </p>
                  )}
                  </ReviewDisclosure>
                </article>
              ))
            : entryRows.map((row) => (
                <article
                  className="cf-card p-4 space-y-3"
                  key={`${row.employeeId}:${row.id}`}
                >
                  <h3 className="font-bold">
                    {row.employeeName} · {punchLabel[row.type] ?? "Pointage"}
                  </h3>
                  <p>
                    {new Date(row.timestamp).toLocaleString("fr-FR", {
                      timeZone: "Europe/Paris",
                    })}{" "}
                    · heure de Paris
                  </p>
                  {row.review && (
                    <p className="cf-muted whitespace-pre-wrap break-words">
                      Note : {row.review.note} ·{" "}
                      {new Date(row.review.at).toLocaleString("fr-FR", {
                        timeZone: "Europe/Paris",
                      })}
                    </p>
                  )}
                  {row.canReview && (
                    <ReviewDisclosure enabled label={row.review ? "Modifier la note" : "Annoter ce pointage"}>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (
                          await editor.save({
                            kind: "entry",
                            id: row.id,
                            employeeId: row.employeeId,
                            note: notes[row.id] ?? row.review?.note ?? "",
                            expectedVersion: row.review?.version ?? null,
                          })
                        )
                          setNotes((previous) => {
                            const next = { ...previous };
                            delete next[row.id];
                            return next;
                          });
                      }}
                      className="space-y-2"
                    >
                      <label className="block">
                        Note sur le pointage de {row.employeeName}
                        <textarea
                          className={input}
                          maxLength={1000}
                          required
                          disabled={state.saving}
                          value={notes[row.id] ?? row.review?.note ?? ""}
                          onChange={(e) =>
                            setNotes({ ...notes, [row.id]: e.target.value })
                          }
                        />
                      </label>
                      <button className={button} disabled={state.saving}>
                        Enregistrer la note sur {row.employeeName}
                      </button>
                    </form>
                    </ReviewDisclosure>
                  )}
                </article>
              ))}
        </>
      )}
    </section>
  );
}
