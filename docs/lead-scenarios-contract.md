# Scénarios Lead — éditeur et moteur local de recette

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

Non livré : catalogue de modèles persistants, objet/éditeur riche d'email, substitution de variables, connecteurs réels et leurs accusés/réessais, fenêtres horaires et jours ouvrés, branches conditionnelles, réentrée configurable, inscription depuis la fiche commerciale, délégations fines, purge historique/reçus d'opération. La persistance JSON et le verrou concernent un seul processus ; aucune garantie distribuée.

Les messages ne sont jamais envoyés. L'interface le précise et conserve l'état de recette. Ne pas activer en production avant raccordement, tests et validation des connecteurs.

## Recette reproductible

Contrôles : `npm run lint`, `npm test`, `npm run build`, `cargo test --locked`.

`scripts/test_lead_scenarios.py` démarre un vrai serveur Rust sur boucle locale et stockage temporaire. Définir `CFITNESS_TEST_BINARY` et les secrets fictifs via `CFITNESS_TEST_ADMIN_SECRET` / `CFITNESS_TEST_COMMERCIAL_SECRET` ; aucun secret commité. Il teste authentification, refus de rôle, commandes concurrentes/rejouées, révisions, inscription, redémarrage réel, tâche unique, cloisonnement et échec disque. Sa fixture est modifiée uniquement dans son répertoire temporaire pendant l'arrêt serveur.

Voir `lead-scenarios-recette.md` pour les résultats et limites observés.
