# Droits de pointage par collaborateur et club — P0

22 novembre 2026, branche `feat/clocking-policies`. Lot applicatif faisant suite à la spécification #33 / PR #34, désormais approuvée et fusionnée. Aucun changement des comptes réels, aucune fusion sur main ni mise en ligne par Codex.

## Comportement livré

Deux autorisations indépendantes par salarié et par club : **pointer depuis Mon compte** et **utiliser un appareil enregistré**. Une absence de configuration signifie **non autorisé**, même en démo et pour un administrateur. Le droit personnel est vérifié au serveur à chaque pointage ; l'autorisation terminal ne permet pas de contourner ce contrôle. L'historique personnel reste consultable.

Un panneau dépliant apparaît dans **Collaborateurs et RH → Temps et pointeuse → Autorisations de pointage par collaborateur**. Il affiche uniquement les salariés du périmètre autorisé, propose recherche par nom/matricule, deux cases indépendantes, motif obligatoire et sauvegarde confirmée par le serveur. Le matricule distingue les homonymes. Les propres droits sont consultables, mais doivent être attribués par une autre personne habilitée. Le rangement final dans les paramètres complets RH reste à harmoniser avec les futurs réglages de terminaux.

Le formulaire garde le brouillon en cas d'erreur. Sa révision est celle reçue lors de la création du brouillon : une actualisation ne lui donne pas silencieusement une nouvelle révision pour écraser les modifications d'un autre responsable. Une commande permet d'abandonner ce brouillon et de repartir de la dernière configuration chargée. Les réponses d'un ancien compte/club sont ignorées après démontage, et les contrôles sont désactivés pendant une sauvegarde.

La fonction centrale historique `CfosContext.punchWithPin` renvoie maintenant un refus explicite, sans créer de pointage ni de file hors ligne. Elle ne doit plus produire de faux succès depuis le kiosque, l'ancienne grille employé ou le prototype du planning. Aucun de ces appels locaux ne constitue une authentification de terminal. Les autres modules du contexte sont conservés.

**Le droit terminal n'active pas encore un appareil.** `terminalReady:false` est explicite dans le contrat P0 et le panneau. Le registre/appairage/authentification (P1) et la présence avant cours/checklist (P2) restent des lots distincts à intégrer et recetter.

Daniel a ajouté pendant ce lot la **photo au moment du badgeage**. Son fonctionnement cible est détaillé dans l'annexe de [la spécification appareils/cours](POINTEUSE_TERMINAUX_ET_AVANT_COURS.md) et transmis à l'autre IA sur #33. Politique photo configurable, capture liée à l'événement, accès privé, incidents et conservation restent à développer dans les lots suivants ; aucune caméra réelle n'a été activée et aucune photo n'est prétendue implémentée dans P0.

## Contrat et sécurité

- `GET /api/hr/clock-policies/:club_id` : `{actorId,clubId,terminalReady:false,rows}` ; chaque ligne comporte identité, matricule, politique et `canEdit`.
- `PUT /api/hr/clock-policies/:club_id/:employee_id` : `{personalAllowed,terminalAllowed,expectedRevision,reason}`. Champs inconnus refusés ; motif de 1 à 1000 caractères ; révision nulle uniquement pour la première attribution.
- `GET/POST /api/me/workspace/:club_id` expose `clockingPolicy` ; `punchAvailability.allowedTypes` est vide sans droit personnel. Un POST direct est refusé en 403 même si le client réactive le bouton.

Bearer obligatoire sur les routes de réglages. ORG04-37 évalué sur la cible et ses équipes dans le club demandé, sans assimiler appartenance à une équipe et responsabilité d'équipe. Affectation active au club exigée pour responsable et cible. Pas de permission dérivée d'ORG04-35/36, ni d'exemption automatique par rôle, ni d'auto-attribution. Club inconnu refusé. Le serveur détermine l'auteur, jamais le formulaire.

Stockage additif : `personal_workspace.clockPolicies[employeeId][clubId]`, club canonique `carre-de-soie` / `beynost`, valeur `ClockPolicy {personalAllowed,terminalAllowed,revision,updatedAt,updatedBy}`. Le helper `clock_policy::policy(db, employee_id, club_id)` retourne les deux droits à false par défaut. Il est le contrat proposé à P1.

Chaque modification produit `CLOCKING_POLICY_UPDATE`, avec motif et avant/après. Écriture sur copie et persistance avant publication mémoire ; échec disque = aucune nouvelle autorisation ni modification d'audit. Révision périmée = 409. La révocation est effective à la prochaine requête, y compris lorsqu'un service était déjà ouvert ; l'historique n'est jamais effacé. Un service à régulariser nécessite ensuite le circuit responsable, pas une heure inventée.

