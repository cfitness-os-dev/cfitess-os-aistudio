# Recontrôle terminaux et photo — intégrité des pointages

22 novembre 2026 — branche `fix/terminal-punch-integrity`, base main `79ed546`. #37 et #35 approuvées/fusionnées ; aucun déploiement réalisé par Codex. Recette locale ciblée sur le serveur, sans appareil physique ni caméra.

## Défauts reproduits et corrections

| Déclencheur | Avant | Après |
| --- | --- | --- |
| Appareil authentifié + employeeId sans identité individuelle | Pointage accepté au nom du salarié choisi | Bearer salarié obligatoire ; identité concordante avec la cible, même pour un administrateur |
| `photoProof` vide ou simple chaîne | `photoProofPresent:true`, sans conservation de l'image | Requête refusée en 409, sans pointage ; capacité photo explicitement indisponible |
| Premier pointage tablette sans dossier personnel persistant | Création d'un objet limité à timeEntries, collections personnelles perdues et actions suivantes impossibles | Initialisation canonique du même dossier personnel ; tâches/documents/notifications/progrès préservés |
| Consultation de la liste d'appareils | Codes d'appairage encore retournés dans la liste | Code uniquement sur création habilitée ; liste sans code ni hash du secret |

Le test des régressions a d'abord été exécuté sur le code reçu : **4 échecs reproduits sur 5 cas**. Les mêmes cas passent après correction. Les données de tests sont fictives ; aucun test d'exploitation sur la démo en ligne.

## Comportement et contrat actuels

- `POST /api/terminals/punch` exige à la fois le jeton du terminal et un Bearer valide du salarié. L'identité de session doit correspondre exactement à `employeeId`. Le compte d'une tablette partagée ne remplace pas l'identification individuelle du salarié.
- Appareil actif, club du terminal reconnu, salarié actif/affecté et droit `terminal_allowed` restent nécessaires. Un site inconnu n'est plus converti implicitement en Carré de Soie.
- Le moteur de transition vient du helper canonique `personal_workspace::punch_availability` ; pas de deuxième copie divergente du calcul des états. `personal_workspace::person` préserve le catalogue existant ou initialise toutes les collections normalement attendues.
- Gestion des terminaux : Bearer obligatoire, pas de repli démo par header déclaratif ; droit ORG04-37, cohérent avec les réglages de badgeuse. ORG04-29 seul n'accorde plus implicitement la gestion des appareils. Salle identifiée par une valeur non vide et bornée.
- Écriture sur copie, persistance avant publication et audit existants préservés ; aucune heure originale réécrite.

**Photo : pas encore une capture livrée.** Le champ reçu dans P1 ne stockait aucune image. Tant que capture, stockage privé, lien à l'événement et consultation autorisée ne sont pas implémentés, toute valeur `photoProof` (y compris vide) est refusée, pas simplement ignorée. Le pointage sans photo reste possible dans ce contrat transitoire, mais annonce `photoProofPresent:false` et `photoCaptureAvailable:false`. `whoami` annonce aussi cette indisponibilité. Il n'existe pas encore de réglage photo obligatoire effectivement raccordé ; ne pas exploiter ce parcours pour un poste où cette exigence est requise.

Les anciens éventuels indicateurs `photoProofPresent:true` enregistrés par P1 sans image ne constituent pas des preuves photo récupérables. Aucun correctif ne doit inventer une image ou certifier rétroactivement ces lignes. Leur reprise doit les identifier comme non vérifiables sans modifier les heures d'origine.

## Vérifications exécutées

- `cargo test --locked` : **97 réussis**, code 0 ; cinq cas nouveaux d'intégrité, dont refus d'identité, fausse photo, préservation du catalogue et poursuite d'action personnelle, expurgation des réponses de gestion, erreur disque, mauvais club et terminal révoqué.
- `npm test` : **66 réussis**, code 0. `npm run lint`, `npm run build` et `cargo build --locked` réussis. Avertissement d'environnement macOS concernant le cache xcrun possible ; pas d'affirmation « zéro avertissement ».
- `scripts/test_terminal_integrity.py` : **6 groupes HTTP réussis** sur serveur éphémère lié exclusivement à la boucle locale, données et comptes fictifs, scheduler coupé, aucune caméra réelle ni envoi externe.

Scénarios HTTP : création/appairage habilités et identité du terminal ; double authentification et refus d'usurpation ; rejet des fausses photos sans mutation ; pointage canonique préservant les collections et création de tâche suivante ; panne disque puis reprise sans altération de l'original ; redémarrage/nouvelles connexions et refus immédiat de l'appareil révoqué. Les jetons et codes retournés pendant ces tests ne sont ni affichés ni ajoutés au rapport.

Pas de modification d'interface dans ce lot : aucune nouvelle capture d'écran ni validation de caméra/navigateur matériel revendiquée. Le kiosque visuel doit encore être relié au contrat serveur ; son ancien stockage local reste neutralisé par P0. Les captures P0 ne sont pas utilisées comme preuve d'appairage ou de prise photo.

## Points encore non validés et répartition

1. **Appairage** : code à six chiffres encore sans délai d'expiration ni limite d'essais dans le code reçu ; durcir ce flux avant certification matérielle. Révocation et relecture sont testées ici, pas résistance exhaustive du mécanisme d'appairage.
2. **Identité sur tablette partagée** : interface de connexion individuelle, durée et liaison de session à l'opération, effacement/revocation après usage et absence de session réutilisable par le collègue suivant restent à recetter.
3. **Photos** : configuration, capture, stockage privé, validation de format/taille, accusé lié à l'événement, lecture bornée aux personnes habilitées, conservation/suppression, incidents et reprise restent à développer. Ne pas lever le refus actuel avant de disposer de ces garanties et tests.
4. **Présence avant cours #36** : sur HEAD `8793b1e`, les contrôles d'identité coach, idempotence avant vérification de périmètre, checklist déclarée par client et fenêtre temporelle restent des écarts de lecture de code. Revue avec changements demandés publiée, aucun merge ni test d'exploitation de cette branche par Codex.
5. **Résilience** : idempotence de toutes les écritures de pointage et reprise hors ligne non certifiées. Le refus d'une deuxième arrivée ne remplace pas une clé d'idempotence liant la tentative complète.
6. `terminalReady:false` des politiques P0 reste inchangé tant que le parcours complet et les appareils ne sont pas certifiés. Aucune migration de secrets ou de vieux pointages locaux vers une preuve matérielle fiable.

Réservation : https://github.com/cfitness-os-dev/cfitess-os-aistudio/issues/33#issuecomment-7081301792. Fichiers Codex : blocs pointage/authentification et réponses de gestion de `clock_terminals.rs`, deux helpers canoniques et nouveaux tests. L'autre IA conserve la capture photo dans un module distinct, le durcissement du flux d'appairage et `course_attendance.rs` après confirmation de périmètre sur #33. Aucune mise en ligne sans autorisation distincte de Daniel.

**Décision : validé sur les corrections serveur testées, validation partielle du parcours complet tablette/photo ; photo et présence avant cours non validées.**
