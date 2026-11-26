# RH — publics de communication, club actif et recontrôle visuel

26 novembre 2026. Branche `feat/hr-audiences-and-club-context`, base PR #87 / 8a4572f. Développement séparé, aucun changement de main, de la version publique ou de Heitz.

## Échange avec l’autre IA

La PR #87 a reçu un commentaire de contrôle automatique de pinto1230766 : 185 tests Rust et 165 tests TypeScript réussis. Ce commentaire précise que ses recettes Python n’ont pas été exécutées et qu’il ne réalise ni fusion ni relecture finale. À la vérification de ce lot : PR toujours ouverte, tableau des reviews vide. Ne pas assimiler ce contrôle à une approbation finale.

Réservation du nouveau périmètre publiée sur #21 : communication RH, métadonnées d’équipes/dossiers, préférence de club et leurs tests.

## Défaut observé et corrigé

**Avant :** Mario choisit Beynost, publie un message, recharge la page ; le sélecteur revient sur Carré de Soie et l’historique paraît vide, car il consulte désormais un autre club.

**Après :** dernier club mémorisé par compte sur ce navigateur. La sélection est résolue contre les clubs actuellement autorisés avant d’être fournie aux modules. Un compte mono-club ne récupère pas la sélection d’un autre compte ; un ancien choix devenu interdit est ignoré. La mémorisation est facultative : blocage du stockage navigateur traité sans empêcher la navigation. Aucun droit nouveau n’est accordé par cette préférence, les API gardent leurs contrôles.

Le choix n’est pas synchronisé entre appareils ; aucune nouvelle préférence serveur n’est prétendue.

## Fonctions ajoutées

Dans **Collaborateurs et RH → Communication RH** :
- Filtre par équipe du club choisi, combinable avec recherche et dossiers RH à compléter/vérifier.
- Équipes et état général de dossier issus du serveur pour les seuls destinataires autorisés. Aucune équipe d’un autre club dans les métadonnées retournées.
- « Ajouter les résultats » conserve la sélection ; « Utiliser uniquement ces résultats » la remplace explicitement.
- Avertissement si certains destinataires retenus sont masqués par les nouveaux filtres.
- Liste dépliable de tous les destinataires retenus, avec retrait individuel.
- Les filtres constituent une aide à une **sélection explicite**, pas un abonnement dynamique à un groupe. Le serveur recontrôle les droits sur chaque destinataire au moment de publier.
- Le raccourci textuel est corrigé : **Mon compte → Ma journée → Mes notifications**, en accord avec la navigation réelle.

« Dossiers à compléter ou vérifier » reprend le critère existant du suivi RH : état différent de `complete`. Aucun motif, document ou détail médical n’est renvoyé pour cette sélection.

## Parcours réellement exécutés dans le navigateur

Le navigateur est à nouveau opérationnel. Le blocage indiqué dans le rapport initial de #87 est levé pour les contrôles suivants.

### Base #87, copie fictive 52120

1. Ordinateur : Mario choisit Beynost et publie un message interne fictif pour Chloé.
2. Mobile **390 × 844** : connexion Chloé, Mon compte, notification reçue avec Mario comme expéditeur ; elle marque le message comme lu.
3. Tablette **768 × 1024** : retour Mario/Beynost, lecture « 1 sur 1 » et première date affichées dans l’historique.
4. Chloé mobile : création du lien calendrier, téléchargement réel du fichier `mon-planning-cfitness.ics`, révocation ; le lien et le bouton de révocation disparaissent, « Lien révoqué » apparaît.
5. Tablette : désactivation dans les préférences, enregistrement confirmé ; clubs et création de lien désactivés. La création est aussi bloquée lorsqu’une préférence est encore non enregistrée.
6. Capture mobile au défilement maximal : dernier bouton « Voir mes documents à consulter » entièrement visible au-dessus de la navigation basse. Tablette : dernière ligne de lecture entièrement visible.

### Nouveau lot, copie fictive 54422

1. Mario choisit Beynost, recharge ; le sélecteur reste sur **beynost**, vérifié dans la valeur du contrôle.
2. Communication : choix initial de Chloé, puis filtre **Coaching Beynost + dossiers à compléter**. Un seul résultat : Thomas Girard. Chloé reste sélectionnée hors résultats et l’avertissement est affiché.
3. « Utiliser uniquement ces résultats » remplace la sélection par Thomas ; ouverture de la liste retenue : uniquement Thomas.
4. Rédaction d’un objet et message fictifs, tentative de changement vers Carré de Soie : dialogue de protection. « Continuer la rédaction » conserve Beynost, le texte et Thomas.
5. Formulaire mobile **390 × 844** : destinataire, texte et publication visibles ; pas de débordement horizontal (largeur document 383, viewport 390). Le bas de page reste dégagé.
6. Publication interne sur mobile ; passage tablette **768 × 1024** : succès, formulaire vidé et historique avec **1 destinataire**. Aucun email/SMS.
7. Retour ordinateur : déconnexion puis Sarah mono-club. Sélecteur : uniquement Carré de Soie. Retour Mario : Beynost retrouvé.

Les captures ont été visualisées dans cette conversation. Aucun fichier PNG persistant n’est annoncé dans le dossier. Les tailles temporaires ont été réinitialisées. Le fichier calendrier téléchargé contient des données de démonstration ; ce n’est pas un abonnement externe testé.

## Contrôles automatisés réellement exécutés

- `npm test` : **170 réussis**, aucun échec.
- `npm run build` : compilation TypeScript et Vite réussies.
- `cargo test --locked --quiet` : **186 réussis**, aucun échec.
- `cargo build --locked --quiet` : réussi.
- `scripts/test_hr_collaboration.py` contre le binaire final : **11 contrôles HTTP réussis**, incluant métadonnées de ciblage, droits, persistance après redémarrage, lecture, absence de doublon, flux privé/révocation/désactivation, échec disque et reprise.
- `git diff --check` : réussi.

Les scripts utilisent un dossier neuf et un environnement sans secrets fournisseur hérités. Les nouveaux tests vérifient aussi les préférences de club séparées par compte, la perte de droits, le stockage bloqué et le filtrage combiné sans élargissement de la liste autorisée.

## Éléments restant ouverts

- Le bouton de cloche dans `src/components/AdminShell.tsx` porte encore **Notifications (3)** et affiche des exemples codés en dur d’impayés, contrats et maintenance. Ce n’est pas le compteur des messages RH persistants. À remplacer par une source consolidée et autorisée, ou par des accès explicites sans faux compteur. Ce fichier n’a pas été modifié dans ce lot ; coordination demandée au développeur.
- Emails collectifs RH, pièces jointes, programmation, conversations/réponses et notifications push non développés dans ce lot.
- Abonnement réel Apple/Google/Outlook, HTTPS stable, appareils physiques, caméra et notifications natives non testés.
- Le rapport ne certifie pas toutes les rubriques Skello ni les règles de paie/acquisition encore à confirmer dans le registre général.

**Décision : validé sur les parcours et dimensions testés. Pas de parité exhaustive, pas de mise en production.**

Nouvelle copie locale : **http://127.0.0.1:54422/mon-compte**. Les copies 55211 et 52120 restent distinctes ; aucune donnée existante de ces copies n’a été remplacée.
