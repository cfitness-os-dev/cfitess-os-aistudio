# Recette — Centre documentaire RH persistant

Branche `feat/rh-document-center`, base `main c416a6f` après les PR #83–#91. Indépendante de #92. Recette exclusivement locale avec fichiers et personnes fictifs.

## Fonctionnement livré

Dans Collaborateurs et RH → Documents et signatures, le responsable dépose un PDF, PNG ou JPEG dans le dossier d’un collaborateur autorisé. Dans Mon compte → Mes documents, chacun retrouve ses propres fichiers, peut en déposer si son droit le permet, les télécharger et déclarer en avoir pris connaissance.

Les six dossiers reprennent les libellés relevés DOC01 : Contrats, Sécu soc et Mutuelle, Justificatifs, Fiches de paie, Feuilles d’heures, Autre. Filtrage/recherche sur la page courante et pagination par 50. L’archivage responsable retire le document de l’espace personnel, le conserve pour les responsables autorisés et permet sa restauration. Les documents d’un salarié désactivé restent consultables par les responsables autorisés ; son ancienne session est refusée.

Le dépôt et la prise de connaissance déclenchent des notifications internes avec les raccourcis corrects vers l’espace personnel ou responsable. Une confirmation de consultation ne constitue jamais une signature contractuelle ; aucun champ de preuve de signature n’est généré. Les anciens aperçus de modèles/signatures restent disponibles séparément.

## Droits et stockage

- Session Bearer active et rattachement au club obligatoires.
- ORG04-14 pour les documents des employés, avec portée réelle par équipes gérées et club.
- ORG04-21 pour ajouter ses propres documents. Ce droit personnel ne permet ni dépôt chez un collègue, ni accès à l’espace responsable, ni archivage.
- Lecture/téléchargement propres au salarié pour ses documents actifs ; toute requête revérifie les droits. Un responsable dont le périmètre a changé ne conserve pas un accès au fichier.
- Métadonnées dans le stockage persistant existant ; contenu dans `CFITNESS_DATA_DIR/rh-documents/<identifiant opaque>`, hors répertoire frontend. Permissions Unix dossier 0700, fichier 0600 ; pas de nom fourni par l’utilisateur dans le chemin.
- Taille maximum : 4 Mio par fichier, une importation à la fois ; corps HTTP limité à 6 Mio ; quota conservatoire de 200 Mio par club, archives comprises. Ce sont les limites de cette première implémentation OS.
- Images réellement décodées avec limites de 4096×4096 et 32 Mio de décodage ; MIME et extension cohérents. PDF contrôlé par en-tête et terminaison seulement : pas de parseur PDF complet ni d’antivirus dans ce lot.
- Octets originaux conservés, SHA-256 et longueur contrôlés au téléchargement. Lecture bornée même si le fichier sur disque a été altéré. Fichier manquant/corrompu → erreur explicite, jamais faux fichier vide.
- Réponses privées sans cache, téléchargement en pièce jointe, nosniff et absence de referrer. Pas de lien public ni jeton dans une URL.
- Même identifiant d’opération et même contenu → même dossier, pas de double fichier/notification. Rejeu modifié → conflit.
- Validation/notifications sur copie d’état ; octets écrits et synchronisés avant persistance des métadonnées. Échec normal d’écriture des métadonnées → suppression du seul nouveau fichier créé et état inchangé. Aucun ancien fichier supprimé.
- Un arrêt brutal entre ces deux écritures peut laisser un fichier orphelin sans métadonnée : nettoyage/réconciliation à développer. Cette procédure ne prétend pas être une transaction distribuée.

## Résultats exécutés

| Vérification | Résultat |
| --- | --- |
| Tests Rust | 214 réussis, 0 échec |
| Tests TypeScript | 179 réussis, 0 échec |
| TypeScript strict / build frontend | Réussis |
| Build backend | Réussi ; avertissement du linker relatif au cache xcrun interdit dans l’environnement, sans échec |
| HTTP documents | 7 groupes réussis sur vrai binaire, deux clubs, stockage neuf et redémarrage |
| HTTP notifications — non-régression | 10 groupes réussis |
| Navigateur | Parcours responsable et collaborateur exécutés ; ordinateur, mobile 390×844 et tablette 768×1024 |

