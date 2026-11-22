# Liaison espace personnel / responsable RH

Lot du 22 novembre 2026, dépendant de la PR #29 (approuvée par pinto1230766 et fusionnée le 22 novembre à 13:23 UTC). Aucun déploiement réalisé par Codex.

## Comportement livré

Une demande créée dans **Mon compte → Ma journée & outils → Mes absences** est lue et traitée dans **Collaborateurs et RH → Demandes et disponibilités**. La décision revient dans l'historique personnel au prochain chargement. La source reste `leave_requests` ; aucune seconde table de demandes.

Les pointages de **Mon compte → Mes pointages** sont lus par **Collaborateurs et RH → Temps et pointeuse**, depuis `personal_workspace.people[id].timeEntries`. Le responsable habilité peut ajouter/modifier une annotation ; cette note est visible dans l'espace personnel. L'horodatage et le type d'origine sont immuables dans ce parcours. Les anciens prototypes locaux des deux sous-écrans de PlanningHrView sont remplacés ; la badgeuse dédiée reste un parcours distinct.

Les deux vues proposent recherche, filtre de statut pour les absences, bornes de dates, actualisation et export CSV de la sélection affichée. Les dates des pointages sont filtrées en Europe/Paris. Le CSV protège les cellules pouvant être interprétées comme formules. Les accès vers mes absences/pointages ouvrent directement le bon sous-onglet personnel.

## Contrat serveur et droits

- `GET /api/hr/workspace/:club_id` : demandes et pointages autorisés, identité de session et club retournés explicitement.
- `POST /api/hr/workspace/:club_id/requests/:id` : `status`, `expectedStatus`, `expectedRevision`, `note`.
- `POST /api/hr/workspace/:club_id/time-entries/:id` : `employeeId`, `note`, `expectedVersion`.

Bearer obligatoire, même en démo. Clubs strictement `carre-de-soie` ou `beynost`, association au club contrôlée côté serveur. Les champs JSON inconnus sont refusés. L'identité décisionnaire ne vient jamais du formulaire.

Les décisions utilisent ORG04-17. Les pointages des autres salariés nécessitent ORG04-35 ; une annotation nécessite aussi ORG04-36. Les périmètres sont évalués avec les équipes du salarié cible : appartenance à une équipe et responsabilité sur une équipe sont distinctes. Les propres données restent consultables, mais l'auto-validation d'absence et l'auto-annotation de pointage sont refusées : une autre personne habilitée doit intervenir.

Une révision SHA-256 du dossier d'absence et une version de l'annotation empêchent l'écrasement d'une décision concurrente. Le contrôle de révision couvre aussi un cycle de statut revenant à « en attente ». Motif obligatoire pour refus et remise en attente, longueur limitée à 1000 caractères. Le commentaire initial est conservé, les motifs RH sont ajoutés à la suite. L'audit conserve les décisions et changements de note.

Toute mutation travaille sur une copie, persiste avant publication mémoire et ne confirme le succès qu'après acquittement. Échec disque : données et audit inchangés, saisie du motif conservée. Les réponses d'un ancien club/compte sont ignorées après navigation ; doubles soumissions bloquées.

Correction connexe ciblée : la sélection d'un commercial disponible tient compte d'une absence **approuvée dans le club concerné**, et non d'une demande en attente. Le statut legacy VALIDE reste accepté. Le test existant utilisait un ancien identifiant de site `site_cds`, corrigé en `club-carre-soie`. Aucun moteur d'automatisation Lead supplémentaire modifié.

## Vérifications exécutées

Sur la branche locale du lot : **79 tests Rust réussis, 63 tests TypeScript réussis**, vérification TypeScript et compilation frontend/backend réussies. Un avertissement d'environnement macOS concernant le cache temporaire xcrun a été observé ; il ne s'agit pas d'une exécution sans avertissement.

`scripts/test_hr_manager_workflows.py` : **7 groupes de scénarios HTTP réussis** sur serveur éphémère en boucle locale, stockage temporaire et envois externes désactivés :

1. Session obligatoire et frontières de club.
2. Demande personnelle visible au responsable ; salarié limité à ses propres demandes.
3. Décision visible au salarié, auto-validation, autre club et ancienne version refusés.
4. Motif requis et ancienne révision refusée même après retour au statut initial.
5. Annotation visible au salarié sans modifier timestamp/type ; champ timestamp injecté refusé.
6. Panne de sauvegarde des deux mutations : mémoire, disque et audit conservés.
7. Redémarrage et nouvelles connexions : décisions et annotations conservées des deux côtés.

Tests Rust supplémentaires : équipe gérée contre simple appartenance, autorisations séparées de lecture/écriture des pointages, absence approuvée contre en attente et absence dans un autre club. Tests TypeScript supplémentaires : échec de sauvegarde, réponse tardive d'un ancien club, double soumission, export protégé et changement de jour Europe/Paris en hiver/été.

### Parcours navigateur réellement observé

Instance locale isolée sur 127.0.0.1:18095, données fictives et aucun fournisseur externe. Deux sessions séparées : Chloé Morel et Mario Carvalho. Demande fictive à Beynost du 2 au 3 août 2027 : création personnelle → présence dans les demandes du responsable → panne disque simulée avec statut en attente et motif conservé → nouvelle tentative validée → statut « Validée » retrouvé dans l'espace de Chloé après rechargement.

Pointage « Arrivée » créé par Chloé : affiché chez le responsable avec son heure d'origine ; annotation enregistrée et confirmation serveur observées dans l'interface responsable. La propagation de cette annotation côté salarié est validée par les scénarios HTTP. La dernière vérification visuelle côté salarié, le téléchargement CSV et les nouvelles captures mobile/tablette n'ont pas été achevés : le contrôle du navigateur s'est interrompu. Ne pas présenter ces trois contrôles comme des preuves visuelles acquises. Les captures de la PR #29 documentent l'espace personnel précédent, pas ce nouveau panneau responsable.

## Limites et suite à répartir sur #21

- Pas encore de calcul de durée CP/RTT ni de débit automatique des compteurs, ni de modification de paie.
- Pas de correction d'horodatage : annotation uniquement. Circuit de demande de correction/anomalie et validation des corrections à développer séparément.
- Pas de suppression automatique de vacations lors d'une absence approuvée ni de réaffectation rétroactive de tous les prospects. La correction du sélecteur concerne ses prochaines décisions d'affectation.
- Pas de file hors ligne, synchronisation différée ni clé d'idempotence des pointages dans ce lot.
- Pas de nouvelle notification sortante ; publication/affectation des tâches, documents, formations et contrôles reste un chantier distinct.
- Pas de certification complète des six profils, de toutes les délégations, du matériel badgeuse ou de Safari natif. La dernière passe responsive de ce panneau reste à terminer.
- Le choix global du club revient actuellement au club par défaut lors de certaines navigations complètes ; sélectionner explicitement le club de recette après rechargement. Ce comportement global reste à revoir séparément.

Réservation du lot : https://github.com/cfitness-os-dev/cfitess-os-aistudio/issues/21#issuecomment-7079775634. Les fichiers principaux sont `hr_manager.rs`, `hr_manager_tests.rs`, `hrWorkflow.ts`, `hrWorkflow.test.ts` et `HrWorkflowView.tsx`, plus les seuls points de raccordement RH/personnels. Demander à l'autre IA de confirmer son chantier avant d'éditer les mêmes fichiers. Fusion après revue ; aucune mise en ligne sans autorisation distincte de Daniel.
