import { validateLeadSnapshot } from '../../domain/leadProspectSnapshot';
import { LeadWorkspaceNavigation, type LeadWorkspacePage } from '../LeadWorkspaceNavigation';
import { LeadCommunicationsHistoryView } from "./LeadCommunicationsHistoryView";
import { LeadCampaignsView } from "./LeadCampaignsView";
import { confirmLeadDraftNavigation } from "../../domain/leadDraftGuard";
import { LeadMessageTemplatesView } from "./LeadMessageTemplatesView";
import { LeadScenariosView } from "./LeadScenariosView";
import { useLeadSettings } from '../useLeadSettings';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity as ActivityIcon,
  BarChart3,
  Calendar,
  Compass,
  Download,
  FileSpreadsheet,
  GitBranch,
  Image as ImageIcon,
  Layers,
  Lock,
  MessageCircle,
  Palmtree,
  Plus,
  Search,
  Send,
  ShieldAlert,
  Sliders,
  Trash2,
  UserCheck,
  Users,
  Webhook,
} from 'lucide-react';
import { useCfos } from '../../context/CfosContext';
import { clientApi } from '../../domain/clientApi';
import { SERVICE_ALERT_IDS, setLeadAlertEnabled } from '../../domain/leadNotificationSettings';
import { isHeitzDropout } from '../../domain/heitzCrm';
import { LEAD_SETTINGS_PRESENTATION } from '../../domain/leadSettingsPresentation';
import type { Prospect } from '../../types/cfos';
import { cleanUiTree } from '../../domain/cleanModeSanitizer';
import {
  INITIAL_FICTIVE_SALES,
  CANONICAL_HEITZ_PASS_OFFERS,
  CANONICAL_LEAD_ALERTS,
  computeActivityDueBucket,
  computeLeadReportBreakdown,
  filterFictiveSales,
  formatActivityDueAtParis,
  parseCsvLineWithQuotes,
  parseCsvRowsWithQuotes,
} from '../../domain/leadHubHelpers';
import {
  computeSmsSegmentMetrics,
  evaluateLeadModuleAccess,
  evaluateProspectAutoArchive,
  ingestLeadClubEntryWebhook,
  LEAD_11_BLOCAGES,
  LEAD_16_EXEMPLES,
  LEAD_23_ECARTS,
  LEAD_26_CAPTURES,
  LEAD_28_TRACEABILITY_GROUPS,
  LEAD_ACTIVITY_TIME_FILTERS,
  LEAD_ACTIVITY_TYPES,
  LEAD_AUDIT_META,
  LEAD_CLIENT_STATUSES,
  LEAD_EMAIL_BLOCKS_12,
  LEAD_IMPORT_COLUMNS_11,
  LEAD_PARTNERS_9,
  LEAD_PROSPECT_STATUSES,
  LEAD_SEGMENT_COLORS_15,
  LEAD_SERVICE_AUTOMATIONS_6,
  LEAD_SETTINGS_TABS_14,
  LEAD_SOURCES_CATEGORIES_9,
  LEAD_STATISTICS_8_TABLES,
  LEAD_STATISTICS_PERIOD_SHORTCUTS,
  LEAD_TARGETING_STATUSES,
  resolveWhatsAppSendDecision,
  validateAndParseLeadImportRows,
  validateAppointmentBooking,
  type AppointmentSlotRecord,
  type LeadModuleTarget,
  type LeadRole,
  type WhatsAppFallbackPolicy,
} from '../../domain/leadAuditRegistry';

export type LeadHubTab =
  | 'prospects'
  | 'clients'
  | 'activities'
  | 'planning'
  | 'messaging'
  | 'communication'
  | 'analytics_forms'
  | 'settings'
  | 'traceability';

interface LeadInventoryEntry {
  id: string;
  rubrique: string;
  option: string;
  etat: 'observe' | 'documente' | 'a_verifier' | string;
  precision: string;
  preuve: string;
}

interface VacationRecord {
  id: string;
  memberName: string;
  clubId: string;
  startDate: string;
  endDate: string;
  author: string;
}

interface FictiveActivityRow {
  id: string;
  type: (typeof LEAD_ACTIVITY_TYPES)[number]['code'];
  title: string;
  prospectId?: string;
  prospectName: string;
  clubId: 'carre-de-soie' | 'beynost';
  dueAt: string;
  status: 'todo' | 'done';
  assignedToId: string;
  notes?: string;
  statusLabel: string;
}

interface FictiveFormRow {
  id: string;
  name: string;
  description?: string;
  clubId: 'carre-de-soie' | 'beynost';
  responsesCount: number;
  createdAt: string;
  published: boolean;
  sections: number;
  sectionTitles?: string[];
  fields?: Array<{
    id: string;
    label: string;
    type: 'text' | 'email' | 'tel' | 'select' | 'checkbox';
    required: boolean;
  }>;
  sampleResponses?: Array<{
    id: string;
    fullName: string;
    email: string;
    phone: string;
    rgpdConsent: boolean;
    submittedAt: string;
  }>;
}

interface LeadCommercialHubViewProps {
  pipelineChildren: React.ReactNode;
  subTarget?: string | null;
}

const INITIAL_FICTIVE_ACTIVITIES: FictiveActivityRow[] = [
  { id: 'act-1', type: 'SCHEDULED_CALL', title: 'Rappel essai Biocircuit', prospectId: 'pr-1', prospectName: 'Camille Garnier', clubId: 'carre-de-soie', dueAt: new Date().toISOString().slice(0, 10) + 'T10:30', status: 'todo', assignedToId: 'emp-maxime', statusLabel: 'À traiter' },
  { id: 'act-2', type: 'APPOINTMENT', title: 'Bilan Checkup Technogym', prospectId: 'pr-2', prospectName: 'Lucas Morel', clubId: 'beynost', dueAt: new Date(Date.now() + 86400000).toISOString().slice(0, 10) + 'T14:00', status: 'todo', assignedToId: 'emp-chloe', statusLabel: 'Confirmé' },
  { id: 'act-3', type: 'CONTACT', title: 'Demande formulaire site web', prospectId: 'pr-3', prospectName: 'Nadia Benali', clubId: 'carre-de-soie', dueAt: new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10) + 'T09:00', status: 'todo', assignedToId: 'emp-maxime', statusLabel: 'En retard (J-3)' },
  { id: 'act-4', type: 'SCHEDULED_SMS', title: 'SMS rappel séance découverte', prospectId: 'pr-4', prospectName: 'Hugo Lefebvre', clubId: 'beynost', dueAt: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) + 'T11:00', status: 'todo', assignedToId: 'emp-chloe', statusLabel: 'Planifié' },
  { id: 'act-5', type: 'SCHEDULED_EMAIL', title: 'Email confirmation offre', prospectId: 'pr-5', prospectName: 'Claire Dubois', clubId: 'carre-de-soie', dueAt: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10) + 'T16:00', status: 'todo', assignedToId: 'emp-maxime', statusLabel: 'En attente (EX08)' },
  { id: 'act-6', type: 'REVIEW', title: 'Avis club Google / Lead', prospectName: 'Antoine Rocher', clubId: 'beynost', dueAt: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10) + 'T12:00', status: 'done', assignedToId: 'emp-chloe', statusLabel: 'Traité (EX09)' },
  { id: 'act-7', type: 'SMS', title: 'Réponse SMS entrante RDV', prospectName: 'Manon Faure', clubId: 'carre-de-soie', dueAt: new Date(Date.now() - 86400000).toISOString().slice(0, 10) + 'T15:00', status: 'done', assignedToId: 'emp-maxime', statusLabel: 'Reçu (EX07)' },
  { id: 'act-8', type: 'MAIL', title: 'Réponse email prospect', prospectName: 'Sébastien Girard', clubId: 'beynost', dueAt: new Date(Date.now() - 86400000).toISOString().slice(0, 10) + 'T17:00', status: 'done', assignedToId: 'emp-chloe', statusLabel: 'Lu' },
];

const INITIAL_FICTIVE_FORMS: FictiveFormRow[] = [
  {
    id: 'frm-1',
    name: 'Séance Découverte Carré de Soie',
    description: 'Formulaire d’essai 7 jours et bilan forme.',
    clubId: 'carre-de-soie',
    responsesCount: 42,
    createdAt: '2026-10-12',
    published: true,
    sections: 3,
    sectionTitles: ['Coordonnées', 'Objectifs forme', 'Consentement RGPD'],
    sampleResponses: [
      { id: 'rep-1', fullName: 'Camille Garnier', email: 'camille.test@exemple-cfitness.fr', phone: '06 11 22 33 44', rgpdConsent: true, submittedAt: '2026-11-18 10:15' },
    ],
  },
  {
    id: 'frm-2',
    name: 'Bilan Checkup Beynost (EX01/EX02)',
    description: 'Prise de RDV Bilan Technogym Checkup.',
    clubId: 'beynost',
    responsesCount: 19,
    createdAt: '2026-11-02',
    published: true,
    sections: 2,
    sectionTitles: ['Identité', 'Créneau souhaité'],
    sampleResponses: [
      { id: 'rep-2', fullName: 'Lucas Morel', email: 'lucas.morel@exemple.fr', phone: '06 55 44 33 22', rgpdConsent: true, submittedAt: '2026-11-17 16:40' },
    ],
  },
  {
    id: 'frm-3',
    name: 'Offre Entreprise & CE (Brouillon)',
    description: 'Partenariats comités d’entreprise.',
    clubId: 'carre-de-soie',
    responsesCount: 0,
    createdAt: '2026-11-16',
    published: false,
    sections: 1,
    sectionTitles: ['Société & Effectif'],
    sampleResponses: [],
  },
];

const INITIAL_SLOTS: AppointmentSlotRecord[] = [
  {
    id: 'slot-1',
    clubId: 'carre-de-soie',
    coachId: 'emp-karim',
    typeName: 'Bilan Technogym Checkup (45 min)',
    date: '2026-11-20',
    startTime: '10:00',
    durationMinutes: 45,
    capacityMax: 1,
    currentBookedCount: 1,
    paidRequired: false,
    paymentStatus: 'non_requis',
  },
  {
    id: 'slot-2',
    clubId: 'beynost',
    coachId: 'emp-sarah',
    typeName: 'Séance Coaching Découverte',
    date: '2026-11-20',
    startTime: '14:00',
    durationMinutes: 60,
    capacityMax: 2,
    currentBookedCount: 1,
    paidRequired: true,
    paymentStatus: 'attente_paiement',
  },
];

function mapAppRoleToLeadRole(role: string): LeadRole {
  if (role === 'admin' || role === 'manager' || role === 'commercial' || role === 'kiosque') {
    return role;
  }
  if (role === 'coach') return 'coach';
  return 'commercial';
}

