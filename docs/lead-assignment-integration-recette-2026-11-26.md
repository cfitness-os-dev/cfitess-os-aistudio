# Recontrôle d’intégration et éligibilité de l’affectation Lead

Branche `fix/lead-assignment-eligibility`, base `origin/main c416a6f` (26 novembre 2026). Aucun déploiement ni appel fournisseur réel.

## Intégration constatée

GitHub confirme les fusions #83, #84, #85, #87, #88, #89, #90 et #91. #91 a une review APPROVED de pinto1230766 sur `0318239`, puis fusion `c416a6f`. Le recontrôle de ce lot repart de cette combinaison, et non de l’ancienne chaîne de branches en attente.

La fusion dans le dépôt ne prouve pas la version servie au club ni la recette de tous les écrans.

## Défauts reproduits et correction

Deux tests ajoutés ont d’abord échoué sur ce main : le résolveur retournait `emp-karim` malgré tous les candidats désactivés, puis malgré une absence au statut historique `accepted`.

Le résolveur commun aux créations entrantes et à la réaffectation existante :
- vérifie désormais l’existence du salarié, son compte actif et son rattachement au club ;
- reconnaît les statuts approved, accepted, valide, validé après retrait des espaces et normalisation de casse ;
- compare de vraies dates au jour local du club (timezone du site), avec un cas de test où le 17 décembre à 23 h 30 UTC est déjà le 18 en France ;
- garde la file d’attente du club si le fuseau n’est pas connu, si une absence approuvée possède des dates inconnues/inversées, ou si aucun candidat n’est disponible ;
- conserve les règles existantes d’activation et de charge minimale, sans réaffecter un dossier fermé ni élargir la liste de commerciaux.

Aucun profil RH n’a été transformé arbitrairement en habilitation commerciale.

## Preuves exécutées

- 207 tests Rust réussis, 0 échec ; les trois nouveaux tests couvrent comptes inactifs/inexistants/hors club, statuts historiques, jour local et disponibilité inconnue.
- 176 tests TypeScript réussis, 0 échec.
- TypeScript strict et build Vite réussis ; build backend réussi. Avertissement du linker sur le cache xcrun interdit dans cet environnement, sans erreur de compilation.
- `scripts/test_lead_assignment_eligibility.py` : **10 groupes HTTP** sur vrai binaire et stockage neuf, cinq variantes dans chacun des deux clubs : tous inactifs, rattachements retirés, tous en absence accepted, un seul candidat disponible, affectation automatique désactivée. Chaque fois, prospect ET activité de suivi ont la bonne affectation persistée ; l’autre club reste inchangé.
- Non-régression de la combinaison : communication/calendrier **11 groupes**, notifications **10**, planning **7**, programmation RH **6** (vraie échéance et worker, deux redémarrages).
- Trois autres recettes HTTP réussies : `test_heitz_collection.py`, `test_heitz_recovery_readers.py`, `test_recovery_evidence.py`, avec fournisseurs factices locaux. Elles ne valident pas Heitz réel.

Total : huit scripts HTTP exécutés, dont cinq rapportent **44 groupes** structurés. Ne pas convertir les trois autres résultats PASS en un nombre de tests inventé.

Les serveurs de recette reçoivent un environnement neuf, sans secrets fournisseur hérités, et tous les workers externes sont désactivés. Le worker RH interne n’est actif que dans sa recette de programmation. Les secrets de connexion fictifs nécessaires aux anciennes recettes sont fournis seulement dans l’environnement du processus.

Aucune modification d’interface dans cette PR : le navigateur n’a pas été rejoué pour ce correctif serveur. Les contrôles visuels de #89–#91 restent documentés dans leurs rapports, sans nouvelle certification globale de main.

## Restes transmis à Antigravity

Ces points sont constatés par lecture ciblée et ne sont pas corrigés dans cette PR :

1. Le vivier des commerciaux contient toujours trois identifiants prédéfinis par club. Il faut un référentiel persistant de personnes explicitement habilitées à recevoir les leads, contrôlé au serveur, puis son écran de réglage. Ne pas déduire cette habilitation du profil RH.
2. La réaffectation ajoutée dans `leave_requests.rs` ne se retrouve pas dans `hr_manager::decide_request` ni dans la voie de règlement avec compteurs de `hr_leave_policy`. Centraliser l’événement après décision effective, dans la même écriture persistante.
3. La voie existante calcule un seul remplaçant avant sa boucle : plusieurs dossiers sont tous envoyés à cette même personne. Recalculer la charge à chaque affectation pour respecter la stratégie minimale ; réaffecter également les activités ouvertes suivant une règle explicite.
4. La condition extérieure de cette voie utilise encore le jour UTC. Le correctif de ce lot porte sur le résolveur commun, pas sur ce déclencheur extérieur. Utiliser aussi le fuseau du club pour le déclenchement.
5. Vérifier le déclenchement au début d’une absence validée à l’avance et l’absence de double réaffectation sur rejeu/reprise. Aucun raccord de ce déclenchement calendaire n’a été identifié dans les chemins lus.

Validation sur le périmètre testé uniquement. Documents RH, pièces jointes et autres écarts du registre général restent à développer ; les intégrations réelles restent désactivées.
