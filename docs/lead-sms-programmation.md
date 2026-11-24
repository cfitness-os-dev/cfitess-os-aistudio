# Programmation et annulation des campagnes SMS

24 novembre 2026 — branche `feat/lead-campaigns-persistence`, complément PR #48. Aucun envoi réel, transport fournisseur ou déploiement. Le compte Brevo utilisé par Heitz ne reçoit aucune modification de ce lot.

## Fonctionnement livré

Dans Communication → Campagnes, une campagne SMS enregistrée et non encore simulée peut recevoir une programmation. La date saisie est interprétée exclusivement en Europe/Paris, indépendamment du fuseau de l'ordinateur. Le serveur conserve cet horaire et l'instant UTC correspondant. La date doit être future, dans les 366 prochains jours. Les dates invalides et les heures inexistantes/doubles au changement d'heure sont refusées avec une explication.

La programmation fige le modèle et la révision de la campagne. Les critères de ciblage ne peuvent pas changer tant qu'elle attend : il faut annuler avant de modifier, archiver ou lancer une simulation immédiate. L'audience n'est pas figée : les fiches canoniques et leurs consentements/STOP sont recalculés à l'échéance. Le texte personnalisé est alors conservé dans le résultat. Une modification ultérieure du catalogue de modèles ne change pas le message programmé.

Une seule programmation peut attendre par campagne. Le responsable peut l'annuler avec un motif, dans son club et selon ses droits. L'état Annulée, la date, l'acteur et le motif restent dans l'historique. Une annulation ne supprime pas de préparation déjà terminée. Reprogrammer après annulation crée une nouvelle trace ; une version déjà simulée demande une nouvelle révision pour un autre lancement.

À l'échéance, les droits actuels du responsable qui a programmé sont contrôlés à nouveau. Une révocation fait échouer la simulation sans préparer de message. Le traitement et l'annulation utilisent le même verrou et la même persistance atomique : si l'exécution est déjà terminée, annuler renvoie un conflit ; si annuler gagne, l'exécution ne prépare rien. Un échec disque ne publie ni nouvel état ni préparation en mémoire.

## Exécution locale et reprise

Le traitement automatique est strictement limité à `CFITNESS_DEMO_MODE=1`. `CFITNESS_CAMPAIGNS_WORKER=0` le désactive ; sinon le traitement démo vérifie les campagnes toutes les cinq secondes, indépendamment du worker des scénarios. Le snapshot expose son activation et l'écran signale quand il est désactivé. Le bouton « Vérifier les échéances — aucun envoi » traite les échéances atteintes, via la même route authentifiée.

Un serveur arrêté ne traite aucune échéance ; les simulations en retard reprennent après redémarrage si le traitement est activé. Il n'y a pas de promesse d'exécution à la seconde ni d'expiration automatique des campagnes en retard dans ce lot. L'interface l'annonce explicitement. La reprise ne crée pas de double préparation pour une version déjà traitée.

Les statuts sont Programmée, Annulée, Simulation terminée et À vérifier. Une simulation terminée peut avoir zéro destinataire, par exemple après un STOP. Elle ne signifie jamais livraison réelle. Les programmations incohérentes restaurées ou les droits retirés passent À vérifier ; aucune relance automatique d'une erreur fonctionnelle.

## Recette exécutée

