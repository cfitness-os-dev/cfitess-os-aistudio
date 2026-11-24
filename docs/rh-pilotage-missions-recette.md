# Recette — Pilotage, Indicateurs et Missions par établissement (`MC08`)

Branche : `feat/rh-pilotage-missions` (issue de `main` à `a2c81fd`).

## 1. Périmètre livré

Remplacement de la maquette statique `MC08` (« Pilotage, indicateurs et missions ») par un module serveur persistant et cloisonné par établissement (`club-carre-soie` / `club-beynost`) :

- **Backend Rust** (`src-rust/src/hr_pilotage.rs`, `main.rs`, `routes.rs`) :
  - Route authentifiée `GET/POST /api/hr/pilotage/:club_id` :
    - lecture en base des indicateurs du club (`SiteKpis`), des missions budgétées (`MissionRecord`) et d'une synthèse opérationnelle calculée (`activeEmployeesCount`, `publishedShiftsCount`, `pendingLeaveRequestsCount`, `openAnomaliesCount`, heures missions réalisées/prévues) ;
    - `save_site_kpis` : mise à jour de la période, des heures travaillées, de la rétention adhérents et — sous réserve `canEditFinancialKpis` — du CA, de la masse salariale, de la productivité horaire et de l'objectif mensuel ;
    - `create_mission` / `update_mission` (`+addHours`, édition, passage `active`/`done`) / `delete_mission` strictement limités aux missions du club actif et bloqués (`400`) à la création lorsque `site.settings.missionsModuleActive === false`.
- **Domaine TypeScript & UI React** (`src/domain/hrPilotage.ts`, `src/domain/hrPilotage.test.ts`, `src/components/views/HrPilotageMissionsView.tsx`, `src/components/views/MonCompteRhHubView.tsx`) :
  - Chargement différé (`React.lazy` + `Suspense`) préservant le chunk `MonCompteRhHubView` à `478.00 kB` (`HrPilotageMissionsView` à `21.32 kB`).
  - Libellés ordinaires en français (aucun jargon interne ni multiplicateur fictif), affichage explicite `Non renseigné` (jamais `0 €`) lorsque les valeurs financières sont absentes ou masquées, garde de brouillon (`useLeadDraftGuard`), filtres `Toutes` / `En cours` / `Terminées` et export CSV sûr.

## 2. Garanties techniques, RBAC et compatibilité #49

- **Authentification & matrice RBAC** : jeton `Bearer` obligatoire (`401` sur en-tête forgé), refus `403` pour collaborateur standard (`employe_standard`) et hors-club, lecture seule strictement appliquée sur `lecture_seule_avancee` (`canEditOperationalKpis: false`, `canManageMissions: false`, `canViewFinances: false`).
- **Rédaction financière stricte** : pour tout profil sans droit Finance (ex. responsable Carré de Soie `emp-sarah`), `revenueEur`, `payrollMassEur`, `productivityPerHour`, `monthlyTargetEur`, `hourlyBudgetEur`, `estimatedBudgetEur` et `loggedCostEur` valent strictement `null`, sont exclus du CSV et toute mutation envoyant un champ financier est rejetée (`403`) sans altérer les données existantes en base.
- **Concurrence, intégrité & compatibilité #49** : aucun changement requis sur `AppDatabaseState` (`kpis` et `missions` déjà compatibles), révision optimiste SHA-256 (`409 Conflict` sur écriture concurrente), clonage complet + écriture atomique disque avec rollback intégral (`500`) en cas d'échec E/S.

## 3. Vérifications exécutées après le dernier correctif

| Contrôle | Commande / Support | Résultat observé |
| --- | --- | --- |
| Tests unitaires Rust | `cargo test --locked --manifest-path Cargo.toml` | **138 passed, 0 failed, 0 ignored** (inclut les 2 tests `hr_pilotage::tests`) |
| Compilation Rust | `cargo build --locked --manifest-path Cargo.toml` | Succès (`Finished dev profile`) |
| Types, tests TS & build Vite | `cmd /c "npm run lint && npm test && npm run build"` | `tsc --noEmit` OK, **129/129** tests TS passed, build Vite OK (`HrPilotageMissionsView` `21.32 kB`, `MonCompteRhHubView` `478.00 kB`) |
| Recette HTTP MC08 | `python scripts/test_hr_pilotage.py` | **5/5** contrôles validés (`401` forgé, `403` hors-club/lecture seule/finance, porte `400` Carré de Soie, CRUD Beynost, course `200/409`, rollback disque, redémarrage, `externalSends: 0`) |
| Recette HTTP MC10 | `python scripts/test_hr_site_rules.py` | **5/5** (`externalSends: 0`) |
| Recette HTTP Dossier RH (#50) | `python scripts/test_hr_employee_dossier.py` | **6/6** (`externalSends: 0`) |
| Recette HTTP Organisation (#55) | `python scripts/test_hr_organisation.py` | **18/18** (`externalSends: 0`) |
| Recette visuelle Chrome (`/mon-compte/MC08`) | Serveur local éphémère (`127.0.0.1:18152`, mode démo strict) | Beynost : saisie `CA = 47200` + relecture `Actualiser` (`47 200 €`), création mission `"Signalétique Hiver"` (`12 h`) + `+1 h` + `Actualiser` (`1 h / 12 h`, `26 € / 312 €`). Carré de Soie : bandeau explicite `"Module Missions désactivé sur Carré de Soie"` sans formulaire de création. |
| Responsive tablette | Chrome `768×1024` (`evaluate_script`) | `scrollWidth: 763`, `clientWidth: 763`, `overflow: false` |
| Responsive largeur réduite / mobile | Chrome demandé `390×844` (plancher Windows `495px`) | `scrollWidth: 495`, `clientWidth: 495`, `overflow: false` |

### Captures d’écran archivées

- Tablette (`768×1024`, Indicateurs du club — Beynost) : [pilotage-indicateurs-tablette.jpg](./evidence/rh-pilotage-missions/pilotage-indicateurs-tablette.jpg)
- Largeur mobile Chrome Windows (`495px`, Missions budgétées — Beynost) : [pilotage-missions-mobile.jpg](./evidence/rh-pilotage-missions/pilotage-missions-mobile.jpg)

## 4. Limites connues et périmètre non inclus

- Sous Windows, la fenêtre Chrome ne peut pas descendre sous `495px` de largeur réelle lors d'un `resize_page(390, 844)` : l'absence de débordement horizontal est prouvée à `495px`, pas mesurée physiquement à `390px` sur émulateur mobile dédié.
- Les anciens modules `src-rust/src/missions.rs`, `src-rust/src/site_settings.rs` et `src/views/PlanningAndModulesView.tsx` n'ont pas été modifiés dans cette branche afin de préserver la séparation de périmètre.
