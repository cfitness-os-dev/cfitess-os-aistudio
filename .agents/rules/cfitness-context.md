---
trigger: always_on
---

# Contexte projet — C.Fitness OS (Antigravity)

> Dépôt public (`cfitness-os-dev/cfitess-os-aistudio`) : ne jamais stocker de mots de passe, codes PIN, jetons API ou clés privées dans ce fichier ni dans les commits.

## 1. Préférences et méthode de travail
- Toujours répondre à l’utilisateur **en français uniquement**, avec des liens cliquables `file://` vers les fichiers cités.
- Sous Windows PowerShell, utiliser `;` entre commandes (ou `cmd /c "..."` pour chaînes npm), jamais `&&`.
- Toujours vérifier les tests applicables après la dernière modification avant d’annoncer un résultat :
  - Backend Rust : `cargo test --locked --manifest-path Cargo.toml`
  - Frontend & domaine : `cmd /c "npm run lint && npm test && npm run build"`

## 2. Architecture et périmètre métier bi-club
- **Frontend** : React + TypeScript + Vite + Tailwind CSS (`src/`).
- **Backend** : Rust + Axum + Tokio (`src-rust/`), persistance atomique disque (`cfitness_state.json` via fichier `.tmp` + renommage, rollback mémoire sur échec d’écriture).
- **Conteneurisation** : `Dockerfile` multi-étapes (Node 22 → Rust 1.85 → Alpine 3.21), `docker-compose.yml`, `deploy-linux.sh`.
- **Établissements** : `C.Fitness Carré de Soie` (`club-carre-soie`) et `C.Fitness Beynost` (`club-beynost`).
- **RBAC & Navigation** :
  - Délégations structurées `(collaborateur × club × module × actions)` dans `src-rust/src/models.rs` et `rbac.rs` (`ModuleDelegation`, `can_access_module_action`), routes `GET/PUT /api/admin/delegations`.
  - Sélecteur de club unique sur desktop et tiroir mobile dans `AdminShell.tsx`, strictement limité à `authorizedClubIds` (aucune vue consolidée `'all'` implicite).
  - Préférences d’apparence (`themeMode` / `accentColor`) isolées par utilisateur (`GET/PUT /api/me/preferences` + cache navigateur cloisonné).
  - `Paramètres · Mon espace → Apparence` ouvert à tous sans badge verrou ; l’onglet **Espace technique & installation** reste réservé au rôle `admin`.
  - Séparation explicite entre `Mon compte` (`personal`, tous rôles) et `Collaborateurs et RH` (`MC01`, admin/manager uniquement).

## 3. Coordination GitHub avec Codex (`EvenAngel-CF`)
- Suivi sur l’**Issue #21** et protection active sur `main` (PR + approbation requise, pas de force push ni suppression de branches de travail de Codex).
- **Sections réservées à Codex** (ne pas modifier simultanément sans accord) :
  - `get_lead_settings`, `put_lead_settings` et tests réglages associés dans `src-rust/src/routes.rs`
  - Module de contrat DTO settings Lead
  - `src/domain/clientApi.ts`
  - Formulaire réglages dans `src/components/views/LeadCommercialHubView.tsx`
- **Périmètre Antigravity** : moteurs d’automatisation dans `src-rust/src/lead_automations.rs`, RBAC/UI transverses, scripts de déploiement et recette.

## 4. Déploiement club et bascule Démo → Production réelle
- **Préparation à l’atelier** : le serveur Debian 12 / Ubuntu peut être préparé et testé chez soi (Docker, Git, Ollama `qwen2.5:3b`, Tailscale/WireGuard, test `sudo reboot`) avant installation sur place (phase 0 du guide dans `GovernanceView.tsx`).
- **Kit clé USB auto-installable** : `scripts/usb-kit/install-from-usb.sh` et `scripts/usb-kit/README_CLE_USB.txt` (1 commande `sudo bash install-from-usb.sh`, compatible hors-ligne si `cfitness-os-image.tar` présent).
- **Passage en production réelle** :
  1. Régler `.env` avec `CFITNESS_DEMO_MODE=0`, `CFITNESS_STRICT_SESSION=1`, `CFITNESS_ALLOWED_ORIGINS` exact et des secrets aléatoires uniques.
  2. Compiler le frontend avec `--build-arg VITE_DEMO_MODE=false` (`Dockerfile` + `CfosContext.tsx`) pour couper les fonctions démo (`Reset démo`, bascule rapide, fallback client).
  3. Démarrer sur une base vierge sans données fictives, finaliser la gestion serveur des comptes/mots de passe réels, puis importer les CSV Heitz, Stocks EAN et Excel Lead.
