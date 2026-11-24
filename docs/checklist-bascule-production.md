# Checklist & Procédure Opératoire — Bascule Démo → Production Réelle (`C.Fitness OS`)

Ce guide récapitule les étapes exactes pour basculer un serveur **C.Fitness OS** (Carré de Soie & Beynost) du mode **Démo / Test** vers la **Production réelle**.

---

## 1. Préparation automatisée sur le serveur Linux (`Host-asus` ou serveur club)

Depuis le dossier `/opt/cfitness-os` du serveur Linux, exécutez le script automatisé [switch-to-production.sh](../scripts/switch-to-production.sh) :

```bash
cd /opt/cfitness-os
chmod +x scripts/switch-to-production.sh

# Bascule complète avec réinitialisation sur base vierge de production :
./scripts/switch-to-production.sh \
  --origins "http://192.168.1.120:8080,http://100.87.239.70:8080" \
  --admin-password "<VOTRE_MOT_DE_PASSE_DIRECTION_MIN_12_CAR>" \
  --reset-demo-db
```

> **Ce que fait automatiquement le script :**
> 1. Sauvegarde l'ancien `.env` et l'ancienne base démo (`cfitness_state.demo-backup-<date>.json`).
> 2. Règle `CFITNESS_DEMO_MODE=0`, `VITE_DEMO_MODE=false`, `CFITNESS_STRICT_SESSION=1` et verrouille `CFITNESS_ALLOWED_ORIGINS`.
> 3. Génère des secrets CSPRNG uniques (`48` caractères hex) pour `CFITNESS_LEAD_API_KEY`, `CFITNESS_INBOUND_WEBHOOK_SECRET`, `CFITNESS_HEITZ_WEBHOOK_SECRET`, `HEITZ_WS_TOKEN` et `CFITNESS_BACKUP_SIGNING_KEY`, puis applique `chmod 600 .env`.
> 4. Recompile le frontend avec `--build-arg VITE_DEMO_MODE=false` (masque *Reset démo* et coupe toute bascule rapide d'acteur).
> 5. Initialise le compte administrateur principal avec hash `PBKDF2-SHA256` (`100 000` itérations) puis efface `CFITNESS_INITIAL_ADMIN_PASSWORD` en clair du fichier `.env`.
> 6. Vérifie `/api/health`, les en-têtes `Content-Security-Policy` / `Cache-Control: no-store` et la présence du conteneur IA local `ollama` (`qwen2.5:3b`).

---

## 2. Vérification du préflight serveur (`GET /api/admin/production-readiness`)

Une fois connecté avec le compte administrateur, interrogez l'endpoint de diagnostic de production :

```bash
curl -fsS http://127.0.0.1:8080/api/admin/production-readiness \
  -H "Authorization: Bearer <JETON_ADMIN>"
```

Tous les contrôles critiques (`severity: "blocker"`) doivent être à `"passed": true` et `"readyForProduction": true` :
- [x] `demo_mode_disabled` (`CFITNESS_DEMO_MODE=0`)
- [x] `strict_session_enabled` (`CFITNESS_STRICT_SESSION=1`)
- [x] `allowed_origins_configured` (`CFITNESS_ALLOWED_ORIGINS` explicite)
- [x] `active_admin_with_pbkdf2_hash` (au moins un admin actif avec mot de passe PBKDF2-SHA256)
- [x] `lead_api_key_configured` (`CFITNESS_LEAD_API_KEY` ≥ 16 caractères)
- [x] `inbound_webhook_secret_configured` (`CFITNESS_INBOUND_WEBHOOK_SECRET` ≥ 16 caractères)
- [x] `heitz_webhook_secret_configured` (`CFITNESS_HEITZ_WEBHOOK_SECRET` ≥ 16 caractères)
- [x] `backup_signing_key_configured` (`CFITNESS_BACKUP_SIGNING_KEY` ≥ 16 caractères, scellement HMAC-SHA256 des sauvegardes)

---

## 3. Réseau, Reverse-Proxy HTTPS & Sauvegardes 3-2-1

- [ ] **Reverse-Proxy HTTPS (si accès hors LAN direct)** : placer Caddy ou Nginx en TLS devant `127.0.0.1:8080`, puis activer `--trust-proxy` (`CFITNESS_TRUST_PROXY=1`) et `--cookie-secure` (`CFITNESS_COOKIE_SECURE=1`).
- [ ] **Pare-feu local (`ufw`)** : autoriser uniquement SSH (`22/tcp`), Tailscale (`tailscale0`) et le port applicatif (`8080/tcp` sur LAN ou `443/tcp` via reverse-proxy). Ne pas exposer `:11434` (Ollama) sur Internet.
- [ ] **Sauvegarde quotidienne chiffrée & signée** : exporter quotidiennement `/api/admin/backup` (qui inclut désormais `sha256` et `hmacSignature`) vers le NAS/disque externe et tester une restauration complète ([sauvegarde-et-retour-arriere.md](./sauvegarde-et-retour-arriere.md)).
- [ ] **Test de redémarrage physique (`sudo reboot`)** : vérifier qu'après redémarrage complet du serveur, les conteneurs `cfitness-os` et `ollama` reviennent en état `Up` sans intervention humaine.

---

## 4. Import des données réelles & Double fonctionnement (15 jours)

- [ ] Créer les comptes collaborateurs réels (`Carré de Soie` & `Beynost`), attribuer leurs mots de passe initiaux (`≥ 12` caractères) et leurs délégations par club (`GET/PUT /api/admin/delegations`).
- [ ] Renseigner les connecteurs réels dans `.env` / interface admin :
  - Passerelle locale **Heitz** (`HEITZ_WS_URL`, `HEITZ_WS_TOKEN`) et relais **Modbus portillons** (`10.10.0.21:502`, `10.20.0.21:502`).
  - Clé API **Brevo** (emails/SMS transactionnels & campagnes Lead) après validation SPF/DKIM du domaine `c.fitness`.
- [ ] Importer les exports réels : **CSV Adhérents Heitz**, **CSV Collaborateurs**, **Stocks EAN** et **Prospects Excel Lead**.
- [ ] Conserver **15 jours de double fonctionnement** avec les anciens logiciels avant toute résiliation définitive.
