# Recouvrement Heitz — préparation avant essai en club

Ce lot prépare le périmètre Heitz/recouvrement ; il ne constitue pas la réception globale de C.Fitness OS, Lead ou RH. La récupération des règlements réellement encaissés et des originaux contrats/CGV n’est pas annoncée terminée.

## Livraisons et calendrier

Au début de cette reprise : PR #81 ouverte, sans revue publiée. Aucune réponse au calendrier du pilote trouvée sur #21/#68. Branche `feat/heitz-pilot-preflight` basée sur `4bb19a5` ; la base est la branche #81 tant qu’elle n’est pas fusionnée. Ne pas déduire un déploiement d’une fusion.

## Ce qui a été préparé et essayé localement

- Transport HTTP/HTTPS partagé, avec réponse JSON limitée à 8 Mio et délai borné. Le parseur HTTP artisanal refusait les réponses découpées en blocs ; la lecture est désormais assurée par curl, déjà installé dans l’image Docker. Aucune désactivation des certificats TLS ni suivi de redirection.
- Clés et jetons transmis au processus par entrée standard, sans arguments de commande contenant ces valeurs. Configuration curl utilisateur désactivée ; erreurs génériques sans corps fournisseur ni URL de dossier. Les opérations permises sont GET et l’authentification développeur existante ; création de vente, modification de document et autres écritures refusées dans ce transport de lecture.
- Session relue après la réponse fournisseur : une déconnexion pendant une lecture lente fait refuser sa réponse. Droits, identité et révision restent recontrôlés comme précédemment. Les résultats du lecteur ne sont affichés que pour le compte, dossier, club et révision courants.
- Lecture des sources : prévisionnel et échéancier affiché distincts des encaissements, liste active distincte des originaux. Source indisponible distincte d’une liste vide ; données incohérentes refusées, aucun zéro inventé.
- Parcours de preuves : références humaines, signature/date/version, révocation, refus de double saisie/révision périmée, paiement signalé et contestation suspendant les relances ; contexte IA périmé rejeté et persistance après redémarrage.
- Accès web #81 : dossier synchronisé seulement, racine explicite pour le bon centre, aucun lien si configuration absente ou incorrecte, aucun appel fournisseur pour fabriquer les liens.

Validation exécutée : **173 tests Rust / 160 tests TypeScript**, build frontend incluant typage, build Rust ; trois recettes HTTP locales ci-dessous réussies. Les tests réseau ajoutés emploient exclusivement des serveurs de boucle locale et des secrets fictifs. Le contrôle réel TLS auprès du fournisseur et la compatibilité du service Cloud restent non exécutés. Le dernier parcours visuel de ce lot n’a pas pu être rejoué : session navigateur interrompue puis navigateur indisponible. Les contrôles mobile/tablette de #81 restent des preuves de ce lot précédent, pas une nouvelle recette de la présente branche. L’instance de test a été arrêtée.

## Lectures nouvellement repérées

Le [relevé expurgé](heitz-web-observed-reads-2026-11-25.json) provient de l’inventaire des ressources déjà chargées par la session web autorisée :

| Besoin | URL et paramètres observés | Reste à qualifier |
| --- | --- | --- |
| Écritures financières | `/api/userFinancial/financialRecords/browse`, `idClient`, `hideCancelled`, `_offset`, `_limit`, `_paginate` | Méthode, enveloppe, total, identifiant stable, dates/devise/signes, rapprochement règlement-rejet-annulation. Ne pas cacher les annulations dans le futur historique de recouvrement. |
| Factures émises | `/api/financialOperations/invoicesClientDisplay/issued`, `idClient` | Méthode, schéma, pagination, factures et avoirs, relation aux règlements et accès au fichier. |
| Documents ciblés | `/api/userDocument`, `idClient`, `details=true` | Le GET existe dans la documentation publique ; vérifier schéma, portée client/club, originaux et droits du compte API. Le ciblage est désormais observé sur le web, pas encore certifié sur le service Cloud. |
| Abonnements détaillés | `/api/userSubscriptions/detailedV3`, `clients`, `details`, `viewAs`, états, pagination | Sens des filtres, statut de contrat, signature et version des CGV ; aucun sens déduit des codes numériques. |
| Soldes détaillés | `/api/users/balance/detailed`, `idClient`, `reload` | Effet de `reload=true` non qualifié : ne pas le rejouer automatiquement comme une simple consultation. |

