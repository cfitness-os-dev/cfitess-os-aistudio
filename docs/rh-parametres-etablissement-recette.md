# Recette — Paramètres RH par établissement (`MC10`)

Branche : `feat/rh-site-rules-absences-needs` (issue de `main` à `ee3ae02`).

## 1. Périmètre livré

Remplacement de la maquette statique `MC10` (« Paramètres RH par établissement ») par un module serveur persistant par établissement (`club-carre-soie` / `club-beynost`) :

- **Backend Rust** (`src-rust/src/hr_site_rules.rs`, `models.rs`, `seed.rs`, `main.rs`, `routes.rs`) :
  - Route unique authentifiée `GET/POST /api/hr/site-rules/:club_id` avec commandes typées :
    - `save_base_rules` : heure de début de journée (`HH:MM`), alerte pause minimale (`1..=12` h), plafond heures complémentaires (`1..=48` h), pause maximale planification auto (`1..=12` h), disposition des alertes (`split_13_6` | `single_list`), blocage jours consécutifs, activation du module Missions et visibilité des règles du rapport RH ;
    - `save_counter_rules` : mode d'acquisition CP, période d'annualisation, heures du dimanche dans l'annualisation, compteur RTT contrats en heures ;
    - `save_badge_settings` : fréquence de badgeage (`each_shift` | `consecutive_shift_series`) et badgeage des pauses sur tablette ;
    - `save_absence_motive` : création/édition par établissement avec détection de doublon insensible à la casse (`409`) et recomputation des compteurs ;
    - `save_staffing_need` & `remove_staffing_need` : besoins en personnel liés strictement aux postes (`positions`) du même établissement, créneau `HH:MM`, plage jour/semaine/week-end, besoin fixe ou variable, effectif minimal `1..=30`.
- **Domaine TypeScript & UI React** (`src/domain/hrSiteRules.ts`, `src/domain/hrSiteRules.test.ts`, `src/components/views/HrSiteRulesView.tsx`, `src/components/views/MonCompteRhHubView.tsx`) :
  - Chargement différé (`React.lazy` + `Suspense`) préservant un chunk `MonCompteRhHubView` à `477.60 kB` (`HrSiteRulesView` `25.98 kB`).
  - Synchronisation stricte sur le club sélectionné globalement (`club-carre-soie` ou `club-beynost`) avec garde de brouillon non sauvegardé (`useLeadDraftGuard`) et bouton `Actualiser`.
  - 4 rubriques responsives : `Règles, alertes & badgeuse`, `Compteurs & annualisation`, `Motifs d’absence`, `Besoins en personnel`.

## 2. Garanties techniques, RBAC et compatibilité #49

- **Authentification & cloisonnement** : jeton `Bearer` obligatoire (`401` sur en-tête forgé), refus `403` pour collaborateur standard, lecture seule ou planificateur sans droit d'administration, cloisonnement strict par établissement (`emp-master` limité à Carré de Soie).
- **Badgeuse propriétaire uniquement** : `save_badge_settings` vérifie `is_owner_or_super_admin` côté serveur (`403` même si un profil délégué ou `emp-master` peut éditer les règles de base).
- **Concurrence et intégrité disque** : révision optimiste SHA-256 (`expectedRevision`, `409 Conflict` sur écriture concurrente), clonage d'état et écriture atomique sur disque avec rollback complet mémoire/disque/audit si la persistance échoue (`500`).
- **Compatibilité descendante (#49)** : les nouveaux champs `site_absence_motives` et `site_staffing_needs` de `AppDatabaseState` sont annotés `#[serde(default)]` ; les anciens états JSON sans ces champs se rechargent proprement avec matérialisation paresseuse des 8 motifs par défaut à la lecture/édition.
- **Écart détecté et corrigé en recette réelle Chrome** : les premières graines du dépôt (`src-rust/src/seed.rs`, `src/domain/types.ts`, `AdminRightsView.tsx`) utilisent exclusivement `split_13_6` et `single_list` pour `alerts_layout`. La recette interactive Chrome a détecté un rejet `400` sur les valeurs initialement attendues (`grouped`/`list`/`compact`) ; l'API, les validateurs, le formulaire `HrSiteRulesView` et les tests ont été alignés sur `split_13_6` | `single_list` avant la passe de validation finale.

## 3. Vérifications exécutées après le dernier correctif

| Contrôle | Commande / Support | Résultat observé |
| --- | --- | --- |
| Tests unitaires Rust | `cargo test --locked --manifest-path Cargo.toml` | **136 passed, 0 failed, 0 ignored** (inclut les 2 tests `hr_site_rules::tests`) |
| Compilation Rust | `cargo build --locked --manifest-path Cargo.toml` | Succès (`Finished dev profile`) |
| Types, tests TS & build Vite | `cmd /c "npm run lint && npm test && npm run build"` | `tsc --noEmit` OK, **126/126** tests TS passed, build Vite OK (`HrSiteRulesView` `25.98 kB`, `MonCompteRhHubView` `477.60 kB`) |
| Recette HTTP MC10 | `python scripts/test_hr_site_rules.py` | **5/5** contrôles validés (`401` forgé, `403` rôles/badgeuse, CRUD complet, course `200/409`, rollback disque, redémarrage, `externalSends: 0`) |
| Recette HTTP Dossier RH (#50) | `python scripts/test_hr_employee_dossier.py` | **6/6** contrôles validés (`externalSends: 0`) |
| Recette HTTP Organisation (#48/#51) | `python scripts/test_hr_organisation.py` | **18/18** contrôles validés (`externalSends: 0`) |
| Recette visuelle Chrome (`/mon-compte/MC10`) | Serveur local éphémère (`127.0.0.1:18151`, mode démo strict) | Enregistrement réel `dayStartHour = 07:00` + `alertsLayout = split_13_6`, relecture `Actualiser`, parcours des 4 onglets, ajout besoin `Accueil Club` (`2 personne(s)`, `Permanence accueil`) confirmé après `Actualiser` |
| Responsive tablette | Chrome `768×1024` (`evaluate_script`) | `scrollWidth: 763`, `clientWidth: 763`, `overflow: false` |
| Responsive largeur réduite / mobile | Chrome demandé `390×844` (plancher Windows `495px`) | `scrollWidth: 495`, `clientWidth: 495`, `overflow: false` |

### Captures d’écran archivées

- Tablette (`768×1024`, rubrique Règles, alertes & badgeuse) : [parametres-regles-tablette.jpg](./evidence/rh-parametres-etablissement/parametres-regles-tablette.jpg)
- Largeur mobile Chrome Windows (`495px`, rubrique Besoins en personnel) : [parametres-besoins-mobile.jpg](./evidence/rh-parametres-etablissement/parametres-besoins-mobile.jpg)

## 4. Limites connues et périmètre non inclus

- Sous Windows, la fenêtre Chrome ne peut pas descendre sous `495px` de largeur réelle lors d'un `resize_page(390, 844)` : l'absence de débordement horizontal est prouvée à `495px` et en grille `1 colonne` mobile (`grid-cols-1`), mais pas mesurée physiquement à `390px` sur un émulateur mobile dédié.
- Conformément au périmètre MC10, la saisie des règles de compteurs et d'annualisation configure les paramètres de l'établissement sans lancer de calcul de paie ou de déduction automatique.
- Les modules hérités `src-rust/src/site_settings.rs` et `src/views/PlanningAndModulesView.tsx` n'ont pas été modifiés dans cette branche afin de préserver la séparation de périmètre avec les autres PR en cours.
