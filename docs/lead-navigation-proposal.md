# Navigation Lead dans C.Fitness OS — proposition à valider

## Objectif et statut

Demande de Daniel : retrouver l’arborescence de Lead MaSalleDeSport et améliorer son ergonomie, tout en conservant les couleurs et pictogrammes C.Fitness OS. Ce document propose le rangement ; il n’annonce ni une nouvelle interface déployée ni des fonctionnalités toutes opérationnelles.

Référence : cartographie de l’audit du 17/11/2026, `public/references/lead_audit/LEAD_AUDIT_EN_COURS/01_CARTOGRAPHIE.json`, complétée par `06_RECOMMANDATIONS_UX.txt`. La cartographie source se décrit comme connue et non exhaustive. Les limites de chaque parcours doivent rester visibles dans le suivi ; sa présence dans le menu ne prouve pas son fonctionnement.

## Place dans l’OS

Entrée principale : **Prospection – Vente**. Aucun mélange avec Téléphonie, Collaborateurs et RH ou les réglages personnels. L’adhérent de référence reste dans **Adhérents – CRM** (Heitz). La rubrique Clients de Lead sert au suivi commercial et à la fidélisation, avec un lien vers ce dossier ; elle ne doit pas créer un second dossier adhérent indépendant.

Le sélecteur de club de l’OS reste unique et limité aux affectations de la personne. Le club courant est rappelé dans le module ; aucune vue consolidée ne doit être implicite. Les préférences de droits et équipes restent propres au couple collaborateur/club.

## Arborescence proposée

```text
Prospection – Vente
├── Prospects
├── Clients
├── Messagerie
├── Activités
├── Planning commercial
├── Statistiques
├── Ventes
├── Formulaires
├── Communication
│   ├── Modèles
│   ├── Campagnes
│   ├── Campagnes UTM
│   ├── Scénarios
│   ├── SMS envoyés
│   └── Emails échangés
└── Paramètres
    ├── Préférences
    ├── Crédits SMS
    ├── Profil du club
    ├── Utilisateurs et droits
    ├── Gestion des rendez-vous
    ├── Email et SMS de service
    ├── Gestion des prospects
    ├── Segments
    ├── Script de vente
    ├── Sources
    ├── Passage au statut client
    ├── Notifications
    ├── WhatsApp
    └── Connexions partenaires
```

**Rechercher un contact** reste une commande permanente de ce module, accessible depuis toutes ses rubriques. La fiche prospect, la fiche client, le détail d’une conversation, un scénario et une fiche partenaire sont des écrans enfants de leurs rubriques ; ne pas les ajouter comme rubriques principales.

Le nom **Planning commercial** précise le contexte du Planning de Lead. **Mon planning**, dans le menu principal de l’OS, reste la vue personnelle transversale ; le planning sportif reste dans **Planning cours collectifs**. Aucun rendez-vous ne doit être dupliqué pour apparaître dans plusieurs vues.

**Connexions partenaires** reprend la rubrique source « API partenaires » avec un libellé courant. WhatsApp reste à deux endroits pour deux usages distincts : conversations dans Messagerie ; compte et numéro du club dans Paramètres → WhatsApp. Les modèles WhatsApp restent dans Communication → Modèles avec accès depuis une conversation. Un raccourci ne crée pas un second réglage indépendant.

## Différences à corriger dans la démo

| Démo actuelle | Cible proposée | Raison |
| --- | --- | --- |
| Stats · Ventes · Formulaires réunis | Trois rubriques distinctes | Retrouver les repères de Lead et ne pas mélanger trois tâches |
| WhatsApp 24h comme rubrique centrale | Messagerie ; contrainte de réponse dans la conversation | Une contrainte de canal n’est pas le nom d’un espace de travail |
| Clients cachés en mode technique | Clients selon les droits métier | Le suivi commercial/fidélisation n’est pas une fonction technique |
| Communication aux fonctions mélangées | Six sous-rubriques comme dans Lead | Séparer création, automatisation et historique |
| Paramètres CRM avec textes d’audit | Paramètres avec quatorze rubriques métier | Garder les fonctions et retirer codes, routes et commentaires de développement |

L’état décrit ici provient du code et des contrôles précédents. Recontrôler la version de prévisualisation avant de classer chaque point comme encore présent ou corrigé.

