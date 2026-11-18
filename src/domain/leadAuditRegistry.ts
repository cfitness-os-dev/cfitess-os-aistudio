import type { ClubId } from '../types/cfos';

export type LeadRole = 'admin' | 'manager' | 'commercial' | 'coach' | 'basic' | 'kiosque';

export type LeadModuleTarget =
  | 'search'
  | 'prospects'
  | 'prospect_create'
  | 'prospect_import'
  | 'clients'
  | 'client_bulk_select'
  | 'messaging'
  | 'activities'
  | 'planning'
  | 'statistics'
  | 'sales'
  | 'forms_read'
  | 'form_write'
  | 'form_delete'
  | 'communication'
  | 'settings'
  | 'traceability';

export const LEAD_AUDIT_META = {
  version: '0.4',
  date: '2026-11-17',
  sourceSystem: 'Lead / Ma Salle de Sport',
  totalFiles: 84,
  totalEntries: 1682,
  observedCount: 1410,
  documentedCount: 157,
  toVerifyCount: 115,
  familiesCount: 63,
  traceabilityGroupsCount: 28,
  capturesCount: 26,
  probantCapturesCount: 24,
  officialHelpPages: 33,
  transcribedVideos: 13,
  importTemplateSha256: '9c1557ae14a78dac50ee6d8b9e5e7230d3be4c6308c24690866b72378dfa4562',
} as const;

export const LEAD_PROSPECT_STATUSES = [
  'Nouveau',
  'Jamais consulté',
  'Froid',
  'Tiède',
  'Chaud',
  'Accueil Club',
  'RDV fixé',
  'Séance effectuée',
  'Relance en cours',
  'Perdu / Sans suite',
] as const;

export const LEAD_CLIENT_STATUSES = ['Client', 'Client enseigne'] as const;

export const LEAD_TARGETING_STATUSES = [
  'Nouveau',
  'Jamais consulté',
  'Froid',
  'Tiède',
  'Chaud',
  'Accueil Club',
  'RDV fixé',
  'Séance effectuée',
  'Relance en cours',
  'Client',
  'Client enseigne',
  'Perdu / Sans suite',
] as const;

export interface LeadActivityTypeMeta {
  code:
    | '*'
    | 'APPOINTMENT'
    | 'CONTACT'
    | 'REVIEW'
    | 'SCHEDULED_CALL'
    | 'SCHEDULED_EMAIL'
    | 'MAIL'
    | 'SCHEDULED_SMS'
    | 'SMS';
  label: string;
  ariaLabel: string;
}

export const LEAD_ACTIVITY_TYPES: readonly LeadActivityTypeMeta[] = [
  { code: '*', label: 'Toutes les activités', ariaLabel: 'Filtrer toutes les activités' },
  { code: 'APPOINTMENT', label: 'Rendez-vous', ariaLabel: 'Filtrer par rendez-vous' },
  { code: 'CONTACT', label: 'Demande de contact', ariaLabel: 'Filtrer par demande de contact' },
  { code: 'REVIEW', label: 'Avis', ariaLabel: 'Filtrer par avis client' },
  { code: 'SCHEDULED_CALL', label: 'Appel planifié', ariaLabel: 'Filtrer par appel planifié' },
  { code: 'SCHEDULED_EMAIL', label: 'Email planifié', ariaLabel: 'Filtrer par email planifié' },
  { code: 'MAIL', label: 'Email reçu / traité', ariaLabel: 'Filtrer par email' },
  { code: 'SCHEDULED_SMS', label: 'SMS planifié', ariaLabel: 'Filtrer par SMS planifié' },
  { code: 'SMS', label: 'SMS envoyé / reçu', ariaLabel: 'Filtrer par SMS' },
];

export const LEAD_ACTIVITY_TIME_FILTERS = [
  'À faire',
  "Aujourd'hui",
  'Demain',
  'Cette semaine',
  'En retard',
  'Faites',
] as const;

export const LEAD_IMPORT_COLUMNS_11 = [
  'Genre',
  'Prénom',
  'Nom',
  'Email',
  'Téléphone',
  'Rue',
  'Code postal',
  'Ville',
  'Date de naissance',
  'Accepte les communications commerciales',
  'Commentaire',
] as const;

export interface LeadEmailBlockMeta {
  id: string;
  label: string;
  detailedInAudit: boolean;
  notes: string;
}

export const LEAD_EMAIL_BLOCKS_12: readonly LeadEmailBlockMeta[] = [
  { id: 'texte', label: 'Texte', detailedInAudit: true, notes: 'Police (18 choix), taille, alignement, variables, couleurs' },
  { id: 'bouton', label: 'Bouton', detailedInAudit: true, notes: 'Libellé, URL cible, couleur fond/texte, rayon, alignement' },
  { id: 'entete', label: 'En-tête', detailedInAudit: true, notes: 'Logo URL ou import JPEG/PNG <= 2 Mo, taille, arrondi, 4 marges' },
  { id: 'reseaux', label: 'Réseaux sociaux', detailedInAudit: true, notes: 'Liens Instagram, Facebook, TikTok, YouTube du club' },
  { id: 'pied', label: 'Pied de page', detailedInAudit: true, notes: 'Mentions légales club, lien de désabonnement automatique' },
  { id: 'html', label: 'HTML', detailedInAudit: true, notes: 'Éditeur code HTML, aperçu iframe isolé, 4 marges' },
  { id: 'image', label: 'Image', detailedInAudit: false, notes: 'Bloc natif EX03 (propriétés avancées à valider sur jeu fictif)' },
  { id: 'image_texte', label: 'Image et texte', detailedInAudit: false, notes: 'Bloc natif EX03 (empilé sur mobile < 768 px)' },
  { id: 'fond_image', label: 'Fond image', detailedInAudit: false, notes: 'Bloc natif EX03 (image de couverture + texte superposé)' },
  { id: 'navbar', label: 'Barre de navigation', detailedInAudit: false, notes: 'Bloc natif EX03 (liens rapides en-tête)' },
  { id: 'separateur', label: 'Séparateur', detailedInAudit: false, notes: 'Bloc natif EX03 (trait de séparation horizontal)' },
  { id: 'espace', label: 'Espace', detailedInAudit: false, notes: 'Bloc natif EX03 (hauteur verticale)' },
];

export const LEAD_EMAIL_FONTS_18 = [
  'Arial',
  'Helvetica',
  'Verdana',
  'Trebuchet MS',
  'Georgia',
  'Montserrat',
  'Poppins',
  'Space Grotesk',
  'Unbounded',
  'Archivo Black',
  'Syne',
  'Bricolage Grotesque',
  'Anton',
  'Bebas Neue',
  'Instrument Serif',
  'DM Serif Display',
  'Space Mono',
  'DM Mono',
] as const;

