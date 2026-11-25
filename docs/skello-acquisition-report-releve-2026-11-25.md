# Skello — relevé administrateur du 25 novembre 2026

Périmètre : acquisition, compteurs CP, report et motifs des deux clubs. Consultation dans la session fournie par le propriétaire ; aucun champ modifié, interrupteur activé, formulaire enregistré, relance envoyée ou absence créée/annulée. Les cas ci-dessous sont anonymisés. Les captures de paramètres ne contiennent pas de dossiers salariés.

## Observations confirmées

| Repère | Écran consulté | Constat |
|---|---|---|
| S25-01 | Paramètres → Règles et compteurs → Compteurs, Beynost et Carré de Soie | Acquisition affichée : **2,5 jours par mois**, **jours ouvrables**. Le menu propose aussi jours ouvrés et jours calendaires ; aucune autre unité n’a été sélectionnée. |
| S25-02 | Fiche → Historique / Compteurs → Compteur de Congés Payés | Période N : **01/06/2026–31/05/2027** ; N-1 : **01/06/2025–31/05/2026**. Ce sont bien les dates du compteur CP, indépendamment de l’annualisation. |
| S25-03 | Même écran | Le reliquat N-1 porte **« Disponible jusqu’au 31 mai 2027 »**. Cette mention prouve une date affichée, pas une expiration effective ni son traitement juridique. |
| S25-04 | Détail mensuel du compteur | Sept lignes : acquis du mois, congés posés, pris sur N-1, pris sur N, solde N avant modifications, modifications manuelles, solde N après modifications. Ventilation juin→mai et regroupement des périodes antérieures. |
| S25-05 | Aide en bas du compteur | L’aide décrit une période du 1er juin au 31 mai, un rapprochement avec le comptable en fin de période et la possibilité de corrections par mois sur N et N-1. Aucun essai d’édition ou de sauvegarde n’a été effectué. |
| S25-06 | Paramètres → Absences, chaque club | **66 motifs dans chaque club**, avec mêmes valeurs sur les colonnes relevées : activation, acquisition, possibilité de demande, mode d’heures supplémentaires. Toutes les lignes sont enregistrées dans les deux fichiers de catalogue joints. |
| S25-07 | Motifs d’absence | « Permet l’acquis. de congés » est un attribut distinct de l’annualisation et de la demande par le salarié. Certaines lignes affichent un Oui imposé, certaines une case cochée/décochée, d’autres une case grisée. Les états et verrous ont été lus séparément. |
| S25-08 | Un même dossier depuis les deux clubs | Même identifiant de dossier et mêmes CP : pas deux acquisitions à additionner. Le club contractuel principal reste Carré de Soie dans l’exemple observé. Cela ne prouve pas que deux contrats/employeurs distincts doivent partager un seul compteur. |
| S25-09 | Date d’initialisation | Valeur propre au dossier, différente des dates de contrat et de la période CP. Ne jamais remplacer la date de début contractuel par cette date. |
| S25-10 | Tableau mensuel et synthèse | Le mois en cours est déjà représenté dans la synthèse ; un montant est aussi affiché pour décembre dans un exemple, sans être inclus dans la synthèse de novembre. Séparer projection, donnée affichée et crédit enregistré. La date d’exécution automatique réelle n’a pas été démontrée. |

## Cas chiffrés anonymisés

Ces valeurs sont des constats d’écran, pas des formules reconstituées ni des données à importer en production.

- **Cas A, partagé entre les clubs** : juin→novembre = 2,5 chaque mois, cumul N 15 ; N-1 acquis 30,26, pris 23, restant 7,26. Les congés de juillet (14), août (8), septembre (1) sont ventilés sur N-1. Les deux périmètres donnent les mêmes valeurs. L’origine des 0,26 supplémentaires n’a pas été déterminée.
- **Cas B, entrée récente** : initialisation 01/09/2026 ; septembre 0 ; octobre marqué d’un astérisque, acquisition 2,18 ; novembre 2,5 ; synthèse 4,68. Décembre affiche 2,5 et un cumul prévisionnel 7,18, distinct de la synthèse. La page du contrat indique une création le 09/10/2026 mais une période effective non renseignée : **date de création ≠ date de début prouvée**. Aucune formule de prorata ne peut être déduite de cette seule date.
- **Cas C, contrat continu** : contrat effectif depuis le 04/07/2022, sans fin affichée. N-1 acquis/pris 29,64/29,64 ; N acquis/pris/restant 14,88/8,36/6,52. Juin→octobre : 2,5 par mois ; novembre : 2,38. Août : 13 posés, dont 8,64 sur N-1 et 4,36 sur N ; novembre : 4 sur N. Corrections manuelles affichées à zéro sur les mois consultés. Le motif expliquant 2,38 n’a pas été établi ; ne pas attribuer automatiquement cet écart aux CP pris.
- **Cas D, sans chiffres exploitables** : un dossier affiche des tirets pour les acquisitions et soldes. Un tiret n’est ni un zéro ni une preuve de solde négatif.

