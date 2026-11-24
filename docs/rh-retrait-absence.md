# Retrait d’une demande d’absence en attente
24 novembre 2026 — branche feat/rh-pending-leave-cancellation, base bd3e83b (PR #48). Recette locale uniquement, aucun effet sur Skello, Heitz ou les clubs.

## Parcours livré
Dans Mon compte > Ma journée & outils > Mes absences, le salarié peut retirer sa propre demande encore en attente avec un motif de 1 à 1000 caractères. La demande devient Annulée et reste dans l’historique, avec son commentaire initial et le motif. Le responsable retrouve le même état et un filtre Annulée, sans bouton de décision. La même période peut faire l’objet d’une nouvelle demande.

Une demande déjà validée/refusée ne peut pas être retirée. Les deux routes de décision responsable refusent une demande retirée. La décision et le retrait partagent le verrou serveur : une seule opération gagne une course. Les accès restent limités au compte et au club autorisés avec le droit de demande d’absence. L’échec disque préserve mémoire, disque et journal. Aucun débit, crédit ou recalcul des compteurs ajouté.

Le bouton Actualiser mon espace permet de relire une décision, notamment après un conflit, sans écraser le motif saisi. Les commandes sont bloquées pendant cette relecture et les doubles clics restent protégés.

## Preuves exécutées
- TypeScript : lint et build réussis ; 117 tests réussis.
- Rust : 132 tests réussis et build --locked réussi.
- Nouveau script scripts/test_personal_leave_withdrawal.py : 8 groupes HTTP réels réussis. Authentification, compte/club, champs forgés, motif, échec disque, historique/journal, terminalité des deux routes, compteurs inchangés, nouvelle demande, refus après décision, 8 courses concurrentes et redémarrage réel.
- Non-régression : scripts/test_hr_manager_workflows.py (7 groupes) et scripts/test_personal_workspace.py (12 groupes), soit 27 groupes HTTP au total sur ce lot.
- Chrome local 127.0.0.1:18132 : demande CP fictive créée par Chloé, retrait motivé sur mobile, relecture par Actualiser mon espace, connexion Mario et consultation du même état à Beynost, filtre Annulée sur tablette avec absence de bouton de décision.
- Mobile 390×844 : largeur document/défilement 383/383. Tablette 768×1024 : 761/761. Ordinateur : création et consultation exécutées. Appareils physiques non testés.
- Captures : evidence/rh-retrait-absence-mobile.jpg et evidence/rh-retrait-absence-responsable-tablette.jpg.

## Limites et intégration
Amélioration propre à C.Fitness OS ; la variante d’annulation complète de Skello n’est pas certifiée par ce test. Aucun retrait d’absence validée ni formule de congés inventée.
Le statut cancelled existe déjà dans le contrat TypeScript métier et est enregistré dans la table canonique des demandes ; aucun champ de schéma supplémentaire. Les anciens lecteurs doivent préserver ce statut, et ne pas le présenter comme En attente. Garder une sauvegarde avant intégration/retour arrière.
Ce lot n’inclut pas le lot email #51. Il est empilé sur #48 sans en modifier la tête ; après fusion de #48, recibler/rebaser vers main avant intégration.
Anomalie hors fichiers réservés, relevée pendant la recette et transmise au lot #50 : après sélection globale de Beynost, le sélecteur local Club du hub RH peut encore afficher Carré de Soie alors que la liste des absences affiche correctement Beynost. Les deux sélecteurs doivent être synchronisés.
