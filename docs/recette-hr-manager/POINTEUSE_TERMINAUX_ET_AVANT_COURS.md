# Pointeuse : appareils autorisés, droits personnels et présence avant cours

Exigence de Daniel du 22 novembre 2026. Spécification de développement à intégrer à la RH, au planning sportif et aux procédures du club. **Fonctionnement cible, pas fonctionnalité déjà livrée.**

## Besoin métier

Le responsable doit choisir les modes autorisés pour chaque collaborateur dans chaque club : badgeage sur une tablette/appareil précis et/ou badgeage depuis son compte personnel avec un droit explicite. Pour un cours collectif, la règle peut imposer au coach affecté de confirmer sa présence sur la tablette de la salle où le cours est prévu, afin de déclencher et tracer les procédures d'avant-cours.

La règle de présence dans la salle s'applique même si ce coach possède par ailleurs le droit de pointer ses heures depuis Mon compte. La consultation de son historique personnel reste possible lorsque le pointage personnel n'est pas autorisé.

## Deux événements distincts

1. **Pointage RH** : arrivée, pause, reprise, départ. Alimenter la même source serveur que les parcours personnels/responsables, sans doublon de tables. Conserver les transitions de #32 et les heures d'origine.
2. **Présence avant une séance** : confirmation rattachée à une occurrence précise de cours, au coach affecté, au club, à la salle et à l'appareil. Elle ne crée pas une seconde arrivée RH si le service est déjà ouvert et ne compte pas comme un deuxième temps travaillé.

Si une première prise de service doit aussi être enregistrée depuis la tablette de salle, proposer cette action explicitement selon la politique RH ; ne pas transformer silencieusement une checklist en pointage ou en correction de paie. Les deux événements sont reliés, mais restent identifiables séparément.

## Réglages et rangement

**Collaborateurs et RH → Paramètres RH → Pointeuse et appareils** : registre des appareils par club/salle, état actif/révoqué, modes autorisés, délégations de gestion et historique des changements. Une tablette fixe ne peut pas librement changer de club avec le bouton actuel du prototype.

**Collaborateurs et RH → Fiche du collaborateur → Droits par club → Pointage** : droit distinct « Pointer depuis mon compte », et droit d'utiliser les terminaux autorisés. Ne pas assimiler ORG04-35 (voir la badgeuse) ou ORG04-36 (modifier/revoir) au droit de pointer à distance. Les droits de configuration, de consultation, de décision d'exception et de pointage sont séparés. Prévoir une politique par défaut au club et un réglage explicite par collaborateur, avec audit.

En production, absence de droit personnel explicite = refus du pointage personnel côté serveur. La migration des comptes existants doit être explicite, relue et tracée ; aucun administrateur ou manager ne reçoit implicitement une dispense pour ses propres pointages.

**Planning cours collectifs → occurrence du cours → Préparation et présence** : salle prévue, coach réel affecté/remplaçant, terminal(s) autorisé(s), exigence locale obligatoire ou facultative, fenêtre de confirmation et checklist applicable. L'association doit être faite à l'occurrence exacte, jamais au seul libellé « BodyPump ».

**Mon compte → Mes pointages** : situation de service, action personnelle seulement si autorisée, sinon message « Utilisez la pointeuse de [emplacement] ». Historique toujours borné à soi et aux clubs autorisés.

**Mon planning → cours affecté** : heure, salle, procédure attendue et état de préparation. Consulter depuis son téléphone ne valide pas la présence locale si la tablette de salle est obligatoire.

## Parcours cible : BodyPump

Exemple illustratif, sans valeur de créneau imposée : une séance BodyPump est prévue à 18 h dans la salle cours collectifs de Beynost, avec un coach identifié.

