# Campagnes SMS — livraison locale du 24 novembre 2026

Branche `feat/lead-campaigns-persistence`, PR #48. Ce lot complète les campagnes email sans ajouter de transport SMS, de clé, de webhook public ni d'envoi réel. Aucun déploiement n'est effectué.

## Parcours livré

Communication → Modèles de messages permet d'enregistrer un modèle SMS avec variables. Communication → Campagnes permet de choisir Email ou SMS, le modèle du club et les filtres de statuts, sources et segments canoniques. Les segments sélectionnés sont combinés par OU, puis croisés avec les autres filtres. Aucun segment sélectionné signifie tous les segments. Le canal d'une campagne enregistrée ne change pas ; créer une autre campagne pour changer de canal.

Le serveur calcule la cible avant simulation et la recalcule au lancement. Il exclut les contacts archivés, perdus, en vacances, sans consentement général, sans consentement SMS distinct, avec STOP ou numéro invalide. Deux fiches avec le même numéro normalisé n'ajoutent qu'un destinataire. Le format français 06/07, +33 et 0033 est rapproché. La validation de format ne prouve ni propriété du numéro, ni caractère mobile, ni délivrabilité internationale.

Le panneau « Consentements et refus SMS » est réservé aux essais en mode démonstration et aux responsables habilités pour ce club. Une preuve ou un motif est obligatoire. Chaque préférence est versionnée et historisée avec acteur et date. Elle s'applique au couple club/numéro, donc aux doublons de fiche. Une modification périmée est refusée. Un STOP est prioritaire et ne peut être annulé par un nouvel opt-in depuis cette commande. Le même contrôle bloque le prochain SMS automatique des scénarios. Les tâches SMS manuelles ne sont pas des envois.

La préparation conserve le texte personnalisé et son estimation GSM-7/Unicode. Les caractères étendus GSM comptent double ; Unicode est compté en unités UTF-16. Les seuils sont 160/153 et 70/67. Le contrat de neuf exemples est partagé entre Rust et TypeScript. L'estimation n'inclut aucune instruction STOP réelle, aucune transformation fournisseur ni tarification ; elle ne constitue pas un devis. `providerConnected=false` et `stopInstructionVerified=false` restent explicites.

Une révision de campagne ne peut être simulée qu'une fois, y compris après redémarrage avec une nouvelle clé de commande. Une nouvelle révision est une nouvelle simulation intentionnelle. Historique, préférences, résultats et préparations sont persistés dans la transaction JSON commune. L'échec disque annule la modification en mémoire comme sur disque. Les simulations antérieures ne sont pas réécrites par un STOP ultérieur.

Communication → Historique des échanges affiche les préparations email et SMS, permet la recherche et exporte un CSV précisant le canal et « Simulation — aucun envoi ». Il ne prétend pas afficher une livraison, une lecture ou une réponse fournisseur.

## Preuves exécutées

- Contrôles TypeScript et compilation frontend réussis ; 112 tests TypeScript et 121 tests Rust réussis.
- 21 groupes de recette HTTP sur le véritable serveur Rust, avec données fictives dans un dossier temporaire : authentification, rôles, clubs, segments, consentement distinct, doublons de téléphone, concurrence/version périmée, rejeu, arrêt/redémarrage réel et erreur disque. Les quatre groupes SMS vérifient aussi que le STOP bloque le prochain pas SMS d'un scénario et qu'une simulation SMS n'ajoute pas d'email. Si des données restaurées contiennent un modèle de canal incohérent avec la campagne, la simulation est refusée sans mutation.
- Navigateur local `127.0.0.1:18127` : création/sauvegarde d'un modèle SMS, campagne ciblant « Relance Biocircuit », zéro éligible sans opt-in ; opt-in fictif motivé puis une préparation ; historique avec prénom/club remplacés ; STOP puis zéro éligible et zéro préparation en nouvelle révision ; campagne absente à Beynost.
- Parcours observé à 1440×1000, 390×844 et 768×1024. Largeurs document mobile/tablette 383/761 px, égales aux largeurs de défilement. Émulation de dimensions uniquement : pas d'appareil physique ni d'envoi réel. Capture de l'historique mobile dans `docs/evidence/lead-sms/`.

Validé sur le périmètre local testé ; pas une validation complète de Lead ni de l'intégration fournisseur.

## Restant avant activation réelle

1. Décider du propriétaire des messages entre Heitz et l'OS. Aucune écriture ni aucun envoi Heitz/Brevo depuis ce lot.
2. Raccorder les preuves de consentement véritables, la portée des oppositions entre clubs, le réabonnement explicite et les contacts importés. Ne jamais transformer le consentement général en opt-in SMS automatique.
3. Confirmer le compte SMS Brevo, les expéditeurs, pays, crédit et règles du prestataire ; configurer la véritable instruction de désabonnement. Aucun faux numéro STOP n'est inventé.
4. Développer transport, limitation de débit, idempotence fournisseur, reprise sur panne, authentification/rejeu des événements entrants et journal des livraisons/échecs/STOP. Les signatures et contrats doivent être établis à partir de la documentation du fournisseur choisi.
5. Livraison différée/fuseau, annulation, prévisualisation individuelle, contraintes horaires, estimation tarifaire et planification des campagnes restent à construire. Le bouton actuel est une simulation immédiate explicite.
6. Recetter les délégations commerciales fines, les retours navigateur natifs, l'import d'images, les clients mail et Docker/Linux. Les tests de ce lot ne prouvent pas la complétude des formulaires, statistiques, rendez-vous ou WhatsApp.

Les champs `channel` et `segmentIds` ont des valeurs par défaut pour les anciennes campagnes ; les nouvelles listes SMS sont additives. Sauvegarder la base avant intégration. Un ancien binaire peut ignorer puis perdre les nouveaux champs lors d'une sauvegarde : ne pas faire de retour arrière sur les données nouvelles sans copie.

## Références officielles consultées

- [Brevo — nombre de caractères SMS](https://help.brevo.com/hc/fr/articles/208718649-Est-on-limit%C3%A9-par-le-nombre-de-caract%C3%A8res-dans-un-SMS) : encodage et seuils. Aucune limite maximale fournisseur ni facture n'est déduite du calcul local.
- [Brevo — restrictions par pays](https://help.brevo.com/hc/fr/articles/11884482521234-Lignes-directrices-et-restrictions-propres-%C3%A0-chaque-pays-pour-les-campagnes-SMS) : instruction STOP effective à confirmer avant émission en France.
- [Brevo — API SMS transactionnels](https://developers.brevo.com/docs/transactional-sms-endpoints) : documentation de préparation de la future intégration, aucun appel effectué.

Compatibilité : les commits du développeur 114b8a5 et f5b2df8 ont été intégrés uniquement dans cette branche. Les contrôles automatisés ont été rejoués sur cette combinaison. Les captures et manipulations SMS précèdent cette intégration ; la galerie photo RH livrée par son IA ne reçoit aucune validation visuelle dans ce lot.
