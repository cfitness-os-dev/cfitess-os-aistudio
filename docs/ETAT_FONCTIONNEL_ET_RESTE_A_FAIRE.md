# État fonctionnel et suite du développement

État du 26 novembre 2026, recontrôle du main c416a6f après intégration des PR #83–#91 ; éligibilité des affectations Lead. Ce document remplace une estimation globale en pourcentage par des critères vérifiables. Il ne déclare pas l’exhaustivité des logiciels de référence.

## Règles à conserver

- Heitz demeure la référence des adhérents, règlements, contrats, CGV, ventes et accès. Une opération réelle dans l’OS n’est activée que si l’API officielle la permet et si son résultat est relu ; sinon utiliser son interface web validée. Aucun accès Heitz réel depuis la démonstration actuelle.
- Heitz conserve ses emails actuels via Brevo. Les futurs envois OS doivent avoir une responsabilité et une clé dédiées, avec prévention des doublons. Aucun envoi réel pendant cette recette.
- Identité, club, équipes et droits sont contrôlés au serveur. Un droit dans un club ne s’étend pas automatiquement à l’autre. Paramètres des badgeuses et accès aux photos selon les autorisations propriétaires/super administrateurs exigées.
- Une fonctionnalité inventoriée, un bouton visible ou un test unitaire ne prouvent pas la parité avec le logiciel de référence.

## État du lot courant

| Domaine | État vérifié ou limite | Suite concrète |
| --- | --- | --- |
| Navigation Prospection | PR #84 : rubriques séparées, accès scénarios, liste mobile, filtres de club ; recette ciblée | Vérifier chaque option contre l’inventaire Lead, pas seulement les menus |
| Mon compte | Une navigation, onze rubriques dont les notifications persistantes ; compteur et préférences raccordés aux services existants | Recetter l’ensemble des documents, formations, contrôles et cas de droits sur les appareils retenus |
| Gestion RH | Sections selon réponse serveur, raccourcis vers dossiers/demandes/pointages | Recette complète des sections avancées et du planning d’équipe |
| Absences | Parcours navigateur création → validation → retour salarié réussi sur une absence fictive ; statuts historiques reconnus | Cas complexes avec débit/reprise de compteur, migration des statuts historiques et cas après clôture |
| Compteurs, acquisition, report | Services et contrats déjà développés ; accès propre au salarié vérifié dans ce lot | Confirmer les formules encore non observées dans Skello et réconcilier les soldes historiques ; voir les documents d’acquisition/report existants |
| Badgeuses, tablettes, photos | Réglages regroupés sous Réglages RH, restrictions serveur recontrôlées | Appairage et recette physique des tablettes, caméra, salle et présence avant cours ; aucun matériel validé par la simple navigation |
| Communication RH | Publications internes immédiates ou programmées, annulation, lectures persistantes, filtres équipes/dossiers, historique et audit ; contrôles ordinateur/mobile/tablette | Email, pièces jointes et autres variantes COM01 restent à développer ; la programmation est une amélioration OS et non une option Skello observée |
| Documents RH | Import PDF/PNG/JPEG, téléchargement privé, consultation déclarée, archivage/restauration, droits club/équipes et notifications testés | Archive conjointe hors ligne et diagnostic des orphelins développés ; photos privées incluses en V2 ; compléter automatisation, sécurité des fichiers réels et écarts DOC01/DOC02/DOC04 avant exploitation |
| Sauvegarde documentaire | Outil direction : archive JSON + octets, vérification SHA/HMAC, restauration vers dossier neuf et redémarrage testés ; export JSON incomplet refusé | Photos de badgeage incluses en V2 (nouvelle branche à relire), anciens JSON seuls refusés ; autres magasins privés et automatisation/interface à compléter ; aucune réplication réelle déclarée |
| Notifications RH | Cloche, boîte personnelle, lectures persistantes et notifications d’absences/annotations de pointage/planning publié testées ; trois formats vérifiés | Notifications de dépôt/prise de connaissance documentaire raccordées ; signatures et autres modules à raccorder, push/envois externes non livrés |
| Calendrier personnel | Flux .ics privé réellement servi : horaires propres publiés et absences validées, droits revérifiés, lien aléatoire haché, renouvellement/révocation/désactivation testés | Création/téléchargement/révocation/désactivation testés dans le navigateur ; abonnement Apple/Google/Outlook et adresse HTTPS stable restent à recetter |
| Lead, scénarios, modèles, campagnes | Moteurs et simulations existants ; voir contrats et recettes spécialisés | Variables de contexte non raccordées, réentrée/délégations avancées et autres écarts déjà listés dans les contrats ; recette par fonction avant annonce de parité |
| Affectation Lead / RH | Contrôle compte actif et rattachement au club, absences historiques, jour local et file d’attente ; 10 variantes HTTP sur deux clubs | Rééquilibrage/transfert livrés par #99/#101/#103 ; recette suivante reproduit attribution au coach/recouvrement et exemples locaux désynchronisés : éligibilité explicite, source unique et recontrôle RH nécessaires |
| Emails, SMS, WhatsApp | Préparation/simulation ; pas d’envoi réel validé | Paramétrage dédié, états fournisseurs, oppositions, accusés, échecs et anti-doublons à recetter sans perturber Heitz |
| Suivi des campagnes et certaines intégrations | Des tableaux et configurations de démonstration restent présents | Remplacer les exemples par une lecture persistante traçable ou indiquer clairement leur état ; ne pas annoncer un connecteur actif |
| Heitz et recouvrement | Collectes et garde de démonstration développées ; pas de connexion réelle autorisée pour la démo | Comparer chaque capacité à la documentation et aux droits fournisseur, puis recette séparée autorisée sur jeux adaptés |
| Paie, signatures, recrutement | Interfaces et exemples présents, connexion réelle non certifiée dans ce lot | Tester les formats, prestataires et parcours autorisés ; une signature simulée n’est pas un document signé réel |
| Mise en ligne | PR #83–#94 intégrées par le développeur sur main 34b1c0a, dont correction de l’aperçu de réplication ; aucun déploiement Codex | Vérifier séparément le commit réellement servi et ses parcours avant le pilote |

