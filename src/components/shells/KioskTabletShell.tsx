import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useCfos } from '../../context/CfosContext';
import {
  Wifi,
  WifiOff,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  UserPlus,
  Clock,
  Tablet,
  KeyRound,
  ShieldCheck,
  ClipboardCheck,
  RefreshCw,
  LogOut,
  Camera,
  CameraOff,
  Images,
  Trash2,
} from 'lucide-react';
import { ClubId, PointageType } from '../../types/cfos';
import { formatPointageType } from '../../domain/rules';
import { ThemeColorControl } from '../ThemeColorControl';
import {
  authenticateKioskEmployee,
  CapturedPhotoProof,
  captureTerminalPhoto,
  clearKioskEmployeeSession,
  clearStoredTerminalToken,
  deleteClubPunchPhoto,
  fetchClubPunchPhotos,
  fetchPunchPhotoBlobUrl,
  fetchRoomOccurrences,
  fetchTerminalWhoAmI,
  getStoredTerminalToken,
  getVerifiedKioskSession,
  pairTerminal,
  PunchPhotoMetadata,
  purgeClubPunchPhotos,
  resolveKioskPhotoPolicy,
  RoomCourseOccurrence,
  setStoredTerminalToken,
  submitCoursePresence,
  submitTerminalPunch,
  TerminalAccessDenied,
  TerminalWhoAmI,
  VerifiedKioskSession,
} from '../../domain/terminals';

const OFFICIAL_CHECKLIST = [
  { id: 'chk-sono', label: 'Sonorisation, micro et playlist vérifiés' },
  { id: 'chk-securite', label: 'Sécurité de la salle et issues de secours dégagées' },
  { id: 'chk-materiel', label: 'Matériel vérifié, propre et mis à disposition' },
  { id: 'chk-climatisation', label: 'Aération ou climatisation réglée' },
];

const hhmm = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

