# Recette du troisième lot — 23 novembre 2026

Branche `feat/lead-scenarios-contract`, PR #44. Stockage fictif local dédié, serveur Rust sur 127.0.0.1:18112, ordonnanceurs désactivés pendant les manipulations manuelles. Le script HTTP emploie ses propres dossiers jetables et ports de boucle locale. La démo distante est restée intacte.

## Contrôles exécutés

| Niveau | Résultat |
|---|---|
| Suite Rust `cargo test --locked` | 111 réussis, 0 échec |
| Suite TypeScript `npm test` | 94 réussis, 0 échec |
| TypeScript strict / lint | Réussi |
| Compilation frontend | Réussie, index-BgTJWnuo.js |
| Compilation backend | Réussie |
| Recette HTTP complète | 12 groupes réussis, 0 envoi externe |

Les groupes nouveaux couvrent : aperçu authentifié et refus commercial, absence de mutation du fichier d’état par l’aperçu, douze types de bloc, image PNG intégrée réellement validée et incluse dans le rendu, exclusion des images distantes de l’aperçu structuré, HTML assaini, immutabilité du document publié après édition du modèle, rejeu et deux chemins conditionnels après vrai redémarrage. Boucles, destinations manquantes ou désactivées refusées ; le changement de statut après décision ne réévalue pas le chemin choisi. Les groupes précédents continuent de couvrir clubs, révisions, concurrence, disque en échec et tâches sans doublon.

Les avertissements d’écriture du cache xcrun n’ont pas empêché compilation/tests (sorties 0). La résolution initiale des nouvelles dépendances a proposé ICU exigeant Rust 1.88 ; le verrou final a été régénéré avec la cible Rust 1.85, sans remplacer les versions des dépendances préexistantes. Docker/Linux et compilation sous Rust 1.85 lui-même non exécutés.

## Parcours navigateur réellement effectués

1. Connexion avec compte de démonstration local ; création d’un modèle, objet avec prénom et texte, conversion vers l’éditeur à blocs.
2. Ajout d’un bouton, adresse fictive HTTPS, HTML comprenant un script de test et image par adresse fictive. Enregistrement confirmé puis aperçu serveur : prénom remplacé, titres et bouton visibles, script retiré et image distante remplacée par un emplacement sans chargement.
3. Rechargement complet : modèle version 2 retrouvé avec les quatre blocs dans le bon ordre. Les douze commandes d’ajout sont présentes. Les douze types ensemble ont été enregistrés/testés par HTTP ; ils n’ont pas tous fait l’objet d’une saisie manuelle exhaustive dans le navigateur.
4. Création d’un scénario manuel avec condition de consentement, deux destinations distinctes, deux consignes d’appel et fin explicite des deux chemins. Enregistrement, publication, activation locale et inscription du contact fictif.
5. Deux passages manuels du moteur : historique « Condition : Oui. Suite vers l’étape 2 », puis « Tâche ajoutée aux Activités du commercial assigné ». Parcours terminé ; chemin Non non exécuté. Le chemin Non est vérifié par Rust et HTTP, avec redémarrage.

Le contrôle navigateur du lot précédent, initialement bloqué, a donc pu reprendre. L’essai du sélecteur de fichier image a expiré et perdu sa continuation ; l’import de fichier via le navigateur reste à rejouer. La validation positive d’un PNG intégré et sa persistance/rendu sont prouvées côté HTTP, pas par ce sélecteur. L’image du parcours manuel utilise une adresse fictive, sans accès externe.

## Formats et captures

- Ordinateur 1440×1000 : [éditeur à douze blocs](evidence/lead-scenarios/email-editeur-12-blocs.jpg) et [aperçu assaini](evidence/lead-scenarios/email-blocs-ordinateur.jpg).
- Mobile 390×844 : largeur du document 383, aucun débordement horizontal observé ; dernier texte d’aide bas 666,5 et bandeau haut 781. [Capture du bas de page](evidence/lead-scenarios/email-blocs-mobile.jpg).
- Tablette 768×1024 : largeur document 761 ; historique bas 814,5, bandeau haut 961. [Destinations dans l’éditeur](evidence/lead-scenarios/branches-editeur-tablette.jpg) et [parcours terminé](evidence/lead-scenarios/branches-tablette.jpg).

Ce sont des formats de navigateur simulés, pas une certification d’appareils physiques. Les dimensions habituelles ont été rétablies après contrôle. Les captures ne contiennent que les données fictives de recette.

## Décision

Validé sur les parcours serveur/domaine et navigateur exécutés, avec limites de recette explicites. Pas de déclaration de parité exhaustive de Lead : propriétés non observées chez le fournisseur, import via sélecteur de fichier, clients email réels, fournisseurs et matériel restent non validés. Aucun email, SMS ou WhatsApp envoyé ; aucun Heitz ni portillon sollicité. Voir `lead-email-blocs-branches.md` pour les limites fonctionnelles et les précautions de retour à une ancienne version.