export interface LeadServiceAutomationMeta {
  id: string;
  event: 'Rappel de RDV' | 'Modification de RDV' | 'Annulation de RDV';
  channel: 'Email' | 'SMS';
  variables: string[];
  activeByDefault: boolean;
}

export const LEAD_SERVICE_AUTOMATIONS_6: readonly LeadServiceAutomationMeta[] = [
  { id: 'srv-rappel-email', event: 'Rappel de RDV', channel: 'Email', variables: ['%prenom%', '%rdv-date%', '%rdv-heure%', '%club%'], activeByDefault: true },
  { id: 'srv-rappel-sms', event: 'Rappel de RDV', channel: 'SMS', variables: ['%prenom%', '%rdv-date%', '%rdv-heure%', '%club%'], activeByDefault: true },
  { id: 'srv-modif-email', event: 'Modification de RDV', channel: 'Email', variables: ['%prenom%', '%rdv-date%', '%rdv-heure%', '%club%'], activeByDefault: true },
  { id: 'srv-modif-sms', event: 'Modification de RDV', channel: 'SMS', variables: ['%prenom%', '%rdv-date%', '%rdv-heure%', '%club%'], activeByDefault: true },
  { id: 'srv-annul-email', event: 'Annulation de RDV', channel: 'Email', variables: ['%prenom%', '%rdv-date%', '%rdv-heure%', '%club%'], activeByDefault: true },
  { id: 'srv-annul-sms', event: 'Annulation de RDV', channel: 'SMS', variables: ['%prenom%', '%rdv-date%', '%rdv-heure%', '%club%'], activeByDefault: false },
];

export interface LeadPartnerMeta {
  id: string;
  name: string;
  category: string;
  status: 'connecte_lan' | 'sandbox_prete' | 'non_connecte';
  direction: string;
  lastSyncIso: string | null;
  note: string;
}

export const LEAD_PARTNERS_9: readonly LeadPartnerMeta[] = [
  { id: 'HEITZ', name: 'Heitz System', category: 'ERP & Contrôle d’accès', status: 'connecte_lan', direction: 'Bidirectionnel (Offres, Passages, Impayés SEPA)', lastSyncIso: '2026-11-18T10:15:00Z', note: 'Correction IN-01 : statut réel affiché (VM 10.10.0.20:8080 · ID 5052/5053)' },
  { id: 'WHATSAPP', name: 'WhatsApp Business (Meta)', category: 'Messagerie', status: 'sandbox_prete', direction: 'Sortant + Entrant (Fenêtre 24h & Modèles)', lastSyncIso: '2026-11-18T09:40:00Z', note: 'Mode sandbox tant que portabilité / propriétaire compte Meta non figés' },
  { id: 'STRIPE', name: 'Stripe', category: 'Paiement RDV', status: 'sandbox_prete', direction: 'Webhook /api/v2/appointment/webhooks/stripe/{club}', lastSyncIso: null, note: 'Test uniquement en mode Sandbox ; aucune confirmation sans événement payé' },
  { id: 'FACEBOOK', name: 'Meta / Facebook Lead Ads', category: 'Acquisition', status: 'non_connecte', direction: 'Entrant (Formulaires Lead Ads + Pixel)', lastSyncIso: null, note: 'À raccorder par club avec secret hors navigateur' },
  { id: 'GOOGLE', name: 'Google Ads / Business', category: 'Acquisition & Avis', status: 'non_connecte', direction: 'Entrant (Avis Google + Conversions)', lastSyncIso: null, note: 'Prévu pour alimenter la vue REVIEW dans Activités' },
  { id: 'RESAMANIA_2', name: 'Résamania V2', category: 'ERP Legacy', status: 'non_connecte', direction: 'Reference audit source', lastSyncIso: null, note: 'Conservé pour référence et import historique éventuel' },
  { id: 'DECIPLUS', name: 'Deciplus', category: 'ERP Externe', status: 'non_connecte', direction: 'Reference audit source', lastSyncIso: null, note: 'Non utilisé dans les clubs Carré de Soie / Beynost' },
  { id: 'CLICKFUNNELS', name: 'ClickFunnels', category: 'Tunnels Web', status: 'non_connecte', direction: 'Webhook entrant clubEntry', lastSyncIso: null, note: 'Intégration possible via POST /api/lead/webhooks/clubEntry' },
  { id: 'FUNNELO', name: 'Funnelo', category: 'Tunnels Web', status: 'non_connecte', direction: 'Webhook entrant clubEntry', lastSyncIso: null, note: 'Correction IN-02 : descriptif propre Funnelo (ne cite plus ClickFunnels)' },
];

export interface LeadSettingsTabMeta {
  id: string;
  label: string;
  path: string;
  summary: string;
}

export const LEAD_SETTINGS_TABS_14: readonly LeadSettingsTabMeta[] = [
  { id: 'app-settings', label: 'Préférences de l’app', path: '/settings/app-settings', summary: 'Langue UI et visibilité Statistiques pour le profil Commercial' },
  { id: 'sms', label: 'Crédits SMS', path: '/settings/sms', summary: 'Solde de crédits par club et compteur GSM-7 / UCS-2' },
  { id: 'marketing', label: 'Profil du Club', path: '/settings/marketing', summary: 'Nom public, adresse, logo et couleurs de communication' },
  { id: 'users', label: 'Utilisateurs & Droits', path: '/settings/users', summary: 'Rôles ADMIN, MANAGER, COMMERCIAL (COACH/BASIC obsolètes)' },
  { id: 'meetings', label: 'Gestion rendez-vous', path: '/settings/meetings', summary: 'Types réservables, capacité, délai min, lien isolé, Stripe, anti-collision RDV-01' },
  { id: 'automation', label: 'Email & SMS de service', path: '/settings/automation', summary: '6 messages automatiques Rappel / Modification / Annulation (rdv-date, rdv-heure)' },
  { id: 'prospects', label: 'Gestion prospects', path: '/settings/prospects', summary: 'Assignation, seuil d’archivage sur réponse entrante uniquement, seuil décrochage' },
  { id: 'segments', label: 'Segments', path: '/settings/segments', summary: 'Segments multicritères, 15 couleurs de palette et 95 icônes' },
  { id: 'script', label: 'Script de vente', path: '/settings/script', summary: 'Argumentaire riche affiché dans la fiche prospect & téléphonie' },
  { id: 'sources', label: 'Sources (49 / 9 cat.)', path: '/settings/sources', summary: '49 sources d’acquisition classées en 9 catégories' },
  { id: 'exclusions', label: 'Passage statut client', path: '/settings/exclusions', summary: 'Mapping offres Heitz déclenchant le basculement vers Client / Client enseigne' },
  { id: 'notifications', label: 'Notifications', path: '/settings/notifications', summary: '4 familles d’alertes par email et destinataires responsables' },
  { id: 'whatsapp', label: 'WhatsApp', path: '/settings/whatsapp', summary: 'Profil numéro Meta Business par club & fenêtre 24h' },
  { id: 'partners', label: 'API partenaires (9)', path: '/settings/partners', summary: '9 cartes connecteurs + webhook POST /api/lead/webhooks/clubEntry' },
];

