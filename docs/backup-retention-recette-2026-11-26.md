# Sûreté de la rotation des archives — 26 novembre 2026

Branche `fix/backup-retention-safety`, base `1c0f624` (PR #98–#100 intégrées).
Périmètre : uniquement outil opérateur et données temporaires fictives ; pas de déploiement, programmation système ni accès à un serveur réel.

## Régression reproduite puis corrigée

Dans l'outil ajouté par #99, `max_backups=0` créait puis supprimait sa propre archive et retournait `ok=true`. Test local d'abord rouge (True obtenu au lieu de False), puis vert. Les valeurs négatives avaient aussi une sémantique de tranche dangereuse.

- Rétention entière de 1 à 365 exclusivement, validée avant création du dossier ou mutation.
- Clé HMAC requise, au moins 32 caractères, sélectionnée via `--key-env` (défaut `CFITNESS_HMAC_SECRET`). Ancienne option `--hmac-secret` refusée ; le diagnostic d'arguments ne recopie pas leur contenu.
- Helper d'archive chargé depuis le dossier du script, pas le dossier courant. Lancement depuis un autre répertoire testé.
- Fichier d'état canonique existant `cfitness_state.json` obligatoire ; nom différent ou lien symbolique refusé. Dossier destination symbolique refusé.
- Verrou local exclusif pour les invocations coopérantes. Un verrou préexistant n'est ni remplacé ni supprimé. Après arrêt brutal, contrôler qu'aucun processus ne tourne avant d'intervenir manuellement ; aucun déverrouillage automatique.
- Création puis vérification HMAC/SHA avant toute rotation. Clé, état brut et détails d'exception ne sont jamais imprimés.
- Rotation limitée aux noms exacts produits par l'outil et archives vérifiées/signées avec la même clé. Fichier non reconnu, corrompu, signé avec une autre clé ou lien symbolique conservé. `skippedUnverifiedCount` compte les noms conformes exclus ; les autres noms restent hors inventaire de rotation.
- Nouvelle archive toujours retenue, même si d'anciennes archives portent une date future. `retainedCount` compte les archives vérifiées retenues, pas tous les fichiers du dossier.
- Calcul du SHA global en flux de 1 Mio, sans lecture complète de l'archive en mémoire.
- Erreur de création/vérification : aucune rotation. Erreur de suppression pendant rotation : `ok=false`, `rotationComplete=false`, présence de la nouvelle archive indiquée ; les suppressions déjà réussies ne sont pas réversibles.

La clé n'est pas générée, enregistrée ni déplacée par cet outil. Elle doit rester disponible séparément pour vérifier/restaurer les archives, y compris après rotation de clé. Une archive d'une ancienne clé est conservée mais exclue de la rotation courante.

## Preuves exécutées

- `scripts/test_backup_production.py` : **10 tests réussis** (dont régression zéro, limites/type booléen, absence de clé, rotation nominale, fichiers non reconnus/altérés/autre clé/liens, date future, verrou, panne création/vérification/suppression, nom d'état, lancement externe et non-divulgation dans diagnostics).
- `scripts/test_rh_documents_archive.py` : **15 tests réussis**, moteur V1/V2 non modifié.
- `scripts/test_lead_pool_and_production.py` : **2 groupes réussis**, appel de sauvegarde adapté à une clé fictive éphémère en environnement et état documentaire camelCase.
- Suite officielle : **222 Rust**, **179 TypeScript**, lint et build Vite réussis.

Le groupe pré-vol existant utilise encore sa fixture historique ; sa réussite ne valide pas le schéma réel ni la préparation à la production. Anomalie distincte signalée à Antigravity sur #21 : le pré-vol vérifie des clés snake_case et le profil admin alors que le serveur sérialise en camelCase avec admin_systeme. Ce fichier reste réservé à sa correction, pas modifié ici.

## Procédure et limites

Un opérateur fournit le fichier `cfitness_state.json`, un dossier privé dédié et le nom de la variable contenant la clé ; lance `backup_production.py --state <fichier> --output-dir <dossier> --key-env <nom-variable> --max-backups 7`. Lire `ok` et le code de sortie ; une erreur impose de contrôler le dossier avant toute nouvelle suppression. Ne jamais mettre la valeur de la clé dans les arguments ni le dépôt.

Ce script effectue **une** sauvegarde et sa rotation ; aucun cron, service ou réplication distante n'est installé. L'archive contient l'état privé et les fichiers, sans chiffrement ; protéger le dossier et la politique de conservation des photos archivées. Le verrou protège les invocations de cet outil, pas les modifications manuelles externes. Les garanties et limites d'instantané, rétention, restauration neuve et magasins connus du rapport V2 restent applicables.

Aucune interface n'est modifiée ; aucune recette navigateur ou ergonomie générale n'est revendiquée. Aucun nouveau parcours Lead ni préparation réelle à la production ne sont certifiés par ce lot.
