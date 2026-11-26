# Lecture de la liste Lead et conservation locale — 26 novembre 2026

Branche `fix/lead-server-prospect-snapshot`, construite depuis `90e9581` (#105, désormais intégrée sur main `28a0e66`). Aucun moteur Rust modifié.

## Problèmes corrigés

L'ancienne synchronisation ne traitait pas une liste vide, conservait des exemples absents du serveur, fusionnait par email et réattribuait visuellement tous les contacts à emp-chloe/emp-maxime selon le club. Une vraie attribution reçue pouvait donc être masquée au rechargement.

La réponse complète de /api/lead/workspace est désormais vérifiée (clubs explicites, liste présente, références uniques, champs essentiels et attribution réelle). Une liste vide autorisée fait réellement disparaître les contacts du pipeline de ce périmètre. Les clubs hors périmètre ne sont pas modifiés et ne sont pas proposés dans la lecture Lead autorisée. Un transfert se rapproche uniquement par référence stable, jamais par email.

Les lignes locales absentes et les anciennes versions différentes restent dans `leadLocalContacts`, sous « Contacts et anciennes versions conservés sur cet appareil ». Pas de suppression physique, pas d'import automatique. Liste affichée par pages de 50, filtrée sur les clubs du serveur et le club actif. Les copies historiques ne sont pas comptées dans le pipeline ou les indicateurs.

Le périmètre de lecture est lié au compte courant. Pendant chargement/échec/changement de compte, le pipeline partagé est masqué ; une réponse d'un autre compte ne remplace pas le cache courant. Le champ assignedToId du serveur, y compris une attribution absente, est conservé sans employé inventé.

## Création et modifications : limite explicitement exposée

L'ancien createProspect ne réalisait aucune écriture serveur. Cette saisie est maintenant conservée dans les contacts locaux à reprendre et n'augmente plus artificiellement le pipeline partagé. Le formulaire l'annonce avant validation et propose « Conserver sur cet appareil ». La notification confirme une conservation locale, jamais un partage serveur.

Les anciennes modifications de fiche/étape/segments restent locales : leurs notifications ne prétendent plus qu'une sauvegarde partagée a réussi. Les mutations de transfert/réattribution, déjà acquittées par le serveur et validées par #105, utilisent explicitement une application locale de confirmation, sans avertissement erroné.

**Ce lot ne livre pas encore les routes de création/édition partagées.** Leur raccordement, les retours d'échec, la concurrence et l'idempotence sont la priorité suivante. Une conservation dans le navigateur n'est pas une sauvegarde du club ni une migration des données. Les archives serveur V2 ne couvrent pas ce stockage local du navigateur.

## Preuves exécutées

- `npm test` : **196 réussis, 0 échec**, dont 8 nouveaux tests : attribution réelle/null, réponse incomplète/hors club/doublons, liste vide, conservation des lignes et notes locales, absence de fusion par email, transfert par identifiant stable, relectures répétées.
- Compilation TypeScript et build Vite réussis ; `cargo test --locked --quiet` : **222 réussis, 0 échec**. Backend identique à celui de #105.
- Vrai backend isolé `http://127.0.0.1:64752/crm`, répertoire neuf cloné d'une précédente fixture synthétique possédée par cette recette. Uniquement dans ce clone, liste CDS mise à zéro et un contact serveur laissé à Beynost avant lancement ; aucun original modifié.
- Navigateur : CDS affiche **0 actif / Liste(0)** et conserve les anciennes fiches séparément ; Beynost affiche **1 actif / Liste(1)**. Avant correctif, les exemples locaux restaient dans les listes.
- Transfert fictif Beynost → CDS, puis rechargement : Beynost affiche zéro et CDS un seul contact partagé. Aucun retour d'exemple local dans le pipeline.
- Conservation d'un nouveau contact fictif sur l'appareil : pipeline maintenu à un, message de conservation locale explicite ; après rechargement, le contact reste consultable dans la section locale. Son adresse fictive est absente du JSON serveur (vérification directe de la fixture).
- Rendus consultés à 1280 × 720, 768 × 1024 et 390 × 844. Tableau tablette à défilement horizontal existant ; cette lecture n'en certifie pas l'ergonomie complète. Dernier libellé « Conserver sur cet appareil » vérifié dans le navigateur.
- Aucune capture exportée en fichier revendiquée ; pas de recette de réseau artificiellement retardé dans le navigateur. Les refus de schéma sont exécutés en tests TypeScript.

## Limites à résoudre

Création/édition partagées et reprise contrôlée des contacts locaux restent à développer. Les autres actions héritées (étapes, segments, essais et adhésion) doivent être revues individuellement : leur présence ne prouve pas une écriture distante. Les champs de conformité absents du contrat serveur ne sont pas une vérification fournisseur réelle. Les statuts/archives avancés nécessitent leur propre recette.

Le vivier commercial explicitement habilité et les profils coach/recouvrement restent à corriger par Antigravity dans le moteur réservé. Une copie locale retrouvée ne doit jamais être réimportée automatiquement : une ancienne version transférée pourrait autrement recréer un doublon. Les contacts réels et les intégrations externes n'ont pas été utilisés.

Relecture humaine requise pour package.json (ajout de la recette officielle). Décision : **lecture partagée validée sur le périmètre testé ; module toujours non validé pour exploitation en club**. Aucun main ni déploiement modifié par Codex.
