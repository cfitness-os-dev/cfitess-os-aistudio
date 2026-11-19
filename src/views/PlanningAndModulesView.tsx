import {
  AlertTriangle,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  Compass,
  Database,
  Download,
  Edit3,
  Euro,
  ExternalLink,
  EyeOff,
  FileText,
  Filter,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  Lock,
  Megaphone,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  UserPlus,
  Users,
  X,
  ZoomIn,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useCfos } from '../context/CfosContext';
import { cleanUiTree } from '../domain/cleanModeSanitizer';
import type { DashboardPayload } from '../domain/apiEngine';
import {
  ApiClientError,
  clientApi,
  type ApiAuthContext,
  type RegistryPayload,
} from '../domain/clientApi';
import {
  ADMIN_CAPTURES,
  ADMIN_OBSERVATIONS_SUMMARY,
  CLIENT_HTML_DELIVERABLES,
  CLUB_COMPARISON,
  CONTRACTS_COUNTERS_V116,
  DELIVERY_VERIFICATION_V116,
  DOCUMENTARY_RECETTE_V116,
  EMULATION_CAPTURES,
  EMULATION_META,
  HISTORICAL_PLANS,
  PARTNER_CATALOGUES,
  SIGNATURES_JOURNAL_V116,
  type AbsenceMotiveState,
  type AlertConfigItem,
  type AnnualAbsenceOption,
  type AtlasEntriesPayload,
  type ReportRuleGroup,
  type SmartPlannerRuleState,
} from '../domain/clientReferencesData';
import { computeShiftNetMinutes, formatMinutesAsHours } from '../domain/rbac';
import type {
  AmbiguityRecord,
  LeaveRequest,
  McSectionId,
  Shift,
  SiteHrSettings,
} from '../domain/types';

interface PlanningAndModulesViewProps {
  mode: 'planning' | 'blueprint' | 'traceability';
  activeSection: McSectionId;
  auth: ApiAuthContext;
  dashboard: DashboardPayload;
  registry: RegistryPayload;
  ambiguities: AmbiguityRecord[];
  onRefreshDashboard: () => Promise<void>;
}

interface RhDocumentItem {
  id: string;
  title: string;
  folder: 'Contrats' | 'Bulletins de paie' | 'Justificatifs' | 'Chartes Club';
  employeeName: string;
  siteName: string;
  date: string;
  signatureStatus: 'signed' | 'pending' | 'error';
}

interface MissionItem {
  id: string;
  siteId: string;
  title: string;
  budgetHours: number;
  loggedHours: number;
  hourlyBudgetEur: number;
  status: 'active' | 'done';
}

interface CommunicationLogItem {
  id: string;
  date: string;
  channel: string;
  audience: string;
  subject: string;
  recipientCount: number;
}

interface RecruitmentOffer {
  id: string;
  title: string;
  siteName: string;
  contractType: string;
  candidatesCount: number;
  stage: 'Ouverte' | 'Entretiens' | 'Pourvue';
}

const INITIAL_DOCS: RhDocumentItem[] = [
  {
    id: 'doc-01',
    title: 'CDI Temps Plein — Coach Sportif (V2)',
    folder: 'Contrats',
    employeeName: 'Sophie Laurent',
    siteName: 'C.FITNESS Carré de Soie',
    date: '2025-09-01',
    signatureStatus: 'signed',
  },
  {
    id: 'doc-02',
    title: 'Avenant Multi-sites (Beynost secondaire)',
    folder: 'Contrats',
    employeeName: 'Thomas Girard',
    siteName: 'Carré de Soie & Beynost',
    date: '2026-10-15',
    signatureStatus: 'pending',
  },
  {
    id: 'doc-03',
    title: 'Attestation mutuelle & RIB manquants — Relance',
    folder: 'Justificatifs',
    employeeName: 'Julie Roux',
    siteName: 'C.FITNESS Carré de Soie',
    date: '2026-11-10',
    signatureStatus: 'error',
  },
  {
    id: 'doc-04',
    title: 'Bulletin de paie — Octobre 2026',
    folder: 'Bulletins de paie',
    employeeName: 'Nadia Moreau',
    siteName: 'C.FITNESS Carré de Soie',
    date: '2026-11-02',
    signatureStatus: 'signed',
  },
  {
    id: 'doc-05',
    title: 'Charte sécurité & ouverture club 06h00',
    folder: 'Chartes Club',
    employeeName: 'Lucas Bernard',
    siteName: 'C.FITNESS Beynost',
    date: '2026-09-20',
    signatureStatus: 'pending',
  },
];

const INITIAL_MISSIONS: MissionItem[] = [
  {
    id: 'mis-01',
    siteId: 'club-beynost',
    title: 'Audit matériel cardio & maintenance trimestrielle',
    budgetHours: 18,
    loggedHours: 12,
    hourlyBudgetEur: 28,
    status: 'active',
  },
  {
    id: 'mis-02',
    siteId: 'club-beynost',
    title: 'Journée Portes Ouvertes Automne — Accueil & Bilans',
    budgetHours: 24,
    loggedHours: 24,
    hourlyBudgetEur: 24,
    status: 'done',
  },
  {
    id: 'mis-03',
    siteId: 'club-carre-soie',
    title: 'Refonte planning cours collectifs LesMills Q4',
    budgetHours: 14,
    loggedHours: 8,
    hourlyBudgetEur: 32,
    status: 'active',
  },
];

const INITIAL_CONNECTORS = [
  { id: 'INT02', name: 'Paie Silae / PayFit / ADP', category: 'Paie', status: 'sandbox' as const },
  { id: 'INT03', name: 'SIRH & Coffre-fort numérique', category: 'SIRH', status: 'sandbox' as const },
  { id: 'INT04', name: 'Caisse club & contrôle d’accès Resamania', category: 'Caisse / CA', status: 'connected' as const },
  { id: 'INT05', name: 'Connecteur BI & Tableaux de bord direction', category: 'BI', status: 'disconnected' as const },
  { id: 'INT06', name: 'Service d’acompte sur salaire', category: 'Acomptes', status: 'disconnected' as const },
];

const INITIAL_OFFERS: RecruitmentOffer[] = [
  {
    id: 'rec-01',
    title: 'Coach Sportif Diplômé d’État (BPJEPS AF)',
    siteName: 'C.FITNESS Carré de Soie',
    contractType: 'CDI 35h',
    candidatesCount: 7,
    stage: 'Entretiens',
  },
  {
    id: 'rec-02',
    title: 'Hôte / Hôtesse d’accueil polyvalent(e)',
    siteName: 'C.FITNESS Beynost',
    contractType: 'CDD 24h',
    candidatesCount: 4,
    stage: 'Ouverte',
  },
];

interface SignatureTrackingRow {
  id: string;
  signatory: string;
  document: string;
  folder: (typeof SIGNATURES_JOURNAL_V116.signature_folder_choices)[number];
  signatureProgress: string;
  status: (typeof SIGNATURES_JOURNAL_V116.signature_status_choices)[number];
  sentDate: string;
  lastReminder: string;
}

interface ImageZoomPayload {
  url: string;
  title: string;
  subtitle: string;
  sha256?: string;
  dimensions?: string;
}

const DOC_TEMPLATE_MODELS = [
  {
    id: 'tpl-01',
    title: 'CDI Temps Plein — IDCC 2511 Sport',
    date: '2026-10-12',
    author: 'Nadia Moreau',
    selectable: true,
    note: 'Modèle actif prêt pour fusion variables EDI02.',
  },
  {
    id: 'tpl-02',
    title: 'Avenant multi-sites Carré de Soie / Beynost',
    date: '2026-10-20',
    author: 'Karim Haddad',
    selectable: true,
    note: 'Inclut clause établissement secondaire.',
  },
  {
    id: 'tpl-03',
    title: 'Attestation remise badge & charte club',
    date: '2026-11-01',
    author: 'Nadia Moreau',
    selectable: true,
    note: 'Signature simple collaborateur (1/1).',
  },
  {
    id: 'tpl-04',
    title: 'Modèle hérité archive 2024 (variable obsolète)',
    date: '2024-05-14',
    author: 'Système',
    selectable: false,
    note: 'Visuellement grisé avec indicateur rouge (cause non qualifiée — ADM14-D01).',
  },
  {
    id: 'tpl-05',
    title: 'Contrat Extra verrouillé (à vérifier)',
    date: '2025-03-02',
    author: 'Système',
    selectable: false,
    note: 'Visuellement grisé avec indicateur rouge (cause non qualifiée — ADM14-D01).',
  },
];

const INITIAL_SIGNATURE_ROWS: SignatureTrackingRow[] = [
  {
    id: 'sig-01',
    signatory: 'Julie Roux (FICT-007)',
    document: 'Avenant horaire Accueil CS (Fictif)',
    folder: 'Contrats',
    signatureProgress: '0/1',
    status: 'Erreur d’envoi',
    sentDate: '2026-11-10',
    lastReminder: 'Jamais relancé',
  },
  {
    id: 'sig-02',
    signatory: 'Thomas Girard (FICT-006)',
    document: 'Attestation mutuelle obligatoire (Fictif)',
    folder: 'Sécu soc. & Mutuelle',
    signatureProgress: '0/1',
    status: 'Erreur d’envoi',
    sentDate: '2026-11-11',
    lastReminder: '2026-11-12',
  },
  {
    id: 'sig-03',
    signatory: 'Lucas Bernard (FICT-004)',
    document: 'Feuille d’heures S45 Beynost (Fictif)',
    folder: 'Feuilles d’heures',
    signatureProgress: '0/1',
    status: 'En cours de signature',
    sentDate: '2026-11-12',
    lastReminder: '2026-11-13',
  },
  {
    id: 'sig-04',
    signatory: 'Sophie Laurent (FICT-003)',
    document: 'Charte sécurité coaching plateau (Fictif)',
    folder: 'Justificatifs',
    signatureProgress: '1/1',
    status: 'Signé',
    sentDate: '2026-11-05',
    lastReminder: 'Signé le 2026-11-06',
  },
  {
    id: 'sig-05',
    signatory: 'Karim Haddad (FICT-002)',
    document: 'Feuille d’heures S44 Beynost (Fictif)',
    folder: 'Feuilles d’heures',
    signatureProgress: '1/1',
    status: 'Signé',
    sentDate: '2026-11-03',
    lastReminder: 'Signé le 2026-11-04',
  },
];

const TEMPLATE_VARIABLES = [
  '{{employe.prenom}}',
  '{{employe.nom}}',
  '{{employe.matricule}}',
  '{{contrat.type}}',
  '{{contrat.heures_hebdo}}',
  '{{club.nom}}',
  '{{club.siret}}',
  '{{date.effet}}',
];

