# Scénarios Lead — éditeur et moteur local de recette

État complété par le troisième lot : [éditeur à 12 blocs et branches conditionnelles](lead-email-blocs-branches.md), [recette et captures](lead-email-blocs-branches-recette.md). Les rapports des premier/deuxième lots conservent leurs limites historiques ; le présent lien décrit ce qui a été ajouté depuis.

## Périmètre livré

Prospection – Vente → Communication → Scénarios : liste filtrable, recherche, brouillon complet, mode automatique ou manuel, ciblage par statut/source/commercial, étapes ordonnées et activables, délais minutes/heures/jours, messages et consignes, publication versionnée, activation, verrouillage des nouvelles inscriptions, archivage, copie interclub inactive, inscription manuelle, progression et arrêt motivé.

Référence : issue #21 commentaire 7085571773 et inventaire Lead-0460..0487, 1299..1345, 1526..1543. La logique familière de Lead est conservée. Versions immuables, conflits de révision, identifiants d'opération et traces détaillées sont des choix C.Fitness OS pour fiabiliser les usages ; ils ne prouvent pas une parité exhaustive avec Lead.

## Règles métier

- Une publication fige les étapes. Les contacts engagés gardent leur version même si le brouillon change.
- Actif et inscriptions verrouillées sont indépendants : désactiver suspend ; verrouiller ou archiver interdit de nouveaux entrants et laisse finir les parcours actifs.
- Automatique : statut ET source ET éventuelle affectation commerciale. Sources vides = toutes les sources du club ; au moins un statut requis. Une inscription par scénario/contact, sans réentrée dans cette version.
- Manuel : sélection explicite d'un contact du club dans un scénario publié, actif et déverrouillé.
- Une tâche crée une activité canonique pour le commercial actif affecté dans le club. Sans commercial admissible, l'étape est exclue avec explication.
- Délais relatifs à l'inscription puis à l'exécution effective précédente. Une seule étape par parcours et passage du moteur.
- Contact archivé/supprimé : arrêt. Auteur de publication devenu non habilité : suspension. Curseur restauré incohérent : arrêt tracé sans tâche.
- Email/SMS : consentement et coordonnées contrôlés à l'exécution, puis résultat simulé. WhatsApp reste exclu tant que compte, modèle et fenêtre propres au canal ne sont pas vérifiés.
- Une copie conserve les références de ciblage et exige leur correction dans le club destinataire avant publication, sans élargissement silencieux.

## Frontend et API

`leadScenarioDefinitions.ts` valide une définition complète. `leadScenariosApi.ts` exige une session correspondant à l'acteur et une réponse correspondant au club. `LeadScenariosView.tsx` conserve la saisie sur erreur et rejette les réponses tardives d'un autre contexte. Les Activités sont relues après vérification ; leur échec de relecture n'annule pas une commande déjà confirmée.

| Route Rust raccordée | Usage |
|---|---|
| GET /api/lead/scenarios/:club | Catalogue autorisé, scénarios, contacts et historique |
| POST /api/lead/scenarios/:club | save, publish, status, archive, copy, enroll, stop ou run |

Les commandes exigent Bearer et `x-cfitness-operation-id`. Même commande/même identifiant : aucun effet doublé. Autre contenu/même identifiant : 409. Une révision périmée retourne 409. La copie contrôle également le club destinataire.

Autorisation actuelle : salarié actif avec profil de gestion de site dans le club (administrateur système, master avancé ou planificateur avancé avec portée sites). Un manager limité à une équipe et un commercial ne gèrent pas les scénarios du club. Les délégations spécifiques restent à ajouter.

`lead_scenarios.rs` isole son état sous `lead_scenarios`, vide par défaut pour les anciens fichiers. Il clone l'état sous le verrou partagé, écrit par le mécanisme atomique existant puis publie la mémoire. Échec disque : erreur, état confirmé conservé. Le worker tourne toutes les cinq secondes en démonstration sauf `CFITNESS_SCENARIOS_WORKER=0`. Aucun appel réseau fournisseur dans ce module. Activation et exécution hors démonstration refusées.

## Bornes et limites explicites

100 étapes, nom 120 caractères, commentaire 2000, contenu 20000, délai entier 0..525600 par unité : limites proposées C.Fitness OS, non présentées comme des limites Lead. Le brouillon doit être complet pour être enregistré ; aucune sauvegarde automatique de saisie incomplète.

Les jours et plages horaires sont ajoutés par le [complément horaires](lead-scenarios-horaires.md), avec les limites de ce calendrier. Restent non livrés : connecteurs réels et leurs accusés/réessais, réentrée configurable, délégations fines, purge historique/reçus d'opération. L’éditeur dispose maintenant des douze types de blocs et le moteur de branches sans boucle. Les propriétés Lead non observées et les clients email réels restent à valider. La persistance JSON et le verrou concernent un seul processus ; aucune garantie distribuée.

## Modèles et options avancées — deuxième lot, complété par le troisième

L’onglet Modèles de messages remplace le constructeur local à un seul brouillon par un catalogue serveur par club. Email, SMS et WhatsApp disposent d’un nom, canal et contenu ; objet requis pour un modèle email. Recherche et filtre canal, création, édition avec révision, duplication locale préparatoire, copie interclub, archivage et inclusion des archives. Le canal d’un modèle existant ne change pas. Aucune approbation Meta ne peut être déclarée depuis cet écran.