## Références de travail à ne pas perdre

- `public/references/lead_audit/LEAD_AUDIT_EN_COURS/INVENTAIRE_LEAD.json` : options Lead inventoriées ; la cartographie de routes se décrit comme connue et non exhaustive.
- `docs/lead-navigation-source-map.json` et `docs/lead-navigation-proposal.md` : correspondances et différences de rangement. Le statut historique « proposition » n’est pas un accusé de livraison.
- `docs/lead-scenarios-contract.md`, compléments horaires/blocs/messages/Brevo et recettes associées : comportements livrés et limites d’exécution.
- `src/domain/referenceRegistry.ts` et références RH embarquées : historique d’options Skello ; leur présence n’atteste pas leur implémentation.
- `docs/rh-organisation-plan-couverture.md` et `docs/rh-organisation-options-auditees.csv` : organisation, établissements, équipes et permissions.
- `docs/skello-proratas-report-complement-2026-11-25.md` : observations et points restant à confirmer pour acquisition/report.
- `docs/heitz-api-couverture-2026-11-25.md` : état de couverture documentaire Heitz, à distinguer d’un test réel du fournisseur.
- `docs/demo-coherence-2026-11-25.md`, `docs/lead-navigation-review-2026-11-26.md` et `docs/rh-workspace-recette-2026-11-26.md` : versions, parcours exécutés et limites des dernières reprises d’interface.
- `docs/rh-communications-calendrier-recette-2026-11-26.md` : contrat, parcours, résultats serveur et blocage visuel du nouveau lot.
- `docs/rh-audiences-contexte-recette-2026-11-26.md` : recontrôles visuels exécutés après rétablissement du navigateur, ciblage des destinataires, mémorisation du club et écart de la cloche globale.
- `docs/rh-notifications-recette-2026-11-26.md` : vraie cloche, boîte personnelle, événements d’absence/pointage, navigation, refus et redémarrage.
- `docs/rh-communication-programmee-recette-2026-11-26.md` : programmation interne, annulation, recontrôle des droits à échéance, refus, atomicité et redémarrage.
- `docs/rh-planning-notifications-recette-2026-11-26.md` : publication/modification/retrait/réaffectation des horaires et transaction persistante avec alertes.
- `docs/rh-documents-recette-2026-11-26.md` : fichiers privés persistants, droits, accusés sans signature, sauvegarde à compléter et écarts documentaires explicites.
- `docs/lead-assignment-integration-recette-2026-11-26.md` : recontrôle du main intégré, défauts d’affectation reproduits et restes répartis avec Antigravity.
- `docs/rh-documents-archives-recette-2026-11-26.md` : archive conjointe vérifiée, restauration neuve testée et périmètre privé encore exclu.
- `docs/v1-utilisable-conditions.md` : conditions de réception d’un pilote ; ne pas les remplacer par le nombre de tests.

