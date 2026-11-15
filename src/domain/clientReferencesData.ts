/* Généré automatiquement à partir des références client REFERENCES_COMPLETES (V1.16, 2026-11-14) */

export interface AdminCaptureRef {
  id: string;
  file: string;
  url: string;
  source_screen_ids: string[];
  title: string;
  date: string;
  profile: string;
  site_context: string;
  kind: string;
  width: number;
  height: number;
  sha256: string;
  scope: string;
  limits: string;
  implementation_use: string;
  encoding: string;
  mime_type: string;
}

export interface EmulationCaptureRef {
  id: string;
  file: string;
  url: string;
  format: string;
  width: number;
  height: number;
  sha256: string;
  note: string;
  device: string;
}

export interface HistoricalPlanRef {
  id: string;
  file: string;
  url: string;
  title: string;
  note: string;
}

export interface AtlasEntryItem {
  id: string;
  option: string;
  detail: string;
  nature: string;
  preuve: string;
}

export interface AtlasScreenContract {
  contract_id: string;
  source_screen_id: string;
  title: string;
  purpose: string;
  destination: { entry: string; section_id: string };
  scope_note: string;
  reference_layout: string;
  known_limits: string[];
  visual_capture_refs: string[];
  source_entries: AtlasEntryItem[];
}

export interface AtlasEntriesPayload {
  version: string;
  date: string;
  purpose: string;
  counts: {
    screen_contracts: number;
    source_entries: number;
    unique_proposed_actions: number;
  };
  contracts: AtlasScreenContract[];
}

export interface ClubDifferenceItem {
  setting: string;
  Beynost: string | boolean;
  'Carré de Soie': string | boolean;
}

export interface ReportRuleGroup {
  group: string;
  fields: [string, string][];
  add_band_visible: boolean;
  delete_band_visible: boolean;
}

export interface AlertConfigItem {
  label: string;
  group: string;
  active_displayed: boolean;
  blocking_displayed: boolean;
  blocking_checkbox_exposed: boolean;
  displayed_parameter: string;
  interaction_tested: boolean;
  threshold_text_field_exposed?: boolean;
}

export interface AbsenceMotiveState {
  source_id: string;
  label: string;
  category: string;
  active: number;
  accrual: number;
  employee_request: number;
  overtime: string;
  accrual_disabled: boolean;
  request_disabled: boolean;
  overtime_disabled: boolean;
  site: string;
  date_rechecked: string;
  proof: string;
  calculation_tested: boolean;
  display_order: number;
}

export interface SmartPlannerRuleState {
  group: string;
  label: string;
  active_displayed: boolean;
  value_displayed: string | number | boolean | null;
  effect_tested: boolean;
}

export interface AnnualAbsenceOption {
  label: string;
  included_displayed: boolean;
  interaction_tested: boolean;
}

export interface PartnerCatalogues {
  caisse: string[];
  paie: string[];
  sirh: { outbound: string[]; inbound: string[]; activation: string };
  analyse: string[];
  recrutement: string[];
  acompte: string[];
}

export interface DocumentaryArticleRef {
  id: string;
  title: string;
  url: string;
  refs: string[];
  evidence: string;
  notes: string[];
  proposed_acceptance_scenarios: string[];
  result_tested: boolean;
}

