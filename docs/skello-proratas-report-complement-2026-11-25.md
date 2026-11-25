# Proratas et reports — complément de vérification du 25 novembre 2026

Suite du [premier relevé](skello-acquisition-report-releve-2026-11-25.md), même session administrateur et même consigne de lecture seule. Aucun compteur, planning ou congé réel n’a été modifié. Les cas restent anonymisés.

## Période clôturée effectivement dépliée

**Cas C :** la période 01/06/2025–31/05/2026 peut être dépliée dans le tableau mensuel. Onze mois affichent 2,5 jours et mai affiche 2,14 : total 29,64. Les jours pris sur N pendant cette période sont 11 en août, 6 en décembre, 1 en janvier et 1 en mars, soit 19. Le solde de fin mai est donc 10,64.

Dans la période suivante, les prises sur ce reliquat sont 1 en juin, 1 en juillet et 8,64 en août : total 10,64. Le reliquat est épuisé. Le total « pris » de la synthèse historique (29,64) se rapproche ainsi de 19 + 10,64. Les prises de la période suivante doivent donc être attribuées à leur période d’origine, sans être additionnées une deuxième fois au solde courant.

C’est un rapprochement arithmétique d’écrans existants. Il ne prouve ni l’heure d’exécution d’une clôture automatique ni le traitement d’une annulation après clôture.

**Cas A :** la période 2025–2026 dépliée affiche onze acquisitions à 2,5 et mai à 2,4, soit 29,90 ; la synthèse de la même période affiche 30,26. Les corrections manuelles mensuelles consultées sont à zéro. L’écart de 0,36 reste non expliqué. Ne pas remplacer silencieusement une valeur par l’autre lors d’une migration : demander le solde de référence validé et conserver les deux constats avec leur origine.

**Cas B :** l’astérisque d’octobre est présent avec l’acquisition 2,18. Les clics sur cet indicateur et sur l’aide visible n’ont pas fourni de formule exploitable dans la session contrôlée. La date de création du contrat ne peut toujours pas servir de date de début. Aucune cellule éditable n’a été utilisée.

## Documentation officielle complémentaire

Ces articles décrivent Skello ; ils ne constituent pas une validation des règles paie des clubs.

