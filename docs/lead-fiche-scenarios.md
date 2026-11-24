# Scénarios depuis la fiche prospect et recontrôle #49

24 novembre 2026 — branche `feat/lead-campaigns-persistence`, PR #48. Le correctif du développeur `2fef986` a été intégré à cette branche uniquement, sans déploiement.

## Parcours ajouté

Prospection → Fiche Prospect Détaillée contient maintenant « Scénarios de ce prospect ». Le panneau charge les données canoniques du club via la route authentifiée existante, sans supposer qu'une fiche encore présente dans le navigateur existe sur le serveur. Un contact absent est signalé et aucune inscription n'est proposée. Un changement de contact/club/compte réinitialise le panneau ; les retours périmés sont annulés et ignorés.

Le responsable habilité voit les scénarios manuels publiés, actifs, non archivés et ouverts aux inscriptions du club de la fiche. Le mode de la dernière version publiée fait foi, même si le brouillon a changé. Un scénario déjà suivi par ce contact reste exclu de la liste, qu'il soit en cours, terminé ou arrêté : la réentrée configurable n'est pas ajoutée.

L'inscription est confirmée après l'accusé du serveur. Le panneau affiche le nom du scénario de la version suivie, son état, la prochaine échéance en heure de France et son historique. Texte personnalisé et aperçu email enregistré sont consultables lorsqu'ils existent. L'aperçu HTML utilise un iframe isolé, comme l'historique existant.

Un parcours en cours peut être arrêté avec un motif. L'arrêt est confirmé par le serveur, conservé dans l'historique et relu après actualisation. Les tâches déjà créées restent dans les Activités. Aucun arrêt ne supprime un message déjà préparé ; aucun message n'est réellement envoyé. Les identifiants de commande stables sont réutilisés après erreur, et les erreurs ne sont pas présentées comme des confirmations. Les motifs restent en mémoire pendant un échec de requête ; les motifs de parcours désormais arrêtés sont nettoyés après relecture.

La protection de rédaction est raccordée aux boutons de changement de vue et de contact, ainsi qu'aux changements de module/club/compte déjà couverts par le garde global. Tous les chemins de recherche/filtre, navigation native et délégation restent à recetter ; ce lot ne prétend pas les couvrir intégralement.

Les droits existants ne sont pas élargis. Le serveur exige actuellement un responsable autorisé sur le club entier pour ces commandes ; un commercial reçoit un refus et aucun catalogue/historique de scénario dans ce panneau. La délégation fine d'inscription/lecture des scénarios à un commercial reste à définir avec les permissions. Les règles métier Heitz et les contacts de son CRM ne sont pas dupliqués ni modifiés par ce panneau.

## Validation exécutée

- 132 tests Rust, 116 tests TypeScript et compilation frontend/backend réussis ; contrôle TypeScript réussi.
- 22 groupes HTTP scénarios/campagnes et 7 groupes programmation/annulation, soit 29 groupes, rejoués après intégration de `2fef986`. Le panneau réutilise leurs commandes protégées ; aucune nouvelle route d'inscription ou de contournement des droits.
- Trois tests de sélection côté client : identité canonique et club exacts, modes publiés et états indisponibles, inscription déjà existante y compris terminée/arrêtée et exclusion des parcours d'un autre contact.
- Chrome local `127.0.0.1:18130`, données fictives : création/publication/activation d'un scénario ; inscription depuis la fiche Camille ; motif saisi, tentative de retour au Kanban puis « Continuer la rédaction » conservant le motif ; arrêt, actualisation et historique ; absence de proposition de réinscription ; fiche Marc absente du serveur ne reprenant pas le parcours de Camille ; retour à Camille relisant le parcours arrêté. Connexion fictive Maxime commercial : refus serveur affiché, sans historique du responsable.
- Mobile 390×844 et tablette 768×1024 : document 383/761 px, sans débordement horizontal dans les vues observées. Vue ordinateur également consultée. Capture dans `docs/evidence/lead-prospect-scenarios/`. Aucun appareil physique ni événement fournisseur réel.

Validé sur ce périmètre local testé ; pas une recette complète du CRM ni de tout Lead. Les fenêtres de déclenchement, STOP et règles de sortie existants restent appliqués par le moteur de scénarios, sans nouvelle interprétation depuis la fiche.

## Recontrôle indépendant du ticket #49

La relecture du delta `2fef986` confirme que seule l'absence du fichier autorise une initialisation. Une erreur de lecture ou de désérialisation retourne une erreur et le démarrage quitte avec le code 1. Les migrations d'un fichier valide ne sont pas assimilées à une base illisible.

Sept tests `seed::tests` ont été rejoués avec succès, dont les quatre nouveaux du correctif. Le script indépendant `scripts/test_state_startup.py` lance le vrai binaire sur des dossiers jetables et effectue onze contrôles : initialisation/relecture valide sans changement d'octets ; JSON tronqué, octets non UTF-8 et champ inconnu dans une définition de scénario ; chemin répertoire et lien symbolique cassé. Les cas invalides sont exécutés en mode démonstration et hors démonstration. Résultat : sortie 1, octets et empreinte préservés quand il s'agit d'un fichier, chemin préservé sinon, aucun état temporaire créé. Aucun secret ni contenu de base réelle n'est copié dans la recette.

Le défaut signalé est corrigé sur les cas testés. Cela ne garantit pas qu'un ancien binaire non corrigé soit sûr : toute mise à jour et tout retour arrière demandent toujours une sauvegarde et un état compatible, conformément à `sauvegarde-et-retour-arriere.md`. Aucun essai sur la base des clubs ni activation de production.

## Travail restant

Réentrée configurable, délégations fines, supervision des relances, raccordements des fournisseurs et propriété des messages avec Heitz restent ouverts. Aucune clé/API externe, règle DNS/SMTP, liste, automatisation Brevo/Heitz, fusion main ou version en ligne n'est modifiée dans ce lot.