Dix nouveaux tests Rust : session/droits, import concurrent idempotent et octets privés, échec disque avec conservation de l’ancien fichier, accusé propre/explicite/idempotent, archivage/restauration et historique d’ancien salarié, fichier manquant/corrompu, validation de contenu/taille/chemin, portée équipes/pagination, échec de sauvegarde des accusés/archives/restaurations, vrais PNG/JPEG et dimensions excessives.

Trois nouveaux tests TypeScript couvrent les réponses d’un autre compte/club, les métadonnées incohérentes et le refus des fichiers vides/non pris en charge.

Commandes : `npm run lint`, `npm test`, `npm run build -- --outDir <répertoire de recette dédié>`, `cargo test --locked --quiet`, `cargo build --locked --quiet`, puis `scripts/test_hr_documents.py` et `scripts/test_rh_notifications.py` avec binaire construit, TMPDIR dédié et secrets des comptes de démo fournis seulement dans l’environnement de la recette. Aucun secret fournisseur hérité et aucun service distant réel.

## Parcours navigateur et fichier vérifiés

Copie séparée : `http://127.0.0.1:58985`. Jeu fictif conservé dans `.tools/tmp/cfitness-demo-review-6f0zm5ds`. Bundle principal `index-BB18zavU.js`, module documentaire chargé à la demande `HrDocumentsView-REqkxDPl.js`.

1. Mario → Beynost → Documents et signatures : choix de Chloé, titre « Notice ouverture — recette fictive », PDF synthétique local, import confirmé puis carte relue.
2. Chloé : notification « Document disponible » → Consulter → Mes documents. Son document apparaît sans dossier d’un autre salarié.
3. Téléchargement réel par l’interface : `notice-rh-fictive.pdf`, 621 octets, identique au fichier synthétique d’origine. SHA-256 : `0171faf09a444b9948669ca929f2047af3118961065322b82b213abb62dade48`.
4. Chloé coche la déclaration de prise de connaissance, confirme et retrouve l’horodatage ; aucun contrat signé.
5. Mobile 390×844 : rubriques, fichier et actions accessibles, scrollWidth 383 (pas de débordement horizontal).
6. Mario reçoit « Document consulté » → Consulter rejoint les documents des équipes, pas ses documents personnels.
7. Tablette 768×1024 : accusé visible, archivage confirmé, filtre d’archives puis restauration confirmée ; scrollWidth 761. Capture affichée et examinée, sans export de capture dans le dépôt.
8. Format réinitialisé et onglet de recette fermé.

Le sélecteur et le téléchargement de fichiers fonctionnent mais l’outil navigateur a mis plusieurs minutes à répondre pour ces deux opérations ; aucun envoi répété effectué.

## Écarts et conditions avant données réelles

Validation sur le périmètre testé, sans exhaustivité DOC01/DOC02/DOC04.

- Le relevé Skello DOC01-17 propose jusqu’à cinq fichiers et les formats DOC/DOCX : ces options ne sont pas livrées ici. La limite OS de 4 Mio ne provient pas du relevé DOC01.
- Modèles et variables, génération, import groupé, distribution collective, déplacement/renommage, expiration, relances, signature électronique et coffre-fort probatoire restent à développer ou connecter. Les anciennes démonstrations ne prouvent pas ces fonctions.
- Pas de fichier médical réel, de chiffrement applicatif au repos, de scan antivirus/CDR, de validation Windows/Linux/Docker des ACL, de rétention/purge ni de file de travail multi-instance certifiés.
- **Sauvegarde/restauration : le JSON seul ne contient pas les octets.** Il faut inclure le dossier privé et vérifier leur cohérence au redémarrage/restauration avant toute utilisation documentaire réelle. Une sauvegarde des seules métadonnées ne doit pas être présentée comme une sauvegarde documentaire complète.
- Les justificatifs des absences utilisent encore les documents historiques de leur contrat dédié ; ne pas prétendre que les nouveaux imports sont déjà sélectionnables dans une demande d’absence.
- Les pièces jointes aux communications RH ne sont pas raccordées dans ce lot.
- Préserver métadonnées ET dossier privé avant intégration ou retour de version. Aucune fusion ni mise en ligne effectuée par Codex.
