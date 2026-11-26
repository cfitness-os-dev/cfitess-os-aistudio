import { useEffect, useRef, useState } from "react";
import {
  ClockPolicyAccessDenied,
  requestClockPolicies,
  type ClockPolicies,
  type ClockPolicyRow,
} from "../../domain/clockPolicy";
import type { ClubId } from "../../types/cfos";
export function ClockPolicyPanel({
  actor,
  club,
}: {
  actor: string;
  club: ClubId;
}) {
  const [data, setData] = useState<ClockPolicies | null>(null);
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [denied, setDenied] = useState(false);
  const [drafts, setDrafts] = useState<
    Record<
      string,
      {
        personalAllowed: boolean;
        terminalAllowed: boolean;
        reason: string;
        expectedRevision: string | null;
      }
    >
  >({});
  const [query, setQuery] = useState("");
  const version = useRef(0);
  async function load(signal?: AbortSignal) {
    const generation = ++version.current;
    setLoading(true);
    setError("");
    setMessage("");
    setData(null);
    try {
      const result = await requestClockPolicies(actor, club, signal);
      if (generation === version.current) {
        setData(result);
        setDenied(false);
      }
    } catch (e) {
      if (generation === version.current && !signal?.aborted) {
        if (e instanceof ClockPolicyAccessDenied) setDenied(true);
        else
          setError(e instanceof Error ? e.message : "Chargement impossible.");
      }
    } finally {
      if (generation === version.current) setLoading(false);
    }
  }
  useEffect(() => {
    const abort = new AbortController();
    void load(abort.signal);
    return () => {
      version.current++;
      abort.abort();
    };
  }, [actor, club]);
  async function save(row: ClockPolicyRow) {
    if (saving || loading || !row.canEdit) return;
    const draft = drafts[row.employeeId];
    if (!draft?.reason.trim()) return;
    const generation = ++version.current;
    setSaving(row.employeeId);
    setError("");
    setMessage("");
    try {
      const result = await requestClockPolicies(actor, club, undefined, {
        employeeId: row.employeeId,
        ...draft,
      });
      if (generation === version.current) {
        setData(result);
        setDrafts((previous) => {
          const next = { ...previous };
          delete next[row.employeeId];
          return next;
        });
        setMessage("Autorisations enregistrées sur le serveur.");
      }
    } catch (e) {
      if (generation === version.current)
        setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      if (generation === version.current) setSaving("");
    }
  }
  if (denied) return null;
  return (
    <details className="cf-card p-4 space-y-3">
      <summary className="cursor-pointer font-bold min-h-[44px]">
        Autorisations de pointage par collaborateur
      </summary>
      <p className="cf-muted text-sm">
        Réglages de la pointeuse ·{" "}
        {club === "beynost" ? "Beynost" : "Carré de Soie"}. Les autorisations
        sont indépendantes dans chaque club. Un autre responsable habilité
        traite vos propres droits.
      </p>
      <p className="text-sm">
        L’autorisation de pointage et la préparation de la tablette sont deux étapes distinctes. L’appareil doit être appairé et vérifié avant son utilisation au club.
      </p>
      <button
        className="cf-button min-h-[44px] px-3"
        disabled={loading || !!saving}
        onClick={() => void load()}
      >
        Actualiser les autorisations
      </button>
      {loading && <p role="status">Chargement des autorisations…</p>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <label className="block">
        Rechercher dans les autorisations
        <input
          className="cf-input block w-full min-h-[44px] p-2 rounded-xl"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {data?.rows
        .filter((row) =>
          `${row.employeeName} ${row.employeeReference}`
            .toLocaleLowerCase("fr")
            .includes(query.toLocaleLowerCase("fr")),
        )
        .map((row) => {
          const draft = drafts[row.employeeId] ?? {
            personalAllowed: row.policy.personalAllowed,
            terminalAllowed: row.policy.terminalAllowed,
            reason: "",
            expectedRevision: row.policy.revision || null,
          };
          const update = (patch: Partial<typeof draft>) =>
            setDrafts((previous) => ({
              ...previous,
              [row.employeeId]: { ...draft, ...patch },
            }));
          return (
            <form
              key={row.employeeId}
              className="cf-card p-3 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void save(row);
              }}
            >
              <h3 className="font-semibold">{row.employeeName}</h3>
              <p className="cf-muted text-sm">
                Matricule : {row.employeeReference}
              </p>
              <fieldset
                disabled={!row.canEdit || loading || !!saving}
                className="space-y-3"
              >
                <label className="flex items-center gap-3 min-h-[44px]">
                  <input
                    type="checkbox"
                    checked={draft.personalAllowed}
                    onChange={(e) =>
                      update({ personalAllowed: e.target.checked })
                    }
                  />
                  Autoriser {row.employeeName} à pointer depuis Mon compte
                </label>
                <label className="flex items-center gap-3 min-h-[44px]">
                  <input
                    type="checkbox"
                    checked={draft.terminalAllowed}
                    onChange={(e) =>
                      update({ terminalAllowed: e.target.checked })
                    }
                  />
                  Autoriser {row.employeeName} sur un appareil enregistré
                </label>
                <label className="block">
                  Motif pour {row.employeeName}
                  <textarea
                    required
                    maxLength={1000}
                    value={draft.reason}
                    onChange={(e) => update({ reason: e.target.value })}
                    className="cf-input block w-full min-h-[60px] rounded-xl p-2"
                  />
                </label>
                <button
                  disabled={!draft.reason.trim()}
                  className="cf-brand-gradient text-white px-3 py-2 min-h-[44px] rounded-xl"
                >
                  Enregistrer les droits de {row.employeeName}
                </button>
                {drafts[row.employeeId] && (
                  <button
                    type="button"
                    className="min-h-[44px] px-3"
                    onClick={() =>
                      setDrafts((previous) => {
                        const next = { ...previous };
                        delete next[row.employeeId];
                        return next;
                      })
                    }
                  >
                    Abandonner les modifications pour {row.employeeName}
                  </button>
                )}
              </fieldset>
              {!row.canEdit && (
                <p className="cf-muted text-sm">
                  Une autre personne habilitée doit modifier vos propres
                  autorisations.
                </p>
              )}
              <p className="cf-muted text-xs">
                {row.policy.revision
                  ? "Configuration enregistrée"
                  : "Aucune autorisation attribuée"}
              </p>
            </form>
          );
        })}
    </details>
  );
}
