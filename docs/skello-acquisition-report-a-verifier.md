# Relevé Skello à compléter — acquisition et report des CP

**Mise à jour du 25 novembre :** les paramètres des deux clubs, les périodes CP sur fiches, 66 motifs par club et plusieurs exemples chiffrés ont été relevés. Voir [constats, cas anonymisés et blocages restants](skello-acquisition-report-releve-2026-11-25.md). La liste ci-dessous est le plan initial ; elle ne signifie plus que toutes les vues restent à ouvrir.

But : faire correspondre les calculs de C.Fitness OS aux règles effectivement utilisées dans les deux clubs. Consultation uniquement ; ne pas enregistrer, basculer un réglage ou modifier un compteur dans Skello pour obtenir une preuve.

## Ce que l'audit a déjà observé

- PAR02-04/05 et complément ADM13-49/50 : CP actifs, **2,5 jours par mois**, unité **jours ouvrables**, dans les deux établissements ; autres unités proposées : jours ouvrés et calendaires.
- CPT03-01/04/11 : compteurs N et N-1, date limite de disponibilité du reliquat, ventilation des acquisitions mensuelles ; texte de l'écran mentionnant une référence de juin à mai.
- PAR11-02 : propriété **« Permet l'acquisition de congés »** sur les motifs d'absence. Cette propriété est distincte de leur inclusion dans les heures d'annualisation.
- CPT03-03/08/09/10 : initialisation du suivi et distinction des corrections manuelles du solde calculé.

Sources locales : `public/references/atlas_1605_entries.json`, écrans PAR02/PAR11/CPT03, et `public/references/Guide_actualise_Skello_CFITNESS.html`, compléments ADM13-49/50. Ce sont des observations historiques, pas une confirmation des valeurs actuelles ni une validation des calculs juridiques.

## Contrôles précis à effectuer en administrateur système

| Vue à ouvrir | Informations à relever sans modifier | Exemple de contrôle attendu |
|---|---|---|
| Paramètres du premier club → Compteurs, puis second club | CP activés, unité, taux mensuel exact et précision ; réglages différents selon le salarié ou contrat | Vérifier que 2,5 et jours ouvrables sont toujours affichés dans les deux clubs. |
| Fiche salarié → Compteurs → Congés payés | Dates exactes des périodes N/N-1 et date limite du reliquat ; date d'initialisation | Vérifier le 1er juin/31 mai sur un compteur réel plutôt que de reprendre le seul texte d'aide ou la période d'annualisation des heures. |
| Détail « Congés acquis par mois » et son aide | Date du crédit, arrondi mensuel/cumulé/final ; base et solde avant/après corrections | Relever trois mois consécutifs, puis le total d'une période ; expliquer tout écart avec le taux affiché. |
| Fiche d'une entrée ou sortie en cours de mois, avec contrat correspondant | Formule du prorata, jours retenus, temps partiel, fin de contrat et éventuels droits supplémentaires | Un exemple d'entrée vers le milieu du mois et un exemple de sortie ; dates et montants anonymisés suffisent. |
| Rubrique Motifs d'absence, par club si applicable | Effet de chaque motif actif sur l'acquisition ; cases imposées/grisées, aides et seuils | CP, maladie, absence non rémunérée, formation, événements familiaux ; ne pas déduire leur effet de leur catégorie ou de l'annualisation. |
| Compteurs N-1 de salariés ayant un solde ancien | Report intégral ou plafond, reliquat déjà ancien, date limite, exception/prolongation et éventuel arrondi | Relever un exemple avec report, un exemple sans report ou plafonné, et les explications de la date limite. |
| Historique d'une absence ancienne annulée/corrigée | Période recréditée et traitement après clôture ou après limite de disponibilité ; existence d'une réouverture | Consulter un cas déjà existant, sans annuler une absence réelle pour tester. |
| Salarié affecté aux deux clubs | Un ou plusieurs contrats/employeurs, club de rattachement du compteur et absence de double acquisition | Comparer les mêmes périodes depuis les deux périmètres sans additionner deux soldes qui seraient la même donnée. |

## Cas de référence à retrouver

1. Un salarié en contrat continu avec un mois complet sans absence : acquis avant/après et crédit mensuel.
2. Une entrée ou sortie en cours de mois : dates et crédit réellement retenu.
3. Un mois comportant une absence qui conserve ou réduit l'acquisition : motif et différence observée, sans données médicales détaillées.
4. Une bascule N → N-1 avec solde disponible, date limite et éventuel plafond.
5. Une correction/annulation d'absence sur une ancienne période déjà clôturée.
6. Un salarié des deux clubs, avec sa situation contractuelle et son compteur commun ou distinct.

Pour chaque cas : noter le club, le type de contrat, les dates de référence, les soldes avant/après, la valeur attendue et le niveau de preuve (écran observé, aide, historique ou explication à confirmer). Aucun nom, identifiant de connexion ou document médical n'est nécessaire dans le dossier transmis au développeur.

## Ce que le nouveau lot prépare sans présumer les réponses

Configuration explicite, désactivée par défaut ; taux mensuel à quatre décimales ; arrondi sur le cumul ; aperçu et confirmation du mois complet ; conservation/report plafonné/non-report ; traitement distinct du reliquat antérieur ; journal anti-doublon commun aux clubs ; clôture protégée contre une compensation sur le mauvais exercice.

Les opérations du lot sont manuelles après aperçu. Le prorata d'un mois incomplet n'est pas inventé. L'effet légal des absences, les échéances automatiques d'expiration, les droits supplémentaires, la réouverture de période et la consolidation multi-contrats restent à spécifier à partir de ces contrôles. Aucune règle de perte de droits n'est activée par défaut.

## Complément proratas et période clôturée

Voir [le contrôle approfondi du 25 novembre](skello-proratas-report-complement-2026-11-25.md) : rapprochement chiffré du report, écart historique restant à expliquer, aide officielle sur la maladie et ses limites, parcours de montant proratisé vérifié, nouveaux tests et captures. Il précise les observations et limites du présent relevé ; aucun automatisme de prorata ni de report exceptionnel n’est présumé terminé.
