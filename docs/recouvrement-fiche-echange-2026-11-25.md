# Recouvrement : dossier factuel et préparation des échanges

Demande Daniel : aider le collaborateur au téléphone ou au club, rapprocher les informations disponibles, automatiser progressivement la collecte et préparer les dossiers contentieux. Heitz reste la référence. Aucune modification dans Heitz ni déploiement dans ce lot.

## Livré dans cette branche

- Fiche par dossier : solde indiqué, source et date de remontée, contrat indiqué, échéances connues, retard connu/inconnu, motif à confirmer, pièces manquantes et guide de conversation. Téléchargement d’une fiche texte confidentielle.
- Registre serveur de références consultées humainement : contrat, CGV/version/date de signature, détail des sommes, règlements, historique des relances. Il ne stocke pas les fichiers et ne certifie pas leur authenticité. Retrait tracé sans suppression de la référence historique.
- Les cases historiques de présence ne deviennent pas des preuves de signature. Suppression des CGV génériques inventées, des frais/préavis/délais préremplis et du bouton transformant un brouillon IA en relance effectuée. Une création manuelle sans renseignements reste inconnue et n’invente pas un rejet SEPA ou une durée de retard.
- Échanges consignés : contact, paiement signalé, contestation, contrôle effectué. Paiement signalé et contestation suspendent les relances ; un simple contact ne lève pas la suspension. La reprise nécessite un contrôle humain avec références des sommes et règlements. Aucun paiement déclaré n’est automatiquement considéré encaissé.
- Refus serveur de consigner une relance pendant la suspension. Préparation/transmission contentieuse refusée sans références courantes requises ; consignation d’une démarche formelle avec référence/date, sans exécuter cette démarche. Une référence aux relances est exigée si le dossier comporte des relances.
- Contexte de l’assistant reconstruit depuis le dossier serveur autorisé ; version périmée refusée. Le prompt système transmis par le navigateur n’est pas utilisé pour ce parcours et un message système ajouté par le navigateur est refusé. Aucun texte de CGV n’étant fourni, l’assistant ne doit inventer aucune clause. En suspension, il doit préparer le rapprochement, pas une nouvelle relance.
- Droits recouvrement par club contrôlés au serveur, écritures documentaires atomiques, version de dossier pour éviter les confirmations concurrentes, brouillons conservés après erreur. CSV de suivi avec inconnus explicites et protection des cellules interprétables comme formules.

## Parcours attendu

1. Ouvrir le dossier du club autorisé et consulter la source et sa fraîcheur.
2. Rapprocher les sommes, échéances et règlements avec les pièces réellement disponibles dans Heitz.
3. Consigner les références vérifiées ; compléter les inconnus avant d’argumenter sur le contrat.
4. Consulter ou télécharger la fiche avant l’appel ou l’entretien au club.
5. Consigner les propos du client. Un paiement signalé ou une contestation suspend le suivi.
6. Faire vérifier la situation par le collaborateur habilité avant reprise ou préparation du dossier contentieux.

La fiche présente des faits et leurs sources, des inconnus et des prochaines vérifications. Elle n’expose pas un raisonnement interne du modèle et n’établit pas automatiquement la validité d’une créance.

## Recette exécutée

Base : main `8125993` incluant la PR #73 de correction des sessions. Branche `feat/recovery-evidence-assistant`. Copie locale jetable, intégrations externes désactivées ; Heitz et service IA remplacés par des adresses inactives ou un double local.

