# HeitzSystem — couverture réellement développée, 25 novembre 2026

Lecture du code main `97862d3`, complétée par la documentation publique. Aucun appel au serveur Heitz des clubs, aucune clé consultée, aucune écriture fournisseur ni action de portillon. Ticket de corrections : [#68](https://github.com/cfitness-os-dev/cfitess-os-aistudio/issues/68).

## Réponse à l’objectif « 100 % de l’API »

La couverture n’est pas complète. Le connecteur sortant actuel utilise sept familles méthode/chemin et transforme une partie des données en vues locales. Cela ne constitue ni une collecte intégrale, ni une synchronisation bidirectionnelle complète. Les boutons/événements OS et les tests sur doubles locaux ne prouvent pas qu’une opération est disponible et validée chez Heitz.

Il est possible de développer un connecteur pour toutes les fonctions **effectivement exposées et autorisées** par la version Heitz utilisée. L’intégralité des écrans Heitz n’est pas nécessairement exposée. Une clé développeur ne prouve pas l’accès à toutes les fonctions. Les données collectées doivent ensuite être filtrées par club et habilitation ; une couverture complète côté serveur ne signifie pas un affichage général des données sensibles.

## Inventaire du connecteur sortant

Source : `src-rust/src/heitz_live.rs`, fonction `run_heitz_live_sync`, et `get_heitz_live_overview`.

| Appel sortant présent | Utilisation constatée | Limite actuelle |
| --- | --- | --- |
| POST /api/developer/getToken?v=2 | Obtention d’un jeton développeur | Un jeton valide ne prouve pas tous les droits/version |
| GET /api/users/search | Identité, contacts, abonnement, badge, solde | Deux fenêtres de 120, ASC/DESC, sans pagination ; écrasement du stock par le sous-ensemble reçu |
| GET /api/userPassages/browse | Passages du jour, centre/badge | 100 en synchronisation, 30 en aperçu ; pas d’historique complet |
| GET /api/fmi/date/:date | Entrées et présence | Repli possible sur une ancienne valeur positive au lieu d’un zéro actuel ; date/heure UTC à rapprocher du fuseau des clubs |
| GET /api/employee/list?status=active | Nombre de collaborateurs | Pas une reprise complète des dossiers RH, contrats ou droits Heitz |
| GET /api/planning/configuration/rooms | Salles | Pas une intégration complète des cours, séances, réservations ou règles sportives |
| GET /api/ticket | Tickets récents | 60 en synchronisation, 25 en aperçu ; ne constitue pas un CA complet sur une période |

Les chemins ci-dessus sont ceux du code, pas une certification de compatibilité avec chaque version fournisseur. Certaines variantes diffèrent des titres de la documentation publique et doivent être confirmées.

`get_heitz_integration` annonce encore `mode: web_only`, `apiWritesAvailable: false`, avec un indicateur séparé de configuration live : contrat d’affichage à clarifier. Le refus des écritures CRM locales évite de faire croire à une modification fournisseur. La route OS `/api/heitz/sync-sale` reçoit un événement de vente et `/api/heitz/gate-check` traite une décision locale ; leur présence ne démontre pas un branchement opérationnel à Heitz.

## Documentation récupérée

La [page officielle Heitz Web Service](https://heitzsystem.com/documentation-webservice/) conduit à la [documentation publique HZ.WS dans Postman](https://documenter.getpostman.com/view/24519/SVfMUAnB). Elle précise notamment que droits et version conditionnent certains appels.

Firecrawl a fourni du texte détaillé sur l’authentification, les établissements, le planning et le sportif : **147 titres de requêtes extraits, 144 paires méthode/chemin candidates distinctes**, avec doublons/variantes et mentions obsolètes ou incomplètes. Les chemins dérivés des titres ne sont pas tous des URL canoniques vérifiées : le fichier marque chaque entrée `requiresPathConfirmation`.

L’extraction reste **partielle** : utilisateurs, vente, paiements, mandats, échéanciers, abonnements, documents, téléversement, paramètres, collaborateurs et partenaires apparaissent dans la navigation mais leurs contrats détaillés ne sont pas tous rendus dans le texte obtenu. Le nombre extrait n’est donc pas le nombre total d’endpoints et ne permet pas un pourcentage. L’ancien manuel « Serveur Web » de 2018 décrit une autre génération d’échanges : ne pas le substituer à la collection de la version installée.

Le fichier `heitz-public-api-catalogue-2026-11-25.json` contient uniquement une liste de travail expurgée : pas de clé, de jeton, d’exemple de fiche, de contenu médical ou de copie du code fournisseur. La documentation partielle confirme l’existence de nombreuses fonctions non intégrées ; elle ne prouve pas qu’elles sont autorisées à notre compte ni qu’il faut les réimplémenter plutôt qu’ouvrir Heitz.

## Corrections prioritaires demandées dans #68

1. **P0 : panne/lecture partielle ne doit pas effacer des données.** Les erreurs aval sont converties en listes vides ; `db.heitz_members = synced_members` remplace le stock quand le lot est non vide et `db.recovery_cases = real_recovery_cases` remplace toujours le recouvrement. Le succès d’une seule fenêtre ou la panne des deux peuvent donc produire des états incohérents. Préserver le dernier état confirmé, exposer état partiel/échec et ne supprimer qu’après une preuve fournisseur explicite.
2. **P0 : préserver le suivi local du recouvrement.** La reconstruction réinitialise statut, nombre de relances et note. Rapprocher les données source par ID stable tout en conservant actions/historique OS.
3. **P1 : retirer les valeurs inventées de la donnée live.** RFID/Bluetooth true, MOVEs passages×250, fidélité passages×10, dernière venue 0 ou 3 j ; ancienneté dette 7+index, mois facturé courant et justificatifs tous marqués présents. Ce ne sont pas des données fournisseur vérifiées. Représenter inconnu/indisponible avec provenance, plutôt que de déclencher des décisions ou afficher de faux faits.
4. **P1 : pagination et rattachement club explicites.** Ne pas déduire le club par préfixe d’ID puis choisir Beynost par défaut si le centre est inconnu. Séparer club d’appartenance et club du dernier passage. Traiter tous les résultats, avec reprise et anti-doublon.
5. **P1 : droits par club et indicateurs complets.** Le manager qui lance une synchronisation globale et l’accès financier live-overview demandent un contrôle des droits mixtes. Ne pas qualifier les 60 derniers tickets de CA exhaustif. Conserver les zéros FMI et mettre à jour les montants KPI, pas seulement le libellé de période.
6. **P1 : recette isolable et provenance.** Le worker part dès que les clés sont présentes, même en mode démo, et utilise emp-mario. Prévoir un verrou explicite, une identité de service et des journaux d’exécution distincts. Ne pas exposer l’adresse interne du service dans le navigateur ; la documentation fournisseur en recommande la confidentialité.

Ces constats proviennent de la lecture du code ; l’ampleur des données réelles affectées n’a pas été mesurée et aucun incident de production n’est affirmé. Les critères de reproduction sur données fictives sont détaillés dans #68.

## Matrice à obtenir et compléter avec le fournisseur

| Domaine | Étape suivante |
| --- | --- |
| Adhérents/contacts/consentements | Liste des champs, pagination intégrale, suppressions, ID stable, centre et droit par champ |
| Abonnements/offres/options | Historique, statuts et dates, règles de conversion client ; écritures uniquement si documentées |
| Factures/tickets/règlements/échéanciers/impayés | Volumes complets et période réelle, références, statuts, rapprochement ; Heitz reste la référence financière |
| Documents/mandats/signatures | Contrat de lecture/téléchargement et preuve de statut ; aucun justificatif supposé présent |
| Passages/accès/FMI | Fuseau, ordre/pagination, historique, événements et droits ; aucune ouverture physique testée |
| Planning sportif/réservations/salles/coachs | Lecture complète puis réservation/annulation uniquement si autorisées et testables sans effets réels |
| Sportif/mesures/programmes/séances | Définir l’utilité par rapport à MyWellness, les droits et les données réellement exposées ; pas de doublon automatique |
| Collaborateurs/établissements/paramètres | Identifier les champs maîtres et leur relation avec RH OS ; aucune copie de droits implicite |

À demander au développeur/Heitz : export complet Postman/OpenAPI correspondant à la version installée, droits de l’application pour chacun des deux centres, schémas et pagination, règles de suppression/quota/erreur, événements disponibles, matrice lecture/écriture, espace de test fictif et exemples expurgés. Ensuite qualifier chaque possibilité : documentée → accessible → implémentée → testée sur double → testée chez le fournisseur → validée métier. Un raccourci Heitz reste la solution lorsqu’aucune API adaptée n’existe.
