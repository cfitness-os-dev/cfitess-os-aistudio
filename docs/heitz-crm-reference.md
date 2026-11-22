# CRM : HeitzSystem reste la référence

Complément au ticket #25, construit sur main `30ede87`, sans déploiement.

## Contrat métier

Le CRM affiche une copie de consultation provenant d'un export Heitz. Il ne prétend ni synchroniser en direct ni exécuter une opération fournisseur. Création, abonnement, gel, impayé et badge passent par Heitz tant qu'une API officielle autorisant chaque opération n'a pas été documentée et vérifiée. Les actions locales qui simulaient ces écritures sont refusées dans ce parcours.

Configurer hors du code `CFITNESS_HEITZ_WEB_URL_CDS` et `CFITNESS_HEITZ_WEB_URL_BEY`. Une adresse HTTP(S) sans identifiants peut ouvrir la connexion Heitz dans un nouvel onglet ; ce lien ne sélectionne pas automatiquement l'adhérent. L'adresse fournie par le club doit être confirmée avec Heitz. Aucun mot de passe n'est transmis.

## Import et droits

L'import d'un snapshot est réservé à l'administrateur. Les clubs inconnus, identités ambiguës et collisions entre clubs sont rejetés, même pour un administrateur. Le rapprochement repose sur identifiant/badge, jamais uniquement sur nom ou email. Tout le lot est validé avant publication ; une erreur de persistance ne publie pas de modification en mémoire. Aucun badge physique n'est activé.

Le formulaire attend l'enregistrement puis une relecture serveur. Une erreur conserve la saisie, permet une nouvelle tentative et n'affiche pas de succès. Les réponses tardives d'une ancienne session ou d'un ancien club sont ignorées. La sélection du dossier suit les résultats filtrés et devient vide sans résultat.

Les refus serveur distinguent droits insuffisants (403) et écriture fournisseur indisponible (409). Les anciens tests validant une mutation financière purement locale sont remplacés conformément au contrat métier ; le test de collision interclubs livré sur main est conservé.

## Recette locale du 22 novembre 2026

Données fictives, stockage dédié et serveur Rust local. Aucun envoi, paiement, connexion fournisseur ou portillon réel.

- Réussi : lint, compilation frontend et backend, 67 tests Rust, 55 tests TypeScript.
- Réussi : 12 scénarios HTTP du script `scripts/test_heitz_crm.py`, dont refus sans session, périmètre commercial, collisions, lot invalide atomique, panne disque et persistance après redémarrage.
- Réussi dans le navigateur : import des deux clubs, filtre vide sans ancien dossier, changement de club, échec d'import avec saisie conservée puis nouvelle tentative confirmée, accès commercial sans bouton d'import.
- Contrôle visuel ciblé : 1440×1000, 768×1024 et 390×844. Sur mobile après défilement, le dernier bouton Heitz se termine à y=615, avant le bandeau à y=781. Ce résultat concerne ce parcours local, pas tous les écrans de la démo.
- Captures conservées localement dans `.tools/crm-fix-proof-20261122/` ; elles ne sont pas publiées car l'adresse de connexion du club y apparaît.

Validation partielle : la copie CRM est testée ; les API Heitz, les appareils physiques et Safari natif ne le sont pas. Les anciennes rubriques Finances, kiosque et autres simulations Heitz hors de ce parcours ne sont pas certifiées par ce lot. Le nom du profil dans le bandeau général mérite un contrôle séparé : il reste Thomas CLAUDE alors que la recette utilise Mario ou Chloé.

## Relecture attendue

Antigravity relit le contrat Heitz, le refus des écritures simulées, l'import atomique et le périmètre commercial. Ne pas fusionner ni déployer sans revue. La reprise des automatismes Lead reste dans son chantier, sans modifications simultanées des fichiers CRM réservés.
