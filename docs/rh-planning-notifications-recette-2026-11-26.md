# Alertes de planning publié — recette du 26 novembre 2026

Branche `feat/rh-planning-notifications`, base PR #89 / 2cf2e27. Coordination réservée sur #21 avant développement. #89 a reçu deux commentaires de contrôle automatique vert (191 Rust/173 TS), sans review finale au contrôle de ce lot.

## Livré

- Création directement publiée ou passage brouillon → publié : notification au collaborateur affecté.
- Modification d’un créneau publié (date, horaires, pause, poste, mission ou tâches) : notification générique, sans recopier les tâches ni notes.
- Changement d’affectation : retrait signalé à l’ancien collaborateur et publication au nouveau.
- Dépublication ou suppression d’un créneau publié : retrait signalé à son ancien titulaire.
- Brouillons, suppression de brouillons, créneaux sans salarié, changement du seul verrou et PATCH sans changement métier : aucune notification.
- Les cycles réels de dépublication/republication produisent des événements distincts.
- Le bouton Consulter vise Mon compte → Mon planning, avec la protection de brouillon existante.

Les trois routes `POST /api/shifts`, `PATCH /api/shifts/:id`, `DELETE /api/shifts/:id` travaillent désormais sur une copie de l’état sous le verrou commun. Horaire, audit et notification sont persistés ensemble avant remplacement de l’état actif. Une erreur de génération ou d’écriture ne laisse pas une notification isolée ni un planning modifié en mémoire. Les règles d’autorisation, de poste, de verrou et de club existantes sont conservées.

Le système signale les horaires effectivement publiés ; il ne décide pas à la place du responsable de publier un brouillon. Aucun email, SMS, Heitz ou appareil réel.

## Preuves

- Suite Rust : **194 tests réussis**, aucun échec.
- TypeScript : **173 tests réussis**, aucun échec.
- Construction frontend/backend et diff-check : réussis.
- Recette `scripts/test_planning_notifications.py` : **7 contrôles HTTP réussis** sur serveur fictif jetable : refus salarié, absence d’alerte brouillon, publication et PATCH inchangé, modification/réaffectation, dépublication/suppression, échecs disque sur création/modification/suppression avec comparaison mémoire/disque, absence de contenu privé et redémarrage.
- Recette notifications existante rejouée : **10 contrôles HTTP réussis**.
- Navigateur dans un nouvel onglet de test en arrière-plan, sans toucher aux onglets de l’utilisateur : créneau fictif publié pour Chloé/Beynost le 18/12/2026, 09h–17h, pause 30 min. Cloche à 2 (une notification de référence + la nouvelle publication), alerte correcte ; Consulter ouvre Mes horaires publiés et le créneau est présent.
- Formats mobile **390×844** et tablette **768×1024** : planning visible, pas de débordement horizontal ; action Consulter visible sur mobile. Parcours ordinateur exécuté à la taille par défaut du navigateur. Aucune taille exacte ordinateur prétendue ici. Dimensions réinitialisées et onglet temporaire fermé.

Une création d’onglet a été lente mais a réussi ; aucun blocage navigateur restant sur ce scénario.

## Limites

- Notifications internes uniquement. Les droits sont revérifiés par les routes existantes ; pas d’envoi fournisseur ni de push natif.
- Pas de nouvelle clé d’idempotence pour POST /api/shifts : cette route garde son contrat de création existant. Le non-doublon testé concerne PATCH sans changement, pas le rejeu réseau d’une création.
- Pas de recette physique ni de validation globale des contraintes de planning/paie. Documents, signatures, pièces jointes et programmation des communications restent dans le registre général.
- Copie dédiée : http://127.0.0.1:64820. Les copies antérieures, dont 56902, ne sont pas remplacées.

**Décision : validé sur le périmètre testé ; aucune fusion ni mise en ligne.**
