# Guide de l'IA locale : veille GitHub, coordination avec Codex et règles de sécurité

> **À lire en entier avant toute action** (destiné à l'IA locale OpenCode / Strata, mais valable pour tout agent).
> Dépôt **public** : n'écrivez jamais de mot de passe, code PIN, jeton, clé API ou donnée réelle d'adhérent dans un fichier, un commit, un commentaire ou une PR.

---

## 1. Qui fait quoi

| Acteur | Compte | Rôle | Droits |
|---|---|---|---|
| **Francisco** (humain) | `pinto1230766` | Décideur, recette métier | Décision finale, déploiement |
| **Antigravity** (IA principale) | `pinto1230766` | Relecture complète des PR, fusion sur `main` quand tout est vert, RBAC/UI transverses, automatisations Lead, scripts de déploiement | Fusion via PR uniquement |
| **Codex** | `EvenAngel-CF` | Connecteur Heitz, recouvrement, réglages Lead (voir § 5) | Ouvre des PR, ne fusionne pas lui-même |
| **IA locale** (OpenCode + Strata, Qwen 3.6 sur RX 7900 XTX) | bot local | **Contrôle** les PR et propose des corrections **en brouillon** | **Aucune fusion, aucun push sur `main`** |

Suivi général : **Issue #21**. Suivi Heitz/recouvrement : **Issue #68** (domaine de Codex).

---

## 2. Ce qui s'est passé (incident du 25 au 26/11/2026) et pourquoi ce guide existe

L'ancien script de veille demandait à l'IA locale de faire `git reset --hard`, de fusionner la PR elle-même, de **pousser directement sur `main`** puis de **fermer la PR**. Résultat :

1. **Push direct sur `main` sans relecture** : commits `5d7bb22`, `b004eb5` et `b3aa3e3`. Le premier a ajouté au dépôt public des fichiers temporaires (`.temp/ticket21-*.txt/json`, environ 1 500 lignes de commentaires). Le deuxième a modifié des zones Lead, dont une partie est réservée à Codex.
2. **Modifications non commitées laissées dans des fichiers de Codex** (`heitz_live.rs`, `heitz_recovery_readers.rs`). L'une utilisait `or_else(|| ...)` sur un `Result`, ce qui fait **planter la compilation Rust**. Elle ajoutait aussi des champs Heitz (`canceled`, `expirationDate`…) dont le schéma n'a **jamais été vérifié** auprès du fournisseur.
3. **Risque de fermer les PR de Codex** au lieu de les laisser à la relecture.

### Correctifs appliqués

- Modifications locales sur les fichiers de Codex **annulées** (`git checkout --`). La version d'origine de Codex compile et passe les tests.
- `.temp/` retiré du dépôt et ajouté à `.gitignore`.
- **Garde-fou Git local** `.git/hooks/pre-push` : tout `git push` vers `main` depuis ce PC est **refusé**.
- **Nouveau `watch-github.ps1`** (non versionné, propre au poste) :
  - il teste chaque PR dans un **dossier séparé** (`git worktree` sous `E:\cfos-review`) sans toucher au dossier de travail ;
  - il publie **seulement un commentaire de bilan** (aucune fusion, aucune fermeture) ;
  - il ne traite que les tickets portant l'étiquette **`ia-locale`**, sur une branche `ia-locale/ticket-N`, et ouvre une **PR brouillon** ;
  - il **abandonne automatiquement** toute proposition qui touche un fichier réservé à Codex ou dont les tests sont rouges.
- `sync-pour-antigravity.bat` met maintenant les modifications locales de côté (`git stash`) avant de synchroniser, au lieu de les écraser avec `reset --hard`.

---

## 3. Processus de veille (toutes les 15 minutes)

1. `gh pr list --state open` → pour chaque PR **non brouillon** dont le commit a changé :
   1. `git fetch origin pull/N/head`, puis `git worktree add --detach E:\cfos-review\pr-N <sha>`.
   2. Lancer la **suite officielle** (§ 4) dans ce dossier.
   3. Publier **un commentaire** sur la PR : résultats et verdict VERT/ROUGE.
   4. Supprimer le dossier de test.
   5. **Ne jamais** approuver, fusionner, fermer ni pousser sur la branche de la PR.
2. `gh issue list --state open --label ia-locale` → pour chaque ticket étiqueté :
   1. Créer une branche `ia-locale/ticket-N` depuis `origin/main`, dans un dossier séparé.
   2. Faire **la plus petite correction possible**, avec un test qui la prouve.
   3. Si un fichier réservé est touché → **abandon** et commentaire sur le ticket.
   4. Si la suite officielle est rouge → **abandon** et commentaire avec le résumé.
   5. Si tout est vert → commit, push de la **branche** (jamais `main`), puis **PR brouillon** et commentaire sur le ticket.
3. La **fusion** sur `main` est réservée à **Antigravity ou Francisco**, après relecture complète.

> Les tickets sans étiquette `ia-locale` (#21, #46, #47, #68…) ne sont **pas** pour l'IA locale : ils relèvent de Codex ou d'Antigravity.

---

## 4. Suite de validation officielle (obligatoire avant toute conclusion)

```powershell
cargo test --locked --manifest-path Cargo.toml
cmd /c "npm run lint && npm test && npm run build"
```

Recettes HTTP Python (serveur Rust jetable sur `127.0.0.1`, faux fournisseurs, aucune donnée réelle) :

```powershell
cargo build --manifest-path Cargo.toml
$env:CFITNESS_TEST_BINARY = (Resolve-Path "target\debug\cfitness-os.exe").Path
$env:TMPDIR = $env:TEMP
# Secrets des comptes FICTIFS de démo : à définir dans la session uniquement, JAMAIS dans un fichier.
#   CFITNESS_TEST_ADMIN_SECRET, CFITNESS_TEST_COMMERCIAL_SECRET, CFITNESS_TEST_MANAGER_SECRET, CFITNESS_TEST_CHLOE_SECRET
python scripts/test_heitz_collection.py
python scripts/test_recovery_evidence.py
python scripts/test_heitz_recovery_readers.py
```

Une recette qui affiche `KeyError: 'CFITNESS_TEST_…'` ou `'TMPDIR'` n'est **pas un échec du code**, mais une variable d'environnement manquante. Signalez-la comme « non exécutée », pas comme « réussie ».

Ne jamais annoncer « tout est vert » sans avoir **vu** `test result: ok` (Rust), `fail 0` (TypeScript) et `✓ built` (Vite).

---

## 5. Fichiers et zones réservés à Codex (`EvenAngel-CF`) : NE PAS MODIFIER

- `src-rust/src/heitz_*.rs` (dont `heitz_live.rs`, `heitz_collection.rs`, `heitz_recovery_readers.rs`, `heitz_recovery_links.rs`)
- `src-rust/src/recovery_evidence*.rs`
- `src/domain/heitz*.ts`, `src/components/views/Heitz*.tsx`
- `src/domain/clientApi.ts`
- Formulaire de réglages dans `src/components/views/LeadCommercialHubView.tsx`
- Dans `src-rust/src/routes.rs` : `get_lead_settings`, `put_lead_settings` et leurs tests

**Fichiers sensibles** (modification possible, mais relecture humaine obligatoire) : `routes.rs`, `models.rs`, `rbac.rs`, `Dockerfile`, `docker-compose.yml`, `deploy-linux.sh`, `package*.json`, `Cargo.*`.

---

## 6. À FAIRE ✅

- Travailler **uniquement sur une branche dédiée**, dans un dossier séparé (`git worktree`).
- Lire le ticket **et tous ses commentaires** avant de coder (`gh issue view N --comments`).
- Faire des changements **petits et ciblés**, chacun accompagné d'un test.
- Respecter l'architecture **bi-club** (`club-carre-soie`, `club-beynost`), le **RBAC** côté serveur et la persistance atomique (`.tmp` + renommage, retour en arrière en mémoire en cas d'échec).
- Indiquer honnêtement ce qui n'a **pas** été vérifié (schéma Heitz réel, recette navigateur, mobile…).
- Écrire en **français** dans les commentaires et les PR.
- Sous PowerShell 5.1 : séparer les commandes par `;`, ou utiliser `cmd /c "a && b"`.
- En cas de doute : **ne rien pousser** et laisser un commentaire pour Antigravity / Francisco.

## 7. NE JAMAIS FAIRE ❌

- `git push origin main` (bloqué par le garde-fou), `git push --force`, ou supprimer une branche distante (surtout celles de Codex).
- `gh pr merge`, `gh pr close`, `gh pr review --approve`, `gh issue close`.
- `git reset --hard` ou `git checkout -- .` dans le dossier de travail principal, ce qui détruit le travail en cours de Francisco.
- `git add .` à la racine sans vérifier la liste (risque d'ajouter `.temp/`, `.env`, des journaux ou des bases de données).
- Modifier un fichier réservé à Codex (§ 5).
- Inventer un schéma ou un champ d'API Heitz, un montant, un encaissement, une signature ou une clause de CGV. **Inconnu doit rester inconnu**, jamais 0 ni une liste vide.
- Écrire un secret, un code PIN, un mot de passe ou une donnée réelle (adhérent, IBAN, téléphone) dans le dépôt.
- Désactiver un test, l'affaiblir ou le marquer `ignore` pour « faire passer » la suite.
- Déployer sur le serveur club (`192.168.1.120`) ou modifier `.env` : c'est réservé à Francisco ou Antigravity.

---

## 8. Modèle de commentaire de bilan

```markdown
### Veille IA locale : contrôle de la PR #N (commit abc1234)

Rust : test result: ok. 170 passed; 0 failed
TypeScript/Vite : tests 159 pass 159 fail 0, build OK
Recette scripts/test_xxx.py : PASS | NON exécutée (variable manquante)

**Verdict : VERT, prêt pour la relecture finale (Antigravity / Francisco).**
Non vérifié : <liste honnête>.
_Contrôle en lecture seule : aucune fusion, fermeture ou modification._
```

---

## 9. Démarrage et arrêt

| Raccourci Bureau | Effet |
|---|---|
| `1 - Demarrer IA Auto (OpenCode)` | Lance Strata (port 8080), attend 75 s, puis lance la veille sécurisée |
| `2 - Passer sur Antigravity (Stop IA + Git Pull)` | Arrête l'IA locale, met les modifications locales de côté (`stash`), puis synchronise `main` |
| `3 - Arreter IA Locale (Liberer GPU)` | Arrête Strata et la veille |

LM Studio n'est **pas** nécessaire et doit rester **fermé**, pour laisser la VRAM à Strata.

État de la veille : `.git/cfos-watch-state.json` (PR et tickets déjà traités). Supprimez ce fichier pour forcer un nouveau contrôle.

## 10. En cas de problème

- Compilation cassée sur `main` → **ne pas corriger directement**. Ouvrez un ticket ou commentez l'Issue #21 avec l'erreur exacte.
- Conflit avec une branche de Codex → ne pas résoudre à sa place. Commentez la PR.
- Strata injoignable → la veille des PR continue (elle n'utilise pas le modèle). Seuls les tickets sont reportés.
