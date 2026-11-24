# Organisation RH, clubs, équipes, postes et droits
24 novembre 2026 — branche `feat/rh-organisation-settings`, base `3250674` de la PR #53 (elle-même empilée sur #48). Travail local isolé ; pas de merge main, déploiement ou action sur Skello/Heitz/Brevo.

## Parcours livré
Administration et droits garde son rangement connu :
- Droits & Rôles : consultation des six profils, personnalisation des contrôles éditables et du périmètre proposé. Les lignes verrouillées/non proposées restent protégées. Aucun droit fournisseur non observé inventé.
- Organisation & Clubs : Société, Club actif, Équipes, Postes.
- Équipes : créer, renommer par identifiant stable, supprimer uniquement sans appartenance ni encadrement restant. Le contrôle inclut les salariés inactifs, afin de ne pas casser les références.
- Postes : nom, couleur, pause par défaut et activation. Désactivation sans suppression des références historiques. Les doublons historiques de libellés peuvent être corrigés sans interdire une simple modification de pause/couleur ; aucun nouveau doublon de nom n’est créé.
- Club : identité du club existant (nom, adresse, ville, SIRET). Les autres règles du club ne sont pas remplacées.
- Société : tous les champs déjà modélisés (nom, raison sociale, SIREN, TVA, secteur, email de contact, indemnité repas et mention de facturation), avec validation avant écriture.

Le formulaire affiche clairement le club et le mode fictif. Les changements sont relus depuis le serveur ; les brouillons sont conservés après erreur. Actualiser conserve une saisie en cours et exige sa comparaison avant une nouvelle confirmation. Une garde protège les changements de rubrique/club. L’onglet et le sous-onglet restent sélectionnés lors du changement de club.
Le hub ignore les anciennes réponses arrivées après un changement de contexte. Il respecte le club sélectionné globalement et ne présente plus un ancien tableau de bord comme celui du nouveau club. Des codes et booléens techniques ont été remplacés par des libellés métier.

## Contrat et données
`GET/POST /api/hr/organisation/:site_id` utilise une session Bearer réelle. La réponse est liée à l’acteur et au club et n’expose ni salariés, ni rémunérations, ni sessions. Les seules collections retournées sont les référentiels autorisés ; l’organisation peut être absente pour un profil non habilité.

Une écriture envoie `{expectedRevision, command:{action,...}}`. Commandes : `save_team`, `remove_team`, `save_position`, `save_club`, `save_organization`, `save_profile`. Le contrat refuse les champs inconnus. Une révision de configuration devenue ancienne reçoit 409. Le serveur recontrôle les permissions et références sous le même verrou, persiste une copie puis remplace la mémoire. L’échec disque ne confirme aucune mutation ni audit. Les événements ne journalisent que les objets modifiés.

Les références sont les collections canoniques `sites`, `teams`, `positions`, `profiles` et `organization` déjà présentes. Aucun magasin parallèle ni nouvelle table de salariés. Aucun nouveau champ de schéma persistant requis. La réponse est aussi validée côté client avant affichage.

## Droits et compatibilité
- Gestion des équipes/postes : capacité ORG04-27 et portée établissement sur le club concerné.
- Identité d’un club : droit d’organisation à portée établissement sur ce club, ou propriétaire/super administrateur de ce club.
- Organisation et définitions des profils : objets partagés, donc autorisation requise dans chaque club. Un profil sélectionné pour un salarié reste propre à chaque rattachement de club ; sa définition est actuellement commune.
- Les anciennes routes organisation/profils et remplacement global des délégations appliquent également ce contrôle commun : un accès d’un seul club ne permet pas de réécrire les réglages de tous les clubs.
- Les affectations ne peuvent changer un club hors périmètre ni promouvoir un salarié dans un autre club via un statut administrateur acquis ailleurs. Les listes équipes/postes dupliquées sont refusées. Le dernier propriétaire actif d’un club ne peut pas être retiré.
- La même validation protège les cases verrouillées et périmètres non proposés, y compris via les anciennes routes.
- Les badgeuses restent sous la règle propriétaire/superadmin du club apportée par #53 ; ORG04-27 ou une délégation d’organisation n’accorde pas leur administration.

## Vérifications exécutées sur cette branche
- 132 tests Rust réussis ; 119 tests TypeScript réussis ; compilation Rust, contrôle TypeScript et build Vite réussis.
- `scripts/test_hr_organisation.py` : 18 groupes HTTP réels. Sessions, clubs, données expurgées, CRUD, doublons, références d’appartenance/encadrement, intégration des affectations, identité, organisation commune, profils, refus anciens/nouveaux endpoints, dernière propriété active, état restauré incohérent, erreurs disque, concurrence et redémarrage réel.
- `scripts/test_timeclock_settings_owner.py` : 5 groupes HTTP de non-régression.
- Chrome sur `127.0.0.1:18133`, après accord explicite du client : création et renommage d’équipe ; erreur de doublon avec saisie conservée ; création de poste, pause 20 minutes et désactivation ; nom fictif du club ; retrait du droit d’ajout de shift au Planificateur standard puis relecture avec case décochée ; contrôles verrouillés désactivés.
- Navigation ordinateur, mobile 390×844 et tablette 768×1024 ; largeur document/défilement 383/383 et 761/761. Changement de club et conservation de la rubrique contrôlés.
- Captures : `evidence/rh-organisation-droits-mobile.jpg` et `evidence/rh-organisation-equipes-tablette.jpg`.
- La commande Playwright de case à cocher s’est bloquée ; la connexion navigateur a été rétablie et le parcours a été exécuté/relu avec l’API d’accessibilité. Aucun échec applicatif déduit de ce blocage d’outil.
- Aucun compte externe, envoi, paiement, pointage matériel ou donnée de club réel utilisé.

