# Archives documentaires conjointes — procédure et recette

Branche `feat/rh-document-archives`. Suite de #93, alignée pendant le lot sur `main 34b1c0a` après intégration par Antigravity des PR #92, #93 et #94. Aucun déploiement.

## Ce qui est réellement développé

L’outil `scripts/rh_documents_archive.py` capture le JSON d’état et les fichiers privés référencés par le centre documentaire RH dans une même archive ZIP versionnée. Il vérifie le registre, les tailles et SHA-256, peut authentifier le manifeste par HMAC, puis restaure exclusivement dans un dossier neuf. Il ne remplace ni une sauvegarde globale de tous les magasins privés ni une réplication automatique réseau.

Les anciennes API d’export/restauration JSON sont désormais refusées (409) lorsqu’elles omettraient des documents RH ou effaceraient leurs références. Les refus conservent l’état et les sessions. Les anciennes sauvegardes sans documents restent compatibles.

## Usage opérateur

Ces commandes sont destinées à la direction ou à l’administrateur du serveur, pas à l’interface quotidienne d’un collaborateur. Les chemins sont des exemples à remplacer. Ne pas démarrer un serveur sur le dossier de restauration avant la confirmation de succès.

```bash
python3 scripts/rh_documents_archive.py inspect --source /chemin/donnees
python3 scripts/rh_documents_archive.py create --source /chemin/donnees --archive /sauvegardes/rh.cfos-rh.zip --key-env CFITNESS_BACKUP_SIGNING_KEY
python3 scripts/rh_documents_archive.py verify --archive /sauvegardes/rh.cfos-rh.zip --key-env CFITNESS_BACKUP_SIGNING_KEY
python3 scripts/rh_documents_archive.py restore --archive /sauvegardes/rh.cfos-rh.zip --destination /chemin/recette-neuve --key-env CFITNESS_BACKUP_SIGNING_KEY
```

La clé doit être configurée séparément par l’opérateur dans l’environnement (valeur aléatoire longue, au moins 32 octets recommandés), conservée pour les restaurations et jamais passée comme valeur en argument ou inscrite au dépôt. L’outil ne génère ni ne déploie de clé réelle.

Sans `--key-env`, la création est explicitement non signée (`signed:false`) et la vérification ne prouve que l’intégrité structurelle/SHA. Une archive portant une signature nécessite la bonne clé ; une clé demandée impose une archive signée et empêche un succès après retrait de sa signature. Ne pas confondre cette signature technique HMAC avec une signature contractuelle d’un salarié.

L’archive n’est **pas chiffrée** et contient l’état complet de l’application, dont les données privées et empreintes d’authentification déjà stockées. Les sorties de l’outil ne recopient ni cet état ni les secrets ; l’archive elle-même doit rester dans un stockage réservé et protégé.

## Garanties et bornes

- JSON pris en une lecture bornée de 10 Mio ; publication des états serveur par remplacement atomique. Les fichiers documentaires sont immuables dans le module actuel : une nouvelle publication n’altère pas les octets des fichiers déjà référencés.
- Fichiers de 4 Mio maximum, quotas documentaires de 200 Mio par club, manifeste limité à 2 Mio, au plus 10 000 références.
- Identifiants opaques validés, doublons refusés, correspondance exacte entre registre, manifeste et entrées ZIP. Aucun nom de fichier provenant de l’utilisateur n’est utilisé comme chemin de restauration.
- Pas d’extraction ZIP globale : seuls les chemins calculés depuis le registre sont écrits. Entrées supplémentaires, chemins de traversée, doublons, entrées compressées/chiffrées et contenus altérés sont refusés.
- Lecture des fichiers source refusant les liens symboliques documentaires ; permissions Unix 0600 pour les fichiers, 0700 pour les nouveaux dossiers.
- Export vers un fichier qui n’existe pas : publication exclusive sans écrasement, même si la destination apparaît en concurrence.
- Restauration hors ligne dans un dossier créé exclusivement : aucun remplacement d’un jeu de données existant. Octets écrits avant le JSON d’état. Sur erreur, nettoyage des seuls fichiers créés par cette opération ; fichiers sans rapport conservés.
- Diagnostic des fichiers non référencés sans suppression automatique. Les octets manquants/corrompus empêchent un export réussi.
- Toute présence de photos de badgeage dans l’état provoque pour l’instant un **refus explicite** : ce format ne sait pas encore sauvegarder leur autre magasin privé. Il ne produit pas silencieusement une sauvegarde partielle.

