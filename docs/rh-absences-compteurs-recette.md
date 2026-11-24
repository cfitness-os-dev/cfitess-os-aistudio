# Absences, justificatifs et décomptes liés — 24 novembre 2026

Branche de livraison : `feat/rh-leave-policies-counters`. Copie locale isolée ; aucun déploiement, envoi externe, appel Skello, Heitz ou paie.

## Comportement livré

Les motifs effectivement actifs et ouverts aux salariés dans les paramètres RH du club remplacent la liste de quatre motifs inscrite dans le formulaire. Les nouvelles demandes référencent leur motif stable ; les anciennes sont rattachées par libellé connu, avec les alias CP et Formation CFA. Un motif inconnu historique n'est pas transformé arbitrairement en congé payé.

Une demande possède des bornes matin/après-midi. Les jours entiers restent le défaut des anciens dossiers. Les demandes en attente ou validées se chevauchant dans le même club sont refusées, y compris les chevauchements partiels et demandes identiques. Deux demi-journées adjacentes peuvent coexister. Une demande annulée ou refusée ne réserve plus sa période. Cela ne déduit aucune durée légale de congé des dates.

Un motif exigeant un justificatif peut être demandé avant que la pièce soit disponible ; la validation est bloquée tant qu'aucune attestation personnelle existante n'est liée. Le salarié peut changer ses références tant que la demande est en attente. Maximum dix pièces distinctes, vérification de leur appartenance au salarié. La consultation par le responsable requiert le droit aux documents du salarié. La révision de la demande inclut les références et le contenu courant des pièces : une modification invalide une décision préparée auparavant.

Dans Paramètres RH → Compteurs ou Motifs d'absence, un responsable habilité peut associer un motif à Aucun décompte, CP ou RTT. Aucun décompte lié est la valeur par défaut, sans effet rétroactif implicite. Pour CP, le responsable confirme séparément les jours de la période courante et le reliquat précédent. Pour RTT, il confirme les jours RTT. Quantités positives, deux décimales au maximum, soldes suffisants ; pas de taux d'acquisition inventé.

La validation liée enregistre dans la même écriture la décision, le compteur canonique du collaborateur, le mouvement d'historique et l'audit. Une reprise d'une absence validée compense les quantités d'origine sur les soldes actuels, en conservant les corrections intermédiaires et les anciens mouvements. Elle remet la demande en attente ou la refuse. Aucun double débit ou double remboursement n'est accepté. Si une correction manuelle rend une compensation incohérente, une régularisation préalable est exigée.

Les deux anciennes routes de décision appliquent les mêmes contrôles de justificatif et refusent de contourner un décompte configuré ou sa compensation. Le salarié ne valide pas sa propre absence. Les droits de décision, modification de compteurs, club et équipes sont vérifiés au serveur. Les quantités et historiques sont expurgés des réponses sans droit aux compteurs ; un simple indicateur signale qu'un mouvement doit être compensé.

Les formulaires conservent leurs valeurs après un refus serveur. Les actualisations après décision conservent les autres formulaires montés ; une nouvelle révision impose une vérification explicite avant de soumettre un ancien brouillon. Les filtres et changements de rubrique préviennent de l'abandon des saisies. Les exports des demandes comprennent les bornes de demi-journées et les quantités actives visibles selon les droits.

## Contrat technique

- `GET /api/hr/leave-rules/:club_id` : motifs effectifs, familles, capacité d'édition et révision de configuration.
- `PUT /api/hr/leave-rules/:club_id` : `expectedRevision`, `motiveId`, `family` (`none`, `cp`, `rtt`). Lecture ORG04-28 ; modification ORG04-29 à la portée établissement.
- `POST /api/me/workspace/:club_id`, action `request_leave` : `motiveId`, libellé pour compatibilité, dates ISO, `startPeriod`/`endPeriod` (`am`, `pm`), commentaire et `documentIds` facultatifs. Le libellé envoyé n'impose pas un autre motif que l'identifiant validé.
- Même route, action `attach_leave_documents` : `id`, `documentIds`, `expectedRevision`. Uniquement ses propres demandes en attente, avec le droit de demander dans le club.
- `POST /api/hr/leave-rules/:club_id/requests/:request_id/settle` : `action`, `expectedRequestRevision`, `expectedCounterRevision`, `expectedPolicyRevision`, `allocations: {cpN, cpNMinus1, rtt}`, `reason` ; `nextStatus` pour une reprise. Une reprise transmet des allocations nulles : le serveur reprend celles du mouvement actif.
- `leavePolicy` conserve seulement les règles, références de demandes et mouvements. Les demandes restent dans `leaveRequests`, les soldes dans `employees[].counter`, et l'historique dans `employeeCounterHistory`. Aucun second solde par club.
- Ancien état sans `leavePolicy` : structure vide par défaut. Anciennes métadonnées sans bornes : journée entière. Conserver une sauvegarde compatible avant fusion et avant toute bascule ; une ancienne version qui ignore ce nouveau journal ne doit pas servir à écrire ces dossiers.