export const ADMIN_CAPTURES: AdminCaptureRef[] = [
  {
    "id": "CAP-ADM13-01",
    "file": "captures_administrateur_2026_11_13/01-integrations-caisse.png",
    "url": "/references/captures_administrateur_2026_11_13/01-integrations-caisse.png",
    "source_screen_ids": [
      "INT02"
    ],
    "title": "Intégrations > Caisse",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Organisation",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2838,
    "height": 1674,
    "sha256": "9739a27d20b5e417f1908828795a0b37ad9cc0546a409622fd4a09b959e4bac4",
    "scope": "Vue partielle de la fenêtre Chrome, pas une capture de page entière",
    "limits": "Haut de page, annonce du CA et premiers logiciels ; liste complète dans le complément.",
    "implementation_use": "Disposition et libellés source ; appliquer les couleurs, typographies et pictogrammes CFitness à la maquette maison.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-02",
    "file": "captures_administrateur_2026_11_13/02-integrations-paie.png",
    "url": "/references/captures_administrateur_2026_11_13/02-integrations-paie.png",
    "source_screen_ids": [
      "INT03"
    ],
    "title": "Intégrations > Paie",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Organisation",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2838,
    "height": 1674,
    "sha256": "43f7f2bbe7bf8e19c1d965bd0243e08e45badea3a186f8b30879d39c941740b0",
    "scope": "Vue partielle de la fenêtre Chrome, pas une capture de page entière",
    "limits": "Grille des logiciels ; bas de la liste partiellement hors cadre.",
    "implementation_use": "Disposition et libellés source ; appliquer les couleurs, typographies et pictogrammes CFitness à la maquette maison.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-03",
    "file": "captures_administrateur_2026_11_13/03-integrations-sirh.png",
    "url": "/references/captures_administrateur_2026_11_13/03-integrations-sirh.png",
    "source_screen_ids": [
      "INT04"
    ],
    "title": "Intégrations > SIRH",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Organisation",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2838,
    "height": 1674,
    "sha256": "03d15a8904c746516e2e4ec145cfd5f649945afb370c59c6193b776e5e161b86",
    "scope": "Vue partielle de la fenêtre Chrome, pas une capture de page entière",
    "limits": "Sens des flux, boutons de connexion et début de Lucca ; fin de page hors cadre.",
    "implementation_use": "Disposition et libellés source ; appliquer les couleurs, typographies et pictogrammes CFitness à la maquette maison.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-04",
    "file": "captures_administrateur_2026_11_13/04-integrations-analyse-haut.png",
    "url": "/references/captures_administrateur_2026_11_13/04-integrations-analyse-haut.png",
    "source_screen_ids": [
      "INT05"
    ],
    "title": "Intégrations > Analyse",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Organisation",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2838,
    "height": 1674,
    "sha256": "556a420047a04b18bf9810b90afe009d0a56570d3084fd1d6bc90aca190f2741",
    "scope": "Vue partielle de la fenêtre Chrome, pas une capture de page entière",
    "limits": "Haut de liste ; API et derniers éléments partiellement hors cadre.",
    "implementation_use": "Disposition et libellés source ; appliquer les couleurs, typographies et pictogrammes CFitness à la maquette maison.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-05",
    "file": "captures_administrateur_2026_11_13/05-api-analytique-etat-inactif.png",
    "url": "/references/captures_administrateur_2026_11_13/05-api-analytique-etat-inactif.png",
    "source_screen_ids": [
      "INT05"
    ],
    "title": "Intégrations > Analyse > API analytique",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Organisation",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2838,
    "height": 1674,
    "sha256": "29ddcaf484737e34e5e5f794e1d5c39303c85d1bec547981ff43dcee3112c5ba",
    "scope": "Vue partielle de la fenêtre Chrome, pas une capture de page entière",
    "limits": "Interrupteurs inactifs, chevrons grisés, GoTenzo et TimeSkipper.",
    "implementation_use": "Disposition et libellés source ; appliquer les couleurs, typographies et pictogrammes CFitness à la maquette maison.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-06",
    "file": "captures_administrateur_2026_11_13/06-integrations-recrutement.png",
    "url": "/references/captures_administrateur_2026_11_13/06-integrations-recrutement.png",
    "source_screen_ids": [
      "INT06"
    ],
    "title": "Intégrations > Recrutement",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Organisation",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2838,
    "height": 1674,
    "sha256": "6a64027a93489cbf04f88fa1c60ae7effc1c47cb909b5aaa0bb040fb4065d464",
    "scope": "Vue partielle de la fenêtre Chrome, pas une capture de page entière",
    "limits": "Deux partenaires et instructions de contact.",
    "implementation_use": "Disposition et libellés source ; appliquer les couleurs, typographies et pictogrammes CFitness à la maquette maison.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-07",
    "file": "captures_administrateur_2026_11_13/07-integrations-acomptes.png",
    "url": "/references/captures_administrateur_2026_11_13/07-integrations-acomptes.png",
    "source_screen_ids": [
      "INT06"
    ],
    "title": "Intégrations > Acompte sur salaire",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Organisation",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2838,
    "height": 1674,
    "sha256": "c7b07262d337c1b591e6950f092bf7793947e019b41e30fa73707a0b5f7109ab",
    "scope": "Vue partielle de la fenêtre Chrome, pas une capture de page entière",
    "limits": "Deux partenaires ; volets fermés.",
    "implementation_use": "Disposition et libellés source ; appliquer les couleurs, typographies et pictogrammes CFitness à la maquette maison.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-08",
    "file": "captures_administrateur_2026_11_13/08-permissions-six-profils.png",
    "url": "/references/captures_administrateur_2026_11_13/08-permissions-six-profils.png",
    "source_screen_ids": [
      "ORG03"
    ],
    "title": "Niveaux de permission & actions",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Organisation",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2838,
    "height": 1674,
    "sha256": "1bbd4dfa7d6d5151d0fec8aa473993e58a455c308740be5166d6158407d8b259",
    "scope": "Vue partielle de la fenêtre Chrome, pas une capture de page entière",
    "limits": "Première rangée complète, seconde partielle ; six cartes identifiées dans le relevé.",
    "implementation_use": "Disposition et libellés source ; appliquer les couleurs, typographies et pictogrammes CFitness à la maquette maison.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-09",
    "file": "captures_administrateur_2026_11_13/09-personnalisation-droits-pa-haut.png",
    "url": "/references/captures_administrateur_2026_11_13/09-personnalisation-droits-pa-haut.png",
    "source_screen_ids": [
      "DRO03"
    ],
    "title": "Personnaliser > Planificateur avancé",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Organisation",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2838,
    "height": 1674,
    "sha256": "566dccfee09d73fd27ce3b76664c8c536ebce12b44e90b75e1b4a3379eebadb5",
    "scope": "Vue partielle de la fenêtre Chrome, pas une capture de page entière",
    "limits": "Début du panneau et actions du planning.",
    "implementation_use": "Disposition et libellés source ; appliquer les couleurs, typographies et pictogrammes CFitness à la maquette maison.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-10",
    "file": "captures_administrateur_2026_11_13/10-personnalisation-droits-pa-suite.png",
    "url": "/references/captures_administrateur_2026_11_13/10-personnalisation-droits-pa-suite.png",
    "source_screen_ids": [
      "DRO03"
    ],
    "title": "Personnaliser > Planificateur avancé",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Organisation",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2838,
    "height": 1674,
    "sha256": "c063350b3393267c786dc5479a65088fdcdfa1b9c0876188d1a2a56545521ceb",
    "scope": "Vue partielle de la fenêtre Chrome, pas une capture de page entière",
    "limits": "Partie Employés et début Rapport ; reste hors cadre.",
    "implementation_use": "Disposition et libellés source ; appliquer les couleurs, typographies et pictogrammes CFitness à la maquette maison.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-11",
    "file": "captures_administrateur_2026_11_13/11-badgeuse-preuve-multiappareil-mobile.png",
    "url": "/references/captures_administrateur_2026_11_13/11-badgeuse-preuve-multiappareil-mobile.png",
    "source_screen_ids": [
      "PAR16"
    ],
    "title": "Badgeuse > Photo, multi-appareil et mobile",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2838,
    "height": 1674,
    "sha256": "bec4ea9d10ef3ab8627dd7a6f150063d66534440ee5c860b9bb64f5d32a8f393",
    "scope": "Vue partielle de la fenêtre Chrome, pas une capture de page entière",
    "limits": "Défilement médian ; arrivée/départ et fin de page hors cadre.",
    "implementation_use": "Disposition et libellés source ; appliquer les couleurs, typographies et pictogrammes CFitness à la maquette maison.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-12",
    "file": "captures_administrateur_2026_11_13/12-badgeuse-mobile-et-pause.png",
    "url": "/references/captures_administrateur_2026_11_13/12-badgeuse-mobile-et-pause.png",
    "source_screen_ids": [
      "PAR16"
    ],
    "title": "Badgeuse > Mobile et pause",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2838,
    "height": 1674,
    "sha256": "f0c48900f281233faf74552c8f974e07ed6d8190d712c34e61acf878fa0840d7",
    "scope": "Vue partielle de la fenêtre Chrome, pas une capture de page entière",
    "limits": "Activation mobile, zéro employé sélectionné et pause off.",
    "implementation_use": "Disposition et libellés source ; appliquer les couleurs, typographies et pictogrammes CFitness à la maquette maison.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-13",
    "file": "captures_administrateur_2026_11_13/13-badgeuse-tablette-preuve.png",
    "url": "/references/captures_administrateur_2026_11_13/13-badgeuse-tablette-preuve.png",
    "source_screen_ids": [
      "PAR16"
    ],
    "title": "Badgeuse > Tablette et preuve de badge",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2838,
    "height": 1674,
    "sha256": "87c735c7b1f9bb15f7416ecdeafce9824bd93f300d868c22c8d164c8e30508e1",
    "scope": "Vue partielle de la fenêtre Chrome, pas une capture de page entière",
    "limits": "Pause, signature, photo et deux modes de photo.",
    "implementation_use": "Disposition et libellés source ; appliquer les couleurs, typographies et pictogrammes CFitness à la maquette maison.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-14",
    "file": "captures_administrateur_2026_11_13/14-badgeuse-retard-et-remontee.png",
    "url": "/references/captures_administrateur_2026_11_13/14-badgeuse-retard-et-remontee.png",
    "source_screen_ids": [
      "PAR16"
    ],
    "title": "Badgeuse > Retard et remontée",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2838,
    "height": 1674,
    "sha256": "6405cb2b2e7104308aece001449fbb4e15ade9f9a2d12b896e2a47a8b247a840",
    "scope": "Vue partielle de la fenêtre Chrome, pas une capture de page entière",
    "limits": "Notification SMS, nombre de destinataires, rattachement et fréquence.",
    "implementation_use": "Disposition et libellés source ; appliquer les couleurs, typographies et pictogrammes CFitness à la maquette maison.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-15",
    "file": "captures_administrateur_2026_11_13/15-badgeuse-regles-arrivee-depart.png",
    "url": "/references/captures_administrateur_2026_11_13/15-badgeuse-regles-arrivee-depart.png",
    "source_screen_ids": [
      "PAR16"
    ],
    "title": "Badgeuse > Arrivée et départ",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2838,
    "height": 1674,
    "sha256": "bc59f2f57779b150f42a8a0fd11f1339d556a93db24eba9865bca1899ebe6495",
    "scope": "Vue partielle de la fenêtre Chrome, pas une capture de page entière",
    "limits": "Règles des quatre cas, code PIN hors cadre.",
    "implementation_use": "Disposition et libellés source ; appliquer les couleurs, typographies et pictogrammes CFitness à la maquette maison.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-16",
    "file": "captures_administrateur_2026_11_13/16-badgeuse-arrondis-inactifs.png",
    "url": "/references/captures_administrateur_2026_11_13/16-badgeuse-arrondis-inactifs.png",
    "source_screen_ids": [
      "PAR16"
    ],
    "title": "Badgeuse > Arrondis",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2838,
    "height": 1674,
    "sha256": "60d9ef0060063a09e3ff49b3338f54302101fb69d1ab639794e10fbe9849b679",
    "scope": "Vue partielle de la fenêtre Chrome, pas une capture de page entière",
    "limits": "Arrondi inactif, valeur 5 grisée et exemple explicatif.",
    "implementation_use": "Disposition et libellés source ; appliquer les couleurs, typographies et pictogrammes CFitness à la maquette maison.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-17",
    "file": "captures_administrateur_2026_11_13/17-acomptes-volets-ouverts.png",
    "url": "/references/captures_administrateur_2026_11_13/17-acomptes-volets-ouverts.png",
    "source_screen_ids": [
      "INT06"
    ],
    "title": "Acomptes > Volets Rosaly et Spayr",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Organisation",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2838,
    "height": 1674,
    "sha256": "cbe918b79e210ec4ed1fd1cdebc1676ccd206d294f18445ebe056af6df66bec2",
    "scope": "Vue partielle de la fenêtre Chrome, pas une capture de page entière",
    "limits": "Deux procédures dépliées ; aucun document de partenariat ouvert.",
    "implementation_use": "Disposition et libellés source ; appliquer les couleurs, typographies et pictogrammes CFitness à la maquette maison.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-18",
    "file": "captures_administrateur_2026_11_13/18-carre-badgeuse-arrivee.png",
    "url": "/references/captures_administrateur_2026_11_13/18-carre-badgeuse-arrivee.png",
    "source_screen_ids": [
      "PAR16"
    ],
    "title": "carre badgeuse arrivee",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 1514,
    "height": 1768,
    "sha256": "5382326fb22e9a2fbaef133bccbcb2315a7c52382d242d0673d5531a2f1c8e83",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché, résultats après modification non testés.",
    "implementation_use": "Disposition et états à rapprocher du complément structuré ; appliquer le design CFitness.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-19",
    "file": "captures_administrateur_2026_11_13/19-carre-arrondis-pause.png",
    "url": "/references/captures_administrateur_2026_11_13/19-carre-arrondis-pause.png",
    "source_screen_ids": [
      "PAR16"
    ],
    "title": "carre arrondis pause",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 1514,
    "height": 1768,
    "sha256": "763f5044a1e571728656193153f7b02247ec288479fcd23e847d930244cc5a3e",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché, résultats après modification non testés.",
    "implementation_use": "Disposition et états à rapprocher du complément structuré ; appliquer le design CFitness.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-20",
    "file": "captures_administrateur_2026_11_13/20-carre-retard-frequence.png",
    "url": "/references/captures_administrateur_2026_11_13/20-carre-retard-frequence.png",
    "source_screen_ids": [
      "PAR16"
    ],
    "title": "carre retard frequence",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 1514,
    "height": 1768,
    "sha256": "9ecb2631e35c201005b2af2bc5af4ec34463cd524269bccd67dec5c80d795972",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché, résultats après modification non testés.",
    "implementation_use": "Disposition et états à rapprocher du complément structuré ; appliquer le design CFitness.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-21",
    "file": "captures_administrateur_2026_11_13/21-carre-tablette-preuve.png",
    "url": "/references/captures_administrateur_2026_11_13/21-carre-tablette-preuve.png",
    "source_screen_ids": [
      "PAR16"
    ],
    "title": "carre tablette preuve",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 1514,
    "height": 1768,
    "sha256": "f5578dda2084a81f6118df33ae9a380aafb2fedc3166788ff9392baa4aa40f03",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché, résultats après modification non testés.",
    "implementation_use": "Disposition et états à rapprocher du complément structuré ; appliquer le design CFitness.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-22",
    "file": "captures_administrateur_2026_11_13/22-carre-multiappareil-mobile.png",
    "url": "/references/captures_administrateur_2026_11_13/22-carre-multiappareil-mobile.png",
    "source_screen_ids": [
      "PAR16"
    ],
    "title": "carre multiappareil mobile",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 1514,
    "height": 1768,
    "sha256": "49740633c241d416c43b19c100d714b00175feba700eb678a5a8ad359d186c18",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché, résultats après modification non testés.",
    "implementation_use": "Disposition et états à rapprocher du complément structuré ; appliquer le design CFitness.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-23",
    "file": "captures_administrateur_2026_11_13/23-carre-mobile-pause.png",
    "url": "/references/captures_administrateur_2026_11_13/23-carre-mobile-pause.png",
    "source_screen_ids": [
      "PAR16"
    ],
    "title": "carre mobile pause",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 1514,
    "height": 1768,
    "sha256": "ce2e84e50fc0e5974b896e3876ad09a90258f193b05471e3ef5d118eca8a2cfd",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché, résultats après modification non testés.",
    "implementation_use": "Disposition et états à rapprocher du complément structuré ; appliquer le design CFitness.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-24",
    "file": "captures_administrateur_2026_11_13/24-carre-regles-rapport-supplementaires.png",
    "url": "/references/captures_administrateur_2026_11_13/24-carre-regles-rapport-supplementaires.png",
    "source_screen_ids": [
      "PAR04"
    ],
    "title": "carre regles rapport supplementaires",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 1514,
    "height": 1768,
    "sha256": "4137a6161cee7d0d9a39ba1f041d451adf408835978e6049608f5d307dd9af54",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché, résultats après modification non testés.",
    "implementation_use": "Disposition et états à rapprocher du complément structuré ; appliquer le design CFitness.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-25",
    "file": "captures_administrateur_2026_11_13/25-carre-regles-rapport-complementaires-nuit.png",
    "url": "/references/captures_administrateur_2026_11_13/25-carre-regles-rapport-complementaires-nuit.png",
    "source_screen_ids": [
      "PAR04"
    ],
    "title": "carre regles rapport complementaires nuit",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 1514,
    "height": 1768,
    "sha256": "44eab69d97782d49bdc77bd53c00c4b772e8464cd2be45504e767b4f0cb7bf7d",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché, résultats après modification non testés.",
    "implementation_use": "Disposition et états à rapprocher du complément structuré ; appliquer le design CFitness.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-26",
    "file": "captures_administrateur_2026_11_13/26-carre-regles-rapport-dimanche-feries.png",
    "url": "/references/captures_administrateur_2026_11_13/26-carre-regles-rapport-dimanche-feries.png",
    "source_screen_ids": [
      "PAR04"
    ],
    "title": "carre regles rapport dimanche feries",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 1514,
    "height": 1768,
    "sha256": "e16e1bf386ffcbbf3dafa568ffe80aa5f3126a3cd9ffd1ff9c30387ad3c62454",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché, résultats après modification non testés.",
    "implementation_use": "Disposition et états à rapprocher du complément structuré ; appliquer le design CFitness.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-27",
    "file": "captures_administrateur_2026_11_13/27-carre-regles-rapport-coupures.png",
    "url": "/references/captures_administrateur_2026_11_13/27-carre-regles-rapport-coupures.png",
    "source_screen_ids": [
      "PAR04"
    ],
    "title": "carre regles rapport coupures",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 1514,
    "height": 1768,
    "sha256": "39974bec28ff635471ffce7cf82ea9da0031c715969a41a3525fbaee4d16deba",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché, résultats après modification non testés.",
    "implementation_use": "Disposition et états à rapprocher du complément structuré ; appliquer le design CFitness.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-28",
    "file": "captures_administrateur_2026_11_13/28-carre-alertes-debut.png",
    "url": "/references/captures_administrateur_2026_11_13/28-carre-alertes-debut.png",
    "source_screen_ids": [
      "PAR03"
    ],
    "title": "carre alertes debut",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 3024,
    "height": 1768,
    "sha256": "c9a9a1b7648daf95602a19fbf1e81b50d3c3ed3e213cb3ea2ad5fc0a4020f658",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché, résultats après modification non testés.",
    "implementation_use": "Disposition et états à rapprocher du complément structuré ; appliquer le design CFitness.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-29",
    "file": "captures_administrateur_2026_11_13/29-carre-alertes-pause-coupures.png",
    "url": "/references/captures_administrateur_2026_11_13/29-carre-alertes-pause-coupures.png",
    "source_screen_ids": [
      "PAR03"
    ],
    "title": "carre alertes pause coupures",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 3024,
    "height": 1768,
    "sha256": "ebd62dd280c021eab8ad6513e664645d35419f123a61b5532c144cd8552f11d5",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché, résultats après modification non testés.",
    "implementation_use": "Disposition et états à rapprocher du complément structuré ; appliquer le design CFitness.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-30",
    "file": "captures_administrateur_2026_11_13/30-carre-alertes-limites-planning.png",
    "url": "/references/captures_administrateur_2026_11_13/30-carre-alertes-limites-planning.png",
    "source_screen_ids": [
      "PAR03"
    ],
    "title": "carre alertes limites planning",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 3024,
    "height": 1768,
    "sha256": "3aafe327d520d1d48b9d9de9bf2a4b1c5ad67ecbed44d6b1e69eb82a86c62bc4",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché, résultats après modification non testés.",
    "implementation_use": "Disposition et états à rapprocher du complément structuré ; appliquer le design CFitness.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-31",
    "file": "captures_administrateur_2026_11_13/31-carre-alertes-non-personnalisables.png",
    "url": "/references/captures_administrateur_2026_11_13/31-carre-alertes-non-personnalisables.png",
    "source_screen_ids": [
      "PAR03"
    ],
    "title": "carre alertes non personnalisables",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 3024,
    "height": 1768,
    "sha256": "065b2d0c941ce3c4164e04eb23fb1065bcb8d313d3a707cea43b01d513321c0d",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché, résultats après modification non testés.",
    "implementation_use": "Disposition et états à rapprocher du complément structuré ; appliquer le design CFitness.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-32",
    "file": "captures_administrateur_2026_11_13/32-beynost-alertes-debut.png",
    "url": "/references/captures_administrateur_2026_11_13/32-beynost-alertes-debut.png",
    "source_screen_ids": [
      "PAR03"
    ],
    "title": "beynost alertes debut",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; menu organisation accessible",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "b51dc08d7063553a52e193e502c2169a9705d1ff9a270db26408d75a9db12342",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché ; effets après sauvegarde non testés.",
    "implementation_use": "Disposition et états source ; appliquer le design CFitness et vérifier les droits.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-33",
    "file": "captures_administrateur_2026_11_13/33-beynost-alertes-temps.png",
    "url": "/references/captures_administrateur_2026_11_13/33-beynost-alertes-temps.png",
    "source_screen_ids": [
      "PAR03"
    ],
    "title": "beynost alertes temps",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; menu organisation accessible",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "7d8f648ce020830a93ae3e3d5c5d440acdb336af8884783c53218a4aaad65991",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché ; effets après sauvegarde non testés.",
    "implementation_use": "Disposition et états source ; appliquer le design CFitness et vérifier les droits.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-34",
    "file": "captures_administrateur_2026_11_13/34-beynost-alertes-pauses-coupures.png",
    "url": "/references/captures_administrateur_2026_11_13/34-beynost-alertes-pauses-coupures.png",
    "source_screen_ids": [
      "PAR03"
    ],
    "title": "beynost alertes pauses coupures",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; menu organisation accessible",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "f9bc5fa01b0f3f88f6d1d5a65d4dc5abd624e57a47c7e0f70c24294360cf387d",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché ; effets après sauvegarde non testés.",
    "implementation_use": "Disposition et états source ; appliquer le design CFitness et vérifier les droits.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-35",
    "file": "captures_administrateur_2026_11_13/35-beynost-alertes-complementaires.png",
    "url": "/references/captures_administrateur_2026_11_13/35-beynost-alertes-complementaires.png",
    "source_screen_ids": [
      "PAR03"
    ],
    "title": "beynost alertes complementaires",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; menu organisation accessible",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "013c500768ad02fa42e3aa4368fa518b79479011cd7b64438c2f4fa66f661729",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché ; effets après sauvegarde non testés.",
    "implementation_use": "Disposition et états source ; appliquer le design CFitness et vérifier les droits.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-36",
    "file": "captures_administrateur_2026_11_13/36-beynost-absences-employeur-debut.png",
    "url": "/references/captures_administrateur_2026_11_13/36-beynost-absences-employeur-debut.png",
    "source_screen_ids": [
      "PAR11",
      "PAR12"
    ],
    "title": "beynost absences employeur debut",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; menu organisation accessible",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "6d842e3d4f7b8669b6e42628e277f99baabfa563b3a3d0d2cad0a68bc9e46269",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché ; effets après sauvegarde non testés.",
    "implementation_use": "Disposition et états source ; appliquer le design CFitness et vérifier les droits.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-37",
    "file": "captures_administrateur_2026_11_13/37-beynost-absences-employeur-suite.png",
    "url": "/references/captures_administrateur_2026_11_13/37-beynost-absences-employeur-suite.png",
    "source_screen_ids": [
      "PAR11",
      "PAR12"
    ],
    "title": "beynost absences employeur suite",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; menu organisation accessible",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "f8ce24c5074d310c2e6d82bd6291490715b90ae874d0d6b84d946182c963c241",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché ; effets après sauvegarde non testés.",
    "implementation_use": "Disposition et états source ; appliquer le design CFitness et vérifier les droits.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-38",
    "file": "captures_administrateur_2026_11_13/38-beynost-absences-employeur-formation.png",
    "url": "/references/captures_administrateur_2026_11_13/38-beynost-absences-employeur-formation.png",
    "source_screen_ids": [
      "PAR11",
      "PAR12"
    ],
    "title": "beynost absences employeur formation",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; menu organisation accessible",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "cfa4e2aeb13dbffc15fa4ff8a1d9168962c47b6e30f9a9371629eaf4897537ac",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché ; effets après sauvegarde non testés.",
    "implementation_use": "Disposition et états source ; appliquer le design CFitness et vérifier les droits.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-39",
    "file": "captures_administrateur_2026_11_13/39-beynost-absences-employeur-repos.png",
    "url": "/references/captures_administrateur_2026_11_13/39-beynost-absences-employeur-repos.png",
    "source_screen_ids": [
      "PAR11",
      "PAR12"
    ],
    "title": "beynost absences employeur repos",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; menu organisation accessible",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "369b195580c8d75716fa1b36ab357fa73803baa2eb90418a53a5e0a3a38921ca",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché ; effets après sauvegarde non testés.",
    "implementation_use": "Disposition et états source ; appliquer le design CFitness et vérifier les droits.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-40",
    "file": "captures_administrateur_2026_11_13/40-beynost-absences-employeur-fin.png",
    "url": "/references/captures_administrateur_2026_11_13/40-beynost-absences-employeur-fin.png",
    "source_screen_ids": [
      "PAR11",
      "PAR12"
    ],
    "title": "beynost absences employeur fin",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; menu organisation accessible",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "9949c8134ceebd19671454103f1852c9b072c46cf9e7516e2267caecf7f3e6ff",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché ; effets après sauvegarde non testés.",
    "implementation_use": "Disposition et états source ; appliquer le design CFitness et vérifier les droits.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-41",
    "file": "captures_administrateur_2026_11_13/41-beynost-absences-tiers-debut.png",
    "url": "/references/captures_administrateur_2026_11_13/41-beynost-absences-tiers-debut.png",
    "source_screen_ids": [
      "PAR11",
      "PAR12"
    ],
    "title": "beynost absences tiers debut",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; menu organisation accessible",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "507f0ae8eed2b81ce3bd5bc0d7ec07bdd469776f5ce9938c2b596742bb9d02ac",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché ; effets après sauvegarde non testés.",
    "implementation_use": "Disposition et états source ; appliquer le design CFitness et vérifier les droits.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-42",
    "file": "captures_administrateur_2026_11_13/42-beynost-absences-tiers-fin.png",
    "url": "/references/captures_administrateur_2026_11_13/42-beynost-absences-tiers-fin.png",
    "source_screen_ids": [
      "PAR11",
      "PAR12"
    ],
    "title": "beynost absences tiers fin",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; menu organisation accessible",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "b9585994018add9639861a0a91a7ceec01cb9a2dad26766c9fd840ea4373d730",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché ; effets après sauvegarde non testés.",
    "implementation_use": "Disposition et états source ; appliquer le design CFitness et vérifier les droits.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-43",
    "file": "captures_administrateur_2026_11_13/43-beynost-absences-non-indemnisees-debut.png",
    "url": "/references/captures_administrateur_2026_11_13/43-beynost-absences-non-indemnisees-debut.png",
    "source_screen_ids": [
      "PAR11",
      "PAR12"
    ],
    "title": "beynost absences non indemnisees debut",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; menu organisation accessible",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "a9f50c90679d7c05fe4c1d0ce33b94a5d78662376698d592de0335179e480d21",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché ; effets après sauvegarde non testés.",
    "implementation_use": "Disposition et états source ; appliquer le design CFitness et vérifier les droits.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-44",
    "file": "captures_administrateur_2026_11_13/44-beynost-absences-non-indemnisees-fin.png",
    "url": "/references/captures_administrateur_2026_11_13/44-beynost-absences-non-indemnisees-fin.png",
    "source_screen_ids": [
      "PAR11",
      "PAR12"
    ],
    "title": "beynost absences non indemnisees fin",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; menu organisation accessible",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "9b3b52bc27705be401cdbad956b574aaf92170d0c88355e4c852f1a8fe41df35",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché ; effets après sauvegarde non testés.",
    "implementation_use": "Disposition et états source ; appliquer le design CFitness et vérifier les droits.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-45",
    "file": "captures_administrateur_2026_11_13/45-beynost-absences-neutres-fin.png",
    "url": "/references/captures_administrateur_2026_11_13/45-beynost-absences-neutres-fin.png",
    "source_screen_ids": [
      "PAR11",
      "PAR12"
    ],
    "title": "beynost absences neutres fin",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; menu organisation accessible",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "0ef4890f1ccfa341091e2e0a9912dd67571a3e24b8cf7e7108290bf9445282f6",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché ; effets après sauvegarde non testés.",
    "implementation_use": "Disposition et états source ; appliquer le design CFitness et vérifier les droits.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-46",
    "file": "captures_administrateur_2026_11_13/46-beynost-smart-planner-depassements.png",
    "url": "/references/captures_administrateur_2026_11_13/46-beynost-smart-planner-depassements.png",
    "source_screen_ids": [
      "PAR09"
    ],
    "title": "beynost smart planner depassements",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; menu organisation accessible",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "109e472d82ca9b2b39093a701c4c09a4d1009a591243198ec5430bff46707680",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché ; effets après sauvegarde non testés.",
    "implementation_use": "Disposition et états source ; appliquer le design CFitness et vérifier les droits.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-47",
    "file": "captures_administrateur_2026_11_13/47-beynost-smart-planner-durees.png",
    "url": "/references/captures_administrateur_2026_11_13/47-beynost-smart-planner-durees.png",
    "source_screen_ids": [
      "PAR09"
    ],
    "title": "beynost smart planner durees",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; menu organisation accessible",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "6a8f995045f0f5e1b7fc2896e4818742c46b6e6a67da6e5db452a828b0f6bfd0",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché ; effets après sauvegarde non testés.",
    "implementation_use": "Disposition et états source ; appliquer le design CFitness et vérifier les droits.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-48",
    "file": "captures_administrateur_2026_11_13/48-beynost-smart-planner-disponibilites.png",
    "url": "/references/captures_administrateur_2026_11_13/48-beynost-smart-planner-disponibilites.png",
    "source_screen_ids": [
      "PAR09"
    ],
    "title": "beynost smart planner disponibilites",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; menu organisation accessible",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "457ab0f0924373987c66d145f59ad70c570f1e6cecb5961454e344c5f6281473",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché ; effets après sauvegarde non testés.",
    "implementation_use": "Disposition et états source ; appliquer le design CFitness et vérifier les droits.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-49",
    "file": "captures_administrateur_2026_11_13/49-beynost-gestion-dossiers.png",
    "url": "/references/captures_administrateur_2026_11_13/49-beynost-gestion-dossiers.png",
    "source_screen_ids": [
      "PAR15"
    ],
    "title": "beynost gestion dossiers",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; menu organisation accessible",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "7b5aa2511a7270b7f87fe13c4770c41b8cb709a40629d81c2c7f1e08de979ebd",
    "scope": "Vue partielle après défilement ; consulter les vues adjacentes",
    "limits": "Paramétrage source affiché ; effets après sauvegarde non testés.",
    "implementation_use": "Disposition et états source ; appliquer le design CFitness et vérifier les droits.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-50",
    "file": "captures_administrateur_2026_11_13/50-carre-absences-employeur-debut.png",
    "url": "/references/captures_administrateur_2026_11_13/50-carre-absences-employeur-debut.png",
    "source_screen_ids": [
      "PAR11",
      "PAR12"
    ],
    "title": "carre absences employeur debut",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; paramètres organisation accessibles",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "89f8191cee04a6e6329eb32f7b47e18004cc212d666a14e7cc470e116ecc3481",
    "scope": "Vue partielle après défilement ; vues adjacentes pour la page complète",
    "limits": "États affichés ; effets après mise à jour non testés.",
    "implementation_use": "Disposition et réglages propres à l’établissement.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-51",
    "file": "captures_administrateur_2026_11_13/51-carre-absences-employeur-evenements.png",
    "url": "/references/captures_administrateur_2026_11_13/51-carre-absences-employeur-evenements.png",
    "source_screen_ids": [
      "PAR11",
      "PAR12"
    ],
    "title": "carre absences employeur evenements",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; paramètres organisation accessibles",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "c0a3e2251c8fe879436f4e8ccd7aa80d3001aba18623f9245eaf0edba9f09651",
    "scope": "Vue partielle après défilement ; vues adjacentes pour la page complète",
    "limits": "États affichés ; effets après mise à jour non testés.",
    "implementation_use": "Disposition et réglages propres à l’établissement.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-52",
    "file": "captures_administrateur_2026_11_13/52-carre-absences-employeur-conges.png",
    "url": "/references/captures_administrateur_2026_11_13/52-carre-absences-employeur-conges.png",
    "source_screen_ids": [
      "PAR11",
      "PAR12"
    ],
    "title": "carre absences employeur conges",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; paramètres organisation accessibles",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "6420a801c3faf8878afef71817cf3607cb101957447c933ca44e7117e60f012a",
    "scope": "Vue partielle après défilement ; vues adjacentes pour la page complète",
    "limits": "États affichés ; effets après mise à jour non testés.",
    "implementation_use": "Disposition et réglages propres à l’établissement.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-53",
    "file": "captures_administrateur_2026_11_13/53-carre-absences-employeur-formation.png",
    "url": "/references/captures_administrateur_2026_11_13/53-carre-absences-employeur-formation.png",
    "source_screen_ids": [
      "PAR11",
      "PAR12"
    ],
    "title": "carre absences employeur formation",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; paramètres organisation accessibles",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "f7c04c0cd8c503dcecdb24774a8029687351560c7dd31454798ce59e2700a863",
    "scope": "Vue partielle après défilement ; vues adjacentes pour la page complète",
    "limits": "États affichés ; effets après mise à jour non testés.",
    "implementation_use": "Disposition et réglages propres à l’établissement.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-54",
    "file": "captures_administrateur_2026_11_13/54-carre-absences-employeur-fin.png",
    "url": "/references/captures_administrateur_2026_11_13/54-carre-absences-employeur-fin.png",
    "source_screen_ids": [
      "PAR11",
      "PAR12"
    ],
    "title": "carre absences employeur fin",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; paramètres organisation accessibles",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "41c19512d11002347402bf0e8c1c359cc5000f94029bc8245cae3e90fcfbf5e5",
    "scope": "Vue partielle après défilement ; vues adjacentes pour la page complète",
    "limits": "États affichés ; effets après mise à jour non testés.",
    "implementation_use": "Disposition et réglages propres à l’établissement.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-55",
    "file": "captures_administrateur_2026_11_13/55-carre-absences-tiers-debut.png",
    "url": "/references/captures_administrateur_2026_11_13/55-carre-absences-tiers-debut.png",
    "source_screen_ids": [
      "PAR11",
      "PAR12"
    ],
    "title": "carre absences tiers debut",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; paramètres organisation accessibles",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "46c0a2afa0ca3d8ccd3f21345e7a23be8ced27f39b06b6a3dbf1c43194d44747",
    "scope": "Vue partielle après défilement ; vues adjacentes pour la page complète",
    "limits": "États affichés ; effets après mise à jour non testés.",
    "implementation_use": "Disposition et réglages propres à l’établissement.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-56",
    "file": "captures_administrateur_2026_11_13/56-carre-absences-tiers-conges.png",
    "url": "/references/captures_administrateur_2026_11_13/56-carre-absences-tiers-conges.png",
    "source_screen_ids": [
      "PAR11",
      "PAR12"
    ],
    "title": "carre absences tiers conges",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; paramètres organisation accessibles",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "5afae8043d2da25734f1d9567e4b4a6086db35fed46584757e12574430e49c7d",
    "scope": "Vue partielle après défilement ; vues adjacentes pour la page complète",
    "limits": "États affichés ; effets après mise à jour non testés.",
    "implementation_use": "Disposition et réglages propres à l’établissement.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-57",
    "file": "captures_administrateur_2026_11_13/57-carre-absences-tiers-fin.png",
    "url": "/references/captures_administrateur_2026_11_13/57-carre-absences-tiers-fin.png",
    "source_screen_ids": [
      "PAR11",
      "PAR12"
    ],
    "title": "carre absences tiers fin",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; paramètres organisation accessibles",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "95b829d5077ecc02e38cec60f816981e626be999269c736a2ca945cdf7a6f3c2",
    "scope": "Vue partielle après défilement ; vues adjacentes pour la page complète",
    "limits": "États affichés ; effets après mise à jour non testés.",
    "implementation_use": "Disposition et réglages propres à l’établissement.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-58",
    "file": "captures_administrateur_2026_11_13/58-carre-absences-non-indemnisees.png",
    "url": "/references/captures_administrateur_2026_11_13/58-carre-absences-non-indemnisees.png",
    "source_screen_ids": [
      "PAR11",
      "PAR12"
    ],
    "title": "carre absences non indemnisees",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; paramètres organisation accessibles",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "0b3d9af84df5da9053388157fe179d1255f63c4442b10239f140bd7e28d385c2",
    "scope": "Vue partielle après défilement ; vues adjacentes pour la page complète",
    "limits": "États affichés ; effets après mise à jour non testés.",
    "implementation_use": "Disposition et réglages propres à l’établissement.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-59",
    "file": "captures_administrateur_2026_11_13/59-carre-absences-neutres-fin.png",
    "url": "/references/captures_administrateur_2026_11_13/59-carre-absences-neutres-fin.png",
    "source_screen_ids": [
      "PAR11",
      "PAR12"
    ],
    "title": "carre absences neutres fin",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; paramètres organisation accessibles",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "f9d894d184dce5d8da4229a87cba8e82517cf0afa75c1261a8ebb19445ae8897",
    "scope": "Vue partielle après défilement ; vues adjacentes pour la page complète",
    "limits": "États affichés ; effets après mise à jour non testés.",
    "implementation_use": "Disposition et réglages propres à l’établissement.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-60",
    "file": "captures_administrateur_2026_11_13/60-carre-smart-planner-disponibilites.png",
    "url": "/references/captures_administrateur_2026_11_13/60-carre-smart-planner-disponibilites.png",
    "source_screen_ids": [
      "PAR09"
    ],
    "title": "carre smart planner disponibilites",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; paramètres organisation accessibles",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "03d42949ea0a44ba9a6882024bbc750da5977ee4b8c81c63a5de8b19608eeaf2",
    "scope": "Vue partielle après défilement ; vues adjacentes pour la page complète",
    "limits": "États affichés ; effets après mise à jour non testés.",
    "implementation_use": "Disposition et réglages propres à l’établissement.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-61",
    "file": "captures_administrateur_2026_11_13/61-carre-smart-planner-durees.png",
    "url": "/references/captures_administrateur_2026_11_13/61-carre-smart-planner-durees.png",
    "source_screen_ids": [
      "PAR09"
    ],
    "title": "carre smart planner durees",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; paramètres organisation accessibles",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "ed98bec1bd3f1cf079b5dc629ccd0c6c8037e75d16475d5f21268a7fb338fa8e",
    "scope": "Vue partielle après défilement ; vues adjacentes pour la page complète",
    "limits": "États affichés ; effets après mise à jour non testés.",
    "implementation_use": "Disposition et réglages propres à l’établissement.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-62",
    "file": "captures_administrateur_2026_11_13/62-carre-smart-planner-repos-depassements.png",
    "url": "/references/captures_administrateur_2026_11_13/62-carre-smart-planner-repos-depassements.png",
    "source_screen_ids": [
      "PAR09"
    ],
    "title": "carre smart planner repos depassements",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; paramètres organisation accessibles",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "2e341b50e9d24ebce4c986ea79273e80cb29f1b55fa92536982cd28abdbe8971",
    "scope": "Vue partielle après défilement ; vues adjacentes pour la page complète",
    "limits": "États affichés ; effets après mise à jour non testés.",
    "implementation_use": "Disposition et réglages propres à l’établissement.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-63",
    "file": "captures_administrateur_2026_11_13/63-carre-smart-planner-fin.png",
    "url": "/references/captures_administrateur_2026_11_13/63-carre-smart-planner-fin.png",
    "source_screen_ids": [
      "PAR09"
    ],
    "title": "carre smart planner fin",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; paramètres organisation accessibles",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "2993079bb671244388e0d698b8b0cec70dcb1073495e3e6d7d651a71a1b8f2c2",
    "scope": "Vue partielle après défilement ; vues adjacentes pour la page complète",
    "limits": "États affichés ; effets après mise à jour non testés.",
    "implementation_use": "Disposition et réglages propres à l’établissement.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-64",
    "file": "captures_administrateur_2026_11_13/64-carre-regles-debut.png",
    "url": "/references/captures_administrateur_2026_11_13/64-carre-regles-debut.png",
    "source_screen_ids": [
      "PAR01"
    ],
    "title": "carre regles debut",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "6b251bf53ffc7fa8f3536167fcc2156b36b4417553109de5bf0b322a772dc2a7",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-65",
    "file": "captures_administrateur_2026_11_13/65-carre-regles-repas.png",
    "url": "/references/captures_administrateur_2026_11_13/65-carre-regles-repas.png",
    "source_screen_ids": [
      "PAR01"
    ],
    "title": "carre regles repas",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "b308fac45f68d637e7a036eb64c1a4c89216f97d3f8826a148edd5abc4b103a3",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-66",
    "file": "captures_administrateur_2026_11_13/66-carre-repas-commencer-grise.png",
    "url": "/references/captures_administrateur_2026_11_13/66-carre-repas-commencer-grise.png",
    "source_screen_ids": [
      "PAR01"
    ],
    "title": "carre repas commencer grise",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "61e9745edc3f39f4f2467416477ebf3b85b3a67fb492c508ae240180d02aa607",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-67",
    "file": "captures_administrateur_2026_11_13/67-carre-compteurs-debut.png",
    "url": "/references/captures_administrateur_2026_11_13/67-carre-compteurs-debut.png",
    "source_screen_ids": [
      "PAR02"
    ],
    "title": "carre compteurs debut",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "97cbd47bcb83356f8baecdc211ae83548181b3e1c74c609f28d6bc4dc15e36a9",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-68",
    "file": "captures_administrateur_2026_11_13/68-carre-compteurs-annualisation.png",
    "url": "/references/captures_administrateur_2026_11_13/68-carre-compteurs-annualisation.png",
    "source_screen_ids": [
      "PAR02"
    ],
    "title": "carre compteurs annualisation",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "10a574782cb24ff26ab5b976bbc0c9fd223ea31d261a1ad0c3510886475a0c21",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-69",
    "file": "captures_administrateur_2026_11_13/69-carre-annualisation-avancee.png",
    "url": "/references/captures_administrateur_2026_11_13/69-carre-annualisation-avancee.png",
    "source_screen_ids": [
      "PAR02"
    ],
    "title": "carre annualisation avancee",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "a6bb2bc37632ba1dec70e978c5a953ada4064ce238315d27a17b6653a6b0ac06",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-70",
    "file": "captures_administrateur_2026_11_13/70-carre-annualisation-motifs-1.png",
    "url": "/references/captures_administrateur_2026_11_13/70-carre-annualisation-motifs-1.png",
    "source_screen_ids": [
      "PAR02"
    ],
    "title": "carre annualisation motifs 1",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "36d77ed0b2923405e09333298e5eb6c38a7910bea84e1bed4acab16f1dad1069",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-71",
    "file": "captures_administrateur_2026_11_13/71-carre-annualisation-motifs-2.png",
    "url": "/references/captures_administrateur_2026_11_13/71-carre-annualisation-motifs-2.png",
    "source_screen_ids": [
      "PAR02"
    ],
    "title": "carre annualisation motifs 2",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "a73b8cdf1cce0f38c4b11da5605e578f178318ce61334d5f9c6fce7b54cf1070",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-72",
    "file": "captures_administrateur_2026_11_13/72-carre-annualisation-motifs-3.png",
    "url": "/references/captures_administrateur_2026_11_13/72-carre-annualisation-motifs-3.png",
    "source_screen_ids": [
      "PAR02"
    ],
    "title": "carre annualisation motifs 3",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "639226876a26bd74aa395a5afdb62e0dfa597f590dfbda1f75c4f6ecd103df82",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-73",
    "file": "captures_administrateur_2026_11_13/73-carre-annualisation-motifs-4.png",
    "url": "/references/captures_administrateur_2026_11_13/73-carre-annualisation-motifs-4.png",
    "source_screen_ids": [
      "PAR02"
    ],
    "title": "carre annualisation motifs 4",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "223edf9bda2ba983f7c2ec5509d36550b5339714a507f1fedca2e504d5bbc309",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-74",
    "file": "captures_administrateur_2026_11_13/74-carre-annualisation-motifs-5.png",
    "url": "/references/captures_administrateur_2026_11_13/74-carre-annualisation-motifs-5.png",
    "source_screen_ids": [
      "PAR02"
    ],
    "title": "carre annualisation motifs 5",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "b9a18f235d78fc2b6d0e73e9039ba18a6422a7f106f2c75093c8c60ca757cda2",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-75",
    "file": "captures_administrateur_2026_11_13/75-carre-annualisation-motifs-6.png",
    "url": "/references/captures_administrateur_2026_11_13/75-carre-annualisation-motifs-6.png",
    "source_screen_ids": [
      "PAR02"
    ],
    "title": "carre annualisation motifs 6",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "d08cdb7c8995afb130f689708449ab550527a05145d8ad78aa5cf68224850211",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-76",
    "file": "captures_administrateur_2026_11_13/76-carre-annualisation-motifs-7.png",
    "url": "/references/captures_administrateur_2026_11_13/76-carre-annualisation-motifs-7.png",
    "source_screen_ids": [
      "PAR02"
    ],
    "title": "carre annualisation motifs 7",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "0f306f257ea6698894bd86d82899e78c54c38bf222527f2fc8b5d04c03c450f7",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-77",
    "file": "captures_administrateur_2026_11_13/77-carre-annualisation-motifs-8.png",
    "url": "/references/captures_administrateur_2026_11_13/77-carre-annualisation-motifs-8.png",
    "source_screen_ids": [
      "PAR02"
    ],
    "title": "carre annualisation motifs 8",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "bc6090ae425d4224c80ec9dc67e33a71a52b3c09a496a58ac853f78c4668366d",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-78",
    "file": "captures_administrateur_2026_11_13/78-carre-prediction-inactive.png",
    "url": "/references/captures_administrateur_2026_11_13/78-carre-prediction-inactive.png",
    "source_screen_ids": [
      "PAR08"
    ],
    "title": "carre prediction inactive",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "d834271eddbb14b7cedb9a7e0fe2a4184a154020503d9554444334401d20557c",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-79",
    "file": "captures_administrateur_2026_11_13/79-carre-besoins-fixes-vides.png",
    "url": "/references/captures_administrateur_2026_11_13/79-carre-besoins-fixes-vides.png",
    "source_screen_ids": [
      "PAR18"
    ],
    "title": "carre besoins fixes vides",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "e9f382a5990fff620bc2043d5b11d5549893151fb34994302dad48b3cf463842",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-80",
    "file": "captures_administrateur_2026_11_13/80-carre-besoin-fixe-formulaire-vide.png",
    "url": "/references/captures_administrateur_2026_11_13/80-carre-besoin-fixe-formulaire-vide.png",
    "source_screen_ids": [
      "PAR18"
    ],
    "title": "carre besoin fixe formulaire vide",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "ad0e3e6823d62d30357c4d9e33f16c450e4087e10a7eb9ead62ec7ada2e7be33",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-81",
    "file": "captures_administrateur_2026_11_13/81-carre-besoins-variables-vides.png",
    "url": "/references/captures_administrateur_2026_11_13/81-carre-besoins-variables-vides.png",
    "source_screen_ids": [
      "PAR18"
    ],
    "title": "carre besoins variables vides",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "f4f170ce85af536680b632f6c8ad29d354b193e95fe9d151d8e595fcfee7e58e",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-82",
    "file": "captures_administrateur_2026_11_13/82-carre-besoin-variable-formulaire.png",
    "url": "/references/captures_administrateur_2026_11_13/82-carre-besoin-variable-formulaire.png",
    "source_screen_ids": [
      "PAR18"
    ],
    "title": "carre besoin variable formulaire",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "65b46cdba99a5cf61be728d9fb9e0b7a52603cef385dbc916676c4fac2d37221",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-83",
    "file": "captures_administrateur_2026_11_13/83-carre-besoin-variable-decalage.png",
    "url": "/references/captures_administrateur_2026_11_13/83-carre-besoin-variable-decalage.png",
    "source_screen_ids": [
      "PAR18"
    ],
    "title": "carre besoin variable decalage",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Carré de Soie",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "5d6835aaf4056a586353803f5c1ad87fa33651d928fbac7b4691fd9baab4c83c",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-84",
    "file": "captures_administrateur_2026_11_13/84-beynost-regles-debut.png",
    "url": "/references/captures_administrateur_2026_11_13/84-beynost-regles-debut.png",
    "source_screen_ids": [
      "PAR01"
    ],
    "title": "beynost regles debut",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "bdc48f242a916bba7f1cdbcf53134aa3d3b833409ae7927e41815f214f60089d",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-85",
    "file": "captures_administrateur_2026_11_13/85-beynost-regles-repas.png",
    "url": "/references/captures_administrateur_2026_11_13/85-beynost-regles-repas.png",
    "source_screen_ids": [
      "PAR01"
    ],
    "title": "beynost regles repas",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "7f85b4f6c597056453c50fb9b59e8242106f3f398e869c3f260b08d2f6ca1141",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-86",
    "file": "captures_administrateur_2026_11_13/86-beynost-compteurs-debut.png",
    "url": "/references/captures_administrateur_2026_11_13/86-beynost-compteurs-debut.png",
    "source_screen_ids": [
      "PAR02"
    ],
    "title": "beynost compteurs debut",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "aad9a58f1c1524635434b6afbbe846f62477b2b424a5fc732474785ba55e7c81",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-87",
    "file": "captures_administrateur_2026_11_13/87-beynost-compteurs-modes-et-annualisation.png",
    "url": "/references/captures_administrateur_2026_11_13/87-beynost-compteurs-modes-et-annualisation.png",
    "source_screen_ids": [
      "PAR02"
    ],
    "title": "beynost compteurs modes et annualisation",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "4728ea6a321664ad721d4a9ff5c049b36406e768902f89f3ebb517ddb56d5f6e",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-88",
    "file": "captures_administrateur_2026_11_13/88-beynost-annualisation-avancee.png",
    "url": "/references/captures_administrateur_2026_11_13/88-beynost-annualisation-avancee.png",
    "source_screen_ids": [
      "PAR02"
    ],
    "title": "beynost annualisation avancee",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "35d4203364e3f1aa52fde0dfa5d07c22e7123482d2955edfa65479c5ac7bf76f",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-89",
    "file": "captures_administrateur_2026_11_13/89-beynost-annualisation-motifs-1.png",
    "url": "/references/captures_administrateur_2026_11_13/89-beynost-annualisation-motifs-1.png",
    "source_screen_ids": [
      "PAR02"
    ],
    "title": "beynost annualisation motifs 1",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "240bc2a5f5db00298c262beaecdd2b01ea731b5656d673a137247eabe2b99360",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-90",
    "file": "captures_administrateur_2026_11_13/90-beynost-annualisation-motifs-2.png",
    "url": "/references/captures_administrateur_2026_11_13/90-beynost-annualisation-motifs-2.png",
    "source_screen_ids": [
      "PAR02"
    ],
    "title": "beynost annualisation motifs 2",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "b24061f363be6fe42d88d5e411290e5ba412213375eaa69f2ec971c8ac513cb8",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-91",
    "file": "captures_administrateur_2026_11_13/91-beynost-annualisation-motifs-3.png",
    "url": "/references/captures_administrateur_2026_11_13/91-beynost-annualisation-motifs-3.png",
    "source_screen_ids": [
      "PAR02"
    ],
    "title": "beynost annualisation motifs 3",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "cd6de20e64ddae18ce3ada7b8f34c61f85aa018ca4f0c1e57cbb71f7c0ca244b",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-92",
    "file": "captures_administrateur_2026_11_13/92-beynost-annualisation-motifs-4.png",
    "url": "/references/captures_administrateur_2026_11_13/92-beynost-annualisation-motifs-4.png",
    "source_screen_ids": [
      "PAR02"
    ],
    "title": "beynost annualisation motifs 4",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "cb6691369780bd58108fe1ed094e71dd1214937af407e5557a7bbbfd78363465",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-93",
    "file": "captures_administrateur_2026_11_13/93-beynost-annualisation-motifs-5.png",
    "url": "/references/captures_administrateur_2026_11_13/93-beynost-annualisation-motifs-5.png",
    "source_screen_ids": [
      "PAR02"
    ],
    "title": "beynost annualisation motifs 5",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "53dd247a5bf686cb3cd34b7b9674bff9345be52ce20a1bfbba69753c58f31cdf",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-94",
    "file": "captures_administrateur_2026_11_13/94-beynost-annualisation-motifs-6.png",
    "url": "/references/captures_administrateur_2026_11_13/94-beynost-annualisation-motifs-6.png",
    "source_screen_ids": [
      "PAR02"
    ],
    "title": "beynost annualisation motifs 6",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "89fae70e3ff76f59c9227c3aba425807601b04f6e620fd9e77115f67e8bd283e",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-95",
    "file": "captures_administrateur_2026_11_13/95-beynost-annualisation-motifs-7.png",
    "url": "/references/captures_administrateur_2026_11_13/95-beynost-annualisation-motifs-7.png",
    "source_screen_ids": [
      "PAR02"
    ],
    "title": "beynost annualisation motifs 7",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "12e09c294519802e7278627d1a67c59c4a6dc11a3be6158e9eb19da6f917fd77",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-96",
    "file": "captures_administrateur_2026_11_13/96-beynost-annualisation-motifs-8.png",
    "url": "/references/captures_administrateur_2026_11_13/96-beynost-annualisation-motifs-8.png",
    "source_screen_ids": [
      "PAR02"
    ],
    "title": "beynost annualisation motifs 8",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "8618ac80c9a283d7bfc12ae013adc3a102e115133fc8cb5450db7a7392cb25fc",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-97",
    "file": "captures_administrateur_2026_11_13/97-beynost-missions-terminees-grise.png",
    "url": "/references/captures_administrateur_2026_11_13/97-beynost-missions-terminees-grise.png",
    "source_screen_ids": [
      "MIS01",
      "MIS02"
    ],
    "title": "beynost missions terminees grise",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "12f67f30cca35f6d79668f4550c0db86331b72608dda9fdcbd31fc46b052e245",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-98",
    "file": "captures_administrateur_2026_11_13/98-beynost-historique-corrections-vide.png",
    "url": "/references/captures_administrateur_2026_11_13/98-beynost-historique-corrections-vide.png",
    "source_screen_ids": [
      "BAD02"
    ],
    "title": "beynost historique corrections vide",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "a283bda920fb92f2811df6cc2a8e2f8f4dff76ff2c3902b8586b8f819438261e",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  },
  {
    "id": "CAP-ADM13-99",
    "file": "captures_administrateur_2026_11_13/99-beynost-compteurs-annualisation-sans-menu.png",
    "url": "/references/captures_administrateur_2026_11_13/99-beynost-compteurs-annualisation-sans-menu.png",
    "source_screen_ids": [
      "PAR02"
    ],
    "title": "beynost compteurs annualisation sans menu",
    "date": "2026-11-13",
    "profile": "Administrateur système déclaré ; accès organisation présent",
    "site_context": "Beynost",
    "kind": "Capture réelle Skello, sans retouche",
    "width": 2944,
    "height": 1572,
    "sha256": "e9a2c8950c848680ff8bb89a09d0f407309d30dd3011f24b90ed8c21648e1840",
    "scope": "Vue partielle ; vues adjacentes pour la page complète",
    "limits": "Configuration source, brouillon non enregistré ou état vide. Résultats métier non testés.",
    "implementation_use": "Disposition, contexte, contrôles et états à rapprocher du complément de variantes.",
    "encoding": "JPEG",
    "mime_type": "image/jpeg"
  }
];

