# Règlements, contrats et CGV — qualification ciblée

## État vérifié

PR #80 ouverte sans revue publiée lors de la reprise, puis approuvée et fusionnée par pinto1230766 pendant ce lot (main `e490d31`). Suite isolée sur `feat/heitz-recovery-web-access`, basée sur cette fusion ; aucun déploiement ni écriture Heitz. Les lectures développées dans #80 restent des échéanciers et des abonnements actifs, pas des encaissements ou des originaux signés.

Sources relues directement : [HZ.WS](https://documenter.getpostman.com/view/24519/SVfMUAnB), rubriques SALE, PAYMENT_METHOD, users, ARTICLES/STORE, app/widgets et userDocument ; [journal officiel lié depuis HZ.WS](https://docs.google.com/document/d/1eoXTIbg4IF4H_2vSHkhBUwdzHEhOPXKELF4IKQNxqvg/edit). Cette passe est ciblée, pas une nouvelle certification de toute l’API.

| Sujet | Constat et conséquence |
| --- | --- |
| POST sales / salesV2 | Créent une vente avec moyens de paiement et montants. La réponse V2 contient des identifiants de paiements créés ; ce n’est pas un GET d’historique des règlements. Aucune création exécutée. |
| GET paymentMethod/:id | Référentiel du moyen de paiement, pas une écriture d’encaissement. Exemple de réponse absent ; ne pas en déduire qu’aucune donnée ne serait renvoyée. |
| ARTICLES/STORE | Catégories d’articles, dont avoir. La catégorie d’un article ne prouve pas l’émission effective d’un avoir client. |
| GET userDocument | Liste documentée, sans ciblage client, pagination, schéma détaillé ou accès au fichier montrés dans le bloc relu. Aucun scan global déclenché. |
| POST/DELETE userDocument | `idClient` apparaît dans les opérations de modification. Cela ne confirme pas automatiquement le même filtre dans le GET. Aucune modification exécutée. |
| Journal des versions | Court document accessible indiquant V12.8.8 et une référence Postman comportant une coquille. Le lien corrigé en `/view/24519/RW1bofQL` renvoie 404 lors du contrôle. Aucune spécification financière supplémentaire confirmée. |
| Session web autorisée | Lecture seule du financier et des documents. Historique présentant crédits/débits, rejets, frais, pagination, filtre de lignes annulées et soldes distincts courant/échéancier/final. Documents présentant date, fichier PDF, lien avec accès, taille et visibilité web. Deux documents contractuels présents ; aucune signature, version de CGV ou disponibilité du fichier par API déduite de leurs noms. |

Aucune identité, référence réelle de contrat, montant personnel, jeton ou capture nominative publiée dans ce dossier de code. Retour à l’écran Documents après consultation ; aucun bouton de création, édition, suppression, règlement ou signature utilisé.

## Rendre la consultation utile dès maintenant

Nouvelle route OS `GET /api/recovery/cases/:id/heitz-access-links?revision=...` : contrôle session, droit recouvrement du club, révision et identité synchronisée avant de construire trois accès vers les écrans financier, documents et abonnements. Aucun appel au fournisseur ni changement du stockage.

Configuration serveur explicite par club : `CFITNESS_HEITZ_CRM_ROOT_CDS` et `CFITNESS_HEITZ_CRM_ROOT_BEY`, format exact `https://<hôte>/app/heitz/<centre>/crm/`. Le centre doit correspondre à `HEITZ_CENTER_ID_CDS/BEY`. Aucune valeur par défaut ni déduction de l’URL API, aucun identifiant de connexion, secret, fragment ou paramètre accepté dans la racine. HTTP reconnu pour les installations existantes ; l’adresse et la version web de chaque centre restent à confirmer avec l’exploitant/Heitz avant activation. Les liens généraux de connexion existants ne sont pas remplacés.

Les boutons ouvrent un nouvel onglet sans transmettre de jeton OS. L’utilisateur se connecte à Heitz si nécessaire ; le respect du lien profond après connexion reste à tester sur la version réelle. Le bouton ne signifie jamais qu’un document a été importé ou vérifié. Les accès sont masqués pendant une saisie de preuve non enregistrée et lors d’un changement de dossier/contexte.

## Précisions ciblées encore nécessaires

| Référence | Information exacte à confirmer avec les sources installées ou Heitz | Preuve de réception attendue |
| --- | --- | --- |
| HZR01 | Route de lecture des mouvements financiers effectués, filtre adhérent et centre, pagination, période, identifiant stable et date de modification. | Réponses expurgées d’un règlement, de son rejet/annulation et d’un remboursement/avoir ; aucune écriture d’essai réelle. |
| HZR02 | Sens des montants signés, devise, date de valeur/comptabilisation, liens règlement-vente-facture et statut provisoire/définitif. | Rapprochement d’une journée avec les écrans Heitz, incluant lignes annulées et soldes courant/échéancier/final. |
| HZD01 | Filtre GET userDocument effectivement supporté pour un seul client, droits, pagination et bornes. | Exemple expurgé ciblé ; preuve qu’un autre adhérent n’est jamais renvoyé. |
| HZD02 | Identifiants et métadonnées de contrat, version de CGV jointe/applicable, dates, signature et son statut/preuve. | Contre-exemples document non signé, remplacé, révoqué ; ne pas classer par seul nom de fichier. |
| HZD03 | Route de lecture du fichier original, propriétaire, MIME/taille/empreinte, autorisation et durée d’URL éventuelle. | Lecture autorisée d’un original fictif, refus croisé client/club et erreur de fichier manquant, sans URL de média globale accessible librement. |

Ne pas redemander toute la documentation au client : les références existantes restent la base. Ce tableau porte uniquement sur les contrats de lecture non confirmés dans les sections relues. Ne pas inventer `/payments`, `/invoices` ou un filtre GET parce qu’une opération d’écriture emploie des champs semblables.

## Recette du lot

170 tests Rust et 160 tests TypeScript passants ; build frontend incluant typage et build Rust réussis. Recette HTTP locale : sessions et clubs, révision périmée, dossier manuel refusé, centre mal configuré sans lien, aucune requête fournisseur pour les accès, stockage inchangé ; recette des trois lecteurs #80 toujours passante. Nouveau panneau parcouru avec données fictives sur ordinateur, 390×844 et 768×1024 : trois liens du bon dossier, pas de débordement des liens, retrait pendant saisie puis restauration après abandon. Les liens externes fictifs n’ont pas été ouverts ; connexion réelle et retour vers le bon dossier restent non exécutés.

Validation partielle : consultation assistée développée/testée localement ; collecte API des encaissements, originaux, signatures et CGV non annoncée terminée.
