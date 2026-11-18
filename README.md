# C.Fitness OS — Plateforme Unifiée Bi-Club & Module RH « Mon compte » V1.16

Application complète développée sous **Windows** (itération locale + tests + build) puis empaquetée en conteneur unique Docker pour fonctionner en production sur le **serveur Linux Debian 12 du club** (`React 18 / TypeScript / Tailwind CSS v3 + Rust / Axum / Tokio`).

> **Architecture unifiée** : cette version rassemble intégralement les modules opérationnels C.Fitness OS issus de `cfitess-os-aistudio` (Bi-club Carré de Soie & Beynost, Adhérents & Portillons Heitz, Caisse TPV NF525, CRM & Téléphonie 04/07 ARCEP, Documents & Signatures internes eIDAS SHA-256 à 0 €, Recrutement ATS, Technogym Checkup / InBody, Agents IA, 4 Shells terminaux), le socle **RH V1.16 « Mon compte »** (`MC01` à `MC13`, matrice RBAC `6×44`, traçabilité `91` écrans / `1 605` entrées, `117` fichiers de références) **et** le **Module Commercial & Marketing « Lead » v0.4** (`1 682` entrées `LEAD-0001` à `LEAD-1682`, `84` fichiers de références, `9` onglets CRM, `6` sous-vues Communication, `14` rubriques Paramètres CRM et `9` connecteurs partenaires).

---

## Architecture & Couverture

- **Barre latérale & 4 Shells terminaux** (`src/components/AdminShell.tsx`, `src/components/shells/`) :
  - `AdminShell`, `EmployeeMobileShell`, `KioskTabletShell`, `SoftphoneShell` et verrouillage PIN local (`LocalLoginGate`).
  - Modules complets : `Tableau de bord`, `Clubs` (Carré de Soie / Beynost), `Adhérents`, `CRM & Ventes (Lead)`, `Traçabilité Lead (1682)`, `Planning`, `Cours collectifs`, `Personnel (Mon compte)`, `Traçabilité V1.16 (91/1605)`, `Finances`, `Maintenance`, `Stock & Achats`, `Marketing`, `Documents`, `Rapports`, `Agents IA`, `Bornes & Terminaux (4)`, `Paramètres · Mon Espace`.
- **Module Commercial & Marketing « Lead » v0.4 (`src/components/views/LeadCommercialHubView.tsx`, `src/domain/leadAuditRegistry.ts`)** :
  - `9` onglets métier séparés de « Mon compte » RH : *Prospects & Pipeline* (10 statuts, import Excel `11` colonnes, consentement RGPD décoché par défaut, archivage sur réponse entrante), *Clients & Vacances* (radar décrochage Heitz + *Histoire sportive* Checkup/Mywellness), *Activités* (`9` filtres + purge), *Planning RDV & Stripe* (`RDV-01`), *WhatsApp 24h* (`WA-01/02`, `INC-001`), *Communication* (`6` sous-vues), *Statistiques (`8` tableaux) · Ventes · Formulaires* (`UI-01`, `ACL-01`, `RSP-01`), *Paramètres CRM (`14` rubriques & `9` partenaires)*, et *Traçabilité Lead (`1 682` entrées, `26` captures, `23` écarts, `84` fichiers dans `public/references/lead_audit/`)*.
  - Corrections responsive mobiles intégrées (`RSP-01` à `RSP-04`).
- **Module RH « Mon compte » (`/mon-compte`, `/personnel`, `/planning`, `/tracabilite`)** :
  - Hub unifié (`MonCompteRhHubView.tsx`) reliant `MC01`–`MC13`, le sélecteur de `7` personas RBAC V1.16, `Traçabilité 91/1605` (avec `117` fichiers dans `public/references/`) et les vues terrain GitHub (`MyDayCollaboratorView`, `PlanningHrView`).
- **Backend unifié (Middleware Vite dev + Serveur Rust/Axum prod)** :
  - `22` routes API exposées dans `src-rust/src/routes.rs` et `vite.config.ts` :
    - Socle RH V1.16 : `/api/health`, `/api/registry`, `/api/ambiguities`, `/api/session`, `/api/section-access/:section_id`, `/api/dashboard`, `/api/shifts/:shift_id`, `/api/admin/profiles`, `/api/admin/profiles/:profile_id`, `/api/admin/audit-log`, `/api/admin/audit-log/csv`, `/api/admin/organization`, `/api/admin/org02-policy`, `/api/admin/backup`, `/api/admin/restore`, `/api/me/preferences`, `/api/me/calendar-token/revoke`, `/api/me/password`.
    - Passerelles C.Fitness OS & CRM Lead : `POST /api/auth/login`, `POST /api/heitz/gate-check`, `POST /api/ats/ingest-email`, `GET/POST /api/backup/snapshot`, `GET /api/lead/registry`, `POST /api/lead/webhooks/clubEntry`, `POST /api/v2/appointment/webhooks/stripe/:club`.
  - Persistance atomique JSON sur `/var/lib/cfitness/cfitness_state.json`.
- **Suite de tests automatisés** : `34` tests unitaires dans `src/domain/rules.test.ts` (12 tests RH V1.16 + 12 tests métier C.Fitness OS + 5 tests CRM Lead v0.4 + 4 tests thème + 1 audit sécurité/compatibilité).

---

## Utilisation & tests sous Windows (poste de développement)

Prérequis : Node.js 20+.

```powershell
cd cfitess-os
npm install
npm run lint    # Vérification TypeScript strict (tsc --noEmit)
npm test        # Exécute la suite de 34 tests (tsx src/domain/rules.test.ts)
npm run build   # Compile dist/
npm run dev     # Lance UI + middleware API /api/* sur http://127.0.0.1:5173
```

---

## Transfert et déploiement sur le serveur Linux du club (Debian 12 / Ubuntu LTS)

### 0. Installation automatique depuis une clé USB (après installation de Linux)

Copiez le dossier `cfitess-os/` sur une clé USB (sans `node_modules/` ni `target/`), branchez la clé sur le PC/serveur Linux fraîchement installé, puis lancez en une seule commande :

```bash
sudo bash /media/"$USER"/*/cfitess-os/install-linux-auto.sh
```

Ce script (`install-linux-auto.sh`) installe automatiquement Docker Engine + Docker Compose v2, active le démarrage automatique, désactive la mise en veille capot fermé sur PC portable de test, ouvre le port `8080` si `ufw` est actif, copie le projet vers `/opt/cfitness-os` (ou le clone depuis GitHub s'il est lancé seul) et exécute `./deploy-linux.sh`.

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