export const EMULATION_CAPTURES: EmulationCaptureRef[] = [
  {
    "id": "CAP-EMUL-01",
    "file": "captures_emulation_web_2026_11_13/01-iphone-se-compteurs-web.jpg",
    "url": "/references/captures_emulation_web_2026_11_13/01-iphone-se-compteurs-web.jpg",
    "format": "JPEG",
    "width": 2944,
    "height": 1572,
    "sha256": "3346aca6ae6126d245e25603da963b6bcd976eb5d3f1e5d0cc9868866e57565a",
    "note": "Capture réelle du navigateur avec outils de simulation visibles ; aucune retouche.",
    "device": "iPhone SE (375x667)"
  },
  {
    "id": "CAP-EMUL-02",
    "file": "captures_emulation_web_2026_11_13/02-ipad-mini-compteurs-web.jpg",
    "url": "/references/captures_emulation_web_2026_11_13/02-ipad-mini-compteurs-web.jpg",
    "format": "JPEG",
    "width": 2944,
    "height": 1572,
    "sha256": "2cd1a8d6d53f7a68a71df7187a4568efdc2c5784f4aab6b494665c19054bd52b",
    "note": "Capture réelle du navigateur avec outils de simulation visibles ; aucune retouche.",
    "device": "iPad Mini (768x1024)"
  },
  {
    "id": "CAP-EMUL-03",
    "file": "captures_emulation_web_2026_11_14/03-ipad-mini-regles-web.jpg",
    "url": "/references/captures_emulation_web_2026_11_14/03-ipad-mini-regles-web.jpg",
    "format": "JPEG",
    "width": 2944,
    "height": 1572,
    "sha256": "c0de3d27fa58659e5a735dc886fe5a351500967e0be6e005c115b12d2a0ff212",
    "note": "Capture réelle avec navigateur et outils d’émulation visibles ; aucune retouche, aucune valeur de dossier salarié.",
    "device": "iPad Mini (768x1024)"
  },
  {
    "id": "CAP-EMUL-04",
    "file": "captures_emulation_web_2026_11_14/04-iphone-se-regles-web.jpg",
    "url": "/references/captures_emulation_web_2026_11_14/04-iphone-se-regles-web.jpg",
    "format": "JPEG",
    "width": 2944,
    "height": 1572,
    "sha256": "e6ac1fa3b381ab6d72a1c02a0306e7dfbe0bc4727ee7898a78804029e0779b07",
    "note": "Capture réelle avec navigateur et outils d’émulation visibles ; aucune retouche, aucune valeur de dossier salarié.",
    "device": "iPhone SE (375x667)"
  },
  {
    "id": "CAP-EMUL-05",
    "file": "captures_emulation_web_2026_11_14/05-iphone-se-organisation-web.jpg",
    "url": "/references/captures_emulation_web_2026_11_14/05-iphone-se-organisation-web.jpg",
    "format": "JPEG",
    "width": 2944,
    "height": 1572,
    "sha256": "335a2005b8f49404e7abe0bb8474304addbbb755bd7df54b04ec880bee0e51db",
    "note": "Capture réelle avec navigateur et outils d’émulation visibles ; aucune retouche, aucune valeur de dossier salarié.",
    "device": "iPhone SE (375x667)"
  },
  {
    "id": "CAP-EMUL-06",
    "file": "captures_emulation_web_2026_11_14/06-iphone-se-permissions-web.jpg",
    "url": "/references/captures_emulation_web_2026_11_14/06-iphone-se-permissions-web.jpg",
    "format": "JPEG",
    "width": 2944,
    "height": 1572,
    "sha256": "c2757204b45c81540eebf5f779c5ed13baf82095ebb60274f9e64f25fd838437",
    "note": "Capture réelle avec navigateur et outils d’émulation visibles ; aucune retouche, aucune valeur de dossier salarié.",
    "device": "iPhone SE (375x667)"
  },
  {
    "id": "CAP-EMUL-07",
    "file": "captures_emulation_web_2026_11_14/07-ipad-mini-permissions-web.jpg",
    "url": "/references/captures_emulation_web_2026_11_14/07-ipad-mini-permissions-web.jpg",
    "format": "JPEG",
    "width": 2944,
    "height": 1572,
    "sha256": "093080fd15ecc1e1f629a8f35531057abac5eaeceef67254b96de8d17cabf25c",
    "note": "Capture réelle avec navigateur et outils d’émulation visibles ; aucune retouche, aucune valeur de dossier salarié.",
    "device": "iPad Mini (768x1024)"
  },
  {
    "id": "CAP-EMUL-08",
    "file": "captures_emulation_web_2026_11_14/08-ipad-mini-volet-droits-master-web.jpg",
    "url": "/references/captures_emulation_web_2026_11_14/08-ipad-mini-volet-droits-master-web.jpg",
    "format": "JPEG",
    "width": 2944,
    "height": 1572,
    "sha256": "628b0dc2d1b469c8be796e9dce015c0c7fcaf9e482a27350faa9619a0bf2e1bf",
    "note": "Capture réelle avec navigateur et outils d’émulation visibles ; aucune retouche, aucune valeur de dossier salarié.",
    "device": "iPad Mini (768x1024)"
  },
  {
    "id": "CAP-EMUL-09",
    "file": "captures_emulation_web_2026_11_14/09-iphone-se-volet-droits-master-web.jpg",
    "url": "/references/captures_emulation_web_2026_11_14/09-iphone-se-volet-droits-master-web.jpg",
    "format": "JPEG",
    "width": 2944,
    "height": 1572,
    "sha256": "42d5333f917f101b97a73737e0a3cda379b50e5e5059dc4d951ccce6c13852a4",
    "note": "Capture réelle avec navigateur et outils d’émulation visibles ; aucune retouche, aucune valeur de dossier salarié.",
    "device": "iPhone SE (375x667)"
  }
];

