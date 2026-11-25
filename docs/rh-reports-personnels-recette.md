# Reports RH dans Mon compte — 25 novembre 2026

Branche `feat/rh-personal-carryover-visibility` depuis main `97862d3`, après revue, approbation et fusion de #67 par pinto1230766. Aucune modification de la version en ligne par Codex.

## Parcours livré

Mon compte → Mon dossier → Compteurs & historique → Mes reports exceptionnels.

Le salarié consulte son reliquat confirmé, la période et l’échéance de ses suivis, les jours encore concernés **au dernier rapprochement**, les alertes de solde changé/échéance passée et les suivis clôturés. Ces jours restent inclus dans le N-1 : aucune addition ni nouvelle expiration automatique. La consultation ne remplace pas l’information formelle du salarié et ne calcule aucune règle juridique.

Le responsable continue à gérer le suivi dans les paramètres RH. Le nouveau parcours personnel ne crée ni ne modifie de suivi et n’envoie aucun message. Le salarié voit ses suivis globaux depuis chacun de ses clubs autorisés ; il ne voit pas les dossiers d’autres salariés. Actualisation explicite disponible, anciennes données retirées pendant un chargement/échec, réponses d’un ancien compte ou club abandonnées.

Serveur : GET `/api/me/carryovers/:club_id`, identité issue de la session Bearer, compte actif et rattachement au club obligatoires. Aucun identifiant de salarié fourni par le client n’est utilisé pour sélectionner un autre dossier. Projection par liste blanche : pas de raisons internes, références, justificatifs, signatures techniques, auteurs ni historique responsable. POST non disponible. La projection est aussi validée côté interface pour l’identité, le club, les quantités, dates, doublons et champs internes inattendus.

## Recette

Copie locale isolée `127.0.0.1:18140`, données fictives neuves, clés Heitz vidées et workers désactivés. Aucun envoi ni appel fournisseur.

- 147 tests TypeScript réussis, dont trois nouveaux contrats personnels ; contrôle TypeScript et build Vite réussis.
- 152 tests Rust réussis. Après le dernier durcissement du rattachement club, compilation Rust et recette HTTP du module rejouées avec succès.
- 85 groupes HTTP sur dix recettes RH/personnelles : `test_hr_leave_carry.py` passe de six à sept groupes, avec identité réelle, refus hors club, tentative de changement de salarié ignorée, refus d’écriture, redaction, lecture après changement du compteur, consultation multi-clubs et persistance après redémarrage. Les neuf autres recettes passent.
- Navigateur : connexion du salarié fictif Chloé, accès par Mon compte, lecture d’un suivi de 1,5 j sur un N-1 fictif de 2 j ; aucune note interne affichée ; actualisation confirmée. Ordinateur 1440×1000, téléphone 390×844 et tablette 768×1024. Captures `recette/reports-personnels-2026-11-25/`. Aucun débordement horizontal du document observé sur ordinateur/téléphone ; dernier historique visible au-dessus du bandeau sur les captures.

Le premier essai de préparation fictive a été correctement refusé parce que le N-1 initial de Chloé était à zéro. Un ajustement fictif traçable à deux jours a ensuite été enregistré dans cette seule copie locale avant création du suivi. Aucun salarié ni compteur réel Skello modifié.

Validé sur le périmètre local testé ; appareils physiques, information formelle, calcul juridique et exhaustivité Skello non validés. Le complément Heitz de cette branche est documentaire : ticket #68 et catalogue public partiel, sans modification du connecteur Heitz.
