# Reports exceptionnels de congés — lot du 25 novembre 2026

Branche : `feat/rh-exceptional-carryover-tracking`, depuis `590e31d` de la PR #65.
La PR #65 a été approuvée puis fusionnée par pinto1230766 le 25 novembre à 09 h 46 (Paris), commit main ff172dd. Ce main, incluant aussi sa PR #66 Heitz, a été intégré uniquement dans notre branche séparée (80e952a). La PR #67 cible désormais main ; aucune fusion vers main ni aucun déploiement effectués par Codex.

## Fonctionnement livré

Chemin : Collaborateurs et RH → Paramètres RH → Reports exceptionnels.

Le responsable habilité peut ouvrir un suivi pour des jours **déjà présents dans le reliquat N-1** : période d’origine, quantité initiale vérifiée, échéance vérifiée, référence et justification. La somme des suivis ouverts ne peut pas créer de droits supplémentaires. Une période qui recoupe un suivi existant est refusée, y compris après clôture : pas de réouverture ou correction de la période d’origine dans ce lot.

Il peut ensuite :

- réévaluer les jours encore concernés entre zéro et le montant initial, avec justification ;
- prolonger l’échéance vers une date ultérieure, après vérification ;
- consigner une information **déjà effectivement remise** au salarié (date, support, référence) ;
- clôturer le suivi lorsque ses jours encore concernés ont été rapprochés à zéro ;
- consulter l’historique avant/après, y compris les anciennes informations remises.

L’échéance dépassée produit un avertissement à l’écran. Elle ne supprime aucun congé. L’enregistrement d’une remise n’envoie aucun message, ne génère pas de document signé et ne prouve pas sa réception. Une réévaluation ou une prolongation retire la mention courante d’information remise afin d’inviter à la renouveler ; les anciennes mentions restent dans l’historique.

Les dates et quantités sont affichées en français. Le panneau utilise les couleurs et composants existants, sans identifiant technique dans les libellés métier.

## Compteurs, droits et sauvegarde

Le compteur salarié reste la source unique : ce suivi n’ajoute, ne débite et n’expire aucun jour. Le nombre de jours suivis s’affiche séparément du reliquat avec la mention « ces quantités ne s’additionnent pas ».

Après un débit, une compensation ou une correction du N-1, l’écran demande un rapprochement manuel. Les prolongations et informations remises sont bloquées tant que ce rapprochement manque. Plusieurs suivis devenus supérieurs au nouveau solde peuvent être réduits progressivement, un dossier à la fois ; cette exception permet uniquement une diminution stricte, jamais une création ou une prolongation au-delà du reliquat.

La clôture annuelle qui ferait perdre un ancien N-1 est bloquée si des jours exceptionnels sont encore suivis, même en présence de la confirmation ordinaire de perte. Une clôture préservant le N-1 reste possible. Les suivis participent à l’empreinte de l’aperçu : un changement impose un nouvel aperçu.

Consultation : session Bearer réelle, club autorisé et droit ORG04-28. Chaque salarié affiché passe aussi les contrôles de périmètre/compteurs ORG04-16 et ORG04-08 ou ORG04-12. Pas de gestion de son propre dossier. Les changements se font uniquement depuis le club principal, pour conserver un suivi partagé entre clubs sans doublon de droits. Le club secondaire peut consulter les salariés auxquels il est habilité ; le suivi porte sur leur compteur global partagé. Le panneau reste dans les paramètres RH réservés aux profils habilités ; aucun accès général collaborateur ajouté.

Chaque action vérifie une version du dossier et du solde. Deux validations simultanées ne peuvent pas écraser silencieusement leur travail. La copie d’état et l’audit sont persistés ensemble avant confirmation ; un échec disque laisse les anciennes données en mémoire et sur disque. Le nouveau stockage est facultatif au chargement des anciens états (`serde(default)`).

## Contrat serveur pour l’IA de développement

`GET /api/hr/carryovers/:club_id` fournit le compte connecté, le club, la date du serveur et les salariés autorisés avec `revision`, `priorBalance`, `protectedDays`, `cases` et `history`. Une case expose son relevé, `balanceChanged` et `deadlinePassed`. Les identifiants restent techniques côté données, sans apparaître comme vocabulaire métier.

`POST` sur le même chemin attend `employeeId`, `expectedRevision`, `reviewConfirmed: true`, `reason` et une commande discriminée :

| action | Champs de la commande |
| --- | --- |
| create | sourceStart, sourceEnd, days, availableUntil, reference |
| reconcile | id, remainingDays |
| extend | id, availableUntil |
| notice | id, notifiedOn, medium (remise/bulletin/courrier/email), evidence |
| close | id |

