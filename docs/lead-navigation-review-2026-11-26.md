# Prospection — reprise des repères Lead

## Périmètre livré

La navigation quotidienne remplace les onglets mélangés par des destinations explicites : Prospects, Activités, Planning des rendez-vous, Messagerie, Modèles, Campagnes, Scénarios, Suivi des campagnes, Historique, Statistiques, Ventes, Formulaires, Paramètres. Le registre de recette et la vue Clients de diagnostic restent réservés au mode technique ; le CRM adhérents conserve sa rubrique distincte.

Sur ordinateur, un menu de module regroupe les destinations par usage. Sur mobile et tablette, un sélecteur groupé donne accès aux mêmes écrans. Les contrôles d’accès existants restent appliqués à la destination exacte, notamment Statistiques/Ventes/Formulaires ; cette réorganisation ne remplace pas les contrôles serveur.

La liste des prospects devient la vue d’entrée. Sur mobile elle présente des cartes avec accès à la fiche ; la table reste disponible sur tablette et ordinateur. Le tableau de suivi reste disponible avec des colonnes suffisamment larges et un défilement interne. Import et segments sont accessibles dans une section dépliable. Les objectifs commerciaux, les contacts proposés et les formulaires suivent le club sélectionné. Un formulaire déjà ouvert dans un autre club n’est plus affiché après changement de club.

Les estimations forfaitaires de valeur annuelle et les tarifs présentés comme une transaction du prospect ont été retirés de la présentation quotidienne. Les actions d’adhésion sont nommées « Préparer l’adhésion ». Les fonctions sous-jacentes de démonstration ne sont pas raccordées à Heitz réel par cette modification.

La fiche place les coordonnées et les informations du contact avant son suivi des scénarios. Le texte d’un brouillon SMS existant est conservé et son destinataire est rappelé pour vérification ; les données de démonstration peuvent encore comporter un brouillon dont le prénom ne correspond pas au contact. Cela reste une anomalie du jeu initial à corriger avant toute activation réelle, pas une fonctionnalité validée par cette livraison.

## Vérifications exécutées

- Construction TypeScript/Vite : réussie après les derniers changements (bundle index-D3_VJU-_.js).
- Suite existante : 160 tests TypeScript réussis, zéro échec après les derniers changements.
- Navigateur Chrome, profil administrateur de démonstration : ouverture de Prospection, accès direct aux scénarios et modèles, retour à la liste, ouverture d’une fiche depuis une carte mobile.
- Mobile 390 × 844 : menu groupé, cartes, accès fiche, aucun débordement horizontal de la page des prospects (largeur du document 383 pour un viewport de 390).
- Tablette 768 × 1024 : mêmes destinations, table avec défilement interne, aucun débordement horizontal de la page des prospects (761 pour 768).
- Brouillon de modèle non enregistré : tentative de changer de rubrique, retour à la rédaction avec nom conservé, puis abandon volontaire et accès aux scénarios. Aucun modèle enregistré ni message envoyé.
- Dernière construction : formulaires Carré de Soie seuls, puis Beynost seul après sélection du club ; retour à Carré de Soie vérifié.
- Les dimensions temporaires du navigateur ont été réinitialisées.

Les scénarios mobile/tablette et la protection de brouillon ont été exercés avant les derniers ajustements de filtrage et de libellés ; leurs composants de navigation n’ont pas changé ensuite. Les filtres de formulaires ont été recontrôlés dans la dernière construction.

## Limites et suite

Validation partielle sur ce périmètre de présentation. Ce lot ne valide pas toute la parité Lead ni la version RH. Les routes serveur n’ont pas changé ; leur suite Rust n’a pas été relancée pour ce lot d’interface. Aucun déploiement public, aucun envoi, aucune modification dans Heitz.

À poursuivre : menus et fiches RH selon le profil, cohérence des étapes de suivi avec les statuts Lead, suppression du jargon dans les sous-écrans restants, données de démonstration cohérentes entre fiches/messages/activité, puis recettes de parcours complets et matrice exhaustive des fonctions. Les liens profonds vers les sous-rubriques de Prospection ne sont pas encore ajoutés.

Cette branche dépend de la PR #83 (isolation de la démonstration) : intégrer cette protection avant de publier l’interface sur une démonstration. Ne pas connecter Heitz réel pour cette revue.
