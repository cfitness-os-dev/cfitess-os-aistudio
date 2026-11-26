# Recette & Validation : Équilibrage du Vivier Commercial Lead & Outillage de Production (26/11/2026)

## 1. Contexte et Objectifs

Dans le cadre du suivi de recette et des chantiers réservés à Antigravity (voies de décision RH/Lead, vivier commercial, outillage de déploiement), ce lot livre 4 fonctionnalités clés :
1. **Équilibrage dynamique & round-robin équitable** : algorithme d'affectation automatique tenant compte de la charge active et de la fraîcheur du dernier lead attribué.
2. **Réattribution automatique sur inactivité / absence (`POST /api/lead/automations/rebalance-stale`)** : détection des prospects sans contact commercial depuis $N$ jours ou dont le commercial est devenu indisponible (absence validée, compte désactivé, perte d'accès au club), et réaffectation vers le commercial disponible suivant avec audit et alertes.
3. **Transfert inter-clubs explicite (`POST /api/lead/prospects/:prospect_id/transfer`)** : transfert sécurisé avec validation RBAC bi-club, réaffectation au club cible, traçabilité d'audit et notification aux équipes d'accueil.
4. **Indicateurs et KPIs de conversion commerciale (`GET /api/lead/stats/conversion`)** : agrégation par club et par commercial des volumes actifs, convertis, perdus, stagnants et taux de transformation.
5. **Outillage de pré-vol et de sauvegarde pour la production réelle** :
   - `scripts/preflight_production_check.py` : contrôle de sécurité pré-vol (mode démo, session Bearer stricte, CORS, secrets, persistance).
   - `scripts/backup_production.py` : automatisation des archives signées HMAC via `rh_documents_archive.py` avec vérification d'intégrité et rotation des $N$ sauvegardes les plus récentes.

---

## 2. Détail des Développements

### Backend Rust (`src-rust/`)

- `src-rust/src/lead_automations.rs` :
  - Implémentation de `is_commercial_available_for_club` : contrôle d'habilitation active et vérification des congés/arrêts validés couvrant la date courante dans le fuseau horaire du club.
  - Implémentation de `resolve_best_commercial_for_club` : sélection du commercial le plus adapté avec option d'exclusion du commercial actuel en cas de prospect stagnant.
  - Route `POST /api/lead/automations/rebalance-stale` : réattribution en masse par club, génération des alertes `LeadAlertRecord` (`event_type: "commercial_reassigned"`) et des entrées `AuditEvent` (`lead.pool.reassign`).
  - Route `POST /api/lead/prospects/:prospect_id/transfer` : contrôle RBAC d'habilitation sur les clubs source et cible, mise à jour atomique, alertes et audit.
  - Route `GET /api/lead/stats/conversion` : calcul des KPIs globaux et ventilation par collaborateur commercial.
  - 3 tests d'intégration serveur HTTP ajoutés dans `mod tests`.
- `src-rust/src/routes.rs` :
  - Enregistrement des 3 nouvelles routes d'automatisation commerciale.
  - Départage équitable (round-robin pondéré) dans `resolve_available_commercial_for_club_at` : en cas d'égalité de charge minimale, sélection du commercial dont le dernier prospect attribué est le plus ancien.

### Outillage de Production (`scripts/`)

- `scripts/preflight_production_check.py` :
  - Vérification des variables d'environnement indispensables au mode production strict (`CFITNESS_DEMO_MODE=0`, `CFITNESS_STRICT_SESSION=1`, `CFITNESS_ALLOWED_ORIGINS`, secrets d'au moins 32 caractères).
  - Validation de l'intégrité structurelle de la base `cfitness_state.json` et de la présence d'au moins un compte administrateur.
- `scripts/backup_production.py` :
  - Orchestration de la création d'archive hors-ligne avec signature HMAC via `scripts/rh_documents_archive.py`.
  - Vérification d'intégrité SHA-256 immédiate.
  - Politique de rétention et purge des sauvegardes obsolètes (par défaut conservation des 7 plus récentes).
- `scripts/test_lead_pool_and_production.py` :
  - Suite de recette automatisée Python validant le comportement du pré-vol (cas nominal et cas en échec) et la rotation des sauvegardes.

---

## 3. Résultats des Tests et Contrôles

```
1. Backend Rust :
   cargo test --locked --manifest-path Cargo.toml
   -> 222 passed; 0 failed; 0 ignored; 0 measured (100% vert)

2. Frontend & Domaine :
   npm run lint && npm test && npm run build
   -> Lint : OK
   -> Tests Vitest : 179 passed; 0 failed (100% vert)
   -> Build Vite : Bundle index-y2h32Y5_.js généré avec succès en 2.56s

3. Recette Python :
   python scripts/test_lead_pool_and_production.py
   -> Test 1: Contrôle pré-vol de production -> OK
   -> Test 2: Sauvegarde automatisée et rotation -> OK
   -> 100% vert

4. Vérification orthographique cspell :
   npx cspell "scripts/preflight_production_check.py" "scripts/backup_production.py" "scripts/test_lead_pool_and_production.py"
   -> 0 erreur détectée
```

---

## 4. Périmètre & Respect des Réservations

- **Fichiers réservés à Codex** : aucun fichier réservé (`heitz_*.rs`, `recovery_evidence*.rs`, `src/domain/clientApi.ts`, `src/domain/heitz*.ts`, `views/Heitz*.tsx`, `LeadCommercialHubView.tsx`, et routes de réglages dans `routes.rs`) n'a été modifié.
- **Sécurité et données réelles** : aucun secret, aucun jeton privé, aucune coordonnée réelle n'a été insérée.
- **Rétrocompatibilité** : l'ensemble des règles de gestion, formats d'archive V1/V2 et contrats d'API existants restent strictement inchangés.
