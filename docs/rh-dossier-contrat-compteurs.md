# Dossier salarié, contrat et compteurs opérationnels des deux côtés (#50)

24 novembre 2026 — branche `feat/rh-employee-dossier-contracts-counters`, fondée sur `main` (`e58bc30`). Recette locale uniquement ; aucun déploiement, aucun envoi externe ni écriture vers Skello ou Heitz.

## Périmètre livré

1. **Référentiel serveur unique (`src-rust/src/models.rs`, `src-rust/src/seed.rs`, `src-rust/src/employee_lifecycle.rs`, `src-rust/src/routes.rs`)** :
   - Ajout des routes canoniques protégées par jeton `Bearer` :
     - `GET /api/hr/dossiers/:club_id` : liste des dossiers collaborateurs rattachés à l’établissement et autorisés pour l’acteur selon son profil et ses équipes encadrées (`ORG04-07`, `teamIds` distinct de `managedTeamIds`).
     - `GET /api/me/dossier/:club_id` : projection canonique du propre dossier du salarié connecté depuis `db.employees`, sans aucune duplication dans `personal_workspace`.
   - Durcissement des mutations existantes :
     - `PATCH /api/admin/employees/:emp_id` : contrôle `Bearer`, rattachement au club ciblé, droits granulaires (`ORG04-08` identité, `ORG04-09` activation/archivage avec protection contre auto-désactivation/dernier admin, `ORG04-12`/`ORG04-13` contrat/volume horaire/forfait jours, `ORG04-11` salaire), vérification de révision optimiste (`expectedRevision` → `409 Conflict` si périmée) et persistance atomique préalable.
     - `PUT /api/admin/employees/:emp_id/counters` : contrôle `Bearer`, droit `ORG04-16` + (`ORG04-08` ou `ORG04-12`) sur le club et l’équipe cible, motif obligatoire (1–1000 caractères), bornes strictes (CP `0..100`, RTT `0..50`, annualisation `-500..+500`), révision optimiste (`409 Conflict`), historisation avant/après dans `AppDatabaseState.employeeCounterHistory` et journal d’audit `HR_COUNTER_ADJUSTMENT`, avec rollback complet mémoire/disque en cas d’erreur d’écriture.
   - Masquage serveur strict : si l’acteur ne dispose pas de `ORG04-10`, les clés `email`, `phone`, `sensitiveBank`, `monthlyGrossEur`, `hourlyRateEur` et `loadedCostFactor` sont omises de la réponse JSON. Si l’acteur ne dispose pas de `ORG04-16`, `counter`, `counterRevision` et `counterHistory` sont omis.
   - Compatibilité #49 : le champ `employeeCounterHistory` porte `#[serde(default)]` afin que tout `cfitness_state.json` existant sans ce champ se recharge sans erreur ni écrasement.

2. **Interface unifiée & correction de synchronisation club (`src/domain/hrEmployeeDossier.ts`, `HrEmployeeDossierView.tsx`, `MonCompteRhHubView.tsx`, `PersonalWorkspaceView.tsx`)** :
   - Remplacement du parcours blueprint `MC02` par `HrEmployeeDossierView` dans `Collaborateurs et RH`.
   - Ajout de l’onglet **Mon dossier** dans `Mon compte` (`PersonalWorkspaceView.tsx`), branché sur `GET /api/me/dossier/:club_id` en lecture seule stricte (mêmes valeurs d’identité, contrat, rattachements multi-clubs/équipes et compteurs + historique avant/après).
   - Synchronisation du sélecteur local `Club` de `MonCompteRhHubView.tsx` avec le sélecteur global `clubFilter` via `resolveEffectiveClubSiteId` (correction de l’anomalie signalée en #50/#52 lorsque le filtre global est sur `Beynost`).
   - Données absentes affichées explicitement comme `Non renseigné` ; aucune règle réglementaire d’acquisition ou de débit automatique de congés n’a été inventée.

## Vérifications exécutées

- **Tests Rust (`cargo test --locked`)** : **134/134** tests passés, 0 avertissement (incluant la persistance dossier/contrat/compteurs, la relecture des deux côtés, le refus `403` salarié/lecture seule/hors équipe encadrée/hors club, le masquage des clés sensibles, le profil différent sur deux clubs `emp-master`, les conflits `409`, l’échec disque sans mutation et le rechargement #49 sans `employeeCounterHistory`).
- **Lint & tests TypeScript (`npm run lint && npm test && npm run build`)** : `tsc --noEmit` OK, **121/121** tests TypeScript passés (incluant `src/domain/hrEmployeeDossier.test.ts`), build Vite OK.
- **Recette HTTP réelle (`scripts/test_hr_employee_dossier.py`)** : **6/6** groupes réussis contre le binaire Rust sur boucle locale `127.0.0.1` et dossier temporaire jetable (`CFITNESS_STRICT_SESSION=1`), incluant `401` sur en-tête forgé, modification + relecture des deux côtés, refus `403` + absence des clés sensibles, multi-club différencié `emp-master`, conflit `409`, simulation échec disque `500` sans mutation et durabilité après redémarrage réel du serveur.
- **Recette visuelle Chrome local (`127.0.0.1:18150`, données fictives)** :
  - Sélection globale `C.Fitness Beynost` → ouverture `Collaborateurs et RH` : le sélecteur local `Club` affiche bien `C.Fitness Beynost`.
  - Modification motivée des compteurs de Chloé Morel (`11 -> 14.5 j` CP N acquis) par Mario Carvalho puis relecture immédiate dans `Mon compte → Mon dossier` connecté en tant que Chloé Morel (sans aucun formulaire d’édition).
  - Contrôle responsive sans débordement horizontal : tablette `768×1024` (`scrollWidth: 763 === clientWidth: 763`) et fenêtre réduite mobile (`scrollWidth: 495 === clientWidth: 495`).
  - Captures : `docs/evidence/rh-dossier-contrat-compteurs/responsable-dossier-tablette.jpg` et `docs/evidence/rh-dossier-contrat-compteurs/salarie-mon-dossier-mobile.jpg`.

## Limites connues

- Recette exécutée sur données fictives locales et Chrome de bureau redimensionné (pas d’appareil physique ni d’import de données réelles).
- Aucune règle automatique de calcul, d’acquisition ou de débit de congés/RTT/annualisation n’est appliquée lors de la validation d’une absence.
- Les autres rubriques d’organisation RH (`MC08`–`MC10`, `docs/rh-organisation-options-auditees.csv`) restent hors périmètre de ce lot.
