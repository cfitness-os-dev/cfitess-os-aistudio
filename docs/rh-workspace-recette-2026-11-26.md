# Mon compte et gestion RH — cohérence et recette

## Changements livrés

- Mon compte dispose d’une seule navigation, regroupée en quotidien, dossier RH et outils. Les doubles accès « Mon dossier »/« Ma journée et outils » ont disparu de l’usage courant. Les parcours historiques restent disponibles en mode technique.
- Dix destinations personnelles : journée, planning, pointages, dossier, absences, compteurs, documents, formations, contrôles, préférences. Les outils d’export et Mywellness sont conservés dans un panneau secondaire.
- Les compteurs ouvrent directement la vue personnelle du dossier existant ; aucune seconde source de soldes n’est créée. Les préférences utilisent leur API existante et protègent les saisies non enregistrées.
- Le choix d’une rubrique personnelle est conservé dans `personalTab` pour un rechargement. La navigation locale utilise un remplacement de l’adresse, pas une nouvelle entrée d’historique à chaque onglet.
- Collaborateurs et RH conserve une navigation distincte, limitée aux sections confirmées par le serveur pour la session et le club courants. Les anciennes données de navigation d’un autre compte ne servent plus de repli.
- Un profil dont le périmètre confirmé reste personnel retrouve Mon compte même sur une ancienne adresse RH. Les destinations personnelles historiques sont conservées lorsqu’elles sont identifiables.
- La vue d’ensemble de gestion sépare le suivi d’équipe des outils personnels. Les indicateurs et le tableau détaillé des collaborateurs sont dépliables. Des accès explicites mènent aux demandes d’absence, aux pointages et aux dossiers incomplets.
- Le planning d’équipe ouvre la grille existante ; le prototype de planning reste réservé au diagnostic.
- Les réglages de pointage, tablettes et galerie photo sont déplacés vers **Réglages RH → Badgeuses et tablettes**. La visibilité du sous-onglet repose sur `canEditBadgeSettings` confirmé par le serveur ; chaque API conserve son contrôle propriétaire/super administrateur. Aucun élargissement des droits.

## Défauts fonctionnels corrigés

1. Le statut historique `accepted` était présenté comme « En attente » par `statusLabel`, ce qui ajoutait une absence déjà acceptée au filtre des demandes en attente. Il est désormais présenté comme « Validée ». Le filtre mobile affiche bien trois demandes en attente et une formation acceptée séparément sur Carré de Soie. `refused` est également reconnu ; un statut inconnu devient « À vérifier », sans classement automatique comme demande en attente. Test de non-régression ajouté.
2. Les statuts de dossier `pending_employee` et `incomplete_payroll` sont traduits en libellés compréhensibles.
3. Le retour d’une session administrateur vers une collaboratrice standard pouvait afficher une page RH vide sur l’ancienne adresse. La vue personnelle du compte courant est maintenant utilisée après confirmation de son périmètre.
4. Une saisie personnelle abandonnée via la confirmation de navigation est effectivement vidée ; le retour à la rédaction conserve sa valeur. Les nouvelles tâches non enregistrées sont également protégées.
5. Le calendrier affichait une URL construite sur c.fitness alors qu’aucune route de lecture du flux n’a été trouvée dans le serveur consulté. L’interface indique désormais que la connexion est à finaliser. Elle ne fournit pas de faux lien opérationnel.
6. Communication RH ajoutait uniquement une ligne en mémoire React, avec un message de « diffusion » dont la mention de simulation pouvait être supprimée par le nettoyage d’affichage. Le sous-écran présente maintenant un aperçu explicitement sans envoi ni enregistrement serveur, conserve la saisie, affiche le corps du message et protège le brouillon. La diffusion RH persistante n’est pas livrée dans ce lot.

## Vérifications exécutées

