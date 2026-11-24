# Jours et horaires des messages de scénarios

24 novembre 2026, branche `feat/lead-campaigns-persistence`, complément PR #48.

## Comportement

Communication → Scénarios propose « Jours et horaires des messages ». Le responsable peut activer une restriction, choisir un ou plusieurs jours de lundi à dimanche et une plage horaire dans la même journée. Tout est interprété en Europe/Paris, indépendamment du poste de travail. L'ouverture est incluse ; à l'heure de fermeture, le message attend la prochaine ouverture.

Sans réglage, les scénarios existants conservent leurs délais seuls. Le réglage est facultatif, et la publication le fige dans la version utilisée par chaque contact. Changer le brouillon ou publier une autre version ne modifie pas les parcours déjà engagés.

Les étapes de messages email/SMS/WhatsApp sont reportées hors plage : le curseur n'avance pas, aucune préparation n'est créée, la prochaine échéance est persistée et l'historique explique le report en heure de France. Le passage suivant du moteur ne répète pas la trace avant la prochaine échéance. Les délais de l'étape suivante restent calculés après l'exécution effective. Les tâches manuelles et les conditions ne sont pas décalées par cette restriction.

La date est calculée avec le calendrier Europe/Paris côté serveur. Au passage à l'heure d'été, les minutes inexistantes sont sautées ; si toute la plage du jour est inexistante, la prochaine journée autorisée est utilisée. À l'heure d'hiver, le calendrier suit l'heure locale réelle et ne réexécute pas une étape déjà traitée. Les jours fériés ne sont pas exclus : aucun calendrier férié n'est intégré. Une plage passant minuit n'est pas acceptée ; une plage unique est proposée par scénario.

Les règles de sortie sont encore vérifiées pendant l'attente. À l'ouverture, les consentements, exclusions email et STOP SMS restent contrôlés par les règles normales. Le report ne constitue pas une autorisation d'envoyer. WhatsApp demeure non exécuté tant que ses conditions de canal ne sont pas raccordées.

## Contrat

`Definition.messageWindow` est facultatif ou nul : `timezone: Europe/Paris`, `weekdays: [1..7]` sans doublon ni liste vide, `startTime/endTime` strictement HH:mm avec début < fin. Une heure est comprise entre 00:00 et 23:59. Les champs inconnus sont refusés. Les treize cas du fichier `contracts/lead-message-window-cases.json` sont partagés entre les validations Rust et TypeScript.

Le moteur arrête un parcours dont la plage restaurée contient des valeurs invalides mais désérialisables, avec motif de vérification, au lieu de préparer un message hors plage. Ce contrôle ne couvre pas une base JSON structurellement illisible : le risque du chargeur global est distinct, décrit ci-dessous.

## Preuves exécutées

- 128 tests Rust et 113 tests TypeScript réussis, contrôles TypeScript et compilations frontend/backend réussis.
- Six nouveaux tests Rust : contrat partagé, bornes incluses/exclues, week-ends, hiver/été, heures inexistantes/doubles, reprise depuis le fichier persistant, absence de doublon de report, tâches indépendantes, exclusion à l'ouverture, sortie avant échéance et plage restaurée invalide.
- 22 groupes HTTP de non-régression scénarios/campagnes réussis, dont le nouveau parcours horaire via le véritable routeur : rôle refusé, validation, report sans préparation/avancement, échec disque sans faux succès, publication d'une version sans restriction et reprise après redémarrage du parcours conservant ses horaires d'origine.
- Sept groupes HTTP de programmation/annulation SMS rejoués et réussis, soit 29 groupes HTTP au total. Aucun envoi externe.
- Chrome local `127.0.0.1:18129` : création et sauvegarde d'un scénario, mercredi seul 09:00–20:00, publication/activation, inscription d'un contact fictif le mardi 24 novembre, report au mercredi 25 novembre à 09:00 et explication visible dans son historique. Contrôle des formulaires à 768×1024 et de l'historique à 390×844 : document 761/383 px sans dépassement horizontal. Vue ordinateur également consultée ; captures dans `docs/evidence/lead-scenarios-horaires/`.

Validé sur ce périmètre local testé. Le calendrier d'un appareil physique, les clients email, les connecteurs et les événements réels n'ont pas été testés.

## Origine et limites

Les fenêtres horaires figuraient dans les manques de `lead-scenarios-contract.md`. Cette implémentation est une amélioration C.Fitness OS, pas une affirmation que ce fonctionnement exact avait été observé dans Lead. Le registre initial garde ses incertitudes. La réentrée configurable, l'inscription depuis la fiche commerciale, les délégations fines et les fenêtres multiples restent à développer.

Les campagnes SMS gardent leur programmation explicite ; ce réglage concerne les messages des scénarios. Il ne constitue pas une règle légale d'envoi ni une activation de fournisseur. Aucun secret, transport, réglage Brevo/Heitz, appel à Heitz, modification de la version en ligne ou déploiement.

## Compatibilité et risque du chargeur global à traiter avant intégration

Les anciennes définitions sont chargées avec `messageWindow=null`. En revanche, les anciens binaires utilisant `deny_unknown_fields` ne reconnaissent pas le champ nouveau ; une sauvegarde et une stratégie de retour arrière sont indispensables.

Lecture de code sur le socle `b2e4df8` : `seed.rs::load_or_init_state_with_mode` traite pareil une base absente et une erreur de lecture/désérialisation d'une base existante. Après échec, il crée un état initial puis appelle `persist_state` sur le même dossier. Un fichier devenu incompatible risque donc d'être remplacé. Ce défaut préexiste au présent lot ; aucune base réelle n'a servi à le reproduire. Il est signalé au développeur dans [le ticket #49](https://github.com/cfitness-os-dev/cfitess-os-aistudio/issues/49) avec demande d'échec explicite sans écriture quand une base existante est illisible/incompatible. Aucun retour à un ancien binaire sur une base nouvelle ne doit être tenté.
