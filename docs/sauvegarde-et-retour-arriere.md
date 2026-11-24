# Sauvegarde, compatibilité et retour arrière (*rollback*) — C.Fitness OS

Ce document décrit le comportement du serveur Rust (`src-rust/src/seed.rs` et `src-rust/src/main.rs`) face à une base existante (`cfitness_state.json`), ainsi que la procédure sûre de sauvegarde avant mise à jour et de retour arrière (*rollback*).

---

## 1. Règle de démarrage (*fail-closed*)

Au démarrage, `try_load_or_init_state` distingue strictement deux situations pour le fichier `<CFITNESS_DATA_DIR>/cfitness_state.json` :

1. **Fichier absent (`NotFound`)** :
   - Premier démarrage sur un dossier vierge : le serveur initialise une base vierge de production (`CFITNESS_DEMO_MODE=0`) ou de démonstration (`CFITNESS_DEMO_MODE=1`) puis l’enregistre de façon atomique via `cfitness_state.json.tmp`.
2. **Fichier ou chemin existant mais illisible / JSON invalide / schéma incompatible (`ReadFailed`, `InvalidOrIncompatible`, `PersistFailed`)** :
   - **Aucune réinitialisation ni écriture** n’est effectuée.
   - Les octets existants sur disque (base corrompue, droits insuffisants ou données issues d’une version plus récente contenant des champs inconnus avec `deny_unknown_fields`) restent **strictement intacts**.
   - Le serveur écrit l’erreur détaillée avec le chemin concerné sur `stderr` / logs puis **s’arrête immédiatement avec le code de sortie `1`**.

> Important : lors d’une mise à jour vers une nouvelle version ajoutant des champs persistés (ex. campagnes ou programmations Lead), **un ancien binaire plus strict refusera désormais de démarrer** sur la nouvelle base au lieu de l’écraser par un seed vide.

---

## 2. Procédure obligatoire avant toute mise à jour serveur

Avant de reconstruire ou redémarrer un conteneur / binaire sur un serveur actif :

1. **Arrêter proprement le service applicatif** pour garantir qu’aucune écriture n’est en cours :
   ```bash
   docker compose stop cfitness-os
   ```
2. **Copier la base et les pièces jointes hors du volume actif** avec horodatage et empreinte SHA-256 :
   ```bash
   BACKUP_DIR="/var/backups/cfitness-os/pre-upgrade-$(date +%Y%m%d-%H%M%S)"
   mkdir -p "$BACKUP_DIR"
   cp -a /var/lib/docker/volumes/cfitness-os_cfitness_data/_data/cfitness_state.json "$BACKUP_DIR/"
   # Si des photos de pointage existent :
   cp -a /var/lib/docker/volumes/cfitness-os_cfitness_data/_data/punch_photos "$BACKUP_DIR/" 2>/dev/null || true
   sha256sum "$BACKUP_DIR/cfitness_state.json" > "$BACKUP_DIR/cfitness_state.json.sha256"
   ```
3. **Conserver l’identifiant exact du commit / image précédente** :
   ```bash
   git -C /opt/cfitness-os rev-parse HEAD > "$BACKUP_DIR/commit.txt"
   ```

---

## 3. Procédure de retour arrière (*rollback*)

Si une nouvelle version doit être annulée après déploiement :

1. **Arrêter le service** :
   ```bash
   docker compose stop cfitness-os
   ```
2. **Ne jamais démarrer l’ancien binaire directement sur un `cfitness_state.json` écrit par une version plus récente** s’il comporte de nouveaux champs incompatibles. Le binaire refusera de démarrer (`exit 1`) pour protéger vos données.
3. **Restaurer la sauvegarde datée correspondante au commit cible**, vérifier son empreinte SHA-256, puis redéployer l’ancien commit :
   ```bash
   sha256sum -c "$BACKUP_DIR/cfitness_state.json.sha256"
   cp -a "$BACKUP_DIR/cfitness_state.json" /var/lib/docker/volumes/cfitness-os_cfitness_data/_data/cfitness_state.json
   git -C /opt/cfitness-os checkout "$(cat "$BACKUP_DIR/commit.txt")"
   docker compose up -d --build
   ```
4. **Vérifier le démarrage** :
   ```bash
   curl -fsS http://127.0.0.1:8080/api/health
   ```

---

## 4. Règle d’exploitation (recette et production)

- **Ne jamais tester une corruption ou une restauration sur les données d’un club réel ou sur le serveur actif.**
- Toute vérification de démarrage, de refus de schéma ou de restauration s’effectue exclusivement sur un **dossier temporaire jetable** (`CFITNESS_DATA_DIR=/tmp/cfitness-test-...`) ou via les tests unitaires Rust (`cargo test --locked`).
