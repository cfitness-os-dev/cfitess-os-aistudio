# Recette — Durcissement Sécurité P0 (`fix/security-audit-p0`)

Branche : `fix/security-audit-p0` (issue de `main` à `9c0af75`).

## 1. Correctifs de sécurité P0 implémentés

1. **Authentification, RBAC & comparaison en temps constant** (`src-rust/src/routes.rs`, `src-rust/src/auth_passwords.rs`) :
   - Exposition de `constant_time_eq` dans le crate pour toutes les vérifications de jetons/clés API (`x-cfitness-heitz-token`, `x-cfitness-webhook-token`, `CFITNESS_LEAD_API_KEY`).
   - `GET /api/ollama/status` & `POST /api/ollama/chat` : authentification session requise + employé actif obligatoire + bornes strictes (`messages <= 30`, rôle `user|assistant|system`, longueur max `16 000` caractères).
   - `POST /api/heitz/gate-check` : jeton `x-cfitness-heitz-token` valide OU session employé actif obligatoire ; génération du `qrToken` par CSPRNG (`OsRng`, 16 octets hexadécimaux) au lieu de l'horodatage.
   - `POST /api/ats/ingest-email` : jeton webhook `x-cfitness-webhook-token` valide OU session manager/administrateur obligatoire.
   - `GET/POST /api/backup/snapshot` : session `Bearer` obligatoire (`require_bearer_session_actor`) + rôle `admin_systeme`.
   - `GET /api/registry`, `GET /api/ambiguities`, `GET /api/lead/registry` : authentification session obligatoire.
   - `POST /api/lead/webhooks/clubEntry` : fail-closed en production (`401 Unauthorized` si `CFITNESS_LEAD_API_KEY` est absente hors mode démo) et comparaison en temps constant.
   - `GET /api/admin/backup` & `POST /api/admin/restore` : réservés strictement à `admin_systeme` avec jeton `Bearer` obligatoire, plafond `10 Mo` à la restauration, vérification d'au moins un administrateur actif dans l'archive, et révocation immédiate de toutes les autres sessions après restauration.
   - `POST /api/me/password` : révocation des autres sessions actives du compte après changement de mot de passe (en complément de la révocation lors d'une réinitialisation admin).
   - `GET /api/health` : sortie publique réduite au statut de disponibilité (`status`, `service`, `backend`, `timestampUtc`), sans exposition des adresses IP LAN, numéros SIRET ou compteurs internes.
2. **En-têtes HTTP & CORS** (`src-rust/src/main.rs`) :
   - Ajout de `Content-Security-Policy` stricte (`default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'self'`, `base-uri 'self'`, `form-action 'self'`).
   - Remplacement de `CorsLayer::very_permissive()` par une allowlist explicite de méthodes et d'en-têtes autorisés.
3. **Frontend & déploiement** :
   - [ClubAndAiSettingsPanel.tsx](../src/components/ClubAndAiSettingsPanel.tsx) et [RecoveryView.tsx](../src/components/views/RecoveryView.tsx) envoient désormais les en-têtes authentifiés (`Bearer` / session) vers `/api/ollama/*`.
   - Suppression de l'origine tunnel temporaire dans `docker-compose.yml`, retrait du jeton d'exemple dans `.env.example`, passage à `npm ci --ignore-scripts` et suppression des fichiers Rust inutiles dans le stage `frontend-builder` du `Dockerfile`.

## 2. Vérifications exécutées

| Contrôle | Commande / Support | Résultat observé |
| --- | --- | --- |
| Tests unitaires Rust | `cargo test --locked --manifest-path Cargo.toml` | **139 passed, 0 failed, 0 ignored** (inclut `security_p0_hardening_enforces_auth_admin_backup_revocation_and_minimal_health`) |
| Compilation Rust | `cargo build --locked --manifest-path Cargo.toml` | Succès (`Finished dev profile`) |
| Types, tests TS & build Vite | `cmd /c "npm run lint && npm test && npm run build"` | `tsc --noEmit` OK, **129/129** tests TS passed, build Vite OK (`MonCompteRhHubView` `478.00 kB`) |
| Recette HTTP sécurité P0 | `python scripts/test_security_p0.py` | **4/4** groupes (`CSP`/`nosniff`/`SAMEORIGIN`, `/api/health` minimal, `401` sur les 10 endpoints protégés, `403` non-admin sur backup/snapshot, fail-closed prod `clubEntry`, `externalSends: 0`) |
| Recettes HTTP RH | `test_hr_pilotage.py` (**5/5**), `test_hr_site_rules.py` (**5/5**), `test_hr_employee_dossier.py` (**6/6**), `test_hr_organisation.py` (**18/18**) | Tous validés (`externalSends: 0`) |
| Contrôle Chrome CSP | `http://127.0.0.1:18153/` (`list_console_messages`) | Rendu React actif (`rootLen: 113485`), zéro violation `Content-Security-Policy` (uniquement les `401` attendus avant authentification sous `CFITNESS_STRICT_SESSION=1`) |