La réponse est le nouveau relevé confirmé, jamais un succès local supposé. Les champs inconnus sont refusés côté Rust. Conserver le contrôle de version, la confirmation humaine, la sauvegarde avant publication mémoire et les contrôles de périmètre lors d’une intégration avec une autre interface ou un autre stockage. Ne pas brancher le moteur email/WhatsApp sur la commande `notice` : elle consigne une action passée.

## Recette exécutée

Environnement : serveur Rust réel en boucle locale uniquement, répertoires neufs de données fictives ; interface compilée sur `127.0.0.1:18139`. Identifiants Heitz vidés, workers désactivés, aucun appel fournisseur ni envoi réel déclenché.

| Niveau | Résultat constaté |
| --- | --- |
| TypeScript | 144 tests réussis sur le main combiné, dont 5 nouveaux contrats de suivi |
| Rust | 152 tests réussis |
| Compilation | contrôle TypeScript et build Vite réussis ; compilation Rust réussie |
| Serveur HTTP | 84 groupes réussis sur les 10 recettes ci-dessous, dont 6 nouveaux groupes de suivi |
| Navigateur ordinateur | création d’un suivi de 1,5 j sur un reliquat fictif de 2 j ; prolongation ; information remise ; rechargement serveur |
| Navigateur téléphone 390 × 844 | rapprochement à 0,5 j, compteur inchangé ; pas de débordement horizontal du document constaté |
| Navigateur tablette 768 × 1024 | rapprochement à zéro puis clôture ; historique conservé ; pas de débordement horizontal du document constaté |

Recettes : `test_hr_leave_carry.py` (6), `test_hr_leave_accrual.py` (6), `test_hr_leave_rules.py` (11), `test_hr_site_rules.py` (5), `test_hr_employee_dossier.py` (6), `test_personal_leave_withdrawal.py` (8), `test_hr_manager_workflows.py` (7), `test_hr_organisation.py` (18), `test_hr_pilotage.py` (5), `test_personal_workspace.py` (12).

La première relance du dossier salarié utilisait par défaut le secret fictif du commercial pour Sarah ; elle a été rejouée avec les secrets dédiés Sarah/Master/Maxime/lecture seule. Aucun changement d’authentification pour contourner ce refus. Les avertissements du cache de l’éditeur de liens macOS n’ont pas empêché compilation ni tests.

La recette nouvelle vérifie notamment les refus de droits, le club principal, l’auto-traitement interdit, les bornes et dates, les périodes doublonnées, le total supérieur au N-1, les versions périmées, la double soumission, l’échec disque, le rapprochement après correction du compteur, l’information à renouveler, la protection de clôture et la tenue après redémarrage réel.

Les 152 tests Rust, 144 TypeScript et build ont été rejoués après intégration du nouveau main ff172dd. Les parcours navigateur et captures portent sur notre lot RH avant cette intégration Heitz, qui ne modifie aucun fichier RH.

Captures : `recette/reports-exceptionnels-2026-11-25/`. Les tailles sont des simulations de navigateur ; pas une validation sur tous les téléphones ou tablettes physiques.

## Ce qui reste ouvert

Ce lot est un **suivi manuel vérifié**, pas un moteur juridique de report. Il ne calcule ni taux maladie, ni délai exceptionnel, ni point de départ légal d’une échéance. Il ne choisit pas automatiquement quel millésime de congés consommer et ne répartit pas les débits entre plusieurs dossiers exceptionnels. Il ne rouvre pas les anciens exercices, ne corrige pas leurs absences et ne réconcilie pas silencieusement un historique importé. L’historique complet reste stocké ; le panneau expose les 100 dernières actions du salarié.

Le calcul automatique des proratas d’entrée/sortie et ses arrondis, les taux/plafonds particuliers, les échéances exceptionnelles applicables et la réouverture historique restent à confirmer avec Skello/paie. Les crédits proratisés déjà vérifiés sont couverts par #65 ; il ne faut pas les présenter comme une formule automatique entièrement validée.

L’écart ancien de 0,36 j (détail 29,90 contre synthèse 30,26) reste inexpliqué. L’utilisateur ne connaît aucun cas d’annulation après clôture : il n’a pas été observé dans Skello. Les tests locaux de protection du nouvel exercice ne démontrent pas la parité de ce comportement fournisseur.

Un salarié test Skello n’a pas été créé : le formulaire a été consulté puis refermé sans saisie. Un nouveau salarié ne permettrait pas de retrouver l’écart historique d’un autre dossier ni une ancienne annulation après clôture. Les essais ont utilisé exclusivement les salariés fictifs de C.Fitness OS. Une démonstration fournisseur avec historique fictif et règles explicites reste le moyen de débloquer ces deux derniers constats sans modifier les dossiers réels.

Validation partielle : validé sur les parcours locaux exécutés ; parité complète Skello, règles réelles et mise en production non validées.
