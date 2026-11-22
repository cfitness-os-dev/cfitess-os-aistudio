# Appairage : durée du code et essais limités

22 novembre 2026 — branche `fix/terminal-pairing-limits`, suite de #38 (approuvée/fusionnée sur main `0ed82ab`). Aucun déploiement par Codex ; serveur et appareils réels inchangés.

## Correction

Le code à six chiffres de P1 n'avait pas de délai effectif ni de limitation d'essais. Il expire maintenant **dix minutes après l'heure serveur de création**. Le serveur publie `pairingExpiresAt` à la création et sur les appareils encore en attente, sans republier leur code dans la liste.

Chaque code incorrect bien formé consomme un essai. Après **cinq erreurs**, l'appareil passe à `pairing_locked`, le code est supprimé et même le bon code est refusé. Le compteur `failedPairingAttempts` est stocké dans l'état du terminal, avec valeur par défaut 0 pour les anciennes données ; le redémarrage ne réinitialise pas la limite. Un appareil actif ou révoqué ne peut pas réutiliser le code.

Une date de création périmée, invalide ou dans le futur provoque un refus et l'état `pairing_expired`, avec invalidation du code sans émission de secret. L'activation et les essais refusés suivent la même règle : persistance avant publication mémoire/réponse. Une panne disque renvoie une erreur et ne confirme ni compteur enregistré ni appairage. Les audits n'enregistrent pas les codes ni les secrets.

La création d'un nouvel enregistrement par une personne habilitée permet de reprendre après blocage/expiration. Un flux ergonomique de renouvellement sur le même appareil n'est pas ajouté ici : le responsable doit voir l'état et enregistrer à nouveau l'appareil. Les horodatages proviennent du serveur, pas de l'horloge de la tablette.

## Preuves

- `cargo test --locked` : **100 tests réussis**, dont les trois nouveaux scénarios (limite persistée/relecture, expiration et dates invalides/futures, erreurs disque sur compteur et secret). `cargo build --locked` réussi.
- `npm run lint`, `npm test` (**66 réussis**) et `npm run build` réussis. Aucun nouveau composant UI.
- `scripts/test_terminal_integrity.py` : **8 groupes HTTP réussis** sur serveur éphémère local, stockage fictif dédié, aucun envoi externe ni caméra réelle. Les six groupes du lot #38 sont rejoués, puis : date limite de 600 secondes contrôlée, deux erreurs avant redémarrage et trois après conduisant au verrouillage, bon code refusé après verrouillage, code périmé refusé sans secret émis.
- Le test HTTP de l'expiration utilise une fixture d'horodatage dans l'état jetable, pendant l'arrêt de son serveur. Aucune horloge système ni donnée externe n'est modifiée. Un ajustement de parsing RFC3339 pour le Python du Mac a été nécessaire avant réussite ; pas d'échec masqué.

Codes de sortie finaux : 0. Le nombre de tests n'est pas une certification matérielle ; l'avertissement de cache xcrun propre à cet environnement reste distinct des résultats.

## Coordination et limites

Réservation sur #33 : https://github.com/cfitness-os-dev/cfitess-os-aistudio/issues/33#issuecomment-7081601823. Le champ Rust `ClockTerminal.failed_pairing_attempts` est additif avec `serde(default)` ; les initialisations explicites de `ClockTerminal` dans une autre branche devront fournir 0. Les données d'appareils actifs restent lisibles.

La photo reste indisponible, toute fausse photoProof reste refusée conformément à #38 ; aucun stockage privé ou caméra n'est prétendu livré. La présence avant cours #36 sur `8793b1e` reste à corriger (identité individuelle, contrôle de périmètre avant rejeu, définition/version serveur de checklist, fenêtre de cours). Les sessions partagées, le raccordement de l'interface kiosque, la preuve de lieu physique, l'idempotence générale et les essais sur matériel réel restent à recetter.

## Suivi automatique

L'automatisation existante « Recontrôler C.Fitness OS et répondre au développeur » a été réactivée avec un contrôle **toutes les dix minutes** dans ce chat. Elle compare les versions/réponses déjà traitées via `.tools/automatic-review-state.json`, réserve les fichiers et ne refait pas de tests ni de commentaires GitHub sans nouveauté pertinente. Les corrections sont en branches séparées ; aucun merge sur main ni déploiement autorisé.

Cadence observée sur les fusions récentes du 22 novembre :

| PR | Fusion (heure de Paris) | Écart avec la précédente |
| --- | --- | --- |
| #29 | 14:23 | — |
| #30 | 15:05 | environ 42 min |
| #31 | 15:19 | environ 14 min |
| #32 | 15:23 | environ 4 min |
| #34 | 15:38 | environ 15 min |
| #37 | 16:22 | environ 44 min |
| #35 | 16:24 | environ 2 min |

Ce sont des heures de livraison/fusion, pas une mesure du temps de codage de l'autre IA. Les commits peuvent être regroupés ou réécrits ; il n'existe pas de cadence garantie. Le choix de dix minutes réduit le délai de détection sans justifier des relances répétées au développeur.
