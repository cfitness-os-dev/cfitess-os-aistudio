import { useEffect, useRef, useState } from "react";
import {
  Calendar,
  CheckSquare,
  Clock,
  FileText,
  GraduationCap,
  Home,
  Bell,
} from "lucide-react";
import { useCfos } from "../../context/CfosContext";
import {
  requestPersonalWorkspace,
  type PersonalAction,
  type PersonalWorkspace,
} from "../../domain/personalWorkspace";
import type { ClubId } from "../../types/cfos";

const tabs = [
  ["home", "Ma journée", Home],
  ["planning", "Mon planning", Calendar],
  ["leave", "Mes absences", Calendar],
  ["documents", "Mes documents", FileText],
  ["training", "Mes formations", GraduationCap],
  ["checklists", "Mes contrôles", CheckSquare],
  ["time", "Mes pointages", Clock],
] as const;
type Tab = (typeof tabs)[number][0];
const punchLabels: Record<string, string> = {
  arrivee: "Arrivée",
  debut_pause: "Début de pause",
  fin_pause: "Fin de pause",
  depart: "Départ",
};

export function PersonalWorkspaceView() {
  const { currentUser, clubFilter, authorizedClubIds } = useCfos();
  const club = (
    clubFilter === "all" ? authorizedClubIds[0] : clubFilter
  ) as ClubId;
  return (
    <PersonalWorkspaceContent
      key={`${currentUser.id}:${club}`}
      employeeId={currentUser.id}
      club={club}
    />
  );
}