Environnement local isolé, boucle locale uniquement, jeu fictif neuf, serveur Rust existant, secrets de fournisseurs non hérités, Heitz et workers d’envoi désactivés. Aucune modification de la version publique ni des logiciels réels.

| Contrôle | Résultat |
| --- | --- |
| TypeScript et construction Vite finale | Réussi, bundle `index-DcwBOuNf.js` |
| Suite TypeScript finale | 161 tests réussis, zéro échec |
| `test_personal_workspace.py` | 12 contrôles réussis : identité, données propres, tâches, quiz, demandes, contrôles, notifications, pointages, confirmation fictive, erreurs disque, redémarrage, absence de profils fictifs hors démo |
| `test_hr_manager_workflows.py` | 7 contrôles réussis : salarié/responsable, décisions, révisions, annotations, échecs disque, redémarrage |
| `test_hr_employee_dossier.py` | 6 contrôles réussis : authentification, contrat/compteurs, droits, multi-club, conflits, persistance |
| `test_timeclock_settings_owner.py` | 5 contrôles réussis : propriétaire seulement, profils Master/lecture seule refusés, isolation des clubs et persistance |
| Préférences navigateur administrateur | Saisie conservée après refus de navigation, enregistrement confirmé puis valeur retrouvée après rechargement |
| Compteurs navigateur | Dossier Mario/Carré de Soie puis Chloé/Beynost ; bons compte et club, accès aux reports personnels |
| Absences sur mobile 390×844 | Trois demandes en attente, formation `accepted` dans « Validée », navigation sans débordement global (document 383 px) |
| Parcours personnel tablette 768×1024 | Dix rubriques, retour depuis la gestion et compteurs propres ; document 761 px, pas de débordement global |
| Réglages badgeuses administrateur | Onglet disponible dans Réglages RH ; panneaux absents du suivi quotidien des pointages |
| Session collaboratrice standard | Un seul club Beynost ; absence des menus Finances et gestion RH dans le shell ; pointage personnel désactivé suivant la politique serveur |
| Brouillon d’absence mobile | Retour à la rédaction conserve le commentaire ; abandon volontaire puis retour donne un champ vide |
| Parcours complet navigateur | Chloé crée un congé sans solde fictif du 14 au 15 décembre 2026 ; demande retrouvée après rechargement ; Mario choisit Beynost et valide cette demande ; Chloé se reconnecte et retrouve « Validée » |

La saisie des dates a été réalisée au clavier dans les segments natifs français ; le remplissage automatique ISO de l’outil navigateur ne renseignait pas ces champs. Aucun contournement du formulaire par modification du DOM.

Les dimensions temporaires ont été réinitialisées. Les modifications de préférences et l’absence de recette restent uniquement dans le jeu fictif. Les scripts HTTP emploient leurs propres jeux temporaires ; ils n’utilisent pas les données des clubs. La suite Rust complète n’a pas été relancée pour ce lot frontend : aucun fichier Rust n’a changé ; les quatre recettes HTTP ont exercé le binaire local existant.

## Limites

Validation partielle sur les parcours ci-dessus, pas certification exhaustive Lead/Skello. La présentation du planning d’équipe, les sous-écrans avancés de paie/recrutement, la communication RH de démonstration et l’ensemble des navigateurs/appareils physiques restent à recetter séparément. Le déplacement des paramètres ne valide pas une tablette physique, la caméra ni une présence réelle avant cours.

La reconnaissance visuelle de `accepted` ne migre pas les mouvements historiques de compteurs. Le rapprochement des anciennes décisions avec les mouvements du registre doit être étudié avant une reprise de données réelle ; ne pas réécrire automatiquement les statuts ni débiter à nouveau des soldes déjà repris.

Les fonctions personnelles reprises ne prouvent pas, à elles seules, la parité de toutes les options auditées de Skello. Le registre global de suites est dans `ETAT_FONCTIONNEL_ET_RESTE_A_FAIRE.md`.
