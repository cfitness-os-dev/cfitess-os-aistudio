# Recette ciblée — Scénarios Lead, 22 novembre 2026

Branche `feat/lead-scenarios-contract`, PR #44, base main `f4b2fff`. Copie locale Rust/Axum sur 127.0.0.1:18110, stockage fictif dédié, envois externes absents du module. Aucun déploiement ni modification des logiciels réels.

## Résultats observés

| Contrôle | Résultat |
|---|---|
| `cargo test --locked` | Réussi : 104 tests, 0 échec, sortie 0 |
| `npm test` | Réussi : 88 tests, 0 échec, sortie 0 |
| `npm run lint` | Réussi, sortie 0 |
| `npm run build` | Réussi, sortie 0 ; bundle index-BVcQ_9F1.js |
| `cargo build --locked` | Réussi, sortie 0 |
| `scripts/test_lead_scenarios.py` | Réussi : 7 groupes HTTP, redémarrage réel inclus, 0 envoi externe |
| Création UI, deux étapes, enregistrement et publication | Réussi après authentification fictive |
| Activation, inscription et deux échéances | Réussi : email simulé puis tâche canonique, historique terminé |
| Rechargement navigateur | Réussi : scénario, publication et historique relus du serveur |
| Copie vers Beynost et changement de club | Réussi : copie inactive/verrouillée en brouillon, scénario source distinct |
| Ordinateur 1440×1000 | Éditeur en deux colonnes, contrôles accessibles |
| Tablette 768×1024 | Colonne unique, largeur document 761 ; historique terminé bas 815, bandeau haut 961 |
| Mobile 390×844 | Colonne unique, largeur document 383 ; historique terminé bas 667, bandeau haut 781 |

Les mesures de bas de page ont été prises après navigation clavier vers la fin du parcours. Aucun débordement horizontal du document dans ces mesures. Captures jointes : [ordinateur](evidence/lead-scenarios/ordinateur.jpg), [tablette](evidence/lead-scenarios/tablette.jpg), [mobile](evidence/lead-scenarios/mobile.jpg). Les captures tablette/mobile prouvent la visibilité de l'historique ; elles précèdent uniquement le renommage final des onglets voisins.

Les tests HTTP démarrent leur propre serveur avec un répertoire temporaire, worker désactivé et données fictives. Ils vérifient : Bearer et refus de rôle/club ; double commande simultanée et conflit d'identifiant ; révision et unicité d'inscription ; exécution après véritable arrêt/redémarrage ; absence de tâche doublée ; identifiants étrangers refusés ; erreur disque sans mutation mémoire/disque ; relecture par une session indépendante.

Le premier lancement npm sans TMPDIR a été empêché par les droits du répertoire temporaire ; relancé avec le répertoire de test autorisé, il est passé. Rust a signalé un avertissement d'écriture de cache xcrun ; compilation et tests ont terminé avec sortie 0.

## Limites de validation

Validation partielle : périmètre scénario de démonstration validé sur les parcours ci-dessus, pas certification globale de Lead. Aucun téléphone/tablette physique, connecteur externe, modèle Meta, envoi réel ni Heitz réel testé. Les scénarios automatiques, refus d'accès, consentement, temporisation, suspension et retrait d'habilitation sont couverts côté Rust ; leur matrice complète n'a pas été rejouée manuellement sur chaque format.

Le bouton de profil global et plusieurs écrans voisins gardent encore des mentions de démonstration/techniques héritées : le nettoyage complet de Prospection reste un autre lot. Pas d'annonce de parité exhaustive ni de production prête. Les fonctionnalités restant à développer sont détaillées dans `lead-scenarios-contract.md`.
