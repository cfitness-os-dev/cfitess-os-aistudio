# Présentation des réglages RH — 27 novembre 2026

## Avant et après
La page Règles et alertes affichait aussi une carte de réglages de badgeuse, tandis qu’une rubrique Badgeuses et tablettes regroupait les autres contrôles. La copie désactivée restait visible aux non-propriétaires.

Les sept entrées existantes sont maintenant rangées dans la navigation partagée : Organisation du travail, Absences et compteurs, Badgeuses. Fréquence de badgeage et pauses sur tablette sont déplacées, avec leurs handlers inchangés, vers Badgeuses et tablettes. Tout ce panneau est conditionné par la capacité propriétaire/super administrateur déjà existante. Plus de copie dans les règles générales.

Les autres réglages, valeurs, validations, mutations et gardes de brouillon ne changent pas. « Chaque shift » est présenté comme « Chaque prise de service ». Aucun contrôle de droits serveur n’a été modifié.

## Recette ciblée
- Compilation TypeScript/Vite réussie ; 211/211 tests TypeScript passants.
- Captures avant/après réellement examinées dans le navigateur intégré : ordinateur, mobile390×844 et tablette768×1024.
- Mario, profil de démonstration propriétaire : groupe Badgeuses présent ; panneau de fréquence/pauses, autorisations individuelles et tablettes atteints.
- Sélecteur mobile : les 7 rubriques sont présentes, réparties dans 3 groupes.
- Sarah, responsable de démonstration sans capacité propriétaire : Réglages RH accessible ; ni groupe Badgeuses ni carte Paramètres de badgeuse du club dans le contenu (compteurs DOM 0/0). Les règles générales restent visibles.
- Retour au profil Mario après contrôle ; aucun droit, paramètre, pointage ou autre donnée métier modifié. Aucun réglage enregistré, aucune caméra utilisée.
- Copies locales fictives seulement sur http://127.0.0.1:62511/mon-compte/MC10 ; backend inchangé et services/ workers externes désactivés.

## Limites
Ce lot valide le rangement et la différence d’affichage entre deux profils locaux. Il ne certifie pas à lui seul le refus API des autres profils, le fonctionnement matériel ou les photos. Les règles serveur restent celles de la base. Les autres sous-écrans RH (paie, planning, acquisition/report détaillé, organisation) sont encore à contrôler selon la matrice de présentation.
