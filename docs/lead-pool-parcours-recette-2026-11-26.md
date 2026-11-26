# Parcours d'attribution et transfert Lead — 26 novembre 2026

Branche `fix/lead-pool-user-journeys`, base `1c166f7` (PR #101/#103 et #102 intégrées). Modifications frontend uniquement. Serveur Rust véritable, adresses de boucle locale et répertoires neufs, fournisseurs/planificateurs désactivés.

## Écarts reproduits et correctifs

- Au format 390 × 844, le texte de configuration était comprimé sur 62 px et dépassait à droite (398 px pour 390 px disponibles). Configuration reconstruite en colonne avec sélection native, texte en largeur disponible et boutons qui reviennent à la ligne. Après : texte 299 px, bord droit 341 px. L'indicateur et les commandes restent accessibles.
- Le choix 7 jours changeait l'intitulé « Stagnants >7j » alors que le serveur calcule >=3 jours. Repère d'indicateur fixe « Sans contact depuis au moins 3 jours », délai de réattribution séparé et explicite. Aucun calcul serveur changé.
- Identifiants emp-* remplacés par les noms des collaborateurs disponibles dans le contexte, sinon libellé neutre. Retrait de « round-robin cyclique » et de « vivier » des nouvelles commandes de ce panneau.
- Chargement/erreur explicites : aucun zéro inventé à la place d'un chargement échoué. Les réponses anciennes sont écartées par génération ; composant recréé sur changement de compte/club. Le bandeau se recharge aussi après transfert réussi.
- Réattribution en deux étapes : vérifier puis confirmer avec le délai retenu. Garde anti-double soumission ; résultat incomplet/ambigu impose une actualisation plutôt qu'une fausse confirmation.
- Réponses API validées avant application locale : succès métier, prospect exact, club attendu, seuil, tableaux complets sans doublons, compteurs entiers cohérents et taux fini. Les clubs RH préfixés sont convertis vers les identifiants Lead pour les requêtes.
- Affordances de gestion par club : profils explicites prioritaires, compatibilité des rôles historiques quand aucun profil n'est fourni. Ce calcul masque/désactive des commandes ; le contrôle serveur reste indispensable et indépendant.
- Modale de transfert : noms lisibles, hauteur bornée avec défilement, garde de soumission et résultat ignoré après fermeture du composant. Hors droit de gestion dans les deux clubs : explication et confirmation désactivée.

## Recette exécutée

Avant : copie locale `http://127.0.0.1:53616/crm`, frontend main non corrigé ; après : `http://127.0.0.1:56420/crm`. Ces copies appartiennent à ce lot, pas à la démo en ligne.

- Navigation confirmée : Prospection–Vente ouvre /crm ; Adhérents–CRM est une autre entrée. Le nom du composant CrmView n'atteste pas à lui seul un mélange des modules.
- Ordinateur 1280 × 720 avant, 1440 × 900 après ; tablette 768 × 1024 ; mobile 390 × 844. Rendus consultés dans le navigateur ; ce rapport ne prétend pas joindre des fichiers de capture exportés.
- Direction : indicateurs chargés, configuration 7 jours, confirmation puis réattribution réellement exécutée sur les données fictives ; réponse appliquée et nom du nouveau responsable affiché.
- Direction : transfert réel de la fiche fictive de Carré de Soie vers Beynost, fermeture après accusé valide et retrait de la liste du club source. L'état JSON privé de cette copie contient bien le nouveau club.
- Responsable mono-club : accès de réattribution pour son club, transfert inter-clubs expliqué et bouton de confirmation désactivé.
- Commercial : commande de réattribution absente ; rendu mobile clair et sombre consulté sans changement d'intégration.
- Requêtes serveur directes sous un commercial fictif : réattribution 403, transfert 403, statistiques de l'autre club 403. Fichier d'état inchangé pour ces trois refus.
- `npm test` : **188 réussis, 0 échec** (5 nouveaux tests portant les validations de réponses et profils ; tests existants conservés et fixtures de clubs alignées).
- `npm run lint` / compilation TypeScript : réussi ; build Vite et Rust : réussis.
- `cargo test --locked --quiet` : **222 réussis, 0 échec** ; aucun moteur Rust modifié.

Les scénarios de réponse HTTP 200 incomplète sont exécutés avec doubles de fetch en test TypeScript, pas par injection dans le navigateur. Les courses de chargement sont protégées par le code ; pas de recette navigateur avec réseau artificiellement retardé revendiquée. Après le dernier ajout de rechargement, transfert fictif de retour Beynost → Carré de Soie exécuté : indicateur actif de Beynost passé automatiquement de 2 à 1, sans actualisation manuelle. Les exemples locaux restants demeurent le blocage décrit ci-dessous.

## Restes empêchant de qualifier le module de prêt

1. **Éligibilité commerciale côté serveur** : la réattribution fictive a confié le contact au coach de démonstration (emp-karim), puis le transfert à un profil recouvrement (emp-greg). Il faut une liste explicite de collaborateurs habilités à recevoir des prospects, propre au club et persistante ; disponibilité RH seule ne suffit pas. À corriger par Antigravity dans ses moteurs réservés.
2. **Source unique de la liste** : au départ, indicateurs serveur = 1 actif tandis que liste = 2 contacts ; après transfert, serveur du club source = 0 et liste conserve un contact d'exemple local. La fusion partielle du contexte avec les données serveur ne supprime pas ces exemples. Ces deux nombres ne constituent pas une collection canonique cohérente. Réconcilier le chargement initial et les suppressions/transferts avec un vrai inventaire serveur, sans effacer des données réelles.
3. Recetter de nouveau après ces deux correctifs : rôles multi-clubs, équipes, reprise des données, appels concurrents/idempotence et archivage. La parité complète Lead et l'ergonomie du reste de l'application ne sont pas certifiées.

Aucun envoi réel, paiement, Heitz/Skello, appareil, photo ni mise en ligne. Décision : **validation partielle des corrections frontend ; module non validé pour exploitation en club**.