- Le [suivi des compteurs](https://help.skello.io/fr/articles/3704253-comment-suivre-les-compteurs-de-conges-payes-sur-skello) relie les acquisitions au planning, signale l’absence de crédit sans shift de travail et décrit l’export Excel. Cette dépendance ne permet pas, à elle seule, de reconstituer tous les proratas.
- Le [paramétrage initial](https://help.skello.io/fr/articles/7042367-comment-parametrer-les-compteurs-de-conges-payes) distingue historique repris, initialisation et période de référence. Les zéros initiaux doivent être explicites ; l’arrivée est rattachée au mois du début contractuel.
- La [vue mobile](https://help.skello.io/fr/articles/8698960-quels-compteurs-sont-accessibles-sur-l-application-mobile-skello) présente le mois courant et sépare le prochain congé des soldes, sans déduire les congés futurs de cette synthèse.
- L’article [maladie et acquisition](https://help.skello.io/fr/articles/12752558-comment-gerer-l-arret-maladie-et-acquisition-de-conges-payes-sur-skello), daté du 05/11/2025, décrit une pondération entre jours de maladie et jours ordinaires : six jours sur vingt-six à un taux de 2, le reste à 2,5 donnent 2,38 au centième. Il annonce une application à partir de décembre 2025, sans recalcul des périodes clôturées, sans rétroactivité automatique et sans report exceptionnel automatique lié à la reprise. Il contient aussi une divergence interne entre 1,66 et 1,67 pour les jours ouvrés : précision et plafond restent à confirmer. Cet exemple numérique n’établit pas le motif médical d’un dossier réel.

Ne pas appliquer aux CP la formule des RTT trouvée dans d’autres articles : ce sont des compteurs et des règles différents.

## Complément fonctionnel développé dans la PR #65

Un mois incomplet ou une absence ayant un effet sur l’acquisition ne doit pas forcer l’opérateur à inventer une règle automatique. Le nouveau parcours **montant proratisé vérifié** permet d’enregistrer le résultat déjà vérifié par une personne habilitée :

1. Choisir le salarié et un mois terminé, dans son club principal.
2. Activer le montant vérifié, saisir les jours (deux décimales, zéro compris) et la référence de calcul.
3. Consulter le compteur avant/après ; confirmer la reprise initiale, les effets des absences lorsqu’ils existent et la vérification du calcul.
4. Enregistrer ensemble le compteur, le journal d’acquisition, la référence et l’historique du dossier. Une modification du montant, de la référence ou du contexte invalide l’ancien aperçu.

Ce parcours conserve les mêmes droits, erreurs disque sans faux succès, contrôles de concurrence et protections des périodes clôturées. Il autorise un montant vérifié sur un mois partiel de contrat qui le recoupe ; il n’autorise ni un mois extérieur au contrat, ni une autre acquisition sur un mois déjà traité, ni un crédit anticipé. Les comptes inactifs restent à examiner séparément. Un crédit nul consomme aussi l’unicité du mois. Le montant ne peut dépasser le taux complet arrondi au centième supérieur ; d’autres droits supplémentaires relèvent d’une régularisation distincte.

`request.verifiedCredit = { days, reference }` est facultatif ; `calculationConfirmed` devient obligatoire pour confirmer ce parcours. Le montant et la référence sont présents dans l’aperçu, l’opération persistée et l’historique visible. Les anciennes opérations sans ce champ restent lisibles. Le parcours n’est **pas un calcul automatique de prorata** et n’ouvre pas de nouveau droit d’accès.

## État des points restants

| Point | Résultat et suite nécessaire |
|---|---|
| Rapprochement du report d’un solde de fin mai | Vérifié sur le cas C ; couvert également sur données fictives côté OS. |
| Exemple numérique maladie donnant 2,38 | Documenté par Skello ; calendrier exact, plafonds et cas en jours ouvrés à préciser avant automatisation. |
| Prorata d’entrée/sortie donnant 2,18 | Montant observé, formule non établie ; résultat vérifié saisissable localement, pas de formule présumée. |
| Annulation réelle après clôture | Aucun exemple identifié ; le propriétaire indique ne pas en connaître. Aucun test destructif sur les clubs. La protection OS est testée, l’équivalence Skello ne l’est pas. |
| Report exceptionnel et reprise après maladie | L’absence d’automatisme est indiquée par Skello. Il reste à spécifier information du salarié, échéance, prolongation et validation paie dans OS. |
| Écart historique du cas A | 0,36 non rapproché ; demander une explication et le solde validé avant migration. |
| Relecture de la PR | PR #65 ouverte, sans revue ni commentaire de l’IA au contrôle de début de ce complément ; aucun nouveau retour dans #21. |

Questionnaire fournisseur/paie prêt : formule d’entrée/sortie et arrondi, précision du taux maladie en jours ouvrés, détail d’origine du solde historique divergent, comportement d’annulation rétroactive, échéance et prolongation du report exceptionnel. Aucune demande n’a été envoyée au fournisseur.

## Recette du complément

152 tests Rust, 138 tests TypeScript, contrôle TypeScript et build de production réussis. Huit scripts de recette HTTP, 73 groupes passants : montant partiel et nul, références et confirmations obligatoires, bornes, contrat hors période, concurrence, erreur disque, persistance après redémarrage, non-double-crédit, et protections d’exercice.

Chrome local `127.0.0.1:18138` : crédit fictif 2,18, bouton désactivé avant confirmation du calcul, confirmation sur tablette, puis relecture serveur du journal et de sa référence. Ordinateur 1440×1000, mobile 390×844, tablette 768×1024 ; captures et résultats dans `recette/prorata-report-2026-11-25/`. Aucun envoi externe ni modification de la version en ligne. Validation sur ce périmètre seulement, sans certification de parité exhaustive.
