# Présentation RH — Pilotage, missions et communications internes (27 novembre 2026)

## Objectif du lot

Rendre les rubriques **Pilotage et missions** (`HrPilotageMissionsView.tsx`) et **Communication RH** (`HrCommunicationsView.tsx`) directement lisibles sur ordinateur, tablette et mobile en affichant les listes et indicateurs avant les formulaires de saisie, en rendant les formulaires dépliables et en supprimant les mentions techniques inutiles.

## Ajustements réalisés

| Écran | Avant | Après |
| --- | --- | --- |
| Pilotage et missions — En-tête & alertes | Mention « Environnement de test », bouton « Recharger la version serveur », badge « Données financières masquées (RBAC) », libellé « Shifts publiés » | Libellés métier clairs : « Réessayer le chargement », « Données financières réservées à la direction », « Créneaux publiés » |
| Pilotage et missions — Indicateurs | Formulaire de mise à jour des indicateurs toujours déployé sous les cartes | Panneau dépliable `<details>` (ouvert automatiquement si une modification est en cours) |
| Pilotage et missions — Missions | Formulaire de création affiché avant la liste et les filtres (`Toutes`, `En cours`, `Terminées`) | Liste et filtres de missions affichés en premier ; formulaire de création/édition dépliable en dessous (ouvert automatiquement lors de la modification d’une mission) |
| Communication RH | Formulaire complet de rédaction et grille des destinataires tout en haut avant les messages envoyés et programmés | Historique « Mes messages envoyés dans ce club » et « Mes publications programmées » affichés en premier ; panneau « Nouveau message » dépliable avec ouverture automatique en cas de brouillon |

## Garanties fonctionnelles conservées

- Gardes de brouillon (`useLeadDraftGuard` et `confirmLeadDraftNavigation`) préservées lors des changements d’onglets ou de rubriques.
- Aucun changement de contrat API, de calcul d’indicateurs, d’export CSV, de filtrage d’audience ou de règles de droits serveur.
- Aucune donnée réelle ni connexion à un service externe.