- Rust : contrôle hiver/été Europe/Paris, changement d'heure inexistant/double, fuseau étranger et date invalide.
- `scripts/test_lead_campaign_scheduling.py` : sept groupes HTTP sur le vrai serveur Rust, données fictives et dossier jetable. Droits/clubs, dates, rejeux, doubles programmations, blocage des modifications, erreurs disque lors de la programmation/annulation/exécution, annulation persistée et reprogrammation, message figé, STOP après programmation, retrait des droits, course annulation/exécution, worker réel indépendant des scénarios et deux redémarrages réels. Les échéances sont avancées dans le seul fichier de fixture, processus arrêté ; aucune horloge de production ni route permettant de forger l'heure n'est ajoutée.
- Le worker réel est lancé dans la recette avec `CFITNESS_CAMPAIGNS_WORKER=1`, les autres automatismes sont désactivés. Les préparations sont inspectées après redémarrage ; aucun fournisseur appelé.
- Chrome local `127.0.0.1:18128` : modèle SMS créé, campagne sauvegardée, programmation affichée en heure de France, formulaire de campagne verrouillé, motif saisi puis annulation historisée, nouvelle programmation proposée, vérification des échéances sans préparation supplémentaire. Le champ natif date/heure a nécessité une saisie clavier pour déclencher son événement, après le remplissage automatisé.
- Interface contrôlée aux largeurs ordinateur, tablette 768×1024 et mobile 390×844 ; largeurs document 761 et 383 px, égales à leurs largeurs de défilement. Pas de validation d'appareils physiques ou de fuseaux d'appareils réels. Capture `docs/evidence/lead-sms/annulation-mobile.jpg`.

Contrôles finaux : 122/122 tests Rust, 112/112 tests TypeScript, lint et compilation frontend/backend réussis ; 21 groupes HTTP de non-régression et 7 groupes de programmation, soit 28 groupes, tous réussis. Aucun envoi externe. Validé sur ce périmètre local testé ; transport, appareils physiques et recette globale restent non validés. Une première exécution de la suite Rust a reproduit le test de rappel J-1 instable (4 résultats au lieu de 2). Le correctif du développeur `f3e6fdc` a ensuite été intégré uniquement à cette branche, avec `b2e4df8`, puis la suite a été rejouée.

## Contrats et limites avant envoi réel

Les commandes `schedule_campaign`, `cancel_campaign_schedule`, `run_campaigns` passent par `/api/lead/scenarios/:club` avec session, droits et identifiant de commande. Les champs `schedules` des anciennes campagnes ont une valeur par défaut vide. Faire une sauvegarde avant intégration ; un retour à un ancien binaire peut perdre les nouveaux champs lors d'une écriture.

Le stockage est toujours un JSON/verrou monoprocédé. Les contraintes horaires d'envoi réel, quotas, coût, annulation d'un lot déjà accepté par le fournisseur, validation des événements entrants, supervision multi-processus et réabonnement restent à construire avec le transport. Une annulation locale n'annulerait pas à elle seule une demande externe déjà reçue : aucun transport externe n'existe ici.

La planification email n'est pas ajoutée. La propriété des messages Heitz/OS, la portée interclubs des oppositions et les accès délégués fins restent à valider. Ce lot ne prétend pas terminer la parité de tout Lead.

## Brevo : relevé en lecture seule et protection de Heitz

L'accès Chrome fourni par le client permet de consulter le compte C.Fitness. Au relevé du 24 novembre, les expéditeurs des deux clubs sont affichés Vérifié, le domaine `c.fitness` Authentifié. Brevo affiche aussi une recommandation de mise à jour de l'authentification et une balise DMARC `rua` manquante. Ce sont des indications de son interface, sans audit DNS ni conclusion de conformité. Les crédits SMS affichent zéro ; le relevé des campagnes affiche l'offre Standard. Ces informations sont datées et ne réservent aucun quota pour l'OS.

Aucune clé API/SMTP n'est lue, créée, révoquée ni copiée. Aucun expéditeur, domaine, DNS, liste, scénario, webhook, quota ou abonnement n'est modifié. Aucun test d'envoi n'est lancé. Les connexions et automatisations Heitz existantes restent à inventorier ; ce relevé ne prouve pas leurs permissions ni leur fonctionnement.

Avant raccordement, désigner un unique propriétaire par événement Heitz/OS et vérifier les exclusions ainsi que les quotas partagés. Prévoir une clé OS distincte, déposée ultérieurement dans les secrets serveur, sans réutiliser ni révoquer la clé Heitz. Toute modification de compte partagé ou de DNS demande une validation spécifique et une vérification avec le responsable Heitz. L'OS n'active aucun transport dans l'intervalle.
