# Recette — Communication RH programmée

Version : branche `feat/rh-scheduled-communications`, base PR #90 (`63d1489`). Environnement local fictif, aucune mise en ligne.

## Objectif et référence

La communication interne persistante pouvait être publiée immédiatement uniquement. Le responsable peut maintenant choisir une date, conserver la programmation côté serveur, la relire et l’annuler avant traitement. Le serveur publie dans les notifications du compte et du club à échéance.

Le relevé Skello `public/references/atlas_1605_entries.json`, contrat ECR-COM01, recense destinataires, copie cachée, objet, corps et pièce jointe annoncée à 4 Mo. Il ne prouve pas une programmation dans Skello : cette livraison est une amélioration de C.Fitness OS. Elle ne remplace pas l’email collectif ni les pièces jointes de référence.

## Contrat réellement développé

- Canal interne uniquement. Aucun email, SMS, WhatsApp, Heitz, portillon ou prestataire appelé.
- GET/POST `/api/hr/communications/:club_id/scheduled` ; POST `/api/hr/communications/:club_id/scheduled/:id/cancel`.
- Session active obligatoire ; profil responsable explicitement autorisé dans ce club et permission ORG04-07 appliquée à chaque destinataire, y compris équipes gérées.
- Objet/message validés comme la publication immédiate ; 1–200 destinataires, dédupliqués, sélection figée. La liste n’est pas recalculée à partir d’un filtre au moment de l’échéance.
- Date ISO avec fuseau côté API ; saisie dans le fuseau de l’appareil affiché à l’utilisateur. Entre une minute et 366 jours. Les dates locales impossibles sont refusées.
- Au maximum 100 programmations en attente par auteur et club ; historique paginé par 50, propre à l’auteur et au club.
- Relance du même identifiant/contenu/date : même programmation. Modification de ce contenu ou utilisation de cette opération en publication immédiate : conflit, aucun doublon.
- Traitement serveur toutes les 15 secondes, 50 programmations au maximum par passage. Les retards après arrêt sont repris au redémarrage. Pas de précision à la seconde garantie.
- Droits et destinataires sont revérifiés à échéance. Un destinataire devenu interdit/inactif ou une boîte mal formée bloque toute la publication, sans délivrance partielle. État « À vérifier » et motif générique dans l’historique ; créer une nouvelle programmation après correction, sans reprise silencieuse.
- États Programmé / Publié / Annulé / À vérifier ; annulation avec confirmation dans la page. Une publication déjà traitée ne peut pas être annulée. Répéter une annulation confirmée ne crée pas un nouvel audit.
- Publication, notifications, audit et état final sont persistés ensemble avant confirmation. Une erreur disque laisse mémoire/disque inchangés ; le prochain passage réessaie.
- `CFITNESS_RH_SCHEDULER=0` suspend ce traitement. L’API l’indique et l’interface affiche la suspension ; les programmations restent enregistrées. Actif par défaut au démarrage du backend, strictement interne.

## Résultats exécutés

| Contrôle | Résultat |
| --- | --- |
| TypeScript strict | Réussi, code 0 |
| Tests TypeScript | 175 réussis, 0 échec |
| Tests Rust | 201 réussis, 0 échec |
| Build frontend | Réussi ; build final : bundle principal `index-huUphIaa.js`, composant `HrCommunicationsView-mb-S95rX.js` ; parcours navigateur exécuté avant les gardes de chargement et le texte de suspension supplémentaires |
| Build backend | Réussi ; avertissement du linker lié au cache xcrun interdit dans cet environnement, pas d’échec de compilation |
| Recette HTTP programmation | 6 groupes réussis sur vrai binaire, dont attente de l’échéance par la vraie horloge et le vrai worker, puis deux redémarrages |
| Non-régression communication/calendrier | 11 groupes HTTP réussis |

Commandes : `npm run lint`, `npm test`, `npm run build -- --outDir <dossier de recette dédié>`, `cargo test --locked --quiet`, `cargo build --locked --quiet`. Scripts HTTP : `scripts/test_rh_scheduled_communications.py` et `scripts/test_hr_collaboration.py`, avec `CFITNESS_TEST_BINARY` pointant sur le binaire construit et un TMPDIR dédié.

Les sept nouveaux tests Rust couvrent session/profil/date/rejeu, exécution concurrente unique, annulation propre/club, perte de droit ou destinataire, erreur disque sur création/annulation/traitement, boîte invalide sans délivrance partielle et pagination. Les deux tests TypeScript ajoutés couvrent les réponses incohérentes et les dates invalides.

## Parcours navigateur exécuté

Copie séparée `http://127.0.0.1:53347`, données fictives neuves conservées dans `.tools/tmp/cfitness-demo-review-1v2231j2`. Les copies précédentes restent inchangées.

1. Mario → Beynost → Collaborateurs et RH → Communication RH.
2. Sélection de Chloé, objet et texte fictifs, Publication → À une date choisie.
3. Programmation au 19 décembre 2026, 09 h Europe/Paris : confirmation et carte « Programmé », sans message envoyé immédiatement.
4. Rechargement : programmation relue depuis le serveur.
5. Mobile 390×844 : ouverture de la confirmation d’annulation, boutons Confirmer / Garder accessibles ; pas de débordement horizontal (scrollWidth 383).
6. Tablette 768×1024 : confirmation, retour « Annulé » avec date de traitement ; pas de débordement horizontal (scrollWidth 761). Capture de contrôle affichée et examinée, sans fichier de capture exporté dans ce lot.
7. Vue de contrôle fermée et format du navigateur réinitialisé.

La saisie native datetime par remplissage automatisé n’avait pas déclenché l’événement React dans l’outil ; une frappe native a confirmé la valeur et la soumission. Ce constat distingue une limite de la manipulation automatisée d’un échec serveur.

## Limites à conserver

Validation sur ce périmètre testé. Les données sont stockées dans le fichier d’état du processus serveur existant : pas de queue distribuée multi-instance, pas de planification récurrente, de modification d’un message programmé, de pièce jointe, de réponse/conversation, d’email, de push ni de garantie de livraison hors ligne. Le responsable actualise l’historique pour voir les changements ; le collaborateur utilise la vraie boîte et la cloche déjà livrées. La revue finale et la fusion de la chaîne de PR restent à réaliser par le développeur. Aucun déploiement public.