Un email propose soit la présentation simple titre/corps/bouton/pied/police, soit le document à douze types de blocs avec propriétés et aperçu serveur isolé. La publication fige le sujet, le document et sa version texte. La simulation conserve un HTML assaini sans chargement distant ni lien actif ; les futurs adaptateurs d’envoi devront préserver cette immutabilité et être testés dans les clients email réels. Voir le contrat du troisième lot pour import d’image, HTML et désabonnement.

Chaque étape de message choisit un modèle du bon canal ou un contenu libre. La publication copie son contenu dans la version : modification/archivage du modèle ne change pas les parcours publiés. Une copie de scénario vers un autre club conserve ses références ; le responsable doit choisir un modèle du club destinataire (les modèles disposent de leur propre commande Copier). Aucune référence étrangère n’est acceptée pour publier.

Variables proposées : `%prenom%`, `%nom%`, `%club%`, `%telephone-club%`, `%adresse-club%`, `%url-rdv-club%`, `%url-club%`, `%prenom-commercial%`, `%rdv-date%`, `%rdv-heure%`, `%date%`, `%heure%`, `%prix%`. Le moteur utilise uniquement prénom/nom du contact, club/adresse canonique et prénom du commercial actif habilité au club. Les autres variables sont configurables dans le texte mais restent indisponibles à l’exécution tant que leur contexte officiel n’est pas raccordé ; elles font exclure le message avec un motif, sans valeur fictive ou supposée. L’aperçu emploie explicitement des exemples fictifs pour toutes les variables. Remplacement en un seul passage ; variables inconnues refusées, pourcentages littéraux conservés.

L’historique des simulations email/SMS conserve le sujet et contenu réellement résolus. Une valeur absente ou un objet contenant un retour à la ligne après résolution exclut le message. Aucun résultat simulé n’est présenté comme un envoi fournisseur.

L’estimation SMS calcule GSM-7 (160, puis 153 unités par segment), extension à deux unités et Unicode UTF-16 (70, puis 67). Ce choix OS n’est pas une reproduction du compteur historique Lead à 159 caractères/crédit ; les tags remplacés et la tarification réelle du fournisseur restent déterminants.

WhatsApp : modèle ou Message direct, et conversation fermée → ne pas envoyer / modèle WhatsApp de repli / SMS de repli explicitement saisi. Ces paramètres sont validés et persistés, mais aucune branche WhatsApp/repli n’est exécutée tant que compte, modèle approuvé, destinataire et fenêtre propre à WhatsApp ne sont pas vérifiés. Le générique `lastInboundReplyAt` ne sert jamais à inventer une conversation WhatsApp ouverte. Le SMS de repli explicite est un choix OS : son contenu exact n’était pas établi dans l’audit Lead-1323..1333.

Améliorations OS optionnelles : arrêt des étapes restantes après une nouvelle réponse entrante (date postérieure à l’inscription), atteinte d’un statut choisi, ou sortie du ciblage d’un scénario automatique. Arrêt tracé avant la prochaine échéance, lors du passage moteur, sans supprimer les tâches déjà créées. Les réglages sont figés dans chaque version ; aucun de ces ajouts n’est présenté comme une règle Lead exécutée et vérifiée. Une seule inscription par contact/scénario reste la règle.

Commandes supplémentaires sur la même route protégée : `save_template`, `archive_template`, `copy_template`. Même verrou, persistance atomique, contrôle du club et identifiant de rejeu que les scénarios. Les anciennes données se chargent avec un catalogue vide et des options nulles par défaut. Le client ne met pas à jour la révision de base d’une saisie non enregistrée à la simple actualisation : une édition concurrente reste détectée.

Sources : Lead-1301..1306 (conditions), 1313..1345 (étapes, modèles, délais, WhatsApp, SMS), 0209..0220 et 1517 (variables). Leurs limites d’observation restent celles de l’inventaire initial. Rapport complémentaire : `lead-modeles-options-recette.md`.

Les messages ne sont jamais envoyés. L'interface le précise et conserve l'état de recette. Ne pas activer en production avant raccordement, tests et validation des connecteurs.

## Recette reproductible

Contrôles : `npm run lint`, `npm test`, `npm run build`, `cargo test --locked`.

`scripts/test_lead_scenarios.py` démarre un vrai serveur Rust sur boucle locale et stockage temporaire. Définir `CFITNESS_TEST_BINARY` et les secrets fictifs via `CFITNESS_TEST_ADMIN_SECRET` / `CFITNESS_TEST_COMMERCIAL_SECRET` ; aucun secret commité. Il teste authentification, refus de rôle, commandes concurrentes/rejouées, révisions, inscription, redémarrage réel, tâche unique, cloisonnement et échec disque. Sa fixture est modifiée uniquement dans son répertoire temporaire pendant l'arrêt serveur.

Voir `lead-scenarios-recette.md` pour les résultats et limites observés.

Complément du 24 novembre : [inscription et suivi depuis la fiche prospect](lead-fiche-scenarios.md), avec les droits et limites de recette explicités.