## Intégration à proposer à Antigravity
1. Relire d’abord le dernier delta bd3e83b de #48 ; main est restée 2fef986 au contrôle initial.
2. Intégrer #53 puis recibler ce complément vers main. Ne pas le fusionner prématurément dans la branche parente pendant sa revue.
3. Le dossier/contrat/compteurs de #50 reste réservé à votre chantier. Ce lot prend seulement le problème de contexte de club du hub et les référentiels/permissions annoncés sur #21/#50.
4. Les lots email #51 et retrait d’absence #52 sont des branches sœurs : rejouer une recette de combinaison avant tout déploiement.
5. Réexaminer les clients anciens qui éditaient des données globales avec seulement un droit local : le refus est désormais explicite. Les délégations restent dans leur onglet ; leur remplacement global demande une autorisation globale.

## Limites à conserver dans le suivi
Ce lot ne termine pas C.Fitness OS ni toute la parité Skello. Les 571 entrées documentaires des réglages restent à recetter individuellement ; les interfaces simplement cataloguées ne sont pas déclarées fonctionnelles.
- Pas de troisième club ni de profil arbitraire ajouté : les types de l’OS et intégrations sont encore fermés sur les deux clubs et les six profils. Une extension exige une refonte coordonnée.
- Le menu global utilise encore ses libellés commerciaux de clubs ; le nom RH modifié est relu dans le module et le sélecteur RH. Unifier ce référentiel dans tous les modules du shell reste à contrôler.
- Pas de permissions personnalisées distinctes par club à l’intérieur d’une même définition de profil : choix de profil par club actuellement pris en charge ; une future surcouche de droits locaux demande un contrat explicite.
- Besoins d’effectif, Smart Planner, motifs d’absence, règles de compteurs, alertes, modèles/dossiers documentaires et autres paramètres du registre demandent encore leurs lots opérationnels.
- La configuration Société a été testée via HTTP ; sa sauvegarde n’a pas été exécutée dans le navigateur. La suppression d’équipe est testée en API sur fixture jetable, pas en UI. Les appareils physiques ne sont pas certifiés.
- Les contraintes SIREN/SIRET sont des validations de format, pas une vérification légale de l’entreprise.

## Recette cumulée Lead/RH du même jour
Une branche de recette séparée `test/rh-lead-settings-compatibility` réunit le code de ce lot, #53, #51 (email) et #52 (retrait d’absence), tous fondés sur la dernière tête de #48. Les deux cherry-picks métier ont été appliqués sans conflit ; aucun merge de main ni déploiement n’a été effectué.
Résultats réellement exécutés sur cette combinaison : **132 tests Rust, 120 tests TypeScript, builds réussis et 83 groupes HTTP réussis** répartis entre organisation (18), réglages badgeuse (5), scénarios Lead (22), programmation email/SMS (11), espace personnel (12), parcours responsable (7) et retrait d’absence (8). Zéro envoi externe.
La synthèse machine est dans `evidence/rh-organisation-combinaison-tests.json`. Cette branche est une aide de recette, pas une autorisation de fusion directe ou de déploiement. La recette cumulée est automatisée ; les captures navigateur concernent le lot organisation seul, sans prétendre avoir rejoué visuellement chaque module de la combinaison.
Le stockage actuel est un fichier JSON avec verrou du processus serveur. La concurrence testée concerne un seul serveur ; une exploitation multi-instance exigerait une autre stratégie de stockage/verrouillage.

## Actualisation après livraison Antigravity
Pendant la recette, les PR #48, #51, #52 et #53 ont été approuvées/intégrées par le développeur. La branche de ce lot a été synchronisée avec main e58bc30 ; la PR #55 cible désormais main. Son arbre de code correspond exactement à la combinaison 132 Rust /120 TypeScript /83 groupes HTTP déjà testée.

La nouvelle PR #54 d’Antigravity (2d5a28e) a ensuite été ajoutée **uniquement** à la branche de recette test/rh-lead-settings-compatibility. Deux conflits ont été résolus : garder les deux listes de tests dans package.json et conserver son helper de club autorisé ainsi que les protections de requêtes périmées/gardes de navigation dans le hub. Ses écrans dossier ne sont pas inclus dans le delta de #55.

Sur cette seconde combinaison : **134 Rust /124 TypeScript /89 groupes HTTP réussis**, dont les six groupes dossier d’Antigravity exécutés indépendamment avec les variables de fixture propres à chaque profil. Cela valide cette recette automatisée ; ce n’est pas une revue exhaustive de toute la PR #54.
Une proposition complémentaire, sur la seule branche de recette, charge le dossier à la demande dans les deux lecteurs : le bundle principal RH passe de 507,06 à 477,23 kB, avec un fichier dossier séparé de 30,76 kB. Le build réussit. Les écrans de la combinaison #54 n’ont pas été rejoués visuellement par Codex dans ce lot.

Utiliser la branche de recette comme référence de résolution et de vérification, puis intégrer les PR après revue. Ne pas la déployer ou la fusionner directement sans contrôle de ses commits.
