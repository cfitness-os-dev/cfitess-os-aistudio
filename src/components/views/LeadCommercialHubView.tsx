import React, { useEffect, useMemo, useState } from 'react';
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
import { cleanUiTree } from '../../domain/cleanModeSanitizer';
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
  LEAD_EMAIL_FONTS_18,
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
  prospectName: string;
  clubId: 'carre-de-soie' | 'beynost';
  dueBucket: (typeof LEAD_ACTIVITY_TIME_FILTERS)[number];
  statusLabel: string;
}

interface FictiveFormRow {
  id: string;
  name: string;
  clubId: 'carre-de-soie' | 'beynost';
  responsesCount: number;
  createdAt: string;
  published: boolean;
  sections: number;
}

interface LeadCommercialHubViewProps {
  pipelineChildren: React.ReactNode;
  subTarget?: string | null;
}

const INITIAL_FICTIVE_ACTIVITIES: FictiveActivityRow[] = [
  { id: 'act-1', type: 'SCHEDULED_CALL', title: 'Rappel essai Biocircuit', prospectName: 'Camille Garnier', clubId: 'carre-de-soie', dueBucket: "Aujourd'hui", statusLabel: 'À traiter' },
  { id: 'act-2', type: 'APPOINTMENT', title: 'Bilan Checkup Technogym', prospectName: 'Lucas Morel', clubId: 'beynost', dueBucket: 'Demain', statusLabel: 'Confirmé' },
  { id: 'act-3', type: 'CONTACT', title: 'Demande formulaire site web', prospectName: 'Nadia Benali', clubId: 'carre-de-soie', dueBucket: 'En retard', statusLabel: 'En retard (J-3)' },
  { id: 'act-4', type: 'SCHEDULED_SMS', title: 'SMS rappel séance découverte', prospectName: 'Hugo Lefebvre', clubId: 'beynost', dueBucket: 'Cette semaine', statusLabel: 'Planifié' },
  { id: 'act-5', type: 'SCHEDULED_EMAIL', title: 'Email confirmation offre', prospectName: 'Claire Dubois', clubId: 'carre-de-soie', dueBucket: 'À faire', statusLabel: 'En attente (EX08)' },
  { id: 'act-6', type: 'REVIEW', title: 'Avis club Google / Lead', prospectName: 'Antoine Rocher', clubId: 'beynost', dueBucket: 'Faites', statusLabel: 'Traité (EX09)' },
  { id: 'act-7', type: 'SMS', title: 'Réponse SMS entrante RDV', prospectName: 'Manon Faure', clubId: 'carre-de-soie', dueBucket: 'Faites', statusLabel: 'Reçu (EX07)' },
  { id: 'act-8', type: 'MAIL', title: 'Réponse email prospect', prospectName: 'Sébastien Girard', clubId: 'beynost', dueBucket: 'Faites', statusLabel: 'Lu' },
];

