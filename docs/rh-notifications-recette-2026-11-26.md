# Notifications persistantes et événements RH — recette du 26 novembre 2026

Branche `feat/rh-live-notifications`, base PR #88 / 7a38c71. Ce lot ne modifie ni main ni la version publique, ne connecte pas Heitz et ne déclenche aucun envoi externe.

## Coordination

À la première vérification, #88 ne contenait ni commentaire ni review. Pendant ce lot, l’IA locale de pinto1230766 a publié un contrôle automatique positif : 186 tests Rust et 170 tests TypeScript. Son commentaire précise que ses recettes Python ne sont pas exécutées et qu’aucune fusion n’est réalisée. Les reviews finales restent vides à la vérification : ne pas confondre contrôle automatisé et approbation humaine.

Réservation sur #21 avant développement : notifications, cloche, Mon compte, raccords ciblés aux parcours d’absences/compteurs/pointages. Le contexte de navigation a aussi reçu un compteur de demandes de navigation personnelle pour rouvrir une destination déjà utilisée sans perdre les protections de brouillon.

## Comportement livré

### Une source de notifications

- Suppression de la cloche `Notifications (3)` et de ses cartes d’impayés/contrats/maintenance codées en dur.
- La cloche lit les notifications du **compte connecté et du club actif** depuis le serveur. Il s’agit des données effectivement enregistrées, qui restent fictives dans la démonstration ; cela ne signifie pas que Heitz ou un fournisseur externe est connecté.
- Le compteur correspond au nombre non lu de tout l’historique de ce périmètre, et non au nombre de lignes visibles. Zéro est affiché dans le libellé accessible sans badge rouge. Une erreur ne devient pas un faux zéro ; les anciennes lignes sont masquées dans la vue en erreur.
- Première lecture enregistrée, lecture individuelle et lecture de la page affichée (50 maximum). Une lecture répétée conserve sa première date et ne crée pas un nouvel audit.
- Filtres Toutes/Non lues ; historique paginé, retour aux dernières, actualisation manuelle.
- La cloche, l’aperçu de Ma journée et **Mon compte → Mes notifications** utilisent les mêmes notifications canoniques et le même composant. Un événement local après confirmation serveur actualise les autres vues du compte/club concernés.
- Actualisation lors de l’ouverture, du retour au premier plan et toutes les 30 secondes tant que le document est visible. Pas de notification push ni de WebSocket annoncé.
- Les réponses tardives d’une ancienne lecture sont ignorées pendant une écriture ; boutons et soumissions protégés contre les doubles clics. Changement de compte/club : composant remonté avec une nouvelle clé, ancienne requête annulée.
- La fermeture par Échap ou par le bouton rend le focus à la cloche. Fermeture au clic extérieur ; panneau défilant adapté à la largeur disponible.
- Aucun effacement de l’historique ajouté.

### Notifications métier internes

| Événement confirmé | Destinataires | Accès |
| --- | --- | --- |
| Nouvelle demande d’absence | Responsables actifs pouvant décider de cette demande | Club du salarié + permission ORG04-17 sur ses équipes, hors salarié lui-même |
| Demande retirée par le salarié | Salarié et responsables autorisés | Même contrôle de périmètre pour les responsables |
| Absence validée, refusée ou remise en attente | Salarié concerné | Propre compte, club de l’absence |
| Validation avec décompte ou reprise de compteur | Salarié concerné | Même opération persistante que le changement de statut/compteur |
| Annotation d’un pointage par un responsable | Salarié concerné | Propre compte et club du pointage |

Les différentes voies de décision sont raccordées : responsable, ancienne route de décision et validation/reprise avec compteur. Les règles d’autorisation et les calculs de compteurs ne sont pas remplacés par ce lot.

Les alertes d’absence donnent les dates et le statut, sans recopier motif médical, commentaire, note de décision ni justificatif. L’alerte de pointage ne recopie pas la note du responsable. Le salarié consulte le détail dans l’écran prévu.

Les notifications sont ajoutées à la copie de l’état **avant sa persistance** : si l’écriture échoue, ni décision, ni notification isolée ne sont confirmées. L’identifiant d’événement est dérivé de sa référence/révision pour éviter un doublon pour le même événement.

### Navigation corrigée

- « Ouvrir toutes mes notifications » ouvre réellement cette rubrique, même après avoir consulté une autre page personnelle.
- « Consulter » d’une notification d’absence ouvre Mes absences ; celui d’une alerte responsable ouvre les absences des équipes ; l’annotation de pointage vise Mes pointages.
- Une demande explicite de navigation personnelle, même vers une adresse déjà utilisée, passe par la protection des brouillons avant de remonter le contenu.
- La navigation locale remet une adresse personnelle canonique, afin que le rechargement conserve la page choisie.
- Défaut découvert dans la recette : pendant une transition vers la vue responsable, l’ancien prototype de journée pouvait afficher brièvement Maxime. Ce prototype est désormais réservé au mode technique hors parcours personnel. Recontrôle du raccourci responsable : aucun « Bonjour Maxime », puis demandes RH correctement chargées.