export const EMULATION_META = {
  "method": "Émulation d’appareil dans Chrome, pilotée par l’interface",
  "presets_verified": [
    {
      "name": "iPhone SE",
      "viewport_css_pixels": [
        375,
        667
      ],
      "page_reloaded": true,
      "observation": "La navigation de bureau et la colonne des paramètres occupent une grande partie du petit écran ; contenu principal et navigation supérieure tronqués dans la vue initiale."
    },
    {
      "name": "iPad Mini",
      "viewport_css_pixels": [
        768,
        1024
      ],
      "page_reloaded_after_preset_change": false,
      "observation": "Colonne de paramètres et contenu principal visibles ; navigation supérieure partiellement hors du cadre dans la vue initiale."
    }
  ],
  "screens_checked": [
    {
      "refs": [
        "PAR02"
      ],
      "case": "Compteurs Beynost",
      "devices": [
        "iPhone SE",
        "iPad Mini"
      ],
      "date": "2026-11-13"
    },
    {
      "refs": [
        "PAR01"
      ],
      "case": "Règles Beynost",
      "devices": [
        "iPhone SE",
        "iPad Mini"
      ],
      "date": "2026-11-14",
      "observation": "Sur téléphone, colonne latérale dominante et corps tronqué ; tablette : deux colonnes lisibles, navigation supérieure partiellement hors cadre."
    },
    {
      "refs": [
        "ORG01"
      ],
      "case": "Organisation",
      "devices": [
        "iPhone SE"
      ],
      "date": "2026-11-14",
      "observation": "Navigation latérale lisible, corps de page largement hors cadre. Champs d’organisation non inspectés au format tablette dans cette passe."
    },
    {
      "refs": [
        "ORG03"
      ],
      "case": "Cartes des niveaux de permission",
      "devices": [
        "iPhone SE",
        "iPad Mini"
      ],
      "date": "2026-11-14",
      "observation": "Corps tronqué sur téléphone ; une colonne de cartes visible sur tablette, avec défilement vertical."
    },
    {
      "refs": [
        "DRO01"
      ],
      "case": "Personnaliser Master avancé",
      "devices": [
        "iPhone SE",
        "iPad Mini"
      ],
      "date": "2026-11-14",
      "observation": "Volet cadré sur les deux formats ; Annuler et Enregistrer visibles. Seule la partie initiale a été examinée ; aucune case ni portée modifiée, fermeture par Annuler."
    }
  ],
  "limits": [
    "Cinq cas web partiels, avec références téléphone/tablette non symétriques ; ni audit complet des rubriques ni essai des applications natives.",
    "Émulation Chrome, ni application native ni preuve du rendu Safari iOS.",
    "Caméra, géolocalisation, notifications système, hors-ligne, signature et pointage non testés."
  ]
};

export const HISTORICAL_PLANS: HistoricalPlanRef[] = [
  {
    "id": "PLAN-HIST-01",
    "file": "plans/employee.png",
    "url": "/references/plans/employee.png",
    "title": "Schéma historique — Dossier & espace Employé",
    "note": "Diagramme historique de cadrage dans plans/ (non compté comme capture récente d’administration)."
  },
  {
    "id": "PLAN-HIST-02",
    "file": "plans/planning.png",
    "url": "/references/plans/planning.png",
    "title": "Schéma historique — Vue Planning",
    "note": "Diagramme historique de cadrage dans plans/ (non compté comme capture récente d’administration)."
  },
  {
    "id": "PLAN-HIST-03",
    "file": "plans/report.png",
    "url": "/references/plans/report.png",
    "title": "Schéma historique — Rapport & Paie",
    "note": "Diagramme historique de cadrage dans plans/ (non compté comme capture récente d’administration)."
  }
];

export const PARTNER_CATALOGUES: PartnerCatalogues = {
  "caisse": [
    "Abill",
    "Addictill",
    "Agora",
    "Apitic",
    "Atilla",
    "BDP",
    "Breeze",
    "CarrePOS",
    "Cashmag",
    "Cashpad",
    "Cegid Retail",
    "Clyo Systems",
    "Connectill",
    "Fastmag",
    "Fulleapps",
    "HelloCash",
    "Hiboutik",
    "Hosteltactil (by Loomis)",
    "Innovorder",
    "iPratico",
    "Izipass",
    "Jalia - JDC",
    "L'Addition",
    "Last.app",
    "Leo2",
    "Lightspeed (K Series)",
    "Neo",
    "Numier",
    "Odoo POS",
    "PI Electronique",
    "Popina",
    "Restomax",
    "Revo",
    "ShopCaisse",
    "Shopify POS",
    "Simphony",
    "Square",
    "SumUp POS",
    "Synapsy",
    "Tactilpad",
    "Tiller",
    "Toporder | myPOS Cash Register",
    "Trivec",
    "Untill",
    "Zelty",
    "Zettle"
  ],
  "paie": [
    "Silae",
    "Cegedim",
    "PayFit",
    "Quadratus",
    "Cegid",
    "Sage",
    "e-Paye",
    "ADP",
    "Extalys",
    "Inexpaie",
    "SDWorx",
    "PartenaSI",
    "Acerta",
    "GroupS",
    "YEAP",
    "CGSoft"
  ],
  "sirh": {
    "outbound": [
      "Silae",
      "Cegedim"
    ],
    "inbound": [
      "Lucca"
    ],
    "activation": "Contacter le référent Skello"
  },
  "analyse": [
    "Dvore",
    "Yokitup",
    "GoTenzo",
    "API analytique Skello",
    "TimeSkipper"
  ],
  "recrutement": [
    "Layan",
    "Softy (Altagile)"
  ],
  "acompte": [
    "Rosaly",
    "Spayr"
  ]
};

export const ADMIN_OBSERVATIONS_SUMMARY = [
  {
    "id": "ADM13-01",
    "refs": [
      "ORG01",
      "ORG03",
      "INT01",
      "JOU01"
    ],
    "observation": "Navigation d’organisation : Organisation, Abonnement & facturation, Niveaux de permission & actions, Intégrations, Journal d’activité. Accès depuis Paramètres de l’organisation. Le profil administrateur est déclaré par le propriétaire ; accès aux pages d’organisation effectivement constaté."
  },
  {
    "id": "ADM13-02",
    "refs": [
      "INT01"
    ],
    "observation": "Six catégories distinctes effectivement ouvertes : Logiciels de caisse, Logiciels de paie, Logiciels SIRH, Logiciels d’analyse, Logiciels de recrutement, Logiciels d’acompte sur salaire. La dernière paire partage la fiche source INT06 mais constitue bien deux onglets source."
  },
  {
    "id": "ADM13-03",
    "refs": [
      "INT02"
    ],
    "observation": "Catalogue caisse : 46 noms relevés. Texte de synchronisation quotidienne du CA de la veille à 5 h. La liste exacte est conservée dans catalogues.caisse ; elle ne prouve pas que les connexions sont activées ni que chaque configuration a été ouverte."
  },
  {
    "id": "ADM13-04",
    "refs": [
      "INT03"
    ],
    "observation": "Catalogue paie : 16 noms conservés. Tous annoncent Export EVP compatible ; Silae, Cegedim et PayFit annoncent aussi Données employés connectées. Cette mention décrit une capacité proposée, pas une connexion active sur le compte. Cliquer le libellé PayFit du catalogue n’a ouvert aucun détail ; aucun export effectué."
  },
  {
    "id": "ADM13-05",
    "refs": [
      "INT04"
    ],
    "observation": "SIRH : sens sortant Skello vers Silae et Cegedim ; sens entrant Lucca vers Skello. Boutons Se connecter pour Silae/Cegedim visibles dans la capture ; non actionnés. Lucca demande de contacter le référent Skello. Lien FAQ visible, fonctionnement du connecteur non testé."
  },
  {
    "id": "ADM13-06",
    "refs": [
      "INT05"
    ],
    "observation": "Analyse : Dvore, Yokitup, GoTenzo, API analytique Skello, TimeSkipper. Dvore, Yokitup et API analytique affichent un interrupteur off et un chevron grisé. Aucun interrupteur actionné ; clic sur le libellé API sans ouverture du volet. Paramètres conditionnels de ces trois connecteurs non accessibles dans cet état sans activation."
  },
  {
    "id": "ADM13-07",
    "refs": [
      "INT05"
    ],
    "observation": "Volet GoTenzo ouvert : intégration des données de performances, prise de contact avec le référent Skello et lien vers un document de partenariat à signer puis envoyer. Document non ouvert, non signé et non envoyé. Le lien ne constitue pas une spécification technique native API."
  },
  {
    "id": "ADM13-08",
    "refs": [
      "INT05"
    ],
    "observation": "Volet TimeSkipper ouvert : remontée des données de planning, lien TimeSkipper et instruction de contacter son équipe pour activer. Aucune prise de contact ni activation."
  },
  {
    "id": "ADM13-09",
    "refs": [
      "INT06"
    ],
    "observation": "Recrutement : Layan et Softy (Altagile) sont les deux offres affichées dans la session. Chacune indique de contacter le référent Skello pour faire remonter les données vers Skello. Teamtailor décrit dans la documentation publique n’était pas présent dans ce catalogue consulté ; ne pas confondre sources documentaires et visibilité sur ce compte."
  },
  {
    "id": "ADM13-10",
    "refs": [
      "INT06"
    ],
    "observation": "Acompte sur salaire : Rosaly et Spayr affichés avec volets dépliables ; texte de présentation et prise de contact avec le référent. Aucune demande d’acompte, connexion ou opération financière exécutée. Le contenu des volets reste qualifié séparément s’il est ouvert lors de la reprise."
  },
  {
    "id": "ADM13-11",
    "refs": [
      "ORG01"
    ],
    "observation": "Organisation : nom obligatoire, dénomination sociale obligatoire, adresse, code postal, ville, région, pays, SIREN, TVA ; contact principal, montant des repas pris en charge, secteur d’activité, autorisation de badger hors site, Mettre à jour. Valeurs d’identité et coordonnées non recopiées dans ce complément."
  },
  {
    "id": "ADM13-12",
    "refs": [
      "ORG01"
    ],
    "observation": "Sélecteur secteur ouvert sans sélectionner : Restaurants, Cafés & Bistrots, Boulangerie, Hôtels, Supermarchés, Boutiques, Services de santé, Institutions publiques, Autres. Fermé par Échap. Autorisation de badger hors site visuellement off ; aucun changement de ce réglage."
  },
  {
    "id": "ADM13-13",
    "refs": [
      "PAR13"
    ],
    "observation": "Établissement Beynost : nom/dénomination sociale, adresse, code postal, ville/région, fuseau horaire, SIRET, TVA, matricule de paie de l’établissement, code NAF/APE, code URSSAF, Service de Santé au Travail et commande Mettre à jour. Aucun champ modifié ; listes conditionnelles non intégralement parcourues."
  },
  {
    "id": "ADM13-14",
    "refs": [
      "ORG03",
      "DRO03"
    ],
    "observation": "Six cartes de profils et cinq commandes Personnaliser, avec Voir pour Administrateur système. Ouverture de Personnaliser Planificateur avancé, lecture des 44 cases et de la portée établissement ; Annuler utilisé sans cocher ni enregistrer. Les captures sont partielles et ne montrent pas simultanément les 44 lignes."
  },
  {
    "id": "ADM13-15",
    "refs": [
      "DRO03"
    ],
    "observation": "Recontrôle des 44 états Planificateur avancé rapproché de la matrice antérieure. Ajouter un shift décoché, Modifier les shifts coché, voir les données sensibles décoché, avenant décoché et grisé, accès au rapport coché, réglages export décoché. Ces états configurés ne démontrent pas chaque contrôle serveur ou effet métier."
  }
];