1. La tablette enregistrée dans cette salle présente les séances pertinentes selon sa propre association serveur au lieu, sans sélecteur libre d'un autre club/salle.
2. Le coach s'identifie individuellement par le moyen approuvé (PIN/badge/compte ; contrôle et limitation des tentatives au serveur). Le terminal ne lui montre pas les dossiers RH des autres collaborateurs.
3. Le serveur vérifie appareil actif, club/salle, coach affecté ou remplacement autorisé, occurrence non annulée et fenêtre de préparation configurée. Une identité de terminal ou de coach déclarée librement par le navigateur ne suffit pas.
4. Le coach confirme sa présence pour cette séance. Le serveur horodate l'événement et fournit un accusé d'enregistrement.
5. La checklist d'avant-cours s'ouvre : exemples à adapter par cours, vérification de la salle, matériel, musique et conditions d'accueil. Les items et leur version sont enregistrés ; pas de validation globale automatique au seul badgeage.
6. Le responsable voit séparément « présence confirmée », « préparation incomplète/complète », retard, absence de confirmation et éventuelle exception. Une déclaration de checklist reste une déclaration du coach ; elle ne prouve pas à elle seule l'exécution matérielle des contrôles.

Fenêtre avant cours et seuil de retard configurables. Ne pas figer une durée arbitraire. Préparer un événement d'alerte avec destinataires autorisés du club ; ne pas brancher d'envois réels pendant la recette.

## Priorité des règles

| Action | Conditions obligatoires |
| --- | --- |
| Pointage depuis Mon compte | Session du salarié, affectation au club, droit personnel explicite, transition RH valide |
| Pointage RH sur terminal | Terminal enregistré et actif dans ce club, identification du salarié, affectation et autorisation, transition RH valide |
| Présence cours avec terminal de salle imposé | Terminal lié à la salle de l'occurrence + coach affecté/remplaçant autorisé + fenêtre valide ; le droit personnel ne lève pas ces obligations |
| Checklist de cette présence | Présence locale requise acquittée, items/version de cette occurrence, droits et ordre des étapes |
| Exception | Autre responsable habilité sur le club/périmètre, motif obligatoire et audit ; jamais de réécriture discrète du pointage initial |

## Socle technique attendu

Un moteur serveur commun évalue mode, salarié, club et action. Appliquer la politique à toutes les routes d'écriture, y compris kiosque, Mon compte, compatibilité et future synchronisation hors ligne ; masquer un bouton ne suffit pas.

Objets proposés (contrats à implémenter, non existants à ce stade) :

- `ClockingPolicy` : modes autorisés par collaborateur/club, version et historique ; consultation personnelle distincte de mutation.
- `RegisteredTerminal` : identifiant stable, club, salle/emplacement, capacités, actif/révoqué, association et informations de dernière connexion. Moyen d'authentification propre, révocable et non exposé dans le bundle public.
- `ClassOccurrence` : identifiant stable, source d'origine et identifiant externe éventuel, club, salle, créneau, coach(s)/remplaçants, état et politique de préparation. Ne pas dupliquer les cours d'une intégration Mywellness/Heitz ; leur autorité et leurs API restent à vérifier.
- `CoursePresence` : occurrence, salarié, terminal et emplacement vérifié au serveur, date de réception/horodatage serveur, méthode, version de politique, statut normal/exception, référence éventuelle du pointage RH et clé d'idempotence.
- `PreparationSubmission` : présence/occurrence, version de checklist, réponses par item, horodatages, auteur et état. Requêtes répétées ne doivent pas créer deux confirmations.

Ne pas considérer un `deviceId`, `roomId` ou une adresse IP envoyés par le client comme une preuve suffisante. La salle autorisée vient du registre serveur, la séance du planning validé, et l'identité coach de son authentification. Limiter les informations exposées au mode kiosque ; pas de liste de PIN ni de secrets de salariés dans le frontend de production.

Un terminal fixe géré/verrouillé et une authentification d'appareil offrent une assurance opérationnelle du point de badgeage. Ils ne garantissent pas absolument que la bonne personne est physiquement présente : partage de PIN, déplacement de tablette ou copie d'accès restent des limites à traiter dans le choix matériel et l'administration des appareils. Pas de promesse de géolocalisation parfaite ; Wi-Fi/GPS seuls ne suffisent pas. Aucun recours à biométrie/photo ajouté par défaut.

