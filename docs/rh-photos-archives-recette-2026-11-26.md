# Archive conjointe des fichiers privés RH — V2, 26 novembre 2026

Branche : `feat/rh-private-photo-archives`, base `8d9815e` (PR #95 déjà intégrée).
Validation sur copie locale isolée, uniquement état fictif et PNG 1 × 1 générés. Aucune caméra, photo réelle, tablette, donnée de club ni intégration externe sollicitée.

## Comportement livré

La commande `scripts/rh_documents_archive.py` inclut désormais les deux magasins privés connus : `rh-documents` et `punch_photos/<club>`. Le format écrit est `cfitness-rh-private-files-v2` ; la lecture des archives V1 documentaires reste disponible. Une V1 prétendant contenir des photos est refusée.

Le manifeste lie chaque octet au registre JSON : chemin reconstruit, club autorisé, identifiant, taille et SHA-256. Les photos acceptent PNG/JPEG, 16 octets à 512 Kio chacune, 10 000 références maximum et 200 Mio par club dans l'archive (limite de cet outil, pas une politique de rétention métier). Les limites documentaires restent inchangées : 4 Mio par fichier et 200 Mio par club. État limité à 10 Mio, manifeste à 8 Mio. Fichiers et dossiers privés ne doivent pas être des liens symboliques.

La signature HMAC est optionnelle et doit être demandée explicitement par le nom d'une variable d'environnement ; aucune clé ne doit être commise ni passée en clair dans une commande. Si une clé est sélectionnée, une archive non signée est refusée. Une archive signée impose sa clé de vérification.

Restauration hors ligne exclusivement vers un dossier **neuf** : vérification complète avant création, fichiers exclusifs, état écrit en dernier ; dossier existant jamais remplacé. Les octets, dates, consommations et liens vers pointages sont conservés tels quels. La restauration ne prolonge aucune validité de preuve et ne crée aucun pointage. Ne pas démarrer le serveur sur le dossier avant le succès complet de la commande.

Le diagnostic détecte aussi les entrées photo non référencées sans rien supprimer. Si une purge intervient après la capture du JSON et fait disparaître une photo nécessaire, l'archive est refusée ; relancer sur l'état courant. L'outil ne bloque pas les autres opérations et ne garantit pas un instantané transactionnel de tous les futurs magasins externes.

## Défauts corrigés

1. Les exports/restaurations JSON seuls étaient déjà bloqués pour les documents, mais restaient possibles avec seulement des photos privées. Régression reproduite : le nouveau test attendait un refus et obtenait un export réussi. Désormais refus 409 sur état courant ou entrant contenant des photos, sans mutation ni révocation de session.
2. La consultation d'une photo servait le fichier disque sans vérifier taille ni empreinte. Lecture désormais bornée à 512 Kio + 1, longueur et SHA vérifiés avant réponse ; format limité à PNG/JPEG. Altération de même taille et taille différente renvoient 409. Fichier absent reste 404, accès interdit reste 403. Réponses privées sans cache, avec nosniff et no-referrer.
3. Les droits restent strictement propriétaire/superadministrateur. Un responsable de club ordinaire et le salarié ne gagnent aucun droit de galerie ou de téléchargement.

## Preuves exécutées

- `cargo test --locked --quiet` : **219 réussis, 0 échec**. Nouveau test JSON d'abord rouge, puis vert.
- `cargo build --locked --quiet` : réussi.
- `npm run lint` : réussi ; `npm test` : **179 réussis, 0 échec** ; `npm run build` : réussi.
- `scripts/test_rh_documents_archive.py` : **15 réussis** : V1/V2, HMAC, corruption, chemins, tailles, liens, doublons, orphelins conservés, purge concurrente simulée et restauration neuve.
- `scripts/test_rh_documents_archive_http.py` : **8 groupes réussis**, véritable backend Rust : état photo seul protégé, accès owner dans les deux clubs, refus salarié/manager, mauvais club 404, dépôt PDF + accusé, archive signée, restauration vers dossier neuf, redémarrage et mêmes fichiers/métadonnées, altérations photo refusées, diagnostic sans suppression.
- `scripts/test_hr_documents.py` : **7 groupes réussis** ; droits, échecs disque, intégrité, notifications et redémarrage documentaire non régressés.

Les deux photos HTTP sont injectées hors ligne dans le nouvel état fictif : une référence en attente et une référence consommée fictive, pas une preuve de capture caméra ou de rattachement réel à un cours. Aucun nouvel écran ni CSS n'est modifié ; aucune nouvelle recette navigateur ordinateur/mobile/tablette n'est revendiquée.

## Procédure opérateur

Utiliser les actions existantes `create`, `verify`, `restore`, `inspect` ; la procédure de #95 reste applicable, avec le magasin photo désormais inclus. Vérifier l'archive signée puis restaurer vers un dossier neuf et démarrer une instance de recette sur ce dossier, sans fournisseurs. Conserver séparément la clé de vérification. Consulter les sorties de succès seulement après code de sortie nul.

**Limites :** archive non chiffrée contenant l'état privé complet ; protéger son stockage et sa transmission. Ce lot n'ajoute ni interface d'administration des archives, ni planification, ni réplication distante, ni basculement automatique, ni PRA certifié. Aucun chiffrement ou effacement de photos réelles n'est exécuté. La politique de conservation des archives, notamment des images qui y restent après une purge du serveur source, doit être décidée avant exploitation. Les liens de pointage présents sont conservés, pas recréés ni certifiés. Les autres magasins privés futurs, pièces jointes de communication, justificatifs d'absence et écarts DOC01/DOC02/DOC04 restent à raccorder.

Décision : **validé sur le périmètre local testé**, en attente de relecture avant intégration ; aucune fusion ni mise en ligne par Codex.