## Recette exécutée

Base intégrée 9c0af75, code testé 48c8e35 : lint et build réussis, **143 tests Rust et 133 tests TypeScript réussis**, **67 groupes HTTP réussis dans sept recettes**. Les commandes ont toutes terminé avec le code zéro. Le build Rust émet un avertissement local de cache du linker sans échec de compilation. Les comptes de recette sont fictifs. Voir [les résultats détaillés](recette/rh-absences-2026-11-24/summary.json) et [les groupes HTTP](recette/rh-absences-2026-11-24/http-results.json).

`scripts/test_hr_leave_rules.py` démarre un véritable serveur Rust sur une adresse de boucle locale et un dossier neuf. Il couvre onze groupes : authentification et clubs ; catalogue et chevauchements ; demi-journées ; partage CP N/reliquat ; compensation après correction ; RTT et changement ultérieur de règle ; pièces manquantes et propriété ; changement de justificatif et révision ; ancienne route de décision ; échec disque ; persistance après redémarrage. Une validation simultanée produit exactement une réussite et un conflit. Les écritures refusées sont comparées au fichier avant tentative.

Les recettes existantes des paramètres RH, de l'organisation, des dossiers, du traitement responsable, de l'espace personnel et des retraits sont également rejouées. Les tests unitaires Rust couvrent les allocations et leur compensation, la précision, la migration et l'expurgation ; les tests TypeScript couvrent le contrat, le calcul de validation et l'actualisation de listes sans démontage inutile des brouillons.

Chrome, copie locale `127.0.0.1:18135`, données fictives : parcours salarié et responsable sur ordinateur, 1440 × 1000 ; demande de demi-journée, sélection et enregistrement d'attestation sur mobile, 390 × 844 ; consultation de pièce, validation, décompte, compensation, refus pour solde insuffisant et conservation des saisies sur tablette, 768 × 1024. Largeur du document contrôlée ; les derniers boutons restent au-dessus du menu fixe dans les vues observées. Il s'agit d'une simulation de tailles d'écran, pas d'un essai Safari/iOS ou de matériel réel.

## Limites à conserver visibles

- Les jours à décompter sont confirmés par un responsable : pas de calcul automatique de jours ouvrés/ouvrables, fériés, jours de repos, convention, acquisition mensuelle, report, expiration ou ancienneté.
- Pas de nouvelle zone d'import de fichiers dans ce lot : les justificatifs lient des attestations déjà présentes dans le dossier. Le stockage sécurisé de fichiers réels, la confidentialité médicale, la conservation et la suppression restent à recetter avant usage réel.
- Contrôle des chevauchements par club ; pas de consolidation automatique d'une absence entre deux contrats ou sociétés. Le modèle actuel utilise un seul compteur canonique par salarié. Une règle multi-contrats doit être spécifiée avant d'inventer des soldes séparés.
- Pas de recalcul automatique de planning, remplacement de salarié, paie, Skello ou Heitz. L'absence et son compteur sont liés ; le remplacement et les heures d'annualisation sont des chantiers distincts.
- Un historique inconnu ne reçoit pas automatiquement un motif moderne ou un débit. Les anciennes validations sans mouvement lié restent identifiées comme telles.
- Recette ciblée validée sur ses preuves ; elle ne certifie ni tout le logiciel, ni la parité complète Skello, ni la conformité réglementaire.

## Captures de recette

[Ordinateur](recette/rh-absences-2026-11-24/ordinateur.jpg) · [Mobile](recette/rh-absences-2026-11-24/mobile.jpg) · [Tablette](recette/rh-absences-2026-11-24/tablette.jpg)

Pendant une reconstruction locale, un onglet conservant les anciens noms de fichiers chargés à la demande est devenu blanc après suppression de ces anciens fichiers ; un rechargement sur le nouveau build a rétabli la vue. La relecture finale utilise les nouveaux fichiers. La conservation des anciens fichiers lors des futurs déploiements et une récupération explicite des erreurs de chargement restent à vérifier séparément ; ce lot ne prétend pas les corriger.
