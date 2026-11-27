# Délégations commerciales Lead : recette du 27 novembre 2026

Branche fix/lead-contact-delegations, intégrant le main #114/abef002 et le complément contacts. Copie locale et fichiers/données fictifs, aucun fournisseur réel ni déploiement.

## Comportement vérifié

Une délégation explicite du module Lead fait autorité sur le profil par défaut. create autorise la création du contact ; update son édition ; write, edit (action générique de l’administration) et * couvrent les deux. view/export n’autorisent aucune écriture. Une politique sur un autre club n’accorde pas l’accès au club demandé. Plusieurs lignes utilisent l’union du moteur commun et ne dépendent pas de leur ordre.

Compte actif et rattachement restent obligatoires. Le droit d’édition conserve aussi le contrôle du dossier : responsable, assigné ou créateur habilité. Retirer le droit refuse immédiatement le rejeu d’une opération déjà enregistrée et canEdit devient faux. Une délégation Lead ne change ni le profil RH, ni les rattachements, ni l’administration de l’organisation ou les droits financiers.

La règle RDV livrée par Antigravity dans #114 s’appuie désormais sur le même moteur pour update/write/edit : create seul ne donne pas le droit de modifier un rendez-vous. Le repli legacy n’existe qu’en l’absence de toute politique explicite Lead de cet acteur.

## Preuves exécutées après intégration #114

- **19 tests contacts ciblés réussis**, dont sept nouveaux groupes : habilitation d’un salarié simple sans élévation RH, priorité explicite, actions indépendantes, révocation/rejeu, propriété/assignation et compte actif, alias edit et refus view/export, union indépendante de l’ordre.
- **243 tests Rust complets réussis, 0 échec** sur l’arbre combiné ; backend compilé avec succès.
- **207 tests TypeScript, lint et build Vite réussis** sur le frontend inchangé par les correctifs Rust #113/#114.
- **scripts/test_lead_contacts_http.py : sept groupes PASS** (création/édition des deux clubs avec délégation Chloé, refus hors droits, réémissions, conflit, validation/taille HTTP, panne sans mutation, concurrence et redémarrage).
- **scripts/test_lead_delegations_http.py : cinq groupes PASS** sur le vrai processus Rust, avec configuration par PUT administrateur (aucune injection pour contourner l’API), écriture commerciale, révocation/rejeu, redémarrage, actions distinctes, refus RDV view, puis comparaison create seul/autre club/lignes multiples.
- **Navigateur réel** sur copie isolée port54738 : connexion Chloé, club unique Beynost, création Délégation Fictive sans email/consentement inventé, compteur1→2, édition et affichage de note ; aucun menu RH responsable ou Finances attribué. Cette copie utilise le backend du complément contacts antérieur aux derniers correctifs de configuration ; elle ne prouve pas l’UI d’administration #111/#114.
- Formulaires ordinateur/mobile/tablette du lot précédent documentés dans lead-contacts-partages-recette-2026-11-27.md. Aucune prétention à une deuxième recette complète de toutes les rubriques.

## Comparaison contacts et modification RDV

| Politique explicite | Création contact | Modification RDV |
| --- | --- | --- |
| view sur le club, malgré profil planificateur | Refus | Refus403 |
| create seul sur le club | Autorisée200 | Refus403 |
| write uniquement sur l’autre club | Refus403 | Refus403 |
| view puis write sur le même club | Autorisée200 | Autorisée200 |

Les attentes du script n’ont pas été affaiblies pour obtenir ces résultats.

## Historique des écarts corrigés

1. #110 affichait le module Lead mais le PUT le refusait400. Corrigé par #111 et recontrôlé réellement.
2. #111 retombait sur le profil après refus de la politique view. Corrigé par #113.
3. #113 restait divergent pour create seul, politique d’un autre club et union des lignes ; trois écarts HTTP reproduits et transmis dans #21 commentaire7213604626.
4. #114 intègre le moteur commun et les cinq groupes stricts passent sur l’arbre combiné.

Les correctifs de routes/seeds/UI d’administration restent attribués à Antigravity ; Codex n’a pas modifié ces fichiers simultanément.

## Portée et limites

Validation du périmètre contacts et règles d’accès décrites, proposition de relecture de PR112 ; aucune fusion ni mise en ligne par Codex. La fusion d’une PR ne prouve pas un déploiement, une migration de droits existants ou une réception en club.

La création réussie pour Chloé concerne la branche combinée incluant le consommateur contacts de PR112 ; le seed de délégation seul ne suffisait pas. La configuration graphique détaillée, les états des comptes réels, l’annulation RDV distincte et les intégrations/appareils réels ne sont pas certifiés par ces tests.

Segments en masse, ancien planning simulé, opposition SMS et autres fonctions encore locales restent hors périmètre. Pas d’annonce de parité exhaustive Lead/Skello ou de pilote global exploitable.
