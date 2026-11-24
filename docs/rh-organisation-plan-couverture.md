# Réglages d’organisation et RH — périmètre de suivi

24 novembre 2026. Extraction traçable du registre audité public/references/atlas_1605_entries.json, périmètres ORG, DRO et PAR. Ce document ne remplace pas les autres inventaires Skello du dossier.

Le CSV associé conserve 571 entrées source réparties sur 27 écrans/rubriques. Il s’agit de contrôles, informations et états audités, pas de 571 fonctionnalités distinctes déjà développées. Toutes les lignes commencent À confronter au code puis à recetter individuellement : leur présence documentaire ne vaut pas validation du logiciel.

## Rubriques à couvrir

| Écran | Rubrique source | Entrées auditées |
| --- | --- | --- |
| PAR01 | Règles de l’établissement | 11 |
| PAR02 | Compteurs activables | 9 |
| PAR03 | Alertes du planning | 22 |
| PAR04 | Règles du rapport | 13 |
| PAR05 | Postes | 36 |
| PAR06 | Équipes | 13 |
| PAR07 | Missions activables | 4 |
| PAR08 | Planification automatique | 9 |
| PAR09 | Règles du Smart Planner | 19 |
| PAR10 | Attribution des shifts | 5 |
| PAR11 | Règles des absences | 12 |
| PAR12 | Motifs d’absence exposés | 66 |
| PAR13 | Identité de l’établissement | 15 |
| PAR14 | Modèles de documents RH | 14 |
| PAR15 | Gestion des dossiers | 10 |
| PAR16 | Paramètres de la badgeuse | 34 |
| ORG01 | Données de l’organisation | 16 |
| ORG02 | Abonnement et facturation | 20 |
| ORG03 | Niveaux de permission | 10 |
| ORG04 | Actions de la matrice de droits | 44 |
| DRO01 | Droits détaillés : Master avancé | 45 |
| DRO02 | Droits détaillés : Lecture seule | 18 |
| DRO03 | Droits détaillés : Planificateur avancé | 45 |
| DRO04 | Droits détaillés : Planificateur standard | 45 |
| DRO05 | Droits détaillés : Employé standard | 7 |
| PAR17 | Référentiels du Carré de Soie | 4 |
| PAR18 | Besoins fixes et variables en personnel | 25 |

## Organisation cible et règles non négociables

- Collaborateurs et RH > Paramètres RH : règles des clubs, équipes/postes, planning, absences/motifs/compteurs, documents, badgeuses. Administration et droits : organisation, profils et actions détaillées, rattachements par club, équipes, délégations et journal. Ne pas multiplier des réglages indépendants du même objet.
- Un salarié peut dépendre d’un ou des deux clubs, avec un profil différent par club et plusieurs équipes. Appartenance et équipe encadrée sont deux notions distinctes.
- Les droits doivent être refusés aussi sur l’API, avec masquage des champs salariaux et identifiants sensibles ; masquer un bouton ne suffit pas.
- Badgeuses : édition réservée au propriétaire/super administrateur sur le club visé. Les droits génériques d’organisation ne suffisent pas. Pointage personnel et tablette configurables par collaborateur/club ; appareil/salle et photo selon la politique autorisée. Les galeries doivent également respecter les droits prévus.
- Conserver la présentation familière des rubriques auditées et les couleurs/pictogrammes C.Fitness ; masquer les codes internes dans le parcours quotidien.
- ORG02 est l’abonnement/facturation du fournisseur source : décider de l’usage métier C.Fitness et conserver la traçabilité sans réimplémenter une facturation Skello inutile.

## État réellement constaté dans ce lot

- AdminRightsView.tsx possède déjà six onglets (droits/rôles, comptes/délégations, import, organisation/clubs, journal, sauvegarde). Cette lecture n’est pas une recette exhaustive de leurs options.
- Les routes organization/profiles/site-accesses/sites existent ; leur présence ne valide pas tous les contrôles de l’audit. Plusieurs sections PAR reposent encore sur des références/présentations dans PlanningAndModulesView.tsx.
- Le module dédié clock_policy utilise déjà is_owner_or_super_admin. L’ancienne route PUT /api/admin/sites/:site_id/timeclock-settings acceptait encore un administrateur sur un autre club ou les droits génériques ORG04-29/37. Correction dans cette branche : Bearer obligatoire, propriétaire/superadmin du club cible, deux contrôles correspondants alignés côté écran.
- Le contrat actuel identifie ce niveau par profileId=admin_systeme sur le club ; un éventuel futur rôle propriétaire distinct devra faire évoluer ensemble le modèle, le serveur et l’interface.
- Tests de cette correction : 132 Rust (dont refus Master, session obligatoire, propriétaire mono-club, persistance/rollback) ; build TypeScript/Vite réussi ; recette HTTP réelle dédiée dans scripts/test_timeclock_settings_owner.py. Le contrôle visuel de ces deux boutons n’a pas été réexécuté dans ce lot.

## Répartition et prochain développement

- #50 : dossier/contrat/compteurs et synchronisation des contextes de club du hub, confiés au développeur ; attendre sa confirmation avant de déclarer un démarrage.
- #52 : retrait d’absence en attente livré séparément par Codex, recettes des deux vues et des courses concurrentes.
- Ce lot : corriger l’ancienne permission de badgeuse et conserver toutes les lignes ORG/DRO/PAR du registre pour une recette option par option.
- Développer ensuite par objets canoniques : (1) clubs/postes/équipes/profils et actions ; (2) motifs/règles/compteurs et planning ; (3) modèles/dossiers et réglages complémentaires. Chaque lot doit nommer ses fichiers et éviter de modifier ceux d’un autre chantier.

## Retours à Skello nécessaires

La copie auditée évoque 44 actions détaillées observées et une indication fournisseur de +53 : les actions non exposées ne doivent pas être inventées. Recontrôler avec accès administrateur/superadmin les variations de profils, portées et options grisées/non observées. Les changements de l’éditeur depuis l’audit restent à comparer. Seule une liste source bornée, actuelle et recettée permet de parler de couverture exhaustive ; le présent CSV conserve le périmètre déjà audité.
