# Acquisition mensuelle et clôture/report — recette locale du 24 novembre 2026

Branche `feat/rh-leave-accrual-carryover`, base `main` a226eac incluant la PR #59 fusionnée. Aucun déploiement et aucune modification de Skello, Heitz ou des données des clubs.

## Parcours livré

Paramètres RH → **Acquisition et report** permet de configurer une unité, un taux de mois complet, un début d'exercice et une règle d'arrondi cumulatif. Les règles sont désactivées au premier chargement : ni taux ni période ne sont inventés. L'activation demande une référence des règles vérifiées.

Le responsable choisit un salarié, un mois terminé et une opération. Le serveur calcule un aperçu sans écriture. La confirmation applique ensemble le compteur canonique, le journal d'acquisition/report, l'historique avant/après du dossier et l'audit. Toute écriture refusée laisse l'état inchangé. Il n'existe aucun planificateur d'acquisition dans ce lot.

### Acquisition

- Réservée à une autre personne habilitée aux réglages et compteurs, depuis le club principal unique du salarié. Le compteur et le journal appartiennent au salarié et restent communs aux clubs.
- Une acquisition au plus pour le même salarié et le même mois, même après reconnexion, redémarrage ou changement du club principal. La reprise initiale demande de confirmer que ce mois n'est pas déjà inclus dans le solde importé.
- Les décimales sont conservées en entiers au dix-millième de jour. L'écart entre le cumul arrondi et les droits déjà crédités donne le nouveau crédit. Par exemple, le test numérique de 12 × 2,0833 donne 25,00, sans arrondir chaque mois à 2,08.
- Un mois incomplet de contrat, une date de contrat manquante/invalide, un compte inactif, un mois non terminé ou une demande d'absence encore en attente sur le mois bloquent l'opération. Aucun prorata d'entrée/sortie n'est appliqué par supposition.
- Si une absence validée existe sur le mois, une confirmation de son effet sur le crédit complet est obligatoire. Si un prorata est nécessaire, le responsable ne doit pas confirmer ce crédit ; son calcul reste à spécifier.
- Un changement d'unité ou d'arrondi incompatible avec le compte ouvert est refusé lors de l'aperçu ; aucune conversion de soldes n'est implicite. Le taux peut évoluer pour les nouveaux mois, avec la règle utilisée conservée dans chaque opération.

### Clôture et report

- La clôture porte sur le dernier mois terminé de la période configurée. Un solde négatif ou des demandes de la période en attente la bloquent ; des congés futurs déjà décomptés en CP doivent être examinés avant la clôture.
- Le disponible courant peut être reporté en totalité, avec plafond, ou non reporté. Le reliquat déjà présent peut être conservé ou non conservé séparément. Par défaut, les règles proposées conservent les soldes ; aucun mécanisme d'expiration automatique n'est actif.
- Toute clôture exige de confirmer que les acquisitions, absences et corrections de la période ont été rapprochées, même si aucun jour ne sera perdu.
- Les jours non conservés sont détaillés dans l'aperçu et nécessitent une confirmation spécifique. La clôture remet les acquis/pris de N à zéro, met à jour N-1 et ouvre l'exercice suivant, en conservant RTT et annualisation.
- Les mouvements d'absence CP conservent leur numéro d'exercice. Après clôture, une reprise de l'ancien mouvement est refusée plutôt que d'être appliquée au compteur du nouvel exercice. Les deux anciennes routes de décision restent protégées. Une demande CP ne peut pas être créée ou approuvée sur une période clôturée.
- La réouverture ou correction automatique d'une absence d'un exercice clôturé n'est pas livrée. Une régularisation des soldes reste possible dans le dossier selon les droits, mais elle ne réécrit pas le statut de l'ancienne demande : ce parcours doit être spécifié avec les exemples Skello.

## Contrat et stockage

- `GET/PUT /api/hr/leave-accrual/:club_id` : règles et état autorisé du club. Édition ORG04-29 à la portée établissement ; consultation ORG04-28.
- `POST /api/hr/leave-accrual/:club_id/preview` : `{ employeeId, kind: "accrue" | "rollover", month: "AAAA-MM" }`.
- `POST /api/hr/leave-accrual/:club_id/apply` : demande identique, empreinte de l'aperçu, motif et confirmations de reprise, effet des absences, rapprochement de période (`periodReviewed`) et jours non conservés.
- Les droits, le club principal, les règles, le contrat, les soldes, le journal et les demandes sont relus sous le verrou de transaction. L'empreinte périmée est refusée ; elle n'est pas une autorisation remplaçant ces contrôles.
- `leaveAccrual` conserve politiques par club, comptes et journal par salarié. Les soldes restent dans `employees[].counter`. Les états anciens sans le nouveau stockage ont des valeurs par défaut sans activation. Les anciens mouvements d'absence ont l'exercice initial zéro par défaut.
- Préserver une sauvegarde cohérente avant une bascule : un ancien serveur ignorant les exercices ne doit pas reprendre les écritures sur les nouveaux journaux.