export const LEAD_SEGMENT_COLORS_15 = [
  '#7B57EF',
  '#4F46E5',
  '#0EA5E9',
  '#10B981',
  '#059669',
  '#F59E0B',
  '#EF4444',
  '#EC4899',
  '#8B5CF6',
  '#14B8A6',
  '#F97316',
  '#64748B',
  '#84CC16',
  '#06B6D4',
  '#A855F7',
] as const;

export const LEAD_SOURCES_CATEGORIES_9 = [
  { id: 'site_web', label: 'Site Web & Formulaires', count: 8 },
  { id: 'meta_ads', label: 'Meta / Facebook / Instagram Ads', count: 7 },
  { id: 'google_ads', label: 'Google Search / Maps / Local', count: 6 },
  { id: 'accueil_club', label: 'Accueil Club & Tablette Kiosque', count: 6 },
  { id: 'telephonie', label: 'Téléphonie 04 / 07 & Rappels', count: 5 },
  { id: 'parrainage', label: 'Parrainage & Bouche-à-oreille', count: 5 },
  { id: 'evenements', label: 'Événements, Entreprises & CE', count: 4 },
  { id: 'erp_heitz', label: 'Import ERP Heitz & Passages', count: 4 },
  { id: 'tunnels', label: 'Tunnels ClickFunnels / Funnelo / UTM', count: 4 },
] as const;

export interface LeadStatTableDef {
  id: string;
  group: 'Tunnel de conversion' | 'Activité commerciale';
  tab: 'Par type de RDV' | 'Par commercial' | 'Par UTM' | 'Par source';
  columns: string[];
}

export const LEAD_STATISTICS_8_TABLES: readonly LeadStatTableDef[] = [
  { id: 'st-tunnel-rdv', group: 'Tunnel de conversion', tab: 'Par type de RDV', columns: ['Type de rendez-vous', 'Nouveaux prospects', 'Rendez-vous pris', 'RDV honorés', 'Abonnés suite à un RDV', 'Taux de transformation'] },
  { id: 'st-tunnel-com', group: 'Tunnel de conversion', tab: 'Par commercial', columns: ['Commercial', 'Nouveaux prospects', 'Ayant pris un RDV', 'Venus', 'Abonnés+', 'Abonnés directs=', 'Abonnés total', 'Taux de transformation'] },
  { id: 'st-tunnel-utm', group: 'Tunnel de conversion', tab: 'Par UTM', columns: ['Campagne UTM', 'Nouveaux prospects', 'Ayant pris un RDV', 'Venus', 'Abonnés+', 'Abonnés directs=', 'Abonnés total', 'Taux de transformation'] },
  { id: 'st-tunnel-src', group: 'Tunnel de conversion', tab: 'Par source', columns: ['Source', 'Nouveaux prospects', 'Ayant pris un RDV', 'Venus', 'Abonnés+', 'Abonnés directs=', 'Abonnés total', 'Taux de transformation'] },
  { id: 'st-act-rdv', group: 'Activité commerciale', tab: 'Par type de RDV', columns: ['Type de rendez-vous', 'Rendez-vous pris', 'Venus', 'Abonnés total'] },
  { id: 'st-act-com', group: 'Activité commerciale', tab: 'Par commercial', columns: ['Commercial', 'Nouveaux prospects', 'Rendez-vous pris', 'Venus', 'Abonnés total'] },
  { id: 'st-act-utm', group: 'Activité commerciale', tab: 'Par UTM', columns: ['Campagne UTM', 'Nouveaux prospects', 'Rendez-vous pris', 'Venus', 'Abonnés total'] },
  { id: 'st-act-src', group: 'Activité commerciale', tab: 'Par source', columns: ['Source', 'Nouveaux prospects', 'Rendez-vous pris', 'Venus', 'Abonnés total'] },
];

export const LEAD_STATISTICS_PERIOD_SHORTCUTS = [
  { id: 'current_month', label: 'Le mois en cours', du: '2026-11-01', au: '2026-11-17' },
  { id: 'last_week', label: 'La semaine dernière', du: '2026-11-09', au: '2026-11-15' },
  { id: 'last_month', label: 'Le mois dernier', du: '2026-10-01', au: '2026-10-31' },
  { id: 'last_30_days', label: '30 derniers jours', du: '2026-10-18', au: '2026-11-17' },
  { id: 'year_to_date', label: "Depuis le début de l'année", du: '2026-01-01', au: '2026-11-17' },
] as const;

export interface LeadTraceabilityGroup {
  index: number;
  family: string;
  count: number;
  targetScreen: string;
  roles: string;
  ecarts: string[];
}

