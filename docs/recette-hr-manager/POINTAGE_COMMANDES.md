# Commandes de pointage cohérentes avec le serveur

22 novembre 2026 — branche `fix/personal-clock-actions`, suite de #31. Aucun déploiement.

## Défaut et correction

Les quatre commandes de l'espace personnel restaient actives indépendamment du dernier pointage. Le serveur rejetait les transitions invalides, mais l'écran incitait l'utilisateur à les essayer. Le GET et les réponses POST personnels incluent désormais `punchAvailability: {allowedTypes, openClubId}`. Un seul helper Rust calcule cette disponibilité et contrôle la mutation ; aucun deuxième moteur de transition dans le navigateur.

| Situation | Commandes disponibles |
| --- | --- |
| Aucun pointage / dernier départ | Arrivée |
| Arrivée / reprise de pause, dans ce club | Début de pause, Départ |
| Pause en cours dans ce club | Fin de pause |
| Service ouvert dans l'autre club | Aucune ; message demandant de revenir au club concerné |

Les règles métier préexistantes sont conservées. En particulier, un départ pendant une pause reste refusé ; il faut enregistrer la fin de pause. La réponse expose seulement la situation du salarié connecté. Le formulaire explique la situation et désactive les autres commandes. Une réponse sans contrat de disponibilité ou avec commande/club inconnu est refusée par le client au lieu d'activer les boutons par défaut. Frontend et backend de ce lot doivent donc être livrés ensemble.

## Preuves exécutées

- `cargo test --locked` : **83 réussis**, code 0. Le nouveau test appelle les handlers GET/POST avec sessions fictives et couvre toutes les transitions, commandes interdites sans mutation disque, passage d'un club à l'autre, état relu du stockage et échec de persistance sans changement de situation. C'est un test de handlers, pas une nouvelle campagne HTTP.
- `npm test` : **64 réussis**, code 0. Le nouveau cas refuse contrat absent, commande inconnue et club inconnu.
- `npm run lint`, `npm run build`, `cargo build --locked` : réussis, codes 0.
- Navigateur sur instance locale `127.0.0.1:18097`, démo, sessions strictes, scheduler coupé, stockage fictif de recette existant. Chloé authentifiée, service déjà ouvert à Beynost : seules **Début de pause / Départ** sont actives ; **Arrivée / Fin de pause** désactivées. Message de service en cours, heure initiale et annotation inchangées. Vérifié en **390×844** et **768×1024**, sans débordement horizontal. Aucun nouveau pointage ni annotation ajouté par le navigateur dans cette reprise.

Captures : [téléphone](pointage-commandes-mobile.jpg), [tablette](pointage-commandes-tablette.jpg). Les autres situations et refus sont exécutés par les tests serveur ; ne pas les présenter comme autant de parcours navigateur.

## Coordination et limites

Réservation sur #21 : https://github.com/cfitness-os-dev/cfitess-os-aistudio/issues/21#issuecomment-7080404567. `personal_workspace.rs`, `personalWorkspace.ts`, `PersonalWorkspaceView.tsx` et tests uniquement. Les fichiers `leave_requests.rs` et `PlanningAndModulesView.tsx` restent au chantier de l'autre IA.

Au dernier contrôle de cette reprise, #31 était ouverte sans revue publiée et la route alternative de décision d'absence n'avait pas changé depuis `8ddd3e0`. Motif de refus, révision de dossier et Bearer explicite restent à harmoniser. Aucun correctif de ces fichiers n'est prétendu livré dans ce lot.

Le service ouvert dans un autre club est indiqué, sans navigation automatique ni modification des affectations. Les données affichées peuvent devenir périmées si un autre appareil pointe après le chargement : le serveur reste l'autorité et refuse une action devenue invalide ; actualiser l'espace permet de reprendre la situation. Pas de file hors ligne, correction d'heure, idempotence réseau, calcul de paie/compteurs ou certification de matériel ajouté.

## Estimation d'avancement

Ordre de grandeur communiqué : **environ 50–60 % d'une première RH utilisable en pilote**. Il s'agit d'un jugement qualitatif sur les parcours examinés, sans dénominateur exhaustif pondéré ; ce n'est ni une mesure de parité Skello, ni une estimation de tout C.Fitness OS, ni une déclaration de préparation à la production. Le nombre de tests n'est pas un pourcentage de couverture métier. Pour mesurer précisément la progression, les fonctions des audits doivent être liées à des critères de recette et classées démontrées, partielles, simulées ou restantes.

Le planning complet, durées/débits CP/RTT, circuit des corrections d'heures, effets sur vacations, publication responsable des tâches/documents/formations, signatures réelles, intégrations et migrations restent des postes significatifs. La recette de ces postes n'est pas acquise par les succès de ce lot.