export const CLUB_COMPARISON = {
  "date": "2026-11-13",
  "scope": "États affichés des deux clubs : badgeuse, 19 alertes, 66 motifs d’absence et 14 règles Smart Planner par site ; sept groupes de règles du rapport Carré. Aucun effet métier testé.",
  "badge_settings": {
    "Beynost": {
      "arrival_early": "planned",
      "arrival_late": "punched",
      "departure_early": "punched",
      "departure_late": "planned",
      "rounding_enabled": false,
      "rounding_minutes_displayed": 5,
      "rounding_minutes_disabled": true,
      "minimum_planned_break": false,
      "late_sms_enabled": true,
      "late_sms_after_minutes": 5,
      "late_sms_recipients_count": 2,
      "secondary_badge_target": "site_where_badged",
      "tablet_signature": false,
      "tablet_photo": true,
      "tablet_photo_mode": "systematic",
      "multi_device": false,
      "mobile_enabled": true,
      "mobile_employees_selected_count": 0,
      "mobile_break_badging": false,
      "frequency": "consecutive_shift_series",
      "tablet_break_badging": false
    },
    "Carré de Soie": {
      "arrival_early": "planned",
      "arrival_late": "punched",
      "departure_early": "punched",
      "departure_late": "planned",
      "rounding_enabled": false,
      "rounding_minutes_displayed": 5,
      "rounding_minutes_disabled": true,
      "minimum_planned_break": false,
      "late_sms_enabled": true,
      "late_sms_after_minutes": 5,
      "late_sms_recipients_count": 2,
      "secondary_badge_target": "site_where_badged",
      "tablet_signature": false,
      "tablet_photo": true,
      "tablet_photo_mode": "systematic",
      "multi_device": false,
      "mobile_enabled": true,
      "mobile_employees_selected_count": 0,
      "mobile_break_badging": false,
      "frequency": "each_shift",
      "tablet_break_badging": true
    }
  },
  "differences": [
    {
      "setting": "frequency",
      "Beynost": "série de shifts consécutifs",
      "Carré de Soie": "chaque shift"
    },
    {
      "setting": "tablet_break_badging",
      "Beynost": false,
      "Carré de Soie": true
    },
    {
      "setting": "alerts_layout",
      "Beynost": "Liste unique, seuils en texte",
      "Carré de Soie": "13 alertes personnalisables et 6 non personnalisables"
    },
    {
      "setting": "consecutive_days_blocking",
      "Beynost": false,
      "Carré de Soie": true
    },
    {
      "setting": "break_threshold_display",
      "Beynost": "2 heures, alerte désactivée",
      "Carré de Soie": "4 heures, alerte activée"
    },
    {
      "setting": "complementary_maximum_display",
      "Beynost": "35 heures",
      "Carré de Soie": "39 heures"
    },
    {
      "setting": "smart_planner_break_maximum",
      "Beynost": "2 h, actif",
      "Carré de Soie": "4 h, actif"
    }
  ],
  "carre_report_rules": [
    {
      "group": "Heures supplémentaires (temps pleins)",
      "fields": [
        [
          "Tranche 1 · début (h)",
          "35"
        ],
        [
          "Tranche 1 · fin (h)",
          "43"
        ],
        [
          "Tranche 1 · majoration (%)",
          "0"
        ],
        [
          "Tranche 2 · début (h)",
          "43"
        ],
        [
          "Tranche 2 · fin (h)",
          "50"
        ],
        [
          "Tranche 2 · majoration (%)",
          "0"
        ]
      ],
      "add_band_visible": true,
      "delete_band_visible": true
    },
    {
      "group": "Heures complémentaires (temps partiels)",
      "fields": [
        [
          "Tranche 1 · plafond (%)",
          "10"
        ],
        [
          "Tranche 1 · majoration (%)",
          "0"
        ],
        [
          "Tranche 2 · plafond (%) · grisé",
          "10"
        ],
        [
          "Tranche 2 · majoration (%)",
          "0"
        ]
      ]
    },
    {
      "group": "Heures de nuit",
      "fields": [
        [
          "Début",
          "23:00"
        ],
        [
          "Fin",
          "07:00"
        ],
        [
          "Majoration (%)",
          "0"
        ]
      ],
      "add_band_visible": true
    },
    {
      "group": "Heures du dimanche",
      "fields": [
        [
          "Début",
          "00:00"
        ],
        [
          "Fin",
          "24:00"
        ],
        [
          "Majoration (%)",
          "100"
        ]
      ],
      "add_band_visible": true
    },
    {
      "group": "Jours fériés hors 1er mai",
      "fields": [
        [
          "Majoration (%)",
          "50"
        ]
      ],
      "announced_window": "00h00 – 23h59"
    },
    {
      "group": "Heures travaillées un 1er mai",
      "fields": [
        [
          "Majoration (%)",
          "100"
        ]
      ],
      "announced_window": "00h00 – 23h59"
    },
    {
      "group": "Coupures",
      "fields": [
        [
          "Déclenchement entre deux shifts (h)",
          "1"
        ]
      ]
    }
  ],
  "carre_alerts": [
    {
      "label": "Nombre de jours consécutifs",
      "group": "Personnalisable",
      "active_displayed": false,
      "blocking_displayed": true,
      "blocking_checkbox_exposed": true,
      "displayed_parameter": "6 jours",
      "interaction_tested": false
    },
    {
      "label": "Repos journalier",
      "group": "Personnalisable",
      "active_displayed": false,
      "blocking_displayed": false,
      "blocking_checkbox_exposed": true,
      "displayed_parameter": "11 / 12 / 14 heures selon les classes d’âge affichées",
      "interaction_tested": false
    },
    {
      "label": "Repos hebdomadaire",
      "group": "Personnalisable",
      "active_displayed": false,
      "blocking_displayed": false,
      "blocking_checkbox_exposed": true,
      "displayed_parameter": "2 jours",
      "interaction_tested": false
    },
    {
      "label": "Amplitude horaire temps partiels",
      "group": "Personnalisable",
      "active_displayed": true,
      "blocking_displayed": null,
      "blocking_checkbox_exposed": false,
      "displayed_parameter": "13 heures",
      "interaction_tested": false
    },
    {
      "label": "Pause",
      "group": "Personnalisable",
      "active_displayed": false,
      "blocking_displayed": null,
      "blocking_checkbox_exposed": false,
      "displayed_parameter": "6 heures / 20 minutes",
      "interaction_tested": false
    },
    {
      "label": "Coupure",
      "group": "Personnalisable",
      "active_displayed": true,
      "blocking_displayed": null,
      "blocking_checkbox_exposed": false,
      "displayed_parameter": "4 heures",
      "interaction_tested": false
    },
    {
      "label": "Nombres de coupures maximum",
      "group": "Personnalisable",
      "active_displayed": true,
      "blocking_displayed": null,
      "blocking_checkbox_exposed": false,
      "displayed_parameter": "1 coupure par jour annoncée",
      "interaction_tested": false
    },
    {
      "label": "Travail de nuit",
      "group": "Personnalisable",
      "active_displayed": false,
      "blocking_displayed": null,
      "blocking_checkbox_exposed": false,
      "displayed_parameter": "—",
      "interaction_tested": false
    },
    {
      "label": "Conflit d’horaires",
      "group": "Personnalisable",
      "active_displayed": true,
      "blocking_displayed": null,
      "blocking_checkbox_exposed": false,
      "displayed_parameter": "—",
      "interaction_tested": false
    },
    {
      "label": "Limite heures complémentaires",
      "group": "Personnalisable",
      "active_displayed": true,
      "blocking_displayed": null,
      "blocking_checkbox_exposed": false,
      "displayed_parameter": "—",
      "interaction_tested": false
    },
    {
      "label": "Maximum heures complémentaires",
      "group": "Personnalisable",
      "active_displayed": true,
      "blocking_displayed": null,
      "blocking_checkbox_exposed": false,
      "displayed_parameter": "39 heures",
      "interaction_tested": false
    },
    {
      "label": "Temps de travail hebdomadaire minimum",
      "group": "Personnalisable",
      "active_displayed": true,
      "blocking_displayed": null,
      "blocking_checkbox_exposed": false,
      "displayed_parameter": "24 heures sur 6 jours annoncées",
      "interaction_tested": false
    },
    {
      "label": "Modification du planning en retard",
      "group": "Personnalisable",
      "active_displayed": true,
      "blocking_displayed": null,
      "blocking_checkbox_exposed": false,
      "displayed_parameter": "7 jours calendaires",
      "interaction_tested": false
    },
    {
      "label": "Délai entre le début du premier shift et la fin du dernier",
      "group": "Non personnalisable",
      "active_displayed": false,
      "blocking_displayed": false,
      "blocking_checkbox_exposed": true,
      "displayed_parameter": "13 heures annoncées",
      "interaction_tested": false
    },
    {
      "label": "Temps de travail contractuel",
      "group": "Non personnalisable",
      "active_displayed": true,
      "blocking_displayed": true,
      "blocking_checkbox_exposed": true,
      "displayed_parameter": "—",
      "interaction_tested": false
    },
    {
      "label": "Volume horaire journée",
      "group": "Non personnalisable",
      "active_displayed": true,
      "blocking_displayed": false,
      "blocking_checkbox_exposed": true,
      "displayed_parameter": "10 heures annoncées",
      "interaction_tested": false
    },
    {
      "label": "Temps de travail maximum par semaine",
      "group": "Non personnalisable",
      "active_displayed": true,
      "blocking_displayed": false,
      "blocking_checkbox_exposed": true,
      "displayed_parameter": "48 heures / moyenne 44 heures sur 12 semaines annoncées",
      "interaction_tested": false
    },
    {
      "label": "Majoration Dimanche",
      "group": "Non personnalisable",
      "active_displayed": false,
      "blocking_displayed": null,
      "blocking_checkbox_exposed": false,
      "displayed_parameter": "50 % ou repos équivalent annoncés",
      "interaction_tested": false
    },
    {
      "label": "Jours fériés",
      "group": "Non personnalisable",
      "active_displayed": false,
      "blocking_displayed": null,
      "blocking_checkbox_exposed": false,
      "displayed_parameter": "50 % ou repos équivalent annoncés",
      "interaction_tested": false
    }
  ],
  "beynost_alerts": [
    {
      "label": "Nombre de jours consécutifs",
      "group": "Liste des alertes",
      "active_displayed": false,
      "blocking_checkbox_exposed": true,
      "blocking_displayed": false,
      "displayed_parameter": "Voir texte de la capture source",
      "interaction_tested": false,
      "threshold_text_field_exposed": false
    },
    {
      "label": "Repos journalier",
      "group": "Liste des alertes",
      "active_displayed": false,
      "blocking_checkbox_exposed": true,
      "blocking_displayed": false,
      "displayed_parameter": "Voir texte de la capture source",
      "interaction_tested": false,
      "threshold_text_field_exposed": false
    },
    {
      "label": "Délai entre le début du premier shift et la fin du dernier shift",
      "group": "Liste des alertes",
      "active_displayed": false,
      "blocking_checkbox_exposed": true,
      "blocking_displayed": false,
      "displayed_parameter": "Voir texte de la capture source",
      "interaction_tested": false,
      "threshold_text_field_exposed": false
    },
    {
      "label": "Repos hebdomadaire",
      "group": "Liste des alertes",
      "active_displayed": false,
      "blocking_checkbox_exposed": true,
      "blocking_displayed": false,
      "displayed_parameter": "Voir texte de la capture source",
      "interaction_tested": false,
      "threshold_text_field_exposed": false
    },
    {
      "label": "Temps de travail contractuel",
      "group": "Liste des alertes",
      "active_displayed": true,
      "blocking_checkbox_exposed": true,
      "blocking_displayed": true,
      "displayed_parameter": "Voir texte de la capture source",
      "interaction_tested": false,
      "threshold_text_field_exposed": false
    },
    {
      "label": "Volume horaire d’une journée",
      "group": "Liste des alertes",
      "active_displayed": true,
      "blocking_checkbox_exposed": true,
      "blocking_displayed": false,
      "displayed_parameter": "Voir texte de la capture source",
      "interaction_tested": false,
      "threshold_text_field_exposed": false
    },
    {
      "label": "Temps de travail maximum par semaine",
      "group": "Liste des alertes",
      "active_displayed": true,
      "blocking_checkbox_exposed": true,
      "blocking_displayed": false,
      "displayed_parameter": "Voir texte de la capture source",
      "interaction_tested": false,
      "threshold_text_field_exposed": false
    },
    {
      "label": "Amplitude horaire des temps partiels",
      "group": "Liste des alertes",
      "active_displayed": true,
      "blocking_checkbox_exposed": false,
      "blocking_displayed": null,
      "displayed_parameter": "Voir texte de la capture source",
      "interaction_tested": false,
      "threshold_text_field_exposed": false
    },
    {
      "label": "Majoration Dimanche",
      "group": "Liste des alertes",
      "active_displayed": false,
      "blocking_checkbox_exposed": false,
      "blocking_displayed": null,
      "displayed_parameter": "Voir texte de la capture source",
      "interaction_tested": false,
      "threshold_text_field_exposed": false
    },
    {
      "label": "Pause",
      "group": "Liste des alertes",
      "active_displayed": false,
      "blocking_checkbox_exposed": false,
      "blocking_displayed": null,
      "displayed_parameter": "Voir texte de la capture source",
      "interaction_tested": false,
      "threshold_text_field_exposed": false
    },
    {
      "label": "Coupure",
      "group": "Liste des alertes",
      "active_displayed": false,
      "blocking_checkbox_exposed": false,
      "blocking_displayed": null,
      "displayed_parameter": "2 heures",
      "interaction_tested": false,
      "threshold_text_field_exposed": false
    },
    {
      "label": "Nombres de coupures maximum",
      "group": "Liste des alertes",
      "active_displayed": false,
      "blocking_checkbox_exposed": false,
      "blocking_displayed": null,
      "displayed_parameter": "Voir texte de la capture source",
      "interaction_tested": false,
      "threshold_text_field_exposed": false
    },
    {
      "label": "Travail de nuit",
      "group": "Liste des alertes",
      "active_displayed": false,
      "blocking_checkbox_exposed": false,
      "blocking_displayed": null,
      "displayed_parameter": "Voir texte de la capture source",
      "interaction_tested": false,
      "threshold_text_field_exposed": false
    },
    {
      "label": "Jours fériés",
      "group": "Liste des alertes",
      "active_displayed": false,
      "blocking_checkbox_exposed": false,
      "blocking_displayed": null,
      "displayed_parameter": "Voir texte de la capture source",
      "interaction_tested": false,
      "threshold_text_field_exposed": false
    },
    {
      "label": "Conflit d’horaires",
      "group": "Liste des alertes",
      "active_displayed": true,
      "blocking_checkbox_exposed": false,
      "blocking_displayed": null,
      "displayed_parameter": "Voir texte de la capture source",
      "interaction_tested": false,
      "threshold_text_field_exposed": false
    },
    {
      "label": "Limite heures complémentaires",
      "group": "Liste des alertes",
      "active_displayed": true,
      "blocking_checkbox_exposed": false,
      "blocking_displayed": null,
      "displayed_parameter": "Voir texte de la capture source",
      "interaction_tested": false,
      "threshold_text_field_exposed": false
    },
    {
      "label": "Maximum heures complémentaires",
      "group": "Liste des alertes",
      "active_displayed": true,
      "blocking_checkbox_exposed": false,
      "blocking_displayed": null,
      "displayed_parameter": "35 heures",
      "interaction_tested": false,
      "threshold_text_field_exposed": false
    },
    {
      "label": "Temps de travail hebdomadaire minimum",
      "group": "Liste des alertes",
      "active_displayed": true,
      "blocking_checkbox_exposed": false,
      "blocking_displayed": null,
      "displayed_parameter": "Voir texte de la capture source",
      "interaction_tested": false,
      "threshold_text_field_exposed": false
    },
    {
      "label": "Modification planning en retard",
      "group": "Liste des alertes",
      "active_displayed": true,
      "blocking_checkbox_exposed": false,
      "blocking_displayed": null,
      "displayed_parameter": "7 jours",
      "interaction_tested": false,
      "threshold_text_field_exposed": false
    }
  ],
  "beynost_report_rules_visibility": {
    "admin_menu_verified": true,
    "entry_exposed": false,
    "meaning": "Rubrique non proposée dans le menu administrateur observé ; contenu non ouvert. Ne pas déduire une absence définitive ni contourner par URL inventée.",
    "documentary_context": "DOC13-01 décrit une visibilité conditionnée à l’activation de la fonctionnalité. La cause de configuration du club n’a pas été directement vérifiée."
  },
  "carre_absence_states": [
    {
      "source_id": "PAR12-01",
      "label": "Absence autorisée rémunérée",
      "category": "employeur",
      "active": 0,
      "accrual": 0,
      "employee_request": 0,
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 1
    },
    {
      "source_id": "PAR12-02",
      "label": "Absence pour examens médicaux",
      "category": "employeur",
      "active": 1,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 2
    },
    {
      "source_id": "PAR12-03",
      "label": "Chômage technique",
      "category": "employeur",
      "active": 1,
      "accrual": 1,
      "employee_request": "absent",
      "overtime": "Normales",
      "accrual_disabled": false,
      "request_disabled": null,
      "overtime_disabled": false,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 3
    },
    {
      "source_id": "PAR12-04",
      "label": "Congé d’ancienneté",
      "category": "employeur",
      "active": 0,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 4
    },
    {
      "source_id": "PAR12-05",
      "label": "Congé de deuil",
      "category": "employeur",
      "active": 1,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 5
    },
    {
      "source_id": "PAR12-06",
      "label": "Congé de fractionnement",
      "category": "employeur",
      "active": 0,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "Majorées",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 6
    },
    {
      "source_id": "PAR12-07",
      "label": "Congé décès d’un beau père ou d’une belle mère",
      "category": "employeur",
      "active": 0,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Majorées",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 7
    },
    {
      "source_id": "PAR12-08",
      "label": "Congé décès d’un descendant en ligne directe",
      "category": "employeur",
      "active": 1,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Majorées",
      "accrual_disabled": false,
      "request_disabled": true,
      "overtime_disabled": false,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 8
    },
    {
      "source_id": "PAR12-09",
      "label": "Congé décès d’un père ou d’une mère",
      "category": "employeur",
      "active": 1,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Majorées",
      "accrual_disabled": false,
      "request_disabled": true,
      "overtime_disabled": false,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 9
    },
    {
      "source_id": "PAR12-10",
      "label": "Congé décès enfant",
      "category": "employeur",
      "active": 1,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Majorées",
      "accrual_disabled": false,
      "request_disabled": true,
      "overtime_disabled": false,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 10
    },
    {
      "source_id": "PAR12-11",
      "label": "Congé décès enfant de moins de 25 ans",
      "category": "employeur",
      "active": 1,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Majorées",
      "accrual_disabled": false,
      "request_disabled": true,
      "overtime_disabled": false,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 11
    },
    {
      "source_id": "PAR12-12",
      "label": "Congé événementiel",
      "category": "employeur",
      "active": 0,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Majorées",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 12
    },
    {
      "source_id": "PAR12-13",
      "label": "Congé individuel formation",
      "category": "employeur",
      "active": 0,
      "accrual": 0,
      "employee_request": 0,
      "overtime": "Majorées",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 13
    },
    {
      "source_id": "PAR12-14",
      "label": "Congé mariage ou PACS",
      "category": "employeur",
      "active": 1,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Majorées",
      "accrual_disabled": false,
      "request_disabled": true,
      "overtime_disabled": false,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 14
    },
    {
      "source_id": "PAR12-15",
      "label": "Congé naissance",
      "category": "employeur",
      "active": 1,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": false,
      "request_disabled": true,
      "overtime_disabled": false,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 15
    },
    {
      "source_id": "PAR12-16",
      "label": "Congé payé",
      "category": "employeur",
      "active": 1,
      "accrual": "Oui",
      "employee_request": 1,
      "overtime": "Majorées",
      "accrual_disabled": null,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 16
    },
    {
      "source_id": "PAR12-17",
      "label": "Congé temps d’habillage",
      "category": "employeur",
      "active": 0,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 17
    },
    {
      "source_id": "PAR12-49",
      "label": "Congé trimestriel",
      "category": "employeur",
      "active": 0,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 18
    },
    {
      "source_id": "PAR12-50",
      "label": "Délégation du Personnel",
      "category": "employeur",
      "active": 0,
      "accrual": 1,
      "employee_request": 0,
      "overtime": "Majorées",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 19
    },
    {
      "source_id": "PAR12-51",
      "label": "École - CFA",
      "category": "employeur",
      "active": 1,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Majorées",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 20
    },
    {
      "source_id": "PAR12-52",
      "label": "Formation",
      "category": "employeur",
      "active": 1,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Majorées",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 21
    },
    {
      "source_id": "PAR12-53",
      "label": "Heures d’activité partielle",
      "category": "employeur",
      "active": 1,
      "accrual": 1,
      "employee_request": 0,
      "overtime": "Normales",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 22
    },
    {
      "source_id": "PAR12-54",
      "label": "Indemnité compensatrice de préavis",
      "category": "employeur",
      "active": 0,
      "accrual": 0,
      "employee_request": "absent",
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": null,
      "overtime_disabled": true,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 23
    },
    {
      "source_id": "PAR12-55",
      "label": "Jour Férié",
      "category": "employeur",
      "active": 0,
      "accrual": 1,
      "employee_request": 0,
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 24
    },
    {
      "source_id": "PAR12-56",
      "label": "Journée de défense citoyenneté",
      "category": "employeur",
      "active": 0,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 25
    },
    {
      "source_id": "PAR12-57",
      "label": "Récupération JF",
      "category": "employeur",
      "active": 0,
      "accrual": 1,
      "employee_request": 0,
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 26
    },
    {
      "source_id": "PAR12-58",
      "label": "Repos compensateur",
      "category": "employeur",
      "active": 1,
      "accrual": "Oui",
      "employee_request": 0,
      "overtime": "Normales",
      "accrual_disabled": null,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 27
    },
    {
      "source_id": "PAR12-59",
      "label": "Repos compensateur de nuit",
      "category": "employeur",
      "active": 0,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 28
    },
    {
      "source_id": "PAR12-60",
      "label": "Repos forfait",
      "category": "employeur",
      "active": 0,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 29
    },
    {
      "source_id": "PAR12-61",
      "label": "Réunion",
      "category": "employeur",
      "active": 0,
      "accrual": 0,
      "employee_request": 0,
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 30
    },
    {
      "source_id": "PAR12-62",
      "label": "Réunions CSE/CSSCT",
      "category": "employeur",
      "active": 0,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Majorées",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 31
    },
    {
      "source_id": "PAR12-63",
      "label": "RTT",
      "category": "employeur",
      "active": 0,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 32
    },
    {
      "source_id": "PAR12-64",
      "label": "Service militaire",
      "category": "employeur",
      "active": 0,
      "accrual": 0,
      "employee_request": 0,
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 33
    },
    {
      "source_id": "PAR12-65",
      "label": "Solde De Tout Compte",
      "category": "employeur",
      "active": 1,
      "accrual": 0,
      "employee_request": 0,
      "overtime": "Normales",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 34
    },
    {
      "source_id": "PAR12-66",
      "label": "Télétravail",
      "category": "employeur",
      "active": 1,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Majorées",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 35
    },
    {
      "source_id": "PAR12-18",
      "label": "Accident de trajet",
      "category": "tiers",
      "active": 1,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 36
    },
    {
      "source_id": "PAR12-19",
      "label": "Accident du travail",
      "category": "tiers",
      "active": 1,
      "accrual": "Oui",
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": null,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 37
    },
    {
      "source_id": "PAR12-20",
      "label": "Arrêt maladie",
      "category": "tiers",
      "active": 1,
      "accrual": "Oui",
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": null,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 38
    },
    {
      "source_id": "PAR12-21",
      "label": "Arrêt maladie prolongé",
      "category": "tiers",
      "active": 1,
      "accrual": "Oui",
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": null,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 39
    },
    {
      "source_id": "PAR12-22",
      "label": "Congé adoption",
      "category": "tiers",
      "active": 0,
      "accrual": "Oui",
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": null,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 40
    },
    {
      "source_id": "PAR12-23",
      "label": "Congé de présence parentale",
      "category": "tiers",
      "active": 0,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 41
    },
    {
      "source_id": "PAR12-24",
      "label": "Congé hospitalisation enfant",
      "category": "tiers",
      "active": 1,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 42
    },
    {
      "source_id": "PAR12-25",
      "label": "Congé maternité",
      "category": "tiers",
      "active": 1,
      "accrual": "Oui",
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": null,
      "request_disabled": true,
      "overtime_disabled": false,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 43
    },
    {
      "source_id": "PAR12-26",
      "label": "Congé paternité",
      "category": "tiers",
      "active": 1,
      "accrual": "Oui",
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": null,
      "request_disabled": true,
      "overtime_disabled": false,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 44
    },
    {
      "source_id": "PAR12-27",
      "label": "Congé proche aidant",
      "category": "tiers",
      "active": 1,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 45
    },
    {
      "source_id": "PAR12-28",
      "label": "Congé supplémentaire de naissance",
      "category": "tiers",
      "active": 1,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 46
    },
    {
      "source_id": "PAR12-29",
      "label": "Invalidité permanente",
      "category": "tiers",
      "active": 0,
      "accrual": 0,
      "employee_request": "absent",
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": null,
      "overtime_disabled": true,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 47
    },
    {
      "source_id": "PAR12-30",
      "label": "Maladie professionnelle",
      "category": "tiers",
      "active": 1,
      "accrual": "Oui",
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": null,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 48
    },
    {
      "source_id": "PAR12-31",
      "label": "Temps partiel thérapeutique",
      "category": "tiers",
      "active": 1,
      "accrual": 0,
      "employee_request": 0,
      "overtime": "Normales",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 49
    },
    {
      "source_id": "PAR12-32",
      "label": "Absence autorisée",
      "category": "non indemnisée",
      "active": 1,
      "accrual": 0,
      "employee_request": 0,
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": null,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 50
    },
    {
      "source_id": "PAR12-33",
      "label": "Absence entrée sortie",
      "category": "non indemnisée",
      "active": 1,
      "accrual": 0,
      "employee_request": 0,
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": null,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 51
    },
    {
      "source_id": "PAR12-34",
      "label": "Absence injustifiée",
      "category": "non indemnisée",
      "active": 1,
      "accrual": 0,
      "employee_request": 0,
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": null,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 52
    },
    {
      "source_id": "PAR12-35",
      "label": "Congé décès d’un grand parent",
      "category": "non indemnisée",
      "active": 1,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": true,
      "overtime_disabled": null,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 53
    },
    {
      "source_id": "PAR12-36",
      "label": "Congé parental",
      "category": "non indemnisée",
      "active": 1,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": null,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 54
    },
    {
      "source_id": "PAR12-37",
      "label": "Congé pour enfant malade",
      "category": "non indemnisée",
      "active": 1,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": true,
      "overtime_disabled": null,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 55
    },
    {
      "source_id": "PAR12-38",
      "label": "Congé pour garde d’enfant",
      "category": "non indemnisée",
      "active": 1,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": null,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 56
    },
    {
      "source_id": "PAR12-39",
      "label": "Congé sans solde",
      "category": "non indemnisée",
      "active": 1,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": null,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 57
    },
    {
      "source_id": "PAR12-40",
      "label": "Départ anticipé",
      "category": "non indemnisée",
      "active": 1,
      "accrual": 0,
      "employee_request": 0,
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": null,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 58
    },
    {
      "source_id": "PAR12-41",
      "label": "Grève",
      "category": "non indemnisée",
      "active": 0,
      "accrual": 0,
      "employee_request": 0,
      "overtime": "absent",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": null,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 59
    },
    {
      "source_id": "PAR12-42",
      "label": "Mise à pied conservatoire",
      "category": "non indemnisée",
      "active": 1,
      "accrual": 0,
      "employee_request": "absent",
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": null,
      "overtime_disabled": null,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 60
    },
    {
      "source_id": "PAR12-43",
      "label": "Mise à pied disciplinaire",
      "category": "non indemnisée",
      "active": 1,
      "accrual": 0,
      "employee_request": "absent",
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": null,
      "overtime_disabled": null,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 61
    },
    {
      "source_id": "PAR12-44",
      "label": "Récupération",
      "category": "non indemnisée",
      "active": 1,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": null,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 62
    },
    {
      "source_id": "PAR12-45",
      "label": "Suspension de contrat",
      "category": "non indemnisée",
      "active": 0,
      "accrual": 0,
      "employee_request": "absent",
      "overtime": "absent",
      "accrual_disabled": true,
      "request_disabled": null,
      "overtime_disabled": null,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 63
    },
    {
      "source_id": "PAR12-46",
      "label": "Astreinte",
      "category": "neutre",
      "active": 1,
      "accrual": 0,
      "employee_request": 0,
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": null,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 64
    },
    {
      "source_id": "PAR12-47",
      "label": "Pause",
      "category": "neutre",
      "active": 1,
      "accrual": 0,
      "employee_request": "absent",
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": null,
      "overtime_disabled": null,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 65
    },
    {
      "source_id": "PAR12-48",
      "label": "Repos hebdomadaire",
      "category": "neutre",
      "active": 1,
      "accrual": 0,
      "employee_request": 0,
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": null,
      "site": "Carré de Soie",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 50 à 59, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 66
    }
  ],
  "beynost_absence_states": [
    {
      "source_id": "PAR12-01",
      "label": "Absence autorisée rémunérée",
      "category": "employeur",
      "active": 0,
      "accrual": 0,
      "employee_request": 0,
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 1
    },
    {
      "source_id": "PAR12-02",
      "label": "Absence pour examens médicaux",
      "category": "employeur",
      "active": 1,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 2
    },
    {
      "source_id": "PAR12-03",
      "label": "Chômage technique",
      "category": "employeur",
      "active": 1,
      "accrual": 1,
      "employee_request": "absent",
      "overtime": "Normales",
      "accrual_disabled": false,
      "request_disabled": null,
      "overtime_disabled": false,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 3
    },
    {
      "source_id": "PAR12-04",
      "label": "Congé d’ancienneté",
      "category": "employeur",
      "active": 0,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 4
    },
    {
      "source_id": "PAR12-05",
      "label": "Congé de deuil",
      "category": "employeur",
      "active": 1,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 5
    },
    {
      "source_id": "PAR12-06",
      "label": "Congé de fractionnement",
      "category": "employeur",
      "active": 0,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "Majorées",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 6
    },
    {
      "source_id": "PAR12-07",
      "label": "Congé décès d’un beau père ou d’une belle mère",
      "category": "employeur",
      "active": 0,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Majorées",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 7
    },
    {
      "source_id": "PAR12-08",
      "label": "Congé décès d’un descendant en ligne directe",
      "category": "employeur",
      "active": 1,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Majorées",
      "accrual_disabled": false,
      "request_disabled": true,
      "overtime_disabled": false,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 8
    },
    {
      "source_id": "PAR12-09",
      "label": "Congé décès d’un père ou d’une mère",
      "category": "employeur",
      "active": 1,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Majorées",
      "accrual_disabled": false,
      "request_disabled": true,
      "overtime_disabled": false,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 9
    },
    {
      "source_id": "PAR12-10",
      "label": "Congé décès enfant",
      "category": "employeur",
      "active": 1,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Majorées",
      "accrual_disabled": false,
      "request_disabled": true,
      "overtime_disabled": false,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 10
    },
    {
      "source_id": "PAR12-11",
      "label": "Congé décès enfant de moins de 25 ans",
      "category": "employeur",
      "active": 1,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Majorées",
      "accrual_disabled": false,
      "request_disabled": true,
      "overtime_disabled": false,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 11
    },
    {
      "source_id": "PAR12-12",
      "label": "Congé événementiel",
      "category": "employeur",
      "active": 0,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Majorées",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 12
    },
    {
      "source_id": "PAR12-13",
      "label": "Congé individuel formation",
      "category": "employeur",
      "active": 0,
      "accrual": 0,
      "employee_request": 0,
      "overtime": "Majorées",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 13
    },
    {
      "source_id": "PAR12-14",
      "label": "Congé mariage ou PACS",
      "category": "employeur",
      "active": 1,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Majorées",
      "accrual_disabled": false,
      "request_disabled": true,
      "overtime_disabled": false,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 14
    },
    {
      "source_id": "PAR12-15",
      "label": "Congé naissance",
      "category": "employeur",
      "active": 1,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": false,
      "request_disabled": true,
      "overtime_disabled": false,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 15
    },
    {
      "source_id": "PAR12-16",
      "label": "Congé payé",
      "category": "employeur",
      "active": 1,
      "accrual": "Oui",
      "employee_request": 1,
      "overtime": "Majorées",
      "accrual_disabled": null,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 16
    },
    {
      "source_id": "PAR12-17",
      "label": "Congé temps d’habillage",
      "category": "employeur",
      "active": 0,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 17
    },
    {
      "source_id": "PAR12-49",
      "label": "Congé trimestriel",
      "category": "employeur",
      "active": 0,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 18
    },
    {
      "source_id": "PAR12-50",
      "label": "Délégation du Personnel",
      "category": "employeur",
      "active": 0,
      "accrual": 1,
      "employee_request": 0,
      "overtime": "Majorées",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 19
    },
    {
      "source_id": "PAR12-51",
      "label": "École - CFA",
      "category": "employeur",
      "active": 1,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Majorées",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 20
    },
    {
      "source_id": "PAR12-52",
      "label": "Formation",
      "category": "employeur",
      "active": 1,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Majorées",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 21
    },
    {
      "source_id": "PAR12-53",
      "label": "Heures d’activité partielle",
      "category": "employeur",
      "active": 1,
      "accrual": 1,
      "employee_request": 0,
      "overtime": "Normales",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 22
    },
    {
      "source_id": "PAR12-54",
      "label": "Indemnité compensatrice de préavis",
      "category": "employeur",
      "active": 0,
      "accrual": 0,
      "employee_request": "absent",
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": null,
      "overtime_disabled": true,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 23
    },
    {
      "source_id": "PAR12-55",
      "label": "Jour Férié",
      "category": "employeur",
      "active": 0,
      "accrual": 1,
      "employee_request": 0,
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 24
    },
    {
      "source_id": "PAR12-56",
      "label": "Journée de défense citoyenneté",
      "category": "employeur",
      "active": 0,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 25
    },
    {
      "source_id": "PAR12-57",
      "label": "Récupération JF",
      "category": "employeur",
      "active": 0,
      "accrual": 1,
      "employee_request": 0,
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 26
    },
    {
      "source_id": "PAR12-58",
      "label": "Repos compensateur",
      "category": "employeur",
      "active": 1,
      "accrual": "Oui",
      "employee_request": 0,
      "overtime": "Normales",
      "accrual_disabled": null,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 27
    },
    {
      "source_id": "PAR12-59",
      "label": "Repos compensateur de nuit",
      "category": "employeur",
      "active": 0,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 28
    },
    {
      "source_id": "PAR12-60",
      "label": "Repos forfait",
      "category": "employeur",
      "active": 0,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 29
    },
    {
      "source_id": "PAR12-61",
      "label": "Réunion",
      "category": "employeur",
      "active": 0,
      "accrual": 0,
      "employee_request": 0,
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 30
    },
    {
      "source_id": "PAR12-62",
      "label": "Réunions CSE/CSSCT",
      "category": "employeur",
      "active": 0,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Majorées",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 31
    },
    {
      "source_id": "PAR12-63",
      "label": "RTT",
      "category": "employeur",
      "active": 0,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 32
    },
    {
      "source_id": "PAR12-64",
      "label": "Service militaire",
      "category": "employeur",
      "active": 0,
      "accrual": 0,
      "employee_request": 0,
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 33
    },
    {
      "source_id": "PAR12-65",
      "label": "Solde De Tout Compte",
      "category": "employeur",
      "active": 1,
      "accrual": 0,
      "employee_request": 0,
      "overtime": "Normales",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 34
    },
    {
      "source_id": "PAR12-66",
      "label": "Télétravail",
      "category": "employeur",
      "active": 1,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Majorées",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 35
    },
    {
      "source_id": "PAR12-18",
      "label": "Accident de trajet",
      "category": "tiers",
      "active": 1,
      "accrual": 1,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 36
    },
    {
      "source_id": "PAR12-19",
      "label": "Accident du travail",
      "category": "tiers",
      "active": 1,
      "accrual": "Oui",
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": null,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 37
    },
    {
      "source_id": "PAR12-20",
      "label": "Arrêt maladie",
      "category": "tiers",
      "active": 1,
      "accrual": "Oui",
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": null,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 38
    },
    {
      "source_id": "PAR12-21",
      "label": "Arrêt maladie prolongé",
      "category": "tiers",
      "active": 1,
      "accrual": "Oui",
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": null,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 39
    },
    {
      "source_id": "PAR12-22",
      "label": "Congé adoption",
      "category": "tiers",
      "active": 0,
      "accrual": "Oui",
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": null,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 40
    },
    {
      "source_id": "PAR12-23",
      "label": "Congé de présence parentale",
      "category": "tiers",
      "active": 0,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": true,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 41
    },
    {
      "source_id": "PAR12-24",
      "label": "Congé hospitalisation enfant",
      "category": "tiers",
      "active": 1,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 42
    },
    {
      "source_id": "PAR12-25",
      "label": "Congé maternité",
      "category": "tiers",
      "active": 1,
      "accrual": "Oui",
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": null,
      "request_disabled": true,
      "overtime_disabled": false,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 43
    },
    {
      "source_id": "PAR12-26",
      "label": "Congé paternité",
      "category": "tiers",
      "active": 1,
      "accrual": "Oui",
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": null,
      "request_disabled": true,
      "overtime_disabled": false,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 44
    },
    {
      "source_id": "PAR12-27",
      "label": "Congé proche aidant",
      "category": "tiers",
      "active": 1,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 45
    },
    {
      "source_id": "PAR12-28",
      "label": "Congé supplémentaire de naissance",
      "category": "tiers",
      "active": 1,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 46
    },
    {
      "source_id": "PAR12-29",
      "label": "Invalidité permanente",
      "category": "tiers",
      "active": 0,
      "accrual": 0,
      "employee_request": "absent",
      "overtime": "Normales",
      "accrual_disabled": true,
      "request_disabled": null,
      "overtime_disabled": true,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 47
    },
    {
      "source_id": "PAR12-30",
      "label": "Maladie professionnelle",
      "category": "tiers",
      "active": 1,
      "accrual": "Oui",
      "employee_request": 1,
      "overtime": "Normales",
      "accrual_disabled": null,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 48
    },
    {
      "source_id": "PAR12-31",
      "label": "Temps partiel thérapeutique",
      "category": "tiers",
      "active": 1,
      "accrual": 0,
      "employee_request": 0,
      "overtime": "Normales",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": false,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 49
    },
    {
      "source_id": "PAR12-32",
      "label": "Absence autorisée",
      "category": "non indemnisée",
      "active": 1,
      "accrual": 0,
      "employee_request": 0,
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": null,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 50
    },
    {
      "source_id": "PAR12-33",
      "label": "Absence entrée sortie",
      "category": "non indemnisée",
      "active": 1,
      "accrual": 0,
      "employee_request": 0,
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": null,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 51
    },
    {
      "source_id": "PAR12-34",
      "label": "Absence injustifiée",
      "category": "non indemnisée",
      "active": 1,
      "accrual": 0,
      "employee_request": 0,
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": null,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 52
    },
    {
      "source_id": "PAR12-35",
      "label": "Congé décès d’un grand parent",
      "category": "non indemnisée",
      "active": 1,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": true,
      "overtime_disabled": null,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 53
    },
    {
      "source_id": "PAR12-36",
      "label": "Congé parental",
      "category": "non indemnisée",
      "active": 1,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": null,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 54
    },
    {
      "source_id": "PAR12-37",
      "label": "Congé pour enfant malade",
      "category": "non indemnisée",
      "active": 1,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": true,
      "overtime_disabled": null,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 55
    },
    {
      "source_id": "PAR12-38",
      "label": "Congé pour garde d’enfant",
      "category": "non indemnisée",
      "active": 1,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": null,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 56
    },
    {
      "source_id": "PAR12-39",
      "label": "Congé sans solde",
      "category": "non indemnisée",
      "active": 1,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": null,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 57
    },
    {
      "source_id": "PAR12-40",
      "label": "Départ anticipé",
      "category": "non indemnisée",
      "active": 1,
      "accrual": 0,
      "employee_request": 0,
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": null,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 58
    },
    {
      "source_id": "PAR12-41",
      "label": "Grève",
      "category": "non indemnisée",
      "active": 0,
      "accrual": 0,
      "employee_request": 0,
      "overtime": "absent",
      "accrual_disabled": true,
      "request_disabled": true,
      "overtime_disabled": null,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 59
    },
    {
      "source_id": "PAR12-42",
      "label": "Mise à pied conservatoire",
      "category": "non indemnisée",
      "active": 1,
      "accrual": 0,
      "employee_request": "absent",
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": null,
      "overtime_disabled": null,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 60
    },
    {
      "source_id": "PAR12-43",
      "label": "Mise à pied disciplinaire",
      "category": "non indemnisée",
      "active": 1,
      "accrual": 0,
      "employee_request": "absent",
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": null,
      "overtime_disabled": null,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 61
    },
    {
      "source_id": "PAR12-44",
      "label": "Récupération",
      "category": "non indemnisée",
      "active": 1,
      "accrual": 0,
      "employee_request": 1,
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": null,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 62
    },
    {
      "source_id": "PAR12-45",
      "label": "Suspension de contrat",
      "category": "non indemnisée",
      "active": 0,
      "accrual": 0,
      "employee_request": "absent",
      "overtime": "absent",
      "accrual_disabled": true,
      "request_disabled": null,
      "overtime_disabled": null,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 63
    },
    {
      "source_id": "PAR12-46",
      "label": "Astreinte",
      "category": "neutre",
      "active": 1,
      "accrual": 0,
      "employee_request": 0,
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": null,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 64
    },
    {
      "source_id": "PAR12-47",
      "label": "Pause",
      "category": "neutre",
      "active": 1,
      "accrual": 0,
      "employee_request": "absent",
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": null,
      "overtime_disabled": null,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 65
    },
    {
      "source_id": "PAR12-48",
      "label": "Repos hebdomadaire",
      "category": "neutre",
      "active": 1,
      "accrual": 0,
      "employee_request": 0,
      "overtime": "absent",
      "accrual_disabled": false,
      "request_disabled": false,
      "overtime_disabled": null,
      "site": "Beynost",
      "date_rechecked": "2026-11-13",
      "proof": "Captures 36 à 45, configuration source ; aucun bouton actionné",
      "calculation_tested": false,
      "display_order": 66
    }
  ],
  "absence_comparison": {
    "rows_compared_per_site": 66,
    "displayed_property_differences_found": [],
    "fields_compared": [
      "active",
      "accrual",
      "employee_request",
      "overtime",
      "accrual_disabled",
      "request_disabled",
      "overtime_disabled"
    ],
    "qualification": "Aucune différence relevée dans les états affichés ; aucun effet de calcul ni sauvegarde testé."
  },
  "carre_smart_planner": [
    {
      "group": "Disponibilités",
      "label": "Tenir compte des disponibilités",
      "active_displayed": false,
      "value_displayed": null,
      "effect_tested": false
    },
    {
      "group": "Disponibilités",
      "label": "Tenir compte des indisponibilités",
      "active_displayed": false,
      "value_displayed": null,
      "effect_tested": false
    },
    {
      "group": "Durée de travail",
      "label": "Jours consécutifs maximum",
      "active_displayed": true,
      "value_displayed": "6",
      "effect_tested": false
    },
    {
      "group": "Durée de travail",
      "label": "Repos journalier consécutif",
      "active_displayed": true,
      "value_displayed": "11 h",
      "effect_tested": false
    },
    {
      "group": "Durée de travail",
      "label": "Durée journalière minimum",
      "active_displayed": false,
      "value_displayed": "0 h",
      "effect_tested": false
    },
    {
      "group": "Durée de travail",
      "label": "Coupure maximum entre deux shifts",
      "active_displayed": true,
      "value_displayed": "4 h",
      "effect_tested": false
    },
    {
      "group": "Durée de travail",
      "label": "Nombre de coupures temps partiel maximum",
      "active_displayed": true,
      "value_displayed": "1",
      "effect_tested": false
    },
    {
      "group": "Durée de travail",
      "label": "Durée journalière maximum",
      "active_displayed": false,
      "value_displayed": "10 h",
      "effect_tested": false
    },
    {
      "group": "Durée de travail",
      "label": "Amplitude journalière maximum",
      "active_displayed": false,
      "value_displayed": "13 h",
      "effect_tested": false
    },
    {
      "group": "Durée de travail",
      "label": "Repos hebdomadaire",
      "active_displayed": true,
      "value_displayed": "2 jours ; Jours consécutifs décoché",
      "effect_tested": false
    },
    {
      "group": "Dépassement d’horaires",
      "label": "Interdire les heures supplémentaires temps plein",
      "active_displayed": true,
      "value_displayed": null,
      "effect_tested": false
    },
    {
      "group": "Dépassement d’horaires",
      "label": "Interdire les heures complémentaires temps partiel",
      "active_displayed": true,
      "value_displayed": null,
      "effect_tested": false
    },
    {
      "group": "Dépassement d’horaires",
      "label": "Plafond heures supplémentaires temps plein",
      "active_displayed": false,
      "value_displayed": "10 % ; contrôle grisé",
      "effect_tested": false
    },
    {
      "group": "Dépassement d’horaires",
      "label": "Plafond heures complémentaires temps partiel",
      "active_displayed": false,
      "value_displayed": "33.33 % ; contrôle grisé",
      "effect_tested": false
    }
  ],
  "beynost_smart_planner": [
    {
      "group": "Disponibilités",
      "label": "Tenir compte des disponibilités",
      "active_displayed": false,
      "value_displayed": null,
      "effect_tested": false
    },
    {
      "group": "Disponibilités",
      "label": "Tenir compte des indisponibilités",
      "active_displayed": false,
      "value_displayed": null,
      "effect_tested": false
    },
    {
      "group": "Durée de travail",
      "label": "Jours consécutifs maximum",
      "active_displayed": true,
      "value_displayed": "6",
      "effect_tested": false
    },
    {
      "group": "Durée de travail",
      "label": "Repos journalier consécutif",
      "active_displayed": true,
      "value_displayed": "11 h",
      "effect_tested": false
    },
    {
      "group": "Durée de travail",
      "label": "Durée journalière minimum",
      "active_displayed": false,
      "value_displayed": "0 h",
      "effect_tested": false
    },
    {
      "group": "Durée de travail",
      "label": "Coupure maximum entre deux shifts",
      "active_displayed": true,
      "value_displayed": "2 h",
      "effect_tested": false
    },
    {
      "group": "Durée de travail",
      "label": "Nombre de coupures temps partiel maximum",
      "active_displayed": true,
      "value_displayed": "1",
      "effect_tested": false
    },
    {
      "group": "Durée de travail",
      "label": "Durée journalière maximum",
      "active_displayed": false,
      "value_displayed": "10 h",
      "effect_tested": false
    },
    {
      "group": "Durée de travail",
      "label": "Amplitude journalière maximum",
      "active_displayed": false,
      "value_displayed": "13 h",
      "effect_tested": false
    },
    {
      "group": "Durée de travail",
      "label": "Repos hebdomadaire",
      "active_displayed": true,
      "value_displayed": "2 jours ; Jours consécutifs décoché",
      "effect_tested": false
    },
    {
      "group": "Dépassement d’horaires",
      "label": "Interdire les heures supplémentaires temps plein",
      "active_displayed": true,
      "value_displayed": null,
      "effect_tested": false
    },
    {
      "group": "Dépassement d’horaires",
      "label": "Interdire les heures complémentaires temps partiel",
      "active_displayed": true,
      "value_displayed": null,
      "effect_tested": false
    },
    {
      "group": "Dépassement d’horaires",
      "label": "Plafond heures supplémentaires temps plein",
      "active_displayed": false,
      "value_displayed": "10 % ; contrôle grisé",
      "effect_tested": false
    },
    {
      "group": "Dépassement d’horaires",
      "label": "Plafond heures complémentaires temps partiel",
      "active_displayed": false,
      "value_displayed": "33.33 % ; contrôle grisé",
      "effect_tested": false
    }
  ],
  "limits": [
    "Résultats des règles, arrondis et blocages non testés.",
    "Alertes Beynost et règles du rapport Beynost à comparer séparément ; absence de rubrique dans un premier menu ne prouve pas absence définitive.",
    "Les textes de convention et les valeurs affichées ne valent pas validation légale ni valeur par défaut à appliquer à tous les clubs.",
    "Sélecteurs de destinataires et variantes conditionnelles encore à qualifier ; aucune personne sélectionnée."
  ],
  "base_rules_by_site": {
    "Carré de Soie": {
      "collective_agreement": "IDCC 2511 - Sport",
      "work_end": "23:00",
      "break_trigger_display": "06h30",
      "paid_breaks_displayed": false,
      "deduct_lateness_displayed": false,
      "employer_contributions_display": "43 %",
      "reference_days_display": "5 jours / semaine",
      "meal_allowance_displayed": false,
      "meal_setup_start_disabled": true,
      "work_start": "06:00"
    },
    "Beynost": {
      "collective_agreement": "IDCC 2511 - Sport",
      "work_end": "23:00",
      "break_trigger_display": "06h30",
      "paid_breaks_displayed": false,
      "deduct_lateness_displayed": false,
      "employer_contributions_display": "43 %",
      "reference_days_display": "5 jours / semaine",
      "meal_allowance_displayed": false,
      "meal_setup_start_disabled": true,
      "work_start": "05:00"
    }
  },
  "counter_settings_by_site": {
    "Carré de Soie": {
      "modulation_displayed": false,
      "rcr_displayed": false,
      "paid_leave_displayed": true,
      "leave_acquisition_mode": "Jours ouvrables",
      "monthly_acquisition_display": "2.5",
      "rtt_days_displayed": false,
      "annualization_displayed": true,
      "annualization_period_display": "01 juin 2026 - 31 mai 2027",
      "public_holiday_counter_displayed": false,
      "rtt_hours_action": "Activer proposé ; non actionné",
      "sunday_hours_included_displayed": true,
      "customize_overtime_displayed": false,
      "annual_absence_options": [
        {
          "label": "Absence autorisée",
          "included_displayed": false,
          "interaction_tested": false
        },
        {
          "label": "Absence entrée sortie",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Absence injustifiée",
          "included_displayed": false,
          "interaction_tested": false
        },
        {
          "label": "Absence pour examens médicaux",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Accident de trajet",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Accident du travail",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Arrêt maladie",
          "included_displayed": false,
          "interaction_tested": false
        },
        {
          "label": "Arrêt maladie prolongé",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Astreinte",
          "included_displayed": false,
          "interaction_tested": false
        },
        {
          "label": "Chômage technique",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé de deuil",
          "included_displayed": false,
          "interaction_tested": false
        },
        {
          "label": "Congé décès d’un descendant en ligne direct",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé décès d’un grand-parent",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé décès d’un père ou d’une mère",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé décès enfant",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé décès enfant <25 ans",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé hospitalisation enfant",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé mariage / PACS",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé maternité",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé naissance",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé parental",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé paternité",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé payé",
          "included_displayed": false,
          "interaction_tested": false
        },
        {
          "label": "Congé pour enfant malade",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé pour garde d’enfant",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé proche aidant",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé sans solde",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé supplémentaire de naissance",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Départ anticipé",
          "included_displayed": false,
          "interaction_tested": false
        },
        {
          "label": "École - CFA",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Formation",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Heures d’activité partielle",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Maladie professionnelle",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Mise à pied conservatoire",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Mise à pied disciplinaire",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Pause",
          "included_displayed": false,
          "interaction_tested": false
        },
        {
          "label": "Récupération",
          "included_displayed": false,
          "interaction_tested": false
        },
        {
          "label": "Repos compensateur",
          "included_displayed": false,
          "interaction_tested": false
        },
        {
          "label": "Repos hebdomadaire",
          "included_displayed": false,
          "interaction_tested": false
        },
        {
          "label": "Solde de tout compte",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Télétravail",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Temps partiel thérapeutique",
          "included_displayed": true,
          "interaction_tested": false
        }
      ],
      "annual_absence_selected_count_displayed": 31
    },
    "Beynost": {
      "modulation_displayed": false,
      "rcr_displayed": false,
      "paid_leave_displayed": true,
      "leave_acquisition_mode": "Jours ouvrables",
      "monthly_acquisition_display": "2.5",
      "rtt_days_displayed": false,
      "annualization_displayed": true,
      "annualization_period_display": "01 juin 2026 - 31 mai 2027",
      "public_holiday_counter_displayed": false,
      "rtt_hours_action": "Activer proposé ; non actionné",
      "sunday_hours_included_displayed": true,
      "customize_overtime_displayed": false,
      "annual_absence_options": [
        {
          "label": "Absence autorisée",
          "included_displayed": false,
          "interaction_tested": false
        },
        {
          "label": "Absence entrée sortie",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Absence injustifiée",
          "included_displayed": false,
          "interaction_tested": false
        },
        {
          "label": "Absence pour examens médicaux",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Accident de trajet",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Accident du travail",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Arrêt maladie",
          "included_displayed": false,
          "interaction_tested": false
        },
        {
          "label": "Arrêt maladie prolongé",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Astreinte",
          "included_displayed": false,
          "interaction_tested": false
        },
        {
          "label": "Chômage technique",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé de deuil",
          "included_displayed": false,
          "interaction_tested": false
        },
        {
          "label": "Congé décès d’un descendant en ligne direct",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé décès d’un grand-parent",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé décès d’un père ou d’une mère",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé décès enfant",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé décès enfant <25 ans",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé hospitalisation enfant",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé mariage / PACS",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé maternité",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé naissance",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé parental",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé paternité",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé payé",
          "included_displayed": false,
          "interaction_tested": false
        },
        {
          "label": "Congé pour enfant malade",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé pour garde d’enfant",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé proche aidant",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé sans solde",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Congé supplémentaire de naissance",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Départ anticipé",
          "included_displayed": false,
          "interaction_tested": false
        },
        {
          "label": "École - CFA",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Formation",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Heures d’activité partielle",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Maladie professionnelle",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Mise à pied conservatoire",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Mise à pied disciplinaire",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Pause",
          "included_displayed": false,
          "interaction_tested": false
        },
        {
          "label": "Récupération",
          "included_displayed": false,
          "interaction_tested": false
        },
        {
          "label": "Repos compensateur",
          "included_displayed": false,
          "interaction_tested": false
        },
        {
          "label": "Repos hebdomadaire",
          "included_displayed": false,
          "interaction_tested": false
        },
        {
          "label": "Solde de tout compte",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Télétravail",
          "included_displayed": true,
          "interaction_tested": false
        },
        {
          "label": "Temps partiel thérapeutique",
          "included_displayed": true,
          "interaction_tested": false
        }
      ],
      "annual_absence_selected_count_displayed": 31
    }
  },
  "acquisition_choices": [
    "Jours ouvrables",
    "Jours ouvrés",
    "Jours calendaires"
  ],
  "fixed_and_variable_needs": {
    "empty_before_and_after_at_carre": true,
    "empty_at_beynost": true,
    "fixed_defaults": {
      "post": null,
      "employee_count": 1,
      "start": "06:00",
      "end": "23:00",
      "selected_days": []
    },
    "variable_defaults": {
      "post": null,
      "productivity_ratio": null,
      "unit": null,
      "frequency": "Par heure",
      "min_staff": null,
      "max_staff": null,
      "first_arrival": "06:00",
      "last_departure": "23:00",
      "offset": null
    },
    "productivity_units": [
      "€ de CA",
      "Clients",
      "Articles"
    ],
    "frequencies": [
      "Par heure",
      "Par quart d’heure"
    ],
    "post_options_carre_ordered": [
      "Commerce",
      "Dietetique",
      "Entretien",
      "Coach",
      "Marketing / Com",
      "Ecole / Formation",
      "Entretien",
      "Street Marketing",
      "Tournage / Story / Vidéo/ Photo",
      "Cours Collectif",
      "Plateau",
      "Formation",
      "MONEY TIME",
      "Réunion",
      "Accueil",
      "Parrainage",
      "Briefe Semaine",
      "Rangement / Fermeture",
      "Rattrapage",
      "Médecine du travail",
      "CE",
      "Déplacement",
      "PHONING BUREAU",
      "Animation commerciale"
    ],
    "post_options_note": "24 libellés, dont Entretien deux fois. Aucun identifiant ni distinction métier déduits de ce doublon.",
    "exit_dialog": [
      "Quitter sans enregistrer ?",
      "Annuler",
      "Continuer"
    ],
    "drafts_discarded": true
  },
  "missions": {
    "site": "Beynost",
    "terminated_filter_disabled_displayed": true,
    "terminated_detail_observed": false,
    "mission_finished_by_agent": false
  },
  "badge_history": {
    "site": "Beynost",
    "dates_checked": [
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15"
    ],
    "state": "Pas de correction pour cette journée, sur les sept journées consultées.",
    "nonempty_history_observed": false,
    "columns": [
      "Employés",
      "Shifts Prévus",
      "Pause",
      "Shifts Badgés",
      "Pause",
      "Poste",
      "Shifts Rémunérés",
      "Pause",
      "Validé par",
      "Date",
      "Raison de l’anomalie"
    ]
  },
  "variant_additional_entries": [
    {
      "id": "EXT-PAR02-01",
      "source_screen_id": "PAR02",
      "option": "Modes d’acquisition des congés payés",
      "detail": "Jours ouvrables ; Jours ouvrés ; Jours calendaires. Trois choix lus à Beynost sans sélection.",
      "proof": "Consultation administrateur du 13 novembre 2026, captures 67–77 et 86–96/99 selon site",
      "result_tested": false
    },
    {
      "id": "EXT-PAR02-02",
      "source_screen_id": "PAR02",
      "option": "Période affichée de l’annualisation",
      "detail": "01 juin 2026 - 31 mai 2027, deux sites ; calendrier et changement de période non actionnés.",
      "proof": "Consultation administrateur du 13 novembre 2026, captures 67–77 et 86–96/99 selon site",
      "result_tested": false
    },
    {
      "id": "EXT-PAR02-03",
      "source_screen_id": "PAR02",
      "option": "Afficher les paramètres avancés de l’annualisation",
      "detail": "Accès ouvert sur les deux sites, distinct de la bascule d’activation.",
      "proof": "Consultation administrateur du 13 novembre 2026, captures 67–77 et 86–96/99 selon site",
      "result_tested": false
    },
    {
      "id": "EXT-PAR02-04",
      "source_screen_id": "PAR02",
      "option": "Absences incluses dans le calcul annuel",
      "detail": "Sélecteur avec recherche, 42 motifs proposés et 31 cochés dans les deux clubs ; Annuler / Valider désactivé sans changement.",
      "proof": "Consultation administrateur du 13 novembre 2026, captures 67–77 et 86–96/99 selon site",
      "result_tested": false
    },
    {
      "id": "EXT-PAR02-05",
      "source_screen_id": "PAR02",
      "option": "Heures du dimanche incluses dans le calcul annuel",
      "detail": "Bascule active dans les deux clubs ; effet de calcul non testé.",
      "proof": "Consultation administrateur du 13 novembre 2026, captures 67–77 et 86–96/99 selon site",
      "result_tested": false
    },
    {
      "id": "EXT-PAR02-06",
      "source_screen_id": "PAR02",
      "option": "Personnaliser le calcul des heures supplémentaires de l’annualisation",
      "detail": "Bascule inactive dans les deux clubs ; contenu après activation non ouvert.",
      "proof": "Consultation administrateur du 13 novembre 2026, captures 67–77 et 86–96/99 selon site",
      "result_tested": false
    },
    {
      "id": "EXT-PAR02-07",
      "source_screen_id": "PAR02",
      "option": "Compteur RTT (Forfait heures)",
      "detail": "Carte distincte de Repos forfaits jours (RTT), bouton Activer proposé, non actionné.",
      "proof": "Consultation administrateur du 13 novembre 2026, captures 67–77 et 86–96/99 selon site",
      "result_tested": false
    },
    {
      "id": "EXT-PAR02-08",
      "source_screen_id": "PAR02",
      "option": "Inclusions et exclusions annuelles par motif",
      "detail": "Liste structurée des 42 motifs et de leurs états ; configuration distincte des propriétés d’acquisition et de demande du catalogue de 66 absences.",
      "proof": "Consultation administrateur du 13 novembre 2026, captures 67–77 et 86–96/99 selon site",
      "result_tested": false
    }
  ]
} as const;

