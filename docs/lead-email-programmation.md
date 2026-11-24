# Programmation des campagnes email — recette locale

24 novembre 2026. Branche `feat/lead-email-scheduling`, fondée sur le dernier complément de la PR #48 (`bd3e83b`). Aucun transport fournisseur ni envoi réel ajouté.

## Comportement livré
- Les campagnes email peuvent être programmées et annulées comme les SMS.
- Date Europe/Paris, future et limitée à 366 jours ; les heures ambiguës ou inexistantes sont refusées.
- Objet et contenu du modèle figés lors de la programmation. Historique conservé avec motif d'annulation.
- Une seule échéance en attente par campagne ; modification, archivage et simulation immédiate bloqués pendant l'attente.
- Droits, club, destinataires et exclusions revérifiés au traitement.
- Écriture atomique sous verrou ; une erreur disque ne valide ni échéance ni préparation. Reprise sans doublon après redémarrage.
- Un canal restauré incohérent échoue sans préparation email/SMS.
- Le traitement produit seulement une préparation Brevo locale en mode simulation. Aucun appel HTTP Brevo/Heitz et aucune clé réelle. Le worker demeure limité au mode démo et peut être désactivé.

## Vérifications exécutées
- TypeScript : lint et build réussis ; 116 tests réussis.
- Rust : build --locked et 132 tests réussis.
- Vrai serveur Rust sur boucle locale : 22 groupes scénarios/campagnes et 11 groupes programmation réussis, soit 33 groupes. Données fictives en répertoires temporaires ; aucun envoi externe.
- Les quatre nouveaux groupes couvrent email figé/droits/clubs/rollback/reprise, exclusion après programmation, annulation durable et incohérence email/SMS.
- Chrome, copie locale 127.0.0.1:18131 : création modèle et campagne email, échéance future, verrouillage du formulaire, annulation motivée, relecture après rechargement et traitement sans exécution de la campagne annulée.
- Mobile simulé 390×844 : largeur document/défilement 383/383. Tablette 768×1024 : 761/761. Champs et annulation accessibles. Ce contrôle ne valide pas un appareil physique.
- Captures : `evidence/lead-email-programmation-mobile.jpg` et `evidence/lead-email-programmation-tablette.jpg`.

## Intégration et limites
Ce complément dépend de la PR #48, dont la tête est laissée stable pour sa revue. Ne pas fusionner ce complément dans la branche parente pendant la revue ; après intégration de #48, rebaser/recibler vers main et rejouer les tests. Aucun déploiement effectué.
Pas de migration de schéma supplémentaire par rapport à #48. Les garde-fous de sauvegarde et retour arrière de #48 restent applicables.
Le branchement réel Brevo, les retours fournisseurs, les quotas et la coordination anti-doublons avec Heitz demandent une recette dédiée. Cette livraison ne certifie pas toute la parité Lead.

## Accélération RH coordonnée
Ticket #50 attribué à pinto1230766 : dossier salarié, contrat et compteurs cohérents entre Mon compte et Collaborateurs et RH, droits clubs/équipes, données sensibles et persistance. Aucune confirmation de démarrage reçue au dernier contrôle. La priorité RH ne constitue pas une déclaration de parité complète Skello.
