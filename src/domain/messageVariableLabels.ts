/** Business labels; message insertion keeps the existing tokens. */
const variableLabels: Readonly<Record<string, string>> = {
  prenom: 'Prénom', nom: 'Nom', club: 'Nom du club',
  'telephone-club': 'Téléphone du club', 'adresse-club': 'Adresse du club',
  'url-rdv-club': 'Lien de rendez-vous', 'url-club': 'Site du club',
  'prenom-commercial': 'Prénom du commercial', 'rdv-date': 'Date du rendez-vous',
  'rdv-heure': 'Heure du rendez-vous', date: 'Date', heure: 'Heure',
  prix: 'Prix', 'unsubscribe-url': 'Lien de désinscription',
};

export const messageVariableLabel = (tag: string): string => variableLabels[tag] ?? tag;