## Améliorations ergonomiques proposées

1. **Navigation locale stable** : conserver le même ordre de rubriques et un titre explicite ; déplier Communication ou Paramètres au bon endroit. L’ordinateur peut afficher cette navigation dans un panneau local plutôt que dans une longue rangée de boutons. Le menu principal de l’OS garde son rôle de changement de module.
2. **Mobile et tablette** : accès « Rubriques » compact à la même arborescence, rubrique active visible, toutes les entrées accessibles au clavier et au tactile. Ne pas masquer une fonction parce que l’écran est plus petit ; les droits restent identiques. Les listes deviennent des cartes lorsque les colonnes ne sont plus lisibles.
3. **Recherche et listes** : recherche contact persistante, filtres clairs, compteur de résultats et remise à zéro. En revenant d’une fiche, retrouver recherche, filtres, tri et position de liste. Les vues enregistrées seraient une amélioration à développer, pas une capacité déjà validée.
4. **Fiche contact continue** : identité, coordonnées, responsable, prochaine action et historique bien identifiés. Depuis cette fiche : message, appel, rendez-vous, tâche ; retour prévisible à la liste. Les accès au CRM pointent vers le dossier lié.
5. **Commandes compréhensibles** : « Ajouter un prospect », « Planifier un rendez-vous », « Créer une campagne » ; icône avec nom accessible. Une action principale par écran ; les actions secondaires restent disponibles dans un menu nommé. Pas de boutons de diagnostic dans l’usage courant.
6. **États honnêtes** : distinguer vide, chargement, brouillon, enregistré, erreur, activation et envoi. Expliquer une commande grisée. Un exemple ou une intégration non raccordée doit être signalé sans annoncer un succès réel.
7. **Actions groupées** : afficher le nombre, le club et la portée de la sélection ; récapituler l’action avant un envoi ou une modification importante. Les exclusions et désabonnements restent explicites.
8. **Paramètres cohérents** : une seule source par réglage partagé, sauvegarde explicite, confirmation serveur et brouillon préservé sur erreur. Un même réglage visible dans deux parcours a le même état.
9. **Lisibilité** : conserver la palette, les pictogrammes et le fond sombre appréciés ; travailler les espacements, longueurs de libellés, contrastes et bas de page sans changer l’identité. Tester à 390, 768 et 1440 pixels et sur appareils réels avant validation finale.

## Droits à préciser et tester

- Le commercial retrouve les contacts, tâches, messages et rendez-vous autorisés de son club/équipe ; pas les indicateurs sensibles de toute l’enseigne par défaut.
- Le responsable gère le périmètre réellement attribué ; un rôle dans un club ne donne pas les mêmes droits dans l’autre automatiquement.
- Statistiques, Ventes, communication groupée et modification des paramètres ont des permissions explicites, appliquées au serveur. Les restrictions ne doivent pas dépendre d’une simple préférence du navigateur.
- La recherche, les liens directs et les actions de fiche respectent les mêmes droits que les listes. Masquer une entrée de menu ne suffit pas.
- Les détails de rôles ci-dessus sont des exigences cibles C.Fitness OS, pas une retranscription exhaustive des permissions internes de Lead.

## Validation avant restructuration

Cette proposition conserve les destinations connues de Lead et simplifie leur accès. Faire valider par Daniel : l’ordre des rubriques, la présence de Clients pour le suivi commercial, le nom Planning commercial et le rangement des communications. Les noms de sous-rubriques peuvent ensuite être simplifiés sans changer leur sens ni perdre une fonction.

La matrice `lead-navigation-source-map.json` relie chaque route de la cartographie connue à une destination cible. Il s’agit de correspondances fonctionnelles proposées, pas de routes déjà implémentées ni de nouvelles API découvertes. Les liens vers les autres produits MaSalleDeSport/ClubConnect y sont identifiés séparément.

Avant développement global : fournir une prévisualisation isolée avec le même rangement sur ordinateur/mobile/tablette et les différences de droits. Avant recette fonctionnelle : relier chaque option de l’inventaire à son écran et préciser « fonctionnel / partiel / à développer / non vérifié », sans confondre présence du bouton et résultat métier.
