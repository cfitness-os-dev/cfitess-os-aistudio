# Délégations commerciales Lead par salarié et club

Branche fix/lead-contact-delegations depuis main ff521cd (#108 intégrée), synchronisée avec #109 a4e242a puis #110 78b0484 et #111 fad658d. Environnement local fictif uniquement, fournisseurs désactivés ; aucun déploiement.

## Contrat

Une délégation explicite du module Lead fait autorité sur le profil par défaut. create autorise la création ; update l’édition ; write, edit (alias générique de l’administration) et * couvrent les deux. view ou export n’autorisent aucune écriture. Une délégation sur un autre club ne donne pas accès au club demandé. Le moteur commun vérifie les identifiants normalisés et le rattachement, après vérification du compte actif.

L’édition conserve le contrôle du dossier : responsable du club, commercial assigné ou créateur habilité. Un droit d’écriture ne permet pas de modifier arbitrairement un dossier de collègue. Retirer le droit refuse immédiatement la réémission d’une création ou d’une édition pourtant déjà enregistrée, et canEdit devient faux dans la fiche reçue.

La délégation Lead ne change ni le profil RH, ni les rattachements, ni le droit d’administrer l’organisation ou de consulter les finances. Le nouveau module utilise le moteur commun existant ; routes.rs et les seeds restent réservés à Antigravity.

## Preuves

- 18 tests contacts ciblés réussis, dont six nouveaux groupes : habilitation d’un salarié simple sans élévation RH, priorité des politiques explicites, actions indépendantes, révocation/rejeu, contrôle du dossier et compte actif, alias edit et refus view/export.
- Suite Rust complète : 242 réussis, 0 échec, sur le code Rust combiné #109 + complément contacts (inchangé par #110).
- Recette HTTP contacts : sept groupes PASS, désormais avec création/édition réussies à Beynost par Chloé grâce à la délégation seed #109, tout en refusant Maxime à Beynost. Redémarrage, concurrence, refus et panne sans mutation conservés.
- Navigateur réel sur copie isolée port54738, frontend final du lot #108 : connexion Chloé, club unique Beynost, création Délégation Fictive sans email/consentement inventé, compteurs1→2, édition et affichage de la note. Aucun menu Collaborateurs/RH ou Finances accordé. Le profil RH et l’absence de permission organisation/finances sont aussi contrôlés côté tests serveur.
- Les trois formats de l’éditeur restent documentés dans lead-contacts-partages-recette-2026-11-27.md ; ce complément ne prétend pas une deuxième recette complète de toutes les rubriques.

## Configuration canonique et révocation RDV

La recette canonique scripts/test_lead_delegations_http.py a d’abord échoué sur #110 : HTTP400 au PUT administrateur du module lead/actions edit. Le choix UI existait, sa validation serveur manquait. Antigravity a corrigé ce point dans #111/fad658d ; correctif intégré sans toucher à ses fichiers.

Recontrôle HTTP réel sur la version combinée : les trois premiers groupes passent maintenant (administration seule, Lead edit sans élévation RH, révocation/rejeu, redémarrage, create/update/write configurables et distinctes, action inconnue refusée). Aucune injection de droit hors API pour masquer une panne.

Le quatrième groupe reste EN ÉCHEC : l’administrateur enregistre Maxime / Carré de Soie / Lead / [view], puis Maxime peut encore PATCH le rendez-vous fictif slot-seed-cds à 22:00 (HTTP200 et statut reporte au lieu du403 attendu). Le repli sur le profil planificateur annule le refus explicite. Le test reste strict et est transmis à Antigravity, propriétaire de routes.rs ; ce fichier n’est pas modifié ici. Compte actif et priorité des délégations doivent être corrigés dans cette règle RDV.

Signalements #21 : 7213215569 (contrat de configuration), 7213383421 (400 reproduit), 7213451762 (configuration corrigée et révocation RDV reproduite). Aucun effet réel : processus et dossier synthétiques jetables, intégrations désactivées.

Validation partielle : consommateur contacts, Chloé et configuration canonique testés ; cohérence de révocation RDV encore non validée. Ne pas annoncer l’ensemble des habilitations exploitable avant recontrôle conjoint. La PR reste un brouillon avec le test d’intégration en échec, sans modification en ligne.