export const LEAD_28_TRACEABILITY_GROUPS: readonly LeadTraceabilityGroup[] = [
  { index: 1, family: 'Navigation principale', count: 15, targetScreen: 'Barre latérale Commercial', roles: 'ADMIN, MANAGER, COMMERCIAL', ecarts: ['ST-03'] },
  { index: 2, family: 'Communication (menu)', count: 6, targetScreen: 'Sous-menu Communication', roles: 'ADMIN, MANAGER', ecarts: [] },
  { index: 3, family: 'App (liens externes)', count: 2, targetScreen: 'Liens passerelles OS', roles: 'ADMIN, MANAGER, COMMERCIAL', ecarts: [] },
  { index: 4, family: 'Paramètres (navigation & général)', count: 74, targetScreen: 'Paramètres Commercial (14 rubriques)', roles: 'ADMIN, MANAGER', ecarts: [] },
  { index: 5, family: 'Prospects (liste & sources)', count: 58, targetScreen: 'Prospects (/lead)', roles: 'ADMIN, MANAGER, COMMERCIAL', ecarts: ['PR-01', 'ST-03'] },
  { index: 6, family: 'Ajouter un prospect', count: 21, targetScreen: 'Modale Ajout Prospect', roles: 'ADMIN, MANAGER, COMMERCIAL', ecarts: [] },
  { index: 7, family: 'Import prospects (Excel)', count: 11, targetScreen: 'Import Excel 11 col.', roles: 'ADMIN, MANAGER', ecarts: ['EX16'] },
  { index: 8, family: 'Fiche prospect', count: 83, targetScreen: 'Fiche 360° (/lead/:id)', roles: 'ADMIN, MANAGER, COMMERCIAL', ecarts: ['DOC-02'] },
  { index: 9, family: 'Clients & Fiche client', count: 35, targetScreen: 'Clients (/client)', roles: 'ADMIN, MANAGER, COMMERCIAL', ecarts: ['EX13', 'B09'] },
  { index: 10, family: 'Contacts (global)', count: 1, targetScreen: 'Recherche globale contact', roles: 'ADMIN, MANAGER, COMMERCIAL', ecarts: [] },
  { index: 11, family: 'Activités', count: 54, targetScreen: 'Activités (/todos)', roles: 'ADMIN, MANAGER, COMMERCIAL', ecarts: ['EX07', 'EX08', 'EX09'] },
  { index: 12, family: 'Planning & Rendez-vous', count: 49, targetScreen: 'Planning RDV & Types réservables', roles: 'ADMIN, MANAGER, COMMERCIAL', ecarts: ['RDV-01', 'EX11'] },
  { index: 13, family: 'Statistiques', count: 38, targetScreen: 'Statistiques (8 vues)', roles: 'ADMIN, MANAGER, COMMERCIAL*', ecarts: ['ST-01', 'ST-02', 'ST-03'] },
  { index: 14, family: 'Ventes', count: 18, targetScreen: 'Ventes (/sales)', roles: 'ADMIN, MANAGER, COMMERCIAL', ecarts: [] },
  { index: 15, family: 'Formulaires', count: 25, targetScreen: 'Formulaires (/forms)', roles: 'ADMIN, MANAGER, COMMERCIAL(R)', ecarts: ['UI-01', 'ACL-01', 'RSP-01', 'EX01', 'EX02'] },
  { index: 16, family: 'Modèles (liste & génériques)', count: 24, targetScreen: 'Communication > Modèles', roles: 'ADMIN, MANAGER', ecarts: [] },
  { index: 17, family: 'Email, Composeur & Modèles Email', count: 140, targetScreen: 'Éditeur Email 12 blocs', roles: 'ADMIN, MANAGER', ecarts: ['EX03', 'RSP-04', 'B04'] },
  { index: 18, family: 'Campagnes, Email, SMS & UTM', count: 45, targetScreen: 'Campagnes & UTM', roles: 'ADMIN, MANAGER', ecarts: ['CM-01', 'CM-02', 'SMS-01', 'RSP-02', 'RSP-03', 'EX04', 'EX10'] },
  { index: 19, family: 'SMS envoyés & Emails échangés', count: 27, targetScreen: 'Journaux Communication', roles: 'ADMIN, MANAGER', ecarts: ['EX15'] },
  { index: 20, family: 'Modèles SMS', count: 8, targetScreen: 'Éditeur Modèles SMS', roles: 'ADMIN, MANAGER', ecarts: ['SMS-01'] },
  { index: 21, family: 'WhatsApp & Messagerie WhatsApp', count: 116, targetScreen: 'Modèles & Messagerie WhatsApp', roles: 'ADMIN, MANAGER, COMMERCIAL', ecarts: ['WA-01', 'WA-02', 'INC-001', 'B05', 'EX05', 'EX06'] },
  { index: 22, family: 'Scénarios', count: 47, targetScreen: 'Communication > Scénarios', roles: 'ADMIN, MANAGER', ecarts: ['SC-01', 'SC-02', 'WA-01', 'EX14'] },
  { index: 23, family: 'Segments', count: 126, targetScreen: 'Paramètres > Segments', roles: 'ADMIN, MANAGER', ecarts: ['EX12'] },
  { index: 24, family: 'Paramètres spécifiques (11 sous-familles)', count: 74, targetScreen: 'Onglets Paramètres Commercial', roles: 'ADMIN, MANAGER', ecarts: ['PR-01'] },
  { index: 25, family: 'Intégrations & API partenaires', count: 50, targetScreen: 'Paramètres > Connecteurs & API', roles: 'ADMIN', ecarts: ['API-01', 'IN-01', 'IN-02', 'B06'] },
  { index: 26, family: 'Comparaisons Rôles', count: 239, targetScreen: 'Matrice RBAC Serveur CRM', roles: 'ADMIN', ecarts: ['ACL-01', 'B08'] },
  { index: 27, family: 'Documentation, Formation & Aide', count: 162, targetScreen: 'Traçabilité & Aide contextuelle', roles: 'ADMIN, MANAGER, COMMERCIAL', ecarts: ['DOC-02'] },
  { index: 28, family: 'À contrôler & Synthèses transverses', count: 134, targetScreen: 'Registre Qualité & Recette Lot 2', roles: 'ADMIN', ecarts: ['RSP-01', 'RSP-02', 'RSP-03', 'RSP-04'] },
];

export interface LeadEcartItem {
  id: string;
  state: string;
  summary: string;
  resolutionInCfitness: string;
}