function formatEur(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'Non renseigné';
  return `${val.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
}

export function PlanningAndModulesView({
  mode,
  activeSection,
  auth,
  dashboard,
  registry,
  ambiguities,
  onRefreshDashboard,
}: PlanningAndModulesViewProps) {
  const { isTechnicalMode, addStaffEmployee, employees: staffEmployees } = useCfos();
  const can = (actionId: string) =>
    Boolean(dashboard.session.resolvedPermissions[actionId]?.allowed);

  const [moduleFeedback, setModuleFeedback] = useState<{
    kind: 'ok' | 'err';
    text: string;
  } | null>(null);

  // MC03 Planning
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [shiftStart, setShiftStart] = useState('');
  const [shiftEnd, setShiftEnd] = useState('');
  const [shiftBreak, setShiftBreak] = useState(30);
  const [shiftFeedback, setShiftFeedback] = useState<{
    kind: 'ok' | 'err';
    text: string;
  } | null>(null);

  // Références client V1.16 : Zoom images & chargement à la demande des 1 605 entrées
  const [atlasPayload, setAtlasPayload] = useState<AtlasEntriesPayload | null>(null);
  const [atlasLoading, setAtlasLoading] = useState(false);
  const [atlasError, setAtlasError] = useState<string | null>(null);
  const [expandedScreenId, setExpandedScreenId] = useState<string | null>(null);
  const [atlasLimit, setAtlasLimit] = useState(120);
  const [zoomImage, setZoomImage] = useState<ImageZoomPayload | null>(null);

  async function loadAtlasEntries() {
    if (atlasPayload || atlasLoading) return;
    setAtlasLoading(true);
    setAtlasError(null);
    try {
      const resp = await fetch('/references/atlas_1605_entries.json');
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as AtlasEntriesPayload;
      setAtlasPayload(data);
    } catch (err) {
      setAtlasError(`Impossible de charger atlas_1605_entries.json (${String(err)})`);
    } finally {
      setAtlasLoading(false);
    }
  }

  useEffect(() => {
    if (mode === 'traceability' && !atlasPayload && !atlasLoading) {
      void loadAtlasEntries();
    }
  }, [mode, atlasPayload, atlasLoading]);

  // Traçabilité (/tracabilite — 5 onglets complets V1.16)
  const [traceTab, setTraceTab] = useState<
    'registry' | 'gallery' | 'recette' | 'deliverables' | 'verification'
  >('registry');
  const [traceRegistrySubTab, setTraceRegistrySubTab] = useState<
    'screens' | 'entries' | 'actions' | 'entities' | 'complements'
  >('screens');
  const [traceFilter, setTraceFilter] = useState('');
  const [galleryCategory, setGalleryCategory] = useState<
    'all' | 'admin' | 'emulation' | 'plans'
  >('all');
  const [galleryFilter, setGalleryFilter] = useState('');
  const [activeClientDocUrl, setActiveClientDocUrl] = useState<string>(
    CLIENT_HTML_DELIVERABLES[0].url
  );

  // MC02 Dossier salarié & compteurs (ADM14-01..05)
  const [selectedEmpId, setSelectedEmpId] = useState<string>(
    dashboard.session.employee.id
  );
  const [mc02Tab, setMc02Tab] = useState<'identity' | 'contract' | 'counters'>('identity');
  const [mc02ContractSubTab, setMc02ContractSubTab] = useState<
    'current' | 'history' | 'upcoming'
  >('current');
  const [simulateNoCurrentContract, setSimulateNoCurrentContract] = useState(false);
  const [pastContractMenuOpen, setPastContractMenuOpen] = useState(false);
  const [pastContractFormOpen, setPastContractFormOpen] = useState(false);
  const [mc02CounterSubTab, setMc02CounterSubTab] = useState<
    'forfait' | 'history' | 'cp' | 'rtt'
  >('forfait');
  const [simulateRttUninitialized, setSimulateRttUninitialized] = useState(false);
  const [showAddEmpForm, setShowAddEmpForm] = useState(false);
  const [newEmpFirst, setNewEmpFirst] = useState('');
  const [newEmpLast, setNewEmpLast] = useState('');
  const [newEmpContract, setNewEmpContract] = useState<'CDI' | 'CDD'>('CDI');
  const [newEmpHours, setNewEmpHours] = useState(35);
  const [createdEmployees, setCreatedEmployees] = useState<
    Array<{ id: string; name: string; contract: string; hours: number; site: string }>
  >([]);
  const [rttInitializedIds, setRttInitializedIds] = useState<Record<string, number>>({});

  useEffect(() => {
    const stillVisible = dashboard.visibleEmployees.some(
      (e) => e.id === selectedEmpId
    );
    if (!stillVisible) {
      setSelectedEmpId(dashboard.session.employee.id);
    }
  }, [dashboard.visibleEmployees, dashboard.session.employee.id, selectedEmpId]);

  // MC04 Demandes & disponibilités
  const [reqMotive, setReqMotive] = useState('Congés payés');
  const [reqStart, setReqStart] = useState('2026-12-07');
  const [reqEnd, setReqEnd] = useState('2026-12-09');
  const [reqComment, setReqComment] = useState('');
  const [reqConflictSim, setReqConflictSim] = useState(false);
  const [localRequests, setLocalRequests] = useState<LeaveRequest[]>([]);
  const [requestStatusOverrides, setRequestStatusOverrides] = useState<
    Record<string, LeaveRequest['status']>
  >({});
  const [weeklyAvailability, setWeeklyAvailability] = useState<
    Record<string, 'Disponible' | 'Indisponible' | 'Préférence matin'>
  >({
    Lun: 'Disponible',
    Mar: 'Disponible',
    Mer: 'Préférence matin',
    Jeu: 'Disponible',
    Ven: 'Disponible',
    Sam: 'Indisponible',
    Dim: 'Indisponible',
  });

  // MC05 Temps, Pointeuse & Tâches
  const [clockLog, setClockLog] = useState<
    Array<{ id: string; time: string; action: string; club: string }>
  >([
    {
      id: 'clk-1',
      time: '08:58',
      action: 'Arrivée badgée (tablette accueil)',
      club: 'C.FITNESS Carré de Soie',
    },
  ]);
  const [completedTasks, setCompletedTasks] = useState<Record<string, boolean>>({});
  const [customTasks, setCustomTasks] = useState<
    Array<{ id: string; label: string; shiftRef: string }>
  >([]);
  const [newTaskLabel, setNewTaskLabel] = useState('');
  const [anomalyOverrides, setAnomalyOverrides] = useState<
    Record<string, { status: 'validated' | 'ignored'; note: string } | undefined>
  >({});
  const [anomalyNoteInput, setAnomalyNoteInput] = useState('Écart validé par responsable');
  const [simulateBeynostEmptyBadgeHistory, setSimulateBeynostEmptyBadgeHistory] =
    useState(false);

  // MC06 Documents & Signatures (ADM14-D01..D04)
  const [docs, setDocs] = useState<RhDocumentItem[]>(INITIAL_DOCS);
  const [docFolderFilter, setDocFolderFilter] = useState<string>('Tous');
  const [docStatusFilter, setDocStatusFilter] = useState<string>('Tous');
  const [docSearch, setDocSearch] = useState('');
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocFolder, setNewDocFolder] =
    useState<RhDocumentItem['folder']>('Contrats');
  const [previewDoc, setPreviewDoc] = useState<RhDocumentItem | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [sigRows, setSigRows] = useState<SignatureTrackingRow[]>(INITIAL_SIGNATURE_ROWS);
  const [sigDraftSearch, setSigDraftSearch] = useState('');
  const [sigDraftRecipient, setSigDraftRecipient] = useState('Tous');
  const [sigDraftFolders, setSigDraftFolders] = useState<string[]>([]);
  const [sigDraftStatuses, setSigDraftStatuses] = useState<string[]>([]);
  const [sigAppliedSearch, setSigAppliedSearch] = useState('');
  const [sigAppliedRecipient, setSigAppliedRecipient] = useState('Tous');
  const [sigAppliedFolders, setSigAppliedFolders] = useState<string[]>([]);
  const [sigAppliedStatuses, setSigAppliedStatuses] = useState<string[]>([]);
  const [openSigMenuRowId, setOpenSigMenuRowId] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState(
    'Contrat {{contrat.type}} conclu pour {{employe.prenom}} {{employe.nom}} ({{employe.matricule}}) sur le club {{club.nom}} à compter du {{date.effet}}.'
  );

  // MC07 Finances & Paie
  const [payrollExtras, setPayrollExtras] = useState<
    Array<{
      id: string;
      employeeId: string;
      employeeName: string;
      kind: 'Prime' | 'Avance' | 'Indemnité repas';
      amountEur: number;
      comment: string;
    }>
  >([
    {
      id: 'ext-1',
      employeeId: 'emp-planif-av',
      employeeName: 'Sophie Laurent',
      kind: 'Prime',
      amountEur: 180,
      comment: 'Challenge coaching collectif novembre',
    },
  ]);
  const [extraEmpId, setExtraEmpId] = useState('emp-admin');
  const [extraKind, setExtraKind] = useState<'Prime' | 'Avance' | 'Indemnité repas'>(
    'Prime'
  );
  const [extraAmount, setExtraAmount] = useState(120);
  const [extraComment, setExtraComment] = useState('');
  const [annualizationDelta, setAnnualizationDelta] = useState<Record<string, number>>(
    {}
  );

  // MC08 Rapports, Pilotage & Missions
  const [pilotHorizon, setPilotHorizon] = useState<'3m' | '13m'>('3m');
  const [missions, setMissions] = useState<MissionItem[]>(INITIAL_MISSIONS);
  const [missionStatusFilter, setMissionStatusFilter] = useState<'all' | 'active' | 'done'>('all');
  const [newMissionTitle, setNewMissionTitle] = useState('');
  const [newMissionHours, setNewMissionHours] = useState(12);

  // MC09 Marketing & Communication RH
  const [commAudience, setCommAudience] = useState('Tous les collaborateurs visibles');
  const [commChannel, setCommChannel] = useState('E-mail + Notification CFitness OS');
  const [commSubject, setCommSubject] = useState('');
  const [commBody, setCommBody] = useState('');
  const [commLogs, setCommLogs] = useState<CommunicationLogItem[]>([
    {
      id: 'com-1',
      date: '2026-11-12 09:15',
      channel: 'E-mail RH',
      audience: 'Équipe Carré de Soie',
      subject: 'Publication planning S47 et rappel pointage pause',
      recipientCount: 5,
    },
  ]);

  // MC10 Paramètres RH
  const [mc10ParamOverrides, setMc10ParamOverrides] = useState<
    Record<string, { dailyRestHours?: number; maxWeeklyHours?: number; breakThresholdMin?: number }>
  >(() => {
    try {
      const raw = localStorage.getItem('cfos_mc10_overrides_v1');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [paramSiteId, setParamSiteId] = useState<string>(
    auth.siteId !== 'all' ? auth.siteId : (dashboard.sites[0]?.id ?? 'club-carre-soie')
  );
  useEffect(() => {
    if (auth.siteId !== 'all' && dashboard.sites.some((s) => s.id === auth.siteId)) {
      setParamSiteId(auth.siteId);
    }
  }, [auth.siteId, dashboard.sites]);
  const [mc10SubTab, setMc10SubTab] = useState<
    'base' | 'counters' | 'absences' | 'alerts_planner'
  >('base');
  const [absenceMotiveSearch, setAbsenceMotiveSearch] = useState('');
  const [siteSettingsOverrides, setSiteSettingsOverrides] = useState<
    Record<string, Partial<SiteHrSettings>>
  >({});
  const [extraPositions, setExtraPositions] = useState<
    Array<{ id: string; siteId: string; label: string; breakMin: number }>
  >([]);
  const [newPosLabel, setNewPosLabel] = useState('');

  // MC12 Intégrations & Recrutement
  const [connectors, setConnectors] = useState(INITIAL_CONNECTORS);
  const [offers, setOffers] = useState(INITIAL_OFFERS);
  const [mc12CategoryTab, setMc12CategoryTab] = useState<
    'caisse' | 'paie' | 'sirh' | 'analyse' | 'recrutement' | 'acompte'
  >('caisse');
  const [apiAnalyticsToggles, setApiAnalyticsToggles] = useState<Record<string, boolean>>({
    Dvore: false,
    Yokitup: false,
    GoTenzo: false,
  });

  function openEditModal(sh: Shift) {
    setShiftFeedback(null);
    setEditingShift(sh);
    setShiftStart(sh.startTime);
    setShiftEnd(sh.endTime);
    setShiftBreak(sh.breakMinutes);
  }

  async function handleSaveShift() {
    if (!editingShift) return;
    setShiftFeedback(null);
    try {
      const updated = await clientApi.updateShift(auth, editingShift.id, {
        startTime: shiftStart,
        endTime: shiftEnd,
        breakMinutes: shiftBreak,
      });
      setEditingShift(null);
      await onRefreshDashboard();
      setShiftFeedback({
        kind: 'ok',
        text: `Shift ${updated.id} mis à jour (${updated.startTime}–${updated.endTime}, pause ${updated.breakMinutes}m) et audité dans JOU01.`,
      });
    } catch (e) {
      const msg =
        e instanceof ApiClientError
          ? `HTTP ${e.status} — ${e.message}`
          : String(e);
      setShiftFeedback({ kind: 'err', text: msg });
    }
  }

  const renderZoomModal = (): ReactNode =>
    zoomImage ? (
      <div
        className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm p-4 flex items-center justify-center"
        onClick={() => setZoomImage(null)}
      >
        <div
          className="cf-card max-w-6xl w-full max-h-[92vh] flex flex-col p-4 space-y-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-sm">{zoomImage.title}</h3>
              <p className="text-xs cf-muted">{zoomImage.subtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => setZoomImage(null)}
              className="cf-card-secondary px-2.5 py-1.5 text-xs flex items-center gap-1"
            >
              <X className="w-4 h-4" />
              Fermer
            </button>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center bg-black/50 rounded border border-[var(--cf-border)] p-2">
            <img
              src={zoomImage.url}
              alt={zoomImage.title}
              className="max-h-[70vh] w-auto object-contain rounded"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] cf-mono cf-muted">
            <span>
              Dimensions : {zoomImage.dimensions ?? 'n/a'} • SHA-256 :{' '}
              {zoomImage.sha256 ? `${zoomImage.sha256.slice(0, 16)}…` : 'n/a'}
            </span>
            <a
              href={zoomImage.url}
              target="_blank"
              rel="noreferrer"
              className="text-violet-300 hover:underline flex items-center gap-1"
            >
              Ouvrir l’image originale
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    ) : null;

  const renderSourceDrawer = (sectionId: McSectionId = activeSection): ReactNode => {
    if (!isTechnicalMode) return null;
    const sectionScreens = registry.screens.filter((s) => s.sectionId === sectionId);
    const sectionScreenIds = new Set(sectionScreens.map((s) => s.id));
    const sectionCaptures = ADMIN_CAPTURES.filter((cap) =>
      cap.source_screen_ids.some((id) => sectionScreenIds.has(id))
    );

    return (
      <details className="cf-card p-4 text-xs">
        <summary className="cursor-pointer font-semibold flex items-center justify-between text-violet-300">
          <span className="flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Traçabilité V1.16 — {sectionScreens.length} écran(s) source sur {sectionId} •{' '}
            {sectionCaptures.length} capture(s) réelle(s)
          </span>
          <span className="cf-mono text-[10px] cf-muted">TST39 • V1.16</span>
        </summary>
        <div className="grid grid-cols-1 gap-3 mt-3">
          {sectionScreens.map((sc) => {
            const screenCaps = ADMIN_CAPTURES.filter((c) =>
              c.source_screen_ids.includes(sc.id)
            );
            const isExpanded = expandedScreenId === sc.id;
            const contractData = atlasPayload?.contracts.find(
              (c) => c.source_screen_id === sc.id || c.contract_id === sc.contractId
            );

            return (
              <div key={sc.id} className="cf-card-secondary p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="cf-mono text-violet-300 font-semibold mr-2">
                      {sc.id}
                    </span>
                    <span className="font-medium">{sc.title}</span>
                    <span className="cf-mono text-[10px] cf-muted ml-2">
                      Contrat : {sc.contractId} • {sc.entryCount} entrées
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (isExpanded) {
                        setExpandedScreenId(null);
                      } else {
                        setExpandedScreenId(sc.id);
                        void loadAtlasEntries();
                      }
                    }}
                    className="cf-card px-2.5 py-1 text-[11px] flex items-center gap-1.5 hover:border-violet-500/60"
                  >
                    <Database className="w-3.5 h-3.5 text-cyan-300" />
                    {isExpanded
                      ? 'Masquer les entrées'
                      : `Voir les ${sc.entryCount} entrées (atlas)`}
                  </button>
                </div>

                {screenCaps.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {screenCaps.map((cap) => (
                      <button
                        key={cap.id}
                        type="button"
                        onClick={() =>
                          setZoomImage({
                            url: cap.url,
                            title: `${cap.id} — ${cap.title}`,
                            subtitle: `${cap.site_context} · ${cap.profile} · ${cap.date} · ${cap.kind}`,
                            sha256: cap.sha256,
                            dimensions: `${cap.width}×${cap.height}`,
                          })
                        }
                        className="text-left cf-card p-1.5 hover:border-violet-500/60 space-y-1 group"
                      >
                        <div className="relative overflow-hidden rounded bg-black/40 h-20 flex items-center justify-center">
                          <img
                            src={cap.url}
                            alt={cap.title}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <ZoomIn className="w-3.5 h-3.5 text-white bg-black/70 rounded p-0.5 absolute bottom-1 right-1" />
                        </div>
                        <div className="cf-mono text-[10px] text-cyan-300 truncate">
                          {cap.id} · {cap.site_context}
                        </div>
                        <div className="text-[10px] cf-muted truncate">{cap.title}</div>
                      </button>
                    ))}
                  </div>
                )}

                {isExpanded && (
                  <div className="cf-card p-3 space-y-2 border-cyan-500/40">
                    {atlasLoading && !contractData && (
                      <div className="cf-muted">
                        Chargement de l’atlas des 1 605 entrées sources…
                      </div>
                    )}
                    {atlasError && (
                      <div className="text-red-300">{atlasError}</div>
                    )}
                    {contractData && (
                      <>
                        <div className="text-[11px] cf-muted">
                          Objet : {contractData.purpose} • Périmètre :{' '}
                          {contractData.scope_note}
                        </div>
                        {contractData.known_limits.length > 0 && (
                          <div className="text-[11px] text-amber-300">
                            Limites : {contractData.known_limits.join(' · ')}
                          </div>
                        )}
                        <div className="max-h-64 overflow-y-auto overflow-x-auto">
                          <table className="w-full text-[11px] text-left">
                            <thead className="cf-muted border-b border-[var(--cf-border)]">
                              <tr>
                                <th className="py-1.5 pr-2">ID</th>
                                <th className="py-1.5 pr-2">Option / Champ</th>
                                <th className="py-1.5 pr-2">Détail</th>
                                <th className="py-1.5 pr-2">Nature</th>
                                <th className="py-1.5">Preuve</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--cf-border)]">
                              {contractData.source_entries.map((entry) => (
                                <tr key={entry.id}>
                                  <td className="py-1.5 pr-2 cf-mono text-violet-300 whitespace-nowrap">
                                    {entry.id}
                                  </td>
                                  <td className="py-1.5 pr-2 font-medium">
                                    {entry.option}
                                  </td>
                                  <td className="py-1.5 pr-2 cf-muted">
                                    {entry.detail}
                                  </td>
                                  <td className="py-1.5 pr-2 cf-mono text-cyan-300 whitespace-nowrap">
                                    {entry.nature}
                                  </td>
                                  <td className="py-1.5 cf-muted">{entry.preuve}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </details>
    );
  };

  // Mode Explorateur de traçabilité V1.16 (TST39 + 111 captures + 1 605 entrées + 67 articles + 10 AMB14)
  if (mode === 'traceability') {
    const q = traceFilter.trim().toLowerCase();
    const screens = registry.screens.filter(
      (s) =>
        !q ||
        s.id.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q) ||
        s.sectionId.toLowerCase().includes(q) ||
        s.contractId.toLowerCase().includes(q)
    );
    const actions = registry.actions.filter(
      (a) =>
        !q ||
        a.id.toLowerCase().includes(q) ||
        a.action.toLowerCase().includes(q) ||
        a.domain.toLowerCase().includes(q)
    );
    const entities = registry.entities.filter(
      (e) =>
        !q ||
        e.id.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q)
    );
    const complements = registry.complements.filter(
      (c) =>
        !q ||
        c.id.toLowerCase().includes(q) ||
        c.option.toLowerCase().includes(q) ||
        c.screenId.toLowerCase().includes(q)
    );
    const ambList = ambiguities.filter(
      (a) =>
        !q ||
        a.id.toLowerCase().includes(q) ||
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q)
    );
    const docArticles = DOCUMENTARY_RECETTE_V116.documents.filter(
      (d) =>
        !q ||
        d.id.toLowerCase().includes(q) ||
        d.title.toLowerCase().includes(q) ||
        d.refs.some((r) => r.toLowerCase().includes(q))
    );

    const flatAtlasEntries = (atlasPayload?.contracts ?? []).flatMap((contract) =>
      contract.source_entries
        .filter(
          (entry) =>
            !q ||
            entry.id.toLowerCase().includes(q) ||
            entry.option.toLowerCase().includes(q) ||
            entry.detail.toLowerCase().includes(q) ||
            entry.nature.toLowerCase().includes(q) ||
            contract.source_screen_id.toLowerCase().includes(q) ||
            contract.contract_id.toLowerCase().includes(q)
        )
        .map((entry) => ({
          contractId: contract.contract_id,
          screenId: contract.source_screen_id,
          screenTitle: contract.title,
          ...entry,
        }))
    );

    const gq = galleryFilter.trim().toLowerCase();
    const filteredAdminCaps = ADMIN_CAPTURES.filter(
      (c) =>
        !gq ||
        c.id.toLowerCase().includes(gq) ||
        c.file.toLowerCase().includes(gq) ||
        c.title.toLowerCase().includes(gq) ||
        c.site_context.toLowerCase().includes(gq) ||
        c.sha256.toLowerCase().includes(gq) ||
        c.source_screen_ids.some((id) => id.toLowerCase().includes(gq))
    );
    const filteredEmuCaps = EMULATION_CAPTURES.filter(
      (c) =>
        !gq ||
        c.id.toLowerCase().includes(gq) ||
        c.file.toLowerCase().includes(gq) ||
        c.device.toLowerCase().includes(gq) ||
        c.format.toLowerCase().includes(gq) ||
        c.note.toLowerCase().includes(gq) ||
        c.sha256.toLowerCase().includes(gq)
    );
    const filteredPlans = HISTORICAL_PLANS.filter(
      (p) =>
        !gq ||
        p.id.toLowerCase().includes(gq) ||
        p.file.toLowerCase().includes(gq) ||
        p.title.toLowerCase().includes(gq) ||
        p.note.toLowerCase().includes(gq)
    );

    return cleanUiTree(
      <div className="space-y-5">
        {renderZoomModal()}
        <div className="cf-card p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs cf-mono text-violet-300">
                TST39 • Référentiel complet V1.16 ({DELIVERY_VERIFICATION_V116.date})
              </div>
              <h1 className="text-xl font-bold mt-0.5 flex items-center gap-2">
                <Compass className="w-5 h-5 text-violet-400" />
                Traçabilité, Captures, Atlas 1 605 entrées & Livrables HTML
              </h1>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px] cf-mono">
              <span className="px-2 py-1 rounded-full bg-violet-500/20 text-violet-200">
                {DELIVERY_VERIFICATION_V116.baseline_screens} écrans
              </span>
              <span className="px-2 py-1 rounded-full bg-cyan-500/20 text-cyan-200">
                {DELIVERY_VERIFICATION_V116.baseline_entries} entrées
              </span>
              <span className="px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-200">
                {DELIVERY_VERIFICATION_V116.supplemental_entries} EXT-*
              </span>
              <span className="px-2 py-1 rounded-full bg-amber-500/20 text-amber-200">
                {DELIVERY_VERIFICATION_V116.candidate_house_actions} actions
              </span>
              <span className="px-2 py-1 rounded-full bg-pink-500/20 text-pink-200">
                {registry.entities.length} OBJ*
              </span>
              <span className="px-2 py-1 rounded-full bg-indigo-500/20 text-indigo-200">
                {DELIVERY_VERIFICATION_V116.administrator_captures} admin +{' '}
                {DELIVERY_VERIFICATION_V116.separate_emulation_captures} émul. +{' '}
                {HISTORICAL_PLANS.length} plans
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            {[
              { id: 'registry' as const, label: 'Registre & 1 605 entrées' },
              { id: 'gallery' as const, label: 'Galerie (111 images)' },
              {
                id: 'recette' as const,
                label: `Recette & Ambiguïtés (${ambiguities.length} AMB + ${DOCUMENTARY_RECETTE_V116.documents.length} DOC14)`,
              },
              {
                id: 'deliverables' as const,
                label: `Livrables client (${CLIENT_HTML_DELIVERABLES.length} HTML/TXT)`,
              },
              { id: 'verification' as const, label: 'État & Limites V1.16' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTraceTab(t.id)}
                className={`px-3 py-1.5 rounded-btn text-xs font-medium ${
                  traceTab === t.id
                    ? 'cf-brand-gradient text-white'
                    : 'cf-card-secondary hover:border-violet-500/60'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {traceTab === 'registry' && (
          <div className="cf-card p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: 'screens' as const, label: `91 Écrans (${screens.length})` },
                {
                  id: 'entries' as const,
                  label: `1 605 Entrées (${
                    atlasPayload ? flatAtlasEntries.length : registry.total_historical_entries
                  })`,
                },
                { id: 'actions' as const, label: `189 Actions (${actions.length})` },
                { id: 'entities' as const, label: `31 Entités (${entities.length})` },
                { id: 'complements' as const, label: `20 EXT (${complements.length})` },
              ].map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => {
                    setTraceRegistrySubTab(st.id);
                    if (st.id === 'entries') void loadAtlasEntries();
                  }}
                  className={`px-2.5 py-1.5 rounded-btn text-xs font-medium ${
                    traceRegistrySubTab === st.id
                      ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-500/50'
                      : 'cf-card-secondary hover:border-violet-500/50'
                  }`}
                >
                  {st.label}
                </button>
              ))}
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-3.5 h-3.5 cf-muted absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filtrer ID, libellé, contrat, écran, nature..."
                  value={traceFilter}
                  onChange={(e) => setTraceFilter(e.target.value)}
                  className="cf-input w-full pl-8 pr-3 py-1.5 text-xs"
                />
              </div>
            </div>

            <div className="max-h-[560px] overflow-y-auto overflow-x-auto">
              {traceRegistrySubTab === 'screens' && (
                <table className="w-full text-xs text-left">
                  <thead className="cf-muted border-b border-[var(--cf-border)]">
                    <tr>
                      <th className="py-2 pr-3">ID</th>
                      <th className="py-2 pr-3">Contrat</th>
                      <th className="py-2 pr-3">Section</th>
                      <th className="py-2 pr-3">Titre écran</th>
                      <th className="py-2 pr-3">Entrées</th>
                      <th className="py-2">Atlas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--cf-border)]">
                    {screens.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2 pr-3 cf-mono text-violet-300">{s.id}</td>
                        <td className="py-2 pr-3 cf-mono">{s.contractId}</td>
                        <td className="py-2 pr-3 cf-mono text-cyan-300">{s.sectionId}</td>
                        <td className="py-2 pr-3">{s.title}</td>
                        <td className="py-2 pr-3 cf-mono">{s.entryCount}</td>
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => {
                              setTraceFilter(s.id);
                              setTraceRegistrySubTab('entries');
                              void loadAtlasEntries();
                            }}
                            className="cf-card-secondary px-2 py-0.5 text-[11px] hover:border-cyan-500/60"
                          >
                            Inspecter
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {traceRegistrySubTab === 'entries' && (
                <div className="space-y-3 text-xs">
                  {atlasLoading && (
                    <div className="cf-muted p-4">
                      Chargement de /references/atlas_1605_entries.json…
                    </div>
                  )}
                  {atlasError && <div className="text-red-300 p-2">{atlasError}</div>}
                  {atlasPayload && (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] cf-muted">
                        <span>
                          {flatAtlasEntries.length} entrée(s) correspondante(s) sur{' '}
                          {atlasPayload.counts.source_entries} ({atlasPayload.counts.screen_contracts}{' '}
                          contrats)
                        </span>
                        {flatAtlasEntries.length > atlasLimit && (
                          <button
                            type="button"
                            onClick={() => setAtlasLimit((prev) => prev + 250)}
                            className="cf-card-secondary px-2.5 py-1 text-cyan-300"
                          >
                            Afficher +250 ({Math.min(atlasLimit, flatAtlasEntries.length)}/
                            {flatAtlasEntries.length})
                          </button>
                        )}
                      </div>
                      <table className="w-full text-[11px] text-left">
                        <thead className="cf-muted border-b border-[var(--cf-border)]">
                          <tr>
                            <th className="py-1.5 pr-2">Écran</th>
                            <th className="py-1.5 pr-2">Entrée ID</th>
                            <th className="py-1.5 pr-2">Option</th>
                            <th className="py-1.5 pr-2">Détail</th>
                            <th className="py-1.5 pr-2">Nature</th>
                            <th className="py-1.5">Preuve</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--cf-border)]">
                          {flatAtlasEntries.slice(0, atlasLimit).map((item) => (
                            <tr key={`${item.contractId}-${item.id}`}>
                              <td className="py-1.5 pr-2 cf-mono text-cyan-300 whitespace-nowrap">
                                {item.screenId}
                              </td>
                              <td className="py-1.5 pr-2 cf-mono text-violet-300 whitespace-nowrap">
                                {item.id}
                              </td>
                              <td className="py-1.5 pr-2 font-medium">{item.option}</td>
                              <td className="py-1.5 pr-2 cf-muted">{item.detail}</td>
                              <td className="py-1.5 pr-2 cf-mono whitespace-nowrap">
                                {item.nature}
                              </td>
                              <td className="py-1.5 cf-muted">{item.preuve}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
              )}

              {traceRegistrySubTab === 'actions' && (
                <table className="w-full text-xs text-left">
                  <thead className="cf-muted border-b border-[var(--cf-border)]">
                    <tr>
                      <th className="py-2 pr-3">ID</th>
                      <th className="py-2 pr-3">Domaine</th>
                      <th className="py-2 pr-3">Action candidate</th>
                      <th className="py-2">Section(s)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--cf-border)]">
                    {actions.map((a) => (
                      <tr key={a.id}>
                        <td className="py-2 pr-3 cf-mono text-violet-300">{a.id}</td>
                        <td className="py-2 pr-3">{a.domain}</td>
                        <td className="py-2 pr-3">{a.action}</td>
                        <td className="py-2 cf-mono text-cyan-300">
                          {a.primarySection}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {traceRegistrySubTab === 'entities' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                  {entities.map((ent) => (
                    <div key={ent.id} className="cf-card-secondary p-3">
                      <div className="font-semibold">
                        <span className="cf-mono text-violet-300 mr-2">{ent.id}</span>
                        {ent.name}
                      </div>
                      <div className="cf-mono text-[11px] cf-muted mt-1">
                        Écrans : {ent.refs.join(', ')}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {traceRegistrySubTab === 'complements' && (
                <div className="space-y-2 text-xs">
                  {complements.map((c) => (
                    <div
                      key={c.id}
                      className="cf-card-secondary p-3 flex items-center justify-between gap-4"
                    >
                      <div>
                        <span className="cf-mono text-emerald-300 mr-2">{c.id}</span>
                        <span className="cf-mono text-xs cf-muted mr-2">
                          ({c.screenId})
                        </span>
                        <span>{c.option}</span>
                      </div>
                      <span className="cf-mono text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                        OBSERVÉ V1.16
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {traceTab === 'gallery' && (
          <div className="cf-card p-4 space-y-4 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {[
                {
                  id: 'all' as const,
                  label: `Toutes (${
                    ADMIN_CAPTURES.length + EMULATION_CAPTURES.length + HISTORICAL_PLANS.length
                  })`,
                },
                { id: 'admin' as const, label: `Admin (${ADMIN_CAPTURES.length})` },
                {
                  id: 'emulation' as const,
                  label: `Émulation mobile/tablette (${EMULATION_CAPTURES.length})`,
                },
                { id: 'plans' as const, label: `Plans historiques (${HISTORICAL_PLANS.length})` },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setGalleryCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-btn font-medium ${
                    galleryCategory === cat.id
                      ? 'cf-brand-gradient text-white'
                      : 'cf-card-secondary hover:border-violet-500/60'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
              <div className="relative flex-1 min-w-[220px]">
                <Camera className="w-3.5 h-3.5 cf-muted absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filtrer capture, SHA-256, écran (ex: PAR02, ORG01), site..."
                  value={galleryFilter}
                  onChange={(e) => setGalleryFilter(e.target.value)}
                  className="cf-input w-full pl-8 pr-3 py-1.5 text-xs"
                />
              </div>
            </div>

            {(galleryCategory === 'all' || galleryCategory === 'emulation') && (
              <div className="cf-card-secondary p-3.5 space-y-2 border-cyan-500/30">
                <div className="font-semibold flex items-center gap-2 text-cyan-300">
                  <ImageIcon className="w-4 h-4" />
                  Méthode d’émulation web ({EMULATION_META.method}) —{' '}
                  {EMULATION_META.presets_verified.map((p) => `${p.name} (${p.viewport_css_pixels.join('×')})`).join(' · ')}
                </div>
                <div className="text-[11px] text-amber-300">
                  Limites émulation : {EMULATION_META.limits.join(' · ')}
                </div>
              </div>
            )}

            {(galleryCategory === 'all' || galleryCategory === 'admin') && (
              <div className="space-y-2">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <Camera className="w-4 h-4 text-violet-300" />
                  Captures administrateur réelles ({filteredAdminCaps.length} / {ADMIN_CAPTURES.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[520px] overflow-y-auto pr-1">
                  {filteredAdminCaps.map((cap) => (
                    <button
                      key={cap.id}
                      type="button"
                      onClick={() =>
                        setZoomImage({
                          url: cap.url,
                          title: `${cap.id} — ${cap.title}`,
                          subtitle: `${cap.site_context} · ${cap.profile} · ${cap.date} · ${cap.kind}`,
                          sha256: cap.sha256,
                          dimensions: `${cap.width}×${cap.height}`,
                        })
                      }
                      className="text-left cf-card-secondary p-2.5 space-y-1.5 hover:border-violet-500/60 group"
                    >
                      <div className="relative h-36 bg-black/50 rounded overflow-hidden">
                        <img
                          src={cap.url}
                          alt={cap.title}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <ZoomIn className="w-4 h-4 text-white bg-black/75 rounded p-0.5 absolute bottom-1.5 right-1.5" />
                      </div>
                      <div className="flex items-center justify-between gap-1 cf-mono text-[10px]">
                        <span className="text-violet-300 font-semibold">{cap.id}</span>
                        <span className="text-cyan-300">{cap.site_context}</span>
                      </div>
                      <div className="font-medium line-clamp-2">{cap.title}</div>
                      <div className="cf-mono text-[10px] cf-muted">
                        Écrans : {cap.source_screen_ids.join(', ')} • {cap.width}×{cap.height}
                      </div>
                      <div className="cf-mono text-[10px] cf-muted truncate">
                        SHA-256 : {cap.sha256.slice(0, 16)}…
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(galleryCategory === 'all' || galleryCategory === 'emulation') && (
              <div className="space-y-2">
                <h2 className="font-semibold text-sm">
                  Captures émulation mobile & tablette ({filteredEmuCaps.length} /{' '}
                  {EMULATION_CAPTURES.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredEmuCaps.map((emu) => (
                    <button
                      key={emu.id}
                      type="button"
                      onClick={() =>
                        setZoomImage({
                          url: emu.url,
                          title: `${emu.id} — ${emu.device}`,
                          subtitle: `${emu.format} · ${emu.file}`,
                          sha256: emu.sha256,
                          dimensions: `${emu.width}×${emu.height}`,
                        })
                      }
                      className="text-left cf-card-secondary p-2.5 space-y-1.5 hover:border-cyan-500/60 group"
                    >
                      <div className="relative h-36 bg-black/50 rounded overflow-hidden">
                        <img
                          src={emu.url}
                          alt={emu.device}
                          loading="lazy"
                          className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                        />
                        <ZoomIn className="w-4 h-4 text-white bg-black/75 rounded p-0.5 absolute bottom-1.5 right-1.5" />
                      </div>
                      <div className="flex items-center justify-between cf-mono text-[10px]">
                        <span className="text-cyan-300 font-semibold">{emu.id}</span>
                        <span>{emu.device}</span>
                      </div>
                      <div className="cf-muted text-[11px]">{emu.note}</div>
                      <div className="cf-mono text-[10px] cf-muted">
                        {emu.width}×{emu.height} • SHA-256 : {emu.sha256.slice(0, 14)}…
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(galleryCategory === 'all' || galleryCategory === 'plans') && (
              <div className="space-y-2">
                <h2 className="font-semibold text-sm">
                  Plans historiques d’architecture ({filteredPlans.length} / {HISTORICAL_PLANS.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {filteredPlans.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() =>
                        setZoomImage({
                          url: plan.url,
                          title: `${plan.id} — ${plan.title}`,
                          subtitle: `${plan.file} · ${plan.note}`,
                        })
                      }
                      className="text-left cf-card-secondary p-2.5 space-y-1.5 hover:border-violet-500/60 group"
                    >
                      <div className="relative h-36 bg-black/50 rounded overflow-hidden">
                        <img
                          src={plan.url}
                          alt={plan.title}
                          loading="lazy"
                          className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                        />
                        <ZoomIn className="w-4 h-4 text-white bg-black/75 rounded p-0.5 absolute bottom-1.5 right-1.5" />
                      </div>
                      <div className="font-medium">{plan.title}</div>
                      <div className="text-[11px] cf-muted">{plan.note}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {traceTab === 'recette' && (
          <div className="space-y-4 text-xs">
            <div className="cf-card p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-sm text-amber-300">
                  10 Ambiguïtés client (AMB14-01..10)
                </h2>
                <div className="relative min-w-[220px]">
                  <Search className="w-3.5 h-3.5 cf-muted absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Filtrer AMB14 ou DOC14..."
                    value={traceFilter}
                    onChange={(e) => setTraceFilter(e.target.value)}
                    className="cf-input w-full pl-8 pr-3 py-1.5 text-xs"
                  />
                </div>
              </div>
              <div className="space-y-2">
                {ambList.map((a) => (
                  <div key={a.id} className="cf-card-secondary p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-amber-300">
                        <span className="cf-mono mr-2">{a.id}</span>
                        {a.title}
                      </div>
                      <span className="cf-mono text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                        {a.decisionStatus}
                      </span>
                    </div>
                    <p>{a.description}</p>
                    <p className="cf-muted italic">Décision / note : {a.resolutionNote}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="cf-card p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-sm flex items-center gap-2 text-cyan-300">
                    <BookOpen className="w-4 h-4" />
                    Recette documentaire V1.16 — {docArticles.length} /{' '}
                    {DOCUMENTARY_RECETTE_V116.documents.length} articles (DOC14-01..16)
                  </h2>
                  <p className="text-[11px] cf-muted mt-0.5">
                    {DOCUMENTARY_RECETTE_V116.scope}
                  </p>
                </div>
                <a
                  href={DOCUMENTARY_RECETTE_V116.collection_url}
                  target="_blank"
                  rel="noreferrer"
                  className="cf-card-secondary px-2.5 py-1.5 text-[11px] flex items-center gap-1 text-violet-300"
                >
                  Collection Skello
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {docArticles.map((doc) => (
                  <div key={doc.id} className="cf-card-secondary p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="cf-mono text-violet-300 font-semibold mr-2">
                          {doc.id}
                        </span>
                        <span className="font-semibold">{doc.title}</span>
                      </div>
                      <span className="cf-mono text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 shrink-0">
                        {doc.result_tested ? 'Testé' : 'Non testé'}
                      </span>
                    </div>
                    <div className="cf-mono text-[10px] text-cyan-300">
                      Écrans : {doc.refs.join(', ')}
                    </div>
                    <div className="text-[11px] cf-muted">{doc.evidence}</div>
                    <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                      {doc.notes.map((n, idx) => (
                        <li key={idx}>{n}</li>
                      ))}
                    </ul>
                    <div className="pt-1 border-t border-[var(--cf-border)] space-y-1">
                      <div className="font-semibold text-[11px] text-emerald-300">
                        Scénarios de recette proposés ({doc.proposed_acceptance_scenarios.length}) :
                      </div>
                      {doc.proposed_acceptance_scenarios.map((scText, idx) => (
                        <div key={idx} className="text-[11px]">
                          • {scText}
                        </div>
                      ))}
                    </div>
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-violet-300 hover:underline"
                    >
                      Article officiel
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {traceTab === 'deliverables' && (
          <div className="space-y-4 text-xs">
            <div className="cf-card p-4 space-y-3">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-violet-300" />
                Livrables originaux du dossier client copiés dans public/references/
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {CLIENT_HTML_DELIVERABLES.map((deliv) => (
                  <div
                    key={deliv.id}
                    className={`cf-card-secondary p-3 space-y-2 border ${
                      activeClientDocUrl === deliv.url
                        ? 'border-violet-500/80'
                        : 'border-[var(--cf-border)]'
                    }`}
                  >
                    <div className="font-semibold">{deliv.title}</div>
                    <div className="text-[11px] cf-muted">{deliv.description}</div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setActiveClientDocUrl(deliv.url)}
                        className="cf-brand-gradient text-white px-2.5 py-1 rounded-btn text-[11px] font-medium"
                      >
                        Afficher ci-dessous
                      </button>
                      <a
                        href={deliv.url}
                        target="_blank"
                        rel="noreferrer"
                        className="cf-card px-2.5 py-1 text-[11px] flex items-center gap-1"
                      >
                        Nouvel onglet
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="cf-card p-3 space-y-2">
              <div className="flex items-center justify-between text-[11px] cf-mono cf-muted">
                <span>Aperçu intégré : {activeClientDocUrl}</span>
                <a
                  href={activeClientDocUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-violet-300 hover:underline flex items-center gap-1"
                >
                  Plein écran
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <iframe
                src={activeClientDocUrl}
                title="Livrable référence client V1.16"
                className="w-full h-[640px] rounded border border-[var(--cf-border)] bg-white"
              />
            </div>
          </div>
        )}

        {traceTab === 'verification' && (
          <div className="space-y-4 text-xs">
            <div className="cf-card p-4 border-amber-500/40 bg-amber-950/15 space-y-2">
              <div className="font-semibold text-sm text-amber-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                État réel & limites documentées de la livraison V1.16 ({DELIVERY_VERIFICATION_V116.date})
              </div>
              <p>
                Exhaustivité certifiée :{' '}
                <strong className="cf-mono">
                  {String(DELIVERY_VERIFICATION_V116.exhaustivity_certified)}
                </strong>{' '}
                • Résultats sources testés :{' '}
                <strong className="cf-mono">
                  {DELIVERY_VERIFICATION_V116.source_results_tested}
                </strong>{' '}
                • QA visuelle navigateur des maquettes :{' '}
                <strong className="cf-mono">
                  {String(DELIVERY_VERIFICATION_V116.mockup_generation_checks.visual_browser_qa_performed)}
                </strong>
              </p>
              <p className="cf-muted">
                Note d’application : CFitness OS utilise des collaborateurs fictifs (FICT-001 à
                FICT-007) et des données de démonstration locales pour préserver le secret RH ; le
                référentiel Skello client (91 écrans, 1 605 entrées, 111 images, 67 articles) est
                consulté en lecture seule et reste à valider sur le jeu métier réel par un
                administrateur (cf. <span className="cf-mono">{DELIVERY_VERIFICATION_V116.remaining_file}</span>).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="cf-card p-4 space-y-2">
                <h2 className="font-semibold text-sm">Compteurs Verification_livraison V1.16</h2>
                <div className="grid grid-cols-2 gap-2 cf-mono text-[11px]">
                  <div className="cf-card-secondary p-2">
                    Écrans : {DELIVERY_VERIFICATION_V116.baseline_screens}
                  </div>
                  <div className="cf-card-secondary p-2">
                    Entrées : {DELIVERY_VERIFICATION_V116.baseline_entries}
                  </div>
                  <div className="cf-card-secondary p-2">
                    Compléments EXT : {DELIVERY_VERIFICATION_V116.supplemental_entries}
                  </div>
                  <div className="cf-card-secondary p-2">
                    Actions OS : {DELIVERY_VERIFICATION_V116.candidate_house_actions}
                  </div>
                  <div className="cf-card-secondary p-2">
                    Observations admin : {DELIVERY_VERIFICATION_V116.cumulative_administrator_observations}
                  </div>
                  <div className="cf-card-secondary p-2">
                    Captures admin : {DELIVERY_VERIFICATION_V116.administrator_captures}
                  </div>
                  <div className="cf-card-secondary p-2">
                    Émulations : {DELIVERY_VERIFICATION_V116.separate_emulation_captures}
                  </div>
                  <div className="cf-card-secondary p-2">
                    Articles DOC14 : {DELIVERY_VERIFICATION_V116.documentary_articles_added} (
                    {DELIVERY_VERIFICATION_V116.proposed_acceptance_scenarios_added} scénarios)
                  </div>
                  <div className="cf-card-secondary p-2">
                    Articles relus : {DELIVERY_VERIFICATION_V116.written_articles_reviewed_deep_pass}
                  </div>
                  <div className="cf-card-secondary p-2">
                    Ambiguïtés : {DELIVERY_VERIFICATION_V116.unresolved_ambiguities}
                  </div>
                </div>
                <div className="text-[11px] cf-muted pt-1">
                  État final Skello relevé : {DELIVERY_VERIFICATION_V116.latest_skello_end_state}
                </div>
              </div>

              <div className="cf-card p-4 space-y-2 max-h-[380px] overflow-y-auto">
                <h2 className="font-semibold text-sm">
                  Constats administrateur (ADM13-01..15 — {ADMIN_OBSERVATIONS_SUMMARY.length})
                </h2>
                <div className="space-y-2">
                  {ADMIN_OBSERVATIONS_SUMMARY.map((obs) => (
                    <div key={obs.id} className="cf-card-secondary p-2.5 space-y-1">
                      <div className="cf-mono text-[11px] text-violet-300 font-semibold">
                        {obs.id} • Écrans : {obs.refs.join(', ')}
                      </div>
                      <div className="text-[11px]">{obs.observation}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>,
      isTechnicalMode
    );
  }

  // Mode Planning RH (MC03 partagé avec le raccourci global Planning — TST36)
  if (mode === 'planning' || activeSection === 'MC03') {
    const empMap = new Map(
      dashboard.visibleEmployees.map((e) => [e.id, `${e.firstName} ${e.lastName}`])
    );
    const posMap = new Map(dashboard.positions.map((p) => [p.id, p]));
    const siteMap = new Map(dashboard.sites.map((s) => [s.id, s.name]));

    return cleanUiTree(
      <div className="space-y-5">
        {renderZoomModal()}
        <div className="cf-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs cf-mono text-cyan-300 flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5" />
              MC03 • Vue Planning RH unique (partagée /planning & /mon-compte/MC03 — TST36)
            </div>
            <h1 className="text-xl font-bold mt-1">
              Planning des équipes & contrôle des verrous
            </h1>
            <p className="text-xs cf-muted mt-1">
              Même store serveur, mêmes règles RBAC : aucune donnée ni permission
              dupliquée entre le raccourci latéral Planning et Mon compte.
            </p>
          </div>
          <span className="text-xs cf-mono px-3 py-1.5 rounded-btn bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
            {dashboard.teamShifts.length} créneau(x) visible(s)
          </span>
        </div>

        {shiftFeedback && (
          <div
            className={`p-4 rounded-card border text-xs flex items-center gap-2.5 ${
              shiftFeedback.kind === 'ok'
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                : 'bg-red-950/50 border-red-500/50 text-red-200'
            }`}
          >
            {shiftFeedback.kind === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{shiftFeedback.text}</span>
          </div>
        )}

        <div className="cf-card p-4 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="cf-muted border-b border-[var(--cf-border)]">
              <tr>
                <th className="py-2 pr-3">Date & Horaire</th>
                <th className="py-2 pr-3">Net (TST01)</th>
                <th className="py-2 pr-3">Collaborateur</th>
                <th className="py-2 pr-3">Poste / Club</th>
                <th className="py-2 pr-3">Verrou & Publication</th>
                <th className="py-2">Action (TST08)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--cf-border)]">
              {dashboard.teamShifts.map((sh) => {
                const netMin = computeShiftNetMinutes(
                  sh.startTime,
                  sh.endTime,
                  sh.breakMinutes
                );
                const pos = posMap.get(sh.positionId);
                return (
                  <tr key={sh.id}>
                    <td className="py-3 pr-3">
                      <div className="cf-mono font-semibold">{sh.date}</div>
                      <div className="cf-muted">
                        {sh.startTime} – {sh.endTime} (pause {sh.breakMinutes}m)
                      </div>
                    </td>
                    <td className="py-3 pr-3 cf-mono font-semibold text-violet-300">
                      {formatMinutesAsHours(netMin)}
                    </td>
                    <td className="py-3 pr-3">
                      {sh.employeeId ? (
                        <span className="font-medium">
                          {empMap.get(sh.employeeId) ?? sh.employeeId}
                        </span>
                      ) : (
                        <span className="cf-mono text-[11px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                          Non assigné (TST04)
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <div>{pos?.label ?? sh.positionId}</div>
                      <div className="text-[11px] cf-muted">
                        {siteMap.get(sh.siteId) ?? sh.siteId}
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex flex-wrap gap-1.5">
                        {sh.lockState === 'red' ? (
                          <span className="inline-flex items-center gap-1 cf-mono text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/40">
                            <Lock className="w-3 h-3" />
                            Verrou rouge
                          </span>
                        ) : (
                          <span className="cf-mono text-[10px] px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-300">
                            {sh.lockState}
                          </span>
                        )}
                        <span className="cf-mono text-[10px] px-2 py-0.5 rounded-full bg-slate-800/70 cf-muted">
                          {sh.published ? 'Publié' : 'Brouillon'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={() => openEditModal(sh)}
                        className="cf-card-secondary px-2.5 py-1.5 text-xs flex items-center gap-1 hover:border-violet-500/60"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Modifier
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Formulaire d'édition shift (TST05 annulation propre / TST08 refus 403 rouge) */}
        {editingShift && (
          <div className="cf-card p-5 border-violet-500/50 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">
                Éditer créneau {editingShift.id} (Verrou :{' '}
                <span className="cf-mono">{editingShift.lockState}</span>)
              </h2>
              {editingShift.lockState === 'red' && (
                <span className="text-xs text-amber-300 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Droit ORG04-05 requis côté serveur
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="cf-muted block mb-1">Heure début</label>
                <input
                  type="time"
                  value={shiftStart}
                  onChange={(e) => setShiftStart(e.target.value)}
                  className="cf-input w-full px-3 py-2 cf-mono"
                />
              </div>
              <div>
                <label className="cf-muted block mb-1">Heure fin</label>
                <input
                  type="time"
                  value={shiftEnd}
                  onChange={(e) => setShiftEnd(e.target.value)}
                  className="cf-input w-full px-3 py-2 cf-mono"
                />
              </div>
              <div>
                <label className="cf-muted block mb-1">Pause (minutes)</label>
                <input
                  type="number"
                  min={0}
                  value={shiftBreak}
                  onChange={(e) => setShiftBreak(Number(e.target.value) || 0)}
                  className="cf-input w-full px-3 py-2 cf-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingShift(null)}
                className="cf-card-secondary px-3.5 py-2 text-xs font-medium"
              >
                Annuler (TST05)
              </button>
              <button
                type="button"
                onClick={handleSaveShift}
                className="cf-brand-gradient text-white px-4 py-2 rounded-btn text-xs font-semibold"
              >
                Enregistrer modification
              </button>
            </div>
          </div>
        )}

        {renderSourceDrawer('MC03')}
      </div>,
      isTechnicalMode
    );
  }

  // Préparation commune pour toutes les vues MC02, MC04, MC05, MC06, MC07, MC08, MC09, MC10, MC12


  const renderFeedbackBanner = () =>
    moduleFeedback && (
      <div
        className={`p-3.5 rounded-card border text-xs flex items-center justify-between gap-3 ${
          moduleFeedback.kind === 'ok'
            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
            : 'bg-red-950/50 border-red-500/50 text-red-200'
        }`}
      >
        <div className="flex items-center gap-2">
          {moduleFeedback.kind === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span>{moduleFeedback.text}</span>
        </div>
        <button
          type="button"
          onClick={() => setModuleFeedback(null)}
          className="cf-mono text-[11px] opacity-80 hover:opacity-100"
        >
          Fermer
        </button>
      </div>
    );

  // =========================================================================
  // MC02 — Mes informations et mon dossier (EMP01-06, CPT01-05, EXT01/02)
  // =========================================================================
  const renderMc02 = () => {
    // Unification référentiel : fusion des salariés persistés dans CfosContext (staffEmployees)
    // qui ne figurent pas encore dans dashboard.visibleEmployees (CFOS-009 / CFOS-027)
    const visibleNames = new Set(
      dashboard.visibleEmployees.map((e) => `${e.firstName} ${e.lastName}`.trim().toLowerCase())
    );
    const extraStaffViews: typeof dashboard.visibleEmployees = staffEmployees
      .filter(
        (se) =>
          se.role !== 'kiosque' &&
          (se.id.startsWith('emp-staff-') ||
            !visibleNames.has(`${se.firstName} ${se.lastName}`.trim().toLowerCase()))
      )
      .filter((se) => {
        if (auth.siteId === 'club-carre-soie') return se.clubId === 'carre-de-soie';
        if (auth.siteId === 'club-beynost') return se.clubId === 'beynost';
        return true;
      })
      .map((se) => ({
        id: se.id,
        firstName: se.firstName,
        lastName: se.lastName,
        matricule: se.id.toUpperCase(),
        active: true,
        hrFileStatus: 'complete' as const,
        siteAccesses: [
          {
            siteId: se.clubId === 'beynost' ? 'club-beynost' : 'club-carre-soie',
            isPrimary: true,
            profileId: 'employe_standard' as const,
            teamIds: [],
            showOnPlanning: true,
            positionIds: [],
          },
        ],
        counter: {
          annualForfaitDays: 218,
          workedDaysYtd: 0,
          remainingDays: 218,
          cpAcquired: se.cpBalance ?? 0,
          cpTaken: 0,
          cpRemaining: se.cpBalance ?? 0,
          cpNAcquired: se.cpBalance ?? 0,
          cpNTaken: 0,
          cpNMinus1Remaining: 0,
          rttAcquired: se.rttBalance ?? 0,
          rttRemaining: se.rttBalance ?? 0,
          rttInitialized: true,
        },
        contact: {
          email: se.email,
          phone: se.phone,
          address: se.clubId === 'beynost' ? 'ZAC des Baterses, 01700 Beynost' : '2 Rue Jacquard, 69120 Vaulx-en-Velin',
        },
        contract: {
          id: `CTR-${se.id.toUpperCase()}`,
          siteId: se.clubId === 'beynost' ? 'club-beynost' : 'club-carre-soie',
          contractType:
            se.contractType === 'Apprentissage'
              ? ('Alternance' as const)
              : (se.contractType as 'CDI' | 'CDD' | 'Alternance'),
          regime: 'hours' as const,
          weeklyHours: se.weeklyContractHours,
          effectiveFrom: se.hireDate,
          hourlyRateEur: se.hourlyRate ?? 12.02,
          monthlyGrossEur: se.monthlyGrossEur ?? 1823.03,
          loadedCostFactor: 1.42,
        },
      }));

    const unifiedEmployees = [...dashboard.visibleEmployees, ...extraStaffViews];
    const selectedEmp =
      unifiedEmployees.find((e) => e.id === selectedEmpId) ??
      unifiedEmployees[0];
      dashboard.visibleEmployees[0];
    const siteMap = new Map(dashboard.sites.map((s) => [s.id, s.name]));
    const canCreateEmployee = can('ORG04-15');
    const canInitRtt = can('ORG04-44') || selectedEmp?.id === dashboard.session.employee.id;
    const baseRtt = selectedEmp?.counter.rttDaysRemaining ?? 0;
    const effectiveRtt =
      selectedEmp && rttInitializedIds[selectedEmp.id] !== undefined
        ? rttInitializedIds[selectedEmp.id]
        : baseRtt;

    return (
      <div className="space-y-5">
        <div className="cf-card p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs cf-mono text-sky-300 flex items-center gap-2">
              <Users className="w-4 h-4" />
              {isTechnicalMode
                ? 'MC02 • EMP01–EMP06, CPT01–CPT05, EXT01 (DPAE) & EXT02 (Onboarding)'
                : 'Dossiers Collaborateurs & RH'}
            </div>
            <h1 className="text-xl font-bold mt-1">
              Dossiers collaborateurs, contrats & compteurs RH
            </h1>
            <p className="text-xs cf-muted mt-1">
              {dashboard.visibleEmployees.length} fiche(s) autorisée(s) sur ce périmètre
              {isTechnicalMode ? ' — protection IBAN/NIR/salaires via ORG04-10 (TST33).' : '.'}
            </p>
          </div>
          {canCreateEmployee && (
            <button
              type="button"
              onClick={() => setShowAddEmpForm((v) => !v)}
              className="cf-brand-gradient text-white px-4 py-2 rounded-btn text-xs font-semibold flex items-center gap-1.5"
            >
              <UserPlus className="w-4 h-4" />
              {isTechnicalMode ? 'Ajouter un employé (EMP02)' : 'Ajouter un employé'}
            </button>
          )}
        </div>

        {renderFeedbackBanner()}

        {showAddEmpForm && (
          <div className="cf-card p-4 border-violet-500/40 space-y-3 text-xs">
            <div className="font-semibold">
              {isTechnicalMode
                ? 'Création rapide de collaborateur (EMP02 — simulation locale)'
                : 'Nouveau collaborateur'}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input
                type="text"
                placeholder="Prénom"
                value={newEmpFirst}
                onChange={(e) => setNewEmpFirst(e.target.value)}
                className="cf-input px-3 py-2"
              />
              <input
                type="text"
                placeholder="Nom"
                value={newEmpLast}
                onChange={(e) => setNewEmpLast(e.target.value)}
                className="cf-input px-3 py-2"
              />
              <select
                value={newEmpContract}
                onChange={(e) => setNewEmpContract(e.target.value as 'CDI' | 'CDD')}
                className="cf-input px-3 py-2"
              >
                <option value="CDI">CDI</option>
                <option value="CDD">CDD</option>
              </select>
              <input
                type="number"
                min={1}
                max={39}
                value={newEmpHours}
                onChange={(e) => setNewEmpHours(Number(e.target.value) || 35)}
                className="cf-input px-3 py-2 cf-mono"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddEmpForm(false)}
                className="cf-card-secondary px-3 py-1.5"
              >
                Annuler (TST05)
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!newEmpFirst.trim() || !newEmpLast.trim()) {
                    setModuleFeedback({
                      kind: 'err',
                      text: 'Renseignez prénom et nom pour créer le dossier.',
                    });
                    return;
                  }
                  const siteName =
                    dashboard.sites[0]?.name ?? 'C.FITNESS Carré de Soie';
                  const created = addStaffEmployee({
                    firstName: newEmpFirst.trim(),
                    lastName: newEmpLast.trim(),
                    contractType: newEmpContract,
                    weeklyContractHours: newEmpHours,
                  });
                  setCreatedEmployees((prev) => [
                    ...prev,
                    {
                      id: created.id,
                      name: `${created.firstName} ${created.lastName}`,
                      contract: newEmpContract,
                      hours: newEmpHours,
                      site: siteName,
                    },
                  ]);
                  setNewEmpFirst('');
                  setNewEmpLast('');
                  setShowAddEmpForm(false);
                  setModuleFeedback({
                    kind: 'ok',
                    text: 'Collaborateur ajouté en session (parcours DPAE EXT01 initialisé).',
                  });
                }}
                className="cf-brand-gradient text-white px-4 py-1.5 rounded-btn font-semibold"
              >
                Valider fiche
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="cf-card p-3 space-y-2">
            <div className="text-xs font-semibold px-2 pt-1 cf-muted uppercase">
              Effectif accessible ({unifiedEmployees.length})
            </div>
            {unifiedEmployees.map((emp) => (
              <button
                key={emp.id}
                type="button"
                onClick={() => setSelectedEmpId(emp.id)}
                className={`w-full text-left p-2.5 rounded-btn text-xs transition-all ${
                  selectedEmp?.id === emp.id
                    ? 'cf-brand-gradient text-white font-semibold'
                    : 'cf-card-secondary hover:border-violet-500/50'
                }`}
              >
                <div>
                  {emp.firstName} {emp.lastName}
                </div>
                <div className="cf-mono text-[10px] opacity-80">
                  {emp.matricule} · {emp.hrFileStatus}
                </div>
              </button>
            ))}
            {createdEmployees.map((ce) => (
              <div
                key={ce.id}
                className="p-2.5 rounded-btn cf-card-secondary text-xs border-emerald-500/40"
              >
                <div className="font-semibold text-emerald-300">{ce.name}</div>
                <div className="cf-mono text-[10px] cf-muted">
                  Nouveau {ce.contract} {ce.hours}h • {ce.site}
                </div>
              </div>
            ))}
          </div>

          {selectedEmp && (
            <div className="lg:col-span-3 cf-card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--cf-border)] pb-3">
                <div>
                  <h2 className="text-lg font-bold">
                    {selectedEmp.firstName} {selectedEmp.lastName}
                  </h2>
                  <div className="text-xs cf-muted cf-mono">
                    Matricule {selectedEmp.matricule} • Statut dossier : {selectedEmp.hrFileStatus}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {(
                    [
                      ['identity', 'Identité & Multi-sites'],
                      ['contract', 'Contrat & Rémunération'],
                      ['counters', 'Compteurs & Historique'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setMc02Tab(id)}
                      className={`px-3 py-1.5 rounded-btn font-medium ${
                        mc02Tab === id
                          ? 'cf-brand-gradient text-white'
                          : 'cf-card-secondary'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {mc02Tab === 'identity' && (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="cf-card-secondary p-3.5 space-y-1">
                      <div className="cf-muted">Coordonnées contact</div>
                      <div>E-mail : {selectedEmp.email ?? 'Masqué (ORG04-10)'}</div>
                      <div>Téléphone : {selectedEmp.phone ?? 'Masqué (ORG04-10)'}</div>
                    </div>
                    <div className="cf-card-secondary p-3.5 space-y-1">
                      <div className="cf-muted">DPAE (EXT01) & Intégration (EXT02)</div>
                      <div className="text-emerald-300 font-medium">
                        DPAE transmise URSSAF · Onboarding {selectedEmp.hrFileStatus}
                      </div>
                      <div className="cf-muted">
                        Rattachement sur {selectedEmp.siteAccesses.length} établissement(s) (TST02)
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="font-semibold">Accès établissements (EMP03)</div>
                    {selectedEmp.siteAccesses.map((acc) => (
                      <div
                        key={acc.siteId}
                        className="cf-card-secondary p-3 flex flex-wrap items-center justify-between gap-2"
                      >
                        <div>
                          <span className="font-semibold">
                            {siteMap.get(acc.siteId) ?? acc.siteId}
                          </span>
                          <span className="ml-2 cf-mono text-[10px] px-2 py-0.5 rounded bg-violet-500/20 text-violet-300">
                            {acc.isPrimary ? 'Établissement principal' : 'Établissement secondaire'}
                          </span>
                        </div>
                        <div className="cf-mono text-[11px] cf-muted">
                          Profil : {acc.profileId} · Planning : {acc.showOnPlanning ? 'Visible' : 'Masqué'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {mc02Tab === 'contract' && (
                <div className="space-y-4 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          ['current', 'Contrat en cours'],
                          ['history', 'Historique (Contrat Terminé)'],
                          ['upcoming', 'À venir'],
                        ] as const
                      ).map(([subId, subLabel]) => (
                        <button
                          key={subId}
                          type="button"
                          onClick={() => setMc02ContractSubTab(subId)}
                          className={`px-3 py-1.5 rounded-btn font-medium ${
                            mc02ContractSubTab === subId
                              ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-500/50'
                              : 'cf-card-secondary hover:border-violet-500/50'
                          }`}
                        >
                          {subLabel}
                        </button>
                      ))}
                    </div>

                    <label className="flex items-center gap-1.5 text-[11px] cf-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={simulateNoCurrentContract}
                        onChange={(e) => setSimulateNoCurrentContract(e.target.checked)}
                      />
                      Simuler « Aucun contrat en cours » (ADM14-04)
                    </label>
                  </div>

                  {mc02ContractSubTab === 'current' && (
                    <>
                      {simulateNoCurrentContract ? (
                        <div className="cf-card-secondary p-4 border-amber-500/40 space-y-2">
                          <div className="font-semibold text-amber-300">
                            Aucun contrat en cours
                          </div>
                          <div className="cf-muted">
                            État observé en V1.16 (ADM14-04) sur un dossier sans contrat actif ;
                            consulter l’onglet Historique pour retrouver le contrat Terminé.
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="cf-card-secondary p-4 space-y-1.5">
                            <div className="cf-muted">
                              Contrat en cours ({selectedEmp.contract?.id}) · ADM14-01
                            </div>
                            <div className="text-sm font-semibold">
                              {selectedEmp.contract?.contractType} — Régime{' '}
                              {selectedEmp.contract?.regime}
                            </div>
                            <div>
                              Base :{' '}
                              {selectedEmp.contract?.annualDays
                                ? `${selectedEmp.contract.annualDays} jours / an`
                                : `${selectedEmp.contract?.weeklyHours ?? 35} h / semaine`}{' '}
                              · Temps plein
                            </div>
                            <div>
                              Entrée en vigueur : {selectedEmp.contract?.effectiveFrom} •
                              Matricule : {selectedEmp.matricule}
                            </div>
                            <div className="cf-muted text-[11px]">
                              Mesure du temps, statut/classification et historique des avenants.
                            </div>
                            <div className="pt-2 flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setPastContractFormOpen(true);
                                  setModuleFeedback({
                                    kind: 'ok',
                                    text: `Contrat ${selectedEmp.contract?.id} ouvert pour modification ou création d'avenant.`,
                                  });
                                }}
                                className="cf-input px-2.5 py-1 text-[11px] font-semibold hover:border-violet-500/60 cursor-pointer"
                              >
                                Modifier contrat / Avenant
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setModuleFeedback({
                                    kind: 'ok',
                                    text: `Avenant au contrat ${selectedEmp.contract?.id} préparé et archivé dans le dossier RH de ${selectedEmp.firstName} ${selectedEmp.lastName}.`,
                                  })
                                }
                                className="cf-input px-2.5 py-1 text-[11px] font-semibold hover:border-emerald-500/60 cursor-pointer"
                              >
                                Archiver / Clôturer
                              </button>
                            </div>
                          </div>
                          <div className="cf-card-secondary p-4 space-y-1.5">
                            <div className="cf-muted">Données salariales & bancaires (ORG04-10)</div>
                            {selectedEmp.contract?.monthlyGrossEur != null &&
                            selectedEmp.sensitiveBank ? (
                              <>
                                <div className="cf-mono text-emerald-300 font-semibold">
                                  Brut mensuel : {formatEur(selectedEmp.contract.monthlyGrossEur)}{' '}
                                  ({selectedEmp.contract.hourlyRateEur} €/h · taux moyen)
                                </div>
                                <div className="cf-mono">
                                  IBAN : {selectedEmp.sensitiveBank.ibanMasked}
                                </div>
                                <div className="cf-mono">
                                  NIR : {selectedEmp.sensitiveBank.nirMasked}
                                </div>
                              </>
                            ) : (
                              <div className="text-amber-300 flex items-center gap-1.5 font-medium pt-1">
                                <EyeOff className="w-4 h-4" />
                                Champs salariaux / IBAN / NIR non transmis par l’API (TST33)
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {mc02ContractSubTab === 'history' && (
                    <div className="cf-card-secondary p-4 space-y-3 overflow-x-auto">
                      <div className="font-semibold">
                        Historique des contrats — État ADM14-04 (EMP04)
                      </div>
                      <table className="w-full text-xs text-left">
                        <thead className="cf-muted border-b border-[var(--cf-border)]">
                          <tr>
                            <th className="py-2 pr-3">Type de contrat</th>
                            <th className="py-2 pr-3">Date de création</th>
                            <th className="py-2 pr-3">Créé par</th>
                            <th className="py-2 pr-3">Volume horaire / Nb. jours par an</th>
                            <th className="py-2 pr-3">Période effective</th>
                            <th className="py-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--cf-border)]">
                          <tr>
                            <td className="py-2.5 pr-3 font-medium">
                              CDI (Terminé — Contrat passé fictif)
                            </td>
                            <td className="py-2.5 pr-3 cf-mono">02/09/2024</td>
                            <td className="py-2.5 pr-3">Nadia Moreau (Master)</td>
                            <td className="py-2.5 pr-3 cf-mono">35 h / semaine</td>
                            <td className="py-2.5 pr-3 cf-mono">02/09/2024 – 31/08/2025</td>
                            <td className="py-2.5 relative">
                              <button
                                type="button"
                                aria-label="Menu contrat passé"
                                onClick={() => setPastContractMenuOpen((prev) => !prev)}
                                className="cf-card px-2.5 py-1 font-bold hover:border-violet-500/60"
                              >
                                ⋮
                              </button>
                              {pastContractMenuOpen && (
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPastContractFormOpen(true);
                                      setPastContractMenuOpen(false);
                                      setModuleFeedback({
                                        kind: 'ok',
                                        text: 'EXT-EMP04-01 : Ouverture du formulaire contrat passé en état « Terminé » (consultation V1.16 sans sauvegarde).',
                                      });
                                    }}
                                    className="cf-input px-2.5 py-1 hover:border-violet-500/60"
                                  >
                                    Modifier les informations (EXT-EMP04-01)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPastContractMenuOpen(false);
                                      setModuleFeedback({
                                        kind: 'ok',
                                        text: 'EXT-EMP04-02 : Dupliquer le contrat (commande observée en V1.16 ; copie en brouillon session).',
                                      });
                                    }}
                                    className="cf-input px-2.5 py-1 hover:border-violet-500/60"
                                  >
                                    Dupliquer le contrat (EXT-EMP04-02)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPastContractMenuOpen(false);
                                      setModuleFeedback({
                                        kind: 'ok',
                                        text: 'EXT-EMP04-03 : Créer un document pour ce contrat (certificat / solde pré-rempli en session).',
                                      });
                                    }}
                                    className="cf-input px-2.5 py-1 hover:border-violet-500/60"
                                  >
                                    Créer un document pour ce contrat (EXT-EMP04-03)
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>

                      {pastContractFormOpen && (
                        <div className="cf-card p-4 border-violet-500/40 space-y-3 mt-2">
                          <div className="flex items-center justify-between">
                            <div className="font-semibold text-violet-300">
                              Formulaire du contrat passé (ADM14-05 — État : Terminé)
                            </div>
                            <span className="cf-mono text-[10px] px-2 py-0.5 rounded bg-slate-700/60">
                              Terminé
                            </span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-[11px]">
                            <div>Type : CDI</div>
                            <div>Intitulé : Coach Fitness</div>
                            <div>Dates : 02/09/2024 → 31/08/2025</div>
                            <div>Statut : Non-cadre</div>
                            <div>Catégorie prof. : Employé / Technicien</div>
                            <div>Matricule : {selectedEmp.matricule}</div>
                            <div>PCS-ESE : 424a</div>
                            <div>DPAE : Déclarée</div>
                            <div>Visite médicale : À jour</div>
                            <div>Temps de travail : 35h/sem</div>
                            <div>Salaire / taux : Confidentiel (ORG04-10)</div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setPastContractFormOpen(false)}
                              className="cf-card-secondary px-3 py-1.5"
                            >
                              Fermer sans modifier (ADM14-05)
                            </button>
                            <button
                              type="button"
                              disabled
                              title="Lecture seule en référence V1.16"
                              className="cf-input px-3 py-1.5 opacity-50 cursor-not-allowed"
                            >
                              Mettre à jour
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {mc02ContractSubTab === 'upcoming' && (
                    <div className="cf-card-secondary p-4 text-center space-y-1">
                      <div className="font-semibold">
                        Aucun contrat à venir pour cet employé
                      </div>
                      <div className="cf-muted text-[11px]">
                        État exact relevé sur EMP04 / ADM14-05 (V1.16).
                      </div>
                    </div>
                  )}

                  <div className="cf-muted text-[11px] cf-card-secondary p-2.5">
                    Note V1.16 ({CONTRACTS_COUNTERS_V116.date_recorded}) :{' '}
                    {CONTRACTS_COUNTERS_V116.method} (Exhaustivité certifiée :{' '}
                    {String(CONTRACTS_COUNTERS_V116.exhaustivity_certified)}).
                  </div>
                </div>
              )}

              {mc02Tab === 'counters' && (
                <div className="space-y-4 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          ['forfait', 'Compteur de forfait jour (ADM14-02)'],
                          ['history', 'Historique'],
                          ['cp', 'Compteur de Congés Payés'],
                          ['rtt', 'Compteur de repos forfait jours (RTT · ADM14-03)'],
                        ] as const
                      ).map(([subId, label]) => (
                        <button
                          key={subId}
                          type="button"
                          onClick={() => setMc02CounterSubTab(subId)}
                          className={`px-3 py-1.5 rounded-btn font-medium ${
                            mc02CounterSubTab === subId
                              ? 'cf-brand-gradient text-white'
                              : 'cf-card-secondary hover:border-violet-500/50'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <label className="flex items-center gap-1.5 text-[11px] cf-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={simulateRttUninitialized}
                        onChange={(e) => setSimulateRttUninitialized(e.target.checked)}
                      />
                      Simuler RTT non initialisé (ADM14-03)
                    </label>
                  </div>

                  {mc02CounterSubTab === 'forfait' && (
                    <div className="cf-card-secondary p-4 space-y-3 overflow-x-auto">
                      {selectedEmp.contract?.regime !== 'forfait_jours' ? (
                        <div className="p-3 rounded-lg bg-slate-800/40 border border-[var(--cf-border)] text-xs space-y-1">
                          <div className="font-semibold text-violet-300">
                            Régime horaire ({selectedEmp.contract?.weeklyHours ?? 35} h / semaine)
                          </div>
                          <div className="cf-muted">
                            Ce collaborateur n&apos;est pas au forfait jours annuel (218 j/an réservé aux contrats cadres en régime « days »). Consultez les onglets Congés Payés ou Historique.
                          </div>
                        </div>
                      ) : (
                        <>
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">
                          Compteur de forfait jour (CPT02 / ADM14-02)
                        </div>
                        <span className="cf-mono text-[11px] text-cyan-300">
                          Aide En savoir plus • Défilement annuel & mensuel
                        </span>
                      </div>
                      <table className="w-full text-[11px] text-left">
                        <thead className="cf-muted border-b border-[var(--cf-border)]">
                          <tr>
                            <th className="py-1.5 pr-3">Ligne officielle ADM14-02</th>
                            <th className="py-1.5 pr-2">Annuel</th>
                            <th className="py-1.5 pr-2">Juin</th>
                            <th className="py-1.5 pr-2">Juil</th>
                            <th className="py-1.5 pr-2">Août</th>
                            <th className="py-1.5 pr-2">Sept</th>
                            <th className="py-1.5 pr-2">Oct</th>
                            <th className="py-1.5">Nov</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--cf-border)] cf-mono">
                          <tr>
                            <td className="py-1.5 pr-3 font-sans font-medium">
                              Nombre de jours travaillés
                            </td>
                            <td className="py-1.5 pr-2">106 j</td>
                            <td className="py-1.5 pr-2">21</td>
                            <td className="py-1.5 pr-2">22</td>
                            <td className="py-1.5 pr-2">18</td>
                            <td className="py-1.5 pr-2">21</td>
                            <td className="py-1.5 pr-2">14</td>
                            <td className="py-1.5">10</td>
                          </tr>
                          <tr>
                            <td className="py-1.5 pr-3 font-sans font-medium">
                              Nombre de jours annuels (contrat)
                            </td>
                            <td className="py-1.5 pr-2">
                              {selectedEmp.contract?.annualDays ?? 218} j
                            </td>
                            <td className="py-1.5 pr-2">—</td>
                            <td className="py-1.5 pr-2">—</td>
                            <td className="py-1.5 pr-2">—</td>
                            <td className="py-1.5 pr-2">—</td>
                            <td className="py-1.5 pr-2">—</td>
                            <td className="py-1.5">—</td>
                          </tr>
                          <tr>
                            <td className="py-1.5 pr-3 font-sans font-medium">
                              Compteur de jours avant modification manuelle
                            </td>
                            <td className="py-1.5 pr-2">112 j</td>
                            <td className="py-1.5 pr-2">197</td>
                            <td className="py-1.5 pr-2">175</td>
                            <td className="py-1.5 pr-2">157</td>
                            <td className="py-1.5 pr-2">136</td>
                            <td className="py-1.5 pr-2">122</td>
                            <td className="py-1.5">112</td>
                          </tr>
                          <tr>
                            <td className="py-1.5 pr-3 font-sans font-medium">
                              Modifications manuelles du compteur
                            </td>
                            <td className="py-1.5 pr-2">0 j</td>
                            <td className="py-1.5 pr-2">0</td>
                            <td className="py-1.5 pr-2">0</td>
                            <td className="py-1.5 pr-2">0</td>
                            <td className="py-1.5 pr-2">0</td>
                            <td className="py-1.5 pr-2">0</td>
                            <td className="py-1.5">0</td>
                          </tr>
                          <tr>
                            <td className="py-1.5 pr-3 font-sans font-medium">
                              Compteur de jours après modification manuelle
                            </td>
                            <td className="py-1.5 pr-2">112 j</td>
                            <td className="py-1.5 pr-2">197</td>
                            <td className="py-1.5 pr-2">175</td>
                            <td className="py-1.5 pr-2">157</td>
                            <td className="py-1.5 pr-2">136</td>
                            <td className="py-1.5 pr-2">122</td>
                            <td className="py-1.5">112</td>
                          </tr>
                          <tr className="text-emerald-300 font-semibold">
                            <td className="py-1.5 pr-3 font-sans">Jours restants</td>
                            <td className="py-1.5 pr-2">112 j</td>
                            <td className="py-1.5 pr-2">197</td>
                            <td className="py-1.5 pr-2">175</td>
                            <td className="py-1.5 pr-2">157</td>
                            <td className="py-1.5 pr-2">136</td>
                            <td className="py-1.5 pr-2">122</td>
                            <td className="py-1.5">112</td>
                          </tr>
                        </tbody>
                      </table>
                        </>
                      )}
                    </div>
                  )}

                  {mc02CounterSubTab === 'history' && (
                    <div className="cf-card-secondary p-4 space-y-2">
                      <div className="font-semibold">
                        Historique des mouvements de compteurs (CPT04)
                      </div>
                      <div className="cf-muted">
                        Solde d’annualisation :{' '}
                        <span className="cf-mono">
                          {selectedEmp.counter.annualizationBalanceHours ?? 0} h
                        </span>{' '}
                        • Aucune écriture manuelle directe en mode lecture seule V1.16.
                      </div>
                    </div>
                  )}

                  {mc02CounterSubTab === 'cp' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="cf-card-secondary p-3">
                        <div className="cf-muted">CP N acquis</div>
                        <div className="text-base font-bold cf-mono">
                          {selectedEmp.counter.cpNAcquired} j
                        </div>
                      </div>
                      <div className="cf-card-secondary p-3">
                        <div className="cf-muted">CP N pris</div>
                        <div className="text-base font-bold cf-mono">
                          {selectedEmp.counter.cpNTaken} j
                        </div>
                      </div>
                      <div className="cf-card-secondary p-3">
                        <div className="cf-muted">Reliquat N-1</div>
                        <div className="text-base font-bold cf-mono text-emerald-400">
                          {selectedEmp.counter.cpNMinus1Remaining} j
                        </div>
                      </div>
                    </div>
                  )}

                  {mc02CounterSubTab === 'rtt' && (
                    <div className="cf-card-secondary p-4 space-y-3 overflow-x-auto">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-semibold">
                          Compteur de repos forfait jours (RTT · CPT04 / ADM14-03)
                        </div>
                        <span className="cf-mono text-[11px] text-violet-300">
                          Période annuelle (12 mois) : Solde{' '}
                          {!simulateRttUninitialized && effectiveRtt > 0
                            ? `${effectiveRtt} j`
                            : 'Non initialisé'}
                        </span>
                      </div>

                      {simulateRttUninitialized || effectiveRtt <= 0 ? (
                        <div className="cf-card p-4 border-amber-500/40 space-y-2">
                          <div className="font-semibold text-amber-300">
                            Accueil individuel : compteur RTT forfait jours non initialisé
                            (ADM14-03)
                          </div>
                          <div className="cf-muted">
                            Lignes affichées : Acquisition · RTT pris · Modifications manuelles ·
                            Solde restant (douze mois vides). En V1.16, ni initialisation ni calcul
                            n’ont été exécutés en session source.
                          </div>
                          {canInitRtt ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSimulateRttUninitialized(false);
                                setRttInitializedIds((prev) => ({
                                  ...prev,
                                  [selectedEmp.id]: 10,
                                }));
                                setModuleFeedback({
                                  kind: 'ok',
                                  text: `EXT-CPT04-01 : Compteur RTT forfait jours initialisé à 10 j pour ${selectedEmp.firstName} ${selectedEmp.lastName}.`,
                                });
                              }}
                              className="cf-brand-gradient text-white px-3.5 py-1.5 rounded-btn font-semibold"
                            >
                              Initialiser le compteur (EXT-CPT04-01)
                            </button>
                          ) : (
                            <div className="text-[11px] cf-muted">
                              Action Initialiser le compteur réservée aux profils autorisés.
                            </div>
                          )}
                        </div>
                      ) : (
                        <table className="w-full text-[11px] text-left">
                          <thead className="cf-muted border-b border-[var(--cf-border)]">
                            <tr>
                              <th className="py-1.5 pr-2">Indicateur RTT</th>
                              <th className="py-1.5 pr-2">Total</th>
                              {['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].map(
                                (m, idx) => (
                                  <th key={idx} className="py-1.5 pr-1">
                                    {m}
                                  </th>
                                )
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--cf-border)] cf-mono">
                            <tr>
                              <td className="py-1.5 pr-2 font-sans font-medium">Acquisition</td>
                              <td className="py-1.5 pr-2">{effectiveRtt} j</td>
                              <td colSpan={12} className="py-1.5 cf-muted">
                                Période annuelle 12 mois active
                              </td>
                            </tr>
                            <tr>
                              <td className="py-1.5 pr-2 font-sans font-medium">RTT pris</td>
                              <td className="py-1.5 pr-2">0 j</td>
                              <td colSpan={12} className="py-1.5 cf-muted">
                                0 j
                              </td>
                            </tr>
                            <tr>
                              <td className="py-1.5 pr-2 font-sans font-medium">
                                Modifications manuelles
                              </td>
                              <td className="py-1.5 pr-2">0 j</td>
                              <td colSpan={12} className="py-1.5 cf-muted">
                                0 j
                              </td>
                            </tr>
                            <tr className="text-emerald-300 font-semibold">
                              <td className="py-1.5 pr-2 font-sans">Solde restant</td>
                              <td className="py-1.5 pr-2">{effectiveRtt} j</td>
                              <td colSpan={12} className="py-1.5">
                                {effectiveRtt} j disponibles
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {renderSourceDrawer()}
      </div>
    );
  };

  // =========================================================================
  // MC04 — Demandes et disponibilités (ABS01, ABS02, DIS01, DIS02, AMB14-03)
  // =========================================================================
  const renderMc04 = () => {
    const canManageRequests = can('ORG04-17');
    const canAskLeave = can('ORG04-19');
    const canAskDisp = can('ORG04-18');
    const empMap = new Map(
      dashboard.visibleEmployees.map((e) => [e.id, `${e.firstName} ${e.lastName}`])
    );
    const allMine = [
      ...localRequests.filter((r) => r.employeeId === dashboard.session.employee.id),
      ...dashboard.myRequests,
    ].map((r) => ({
      ...r,
      status: requestStatusOverrides[r.id] ?? r.status,
    }));
    const allTeam = dashboard.teamRequests.map((r) => ({
      ...r,
      status: requestStatusOverrides[r.id] ?? r.status,
    }));

    return (
      <div className="space-y-5">
        <div className="cf-card p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs cf-mono text-violet-300">
              MC04 • ABS01, ABS02, DIS01, DIS02 & règle AMB14-03
            </div>
            <h1 className="text-xl font-bold mt-1">
              Demandes d’absences, validations & disponibilités
            </h1>
          </div>
          <span className="text-xs cf-mono px-3 py-1 rounded-btn bg-violet-500/15 text-violet-300">
            {allMine.length} demande(s) perso · {allTeam.length} équipe
          </span>
        </div>

        {renderFeedbackBanner()}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="cf-card p-4 space-y-3 text-xs">
            <h2 className="font-semibold text-sm">Déposer une demande d’absence (ABS01)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="cf-muted block mb-1">Motif</label>
                <select
                  value={reqMotive}
                  onChange={(e) => setReqMotive(e.target.value)}
                  className="cf-input w-full px-3 py-2"
                >
                  <option>Congés payés</option>
                  <option>RTT</option>
                  <option>Récupération / RCR</option>
                  <option>Congé sans solde</option>
                  <option>Télétravail administratif</option>
                </select>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reqConflictSim}
                    onChange={(e) => setReqConflictSim(e.target.checked)}
                  />
                  <span>Signaler conflit shift (AMB14-03)</span>
                </label>
              </div>
              <div>
                <label className="cf-muted block mb-1">Du</label>
                <input
                  type="date"
                  value={reqStart}
                  onChange={(e) => setReqStart(e.target.value)}
                  className="cf-input w-full px-3 py-2 cf-mono"
                />
              </div>
              <div>
                <label className="cf-muted block mb-1">Au</label>
                <input
                  type="date"
                  value={reqEnd}
                  onChange={(e) => setReqEnd(e.target.value)}
                  className="cf-input w-full px-3 py-2 cf-mono"
                />
              </div>
            </div>
            <input
              type="text"
              placeholder="Commentaire facultatif pour le responsable..."
              value={reqComment}
              onChange={(e) => setReqComment(e.target.value)}
              className="cf-input w-full px-3 py-2"
            />
            <button
              type="button"
              disabled={!canAskLeave}
              onClick={() => {
                const siteId =
                  dashboard.session.activeSiteId === 'all'
                    ? dashboard.session.activeAccess.siteId
                    : dashboard.session.activeSiteId;
                setLocalRequests((prev) => [
                  {
                    id: `req-local-${Date.now()}`,
                    employeeId: dashboard.session.employee.id,
                    siteId,
                    motive: reqMotive,
                    startDate: reqStart,
                    endDate: reqEnd,
                    status: 'pending',
                    comment: reqConflictSim
                      ? 'Conflit potentiel avec shift publié (AMB14-03 à arbitrer)'
                      : reqComment || 'Demande collaborateur',
                  },
                  ...prev,
                ]);
                setReqComment('');
                setModuleFeedback({
                  kind: 'ok',
                  text: `Demande « ${reqMotive} » enregistrée (${reqStart} → ${reqEnd}).`,
                });
              }}
              className="cf-brand-gradient text-white px-4 py-2 rounded-btn font-semibold disabled:opacity-40"
            >
              Envoyer ma demande
            </button>
          </div>

          <div className="cf-card p-4 space-y-3 text-xs">
            <h2 className="font-semibold text-sm">Mes disponibilités récurrentes (DIS01 / DIS02)</h2>
            <p className="cf-muted">
              Cliquez sur un jour pour basculer votre disponibilité ({canAskDisp ? 'modifiable ORG04-18' : 'lecture seule'}).
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(weeklyAvailability).map(([day, st]) => (
                <button
                  key={day}
                  type="button"
                  disabled={!canAskDisp}
                  onClick={() => {
                    const order: Array<'Disponible' | 'Indisponible' | 'Préférence matin'> = [
                      'Disponible',
                      'Préférence matin',
                      'Indisponible',
                    ];
                    const next = order[(order.indexOf(st) + 1) % order.length];
                    setWeeklyAvailability((prev) => ({ ...prev, [day]: next }));
                  }}
                  className={`p-2.5 rounded-btn text-left border transition-colors ${
                    st === 'Disponible'
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                      : st === 'Indisponible'
                        ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                        : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                  }`}
                >
                  <div className="font-semibold">{day}</div>
                  <div className="text-[11px] mt-0.5">{st}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          <div className="cf-card p-4 space-y-2.5">
            <h3 className="font-semibold text-sm">Mes demandes ({allMine.length})</h3>
            {allMine.map((r) => (
              <div key={r.id} className="cf-card-secondary p-3 flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">{r.motive}</div>
                  <div className="cf-muted">{r.startDate} → {r.endDate} · {r.comment}</div>
                </div>
                <span className="cf-mono px-2 py-0.5 rounded bg-violet-500/20 text-violet-300">
                  {r.status}
                </span>
              </div>
            ))}
          </div>

          <div className="cf-card p-4 space-y-2.5">
            <h3 className="font-semibold text-sm">
              Validations équipe ({allTeam.length}) — {canManageRequests ? 'ORG04-17 actif' : 'Non autorisé'}
            </h3>
            {allTeam.length === 0 ? (
              <div className="cf-muted">Aucune demande équipe dans votre périmètre.</div>
            ) : (
              allTeam.map((r) => (
                <div key={r.id} className="cf-card-secondary p-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">
                      {empMap.get(r.employeeId) ?? r.employeeId} — {r.motive}
                    </div>
                    <div className="cf-muted">{r.startDate} → {r.endDate} · Statut : {r.status}</div>
                  </div>
                  {canManageRequests && r.status === 'pending' && (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setRequestStatusOverrides((p) => ({ ...p, [r.id]: 'accepted' }));
                          setModuleFeedback({ kind: 'ok', text: `Demande ${r.id} acceptée.` });
                        }}
                        className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      >
                        Accepter
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRequestStatusOverrides((p) => ({ ...p, [r.id]: 'refused' }));
                          setModuleFeedback({ kind: 'err', text: `Demande ${r.id} refusée.` });
                        }}
                        className="px-2.5 py-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40"
                      >
                        Refuser
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {renderSourceDrawer()}
      </div>
    );
  };

  // =========================================================================
  // MC05 — Temps, Pointeuse & Tâches (BAD01-03, EXT04-05, TST15)
  // =========================================================================
  const renderMc05 = () => {
    const canViewTimeclock = can('ORG04-35');
    const canEditTimeclock = can('ORG04-36');
    const currentSite = dashboard.sites[0];
    const shiftTasks = dashboard.teamShifts.flatMap((sh) =>
      sh.tasks.map((t, idx) => ({
        id: `${sh.id}-t-${idx}`,
        label: t,
        shiftRef: `${sh.date} (${sh.startTime}–${sh.endTime})`,
      }))
    );
    const allTasks = [...shiftTasks, ...customTasks];

    const recordPunch = (actionLabel: string) => {
      const now = new Date();
      const hhmm = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      setClockLog((prev) => [
        {
          id: `clk-${Date.now()}`,
          time: hhmm,
          action: `${actionLabel} (badge brut OBJ19 immuable)`,
          club: currentSite?.name ?? 'C.FITNESS Carré de Soie',
        },
        ...prev,
      ]);
      setModuleFeedback({
        kind: 'ok',
        text: `Pointage enregistré à ${hhmm} : ${actionLabel}.`,
      });
    };

    return (
      <div className="space-y-5">
        <div className="cf-card p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs cf-mono text-violet-300 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              MC05 • BAD01–BAD03, EXT04–EXT05 (Tâches) & OBJ19/OBJ20
            </div>
            <h1 className="text-xl font-bold mt-1">
              Tâches opérationnelles, badgeuse tablette & anomalies
            </h1>
          </div>
          {currentSite && (
            <span className="text-xs cf-mono px-3 py-1 rounded-btn bg-violet-500/15 text-violet-200">
              {currentSite.name} : {currentSite.settings.badgeFrequency === 'each_shift' ? 'Chaque shift' : 'Série consécutive'} · Pause badgée : {currentSite.settings.tabletBreakBadging ? 'Oui' : 'Non'}
            </span>
          )}
        </div>

        {renderFeedbackBanner()}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          {/* Pointeuse temps réel */}
          <div className="cf-card p-4 space-y-3">
            <h2 className="font-semibold text-sm">Ma pointeuse tablette / navigateur (BAD03)</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => recordPunch('Arrivée')}
                className="cf-brand-gradient text-white py-2 px-3 rounded-btn font-semibold"
              >
                Arrivée
              </button>
              <button
                type="button"
                disabled={!currentSite?.settings.tabletBreakBadging}
                onClick={() => recordPunch('Début pause')}
                className="cf-card-secondary py-2 px-3 disabled:opacity-40"
              >
                Début pause
              </button>
              <button
                type="button"
                disabled={!currentSite?.settings.tabletBreakBadging}
                onClick={() => recordPunch('Fin pause')}
                className="cf-card-secondary py-2 px-3 disabled:opacity-40"
              >
                Fin pause
              </button>
              <button
                type="button"
                onClick={() => recordPunch('Départ')}
                className="cf-card-secondary py-2 px-3 hover:border-rose-500/60"
              >
                Départ
              </button>
            </div>
            <div className="space-y-1.5 pt-1">
              {clockLog.map((c) => (
                <div key={c.id} className="cf-card-secondary p-2.5 flex justify-between">
                  <span className="cf-mono text-cyan-300 font-semibold">{c.time}</span>
                  <span>{c.action}</span>
                  <span className="cf-muted">{c.club}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tâches EXT04 / EXT05 */}
          <div className="cf-card p-4 space-y-3">
            <h2 className="font-semibold text-sm">Suivi des tâches liées aux shifts (EXT04 / EXT05)</h2>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ajouter une tâche club (ex: contrôle vestiaires 20h)..."
                value={newTaskLabel}
                onChange={(e) => setNewTaskLabel(e.target.value)}
                className="cf-input flex-1 px-3 py-1.5"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newTaskLabel.trim()) return;
                  setCustomTasks((p) => [
                    { id: `ct-${Date.now()}`, label: newTaskLabel.trim(), shiftRef: 'Aujourd’hui' },
                    ...p,
                  ]);
                  setNewTaskLabel('');
                }}
                className="cf-brand-gradient text-white px-3 py-1.5 rounded-btn flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Ajouter
              </button>
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {allTasks.map((t) => (
                <label
                  key={t.id}
                  className="cf-card-secondary p-2.5 flex items-center justify-between gap-2 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(completedTasks[t.id])}
                      onChange={(e) =>
                        setCompletedTasks((p) => ({ ...p, [t.id]: e.target.checked }))
                      }
                    />
                    <span className={completedTasks[t.id] ? 'line-through cf-muted' : ''}>
                      {t.label}
                    </span>
                  </div>
                  <span className="cf-mono text-[10px] cf-muted">{t.shiftRef}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Anomalies badgeuse */}
        <div className="cf-card p-4 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-sm">
                Comparatif Prévu / Badgé brut (OBJ19) / Retenu rémunéré (OBJ20 — TST15)
              </h2>
              <div className="text-[11px] cf-muted mt-0.5">
                Site comparé Beynost ({CLUB_COMPARISON.badge_history.dates_checked[0]} →{' '}
                {CLUB_COMPARISON.badge_history.dates_checked[CLUB_COMPARISON.badge_history.dates_checked.length - 1]})
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-[11px] cf-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={simulateBeynostEmptyBadgeHistory}
                  onChange={(e) => setSimulateBeynostEmptyBadgeHistory(e.target.checked)}
                />
                Simuler état Beynost 7 jours vide (CAP-ADM13-98)
              </label>
              {canEditTimeclock && !simulateBeynostEmptyBadgeHistory && (
                <input
                  type="text"
                  value={anomalyNoteInput}
                  onChange={(e) => setAnomalyNoteInput(e.target.value)}
                  placeholder="Motif de correction non destructive..."
                  className="cf-input px-3 py-1 w-64"
                />
              )}
            </div>
          </div>

          {simulateBeynostEmptyBadgeHistory ? (
            <div className="space-y-3 overflow-x-auto">
              <div className="cf-card-secondary p-3 border-amber-500/40 text-amber-200 font-medium">
                {CLUB_COMPARISON.badge_history.state}
              </div>
              <table className="w-full text-[11px] text-left">
                <thead className="cf-muted border-b border-[var(--cf-border)]">
                  <tr>
                    {CLUB_COMPARISON.badge_history.columns.map((col, idx) => (
                      <th key={idx} className="py-2 pr-2.5 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--cf-border)]">
                  {CLUB_COMPARISON.badge_history.dates_checked.map((d) => (
                    <tr key={d}>
                      <td className="py-2 pr-2.5 cf-muted">—</td>
                      <td className="py-2 pr-2.5 cf-muted">—</td>
                      <td className="py-2 pr-2.5 cf-muted">—</td>
                      <td className="py-2 pr-2.5 cf-muted">—</td>
                      <td className="py-2 pr-2.5 cf-muted">—</td>
                      <td className="py-2 pr-2.5 cf-muted">—</td>
                      <td className="py-2 pr-2.5 cf-muted">—</td>
                      <td className="py-2 pr-2.5 cf-muted">—</td>
                      <td className="py-2 pr-2.5 cf-muted">—</td>
                      <td className="py-2 pr-2.5 cf-mono text-cyan-300">{d}</td>
                      <td className="py-2 cf-muted">Aucune correction</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !canViewTimeclock && dashboard.anomalies.length === 0 ? (
            <div className="cf-muted">Aucune anomalie visible sur votre périmètre.</div>
          ) : (
            <div className="space-y-2">
              {dashboard.anomalies.map((an) => {
                const over = anomalyOverrides[an.id];
                const finalStatus = over?.status ?? an.status;
                return (
                  <div
                    key={an.id}
                    className="cf-card-secondary p-3 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-semibold">
                        {an.date} · Écart{' '}
                        <span className="cf-mono text-amber-300">
                          {an.deltaMinutes > 0 ? `+${an.deltaMinutes}` : an.deltaMinutes} min
                        </span>
                      </div>
                      <div className="cf-muted">
                        Prévu : {an.plannedRange} · Badgé brut (conservé) : {an.punchedRange} · Statut : {finalStatus}
                        {over ? ` (${over.note})` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-emerald-300">
                        {an.hasProofPhoto ? 'Preuve photo' : 'Preuve masquée (EX27)'}
                      </span>
                      {canEditTimeclock && finalStatus === 'to_review' && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setAnomalyOverrides((p) => ({
                                ...p,
                                [an.id]: { status: 'validated', note: anomalyNoteInput },
                              }));
                              setModuleFeedback({
                                kind: 'ok',
                                text: `Correction OBJ20 enregistrée sans écraser OBJ19 (${an.punchedRange}).`,
                              });
                            }}
                            className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                          >
                            Valider retenu
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setAnomalyOverrides((p) => ({
                                ...p,
                                [an.id]: { status: 'ignored', note: anomalyNoteInput },
                              }))
                            }
                            className="px-2.5 py-1 rounded bg-slate-700/60"
                          >
                            Ignorer
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {renderSourceDrawer()}
      </div>
    );
  };

  // =========================================================================
  // MC06 — Documents et signatures RH (DOC01-04, EDI01-02, EXT-DOC04-01..08)
  // =========================================================================
  const renderMc06 = () => {
    const canManageTeamDocs = can('ORG04-14');
    const canUploadOwn = can('ORG04-21');
    const canEditTemplates = can('ORG04-34');
    const selfName = `${dashboard.session.employee.firstName} ${dashboard.session.employee.lastName}`;
    const q = docSearch.trim().toLowerCase();

    const filteredDocs = docs.filter((d) => {
      if (!canManageTeamDocs && d.employeeName !== selfName) return false;
      if (docFolderFilter !== 'Tous' && d.folder !== docFolderFilter) return false;
      if (docStatusFilter !== 'Tous' && d.signatureStatus !== docStatusFilter) return false;
      if (
        q &&
        !d.title.toLowerCase().includes(q) &&
        !d.employeeName.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });

    const sigHasDraftFilter =
      sigDraftSearch.trim() !== '' ||
      sigDraftRecipient !== 'Tous' ||
      sigDraftFolders.length > 0 ||
      sigDraftStatuses.length > 0;
    const sigRecipients = Array.from(new Set(sigRows.map((r) => r.signatory)));
    const sq = sigAppliedSearch.trim().toLowerCase();
    const filteredSigRows = sigRows.filter((row) => {
      if (!canManageTeamDocs && !row.signatory.includes(selfName)) return false;
      if (sigAppliedRecipient !== 'Tous' && row.signatory !== sigAppliedRecipient) return false;
      if (sigAppliedFolders.length > 0 && !sigAppliedFolders.includes(row.folder)) return false;
      if (sigAppliedStatuses.length > 0 && !sigAppliedStatuses.includes(row.status)) return false;
      if (
        sq &&
        !row.signatory.toLowerCase().includes(sq) &&
        !row.document.toLowerCase().includes(sq) &&
        !row.folder.toLowerCase().includes(sq) &&
        !row.status.toLowerCase().includes(sq)
      ) {
        return false;
      }
      return true;
    });

    return (
      <div className="space-y-5">
        <div className="cf-card p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs cf-mono text-emerald-300 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              MC06 • DOC01–DOC04, EDI01–EDI02 & suivi signatures EXT-DOC04
            </div>
            <h1 className="text-xl font-bold mt-1">
              Documents RH, coffre salarié & suivi de signatures
            </h1>
          </div>
          <span className="cf-mono text-xs px-3 py-1 rounded-btn bg-emerald-500/15 text-emerald-300">
            {filteredDocs.length} document(s) accessible(s)
          </span>
        </div>

        {renderFeedbackBanner()}

        {/* ADM14-D01 : Appliquer à un modèle de document (DOC01 — 5 modèles dont 2 rouges non sélectionnables) */}
        <div className="cf-card p-4 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-sm">
                Appliquer à un modèle de document (DOC01 · ADM14-D01)
              </h2>
              <p className="cf-muted text-[11px]">
                5 modèles relevés V1.16 : 3 sélectionnables et 2 visuellement grisés avec indicateur rouge.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedTemplateId('')}
                className="cf-card-secondary px-3 py-1.5"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={!selectedTemplateId}
                onClick={() => {
                  const chosen = DOC_TEMPLATE_MODELS.find((m) => m.id === selectedTemplateId);
                  if (!chosen) return;
                  setTemplateDraft(
                    `[${chosen.title}] Modèle appliqué pour {{employe.prenom}} {{employe.nom}} ({{club.nom}}) — {{date.effet}}.`
                  );
                  setModuleFeedback({
                    kind: 'ok',
                    text: `ADM14-D01 : Modèle « ${chosen.title} » appliqué dans l’éditeur EDI01/02.`,
                  });
                }}
                className="cf-brand-gradient text-white px-3.5 py-1.5 rounded-btn font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Appliquer ce modèle
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {DOC_TEMPLATE_MODELS.map((tpl) => {
              const isSelected = selectedTemplateId === tpl.id;
              return (
                <div
                  key={tpl.id}
                  className={`cf-card-secondary p-3 space-y-1.5 border ${
                    !tpl.selectable
                      ? 'opacity-55 border-red-500/50'
                      : isSelected
                        ? 'border-violet-500 bg-violet-500/10'
                        : 'border-[var(--cf-border)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold">{tpl.title}</div>
                    {!tpl.selectable && (
                      <span
                        title="Indicateur rouge (ADM14-D01)"
                        className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 mt-1"
                      />
                    )}
                  </div>
                  <div className="cf-mono text-[10px] cf-muted">
                    {tpl.date} · Auteur : {tpl.author}
                  </div>
                  <div className="text-[11px] cf-muted">{tpl.note}</div>
                  {tpl.selectable ? (
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedTemplateId(isSelected ? '' : tpl.id)
                      }
                      className={`px-2.5 py-1 rounded text-[11px] font-medium ${
                        isSelected
                          ? 'bg-violet-500/30 text-violet-200 border border-violet-400'
                          : 'cf-card hover:border-violet-500/60'
                      }`}
                    >
                      {isSelected ? 'Sélectionné' : 'Sélectionner'}
                    </button>
                  ) : (
                    <span className="inline-block cf-mono text-[10px] text-red-300">
                      Grisé / indisponible
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ADM14-D02 & ADM14-D03 : Suivi des signatures Beynost + Filtres (EXT-DOC04-01..08) */}
        <div className="cf-card p-4 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-sm">
                Suivi des signatures (DOC04 · ADM14-D02 / ADM14-D03 — Beynost)
              </h2>
              <p className="cf-muted text-[11px]">
                Échantillon V1.16 : {SIGNATURES_JOURNAL_V116.sample_signature_rows.send_error} Erreur d’envoi,{' '}
                {SIGNATURES_JOURNAL_V116.sample_signature_rows.pending_0_of_1} en 0/1,{' '}
                {SIGNATURES_JOURNAL_V116.sample_signature_rows.signed_1_of_1} en 1/1 (données nominatives fictives).
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setModuleFeedback({
                    kind: 'ok',
                    text: 'ADM14-D02 : Relance groupée des documents non signés (simulation lecture seule V1.16).',
                  })
                }
                className="cf-card-secondary px-3 py-1.5 hover:border-amber-500/60"
              >
                Relancer les documents non signés
              </button>
              <button
                type="button"
                onClick={() => setOpenSigMenuRowId(null)}
                className="cf-card-secondary px-3 py-1.5"
              >
                Fermer
              </button>
            </div>
          </div>

          {/* Panneau Filtres ADM14-D03 (EXT-DOC04-01..06) */}
          <div className="cf-card-secondary p-3.5 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="cf-muted block mb-1">Recherche (EXT-DOC04-01)</label>
                <input
                  type="text"
                  value={sigDraftSearch}
                  onChange={(e) => setSigDraftSearch(e.target.value)}
                  placeholder="Rechercher signataire, document, statut..."
                  className="cf-input w-full px-3 py-1.5"
                />
              </div>
              <div>
                <label className="cf-muted block mb-1">Destinataire(s) (EXT-DOC04-02)</label>
                <select
                  value={sigDraftRecipient}
                  onChange={(e) => setSigDraftRecipient(e.target.value)}
                  className="cf-input w-full px-3 py-1.5"
                >
                  <option value="Tous">Tous les destinataires</option>
                  {sigRecipients.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="font-semibold mb-1.5">
                  Dossiers — {SIGNATURES_JOURNAL_V116.signature_folder_choices.length} catégories (EXT-DOC04-03)
                </div>
                <div className="flex flex-wrap gap-2">
                  {SIGNATURES_JOURNAL_V116.signature_folder_choices.map((folder) => {
                    const checked = sigDraftFolders.includes(folder);
                    return (
                      <label
                        key={folder}
                        className="flex items-center gap-1.5 cf-card px-2 py-1 cursor-pointer text-[11px]"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setSigDraftFolders((prev) =>
                              e.target.checked
                                ? [...prev, folder]
                                : prev.filter((x) => x !== folder)
                            )
                          }
                        />
                        {folder}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="font-semibold mb-1.5">
                  Statuts — {SIGNATURES_JOURNAL_V116.signature_status_choices.length} choix (EXT-DOC04-04)
                </div>
                <div className="flex flex-wrap gap-2">
                  {SIGNATURES_JOURNAL_V116.signature_status_choices.map((st) => {
                    const checked = sigDraftStatuses.includes(st);
                    return (
                      <label
                        key={st}
                        className="flex items-center gap-1.5 cf-card px-2 py-1 cursor-pointer text-[11px]"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setSigDraftStatuses((prev) =>
                              e.target.checked
                                ? [...prev, st]
                                : prev.filter((x) => x !== st)
                            )
                          }
                        />
                        {st}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={!sigHasDraftFilter}
                onClick={() => {
                  setSigDraftSearch('');
                  setSigDraftRecipient('Tous');
                  setSigDraftFolders([]);
                  setSigDraftStatuses([]);
                  setSigAppliedSearch('');
                  setSigAppliedRecipient('Tous');
                  setSigAppliedFolders([]);
                  setSigAppliedStatuses([]);
                }}
                className="cf-card px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Tout effacer (EXT-DOC04-05)
              </button>
              <button
                type="button"
                onClick={() => {
                  setSigAppliedSearch(sigDraftSearch);
                  setSigAppliedRecipient(sigDraftRecipient);
                  setSigAppliedFolders([...sigDraftFolders]);
                  setSigAppliedStatuses([...sigDraftStatuses]);
                }}
                className="cf-brand-gradient text-white px-3.5 py-1.5 rounded-btn font-semibold"
              >
                Appliquer les filtres (EXT-DOC04-06)
              </button>
            </div>
          </div>

          {/* Tableau 7 colonnes Suivi des signatures */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="cf-muted border-b border-[var(--cf-border)]">
                <tr>
                  <th className="py-2 pr-3">Signataire(s)</th>
                  <th className="py-2 pr-3">Document</th>
                  <th className="py-2 pr-3">Dossier</th>
                  <th className="py-2 pr-3">Signature(s)</th>
                  <th className="py-2 pr-3">Date d’envoi</th>
                  <th className="py-2 pr-3">Dernière relance</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--cf-border)]">
                {filteredSigRows.map((row) => (
                  <tr key={row.id}>
                    <td className="py-2.5 pr-3 font-medium">{row.signatory}</td>
                    <td className="py-2.5 pr-3">{row.document}</td>
                    <td className="py-2.5 pr-3 cf-mono">{row.folder}</td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`cf-mono text-[10px] px-2 py-0.5 rounded-full ${
                          row.status === 'Signé'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : row.status === 'Erreur d’envoi'
                              ? 'bg-rose-500/20 text-rose-300'
                              : row.status === 'Envoi annulé'
                                ? 'bg-slate-700/60 cf-muted'
                                : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {row.signatureProgress} · {row.status}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 cf-mono">{row.sentDate}</td>
                    <td className="py-2.5 pr-3 cf-muted">{row.lastReminder}</td>
                    <td className="py-2.5">
                      {row.status === 'Erreur d’envoi' ? (
                        <div className="space-y-1">
                          <button
                            type="button"
                            aria-label="Menu actions ligne signature"
                            onClick={() =>
                              setOpenSigMenuRowId(
                                openSigMenuRowId === row.id ? null : row.id
                              )
                            }
                            className="cf-card-secondary px-2.5 py-1 font-bold hover:border-violet-500/60"
                          >
                            ⋮
                          </button>
                          {openSigMenuRowId === row.id && (
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setSigRows((prev) =>
                                    prev.map((x) =>
                                      x.id === row.id
                                        ? {
                                            ...x,
                                            status: 'En cours de signature',
                                            lastReminder: 'Relancé en session',
                                          }
                                        : x
                                    )
                                  );
                                  setOpenSigMenuRowId(null);
                                  setModuleFeedback({
                                    kind: 'ok',
                                    text: `EXT-DOC04-07 : Demande « ${row.document} » renvoyée pour signature (simulation).`,
                                  });
                                }}
                                className="cf-input px-2 py-1 text-emerald-300"
                              >
                                Renvoyer pour signature (EXT-DOC04-07)
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSigRows((prev) =>
                                    prev.map((x) =>
                                      x.id === row.id
                                        ? {
                                            ...x,
                                            status: 'Envoi annulé',
                                            lastReminder: 'Annulé en session',
                                          }
                                        : x
                                    )
                                  );
                                  setOpenSigMenuRowId(null);
                                  setModuleFeedback({
                                    kind: 'ok',
                                    text: `EXT-DOC04-08 : Demande de signature « ${row.document} » annulée (simulation).`,
                                  });
                                }}
                                className="cf-input px-2 py-1 text-rose-300"
                              >
                                Annuler la demande de signature (EXT-DOC04-08)
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="cf-muted text-[11px]">
                          {row.status === 'Signé'
                            ? 'Aucun menu requis (ADM14-D04)'
                            : 'En attente signature'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Filtres dossiers & statuts + ajout document */}
        <div className="cf-card p-4 space-y-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-3.5 h-3.5 cf-muted" />
            {['Tous', 'Contrats', 'Bulletins de paie', 'Justificatifs', 'Chartes Club'].map(
              (folder) => (
                <button
                  key={folder}
                  type="button"
                  onClick={() => setDocFolderFilter(folder)}
                  className={`px-3 py-1.5 rounded-btn flex items-center gap-1.5 ${
                    docFolderFilter === folder
                      ? 'cf-brand-gradient text-white font-semibold'
                      : 'cf-card-secondary'
                  }`}
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  {folder}
                </button>
              )
            )}
            <select
              value={docStatusFilter}
              onChange={(e) => setDocStatusFilter(e.target.value)}
              className="cf-input px-2.5 py-1.5"
            >
              <option value="Tous">Tous statuts</option>
              <option value="signed">Signé</option>
              <option value="pending">En attente</option>
              <option value="error">Erreur (EXT-DOC04)</option>
            </select>
            <input
              type="text"
              placeholder="Rechercher un document ou salarié..."
              value={docSearch}
              onChange={(e) => setDocSearch(e.target.value)}
              className="cf-input flex-1 min-w-[180px] px-3 py-1.5"
            />
          </div>

          {(canUploadOwn || canManageTeamDocs) && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--cf-border)]">
              <input
                type="text"
                placeholder="Titre du document à ajouter (ex: Justificatif transport 2026)..."
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
                className="cf-input flex-1 min-w-[220px] px-3 py-1.5"
              />
              <select
                value={newDocFolder}
                onChange={(e) =>
                  setNewDocFolder(e.target.value as RhDocumentItem['folder'])
                }
                className="cf-input px-3 py-1.5"
              >
                <option value="Contrats">Contrats</option>
                <option value="Bulletins de paie">Bulletins de paie</option>
                <option value="Justificatifs">Justificatifs</option>
                <option value="Chartes Club">Chartes Club</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  if (!newDocTitle.trim()) return;
                  setDocs((prev) => [
                    {
                      id: `doc-${Date.now()}`,
                      title: newDocTitle.trim(),
                      folder: newDocFolder,
                      employeeName: selfName,
                      siteName: dashboard.sites[0]?.name ?? 'C.FITNESS Carré de Soie',
                      date: '2026-11-14',
                      signatureStatus: 'pending',
                    },
                    ...prev,
                  ]);
                  setNewDocTitle('');
                  setModuleFeedback({
                    kind: 'ok',
                    text: 'Document ajouté dans le coffre et mis en attente de signature.',
                  });
                }}
                className="cf-brand-gradient text-white px-3.5 py-1.5 rounded-btn font-semibold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Importer / Créer
              </button>
            </div>
          )}
        </div>

        {/* Liste des documents */}
        <div className="cf-card p-4 overflow-x-auto text-xs">
          <table className="w-full text-left">
            <thead className="cf-muted border-b border-[var(--cf-border)]">
              <tr>
                <th className="py-2 pr-3">Document</th>
                <th className="py-2 pr-3">Dossier</th>
                <th className="py-2 pr-3">Collaborateur / Club</th>
                <th className="py-2 pr-3">Statut signature (DOC04)</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--cf-border)]">
              {filteredDocs.map((d) => (
                <tr key={d.id}>
                  <td className="py-3 pr-3 font-medium">
                    <div>{d.title}</div>
                    <div className="cf-mono text-[10px] cf-muted">{d.date}</div>
                  </td>
                  <td className="py-3 pr-3 cf-mono">{d.folder}</td>
                  <td className="py-3 pr-3">
                    <div>{d.employeeName}</div>
                    <div className="text-[11px] cf-muted">{d.siteName}</div>
                  </td>
                  <td className="py-3 pr-3">
                    <span
                      className={`cf-mono text-[10px] px-2 py-0.5 rounded-full ${
                        d.signatureStatus === 'signed'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : d.signatureStatus === 'error'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {d.signatureStatus === 'signed'
                        ? 'Signé'
                        : d.signatureStatus === 'error'
                          ? 'Erreur d’envoi'
                          : 'En attente'}
                    </span>
                  </td>
                  <td className="py-3 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPreviewDoc(d)}
                      className="cf-card-secondary px-2.5 py-1"
                    >
                      Aperçu
                    </button>
                    {canManageTeamDocs && d.signatureStatus !== 'signed' && (
                      <button
                        type="button"
                        onClick={() => {
                          setDocs((prev) =>
                            prev.map((x) =>
                              x.id === d.id ? { ...x, signatureStatus: 'signed' } : x
                            )
                          );
                          setModuleFeedback({
                            kind: 'ok',
                            text: `EXT-DOC04 : Document « ${d.title} » renvoyé et marqué signé (simulation).`,
                          });
                        }}
                        className="cf-input px-2.5 py-1 text-emerald-300"
                      >
                        Renvoyer / Valider
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {previewDoc && (
          <div className="cf-card p-5 border-emerald-500/40 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="font-bold text-sm">Aperçu : {previewDoc.title}</div>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="cf-card-secondary px-3 py-1"
              >
                Fermer
              </button>
            </div>
            <p className="cf-muted">
              Titulaire : {previewDoc.employeeName} · Établissement : {previewDoc.siteName} · Dossier : {previewDoc.folder}
            </p>
          </div>
        )}

        {/* Éditeur de modèles EDI01 / EDI02 */}
        <div className="cf-card p-4 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold text-sm">
              Éditeur de modèles & variables dynamiques (EDI01 / EDI02)
            </div>
            <span className="cf-mono text-[10px] cf-muted">
              {canEditTemplates ? 'Édition autorisée (ORG04-34)' : 'Consultation seule'}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATE_VARIABLES.map((v) => (
              <button
                key={v}
                type="button"
                disabled={!canEditTemplates}
                onClick={() => setTemplateDraft((t) => `${t} ${v}`)}
                className="cf-mono text-[11px] px-2 py-1 rounded bg-violet-500/15 text-violet-200 border border-violet-500/30 disabled:opacity-40"
              >
                + {v}
              </button>
            ))}
          </div>
          <textarea
            rows={3}
            readOnly={!canEditTemplates}
            value={templateDraft}
            onChange={(e) => setTemplateDraft(e.target.value)}
            className="cf-input w-full p-3 text-xs"
          />
        </div>

        {renderSourceDrawer()}
      </div>
    );
  };

  // =========================================================================
  // MC07 — Finances & Préparation de paie (RAP01, RAP02, EXP01-05)
  // =========================================================================
  const renderMc07 = () => {
    const canEditPrimes = can('ORG04-25');
    const canEditExport = can('ORG04-24');

    const handleDownloadCsv = () => {
      const headers = [
        'Matricule',
        'Collaborateur',
        'Contrat',
        'HeuresHebdo',
        'BrutMensuelEUR',
        'PrimesAvancesEUR',
      ];
      const rows = dashboard.visibleEmployees.map((emp) => {
        const extraTotal = payrollExtras
          .filter((x) => x.employeeId === emp.id)
          .reduce((acc, x) => acc + x.amountEur, 0);
        return [
          emp.matricule,
          `${emp.firstName} ${emp.lastName}`,
          emp.contract?.contractType ?? '-',
          emp.contract?.weeklyHours ?? emp.contract?.annualDays ?? '-',
          emp.contract?.monthlyGrossEur != null
            ? String(emp.contract.monthlyGrossEur)
            : 'MASQUE_ORG04_10',
          String(extraTotal),
        ].join(';');
      });
      const csv = [headers.join(';'), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cfitness_preparation_paie_2026_11.csv';
      a.click();
      URL.revokeObjectURL(url);
      setModuleFeedback({
        kind: 'ok',
        text: 'Export CSV paie téléchargé (données salariales masquées automatiquement sans ORG04-10).',
      });
    };

    return (
      <div className="space-y-5">
        <div className="cf-card p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs cf-mono text-amber-300 flex items-center gap-2">
              <Euro className="w-4 h-4" />
              MC07 • Finances, Rapport mensuel de paie (RAP01/02) & Exports (EXP01–EXP05)
            </div>
            <h1 className="text-xl font-bold mt-1">
              Finances clubs, variables & préparation de paie
            </h1>
          </div>
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="cf-brand-gradient text-white px-4 py-2 rounded-btn text-xs font-semibold flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            Exporter CSV Paie (EXP01)
          </button>
        </div>

        {renderFeedbackBanner()}

        {/* KPIs financiers par site (TST24 : absent ≠ 0 €) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {dashboard.kpis.map((k) => (
            <div key={k.siteId} className="cf-card p-4 space-y-2">
              <div className="font-semibold text-sm flex items-center justify-between">
                <span>{dashboard.sites.find((s) => s.id === k.siteId)?.name ?? k.siteId}</span>
                <span className="cf-mono text-[11px] cf-muted">{k.periodLabel}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="cf-card-secondary p-2.5">
                  <div className="cf-muted">CA Club</div>
                  <div className="cf-mono font-bold mt-0.5">{formatEur(k.revenueEur)}</div>
                </div>
                <div className="cf-card-secondary p-2.5">
                  <div className="cf-muted">Masse salariale</div>
                  <div className="cf-mono font-bold mt-0.5">{formatEur(k.payrollMassEur)}</div>
                </div>
                <div className="cf-card-secondary p-2.5">
                  <div className="cf-muted">Heures planifiées</div>
                  <div className="cf-mono font-bold mt-0.5">{k.workedHours ?? 'Non renseigné'} h</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Saisie Prime / Avance (ORG04-25) */}
        {canEditPrimes && (
          <div className="cf-card p-4 space-y-3 text-xs">
            <div className="font-semibold text-sm">
              Ajouter un élément variable / prime / avance (RAP01 — ORG04-25)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
              <select
                value={extraEmpId}
                onChange={(e) => setExtraEmpId(e.target.value)}
                className="cf-input px-3 py-1.5"
              >
                {dashboard.visibleEmployees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName}
                  </option>
                ))}
              </select>
              <select
                value={extraKind}
                onChange={(e) =>
                  setExtraKind(
                    e.target.value as 'Prime' | 'Avance' | 'Indemnité repas'
                  )
                }
                className="cf-input px-3 py-1.5"
              >
                <option value="Prime">Prime</option>
                <option value="Avance">Avance</option>
                <option value="Indemnité repas">Indemnité repas</option>
              </select>
              <input
                type="number"
                value={extraAmount}
                onChange={(e) => setExtraAmount(Number(e.target.value) || 0)}
                className="cf-input px-3 py-1.5 cf-mono"
              />
              <input
                type="text"
                placeholder="Libellé / commentaire paie..."
                value={extraComment}
                onChange={(e) => setExtraComment(e.target.value)}
                className="cf-input px-3 py-1.5"
              />
              <button
                type="button"
                onClick={() => {
                  const emp = dashboard.visibleEmployees.find(
                    (e) => e.id === extraEmpId
                  );
                  if (!emp) return;
                  setPayrollExtras((p) => [
                    {
                      id: `px-${Date.now()}`,
                      employeeId: emp.id,
                      employeeName: `${emp.firstName} ${emp.lastName}`,
                      kind: extraKind,
                      amountEur: extraAmount,
                      comment: extraComment || extraKind,
                    },
                    ...p,
                  ]);
                  setExtraComment('');
                  setModuleFeedback({
                    kind: 'ok',
                    text: `${extraKind} de ${extraAmount} € ajouté(e) pour ${emp.firstName} ${emp.lastName}.`,
                  });
                }}
                className="cf-brand-gradient text-white px-3 py-1.5 rounded-btn font-semibold"
              >
                Ajouter au rapport
              </button>
            </div>
          </div>
        )}

        {/* Tableau préparation paie */}
        <div className="cf-card p-4 overflow-x-auto text-xs">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">Rapport mensuel collaborateurs (RAP01 / RAP02)</h2>
            <span className="cf-mono text-[11px] cf-muted">
              Paramètres d’export {canEditExport ? 'modifiables (ORG04-24)' : 'figés'}
            </span>
          </div>
          <table className="w-full text-left">
            <thead className="cf-muted border-b border-[var(--cf-border)]">
              <tr>
                <th className="py-2 pr-3">Collaborateur</th>
                <th className="py-2 pr-3">Base contrat</th>
                <th className="py-2 pr-3">Brut mensuel (ORG04-10)</th>
                <th className="py-2 pr-3">Variables (Primes / Avances)</th>
                <th className="py-2">Ajustement annualisation (RAP02)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--cf-border)]">
              {dashboard.visibleEmployees.map((emp) => {
                const extras = payrollExtras.filter((x) => x.employeeId === emp.id);
                const sumExtras = extras.reduce((a, b) => a + b.amountEur, 0);
                const baseAnn = emp.counter.annualizationBalanceHours ?? 0;
                const adj = annualizationDelta[emp.id] ?? 0;
                return (
                  <tr key={emp.id}>
                    <td className="py-2.5 pr-3 font-medium">
                      {emp.firstName} {emp.lastName}
                    </td>
                    <td className="py-2.5 pr-3 cf-mono">
                      {emp.contract?.annualDays
                        ? `${emp.contract.annualDays} j/an`
                        : `${emp.contract?.weeklyHours ?? 35} h/sem`}
                    </td>
                    <td className="py-2.5 pr-3 cf-mono">
                      {emp.contract?.monthlyGrossEur != null ? (
                        <span className="text-emerald-300">
                          {formatEur(emp.contract.monthlyGrossEur)}
                        </span>
                      ) : (
                        <span className="text-amber-300">Masqué (ORG04-10)</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 cf-mono">
                      {formatEur(sumExtras)} ({extras.length} ligne(s))
                    </td>
                    <td className="py-2.5 flex items-center gap-2">
                      <span className="cf-mono">
                        {baseAnn + adj > 0 ? `+${baseAnn + adj}` : baseAnn + adj} h
                      </span>
                      {canEditPrimes && (
                        <button
                          type="button"
                          onClick={() =>
                            setAnnualizationDelta((p) => ({
                              ...p,
                              [emp.id]: (p[emp.id] ?? 0) + 1,
                            }))
                          }
                          className="cf-input px-2 py-0.5 text-[11px]"
                        >
                          +1h
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {renderSourceDrawer()}
      </div>
    );
  };

  // =========================================================================
  // MC08 — Rapports, Pilotage & Missions (PIL01, MIS01-03, AMB14-07/10)
  // =========================================================================
  const renderMc08 = () => {
    const canManageMissions = can('ORG04-41') || can('ORG04-42');
    const siteMap = new Map(dashboard.sites.map((s) => [s.id, s.name]));

    return (
      <div className="space-y-5">
        <div className="cf-card p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs cf-mono text-indigo-300 flex items-center gap-2">
              <Briefcase className="w-4 h-4" />
              MC08 • PIL01, MIS01–MIS03 & Arbitrages AMB14-07 / AMB14-10
            </div>
            <h1 className="text-xl font-bold mt-1">
              Rapports de pilotage multi-clubs & suivi des missions
            </h1>
          </div>
          <div className="flex gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setPilotHorizon('3m')}
              className={`px-3 py-1.5 rounded-btn ${
                pilotHorizon === '3m'
                  ? 'cf-brand-gradient text-white font-semibold'
                  : 'cf-card-secondary'
              }`}
            >
              Horizon 3 mois (AMB14-07)
            </button>
            <button
              type="button"
              onClick={() => setPilotHorizon('13m')}
              className={`px-3 py-1.5 rounded-btn ${
                pilotHorizon === '13m'
                  ? 'cf-brand-gradient text-white font-semibold'
                  : 'cf-card-secondary'
              }`}
            >
              Horizon 13 mois
            </button>
          </div>
        </div>

        {renderFeedbackBanner()}

        {/* Tableau comparatif KPIs multi-sites */}
        <div className="cf-card p-4 space-y-3 text-xs">
          <h2 className="font-semibold text-sm">
            Performance & ratios — vue {pilotHorizon === '3m' ? '3 derniers mois' : '13 mois glissants'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {dashboard.kpis.map((k) => {
              const factor = pilotHorizon === '13m' ? 4.2 : 1;
              return (
                <div key={k.siteId} className="cf-card-secondary p-4 space-y-2">
                  <div className="font-semibold text-sm flex justify-between">
                    <span>{siteMap.get(k.siteId) ?? k.siteId}</span>
                    <span className="cf-mono text-violet-300">
                      {k.productivityPerHour != null
                        ? `${k.productivityPerHour.toFixed(2)} €/h`
                        : 'Non renseigné (TST24)'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="cf-muted">CA consolidé</div>
                      <div className="cf-mono font-semibold">
                        {k.revenueEur != null
                          ? formatEur(Math.round(k.revenueEur * factor))
                          : 'Non renseigné ≠ 0 €'}
                      </div>
                    </div>
                    <div>
                      <div className="cf-muted">Masse salariale</div>
                      <div className="cf-mono font-semibold">
                        {k.payrollMassEur != null
                          ? formatEur(Math.round(k.payrollMassEur * factor))
                          : 'Non renseigné'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Missions Beynost / Carré de Soie (CAP-ADM13-97) */}
        <div className="cf-card p-4 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-sm">
                Missions ponctuelles & coûts engagés (MIS01–MIS03)
              </h2>
              <div className="text-[11px] cf-muted">
                Statut V1.16 ({CLUB_COMPARISON.missions.site}) : filtre « Terminées » désactivé
                ({String(CLUB_COMPARISON.missions.terminated_filter_disabled_displayed)} — CAP-ADM13-97)
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setMissionStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-btn ${
                    missionStatusFilter === 'all'
                      ? 'cf-brand-gradient text-white font-semibold'
                      : 'cf-card-secondary'
                  }`}
                >
                  Toutes ({missions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMissionStatusFilter('active')}
                  className={`px-2.5 py-1 rounded-btn ${
                    missionStatusFilter === 'active'
                      ? 'cf-brand-gradient text-white font-semibold'
                      : 'cf-card-secondary'
                  }`}
                >
                  En cours ({missions.filter((m) => m.status === 'active').length})
                </button>
                <button
                  type="button"
                  onClick={() => setMissionStatusFilter('done')}
                  className={`px-2.5 py-1 rounded-btn ${
                    missionStatusFilter === 'done'
                      ? 'cf-brand-gradient text-white font-semibold'
                      : 'cf-card-secondary hover:border-violet-500/50'
                  }`}
                >
                  Terminées ({missions.filter((m) => m.status !== 'active').length})
                </button>
              </div>
              {canManageMissions && (
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    placeholder="Nouvelle mission..."
                    value={newMissionTitle}
                    onChange={(e) => setNewMissionTitle(e.target.value)}
                    className="cf-input px-3 py-1"
                  />
                  <input
                    type="number"
                    min={1}
                    value={newMissionHours}
                    onChange={(e) => setNewMissionHours(Number(e.target.value) || 8)}
                    className="cf-input w-20 px-2 py-1 cf-mono"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newMissionTitle.trim()) return;
                      setMissions((p) => [
                        {
                          id: `mis-${Date.now()}`,
                          siteId: dashboard.sites[0]?.id ?? 'club-beynost',
                          title: newMissionTitle.trim(),
                          budgetHours: newMissionHours,
                          loggedHours: 0,
                          hourlyBudgetEur: 26,
                          status: 'active',
                        },
                        ...p,
                      ]);
                      setNewMissionTitle('');
                      setModuleFeedback({
                        kind: 'ok',
                        text: 'Nouvelle mission créée (MIS02).',
                      });
                    }}
                    className="cf-brand-gradient text-white px-3 py-1 rounded-btn font-semibold"
                  >
                    + Mission
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {missions
              .filter((m) =>
                missionStatusFilter === 'active'
                  ? m.status === 'active'
                  : missionStatusFilter === 'done'
                  ? m.status !== 'active'
                  : true
              )
              .map((m) => (
                <div
                  key={m.id}
                  className="cf-card-secondary p-3 flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <div className="font-semibold">{m.title}</div>
                    <div className="cf-muted">
                      {siteMap.get(m.siteId) ?? m.siteId} · {m.loggedHours}h / {m.budgetHours}h · Coût estimé :{' '}
                      <span className="cf-mono text-emerald-300">
                        {formatEur(m.loggedHours * m.hourlyBudgetEur)}
                      </span>
                    </div>
                  </div>
                  <span className="cf-mono px-2 py-0.5 rounded bg-violet-500/20 text-violet-300">
                    {m.status === 'active' ? 'En cours' : 'Terminée'}
                  </span>
                </div>
              ))}
          </div>
        </div>

        {renderSourceDrawer()}
      </div>
    );
  };

  // =========================================================================
  // MC09 — Marketing & Communication RH (COM01)
  // =========================================================================
  const renderMc09 = () => {
    const incompleteCount = dashboard.visibleEmployees.filter(
      (e) => e.hrFileStatus !== 'complete'
    ).length;

    return (
      <div className="space-y-5">
        <div className="cf-card p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs cf-mono text-pink-300 flex items-center gap-2">
              <Megaphone className="w-4 h-4" />
              MC09 • Communication collective & relances équipes (COM01)
            </div>
            <h1 className="text-xl font-bold mt-1">
              Marketing interne & Communication RH
            </h1>
          </div>
          <span className="cf-mono text-xs px-3 py-1 rounded-btn bg-pink-500/15 text-pink-200">
            {incompleteCount} dossier(s) à relancer
          </span>
        </div>

        {renderFeedbackBanner()}

        <div className="cf-card p-4 space-y-3 text-xs">
          <h2 className="font-semibold text-sm">Nouvel envoi collectif ciblé (COM01)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="cf-muted block mb-1">Destinataires autorisés</label>
              <select
                value={commAudience}
                onChange={(e) => setCommAudience(e.target.value)}
                className="cf-input w-full px-3 py-2"
              >
                <option>Tous les collaborateurs visibles ({dashboard.visibleEmployees.length})</option>
                <option>Équipe C.FITNESS Carré de Soie</option>
                <option>Équipe C.FITNESS Beynost</option>
                <option>Dossiers RH incomplets ({incompleteCount})</option>
              </select>
            </div>
            <div>
              <label className="cf-muted block mb-1">Canal de diffusion</label>
              <select
                value={commChannel}
                onChange={(e) => setCommChannel(e.target.value)}
                className="cf-input w-full px-3 py-2"
              >
                <option>E-mail + Notification CFitness OS</option>
                <option>E-mail RH uniquement</option>
                <option>Notification application mobile</option>
              </select>
            </div>
          </div>
          <input
            type="text"
            placeholder="Objet du message..."
            value={commSubject}
            onChange={(e) => setCommSubject(e.target.value)}
            className="cf-input w-full px-3 py-2"
          />
          <textarea
            rows={4}
            placeholder="Contenu du message destiné à vos équipes..."
            value={commBody}
            onChange={(e) => setCommBody(e.target.value)}
            className="cf-input w-full p-3"
          />
          <button
            type="button"
            onClick={() => {
              if (!commSubject.trim()) {
                setModuleFeedback({
                  kind: 'err',
                  text: 'Indiquez un objet avant de diffuser.',
                });
                return;
              }
              setCommLogs((p) => [
                {
                  id: `com-${Date.now()}`,
                  date: '2026-11-14 (à l’instant)',
                  channel: commChannel,
                  audience: commAudience,
                  subject: commSubject.trim(),
                  recipientCount: dashboard.visibleEmployees.length,
                },
                ...p,
              ]);
              setCommSubject('');
              setCommBody('');
              setModuleFeedback({
                kind: 'ok',
                text: `Campagne diffusée en bac à sable vers « ${commAudience} ».`,
              });
            }}
            className="cf-brand-gradient text-white px-4 py-2 rounded-btn font-semibold flex items-center gap-1.5"
          >
            <Send className="w-4 h-4" />
            Diffuser la communication
          </button>
        </div>

        <div className="cf-card p-4 space-y-2.5 text-xs">
          <h2 className="font-semibold text-sm">Historique des diffusions</h2>
          {commLogs.map((l) => (
            <div key={l.id} className="cf-card-secondary p-3 flex flex-wrap justify-between gap-2">
              <div>
                <div className="font-semibold">{l.subject}</div>
                <div className="cf-muted">
                  {l.date} · {l.channel} · Cible : {l.audience}
                </div>
              </div>
              <span className="cf-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                {l.recipientCount} destinataire(s)
              </span>
            </div>
          ))}
        </div>

        {renderSourceDrawer()}
      </div>
    );
  };

  // =========================================================================
  // MC10 — Paramètres RH par établissement (PAR01-18, EXT-PAR02-01..08)
  // =========================================================================
  const renderMc10 = () => {
    const canEditRules = can('ORG04-29') || can('ORG04-30') || can('ORG04-37');
    const canCreatePos = can('ORG04-27');
    const baseSite =
      dashboard.sites.find((s) => s.id === paramSiteId) ?? dashboard.sites[0];
    const effectiveSettings: SiteHrSettings | undefined = baseSite
      ? { ...baseSite.settings, ...(siteSettingsOverrides[baseSite.id] ?? {}) }
      : undefined;
    const sitePositions = [
      ...dashboard.positions.filter((p) => !baseSite || p.siteId === baseSite.id),
      ...extraPositions
        .filter((p) => !baseSite || p.siteId === baseSite.id)
        .map((p) => ({
          id: p.id,
          siteId: p.siteId,
          label: p.label,
          defaultBreakMinutes: p.breakMin,
        })),
    ];

    return (
      <div className="space-y-5">
        <div className="cf-card p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs cf-mono text-violet-300 flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4" />
              MC10 • PAR01–PAR18, EXT-PAR02 & isolation stricte par club (OBJ10)
            </div>
            <h1 className="text-xl font-bold mt-1">
              Paramètres RH par établissement (Carré de Soie vs Beynost)
            </h1>
          </div>
          <div className="flex gap-1.5 text-xs">
            {dashboard.sites.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setParamSiteId(s.id)}
                className={`px-3 py-1.5 rounded-btn flex items-center gap-1.5 ${
                  baseSite?.id === s.id
                    ? 'cf-brand-gradient text-white font-semibold'
                    : 'cf-card-secondary'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {renderFeedbackBanner()}

        {/* Sous-onglets V1.16 : Règles de base / Compteurs 42 options / 66 Motifs / 19 Alertes & 14 Smart Planner */}
        <div className="flex flex-wrap gap-2 text-xs">
          {[
            { id: 'base' as const, label: 'Règles de base, Besoins & UUID (PAR01/PAR17)' },
            { id: 'counters' as const, label: 'Compteurs, CP & 42 Annualisation (PAR02)' },
            { id: 'absences' as const, label: '66 Motifs d’absence (PAR12)' },
            {
              id: 'alerts_planner' as const,
              label: '19 Alertes, 14 Smart Planner & 7 Groupes Rapport',
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMc10SubTab(tab.id)}
              className={`px-3 py-1.5 rounded-btn font-medium ${
                mc10SubTab === tab.id
                  ? 'cf-brand-gradient text-white'
                  : 'cf-card-secondary hover:border-violet-500/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {baseSite && effectiveSettings && (() => {
          const isBeynost =
            baseSite.name.toLowerCase().includes('beynost') ||
            baseSite.id.toLowerCase().includes('beynost');
          const clubKey = isBeynost ? ('Beynost' as const) : ('Carré de Soie' as const);
          const baseRules = CLUB_COMPARISON.base_rules_by_site[clubKey];
          const badgeCfg = CLUB_COMPARISON.badge_settings[clubKey];
          const counterCfg = CLUB_COMPARISON.counter_settings_by_site[clubKey];
          const annualOptions: readonly AnnualAbsenceOption[] =
            counterCfg.annual_absence_options;
          type AbsenceDisplayRow = Omit<
            AbsenceMotiveState,
            | 'accrual'
            | 'employee_request'
            | 'request_disabled'
            | 'accrual_disabled'
            | 'overtime_disabled'
          > & {
            accrual: number | string;
            employee_request: number | string;
            request_disabled: boolean | null;
            accrual_disabled: boolean | null;
            overtime_disabled: boolean | null;
          };
          const absenceStates: readonly AbsenceDisplayRow[] = isBeynost
            ? CLUB_COMPARISON.beynost_absence_states
            : CLUB_COMPARISON.carre_absence_states;
          const aq = absenceMotiveSearch.trim().toLowerCase();
          const filteredAbsences = absenceStates.filter(
            (m) =>
              !aq ||
              m.label.toLowerCase().includes(aq) ||
              m.category.toLowerCase().includes(aq) ||
              m.source_id.toLowerCase().includes(aq)
          );
          type AlertDisplayRow = Omit<AlertConfigItem, 'blocking_displayed'> & {
            blocking_displayed: boolean | null;
          };
          const activeAlerts: readonly AlertDisplayRow[] = isBeynost
            ? CLUB_COMPARISON.beynost_alerts
            : CLUB_COMPARISON.carre_alerts;
          const smartPlannerRules: readonly SmartPlannerRuleState[] = isBeynost
            ? CLUB_COMPARISON.beynost_smart_planner
            : CLUB_COMPARISON.carre_smart_planner;
          const carreReportRules: ReportRuleGroup[] = CLUB_COMPARISON.carre_report_rules.map(
            (rg) => ({
              group: rg.group,
              fields: rg.fields.map((f) => [f[0] ?? '', f[1] ?? ''] as [string, string]),
              add_band_visible:
                'add_band_visible' in rg ? Boolean(rg.add_band_visible) : false,
              delete_band_visible:
                'delete_band_visible' in rg ? Boolean(rg.delete_band_visible) : false,
            })
          );

          return (
            <div className="space-y-4 text-xs">
              {mc10SubTab === 'base' && (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="cf-card p-4 space-y-3">
                      <h2 className="font-semibold text-sm">
                        Règles spécifiques à {baseSite.name} (SIRET {baseSite.siret})
                      </h2>
                      <div className="space-y-2">
                        <div className="cf-card-secondary p-3 flex items-center justify-between">
                          <span>Fréquence de badgeage (PAR16)</span>
                          <button
                            type="button"
                            disabled={!canEditRules}
                            onClick={() =>
                              setSiteSettingsOverrides((p) => ({
                                ...p,
                                [baseSite.id]: {
                                  ...p[baseSite.id],
                                  badgeFrequency:
                                    effectiveSettings.badgeFrequency === 'each_shift'
                                      ? 'consecutive_shift_series'
                                      : 'each_shift',
                                },
                              }))
                            }
                            className="cf-input px-2.5 py-1 cf-mono"
                          >
                            {effectiveSettings.badgeFrequency === 'each_shift'
                              ? 'Chaque shift'
                              : 'Série consécutive'}
                          </button>
                        </div>

                        <div className="cf-card-secondary p-3 flex items-center justify-between">
                          <span>Badgeage de pause sur tablette (PAR16)</span>
                          <button
                            type="button"
                            disabled={!canEditRules}
                            onClick={() =>
                              setSiteSettingsOverrides((p) => ({
                                ...p,
                                [baseSite.id]: {
                                  ...p[baseSite.id],
                                  tabletBreakBadging: !effectiveSettings.tabletBreakBadging,
                                },
                              }))
                            }
                            className="cf-input px-2.5 py-1 cf-mono"
                          >
                            {effectiveSettings.tabletBreakBadging ? 'Activé' : 'Désactivé'}
                          </button>
                        </div>

                        <div className="cf-card-secondary p-3 flex items-center justify-between">
                          <span>Mode acquisition CP (EXT-PAR02-01)</span>
                          <span className="cf-mono text-violet-300">
                            {effectiveSettings.acquisitionMode}
                          </span>
                        </div>

                        <div className="cf-card-secondary p-3 flex items-center justify-between">
                          <span>Période annualisation (EXT-PAR02-02)</span>
                          <span className="cf-mono">{effectiveSettings.annualizationPeriod}</span>
                        </div>

                        <div className="cf-card-secondary p-3 flex items-center justify-between">
                          <span>Plafond hebdo · Pause max Smart Planner</span>
                          <span className="cf-mono">
                            {effectiveSettings.complementaryMaxHours}h ·{' '}
                            {effectiveSettings.smartPlannerBreakMaxHours}h
                          </span>
                        </div>

                        <div className="cf-card-secondary p-3 flex items-center justify-between">
                          <span>Jours consécutifs bloquants · Alertes</span>
                          <span className="cf-mono">
                            {effectiveSettings.consecutiveDaysBlocking ? 'Bloquant' : 'Souple'} ·{' '}
                            {effectiveSettings.alertsLayout}
                          </span>
                        </div>

                        <div className="cf-card-secondary p-3 space-y-1">
                          <div className="font-semibold text-cyan-300">
                            Paramètres source {clubKey} (V1.16)
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 text-[11px] cf-mono">
                            <span>Convention : {baseRules.collective_agreement}</span>
                            <span>
                              Horaires : {baseRules.work_start} – {baseRules.work_end}
                            </span>
                            <span>Seuil pause : {baseRules.break_trigger_display}</span>
                            <span>
                              Pauses payées : {baseRules.paid_breaks_displayed ? 'Oui' : 'Non'}
                            </span>
                            <span>Charges pat. : {baseRules.employer_contributions_display}</span>
                            <span>Référence : {baseRules.reference_days_display}</span>
                            <span>
                              Photo tablette : {badgeCfg.tablet_photo ? badgeCfg.tablet_photo_mode : 'Off'}
                            </span>
                            <span>
                              SMS retard : {badgeCfg.late_sms_enabled ? `>${badgeCfg.late_sms_after_minutes}m (${badgeCfg.late_sms_recipients_count})` : 'Off'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Postes UUID OBJ10 / doublon Entretien PAR17 */}
                    <div className="cf-card p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h2 className="font-semibold text-sm">
                          Référentiel postes UUID (PAR17 — OBJ10)
                        </h2>
                        <span className="cf-mono text-[10px] cf-muted">
                          ID technique ≠ libellé
                        </span>
                      </div>
                      {canCreatePos && (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Nouveau poste (ex: Accueil Soir)..."
                            value={newPosLabel}
                            onChange={(e) => setNewPosLabel(e.target.value)}
                            className="cf-input flex-1 px-3 py-1.5"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (!newPosLabel.trim()) return;
                              setExtraPositions((p) => [
                                ...p,
                                {
                                  id: `pos-custom-${Date.now()}`,
                                  siteId: baseSite.id,
                                  label: newPosLabel.trim(),
                                  breakMin: 30,
                                },
                              ]);
                              setNewPosLabel('');
                              setModuleFeedback({
                                kind: 'ok',
                                text: 'Poste créé avec UUID technique unique (OBJ10).',
                              });
                            }}
                            className="cf-brand-gradient text-white px-3 py-1.5 rounded-btn font-semibold"
                          >
                            + Poste
                          </button>
                        </div>
                      )}
                      <div className="space-y-1.5 max-h-60 overflow-y-auto">
                        {sitePositions.map((pos) => (
                          <div
                            key={pos.id}
                            className="cf-card-secondary p-2.5 flex items-center justify-between"
                          >
                            <span className="font-medium">{pos.label}</span>
                            <span className="cf-mono text-[10px] text-cyan-300">
                              UUID : {pos.id} (pause {pos.defaultBreakMinutes}m)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Comparatif 7 différences entre clubs + Besoins fixes/variables & CAP-ADM13-78 */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="cf-card p-4 space-y-2.5 overflow-x-auto">
                      <h2 className="font-semibold text-sm">
                        Comparatif des 7 écarts Beynost vs Carré de Soie (V1.16)
                      </h2>
                      <table className="w-full text-[11px] text-left">
                        <thead className="cf-muted border-b border-[var(--cf-border)]">
                          <tr>
                            <th className="py-1.5 pr-2">Paramètre</th>
                            <th className="py-1.5 pr-2">Beynost</th>
                            <th className="py-1.5">Carré de Soie</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--cf-border)]">
                          {CLUB_COMPARISON.differences.map((d) => (
                            <tr key={d.setting}>
                              <td className="py-1.5 pr-2 cf-mono text-violet-300">{d.setting}</td>
                              <td className="py-1.5 pr-2">{String(d.Beynost)}</td>
                              <td className="py-1.5">{String(d['Carré de Soie'])}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="cf-card p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <h2 className="font-semibold text-sm">
                          Besoins fixes / variables & Prévisionnel
                        </h2>
                        <span className="cf-mono text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                          CAP-ADM13-78 : Prévision inactive
                        </span>
                      </div>
                      <div className="text-[11px] cf-muted">
                        Fixes ({CLUB_COMPARISON.fixed_and_variable_needs.fixed_defaults.start}–
                        {CLUB_COMPARISON.fixed_and_variable_needs.fixed_defaults.end}) · Variables (
                        {CLUB_COMPARISON.fixed_and_variable_needs.frequencies.join(' / ')} · Unités :{' '}
                        {CLUB_COMPARISON.fixed_and_variable_needs.productivity_units.join(', ')})
                      </div>
                      <div className="text-[11px] text-amber-300">
                        {CLUB_COMPARISON.fixed_and_variable_needs.post_options_note}
                      </div>
                      <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto pt-1">
                        {CLUB_COMPARISON.fixed_and_variable_needs.post_options_carre_ordered.map(
                          (optLabel, idx) => (
                            <span
                              key={`${optLabel}-${idx}`}
                              className={`cf-mono text-[10px] px-2 py-0.5 rounded ${
                                optLabel === 'Entretien'
                                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                                  : 'cf-card-secondary'
                              }`}
                            >
                              {optLabel}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {mc10SubTab === 'counters' && (
                <div className="cf-card p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold text-sm">
                      Paramètres des compteurs — {clubKey} (PAR02)
                    </h2>
                    <span className="cf-mono text-[11px] text-cyan-300">
                      Modes CP : {CLUB_COMPARISON.acquisition_choices.join(' · ')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-[11px]">
                    <div className="cf-card-secondary p-2.5">
                      <div className="cf-muted">Acquisition CP</div>
                      <div className="font-semibold mt-0.5">
                        {counterCfg.leave_acquisition_mode} ({counterCfg.monthly_acquisition_display} j/m)
                      </div>
                    </div>
                    <div className="cf-card-secondary p-2.5">
                      <div className="cf-muted">Période annualisation</div>
                      <div className="font-semibold mt-0.5">
                        {counterCfg.annualization_period_display}
                      </div>
                    </div>
                    <div className="cf-card-secondary p-2.5">
                      <div className="cf-muted">Modulation · RCR · J. fériés</div>
                      <div className="font-semibold mt-0.5">
                        {counterCfg.modulation_displayed ? 'Mod.' : 'Off'} /{' '}
                        {counterCfg.rcr_displayed ? 'RCR' : 'Off'} /{' '}
                        {counterCfg.public_holiday_counter_displayed ? 'JF' : 'Off'}
                      </div>
                    </div>
                    <div className="cf-card-secondary p-2.5">
                      <div className="cf-muted">RTT heures · Dimanches</div>
                      <div className="font-semibold mt-0.5">
                        {counterCfg.rtt_hours_action} · Dim.{' '}
                        {counterCfg.sunday_hours_included_displayed ? 'inclus' : 'exclus'}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="font-semibold">
                      42 options d’absence dans le compteur d’annualisation (sélectionnées :{' '}
                      {counterCfg.annual_absence_selected_count_displayed} / {annualOptions.length})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-72 overflow-y-auto">
                      {annualOptions.map((opt) => (
                        <div
                          key={opt.label}
                          className="cf-card-secondary px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px]"
                        >
                          <span className="truncate">{opt.label}</span>
                          <span
                            className={`cf-mono text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                              opt.included_displayed
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-slate-700/60 cf-muted'
                            }`}
                          >
                            {opt.included_displayed ? 'Inclus' : 'Exclu'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {mc10SubTab === 'absences' && (
                <div className="cf-card p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold text-sm">
                      66 Motifs d’absence — {clubKey} (PAR12 : {filteredAbsences.length} /{' '}
                      {absenceStates.length})
                    </h2>
                    <div className="relative min-w-[220px]">
                      <Search className="w-3.5 h-3.5 cf-muted absolute left-3 top-2" />
                      <input
                        type="text"
                        placeholder="Filtrer motif, catégorie, PAR12..."
                        value={absenceMotiveSearch}
                        onChange={(e) => setAbsenceMotiveSearch(e.target.value)}
                        className="cf-input w-full pl-8 pr-3 py-1"
                      />
                    </div>
                  </div>
                  <div className="max-h-96 overflow-y-auto overflow-x-auto">
                    <table className="w-full text-[11px] text-left">
                      <thead className="cf-muted border-b border-[var(--cf-border)]">
                        <tr>
                          <th className="py-1.5 pr-2">ID</th>
                          <th className="py-1.5 pr-2">Motif</th>
                          <th className="py-1.5 pr-2">Catégorie</th>
                          <th className="py-1.5 pr-2">Actif</th>
                          <th className="py-1.5 pr-2">Cumul CP</th>
                          <th className="py-1.5 pr-2">Demande salarié</th>
                          <th className="py-1.5">Heures sup.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--cf-border)]">
                        {filteredAbsences.map((m) => (
                          <tr key={m.source_id}>
                            <td className="py-1.5 pr-2 cf-mono text-violet-300">{m.source_id}</td>
                            <td className="py-1.5 pr-2 font-medium">{m.label}</td>
                            <td className="py-1.5 pr-2 cf-muted">{m.category}</td>
                            <td className="py-1.5 pr-2 cf-mono">
                              {m.active ? 'Oui (1)' : 'Non (0)'}
                            </td>
                            <td className="py-1.5 pr-2 cf-mono">
                              {typeof m.accrual === 'string'
                                ? m.accrual
                                : m.accrual
                                  ? 'Oui'
                                  : 'Non'}
                              {m.accrual_disabled ? ' (verr.)' : ''}
                            </td>
                            <td className="py-1.5 pr-2 cf-mono">
                              {m.employee_request === 'absent'
                                ? 'Absent'
                                : m.employee_request
                                  ? 'Oui'
                                  : 'Non'}
                              {m.request_disabled ? ' (verr.)' : ''}
                            </td>
                            <td className="py-1.5 cf-mono">
                              {m.overtime}
                              {m.overtime_disabled ? ' (verr.)' : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {mc10SubTab === 'alerts_planner' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="cf-card p-4 space-y-2.5 overflow-x-auto">
                      <h2 className="font-semibold text-sm">
                        19 Alertes — {clubKey} ({activeAlerts.length})
                      </h2>
                      <div className="max-h-72 overflow-y-auto">
                        <table className="w-full text-[11px] text-left">
                          <thead className="cf-muted border-b border-[var(--cf-border)]">
                            <tr>
                              <th className="py-1.5 pr-2">Alerte</th>
                              <th className="py-1.5 pr-2">Groupe</th>
                              <th className="py-1.5 pr-2">Actif</th>
                              <th className="py-1.5 pr-2">Bloquant</th>
                              <th className="py-1.5">Seuil affiché</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--cf-border)]">
                            {activeAlerts.map((al) => (
                              <tr key={al.label}>
                                <td className="py-1.5 pr-2 font-medium">{al.label}</td>
                                <td className="py-1.5 pr-2 cf-muted">{al.group}</td>
                                <td className="py-1.5 pr-2 cf-mono">
                                  {al.active_displayed ? 'Actif' : 'Off'}
                                </td>
                                <td className="py-1.5 pr-2 cf-mono">
                                  {al.blocking_displayed === null
                                    ? 'n/a'
                                    : al.blocking_displayed
                                      ? 'Oui'
                                      : 'Non'}
                                </td>
                                <td className="py-1.5 cf-muted">{al.displayed_parameter}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="cf-card p-4 space-y-2.5 overflow-x-auto">
                      <h2 className="font-semibold text-sm">
                        14 Contraintes Smart Planner — {clubKey} ({smartPlannerRules.length})
                      </h2>
                      <div className="max-h-72 overflow-y-auto">
                        <table className="w-full text-[11px] text-left">
                          <thead className="cf-muted border-b border-[var(--cf-border)]">
                            <tr>
                              <th className="py-1.5 pr-2">Groupe</th>
                              <th className="py-1.5 pr-2">Contrainte</th>
                              <th className="py-1.5 pr-2">État</th>
                              <th className="py-1.5">Valeur affichée</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--cf-border)]">
                            {smartPlannerRules.map((sp) => (
                              <tr key={sp.label}>
                                <td className="py-1.5 pr-2 cf-muted">{sp.group}</td>
                                <td className="py-1.5 pr-2 font-medium">{sp.label}</td>
                                <td className="py-1.5 pr-2 cf-mono">
                                  {sp.active_displayed ? 'Actif' : 'Off'}
                                </td>
                                <td className="py-1.5 cf-mono text-cyan-300">
                                  {sp.value_displayed === null ? '—' : String(sp.value_displayed)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div className="cf-card p-4 space-y-2.5">
                    <h2 className="font-semibold text-sm">
                      7 Groupes de règles du rapport (Carré de Soie) vs Visibilité Beynost
                    </h2>
                    {isBeynost ? (
                      <div className="cf-card-secondary p-3 border-amber-500/40 space-y-1">
                        <div className="font-semibold text-amber-300">
                          Entrée non exposée dans le menu administrateur Beynost (V1.16)
                        </div>
                        <div className="cf-muted">
                          {CLUB_COMPARISON.beynost_report_rules_visibility.meaning}
                        </div>
                        <div className="text-[11px] cf-muted">
                          Contexte : {CLUB_COMPARISON.beynost_report_rules_visibility.documentary_context}
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {carreReportRules.map((rg) => (
                          <div key={rg.group} className="cf-card-secondary p-3 space-y-1.5">
                            <div className="font-semibold text-violet-300">{rg.group}</div>
                            {rg.fields.map(([k, v], idx) => (
                              <div
                                key={`${k}-${idx}`}
                                className="flex justify-between gap-2 text-[11px]"
                              >
                                <span className="cf-muted">{k}</span>
                                <span className="cf-mono font-semibold">{v}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {renderSourceDrawer()}
      </div>
    );
  };

  // =========================================================================
  // MC12 — Intégrations, Assistant RH & Recrutement (INT01-06, REC01, EXT06)
  // =========================================================================
  const renderMc12 = () => {
    const incompleteCount = dashboard.visibleEmployees.filter(
      (e) => e.hrFileStatus !== 'complete'
    ).length;
    const redLocksCount = dashboard.teamShifts.filter(
      (s) => s.lockState === 'red'
    ).length;

    return (
      <div className="space-y-5">
        <div className="cf-card p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs cf-mono text-violet-300 flex items-center gap-2">
              <Plug className="w-4 h-4" />
              MC12 • INT01–INT06, REC01 & Assistant RH (EXT06)
            </div>
            <h1 className="text-xl font-bold mt-1">
              Intégrations partenaires, API & Recrutement
            </h1>
          </div>
          <span className="cf-mono text-xs px-3 py-1 rounded-btn bg-amber-500/15 text-amber-300">
            Adaptateurs isolés (contrats API partenaires à valider)
          </span>
        </div>

        {renderFeedbackBanner()}

        {/* Assistant RH EXT06 */}
        <div className="cf-card p-4 border-violet-500/40 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="space-y-1">
            <div className="font-semibold text-sm flex items-center gap-2 text-violet-300">
              <Sparkles className="w-4 h-4" />
              Assistant RH CFitness OS (EXT06 — Contrôle pré-paie)
            </div>
            <p className="cf-muted">
              Détecte automatiquement : {incompleteCount} dossier(s) salarié incomplet(s),{' '}
              {dashboard.anomalies.length} anomalie(s) badgeuse visible(s) et {redLocksCount} créneau(x) sous verrou rouge.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setModuleFeedback({
                kind: 'ok',
                text: `Diagnostic EXT06 terminé : ${incompleteCount} relance(s) dossier recommandée(s) avant export paie.`,
              })
            }
            className="cf-brand-gradient text-white px-4 py-2 rounded-btn font-semibold flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Lancer audit pré-paie
          </button>
        </div>

        {/* Catalogue partenaires V1.16 : 6 onglets ADM13-02 + toggles OFF CAP-ADM13-05 */}
        <div className="cf-card p-4 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-sm">
                Catalogue partenaires officiels V1.16 (ADM13-02 à ADM13-10)
              </h2>
              <p className="text-[11px] cf-muted">
                6 catégories distinctes ouvertes en lecture seule administrateur (sans écriture partenaire).
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['caisse', `Caisse (${PARTNER_CATALOGUES.caisse.length})`],
                  ['paie', `Paie (${PARTNER_CATALOGUES.paie.length})`],
                  ['sirh', 'SIRH (3)'],
                  ['analyse', `Analyse (${PARTNER_CATALOGUES.analyse.length})`],
                  ['recrutement', `Recrutement (${PARTNER_CATALOGUES.recrutement.length})`],
                  ['acompte', `Acompte (${PARTNER_CATALOGUES.acompte.length})`],
                ] as const
              ).map(([catId, label]) => (
                <button
                  key={catId}
                  type="button"
                  onClick={() => setMc12CategoryTab(catId)}
                  className={`px-3 py-1.5 rounded-btn font-medium ${
                    mc12CategoryTab === catId
                      ? 'cf-brand-gradient text-white'
                      : 'cf-card-secondary hover:border-violet-500/60'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {mc12CategoryTab === 'caisse' && (
            <div className="space-y-2.5">
              <div className="cf-muted text-[11px]">
                INT02 / ADM13-03 : Synchronisation quotidienne du CA de la veille à 5h.{' '}
                {PARTNER_CATALOGUES.caisse.length} logiciels relevés.
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-60 overflow-y-auto">
                {PARTNER_CATALOGUES.caisse.map((name) => (
                  <div key={name} className="cf-card-secondary px-2.5 py-2 font-medium">
                    {name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {mc12CategoryTab === 'paie' && (
            <div className="space-y-2.5">
              <div className="cf-muted text-[11px]">
                INT03 / ADM13-04 : Export EVP compatible ; Silae, Cegedim et PayFit affichent en
                plus « Données employés connectées ».
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {PARTNER_CATALOGUES.paie.map((name) => {
                  const hasEmployeeSync =
                    name === 'Silae' || name === 'Cegedim' || name === 'PayFit';
                  return (
                    <div key={name} className="cf-card-secondary p-2.5 space-y-1">
                      <div className="font-semibold">{name}</div>
                      <div className="cf-mono text-[10px] text-emerald-300">
                        Export EVP compatible
                      </div>
                      {hasEmployeeSync && (
                        <div className="cf-mono text-[10px] text-cyan-300">
                          Données employés connectées
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {mc12CategoryTab === 'sirh' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="cf-card-secondary p-3.5 space-y-1.5">
                <div className="font-semibold text-cyan-300">
                  Sens sortant (CFitness / Skello → SIRH)
                </div>
                <div className="flex flex-wrap gap-2">
                  {PARTNER_CATALOGUES.sirh.outbound.map((name) => (
                    <span
                      key={name}
                      className="cf-card px-2.5 py-1 font-medium"
                    >
                      {name} (Se connecter)
                    </span>
                  ))}
                </div>
              </div>
              <div className="cf-card-secondary p-3.5 space-y-1.5">
                <div className="font-semibold text-violet-300">
                  Sens entrant (SIRH → CFitness / Skello)
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {PARTNER_CATALOGUES.sirh.inbound.map((name) => (
                    <span key={name} className="cf-card px-2.5 py-1 font-medium">
                      {name}
                    </span>
                  ))}
                  <span className="cf-muted text-[11px]">
                    Activation : {PARTNER_CATALOGUES.sirh.activation}
                  </span>
                </div>
              </div>
            </div>
          )}

          {mc12CategoryTab === 'analyse' && (
            <div className="space-y-3">
              <div className="cf-muted text-[11px]">
                INT05 / CAP-ADM13-05 : État observé OFF sur les interrupteurs partenaires. Les
                bascules ci-dessous permettent de simuler l’état OFF/ON en bac à sable local.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {PARTNER_CATALOGUES.analyse.map((name) => {
                  const hasToggle = name in apiAnalyticsToggles;
                  const isOn = hasToggle ? Boolean(apiAnalyticsToggles[name]) : false;
                  return (
                    <div
                      key={name}
                      className="cf-card-secondary p-3 flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-semibold">{name}</div>
                        <div className="text-[10px] cf-muted">
                          {name === 'API analytique Skello'
                            ? 'Chevron grisé / inactive (ADM13-06)'
                            : name === 'TimeSkipper'
                              ? 'Contacter l’équipe (ADM13-08)'
                              : 'État source OFF (CAP-ADM13-05)'}
                        </div>
                      </div>
                      {hasToggle ? (
                        <button
                          type="button"
                          onClick={() =>
                            setApiAnalyticsToggles((prev) => ({
                              ...prev,
                              [name]: !prev[name],
                            }))
                          }
                          className={`cf-mono text-[10px] px-2.5 py-1 rounded ${
                            isOn
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-slate-700/60 cf-muted'
                          }`}
                        >
                          {isOn ? 'ON (simu)' : 'OFF'}
                        </button>
                      ) : (
                        <span className="cf-mono text-[10px] px-2 py-1 rounded bg-slate-700/60 cf-muted">
                          OFF
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {mc12CategoryTab === 'recrutement' && (
            <div className="space-y-2.5">
              <div className="cf-muted text-[11px]">
                INT06 / ADM13-09 : Deux offres visibles en session administrateur (Teamtailor non
                présent dans le catalogue consulté).
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {PARTNER_CATALOGUES.recrutement.map((name) => (
                  <div key={name} className="cf-card-secondary p-3 space-y-1">
                    <div className="font-semibold">{name}</div>
                    <div className="text-[11px] cf-muted">
                      Contacter le référent Skello pour faire remonter les données candidats.
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mc12CategoryTab === 'acompte' && (
            <div className="space-y-2.5">
              <div className="cf-muted text-[11px]">
                INT06 / ADM13-10 : Deux solutions d’acompte sur salaire observées sans demande ni
                connexion active.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {PARTNER_CATALOGUES.acompte.map((name) => (
                  <div key={name} className="cf-card-secondary p-3 space-y-1">
                    <div className="font-semibold">{name}</div>
                    <div className="text-[11px] cf-muted">
                      Volet de présentation · prise de contact avec le référent requise.
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Catalogue connecteurs bac à sable */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {connectors.map((c) => (
            <div key={c.id} className="cf-card p-4 space-y-2.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="cf-mono text-violet-300">{c.id}</span>
                  <span
                    className={`cf-mono text-[10px] px-2 py-0.5 rounded-full ${
                      c.status === 'connected'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : c.status === 'sandbox'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-slate-700/60 cf-muted'
                    }`}
                  >
                    {c.status === 'connected'
                      ? 'Connecté'
                      : c.status === 'sandbox'
                        ? 'Bac à sable'
                        : 'Non connecté'}
                  </span>
                </div>
                <div className="font-semibold text-sm mt-1">{c.name}</div>
                <div className="cf-muted mt-0.5">Catégorie : {c.category}</div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setConnectors((prev) =>
                    prev.map((x) =>
                      x.id === c.id
                        ? {
                            ...x,
                            status:
                              x.status === 'disconnected' ? 'sandbox' : 'disconnected',
                          }
                        : x
                    )
                  )
                }
                className="cf-card-secondary py-1.5 px-3 text-center hover:border-violet-500/60"
              >
                {c.status === 'disconnected'
                  ? 'Activer adaptateur bac à sable'
                  : 'Couper adaptateur'}
              </button>
            </div>
          ))}
        </div>

        {/* Recrutement REC01 */}
        <div className="cf-card p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Recrutement clubs (REC01)</h2>
            <span className="cf-mono text-[10px] cf-muted">Module G18 isolé</span>
          </div>
          <div className="space-y-2">
            {offers.map((o) => (
              <div
                key={o.id}
                className="cf-card-secondary p-3 flex flex-wrap items-center justify-between gap-2"
              >
                <div>
                  <div className="font-semibold">{o.title}</div>
                  <div className="cf-muted">
                    {o.siteName} · {o.contractType} · {o.candidatesCount} candidat(s)
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const order: Array<'Ouverte' | 'Entretiens' | 'Pourvue'> = [
                      'Ouverte',
                      'Entretiens',
                      'Pourvue',
                    ];
                    const next = order[(order.indexOf(o.stage) + 1) % order.length];
                    setOffers((p) =>
                      p.map((x) => (x.id === o.id ? { ...x, stage: next } : x))
                    );
                  }}
                  className="cf-input px-3 py-1 cf-mono text-violet-300"
                >
                  Étape : {o.stage}
                </button>
              </div>
            ))}
          </div>
        </div>

        {renderSourceDrawer()}
      </div>
    );
  };

  let sectionContent: ReactNode;
  switch (activeSection) {
    case 'MC02':
      sectionContent = renderMc02();
      break;
    case 'MC04':
      sectionContent = renderMc04();
      break;
    case 'MC05':
      sectionContent = renderMc05();
      break;
    case 'MC06':
      sectionContent = renderMc06();
      break;
    case 'MC07':
      sectionContent = renderMc07();
      break;
    case 'MC08':
      sectionContent = renderMc08();
      break;
    case 'MC09':
      sectionContent = renderMc09();
      break;
    case 'MC10':
      sectionContent = renderMc10();
      break;
    case 'MC12':
      sectionContent = renderMc12();
      break;
    default:
      sectionContent = renderSourceDrawer();
      break;
  }

  return cleanUiTree(
    <>
      {renderZoomModal()}
      {sectionContent}
    </>,
    isTechnicalMode
  );
}