## Vérifications exécutées

Sur le code intégrant main `a350bef` : **89 tests Rust réussis / 66 tests TypeScript réussis**, lint/build frontend et compilation backend réussis. Avertissement d'environnement macOS du cache xcrun possible ; ne pas présenter cela comme un environnement sans avertissements. Les trois tests supplémentaires de la route d'absence legacy proviennent du lot de l'autre IA, conservé dans cette branche.

Tests de handlers nouveaux : refus par défaut et absence d'exemption admin, attribution par une autre personne, différences entre clubs pour un salarié multi-clubs, révocation/historique, relecture du stockage, révision périmée, faux auteur, droits insuffisants, motif absent, mauvais club, erreur disque conservant mémoire/disque/audit, équipes gérées contre simple appartenance. Tests TypeScript nouveaux : contrat refusé si mauvais compte/club ou terminal déclaré prêt artificiellement, et contrat de refus explicite conservé.

**25 groupes de scénarios HTTP exécutés**, tous sur serveurs éphémères en boucle locale, données fictives, scheduler désactivé et aucun envoi externe :

- `scripts/test_clock_policies.py` : 6 groupes — refus personnel/admin par défaut et lecture conservée ; session/auto-attribution/clubs ; attribution, pointage et révision ; panne de révocation ; révocation immédiate avec historique et droit terminal indépendant ; redémarrage/nouvelle session.
- `scripts/test_personal_workspace.py` : 12 groupes de non-régression personnels.
- `scripts/test_hr_manager_workflows.py` : 7 groupes de non-régression responsables.

Ces deux anciens scripts attribuent maintenant explicitement le droit personnel via le PUT de politique dans leur stockage jetable, avant de tester les pointages. Les fixtures Rust des anciens tests font la même distinction, uniquement sous `cfg(test)`. Aucune attribution automatique de démo n'a été ajoutée au code exécuté en usage normal.

### Navigateur

Instance locale isolée `127.0.0.1:18098`, stockage fictif neuf, sessions strictes. Mario connecté : panneau responsable à 768×1024, changement Carré de Soie → Beynost, recherche Chloé et matricule, deux droits non cochés, enregistrement désactivé sans motif, propres contrôles non modifiables. Chloé connectée ensuite : à 390×844, les quatre commandes de pointage sont désactivées et le message explique le refus personnel ; espace et historique consultables. Aucun droit n'a été modifié via le navigateur pendant cette passe ; les écritures, erreurs, révocations et redémarrages sont prouvés par les tests API. Sauvegarde du formulaire en navigateur et appareils physiques restent à recetter séparément.

Captures : [responsable tablette](droits-pointage-responsable-tablette.jpg), [salarié téléphone](droits-pointage-personnel-mobile.jpg).

## Migration et suite de livraison

Le stockage existant se charge sans champ de politique grâce à la valeur par défaut. Cela **n'accorde aucun droit** : avant une mise en service, il faudra attribuer explicitement les autorisations voulues et prévoir les cas de services déjà ouverts. Aucune migration automatique de vieux pointages navigateur vers les horaires serveur fiables n'est faite. Les anciennes sauvegardes locales peuvent contenir des données de démonstration non acquittées ; ne pas les certifier comme réelles.

Frontend et backend doivent être livrés ensemble, le client refuse les contrats de droit incomplets. Les kiosques existants ne redeviendront opérationnels qu'après raccordement P1 ; ne pas déployer ce lot seul en remplacement d'une pointeuse de production déjà utilisée. P1 doit vérifier `terminal_allowed` et l'identité individuelle à chaque événement, utiliser les mêmes `timeEntries` et rendre l'état de disponibilité réellement vérifiable. P2 doit séparer présence cours et temps travaillé.

Branches de l'autre IA observées, non fusionnées ni certifiées par ce lot : `feat/clock-terminals-p1` (`b8361f7`) et `feat/course-attendance-p2` (`6468b3f`). Points transmis sur #33 : validation indépendante de l'identité du coach, idempotence après vérification du périmètre, checklist serveur versionnée et fenêtre de cours, données sensibles du registre terminal à expurger. Les routes d'absence legacy du commit `a350bef` renforcent Bearer/motif mais gardent les révisions optionnelles ; omission encore à refuser. Ce sont des constats de code distincts des succès de recette P0.

Coordination : réservation https://github.com/cfitness-os-dev/cfitess-os-aistudio/issues/33#issuecomment-7080688329 ; contrat P1 et retours https://github.com/cfitness-os-dev/cfitess-os-aistudio/issues/33#issuecomment-7081122055 et https://github.com/cfitness-os-dev/cfitess-os-aistudio/issues/33#issuecomment-7081128037. Relecture requise et déploiement soumis à autorisation distincte de Daniel.
