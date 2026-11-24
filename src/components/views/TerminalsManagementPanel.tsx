import { useEffect, useRef, useState } from "react";
import {
  fetchClubTerminals,
  createTerminal,
  revokeTerminal,
  fetchClubPhotoPolicy,
  updateClubPhotoPolicy,
  fetchClubPunchPhotos,
  fetchPunchPhotoBlobUrl,
  deleteClubPunchPhoto,
  purgeClubPunchPhotos,
  TerminalAccessDenied,
  type ClockTerminalItem,
  type CreatedTerminalResponse,
  type PhotoPolicyMode,
  type PunchPhotoMetadata,
} from "../../domain/terminals";
import type { ClubId } from "../../types/cfos";
import {
  Tablet,
  Plus,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Ban,
  Camera,
  Eye,
  Trash2,
  RefreshCw,
} from "lucide-react";

const CLUB_DEFAULT_ROOMS: Record<ClubId, Array<{ id: string; label: string }>> = {
  "carre-de-soie": [
    { id: "room-cours-soie", label: "Salle Cours Collectifs" },
    { id: "room-inbody-soie", label: "Salle Bilan Technogym Checkup (Mywellness)" },
    { id: "room-accueil-soie", label: "Accueil / Borne Kiosque" },
    { id: "room-plateau-soie", label: "Plateau Musculation" },
  ],
  beynost: [
    { id: "room-salle-a", label: "Salle Cours Collectifs A" },
    { id: "room-salle-b", label: "Salle Bilan Technogym Checkup (Mywellness)" },
    { id: "room-accueil-bey", label: "Accueil / Borne Kiosque" },
    { id: "room-plateau-bey", label: "Plateau Cardio & Muscu" },
  ],
};

