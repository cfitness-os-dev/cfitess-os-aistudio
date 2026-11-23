# Email Lead — import et raccordement fournisseur

État au 23 novembre 2026, branche `feat/lead-scenarios-contract`, suite PR #44. Volume annoncé : moins de 10 000 emails mensuels pour les deux clubs. Aucun fournisseur activé et aucun envoi externe pendant cette recette.

## Lot livré : import d’images

- L’import vérifie les octets PNG/JPEG, en plus du type déclaré et de la taille du fichier. Un fichier renommé avec une mauvaise signature est refusé avant modification du modèle.
- Le navigateur doit aussi réussir à décoder l’image ; les erreurs laissent l’image précédente intacte.
- Le budget de 2 Mio porte sur toutes les images intégrées du document, y compris les blocs dupliqués. Remplacer une image libère le poids de l’ancienne image du bloc sélectionné.
- Le sélecteur est réinitialisé après chaque choix : sélectionner à nouveau le même fichier déclenche une nouvelle lecture.
- Une lecture tardive est abandonnée si le document change. La sauvegarde reste bloquée pendant la lecture.
- Quand un autre document possède des identifiants de blocs différents, ses propriétés restent accessibles immédiatement par sélection du premier bloc existant.

Preuves exécutées : TypeScript strict réussi, 95 tests TypeScript réussis, build réussi (`index-Defs1RRy.js`), 111 tests Rust réussis, 12 groupes HTTP réels réussis dont images intégrées, refus SVG, rendu isolé, permissions et persistance après redémarrage. Une première exécution Rust sans TMPDIR autorisé a échoué sur la création des fichiers temporaires ; la reprise avec le répertoire de test autorisé passe intégralement.

Limite de preuve : la navigation du navigateur intégré vers la copie locale expire (« unknown or expired node_repl continuation »), malgré une réponse HTTP 200 de l’application. Le choix natif du fichier, sa réimportation et son rendu visuel dans cette nouvelle version restent à rejouer sur ordinateur/mobile/tablette. Aucun résultat visuel de ce lot n’est annoncé comme réussi. Le contrôle binaire du serveur reste une validation de signature et de taille, pas un décodage complet ni un antivirus. Le décodage ajouté côté navigateur ne remplace pas une validation serveur approfondie avant stockage public.

## Choix du service d’envoi : proposition, à confirmer avant activation

**Mise à jour :** le client a confirmé que Heitz utilise déjà Brevo. La décision courante est de préparer Brevo ; voir [le contrat Brevo/Heitz](lead-brevo-integration.md). Le comparatif ci-dessous reste un relevé historique, pas la recommandation d’activation actuelle.

Recommandation pour l’OS propriétaire : Amazon SES par API, région européenne à choisir, avec un adaptateur remplaçable. Les modèles et scénarios restent dans C.Fitness OS. Le coût unitaire d’envoi est faible ; la gestion fiable des livraisons constitue le principal travail restant.

Tarifs publics consultés le 23 novembre 2026, hors taxes, options, données et développement :

| Service | Base publique | Conséquence pour notre volume |
|---|---|---|
| Amazon SES à la carte | 0,10 USD / 1 000 emails ; données facturées séparément | 10 000 emails : 1 USD d’envoi de base. Les nouveaux comptes peuvent démarrer sur Essentials à 0,16 USD / 1 000 : sélectionner explicitement la formule voulue. |
| Brevo Starter | À partir de 7 EUR/mois, premier palier 5 000 emails et 500 contacts enregistrés | Devis réel à configurer selon emails ET contacts ; retrait du logo en supplément sur Starter. Ne pas présenter 7 EUR comme un tarif pour 10 000 emails. |
| Postmark Basic | 15 USD/mois pour le volume affiché de 10 000 emails | Alternative API avec séparation des messages de service et des campagnes. |

Sources officielles : [SES](https://aws.amazon.com/ses/pricing/), [offres Brevo](https://help.brevo.com/hc/fr/articles/208589409-%C3%80-propos-des-offres-d-abonnement-de-Brevo), [Postmark](https://postmarkapp.com/pricing).

Brevo peut accélérer un premier démarrage si ses outils de suivi sont utiles, mais il ne faut pas recréer nos scénarios simultanément dans deux systèmes. Une campagne promotionnelle reste promotionnelle même si elle est soumise par API.

## Contrat du prochain raccordement — non implémenté par ce lot

1. Une boîte d’envoi persistante côté serveur, un message par destinataire, avec club, version publiée du scénario, étape et identifiant stable. Ne jamais exposer les secrets fournisseur au navigateur.
2. États distincts : préparé, en attente, soumis au fournisseur, livré, refusé, annulé et résultat incertain. Une acceptation API ne prouve pas la livraison. Un délai d’attente après soumission exige rapprochement avant renvoi, car le fournisseur peut avoir accepté le message.
3. Autorisation d’envoi par club et limites de débit/budget ; vérification du consentement et des exclusions juste avant soumission. Un désabonnement doit empêcher les étapes promotionnelles déjà en attente. Pas de bascule automatique vers un autre prestataire qui contournerait les exclusions.
4. Webhooks authentifiés, vérifiés contre les rejeux et dédupliqués ; historique des erreurs, rebonds et plaintes. Conserver les préférences d’abonnement dans l’OS et les rapprocher avec les exclusions du fournisseur.
5. Configurer SPF, DKIM et DMARC sur les domaines d’envoi ; distinguer les flux de service et promotionnels et mettre en place le désabonnement. Utiliser les adresses existantes des clubs pour les réponses au départ.
6. Les images data URI servent actuellement à l’édition et à la simulation. Pour les emails réellement envoyés, prévoir transformation contrôlée en images MIME intégrées (CID) ou médias HTTPS hébergés, puis essais sur des clients mail réels ; ne pas annoncer la compatibilité sur la seule foi de l’aperçu web. Prévoir également une version texte.
7. Avant les premiers envois : compte fournisseur validé, domaines autorisés, limites d’envoi confirmées, identité légale et coordonnées des clubs, procédure de désabonnement, validation du budget et autorisation précise de recette réelle. Aucun secret dans Git.

La simulation actuelle est conservée. Les envois réels, les fenêtres horaires d’exécution, la réinscription paramétrable et le raccordement complet des réponses entrantes ne sont pas certifiés ou livrés par ce lot. La parité exhaustive avec Lead reste à vérifier dans le registre fonctionnel ; ces tests ciblés ne la démontrent pas.
