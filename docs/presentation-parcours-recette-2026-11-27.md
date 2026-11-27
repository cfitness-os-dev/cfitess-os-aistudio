# Présentation et parcours prioritaires — 27 novembre 2026

## Demande
Daniel ne peut pas aider efficacement à la recette tant que les écrans sont encombrés et les parcours peu lisibles. Cette livraison privilégie la présentation de Prospection, Mon compte et Collaborateurs et RH.

## Avant / après observés
| Écran | Avant | Après |
|---|---|---|
| Prospection, ordinateur | Deux rails latéraux ; environ 740 px de contenu sur le viewport initial de 1273 px ; indicateurs repoussent la liste | Un menu principal et une navigation contextuelle horizontale ; liste plus large ; indicateurs dépliables |
| Mon compte | Export avant les tâches ; second rail ; formulaire de tâche toujours affiché | Titre de rubrique explicite, 4 accès rapides, tâches et notifications, export en bas ; création de tâche dépliable |
| Collaborateurs et RH | Sous-menu vertical réduisant les cartes de suivi | Mêmes groupes et mêmes droits dans une barre horizontale ; suivi pleine largeur |
| Liste prospects, tablette | Tableau 7 colonnes dès 768 px | Cartes de contacts jusqu’au seuil xl ; fiche et transfert conservés |
| Messages RH | « référentiel serveur », confirmations « sur le serveur » | Texte métier ; aucune règle de calcul ou de persistance modifiée |

Les couleurs, pictogrammes, sections, callbacks de navigation, protections des brouillons et contrôles d’accès restent ceux de l’application existante. Les rubriques restreintes Lead restent identifiées et mènent à l’explication d’accès réservé ; elles ne confèrent aucun nouveau droit.

## Contrôles exécutés
- Compilation TypeScript et production réussie ; 207/207 tests TypeScript passants sur le lot.
- Backend reconstruit depuis cette branche pour la copie locale ; aucun changement Rust dans ce lot.
- Contrôle visuel réel dans le navigateur intégré : ordinateur 1440×900, tablette 768×1024, mobile 390×844, et viewport initial 1273×716.
- Navigation Mon compte → Mes compteurs, retour Collaborateurs et RH → Prospection.
- Menus Lead Communication → Scénarios et Configuration → Paramètres de prospection : écrans atteints, menu refermé après sélection.
- Menu Mon quotidien : ouverture puis Échap, fermeture et focus rendu au bouton.
- Mon compte mobile → Mes absences : formulaire accessible, bouton Envoyer ma demande intégralement au-dessus du bandeau inférieur en fin de défilement (bas du bouton 605 px ; haut du bandeau 781 px sur 390×844).
- Mobile : largeur du document 383 px, viewport 390 px sur la page absence contrôlée ; pas de débordement global observé.
- Création d’une tâche explicitement fictive dans la copie locale, confirmation puis rechargement : tâche conservée.
- Captures réellement examinées pendant la recette dans la conversation ; pas de fichiers de captures joints à cette PR.

## Copie de consultation
http://127.0.0.1:56634/mon-compte/personal

Cette adresse ne fonctionne que sur le Mac où tourne la recette. Données fictives séparées, services et workers externes désactivés, Heitz/IA externe dirigés vers une adresse locale inactive. Aucun envoi, caméra, paiement, changement dans Skello, Heitz ou la démo en ligne.

## Intégration / coordination
Base initiale a8e3905, puis intégration de main 12c1b23 qui fusionne #112 et n’ajoute que les adaptations des sous-processus de test Windows. Les réservations sont publiées sur #21. Le chantier RH justificatifs privés est conservé dans sa propre branche non validée, sans être mélangé à ce lot.

## Limites et suite prioritaire
Il s’agit d’un premier lot visible, pas d’une validation globale du logiciel ni d’une parité complète Lead/Skello.
- La connexion affiche encore du jargon de démonstration et les choix de terminaux doivent être clarifiés.
- Les formulaires et sous-écrans avancés de campagnes, scénarios, paie et organisation RH doivent encore être revus écran par écran.
- Le tableau desktop des prospects peut encore défiler horizontalement à certaines largeurs ; les cartes évitent ce problème sur tablette/mobile.
- Les accès rapides pointent vers les écrans existants ; leur présence ne certifie pas toutes leurs opérations métier.
- Les droits des autres profils n’ont pas été intégralement re-testés dans ce lot d’interface. Aucun code de politique de droits n’a changé.
- La création locale de tâche a été testée ; aucun nouveau congé n’a été créé ni validé pour ce lot de présentation.
- Aucune validation matérielle tablette/caméra ni de Safari/iOS réel ; contrôle responsive dans le navigateur intégré seulement.
- Les simulations et services non raccordés doivent rester annoncés honnêtement, avec des mots compréhensibles.
- Aucune publication en ligne ou fusion faite par Codex.
