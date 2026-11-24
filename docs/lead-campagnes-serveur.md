# Campagnes Lead persistantes et protection des brouillons

Branche `feat/lead-campaigns-persistence`, basée sur `cd68196`. Lot de développement faisant suite aux tickets #46 et #47 ; #45 RH n’est pas modifié.

## Comportement livré

Les campagnes email et SMS ont un propriétaire club côté serveur et une révision. Le catalogue, la lecture, l’enregistrement, l’archivage, le calcul des destinataires et la simulation passent par la même frontière authentifiée que les scénarios. Un commercial non habilité reçoit 403 ; un modèle ou une campagne d’un autre club n’est pas utilisable. Les droits de gestion suivent actuellement les responsables autorisés sur le club entier déjà prévus dans `lead_scenarios::authorize`, pas une nouvelle interprétation du rôle visuel.

Le contenu provient du catalogue email existant. Les documents à blocs et mises en page sont réutilisés pour leur version texte ; la préparation HTML/CID vers un vrai fournisseur reste à réaliser. À chaque simulation, l’historique conserve la version de campagne, le message alors utilisé, la cible et les résultats. Modifier ensuite un modèle ne réécrit pas cet historique.

Le ciblage utilise exclusivement les contacts canoniques du club, avec filtres statut, source et segments. Sont exclus : archivés, perdus, en vacances, sans consentement, adresse invalide, adresse exclue et adresses déjà retenues. Les exclusions sont communes aux scénarios email et campagnes de l’OS pour ce club. La portée interclubs et la synchronisation Brevo restent à définir avant envoi réel ; pas de réabonnement automatique.

Le ciblage est recalculé au lancement sous le verrou serveur, pas repris d’un compteur navigateur. Une révision donnée ne peut être simulée qu’une fois, même avec une autre clé de commande après redémarrage. Une nouvelle révision est une nouvelle simulation intentionnelle. Les rejets de variables manquantes sont conservés dans le bilan, sans inventer téléphone de club, lien de désabonnement ou dates de rendez-vous.

Enregistrement, historique, file Brevo et commande idempotente sont persistés atomiquement avant confirmation. Un échec disque ne doit publier ni succès ni nouvelle file en mémoire. Le module n’ajoute aucun transport réseau ; les charges Brevo conservent leur marqueur sandbox local. Il ne certifie pas la livraison ni la déduplication avec Heitz.

## Interface et brouillons

- Communication → Campagnes : catalogue du club, formulaire nom/modèle, filtres statut/source, cible calculée après sauvegarde, motifs d’exclusion, simulation sans envoi, historique et archive.
- Les anciens brouillons de campagne de la clé navigateur globale ne sont plus lus ni affichés. Ils ne sont pas importés automatiquement : ils n’ont pas de propriétaire club fiable. Aucun effacement de stockage existant n’est effectué.
- Communication → Historique : préparations serveur du club et export CSV identifié « Simulation — aucun envoi ». Les faux journaux partagés « envoyés » du prototype ne sont plus exposés. Export protégé contre les débuts de cellule pouvant être interprétés comme des formules.
- Modèles, scénarios et campagnes signalent les changements non enregistrés. Les boutons de navigation entre rubriques, clubs, modules et comptes demandent une décision dans une fenêtre de l’application. Annuler garde la rédaction ; abandonner autorise la navigation. Un gestionnaire beforeunload couvre la fermeture/recharge du document. La navigation native retour/avance et tous les chemins techniques indirects restent à recontrôler.
- Le hub Lead écoute l’obtention d’une nouvelle session, annule les retours périmés et relance sa synchronisation. Les erreurs de connexion utilisent une formulation métier.

## Périmètre honnête et travail restant

Ce lot ne termine pas la parité exhaustive avec le logiciel Lead audité. Il rend les campagnes email cohérentes avec le socle persistant déjà développé et retire des prototypes trompeurs. Le nom de la branche ne constitue pas une déclaration de complétude du produit.

| Sujet | État / prochain contrôle |
|---|---|
| Campagnes email | Brouillons serveur, ciblage, simulation et historique livrés dans ce lot ; parcours principal contrôlé en local ; recette métier complète avant intégration |
| Campagnes SMS | Sauvegarde, segments, consentement distinct/STOP, simulation et historique livrés ; voir [la recette SMS](lead-sms-recette.md). Fournisseur et envois réels non raccordés |
| Modèles et scénarios | Socle existant réutilisé ; fenêtres horaires, réinscription et délégations fines à compléter |
| Brevo | Préparation hors ligne ; compte, clés, expéditeurs, exclusions réelles, transport, webhooks et délivrabilité non raccordés |
| WhatsApp | Modèles OS existants ; compte Meta, approbations, fenêtre 24 h et intégration réelle non validés |
| Heitz | Circuit existant conservé ; inventaire des automatismes et matrice des propriétaires d’envoi encore nécessaires |
| Formulaires, rendez-vous, UTM, statistiques, prospection et autres écrans | Ne pas déduire leur complétude des seuls tests scénarios/campagnes ; reprise du registre d’audit et recette module par module nécessaires |
| Tablettes/photos RH #45 | Réserves du dernier recontrôle inchangées ; chantier du développeur |

## Preuves et limites de recette

Les 117 tests Rust, 105 tests TypeScript et 17 groupes HTTP réels ont été exécutés pendant le lot, avec les contrôles finaux consignés dans le retour de PR. Les trois nouveaux groupes API couvrent les campagnes, leurs droits/clubs/ciblage, la persistance/échec disque et l’exclusion juste avant simulation. Aucun envoi externe.

Le premier essai de garde utilisait une confirmation native et a bloqué le navigateur. Après fermeture de cette boîte par le client, les essais UI de la fenêtre intégrée passent : annuler conserve le nom et le club, abandonner autorise le changement d’onglet, sauvegarde puis choix du modèle dans une campagne, sauvegarde/simulation/historique, absence de campagne à Beynost et refus du commercial limité à ce club. Le bandeau de connexion périmé disparaît après login. Largeurs document 383 px à 390×844 et 761 px à 768×1024, reprise ordinateur à 1440×1000. Captures dans docs/evidence/lead-campaigns/. La navigation native retour/avance, toutes les délégations, les clients mail et le sélecteur image restent non validés. Aucune caméra, tablette physique, clé ou donnée réelle utilisée. Docker/Linux non exécuté.

Sauvegarder les données avant intégration. Les champs campagnes sont additifs et chargés avec valeurs par défaut ; un retour à un ancien code peut ignorer puis perdre ces données à sa prochaine sauvegarde. Ne pas tester un ancien binaire sur une base nouvelle sans copie préalable.

Complément du 24 novembre : campagnes SMS et filtres de segments ajoutés. La recette courante passe à 119 tests Rust, 106 tests TypeScript et 21 groupes HTTP ; le détail des nouveaux parcours et des limites figure dans [lead-sms-recette.md](lead-sms-recette.md). Les comptes de recette et leurs préférences ne constituent pas une preuve de consentement utilisable en production.
