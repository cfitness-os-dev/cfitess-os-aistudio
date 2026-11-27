# Présentation des communications Lead — 27 novembre 2026

Ce lot poursuit la finition visuelle, sans déclarer les trois modules terminés. Base e6974ae (#116).

## Avant / après
- Mobile : douze gros boutons de blocs et quatorze variables avant le texte → choix compact parmi les douze types, ajout explicite, variables et mise en forme dépliables.
- Les variables sont affichées avec les mêmes libellés métier dans scénarios, modèles simples et blocs email. Les jetons enregistrés restent identiques.
- Listes latérales de modèles, campagnes et scénarios alignées en haut ; elles ne s’étirent plus à la hauteur de tout l’éditeur.
- Campagnes : raccourci vers Modèles de messages, indication explicite s’il n’existe aucun modèle actif du canal ; la protection de rédaction existante reste appliquée.
- Aperçu email : action Afficher l’aperçu de l’email, indication de préparation et explication lorsque l’aperçu n’a pas encore été demandé. Aucun moteur de rendu ou envoi changé.

## Recette exécutée
- 211/211 tests TypeScript ; compilation TypeScript et Vite réussie.
- Captures réellement examinées sur 390×844, 768×1024 et 1440×900 dans le navigateur intégré. Aucun fichier de capture exporté.
- Palette mobile : douze options présentes, ajout explicite d’un bloc Bouton au modèle fictif ; libellé et lien variable renseignés ; arrondi à 8 ; sauvegarde confirmée.
- Rechargement : modèle en version 2 avec ses deux blocs et arrondi 8 conservés.
- Panneau de mise en forme : polices, taille, alignement, couleurs et quatre marges toujours présents.
- Raccourci campagne → modèles : avec saisie non enregistrée, confirmation affichée ; Continuer la rédaction conserve le nom de la campagne. Campagne fictive ensuite sauvegardée avec le modèle ; 1 destinataire admissible affiché ; raccourci sans brouillon ouvre bien Modèles.
- Aperçu de l’email généré par l’API locale puis vu dans son cadre isolé ; prénom et club fictifs remplacés et bouton visible. Aucun email envoyé.
- Modèle, campagne et scénario de démonstration restent seulement dans le dossier de données local. La campagne n’a été ni simulée, ni programmée, ni envoyée ; le scénario n’a pas été activé.
- Copie de recette conservée sur http://127.0.0.1:62511/ ; frontend reconstruit depuis cette branche. Backend inchangé, intégrations externes et workers désactivés.

## Limites et suite
La création détaillée des douze types de blocs, l’import d’images, les envois, la programmation et toutes les variantes de droits ne sont pas re-testés par cette recette de présentation. Les validations métier et gardes existantes restent en place. Les sous-écrans RH avancés, les autres pages Lead et leurs états détaillés doivent encore être contrôlés selon presentation-modules-suivi.json. Aucun déploiement en ligne.

Le build final a été rechargé et sa capture examinée : listes latérales non étirées, état initial Afficher l’aperçu de l’email puis Actualiser l’aperçu, et rendu réel des deux blocs dans le cadre isolé. Validé sur ce périmètre de présentation uniquement.
