/** Business labels; audit references stay in the technical view. */
export const LEAD_SETTINGS_PRESENTATION: Readonly<Record<string, { label: string; summary: string }>> = {
  'app-settings': { label: 'Préférences', summary: 'Langue et affichage des statistiques.' },
  sms: { label: 'Crédits SMS', summary: 'Consulter le solde disponible pour ce club.' },
  marketing: { label: 'Profil du club', summary: 'Nom, adresse et identité visuelle du club.' },
  'club-profile': { label: 'Profil du club', summary: 'Nom, adresse et identité visuelle du club.' },
  users: { label: 'Utilisateurs et droits', summary: 'Accès des collaborateurs selon leur rôle et leur club.' },
  meetings: { label: 'Rendez-vous', summary: 'Organisation des séances découverte et des réservations.' },
  automation: { label: 'Messages automatiques', summary: 'Activer les rappels, modifications et annulations par email ou SMS.' },
  prospects: { label: 'Gestion des prospects', summary: 'Attribution des prospects, inactivité et archivage.' },
  segments: { label: 'Segments', summary: 'Organisation des groupes de contacts.' },
  script: { label: 'Argumentaire de vente', summary: 'Préparer le déroulé des échanges avec les prospects.' },
  sources: { label: 'Sources des prospects', summary: 'Origine des contacts et catégories d’acquisition.' },
  exclusions: { label: 'Passage au statut client', summary: 'Offres Heitz qui convertissent un prospect en client.' },
  notifications: { label: 'Notifications', summary: 'Destinataires et règles de notification du club.' },
  whatsapp: { label: 'WhatsApp', summary: 'Numéro WhatsApp associé au club.' },
  partners: { label: 'Connexions partenaires', summary: 'Services externes et état de leur configuration.' },
};