- `docs/rh-photos-archives-recette-2026-11-26.md` : V2 documents + photos synthétiques, compatibilité V1, intégrité de consultation et 8 groupes HTTP ; aucun matériel réel testé.

- `docs/lead-pool-parcours-recette-2026-11-26.md` : contrôles réels des trois formats, corrections du bandeau/transfert et blocages d’éligibilité/collection restant à corriger avant exploitation.

- `docs/lead-liste-partagee-recette-2026-11-26.md` : lecture partagée réconciliée, copies locales conservées et attribution reçue respectée ; création/édition serveur toujours prioritaires avant pilote.

## Critère de fin

Pour chaque option retenue : référence source, écran cible, droit/club, lecture/écriture réelle ou simulation, règle de gestion, scénario de réussite, scénario de refus/échec, preuve et version testée. Une option non observée reste à vérifier ; une connexion désactivée volontairement n’est pas annoncée comme opérationnelle. Les comptes, appareils et accords du fournisseur nécessaires aux essais réels restent à obtenir avant le pilote.


## Complément du 27 novembre : contacts Lead persistants

Le lot de création/édition/étape/reprise contrôlée est documenté dans docs/lead-contacts-partages-recette-2026-11-27.md. Les nouvelles écritures passent au serveur, avec révision, opération rejouable et refus sans faux succès. La recette HTTP et les formulaires ordinateur/mobile/tablette ont été exercés en environnement fictif. Cela ne rend pas persistants les segments en masse, l’ancien planning simulé ou les autres intégrations.

Écart explicite avant pilote : Chloé est affichée Commerciale mais possède un profil serveur salarié simple à Beynost, sans droit d’écriture Lead selon la règle existante ; refus 403 conservé et signalé à Antigravity. Il faut une habilitation commerciale explicite par salarié/club, sans donner l’administration RH. Le nombre de tests ne remplace pas cette réception métier.


## Complément des délégations Lead du 27 novembre

Après #109 et le complément contacts, Chloé peut créer et modifier ses prospects à Beynost avec une délégation Lead explicite, sans changer son profil RH salarié simple. Ce parcours a réussi en HTTP et navigateur. #111 a corrigé le PUT de configuration ; administration seule, actions distinctes, révocation et redémarrage ont été exercés.

Après #113, le refus Lead view du même club est corrigé et les quatre premiers groupes HTTP passent. Le cinquième reste en échec pour create seul autorisant une modification RDV, une politique sur un autre club laissant le repli planificateur et deux habilitations dépendant de leur ordre. Le groupe strict a été transmis à Antigravity. Voir docs/lead-delegations-recette-2026-11-27.md ; pas de validation globale du module ni de déploiement.