export function LeadCommercialHubView({
  pipelineChildren,
  subTarget,
}: LeadCommercialHubViewProps) {
  const {
    currentUser,
    employees,
    heitzMembers,
    prospects,
    leadLocalContacts,
    leadServerClubs,
    clubFilter,
    isTechnicalMode,
    createProspect,
    updateProspect,
    assignSegmentToProspects,
    upsertServerProspects,
  } = useCfos();

  const allowedClubIds: Array<'carre-de-soie' | 'beynost'> =
    currentUser.role === 'admin'
      ? ['carre-de-soie', 'beynost']
      : currentUser.siteAssignments?.length
      ? currentUser.siteAssignments.map((sa) => sa.clubId)
      : [currentUser.clubId];
  const isClubAuthorized = (cid: 'carre-de-soie' | 'beynost') => allowedClubIds.includes(cid);
  const authorizedProspects = prospects.filter((p) => leadServerClubs?.includes(p.clubId) && (clubFilter === 'all' || p.clubId === clubFilter));
  const commercialLabelById: Record<string, string> = Object.fromEntries(
    employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`])
  );

  const [historyLimit,setHistoryLimit]=useState(50);
  const localHistory=(leadLocalContacts??[]).filter(p=>leadServerClubs?.includes(p.clubId)&&(clubFilter==='all'||p.clubId===clubFilter));
  const [workspaceReady,setWorkspaceReady]=useState(false);
  const [workspaceActor,setWorkspaceActor]=useState('');
  const [workspaceSyncError, setWorkspaceSyncError] = useState<string | null>(null);

  const syncSequence = useRef(0);
  const [sessionRevision,setSessionRevision]=useState(0);
  useEffect(()=>{ const update=(event:Event)=>{if((event as CustomEvent).detail?.employeeId===currentUser.id)setSessionRevision(v=>v+1);}; window.addEventListener('cfos-bearer-updated',update);return()=>window.removeEventListener('cfos-bearer-updated',update);},[currentUser.id]);
  const syncLeadWorkspaceFromServer = async () => {
    const ticket=++syncSequence.current;
    setWorkspaceSyncError(null);setWorkspaceReady(false);setWorkspaceActor(currentUser.id);
    const ws = await clientApi.getLeadWorkspace({ actorId: currentUser.id, siteId: 'all' });
    if(ticket!==syncSequence.current)return;
    const snapshot=validateLeadSnapshot(ws);
    setFormsList(
      (ws.forms ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        clubId: f.clubId,
        responsesCount: f.responsesCount,
        createdAt: '2026-11-16',
        published: f.published,
        sections: f.sectionTitles?.length ?? 1,
        sectionTitles: f.sectionTitles ?? [],
        fields: f.fields,
        sampleResponses: f.sampleResponses ?? [],
      }))
    );
    setRdvBookings(
      (ws.appointments ?? [])
        .filter((a) => a.status !== 'annule')
        .map((a) => ({
          id: a.id,
          clubId: a.clubId,
          coachId: a.coachId,
          typeName: a.prospectName ? `${a.typeName} (${a.prospectName})` : a.typeName,
          date: a.date,
          startTime: a.startTime,
          durationMinutes: a.durationMinutes,
          capacityMax: a.capacityMax,
          currentBookedCount: a.currentBookedCount,
          paidRequired: false,
          paymentStatus: (a.paymentStatus as 'non_requis' | 'attente_paiement' | 'paye') || 'non_requis',
        }))
    );
    setActivities(
      (ws.activities ?? []).map((a) => ({
        id: a.id,
        type: (a.type as FictiveActivityRow['type']) || 'CONTACT',
        title: a.title,
        prospectId: a.prospectId,
        prospectName: a.prospectName,
        clubId: a.clubId,
        dueAt: a.dueAt,
        status: a.status,
        assignedToId: a.assignedToId,
        statusLabel: a.statusLabel,
      }))
    );
    upsertServerProspects(currentUser.id,snapshot);
    setWorkspaceReady(true);

  };

  // Synchronisation serveur partagée (snapshot serveur prioritaire)
  useEffect(() => {
    let cancelled = false;
    void syncLeadWorkspaceFromServer().catch((err) => {
      if (!cancelled) {
        setWorkspaceSyncError(
          err instanceof Error
            ? 'Connexion aux données Lead interrompue. Reconnectez-vous ou réessayez.'
            : 'Synchronisation serveur Lead indisponible.'
        );
      }
    });
    return () => {
      cancelled = true; syncSequence.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id,sessionRevision]);

  // États persistants pour WhatsApp conversation (CFOS-007), Constructeur Email (CFOS-006) et Profil Club (CFOS-005)
  const [waComposerOpen, setWaComposerOpen] = useState(false);
  const [waTargetId, setWaTargetId] = useState<string>(() => prospects[0]?.id || '');
  const [waMessageText, setWaMessageText] = useState(
    'Bonjour ! Votre séance découverte C.Fitness est prête. Quel créneau vous convient ?'
  );
  const [waThreads, setWaThreads] = useState<
    Array<{ id: string; recipient: string; message: string; channel: string; sentAt: string }>
  >(() => {
    try {
      const raw = localStorage.getItem('cfos_wa_threads_v1');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [requestedProfileClubId, setSelectedProfileClubId] = useState<'carre-de-soie' | 'beynost'>(() =>
    clubFilter === 'beynost' ? 'beynost' : 'carre-de-soie'
  );
  const settingsClubChoices = clubFilter !== 'all' && allowedClubIds.includes(clubFilter)
    ? [clubFilter] : [...new Set(allowedClubIds)];
  const selectedProfileClubId = settingsClubChoices.includes(requestedProfileClubId)
    ? requestedProfileClubId : settingsClubChoices[0];
  const [clubProfilesByClub, setClubProfilesByClub] = useState<
    Record<
      'carre-de-soie' | 'beynost',
      { name: string; address: string; primaryColor: string; logoBadge: string }
    >
  >(() => {
    try {
      const raw = localStorage.getItem('cfos_lead_club_profiles_v1');
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return {
      'carre-de-soie': {
        name: 'C.Fitness Carré de Soie',
        address: '2 Rue Jacquard, 69120 Vaulx-en-Velin',
        primaryColor: '#7c3aed',
        logoBadge: 'CF-CDS',
      },
      beynost: {
        name: 'C.Fitness Beynost',
        address: 'ZAC des Baterses, 01700 Beynost',
        primaryColor: '#0ea5e9',
        logoBadge: 'CF-BEY',
      },
    };
  });
  const clubProfileForm = clubProfilesByClub[selectedProfileClubId];
  const [clubProfileSavedNotice, setClubProfileSavedNotice] = useState<{ text: string; error: boolean } | null>(null);

  const [activeTab, setActiveTabState] = useState<LeadHubTab>(() =>
    subTarget === 'lead-traceability' ? 'traceability' : 'prospects'
  );
  const setActiveTab = (tab:LeadHubTab) => { if(tab===activeTab || confirmLeadDraftNavigation(()=>setActiveTabState(tab))) setActiveTabState(tab); };
  const [simulatedRole, setSimulatedRole] = useState<LeadRole>(() =>
    mapAppRoleToLeadRole(currentUser.role)
  );
  const [statsAllowedForCommercial, setStatsAllowedForCommercial] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('cfos_lead_app_settings_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.statsAllowedForCommercial === 'boolean') {
          return parsed.statsAllowedForCommercial;
        }
      }
    } catch {
      // ignore
    }
    return true;
  });

  useEffect(() => {
    if (subTarget === 'lead-traceability' && isTechnicalMode) {
      setActiveTab('traceability');
    } else if (!isTechnicalMode && (activeTab === 'traceability' || activeTab === 'clients')) {
      setActiveTab('prospects');
    }
  }, [subTarget, isTechnicalMode, activeTab]);

  // Tab 1 : Import Excel 11 col. + Archivage réponse entrante + Segments sélection multiple
  const [importCsvText, setImportCsvText] = useState(
    [
      LEAD_IMPORT_COLUMNS_11.join(';'),
      'F;Camille;Garnier;camille.test@exemple-cfitness.fr;0611223344;12 Rue République;69120;Vaulx-en-Velin;15/05/1995;VRAI;Essai site web',
      'M;Paul;Invalide;email-invalide;0699887766;5 Av Lyon;01700;Beynost;1990-01-01;;Consentement absent -> false',
      'F;Clara;Doublon;claire.martin@cfitness-demo.fr;0600000001;2 Rue Jacquard;69120;Vaulx-en-Velin;10/03/1992;FAUX;Test doublon',
    ].join('\n')
  );
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [bulkSegmentToAssign, setBulkSegmentToAssign] = useState('Relance Biocircuit');
  const [bulkSegmentLog, setBulkSegmentLog] = useState<string | null>(null);
  const [selectedLeadStatusFilter, setSelectedLeadStatusFilter] = useState<string>('ALL');
  const [archiveDaysInbound, setArchiveDaysInbound] = useState(32);
  const [archiveDaysOutbound, setArchiveDaysOutbound] = useState(2);

  // Tab 2 : Clients + Vacances + Décrochage
  const [vacations, setVacations] = useState<VacationRecord[]>([
    {
      id: 'vac-1',
      memberName: heitzMembers[0] ? `${heitzMembers[0].firstName} ${heitzMembers[0].lastName}` : 'Claire Dubois (Fictif)',
      clubId: 'carre-de-soie',
      startDate: '2026-11-18',
      endDate: '2026-11-30',
      author: 'Manager Carré de Soie',
    },
  ]);
  const [newVacMember, setNewVacMember] = useState('Lucas Morel (Fictif)');
  const [newVacStart, setNewVacStart] = useState('2026-12-01');
  const [newVacEnd, setNewVacEnd] = useState('2026-12-15');

  // Tab 3 : Activités (/todos) — persistées localStorage + migration sûre (CFOS-046/047)
  const [activities, setActivities] = useState<FictiveActivityRow[]>(() => {
    try {
      const raw = localStorage.getItem('cfos_lead_activities_v1');
      if (raw) {
        const parsed = JSON.parse(raw) as FictiveActivityRow[];
        return parsed.map((act) => {
          if (act.prospectId && prospects.some((p) => p.id === act.prospectId)) {
            return act;
          }
          // Correspondance sûre uniquement par nom exact ET même club (sans devinette aveugle)
          const matched = prospects.find(
            (p) =>
              `${p.firstName} ${p.lastName}`.trim().toLowerCase() ===
                act.prospectName.trim().toLowerCase() && p.clubId === act.clubId
          );
          if (matched) {
            return { ...act, prospectId: matched.id };
          }
          return act;
        });
      }
    } catch {
      // ignore
    }
    return INITIAL_FICTIVE_ACTIVITIES;
  });
  useEffect(() => {
    try {
      localStorage.setItem('cfos_lead_activities_v1', JSON.stringify(activities));
    } catch {
      // ignore
    }
  }, [activities]);
  const [actTypeFilter, setActTypeFilter] =
    useState<(typeof LEAD_ACTIVITY_TYPES)[number]['code']>('*');
  const [actTimeFilter, setActTimeFilter] =
    useState<(typeof LEAD_ACTIVITY_TIME_FILTERS)[number] | 'ALL'>('ALL');
  const [purgeLog, setPurgeLog] = useState<string | null>(null);
  const [newActTitle, setNewActTitle] = useState('');
  const [newActType, setNewActType] = useState<FictiveActivityRow['type']>('SCHEDULED_CALL');
  const [newActProspectId, setNewActProspectId] = useState('');
  const [newActDueAt, setNewActDueAt] = useState(() => new Date().toISOString().slice(0, 10) + 'T11:00');
  const [newActAssigneeId, setNewActAssigneeId] = useState('emp-maxime');
  const [editingProspectId, setEditingProspectId] = useState<string | null>(null);
  const [editProspectForm, setEditProspectForm] = useState<{
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    goal: string;
    notes: string;
    address: string;
    assignedToId: string;
  }>({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    goal: '',
    notes: '',
    address: '',
    assignedToId: 'emp-maxime',
  });
  const [importFeedback, setImportFeedback] = useState<string | null>(null);

  // Tab 4 : Planning RDV & Stripe
  const [preventCrossTypeCollision, setPreventCrossTypeCollision] = useState(true);
  const [rdvCapacityMax, setRdvCapacityMax] = useState(1);
  const [rdvMinDelayHours, setRdvMinDelayHours] = useState(4);
  const [rdvHoursBeforeSlot, setRdvHoursBeforeSlot] = useState(6);
  const [rdvTypeCandidate, setRdvTypeCandidate] = useState('Coaching Découverte (60 min)');
  const [rdvCoachId, setRdvCoachId] = useState('emp-karim');
  const [rdvClubId, setRdvClubId] = useState<'carre-de-soie' | 'beynost'>('carre-de-soie');
  const [rdvDate, setRdvDate] = useState('2026-11-20');
  const [rdvTime, setRdvTime] = useState('10:00');
  const [rdvProspectId, setRdvProspectId] = useState(() => prospects[0]?.id || '');
  const [rdvBookings, setRdvBookings] = useState<AppointmentSlotRecord[]>(() => {
    try {
      const raw = localStorage.getItem('cfos_lead_rdv_slots_v1');
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return INITIAL_SLOTS;
  });
  useEffect(() => {
    try {
      localStorage.setItem('cfos_lead_rdv_slots_v1', JSON.stringify(rdvBookings));
    } catch {
      // ignore
    }
  }, [rdvBookings]);
  const [rdvActionMessage, setRdvActionMessage] = useState<string | null>(null);

  // A separate editor for each actor/club prevents stale responses and shared-cache leaks.
  const { editor: settingsEditor, state: settingsState } = useLeadSettings(currentUser.id, selectedProfileClubId);
  const crmSettings = settingsState.settings;
  const setCrmSettings = settingsEditor.update;
  const [testAlertNotice, setTestAlertNotice] = useState<string | null>(null);
  useEffect(() => {
    setTestAlertNotice(null);
    setClubProfileSavedNotice(null);
  }, [selectedProfileClubId, currentUser.id]);
  const [rdvRequiresStripe, setRdvRequiresStripe] = useState(false);
  const [rdvStripePaid, setRdvStripePaid] = useState(false);

  // Tab 5 : Messagerie & WhatsApp
  const [waHoursInbound, setWaHoursInbound] = useState(28);
  const [waFallback, setWaFallback] = useState<WhatsAppFallbackPolicy>('sms_repli');
  const [waMetaApproved, setWaMetaApproved] = useState(true);
  const [waMediaAttached, setWaMediaAttached] = useState(true);
  const [waExplicitSave, setWaExplicitSave] = useState(false);

  // Tab 6 : Communication
  const [commSubTab, setCommSubTab] = useState<'models' | 'campaigns' | 'utm' | 'scenarios' | 'logs'>('models');
  // Tab 7 : Statistiques, Ventes & Formulaires
  const [analyticsSubTab, setAnalyticsSubTab] = useState<'stats' | 'sales' | 'forms'>('stats');
  const [statsPeriodId, setStatsPeriodId] = useState<string>('current_month');
  const [ignoreArchivedStats, setIgnoreArchivedStats] = useState(true);
  const [compareToPreviousYear, setCompareToPreviousYear] = useState(true);
  const [multiClubBeynost, setMultiClubBeynost] = useState(true);
  const [multiClubCds, setMultiClubCds] = useState(true);
  const [formsList, setFormsList] = useState<FictiveFormRow[]>(() => {
    try {
      const raw = localStorage.getItem('cfos_lead_forms_v1');
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return INITIAL_FICTIVE_FORMS;
  });
  useEffect(() => {
    try {
      localStorage.setItem('cfos_lead_forms_v1', JSON.stringify(formsList));
    } catch {
      // ignore
    }
  }, [formsList]);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [showNewFormDialog, setShowNewFormDialog] = useState(false);
  const [newFormName, setNewFormName] = useState('');
  const [newFormDesc, setNewFormDesc] = useState('');
  const [newFormClub, setNewFormClub] = useState<'carre-de-soie' | 'beynost'>('carre-de-soie');
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [salesEndsAfter, setSalesEndsAfter] = useState('');
  const [salesEndsBefore, setSalesEndsBefore] = useState('');
  const [formAccessMessage, setFormAccessMessage] = useState<string | null>(null);

  // Tab 8 : Paramètres (14 rubriques) & Webhook testeur
  const [selectedSettingsTab, setSelectedSettingsTab] = useState<string>('partners');
  const [webhookEmail, setWebhookEmail] = useState('prospect.webhook@exemple.fr');
  const [webhookOffer, setWebhookOffer] = useState('Pass Découverte Biocircuit 7j');
  const [webhookResultText, setWebhookResultText] = useState<string | null>(null);

  // Tab 9 : Traçabilité 1 682 entrées
  const [leadEntries, setLeadEntries] = useState<LeadInventoryEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [traceQuery, setTraceQuery] = useState('');
  const [traceStateFilter, setTraceStateFilter] = useState<'ALL' | 'observe' | 'documente' | 'a_verifier'>('ALL');
  const [traceRubriqueFilter, setTraceRubriqueFilter] = useState('ALL');
  const [selectedCapture, setSelectedCapture] = useState<string>(LEAD_26_CAPTURES[2]);

  useEffect(() => {
    if (activeTab !== 'traceability' || leadEntries.length > 0 || entriesLoading) return;
    setEntriesLoading(true);
    fetch('/references/lead_audit/LEAD_AUDIT_EN_COURS/INVENTAIRE_LEAD.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { entrees?: LeadInventoryEntry[] }) => {
        setLeadEntries(Array.isArray(data.entrees) ? data.entrees : []);
        setEntriesError(null);
      })
      .catch((err: unknown) => {
        setEntriesError(err instanceof Error ? err.message : 'Erreur chargement INVENTAIRE_LEAD.json');
      })
      .finally(() => setEntriesLoading(false));
  }, [activeTab, leadEntries.length, entriesLoading]);

  const tabToTarget = (tab: LeadHubTab): LeadModuleTarget => {
    switch (tab) {
      case 'prospects':
        return 'prospects';
      case 'clients':
        return 'clients';
      case 'activities':
        return 'activities';
      case 'planning':
        return 'planning';
      case 'messaging':
        return 'messaging';
      case 'communication':
        return 'communication';
      case 'analytics_forms':
        return analyticsSubTab === 'stats'
          ? 'statistics'
          : analyticsSubTab === 'sales'
          ? 'sales'
          : 'forms_read';
      case 'settings':
        return 'settings';
      case 'traceability':
        return 'traceability';
    }
  };

  const currentAccess = evaluateLeadModuleAccess(
    simulatedRole,
    tabToTarget(activeTab),
    statsAllowedForCommercial
  );

  const importSummary = useMemo(() => {
    const parsedRows = parseCsvRowsWithQuotes(importCsvText, ';');
    const existingEmails = prospects.map((p) => p.email);
    const existingPhones = prospects.map((p) => p.phone);
    return validateAndParseLeadImportRows(parsedRows, existingEmails, existingPhones);
  }, [importCsvText, prospects]);

  const archiveDecision = useMemo(
    () =>
      crmSettings ? evaluateProspectAutoArchive(
        archiveDaysInbound,
        archiveDaysOutbound,
        crmSettings.archiveThresholdDays,
        false
      ) : { shouldArchive: false, reason: "Réglages du club indisponibles : simulation suspendue." },
    [archiveDaysInbound, archiveDaysOutbound, crmSettings?.archiveThresholdDays]
  );

  const rdvBookingDecision = useMemo(
    () =>
      validateAppointmentBooking(
        rdvBookings,
        {
          clubId: rdvClubId,
          coachId: rdvCoachId,
          typeName: rdvTypeCandidate,
          date: rdvDate,
          startTime: rdvTime,
          hoursBeforeSlot: rdvHoursBeforeSlot,
          minDelayHours: rdvMinDelayHours,
          capacityMax: rdvCapacityMax,
          requiresStripePayment: rdvRequiresStripe,
          stripePaidConfirmed: rdvStripePaid,
        },
        preventCrossTypeCollision
      ),
    [
      rdvBookings,
      rdvClubId,
      rdvCoachId,
      rdvTypeCandidate,
      rdvDate,
      rdvTime,
      rdvHoursBeforeSlot,
      rdvMinDelayHours,
      rdvCapacityMax,
      rdvRequiresStripe,
      rdvStripePaid,
      preventCrossTypeCollision,
    ]
  );

  const waDecision = useMemo(
    () =>
      resolveWhatsAppSendDecision({
        hoursSinceLastInboundMessage: waHoursInbound,
        templateMetaApproved: waMetaApproved,
        requiredMediaAttached: waMediaAttached,
        fallbackPolicy: waFallback,
        templateName: 'relance_essai_cfitness_fr',
        bodyText: 'Bonjour {{1}}, votre séance découverte vous attend au club C.Fitness.',
        footerText: 'C.Fitness Carré de Soie & Beynost',
        quickReplyTexts: ['Je confirme', 'Décaler le RDV'],
        buttonsCount: 2,
        mediaSizeMb: 1.2,
        explicitSave: waExplicitSave,
      }),
    [waHoursInbound, waMetaApproved, waMediaAttached, waFallback, waExplicitSave]
  );


  const filteredActivities = useMemo(() => {
    const allowedClubs =
      currentUser.role === 'admin'
        ? null
        : currentUser.siteAssignments?.length
        ? currentUser.siteAssignments.map((sa) => sa.clubId)
        : [currentUser.clubId];
    return activities.filter((a) => {
      if (allowedClubs && !allowedClubs.includes(a.clubId)) return false;
      if (clubFilter !== 'all' && a.clubId !== clubFilter) return false;
      if (actTypeFilter !== '*' && a.type !== actTypeFilter) return false;
      const bucket = computeActivityDueBucket(a.dueAt, a.status);
      if (actTimeFilter !== 'ALL' && bucket !== actTimeFilter) return false;
      return true;
    });
  }, [activities, clubFilter, actTypeFilter, actTimeFilter, currentUser.role, currentUser.clubId, currentUser.siteAssignments]);

  const uniqueTraceRubriques = useMemo(() => {
    const set = new Set<string>();
    leadEntries.forEach((e) => {
      const root = e.rubrique.split('/')[0].trim();
      if (root) set.add(root);
    });
    return Array.from(set).sort();
  }, [leadEntries]);

  const filteredTraceEntries = useMemo(() => {
    const q = traceQuery.trim().toLowerCase();
    return leadEntries
      .filter((e) => {
        if (traceStateFilter !== 'ALL' && e.etat !== traceStateFilter) return false;
        if (traceRubriqueFilter !== 'ALL' && !e.rubrique.startsWith(traceRubriqueFilter)) return false;
        if (!q) return true;
        return (
          e.id.toLowerCase().includes(q) ||
          e.rubrique.toLowerCase().includes(q) ||
          e.option.toLowerCase().includes(q) ||
          e.precision.toLowerCase().includes(q)
        );
      })
      .slice(0, 120);
  }, [leadEntries, traceQuery, traceStateFilter, traceRubriqueFilter]);

  const handleDeleteForm = (formId: string) => {
    const access = evaluateLeadModuleAccess(simulatedRole, 'form_delete', statsAllowedForCommercial);
    if (!access.allowed) {
      setFormAccessMessage(`HTTP ${access.httpStatus} — ${access.reason}`);
      return;
    }
    const target = formsList.find((f) => f.id === formId);
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Supprimer le formulaire « ${target?.name ?? formId} » ?`)
    ) {
      return;
    }
    setFormsList((prev) => prev.filter((f) => f.id !== formId));
    if (selectedFormId === formId) setSelectedFormId(null);
    setFormAccessMessage('Formulaire supprimé.');
  };

  const handleTestWebhook = async () => {
    const localCheck = ingestLeadClubEntryWebhook({
      apiKey: 'CFOS-LEAD-KEY-DEMO',
      club: clubFilter === 'beynost' ? '11400-beynost' : 'carre-de-soie',
      email: webhookEmail,
      lastname: 'Test',
      firstname: 'Contact',
      offername: webhookOffer || undefined,
      utm_source: 'meta_ads',
      utm_campaign: 'rentree_biocircuit',
    });
    try {
      const res = await fetch('/api/lead/webhooks/clubEntry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: 'CFOS-LEAD-KEY-DEMO',
          club: clubFilter === 'beynost' ? '11400-beynost' : 'carre-de-soie',
          email: webhookEmail,
          lastname: 'Test',
          firstname: 'Contact',
          offername: webhookOffer,
          utm_source: 'meta_ads',
          utm_campaign: 'rentree_biocircuit',
        }),
      });
      const json = await res.json();
      setWebhookResultText(`API HTTP ${res.status} : ${JSON.stringify(json)}`);
    } catch {
      setWebhookResultText(
        `Validation locale HTTP ${localCheck.status} : ${localCheck.entryType ?? localCheck.error}`
      );
    }
  };

  const activePage: LeadWorkspacePage = activeTab === 'communication' ? commSubTab
    : activeTab === 'analytics_forms' ? analyticsSubTab : activeTab;
  const destination = (page: LeadWorkspacePage): LeadHubTab =>
    ['models', 'campaigns', 'utm', 'scenarios', 'logs'].includes(page) ? 'communication'
      : ['stats', 'sales', 'forms'].includes(page) ? 'analytics_forms' : page as LeadHubTab;
  const selectPage = (page: LeadWorkspacePage) => {
    if (page === activePage) return;
    const apply = () => {
      const tab = destination(page);
      setActiveTabState(tab);
      if (tab === 'communication') setCommSubTab(page as typeof commSubTab);
      if (tab === 'analytics_forms') setAnalyticsSubTab(page as typeof analyticsSubTab);
    };
    if (confirmLeadDraftNavigation(apply)) apply();
  };
  const canAccessPage = (page: LeadWorkspacePage) => {
    const target = page === 'stats' ? 'statistics' : page === 'sales' ? 'sales'
      : page === 'forms' ? 'forms_read' : tabToTarget(destination(page));
    return evaluateLeadModuleAccess(simulatedRole, target, statsAllowedForCommercial).allowed;
  };

  return cleanUiTree(
    <div className="space-y-4">
      {/* ===================================================================== */}
      {/* EN-TÊTE HUB COMMERCIAL LEAD (SÉPARÉ DE MON COMPTE RH V1.16)           */}
      {/* ===================================================================== */}
      <div className="cf-card p-4 space-y-3 border border-emerald-500/30">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div>
            {isTechnicalMode ? (
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                <span>Module Commercial CRM « Lead → C.Fitness OS » · v{LEAD_AUDIT_META.version}</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30">
                  {LEAD_AUDIT_META.totalEntries} entrées ({LEAD_AUDIT_META.observedCount} observées · {LEAD_AUDIT_META.documentedCount} doc · {LEAD_AUDIT_META.toVerifyCount} à vérifier)
                </span>
                <span className="px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-300">
                  Séparé de « Mon compte » RH V1.16
                </span>
              </div>
            ) : (
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                Votre espace commercial
              </div>
            )}
            <h1 className="text-base sm:text-lg font-extrabold mt-1">
              {isTechnicalMode
                ? `Prospection – Vente Bi-Club, Communication Multicanal & Traçabilité Lead (${LEAD_AUDIT_META.totalFiles} fichiers)`
                : 'Prospection'}
            </h1>
          </div>

          {/* Sélecteur de rôle Lead pour tester les restrictions RBAC serveur */}
          {isTechnicalMode && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="cf-muted font-semibold">Simulation Rôle Lead :</span>
              {(['admin', 'manager', 'commercial', 'coach'] as LeadRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setSimulatedRole(r)}
                  className={`px-2.5 py-1 rounded-lg font-bold uppercase cursor-pointer border transition-colors ${
                    simulatedRole === r
                      ? 'bg-emerald-600 text-white border-emerald-500'
                      : 'bg-slate-900/60 text-slate-300 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>

        {workspaceSyncError && (
          <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200 flex items-center justify-between gap-2">
            <span>{workspaceSyncError}</span>
            <button
              type="button"
              onClick={() => void syncLeadWorkspaceFromServer().catch((err) => {
                setWorkspaceSyncError(err instanceof Error ? err.message : 'Erreur de synchronisation serveur');
              })}
              className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold shrink-0 cursor-pointer"
            >
              Réessayer
            </button>
          </div>
        )}

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[220px_minmax(0,1fr)] gap-4 items-start">
        <LeadWorkspaceNavigation activePage={activePage} onSelect={selectPage} canAccess={canAccessPage} technicalMode={isTechnicalMode} />
        <div className="min-w-0 space-y-4">
      {/* Contrôle serveur RBAC si la vue active est bloquée */}
      {!currentAccess.allowed ? (
        <div className="cf-card p-6 border border-rose-500/40 bg-rose-950/20 space-y-3">
          <div className="flex items-center gap-2 text-rose-400 font-extrabold text-sm">
            <ShieldAlert className="w-5 h-5" />
            <span>Accès réservé</span>
          </div>
          <p className="text-xs text-slate-200">{currentAccess.reason}</p>
          <p className="text-sm cf-muted">Contactez votre responsable si cette rubrique est nécessaire à votre travail.</p>
        </div>
      ) : (
        <>
          {/* ================================================================= */}
          {/* ONGLET 1 : PIPELINE EXISTANT + OUTILS PROSPECTS LEAD              */}
          {/* ================================================================= */}
          {activeTab === 'prospects' && (
            <div className="space-y-4">
              {workspaceReady && workspaceActor===currentUser.id && (clubFilter==='all' || leadServerClubs?.includes(clubFilter)) ? pipelineChildren : <div className="cf-card p-4" role="status">{workspaceSyncError ? 'La liste partagée n’est pas disponible. Les contacts de cet appareil sont conservés ; réessayez le chargement.' : 'Chargement des prospects partagés…'}</div>}

              {workspaceReady && workspaceActor===currentUser.id && localHistory.length>0 && <details className="cf-card p-4">
                <summary className="cursor-pointer font-semibold text-sm">Contacts et anciennes versions conservés sur cet appareil</summary>
                <p className="cf-muted text-sm mt-2">Ces copies ne remplacent pas les données partagées et ne sont pas comptées dans les indicateurs. Elles restent consultables pour reprendre une ancienne saisie, sans import ni suppression automatique.</p>
                <ul className="space-y-3 mt-3">{localHistory.slice(0,historyLimit).map((p,i)=><li key={p.id+':'+i} className="cf-card-secondary rounded-lg p-3 text-sm break-words"><strong>{p.firstName} {p.lastName}</strong><p>{p.phone} · {p.email}</p><p className="cf-muted">{p.source} · {p.stage}</p>{p.notes&&<p className="whitespace-pre-wrap">{p.notes}</p>}</li>)}</ul>
                {localHistory.length>historyLimit && <button type="button" className="cf-card-secondary rounded-lg p-3 text-sm mt-3" onClick={()=>setHistoryLimit(n=>n+50)}>Afficher les contacts conservés suivants</button>}
              </details>}
              <details className="group cf-card p-4">
                <summary className="cursor-pointer font-semibold text-sm">Importer des prospects et gérer les segments</summary>
                <p className="text-xs cf-muted mt-2 mb-4">Ajoutez une liste de contacts ou mettez à jour les segments de plusieurs prospects.</p>
              {/* Extension Lead Lot 2A : 10 statuts, Sélection multiple Segments, Import Excel 11 col., Archivage & DOC-02 */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {/* Import Excel Officiel 11 Colonnes */}
                <div className="cf-card p-4 space-y-3 border border-slate-700/80">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-extrabold flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                        Importer des prospects
                      </h3>
                      <p className="text-[11px] cf-muted">
                        Utilisez le modèle proposé. L’email est requis et le consentement doit être renseigné pour chaque contact.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const csv = [
                            LEAD_IMPORT_COLUMNS_11.join(';'),
                            'F;Marie-Claire;Dupont;marie.claire@exemple.fr;0611223344;12 Rue République;69120;Vaulx-en-Velin;15/05/1995;VRAI;"Note;avec point-virgule"',
                          ].join('\n');
                          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = 'modele-import-prospects-11-colonnes.csv';
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Modèle .csv (UTF-8)
                      </button>
                      <a
                        href="/references/lead_audit/LEAD_AUDIT_EN_COURS/sources/template_import_prospects_officiel.xlsx"
                        download
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Modèle .xlsx officiel
                      </a>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1 text-[10px]">
                    {LEAD_IMPORT_COLUMNS_11.map((col, i) => (
                      <span
                        key={col}
                        className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 font-mono"
                      >
                        {i + 1}. {col}
                      </span>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-semibold cursor-pointer">
                      Charger un fichier .csv
                      <input
                        type="file"
                        accept=".csv,.txt"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            if (typeof reader.result === 'string') {
                              setImportCsvText(reader.result);
                              setImportFeedback(`Fichier « ${file.name} » chargé pour aperçu.`);
                            }
                          };
                          reader.readAsText(file, 'utf-8');
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={importSummary.validCount === 0 || simulatedRole === 'commercial'}
                      onClick={async () => {
                        const rawRows = parseCsvRowsWithQuotes(importCsvText, ';');
                        const targetClub: 'carre-de-soie' | 'beynost' =
                          allowedClubIds.length === 1
                            ? allowedClubIds[0]
                            : clubFilter === 'beynost'
                            ? 'beynost'
                            : 'carre-de-soie';
                        const serverRows = importSummary.results
                          .filter((row) => row.status === 'valide')
                          .map((row) => {
                            const cols = rawRows[row.rowNumber - 1] ?? [];
                            return {
                              gender: (cols[0] || '').trim(),
                              firstName: (cols[1] || '').trim() || 'Prospect',
                              lastName: (cols[2] || '').trim() || 'Importé',
                              email: row.email,
                              phone: (cols[4] || '').trim() || '0600000000',
                              street: (cols[5] || '').trim(),
                              postalCode: (cols[6] || '').trim(),
                              city: (cols[7] || '').trim(),
                              birthDate: (cols[8] || '').trim(),
                              comment: (cols[10] || '').trim(),
                              clubId: targetClub,
                              rgpdConsent: row.consentGranted,
                            };
                          });
                        try {
                          const res = await clientApi.importLeadProspects(
                            { actorId: currentUser.id, siteId: 'all' },
                            serverRows
                          );
                          await syncLeadWorkspaceFromServer();
                          setImportFeedback(
                            `Import exécuté (${targetClub}) : ${res.created} prospect(s) persisté(s) sur le serveur, ${res.skippedDuplicates} doublon(s), ${res.rejected} rejet(s).`
                          );
                        } catch (err) {
                          setImportFeedback(
                            `Erreur import serveur : ${err instanceof Error ? err.message : String(err)}`
                          );
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
                    >
                      Confirmer l&apos;import ({importSummary.validCount} valide(s))
                    </button>
                  </div>

                  {importFeedback && (
                    <div className="p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-[11px] text-emerald-300 font-semibold">
                      {importFeedback}
                    </div>
                  )}

                  <textarea
                    value={importCsvText}
                    onChange={(e) => setImportCsvText(e.target.value)}
                    rows={4}
                    aria-label="Aperçu CSV des 11 colonnes d'import prospects"
                    className="w-full rounded-xl bg-slate-950/70 border border-slate-700 p-2.5 text-[11px] font-mono text-slate-200"
                  />

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                      <div className="font-black text-emerald-400">{importSummary.validCount}</div>
                      <div className="text-[10px] cf-muted">Valides</div>
                    </div>
                    <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                      <div className="font-black text-amber-400">{importSummary.duplicateCount}</div>
                      <div className="text-[10px] cf-muted">Doublons</div>
                    </div>
                    <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30">
                      <div className="font-black text-rose-400">{importSummary.rejectedCount}</div>
                      <div className="text-[10px] cf-muted">Rejetés (EX16)</div>
                    </div>
                  </div>

                  <div className="space-y-1 max-h-28 overflow-y-auto text-[11px]">
                    {importSummary.results.map((r) => (
                      <div
                        key={r.rowNumber}
                        className="flex flex-wrap items-center justify-between gap-2 px-2 py-1 rounded bg-slate-900/60 border border-slate-800"
                      >
                        <span className="font-semibold">
                          L{r.rowNumber} · {r.fullName} ({r.email || 'sans email'})
                        </span>
                        <span className="font-mono text-[10px]">
                          [{r.status.toUpperCase()}] {r.reason} · RGPD={r.consentGranted ? 'OUI' : 'NON'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 10 Statuts Lead + Sélection Multiple Segments + Règle Archivage */}
                <div className="cf-card p-4 space-y-3 border border-slate-700/80">
                  <h3 className="text-sm font-extrabold flex items-center gap-2">
                    <Layers className="w-4 h-4 text-violet-400" />
                    Segments et suivi des contacts
                  </h3>

                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedLeadStatusFilter('ALL')}
                      className={`px-2 py-1 rounded-lg text-[11px] font-semibold cursor-pointer border ${
                        selectedLeadStatusFilter === 'ALL'
                          ? 'bg-violet-600 text-white border-violet-400'
                          : 'bg-slate-900/60 border-slate-700 text-slate-300'
                      }`}
                    >
                      Tous ({authorizedProspects.length})
                    </button>
                    {LEAD_PROSPECT_STATUSES.map((st) => {
                      const countForStatus = authorizedProspects.filter(
                        (p) => (p.leadStatus ?? p.stage) === st
                      ).length;
                      return (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setSelectedLeadStatusFilter(st)}
                          className={`px-2 py-1 rounded-lg text-[11px] font-semibold cursor-pointer border ${
                            selectedLeadStatusFilter === st
                              ? 'bg-violet-600 text-white border-violet-400'
                              : 'bg-slate-900/60 border-slate-700 text-slate-300'
                          }`}
                        >
                          {st} ({countForStatus})
                        </button>
                      );
                    })}
                  </div>

                  {/* Sélection multiple -> Segments */}
                  {(() => {
                    const filteredLeadList = authorizedProspects.filter((p) => {
                      if (clubFilter !== 'all' && p.clubId !== clubFilter) return false;
                      if (selectedLeadStatusFilter === 'ALL') return true;
                      return (p.leadStatus ?? p.stage) === selectedLeadStatusFilter;
                    });
                    return (
                      <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 text-xs">
                        <div className="font-bold flex items-center justify-between">
                          <span>
                            Sélection multiple ({filteredLeadList.length} affiché(s)) → Ajouter un segment ({selectedLeadIds.length} choisi(s))
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedLeadIds(
                                selectedLeadIds.length === filteredLeadList.length
                                  ? []
                                  : filteredLeadList.map((p) => p.id)
                              )
                            }
                            className="text-[10px] underline text-violet-300 cursor-pointer"
                          >
                            {selectedLeadIds.length === filteredLeadList.length && filteredLeadList.length > 0
                              ? 'Tout décocher'
                              : 'Tout cocher'}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                          {filteredLeadList.map((p) => {
                            const checked = selectedLeadIds.includes(p.id);
                            return (
                              <div
                                key={p.id}
                                className="px-2 py-1 rounded bg-slate-950/60 border border-slate-700 flex items-center gap-1.5 text-[11px]"
                              >
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      setSelectedLeadIds((prev) =>
                                        checked ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                                      )
                                    }
                                  />
                                  <span>
                                    {p.firstName} {p.lastName}
                                  </span>
                                </label>
                                {p.segments && p.segments.length > 0 && (
                                  <span className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 text-[9px]">
                                    {p.segments.join(', ')}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingProspectId(p.id);
                                    setEditProspectForm({
                                      firstName: p.firstName,
                                      lastName: p.lastName,
                                      phone: p.phone,
                                      email: p.email,
                                      goal: p.goal,
                                      notes: p.notes,
                                      address: p.address ?? '',
                                      assignedToId: p.assignedToId,
                                    });
                                  }}
                                  className="text-[10px] text-emerald-300 underline cursor-pointer ml-1"
                                >
                                  Éditer
                                </button>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={bulkSegmentToAssign}
                            onChange={(e) => setBulkSegmentToAssign(e.target.value)}
                            aria-label="Segment à attribuer à la sélection"
                            className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs"
                          >
                            <option value="Relance Biocircuit">Relance Biocircuit</option>
                            <option value="VIP Carré de Soie">VIP Carré de Soie</option>
                            <option value="Offre Parrainage Beynost">Offre Parrainage Beynost</option>
                          </select>
                          <button
                            type="button"
                            disabled={selectedLeadIds.length === 0}
                            onClick={() => {
                              const count = assignSegmentToProspects(selectedLeadIds, bulkSegmentToAssign);
                              setBulkSegmentLog(
                                `Segment « ${bulkSegmentToAssign} » enregistré sur ${count} prospect(s).`
                              );
                            }}
                            className="px-3 py-1.5 rounded-lg bg-violet-600 disabled:opacity-40 text-white font-bold text-xs cursor-pointer"
                          >
                            Ajouter à la sélection
                          </button>
                        </div>
                        {bulkSegmentLog && (
                          <div className="text-[11px] text-emerald-400 font-semibold">{bulkSegmentLog}</div>
                        )}
                        {editingProspectId && (
                          <div className="p-3 rounded-lg bg-slate-950/90 border border-emerald-500/40 space-y-2 mt-2">
                            <div className="flex items-center justify-between">
                              <strong className="text-emerald-300">Édition fiche contact</strong>
                              <button
                                type="button"
                                onClick={() => setEditingProspectId(null)}
                                className="text-[11px] text-slate-400 cursor-pointer"
                              >
                                Fermer
                              </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <input
                                type="text"
                                placeholder="Prénom"
                                value={editProspectForm.firstName}
                                onChange={(e) => setEditProspectForm((f) => ({ ...f, firstName: e.target.value }))}
                                className="px-2 py-1 rounded bg-slate-900 border border-slate-700"
                              />
                              <input
                                type="text"
                                placeholder="Nom"
                                value={editProspectForm.lastName}
                                onChange={(e) => setEditProspectForm((f) => ({ ...f, lastName: e.target.value }))}
                                className="px-2 py-1 rounded bg-slate-900 border border-slate-700"
                              />
                              <input
                                type="text"
                                placeholder="Téléphone (06...)"
                                value={editProspectForm.phone}
                                onChange={(e) => setEditProspectForm((f) => ({ ...f, phone: e.target.value }))}
                                className="px-2 py-1 rounded bg-slate-900 border border-slate-700"
                              />
                              <input
                                type="email"
                                placeholder="Email"
                                value={editProspectForm.email}
                                onChange={(e) => setEditProspectForm((f) => ({ ...f, email: e.target.value }))}
                                className="px-2 py-1 rounded bg-slate-900 border border-slate-700"
                              />
                              <input
                                type="text"
                                placeholder="Adresse"
                                value={editProspectForm.address}
                                onChange={(e) => setEditProspectForm((f) => ({ ...f, address: e.target.value }))}
                                className="px-2 py-1 rounded bg-slate-900 border border-slate-700"
                              />
                              <select
                                value={editProspectForm.assignedToId}
                                onChange={(e) => setEditProspectForm((f) => ({ ...f, assignedToId: e.target.value }))}
                                className="px-2 py-1 rounded bg-slate-900 border border-slate-700"
                              >
                                {employees.filter((e) => e.role !== 'kiosque').map((e) => (
                                  <option key={e.id} value={e.id}>
                                    {e.firstName} {e.lastName}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <input
                              type="text"
                              placeholder="Notes / Objectif"
                              value={editProspectForm.notes}
                              onChange={(e) => setEditProspectForm((f) => ({ ...f, notes: e.target.value }))}
                              className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const res = updateProspect(editingProspectId, editProspectForm);
                                setBulkSegmentLog(res.message);
                                if (res.ok) setEditingProspectId(null);
                              }}
                              className="px-3 py-1 rounded bg-emerald-600 text-white font-bold cursor-pointer"
                            >
                              Enregistrer la fiche
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Règle d'archivage sur réponse entrante uniquement */}
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 text-xs">
                    <div className="font-bold">Simulateur Archivage Automatique (Seule la réponse entrante repousse)</div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[11px]">
                        Jours sans réponse entrante
                        <input
                          type="number"
                          min={0}
                          value={archiveDaysInbound}
                          onChange={(e) => setArchiveDaysInbound(Number(e.target.value) || 0)}
                          className="w-full mt-1 px-2 py-1 rounded bg-slate-950 border border-slate-700"
                        />
                      </label>
                      <label className="text-[11px]">
                        Jours depuis dernier envoi sortant
                        <input
                          type="number"
                          min={0}
                          value={archiveDaysOutbound}
                          onChange={(e) => setArchiveDaysOutbound(Number(e.target.value) || 0)}
                          className="w-full mt-1 px-2 py-1 rounded bg-slate-950 border border-slate-700"
                        />
                      </label>
                    </div>
                    <div
                      className={`text-[11px] font-semibold ${
                        archiveDecision.shouldArchive ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      {archiveDecision.reason}
                    </div>
                  </div>
                </div>
              </div>
              </details>
            </div>
          )}

          {/* ================================================================= */}
          {/* ONGLET 2 : CLIENTS (2 STATUTS) + VACANCES + DÉCROCHAGE HEITZ       */}
          {/* ================================================================= */}
          {activeTab === 'clients' && (
            <div className="space-y-4">
              <div className="cf-card p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-extrabold">
                      Clients Actifs ({LEAD_CLIENT_STATUSES.join(' · ')}) — Vacances &amp; Décrochage Heitz
                    </h2>
                    <p className="text-xs cf-muted">
                      Intégration DOC-02 (Histoire sportive Technogym Checkup / Mywellness) &amp; règle Vacances sans suspension contractuelle
                    </p>
                  </div>
                  <div className="text-xs font-mono px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700">
                    Sélection multiple : {evaluateLeadModuleAccess(simulatedRole, 'client_bulk_select').allowed ? 'Autorisée' : 'Masquée (COMMERCIAL)'}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-2 pr-3">Adhérent Heitz</th>
                        <th className="py-2 pr-3">Statut Lead</th>
                        <th className="py-2 pr-3">Dernier passage (Décrochage)</th>
                        <th className="py-2 pr-3">Histoire sportive (DOC-02)</th>
                        <th className="py-2">Abonnement &amp; SEPA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {heitzMembers.map((m) => {
                        const isDrop = isHeitzDropout(m, 14);
                        return (
                          <tr key={m.id} className="border-b border-slate-800/60">
                            <td className="py-2 pr-3 font-bold">
                              {m.firstName} {m.lastName}
                              <div className="text-[10px] cf-muted font-mono">{m.badgeCode} · {m.homeClubId}</div>
                            </td>
                            <td className="py-2 pr-3">
                              <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-semibold">
                                {m.subscriptionName.toLowerCase().includes('bi-club') ? 'Client enseigne' : 'Client'}
                              </span>
                            </td>
                            <td className="py-2 pr-3">
                              <span
                                className={`px-2 py-0.5 rounded font-bold ${
                                  isDrop
                                    ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                                    : 'bg-slate-800 text-slate-200'
                                }`}
                              >
                                {m.lastWorkoutKnown === false
                                  ? 'Passage à vérifier dans Heitz'
                                  : `${m.daysSinceLastWorkout} j sans passage ${isDrop ? '⚠ Décrocheur' : ''}`}
                              </span>
                            </td>
                            <td className="py-2 pr-3 font-mono text-[11px]">
                              {m.dataSource === 'HeitzSystem Cloud'
                                ? 'Données MOVEs et Checkup non synchronisées'
                                : `Score Checkup ${m.technogymCheckupScore ?? 'non renseigné'} · Âge ${m.technogymCheckupWellnessAge ?? 'non renseigné'} · ${m.technogymMoves30d} MOVEs/30j`}
                            </td>
                            <td className="py-2">
                              {m.subscriptionName} ({m.finBalanceEur < 0 ? `Impayé ${m.finBalanceEur} €` : 'À jour'})
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Calendrier Vacances client */}
              <div className="cf-card p-4 space-y-3">
                <h3 className="text-sm font-extrabold flex items-center gap-2">
                  <Palmtree className="w-4 h-4 text-amber-400" />
                  Vacances Client (Exclusion temporaire des campagnes, sans suspension contrat Heitz)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
                  <input
                    type="text"
                    value={newVacMember}
                    onChange={(e) => setNewVacMember(e.target.value)}
                    aria-label="Nom adhérent en vacances"
                    className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700"
                  />
                  <input
                    type="date"
                    value={newVacStart}
                    onChange={(e) => setNewVacStart(e.target.value)}
                    aria-label="Date début vacances"
                    className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700"
                  />
                  <input
                    type="date"
                    value={newVacEnd}
                    onChange={(e) => setNewVacEnd(e.target.value)}
                    aria-label="Date fin vacances"
                    className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setVacations((prev) => [
                        ...prev,
                        {
                          id: `vac-${Date.now()}`,
                          memberName: newVacMember,
                          clubId: clubFilter === 'beynost' ? 'beynost' : 'carre-de-soie',
                          startDate: newVacStart,
                          endDate: newVacEnd,
                          author: currentUser.firstName,
                        },
                      ])
                    }
                    className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold cursor-pointer"
                  >
                    + Enregistrer période vacances
                  </button>
                </div>
                <div className="space-y-1.5 text-xs">
                  {vacations.map((v) => (
                    <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                      <span>
                        <strong>{v.memberName}</strong> · Du {v.startDate} au {v.endDate} (par {v.author})
                      </span>
                      <span className="text-[11px] text-amber-300 font-semibold">
                        Exclu des campagnes SMS/Email · Abonnement Heitz maintenu actif
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* ONGLET 3 : ACTIVITÉS (/todos) — 9 TYPES & PURGE RETARDS           */}
          {/* ================================================================= */}
          {activeTab === 'activities' && (
            <div className="cf-card p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-extrabold">
                    Activités Commerciales (`/todos`) — 9 types &amp; 6 vues temporelles (échéances ISO réelles)
                  </h2>
                  <p className="text-xs cf-muted">
                    Création, affectation, report, traitement individuel et lien direct vers la fiche prospect.
                  </p>
                </div>
                {simulatedRole !== 'commercial' ? (
                  <button
                    type="button"
                    onClick={() => {
                      const overdueCount = activities.filter(
                        (a) => computeActivityDueBucket(a.dueAt, a.status) === 'En retard'
                      ).length;
                      if (overdueCount === 0) {
                        setPurgeLog('Aucune activité en retard à purger.');
                        return;
                      }
                      if (
                        typeof window !== 'undefined' &&
                        !window.confirm(`Confirmer la purge locale de ${overdueCount} activité(s) en retard ?`)
                      ) {
                        return;
                      }
                      setActivities((prev) =>
                        prev.map((a) =>
                          computeActivityDueBucket(a.dueAt, a.status) === 'En retard'
                            ? { ...a, status: 'done', statusLabel: 'Clôturé' }
                            : a
                        )
                      );
                      setPurgeLog(
                        `${overdueCount} activité(s) en retard clôturée(s) avec succès.`
                      );
                    }}
                    className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold cursor-pointer"
                  >
                    Purger les retards ({activities.filter((a) => computeActivityDueBucket(a.dueAt, a.status) === 'En retard').length})
                  </button>
                ) : (
                  <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-[11px] text-slate-400">
                    Purge réservée Manager/Admin
                  </span>
                )}
              </div>

              {/* Formulaire de création / affectation d'activité liée au référentiel prospects */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newActTitle.trim()) return;
                  const allowedClubs =
                    currentUser.role === 'admin'
                      ? null
                      : currentUser.siteAssignments?.length
                      ? currentUser.siteAssignments.map((sa) => sa.clubId)
                      : [currentUser.clubId];
                  const scopedProspects = prospects.filter((p) => {
                    if (allowedClubs && !allowedClubs.includes(p.clubId)) return false;
                    if (clubFilter !== 'all' && p.clubId !== clubFilter) return false;
                    return true;
                  });
                  const targetProspect = scopedProspects.find((p) => p.id === newActProspectId) ?? scopedProspects[0];
                  if (!targetProspect) {
                    setPurgeLog('Aucun prospect autorisé sur ce club pour créer une activité.');
                    return;
                  }
                  const created: FictiveActivityRow = {
                    id: `act-${Date.now()}`,
                    type: newActType,
                    title: newActTitle.trim(),
                    prospectId: targetProspect.id,
                    prospectName: `${targetProspect.firstName} ${targetProspect.lastName}`,
                    clubId: targetProspect.clubId,
                    dueAt: newActDueAt,
                    status: 'todo',
                    assignedToId: newActAssigneeId,
                    statusLabel: 'À traiter',
                  };
                  setActivities((prev) => [created, ...prev]);
                  setNewActTitle('');
                  setPurgeLog(`Activité « ${created.title} » créée pour ${created.prospectName}.`);
                }}
                className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 grid grid-cols-1 md:grid-cols-5 gap-2 text-xs"
              >
                <input
                  type="text"
                  placeholder="Titre de l'activité (ex: Rappel devis)"
                  value={newActTitle}
                  onChange={(e) => setNewActTitle(e.target.value)}
                  className="px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 md:col-span-2"
                />
                <select
                  value={newActType}
                  onChange={(e) => setNewActType(e.target.value as FictiveActivityRow['type'])}
                  className="px-2 py-1.5 rounded bg-slate-950 border border-slate-700"
                >
                  {LEAD_ACTIVITY_TYPES.filter((t) => t.code !== '*').map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.label}
                    </option>
                  ))}
                </select>
                {(() => {
                  const allowedClubs =
                    currentUser.role === 'admin'
                      ? null
                      : currentUser.siteAssignments?.length
                      ? currentUser.siteAssignments.map((sa) => sa.clubId)
                      : [currentUser.clubId];
                  const scopedProspects = prospects.filter((p) => {
                    if (allowedClubs && !allowedClubs.includes(p.clubId)) return false;
                    if (clubFilter !== 'all' && p.clubId !== clubFilter) return false;
                    return true;
                  });
                  return (
                    <select
                      value={
                        scopedProspects.some((p) => p.id === newActProspectId)
                          ? newActProspectId
                          : scopedProspects[0]?.id || ''
                      }
                      onChange={(e) => setNewActProspectId(e.target.value)}
                      className="px-2 py-1.5 rounded bg-slate-950 border border-slate-700"
                    >
                      {scopedProspects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.firstName} {p.lastName} ({p.clubId})
                        </option>
                      ))}
                    </select>
                  );
                })()}
                <div className="flex gap-1.5">
                  <input
                    type="datetime-local"
                    value={newActDueAt}
                    onChange={(e) => setNewActDueAt(e.target.value)}
                    className="w-full px-2 py-1.5 rounded bg-slate-950 border border-slate-700"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold shrink-0 cursor-pointer"
                  >
                    + Créer
                  </button>
                </div>
              </form>

              {purgeLog && (
                <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 font-semibold">
                  {purgeLog}
                </div>
              )}

              {/* 9 filtres de types exacts Lead */}
              <div className="flex flex-wrap gap-1.5">
                {LEAD_ACTIVITY_TYPES.map((t) => (
                  <button
                    key={t.code}
                    type="button"
                    aria-label={t.ariaLabel}
                    onClick={() => setActTypeFilter(t.code)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border ${
                      actTypeFilter === t.code
                        ? 'bg-emerald-600 text-white border-emerald-400'
                        : 'bg-slate-900/70 border-slate-700 text-slate-300'
                    }`}
                  >
                    <span className="font-mono text-[10px] mr-1 opacity-75">[{t.code}]</span>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* 6 vues temporelles */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setActTimeFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer border ${
                    actTimeFilter === 'ALL'
                      ? 'bg-violet-600 text-white border-violet-400'
                      : 'bg-slate-900 border-slate-700 text-slate-300'
                  }`}
                >
                  Toutes les échéances
                </button>
                {LEAD_ACTIVITY_TIME_FILTERS.map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setActTimeFilter(tf)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer border ${
                      actTimeFilter === tf
                        ? 'bg-violet-600 text-white border-violet-400'
                        : 'bg-slate-900 border-slate-700 text-slate-300'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                {filteredActivities.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 text-xs cf-muted text-center">
                    Aucune activité pour cette combinaison de filtres.
                  </div>
                ) : (
                  filteredActivities.map((a) => {
                    const bucket = computeActivityDueBucket(a.dueAt, a.status);
                    const linkedProspect = a.prospectId
                      ? prospects.find((pr) => pr.id === a.prospectId)
                      : undefined;
                    const displayProspectName = linkedProspect
                      ? `${linkedProspect.firstName} ${linkedProspect.lastName}`
                      : a.prospectName;
                    return (
                      <div
                        key={a.id}
                        className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 mr-2">
                            {a.type}
                          </span>
                          <strong>{a.title}</strong> · {displayProspectName} ({a.clubId}) ·{' '}
                          <span className="font-mono text-[10px] text-slate-400">
                            {formatActivityDueAtParis(a.dueAt)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px]">{bucket}</span>
                          <span className="px-2 py-0.5 rounded bg-violet-500/15 text-violet-300 text-[11px]">
                            {a.statusLabel}
                          </span>
                          {a.status !== 'done' && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  setActivities((prev) =>
                                    prev.map((row) =>
                                      row.id === a.id
                                        ? { ...row, status: 'done', statusLabel: 'Fait' }
                                        : row
                                    )
                                  )
                                }
                                className="px-2 py-0.5 rounded bg-emerald-600/80 hover:bg-emerald-600 text-white font-semibold cursor-pointer"
                              >
                                Marquer faite
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const nextDate = new Date(new Date(a.dueAt).getTime() + 86400000);
                                  const iso = !Number.isNaN(nextDate.getTime())
                                    ? nextDate.toISOString().slice(0, 16)
                                    : a.dueAt;
                                  setActivities((prev) =>
                                    prev.map((row) =>
                                      row.id === a.id
                                        ? { ...row, dueAt: iso, statusLabel: 'Reportée (+1j)' }
                                        : row
                                    )
                                  );
                                }}
                                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                              >
                                Reporter +1j
                              </button>
                            </>
                          )}
                          {a.prospectId && linkedProspect ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingProspectId(linkedProspect.id);
                                setEditProspectForm({
                                  firstName: linkedProspect.firstName,
                                  lastName: linkedProspect.lastName,
                                  phone: linkedProspect.phone,
                                  email: linkedProspect.email,
                                  goal: linkedProspect.goal,
                                  notes: linkedProspect.notes,
                                  address: linkedProspect.address ?? '',
                                  assignedToId: linkedProspect.assignedToId,
                                });
                                setActiveTab('prospects');
                              }}
                              className="px-2 py-0.5 rounded bg-violet-600/80 hover:bg-violet-600 text-white cursor-pointer"
                            >
                              Fiche prospect
                            </button>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px]">
                                Prospect non rattaché
                              </span>
                              <select
                                aria-label={`Réassocier ${a.title}`}
                                defaultValue=""
                                onChange={(e) => {
                                  const pid = e.target.value;
                                  const targetP = prospects.find((pr) => pr.id === pid);
                                  if (!targetP) return;
                                  setActivities((prev) =>
                                    prev.map((row) =>
                                      row.id === a.id
                                        ? {
                                            ...row,
                                            prospectId: targetP.id,
                                            prospectName: `${targetP.firstName} ${targetP.lastName}`,
                                            clubId: targetP.clubId,
                                          }
                                        : row
                                    )
                                  );
                                  setPurgeLog(
                                    `Activité « ${a.title} » réassociée à ${targetP.firstName} ${targetP.lastName}.`
                                  );
                                }}
                                className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-[10px]"
                              >
                                <option value="">Réassocier…</option>
                                {prospects
                                  .filter((pr) =>
                                    clubFilter !== 'all'
                                      ? pr.clubId === clubFilter
                                      : currentUser.role === 'admin' || pr.clubId === currentUser.clubId
                                  )
                                  .map((pr) => (
                                    <option key={pr.id} value={pr.id}>
                                      {pr.firstName} {pr.lastName} ({pr.clubId})
                                    </option>
                                  ))}
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* ONGLET 4 : PLANNING RDV & STRIPE (COLLISIONS RDV-01)              */}
          {/* ================================================================= */}
          {activeTab === 'planning' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="cf-card p-4 space-y-3">
                <h2 className="text-sm font-extrabold flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-violet-400" />
                  Type de rendez-vous réservable, collisions &amp; lien de réservation
                </h2>
                <p className="text-xs cf-muted">
                  Réservation persistée par club avec détection des collisions inter-types, déplacement et annulation.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <label>
                    Club
                    <select
                      value={isClubAuthorized(rdvClubId) ? rdvClubId : allowedClubIds[0]}
                      onChange={(e) => setRdvClubId(e.target.value as 'carre-de-soie' | 'beynost')}
                      className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700"
                    >
                      {isClubAuthorized('carre-de-soie') && (
                        <option value="carre-de-soie">Carré de Soie</option>
                      )}
                      {isClubAuthorized('beynost') && (
                        <option value="beynost">Beynost</option>
                      )}
                    </select>
                  </label>
                  <label>
                    Coach
                    <select
                      value={rdvCoachId}
                      onChange={(e) => setRdvCoachId(e.target.value)}
                      className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700"
                    >
                      <option value="emp-karim">Coach Karim</option>
                      <option value="emp-sarah">Coach Sarah</option>
                      <option value="emp-maxime">Maxime Giraud</option>
                    </select>
                  </label>
                  <label>
                    Date du RDV
                    <input
                      type="date"
                      value={rdvDate}
                      onChange={(e) => setRdvDate(e.target.value)}
                      className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700"
                    />
                  </label>
                  <label>
                    Heure
                    <input
                      type="time"
                      value={rdvTime}
                      onChange={(e) => setRdvTime(e.target.value)}
                      className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700"
                    />
                  </label>
                  <label>
                    Prospect concerné
                    <select
                      value={
                        authorizedProspects.some((p) => p.id === rdvProspectId)
                          ? rdvProspectId
                          : authorizedProspects[0]?.id || ''
                      }
                      onChange={(e) => setRdvProspectId(e.target.value)}
                      className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700"
                    >
                      {authorizedProspects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.firstName} {p.lastName} ({p.clubId})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Type à réserver
                    <input
                      type="text"
                      value={rdvTypeCandidate}
                      onChange={(e) => setRdvTypeCandidate(e.target.value)}
                      className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700"
                    />
                  </label>
                  <label>
                    Capacité par créneau (0 = sans limite)
                    <input
                      type="number"
                      min={0}
                      value={rdvCapacityMax}
                      onChange={(e) => setRdvCapacityMax(Number(e.target.value) || 0)}
                      className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700"
                    />
                  </label>
                  <label>
                    Délai minimum (heures)
                    <input
                      type="number"
                      min={0}
                      value={rdvMinDelayHours}
                      onChange={(e) => setRdvMinDelayHours(Number(e.target.value) || 0)}
                      className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700"
                    />
                  </label>
                  <label>
                    Heures avant le créneau
                    <input
                      type="number"
                      min={0}
                      value={rdvHoursBeforeSlot}
                      onChange={(e) => setRdvHoursBeforeSlot(Number(e.target.value) || 0)}
                      className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700"
                    />
                  </label>
                </div>

                <div className="space-y-1.5 text-xs pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preventCrossTypeCollision}
                      onChange={(e) => setPreventCrossTypeCollision(e.target.checked)}
                    />
                    <span>
                      {isTechnicalMode
                        ? 'Activer la prévention automatique des collisions inter-types'
                        : 'Empêcher automatiquement les doubles réservations sur un même créneau'}
                    </span>
                  </label>
                  {isTechnicalMode && (
                    <>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rdvRequiresStripe}
                          onChange={(e) => setRdvRequiresStripe(e.target.checked)}
                        />
                        <span>Exiger prépaiement Stripe (`/api/v2/appointment/webhooks/stripe/:club`)</span>
                      </label>
                      {rdvRequiresStripe && (
                        <label className="flex items-center gap-2 cursor-pointer pl-5 text-emerald-300">
                          <input
                            type="checkbox"
                            checked={rdvStripePaid}
                            onChange={(e) => setRdvStripePaid(e.target.checked)}
                          />
                          <span>Simuler webhook Stripe reçu : paiement payé/confirmé</span>
                        </label>
                      )}
                    </>
                  )}
                </div>

                <div
                  className={`p-3 rounded-xl border text-xs font-semibold ${
                    !rdvBookingDecision.accepted
                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                      : rdvBookingDecision.bookingStatus === 'provisoire_attente_paiement'
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                      : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  }`}
                >
                  Statut : <strong className="uppercase">{rdvBookingDecision.bookingStatus}</strong> —{' '}
                  {rdvBookingDecision.reason}
                </div>

                <button
                  type="button"
                  disabled={!rdvBookingDecision.accepted}
                  onClick={() => {
                    const effectiveClub: 'carre-de-soie' | 'beynost' = isClubAuthorized(rdvClubId)
                      ? rdvClubId
                      : allowedClubIds[0];
                    const targetProspect =
                      authorizedProspects.find((p) => p.id === rdvProspectId) ?? authorizedProspects[0];
                    const resolvedDuration =
                      rdvTypeCandidate.toLowerCase().includes('coaching') ||
                      rdvTypeCandidate.toLowerCase().includes('checkup')
                        ? 60
                        : 45;
                    const newSlot: AppointmentSlotRecord = {
                      id: `slot-${Date.now()}`,
                      clubId: effectiveClub,
                      coachId: rdvCoachId,
                      typeName: `${rdvTypeCandidate} (${targetProspect ? `${targetProspect.firstName} ${targetProspect.lastName}` : 'Prospect'})`,
                      date: rdvDate,
                      startTime: rdvTime,
                      durationMinutes: resolvedDuration,
                      capacityMax: rdvCapacityMax,
                      currentBookedCount: 1,
                      paidRequired: rdvRequiresStripe,
                      paymentStatus: rdvRequiresStripe
                        ? rdvStripePaid
                          ? 'paye'
                          : 'attente_paiement'
                        : 'non_requis',
                    };
                    setRdvBookings((prev) => [newSlot, ...prev]);
                    if (targetProspect) {
                      updateProspect(targetProspect.id, {
                        leadStatus: 'Séance planifiée',
                      });
                      setActivities((prev) => [
                        {
                          id: `act-rdv-${Date.now()}`,
                          type: 'APPOINTMENT',
                          title: `RDV ${rdvTypeCandidate}`,
                          prospectId: targetProspect.id,
                          prospectName: `${targetProspect.firstName} ${targetProspect.lastName}`,
                          clubId: effectiveClub,
                          dueAt: `${rdvDate}T${rdvTime}`,
                          status: 'todo',
                          assignedToId: rdvCoachId,
                          statusLabel: 'RDV réservé',
                        },
                        ...prev,
                      ]);
                    }
                    setRdvActionMessage(
                      `RDV réservé le ${rdvDate} à ${rdvTime} (${resolvedDuration} min, ${effectiveClub}) et synchronisé avec le prospect et les activités.`
                    );
                  }}
                  className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
                >
                  Confirmer la réservation
                </button>
                {rdvActionMessage && (
                  <div className="text-[11px] text-emerald-300 font-semibold">{rdvActionMessage}</div>
                )}
              </div>

              <div className="cf-card p-4 space-y-3 text-xs">
                <h3 className="text-sm font-extrabold">
                  Agenda des créneaux réservés ({rdvBookings.filter((s) => isClubAuthorized(s.clubId)).length})
                </h3>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {rdvBookings
                    .filter((s) => isClubAuthorized(s.clubId))
                    .map((slot) => (
                    <div
                      key={slot.id}
                      className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-bold">{slot.typeName}</div>
                        <div className="text-[10px] cf-muted font-mono">
                          {slot.date} à {slot.startTime} ({slot.durationMinutes} min) · {slot.clubId} · {slot.coachId} · {slot.paymentStatus}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={async () => {
                            const [hhStr, mmStr] = slot.startTime.split(':');
                            const curH = Number(hhStr ?? 10);
                            const curM = mmStr ?? '00';
                            if (curH + 1 > 20) {
                              setRdvActionMessage('Report +1h refusé : dépasse l’horaire de fermeture (20h).');
                              return;
                            }
                            const nextTime = `${String(curH + 1).padStart(2, '0')}:${curM}`;
                            const others = rdvBookings.filter((s) => s.id !== slot.id);
                            const check = validateAppointmentBooking(others, {
                              clubId: slot.clubId,
                              coachId: slot.coachId,
                              typeName: slot.typeName,
                              date: slot.date,
                              startTime: nextTime,
                              durationMinutes: slot.durationMinutes,
                              hoursBeforeSlot: rdvHoursBeforeSlot,
                              minDelayHours: rdvMinDelayHours,
                              capacityMax: slot.capacityMax,
                              requiresStripePayment: slot.paidRequired,
                              stripePaidConfirmed: slot.paymentStatus === 'paye',
                            });
                            if (!check.accepted) {
                              setRdvActionMessage(`Report +1h refusé : ${check.reason}`);
                              return;
                            }
                            try {
                              await clientApi.patchLeadAppointment(
                                { actorId: currentUser.id, siteId: 'all' },
                                slot.id,
                                nextTime
                              );
                              await syncLeadWorkspaceFromServer();
                              setRdvActionMessage(`Créneau reporté à ${nextTime} et persisté sur le serveur.`);
                            } catch (err) {
                              setRdvActionMessage(
                                `Erreur serveur report +1h : ${err instanceof Error ? err.message : String(err)}`
                              );
                            }
                          }}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] cursor-pointer"
                        >
                          Déplacer +1h
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await clientApi.deleteLeadAppointment(
                                { actorId: currentUser.id, siteId: 'all' },
                                slot.id
                              );
                              await syncLeadWorkspaceFromServer();
                              setRdvActionMessage(`RDV « ${slot.typeName} » annulé sur le serveur.`);
                            } catch (err) {
                              setRdvActionMessage(
                                `Erreur serveur annulation : ${err instanceof Error ? err.message : String(err)}`
                              );
                            }
                          }}
                          className="px-2 py-1 rounded bg-rose-600/80 hover:bg-rose-600 text-white text-[11px] cursor-pointer"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="cf-muted text-[11px]">
                  Liens publics isolés :{' '}
                  <a href="/book/carre-de-soie/coaching-decouverte" target="_blank" rel="noreferrer" className="text-cyan-300 underline">
                    /book/carre-de-soie/coaching-decouverte
                  </a>{' '}
                  ·{' '}
                  <a href="/book/beynost/bilan-checkup-technogym" target="_blank" rel="noreferrer" className="text-cyan-300 underline">
                    /book/beynost/bilan-checkup-technogym
                  </a>
                </p>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* ONGLET 5 : MESSAGERIE WHATSAPP 24H, 3 REPLIS & WA-02 / INC-001    */}
          {/* ================================================================= */}
          {activeTab === 'messaging' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="cf-card p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-extrabold flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-emerald-400" />
                    Messagerie &amp; règle fenêtre WhatsApp 24h
                  </h2>
                  <button
                    type="button"
                    onClick={() => setWaComposerOpen((prev) => !prev)}
                    aria-label="Nouvelle conversation WhatsApp"
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Nouvelle conversation</span>
                  </button>
                </div>

                {waComposerOpen && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-emerald-500/40 space-y-2 text-xs">
                    <div className="font-bold text-emerald-300">Nouvelle conversation / Brouillon WhatsApp</div>
                    <select
                      aria-label="Destinataire WhatsApp"
                      value={waTargetId}
                      onChange={(e) => setWaTargetId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700"
                    >
                      {authorizedProspects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.firstName} {p.lastName} ({p.phone})
                        </option>
                      ))}
                    </select>
                    <textarea
                      rows={2}
                      value={waMessageText}
                      onChange={(e) => setWaMessageText(e.target.value)}
                      placeholder="Saisissez votre message..."
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setWaComposerOpen(false)}
                        className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 cursor-pointer"
                      >
                        Fermer
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const target = authorizedProspects.find((p) => p.id === waTargetId) || authorizedProspects[0];
                          const entry = {
                            id: `wa-${Date.now()}`,
                            recipient: target ? `${target.firstName} ${target.lastName}` : 'Prospect',
                            message: waMessageText.trim(),
                            channel: waDecision.deliveryChannel,
                            sentAt: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
                          };
                          const next = [entry, ...waThreads];
                          setWaThreads(next);
                          try {
                            localStorage.setItem('cfos_wa_threads_v1', JSON.stringify(next));
                          } catch {
                            // ignore
                          }
                          setWaComposerOpen(false);
                        }}
                        className="px-3 py-1 rounded bg-emerald-600 text-white font-bold cursor-pointer"
                      >
                        Enregistrer fil (brouillon local)
                      </button>
                    </div>
                  </div>
                )}

                {waThreads.length > 0 && (
                  <div className="space-y-1.5 max-h-32 overflow-y-auto text-xs">
                    {waThreads.map((th) => (
                      <div key={th.id} className="p-2 rounded-lg bg-slate-900/80 border border-slate-800 flex justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-bold text-emerald-300">{th.recipient}</span> :{' '}
                          <span className="text-slate-300">{th.message}</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                          {th.sentAt} ({th.channel})
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <label>
                    Heures depuis dernière réponse entrante
                    <input
                      type="number"
                      min={0}
                      max={200}
                      value={waHoursInbound}
                      onChange={(e) => setWaHoursInbound(Number(e.target.value) || 0)}
                      className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700"
                    />
                  </label>
                  <label>
                    Canal de repli si fenêtre &gt; 24h
                    <select
                      value={waFallback}
                      onChange={(e) => setWaFallback(e.target.value as WhatsAppFallbackPolicy)}
                      className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700"
                    >
                      <option value="ne_pas_envoyer">1. Ne pas envoyer</option>
                      <option value="modele_approuve">2. Modèle WhatsApp approuvé</option>
                      <option value="sms_repli">3. SMS de repli (OVH / Yeastar)</option>
                    </select>
                  </label>
                </div>

                <div className="space-y-1.5 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={waMetaApproved}
                      onChange={(e) => setWaMetaApproved(e.target.checked)}
                    />
                    <span>Approbation Meta : Actif (corps &amp; boutons verrouillés)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={waMediaAttached}
                      onChange={(e) => setWaMediaAttached(e.target.checked)}
                    />
                    <span>Pièce jointe image JPG/PNG (≤ 5 Mo)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={waExplicitSave}
                      onChange={(e) => setWaExplicitSave(e.target.checked)}
                    />
                    <span>Validation explicite « Enregistrer brouillon »</span>
                  </label>
                </div>

                <div
                  className={`p-3 rounded-xl border text-xs space-y-1 ${
                    waDecision.deliveryChannel === 'bloque'
                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                      : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                  }`}
                >
                  <div>
                    Fenêtre 24h : <strong>{waDecision.window24hOpen ? 'OUVERTE' : 'FERMÉE (> 24h)'}</strong> · Canal retenu :{' '}
                    <strong className="font-mono">{waDecision.deliveryChannel}</strong> · Brouillon enregistré :{' '}
                    <strong>{waDecision.draftCreated ? 'OUI (clic explicite)' : 'NON'}</strong>
                  </div>
                  <div className="font-semibold">{waDecision.reason}</div>
                </div>
              </div>

              <div className="cf-card p-4 space-y-2.5 text-xs">
                <h3 className="text-sm font-extrabold">Contraintes Meta vérifiées dans l’éditeur WhatsApp</h3>
                <ul className="space-y-1 cf-muted list-disc pl-4">
                  <li>Catégories supportées : <strong>Marketing</strong> et <strong>Utility</strong>.</li>
                  <li>Limites strictes : Nom ≤ <code>100</code> car., Corps ≤ <code>1024</code> car., Footer ≤ <code>60</code> car., Réponse rapide ≤ <code>25</code> car., max <code>10</code> boutons.</li>
                  <li>Types de boutons observés : <strong>Appeler un numéro</strong>, <strong>URL Statique / Dynamique</strong>, <strong>Réponse rapide</strong>.</li>
                  <li>Média image : JPG/PNG max <code>5 Mo</code> (contrôlé avant envoi).</li>
                </ul>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* ONGLET 6 : COMMUNICATION (6 SOUS-VUES + RSP-02/03/04)             */}
          {/* ================================================================= */}
          {activeTab === 'communication' && (
            <div className="space-y-4">
              {commSubTab === 'models' && <LeadMessageTemplatesView key={`${currentUser.id}:${clubFilter}`} actorId={currentUser.id} clubId={clubFilter === 'all' ? null : clubFilter} />}

              {commSubTab === 'campaigns' && <LeadCampaignsView key={`${currentUser.id}:${clubFilter}`} actorId={currentUser.id} clubId={clubFilter === 'all' ? null : clubFilter} />}

              {commSubTab === 'utm' && (
                <div className="cf-card p-4 space-y-3 text-xs">
                  <h3 className="text-sm font-extrabold">Suivi des campagnes</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="py-2 pr-3">Campagne UTM</th>
                          <th className="py-2 pr-3">Première activité</th>
                          <th className="py-2 pr-3">Lead atteints (Prospects)</th>
                          <th className="py-2 pr-3">Abonnés</th>
                          <th className="py-2">Conversion</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-slate-800/60">
                          <td className="py-2 pr-3 font-bold">meta_biocircuit_beynost_nov26</td>
                          <td className="py-2 pr-3">2026-11-01</td>
                          <td className="py-2 pr-3 font-mono">38</td>
                          <td className="py-2 pr-3 font-mono">14</td>
                          <td className="py-2 font-mono text-emerald-400 font-bold">36,8 %</td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-3 font-bold">google_local_carre_de_soie</td>
                          <td className="py-2 pr-3">2026-10-15</td>
                          <td className="py-2 pr-3 font-mono">52</td>
                          <td className="py-2 pr-3 font-mono">18</td>
                          <td className="py-2 font-mono text-emerald-400 font-bold">34,6 %</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {commSubTab === 'scenarios' && (
                <LeadScenariosView key={`${currentUser.id}:${clubFilter}`} actorId={currentUser.id} clubId={clubFilter === 'all' ? null : clubFilter} onActivitiesChanged={syncLeadWorkspaceFromServer} />
              )}

              {commSubTab === 'logs' && <LeadCommunicationsHistoryView key={`${currentUser.id}:${clubFilter}`} actorId={currentUser.id} clubId={clubFilter === 'all' ? null : clubFilter} />}
            </div>
          )}

          {/* ================================================================= */}
          {/* ONGLET 7 : STATISTIQUES (8 VUES), VENTES & FORMULAIRES            */}
          {/* ================================================================= */}
          {activeTab === 'analytics_forms' && (
            <div className="space-y-4">
              {analyticsSubTab === 'stats' && (
                <div className="cf-card p-4 space-y-4 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-1.5">
                      {LEAD_STATISTICS_PERIOD_SHORTCUTS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setStatsPeriodId(p.id)}
                          className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer border ${
                            statsPeriodId === p.id
                              ? 'bg-emerald-600 text-white border-emerald-400'
                              : 'bg-slate-900 border-slate-700 text-slate-300'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ignoreArchivedStats}
                          onChange={(e) => setIgnoreArchivedStats(e.target.checked)}
                        />
                        <span>Ignorer les archivés</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={compareToPreviousYear}
                          onChange={(e) => setCompareToPreviousYear(e.target.checked)}
                        />
                        <span>compareToPreviousYear (ST-02)</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={multiClubCds}
                          onChange={(e) => setMultiClubCds(e.target.checked)}
                        />
                        <span>Carré de Soie</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={multiClubBeynost}
                          onChange={(e) => setMultiClubBeynost(e.target.checked)}
                        />
                        <span>Beynost</span>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {LEAD_STATISTICS_8_TABLES.map((tbl) => {
                      const effectiveCds = multiClubCds && isClubAuthorized('carre-de-soie');
                      const effectiveBey = multiClubBeynost && isClubAuthorized('beynost');
                      const stats = computeLeadReportBreakdown(tbl.id, authorizedProspects, {
                        periodId: statsPeriodId,
                        multiClubCds: effectiveCds,
                        multiClubBeynost: effectiveBey,
                        ignoreArchived: ignoreArchivedStats,
                        compareToPreviousYear,
                        referenceDate: new Date(),
                        commercialLabelById,
                      });
                      return (
                        <div key={tbl.id} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                          <div className="flex items-center justify-between">
                            <strong className="text-emerald-300">
                              {tbl.group} · {tbl.tab}
                            </strong>
                            <span className="text-[10px] font-mono cf-muted">
                              Période : {statsPeriodId} · Clubs: {(effectiveCds ? 1 : 0) + (effectiveBey ? 1 : 0)}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {tbl.columns.map((c) => (
                              <span key={c} className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px]">
                                {c}
                              </span>
                            ))}
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 pt-1 text-[11px] font-mono">
                            <div className="p-1.5 rounded bg-slate-950 border border-slate-800">
                              <div className="text-[9px] text-slate-400">Volume période</div>
                              <div className="font-bold text-white">
                                {stats.filteredCount}
                                {stats.previousYearCount !== null && (
                                  <span className="text-[10px] text-amber-300 ml-1">(N-1: {stats.previousYearCount})</span>
                                )}
                              </div>
                            </div>
                            <div className="p-1.5 rounded bg-slate-950 border border-slate-800">
                              <div className="text-[9px] text-slate-400">CDS / BEY</div>
                              <div className="font-bold text-violet-300">
                                {stats.cdsCount} / {stats.beyCount}
                              </div>
                            </div>
                            <div className="p-1.5 rounded bg-slate-950 border border-slate-800">
                              <div className="text-[9px] text-slate-400">Transformation</div>
                              <div className="font-bold text-emerald-400">
                                {stats.convertedCount} ({stats.conversionPct}%)
                              </div>
                            </div>
                          </div>
                          <div className="space-y-1 pt-1 border-t border-slate-800/80">
                            {stats.rows.length === 0 ? (
                              <div className="text-[10px] cf-muted">Aucune donnée sur cette période.</div>
                            ) : (
                              stats.rows.map((r) => (
                                <div
                                  key={r.label}
                                  className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-slate-950/70 border border-slate-800/70"
                                >
                                  <span className="font-medium truncate">{r.label}</span>
                                  <span className="font-mono text-slate-300">
                                    {r.volume} leads · {r.rdvTakenCount} RDV · {r.visitedCount} venus · {r.convertedCount} abos ({r.conversionPct}%)
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                          {stats.rows.length === 0 ? (
                            <div className="text-[11px] cf-muted italic py-1">
                              Aucune donnée sur cette période / sélection de clubs.
                            </div>
                          ) : (
                            <div className="space-y-1 pt-1 border-t border-slate-800/80 text-[10px]">
                              {stats.rows.map((r) => (
                                <div key={r.label} className="flex items-center justify-between">
                                  <span className="font-semibold text-slate-200">{r.label}</span>
                                  <span className="font-mono text-slate-400">
                                    {r.volume} ({r.cdsCount}/{r.beyCount}) · {r.conversionPct}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {analyticsSubTab === 'sales' && (
                <div className="cf-card p-4 space-y-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-extrabold">Ventes liées aux abonnements</h3>
                      <p className="cf-muted">
                        Critère : <strong>Se termine après / Se termine avant</strong> (données locales consultables par club).
                      </p>
                    </div>
                    {simulatedRole !== 'commercial' && (
                      <button
                        type="button"
                        onClick={() => {
                          const filtered = filterFictiveSales(INITIAL_FICTIVE_SALES, {
                            clubCds: multiClubCds && isClubAuthorized('carre-de-soie'),
                            clubBeynost: multiClubBeynost && isClubAuthorized('beynost'),
                            endsAfter: salesEndsAfter,
                            endsBefore: salesEndsBefore,
                          });
                          const csv = [
                            'MEMBRE;ABONNEMENT;CLUB;MONTANT_EUR;ENCAISSEMENT;FIN_ABONNEMENT;STATUT',
                            ...filtered.map(
                              (s) =>
                                `${s.memberName};${s.planName};${s.clubId};${s.amountEur.toFixed(2)};${s.paidAt};${s.subscriptionEndDate};${s.status}`
                            ),
                          ].join('\n');
                          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = 'ventes-fin-abonnement.csv';
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-violet-600 text-white font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Export CSV ventes
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label>
                      Se termine après (date fin abonnement)
                      <input
                        type="date"
                        value={salesEndsAfter}
                        onChange={(e) => setSalesEndsAfter(e.target.value)}
                        className="w-full mt-1 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700"
                      />
                    </label>
                    <label>
                      Se termine avant (date fin abonnement)
                      <input
                        type="date"
                        value={salesEndsBefore}
                        onChange={(e) => setSalesEndsBefore(e.target.value)}
                        className="w-full mt-1 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700"
                      />
                    </label>
                  </div>
                  {(() => {
                    const visibleSales = filterFictiveSales(INITIAL_FICTIVE_SALES, {
                      clubCds: multiClubCds && isClubAuthorized('carre-de-soie'),
                      clubBeynost: multiClubBeynost && isClubAuthorized('beynost'),
                      endsAfter: salesEndsAfter,
                      endsBefore: salesEndsBefore,
                    });
                    return visibleSales.length === 0 ? (
                      <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-center cf-muted">
                        Aucune vente ne correspond à ces critères de fin d&apos;abonnement.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400">
                              <th className="py-1.5 pr-3">Adhérent</th>
                              <th className="py-1.5 pr-3">Formule</th>
                              <th className="py-1.5 pr-3">Club</th>
                              <th className="py-1.5 pr-3">Montant</th>
                              <th className="py-1.5 pr-3">Encaissement</th>
                              <th className="py-1.5 pr-3">Fin abonnement</th>
                              <th className="py-1.5">Statut</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleSales.map((s) => (
                              <tr key={s.id} className="border-b border-slate-800/60">
                                <td className="py-1.5 pr-3 font-bold">{s.memberName}</td>
                                <td className="py-1.5 pr-3">{s.planName}</td>
                                <td className="py-1.5 pr-3 font-mono">{s.clubId}</td>
                                <td className="py-1.5 pr-3 font-mono">{s.amountEur.toFixed(2)} €</td>
                                <td className="py-1.5 pr-3 font-mono">{s.paidAt}</td>
                                <td className="py-1.5 pr-3 font-mono text-amber-300">{s.subscriptionEndDate}</td>
                                <td className="py-1.5">{s.status}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>
              )}

              {analyticsSubTab === 'forms' && (
                <div className="cf-card p-4 space-y-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-extrabold">
                        Formulaires
                      </h3>
                      <p className="cf-muted">
                        Configuration des formulaires par club · Accès en écriture réservé aux managers.
                      </p>
                    </div>
                    {evaluateLeadModuleAccess(simulatedRole, 'form_write').allowed && (
                      <button
                        type="button"
                        onClick={() => {
                          setNewFormClub(clubFilter === 'beynost' ? 'beynost' : 'carre-de-soie');
                          setShowNewFormDialog((v) => !v);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer"
                      >
                        + Créer un formulaire
                      </button>
                    )}
                  </div>

                  {showNewFormDialog && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!newFormName.trim()) return;
                        const created: FictiveFormRow = {
                          id: `frm-${Date.now()}`,
                          name: newFormName.trim(),
                          description: newFormDesc.trim(),
                          clubId: newFormClub,
                          responsesCount: 0,
                          createdAt: new Date().toISOString().slice(0, 10),
                          published: false,
                          sections: 1,
                          sectionTitles: ['Coordonnées & Consentement RGPD'],
                          sampleResponses: [],
                        };
                        setFormsList((prev) => [created, ...prev]);
                        setSelectedFormId(created.id);
                        setNewFormName('');
                        setNewFormDesc('');
                        setShowNewFormDialog(false);
                        setFormAccessMessage(`Formulaire « ${created.name} » créé et persisté.`);
                      }}
                      className="p-3 rounded-xl bg-slate-900/70 border border-emerald-500/40 grid grid-cols-1 sm:grid-cols-4 gap-2"
                    >
                      <input
                        type="text"
                        required
                        placeholder="Nom du formulaire"
                        value={newFormName}
                        onChange={(e) => setNewFormName(e.target.value)}
                        className="px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700"
                      />
                      <input
                        type="text"
                        placeholder="Description courte"
                        value={newFormDesc}
                        onChange={(e) => setNewFormDesc(e.target.value)}
                        className="px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700"
                      />
                      <select
                        value={newFormClub}
                        onChange={(e) => setNewFormClub(e.target.value as 'carre-de-soie' | 'beynost')}
                        className="px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700"
                      >
                        <option value="carre-de-soie">Carré de Soie</option>
                        <option value="beynost">Beynost</option>
                      </select>
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded bg-emerald-600 text-white font-bold cursor-pointer"
                      >
                        Enregistrer le formulaire
                      </button>
                    </form>
                  )}

                  {formAccessMessage && (
                    <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 font-semibold">
                      {formAccessMessage}
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="py-2 pr-3">Nom du formulaire</th>
                          <th className="py-2 pr-3">Club</th>
                          <th className="py-2 pr-3">Sections / Réponses</th>
                          <th className="py-2 pr-3">Statut</th>
                          <th className="py-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formsList
                          .filter((f) => isClubAuthorized(f.clubId) && (clubFilter === 'all' || f.clubId === clubFilter))
                          .map((f) => {
                          const canWrite =
                            isClubAuthorized(f.clubId) &&
                            evaluateLeadModuleAccess(simulatedRole, 'form_write').allowed;
                          const canDelete =
                            isClubAuthorized(f.clubId) &&
                            evaluateLeadModuleAccess(simulatedRole, 'form_delete').allowed;
                          return (
                            <tr key={f.id} className="border-b border-slate-800/60">
                              <td className="py-2 pr-3">
                                <button
                                  type="button"
                                  onClick={() => setSelectedFormId(f.id)}
                                  className="font-bold text-emerald-300 hover:underline cursor-pointer text-left"
                                >
                                  {f.name}
                                </button>
                              </td>
                              <td className="py-2 pr-3">{f.clubId === 'beynost' ? 'Beynost' : 'Carré de Soie'}</td>
                              <td className="py-2 pr-3">
                                {f.sections} section(s) · {f.responsesCount} réponse(s)
                              </td>
                              <td className="py-2 pr-3">{f.published ? 'Publié' : 'Brouillon'}</td>
                              <td className="py-2 flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setSelectedFormId(f.id)}
                                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                                >
                                  Éditer / Réponses
                                </button>
                                {canWrite && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextPub = !f.published;
                                      setFormsList((prev) =>
                                        prev.map((row) =>
                                          row.id === f.id ? { ...row, published: nextPub } : row
                                        )
                                      );
                                      void clientApi.putLeadForm(
                                        { actorId: currentUser.id, siteId: 'all' },
                                        f.id,
                                        { published: nextPub }
                                      );
                                    }}
                                    className="px-2 py-1 rounded bg-violet-600/80 hover:bg-violet-600 text-white cursor-pointer"
                                  >
                                    {f.published ? 'Dépublier' : 'Publier'}
                                  </button>
                                )}
                                {canDelete ? (
                                  <button
                                    type="button"
                                    aria-label={`Supprimer ${f.name}`}
                                    onClick={() => handleDeleteForm(f.id)}
                                    className="px-2 py-1 rounded bg-rose-600/80 hover:bg-rose-600 text-white inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Supprimer
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-slate-400 inline-flex items-center gap-1">
                                    <Lock className="w-3 h-3 text-rose-400" />
                                    Lecture seule
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {(() => {
                    const activeForm = formsList.find(
                      (f) => f.id === selectedFormId && isClubAuthorized(f.clubId) && (clubFilter === 'all' || f.clubId === clubFilter)
                    );
                    if (!activeForm) return null;
                    const canWrite =
                      isClubAuthorized(activeForm.clubId) &&
                      evaluateLeadModuleAccess(simulatedRole, 'form_write').allowed;
                    const formFields = activeForm.fields ?? [
                      { id: 'fld-fn', label: 'Prénom', type: 'text' as const, required: true },
                      { id: 'fld-em', label: 'Email', type: 'email' as const, required: true },
                      { id: 'fld-rgpd', label: 'Accord RGPD obligatoire', type: 'checkbox' as const, required: true },
                    ];
                    return (
                      <div className="p-3.5 rounded-xl bg-slate-900/70 border border-violet-500/40 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <strong className="text-sm text-violet-300">{activeForm.name}</strong>
                            <div className="text-[11px] cf-muted">
                              Lien public isolé :{' '}
                              <a
                                href={`/forms/${activeForm.clubId}/${activeForm.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-cyan-300 underline"
                              >
                                /forms/{activeForm.clubId}/{activeForm.id}
                              </a>{' '}
                              · Statut : <strong>{activeForm.published ? 'Publié' : 'Brouillon'}</strong> ·{' '}
                              <span>
                                {(activeForm.sampleResponses ?? []).length} exemple(s) détaillé(s) sur {activeForm.responsesCount} réponse(s)
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedFormId(null)}
                            className="text-[11px] text-slate-400 cursor-pointer"
                          >
                            Fermer l&apos;éditeur
                          </button>
                        </div>

                        <div className="space-y-1.5">
                          <div className="font-bold">Champs du formulaire ({formFields.length})</div>
                          <div className="space-y-1">
                            {formFields.map((fld) => (
                              <div key={fld.id} className="flex items-center justify-between px-2 py-1 rounded bg-slate-950 border border-slate-800 text-[11px]">
                                <span>
                                  <strong>{fld.label}</strong> ({fld.type}) {fld.required ? '· Obligatoire' : '· Optionnel'}
                                </span>
                                {canWrite && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setFormsList((prev) =>
                                        prev.map((row) =>
                                          row.id === activeForm.id
                                            ? { ...row, fields: formFields.filter((x) => x.id !== fld.id) }
                                            : row
                                        )
                                      )
                                    }
                                    className="text-rose-300 hover:underline cursor-pointer"
                                  >
                                    Retirer
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                          {canWrite && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setFormsList((prev) =>
                                    prev.map((row) =>
                                      row.id === activeForm.id
                                        ? {
                                            ...row,
                                            fields: [
                                              ...formFields,
                                              {
                                                id: `fld-${Date.now()}`,
                                                label: newSectionTitle.trim() || 'Téléphone',
                                                type: 'tel',
                                                required: true,
                                              },
                                            ],
                                          }
                                        : row
                                    )
                                  )
                                }
                                className="px-2.5 py-1 rounded bg-cyan-600 text-white text-[11px] font-bold cursor-pointer"
                              >
                                + Ajouter champ (téléphone / texte)
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <div className="font-bold">Sections ({activeForm.sectionTitles?.length ?? activeForm.sections})</div>
                          <div className="flex flex-wrap gap-1.5">
                            {(activeForm.sectionTitles ?? ['Section 1']).map((sec, idx) => (
                              <span key={idx} className="px-2 py-1 rounded bg-slate-950 border border-slate-700">
                                {idx + 1}. {sec}
                              </span>
                            ))}
                          </div>
                          {canWrite && (
                            <div className="flex gap-2 pt-1">
                              <input
                                type="text"
                                placeholder="Titre nouvelle section"
                                value={newSectionTitle}
                                onChange={(e) => setNewSectionTitle(e.target.value)}
                                className="px-2.5 py-1 rounded bg-slate-950 border border-slate-700"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (!newSectionTitle.trim()) return;
                                  setFormsList((prev) =>
                                    prev.map((row) =>
                                      row.id === activeForm.id
                                        ? {
                                            ...row,
                                            sections: row.sections + 1,
                                            sectionTitles: [...(row.sectionTitles ?? []), newSectionTitle.trim()],
                                          }
                                        : row
                                    )
                                  );
                                  setNewSectionTitle('');
                                }}
                                className="px-2.5 py-1 rounded bg-emerald-600 text-white font-bold cursor-pointer"
                              >
                                + Ajouter une section
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="space-y-1.5 pt-2 border-t border-slate-800">
                          <div className="font-bold">Réponses collectées ({activeForm.sampleResponses?.length ?? 0} affichée(s))</div>
                          {(activeForm.sampleResponses ?? []).length === 0 ? (
                            <div className="text-[11px] cf-muted">Aucune réponse enregistrée pour ce formulaire.</div>
                          ) : (
                            (activeForm.sampleResponses ?? []).map((rep) => (
                              <div key={rep.id} className="p-2 rounded bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-2">
                                <span>
                                  <strong>{rep.fullName}</strong> · {rep.email} · {rep.phone} · RGPD={rep.rgpdConsent ? 'OUI' : 'NON'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const parts = rep.fullName.split(' ');
                                    const res = createProspect({
                                      firstName: parts[0] || rep.fullName,
                                      lastName: parts.slice(1).join(' ') || 'Formulaire',
                                      phone: rep.phone,
                                      email: rep.email,
                                      clubId: activeForm.clubId,
                                      source: 'Site c.fitness',
                                      goal: `Réponse formulaire ${activeForm.name}`,
                                      rgpdConsent: rep.rgpdConsent,
                                    });
                                    setFormAccessMessage(res.message);
                                  }}
                                  className="px-2.5 py-1 rounded bg-violet-600 text-white font-bold cursor-pointer"
                                >
                                  Rattacher au pipeline
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* ONGLET 8 : PARAMÈTRES CRM (14 RUBRIQUES) + 9 PARTENAIRES + WEBHOOK */}
          {/* ================================================================= */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              <div className="cf-card p-3 flex flex-wrap items-center justify-between gap-3">
                <label className="text-sm font-semibold">
                  Club à configurer
                  <select
                    aria-label="Club à configurer"
                    value={selectedProfileClubId}
                    disabled={settingsState.saving}
                    onChange={event => {
                      if (settingsState.dirty && !window.confirm('Abandonner les modifications non enregistrées de ce club ?')) return;
                      setTestAlertNotice(null);
                      setSelectedProfileClubId(event.target.value as 'carre-de-soie' | 'beynost');
                    }}
                    className="ml-3 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700"
                  >
                    {settingsClubChoices.map(club => <option key={club} value={club}>
                      {club === 'beynost' ? 'Beynost' : 'Carré de Soie'}
                    </option>)}
                  </select>
                </label>
                <span className="text-xs cf-muted">Les réglages ci-dessous concernent uniquement ce club.</span>
              </div>
              {settingsState.status === 'loading' && <p role="status" className="cf-card p-3">Chargement des réglages du club…</p>}
              {settingsState.status === 'error' && <div role="alert" className="cf-card p-3 space-y-2">
                <p>Impossible de charger les réglages : {settingsState.error}</p>
                <button type="button" onClick={() => void settingsEditor.load()} className="px-3 py-2 rounded bg-emerald-700 text-white">Réessayer le chargement</button>
              </div>}
              <div className="cf-card p-3 flex flex-wrap gap-1.5">
                <label className="w-full sm:hidden">Rubrique des réglages
                  <select aria-label="Rubrique des réglages" value={selectedSettingsTab}
                    onChange={event => setSelectedSettingsTab(event.target.value)}
                    className="w-full mt-2 p-3 rounded-lg bg-slate-900 border border-slate-700">
                    {LEAD_SETTINGS_TABS_14.map(tab => <option key={tab.id} value={tab.id}>
                      {LEAD_SETTINGS_PRESENTATION[tab.id]?.label ?? tab.label}
                    </option>)}
                  </select>
                </label>
                {LEAD_SETTINGS_TABS_14.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSelectedSettingsTab(tab.id)}
                    className={`hidden sm:inline-flex px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border ${
                      selectedSettingsTab === tab.id
                        ? 'bg-emerald-600 text-white border-emerald-400'
                        : 'bg-slate-900 border-slate-700 text-slate-300'
                    }`}
                  >
                    {isTechnicalMode ? tab.label : LEAD_SETTINGS_PRESENTATION[tab.id]?.label ?? tab.label}
                  </button>
                ))}
              </div>

              <div className="cf-card p-4 space-y-4 text-xs">
                {(() => {
                  const activeSetting =
                    LEAD_SETTINGS_TABS_14.find((t) => t.id === selectedSettingsTab) ??
                    LEAD_SETTINGS_TABS_14[0];
                  return (
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
                      <div>
                        <h3 className="text-sm font-extrabold">{isTechnicalMode ? activeSetting.label : LEAD_SETTINGS_PRESENTATION[activeSetting.id]?.label ?? activeSetting.label}</h3>
                        <p className="cf-muted">{isTechnicalMode ? activeSetting.summary : LEAD_SETTINGS_PRESENTATION[activeSetting.id]?.summary ?? activeSetting.summary}</p>
                      </div>
                      {isTechnicalMode && <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700">
                        Route Lead : {activeSetting.path}
                      </span>}
                    </div>
                  );
                })()}

                {(selectedSettingsTab === 'marketing' || selectedSettingsTab === 'club-profile') && (
                  <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-bold text-emerald-300">
                        Profil du Club (Nom officiel, Adresse, Couleurs &amp; Sigle)
                      </div>

                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <label className="block">
                        <span className="text-[10px] cf-muted">Nom officiel du club</span>
                        <input
                          type="text"
                          value={clubProfileForm.name}
                          onChange={(e) =>
                            setClubProfilesByClub((prev) => ({
                              ...prev,
                              [selectedProfileClubId]: { ...prev[selectedProfileClubId], name: e.target.value },
                            }))
                          }
                          className="w-full mt-0.5 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] cf-muted">Adresse</span>
                        <input
                          type="text"
                          value={clubProfileForm.address}
                          onChange={(e) =>
                            setClubProfilesByClub((prev) => ({
                              ...prev,
                              [selectedProfileClubId]: { ...prev[selectedProfileClubId], address: e.target.value },
                            }))
                          }
                          className="w-full mt-0.5 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] cf-muted">Couleur principale</span>
                        <input
                          type="color"
                          value={clubProfileForm.primaryColor}
                          onChange={(e) =>
                            setClubProfilesByClub((prev) => ({
                              ...prev,
                              [selectedProfileClubId]: {
                                ...prev[selectedProfileClubId],
                                primaryColor: e.target.value,
                              },
                            }))
                          }
                          className="w-full mt-0.5 h-9 px-1 py-1 rounded bg-slate-950 border border-slate-700 cursor-pointer"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] cf-muted">Sigle / Logo</span>
                        <input
                          type="text"
                          maxLength={10}
                          value={clubProfileForm.logoBadge}
                          onChange={(e) =>
                            setClubProfilesByClub((prev) => ({
                              ...prev,
                              [selectedProfileClubId]: { ...prev[selectedProfileClubId], logoBadge: e.target.value },
                            }))
                          }
                          className="w-full mt-0.5 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700"
                        />
                      </label>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      {clubProfileSavedNotice ? (
                        <span role={clubProfileSavedNotice.error ? 'alert' : 'status'} className={`text-[11px] font-bold ${clubProfileSavedNotice.error ? 'text-rose-400' : 'text-emerald-400'}`}>{clubProfileSavedNotice.text}</span>
                      ) : (
                        <span className="text-[10px] cf-muted">
                          Profil actif pour {selectedProfileClubId} : <strong>{clubProfileForm.name}</strong> ({clubProfileForm.logoBadge})
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            localStorage.setItem('cfos_lead_club_profiles_v1', JSON.stringify(clubProfilesByClub));
                          } catch {
                            setClubProfileSavedNotice({ text: 'Enregistrement impossible sur cet appareil. Réessayez.', error: true });
                            return;
                          }
                          setClubProfileSavedNotice({ text: 'Profil enregistré sur cet appareil uniquement.', error: false });
                          setTimeout(() => setClubProfileSavedNotice(null), 3500);
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer"
                      >
                        Enregistrer sur cet appareil
                      </button>
                    </div>
                    <p className="cf-muted">Ce profil est conservé sur cet appareil uniquement ; il n’est pas encore partagé avec les autres collaborateurs.</p>
                  </div>
                )}

                {crmSettings && <fieldset disabled={settingsState.saving} className="space-y-4 min-w-0">
                {selectedSettingsTab === 'app-settings' && (
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                      <div className="font-bold text-emerald-300 flex items-center justify-between">
                        <span>Langue d’interface</span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-bold">
                          Configuration française
                        </span>
                      </div>
                      <div>
                        <label className="block text-xs cf-muted mb-1">Langue principale du CRM &amp; de l’OS :</label>
                        <select
                          value={crmSettings.uiLanguage}
                          onChange={(e) => {
                            const val = e.target.value === "en" ? "en" : "fr";
                            setCrmSettings((s) => ({ ...s, uiLanguage: val }));
                          }}
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-sm font-medium"
                        >
                          <option value="fr">Français</option>
                          <option value="en" disabled>English (à venir)</option>
                        </select>
                        <p className="text-[11px] cf-muted mt-1">
                          L’interface est actuellement disponible en français.
                        </p>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                      <div className="font-bold text-emerald-300">Habilitations &amp; Profils</div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={statsAllowedForCommercial}
                          onChange={(e) => {
                            const nextVal = e.target.checked;
                            setStatsAllowedForCommercial(nextVal);
                            try {
                              localStorage.setItem(
                                'cfos_lead_app_settings_v1',
                                JSON.stringify({ statsAllowedForCommercial: nextVal })
                              );
                            } catch {
                              // ignore
                            }
                          }}
                        />
                        <span className="text-sm">Autoriser le profil Commercial à consulter le module Statistiques</span>
                      </label>
                      <p className="cf-muted">Cette préférence agit uniquement sur l’affichage de cet appareil. Les droits d’accès sont gérés dans Collaborateurs et RH.</p>
                    </div>
                  </div>
                )}

                {selectedSettingsTab === 'prospects' && (
                  <div className="space-y-4">
                    {/* LEAD-0488 / LEAD-0489 : Assignation */}
                    <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-300">Attribution automatique des prospects</span>
                        <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] font-bold">Tour de rôle par club</span>
                      </div>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={crmSettings.autoAssignEnabled}
                            onChange={(e) => setCrmSettings((s) => ({ ...s, autoAssignEnabled: e.target.checked }))}
                          />
                          <span>Activer l&apos;assignation automatisée des nouveaux prospects aux commerciaux en poste dans le club</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={crmSettings.autoUnassignOnLeave}
                            onChange={(e) => setCrmSettings((s) => ({ ...s, autoUnassignOnLeave: e.target.checked }))}
                          />
                          <span>Désassignation automatisée lors d&apos;une absence ou d&apos;un congé validé dans le planning RH</span>
                        </label>
                      </div>
                    </div>

                    {/* LEAD-0490 / LEAD-0491 / LEAD-0492 : Décrochage sportif */}
                    <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-300">Détection de l’inactivité sportive</span>
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">Passerelle Heitz</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                        <label className="block text-xs">
                          Seuil d&apos;inactivité sportive sans passage borne (jours) :
                          <input
                            type="number"
                            min={1}
                            max={180}
                            value={crmSettings.dropoutThresholdDays}
                            onChange={(e) => setCrmSettings((s) => ({ ...s, dropoutThresholdDays: Number(e.target.value) }))}
                            className="w-full mt-1 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-sm font-semibold"
                          />
                          <span className="text-[10px] cf-muted">Nombre de jours sans visite avant signalement</span>
                        </label>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer text-xs">
                            <input
                              type="checkbox"
                              checked={crmSettings.dropoutResetOnBadge}
                              onChange={(e) => setCrmSettings((s) => ({ ...s, dropoutResetOnBadge: e.target.checked }))}
                            />
                            <span>Remise à zéro automatique du compteur d&apos;inactivité dès détection d&apos;un badgeage borne</span>
                          </label>
                          {isTechnicalMode && <div className="text-[10px] text-cyan-400 font-mono">
                            Interrogation temps réel : http://10.10.0.20:8080/api/heitz-ws (Centres 5052 &amp; 5053)
                          </div>}
                        </div>
                      </div>
                    </div>

                    {/* LEAD-0493 à 0498 : Archivage automatisé */}
                    <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-300">Archivage des prospects sans réponse</span>
                        <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-bold">Règle stricte</span>
                      </div>
                      <div className="space-y-3 text-xs">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={crmSettings.autoArchiveEnabled}
                            onChange={(e) => setCrmSettings((s) => ({ ...s, autoArchiveEnabled: e.target.checked }))}
                          />
                          <span className="font-semibold">Activer l&apos;archivage automatisé des prospects sans réponse</span>
                        </label>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs cf-muted mb-1">Statut cible de réaffectation :</label>
                            <div className="flex gap-4">
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="radio"
                                  name="archiveTargetStage"
                                  value="Archivé"
                                  checked={crmSettings.archiveTargetStage === 'Archivé'}
                                  onChange={() => setCrmSettings((s) => ({ ...s, archiveTargetStage: 'Archivé' }))}
                                />
                                <span>Archivé (défaut)</span>
                              </label>
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="radio"
                                  name="archiveTargetStage"
                                  value="Froid"
                                  checked={crmSettings.archiveTargetStage === 'Froid'}
                                  onChange={() => setCrmSettings((s) => ({ ...s, archiveTargetStage: 'Froid' }))}
                                />
                                <span>Froid (réactivation ultérieure)</span>
                              </label>
                            </div>
                          </div>

                          <div>
                            <label htmlFor="lead-archive-days" className="block text-xs cf-muted mb-1">Délai avant archivage (jours) :</label>
                            <div className="flex items-center gap-2">
                              <input
                                id="lead-archive-days"
                                type="number"
                                min={1}
                                max={730}
                                value={crmSettings.archiveThresholdDays}
                                onChange={(e) => setCrmSettings((s) => ({ ...s, archiveThresholdDays: Number(e.target.value) }))}
                                className="w-24 px-2.5 py-1 rounded bg-slate-950 border border-slate-700 font-bold"
                              />
                              <button
                                type="button"
                                onClick={() => setCrmSettings((s) => ({ ...s, archiveThresholdDays: 30 }))}
                                className="px-2 py-0.5 rounded text-[11px] bg-slate-800 hover:bg-slate-700 cursor-pointer"
                              >
                                30 jours
                              </button>
                              <button
                                type="button"
                                onClick={() => setCrmSettings((s) => ({ ...s, archiveThresholdDays: 365 }))}
                                className="px-2 py-0.5 rounded text-[11px] bg-slate-800 hover:bg-slate-700 cursor-pointer"
                              >
                                365 jours
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-[11px] text-emerald-200">
                          <strong>Règle d&apos;archivage :</strong> Seule une réponse entrante du prospect (SMS reçu, WhatsApp entrant, appel entrant tracé) réinitialise le compteur. Les emails, SMS et appels sortants émis par le club ne repoussent jamais le délai d&apos;archivage.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {selectedSettingsTab === 'notifications' && (
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                      <h4 className="font-bold">Destinataires des alertes — {selectedProfileClubId === 'beynost' ? 'Beynost' : 'Carré de Soie'}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label>Email de notification
                          <input type="email" value={crmSettings.notifEmail}
                            onChange={e => setCrmSettings(s => ({ ...s, notifEmail: e.target.value }))}
                            className="w-full mt-1 px-3 py-2 rounded bg-slate-950 border border-slate-700" />
                        </label>
                        <label>Mobile de notification
                          <input type="tel" value={crmSettings.notifMobile}
                            onChange={e => setCrmSettings(s => ({ ...s, notifMobile: e.target.value }))}
                            className="w-full mt-1 px-3 py-2 rounded bg-slate-950 border border-slate-700" />
                        </label>
                      </div>
                    </div>

                    {/* Matrice des 8 alertes avec interrupteurs individuels */}
                    <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-300">Notifications à activer</span>
                        <span className="text-[10px] cf-muted">Sélection individuelle des notifications</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {CANONICAL_LEAD_ALERTS.map((alert) => {
                          const isChecked = crmSettings.enabledAlertIds.includes(alert.id);
                          return (
                            <label
                              key={alert.id}
                              className={`p-2.5 rounded-lg border text-xs transition flex items-start gap-2.5 ${
                                isChecked
                                  ? 'bg-slate-950/80 border-emerald-500/40 text-slate-100'
                                  : 'bg-slate-950/30 border-slate-800/80 text-slate-400'
                              }`}
                            >
                              <input
                                type="checkbox"
                                id={`alert-toggle-${alert.id}`}
                                checked={isChecked}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setCrmSettings((s) => ({
                                    ...s,
                                    enabledAlertIds: setLeadAlertEnabled(s.enabledAlertIds, alert.id, checked),
                                  }));
                                }}
                                className="mt-0.5 cursor-pointer"
                              />
                              <div className="flex-1">
                                <div className="flex items-center gap-1.5 font-bold">
                                  <span>{alert.label}</span>
                                  <span
                                    className={`px-1.5 py-0.2 rounded text-[9px] font-mono ${
                                      alert.channel === 'SMS'
                                        ? 'bg-amber-500/20 text-amber-300'
                                        : alert.channel === 'Email'
                                        ? 'bg-blue-500/20 text-blue-300'
                                        : 'bg-purple-500/20 text-purple-300'
                                    }`}
                                  >
                                    {alert.channel}
                                  </span>
                                </div>
                                <div className="text-[10px] cf-muted mt-0.5">{alert.description}</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>

                      {/* Simulateur d'alerte sans envoi réel */}
                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => {
                            setTestAlertNotice(
                              `${crmSettings.enabledAlertIds.length} règle(s) sélectionnée(s) pour ${selectedProfileClubId === 'beynost' ? 'Beynost' : 'Carré de Soie'}. ${settingsState.dirty ? 'Les modifications ne sont pas encore enregistrées. ' : ''}Aperçu local uniquement : aucun envoi ni test serveur effectué.`
                            );
                            setTimeout(() => setTestAlertNotice(null), 5000);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-cyan-700/80 hover:bg-cyan-600 text-cyan-100 text-xs font-semibold cursor-pointer"
                        >
                          Aperçu des règles sélectionnées
                        </button>
                        {testAlertNotice && (
                          <span role="status" className="text-[11px] text-cyan-300 font-medium">{testAlertNotice}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {selectedSettingsTab === 'exclusions' && (
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-300">Offres déclenchant le passage au statut client</span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">Offres Heitz</span>
                      </div>
                      <p className="text-xs cf-muted">
                        Cochez les formules et abonnements importés de la base Heitz dont la validation convertit automatiquement le prospect en Adhérent / Client officiel :
                      </p>

                      <div className="space-y-3">
                        {/* Carré de Soie */}
                        {selectedProfileClubId === 'carre-de-soie' && <div>
                          <div className="text-xs font-bold text-cyan-300 mb-1.5 flex items-center gap-1.5">
                            <span>Carré de Soie</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {CANONICAL_HEITZ_PASS_OFFERS.filter((o) => o.clubId === 'carre-de-soie').map((offer) => {
                              const isChecked = crmSettings.selectedPassOfferIds.includes(offer.id);
                              return (
                                <label
                                  key={offer.id}
                                  className={`p-2.5 rounded-lg border text-xs cursor-pointer flex items-center gap-2.5 transition ${
                                    isChecked
                                      ? 'bg-slate-950/80 border-cyan-500/40 text-slate-100'
                                      : 'bg-slate-950/30 border-slate-800/80 text-slate-400'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      setCrmSettings((s) => ({
                                        ...s,
                                        selectedPassOfferIds: checked
                                          ? [...s.selectedPassOfferIds, offer.id]
                                          : s.selectedPassOfferIds.filter((id) => id !== offer.id),
                                      }));
                                    }}
                                  />
                                  <div className="flex-1">
                                    <div className="font-bold">{offer.label}</div>
                                    <div className="text-[10px] cf-muted font-mono">{offer.id} · {offer.category}</div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>}

                        {/* Beynost */}
                        {selectedProfileClubId === 'beynost' && <div>
                          <div className="text-xs font-bold text-amber-300 mb-1.5 flex items-center gap-1.5">
                            <span>Beynost</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {CANONICAL_HEITZ_PASS_OFFERS.filter((o) => o.clubId === 'beynost').map((offer) => {
                              const isChecked = crmSettings.selectedPassOfferIds.includes(offer.id);
                              return (
                                <label
                                  key={offer.id}
                                  className={`p-2.5 rounded-lg border text-xs cursor-pointer flex items-center gap-2.5 transition ${
                                    isChecked
                                      ? 'bg-slate-950/80 border-amber-500/40 text-slate-100'
                                      : 'bg-slate-950/30 border-slate-800/80 text-slate-400'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      setCrmSettings((s) => ({
                                        ...s,
                                        selectedPassOfferIds: checked
                                          ? [...s.selectedPassOfferIds, offer.id]
                                          : s.selectedPassOfferIds.filter((id) => id !== offer.id),
                                      }));
                                    }}
                                  />
                                  <div className="flex-1">
                                    <div className="font-bold">{offer.label}</div>
                                    <div className="text-[10px] cf-muted font-mono">{offer.id} · {offer.category}</div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>}
                      </div>

                      <div className="pt-2 border-t border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block cf-muted mb-1">Périmètre par défaut du statut Client :</label>
                          <div className="flex gap-4">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="radio"
                                name="clientPassTargetScope"
                                value="club"
                                checked={crmSettings.clientPassTargetScope === 'club'}
                                onChange={() => setCrmSettings((s) => ({ ...s, clientPassTargetScope: 'club' }))}
                              />
                              <span>Client Club Unique</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="radio"
                                name="clientPassTargetScope"
                                value="enseigne"
                                checked={crmSettings.clientPassTargetScope === 'enseigne'}
                                onChange={() => setCrmSettings((s) => ({ ...s, clientPassTargetScope: 'enseigne' }))}
                              />
                              <span>Client Enseigne (2 clubs)</span>
                            </label>
                          </div>
                        </div>

                        <div>
                          <label className="block cf-muted mb-1">Offre libre / libellé spécifique historique :</label>
                          <input
                            type="text"
                            value={crmSettings.clientPassOffer}
                            onChange={(e) => setCrmSettings((s) => ({ ...s, clientPassOffer: e.target.value }))}
                            className="w-full px-2.5 py-1 rounded bg-slate-950 border border-slate-700"
                            placeholder="Ex : Pass Liberté + Biocircuit 12 mois"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {['sms', 'script', 'whatsapp', 'meetings', 'users'].includes(
                  selectedSettingsTab
                ) && (
                  <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-300">{LEAD_SETTINGS_PRESENTATION[selectedSettingsTab]?.label ?? 'Réglages du club'}</span>
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-bold">
                        Réglages du club
                      </span>
                    </div>
                    {selectedSettingsTab === 'sms' && (
                      <label className="block">Crédits SMS du club (lecture seule)
                        <input type="number" value={crmSettings.smsCredits} readOnly
                          className="w-full mt-1 px-3 py-2 rounded bg-slate-950 border border-slate-700" />
                      </label>
                    )}
                    {selectedSettingsTab === 'script' && (
                      <textarea
                        aria-label="Script de vente du club"
                        rows={4}
                        value={crmSettings.salesScript}
                        onChange={(e) => setCrmSettings((s) => ({ ...s, salesScript: e.target.value }))}
                        className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700"
                      />
                    )}
                    {selectedSettingsTab === 'whatsapp' && (
                      <label className="block">Numéro WhatsApp du club
                        <input type="tel" value={crmSettings.whatsappNumber}
                          onChange={e => setCrmSettings(s => ({ ...s, whatsappNumber: e.target.value }))}
                          className="w-full mt-1 px-3 py-2 rounded bg-slate-950 border border-slate-700" />
                      </label>
                    )}
                    {(selectedSettingsTab === 'meetings' || selectedSettingsTab === 'users') && (
                      <div className="text-[11px] cf-muted">
                        {selectedSettingsTab === 'meetings'
                          ? 'Les règles de réservation sont gérées dans Rendez-vous découverte.'
                          : 'Les droits sont attribués dans Collaborateurs et RH, selon le club et les responsabilités.'}
                      </div>
                    )}
                  </div>
                )}

                {selectedSettingsTab === 'automation' && crmSettings && (
                  <fieldset disabled={settingsState.saving} className="grid grid-cols-1 md:grid-cols-2 gap-2.5 min-w-0">
                    {LEAD_SERVICE_AUTOMATIONS_6.map((s) => (
                      <label key={s.id} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex justify-between items-center gap-3 cursor-pointer">
                        <div>
                          <div className="font-bold">
                            {s.event} ({s.channel})
                          </div>
                          <div className="text-[10px] cf-muted font-mono">
                            Variables : {s.variables.join(' · ')}
                          </div>
                        </div>
                        <input type="checkbox"
                          aria-label={`${s.event} (${s.channel})`}
                          checked={crmSettings.enabledAlertIds.includes(SERVICE_ALERT_IDS[s.id])}
                          onChange={event => setCrmSettings(settings => ({ ...settings,
                            enabledAlertIds: setLeadAlertEnabled(settings.enabledAlertIds, SERVICE_ALERT_IDS[s.id], event.target.checked),
                          }))}
                        />
                      </label>
                    ))}
                  </fieldset>
                )}

                {['app-settings', 'prospects', 'notifications', 'automation', 'exclusions', 'sms', 'script', 'whatsapp'].includes(selectedSettingsTab) && (
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <div aria-live="polite">
                      {settingsState.dirty && <p className="text-amber-300">Modifications non enregistrées.</p>}
                      {settingsState.saved && <p role="status" className="text-emerald-400">Réglages enregistrés pour {selectedProfileClubId === 'beynost' ? 'Beynost' : 'Carré de Soie'}.</p>}
                      {settingsState.error && <div role="alert" className="space-y-2 text-rose-400">
                        <p>{settingsState.error} Les modifications restent à enregistrer.</p>
                        <button type="button" className="underline" onClick={() => {
                          if (!settingsState.dirty || window.confirm('Abandonner les modifications non enregistrées et recharger ce club ?')) void settingsEditor.load();
                        }}>Recharger les réglages du club</button>
                      </div>}
                    </div>
                    <button type="button" disabled={settingsState.saving}
                      onClick={() => void settingsEditor.save()}
                      className="px-3.5 py-2 rounded-lg bg-emerald-600 disabled:opacity-50 text-white font-bold">
                      {settingsState.saving ? 'Enregistrement…' : 'Enregistrer les réglages du club'}
                    </button>
                  </div>
                )}
                </fieldset>}

                {selectedSettingsTab === 'segments' && (
                  <div className="space-y-2">
                    <div className="font-bold">Palette officielle (15 couleurs) &amp; Bibliothèque 95 icônes</div>
                    <div className="flex flex-wrap gap-2">
                      {LEAD_SEGMENT_COLORS_15.map((c) => (
                        <span
                          key={c}
                          className="w-7 h-7 rounded-lg border border-white/20 flex items-center justify-center text-[9px] font-mono text-white"
                          style={{ backgroundColor: c }}
                          title={c}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {selectedSettingsTab === 'sources' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {LEAD_SOURCES_CATEGORIES_9.map((cat) => (
                      <div key={cat.id} className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 flex justify-between">
                        <span>{cat.label}</span>
                        <span className="font-mono font-bold text-emerald-400">{cat.count} sources</span>
                      </div>
                    ))}
                  </div>
                )}

                {selectedSettingsTab === 'partners' && (
                  <div className="space-y-4">
                    {!isTechnicalMode && <p className="cf-muted">Les configurations présentées sont des exemples de démonstration. La connexion réelle de chaque service reste à vérifier.</p>}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                      {LEAD_PARTNERS_9.map((p) => (
                        <div key={p.id} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                          <div className="flex items-center justify-between">
                            <strong>{p.name}</strong>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                p.status === 'connecte_lan'
                                  ? 'bg-emerald-500/15 text-emerald-300'
                                  : p.status === 'sandbox_prete'
                                  ? 'bg-amber-500/15 text-amber-300'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {isTechnicalMode ? p.status : p.status === 'sandbox_prete' ? 'Mode test' : p.status === 'connecte_lan' ? 'Connexion locale à vérifier' : 'Non connecté'}
                            </span>
                          </div>
                          {isTechnicalMode && <>
                            <div className="text-[11px] cf-muted break-words [overflow-wrap:anywhere]">{p.direction}</div>
                            <div className="text-[10px] text-slate-300 break-words">{p.note}</div>
                          </>}
                        </div>
                      ))}
                    </div>

                    {/* Testeur direct Webhook POST /api/lead/webhooks/clubEntry */}
                    {isTechnicalMode && <div className="p-3 rounded-xl bg-slate-950/70 border border-emerald-500/30 space-y-2">
                      <div className="font-bold flex items-center gap-2 text-emerald-300">
                        <Webhook className="w-4 h-4" />
                        Testeur Sandbox — POST /api/lead/webhooks/clubEntry (API-01)
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="email"
                          value={webhookEmail}
                          onChange={(e) => setWebhookEmail(e.target.value)}
                          placeholder="Email prospect fictif"
                          className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700"
                        />
                        <input
                          type="text"
                          value={webhookOffer}
                          onChange={(e) => setWebhookOffer(e.target.value)}
                          placeholder="offername (optionnel pour contact seul)"
                          className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700"
                        />
                        <button
                          type="button"
                          onClick={handleTestWebhook}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer"
                        >
                          Tester Webhook clubEntry
                        </button>
                      </div>
                      {webhookResultText && (
                        <div className="p-2 rounded bg-slate-900 border border-slate-800 font-mono text-[11px] text-emerald-300 break-all">
                          {webhookResultText}
                        </div>
                      )}
                    </div>}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* ONGLET 9 : TRAÇABILITÉ LEAD (1 682 ENTRÉES + CAPTURES + ÉCARTS)   */}
          {/* ================================================================= */}
          {activeTab === 'traceability' && (
            <div className="space-y-4 text-xs">
              <div className="cf-card p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-extrabold">
                      Explorateur Intégral Audit Lead v{LEAD_AUDIT_META.version} — {LEAD_AUDIT_META.totalEntries} entrées
                    </h2>
                    <p className="cf-muted">
                      Source : <code>/references/lead_audit/LEAD_AUDIT_EN_COURS/INVENTAIRE_LEAD.json</code> (28 groupes · 63 rubriques · 23 écarts · 11 blocages · 16 exemples · 26 captures)
                    </p>
                  </div>
                  <a
                    href="/references/lead_audit/LEAD_AUDIT_EN_COURS/INDEX_LEAD.html"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-bold"
                  >
                    Ouvrir INDEX_LEAD.html complet ↗
                  </a>
                </div>

                {/* Synthèse des 28 groupes */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 max-h-60 overflow-y-auto pr-1">
                  {LEAD_28_TRACEABILITY_GROUPS.map((g) => (
                    <button
                      key={g.index}
                      type="button"
                      onClick={() => {
                        setTraceRubriqueFilter('ALL');
                        setTraceQuery(g.family.split('(')[0].split(',')[0].trim());
                      }}
                      className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-emerald-500/50 text-left cursor-pointer"
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="truncate">{g.index}. {g.family}</span>
                        <span className="font-mono text-emerald-400 shrink-0 ml-1">{g.count}</span>
                      </div>
                      <div className="text-[10px] cf-muted truncate">{g.targetScreen}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Registre des 1 682 entrées avec recherche */}
              <div className="cf-card p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[220px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={traceQuery}
                      onChange={(e) => setTraceQuery(e.target.value)}
                      placeholder="Rechercher LEAD-xxxx, rubrique, option ou règle..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700"
                    />
                  </div>
                  <select
                    value={traceStateFilter}
                    onChange={(e) => setTraceStateFilter(e.target.value as typeof traceStateFilter)}
                    aria-label="Filtrer par état Lead"
                    className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700"
                  >
                    <option value="ALL">Tous états ({leadEntries.length || LEAD_AUDIT_META.totalEntries})</option>
                    <option value="observe">observe ({LEAD_AUDIT_META.observedCount})</option>
                    <option value="documente">documente ({LEAD_AUDIT_META.documentedCount})</option>
                    <option value="a_verifier">a_verifier ({LEAD_AUDIT_META.toVerifyCount})</option>
                  </select>
                  <select
                    value={traceRubriqueFilter}
                    onChange={(e) => setTraceRubriqueFilter(e.target.value)}
                    aria-label="Filtrer par rubrique Lead"
                    className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 max-w-[220px]"
                  >
                    <option value="ALL">Toutes rubriques ({uniqueTraceRubriques.length})</option>
                    {uniqueTraceRubriques.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                {entriesLoading && <div className="cf-muted">Chargement de INVENTAIRE_LEAD.json (1 682 entrées)...</div>}
                {entriesError && <div className="text-rose-400">Erreur : {entriesError}</div>}

                {!entriesLoading && !entriesError && (
                  <div className="overflow-x-auto max-h-72 overflow-y-auto border border-slate-800 rounded-xl">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-slate-950 text-slate-400">
                        <tr className="border-b border-slate-800">
                          <th className="p-2">ID</th>
                          <th className="p-2">Rubrique</th>
                          <th className="p-2">Option</th>
                          <th className="p-2">État</th>
                          <th className="p-2">Précision / Preuve</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTraceEntries.map((item) => (
                          <tr key={item.id} className="border-b border-slate-800/50">
                            <td className="p-2 font-mono text-emerald-400 whitespace-nowrap">{item.id}</td>
                            <td className="p-2 text-slate-300">{item.rubrique}</td>
                            <td className="p-2 font-semibold">{item.option}</td>
                            <td className="p-2 whitespace-nowrap">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  item.etat === 'observe'
                                    ? 'bg-emerald-500/15 text-emerald-300'
                                    : item.etat === 'documente'
                                    ? 'bg-sky-500/15 text-sky-300'
                                    : 'bg-amber-500/15 text-amber-300'
                                }`}
                              >
                                {item.etat}
                              </span>
                            </td>
                            <td className="p-2 text-[11px] cf-muted">{item.precision}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Galerie 26 captures + Écarts 23 + B01-B11 + EX01-EX16 */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="cf-card p-4 space-y-2.5">
                  <h3 className="text-sm font-extrabold flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-violet-400" />
                    Galerie des 26 captures d’audit Lead
                  </h3>
                  <select
                    value={selectedCapture}
                    onChange={(e) => setSelectedCapture(e.target.value)}
                    aria-label="Choisir une capture d'audit Lead"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700"
                  >
                    {LEAD_26_CAPTURES.map((cap) => (
                      <option key={cap} value={cap}>{cap}</option>
                    ))}
                  </select>
                  <img
                    src={`/references/lead_audit/LEAD_AUDIT_EN_COURS/captures/${selectedCapture}`}
                    alt={selectedCapture}
                    className="w-full max-h-72 object-contain rounded-xl border border-slate-800 bg-black/40"
                  />
                </div>

                <div className="cf-card p-4 space-y-3 max-h-96 overflow-y-auto">
                  <h3 className="text-sm font-extrabold">
                    23 Écarts résolus/encadrés, {LEAD_11_BLOCAGES.length} Blocages &amp; {LEAD_16_EXEMPLES.length} Exemples
                  </h3>
                  <div className="space-y-1.5">
                    {LEAD_23_ECARTS.map((ec) => (
                      <div key={ec.id} className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                        <div className="flex justify-between font-bold">
                          <span className="text-amber-300 font-mono">{ec.id}</span>
                          <span className="text-[10px] cf-muted">{ec.state}</span>
                        </div>
                        <div className="text-[11px]">{ec.summary}</div>
                        <div className="text-[11px] text-emerald-400">→ {ec.resolutionInCfitness}</div>
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 border-t border-slate-800 space-y-1">
                    <div className="font-bold text-violet-300">Blocages (B01–B11) &amp; Exemples (EX01–EX16)</div>
                    {LEAD_11_BLOCAGES.map((b) => (
                      <div key={b.id} className="text-[11px] cf-muted">
                        <strong>{b.id}</strong> ({b.title}) : {b.detail}
                      </div>
                    ))}
                    {LEAD_16_EXEMPLES.map((ex) => (
                      <div key={ex.id} className="text-[11px] cf-muted">
                        <strong>{ex.id} [{ex.priority}]</strong> {ex.title} — <span className="text-emerald-400">{ex.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
        </div>
      </div>
    </div>,
    isTechnicalMode
  );
}