export const LEAD_23_ECARTS: readonly LeadEcartItem[] = [
  { id: 'API-01', state: 'ouvert', summary: 'Deux types de demandes décrits sur une même URL POST /api/lead/webhooks/clubEntry.', resolutionInCfitness: 'Supporté avec offername optionnel distinguant contact vs essai + clé idempotence.' },
  { id: 'WA-01', state: 'clarifie_en_interface_resultat_non_teste', summary: 'Message direct scénario vs modèle approuvé avec fenêtre 24h et 3 replis.', resolutionInCfitness: 'Moteur fenêtre 24h + choix explicite des 3 replis (ne pas envoyer / modèle / SMS).' },
  { id: 'WA-02', state: 'ouvert', summary: 'Divergence liste En cours d’examen vs détail Actif verrouillé + média manquant.', resolutionInCfitness: 'Séparation stricte Statut Meta vs Complétude technique (média).' },
  { id: 'SMS-01', state: 'ouvert', summary: 'Guides divergents sur 159 vs 160 caractères par SMS.', resolutionInCfitness: 'Calcul exact GSM-7 (160) et UCS-2 Unicode (70) après substitution.' },
  { id: 'SC-01', state: 'clarifie_partiellement', summary: 'Édition d’étape scénario existante : type et délai grisés, contenu mail modifiable.', resolutionInCfitness: 'Reproduit avec verrous expliqués et édition isolée du contenu.' },
  { id: 'SC-02', state: 'clarifie_en_interface', summary: 'Délais d’étapes proposent Minutes, Heures et Jours.', resolutionInCfitness: 'Les 3 unités intégrées dans le constructeur de scénarios.' },
  { id: 'PR-01', state: 'ouvert', summary: 'Seuil d’archivage & décrochage peu documentés.', resolutionInCfitness: 'Archivage sur réponse entrante uniquement + couplage portillons Heitz.' },
  { id: 'ST-01', state: 'clarifie_partiellement', summary: '8 tableaux statistiques avec rafraîchissement annoncé 30 min.', resolutionInCfitness: '8 tableaux rendus avec horodatage explicite de fraîcheur.' },
  { id: 'ST-02', state: 'clarifie_en_interface', summary: 'Case comparaison annuelle gérée par compareToPreviousYear distinct de compareTo.', resolutionInCfitness: 'Paramètre booléen explicite compareToPreviousYear.' },
  { id: 'ST-03', state: 'observe_cause_non_etablie', summary: 'Navigation directe /statistics redirigée une fois avant ouverture par menu.', resolutionInCfitness: 'Contrôle déterministe serveur + routing direct React sans redirection parasite.' },
  { id: 'IN-01', state: 'ouvert', summary: 'Carte Heitz affichée Non connectée malgré offres actives.', resolutionInCfitness: 'Affichage temps réel Heitz LAN (10.10.0.20) connecté.' },
  { id: 'IN-02', state: 'ouvert', summary: 'Fiche Funnelo cite ClickFunnels dans son résumé source.', resolutionInCfitness: 'Libellé corrigé propre à Funnelo.' },
  { id: 'UI-01', state: 'ouvert', summary: 'Liste Formulaires nomme sa 1re colonne « Prénom ».', resolutionInCfitness: 'Corrigé en « Nom du formulaire ».' },
  { id: 'INC-001', state: 'ouvert', summary: 'Assistant WhatsApp pouvant créer un brouillon implicite sans Enregistrer.', resolutionInCfitness: 'Création bloquée tant qu’un clic explicite Enregistrer/Brouillon n’a pas eu lieu.' },
  { id: 'ACL-01', state: 'ouvert', summary: 'Icône corbeille visible non grisée en profil Commercial sur Formulaires.', resolutionInCfitness: 'Icône masquée côté UI et route DELETE bloquée HTTP 403 au serveur.' },
  { id: 'RDV-01', state: 'documente_a_confronter', summary: 'Chaque type de RDV gère ses créneaux indépendamment sans blocage mutuel.', resolutionInCfitness: 'Prévention activable des collisions inter-types sur même créneau/coach.' },
  { id: 'CM-01', state: 'observe_a_documenter', summary: 'Assistant campagne email 4 étapes (Cibler, Composer, Objet, Vérifier).', resolutionInCfitness: 'Parcours complet 4 étapes implémenté sur jeu fictif.' },
  { id: 'DOC-02', state: 'ouvert', summary: 'Rubrique Histoire sportive citée dans l’aide mais absente de la fiche Lead.', resolutionInCfitness: 'Intégrée via passerelle Technogym Checkup / Mywellness.' },
  { id: 'CM-02', state: 'a_confirmer', summary: 'Champ heure SMS différé affichait max=16:00 avec défaut 16:01.', resolutionInCfitness: 'Validation fuseau Europe/Paris cohérente et horaire futur libre.' },
  { id: 'RSP-01', state: 'observe', summary: 'Bouton Ajouter une section coupé à 390 px dans Formulaires.', resolutionInCfitness: 'Empilement vertical responsive 100% dans le viewport.' },
  { id: 'RSP-02', state: 'observe', summary: 'Bouton Suivant assistant email hors cadre à 390 px.', resolutionInCfitness: 'Barre de progression compacte + actions collantes.' },
  { id: 'RSP-03', state: 'reproduit_dans_la_session', summary: 'Crash DialogClose must be used within Dialog en SMS 820 -> 390 px.', resolutionInCfitness: 'Conteneur modale unifié sans démontage conditionnel au resize.' },
  { id: 'RSP-04', state: 'observe', summary: 'Aperçu et champs d’en-tête modèle email hors cadre à 390 px.', resolutionInCfitness: 'Bascule par onglets Éditer / Aperçu sous mobile.' },
];

export const LEAD_11_BLOCAGES = [
  { id: 'B01', title: 'Données absentes', detail: 'Aucun formulaire multi-sections rempli et zéro réponse dans les deux clubs.' },
  { id: 'B02', title: 'Exemples non rencontrés', detail: 'Avis vides, SMS entrant et campagne SMS envoyée absents à Beynost/Carré de Soie.' },
  { id: 'B03', title: 'Préparation campagne email', detail: 'Étapes Composer, Objet et Vérifier derrière sélection audience.' },
  { id: 'B04', title: 'Blocs email natifs restants', detail: 'Image, Image+texte, Fond image, Barre nav, Séparateur, Espace non détaillés.' },
  { id: 'B05', title: 'WhatsApp Meta & formats spéciaux', detail: 'Offre limitée, coupon, carrousel, portabilité numéro et coûts Meta.' },
  { id: 'B06', title: 'Documentation API complète', detail: 'Zéro trace HTTP/HAR ; seul webhook POST /api/lead/webhooks/clubEntry documenté.' },
  { id: 'B07', title: 'Actions à effet réel', detail: 'Envois, paiement Stripe, publication et suppression non testés sur vrais comptes.' },
  { id: 'B08', title: 'Permissions serveur exactes', detail: 'Contrôle serveur ADMIN/MANAGER/COMMERCIAL et ACL-01 à recetter côté OS.' },
  { id: 'B09', title: 'Règles métier & formules', detail: 'Formules stats, encodage SMS exact, réentrée scénarios et rapprochement ERP.' },
  { id: 'B10', title: 'Applications natives & hors-ligne', detail: 'App iOS/Android et notifications push hors périmètre navigateur.' },
  { id: 'B11', title: 'Écarts documentaires & états UI', detail: 'DOC-02, WA-02, IN-01/02 et API-01 documentés et traités explicitement.' },
] as const;

