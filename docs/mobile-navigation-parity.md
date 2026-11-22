# Navigation commune ordinateur, téléphone et tablette

Lot coordonné sur l'issue #21. Base : main `f9ae81c`, qui inclut les PR #26/#27 approuvées et fusionnées par le développeur. Aucune modification de la démo en ligne par Codex.

## Organisation retenue

Les accès `shell=employe` utilisent désormais `AdminShell`, déjà responsive. Le sélecteur d'interface de connexion conserve son entrée mobile/tablette. Le paramètre historique `device=rh` à la racine ouvre Mon compte ; une URL métier explicite conserve sa destination. Le format suit la taille réelle de l'écran, sans cadre de téléphone fictif.

Les menus ordinateur et tiroir mobile utilisent la même liste et les mêmes conditions de visibilité. Cela reprend les règles actuelles du shell commun, sans élargir les droits serveur ni certifier toutes les délégations possibles. Le sélecteur de club utilise exclusivement `authorizedClubIds`. Les préférences complètes sont dans Paramètres → Mon espace → Apparence ; la bascule Jour/Nuit reste directement accessible.

Ordre des rubriques métier : Prospection – Vente, Adhérents – CRM, Téléphonie, Site Web & Réseaux, Mon planning, Planning cours collectifs, Mon compte, Collaborateurs et RH, Finances, Recouvrement, Stock & Achats, Rapports. Seules les rubriques autorisées au profil s'affichent. Les couleurs et pictogrammes du shell commun sont conservés.

Le bandeau inférieur contient des raccourcis : Accueil, Adhérents – CRM (Bilans pour coach/apprenti), Mon planning, Mon compte, Menus. Mon compte ne s'allume plus lorsqu'on consulte la gestion RH ; Mon planning ne s'allume plus sur les cours collectifs. Le tiroir affiche la rubrique active, y compris Site Web & Réseaux. Il ferme après sélection, avec Échap ou lors du passage au format ordinateur ; la navigation au clavier reste dans le tiroir ouvert puis revient au bouton d'ouverture. Le défilement de fond est suspendu pendant son ouverture.

## Anciennes vues remplacées

Le prototype à deux téléphones, sa navigation parallèle, le sélecteur libre de collaborateur, les trois boutons « 2 Clubs / Carré de Soie / Beynost » et les raccourcis de simulation caisse/portillon de cet ancien shell ne constituent plus un second parcours métier. Les composants et services métier communs restent la destination : CRM de consultation Heitz, Prospection, planning RH, cours collectifs, Mon compte, gestion RH et paramètres. Le kiosque dédié et le softphone dédiés ne sont pas modifiés.

Ce lot n'est pas une preuve de parité fonctionnelle de chaque ancien formulaire personnel, quiz, checklist ou action de signature avec le module RH commun. Leur équivalence fonctionnelle doit être contrôlée séparément avant recette finale ; ne pas annoncer « toutes les fonctionnalités mobile sont validées ». Les anciennes implémentations restent consultables dans l'historique Git pour cette comparaison, sans réactiver leurs simulations comme des opérations réelles.

## Blocage découvert pendant la recette

Ouvrir Téléphonie avec zéro adhérent Heitz provoquait une exception `firstName` et une page entièrement vide. Le panneau gère maintenant l'absence de correspondance et ne prend plus arbitrairement le premier adhérent de la liste. Aucun appel téléphonique n'a été passé ; ce correctif ne certifie pas le moteur de téléphonie ni le rapprochement fournisseur.

## Recette ciblée du 22 novembre 2026

Serveur Rust sur boucle locale, stockage de test dédié, données fictives. Aucun envoi, paiement, appel, connexion Heitz ni action sur un portillon réel.

| Contrôle | Résultat |
| --- | --- |
| TypeScript strict, build frontend, build backend | Réussi |
| Tests TypeScript | 55 réussis, 0 échec |
| Tests Rust après intégration de main f9ae81c | 68 réussis, 0 échec |
| Menus comparés ordinateur/petit écran : admin Mario, manager Sarah, commerciale Chloé, coach Karim | Même liste de rubriques métier pour chaque profil |
| Commerciale Beynost | Un seul club autorisé, sélecteur désactivé ; RH de gestion, Finances, Recouvrement et Stocks absents comme sur ordinateur |
| Administrateur bi-club | Deux clubs disponibles ; sélection Beynost ferme le tiroir |
| Destinations mobiles | Prospection, CRM, Téléphonie, Site Web, les deux plannings, Mon compte, RH de gestion, Finances, Recouvrement, Stocks, Rapports, Paramètres atteignent les routes attendues |
| Raccourci coach Bilans | Route /bilans atteinte |
| Ancien lien shell=employe&device=rh | Route /mon-compte/personal atteinte, identité Karim propre au compte |
| Téléphonie avec liste Heitz vide | Module visible, état vide explicite, plus d'exception bloquante |
| Menu clavier | Focus initial sur Fermer, Maj+Tab boucle vers le dernier bouton, Échap ferme et rend le focus à Menus |
| Passage petit écran → ordinateur | Tiroir fermé automatiquement |
| Rubriques actives | Cours collectifs distinct de Mon planning, gestion RH distincte de Mon compte, Site Web actif dans le tiroir |
| Téléphone 390×844, Paramètres après défilement | Dernier bouton se termine à y=663, bandeau commence à y=781 ; pas de recouvrement sur ce parcours |
| Formats contrôlés | 1440×1000, 768×1024, 390×844 |

Validation partielle : les destinations et la visibilité sont contrôlées, pas toutes les actions internes de chaque module. Les droits serveur complets, le matériel physique, Safari natif, le hors-ligne et toutes les tailles intermédiaires ne sont pas certifiés par cette recette. Les anciens libellés techniques à l'intérieur de certains modules nécessitent un lot distinct. L'API Heitz reste à vérifier avec l'éditeur conformément à #26.

## Relecture attendue

Antigravity doit relire le remplacement du shell divergent, contrôler les parcours personnels à préserver dans Mon compte et refaire la recette visuelle avant fusion. Les fichiers réservés sont limités au shell employé, à la navigation commune, au raccourci du tableau de bord et au bloc d'état vide Téléphonie. Aucun déploiement ni fusion par Codex.