Le matériel exact (tablette Android, iPad, borne dédiée ou lecteur) et le stockage sécurisé de son authentification seront choisis au lot d'appairage. Ne pas inventer un secret fixe dans localStorage comme preuve matérielle. L'inscription ou révocation d'un appareil est réservée aux responsables habilités et auditée.

## Incidents et exceptions

- Panne/réseau indisponible : message visible, aucune fausse confirmation « présence validée » ; un événement hors ligne éventuel reste « en attente de synchronisation » et ne vaut pas preuve locale serveur acquittée.
- Une tablette hors service ne doit pas empêcher de tracer le travail réellement effectué : proposer une déclaration d'incident et une régularisation motivée par une personne habilitée. Ne pas substituer un pointage personnel non autorisé.
- Retard, cours déplacé, remplacement ou changement de salle : relire la dernière occurrence et ses affectations, conserver l'historique ; toute dérogation est explicite.
- Rejeu, double clic, synchronisation et modification concurrente : idempotence côté serveur, révision de politique/séance, refus des appareils révoqués. Ne pas recopier un acquittement d'une autre séance.
- Un défaut de confirmation produit une anomalie de procédure ; pas de sanction, absence RH ou déduction de paie automatique.

## Critères de recette bloquants

1. Salarié sans droit personnel : POST direct depuis Mon compte refusé même avec session valide ; historique consultable.
2. Salarié autorisé dans un seul club : refus dans l'autre ; droits différents testés pour un salarié multi-clubs.
3. Faux identifiant d'appareil, terminal non enregistré/révoqué et mauvaise salle : refus serveur sans modification ni faux succès.
4. BodyPump salle A : badgeage sur tablette salle B refusé pour la présence cours, même si le coach peut pointer personnellement ses heures.
5. Coach non affecté, remplacement non validé, occurrence annulée/déplacée ou hors fenêtre : traitement explicite selon politique ; aucune validation silencieuse.
6. Coach déjà en service : présence avant cours sans deuxième arrivée ni double comptage RH.
7. Présence enregistrée et checklist incomplète : états distincts visibles au responsable et au coach. Checklist terminée avec réponses et version conservées.
8. Même clé rejouée : un seul événement ; autre séance ou autre coach ne récupère pas cette validation.
9. Panne de sauvegarde, redémarrage et reconnexion : pas de succès non persistant, historique et états cohérents dans les deux vues.
10. Révocation terminal/droit pendant la séance, exception et panne : contrôle serveur et audit complets ; aucun contournement par une route parallèle.
11. Interfaces tablette fixe, mobile personnel et responsable sur ordinateur/tablette ; bouton final visible, retour automatique au kiosque sans fuite de la session du coach précédent.

## État du code observé et découpage des lots

