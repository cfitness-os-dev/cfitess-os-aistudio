# Communication RH persistante et calendrier personnel — livraison du 26 novembre 2026

## Périmètre livré

Base : PR #85, commit 7239a0d. Branche : `feat/hr-messages-and-private-calendar`.
Ce lot remplace l’aperçu local MC09 et le faux lien calendrier par des parcours utilisant le serveur Rust. Il ne certifie pas la parité exhaustive avec Skello.

### Communication RH

- **Collaborateurs et RH → Communication RH** : choix des destinataires autorisés du club, recherche, sélection des résultats, objet (160 caractères), message (10 000 caractères), publication et historique personnel paginé par 50.
- Publication **interne uniquement**, sans email, SMS, WhatsApp ou Brevo. Une notification persistante apparaît dans **Mon compte → Accueil → Mes notifications** de chaque destinataire ; son expéditeur est affiché.
- Le collaborateur peut marquer le message comme lu. Le responsable actualise les lectures ; la première date de lecture est conservée. Il s’agit d’une lecture déclarée par le collaborateur, pas d’une preuve de lecture du contenu ni d’une signature.
- Profil exact dans le club : Administrateur système, Master avancé ou Planificateur avancé. Le ciblage dépend en plus de `ORG04-07` et des équipes encadrées. Un rôle administrateur dans un autre club ne donne pas automatiquement le droit de publier ici.
- Un destinataire non autorisé fait refuser toute la publication, sans envoi partiel.
- Historique limité aux propres messages du responsable dans le club choisi. Les lectures nominatives ne sont rendues que pour les destinataires encore consultables ; le nombre original de destinataires est conservé.
- Réessayer une publication identique après perte de réponse ne crée pas de doublon : identifiant d’opération associé au compte, au club et à une empreinte du contenu. Contenu modifié sous le même identifiant : refus 409.
- Sur erreur de persistance : pas de notification, message, audit ou confirmation de réussite ajouté en mémoire ; saisie de l’interface conservée. Le service existant écrit un fichier temporaire puis le renomme.
- La protection existante contre l’abandon d’un brouillon est utilisée. L’écran est remonté avec une clé compte/club pour empêcher une ancienne réponse de remplacer le nouveau contexte.

### Calendrier

**Mon compte → Mes préférences → Connexion à mon calendrier** :
1. Activer puis enregistrer les préférences si nécessaire.
2. Sélectionner les clubs autorisés.
3. Créer le lien privé ; copier son adresse pour un abonnement ou télécharger le fichier.
4. Renouveler invalide l’ancien lien ; révoquer coupe sa lecture ; désactiver dans les préférences détruit aussi l’autorisation. Une réactivation ne restaure aucun ancien lien.

Contenu : horaires **publiés** du seul collaborateur et absences **validées**, dans les clubs choisis et encore autorisés, sur une fenêtre de 90 jours passés à 366 jours futurs. Ni brouillons d’horaires, autres salariés, tâches/commentaires de mission, motifs médicaux, pièces RH ou données salariales. Les absences ont le titre générique « Absence validée ». Les journées entières utilisent une fin exclusive ; les demi-journées utilisent la convention 00h–12h / 12h–24h. Cette convention ne prétend pas reproduire la durée du poste du collaborateur.

Horaires Europe/Paris convertis en UTC, y compris nuit traversant minuit et changements saisonniers. Horaire invalide : erreur visible 503, sans produire silencieusement un agenda partiel. Format inspiré des règles de [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545) : CRLF, échappement des textes, pliage des lignes à 75 octets sans couper les caractères UTF-8, identifiants stables.

Sécurité :
- Lien porteur d’un secret aléatoire de 256 bits. **Toute personne possédant le lien peut lire le planning concerné** ; l’interface le précise.
- Secret retourné une seule fois à son propriétaire connecté ; seule son empreinte SHA-256 est conservée dans l’état. Aucun secret dans l’audit. Les anciens identifiants prévisibles des préférences ne sont jamais acceptés par le flux.
- Les droits et l’activité du compte sont revérifiés à chaque consultation.
- Réponse privée sans cache et sans référent ; chemin secret masqué dans les traces HTTP de l’application.
- Le journal d’un éventuel proxy, hébergeur ou agenda tiers doit être configuré séparément pour ne pas conserver le chemin secret.
- Révoquer bloque les nouvelles lectures ; cela n’efface pas les événements déjà téléchargés ou mis en cache par un agenda tiers.
- Une adresse locale 127.0.0.1 ne permet pas l’abonnement d’un agenda hébergé ailleurs. Avant cet essai : adresse HTTPS stable et accessible, journaux protégés, accord utilisateur.