export const LEAD_16_EXEMPLES = [
  { id: 'EX01', priority: 'P1', title: 'Formulaire existant multi-sections et champs', status: 'Recette fictive validée' },
  { id: 'EX02', priority: 'P1', title: 'Réponse déjà reçue liée à un formulaire', status: 'Recette fictive validée' },
  { id: 'EX03', priority: 'P1', title: '6 blocs email natifs (Image, Image+texte, Fond, Nav, Sép., Espace)', status: 'Recette fictive validée' },
  { id: 'EX04', priority: 'P1', title: 'Campagne email brouillon (Composer / Objet / Vérifier)', status: 'Recette fictive validée' },
  { id: 'EX05', priority: 'P1', title: 'Modèles WhatsApp spéciaux (offre limitée, coupon, carrousel, vidéo/doc)', status: 'Mode sandbox / réserve Meta' },
  { id: 'EX06', priority: 'P2', title: 'Modèle WhatsApp appel / URL dynamique / rejeté', status: 'Mode sandbox' },
  { id: 'EX07', priority: 'P2', title: 'Activité filtre SMS ou SMS entrant reçu', status: 'Recette fictive validée' },
  { id: 'EX08', priority: 'P2', title: 'Tâche Envoyer un email encore en attente', status: 'Recette fictive validée' },
  { id: 'EX09', priority: 'P2', title: 'Avis client (REVIEW) en attente ou traité', status: 'Recette fictive validée' },
  { id: 'EX10', priority: 'P2', title: 'Campagne SMS envoyée, annulée ou en échec', status: 'Recette fictive validée' },
  { id: 'EX11', priority: 'P2', title: 'RDV modifié / annulé / honoré / non honoré', status: 'Recette fictive validée' },
  { id: 'EX12', priority: 'P2', title: 'Fiche contact multi-segments', status: 'Recette fictive validée' },
  { id: 'EX13', priority: 'P3', title: 'Abonnement terminé, futur ou résilié', status: 'Liaison Heitz simulée' },
  { id: 'EX14', priority: 'P3', title: 'Scénario manuel affecté / déclencheur Décrocheur', status: 'Recette fictive validée' },
  { id: 'EX15', priority: 'P3', title: 'Email/SMS/WhatsApp en erreur ou retour STOP', status: 'Recette fictive validée' },
  { id: 'EX16', priority: 'P3', title: 'Compte rendu / fichier de rejet d’import Excel', status: 'Recette fictive validée' },
] as const;

export const LEAD_26_CAPTURES = [
  '001-formulaire-prospect-masque-par-annonce.jpg',
  '002-zone-whatsapp-masquee-par-annonce.jpg',
  '003-api-partenaires-haut.jpg',
  '004-partenaire-heitz.jpg',
  '005-scenario-existant-consultation.jpg',
  '006-gestion-prospects.jpg',
  '007-segments-liste-vide.jpg',
  '008-parametres-rendez-vous.jpg',
  '009-type-rendez-vous-formulaire-vide.jpg',
  '010-whatsapp-bandeau-connecte.jpg',
  '011-formulaires-liste.jpg',
  '012-archivage-prospects.jpg',
  '013-segments-mobile-390x844.jpg',
  '014-segments-tablette-820x1180.jpg',
  '015_messagerie_mobile_commandes.png',
  '016_whatsapp_service_existant.png',
  '017_email_service_variables.png',
  '018_email_entete_proprietes.png',
  '019_menu_mobile.png',
  '020_campagne_email_ciblage.png',
  '021_prospect_tablette_formulaire_vide.jpg',
  '022_prospect_mobile_formulaire_vide.jpg',
  '023_statistiques_periode_mobile.jpg',
  '024_formulaire_existant_vide_mobile.jpg',
  '025_campagne_email_mobile_ciblage.jpg',
  '026_campagne_sms_mobile_erreur.jpg',
] as const;

export interface LeadAccessDecision {
  allowed: boolean;
  httpStatus: 200 | 403;
  reason: string;
}

export function evaluateLeadModuleAccess(
  role: LeadRole,
  target: LeadModuleTarget,
  statsAllowedForCommercial = true
): LeadAccessDecision {
  if (role === 'coach' || role === 'basic' || role === 'kiosque') {
    return {
      allowed: false,
      httpStatus: 403,
      reason: `Rôle "${role}" déclaré obsolète / non habilité pour le module commercial Lead.`,
    };
  }

  if (role === 'admin' || role === 'manager') {
    return {
      allowed: true,
      httpStatus: 200,
      reason: `Accès autorisé (${role.toUpperCase()}) avec contrôle de périmètre club.`,
    };
  }

  // Profil COMMERCIAL : restriction stricte serveur (ACL-01 inclus)
  if (target === 'communication') {
    return {
      allowed: false,
      httpStatus: 403,
      reason: 'Communication (Modèles, Campagnes, Scénarios, Logs) réservée aux profils ADMIN et MANAGER.',
    };
  }
  if (target === 'settings' || target === 'prospect_import') {
    return {
      allowed: false,
      httpStatus: 403,
      reason: 'Paramètres CRM et Import Excel massif réservés aux profils ADMIN et MANAGER.',
    };
  }
  if (target === 'client_bulk_select') {
    return {
      allowed: false,
      httpStatus: 403,
      reason: 'Sélection multiple Clients désactivée et refusée côté serveur pour COMMERCIAL.',
    };
  }
  if (target === 'form_write' || target === 'form_delete') {
    return {
      allowed: false,
      httpStatus: 403,
      reason:
        target === 'form_delete'
          ? 'ACL-01 : suppression de formulaire refusée (HTTP 403) en rôle COMMERCIAL et corbeille masquée.'
          : 'Création/édition de formulaires interdite (HTTP 403) en rôle COMMERCIAL (lecture seule).',
    };
  }
  if (target === 'statistics' && !statsAllowedForCommercial) {
    return {
      allowed: false,
      httpStatus: 403,
      reason: 'Accès aux Statistiques désactivé pour COMMERCIAL via app-settings.',
    };
  }

  return {
    allowed: true,
    httpStatus: 200,
    reason: 'Accès COMMERCIAL autorisé sur périmètre opérationnel.',
  };
}

export interface LeadImportRowResult {
  rowNumber: number;
  status: 'valide' | 'doublon' | 'rejete';
  email: string;
  fullName: string;
  consentGranted: boolean;
  reason: string;
}

export interface LeadImportParseSummary {
  totalDataRows: number;
  validCount: number;
  duplicateCount: number;
  rejectedCount: number;
  results: LeadImportRowResult[];
}