const INITIAL_FICTIVE_FORMS: FictiveFormRow[] = [
  { id: 'frm-1', name: 'Séance Découverte Carré de Soie', clubId: 'carre-de-soie', responsesCount: 42, createdAt: '2026-10-12', published: true, sections: 3 },
  { id: 'frm-2', name: 'Bilan Checkup Beynost (EX01/EX02)', clubId: 'beynost', responsesCount: 19, createdAt: '2026-11-02', published: true, sections: 2 },
  { id: 'frm-3', name: 'Offre Entreprise & CE (Brouillon)', clubId: 'carre-de-soie', responsesCount: 0, createdAt: '2026-11-16', published: false, sections: 1 },
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
  const { currentUser, heitzMembers, prospects, clubFilter, isTechnicalMode } = useCfos();

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

  const [emailDraft, setEmailDraft] = useState<{
    subject: string;
    heading: string;
    bodyText: string;
    ctaLabel: string;
    ctaUrl: string;
    footerText: string;
    font: string;
  }>(() => {
    try {
      const raw = localStorage.getItem('cfos_email_builder_v1');
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return {
      subject: 'Votre séance découverte offerte chez C.Fitness',
      heading: 'Bienvenue chez C.Fitness Carré de Soie & Beynost',
      bodyText: 'Profitez d’un bilan forme Technogym Checkup complet avec nos coachs.',
      ctaLabel: 'Réserver mon créneau',
      ctaUrl: 'https://c.fitness/essai',
      footerText: 'SAS C.FITNESS — SIRET 818 651 317 00018 · Désinscription RGPD',
      font: 'Plus Jakarta Sans',
    };
  });
  const [emailSavedNotice, setEmailSavedNotice] = useState<string | null>(null);

  const [clubProfileForm, setClubProfileForm] = useState<{
    name: string;
    address: string;
    primaryColor: string;
    logoBadge: string;
  }>(() => {
    try {
      const raw = localStorage.getItem('cfos_lead_club_profile_v1');
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return {
      name: 'C.Fitness Carré de Soie & Beynost',
      address: '2 Rue Jacquard, 69120 Vaulx-en-Velin / ZAC des Baterses, 01700 Beynost',
      primaryColor: '#7c3aed',
      logoBadge: 'CF',
    };
  });
  const [clubProfileSavedNotice, setClubProfileSavedNotice] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<LeadHubTab>(() =>
    subTarget === 'lead-traceability' ? 'traceability' : 'prospects'
  );
  const [simulatedRole, setSimulatedRole] = useState<LeadRole>(() =>
    mapAppRoleToLeadRole(currentUser.role)
  );
  const [statsAllowedForCommercial, setStatsAllowedForCommercial] = useState(true);

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

  // Tab 3 : Activités (/todos)
  const [activities, setActivities] = useState<FictiveActivityRow[]>(INITIAL_FICTIVE_ACTIVITIES);
  const [actTypeFilter, setActTypeFilter] =
    useState<(typeof LEAD_ACTIVITY_TYPES)[number]['code']>('*');
  const [actTimeFilter, setActTimeFilter] =
    useState<(typeof LEAD_ACTIVITY_TIME_FILTERS)[number] | 'ALL'>('ALL');
  const [purgeLog, setPurgeLog] = useState<string | null>(null);

  // Tab 4 : Planning RDV & Stripe
  const [preventCrossTypeCollision, setPreventCrossTypeCollision] = useState(true);
  const [rdvCapacityMax, setRdvCapacityMax] = useState(1);
  const [rdvMinDelayHours, setRdvMinDelayHours] = useState(4);
  const [rdvHoursBeforeSlot, setRdvHoursBeforeSlot] = useState(6);
  const [rdvTypeCandidate, setRdvTypeCandidate] = useState('Coaching Découverte (60 min)');
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
  const [emailStep, setEmailStep] = useState<1 | 2 | 3 | 4>(1);
  const [emailEditorMobilePane, setEmailEditorMobilePane] = useState<'edit' | 'preview'>('edit');
  const [smsDraftText, setSmsDraftText] = useState(
    'Bonjour %prenom%, C.Fitness %club% vous rappelle votre séance le %rdv-date% à %rdv-heure%. STOP au 36xxx.'
  );
  const [scenarioMode, setScenarioMode] = useState<'Automatique' | 'Manuel'>('Automatique');
  const [scenarioState, setScenarioState] = useState<'Actif' | 'Verrouillé' | 'Inactif'>('Actif');
  const [scenarioStepUnit, setScenarioStepUnit] = useState<'Minutes' | 'Heures' | 'Jours'>('Minutes');
  const [scenarioStepDelay, setScenarioStepDelay] = useState(5);

  // Tab 7 : Statistiques, Ventes & Formulaires
  const [analyticsSubTab, setAnalyticsSubTab] = useState<'stats' | 'sales' | 'forms'>('stats');
  const [statsPeriodId, setStatsPeriodId] = useState<string>('current_month');
  const [ignoreArchivedStats, setIgnoreArchivedStats] = useState(true);
  const [compareToPreviousYear, setCompareToPreviousYear] = useState(true);
  const [multiClubBeynost, setMultiClubBeynost] = useState(true);
  const [multiClubCds, setMultiClubCds] = useState(true);
  const [formsList, setFormsList] = useState<FictiveFormRow[]>(INITIAL_FICTIVE_FORMS);
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
    const parsedRows = importCsvText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(';'));
    const existingEmails = prospects.map((p) => p.email);
    const existingPhones = prospects.map((p) => p.phone);
    return validateAndParseLeadImportRows(parsedRows, existingEmails, existingPhones);
  }, [importCsvText, prospects]);

  const archiveDecision = useMemo(
    () => evaluateProspectAutoArchive(archiveDaysInbound, archiveDaysOutbound, 30, false),
    [archiveDaysInbound, archiveDaysOutbound]
  );

  const rdvBookingDecision = useMemo(
    () =>
      validateAppointmentBooking(
        INITIAL_SLOTS,
        {
          clubId: 'carre-de-soie',
          coachId: 'emp-karim',
          typeName: rdvTypeCandidate,
          date: '2026-11-20',
          startTime: '10:00',
          hoursBeforeSlot: rdvHoursBeforeSlot,
          minDelayHours: rdvMinDelayHours,
          capacityMax: rdvCapacityMax,
          requiresStripePayment: rdvRequiresStripe,
          stripePaidConfirmed: rdvStripePaid,
        },
        preventCrossTypeCollision
      ),
    [
      rdvTypeCandidate,
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

  const smsMetrics = useMemo(() => computeSmsSegmentMetrics(smsDraftText), [smsDraftText]);

  const filteredActivities = useMemo(() => {
    return activities.filter((a) => {
      if (clubFilter !== 'all' && a.clubId !== clubFilter) return false;
      if (actTypeFilter !== '*' && a.type !== actTypeFilter) return false;
      if (actTimeFilter !== 'ALL' && a.dueBucket !== actTimeFilter) return false;
      return true;
    });
  }, [activities, clubFilter, actTypeFilter, actTimeFilter]);

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
    setFormsList((prev) => prev.filter((f) => f.id !== formId));
    setFormAccessMessage('Formulaire supprimé (simulation locale).');
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

  const ALL_TABS: Array<{ id: LeadHubTab; label: string; badge?: string; icon: React.ComponentType<{ className?: string }>; technicalOnly?: boolean }> = [
    { id: 'prospects', label: 'Prospects & Pipeline', badge: isTechnicalMode ? '10 statuts' : undefined, icon: Users },
    { id: 'clients', label: 'Clients & Vacances', badge: 'Heitz', icon: UserCheck, technicalOnly: true },
    { id: 'activities', label: 'Activités', badge: isTechnicalMode ? '9 filtres' : undefined, icon: ActivityIcon },
    { id: 'planning', label: isTechnicalMode ? 'Planning RDV & Stripe' : 'RDV Découverte', badge: isTechnicalMode ? 'RDV-01' : undefined, icon: Calendar },
    { id: 'messaging', label: 'WhatsApp 24h', badge: isTechnicalMode ? 'WA-01/02' : undefined, icon: MessageCircle },
    { id: 'communication', label: 'Communication', badge: isTechnicalMode ? 'Admin/Mgr' : undefined, icon: Send },
    { id: 'analytics_forms', label: 'Stats · Ventes · Formulaires', badge: isTechnicalMode ? 'ACL-01' : undefined, icon: BarChart3 },
    { id: 'settings', label: 'Paramètres CRM', badge: isTechnicalMode ? '9 APIs' : undefined, icon: Sliders },
    { id: 'traceability', label: 'Traçabilité Lead', badge: '1682', icon: Compass, technicalOnly: true },
  ];
  const TABS = ALL_TABS.filter((t) => !t.technicalOnly || isTechnicalMode);

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
                CRM Commercial · Carré de Soie &amp; Beynost
              </div>
            )}
            <h1 className="text-base sm:text-lg font-extrabold mt-1">
              {isTechnicalMode
                ? `CRM Commercial Bi-Club, Communication Multicanal & Traçabilité Lead (${LEAD_AUDIT_META.totalFiles} fichiers)`
                : 'Gestion Commerciale, Prospects & Suivi Client'}
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

        {/* Navigation interne des 9 onglets Lead — 100% responsive sans débordement */}
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-800/80">
          {TABS.map((t) => {
            const Icon = t.icon;
            const accessCheck = evaluateLeadModuleAccess(
              simulatedRole,
              tabToTarget(t.id),
              statsAllowedForCommercial
            );
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border transition-all ${
                  active
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-400 shadow-xs'
                    : accessCheck.allowed
                    ? 'bg-slate-900/50 text-slate-200 border-slate-700/80 hover:border-emerald-500/50'
                    : 'bg-rose-950/30 text-rose-300 border-rose-500/30 opacity-85'
                }`}
              >
                {accessCheck.allowed ? (
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <Lock className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                )}
                <span>{t.label}</span>
                {t.badge && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/25">
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Contrôle serveur RBAC si la vue active est bloquée */}
      {!currentAccess.allowed ? (
        <div className="cf-card p-6 border border-rose-500/40 bg-rose-950/20 space-y-3">
          <div className="flex items-center gap-2 text-rose-400 font-extrabold text-sm">
            <ShieldAlert className="w-5 h-5" />
            <span>HTTP {currentAccess.httpStatus} — Accès bloqué côté serveur</span>
          </div>
          <p className="text-xs text-slate-200">{currentAccess.reason}</p>
          <p className="text-[11px] cf-muted">
            Conformément aux spécifications <code>08_REPRISE_ET_DROITS</code> et <code>ACL-01</code>, le profil{' '}
            <strong>{simulatedRole.toUpperCase()}</strong> ne peut accéder ni à l&apos;interface ni aux routes API
            associées. Sélectionne <strong>ADMIN</strong> ou <strong>MANAGER</strong> ci-dessus pour inspecter cette section.
          </p>
        </div>
      ) : (
        <>
          {/* ================================================================= */}
          {/* ONGLET 1 : PIPELINE EXISTANT + OUTILS PROSPECTS LEAD              */}
          {/* ================================================================= */}
          {activeTab === 'prospects' && (
            <div className="space-y-4">
              {pipelineChildren}

              {/* Extension Lead Lot 2A : 10 statuts, Sélection multiple Segments, Import Excel 11 col., Archivage & DOC-02 */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {/* Import Excel Officiel 11 Colonnes */}
                <div className="cf-card p-4 space-y-3 border border-slate-700/80">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-extrabold flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                        Import Prospects Excel Officiel (11 colonnes ordonnées)
                      </h3>
                      <p className="text-[11px] cf-muted">
                        1re ligne ignorée · Email requis · Consentement RGPD décoché (<code>false</code>) par défaut
                      </p>
                    </div>
                    <a
                      href="/references/lead_audit/LEAD_AUDIT_EN_COURS/sources/template_import_prospects_officiel.xlsx"
                      download
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Modèle .xlsx officiel
                    </a>
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
                    10 Statuts Lead, Sélection Multiple Segments &amp; Règle d’Archivage
                  </h3>

                  <div className="flex flex-wrap gap-1.5">
                    {LEAD_PROSPECT_STATUSES.map((st) => (
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
                        {st}
                      </button>
                    ))}
                  </div>

                  {/* Sélection multiple -> Segments */}
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 text-xs">
                    <div className="font-bold flex items-center justify-between">
                      <span>Sélection multiple → Ajouter un segment ({selectedLeadIds.length} choisi(s))</span>
                      <span className="text-[10px] cf-muted">Bouton actif uniquement si ≥ 1 ligne</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {prospects.slice(0, 4).map((p) => {
                        const checked = selectedLeadIds.includes(p.id);
                        return (
                          <label
                            key={p.id}
                            className="px-2 py-1 rounded bg-slate-950/60 border border-slate-700 flex items-center gap-1.5 cursor-pointer text-[11px]"
                          >
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
                        onClick={() =>
                          setBulkSegmentLog(
                            `Segment « ${bulkSegmentToAssign} » attribué à ${selectedLeadIds.length} prospect(s) fictif(s).`
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-violet-600 disabled:opacity-40 text-white font-bold text-xs cursor-pointer"
                      >
                        Ajouter à la sélection
                      </button>
                    </div>
                    {bulkSegmentLog && (
                      <div className="text-[11px] text-emerald-400 font-semibold">{bulkSegmentLog}</div>
                    )}
                  </div>

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
                        const isDrop = m.daysSinceLastWorkout >= 14;
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
                                {m.daysSinceLastWorkout} j sans passage {isDrop ? '⚠ Décrocheur' : ''}
                              </span>
                            </td>
                            <td className="py-2 pr-3 font-mono text-[11px]">
                              Score Checkup {m.technogymCheckupScore ?? 78}/100 · Âge {m.technogymCheckupWellnessAge ?? 29} ans · {m.technogymMoves30d} MOVEs/30j
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
                    Activités Commerciales (`/todos`) — 9 types &amp; 6 vues temporelles
                  </h2>
                  <p className="text-xs cf-muted">
                    Chaque filtre possède un <code>aria-label</code> explicite ; la purge des retards journalise chaque action.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const overdueCount = activities.filter((a) => a.dueBucket === 'En retard').length;
                    setActivities((prev) =>
                      prev.map((a) =>
                        a.dueBucket === 'En retard'
                          ? { ...a, dueBucket: 'Faites', statusLabel: 'Purgé avec trace audit' }
                          : a
                      )
                    );
                    setPurgeLog(
                      `${overdueCount} activité(s) en retard purgée(s) et journalisée(s) dans l'audit serveur.`
                    );
                  }}
                  className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold cursor-pointer"
                >
                  Purger les retards ({activities.filter((a) => a.dueBucket === 'En retard').length})
                </button>
              </div>

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
                  filteredActivities.map((a) => (
                    <div
                      key={a.id}
                      className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 mr-2">
                          {a.type}
                        </span>
                        <strong>{a.title}</strong> · {a.prospectName} ({a.clubId})
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px]">{a.dueBucket}</span>
                        <span className="px-2 py-0.5 rounded bg-violet-500/15 text-violet-300 text-[11px]">
                          {a.statusLabel}
                        </span>
                      </div>
                    </div>
                  ))
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
                  Type de Rendez-vous Réservable, Collisions (RDV-01) &amp; Lien Isolé
                </h2>
                <p className="text-xs cf-muted">
                  Créneau existant de test : <strong>20/11/2026 à 10:00 (Coach Karim — Carré de Soie)</strong> déjà occupé par « Bilan Technogym Checkup ».
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
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
                        ? 'Activer la prévention automatique des collisions inter-types (Décision RDV-01)'
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
              </div>

              <div className="cf-card p-4 space-y-3 text-xs">
                <h3 className="text-sm font-extrabold">Variables &amp; Lien isolé par Club</h3>
                <p className="cf-muted">
                  Tags disponibles : <code>%club%</code>, <code>%rdv-date%</code>, <code>%rdv-heure%</code> · Lien isolé généré par club.
                </p>
                <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1 font-mono text-[11px]">
                  <div>Carré de Soie : /book/carre-de-soie/coaching-decouverte</div>
                  <div>Beynost       : /book/beynost/bilan-checkup-technogym</div>
                  {isTechnicalMode && (
                    <div>Webhook Stripe: POST /api/v2/appointment/webhooks/stripe/{'{club}'}</div>
                  )}
                </div>
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
                    Messagerie &amp; Règle Fenêtre Meta 24h (WA-01 / WA-02 / INC-001)
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
                      {prospects.map((p) => (
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
                          const target = prospects.find((p) => p.id === waTargetId) || prospects[0];
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
                    Repli si fenêtre &gt; 24h (WA-01)
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
                    <span>Complétude technique WA-02 : Image JPG/PNG (≤ 5 Mo) jointe</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={waExplicitSave}
                      onChange={(e) => setWaExplicitSave(e.target.checked)}
                    />
                    <span>Clic explicite « Enregistrer brouillon » (garde-fou INC-001)</span>
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
                    <strong className="font-mono">{waDecision.deliveryChannel}</strong> · Brouillon créé (INC-001) :{' '}
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
                  <li>Média image : JPG/PNG max <code>5 Mo</code> (contrôlé indépendamment de l’approbation Meta — WA-02).</li>
                </ul>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* ONGLET 6 : COMMUNICATION (6 SOUS-VUES + RSP-02/03/04)             */}
          {/* ================================================================= */}
          {activeTab === 'communication' && (
            <div className="space-y-4">
              <div className="cf-card p-3 flex flex-wrap gap-1.5">
                {[
                  { id: 'models', label: '1. Modèles (12 blocs / 18 polices)' },
                  { id: 'campaigns', label: '2. Campagnes (Email 4 étapes & SMS)' },
                  { id: 'utm', label: '3. Campagnes UTM' },
                  { id: 'scenarios', label: '4. Scénarios (SC-01/02 & WA-01)' },
                  { id: 'logs', label: '5-6. SMS envoyés & Emails échangés' },
                ].map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setCommSubTab(sub.id as typeof commSubTab)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border ${
                      commSubTab === sub.id
                        ? 'bg-emerald-600 text-white border-emerald-400'
                        : 'bg-slate-900 border-slate-700 text-slate-300'
                    }`}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>

              {commSubTab === 'models' && (
                <div className="cf-card p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-extrabold">
                      Constructeur Email (12 blocs &amp; 18 polices) — Correction mobile RSP-04
                    </h3>
                    <div className="flex gap-1 md:hidden">
                      <button
                        type="button"
                        onClick={() => setEmailEditorMobilePane('edit')}
                        className={`px-2.5 py-1 rounded text-xs font-bold ${
                          emailEditorMobilePane === 'edit' ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        Éditer
                      </button>
                      <button
                        type="button"
                        onClick={() => setEmailEditorMobilePane('preview')}
                        className={`px-2.5 py-1 rounded text-xs font-bold ${
                          emailEditorMobilePane === 'preview' ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        Aperçu
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className={`${emailEditorMobilePane === 'preview' ? 'hidden md:block' : ''} space-y-2.5`}>
                      <div className="font-bold">Éditeur de modèle email (Composition &amp; Propriétés) :</div>
                      <div className="space-y-2 p-3 rounded-xl bg-slate-900/70 border border-slate-800">
                        <label className="block">
                          <span className="text-[10px] cf-muted">Objet de l&apos;email</span>
                          <input
                            type="text"
                            value={emailDraft.subject}
                            onChange={(e) => setEmailDraft((p) => ({ ...p, subject: e.target.value }))}
                            className="w-full mt-0.5 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[10px] cf-muted">Titre (En-tête)</span>
                          <input
                            type="text"
                            value={emailDraft.heading}
                            onChange={(e) => setEmailDraft((p) => ({ ...p, heading: e.target.value }))}
                            className="w-full mt-0.5 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[10px] cf-muted">Texte principal</span>
                          <textarea
                            rows={2}
                            value={emailDraft.bodyText}
                            onChange={(e) => setEmailDraft((p) => ({ ...p, bodyText: e.target.value }))}
                            className="w-full mt-0.5 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700"
                          />
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <span className="text-[10px] cf-muted">Libellé Bouton CTA</span>
                            <input
                              type="text"
                              value={emailDraft.ctaLabel}
                              onChange={(e) => setEmailDraft((p) => ({ ...p, ctaLabel: e.target.value }))}
                              className="w-full mt-0.5 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[10px] cf-muted">URL Bouton CTA</span>
                            <input
                              type="url"
                              value={emailDraft.ctaUrl}
                              onChange={(e) => setEmailDraft((p) => ({ ...p, ctaUrl: e.target.value }))}
                              className="w-full mt-0.5 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700"
                            />
                          </label>
                        </div>
                        <label className="block">
                          <span className="text-[10px] cf-muted">Pied de page</span>
                          <input
                            type="text"
                            value={emailDraft.footerText}
                            onChange={(e) => setEmailDraft((p) => ({ ...p, footerText: e.target.value }))}
                            className="w-full mt-0.5 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700"
                          />
                        </label>
                        <div className="flex items-center justify-between gap-2 pt-1">
                          <select
                            aria-label="Police"
                            value={emailDraft.font}
                            onChange={(e) => setEmailDraft((p) => ({ ...p, font: e.target.value }))}
                            className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-[11px]"
                          >
                            {LEAD_EMAIL_FONTS_18.map((font) => (
                              <option key={font} value={font}>
                                {font}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                localStorage.setItem('cfos_email_builder_v1', JSON.stringify(emailDraft));
                              } catch {
                                // ignore
                              }
                              setEmailSavedNotice('Modèle email enregistré avec succès.');
                              setTimeout(() => setEmailSavedNotice(null), 3500);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer"
                          >
                            Enregistrer le modèle
                          </button>
                        </div>
                        {emailSavedNotice && (
                          <div className="text-[11px] font-bold text-emerald-400">{emailSavedNotice}</div>
                        )}
                      </div>
                    </div>

                    <div className={`${emailEditorMobilePane === 'edit' ? 'hidden md:block' : ''} space-y-2`}>
                      <div className="font-bold">Aperçu en direct (Police : {emailDraft.font}) :</div>
                      <div
                        style={{ fontFamily: emailDraft.font }}
                        className="p-4 rounded-xl bg-white text-slate-900 border border-slate-300 space-y-3"
                      >
                        <div className="text-[10px] text-slate-500 border-b pb-1">
                          Objet : <strong>{emailDraft.subject}</strong>
                        </div>
                        <h4 className="text-sm font-extrabold text-violet-700">{emailDraft.heading}</h4>
                        <p className="text-xs text-slate-700">{emailDraft.bodyText}</p>
                        <div>
                          <a
                            href={emailDraft.ctaUrl}
                            onClick={(e) => e.preventDefault()}
                            className="inline-block px-4 py-2 rounded-lg bg-violet-600 text-white font-bold text-xs"
                          >
                            {emailDraft.ctaLabel}
                          </a>
                        </div>
                        <div className="text-[10px] text-slate-400 border-t pt-2">
                          {emailDraft.footerText}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {commSubTab === 'campaigns' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Assistant Email 4 étapes (RSP-02 corrigé) */}
                  <div className="cf-card p-4 space-y-3">
                    <h3 className="text-sm font-extrabold">
                      Assistant Campagne Email (4 étapes CM-01 · Mobile sticky RSP-02)
                    </h3>
                    <div className="grid grid-cols-4 gap-1 text-[11px] font-bold text-center">
                      {(['1. Cibler', '2. Composer', '3. Objet', '4. Vérifier'] as const).map((lbl, idx) => (
                        <button
                          key={lbl}
                          type="button"
                          onClick={() => setEmailStep((idx + 1) as 1 | 2 | 3 | 4)}
                          className={`py-1.5 rounded-lg cursor-pointer ${
                            emailStep === idx + 1 ? 'bg-violet-600 text-white' : 'bg-slate-900 text-slate-400'
                          }`}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
                      {emailStep === 1 && 'Étape 1 (observée) : choix segments facultatifs + 12 statuts + exclusion refus/vacances.'}
                      {emailStep === 2 && 'Étape 2 (recette fictive) : sélection modèle 12 blocs + personnalisation.'}
                      {emailStep === 3 && 'Étape 3 (recette fictive) : objet dynamique + adresse expéditeur club.'}
                      {emailStep === 4 && 'Étape 4 : validation finale par code email et bilan 4 compteurs (Envoyés/Délivrés/Ouverts/Cliqués).'}
                    </div>
                    <div className="flex justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setEmailStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : 1))}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs font-bold cursor-pointer"
                      >
                        Précédent
                      </button>
                      <button
                        type="button"
                        onClick={() => setEmailStep((s) => (s < 4 ? ((s + 1) as 1 | 2 | 3 | 4) : 4))}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                      >
                        Suivant (visible à 390 px)
                      </button>
                    </div>
                  </div>

                  {/* Campagne SMS sans crash RSP-03 + calculateur SMS-01 */}
                  <div className="cf-card p-4 space-y-3">
                    <h3 className="text-sm font-extrabold">
                      Campagne SMS (12 statuts · STOP auto · Calculateur SMS-01 · Sans crash RSP-03)
                    </h3>
                    <textarea
                      rows={3}
                      value={smsDraftText}
                      onChange={(e) => setSmsDraftText(e.target.value)}
                      aria-label="Message campagne SMS"
                      className="w-full rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-xs"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                      <span>
                        Encodage : <strong>{smsMetrics.encoding}</strong> ({smsMetrics.charCount} car. / {smsMetrics.maxPerSms})
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold">
                        {smsMetrics.segmentsCount} crédit(s) SMS/destinataire
                      </span>
                    </div>
                    <div className="text-[11px] cf-muted">
                      12 statuts ciblage : {LEAD_TARGETING_STATUSES.join(', ')} · Clients en vacances &amp; refus STOP exclus automatiquement.
                    </div>
                  </div>
                </div>
              )}

              {commSubTab === 'utm' && (
                <div className="cf-card p-4 space-y-3 text-xs">
                  <h3 className="text-sm font-extrabold">Campagnes UTM (`/utm_campaign`)</h3>
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
                          <td className="py-2 pr-3 font-mono">38 (Fictif)</td>
                          <td className="py-2 pr-3 font-mono">14</td>
                          <td className="py-2 font-mono text-emerald-400 font-bold">36,8 %</td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-3 font-bold">google_local_carre_de_soie</td>
                          <td className="py-2 pr-3">2026-10-15</td>
                          <td className="py-2 pr-3 font-mono">52 (Fictif)</td>
                          <td className="py-2 pr-3 font-mono">18</td>
                          <td className="py-2 font-mono text-emerald-400 font-bold">34,6 %</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {commSubTab === 'scenarios' && (
                <div className="cf-card p-4 space-y-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-extrabold flex items-center gap-2">
                      <GitBranch className="w-4 h-4 text-emerald-400" />
                      Scénarios Automatique / Manuel · Étapes SC-01 / SC-02 &amp; Verrouillage
                    </h3>
                    <div className="flex gap-1.5">
                      {(['Actif', 'Verrouillé', 'Inactif'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setScenarioState(st)}
                          className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                            scenarioState === st ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                    <label>
                      Mode d&apos;entrée
                      <select
                        value={scenarioMode}
                        onChange={(e) => setScenarioMode(e.target.value as 'Automatique' | 'Manuel')}
                        className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700"
                      >
                        <option value="Automatique">Automatique (Source + Commercial)</option>
                        <option value="Manuel">Manuel (Conditions source masquées)</option>
                      </select>
                    </label>
                    <label>
                      Délai nouvelle étape (SC-02)
                      <input
                        type="number"
                        min={1}
                        value={scenarioStepDelay}
                        onChange={(e) => setScenarioStepDelay(Number(e.target.value) || 1)}
                        className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700"
                      />
                    </label>
                    <label>
                      Unité de délai (SC-02)
                      <select
                        value={scenarioStepUnit}
                        onChange={(e) =>
                          setScenarioStepUnit(e.target.value as 'Minutes' | 'Heures' | 'Jours')
                        }
                        className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700"
                      >
                        <option value="Minutes">Minutes</option>
                        <option value="Heures">Heures</option>
                        <option value="Jours">Jours</option>
                      </select>
                    </label>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800">
                    État actuel : <strong>{scenarioState}</strong>{' '}
                    {scenarioState === 'Verrouillé' &&
                      '— Aucune nouvelle entrée autorisée, les contacts déjà engagés terminent leur parcours.'}
                    {' · '}Étape existante (SC-01) : type et délai grisés en édition, contenu email éditable séparément.
                  </div>
                </div>
              )}

              {commSubTab === 'logs' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="cf-card p-4 space-y-2">
                    <h3 className="text-sm font-extrabold">SMS envoyés (`/sms`)</h3>
                    <div className="flex flex-wrap gap-1">
                      {['Tous', 'À envoyer', 'Envoyé', 'Pas assez de crédit', 'Erreur'].map((s) => (
                        <span key={s} className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">{s}</span>
                      ))}
                    </div>
                    <p className="cf-muted">EX15 : motif d&apos;erreur prestataire ou retour STOP tracé sur ligne dédiée.</p>
                  </div>
                  <div className="cf-card p-4 space-y-2">
                    <h3 className="text-sm font-extrabold">Emails échangés (`/email`)</h3>
                    <div className="flex flex-wrap gap-1">
                      {['Tous', 'À envoyer', 'Envoyé', 'Erreur', 'Reçu', 'En cours d\'envoi'].map((s) => (
                        <span key={s} className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">{s}</span>
                      ))}
                    </div>
                    <p className="cf-muted">Export CSV / Excel contrôlé par rôle et journalisé.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* ONGLET 7 : STATISTIQUES (8 VUES), VENTES & FORMULAIRES            */}
          {/* ================================================================= */}
          {activeTab === 'analytics_forms' && (
            <div className="space-y-4">
              <div className="cf-card p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAnalyticsSubTab('stats')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                      analyticsSubTab === 'stats' ? 'bg-violet-600 text-white' : 'bg-slate-900 text-slate-300'
                    }`}
                  >
                    Statistiques (8 vues)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnalyticsSubTab('sales')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                      analyticsSubTab === 'sales' ? 'bg-violet-600 text-white' : 'bg-slate-900 text-slate-300'
                    }`}
                  >
                    Ventes (Fin abonnement)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnalyticsSubTab('forms')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                      analyticsSubTab === 'forms' ? 'bg-violet-600 text-white' : 'bg-slate-900 text-slate-300'
                    }`}
                  >
                    Formulaires (UI-01 &amp; ACL-01)
                  </button>
                </div>

                {simulatedRole === 'commercial' && analyticsSubTab === 'stats' && (
                  <span className="text-[11px] text-amber-300 font-semibold">
                    Accès Statistiques COMMERCIAL géré côté serveur (app-settings)
                  </span>
                )}
              </div>

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
                      const activeProspects = prospects.filter((p) => {
                        if (!multiClubCds && p.clubId === 'carre-de-soie') return false;
                        if (!multiClubBeynost && p.clubId === 'beynost') return false;
                        if (ignoreArchivedStats && p.stage === 'Perdu') return false;
                        return true;
                      });
                      const cdsCount = activeProspects.filter((p) => p.clubId === 'carre-de-soie').length;
                      const beyCount = activeProspects.filter((p) => p.clubId === 'beynost').length;
                      const convertedCount = activeProspects.filter((p) => p.stage === 'Adhérent').length;
                      const convPct = activeProspects.length
                        ? Math.round((convertedCount / activeProspects.length) * 100)
                        : 0;
                      return (
                        <div key={tbl.id} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                          <div className="flex items-center justify-between">
                            <strong className="text-emerald-300">
                              {tbl.group} · {tbl.tab}
                            </strong>
                            <span className="text-[10px] font-mono cf-muted">
                              Clubs: {(multiClubCds ? 1 : 0) + (multiClubBeynost ? 1 : 0)}
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
                              <div className="text-[9px] text-slate-400">Volume filtré</div>
                              <div className="font-bold text-white">{activeProspects.length}</div>
                            </div>
                            <div className="p-1.5 rounded bg-slate-950 border border-slate-800">
                              <div className="text-[9px] text-slate-400">CDS / BEY</div>
                              <div className="font-bold text-violet-300">{cdsCount} / {beyCount}</div>
                            </div>
                            <div className="p-1.5 rounded bg-slate-950 border border-slate-800">
                              <div className="text-[9px] text-slate-400">Transformation</div>
                              <div className="font-bold text-emerald-400">
                                {convertedCount} ({convPct}%)
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {analyticsSubTab === 'sales' && (
                <div className="cf-card p-4 space-y-2 text-xs">
                  <h3 className="text-sm font-extrabold">Ventes (`/sales`) — Filtre date sur fin d’abonnement</h3>
                  <p className="cf-muted">
                    Critère vérifié : <strong>Se termine après / Se termine avant</strong> (distinction explicite avec la date d’encaissement).
                  </p>
                </div>
              )}

              {analyticsSubTab === 'forms' && (
                <div className="cf-card p-4 space-y-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-extrabold">
                        Formulaires (`/forms`) — UI-01 corrigé &amp; ACL-01 appliqué
                      </h3>
                      <p className="cf-muted">
                        Colonne 1 renommée en « Nom du formulaire » · Bouton « Ajouter une section » empilé à 390 px (RSP-01).
                      </p>
                    </div>
                    {evaluateLeadModuleAccess(simulatedRole, 'form_write').allowed && (
                      <button
                        type="button"
                        onClick={() =>
                          setFormsList((prev) => [
                            ...prev,
                            {
                              id: `frm-${Date.now()}`,
                              name: 'Nouveau formulaire fictif',
                              clubId: clubFilter === 'beynost' ? 'beynost' : 'carre-de-soie',
                              responsesCount: 0,
                              createdAt: '2026-11-18',
                              published: false,
                              sections: 1,
                            },
                          ])
                        }
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold cursor-pointer"
                      >
                        + Ajouter un formulaire / une section
                      </button>
                    )}
                  </div>

                  {formAccessMessage && (
                    <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-200 font-semibold">
                      {formAccessMessage}
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="py-2 pr-3">Nom du formulaire (UI-01)</th>
                          <th className="py-2 pr-3">Club</th>
                          <th className="py-2 pr-3">Sections / Réponses</th>
                          <th className="py-2 pr-3">Statut</th>
                          <th className="py-2">Actions (ACL-01)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formsList.map((f) => {
                          const canDelete = evaluateLeadModuleAccess(simulatedRole, 'form_delete').allowed;
                          return (
                            <tr key={f.id} className="border-b border-slate-800/60">
                              <td className="py-2 pr-3 font-bold">{f.name}</td>
                              <td className="py-2 pr-3 font-mono">{f.clubId}</td>
                              <td className="py-2 pr-3">
                                {f.sections} section(s) · {f.responsesCount} réponse(s)
                              </td>
                              <td className="py-2 pr-3">{f.published ? 'Publié' : 'Brouillon'}</td>
                              <td className="py-2">
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
                                    Lecture seule (corbeille masquée)
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* ONGLET 8 : PARAMÈTRES CRM (14 RUBRIQUES) + 9 PARTENAIRES + WEBHOOK */}
          {/* ================================================================= */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              <div className="cf-card p-3 flex flex-wrap gap-1.5">
                {LEAD_SETTINGS_TABS_14.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSelectedSettingsTab(tab.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border ${
                      selectedSettingsTab === tab.id
                        ? 'bg-emerald-600 text-white border-emerald-400'
                        : 'bg-slate-900 border-slate-700 text-slate-300'
                    }`}
                  >
                    {tab.label}
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
                        <h3 className="text-sm font-extrabold">{activeSetting.label}</h3>
                        <p className="cf-muted">{activeSetting.summary}</p>
                      </div>
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700">
                        Route Lead : {activeSetting.path}
                      </span>
                    </div>
                  );
                })()}

                {selectedSettingsTab === 'club-profile' && (
                  <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                    <div className="font-bold text-emerald-300">
                      Profil du Club (Nom, Adresse, Couleurs &amp; Logo)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <label className="block">
                        <span className="text-[10px] cf-muted">Nom officiel du club</span>
                        <input
                          type="text"
                          value={clubProfileForm.name}
                          onChange={(e) => setClubProfileForm((p) => ({ ...p, name: e.target.value }))}
                          className="w-full mt-0.5 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] cf-muted">Adresse</span>
                        <input
                          type="text"
                          value={clubProfileForm.address}
                          onChange={(e) => setClubProfileForm((p) => ({ ...p, address: e.target.value }))}
                          className="w-full mt-0.5 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] cf-muted">Couleur principale</span>
                        <input
                          type="color"
                          value={clubProfileForm.primaryColor}
                          onChange={(e) => setClubProfileForm((p) => ({ ...p, primaryColor: e.target.value }))}
                          className="w-full mt-0.5 h-9 px-1 py-1 rounded bg-slate-950 border border-slate-700 cursor-pointer"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] cf-muted">Sigle / Logo</span>
                        <input
                          type="text"
                          maxLength={6}
                          value={clubProfileForm.logoBadge}
                          onChange={(e) => setClubProfileForm((p) => ({ ...p, logoBadge: e.target.value }))}
                          className="w-full mt-0.5 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700"
                        />
                      </label>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      {clubProfileSavedNotice ? (
                        <span className="text-[11px] font-bold text-emerald-400">{clubProfileSavedNotice}</span>
                      ) : (
                        <span className="text-[10px] cf-muted">Sauvegarde locale persistante après rechargement</span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            localStorage.setItem('cfos_lead_club_profile_v1', JSON.stringify(clubProfileForm));
                          } catch {
                            // ignore
                          }
                          setClubProfileSavedNotice('Profil du club enregistré.');
                          setTimeout(() => setClubProfileSavedNotice(null), 3500);
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer"
                      >
                        Enregistrer le profil
                      </button>
                    </div>
                  </div>
                )}

                {selectedSettingsTab === 'app-settings' && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={statsAllowedForCommercial}
                      onChange={(e) => setStatsAllowedForCommercial(e.target.checked)}
                    />
                    <span>Autoriser le rôle COMMERCIAL à consulter les Statistiques (app-settings)</span>
                  </label>
                )}

                {selectedSettingsTab === 'automation' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {LEAD_SERVICE_AUTOMATIONS_6.map((s) => (
                      <div key={s.id} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex justify-between items-center">
                        <div>
                          <div className="font-bold">
                            {s.event} ({s.channel})
                          </div>
                          <div className="text-[10px] cf-muted font-mono">
                            Variables : {s.variables.join(' · ')}
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold">
                          {s.activeByDefault ? 'Actif' : 'Inactif'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

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
                              {p.status}
                            </span>
                          </div>
                          <div className="text-[11px] cf-muted">{p.direction}</div>
                          <div className="text-[10px] text-slate-300">{p.note}</div>
                        </div>
                      ))}
                    </div>

                    {/* Testeur direct Webhook POST /api/lead/webhooks/clubEntry */}
                    <div className="p-3 rounded-xl bg-slate-950/70 border border-emerald-500/30 space-y-2">
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
                    </div>
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
    </div>,
    isTechnicalMode
  );
}
