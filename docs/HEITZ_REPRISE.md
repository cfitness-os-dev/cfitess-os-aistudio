# Heitz — point de reprise partagé

Avant de reprendre une intégration Heitz, un audit de couverture ou une demande d’accès/documentation, consulter ce registre puis les sources indiquées. Mettre à jour la ligne concernée après chaque livraison ; la disponibilité documentaire, le développement et la validation réelle sont des états distincts.

## Décisions de Daniel à conserver

**Priorité actualisée le 25 novembre :** Daniel veut examiner d’abord la cohérence visible, l’arborescence et les parcours de Lead/RH/Mon planning. Il autorise une publication de démonstration, uniquement sur données fictives et sans aucun accès Heitz réel depuis cette version. Ne pas interpréter l’autorisation de publier comme une autorisation de connecter Heitz. Le lot groupé de démonstration inclut #82 et son complément d’isolation ; ne pas déployer #82 seule pour cette revue. Voir docs/demo-coherence-2026-11-25.md.

- Heitz reste la référence pour les adhérents, abonnements, contrats, finances et accès. Une écriture OS doit utiliser une opération fournisseur documentée, attendre son résultat puis relire Heitz. Sinon, proposer un accès à l’interface web appropriée ; aucune réussite locale présentée comme une opération Heitz.
- Objectif : couvrir toutes les possibilités de l’API réellement accessible, avec une matrice par fonction. Une fonction non commencée reste dans le registre ; elle ne devient pas « non exposée » parce que le code actuel ne la traite pas.
- Priorité recouvrement : suivi quotidien, rapprochement des règlements/rejets/échéances/avoirs, contrats et CGV effectivement applicables, dossier pour le contentieux et fiche compréhensible au téléphone ou au club.
- Paiement signalé et contestation suspendent la poursuite des relances jusqu’à contrôle. Un solde, un ticket, un abonnement actif ou un fichier PDF présent ne prouvent pas respectivement un encaissement ou une signature.
- Session réelle Heitz autorisée en consultation uniquement. Développement sur branche et données fictives ; aucune modification Heitz, aucun envoi ou déploiement autorisés par ce lot. Les sollicitations périodiques restent arrêtées.

## Sources disponibles — vérification du 25 novembre 2026