Base examinée : main `f7ad853` (PR #32 approuvée/fusionnée sans déploiement). `personal_workspace.rs` contrôle aujourd'hui la session, le club et les transitions, mais n'ajoute pas encore le droit explicite de pointage personnel demandé ici. `KioskTabletShell.tsx` appelle `punchWithPin` de `CfosContext.tsx` : validation du PIN et écriture dans l'état navigateur, source `tablette_pin`, club modifiable et horodatage client. Ce prototype n'est pas le moteur serveur partagé, ni un terminal enregistré/probant. `UnifiedPlanningEvent` contient `locationLabel`, mais ce libellé n'est pas un identifiant sécurisé de salle ou d'occurrence serveur.

1. **Priorité 0 — politique de pointage serveur** : droits par salarié/club, refus explicite sans droit personnel, même moteur d'historique et transition pour toutes les écritures, recette API. Prévoir une migration contrôlée des comptes de démo/production.
2. **Priorité 1 — terminal authentifié** : registre, inscription/révocation, club/salle attachés côté serveur, kiosque relié à la source canonique et identification individuelle.
3. **Priorité 2 — occurrence sportive et préparation** : identification fiable de la séance et du coach, présence locale distincte du temps RH, checklist et tableau responsable.
4. **Priorité 3 — résilience/matériel** : idempotence, exceptions et hors ligne, essais sur les appareils réellement retenus.

Cette spécification ne certifie aucune de ces fonctions comme déjà implémentée. Toute livraison doit préciser commits, routes, droits, preuves et limites. Aucun déploiement ni changement de droits des comptes réels n'est autorisé par ce document.

## Complément demandé par Daniel : photo au moment du badgeage

La badgeuse doit pouvoir capturer une photo lors du pointage, afin qu'une personne habilitée vérifie visuellement le collaborateur et le contexte de badgeage, selon l'habitude que Daniel décrit dans Skello. **Exigence de développement, pas capture déjà opérationnelle dans P0.**

- Réglage photo par club/appareil : désactivée, facultative ou obligatoire selon la politique retenue. Pour Mon compte, si le pointage personnel est autorisé, appliquer le réglage propre à ce mode ; la photo personnelle ne dispense pas d'un terminal de salle imposé pour le cours.
- Capture ponctuelle de la caméra pendant l'action, avec aperçu et information claire au salarié ; aucune vidéo ou surveillance continue nécessaire. Contrôle visuel humain, sans ajouter implicitement une reconnaissance faciale.
- Lier côté serveur photo et événement exact : salarié authentifié, terminal autorisé et salle vérifiée lorsqu'il est utilisé, occurrence de cours éventuelle, heure serveur, version de politique et identifiant de tentative. Un nom de fichier ou un employeeId librement déclaré ne prouve pas ce lien.
- Le parcours propose une capture caméra et non une sélection d'ancienne photo comme preuve instantanée. Cela améliore la traçabilité sans garantir à lui seul l'identité physique : ne pas déclarer une image incontestablement « prise en direct » à partir du seul horodatage client.
- Si obligatoire, une photo absente, refusée ou non liée ne doit pas produire le statut normal « pointage confirmé avec photo ». Définir un acquittement cohérent entre stockage privé de la photo et événement ; rejouer une tentative ne doit pas associer la photo à un autre salarié/cours.
- Panne caméra, refus de permission, réseau indisponible ou échec du stockage : message et statut explicites, possibilité de déclarer un incident et de régulariser avec motif et audit par une personne habilitée. Ne pas effacer une déclaration de travail ni inventer une heure normale en silence.
- Photos en stockage privé, accès authentifié et borné aux responsables habilités du bon club. Définir séparément le droit de consulter la photo ; le droit de pointer ou de voir ses horaires ne donne pas accès aux photos des collègues. Pas d'URL publique permanente, d'image/base64 dans l'audit textuel, les logs, le dépôt ou les tickets.
- Prévoir une durée de conservation configurable, l'application effective de la suppression et le traitement des copies/sauvegardes ; tracer les consultations et suppressions selon le dispositif retenu. Une photo supprimée ne doit pas faire disparaître l'événement RH ; son état de conservation reste identifiable.
- Dans la vue responsable, montrer le lien de consultation autorisé et l'état « photo reçue / indisponible / exception / supprimée selon conservation ». Pour une présence cours, réutiliser le lien de preuve de l'événement concerné sans créer un deuxième pointage RH.

Recette dédiée avec images synthétiques, aucune caméra réelle activée pour la recette de P0 : mode facultatif/obligatoire ; permission caméra refusée ; absence ou mauvais lien de photo ; rejeu/ancienne tentative/autre salarié ; mauvais terminal/salle ; panne photo après clic puis reprise sans doublon ; lecture photo interdite autre club/autre collègue ; conservation et suppression effectives ; expérience tablette, mobile et incident hors ligne. Le lot P1/P2 doit fournir ces preuves avant d'annoncer la fonction terminée.