## Ce que ces observations ne permettent pas encore d’affirmer

1. Formule de prorata des mois incomplets : jours calendaires/ouvrables/travaillés, dénominateur, équivalences, plafonds et arrondi final.
2. Taux particuliers et plafonds des absences (notamment maladie). Un Oui sur l’acquisition ne démontre pas un taux de 2,5 sur toute absence.
3. Instant exact de crédit du mois courant et mécanisme de projection ; pas de simulation de passage de date sur les données réelles.
4. Report automatique ou rapprochement comptable, règle de plafond, conservation de N-2 et exceptions à la date de disponibilité.
5. Recrédit d’une absence annulée après clôture ou après la date limite : aucun cas existant identifié, aucune annulation réelle pour tester.
6. Deux contrats/employeurs distincts pour une même personne et changement rétroactif de rattachement.
7. Historique des corrections expliquant 30,26 et 29,64 : regroupements historiques observés mais pas de preuve complète de calcul.

Pour lever ces points : un exemple existant avec son détail de calcul/aide suffit ; sinon demander la règle écrite au support Skello ou au responsable paie. Aucun accès supplémentaire n’est requis pour les réglages déjà relevés. Ne pas modifier un salarié réel pour fabriquer un exemple.

## Conséquences pour C.Fitness OS — complément à la PR #65

- Catalogue de référence complet des 66 motifs livré avec activation/acquisition/demande/verrous/mode d’heures. **Aucun import automatique** dans les configurations des clubs : les familles et paramètres doivent être rapprochés avant migration.
- Ajout au paramétrage d’acquisition d’un effet par motif, distinct de l’annualisation : Oui / Non / À vérifier. Absence de règle = non vérifiée, jamais Oui implicite.
- Lors d’un crédit mensuel, une absence validée configurée Non dans **son propre club** bloque le crédit complet. Le taux proratisé reste à vérifier ; le moteur ne transforme pas Non en absence totale de droits du mois.
- Une absence configurée Oui demande toujours de vérifier taux et plafonds. Aucun détail médical n’est ajouté à l’aperçu : seulement le nombre d’absences et de règles non vérifiées.
- Les paramètres des motifs, leurs changements et leur club participent au contrôle de révision de l’aperçu. Une modification invalide la confirmation ancienne. Les identifiants d’un autre club sont refusés lors de la sauvegarde de la configuration.
- Les montants futurs restent distincts des crédits effectivement enregistrés. Le crédit proposé reste limité aux mois terminés tant que le mécanisme exact de Skello n’est pas établi.
- La date de disponibilité N-1, le suivi historique mensuel complet N/N-1, l’initialisation par dossier et les corrections rétroactives sont des écarts de parité explicites à conserver au cahier des charges. Le lot ne prétend pas les avoir tous développés.

Améliorations conservées : aperçu avant toute perte de droits, motif obligatoire et historique, refus des doublons entre clubs, sauvegarde atomique, protection contre une compensation sur le mauvais exercice, règles désactivées par défaut. La parité exhaustive des congés n’est pas encore certifiée.

## Preuves

Voir `recette/skello-conges-2026-11-25/` : deux captures de paramètres, deux catalogues complets et résultats de recette du complément. Les preuves de dossiers nominatifs ne sont pas publiées.

## Complément proratas et période clôturée

Voir [le contrôle approfondi du 25 novembre](skello-proratas-report-complement-2026-11-25.md) : rapprochement chiffré du report, écart historique restant à expliquer, aide officielle sur la maladie et ses limites, parcours de montant proratisé vérifié, nouveaux tests et captures. Il précise les observations et limites du présent relevé ; aucun automatisme de prorata ni de report exceptionnel n’est présumé terminé.