| Source | État constaté et usage |
| --- | --- |
| [Documentation HZ.WS publique](https://documenter.getpostman.com/view/24519/SVfMUAnB) | Accessible dans Chrome. Déplier les rubriques de navigation pour charger leurs détails. Documents, abonnements et échéanciers relus directement pendant ce lot. |
| [Index officiel Heitz](https://heitzsystem.com/documentation-webservice/) | Référence d’entrée déjà identifiée. |
| [Catalogue initial](heitz-public-api-catalogue-2026-11-25.json) | Extraction antérieure partielle, surtout planning/sportif. Ses 144 paires candidates ne constituent pas l’inventaire total de la documentation. |
| [Complément des lectures documentaires](heitz-lectures-documentees-2026-11-25.json) | Routes et champs confirmés dans les sections publiques, sans recopier les exemples de personnes. Complément ciblé, non inventaire global. |
| [Audit historique](heitz-api-couverture-2026-11-25.md) | Constat daté de code ancien ; lire avec les corrections et mises à jour ci-dessous. |
| [Recouvrement et fiche d’échange](recouvrement-fiche-echange-2026-11-25.md) | PR #74 approuvée et fusionnée. Références humaines, contexte IA serveur et suspension. |
| [Recette de collecte](heitz-collecte-fiabilisation-2026-11-25.md) | Résultats et limites du lot présent. |

**Correction du diagnostic documentaire :** une ancienne extraction incomplète ne signifie pas que la documentation n’existe pas. Reprendre les sections publiques et les archives déjà disponibles avant de solliciter à nouveau Daniel ou le fournisseur. Une réponse d’exemple absente ne signifie pas que l’endpoint ne renvoie aucune donnée.

## Couverture et prochaine reprise

| Fonction | État / prochaine action |
| --- | --- |
| Lecteur adhérents/soldes/passages/FMI/collaborateurs/salles/tickets | Code existant. Pagination/préservation corrigées PR #70/#72 ; montants et tickets durcis dans le présent lot. Recette sur doubles locaux, pas qualification complète chez Heitz. |
| Recouvrement factuel | PR #74 fusionnée ; ajouts chat/contacts PR #75/#77 reçus dans la base ec0a7ca. Les références de pièces ne contiennent pas les originaux. |
| Échéancier prévisionnel | GET `/api/userScheduledPayments/provisional`, paramètre `idClient`, exemple JSON disponible. **Lecteur à la demande développé et testé sur double local ; réponse réelle à qualifier.** Le prévisionnel ne prouve aucun encaissement. |
| Échéancier d’affichage | GET `/api/userScheduledPayments/display`, `idClient` signalé administrateur uniquement. Exemple contenant des montants déjà formatés en texte ; ne pas les traiter comme des nombres bruts. **Lecteur à la demande développé et testé sur double local ; réponse et droits fournisseur réels à qualifier.** |
| Abonnements | GET `/api/userSubscriptions?idClient=...`, GET `/api/userSubscriptions/:id`, GET `/api/userSubscriptions/:id/config?detail=1`. La liste est décrite comme active : ne pas l’appeler historique contractuel complet. **Liste active développée avec projection limitée identifiant/libellé, testée sur double ; schéma fournisseur réel à qualifier. Détail et config non raccordés ; detail=1 décrit les horaires d’accès, pas les CGV.** |
| Documents clients | GET `/api/userDocument` documenté. Le bloc GET public ne montre pas le ciblage ; la session web a désormais confirmé une URL chargée avec idClient et details=true. **Ciblage observé sur le web ; méthode/schéma effectifs, droits et compatibilité du service Cloud à qualifier avant collecte de pièces.** |
| Contrat signé / CGV applicables / fichier original | Rapprocher les fonctions d’abonnement et document avec les métadonnées de version, signature, client et accès au fichier. L’écran web propose des PDF et une action de signature ; aucune signature ni disponibilité API des originaux ne sont déduites de cela. |
| Règlements effectués / rejets / factures / avoirs / annulations | Écrans web observés en lecture. Reprendre les autres sections publiques de l’API et confirmer les schémas avant développement ; aucun rapprochement complet connecté à ce stade. |
| Autres familles API | Continuer le catalogue public au-delà des sections déjà analysées. Conserver pour chaque fonction : documentée → développée → testée sur double → testée chez Heitz → validée métier. Aucun pourcentage global avant catalogue borné. |

Demander au fournisseur uniquement les précisions restantes après cette reprise : droits/version effectifs par centre, schémas non décrits, pagination/filtrage, signification des montants et accès aux originaux/signatures. Vérifier la relation entre le web observé WS 2.1.4-beta.187 et la version du service configuré. Des clés ou mots de passe réels n’ont pas été utilisés pour les essais de ce lot.

## Coordination

Suite du 25 novembre : [qualification règlements/documents et accès directs](heitz-reglements-documents-qualification-2026-11-25.md). PR #80 sans relecture lors de la reprise, puis approuvée/fusionnée pendant le lot ; complément basé sur main e490d31. Trois accès web par dossier synchronisé, configurés explicitement par club, développés sans appel fournisseur. Les précisions HZR01–02 / HZD01–03 remplacent une demande générale répétitive de documentation. Aucune collecte d’originaux ou d’encaissements certifiée par ce lot.

Ticket [#68](https://github.com/cfitness-os-dev/cfitess-os-aistudio/issues/68) pour la couverture Heitz ; [#21](https://github.com/cfitness-os-dev/cfitess-os-aistudio/issues/21) pour les livraisons. Réserver les fichiers avant modifications simultanées. Publier branche/commit, périmètre testé, limites et opérations non exécutées. Un commentaire, une fusion et un déploiement sont trois événements à vérifier séparément.

## Livraison lecteurs par dossier — 25 novembre 2026

PR #79 approuvée puis fusionnée par pinto1230766, base main a958862. Suite sur branche feat/heitz-recovery-readers : GET interne /api/recovery/cases/:case_id/heitz-readings?revision=..., trois GET fournisseur documentés, authentification existante réutilisée. Aucun enregistrement métier, téléchargement de fichier, relance ou déploiement.

La lecture exige une session authentifiée, le droit recouvrement du club et un dossier issu de la synchronisation Heitz. Un dossier manuel ne permet pas de choisir un identifiant fournisseur. Droits, identité et révision sont recontrôlés après les réponses. Le club est celui du rapprochement OS synchronisé ; cela ne remplace pas une qualification des droits fournisseur et de la fraîcheur de rattachement.

Sources indépendantes : échec, données mal formées ou liste supérieure à 2000 lignes donnent indisponible, jamais zéro ou liste vide implicite. Historique complet toujours non certifié. Les montants texte restent texte ; aucune devise ni signature déduite. Aucun endpoint global de documents appelé faute de ciblage confirmé.

Validation : 169 tests Rust, 159 tests TypeScript, typage et builds ; recette HTTP sur double local avec absence de modification du fichier persistant, refus hors club avant appel fournisseur, identité manuelle refusée, réponse périmée rejetée, trois GET observés et absence de téléchargement documentaire. Interface parcourue avec données fictives sur ordinateur, 390×844 et 768×1024 ; panneau sans débordement horizontal aux deux petites tailles. Aucun appel au vrai Heitz pendant ces essais.

Prochaine qualification : règlements effectivement encaissés et leurs annulations/rejets, schéma réel des abonnements, ciblage des documents et accès aux originaux, version et signature des contrats/CGV. Continuer les sources disponibles ; ne pas assimiler échéancier, abonnement ou PDF à une preuve de règlement ou de consentement.

## Préparation du pilote — sources observées et durcissement

Voir [le relevé de routes web expurgé](heitz-web-observed-reads-2026-11-25.json). Les URL financières/documents sont désormais connues plus précisément ; ne plus annoncer que tout ciblage documentaire est introuvable. Les paramètres observés ne remplacent pas les schémas de réponse et droits du service configuré dans l’OS. Aucun appel de ces nouvelles routes depuis le connecteur Cloud à ce stade.

Suite locale basée sur PR #81 : transport JSON borné unifié HTTP/HTTPS, prise en charge des réponses HTTP découpées, refus des redirections et écritures fournisseur hors authentification existante, secrets transmis par entrée standard et erreurs expurgées. Nouvelle vérification de session après réponse source et protection de l’affichage lors d’un changement de dossier/club. Cette préparation ne collecte pas encore les règlements encaissés ni les originaux des contrats/CGV.

[Préparation et recette avant essai en club](heitz-pilote-preparation-2026-11-25.md) : 173 Rust, 160 TypeScript et trois recettes HTTP locales réussis ; reprise visuelle bloquée par l’indisponibilité du navigateur. Liste précise des éléments encore obtenables avant déplacement et des vérifications réelles restantes. Aucun calendrier reçu sur #21/#68 lors du contrôle initial de ce lot.
