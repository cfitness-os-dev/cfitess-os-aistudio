# C.Fitness OS — Plateforme Unifiée Bi-Club & Module RH « Mon compte » V1.16

Application complète développée sous **Windows** (itération locale + tests + build) puis empaquetée en conteneur unique Docker pour fonctionner en production sur le **serveur Linux Debian 12 du club** (`React 18 / TypeScript / Tailwind CSS v3 + Rust / Axum / Tokio`).

> **Architecture unifiée** : cette version rassemble intégralement les modules opérationnels C.Fitness OS issus de `cfitess-os-aistudio` (Bi-club Carré de Soie & Beynost, Adhérents & Portillons Heitz, Caisse TPV NF525, CRM & Téléphonie 04/07 ARCEP, Documents & Signatures internes eIDAS SHA-256 à 0 €, Recrutement ATS, Technogym Checkup / InBody, Agents IA, 4 Shells terminaux) **et** le socle RH V1.16 « Mon compte » (`MC01` à `MC13`, matrice RBAC `6×44`, traçabilité `91` écrans / `1 605` entrées, `117` fichiers de références).

---

## Architecture & Couverture

- **Barre latérale & 4 Shells terminaux** (`src/components/AdminShell.tsx`, `src/components/shells/`) :
  - `AdminShell`, `EmployeeMobileShell`, `KioskTabletShell`, `SoftphoneShell` et verrouillage PIN local (`LocalLoginGate`).
  - Modules complets : `Tableau de bord`, `Clubs` (Carré de Soie / Beynost), `Adhérents`, `CRM & Ventes`, `Planning`, `Cours collectifs`, `Personnel (Mon compte)`, `Traçabilité V1.16 (91/1605)`, `Finances`, `Maintenance`, `Stock & Achats`, `Marketing`, `Documents`, `Rapports`, `Agents IA`, `Bornes & Terminaux (4)`, `Paramètres · Mon Espace`.
- **Module RH « Mon compte » (`/mon-compte`, `/personnel`, `/planning`, `/tracabilite`)** :
  - Hub unifié (`MonCompteRhHubView.tsx`) reliant `MC01`–`MC13`, le sélecteur de `7` personas RBAC V1.16, `Traçabilité 91/1605` (avec `117` fichiers dans `public/references/`) et les vues terrain GitHub (`MyDayCollaboratorView`, `PlanningHrView`).
- **Backend unifié (Middleware Vite dev + Serveur Rust/Axum prod)** :
  - `19` routes API exposées dans `src-rust/src/routes.rs` et `vite.config.ts` :
    - Socle RH V1.16 : `/api/health`, `/api/registry`, `/api/ambiguities`, `/api/session`, `/api/section-access/:section_id`, `/api/dashboard`, `/api/shifts/:shift_id`, `/api/admin/profiles`, `/api/admin/profiles/:profile_id`, `/api/admin/audit-log`, `/api/admin/audit-log/csv`, `/api/admin/organization`, `/api/admin/org02-policy`, `/api/admin/backup`, `/api/admin/restore`, `/api/me/preferences`, `/api/me/calendar-token/revoke`, `/api/me/password`.
    - Passerelles C.Fitness OS : `POST /api/auth/login`, `POST /api/heitz/gate-check`, `POST /api/ats/ingest-email`, `GET/POST /api/backup/snapshot`.
  - Persistance atomique JSON sur `/var/lib/cfitness/cfitness_state.json`.
- **Suite de tests automatisés** : `29` tests unitaires dans `src/domain/rules.test.ts` (12 tests RH V1.16 + 12 tests métier C.Fitness OS + 4 tests thème + 1 audit sécurité/compatibilité).

---

## Utilisation & tests sous Windows (poste de développement)

Prérequis : Node.js 20+.

```powershell
cd cfitess-os
npm install
npm run lint    # Vérification TypeScript strict (tsc --noEmit)
npm test        # Exécute la suite de 29 tests (tsx src/domain/rules.test.ts)
npm run build   # Compile dist/
npm run dev     # Lance UI + middleware API /api/* sur http://127.0.0.1:5173
```

---

## Transfert et déploiement sur le serveur Linux du club (Debian 12 / Ubuntu LTS)

### 1. Transférer le dossier `cfitess-os/` sur le serveur Linux

Depuis Windows (`scp` ou `rsync`), en excluant `node_modules` et `target` (le conteneur Docker compile lui-même `dist/` et le binaire Rust `release`) :

```bash
scp -r cfitess-os utilisateur@ip-serveur-linux:/opt/cfitness-os
```

Ou via `rsync` :

```bash
rsync -av --delete --exclude node_modules --exclude target cfitess-os/ utilisateur@ip-serveur-linux:/opt/cfitness-os/
```

### 2. Déployer avec Docker Compose (recommandé)

```bash
cd /opt/cfitness-os
cp -n .env.example .env    # À adapter avec vos vrais secrets / IP LAN si besoin
chmod +x deploy-linux.sh
./deploy-linux.sh
```

Ou directement :

```bash
cd /opt/cfitness-os
cp -n .env.example .env
docker compose up -d --build
docker compose ps
```

Le build multi-étapes (`Dockerfile`) :

1. Copie les sources frontend, `public/references/` (117 fichiers) ainsi que `docker-compose.yml`, `Dockerfile`, `deploy-linux.sh`, `Cargo.toml`, `metadata.json` et `src-rust/` (nécessaires aux imports `?raw` de *Paramètres · Mon Espace* / `GovernanceView.tsx`) et lance `npm run build`.
2. Compile le serveur Rust Axum (`src-rust/src/main.rs` + `routes.rs`) via `cargo build --release`.
3. Produit une image `alpine:3.21` minimale et durcie servant à la fois l'interface SPA et les API `/api/*` sur le port `8080` (`http://IP_SERVEUR_LINUX:8080/`).

Vérification de santé après démarrage :

```bash
curl -fsS http://127.0.0.1:8080/api/health
```

### 3. Persistance, sauvegarde & réplication

- **Données RH & droits RBAC** : volume Docker `cfitness_data` monté sur `/var/lib/cfitness` (`/var/lib/cfitness/cfitness_state.json`).
- **Sauvegardes & failover multi-appareils** : volume Docker `cfitness_backups` monté sur `/var/backups/cfitness-os` + endpoints `GET /api/admin/backup`, `POST /api/admin/restore` et `GET/POST /api/backup/snapshot`.
- **Variables réseau Linux / Club** : configurables dans `.env` (`HEITZ_WS_URL`, `HEITZ_WS_TOKEN`, `TURNSTILE_MODBUS_RELAY_CDS`, `TURNSTILE_MODBUS_RELAY_BEY`, `OVH_SIP_TRUNK_HOST`, `YEASTAR_TG400_SIP_GATEWAY`, `BACKUP_SECONDARY_NODES`).