export const CONTRACTS_COUNTERS_V116 = {
  "date_recorded": "2026-11-14",
  "method": "Lecture seule ; relevé initial de forfait jours repris puis contrôle du contrat passé. Valeurs, noms et identifiants privés non reproduits.",
  "observations": [
    {
      "id": "ADM14-01",
      "refs": [
        "EMP04",
        "EMP05"
      ],
      "observation": "Contrat existant en forfait jour : carte de contrat en cours, espace avenants, auteur/date, base en jours et taux moyen. Le détail présente type, temps plein, dates, statut/classification, matricule, visite médicale, mesure du temps et données de coût. Aucun champ modifié ; retour sans Mettre à jour.",
      "proof": "Consultation directe de la session administrateur, arbre d’accessibilité et/ou observation visuelle ; pas de capture RH conservée, pas de sauvegarde métier.",
      "result_tested": false
    },
    {
      "id": "ADM14-02",
      "refs": [
        "CPT02"
      ],
      "observation": "Compteur forfait jour individuel : colonnes annuelles puis mensuelles et défilement horizontal ; lignes Nombre de jours travaillés, Nombre de jours annuels (contrat), Compteur de jours avant modification manuelle, Modifications manuelles du compteur, Compteur de jours après modification manuelle, Jours restants. Aide En savoir plus. Aucun ajustement.",
      "proof": "Consultation directe de la session administrateur, arbre d’accessibilité et/ou observation visuelle ; pas de capture RH conservée, pas de sauvegarde métier.",
      "result_tested": false
    },
    {
      "id": "ADM14-03",
      "refs": [
        "CPT04"
      ],
      "observation": "Dossier forfait jour : quatre onglets Compteur de forfait jour, Historique, Compteur de Congés Payés, Compteur de repos forfait jours (RTT). Le dernier affiche Acquisition, RTT pris, Modifications manuelles, Solde restant, une période annuelle avec douze mois, et un accueil demandant Initialiser le compteur. Bouton non utilisé ; ni initialisation ni calcul validés. La visibilité individuelle ne permet pas de déduire la cause du réglage général désactivé.",
      "proof": "Consultation directe de la session administrateur, arbre d’accessibilité et/ou observation visuelle ; pas de capture RH conservée, pas de sauvegarde métier.",
      "result_tested": false
    },
    {
      "id": "ADM14-04",
      "refs": [
        "EMP04"
      ],
      "observation": "Autre dossier existant : Aucun contrat en cours, Historique avec un CDI passé. Colonnes Type de contrat, Date de création, Créé par, Volume horaire / Nb. jours par an, Période effective. Menu de ligne : Modifier les informations, Dupliquer le contrat, Créer un document pour ce contrat. Seule la consultation du formulaire Modifier les informations a été ouverte ; aucune duplication ni création de document.",
      "proof": "Consultation directe de la session administrateur, arbre d’accessibilité et/ou observation visuelle ; pas de capture RH conservée, pas de sauvegarde métier.",
      "result_tested": false
    },
    {
      "id": "ADM14-05",
      "refs": [
        "EMP04",
        "EMP05"
      ],
      "observation": "Formulaire du contrat passé : état Terminé ; type, intitulé, dates, statut, catégorie professionnelle, matricule, PCS-ESE, DPAE, visite médicale, temps de travail, salaire et taux, Mettre à jour. Aucun champ modifié. Retour au dossier vérifié ; onglet À venir affichant Aucun contrat à venir pour cet employé. Pas de contrat futur non vide constaté dans ce contrôle.",
      "proof": "Consultation directe de la session administrateur, arbre d’accessibilité et/ou observation visuelle ; pas de capture RH conservée, pas de sauvegarde métier.",
      "result_tested": false
    }
  ],
  "additional_entries": [
    {
      "id": "EXT-CPT04-01",
      "screen": "CPT04",
      "option": "Initialiser le compteur RTT forfait jours",
      "detail": "Commande de l’accueil individuel non initialisé. Non cliquée.",
      "proof": "Interface administrateur observée ; résultat après action non testé.",
      "result_tested": false
    },
    {
      "id": "EXT-EMP04-01",
      "screen": "EMP04",
      "option": "Modifier les informations du contrat passé",
      "detail": "Menu de ligne Historique ; formulaire Terminé consulté puis quitté sans sauvegarde.",
      "proof": "Interface administrateur observée ; résultat après action non testé.",
      "result_tested": false
    },
    {
      "id": "EXT-EMP04-02",
      "screen": "EMP04",
      "option": "Dupliquer le contrat passé",
      "detail": "Entrée visible au menu de ligne Historique ; parcours non ouvert.",
      "proof": "Interface administrateur observée ; résultat après action non testé.",
      "result_tested": false
    },
    {
      "id": "EXT-EMP04-03",
      "screen": "EMP04",
      "option": "Créer un document pour ce contrat passé",
      "detail": "Entrée visible au menu de ligne Historique ; parcours non ouvert.",
      "proof": "Interface administrateur observée ; résultat après action non testé.",
      "result_tested": false
    }
  ],
  "business_writes_performed": false,
  "new_hr_screenshots_saved": false,
  "ui_end_state": {
    "desktop_restored": true,
    "devtools_closed": true,
    "permission_dialog_closed_without_save": true,
    "own_help_tab_closed": true
  },
  "exhaustivity_certified": false
} as const;

