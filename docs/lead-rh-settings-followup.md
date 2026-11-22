# Suite des réglages Lead et RH

Lot Codex coordonné sur le ticket #21, à partir de `cfa60f5`, après #23. Branche `fix/lead-rh-settings-followup`. Pas de modification des moteurs d’automatisation ni de déploiement.

## Corrections

- Les six activations Email/SMS de service utilisent les mêmes identifiants `enabledAlertIds` que Notifications, avec le contrat serveur et l’éditeur acteur/club de #23. Un changement reste un brouillon jusqu’à l’acquittement du PUT. Il ne modifie aucun texte de modèle : l’édition de ces modèles reste à développer.
- Le faux test d’alerte devient un aperçu local, explicitement sans envoi ni test serveur. Les huit cases d’alerte ont un label cliquable ; le script commercial et le délai d’archivage ont un nom accessible.
- Une erreur de stockage du profil local donne une erreur, jamais un succès. Le bouton et la notice indiquent que le profil n’est enregistré que sur cet appareil. Sa centralisation serveur reste un chantier distinct.
- Le badge de conformité lié à la langue est remplacé par une information neutre ; les routes de référence ne s’affichent qu’en mode technique ; les raccourcis d’archivage utilisent des durées métier ; les chemins longs des connecteurs peuvent revenir à la ligne.
- Les quatorze rubriques de réglages conservent leurs identifiants ; leurs libellés métier sont centralisés dans `leadSettingsPresentation.ts`. Sur petit écran, un sélecteur remplace le bloc de quatorze boutons, sans supprimer de rubrique. Les outils de test et détails réseau des connecteurs restent en mode technique ; leur état métier indique explicitement la démonstration et l’absence de vérification réelle. Le choix de langue anglaise à venir est désactivé tant que la traduction n’existe pas.
- Dans MC10, fréquence de badgeage et badgeage des pauses sur tablette sont enregistrés via `PUT /api/admin/sites/:site_id/timeclock-settings`. L’interface garde la valeur confirmée tant que l’écriture n’a pas réussi et empêche les écritures concurrentes.
- Cette route dédiée exige un administrateur ou les deux droits existants `ORG04-29` (modifier les règles) et `ORG04-37` (accéder aux paramètres badgeuse), évalués sur le **club cible**. La seule consultation des paramètres ne confère pas leur modification. Aucun rôle ni droit global existant n’est changé. Le formulaire limite l’édition au club actif pour utiliser les droits du dashboard correspondant.
- Le DTO de badgeage exige les deux champs, un booléen réel et une fréquence connue ; les champs inconnus sont rejetés. Les erreurs d’extraction JSON donnent HTTP 422. L’état candidat et l’audit sont publiés en mémoire après persistance seulement.

## Validation

Tests applicables : `npm run lint`, `npm test`, `npm run build` ; `cargo test --locked --manifest-path Cargo.toml`.

`scripts/test_settings_followup.py` démarre lui-même un serveur sur une adresse de bouclage et un port libre, avec un répertoire de données temporaire, mode démo, session stricte et planificateur désactivé. Il ne prend aucune URL distante. Lui fournir les secrets des comptes fictifs de référence par `CFITNESS_TEST_ADMIN_SECRET` et `CFITNESS_TEST_COMMERCIAL_SECRET`, sans les committer. Lancer après `cargo build --locked` :

```sh
python3 scripts/test_settings_followup.py
```

La recette vérifie les deux clubs, les activations de messages, les refus 401/403/404/400/422, une panne d’écriture renvoyant 500 sans modification de la mémoire/fichier, puis la relecture après arrêt et redémarrage. Les tests Rust couvrent aussi un salarié Master à CDS et lecture seule à Beynost, avec refus d’écriture dans le second club malgré un club actif CDS.

Les tests de l’éditeur couvrent une activation de message conservée en brouillon sur échec, puis enregistrée après reprise. Les suites existantes contrôlent aussi les réponses tardives, l’isolation acteur/club et la sauvegarde des réglages.

## Limites et recette à terminer

- Aucun contrôle visuel navigateur de cette nouvelle branche n’a été possible dans cette session : ne pas confondre les captures de la version précédente avec une validation de ce lot. Demander à l’équipe une recette 390/768/1440, clavier et tactile, avant fusion. Vérifier MC10 sur les deux clubs et Messages de service ↔ Notifications, puis rechargement.
- Le stockage du profil du club et la préférence d’accès Statistiques Commercial restent locaux ; cette préférence n’est pas une habilitation serveur. Les Sources/Segments complets, les modèles éditables et les liens de navigation manquants restent ouverts dans le compte rendu du ticket #21.
- Le simulateur d’alertes serveur n’est pas implémenté par ce lot. Aucun fournisseur réel ni traitement RH de pointage n’est modifié : seules la configuration persistante de badgeage et son édition sont couvertes.
- Le build signale encore un paquet JavaScript principal volumineux ; optimisation à traiter séparément.

La PR doit être relue par Antigravity avant fusion. Les garanties #22/#23 restent à conserver. Tout changement du périmètre de droits de badgeage doit être convenu puis testé sur chaque profil avant ouverture plus large.

## Priorité de présentation demandée par Daniel

Stabiliser et faire valider l’arborescence et les parcours avant de disperser de nouvelles fonctions. S’inspirer des habitudes Lead et Skello, conserver les couleurs et pictogrammes C.Fitness OS et utiliser des termes métier. Ne pas mélanger CRM Heitz, prospection Lead, RH et téléphonie. Le menu reste : Prospection – Vente ; Adhérents – CRM ; Téléphonie ; Mon planning ; Planning cours collectifs ; Mon compte ; Collaborateurs et RH ; puis modules de gestion selon les droits. Mon compte est l’espace propre du collaborateur ; Collaborateurs et RH permet la gestion autorisée par club/équipe. Mon planning agrège les informations personnelles avec des raccourcis vers leurs modules d’origine.

Pour la prochaine relecture, fournir le plan détaillé des sous-rubriques Lead et RH, la correspondance de chaque fonction auditée vers sa destination, les différences collaborateur/responsable, les états vides/erreurs/enregistrement et trois captures par parcours (ordinateur/tablette/mobile). Faire valider ce plan par Daniel avant une restructuration globale. Le nettoyage local de ce lot ne constitue pas cette validation globale.