## Recette et preuves

Résultats : **150 tests Rust**, **136 tests TypeScript**, contrôle TypeScript et compilation de production réussis ; **71 groupes de recette HTTP** répartis sur huit scripts, tous passants. Contrôle visuel réel dans Chrome local : ordinateur 1440 × 1000, mobile 390 × 844, tablette 768 × 1024. Aucune émission externe ni modification en ligne. Les captures utilisent exclusivement des données fictives ; la période de novembre est un réglage de recette, pas une règle des clubs. Voir les [preuves](recette/rh-acquisition-2026-11-24/results.json). Un avertissement de cache du linker macOS apparaît lors de la compilation Rust dans cet environnement restreint, sans empêcher sa réussite. Le script `scripts/test_hr_leave_accrual.py` démarre un vrai serveur sur une boucle locale et un répertoire neuf ; il supprime explicitement les identifiants Heitz de son environnement et désactive les moteurs externes de test. La recette inclut droits, club principal, configuration opt-in, erreurs disque, aperçu sans écriture, état initial explicite, précision, concurrence, report plafonné, confirmation des jours non conservés, ancienne absence après clôture et redémarrage.

Le cas synthétique de changement de club principal est préparé uniquement sur le fichier de données de recette, serveur arrêté. Il vérifie le journal anti-doublon ; ce n'est pas une nouvelle recette de l'interface d'affectation des salariés.

La suite Rust a d'abord révélé une interférence des tests de sécurité P0 et P1 : P1 définissait une clé de signature de sauvegarde globale pendant que P0 restaurait un export non signé. P0 passait seul. Un verrou partagé sérialise uniquement ces deux tests ; aucun comportement de sécurité en production n'a été assoupli. La suite parallèle est rejouée après correction, et ce constat a été transmis dans #21.

## Vérifications Skello nécessaires

Voir [le relevé à compléter](skello-acquisition-report-a-verifier.md), avec les preuves existantes, les vues à ouvrir et six cas concrets. Ce lot prépare un moteur contrôlé ; il ne certifie pas une parité complète des acquisitions Skello ni une conformité juridique. Le paramétrage réel reste désactivé jusqu'à vérification des règles des clubs.

## Complément du 25 novembre 2026

Audit Skello réel en lecture seule : voir [relevé détaillé](skello-acquisition-report-releve-2026-11-25.md). Nouveau paramétrage `policy.absenceAcquisition` par identifiant de motif du club (booléen ou null ; défaut vide). Il est indépendant de l’annualisation. L’API refuse les identifiants étrangers ; les aperçus incluent le contexte des motifs et de leurs clubs dans leur empreinte. Une absence validée configurée Non bloque le crédit complet ; Oui conserve la revue du taux/plafond obligatoire. L’aperçu ne publie que `absenceCount` et `unverifiedAbsenceCount`, sans motif médical individuel.

Recette du complément : **151 tests Rust, 137 tests TypeScript et 72 groupes HTTP**, tous passants ; TypeScript et build de production réussis. Les premières tentatives des anciennes recettes des réglages/dossiers échouaient à la connexion des comptes fictifs Master et Sarah parce que leurs variables propres étaient absentes du lancement ; reprise avec leurs identifiants fictifs dédiés, cinq et six groupes respectivement passants. Aucun affaiblissement des contrôles d’authentification. Les résultats du 24 novembre ci-dessus restent les preuves de ce lot antérieur, pas des nombres cumulés.

Contrôle visuel du complément : enregistrement fictif Formation/CP = Oui et Congé sans solde = Non, puis actualisation serveur (valeurs conservées, activation toujours désactivée). Formats 1440×1000, 390×844 et 768×1024 sans débordement horizontal constaté. Captures et mesures dans [les preuves du 25 novembre](recette/skello-conges-2026-11-25/results.json). Ces contrôles du formulaire ne remplacent pas une recette visuelle complète des calculs de prorata.