export const SIGNATURES_JOURNAL_V116 = {
  "date": "2026-11-14",
  "observations": [
    {
      "id": "ADM14-D01",
      "refs": [
        "DOC01"
      ],
      "observation": "Sélecteur Appliquer à un modèle de document : cinq modèles existants affichés avec titre, date et auteur. Deux entrées visuellement grisées avec indicateur rouge ; cause non qualifiée. Trois autres entrées présentent Sélectionner. Aucun modèle sélectionné ni appliqué ; Appliquer ce modèle désactivé sans sélection. Sortie par Annuler. Le dossier Contrats consulté ensuite est vide pour la fiche sélectionnée.",
      "proof": "Interface consultée en administrateur ; états d’accessibilité et contrôle visuel après réouverture par le propriétaire. Aucune sauvegarde métier, relance, annulation, téléchargement ou création.",
      "result_tested": false
    },
    {
      "id": "ADM14-D02",
      "refs": [
        "DOC04"
      ],
      "observation": "Suivi des signatures à Beynost : sept colonnes Signataire(s), Document, Dossier, Signature(s), Date d’envoi, Dernière relance, Actions. Cinq lignes existantes : deux Erreur d’envoi, une 0/1, deux 1/1. Commandes Fermer, filtre et Relancer les documents non signés. Noms, titres contractuels, dates personnelles et contenu des documents non reproduits.",
      "proof": "Interface consultée en administrateur ; états d’accessibilité et contrôle visuel après réouverture par le propriétaire. Aucune sauvegarde métier, relance, annulation, téléchargement ou création.",
      "result_tested": false
    },
    {
      "id": "ADM14-D03",
      "refs": [
        "DOC04"
      ],
      "observation": "Filtre du suivi : recherche, groupes Destinataire(s), Dossiers et Statuts, Tout effacer et Appliquer les filtres. Dossiers : six catégories ; Statuts : sept choix. Tous laissés décochés ; aucune application de filtre de signatures. Fermeture et cinq états inchangés revérifiés.",
      "proof": "Interface consultée en administrateur ; états d’accessibilité et contrôle visuel après réouverture par le propriétaire. Aucune sauvegarde métier, relance, annulation, téléchargement ou création.",
      "result_tested": false
    },
    {
      "id": "ADM14-D04",
      "refs": [
        "DOC04"
      ],
      "observation": "Menu à trois points d’une ligne Erreur d’envoi : Renvoyer pour signature et Annuler la demande de signature. Menu seulement ouvert, aucune commande exécutée. Aucun menu d’une ligne signée n’était visible dans cet échantillon ; ne pas extrapoler ces commandes à tous les états.",
      "proof": "Interface consultée en administrateur ; états d’accessibilité et contrôle visuel après réouverture par le propriétaire. Aucune sauvegarde métier, relance, annulation, téléchargement ou création.",
      "result_tested": false
    },
    {
      "id": "ADM14-J01",
      "refs": [
        "JOU01",
        "BAD02"
      ],
      "observation": "Recherche du journal d’organisation filtrée sur Modification de shift rémunéré, période du 1er janvier au 14 novembre 2026 : Aucun évènement à afficher. Cette recherche ne prouve pas l’absence de toutes les corrections de badges et ne teste pas leur historique détaillé. Période et filtre temporaires retirés ; journal sans filtre retrouvé avec vingt lignes et panneau fermé.",
      "proof": "Interface consultée en administrateur ; états d’accessibilité et contrôle visuel après réouverture par le propriétaire. Aucune sauvegarde métier, relance, annulation, téléchargement ou création.",
      "result_tested": false
    }
  ],
  "additional_entries": [
    {
      "id": "EXT-DOC04-01",
      "screen": "DOC04",
      "option": "Recherche dans les filtres de signature",
      "detail": "Champ de recherche du panneau Filtres.",
      "choices_observed": [],
      "evidence_class": "observed_ui",
      "result_tested": false
    },
    {
      "id": "EXT-DOC04-02",
      "screen": "DOC04",
      "option": "Filtre Destinataire(s)",
      "detail": "Groupe disponible ; aucune personne sélectionnée, liste nominative non reproduite.",
      "choices_observed": [],
      "evidence_class": "observed_ui",
      "result_tested": false
    },
    {
      "id": "EXT-DOC04-03",
      "screen": "DOC04",
      "option": "Filtre Dossiers",
      "detail": "Six catégories proposées ; laissées décochées.",
      "choices_observed": [
        "Contrats",
        "Sécu soc. & Mutuelle",
        "Justificatifs",
        "Fiches de paie",
        "Feuilles d’heures",
        "Autre"
      ],
      "evidence_class": "observed_ui",
      "result_tested": false
    },
    {
      "id": "EXT-DOC04-04",
      "screen": "DOC04",
      "option": "Filtre Statuts",
      "detail": "Sept états proposés ; laissés décochés.",
      "choices_observed": [
        "Envoi en cours",
        "Signé",
        "En cours de signature",
        "Non signé",
        "Envoi annulé",
        "Envoi expiré",
        "Erreur d’envoi"
      ],
      "evidence_class": "observed_ui",
      "result_tested": false
    },
    {
      "id": "EXT-DOC04-05",
      "screen": "DOC04",
      "option": "Tout effacer — filtres des signatures",
      "detail": "Désactivé lorsqu’aucun filtre n’est sélectionné.",
      "choices_observed": [],
      "evidence_class": "observed_ui",
      "result_tested": false
    },
    {
      "id": "EXT-DOC04-06",
      "screen": "DOC04",
      "option": "Appliquer les filtres — signatures",
      "detail": "Commande visible ; non exécutée lors de la lecture de ces choix.",
      "choices_observed": [],
      "evidence_class": "observed_ui",
      "result_tested": false
    },
    {
      "id": "EXT-DOC04-07",
      "screen": "DOC04",
      "option": "Renvoyer pour signature — ligne en erreur",
      "detail": "Commande du menu de ligne ; non exécutée.",
      "choices_observed": [],
      "evidence_class": "observed_ui",
      "result_tested": false
    },
    {
      "id": "EXT-DOC04-08",
      "screen": "DOC04",
      "option": "Annuler la demande de signature — ligne en erreur",
      "detail": "Commande du menu de ligne ; non exécutée.",
      "choices_observed": [],
      "evidence_class": "observed_ui",
      "result_tested": false
    }
  ],
  "signature_status_choices": [
    "Envoi en cours",
    "Signé",
    "En cours de signature",
    "Non signé",
    "Envoi annulé",
    "Envoi expiré",
    "Erreur d’envoi"
  ],
  "signature_folder_choices": [
    "Contrats",
    "Sécu soc. & Mutuelle",
    "Justificatifs",
    "Fiches de paie",
    "Feuilles d’heures",
    "Autre"
  ],
  "signed_case_found": true,
  "sample_signature_rows": {
    "send_error": 2,
    "pending_0_of_1": 1,
    "signed_1_of_1": 2
  },
  "business_writes_performed": false,
  "sensitive_hr_screenshots_saved": false,
  "ui_end_state": "Journal non filtré, vingt lignes ; période de recherche retirée, panneaux fermés. Aucun changement métier.",
  "exhaustivity_certified": false
} as const;

