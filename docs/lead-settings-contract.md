# Réglages Lead par club

Suite du lot Codex coordonné en #21, après la PR #22. Les moteurs d'automatisation restent dans `lead_automations.rs` et ne sont pas modifiés par ce lot.

## Contrat

`GET/PUT /api/lead/settings/:club_id` concerne exactement `carre-de-soie` ou `beynost`. `all` n'est pas un club enregistrable. Lecture et écriture exigent le droit d'administration Lead du club, vérifié au serveur.

Le JSON contient les mêmes champs que `LeadSettings` en TypeScript et Rust : `smsCredits`, `salesScript`, `archiveThresholdDays`, `notifEmail`, `notifMobile`, `whatsappNumber`, `clientPassOffer`, `autoAssignEnabled`, `autoUnassignOnLeave`, `dropoutThresholdDays`, `dropoutResetOnBadge`, `autoArchiveEnabled`, `archiveTargetStage`, `enabledAlertIds`, `selectedPassOfferIds`, `clientPassTargetScope`, `uiLanguage`.

- Archivage : entier de 1 à 730 jours ; décrochage : entier de 1 à 180 jours.
- Booléens réels, valeurs d'options autorisées, longueurs bornées, email et téléphones contrôlés. Coordonnées vides permises pour désactiver un destinataire/numéro.
- Identifiants non vides et sans doublons ; alertes connues uniquement. Les identifiants d'offres de démonstration explicitement rattachés à l'autre club sont refusés. Les IDs externes importés ne sont pas contraints à nos préfixes de démonstration ; leur existence dans un catalogue fournisseur doit rester vérifiée par l'intégration.
- `smsCredits` est relu et affiché en lecture seule. Un PUT qui tente de changer son solde est refusé ; aucun crédit n'est créé par ce formulaire. Si le solde serveur change entre lecture et écriture, recharger avant d'enregistrer.
- PUT remplace le contrat complet. Les champs inconnus, types invalides et entrées incomplètes sont refusés avant mutation ; `clientPassOffer` manquant reste accepté comme chaîne vide pour les anciens clients.
- Réglages et audit sont écrits dans l'état candidat hérité de #22, puis publiés en mémoire après succès disque seulement. L'audit est inséré en tête comme les autres événements.

## Anciens enregistrements

GET complète les champs absents avec les valeurs initiales du club, puis normalise uniquement les alias de contacts connus du même club (`notifMobileCds`, `notifMobileBeynost`, etc.). Ces alias prennent priorité sur les contacts canoniques devenus obsolètes dans les anciens formulaires mixtes. Les alias de crédits saisis dans l'ancien formulaire ne remplacent jamais le solde canonique du serveur. Les offres de démonstration de l'autre club sont retirées de l'ancien enregistrement lu. GET ne réécrit pas le disque ; le prochain PUT valide enregistre le contrat canonique sans alias. Un enregistrement restant invalide donne une erreur explicite, pas un formulaire vide présenté comme chargé.

## Éditeur React

Un éditeur est créé par couple acteur/club. Aucun réglage n'est restauré depuis le cache local commun. Pendant le chargement ou après son échec, les champs ne sont pas éditables et la sauvegarde n'est pas accessible. Une reprise explicite est proposée. Les anciennes réponses réseau sont ignorées après nouvelle requête/annulation ; changer de club ou d'acteur crée un nouvel éditeur, sans fusion des valeurs.

Le sélecteur de club est commun aux sous-rubriques et limité aux affectations de l'utilisateur ; un club global précis est respecté. Les contacts, crédits, WhatsApp et offres affichés concernent uniquement ce club. Un changement local de club avec brouillon demande confirmation. Pendant une sauvegarde les champs et le sélecteur sont désactivés. Le succès exige une réponse serveur valide correspondant au club attendu ; une erreur conserve le brouillon, sans confirmation de succès, avec possibilité de réessayer ou recharger.

Référence React vérifiée : https://react.dev/reference/react/useSyncExternalStore (abonnement stable et snapshots immuables conservés tant que l'état ne change pas).

## Validation et recette

- `contracts/lead-settings-cases.json` fournit les cas de validation communs aux tests Rust et TypeScript.
- Le test backend vérifie les refus sans modification de la mémoire/disque/audit, les droits, les clubs inconnus, puis deux sauvegardes distinctes et leur relecture disque.
- Les tests de l'éditeur utilisé par React vérifient chargement échoué/reprise, réponses tardives, isolation des acteurs/clubs, validation avant envoi, erreur d'enregistrement, double clic et réponse incohérente.
- Le middleware Vite utilise la même validation de forme, mais reste une simulation en mémoire. Il ne remplace pas la recette des droits/persistance du serveur Rust.
- Contrôle HTTP local effectué sur Rust, stockage fictif séparé, `CFITNESS_STRICT_SESSION=1`, planificateur désactivé : GET/PUT des deux clubs, refus 401/403/404/400, échec disque 500 avec GET et fichier inchangés. Aucun envoi externe.

Recette visuelle à terminer par l'équipe : ouvrir Réglages → Notifications, modifier puis enregistrer un club, basculer vers l'autre, vérifier les valeurs après reconnexion ; répéter SMS en lecture seule, WhatsApp et offres. Vérifier le changement avec brouillon, le message d'erreur/reprise et les formats mobile/tablette. L'outil navigateur a été interrompu pendant cette passe : aucune validation visuelle ou capture de ce nouveau formulaire n'est revendiquée.

## Limites de ce lot

Cette PR ne traduit pas l'interface anglaise, ne branche pas de fournisseurs réels et ne change pas la logique d'automatisation. Le profil du club et la préférence d'affichage des statistiques qui disposaient de leurs propres stockages locaux restent à traiter séparément ; ne pas les présenter comme couverts par cette persistance. Les mises à jour entre plusieurs responsables utilisent encore le dernier PUT reçu, sans verrouillage optimiste/ETag.
