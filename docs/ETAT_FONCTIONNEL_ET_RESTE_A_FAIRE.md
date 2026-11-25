# État fonctionnel et suite du développement

État du 26 novembre 2026, lot local après PR #84. Ce document remplace une estimation globale en pourcentage par des critères vérifiables. Il ne déclare pas l’exhaustivité des logiciels de référence.

## Règles à conserver

- Heitz demeure la référence des adhérents, règlements, contrats, CGV, ventes et accès. Une opération réelle dans l’OS n’est activée que si l’API officielle la permet et si son résultat est relu ; sinon utiliser son interface web validée. Aucun accès Heitz réel depuis la démonstration actuelle.
- Heitz conserve ses emails actuels via Brevo. Les futurs envois OS doivent avoir une responsabilité et une clé dédiées, avec prévention des doublons. Aucun envoi réel pendant cette recette.
- Identité, club, équipes et droits sont contrôlés au serveur. Un droit dans un club ne s’étend pas automatiquement à l’autre. Paramètres des badgeuses et accès aux photos selon les autorisations propriétaires/super administrateurs exigées.
- Une fonctionnalité inventoriée, un bouton visible ou un test unitaire ne prouvent pas la parité avec le logiciel de référence.

## État du lot courant

| Domaine | État vérifié ou limite | Suite concrète |
| --- | --- | --- |
| Navigation Prospection | PR #84 : rubriques séparées, accès scénarios, liste mobile, filtres de club ; recette ciblée | Vérifier chaque option contre l’inventaire Lead, pas seulement les menus |
| Mon compte | Une navigation, dix rubriques ; compteur et préférences raccordés aux services existants | Recetter l’ensemble des documents, formations, contrôles et cas de droits sur les appareils retenus |
| Gestion RH | Sections selon réponse serveur, raccourcis vers dossiers/demandes/pointages | Recette complète des sections avancées et du planning d’équipe |
| Absences | Parcours navigateur création → validation → retour salarié réussi sur une absence fictive ; statuts historiques reconnus | Cas complexes avec débit/reprise de compteur, migration des statuts historiques et cas après clôture |
| Compteurs, acquisition, report | Services et contrats déjà développés ; accès propre au salarié vérifié dans ce lot | Confirmer les formules encore non observées dans Skello et réconcilier les soldes historiques ; voir les documents d’acquisition/report existants |
| Badgeuses, tablettes, photos | Réglages regroupés sous Réglages RH, restrictions serveur recontrôlées | Appairage et recette physique des tablettes, caméra, salle et présence avant cours ; aucun matériel validé par la simple navigation |
| Communication RH | Aperçu local explicite, sans envoi ni persistance serveur | Développer boîte interne persistante, ciblage autorisé, lecture, audit et accusés ; puis adaptateurs externes si nécessaires |
| Calendrier personnel | Préférences et renouvellement d’identifiant disponibles ; pas de route de lecture du flux trouvée | Développer un abonnement privé authentifié/révocable, avec droits, contenu et protection des identifiants vérifiés |
| Lead, scénarios, modèles, campagnes | Moteurs et simulations existants ; voir contrats et recettes spécialisés | Variables de contexte non raccordées, réentrée/délégations avancées et autres écarts déjà listés dans les contrats ; recette par fonction avant annonce de parité |
| Emails, SMS, WhatsApp | Préparation/simulation ; pas d’envoi réel validé | Paramétrage dédié, états fournisseurs, oppositions, accusés, échecs et anti-doublons à recetter sans perturber Heitz |
| Suivi des campagnes et certaines intégrations | Des tableaux et configurations de démonstration restent présents | Remplacer les exemples par une lecture persistante traçable ou indiquer clairement leur état ; ne pas annoncer un connecteur actif |
| Heitz et recouvrement | Collectes et garde de démonstration développées ; pas de connexion réelle autorisée pour la démo | Comparer chaque capacité à la documentation et aux droits fournisseur, puis recette séparée autorisée sur jeux adaptés |
| Paie, signatures, recrutement | Interfaces et exemples présents, connexion réelle non certifiée dans ce lot | Tester les formats, prestataires et parcours autorisés ; une signature simulée n’est pas un document signé réel |
| Mise en ligne | PR #83/#84 et lot RH proposés en branches séparées ; pas déployés par Codex | Relecture, intégration protégée, démonstration isolée identifiée par commit, puis recontrôle de la version servie |

## Références de travail à ne pas perdre

- `public/references/lead_audit/LEAD_AUDIT_EN_COURS/INVENTAIRE_LEAD.json` : options Lead inventoriées ; la cartographie de routes se décrit comme connue et non exhaustive.
- `docs/lead-navigation-source-map.json` et `docs/lead-navigation-proposal.md` : correspondances et différences de rangement. Le statut historique « proposition » n’est pas un accusé de livraison.
- `docs/lead-scenarios-contract.md`, compléments horaires/blocs/messages/Brevo et recettes associées : comportements livrés et limites d’exécution.
- `src/domain/referenceRegistry.ts` et références RH embarquées : historique d’options Skello ; leur présence n’atteste pas leur implémentation.
- `docs/rh-organisation-plan-couverture.md` et `docs/rh-organisation-options-auditees.csv` : organisation, établissements, équipes et permissions.
- `docs/skello-proratas-report-complement-2026-11-25.md` : observations et points restant à confirmer pour acquisition/report.
- `docs/heitz-api-couverture-2026-11-25.md` : état de couverture documentaire Heitz, à distinguer d’un test réel du fournisseur.
- `docs/demo-coherence-2026-11-25.md`, `docs/lead-navigation-review-2026-11-26.md` et `docs/rh-workspace-recette-2026-11-26.md` : versions, parcours exécutés et limites des dernières reprises d’interface.
- `docs/v1-utilisable-conditions.md` : conditions de réception d’un pilote ; ne pas les remplacer par le nombre de tests.

## Critère de fin

Pour chaque option retenue : référence source, écran cible, droit/club, lecture/écriture réelle ou simulation, règle de gestion, scénario de réussite, scénario de refus/échec, preuve et version testée. Une option non observée reste à vérifier ; une connexion désactivée volontairement n’est pas annoncée comme opérationnelle. Les comptes, appareils et accords du fournisseur nécessaires aux essais réels restent à obtenir avant le pilote.