export const DOCUMENTARY_RECETTE_V116 = {
  "date": "2026-11-14",
  "scope": "Douze articles écrits de la collection Suivi du temps de travail et quatre articles complémentaires. Liens interactifs/vidéos non assimilés à un visionnage.",
  "collection_url": "https://help.skello.io/fr/collections/3838141-suivi-du-temps-de-travail",
  "documents": [
    {
      "id": "DOC14-01",
      "title": "Modulation",
      "url": "https://help.skello.io/fr/articles/17280655-gerer-votre-lissage-des-heures-avec-le-compteur-de-modulation",
      "refs": [
        "CPT04",
        "CPT05",
        "PAR02"
      ],
      "evidence": "Documentation officielle écrite consultée ; parcours et calculs non testés.",
      "notes": [
        "Le texte traite lissage, récupération, entrée en cours de semaine, absences, absences injustifiées et soldes de fin de période.",
        "Six tutoriels interactifs sont liés ; leurs étapes ne sont pas considérées comme visionnées."
      ],
      "proposed_acceptance_scenarios": [
        "Comparer un début de contrat en milieu de semaine à un début le lundi.",
        "Tester séparément récupération, absence assimilée et absence injustifiée sur données fictives."
      ],
      "result_tested": false
    },
    {
      "id": "DOC14-02",
      "title": "Paramétrage des jours fériés",
      "url": "https://help.skello.io/fr/articles/5252875-comment-modifier-le-parametrage-du-compteur-de-jours-feries",
      "refs": [
        "PAR02",
        "CPT04"
      ],
      "evidence": "Documentation officielle écrite consultée ; parcours et calculs non testés.",
      "notes": [
        "Le calendrier dépend de la zone de l’établissement ; jours actifs, personnalisés, garantis et indemnisation à payer/à récupérer sont distincts. Année suivante paramétrable dès décembre.",
        "Le compteur individuel relève du site principal ; personnalisation de l’année courante et report du reliquat précédent sont décrits. Disponibilité dépendant de l’offre."
      ],
      "proposed_acceptance_scenarios": [
        "Différencier configuration du site et exception individuelle, sur deux sites.",
        "Vérifier passage d’année, reliquat et jour personnalisé sans confondre paie et récupération."
      ],
      "result_tested": false
    },
    {
      "id": "DOC14-03",
      "title": "Compteur d’heures",
      "url": "https://help.skello.io/fr/articles/7156849-comment-suivre-le-compteur-d-heures-des-employes",
      "refs": [
        "CPT04",
        "RAP02",
        "PLA01"
      ],
      "evidence": "Documentation officielle écrite consultée ; parcours et calculs non testés.",
      "notes": [
        "Compensation et base contractuelle nécessaires ; contrats Extra exclus. Initialisation au dimanche précédent dans le cas décrit.",
        "Le planning expose un solde non modifiable ; la fiche et le rapport proposent des ajustements. Une correction se compense par une écriture inverse. Le rapport propose aussi payer ou compenser en RCR."
      ],
      "proposed_acceptance_scenarios": [
        "Contrôler semaines lundi–dimanche et cas sans date de début.",
        "Tracer ajustement décimal, majoration et compensation inverse sans supprimer l’historique."
      ],
      "result_tested": false
    },
    {
      "id": "DOC14-04",
      "title": "Jours fériés dans planning et paie",
      "url": "https://help.skello.io/fr/articles/7845387-comment-gerer-les-jours-feries-avec-skello",
      "refs": [
        "PLA01",
        "CPT04",
        "RAP01",
        "EXP01"
      ],
      "evidence": "Documentation officielle écrite consultée ; parcours et calculs non testés.",
      "notes": [
        "Travail, repos hebdomadaire et jour chômé sont des cas séparés. Les colonnes dédiées de l’export ne sont pas toutes présentes dans le rapport web.",
        "Le compteur exige site principal activé et contrat horaire compatible ; forfait jour, Extra, Temporaire et Mise à disposition en sont exclus dans cet article. Récupération via motif dédié."
      ],
      "proposed_acceptance_scenarios": [
        "Comparer un jour travaillé, chômé et en repos hebdomadaire garanti.",
        "Rapprocher rapport web et export, dont 1er mai et solidarité, avec règles validées."
      ],
      "result_tested": false
    },
    {
      "id": "DOC14-05",
      "title": "Congés payés",
      "url": "https://help.skello.io/fr/articles/3704253-comment-suivre-les-compteurs-de-conges-payes-sur-skello",
      "refs": [
        "CPT03",
        "PAR12",
        "EXP01"
      ],
      "evidence": "Documentation officielle écrite consultée ; parcours et calculs non testés.",
      "notes": [
        "La fiche distingue acquis, pris et restant. Le texte relie acquisition aux shifts et aux absences permettant l’acquisition ; le rapport Excel comprend un onglet dédié.",
        "Ce texte de 2024 ne suffit pas à définir le droit applicable ni toutes les règles de calcul actuelles."
      ],
      "proposed_acceptance_scenarios": [
        "Comparer mois planifié, sans shift et avec absence assimilée, selon règles métier validées.",
        "Contrôler cohérence fiche, planning et onglet CP de l’export."
      ],
      "result_tested": false
    },
    {
      "id": "DOC14-06",
      "title": "Solde RTT forfait jours",
      "url": "https://help.skello.io/fr/articles/8038240-comment-suivre-le-solde-de-repos-forfait-jours-rtt-sur-skello",
      "refs": [
        "CPT04"
      ],
      "evidence": "Documentation officielle écrite consultée ; parcours et calculs non testés.",
      "notes": [
        "Acquisition, prise et solde suivent la période de référence. Le document distingue acquisition annuelle et mensuelle, et prorata d’entrée.",
        "Les motifs RTT / repos forfait jours alimentent ce suivi selon la configuration."
      ],
      "proposed_acceptance_scenarios": [
        "Comparer acquisition annuelle et mensuelle à une même date.",
        "Tester entrée en cours de période et consommation complète/demi-journée sur jeu fictif."
      ],
      "result_tested": false
    },
    {
      "id": "DOC14-07",
      "title": "Annualisation",
      "url": "https://help.skello.io/fr/articles/8498937-comment-gerer-l-annualisation-du-temps-de-travail-sur-skello",
      "refs": [
        "CPT05",
        "EMP05",
        "PLA01",
        "RAP01"
      ],
      "evidence": "Documentation officielle écrite consultée ; parcours et calculs non testés.",
      "notes": [
        "La fiche indique base annuelle, planifié et restant sur la période entière ; le planning affiche un écart hebdomadaire cumulé.",
        "Le rapport distingue base annuelle, réalisé, restant et écart cumulé. Un avenant peut modifier le volume en cours de période. Les indicateurs ne partagent donc pas nécessairement la même date d’arrêté."
      ],
      "proposed_acceptance_scenarios": [
        "Définir et afficher la date d’arrêté de chaque indicateur.",
        "Tester avenant temporaire/permanent, limites de période et absences incluses."
      ],
      "result_tested": false
    },
    {
      "id": "DOC14-08",
      "title": "Jours travaillés en forfait jours",
      "url": "https://help.skello.io/fr/articles/8765515-comment-suivre-les-jours-travailles-et-gerer-les-absences-en-forfait-jours-sur-skello",
      "refs": [
        "CPT02",
        "PLA01",
        "RAP01"
      ],
      "evidence": "Documentation officielle écrite consultée ; parcours et calculs non testés.",
      "notes": [
        "Le suivi annuel est distinct des heures affichées. L’option Présence masque les horaires sans changer le compteur ; plusieurs shifts d’une journée ne représentent pas plusieurs jours travaillés.",
        "Absence en journée ou demi-journée ; une absence et un travail le même jour exigent un traitement spécifique. Historique PDF et feuille individuelle sont documentés."
      ],
      "proposed_acceptance_scenarios": [
        "Comparer un et plusieurs shifts de durées différentes le même jour.",
        "Tester journée et demi-journée d’absence, et chevauchement présence/absence."
      ],
      "result_tested": false
    },
    {
      "id": "DOC14-09",
      "title": "Badgeuse tablette",
      "url": "https://help.skello.io/fr/articles/8861377-comment-badger-son-temps-de-travail-sur-une-tablette",
      "refs": [
        "BAD01",
        "BAD03",
        "PAR16"
      ],
      "evidence": "Documentation officielle écrite consultée ; parcours et calculs non testés.",
      "notes": [
        "Les parcours décrits séparent arrivée, identification PIN, éventuelle signature, pause, retour et fin du shift. Un mauvais salarié reconnu dispose d’un retour de correction.",
        "Ce sont des instructions documentées ; aucun badge, PIN, photo ou signature n’a été produit lors de l’audit."
      ],
      "proposed_acceptance_scenarios": [
        "Sur démonstration fictive, différencier départ en pause et fin de service.",
        "Tester mauvaise identité puis annulation sans enregistrer pour la mauvaise personne."
      ],
      "result_tested": false
    },
    {
      "id": "DOC14-10",
      "title": "Repos compensateur de remplacement",
      "url": "https://help.skello.io/fr/articles/11895069-comment-gerer-les-repos-compensateurs-de-remplacement-rcr",
      "refs": [
        "CPT04",
        "PAR02",
        "RAP02"
      ],
      "evidence": "Documentation officielle écrite consultée ; parcours et calculs non testés.",
      "notes": [
        "Le document décrit éligibilité, sélection des personnes, dimanche d’initialisation et reprise décimale du reliquat.",
        "Répartition des heures entre paiement et RCR, compensation totale et limite du disponible. Ajuster le RCR seul ne modifie pas le compteur d’heures. Remise à zéro définitive et risque de perte d’historique à la désactivation sont signalés."
      ],
      "proposed_acceptance_scenarios": [
        "Contrôler éligibilité, reliquats positifs/négatifs et heures décimales.",
        "Tester paiement partiel/RCR et empêcher une répartition supérieure au disponible."
      ],
      "result_tested": false
    },
    {
      "id": "DOC14-11",
      "title": "Heures normales",
      "url": "https://help.skello.io/fr/articles/15644915-comprendre-et-configurer-les-heures-normales-dans-skello",
      "refs": [
        "PAR12",
        "RAP01",
        "EXP01"
      ],
      "evidence": "Documentation officielle écrite consultée ; parcours et calculs non testés.",
      "notes": [
        "Le document différencie dépassement issu d’absence indemnisée et heures majorées/complémentaires ; affichage dans rapport, export et détail au survol.",
        "Le paramétrage par absence peut recalculer le passé et demande confirmation. L’article conditionne la modification au profil et à la permission de modifier règles et absences."
      ],
      "proposed_acceptance_scenarios": [
        "Distinguer travail effectif, absence indemnisée, heures normales et majorées dans un exemple validé.",
        "Tester contrôle serveur du droit et confirmation du recalcul rétroactif."
      ],
      "result_tested": false
    },
    {
      "id": "DOC14-12",
      "title": "Retard et salaire",
      "url": "https://help.skello.io/fr/articles/17673786-comment-deduire-le-retard-uniquement-du-salaire",
      "refs": [
        "PAR01",
        "CPT04",
        "RAP01",
        "EXP01"
      ],
      "evidence": "Documentation officielle écrite consultée ; parcours et calculs non testés.",
      "notes": [
        "Option ordinateur avec date de référence un dimanche, effet lundi suivant et rétroactivité limitée décrite à trois mois. Export avec/sans retard et détails de planning/rapport sont distingués.",
        "Le texte évoque un ajustement avec modulation mais exclut ensuite l’annualisation. Cette articulation est à faire préciser par l’éditeur avant d’en faire une formule maison."
      ],
      "proposed_acceptance_scenarios": [
        "Faire valider les cas modulation et annualisation avant implémentation.",
        "Tester date d’effet, rétroactivité et désactivation sur un jeu fictif."
      ],
      "result_tested": false
    },
    {
      "id": "DOC14-13",
      "title": "Règles de badgeuse",
      "url": "https://help.skello.io/fr/articles/7182933-comment-parametrer-les-regles-de-la-badgeuse",
      "refs": [
        "PAR16",
        "BAD01"
      ],
      "evidence": "Documentation officielle écrite consultée ; parcours et calculs non testés.",
      "notes": [
        "Prévu, pointé et retenu pour rémunération restent distincts. Les tolérances décrites vont jusqu’à 119 minutes et ne comprennent pas l’arrivée anticipée.",
        "Arrondi 5/10/15 minutes sur heures retenues de travail, distinct des pauses ; sans shift prévu, cas particulier décrit. SMS tablette, gestion des pauses et synchronisation entre tablettes dépendent des réglages."
      ],
      "proposed_acceptance_scenarios": [
        "Tester seuil juste avant/égal/après et absence de shift prévu.",
        "Comparer données brutes et retenues après tolérance/arrondi, sans arrondir les pauses implicitement."
      ],
      "result_tested": false
    },
    {
      "id": "DOC14-14",
      "title": "Pointage sur téléphone",
      "url": "https://help.skello.io/fr/articles/16001655-je-fais-badger-mes-employes-sur-leur-telephone-mobile",
      "refs": [
        "BAD03",
        "PAR16"
      ],
      "evidence": "Documentation officielle écrite consultée ; parcours et calculs non testés.",
      "notes": [
        "Disponibilité conditionnée à la permission et au site principal ; délai de prise en compte ou reconnexion mentionnés.",
        "Géolocalisation optionnelle, précision et conservation limitées décrites ; alertes appareil partagé et blocage de position simulée. Pas de SMS de retard pour le pointage mobile selon ce texte. Aucun de ces contrôles matériels testé."
      ],
      "proposed_acceptance_scenarios": [
        "Vérifier autorisation, site principal et délai de propagation sur un environnement fictif.",
        "Tester refus de géolocalisation et règle de conservation avec matériel adapté."
      ],
      "result_tested": false
    },
    {
      "id": "DOC14-15",
      "title": "Configuration RTT forfait jours",
      "url": "https://help.skello.io/fr/articles/8038212-comment-activer-et-configurer-le-compteur-de-repos-forfait-jours-rtt-sur-skello",
      "refs": [
        "PAR02",
        "CPT04"
      ],
      "evidence": "Documentation officielle écrite consultée ; parcours et calculs non testés.",
      "notes": [
        "Quatre étapes décrites : rythme annuel/mensuel, période de référence, mois d’initialisation et reprise historique des salariés concernés.",
        "Le calcul dépend du calendrier, du contrat et des jours non travaillés. Ne pas transformer l’exemple de l’article en constante annuelle universelle. Activation non réalisée."
      ],
      "proposed_acceptance_scenarios": [
        "Tester année bissextile, entrée en cours d’année et reprise des soldes validés.",
        "Comparer les bases de calendrier et de contrat avant de valider la recette."
      ],
      "result_tested": false
    },
    {
      "id": "DOC14-16",
      "title": "Suivi des pointages",
      "url": "https://help.skello.io/fr/articles/7252651-comment-suivre-les-heures-d-arrivee-et-de-depart-badgees-sur-skello",
      "refs": [
        "BAD01",
        "BAD02",
        "BAD03"
      ],
      "evidence": "Documentation officielle écrite consultée ; parcours et calculs non testés.",
      "notes": [
        "Synchronisation tablette et remontée des badges sont séparées de la lecture web. Vues journée, employé et historique ; photos/signatures consultables selon réglages.",
        "Le document décrit un export administrateur portant jusqu’à quatre ans avec lien envoyé valable sept jours ; aucune extraction de données RH déclenchée."
      ],
      "proposed_acceptance_scenarios": [
        "Tester retard de synchronisation et reprise réseau sans doublons sur démonstration.",
        "Vérifier autorisation, durée de validité et destinataire d’un export fictif."
      ],
      "result_tested": false
    }
  ],
  "doc_count": 16,
  "acceptance_scenarios_status": "Propositions de recette pour CFitness OS ; aucun résultat attendu n’a été vérifié dans Skello par exécution.",
  "legal_or_payroll_validation": "Les formules et règles applicables doivent être validées avec le responsable paie ; ces textes ne constituent pas une validation juridique.",
  "exhaustivity_certified": false
} as {
  date: string;
  scope: string;
  collection_url: string;
  documents: DocumentaryArticleRef[];
  doc_count: number;
  acceptance_scenarios_status: string;
  legal_or_payroll_validation: string;
  exhaustivity_certified: boolean;
};

export const DELIVERY_VERIFICATION_V116 = {
  "date": "2026-11-14",
  "version": "V1.16",
  "baseline_screens": 91,
  "baseline_entries": 1605,
  "supplemental_entries": 20,
  "candidate_house_actions": 189,
  "cumulative_administrator_observations": 71,
  "administrator_captures": 99,
  "separate_emulation_captures": 9,
  "documentary_articles_added": 16,
  "proposed_acceptance_scenarios_added": 32,
  "source_results_tested": 0,
  "image_decode_and_hashes": "pass",
  "guide_relative_links": "pass",
  "source_contract_mapping": "pass",
  "mockup_generation_checks": {
    "screen_templates_checked": {
      "employee": 29,
      "manager": 91,
      "standard": 35,
      "observed-employee": 12,
      "master": 48,
      "advanced-readonly": 25,
      "advanced-planner": 37
    },
    "source_entries_present": 1605,
    "proposed_actions": 189,
    "permission_checks": "pass",
    "verification_scope": "Génération de tous les écrans et contrôles en mémoire, sans vérification visuelle dans un navigateur",
    "readonly_audit_checks": "6 cartes ; 44 états administrateur en consultation ; 66 motifs avec leurs états et inconnues : pass",
    "standard_profile_checks": "navigation des deux clubs, propre fiche/équipier/responsable, demandes acceptées/refusées, récurrence par jour et documents personnels : pass",
    "employee_profile_checks": "planning personnel à deux clubs, plannings partagés avec non-publication et motifs génériques, six onglets, demandes vides et site limité, absence de commandes de gestion : pass",
    "permissions_matrix_checks": "155 cases personnalisables et leurs états, trois périmètres sur chaque profil, non-proposé distinct de décoché, attribution par établissement et contrôle de délégation : pass",
    "master_profile_checks": "Accès aux modules observés, missions par site, absence de délégation, rapport activité, distribution PDF/ZIP, propres demandes vides : pass",
    "advanced_readonly_checks": "Masquage sensible, absence de délégation/réglage export/demandes, documents propres, notifications et dossier personnel, compteurs selon état, missions et badgeuse Beynost, filtre Missions et formats v3/v4 distincts : pass",
    "advanced_planner_checks": {
      "cases_generated": 208,
      "partial_audit": true,
      "permission_checks": "pass",
      "observations": 71
    },
    "advanced_planner_followup_checks": "Semaine/mois distincts, six cases impression semaine, menus shift et contrats, durée personnalisée, sept jours, Missions grisé, deux sites : pass",
    "administrator_partners_checks": "Six catégories, 46 logiciels caisse, trois mentions de connexion paie, sens SIRH, trois interrupteurs off, recrutement/acompte distincts, colonnes et six types journal : pass",
    "administrator_badge_checks": "Huit familles, modes photo, contrôles neutralisés, code d’accès absent : pass",
    "club_settings_comparison_checks": "Fréquences distinctes et pause tablette par club, 19 alertes et sept blocages, sept familles de règles : pass",
    "admin_resume_checks": "19 alertes Beynost, absence de rapport qualifiée, 66 motifs, 14 contraintes Smart, formulaires et export neutralisés : pass",
    "new_variants_checks": "Règles par site, 42 motifs et 8 bascules de compteurs, trois modes CP, RTT distincts, champs des besoins, historique vide et mission grisée : pass",
    "followup_2026_11_14_checks": "Contrat terminé, trois commandes neutralisées, six lignes forfait jour, RTT non initialisé et absence de nouveaux droits salarié : pass",
    "visual_browser_qa_performed": false,
    "deep_documentary_checks": "Signature non vide, sept états, six dossiers, commandes neutralisées et précisions documentées : pass"
  },
  "browser_visual_qa": "V1.16 not visually verified; generation and rights tested in memory",
  "skello_final_state": "Desktop restored, device toolbar off, DevTools closed, permission panel closed by Cancel. Preview tab closed; Skello permission page restored.",
  "exhaustivity_certified": false,
  "remaining_file": "AIDE_NECESSAIRE_ET_RESTANT_ADMINISTRATEUR.txt",
  "written_articles_reviewed_deep_pass": 67,
  "written_collections_reconciled": 5,
  "unresolved_ambiguities": 10,
  "latest_skello_end_state": "Journal non filtré, vingt lignes ; période de recherche retirée, panneaux fermés. Aucun changement métier."
} as const;

export const CLIENT_HTML_DELIVERABLES = [
  {
    id: 'DELIV-V116',
    title: 'Maquettes Mon Compte CFitness OS V1.16 (7 vues de profils + aperçu droits)',
    url: '/references/Maquettes_Mon_compte_CFITNESS_V1_16.html',
    description: 'Version courante de référence V1.16 avec les 7 profils (Collaborateur, Employé standard, Responsable, Planif. standard, Master avancé, Lecture seule avancée, Planif. avancé).',
  },
  {
    id: 'DELIV-GUIDE',
    title: 'Guide actualisé Skello -> CFitness OS (91 fiches · 1 605 entrées · liens captures)',
    url: '/references/Guide_actualise_Skello_CFITNESS.html',
    description: 'Catalogue consultable complet des 91 fiches sources, 20 compléments, 71 constats administrateur et captures associées.',
  },
  {
    id: 'DELIV-DOC',
    title: 'Relecture documentaire approfondie Skello (67 articles · 5 collections · 10 ambiguïtés)',
    url: '/references/Relecture_documentaire_approfondie_Skello.html',
    description: 'Synthèse documentaire des 67 articles consultés et des 10 ambiguïtés identifiées.',
  },
  {
    id: 'DELIV-AIDE',
    title: 'Aide nécessaire et travail restant administrateur (TXT)',
    url: '/references/AIDE_NECESSAIRE_ET_RESTANT_ADMINISTRATEUR.txt',
    description: 'Liste exacte des cas non observables en lecture seule ou nécessitant une validation métier.',
  },
  {
    id: 'DELIV-CONSIGNE',
    title: 'Consigne pour l’IA & règles de transmission (TXT)',
    url: '/references/CONSIGNE_POUR_IA.txt',
    description: 'Directives d’architecture, RBAC multi-sites et garde-fous de développement.',
  },
] as const;