## Routes

- `GET /api/me/notifications/:club_id?unreadOnly=true|false&before=...` : session Bearer, compte actif, club autorisé. Compte dérivé de la session ; aucune identité fournie par le client. Réponse : compteur global du périmètre, total, page de 50 maximum, curseur.
- `POST` sur la même route : `{ids:[...]}`, 1 à 50 IDs. Tous doivent appartenir à la boîte autorisée, sinon aucun n’est marqué lu. Persistance avant confirmation ; première date de lecture conservée.
- L’ancienne action personnelle `read_notification` reste compatible et utilise le même marquage canonique.

Les notifications sans club déjà présentes dans l’ancien format sont personnelles au compte et communes à ses clubs autorisés, conformément au comportement antérieur. Les nouvelles notifications RH possèdent un club explicite.

## Tests exécutés

- **191 tests Rust réussis**, aucun échec.
- **173 tests TypeScript réussis**, aucun échec.
- Construction TypeScript/Vite et binaire Rust réussie ; `git diff --check` réussi.
- **10 contrôles HTTP de notifications** réussis contre le binaire local isolé : identité/club, compteur, refus d’ID étranger et de lot mixte, ancienne action de lecture, nouvelle demande/décision, autre route de décision, retrait, validation et reprise avec compteur, annotation de pointage, échec disque/reprise, redémarrage.
- **11 contrôles HTTP communication/calendrier** rejoués avec succès : non-régression de publication/lecture, ciblage, liens privés et persistance.

Un premier essai de reprise avec compteur a été refusé correctement, car le scénario fournissait un nouveau décompte. La recette a été corrigée pour envoyer zéro et reprendre les quantités d’origine ; aucune règle métier n’a été affaiblie pour faire passer ce test.

## Parcours navigateur exécutés

Copie fictive **http://127.0.0.1:56902** ; aucune donnée réelle et aucun envoi fournisseur.

1. Chloé/Beynost : compteur initial 1, ouverture de la cloche, lecture ; compteur 0. Ouverture de la rubrique personnelle depuis la cloche.
2. Passage à Mes absences, rédaction fictive, retour vers les notifications : dialogue de protection ; refus conserve la rédaction.
3. Création d’un congé sans solde fictif du **18 décembre 2026**.
4. Mario : Carré de Soie affiche 0, Beynost affiche 1. L’alerte ouvre les absences responsables.
5. Mario valide le congé ; retour Chloé : notification « Demande d’absence validée », dates correctes. « Consulter » ouvre la demande Validée.
6. Lecture de la page : compteur 0 ; filtre Non lues vide ; Toutes conserve l’historique.
7. Rechargement, puis redémarrage de cette seule copie avec conservation de son dossier fictif : données et lectures conservées après reconnexion.
8. **390×844**, **768×1024**, **1440×1000**, ainsi que largeur initiale 405 : panneau et historique consultables, pas de débordement observé ; dernière carte tablette dégagée au-dessus de la navigation basse. Les dimensions temporaires ont été réinitialisées.
9. Échap rend le focus à la cloche ; raccourci responsable final sans ancien écran de démonstration.
10. Mario publie un message fictif pour lui-même : le compteur passe immédiatement de 1 à 2 sans ouvrir la cloche ni attendre le rafraîchissement périodique.

Le navigateur a perdu sa connexion pendant une tentative initiale. Réinitialisation puis reprise réussie ; les parcours ci-dessus ont ensuite été réellement exécutés. Captures visualisées dans la conversation, pas de fichiers PNG persistants annoncés.

## Ce qui reste à faire

- Brancher les futurs événements des autres modules à cette boîte avec leurs propres autorisations ; la cloche ne fabrique plus leurs chiffres. L’existence d’une notification de démonstration parlant de Heitz ne prouve pas un connecteur actif.
- Notifications de publication/modification de planning, documents, signatures et campagnes RH : pas de nouveaux déclencheurs développés dans ce lot.
- Pièces jointes, programmation et email collectif RH, push natif : non livrés ici. Brevo réel doit rester séparé des envois Heitz et exige sa configuration dédiée.
- Conservation/archivage à dimensionner pour l’exploitation ; la pagination ne transforme pas le stockage JSON existant en base validée en charge.
- Matériel de badgeage, photo, règles d’acquisition/report non encore confirmées et intégrations réelles : conserver les limites du registre général. Ne pas annoncer une parité exhaustive Skello.

**Décision : validé sur le périmètre exécuté ; aucun déploiement public ni certification globale de la RH.**

La copie locale utilise le binaire final et le dossier de démonstration conservé ; sessions serveur renouvelées lors du redémarrage. Les autres copies locales et les logiciels des clubs ne sont pas modifiés.