export function validateAndParseLeadImportRows(
  rows: string[][],
  existingEmails: string[],
  existingPhones: string[]
): LeadImportParseSummary {
  const emailSet = new Set(existingEmails.map((e) => e.trim().toLowerCase()).filter(Boolean));
  const phoneSet = new Set(existingPhones.map((p) => p.replace(/\s+/g, '')).filter(Boolean));
  const results: LeadImportRowResult[] = [];

  // La 1re ligne (en-tête 11 colonnes) est ignorée conformément au gabarit officiel Lead
  const dataRows = rows.length > 0 && rows[0][3]?.toLowerCase() === 'email' ? rows.slice(1) : rows;

  dataRows.forEach((cols, idx) => {
    const rowNumber = idx + 2;
    const firstName = (cols[1] ?? '').trim();
    const lastName = (cols[2] ?? '').trim();
    const email = (cols[3] ?? '').trim().toLowerCase();
    const phone = (cols[4] ?? '').replace(/\s+/g, '');
    const birthDate = (cols[8] ?? '').trim();
    const rawConsent = (cols[9] ?? '').trim().toUpperCase();
    const fullName = `${firstName} ${lastName}`.trim() || '(Sans nom)';

    // Décision validée : décoché (false) par défaut si vide ou non VRAI/TRUE/OUI
    const consentGranted = rawConsent === 'VRAI' || rawConsent === 'TRUE' || rawConsent === 'OUI' || rawConsent === '1';

    if (cols.length < 11) {
      results.push({
        rowNumber,
        status: 'rejete',
        email,
        fullName,
        consentGranted,
        reason: `Nombre de colonnes invalide (${cols.length}/11 attendues).`,
      });
      return;
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      results.push({
        rowNumber,
        status: 'rejete',
        email,
        fullName,
        consentGranted,
        reason: 'Email requis absent ou format invalide.',
      });
      return;
    }

    if (birthDate && !/^\d{2}\/\d{2}\/\d{4}$/.test(birthDate)) {
      results.push({
        rowNumber,
        status: 'rejete',
        email,
        fullName,
        consentGranted,
        reason: `Date de naissance "${birthDate}" non conforme au format DD/MM/YYYY.`,
      });
      return;
    }

    if (emailSet.has(email) || (phone && phoneSet.has(phone))) {
      results.push({
        rowNumber,
        status: 'doublon',
        email,
        fullName,
        consentGranted,
        reason: emailSet.has(email) ? 'Doublon détecté sur email existant.' : 'Doublon détecté sur téléphone existant.',
      });
      return;
    }

    emailSet.add(email);
    if (phone) phoneSet.add(phone);
    results.push({
      rowNumber,
      status: 'valide',
      email,
      fullName,
      consentGranted,
      reason: 'Ligne conforme (11 colonnes validées).',
    });
  });

  return {
    totalDataRows: results.length,
    validCount: results.filter((r) => r.status === 'valide').length,
    duplicateCount: results.filter((r) => r.status === 'doublon').length,
    rejectedCount: results.filter((r) => r.status === 'rejete').length,
    results,
  };
}

export interface AutoArchiveDecision {
  shouldArchive: boolean;
  excludedFromCampaigns: boolean;
  effectiveDaysSinceInbound: number;
  reason: string;
}

export function evaluateProspectAutoArchive(
  daysSinceLastInboundReply: number,
  daysSinceLastOutboundMessage: number,
  thresholdDays: number,
  hasActiveVacation: boolean
): AutoArchiveDecision {
  if (hasActiveVacation) {
    return {
      shouldArchive: false,
      excludedFromCampaigns: true,
      effectiveDaysSinceInbound: daysSinceLastInboundReply,
      reason: 'Vacances client actives : exclusion des campagnes et report de relance sans suspendre le contrat Heitz.',
    };
  }

  // Règle Lead explicite : un message sortant NE repousse PAS le délai d'archivage ; seule une réponse entrante le repousse.
  const shouldArchive = daysSinceLastInboundReply >= thresholdDays;
  return {
    shouldArchive,
    excludedFromCampaigns: shouldArchive,
    effectiveDaysSinceInbound: daysSinceLastInboundReply,
    reason: shouldArchive
      ? `Archivage automatique : ${daysSinceLastInboundReply} j sans réponse entrante (>= ${thresholdDays} j), non repoussé par l'envoi sortant (J-${daysSinceLastOutboundMessage}).`
      : `Prospect maintenu actif : dernière réponse entrante il y a ${daysSinceLastInboundReply} j (< ${thresholdDays} j).`,
  };
}

export type WhatsAppFallbackPolicy = 'ne_pas_envoyer' | 'modele_approuve' | 'sms_repli';

export interface WhatsAppSendParams {
  hoursSinceLastInboundMessage: number;
  templateMetaApproved: boolean;
  requiredMediaAttached: boolean;
  fallbackPolicy: WhatsAppFallbackPolicy;
  templateName?: string;
  bodyText?: string;
  footerText?: string;
  quickReplyTexts?: string[];
  buttonsCount?: number;
  mediaSizeMb?: number;
  explicitSave?: boolean;
}

export interface WhatsAppSendDecision {
  window24hOpen: boolean;
  deliveryChannel: 'whatsapp_direct' | 'whatsapp_template' | 'sms_repli' | 'bloque';
  draftCreated: boolean;
  validationErrors: string[];
  reason: string;
}

export function resolveWhatsAppSendDecision(params: WhatsAppSendParams): WhatsAppSendDecision {
  const errors: string[] = [];

  if (params.templateName && params.templateName.length > 100) {
    errors.push('Nom de modèle WhatsApp > 100 caractères.');
  }
  if (params.bodyText && params.bodyText.length > 1024) {
    errors.push('Corps WhatsApp > 1024 caractères.');
  }
  if (params.footerText && params.footerText.length > 60) {
    errors.push('Pied de page WhatsApp > 60 caractères.');
  }
  if (params.quickReplyTexts?.some((q) => q.length > 25)) {
    errors.push('Bouton Réponse rapide > 25 caractères.');
  }
  if ((params.buttonsCount ?? 0) > 10) {
    errors.push('Nombre de boutons WhatsApp > 10.');
  }
  if ((params.mediaSizeMb ?? 0) > 5) {
    errors.push('Média image JPG/PNG > 5 Mo.');
  }

  // WA-02 : séparation stricte approbation Meta vs complétude technique (média attaché)
  if (!params.requiredMediaAttached) {
    errors.push('WA-02 : Approbation Meta éventuelle insuffisante — média requis manquant avant envoi.');
  }

  // INC-001 : aucune création de brouillon tant que explicitSave n'est pas confirmé
  const draftCreated = params.explicitSave === true && errors.length === 0;
  const window24hOpen = params.hoursSinceLastInboundMessage <= 24;

  if (errors.length > 0) {
    return {
      window24hOpen,
      deliveryChannel: 'bloque',
      draftCreated,
      validationErrors: errors,
      reason: errors[0],
    };
  }

  if (window24hOpen) {
    return {
      window24hOpen: true,
      deliveryChannel: 'whatsapp_direct',
      draftCreated,
      validationErrors: [],
      reason: `Fenêtre 24h Meta ouverte (${params.hoursSinceLastInboundMessage}h) : message direct autorisé.`,
    };
  }

  // Fenêtre fermée (> 24h) : application des 3 replis WA-01
  if (params.fallbackPolicy === 'ne_pas_envoyer') {
    return {
      window24hOpen: false,
      deliveryChannel: 'bloque',
      draftCreated,
      validationErrors: [],
      reason: 'WA-01 : Fenêtre 24h expirée — repli « Ne pas envoyer » appliqué.',
    };
  }

  if (params.fallbackPolicy === 'modele_approuve') {
    if (!params.templateMetaApproved) {
      return {
        window24hOpen: false,
        deliveryChannel: 'bloque',
        draftCreated,
        validationErrors: ['Modèle non approuvé par Meta.'],
        reason: 'WA-01 : Fenêtre 24h expirée et modèle non approuvé par Meta — envoi bloqué.',
      };
    }
    return {
      window24hOpen: false,
      deliveryChannel: 'whatsapp_template',
      draftCreated,
      validationErrors: [],
      reason: 'WA-01 : Fenêtre 24h expirée — bascule automatique vers modèle WhatsApp approuvé.',
    };
  }

  return {
    window24hOpen: false,
    deliveryChannel: 'sms_repli',
    draftCreated,
    validationErrors: [],
    reason: 'WA-01 : Fenêtre 24h expirée — SMS de repli planifié via passerelle OVH/Yeastar.',
  };
}

