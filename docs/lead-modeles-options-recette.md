# Modèles de messages et options de scénarios — recette du deuxième lot

Branche `feat/lead-scenarios-contract`, suite de la PR #44. Ce rapport complète le rapport du premier lot ; ses captures antérieures ne prouvent pas le nouveau catalogue.

## Réalisé et vérifié

Catalogue serveur email/SMS/WhatsApp par club, révisions, copies et archives ; validation de l’objet et de la présentation email, variables connues et contextes manquants ; modèles figés à la publication ; historique du contenu résolu. Options WhatsApp direct/modèle/repli enregistrées sans exécution fournisseur. Conditions de sortie testées : réponse, statut, perte du ciblage. Duplication d’étape depuis l’éditeur.

Tests Rust : droits de création de modèle, rejeu, révision périmée, échec disque, références étrangères/archivées, publication et contenu immuables après modification du modèle, rechargement sérialisé, interpolation en un passage, variables manquantes, sorties avant échéance, absence de repli WhatsApp inventé, présentation email et URLs dangereuses refusées.

Tests TypeScript : interpolation littérale, variables inconnues, frontières GSM-7/Unicode et multipart SMS, configuration WhatsApp et sorties par mode, texte de composition et URLs dangereuses refusées.

Le script HTTP étendu passe dix groupes sur un véritable serveur Rust jetable. Il prouve en particulier : rôle commercial refusé, isolation des catalogues par club, double commande sans modèle doublé, conflit d’édition, version publiée inchangée après modification/archivage, contenu personnalisé dans l’historique et copie interclub maintenus après véritable arrêt/redémarrage. Deux créations concurrentes distinctes retournent chacune leur identifiant exact, maintenu lors du rejeu après les autres créations ; le client ne choisit plus arbitrairement la dernière ligne du catalogue. Zéro envoi externe.

| Contrôle final | Résultat observé |
|---|---|
| `cargo test --locked` | 109 réussis, 0 échec, sortie 0 |
| `npm test` | 92 réussis, 0 échec, sortie 0 |
| `npm run lint` | Réussi, sortie 0 |
| `npm run build` | Réussi, sortie 0 ; index-D1iK11xB.js |
| `cargo build --locked` | Réussi, sortie 0 |
| Script HTTP | 10 groupes réussis ; 0 envoi externe |

Un avertissement de cache xcrun a été émis par l’éditeur de liens sous les permissions locales ; les commandes Rust ont terminé avec sortie 0. Une lecture Git a dû être relancée après expiration du contrôle automatique de permission ; elle a ensuite abouti.

## Contrôle navigateur bloqué

La navigation automatisée vers 127.0.0.1:18111 ne se termine pas : l’onglet reste `about:blank` et l’outil perd sa continuation. Le serveur local répond pourtant à `/api/health` et la recette HTTP réussit. Deux tentatives de navigation et une reconnexion ont été effectuées ; aucune manipulation de la démo en ligne. Ne pas en déduire une panne de l’application ni prétendre que les nouvelles interfaces ont été validées visuellement.

À rejouer : modèle créé et relu dans l’onglet Modèles, insertion de variable, présentation email/bouton/police, estimation SMS, sélection du modèle dans un scénario, duplication d’étape, replis WhatsApp, conditions de sortie et conservation de saisie sur refus, aux formats ordinateur 1440 px, mobile 390 px et tablette 768 px. Une édition concurrente doit conserver la révision initiale et être refusée tant que la saisie n’a pas été réconciliée.

## Limites

Validation partielle sur le périmètre serveur/domaine exécuté. Pas de nouvelle capture prétendant montrer ce lot. Pas d’envoi email/SMS/WhatsApp, test Meta, calendrier réel de rendez-vous, tarif fournisseur ni opération Heitz. Les 12 blocs avancés email, fenêtres horaires, graphe conditionnel et réentrée restent à développer. Les anciennes données locales du constructeur ne sont pas importées silencieusement dans un club : un import explicite et vérifié serait nécessaire.

Le moteur reste volontairement en simulation, activation en production refusée. Aucune fusion main ni aucun déploiement.