export function KioskTabletShell() {
  const {
    employees,
    timeEntries,
    kioskOfflineMode,
    toggleKioskOfflineMode,
    createProspect,
    setShellMode,
    themeMode,
  } = useCfos();

  const isDark = themeMode === 'dark';

  // Session salarié nominative réelle sur borne partagée (sans repli sur employees[0])
  const [verifiedSession, setVerifiedSession] = useState<VerifiedKioskSession | null>(() =>
    getVerifiedKioskSession()
  );
  const [kioskLoginEmployeeId, setKioskLoginEmployeeId] = useState('');
  const [kioskLoginSecret, setKioskLoginSecret] = useState('');
  const [kioskAuthBusy, setKioskAuthBusy] = useState(false);
  const [kioskAuthError, setKioskAuthError] = useState<string | null>(null);

  const authenticatedEmployee = verifiedSession
    ? employees.find((e) => e.id === verifiedSession.actorId) ?? null
    : null;

  // État d'appairage matériel
  const [deviceToken, setDeviceToken] = useState<string | null>(() => getStoredTerminalToken());
  const [terminalInfo, setTerminalInfo] = useState<TerminalWhoAmI | null>(null);
  const [checkingTerminal, setCheckingTerminal] = useState<boolean>(Boolean(getStoredTerminalToken()));
  const [pairingTerminalId, setPairingTerminalId] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [pairingBusy, setPairingBusy] = useState(false);

  // Navigation mode kiosque
  const [mode, setMode] = useState<
    'POINTEUSE_RH' | 'SALLE_COURS' | 'VISITEUR_ESSAI' | 'GALERIE_PHOTOS'
  >('POINTEUSE_RH');
  const [pointageType, setPointageType] = useState<PointageType>('arrivee');
  const [punchBusy, setPunchBusy] = useState(false);

  // Galerie photo privée propriétaire sur tablette (#33)
  const [galleryPhotos, setGalleryPhotos] = useState<PunchPhotoMetadata[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [galleryDenied, setGalleryDenied] = useState(false);
  const [galleryBlobUrls, setGalleryBlobUrls] = useState<Record<string, string>>({});
  const galleryBlobUrlsRef = useRef<Record<string, string>>({});
  const [galleryBusyId, setGalleryBusyId] = useState<string | null>(null);
  const [galleryPurging, setGalleryPurging] = useState(false);

  // Capture webcam réelle (Lot P3)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturingPhoto, setCapturingPhoto] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<CapturedPhotoProof | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const startCamera = async () => {
    setCameraError(null);
    setStatusMessage(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("Votre navigateur ou appareil n'expose pas d'accès caméra (getUserMedia).");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      });
    } catch (err) {
      setCameraError(
        err instanceof Error
          ? `Accès caméra refusé ou indisponible : ${err.message}`
          : 'Impossible de démarrer la caméra.'
      );
    }
  };

  const handleCapturePhoto = async () => {
    if (!deviceToken || !videoRef.current) return;
    setCapturingPhoto(true);
    setCameraError(null);
    setStatusMessage(null);
    try {
      const video = videoRef.current;
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Contexte graphique indisponible.');
      ctx.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
      const proof = await captureTerminalPhoto(deviceToken, dataUrl);
      setCapturedPhoto(proof);
      setCapturedPreviewUrl(dataUrl);
      stopCamera();
      setStatusMessage({
        type: 'ok',
        text: `Preuve photo enregistrée sur le serveur (${Math.round(proof.byteSize / 1024)} Ko, valable 2 min).`,
      });
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Échec de capture photo.');
    } finally {
      setCapturingPhoto(false);
    }
  };

  // Mode Salle de cours (P2)
  const [occurrences, setOccurrences] = useState<RoomCourseOccurrence[]>([]);
  const [loadingOccurrences, setLoadingOccurrences] = useState(false);
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string>('');
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({
    'chk-sono': false,
    'chk-securite': false,
    'chk-materiel': false,
    'chk-climatisation': false,
  });
  const [courseNote, setCourseNote] = useState('');
  const [courseBusy, setCourseBusy] = useState(false);

  // Messages de retour
  const [statusMessage, setStatusMessage] = useState<{
    type: 'ok' | 'error';
    text: string;
  } | null>(null);

  // Formulaire visiteur
  const [vFirstName, setVFirstName] = useState('');
  const [vLastName, setVLastName] = useState('');
  const [vPhone, setVPhone] = useState('');
  const [vGoal, setVGoal] = useState('Séance découverte Musculation & Biocircuit');

  const resolvedClub: ClubId =
    terminalInfo?.siteId === 'club-beynost' ? 'beynost' : 'carre-de-soie';
  const effectivePhotoPolicy = resolveKioskPhotoPolicy(terminalInfo);

  const revokeKioskGalleryUrls = useCallback(() => {
    Object.values(galleryBlobUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    galleryBlobUrlsRef.current = {};
    setGalleryBlobUrls({});
  }, []);

  const purgeEmployeeWorkState = useCallback(() => {
    stopCamera();
    setCapturedPhoto(null);
    setCapturedPreviewUrl(null);
    setCameraError(null);
    revokeKioskGalleryUrls();
    setGalleryPhotos([]);
    setGalleryError(null);
    setGalleryDenied(false);
    setMode((prev) => (prev === 'GALERIE_PHOTOS' ? 'POINTEUSE_RH' : prev));
    setCheckedItems({
      'chk-sono': false,
      'chk-securite': false,
      'chk-materiel': false,
      'chk-climatisation': false,
    });
    setCourseNote('');
  }, [stopCamera, revokeKioskGalleryUrls]);

  useEffect(() => {
    return () => {
      revokeKioskGalleryUrls();
    };
  }, [revokeKioskGalleryUrls]);

  const loadKioskGallery = useCallback(async () => {
    if (!verifiedSession) {
      setGalleryPhotos([]);
      setGalleryDenied(false);
      return;
    }
    setGalleryLoading(true);
    setGalleryError(null);
    setGalleryDenied(false);
    try {
      const list = await fetchClubPunchPhotos(resolvedClub);
      setGalleryPhotos(list);
    } catch (err) {
      if (err instanceof TerminalAccessDenied) {
        setGalleryDenied(true);
        setGalleryPhotos([]);
        setGalleryError(err.message);
      } else {
        setGalleryError(
          err instanceof Error ? err.message : 'Impossible de charger la galerie photos.'
        );
      }
    } finally {
      setGalleryLoading(false);
    }
  }, [resolvedClub, verifiedSession]);

  useEffect(() => {
    if (mode === 'GALERIE_PHOTOS' && terminalInfo && verifiedSession) {
      void loadKioskGallery();
    }
  }, [mode, terminalInfo, verifiedSession, loadKioskGallery]);

  const handleViewKioskPhoto = async (photoId: string) => {
    setGalleryBusyId(photoId);
    setGalleryError(null);
    try {
      const blobUrl = await fetchPunchPhotoBlobUrl(resolvedClub, photoId);
      const prevUrl = galleryBlobUrlsRef.current[photoId];
      if (prevUrl) URL.revokeObjectURL(prevUrl);
      galleryBlobUrlsRef.current[photoId] = blobUrl;
      setGalleryBlobUrls((prev) => ({ ...prev, [photoId]: blobUrl }));
    } catch (err) {
      if (err instanceof TerminalAccessDenied) {
        setGalleryDenied(true);
        setGalleryPhotos([]);
      }
      setGalleryError(err instanceof Error ? err.message : "Impossible d'afficher cette photo.");
    } finally {
      setGalleryBusyId(null);
    }
  };

  const handleDeleteKioskPhoto = async (photoId: string) => {
    setGalleryBusyId(photoId);
    setGalleryError(null);
    setStatusMessage(null);
    try {
      await deleteClubPunchPhoto(resolvedClub, photoId);
      const prevUrl = galleryBlobUrlsRef.current[photoId];
      if (prevUrl) {
        URL.revokeObjectURL(prevUrl);
        delete galleryBlobUrlsRef.current[photoId];
      }
      setGalleryBlobUrls((prev) => {
        const next = { ...prev };
        delete next[photoId];
        return next;
      });
      setGalleryPhotos((prev) => prev.filter((p) => p.id !== photoId));
      setStatusMessage({
        type: 'ok',
        text: 'Preuve photo supprimée du serveur.',
      });
    } catch (err) {
      if (err instanceof TerminalAccessDenied) {
        setGalleryDenied(true);
        setGalleryPhotos([]);
      }
      setGalleryError(err instanceof Error ? err.message : 'Échec de suppression de la photo.');
    } finally {
      setGalleryBusyId(null);
    }
  };

  const handlePurgeKioskPhotos = async () => {
    setGalleryPurging(true);
    setGalleryError(null);
    setStatusMessage(null);
    try {
      const res = await purgeClubPunchPhotos(resolvedClub, 30);
      revokeKioskGalleryUrls();
      await loadKioskGallery();
      setStatusMessage({
        type: 'ok',
        text: `Purge terminée : ${res.removedCount} photo(s) supprimée(s) (rétention ${res.retentionDays}j).`,
      });
    } catch (err) {
      if (err instanceof TerminalAccessDenied) {
        setGalleryDenied(true);
        setGalleryPhotos([]);
      }
      setGalleryError(err instanceof Error ? err.message : 'Échec de la purge des photos.');
    } finally {
      setGalleryPurging(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncSession = () => {
      setVerifiedSession(getVerifiedKioskSession());
    };
    window.addEventListener('cfos-bearer-updated', syncSession);
    window.addEventListener('storage', syncSession);
    return () => {
      window.removeEventListener('cfos-bearer-updated', syncSession);
      window.removeEventListener('storage', syncSession);
    };
  }, []);

  useEffect(() => {
    purgeEmployeeWorkState();
  }, [verifiedSession?.actorId, purgeEmployeeWorkState]);

  useEffect(() => {
    if (effectivePhotoPolicy === 'disabled') {
      stopCamera();
      setCapturedPhoto(null);
      setCapturedPreviewUrl(null);
      setCameraError(null);
    }
  }, [effectivePhotoPolicy, stopCamera]);

  // Vérification initiale / périodique du jeton terminal
  const verifyTerminal = useCallback(async (token: string) => {
    setCheckingTerminal(true);
    try {
      const info = await fetchTerminalWhoAmI(token);
      setTerminalInfo(info);
    } catch (err) {
      if (err instanceof TerminalAccessDenied) {
        clearStoredTerminalToken();
        setDeviceToken(null);
        setTerminalInfo(null);
        setStatusMessage({
          type: 'error',
          text: err.message || 'Cet appareil a été révoqué ou déconnecté.',
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Erreur de vérification du terminal.',
        });
      }
    } finally {
      setCheckingTerminal(false);
    }
  }, []);

  useEffect(() => {
    if (deviceToken) {
      verifyTerminal(deviceToken);
    }
  }, [deviceToken, verifyTerminal]);

  // Chargement des cours de la salle quand on ouvre l'onglet SALLE_COURS
  const loadOccurrences = useCallback(async () => {
    if (!deviceToken) return;
    setLoadingOccurrences(true);
    try {
      const list = await fetchRoomOccurrences(deviceToken);
      setOccurrences(list);
      if (list.length > 0 && !selectedOccurrenceId) {
        setSelectedOccurrenceId(list[0].id);
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Impossible de charger les cours de la salle.',
      });
    } finally {
      setLoadingOccurrences(false);
    }
  }, [deviceToken, selectedOccurrenceId]);

  useEffect(() => {
    if (mode === 'SALLE_COURS' && deviceToken && terminalInfo) {
      loadOccurrences();
    }
  }, [mode, deviceToken, terminalInfo, loadOccurrences]);

  const handlePairSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    setPairingBusy(true);
    try {
      const paired = await pairTerminal(pairingTerminalId, pairingCode);
      setStoredTerminalToken(paired.deviceToken);
      setDeviceToken(paired.deviceToken);
      setTerminalInfo({
        terminalId: paired.terminalId,
        siteId: paired.siteId,
        roomId: paired.roomId,
        roomLabel: paired.roomLabel,
        label: paired.label,
        status: paired.status,
        photoPolicy: paired.photoPolicy,
        photoCaptureAvailable: paired.photoCaptureAvailable ?? false,
      });
      setPairingTerminalId('');
      setPairingCode('');
      setStatusMessage({
        type: 'ok',
        text: `Appareil « ${paired.label} » (${paired.roomLabel}) appairé avec succès.`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : "Échec d'appairage du terminal.",
      });
    } finally {
      setPairingBusy(false);
    }
  };

  const handleUnpair = () => {
    clearStoredTerminalToken();
    setDeviceToken(null);
    setTerminalInfo(null);
    setStatusMessage({
      type: 'ok',
      text: 'Jeton local effacé. Vous pouvez appairer un nouvel appareil.',
    });
  };

  const handleKioskEmployeeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setKioskAuthError(null);
    setStatusMessage(null);
    setKioskAuthBusy(true);
    try {
      const res = await authenticateKioskEmployee(kioskLoginEmployeeId, kioskLoginSecret);
      setVerifiedSession({ token: res.sessionToken, actorId: res.employeeId });
      setKioskLoginSecret('');
      setStatusMessage({
        type: 'ok',
        text: 'Session salarié authentifiée sur cette borne.',
      });
    } catch (err) {
      setKioskAuthError(
        err instanceof Error ? err.message : 'Identifiant ou code PIN/mot de passe invalide.'
      );
    } finally {
      setKioskAuthBusy(false);
    }
  };

  const handleKioskEmployeeLogout = async () => {
    await clearKioskEmployeeSession();
    setVerifiedSession(null);
    purgeEmployeeWorkState();
    setKioskLoginSecret('');
    setKioskAuthError(null);
    setStatusMessage({
      type: 'ok',
      text: 'Session salarié fermée. La borne est prête pour le collaborateur suivant.',
    });
  };

  const handleTerminalPunch = async () => {
    if (!deviceToken || !verifiedSession) return;
    if (effectivePhotoPolicy === 'required' && !capturedPhoto) {
      setStatusMessage({
        type: 'error',
        text: 'Une preuve photo est obligatoire avant de valider le pointage.',
      });
      return;
    }
    setStatusMessage(null);
    setPunchBusy(true);
    try {
      const res = await submitTerminalPunch(
        deviceToken,
        verifiedSession.actorId,
        pointageType,
        capturedPhoto?.photoId
      );
      setTerminalInfo((prev) =>
        prev
          ? {
              ...prev,
              photoPolicy: res.photoPolicy ?? prev.photoPolicy,
              photoCaptureAvailable: res.photoCaptureAvailable,
            }
          : prev
      );
      const actorDisplay = authenticatedEmployee
        ? `${authenticatedEmployee.firstName} ${authenticatedEmployee.lastName}`
        : verifiedSession.actorId;
      setStatusMessage({
        type: 'ok',
        text: `Pointage « ${formatPointageType(pointageType)} » confirmé pour ${actorDisplay} sur ${res.entry.roomLabel}${capturedPhoto ? ' (avec preuve photo)' : ''}.`,
      });
      setCapturedPhoto(null);
      setCapturedPreviewUrl(null);
      stopCamera();
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Pointage refusé.',
      });
    } finally {
      setPunchBusy(false);
    }
  };

  const handleCoursePresenceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceToken || !verifiedSession || !selectedOccurrenceId) return;
    setStatusMessage(null);
    setCourseBusy(true);
    try {
      const checklistAnswers = OFFICIAL_CHECKLIST.map((item) => ({
        itemId: item.id,
        label: item.label,
        checked: Boolean(checkedItems[item.id]),
      }));
      const res = await submitCoursePresence(deviceToken, {
        occurrenceId: selectedOccurrenceId,
        coachId: verifiedSession.actorId,
        idempotencyKey: `kiosk-${selectedOccurrenceId}-${verifiedSession.actorId}-${Date.now()}`,
        checklistAnswers,
        note: courseNote.trim() || undefined,
      });
      setStatusMessage({
        type: 'ok',
        text: res.attendance?.checklistCompleted
          ? 'Présence coach et checklist d’avant-cours validées avec succès.'
          : 'Présence coach enregistrée (checklist partielle).',
      });
      setCheckedItems({
        'chk-sono': false,
        'chk-securite': false,
        'chk-materiel': false,
        'chk-climatisation': false,
      });
      setCourseNote('');
      loadOccurrences();
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Validation de présence cours refusée.',
      });
    } finally {
      setCourseBusy(false);
    }
  };

  const handleVisitorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await createProspect({
      firstName: vFirstName,
      lastName: vLastName,
      phone: vPhone,
      email: '',
      clubId: resolvedClub,
      source: 'Tablette accueil',
      goal: vGoal,
      rgpdConsent: false,
    });

    if (!res.ok) {
      setStatusMessage({
        type: 'error',
        text: res.message,
      });
    } else {
      setStatusMessage({
        type: 'ok',
        text: `Bienvenue chez C.Fitness ${vFirstName} ! Votre demande de contact est enregistrée. Présentez-vous à l’accueil pour organiser votre séance.`,
      });
      setVFirstName('');
      setVLastName('');
      setVPhone('');
    }
  };

  return (
    <div
      className={`min-h-screen cfos-adaptive-shell flex flex-col justify-between p-4 sm:p-6 transition-colors duration-200 ${
        isDark ? 'cfos-dark bg-[#0F111A] text-white' : 'bg-[#EEF0F7] text-slate-900'
      }`}
    >
      {/* Top Kiosk Bar */}
      <header
        className={`flex flex-wrap items-center justify-between gap-3 pb-4 border-b ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShellMode('admin')}
            className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer border ${
              isDark
                ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-white'
                : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-800 shadow-xs'
            }`}
          >
            <ArrowLeft className="w-4 h-4 text-violet-400" />
            <span>Quitter Mode Kiosque</span>
          </button>

          <button
            onClick={() => setShellMode('employe')}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Tablet className="w-4 h-4" />
            <span>Ouvrir Mode Tablette (iPad) &amp; Téléphone</span>
          </button>

          <div>
            <div className="text-xs font-bold text-violet-400 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              {terminalInfo
                ? `Terminal Appairé · ${terminalInfo.label}`
                : 'Borne Tactile C.Fitness · En attente d’appairage'}
            </div>
            <div className="text-sm font-bold">
              {terminalInfo
                ? `${terminalInfo.siteId === 'club-beynost' ? 'C.Fitness Beynost' : 'C.Fitness Carré de Soie'} — ${terminalInfo.roomLabel}`
                : 'Saisissez un code d’appairage émis par un responsable'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ThemeColorControl variant="full" />

          <button
            onClick={() => toggleKioskOfflineMode(!kioskOfflineMode)}
            className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
              kioskOfflineMode
                ? 'bg-amber-600 text-white'
                : 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
            }`}
          >
            {kioskOfflineMode ? <WifiOff className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
            {kioskOfflineMode ? 'Mode Hors-Ligne' : 'Réseau En Ligne'}
          </button>

          {terminalInfo && (
            <button
              onClick={handleUnpair}
              className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer border ${
                isDark
                  ? 'bg-slate-800 hover:bg-rose-950/60 border-slate-700 text-rose-300'
                  : 'bg-white hover:bg-rose-50 border-slate-200 text-rose-600'
              }`}
              title="Dissocier ce navigateur du terminal"
            >
              <LogOut className="w-4 h-4" />
              <span>Désappairer</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center py-6">
        {checkingTerminal ? (
          <div className="text-sm font-semibold text-slate-400 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-violet-400" />
            Vérification de l&apos;identité du terminal auprès du serveur...
          </div>
        ) : !terminalInfo ? (
          /* ÉCRAN NON APPAIRÉ */
          <form
            onSubmit={handlePairSubmit}
            className={`w-full max-w-md border rounded-3xl p-6 space-y-5 ${
              isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-white border-slate-200 shadow-lg'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-violet-600/20 text-violet-400 flex items-center justify-center shrink-0">
                <KeyRound className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-lg font-bold">Appairer cette tablette</h1>
                <p className="text-xs text-slate-400">
                  Saisissez l&apos;identifiant et le code à 6 chiffres générés depuis RH → Terminaux.
                </p>
              </div>
            </div>

            {statusMessage && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  statusMessage.type === 'ok'
                    ? 'bg-emerald-950/90 border border-emerald-700 text-emerald-200'
                    : 'bg-rose-950/90 border border-rose-700 text-rose-200'
                }`}
              >
                {statusMessage.type === 'ok' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{statusMessage.text}</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-400 mb-1">
                  Identifiant du terminal *
                </label>
                <input
                  type="text"
                  required
                  value={pairingTerminalId}
                  onChange={(e) => setPairingTerminalId(e.target.value)}
                  placeholder="ex: term-123456789..."
                  className={`w-full px-3.5 py-3 rounded-xl border font-mono ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-400 mb-1">
                  Code d&apos;appairage (6 chiffres, valable 10 min) *
                </label>
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  maxLength={6}
                  value={pairingCode}
                  onChange={(e) => setPairingCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className={`w-full px-3.5 py-3 rounded-xl border font-mono text-center text-xl tracking-[0.4em] ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-violet-300'
                      : 'bg-slate-50 border-slate-200 text-violet-700'
                  }`}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={pairingBusy || pairingCode.length !== 6 || !pairingTerminalId.trim()}
              className="w-full min-h-[50px] rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-sm cursor-pointer transition-colors"
            >
              {pairingBusy ? 'Appairage en cours...' : 'Associer cet appareil au club'}
            </button>
          </form>
        ) : (
          /* ÉCRAN APPAIRÉ */
          <div className="w-full max-w-3xl space-y-5">
            {/* Mode Switcher */}
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={() => {
                  setMode('POINTEUSE_RH');
                  setStatusMessage(null);
                }}
                className={`min-h-[48px] px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer ${
                  mode === 'POINTEUSE_RH'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : isDark
                    ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Clock className="w-4 h-4" />
                Pointeuse RH
              </button>

              <button
                onClick={() => {
                  setMode('SALLE_COURS');
                  setStatusMessage(null);
                }}
                className={`min-h-[48px] px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer ${
                  mode === 'SALLE_COURS'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : isDark
                    ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <ClipboardCheck className="w-4 h-4" />
                Salle de cours &amp; Checklist
              </button>

              <button
                onClick={() => {
                  setMode('VISITEUR_ESSAI');
                  setStatusMessage(null);
                }}
                className={`min-h-[48px] px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer ${
                  mode === 'VISITEUR_ESSAI'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : isDark
                    ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                Accueil Visiteur
              </button>

              {verifiedSession && (
                <button
                  onClick={() => {
                    setMode('GALERIE_PHOTOS');
                    setStatusMessage(null);
                  }}
                  className={`min-h-[48px] px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer ${
                    mode === 'GALERIE_PHOTOS'
                      ? 'bg-violet-600 text-white shadow-sm'
                      : isDark
                      ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Images className="w-4 h-4" />
                  Galerie Photos (Propriétaire)
                </button>
              )}
            </div>

            {statusMessage && (
              <div
                className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2 ${
                  statusMessage.type === 'ok'
                    ? 'bg-emerald-950/90 border border-emerald-700 text-emerald-200'
                    : 'bg-rose-950/90 border border-rose-700 text-rose-200'
                }`}
              >
                {statusMessage.type === 'ok' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{statusMessage.text}</span>
              </div>
            )}

            {(mode === 'POINTEUSE_RH' || mode === 'SALLE_COURS' || mode === 'GALERIE_PHOTOS') && (
              <div
                className={`border rounded-3xl p-5 space-y-3 ${
                  isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-white border-slate-200 shadow-sm'
                }`}
              >
                {verifiedSession ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold uppercase text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Session salarié authentifiée
                      </div>
                      <div className="text-base font-bold">
                        {authenticatedEmployee
                          ? `${authenticatedEmployee.firstName} ${authenticatedEmployee.lastName}`
                          : verifiedSession.actorId}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleKioskEmployeeLogout}
                      className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border ${
                        isDark
                          ? 'bg-slate-900 hover:bg-rose-950/60 border-slate-700 text-rose-300'
                          : 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700'
                      }`}
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Fermer ma session (salarié suivant)
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleKioskEmployeeLogin} className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>Aucune session salarié authentifiée sur cette borne</span>
                      </div>
                    </div>
                    {kioskAuthError && (
                      <div className="p-2.5 rounded-xl bg-rose-950/90 border border-rose-700 text-rose-200 text-xs font-semibold">
                        {kioskAuthError}
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 text-xs">
                      <select
                        required
                        value={kioskLoginEmployeeId}
                        onChange={(e) => setKioskLoginEmployeeId(e.target.value)}
                        className={`sm:col-span-5 min-h-[44px] px-3 py-2 rounded-xl border font-semibold ${
                          isDark
                            ? 'bg-slate-900 border-slate-700 text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-900'
                        }`}
                      >
                        <option value="">-- Choisir votre nom --</option>
                        {employees
                          .filter((e) => e.role !== 'kiosque')
                          .map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.firstName} {e.lastName}
                            </option>
                          ))}
                      </select>
                      <input
                        type="password"
                        required
                        value={kioskLoginSecret}
                        onChange={(e) => setKioskLoginSecret(e.target.value)}
                        placeholder="Code PIN ou mot de passe"
                        className={`sm:col-span-4 min-h-[44px] px-3 py-2 rounded-xl border ${
                          isDark
                            ? 'bg-slate-900 border-slate-700 text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-900'
                        }`}
                      />
                      <button
                        type="submit"
                        disabled={kioskAuthBusy || !kioskLoginEmployeeId || !kioskLoginSecret}
                        className="sm:col-span-3 min-h-[44px] px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold cursor-pointer"
                      >
                        {kioskAuthBusy ? 'Connexion...' : "S'identifier"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {mode === 'POINTEUSE_RH' && (
              <div
                className={`border rounded-3xl p-6 space-y-5 ${
                  isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-white border-slate-200 shadow-lg'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold uppercase text-slate-400">
                    Politique photo de la borne
                  </div>
                  {effectivePhotoPolicy === 'disabled' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-slate-500/15 text-slate-400 border border-slate-500/30">
                      <CameraOff className="w-3.5 h-3.5" />
                      Capture photo désactivée pour ce club
                    </span>
                  )}
                  {effectivePhotoPolicy === 'required' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      <Camera className="w-3.5 h-3.5" />
                      Preuve photo obligatoire avant de valider le pointage
                    </span>
                  )}
                  {effectivePhotoPolicy === 'optional' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-violet-500/15 text-violet-300 border border-violet-500/30">
                      <Camera className="w-3.5 h-3.5" />
                      Preuve photo facultative (caméra prête à activer)
                    </span>
                  )}
                </div>

                {/* Bloc Capture Photo Matérielle (getUserMedia) — masqué si politique disabled */}
                {effectivePhotoPolicy !== 'disabled' && (
                  <div
                    className={`p-4 rounded-2xl border space-y-3 ${
                      isDark ? 'bg-slate-900/70 border-slate-700' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-violet-400" />
                      <span>Preuve photo au badgeage (caméra tablette)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!cameraActive && !capturedPhoto && (
                        <button
                          type="button"
                          onClick={startCamera}
                          className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold cursor-pointer"
                        >
                          Activer la caméra
                        </button>
                      )}
                      {cameraActive && (
                        <>
                          <button
                            type="button"
                            onClick={handleCapturePhoto}
                            disabled={capturingPhoto}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                          >
                            {capturingPhoto ? 'Envoi...' : 'Prendre la photo'}
                          </button>
                          <button
                            type="button"
                            onClick={stopCamera}
                            className="px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold cursor-pointer"
                          >
                            Couper
                          </button>
                        </>
                      )}
                      {capturedPhoto && (
                        <button
                          type="button"
                          onClick={() => {
                            setCapturedPhoto(null);
                            setCapturedPreviewUrl(null);
                            startCamera();
                          }}
                          className="px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold cursor-pointer"
                        >
                          Reprendre
                        </button>
                      )}
                    </div>
                  </div>

                  {cameraError && (
                    <div className="text-xs text-rose-400 font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{cameraError}</span>
                    </div>
                  )}

                  {cameraActive && (
                    <div className="overflow-hidden rounded-xl border border-slate-700 bg-black max-w-xs mx-auto">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-44 object-cover"
                      />
                    </div>
                  )}

                  {capturedPhoto && capturedPreviewUrl && (
                    <div className="flex items-center gap-3">
                      <img
                        src={capturedPreviewUrl}
                        alt="Aperçu preuve photo"
                        className="w-20 h-16 rounded-lg object-cover border border-emerald-500/60"
                      />
                      <div className="text-xs space-y-0.5">
                        <div className="font-bold text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Preuve photo prête ({Math.round(capturedPhoto.byteSize / 1024)} Ko)
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">
                          ID : {capturedPhoto.photoId.slice(0, 18)}…
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(
                    [
                      { id: 'arrivee', label: 'Arrivée prise de poste' },
                      { id: 'debut_pause', label: 'Début de pause' },
                      { id: 'fin_pause', label: 'Fin de pause' },
                      { id: 'depart', label: 'Départ fin de service' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setPointageType(item.id)}
                      className={`min-h-[54px] px-4 py-3 rounded-2xl text-left text-sm font-bold transition-colors cursor-pointer ${
                        pointageType === item.id
                          ? 'bg-violet-600 text-white'
                          : isDark
                          ? 'bg-slate-900/70 text-slate-300 hover:bg-slate-900'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleTerminalPunch}
                  disabled={
                    punchBusy ||
                    !verifiedSession ||
                    (effectivePhotoPolicy === 'required' && !capturedPhoto)
                  }
                  className="w-full min-h-[56px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-base cursor-pointer transition-colors"
                >
                  {punchBusy
                    ? 'Enregistrement serveur...'
                    : `Valider : ${formatPointageType(pointageType)}`}
                </button>
              </div>
            )}

            {mode === 'SALLE_COURS' && (
              <form
                onSubmit={handleCoursePresenceSubmit}
                className={`border rounded-3xl p-6 space-y-5 ${
                  isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-white border-slate-200 shadow-lg'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold">
                      Présence Coach &amp; Checklist — {terminalInfo.roomLabel}
                    </h2>
                    <p className="text-xs text-slate-400">
                      Fenêtre autorisée : 45 min avant à 30 min après le début de la séance.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={loadOccurrences}
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-700/50 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingOccurrences ? 'animate-spin' : ''}`} />
                    Actualiser
                  </button>
                </div>

                <div className="space-y-2 text-xs">
                  <label className="block font-semibold text-slate-400">
                    1. Sélectionner la séance en cours
                  </label>
                  {occurrences.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-slate-600 text-slate-400 text-center">
                      Aucune séance planifiée dans cette salle aujourd&apos;hui.
                    </div>
                  ) : (
                    <select
                      value={selectedOccurrenceId}
                      onChange={(e) => setSelectedOccurrenceId(e.target.value)}
                      className={`w-full min-h-[46px] px-3 py-2 rounded-xl border font-semibold ${
                        isDark
                          ? 'bg-slate-900 border-slate-700 text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-900'
                      }`}
                    >
                      {occurrences.map((occ) => (
                        <option key={occ.id} value={occ.id}>
                          {hhmm(occ.startTime)}–{hhmm(occ.endTime)} · {occ.courseTitle} ({occ.assignedCoachName})
                          {occ.isVerified ? ' ✓ Validé' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-400">
                    2. Checklist officielle d&apos;avant-cours
                  </div>
                  <div className="space-y-2">
                    {OFFICIAL_CHECKLIST.map((item) => (
                      <label
                        key={item.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer text-xs font-semibold ${
                          checkedItems[item.id]
                            ? 'border-emerald-500/60 bg-emerald-950/30'
                            : isDark
                            ? 'border-slate-700 bg-slate-900/50'
                            : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(checkedItems[item.id])}
                          onChange={(e) =>
                            setCheckedItems((prev) => ({
                              ...prev,
                              [item.id]: e.target.checked,
                            }))
                          }
                          className="w-4 h-4 accent-emerald-500"
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="text-xs">
                  <label className="block font-semibold text-slate-400 mb-1">
                    Observation éventuelle (facultatif)
                  </label>
                  <input
                    type="text"
                    value={courseNote}
                    onChange={(e) => setCourseNote(e.target.value)}
                    placeholder="Ex : Micro 2 en charge, RAS sur la salle"
                    className={`w-full px-3.5 py-2.5 rounded-xl border ${
                      isDark
                        ? 'bg-slate-900 border-slate-700 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={courseBusy || !selectedOccurrenceId || !verifiedSession}
                  className="w-full min-h-[52px] rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-sm cursor-pointer"
                >
                  {courseBusy ? 'Validation en cours...' : 'Confirmer présence coach & checklist'}
                </button>
              </form>
            )}

            {mode === 'VISITEUR_ESSAI' && (
              <form
                onSubmit={handleVisitorSubmit}
                className={`w-full max-w-lg mx-auto border rounded-3xl p-6 space-y-4 ${
                  isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-white border-slate-200 shadow-lg'
                }`}
              >
                <div>
                  <h2 className="text-lg font-bold">
                    Bienvenue chez C.Fitness{' '}
                    {resolvedClub === 'carre-de-soie' ? 'Carré de Soie' : 'Beynost'} !
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Enregistrez-vous en 15 secondes pour votre séance d&apos;essai ou votre rendez-vous découverte.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-400 mb-1">Prénom *</label>
                    <input
                      type="text"
                      required
                      value={vFirstName}
                      onChange={(e) => setVFirstName(e.target.value)}
                      placeholder="Votre prénom"
                      className={`w-full px-3.5 py-3 rounded-xl border ${
                        isDark
                          ? 'bg-slate-900 border-slate-700 text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-900'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-400 mb-1">Nom *</label>
                    <input
                      type="text"
                      required
                      value={vLastName}
                      onChange={(e) => setVLastName(e.target.value)}
                      placeholder="Votre nom"
                      className={`w-full px-3.5 py-3 rounded-xl border ${
                        isDark
                          ? 'bg-slate-900 border-slate-700 text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-900'
                      }`}
                    />
                  </div>
                </div>

                <div className="text-xs">
                  <label className="block font-semibold text-slate-400 mb-1">
                    Téléphone mobile (06 / 07) *
                  </label>
                  <input
                    type="text"
                    required
                    value={vPhone}
                    onChange={(e) => setVPhone(e.target.value)}
                    placeholder="06 12 34 56 78"
                    className={`w-full px-3.5 py-3 rounded-xl border font-mono ${
                      isDark
                        ? 'bg-slate-900 border-slate-700 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>

                <div className="text-xs">
                  <label className="block font-semibold text-slate-400 mb-1">
                    Votre objectif aujourd&apos;hui
                  </label>
                  <select
                    value={vGoal}
                    onChange={(e) => setVGoal(e.target.value)}
                    className={`w-full px-3.5 py-3 rounded-xl border ${
                      isDark
                        ? 'bg-slate-900 border-slate-700 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  >
                    <option value="Séance découverte Musculation & Biocircuit">
                      Séance découverte Musculation &amp; Biocircuit Technogym
                    </option>
                    <option value="Cours Collectifs & Cardio">Cours Collectifs &amp; Cardio</option>
                    <option value="Bilan Technogym Checkup & Coaching personnalisé">
                      Bilan Technogym Checkup (Wellness Age™) &amp; Coaching personnalisé
                    </option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full min-h-[52px] rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm cursor-pointer"
                >
                  Valider mon arrivée à l&apos;accueil
                </button>
              </form>
            )}
          </div>
        )}

        {mode === 'GALERIE_PHOTOS' && verifiedSession && (
          <div
            className={`border rounded-3xl p-6 space-y-4 ${
              isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-white border-slate-200 shadow-lg'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold flex items-center gap-2">
                  <Images className="w-4 h-4 text-violet-400" />
                  <span>Galerie privée des preuves photo ({galleryPhotos.length})</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Accès strictement réservé à la session nominative du propriétaire / super administrateur.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void loadKioskGallery()}
                  disabled={galleryLoading}
                  className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-700'
                      : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${galleryLoading ? 'animate-spin' : ''}`} />
                  Actualiser
                </button>
                <button
                  type="button"
                  onClick={() => void handlePurgeKioskPhotos()}
                  disabled={galleryPurging || galleryLoading || galleryDenied}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {galleryPurging ? 'Purge...' : 'Purger (> 30j)'}
                </button>
              </div>
            </div>

            {galleryDenied ? (
              <div className="p-4 rounded-2xl bg-rose-950/90 border border-rose-700 text-rose-200 text-xs font-semibold flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>
                  {galleryError ||
                    'Accès refusé : seule une session propriétaire / super administrateur peut consulter la galerie photo de ce club.'}
                </span>
              </div>
            ) : (
              <>
                {galleryError && (
                  <div className="p-3 rounded-2xl bg-rose-950/90 border border-rose-700 text-rose-200 text-xs font-semibold">
                    {galleryError}
                  </div>
                )}

                {galleryLoading ? (
                  <div className="text-xs text-slate-400 py-4">
                    Chargement de la galerie privée...
                  </div>
                ) : galleryPhotos.length === 0 ? (
                  <div className="text-xs text-slate-400 italic py-4">
                    Aucune photo de pointage enregistrée pour ce club.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {galleryPhotos.map((photo) => {
                      const blobUrl = galleryBlobUrls[photo.id];
                      const isBusy = galleryBusyId === photo.id;
                      return (
                        <div
                          key={photo.id}
                          className={`p-3.5 rounded-2xl border space-y-2.5 text-xs ${
                            isDark
                              ? 'bg-slate-900/70 border-slate-700'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-0.5">
                              <div className="font-bold text-sm">
                                {photo.employeeName || photo.employeeId}
                              </div>
                              <div className="text-slate-400">
                                {photo.terminalLabel || photo.terminalId} ·{' '}
                                {new Date(photo.capturedAt).toLocaleString('fr-FR', {
                                  timeZone: 'Europe/Paris',
                                })}
                              </div>
                              <div className="text-slate-400">
                                {Math.max(1, Math.round(photo.byteSize / 1024))} Ko ·{' '}
                                {photo.consumedAt ? 'Consommée au pointage' : 'En attente / expirée'}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleViewKioskPhoto(photo.id)}
                                className="px-3 py-1.5 rounded-xl font-bold bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white cursor-pointer"
                              >
                                {blobUrl ? 'Recharger' : 'Afficher'}
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleDeleteKioskPhoto(photo.id)}
                                className="px-3 py-1.5 rounded-xl font-bold bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white cursor-pointer flex items-center gap-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Supprimer
                              </button>
                            </div>
                          </div>
                          {blobUrl && (
                            <img
                              src={blobUrl}
                              alt={`Preuve photo ${photo.employeeName || photo.employeeId}`}
                              className="w-full max-h-56 object-contain rounded-xl border border-slate-700 bg-black/90"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* Footer Recent Pointages */}
      <footer
        className={`pt-4 border-t flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}
      >
        <div>
          Derniers pointages enregistrés :{' '}
          {timeEntries.slice(0, 3).map((p) => {
            const emp = employees.find((e) => e.id === p.employeeId);
            return (
              <span key={p.id} className="mr-3 font-medium">
                {emp ? `${emp.firstName} ${emp.lastName}` : p.employeeId} (
                {formatPointageType(p.type)})
              </span>
            );
          })}
        </div>
        <div className="font-mono text-[11px]">
          Kiosque C.Fitness OS v2.0 · Double identité Serveur + Terminal
        </div>
      </footer>
    </div>
  );
}