## Preuves exécutées sur la combinaison

| Vérification | Résultat |
| --- | --- |
| Rust complet après intégration du main | 218 réussis, 0 échec |
| TypeScript | 179 réussis, 0 échec |
| TypeScript strict et build Vite | Réussis |
| Build backend | Réussi ; avertissement de cache xcrun interdit, sans échec de compilation |
| Unités Python archive | 9 réussies |
| Recette serveur + archive + redémarrage | 6 groupes réussis |
| Non-régression documents HTTP | 7 groupes réussis |

Les neuf tests Python couvrent l’aller-retour signé, les permissions Unix, la protection des destinations existantes, les signatures absentes/erronées/retirées, l’altération des octets et de l’état, les entrées ZIP inattendues/dupliquées/compressées, les sources manquantes/corrompues, les orphelins conservés, le refus des photos non prises en charge, le nettoyage après échec et les liens symboliques.

Le test Rust supplémentaire vérifie que l’export JSON incomplet et les restaurations qui perdraient les fichiers sont refusés avant toute mutation ou révocation de session.

La recette `scripts/test_rh_documents_archive_http.py` :
1. Démarre un vrai backend sur un dossier fictif neuf, crée un document et sa prise de connaissance.
2. Vérifie les refus d’export/restauration JSON et leur absence de mutation.
3. Produit une archive signée depuis cet état en service, la vérifie et la restaure avec la vraie commande dans un dossier inexistant.
4. Contrôle que le JSON et les octets sont identiques, refuse une seconde restauration sur la destination déjà présente.
5. Redémarre le vrai backend sur le dossier restauré, reconnecte le salarié et relit son document privé et l’accusé.
6. Détecte un fichier orphelin synthétique sans le supprimer.

La même recette recontrôle la correction Antigravity #94 : GET snapshot indique `isSimulation:true` et `failoverReady:false` ; POST indique `simulated:true`, `checksumVerified:false` et n’effectue aucune fusion d’état. Ce contrôle est inclus dans les six groupes, pas compté une deuxième fois.

Commandes exécutées : `cargo test --locked --quiet`, `cargo build --locked --quiet`, `npm run lint`, `npm test`, `npm run build -- --outDir <dossier dédié>`, `scripts/test_rh_documents_archive.py`, `scripts/test_rh_documents_archive_http.py`, `scripts/test_hr_documents.py`. Binaire réel, dossiers neufs, clé HMAC synthétique éphémère et comptes de démo. Aucun secret fournisseur hérité, appel réel Heitz, paiement ou envoi.

Pas de nouvelle modification d’interface par Codex dans ce lot, donc pas de nouvelle recette navigateur. Le changement d’étiquetage de l’aperçu de réplication provient de #94 ; son code/API et sa compilation sont vérifiés ici, sans prétendre une nouvelle capture visuelle.

## Restes avant exploitation réelle

- Étendre le format aux photos de badgeage et aux autres magasins privés avant d’annoncer une sauvegarde globale complète.
- Raccorder une interface direction, une planification, un stockage externe protégé/chiffré et une gestion de rétention ; aucun de ces services n’est déclaré actif par cet outil.
- Recetter Linux/Docker/Windows, panne de disque, gros volumes et arrêt brutal pendant copie. La réussite sur ces jeux locaux ne certifie pas un PRA/RPO.
- La restauration n’est ni un remplacement à chaud ni une fusion de bases. La procédure opérateur choisit et vérifie un nouvel environnement ; aucune bascule du serveur club n’est exécutée.
- Le diagnostic d’orphelins ne les met pas encore en quarantaine et ne les supprime pas.
- Les autres écarts DOC01/DOC02/DOC04, la signature réelle et les pièces jointes de communication restent dans le registre général.

Validation sur le périmètre exécuté uniquement.
