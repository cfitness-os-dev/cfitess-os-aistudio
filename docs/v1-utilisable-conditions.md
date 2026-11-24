# Conditions d'une première version utilisable

État du 24 novembre 2026. Cette liste organise une première recette pilote Lead/RH ; elle ne remplace pas l'inventaire complet des logiciels audités.

## Premier périmètre à rendre fiable

| Parcours | Condition de réception |
|---|---|
| Comptes et clubs | Un collaborateur mono-club et un collaborateur des deux clubs retrouvent la bonne identité, les équipes, les clubs et les droits ; les requêtes interdites sont refusées au serveur. |
| Prospection | Créer un prospect, le retrouver après redémarrage, traiter son activité et son rendez-vous, appliquer un scénario et suivre son exécution sans double action. |
| Communications | Modèles, ciblage, consentement/opposition, planification, annulation et erreurs vérifiés ; envoi réel Brevo seulement après configuration dédiée et recette autorisée. Heitz garde ses propres emails : pas de double envoi. |
| Heitz | Référence pour ses adhérents, contrats, ventes et accès. Une manipulation OS ne remplace une manipulation Heitz que si l'API officielle l'exécute et que le résultat est relu. Sinon, accès à son interface web validée. |
| Dossiers RH | Identité, contrats, affectations à un/deux clubs et plusieurs équipes ; lecture et modification suivant les droits de chaque club. |
| Absences et compteurs | Demande → contrôle du justificatif → décision d'un autre responsable → mouvement de compteur → reprise/historique → relecture salarié. Le lot `rh-leave-policies-counters` apporte ce parcours avec quantités confirmées manuellement. |
| Planning et badgeage | Shifts publiés visibles dans Mon planning ; pointage personnel seulement si autorisé ; borne autorisée au bon club et à la bonne salle ; photo et présence avant cours à recetter sur le matériel cible. Réglages de badgeuse réservés propriétaire/super administrateur. |
| Interface | Même logique de navigation sur ordinateur, mobile et tablette, actions accessibles, aucun bouton masqué par la navigation fixe, vocabulaire métier et messages d'erreur compréhensibles. |
| Exploitation | Version précise identifiée, données de test séparées, démarrage sans profils fictifs en production, droits et sessions fiables, sauvegarde/restauration testée sur copie, journal d'erreurs et procédure de retour documentés. |

## Ce qui est prouvé pour ce lot

Les parcours d'absence et de décompte ci-dessus sont exercés sur une copie locale avec un serveur réel, concurrence, erreurs d'écriture et redémarrage. Voir `rh-absences-compteurs-recette.md` et les preuves de la PR. Les PR #54, #55 et #56 ont été fusionnées ; cela ne vaut pas recette de tous leurs écrans ni de la version déployée. Le lot sécurité P0 du développeur est coordonné séparément.

## Vérifications encore nécessaires avant une utilisation réelle

1. Intégrer la branche par revue et rejouer la recette sur la version effectivement déployée en préproduction, identifiée par commit. Une réussite locale ne valide pas une autre version.
2. Vérifier avec les responsables les règles des compteurs et des absences réellement appliquées, les soldes initiaux, calendriers et cas de salariés multi-contrats. L'acquisition automatique exige des règles explicites et des exemples attendus.
3. Configurer les intégrations utiles avec des accès dédiés. Les capacités Heitz exigent sa documentation et sa validation ; une simulation n'est pas une synchronisation réelle. Brevo ne doit modifier ni les clés ni les automatismes utilisés par Heitz.
4. Recetter tablettes, caméra, identité du badgeur et salle de cours sur les appareils retenus ; traiter confidentialité, droits d'accès aux photos et conservation avant de collecter de vraies données.
5. Exécuter un scénario de journée complète avec les profils cibles et les deux clubs, puis une restauration dans une autre copie. Traiter tout défaut d'accès, perte de données ou fausse confirmation avant le pilote.
6. Livrer une liste explicite des fonctions disponibles, des fonctions volontairement reportées et des fonctions encore bloquées. Ne pas présenter les réglages descriptifs ou intégrations simulées comme des automatismes opérationnels.

Pas de pourcentage global ni de date de disponibilité déduits du nombre de boutons, de tests ou de lignes de code. Le passage en première version utilisable est décidé sur ces parcours reçus et leurs blocages levés.
