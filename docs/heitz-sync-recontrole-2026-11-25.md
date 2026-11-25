# Heitz — recontrôle de #70 et protections complémentaires

Branche `fix/heitz-sync-recontrole`, initialement depuis main `add1113` (#70), puis intégrant main `65b2cfe` (#71 personnel RH). Aucun déploiement, aucune modification de Heitz réel. Le prototype local antérieur `fix/heitz-sync-preservation` est conservé pour comparaison et n’est pas proposé à la fusion : cette branche complète la livraison de Francis.

## Résultat de la coordination

- #67 a été approuvée et fusionnée par pinto1230766.
- Le nouveau parcours personnel RH a été proposé dans #71 puis approuvé et fusionné par pinto1230766 : notes internes exclues, 147 tests TS, 152 Rust et 85 groupes HTTP dans sa branche de recette.
- #68 a déclenché sa PR #70 : pagination, provenance, recouvrement et droits par club ont progressé. Les fichiers ont été recontrôlés sur le code réellement fusionné ; ses tests ne couvraient pas tous les défauts ci-dessous.

## Corrections de ce complément

1. Une page répétée ne vaut plus fin de collecte réussie. Les ID manquants, non positifs ou répétés, une page trop grande et la limite de pagination atteinte produisent une erreur. L’API qui ignore le décalage ne peut plus être annoncée entièrement collectée. La limite existante de 100 pages reste une borne de travail explicite ; la dépasser demande une autre stratégie de collecte, pas une troncature silencieuse.
2. Une réponse utilisateurs vide ne retire plus les fiches du club. Les adhérents sont rapprochés par ID stable ; les absents et les imports locaux restent en place tant qu’aucun événement de suppression vérifié n’existe. Le connecteur ne purge plus les anciennes données de démonstration par préfixe : une purge demande une opération de migration dédiée.
3. Un solde financier absent/invalide ne devient plus zéro. La lecture utilisateurs échoue avant publication, sans régulariser artificiellement une dette. Il faut encore qualifier avec Heitz les formats et les droits de retour de ce champ ; une lecture d’identité sans droit financier devra avoir son propre contrat.
4. Les ID clients positifs inférieurs à 10001 ne sont plus éliminés arbitrairement. Le tri des comptes techniques reste distinct et mérite sa validation fournisseur.
5. Le club n’est plus déduit d’un préfixe d’ID : centre explicite reconnu ou dossier non rattaché. Si un rattachement déjà connu change ou devient ambigu, l’ancienne fiche est conservée et le résumé demande un rapprochement manuel ; le compte ne passe pas silencieusement dans un autre club.
6. Les synchronisations simultanées sont sérialisées pour éviter que deux instantanés successifs se remplacent dans un ordre incohérent. Les enrichissements locaux sont repris depuis l’état courant lors du rapprochement.
7. Les dossiers de recouvrement soldés restent historisés, même sans relance ni changement préalable de statut. Le statut `regularise` et le montant zéro reflètent uniquement un solde fournisseur effectivement reçu ; notes, documents et relances sont conservés.
8. Le lecteur ne réécrit plus les SIRET des clubs avec des constantes. Les paramètres d’organisation restent gérés dans leur rubrique.

Les pannes de services auxiliaires continuent à produire `partialSync` et `warnings`, conformément au contrat de #70 ; elles n’ont pas été transformées arbitrairement en panne complète. Une panne/incohérence de la liste utilisateurs reste bloquante. Aucun appel fournisseur d’écriture ajouté.

## Preuves de recette

Le nouveau test `heitz_live::sync_tests::pagination_failures_empty_results_disk_failure_and_restart_preserve_local_work` utilise exclusivement un serveur HTTP fictif en boucle locale, avec identifiants de test et répertoire neuf :

- 241 utilisateurs sur trois pages (0, 120, 240), petits ID inclus, plus une fiche locale conservée ;
- modification du montant fournisseur avec conservation de quatre relances, statut, note, mois facturés, justificatifs et lien MyWellness ;
- panne de page 2, mauvaise forme JSON, répétition de page, ID absent/zéro, page trop grande, solde absent : mémoire, disque et audit inchangés ;
- limite de 100 pages atteinte : erreur explicite ;
- panne FMI : réponse partielle et avertissement ;
- liste utilisateurs vide : adhérents et suivi du recouvrement conservés ;
- panne disque : aucune modification publiée ;
- rechargement de l’état persistant et régularisation ultérieure à zéro sans perte du suivi.

Un second test vérifie qu’un ID ressemblant à un centre ne vaut pas rattachement à ce centre. Le test fournisseur fictif livré par Francis continue de passer avec ses scénarios multi-clubs, FMI et données de provenance. Aucun secret réel ni dossier réel utilisé.

Contrôles exécutés après intégration de main `65b2cfe` : **154 tests Rust, 147 tests TypeScript**, build Vite/contrôle TypeScript et compilation Rust réussis. Recettes HTTP ciblées CRM Heitz, reports RH, dossiers salariés et espace personnel exécutées sur des serveurs locaux neufs. Le nouveau double Heitz est un test d’intégration Rust utilisant un vrai serveur HTTP local ; ce n’est pas un essai contre le fournisseur réel. Aucun écran Heitz réel ni appareil physique testé dans ce lot backend. Les captures du parcours RH livré sont celles de #71.

## Limites et suite de l’intégration

Ces tests ne valident pas l’intégralité de l’API Heitz ni la compatibilité avec la version des clubs. Il reste à obtenir la collection complète de cette version et la matrice des droits/centres, puis qualifier les familles documentées (adhérents, abonnements, documents, échéanciers, ventes, planning, sportif, accès et paramètres).

L’audit et le catalogue public partiel sont dans `docs/heitz-api-couverture-2026-11-25.md` et `docs/heitz-public-api-catalogue-2026-11-25.json` (apportés par #71). Les 147 titres extraits ne sont pas le dénominateur de toute l’API et ne permettent pas de pourcentage. Les contrats de vente/portillon locaux ne prouvent pas un branchement fournisseur.

Restent notamment à préciser : dates/statuts exacts d’abonnement, champs réellement absents selon les droits, rapprochement des changements de club, suppressions/archivages explicites, règles comptables et période du CA (la somme de tickets positifs n’est pas un calcul comptable complet), absence de mesures FMI ou autres réponses mal formées, transport HTTP/HTTPS et quotas réels. Le rapprochement par préfixe de certains tickets et les règles métier doivent aussi être qualifiés. Les données non rafraîchies sont conservées ; une stratégie de fraîcheur et de détection des dossiers retirés reste à ajouter.

Un accès administrateur Heitz web, si fourni, sera consulté uniquement en lecture. Il permettra de comparer les résultats métier, pas d’inventer les contrats API manquants. Aucune action physique, aucun paiement, aucun envoi réel ni modification fournisseur autorisés par cette recette.