## Contrat des routes

| Route | Protection / effet |
| --- | --- |
| GET /api/hr/communications/:club_id | Session, profil du club et périmètre des destinataires ; `before` facultatif pour l’historique |
| POST /api/hr/communications/:club_id | Même contrôle ; `operationId, subject, body, recipientIds` ; persistance avant confirmation |
| POST /api/me/workspace/:club_id | Action existante `read_notification` sur sa propre notification ; première date de lecture |
| GET /api/me/calendar-link | Propre session ; état du lien, aucun secret |
| POST /api/me/calendar-link | Propre session active, préférence activée, `clubIds` autorisés ; crée/renouvelle |
| GET /api/calendar/:token.ics | Secret porteur, validité du compte/préférence/droits ; uniquement ses événements |
| POST /api/me/calendar-token/revoke | Route compatible existante ; retire l’autorisation du flux |
| PUT /api/me/preferences | Désactiver `calendarFeedEnabled` retire l’autorisation ; rollback en cas d’erreur disque |

Stockage rétrocompatible dans `personalWorkspace.collaboration` avec valeurs par défaut. Les préférences historiques restent lisibles ; elles ne donnent pas accès au nouveau flux.

## Résultats réellement exécutés

| Niveau | Résultat |
| --- | --- |
| TypeScript, interface et contrats existants + 4 nouveaux tests | 165 tests réussis |
| Suite Rust complète finale | 185 tests réussis |
| Module RH final, incluant les équipes encadrées et la pagination | 10 tests réussis, 175 autres filtrés |
| Construction TypeScript/Vite et binaire Rust | Réussie |
| Recette HTTP contre binaire Rust final | 10 contrôles réussis, dont redémarrage serveur, non-doublon, refus de droits, confidentialité, renouvellement/révocation/désactivation et erreur disque |
| Navigateur ordinateur / mobile / tablette | **Bloqué** : outil de navigateur réinitialisé puis deux erreurs « unknown or expired node_repl continuation ». Aucun parcours visuel nouveau ni capture prétendue pour ce lot. |

Commandes : `npm test`, `npm run build`, `cargo test --locked --quiet`, `cargo test --locked --quiet hr_collaboration`, `cargo build --locked --quiet`, puis `CFITNESS_TEST_BINARY=… TMPDIR=… python3 scripts/test_hr_collaboration.py`. Les chemins de compilation locaux diffèrent du projet racine pour garder les copies isolées.

Les recettes initialisent leur propre jeu fictif et reconstruisent un environnement sans clés fournisseur héritées. Heitz, les workers d’envoi et les services externes sont désactivés. Les jetons de calendrier ne sont jamais imprimés par la recette.

Démo locale dédiée finale : **http://127.0.0.1:52120/mon-compte**. L’ancienne démo 55211 et ses données ne sont pas remplacées. Pas de mise en ligne publique ni de fusion de main.

## Reste précisément à vérifier / développer

- Dès rétablissement du navigateur : responsable/Beynost publie, Chloé voit puis marque lu, responsable retrouve la lecture après actualisation et rechargement ; reprise après erreur et protection du brouillon ; changements de club/compte ; aucun débordement à 390 et 768 px ; accès calendrier, choix des clubs, création, révocation et désactivation.
- Abonnement réel Apple/Google/Outlook non testé. La réponse HTTP .ics ne prouve pas la fréquence ni la qualité d’actualisation d’un logiciel tiers.
- Aucun email collectif RH réellement connecté, aucune pièce jointe, programmation, ciblage automatique des dossiers incomplets, réponse/conversation, notifications push ou relance automatique. Ne pas présenter ce lot comme l’intégralité du contrat COM01 audité.
- Le stockage JSON existant, sans nouvelle politique de rétention, doit être dimensionné pour l’historique réel. La pagination d’affichage ne constitue pas une validation de charge ni une garantie de résistance à une coupure électrique.
- Relire et intégrer la chaîne #83 → #84 → #85 → ce lot avant tout déploiement ; main a reçu en parallèle des correctifs Lead et de veille IA. Ne pas écraser ces changements et rejouer les recettes après intégration.

**Décision : validé sur le périmètre serveur testé ; validation partielle de la livraison, contrôle visuel bloqué.**
