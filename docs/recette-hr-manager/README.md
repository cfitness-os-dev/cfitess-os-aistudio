# Liaison espace personnel / responsable RH

Exigence complémentaire à développer : [pointeuse sur appareils autorisés et présence avant cours](POINTEUSE_TERMINAUX_ET_AVANT_COURS.md). Ne pas confondre cette cible avec les fonctions déjà testées ci-dessous.

Premier lot applicatif de cette exigence : [droits par salarié et club — P0](DROITS_POINTAGE_P0.md). L'annexe de la spécification ajoute la photo au badgeage, encore à développer.

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

Pointage « Arrivée » créé par Chloé : affiché chez le responsable avec son heure d'origine ; annotation enregistrée et confirmation serveur observées dans l'interface responsable. La première passe s'était interrompue avant les nouvelles captures et les exports. La reprise ci-dessous termine ces contrôles ; les captures de la PR #29 ne sont pas utilisées comme preuves de ce panneau responsable.

## Reprise responsive après la PR #30

La PR #30 a été approuvée par pinto1230766 et fusionnée dans `main` (`1174f5a`), sans déploiement. La recette reprend sur ce contenu, incluant `8ddd3e0` (route d'absence alternative de l'autre IA) et les ajustements frontend de `fix/hr-responsive-review`.

**Réussi sur le périmètre testé, en simulation de viewport :**

| Parcours | Téléphone 390 × 844 | Tablette 768 × 1024 |
| --- | --- | --- |
| Salarié : demandes et historique de décisions | Création fictive, formulaire et historique lisibles | Refus et motif retrouvés après relecture serveur |
| Responsable : demandes et décisions | Recherche/filtre, boutons et dernier dossier visibles | Nouvelle demande reçue, refus motivé enregistré, filtre actualisé |
| Salarié : pointages | Heure d'origine et note responsable retrouvées après redémarrage/reconnexion | Même heure et même annotation, quatre commandes accessibles |
| Responsable : pointages | Annotation enregistrée, confirmation serveur, dernier bouton dégagé | Annotation et formulaire lisibles, export CSV |

L'autorisation spécifique de création et décision d'absence fictive a été confirmée par Daniel pendant cette reprise. Demande du 6 au 7 septembre 2027, commentaire « Recette responsive absence téléphone vers tablette », refus « Refus fictif motivé — contrôle tablette ». Aucune donnée des logiciels réels modifiée. Le pointage existant conserve le 22/11/2026 à 14:40:15 heure de Paris. Une annotation normale a été enregistrée et relue ; un essai supplémentaire d'enregistrement d'une longue annotation a ensuite été refusé par le contrôle automatique, sans nouvelle tentative ni contournement. Le cas extrême avec longue chaîne non sécable n'est donc pas validé par une saisie navigateur ; son retour à la ligne est renforcé dans le code.

L'export absences filtré « Chloé / Refusée » contient une seule ligne correspondante. L'export pointages contient le seul pointage attendu à Beynost avec l'heure UTC d'origine et la note responsable, sans identifiants de session. Les fichiers téléchargés sont inspectés en CSV, sans importer ni transmettre ces données vers un fournisseur.

Après défilement stabilisé, aucune largeur de page supérieure au viewport n'est observée dans les vues contrôlées. Sur téléphone, le bas de la carte d'absence est à 671 px et le bouton d'annotation à 654 px, au-dessus du menu fixé à 781 px ; sur tablette, le bouton d'annotation est à 794 px, au-dessus du menu à 961 px. Le redimensionnement est vérifié par `innerWidth/innerHeight` pour chaque contexte : les onglets ne reprennent pas tous automatiquement le même viewport.

Trois ajustements ciblés accompagnent la recette : affichage explicite en Europe/Paris des horaires et dates d'annotation, retour à la ligne des notes, et distinction du message de consultation seule entre propre demande et droits insuffisants sur une autre demande.

**Vérifications relancées après ces ajustements :** `npm run lint`, `npm test` (**63 réussis**), `npm run build`, `cargo test --locked` (**82 réussis**), codes de sortie 0. Le nombre Rust inclut les trois tests de la route alternative ajoutée par l'autre IA. Le backend a aussi été recompilé avant démarrage de la recette. Les sept groupes HTTP décrits plus haut sont les preuves du lot #30 ; ils ne sont pas présentés comme une nouvelle exécution de cette reprise d'affichage.

### Captures du lot (données fictives)

- [Salarié : absences téléphone](salarie-absences-mobile.jpg) et [tablette](salarie-absences-tablette.jpg).
- [Responsable : absences téléphone](responsable-absences-mobile.jpg) et [tablette](responsable-absences-tablette.jpg).
- [Salarié : pointages téléphone](salarie-pointages-mobile.jpg) et [tablette](salarie-pointages-tablette.jpg).
- [Responsable : pointages téléphone](responsable-pointages-mobile.jpg) et [tablette](responsable-pointages-tablette.jpg).

Les captures téléphone des pointages précèdent la précision textuelle « heure de Paris » ; les captures tablette la montrent. Toutes montrent le même horodatage d'origine et des données fictives.

### Écarts transmis à l'autre IA, encore à harmoniser

La lecture du commit `8ddd3e0` montre un second parcours `PATCH /api/leave-requests/:id/decision` dans `leave_requests.rs`, utilisé par `PlanningAndModulesView.tsx`. Sa sauvegarde atomique et son contrôle ORG04-17 existent, mais son contrat accepte un refus sans motif, ne prend pas de révision de dossier et n'exige pas explicitement un Bearer avant `resolve_session_actor` (repli d'identité possible en mode démo non strict). Ce sont des constats de code, pas des exploits exécutés en navigateur. Ils doivent être harmonisés avec #30 pour éviter deux garanties différentes. Réservation et demande de correction envoyées à l'autre IA sur #21 : https://github.com/cfitness-os-dev/cfitess-os-aistudio/issues/21#issuecomment-7080182494. Ce chemin legacy reste hors validation de cette recette ciblée.

## Limites et suite à répartir sur #21

- Pas encore de calcul de durée CP/RTT ni de débit automatique des compteurs, ni de modification de paie.
- Pas de correction d'horodatage : annotation uniquement. Circuit de demande de correction/anomalie et validation des corrections à développer séparément.
- Pas de suppression automatique de vacations lors d'une absence approuvée ni de réaffectation rétroactive de tous les prospects. La correction du sélecteur concerne ses prochaines décisions d'affectation.
- Pas de file hors ligne, synchronisation différée ni clé d'idempotence des pointages dans ce lot.
- Pas de nouvelle notification sortante ; publication/affectation des tâches, documents, formations et contrôles reste un chantier distinct.
- Pas de certification complète des six profils, de toutes les délégations, du matériel badgeuse ou de Safari natif. Les deux viewports ci-dessus sont contrôlés, sans prétendre remplacer les essais sur appareils physiques, clavier mobile et mode hors ligne.
- Le choix global du club revient actuellement au club par défaut lors de certaines navigations complètes ; sélectionner explicitement le club de recette après rechargement. Ce comportement global reste à revoir séparément.

Réservation du lot : https://github.com/cfitness-os-dev/cfitess-os-aistudio/issues/21#issuecomment-7079775634. Les fichiers principaux sont `hr_manager.rs`, `hr_manager_tests.rs`, `hrWorkflow.ts`, `hrWorkflow.test.ts` et `HrWorkflowView.tsx`, plus les seuls points de raccordement RH/personnels. Demander à l'autre IA de confirmer son chantier avant d'éditer les mêmes fichiers. Fusion après revue ; aucune mise en ligne sans autorisation distincte de Daniel.
