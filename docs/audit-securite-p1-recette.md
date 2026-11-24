# Recette — Durcissement Sécurité P1 & Outillage de Bascule Production (`feat/security-p1-production-readiness`)

Branche : `feat/security-p1-production-readiness` (issue de `main` après fusion de la PR #58 `4ee4eaa`).

## 1. Périmètre implémenté

1. **Cookies de session `HttpOnly; SameSite=Strict` (`cfos_session`) & Résolution hybride (`src-rust/src/routes.rs`)** :
   - `POST /api/auth/login` émet désormais un cookie `cfos_session` avec les attributs `HttpOnly; SameSite=Strict; Path=/; Max-Age=28800` (et `; Secure` automatiquement dès que le serveur tourne hors mode démo, sous `CFITNESS_COOKIE_SECURE=1` ou derrière `X-Forwarded-Proto: https`), tout en conservant `sessionToken` dans le JSON pour la compatibilité des clients API Bearer.
   - `resolve_session_actor`, `require_bearer_session_actor` et `post_change_password` acceptent de manière transparente l'en-tête `Authorization: Bearer <token>` ou le cookie `HttpOnly` `cfos_session`.
   - `POST /api/auth/logout` révoque la session côté serveur (Bearer ou Cookie) et efface immédiatement le cookie navigateur (`Max-Age=0`).

2. **En-têtes HTTP de sécurité P1 (`src-rust/src/main.rs`)** :
   - Ajout automatique de `Cache-Control: no-store, no-cache, must-revalidate` et `Pragma: no-cache` sur toutes les réponses `/api/*` ne définissant pas déjà de politique de cache explicite.
   - Ajout automatique de `Strict-Transport-Security: max-age=31536000; includeSubDomains` hors mode démo ou lorsque `X-Forwarded-Proto: https` est présent.
   - Autorisation de l'en-tête `Cookie` dans l'allowlist CORS explicite.

3. **Rate-limiting conscient du reverse-proxy (`X-Forwarded-For` / `X-Real-IP`) & Protection `/api/me/password` (`src-rust/src/routes.rs`)** :
   - Sous `CFITNESS_TRUST_PROXY=1`, `/api/auth/login` applique un plafond anti-bruteforce par adresse IP source (`15` échecs / `300s`, y compris sur identifiants inconnus contre l'énumération de comptes) en complément du plafond par identifiant (`10` échecs / `300s`).
   - `POST /api/me/password` est désormais protégé contre le bruteforce du secret actuel (`10` échecs / `300s` → `429 Too Many Requests`).

4. **Scellement SHA-256 & Signature HMAC-SHA256 des sauvegardes (`GET /api/admin/backup` & `POST /api/admin/restore`)** :
   - `GET /api/admin/backup` calcule et retourne `sha256`, `hmacSignature` (si `CFITNESS_BACKUP_SIGNING_KEY` est défini), `signed` et `exportedAt`.
   - `POST /api/admin/restore` vérifie en temps constant (`constant_time_eq`) l'empreinte `expectedSha256` lorsqu'elle est fournie, et exige une signature `hmacSignature` valide dès que `CFITNESS_BACKUP_SIGNING_KEY` est configuré sur le serveur.

5. **Diagnostic serveur de pré-bascule production (`GET /api/admin/production-readiness`) & Script d'automatisation** :
   - Nouvel endpoint admin `GET /api/admin/production-readiness` vérifiant 8 critères de sécurité de production sans exposer aucun secret.
   - Nouveau script [scripts/switch-to-production.sh](../scripts/switch-to-production.sh), mise à jour de [scripts/usb-kit/install-from-usb.sh](../scripts/usb-kit/install-from-usb.sh) et guide [docs/checklist-bascule-production.md](./checklist-bascule-production.md).

## 2. Vérifications exécutées

| Contrôle | Commande / Support | Résultat |
| --- | --- | --- |
| Tests unitaires Rust | `cargo test --locked --manifest-path Cargo.toml` | **140 passed, 0 failed, 0 ignored** (inclut `security_p1_hardening_enforces_httponly_cookie_proxy_ratelimit_hmac_backup_and_prod_readiness`) |
| Types, tests TS & build Vite | `cmd /c "npm run lint && npm test && npm run build"` | `tsc --noEmit` OK, **129/129** tests TS passed, build Vite OK |
| Recette HTTP Sécurité P1 | `python scripts/test_security_p1.py` | **5/5** (`Cache-Control: no-store` & `HSTS`, cookie `HttpOnly` `cfos_session`, backup signé SHA-256/HMAC-SHA256, `/api/admin/production-readiness` 401/403/200, rate-limit IP `X-Forwarded-For` & logout `Max-Age=0`) |
| Recette HTTP Sécurité P0 | `python scripts/test_security_p0.py` | **4/4** (zéro régression P0) |