- `cargo test --locked --quiet` : **161 réussis**, dont 6 nouveaux tests de références/suspension/concurrence/persistance/clubs et le test de session apporté par la PR #73. Avertissement du linker macOS concernant son cache temporaire ; code de sortie 0.
- `npm test` : **151 réussis**, dont 4 nouveaux contrôles du contrat reçu, de la fiche et du CSV.
- `npm run build` : TypeScript et construction Vite réussis.
- `scripts/test_recovery_evidence.py` : route HTTP Rust réelle, authentification, refus d’accès, références/signature/date future, confirmation humaine, doublon/version périmée, pièces requises, suspension et reprise, refus des anciennes routes pendant suspension, conservation au redémarrage. Double IA local : contexte périmé et compte interdit refusés avant appel ; prompt du navigateur ignoré ; contexte serveur reçu par le double. Aucun modèle réel évalué.
- Navigateur : création d’une contestation fictive et suspension visible ; rechargement et conservation ; création d’une référence CGV fictive avec date/version, confirmation serveur et affichage dans le registre. Le champ date natif accepte le format ISO par l’accessibilité ; une première saisie par l’autre méthode du navigateur était vide et n’a pas soumis le formulaire.
- Formats contrôlés : ordinateur 1440×1000, mobile 390×844, tablette 768×1024. Aucun débordement horizontal global relevé sur la fiche. Ces tailles ne certifient pas tous les navigateurs ou appareils.

Captures exclusivement issues de la copie fictive : [ordinateur](evidence/recovery-2026-11-25/desktop.jpg), [mobile](evidence/recovery-2026-11-25/mobile.jpg), [tablette](evidence/recovery-2026-11-25/tablet.jpg).

## Observations Heitz web — lecture seule

Session administrateur du client consultée sans modification. Versions affichées : DB 1.1.5, WS 2.1.4-beta.187, CRM 1.4.187. Un seul centre observé dans ce lot.

Menus observés : Profil, Famille, Informations CRM, Document, Paramètres ; Contrats/Accès avec Abonnement-Accès, Carte membre, Passages, Séances, Réservations, Essai, Invitations, Ticket barcode, Prêt objets ; Finance avec Financier, Facture, Relance financière, Échéancier, Mandat SEPA/Banque, Adresse facturation.

La vue Document d’un dossier existant contient deux lignes PDF de contrat. Les fichiers n’ont pas été ouverts ni téléchargés : cette observation ne prouve ni leur contenu, ni une signature, ni la version des CGV applicable. Aucun nom, identifiant de client, nom de fichier ou capture réelle n’est publié ici. L’existence d’un écran web ne démontre pas la disponibilité d’une route API.

## Non livré / vérifications nécessaires pour la suite

1. **Collecte automatique Heitz** : routes autorisées réelles pour contrats, fichiers CGV/signatures, échéancier, factures/avoirs, encaissements/rejets et relances. Confirmer droits et correspondance par centre avec la documentation fournisseur. Le catalogue public actuel reste partiel ; aucune couverture de 100 % annoncée.
2. **Rapprochement financier complet** : paiements partiels, remboursements, avoirs, doublons, litiges, échéances futures, solde et retards avec date de valeur. Les références financières sont invalidées si le montant ou les mois du dossier changent ; elles ne prouvent pas que les données non encore exposées par Heitz sont complètes.
3. **Travail quotidien automatique** : collecte planifiée, surveillance des échecs et de la fraîcheur, tâches attribuées au bon club, détection des nouveaux règlements et fermeture après rapprochement. Ce lot fournit le statut de suspension et les gardes des routes actuelles, pas ce moteur quotidien complet.
4. **Documents réels** : consultation sécurisée, rapprochement des versions et signatures, extraction sourcée éventuellement assistée par IA, durée de conservation et droits de téléchargement. Le registre livré contient seulement des références saisies après vérification humaine.
5. **Contentieux** : paquet documentaire complet avec originaux et chronologie, format/accusés/statuts du prestataire à convenir. La fiche texte et le CSV sont des documents de travail ; ils ne constituent pas un dossier juridiquement validé ou un envoi au prestataire.
6. **Qualité de l’agent** : modèle local réel, réponses sourcées, évaluations métier et résistance aux instructions contenues dans les pièces à tester. Les tests du double démontrent le transport du contexte et les refus d’accès, pas la fiabilité des réponses d’un modèle.
7. **Fraîcheur des écrans déjà ouverts** : la version protège les écritures de références et le contexte IA ; une autre session doit actualiser pour voir les changements. Les anciennes actions statut/relance n’ont pas encore de contrôle de version client. Aucun temps réel garanti.

Validation partielle : le parcours de préparation et de consignation est testé localement. Ni recette Heitz réelle complète, ni activation d’un recouvrement autonome, ni mise en production.