Les nouvelles URL n’ont pas été rejouées par le connecteur OS. Aucun jeton, mot de passe, en-tête privé, corps de réponse nominatif ou fichier réel téléchargé. La version web observée est `WS:2.1.4-BETA.187 M:1.4.187` ; cela ne prouve pas la même version ni les mêmes droits sur le service configuré dans `HEITZ_WS_URL`.

## Rejouer la recette sans service réel

Sur une copie de travail avec dépendances installées :

```text
npm run lint
npm test
npm run build
cargo test --locked
cargo build --locked
```

Pour chaque recette Python, renseigner `CFITNESS_TEST_BINARY` avec le chemin du binaire fraîchement construit, `TMPDIR` avec un dossier temporaire autorisé, et les variables `CFITNESS_TEST_ADMIN_SECRET`, `CFITNESS_TEST_COMMERCIAL_SECRET`, `CFITNESS_TEST_MANAGER_SECRET` avec les secrets des profils fictifs du seed. Ne jamais utiliser un secret d’un club. Les scripts créent leur propre stockage jetable et désactivent les workers externes ; le fournisseur et le modèle IA sont remplacés par des serveurs locaux.

```text
python3 scripts/test_heitz_collection.py
python3 scripts/test_heitz_recovery_readers.py
python3 scripts/test_recovery_evidence.py
```

Le premier couvre refus atomique des soldes malformés, réouverture de dette, invalidation des anciennes preuves et redémarrage. Le deuxième couvre les lecteurs, les accès web, les changements de dossier et la révocation de session pendant la lecture. Le troisième couvre les contrôles documentaires, la suspension du suivi et le contexte IA. Le succès ne vaut pas qualification des nouvelles routes financières repérées.

## Ce qui peut être fourni avant le déplacement en club

Le développeur ou Heitz peut fournir les éléments ci-dessous sans attendre un essai matériel :

1. Réponses **expurgées** et contrat de lecture des URL repérées : méthode, paramètres, enveloppe/pagination, champs et droits/version. Cas de règlement, rejet, annulation/remboursement/avoir ; contrat signé/non signé/remplacé et CGV versionnées. Aucun jeton, en-tête Authorization ou HAR brut dans GitHub.
2. Confirmation des adresses de lecture et centres pour le service réellement branché à l’OS. Ne pas copier les clés de production dans une branche de recette. Utiliser un environnement fournisseur fictif ou un compte/API de consultation dédié pour la qualification autorisée.
3. Version de préproduction identifiée par commit, configuration des racines CRM par club et liste de fonctions actives/simulées/non raccordées. Les origines et le retour au bon dossier après connexion Heitz doivent être confirmés ; aucune URL profonde inventée.
4. Responsable et créneau du pilote, accès aux profils mono-club et multi-clubs, critères de réussite et procédure de retour. Les logiciels actuels restent opérationnels.

## Essai en club restant, sans modification Heitz

| Parcours à exécuter sur des dossiers existants | Résultat attendu |
| --- | --- |
| Responsable mono-club puis profil deux clubs ; refus d’un compte non habilité | Bonne identité, bon club ; aucune donnée du club interdit, même par API OS. |
| Règlement connu puis rejet/annulation lié, sur une période déjà existante | Montants, sens, dates, devise, statut et références rapprochés avec Heitz ; pas de total limité à la page, de doublon ou de zéro de substitution. |
| Dette régularisée puis nouvelle dette existante | Dernier état confirmé, historique préservé et anciennes preuves financières non réactivées automatiquement. Aucun mouvement créé pour fabriquer l’exemple. |
| Contrat et CGV existants, avec une pièce non signée ou remplacée si disponible | Bon adhérent, bonne version, signature explicitement vérifiée ; nom de PDF ou abonnement actif insuffisants. Aucun clic de signature. |
| Accès financier / documents / abonnements depuis le dossier OS | Bon adhérent et centre, y compris après connexion ; droits Heitz conservés. |
| Téléphone, tablette et poste du collaborateur | Saisie, consultation, erreurs et derniers boutons accessibles ; confidentialité du compte précédent respectée. |

Une panne fournisseur, une erreur d’écriture ou un rejeu sont à éprouver dans la copie isolée, jamais en interrompant les services du club. Aucun paiement, relance réelle, transfert contentieux, signature ou changement d’accès autorisé par cette recette de consultation.

**Décision actuelle : validation partielle.** Les composants existants ont des preuves locales ; le pilote réel et les schémas des nouvelles lectures restent ouverts. Il reste du travail de développement après qualification de ces réponses : ce document ne dit pas que tout est terminé avant le test en club.