export function TerminalsManagementPanel({
  actor,
  club,
}: {
  actor: string;
  club: ClubId;
}) {
  const [terminals, setTerminals] = useState<ClockTerminalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Formulaire d'ajout
  const [isAdding, setIsAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [selectedRoom, setSelectedRoom] = useState(CLUB_DEFAULT_ROOMS[club]?.[0]?.id || "room-cours");
  const [customRoomLabel, setCustomRoomLabel] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastCreated, setLastCreated] = useState<CreatedTerminalResponse | null>(null);

  // Révocation
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  // Politique photo & galerie privée propriétaire (#33)
  const [photoPolicy, setPhotoPolicy] = useState<PhotoPolicyMode>("optional");
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryPhotos, setGalleryPhotos] = useState<PunchPhotoMetadata[]>([]);
  const [photoBlobUrls, setPhotoBlobUrls] = useState<Record<string, string>>({});
  const photoBlobUrlsRef = useRef<Record<string, string>>({});
  const [photoBusyId, setPhotoBusyId] = useState<string | null>(null);
  const [purgingPhotos, setPurgingPhotos] = useState(false);

  const version = useRef(0);

  function revokeAllBlobUrls() {
    Object.values(photoBlobUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    photoBlobUrlsRef.current = {};
    setPhotoBlobUrls({});
  }

  async function load(signal?: AbortSignal) {
    const currentVer = ++version.current;
    setLoading(true);
    setError("");
    try {
      const [data, policy] = await Promise.all([
        fetchClubTerminals(actor, club, signal),
        fetchClubPhotoPolicy(club, signal),
      ]);
      if (currentVer === version.current) {
        setTerminals(data);
        setPhotoPolicy(policy);
        setDenied(false);
      }
    } catch (e) {
      if (currentVer === version.current && !signal?.aborted) {
        if (e instanceof TerminalAccessDenied) {
          setDenied(true);
        } else {
          setError(e instanceof Error ? e.message : "Erreur de chargement des terminaux.");
        }
      }
    } finally {
      if (currentVer === version.current) setLoading(false);
    }
  }

  useEffect(() => {
    const abort = new AbortController();
    revokeAllBlobUrls();
    setGalleryPhotos([]);
    setGalleryOpen(false);
    void load(abort.signal);
    return () => {
      version.current++;
      abort.abort();
      revokeAllBlobUrls();
    };
  }, [actor, club]);

  async function loadGallery() {
    setGalleryLoading(true);
    setError("");
    try {
      const list = await fetchClubPunchPhotos(club);
      setGalleryPhotos(list);
    } catch (err) {
      if (err instanceof TerminalAccessDenied) {
        setDenied(true);
      } else {
        setError(err instanceof Error ? err.message : "Impossible de charger la galerie photos.");
      }
    } finally {
      setGalleryLoading(false);
    }
  }

  async function handleChangePhotoPolicy(nextMode: PhotoPolicyMode) {
    setSavingPolicy(true);
    setError("");
    setSuccessMsg("");
    try {
      const updated = await updateClubPhotoPolicy(club, nextMode);
      setPhotoPolicy(updated.mode);
      const labelPolicy =
        updated.mode === "disabled"
          ? "Désactivée"
          : updated.mode === "required"
          ? "Obligatoire"
          : "Facultative";
      setSuccessMsg(`Politique photo du club enregistrée : ${labelPolicy}.`);
    } catch (err) {
      if (err instanceof TerminalAccessDenied) {
        setDenied(true);
      } else {
        setError(err instanceof Error ? err.message : "Impossible de modifier la politique photo.");
      }
    } finally {
      setSavingPolicy(false);
    }
  }

  async function handleViewPhoto(photoId: string) {
    setPhotoBusyId(photoId);
    setError("");
    try {
      const blobUrl = await fetchPunchPhotoBlobUrl(club, photoId);
      const prevUrl = photoBlobUrlsRef.current[photoId];
      if (prevUrl) URL.revokeObjectURL(prevUrl);
      photoBlobUrlsRef.current[photoId] = blobUrl;
      setPhotoBlobUrls((prev) => ({ ...prev, [photoId]: blobUrl }));
    } catch (err) {
      if (err instanceof TerminalAccessDenied) {
        setDenied(true);
      } else {
        setError(err instanceof Error ? err.message : "Impossible d'afficher cette photo.");
      }
    } finally {
      setPhotoBusyId(null);
    }
  }

  async function handleDeletePhoto(photoId: string) {
    setPhotoBusyId(photoId);
    setError("");
    setSuccessMsg("");
    try {
      await deleteClubPunchPhoto(club, photoId);
      const prevUrl = photoBlobUrlsRef.current[photoId];
      if (prevUrl) {
        URL.revokeObjectURL(prevUrl);
        delete photoBlobUrlsRef.current[photoId];
      }
      setPhotoBlobUrls((prev) => {
        const next = { ...prev };
        delete next[photoId];
        return next;
      });
      setGalleryPhotos((prev) => prev.filter((p) => p.id !== photoId));
      setSuccessMsg("Preuve photo supprimée du serveur et du registre.");
    } catch (err) {
      if (err instanceof TerminalAccessDenied) {
        setDenied(true);
      } else {
        setError(err instanceof Error ? err.message : "Échec de suppression de la photo.");
      }
    } finally {
      setPhotoBusyId(null);
    }
  }

  async function handlePurgePhotos() {
    setPurgingPhotos(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await purgeClubPunchPhotos(club, 30);
      revokeAllBlobUrls();
      await loadGallery();
      setSuccessMsg(
        `Purge terminée : ${res.removedCount} photo(s) supprimée(s) (rétention ${res.retentionDays} jours).`
      );
    } catch (err) {
      if (err instanceof TerminalAccessDenied) {
        setDenied(true);
      } else {
        setError(err instanceof Error ? err.message : "Échec de la purge des photos.");
      }
    } finally {
      setPurgingPhotos(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;

    setIsSubmitting(true);
    setError("");
    setSuccessMsg("");
    try {
      const defaultRoom = CLUB_DEFAULT_ROOMS[club]?.find((r) => r.id === selectedRoom);
      const roomLabel = defaultRoom ? defaultRoom.label : customRoomLabel.trim() || selectedRoom;

      const created = await createTerminal(actor, club, {
        label: label.trim(),
        roomId: selectedRoom,
        roomLabel,
      });

      setLastCreated(created);
      setSuccessMsg(`Terminal enregistré ! Code d'appairage : ${created.pairingCode} (valable 10 min)`);
      setLabel("");
      setIsAdding(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de créer le terminal.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRevoke(termId: string) {
    if (!revokeReason.trim()) {
      setError("Veuillez indiquer un motif de révocation.");
      return;
    }
    setError("");
    try {
      await revokeTerminal(actor, club, termId, revokeReason);
      setSuccessMsg("Terminal révoqué avec succès. Il ne peut plus être utilisé.");
      setRevokingId(null);
      setRevokeReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de révocation du terminal.");
    }
  }

  if (denied) return null;

  return (
    <details className="cf-card p-4 space-y-4">
      <summary className="cursor-pointer font-bold flex items-center gap-2 min-h-[44px]">
        <Tablet className="w-5 h-5 text-indigo-500" />
        <span>Pointeuses & Tablettes fixes du club ({terminals.length})</span>
      </summary>

      <p className="cf-muted text-sm">
        Registre des terminaux matériels autorisés pour le pointage RH et la présence avant-cours.
        Chaque tablette est assignée à une salle fixe du club et authentifiée par un jeton matériel unique.
      </p>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-lg text-sm flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {lastCreated && (
        <div className="p-4 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl space-y-2">
          <div className="font-bold text-indigo-900 dark:text-indigo-200">
            Nouveau terminal à appairer sur place :
          </div>
          <div className="text-sm">
            Terminal : <strong>{lastCreated.label}</strong> ({lastCreated.roomLabel})
          </div>
          <div className="text-2xl font-mono tracking-widest font-black text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900 p-3 rounded-lg border inline-block">
            {lastCreated.pairingCode}
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span>Saisissez ce code à 6 chiffres sur la tablette dans les 10 minutes.</span>
          </div>
        </div>
      )}

      {/* Bouton pour ouvrir le formulaire d'ajout */}
      {!isAdding ? (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="cf-btn-secondary flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Enregistrer une nouvelle tablette de pointage</span>
        </button>
      ) : (
        <form onSubmit={handleCreate} className="p-4 border rounded-xl space-y-3 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="font-semibold text-sm">Enregistrer une nouvelle tablette</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Nom du terminal (ex: Tablette Salle A)</label>
              <input
                type="text"
                className="cf-input w-full text-sm"
                placeholder="Tablette Salle A..."
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Salle assignée</label>
              <select
                className="cf-select w-full text-sm"
                value={selectedRoom}
                onChange={(e) => setSelectedRoom(e.target.value)}
              >
                {CLUB_DEFAULT_ROOMS[club]?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="cf-btn-secondary text-sm"
              onClick={() => setIsAdding(false)}
              disabled={isSubmitting}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="cf-btn-primary text-sm"
              disabled={isSubmitting || !label.trim()}
            >
              {isSubmitting ? "Génération du code..." : "Générer le code d'appairage"}
            </button>
          </div>
        </form>
      )}

      {/* Liste des terminaux */}
      {loading ? (
        <div className="text-sm cf-muted">Chargement des terminaux...</div>
      ) : terminals.length === 0 ? (
        <div className="text-sm cf-muted italic">Aucun terminal enregistré pour ce club.</div>
      ) : (
        <div className="space-y-3">
          {terminals.map((term) => (
            <div
              key={term.id}
              className="p-3 border rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-sm"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{term.label}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      term.status === "active"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                        : term.status === "pending_pairing"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                        : "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
                    }`}
                  >
                    {term.status === "active"
                      ? "Actif"
                      : term.status === "pending_pairing"
                      ? "En attente d'appairage"
                      : "Révoqué"}
                  </span>
                </div>
                <div className="cf-muted text-xs">
                  Salle : <strong>{term.roomLabel}</strong> ({term.roomId})
                  {term.lastSeenAt && (
                    <span>
                      {" "}· Vu le :{" "}
                      {new Date(term.lastSeenAt).toLocaleString("fr-FR", {
                        timeZone: "Europe/Paris",
                      })}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {term.status === "active" && (
                  <button
                    type="button"
                    className="cf-btn-danger text-xs flex items-center gap-1"
                    onClick={() => setRevokingId(term.id)}
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Révoquer</span>
                  </button>
                )}
              </div>

              {revokingId === term.id && (
                <div className="w-full mt-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg space-y-2">
                  <div className="text-xs font-semibold text-red-700 dark:text-red-300">
                    Confirmer la révocation du terminal « {term.label} » ?
                  </div>
                  <input
                    type="text"
                    className="cf-input w-full text-xs"
                    placeholder="Motif de révocation obligatoire (ex: perte, panne, changement de tablette)..."
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      className="cf-btn-secondary text-xs"
                      onClick={() => {
                        setRevokingId(null);
                        setRevokeReason("");
                      }}
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      className="cf-btn-danger text-xs"
                      onClick={() => handleRevoke(term.id)}
                      disabled={!revokeReason.trim()}
                    >
                      Confirmer la révocation
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Politique photo de pointage du club (#33 - réservée propriétaire) */}
      <div className="pt-3 border-t space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold flex items-center gap-2">
              <Camera className="w-4 h-4 text-indigo-500" />
              <span>Politique photo au pointage (club)</span>
            </div>
            <p className="cf-muted text-xs">
              Contrôle immédiat de la caméra sur les tablettes appairées de ce club.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { value: "disabled", label: "Désactivée" },
                { value: "optional", label: "Facultative" },
                { value: "required", label: "Obligatoire" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={savingPolicy}
                onClick={() => handleChangePhotoPolicy(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer disabled:opacity-50 ${
                  photoPolicy === opt.value
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "cf-btn-secondary"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Galerie privée des photos de pointage (#33 - réservée propriétaire) */}
      <details
        open={galleryOpen}
        onToggle={(e) => {
          const isOpen = (e.currentTarget as HTMLDetailsElement).open;
          setGalleryOpen(isOpen);
          if (isOpen) {
            void loadGallery();
          }
        }}
        className="pt-3 border-t space-y-3"
      >
        <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2 min-h-[38px]">
          <Eye className="w-4 h-4 text-indigo-500" />
          <span>Galerie privée des preuves photo ({galleryPhotos.length})</span>
        </summary>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="cf-muted text-xs">
            Consultation nominative authentifiée (aucun accès sans session propriétaire).
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadGallery()}
              disabled={galleryLoading}
              className="cf-btn-secondary text-xs flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${galleryLoading ? "animate-spin" : ""}`} />
              <span>Actualiser</span>
            </button>
            <button
              type="button"
              onClick={() => void handlePurgePhotos()}
              disabled={purgingPhotos || galleryLoading}
              className="cf-btn-danger text-xs flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{purgingPhotos ? "Purge..." : "Purger (> 30j)"}</span>
            </button>
          </div>
        </div>

        {galleryLoading ? (
          <div className="text-xs cf-muted">Chargement des preuves photo...</div>
        ) : galleryPhotos.length === 0 ? (
          <div className="text-xs cf-muted italic">
            Aucune preuve photo enregistrée pour ce club.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {galleryPhotos.map((photo) => {
              const blobUrl = photoBlobUrls[photo.id];
              const isBusy = photoBusyId === photo.id;
              return (
                <div
                  key={photo.id}
                  className="p-3 border rounded-xl space-y-2 text-xs bg-slate-50/50 dark:bg-slate-900/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="font-semibold">
                        {photo.employeeName || photo.employeeId}
                      </div>
                      <div className="cf-muted">
                        {photo.terminalLabel || photo.terminalId} ·{" "}
                        {new Date(photo.capturedAt).toLocaleString("fr-FR", {
                          timeZone: "Europe/Paris",
                        })}
                      </div>
                      <div className="cf-muted">
                        {Math.max(1, Math.round(photo.byteSize / 1024))} Ko ·{" "}
                        {photo.consumedAt ? "Consommée au pointage" : "En attente / expirée"}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleViewPhoto(photo.id)}
                        className="cf-btn-secondary text-xs flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{blobUrl ? "Recharger" : "Afficher"}</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleDeletePhoto(photo.id)}
                        className="cf-btn-danger text-xs flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Supprimer</span>
                      </button>
                    </div>
                  </div>
                  {blobUrl && (
                    <img
                      src={blobUrl}
                      alt={`Preuve photo ${photo.employeeName || photo.employeeId}`}
                      className="w-full max-h-48 object-contain rounded-lg border bg-black/80"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </details>
    </details>
  );
}