export interface AppointmentSlotRecord {
  id: string;
  clubId: ClubId;
  coachId: string;
  typeName: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  capacityMax: number; // 0 = sans limite
  currentBookedCount: number;
  paidRequired: boolean;
  paymentStatus: 'non_requis' | 'attente_paiement' | 'paye';
}

export interface AppointmentBookingDecision {
  accepted: boolean;
  bookingStatus: 'confirme' | 'provisoire_attente_paiement' | 'refuse';
  collisionDetected: boolean;
  reason: string;
}

export function validateAppointmentBooking(
  existingSlots: AppointmentSlotRecord[],
  candidate: {
    clubId: ClubId;
    coachId: string;
    typeName: string;
    date: string;
    startTime: string;
    hoursBeforeSlot: number;
    minDelayHours: number;
    capacityMax: number;
    requiresStripePayment: boolean;
    stripePaidConfirmed: boolean;
  },
  preventCrossTypeCollision = true
): AppointmentBookingDecision {
  if (candidate.hoursBeforeSlot < candidate.minDelayHours) {
    return {
      accepted: false,
      bookingStatus: 'refuse',
      collisionDetected: false,
      reason: `Délai minimum non respecté (${candidate.hoursBeforeSlot}h < ${candidate.minDelayHours}h requises).`,
    };
  }

  const sameTimeAllTypes = existingSlots.filter(
    (s) =>
      s.clubId === candidate.clubId &&
      s.coachId === candidate.coachId &&
      s.date === candidate.date &&
      s.startTime === candidate.startTime
  );

  // RDV-01 : prévention de collisions entre types distincts sur le même coach/créneau
  const crossTypeOccupied = sameTimeAllTypes.find((s) => s.typeName !== candidate.typeName && s.currentBookedCount > 0);
  if (preventCrossTypeCollision && crossTypeOccupied) {
    return {
      accepted: false,
      bookingStatus: 'refuse',
      collisionDetected: true,
      reason: `Collision inter-types (RDV-01) : créneau déjà occupé par "${crossTypeOccupied.typeName}" sur ce coach.`,
    };
  }

  const sameType = sameTimeAllTypes.find((s) => s.typeName === candidate.typeName);
  if (candidate.capacityMax > 0 && sameType && sameType.currentBookedCount >= candidate.capacityMax) {
    return {
      accepted: false,
      bookingStatus: 'refuse',
      collisionDetected: true,
      reason: `Capacité maximale atteinte (${sameType.currentBookedCount}/${candidate.capacityMax}).`,
    };
  }

  if (candidate.requiresStripePayment && !candidate.stripePaidConfirmed) {
    return {
      accepted: true,
      bookingStatus: 'provisoire_attente_paiement',
      collisionDetected: false,
      reason: 'Contact capté en réservation provisoire : confirmation définitive uniquement après webhook Stripe payé.',
    };
  }

  return {
    accepted: true,
    bookingStatus: 'confirme',
    collisionDetected: false,
    reason: 'Créneau réservé et confirmé sans collision.',
  };
}

export interface LeadClubEntryWebhookPayload {
  apiKey?: string;
  club?: string;
  email?: string;
  lastname?: string;
  firstname?: string;
  offername?: string;
  phone?: string;
  source?: string;
  utm_source?: string;
  utm_campaign?: string;
  utm_medium?: string;
  isWix?: boolean;
}

export interface LeadWebhookResult {
  status: 200 | 400;
  ok: boolean;
  entryType?: 'demande_essai' | 'demande_contact';
  idempotencyKey?: string;
  error?: string;
}

export function ingestLeadClubEntryWebhook(payload: LeadClubEntryWebhookPayload): LeadWebhookResult {
  if (!payload.apiKey?.trim()) {
    return { status: 400, ok: false, error: 'Clé apiKey manquante.' };
  }
  if (!payload.club?.trim() || !payload.email?.trim() || !payload.lastname?.trim() || !payload.firstname?.trim()) {
    return { status: 400, ok: false, error: 'Champs requis manquants : club, email, lastname, firstname.' };
  }
  const entryType = payload.offername?.trim() ? 'demande_essai' : 'demande_contact';
  const idempotencyKey = `WH-${payload.club.trim()}-${payload.email.trim().toLowerCase()}-${entryType}`;
  return {
    status: 200,
    ok: true,
    entryType,
    idempotencyKey,
  };
}

export function computeSmsSegmentMetrics(text: string): {
  encoding: 'GSM-7' | 'UCS-2';
  charCount: number;
  maxPerSms: number;
  segmentsCount: number;
} {
  // Détection simplifiée : tout caractère non ASCII étendu bascule en UCS-2 (70 car./SMS, 67 en multi)
  const isGsm7 = /^[\x20-\x7E\r\n€£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉäöñüà]*$/.test(text);
  const charCount = text.length;
  if (isGsm7) {
    return {
      encoding: 'GSM-7',
      charCount,
      maxPerSms: 160,
      segmentsCount: charCount === 0 ? 0 : charCount <= 160 ? 1 : Math.ceil(charCount / 153),
    };
  }
  return {
    encoding: 'UCS-2',
    charCount,
    maxPerSms: 70,
    segmentsCount: charCount === 0 ? 0 : charCount <= 70 ? 1 : Math.ceil(charCount / 67),
  };
}