function PersonalWorkspaceContent({
  employeeId,
  club,
}: {
  employeeId: string;
  club: ClubId;
}) {
  const { currentUser, setActiveSection } = useCfos();
  const [tab, setTab] = useState<Tab>(() => {
    const requested = new URLSearchParams(window.location.search).get(
      "personalTab",
    );
    return tabs.find(([key]) => key === requested)?.[0] ?? "home";
  });
  const [data, setData] = useState<PersonalWorkspace | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState("");
  const [taskCategory, setTaskCategory] = useState("RH & Administratif");
  const [taskFilter, setTaskFilter] = useState("all");
  const [leave, setLeave] = useState({
    motive: "CP",
    startDate: "",
    endDate: "",
    comment: "",
  });
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [consents, setConsents] = useState<Record<string, boolean>>({});
  const mounted = useRef(true);
  const saving = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    requestPersonalWorkspace(employeeId, club, undefined, controller.signal)
      .then((value) => {
        if (mounted.current) setData(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted && mounted.current)
          setError(e instanceof Error ? e.message : "Chargement impossible.");
      })
      .finally(() => {
        if (mounted.current && !controller.signal.aborted) setLoading(false);
      });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [employeeId, club]);
  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const value = await requestPersonalWorkspace(employeeId, club);
      if (mounted.current) setData(value);
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "Chargement impossible.");
    } finally {
      if (mounted.current) setLoading(false);
    }
  };
  const save = async (
    action: PersonalAction,
    message = "Enregistrement confirmé.",
  ) => {
    if (saving.current || !data) return false;
    saving.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const next = await requestPersonalWorkspace(employeeId, club, action);
      if (!mounted.current) return false;
      setData(next);
      setSuccess(message);
      return true;
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "Enregistrement impossible.");
      return false;
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const button =
    "cf-brand-gradient text-white px-4 py-2 rounded-xl min-h-[44px] text-sm font-semibold disabled:opacity-50";
  const input = "cf-input w-full min-w-0 min-h-[44px] px-3 py-2 rounded-xl";
  const ownDocuments = data?.documents ?? [];
  return (
    <section className="space-y-4 min-w-0" aria-label="Mes outils personnels">
      <header className="cf-card p-4 space-y-1">
        <h1 className="font-bold text-xl">Mon espace personnel</h1>
        <p>
          {currentUser.firstName} {currentUser.lastName} ·{" "}
          {club === "beynost" ? "Beynost" : "Carré de Soie"}
        </p>
        {data?.demoMode && (
          <p className="text-sm text-amber-500">
            Espace de test · données fictives
          </p>
        )}
      </header>
      <div className="flex flex-wrap gap-2">
        <a
          className={button}
          href="https://pronext.mywellness.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Ouvrir Mywellness
        </a>
        <button
          className={button}
          disabled={!data || busy}
          onClick={() => {
            if (!data) return;
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(data, null, 2)], {
                type: "application/json",
              }),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = `mon-espace-${club}.json`;
            link.click();
            URL.revokeObjectURL(url);
          }}
        >
          Exporter mon espace
        </button>
      </div>
      <details className="cf-muted text-sm">
        <summary className="cursor-pointer">
          À propos des accès et de l’export
        </summary>
        <p>
          Mywellness ouvre sa page de connexion sans transmettre d’identifiant.
          L’export contient votre espace du club actif ; la sauvegarde générale
          reste réservée aux responsables.
        </p>
      </details>
      <nav
        aria-label="Rubriques de mon espace personnel"
        className="flex flex-wrap gap-2"
      >
        {tabs.map(([key, label, Icon]) => (
          <button
            type="button"
            key={key}
            aria-current={tab === key ? "page" : undefined}
            onClick={() => {
              setTab(key);
              setError("");
              setSuccess("");
            }}
            className={`min-h-[44px] px-3 py-2 rounded-xl flex items-center gap-2 text-sm ${tab === key ? "cf-brand-gradient text-white" : "cf-card"}`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </nav>
      {loading && <p role="status">Chargement de votre espace…</p>}
      {error && (
        <div role="alert" className="cf-card p-4 border-red-500 space-y-2">
          <p>{error}</p>
          {!data && (
            <button
              type="button"
              className={button}
              onClick={() => void reload()}
            >
              Réessayer
            </button>
          )}
        </div>
      )}
      {success && (
        <p role="status" className="cf-card p-4 text-emerald-500">
          {success}
        </p>
      )}
      {data && (
        <>
          {tab === "home" && (
            <div className="grid lg:grid-cols-2 gap-4">
              <section className="cf-card p-4 space-y-3">
                <h2 className="font-bold">Mes tâches</h2>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (
                      await save({
                        action: "add_task",
                        title: task,
                        category: taskCategory,
                      })
                    )
                      setTask("");
                  }}
                  className="space-y-2"
                >
                  <label htmlFor="personal-task">Ajouter une tâche</label>
                  <input
                    id="personal-task"
                    className={input}
                    value={task}
                    disabled={busy}
                    maxLength={300}
                    required
                    onChange={(e) => setTask(e.target.value)}
                  />
                  <label className="block">
                    Catégorie de la nouvelle tâche
                    <select
                      className={input}
                      value={taskCategory}
                      disabled={busy}
                      onChange={(e) => setTaskCategory(e.target.value)}
                    >
                      {[
                        "Accueil & TPV",
                        "Relance CRM (ex-LEADS)",
                        "Suivi Mywellness",
                        "RH & Administratif",
                      ].map((category) => (
                        <option key={category}>{category}</option>
                      ))}
                    </select>
                  </label>
                  <button disabled={busy || !task.trim()} className={button}>
                    Ajouter ma tâche
                  </button>
                </form>

                {!data.tasks.length && (
                  <p className="cf-muted">Aucune tâche pour ce club.</p>
                )}
                <label className="block">
                  Filtrer mes tâches
                  <select
                    className={input}
                    value={taskFilter}
                    onChange={(e) => setTaskFilter(e.target.value)}
                  >
                    <option value="all">Toutes</option>
                    <option value="todo">À faire</option>
                    <option value="done">Faites</option>
                  </select>
                </label>
                {data.tasks
                  .filter(
                    (row) =>
                      taskFilter === "all" ||
                      (taskFilter === "done" ? row.completed : !row.completed),
                  )
                  .map((row) => (
                    <label
                      key={row.id}
                      className="flex gap-3 items-center p-3 cf-card-secondary rounded-xl"
                    >
                      <input
                        type="checkbox"
                        aria-label={row.title}
                        checked={row.completed}
                        disabled={busy}
                        onChange={(e) =>
                          void save({
                            action: "set_task",
                            id: row.id,
                            completed: e.target.checked,
                          })
                        }
                      />
                      <span>
                        {row.title}
                        <small className="block cf-muted">
                          {row.date} · {row.dueTime} · {row.category}
                          {row.priority === "Haute" ? " · Urgent" : ""}
                        </small>
                      </span>
                    </label>
                  ))}
              </section>
              <section className="cf-card p-4 space-y-3">
                <h2 className="font-bold flex items-center gap-2">
                  <Bell className="w-4 h-4" />
                  Mes notifications
                </h2>
                {!data.notifications.length && (
                  <p className="cf-muted">Aucune notification.</p>
                )}
                {data.notifications.map((row) => (
                  <article
                    key={row.id}
                    className="cf-card-secondary rounded-xl p-3 space-y-2"
                  >
                    <strong>{row.title}</strong>
                    <p>{row.message}</p>
                    {row.read ? (
                      <p className="cf-muted">Lue</p>
                    ) : (
                      <button
                        disabled={busy}
                        className={button}
                        onClick={() =>
                          void save({ action: "read_notification", id: row.id })
                        }
                      >
                        Marquer comme lue
                      </button>
                    )}
                  </article>
                ))}
                <button className={button} onClick={() => setTab("documents")}>
                  Voir mes documents à consulter
                </button>
              </section>
            </div>
          )}
          {tab === "planning" && (
            <section className="cf-card p-4 space-y-3">
              <h2 className="font-bold">Mes horaires publiés</h2>
              {!data.shifts.length && <p>Aucun horaire publié dans ce club.</p>}
              {data.shifts.map((row) => (
                <article
                  key={row.id}
                  className="cf-card-secondary p-3 rounded-xl"
                >
                  <strong>{row.date}</strong>
                  <p>
                    {row.startTime} – {row.endTime} · Pause {row.breakMinutes}{" "}
                    min
                  </p>
                  <p>{row.missionLabel}</p>
                </article>
              ))}
              <button
                className={button}
                onClick={() => setActiveSection("planning-hr", "planning")}
              >
                Ouvrir Mon planning
              </button>
            </section>
          )}
          {tab === "leave" && (
            <section className="cf-card p-4 space-y-4">
              <h2 className="font-bold">Mes demandes d’absence</h2>
              {!data.canRequestLeave && (
                <p role="status">
                  Votre profil ne permet pas de faire une demande dans ce club.
                  Contactez votre responsable.
                </p>
              )}
              <fieldset disabled={busy || !data.canRequestLeave}>
                <form
                  className="space-y-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await save(
                      { action: "request_leave", ...leave },
                      "Demande enregistrée sur le serveur, en attente de validation.",
                    );
                  }}
                >
                  <label className="block">
                    Type d’absence
                    <select
                      className={input}
                      value={leave.motive}
                      onChange={(e) =>
                        setLeave({ ...leave, motive: e.target.value })
                      }
                    >
                      {["CP", "RTT", "Maladie", "Formation CFA"].map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>
                  </label>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <label>
                      Début
                      <input
                        required
                        type="date"
                        className={input}
                        value={leave.startDate}
                        onChange={(e) =>
                          setLeave({ ...leave, startDate: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Fin
                      <input
                        required
                        type="date"
                        min={leave.startDate}
                        className={input}
                        value={leave.endDate}
                        onChange={(e) =>
                          setLeave({ ...leave, endDate: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <label className="block">
                    Commentaire facultatif
                    <textarea
                      className={input}
                      maxLength={1000}
                      value={leave.comment}
                      onChange={(e) =>
                        setLeave({ ...leave, comment: e.target.value })
                      }
                    />
                  </label>
                  <p className="text-sm cf-muted">
                    La durée décomptée et la validation restent à confirmer par
                    le responsable.
                  </p>
                  <button disabled={busy} className={button}>
                    Envoyer ma demande
                  </button>
                </form>
              </fieldset>
              {data.leaves.map((row) => (
                <article
                  key={row.id}
                  className="cf-card-secondary p-3 rounded-xl"
                >
                  <strong>
                    {row.motive} · {row.startDate} → {row.endDate}
                  </strong>
                  <p>
                    {row.status === "pending"
                      ? "En attente de validation"
                      : row.status === "approved"
                        ? "Validée"
                        : row.status === "rejected"
                          ? "Refusée"
                          : row.status}
                  </p>
                  <p>{row.comment}</p>
                </article>
              ))}
            </section>
          )}
          {tab === "documents" && (
            <section className="cf-card p-4 space-y-3">
              <h2 className="font-bold">Mes documents</h2>
              <p className="cf-muted text-sm">
                La signature réelle nécessite un fournisseur configuré. Une
                simulation ne constitue pas une signature qualifiée.
              </p>
              {!ownDocuments.length && <p>Aucun document disponible.</p>}
              {ownDocuments.map((doc) => (
                <article
                  key={doc.id}
                  className="cf-card-secondary p-4 rounded-xl space-y-3"
                >
                  <h3 className="font-bold">{doc.title}</h3>
                  <p>
                    {doc.category} · {doc.uploadedAt}
                  </p>
                  <details>
                    <summary className="cursor-pointer">
                      Consulter le document
                    </summary>
                    <p className="whitespace-pre-wrap break-words mt-3">
                      {doc.contractBodyText ||
                        "Contenu non disponible. Contactez votre responsable."}
                    </p>
                  </details>
                  {doc.acknowledgedAt ? (
                    <p>
                      Simulation confirmée le{" "}
                      {new Date(doc.acknowledgedAt).toLocaleString("fr-FR")}
                    </p>
                  ) : doc.signedStatus === "En attente signature" &&
                    data.demoMode ? (
                    <div className="space-y-3">
                      <label className="flex gap-2">
                        <input
                          type="checkbox"
                          checked={!!consents[doc.id]}
                          onChange={(e) =>
                            setConsents({
                              ...consents,
                              [doc.id]: e.target.checked,
                            })
                          }
                        />
                        J’ai consulté ce document fictif et je confirme la
                        simulation, sans engagement réel.
                      </label>
                      <button
                        className={button}
                        disabled={busy || !consents[doc.id]}
                        onClick={() =>
                          void save(
                            {
                              action: "acknowledge_demo_document",
                              id: doc.id,
                              consent: !!consents[doc.id],
                            },
                            "Simulation enregistrée. Aucune signature réelle effectuée.",
                          )
                        }
                      >
                        Confirmer la simulation de signature
                      </button>
                    </div>
                  ) : (
                    <p>
                      {doc.signedStatus === "En attente signature"
                        ? "Signature réelle à configurer auprès du responsable."
                        : doc.signedStatus}
                    </p>
                  )}
                </article>
              ))}
            </section>
          )}
          {tab === "training" && (
            <section className="cf-card p-4 space-y-3">
              <h2 className="font-bold">Mes formations</h2>
              {!data.training.length && <p>Aucune formation publiée.</p>}
              {data.training.map((mod) => (
                <article
                  key={mod.id}
                  className="cf-card-secondary p-4 rounded-xl space-y-3"
                >
                  <h3 className="font-bold">{mod.title}</h3>
                  <p className="cf-muted">
                    {mod.durationMin} min · {mod.authors}
                  </p>
                  <p>{mod.summary}</p>
                  <ul className="list-disc pl-5">
                    {mod.keyPoints.map((point, index) => (
                      <li key={index}>{point}</li>
                    ))}
                  </ul>
                  {data.progress.some(
                    (row) => row.moduleId === mod.id && row.completed,
                  ) ? (
                    <p className="text-emerald-500">Formation validée</p>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void save(
                          {
                            action: "answer_quiz",
                            id: mod.id,
                            selectedOption: answers[mod.id],
                          },
                          "Votre réponse est correcte. Formation validée.",
                        );
                      }}
                      className="space-y-3"
                    >
                      <fieldset disabled={busy}>
                        <legend className="font-semibold">
                          {mod.quizQuestion}
                        </legend>
                        {mod.quizOptions.map((option, index) => (
                          <label key={index} className="flex gap-2 py-2">
                            <input
                              type="radio"
                              required
                              name={`quiz-${mod.id}`}
                              checked={answers[mod.id] === index}
                              onChange={() =>
                                setAnswers({ ...answers, [mod.id]: index })
                              }
                            />
                            {option}
                          </label>
                        ))}
                      </fieldset>
                      <button
                        disabled={busy || answers[mod.id] === undefined}
                        className={button}
                      >
                        Vérifier ma réponse
                      </button>
                    </form>
                  )}
                </article>
              ))}
            </section>
          )}
          {tab === "checklists" && (
            <section className="cf-card p-4 space-y-3">
              <h2 className="font-bold">
                Contrôles d’ouverture et de fermeture
              </h2>
              <p className="cf-muted">Liste partagée du club actif.</p>
              {!data.checklists.length && (
                <p>Aucun contrôle défini pour ce club.</p>
              )}
              {data.checklists.map((row) => (
                <label
                  key={row.id}
                  className="cf-card-secondary flex gap-3 p-3 rounded-xl"
                >
                  <input
                    type="checkbox"
                    aria-label={row.label}
                    disabled={busy}
                    checked={!!row.checkedBy}
                    onChange={(e) =>
                      void save({
                        action: "set_checklist",
                        id: row.id,
                        completed: e.target.checked,
                      })
                    }
                  />
                  <span>
                    {row.label}
                    <small className="block cf-muted">
                      {row.shiftType}
                      {row.checkedBy ? ` · Validé par ${row.checkedBy}` : ""}
                    </small>
                  </span>
                </label>
              ))}
            </section>
          )}
          {tab === "time" && (
            <section className="cf-card p-4 space-y-3">
              <h2 className="font-bold">Mes pointages</h2>
              <p>
                Les horaires sont enregistrés par le serveur pour votre compte
                connecté.
              </p>
              <p role="status" className="cf-muted">
                {data.punchAvailability.openClubId &&
                data.punchAvailability.openClubId !== club
                  ? `Une prise de service est ouverte à ${data.punchAvailability.openClubId === "beynost" ? "Beynost" : "Carré de Soie"}. Revenez sur ce club pour poursuivre vos pointages.`
                  : data.punchAvailability.allowedTypes.includes("fin_pause")
                    ? "Pause en cours. Enregistrez la fin de pause pour reprendre votre service."
                    : data.punchAvailability.allowedTypes.includes("depart")
                      ? "Service en cours. Vous pouvez commencer une pause ou enregistrer votre départ."
                      : data.punchAvailability.allowedTypes.includes("arrivee")
                        ? "Aucun service en cours. Vous pouvez enregistrer votre arrivée."
                        : "Votre situation de pointage nécessite une vérification par le responsable."}
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  ["arrivee", "Arrivée"],
                  ["debut_pause", "Début de pause"],
                  ["fin_pause", "Fin de pause"],
                  ["depart", "Départ"],
                ].map(([type, label]) => (
                  <button
                    key={type}
                    className={button}
                    disabled={
                      busy ||
                      !data.punchAvailability.allowedTypes.some(
                        (allowed) => allowed === type,
                      )
                    }
                    onClick={() =>
                      void save(
                        { action: "punch", punchType: type },
                        "Pointage enregistré sur le serveur.",
                      )
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              {!data.timeEntries.length && (
                <p>Aucun pointage enregistré dans ce club.</p>
              )}
              {data.timeEntries.map((row) => (
                <p key={row.id} className="whitespace-pre-wrap break-words">
                  {new Date(row.timestamp).toLocaleString("fr-FR", {
                    timeZone: "Europe/Paris",
                  })}{" "}
                  · heure de Paris · {punchLabels[row.type] || "Pointage"}
                  {row.review && (
                    <span className="block cf-muted">
                      Note du responsable : {row.review.note}
                    </span>
                  )}
                </p>
              ))}
            </section>
          )}
        </>
      )}
    </section>
  );
}
