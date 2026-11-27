# Prospects partagés : création, édition et reprise contrôlée

Branche feat/lead-shared-contact-writes, base main d337433, implémentation initiale 1539db3 et intégration locale 5a79b85, puis compléments de parcours. Recette du 27 novembre 2026, uniquement sur données synthétiques. Aucune connexion réelle Heitz/Skello/Brevo, aucun envoi, paiement, portillon ou déploiement.

## Problème et comportement livré

La liste était lue depuis le serveur (#106), mais créer ou éditer une fiche ne modifiait que le navigateur. Désormais le formulaire crée une fiche via POST /api/lead/contacts et les éditions/étapes passent par PATCH /api/lead/contacts/:id. La fiche principale propose « Modifier le prospect », avec prénom, nom, téléphone, email, source, adresse, objectif, notes et consentement explicite. Objectif et notes sont stockés séparément.

Le navigateur ne remplace la fiche qu’après accusé cohérent : acteur, club, opération, identifiant attendu, révision et champs réellement enregistrés. Une panne, un refus, un doublon ou une réponse incohérente conserve la saisie. Aucun email, consentement, commercial ou rendez-vous n’est inventé. Une nouvelle fiche utilise la résolution commerciale qualifiée du main #107.

Les anciennes copies restent consultables. « Reprendre ce contact » ouvre un formulaire de vérification avant création explicite d’un nouveau prospect partagé, à l’étape Nouveau. Les anciens historiques ne sont pas importés automatiquement ni effacés. Une écriture confirmée conserve aussi l’ancienne version locale (notes/segments compris) sans supprimer les autres contacts du club. Deux tests ciblés vérifient cette réconciliation unitaire. Le consentement repart à faux et doit être vérifié explicitement. Un doublon est refusé sans écrasement. Ce mécanisme ne fusionne pas automatiquement une ancienne note avec un dossier existant.

## Droits et intégrité

- Session Bearer obligatoire ; compte actif et périmètre club contrôlés.
- Création autorisée aux administrateurs/responsables concernés et planificateur standard du club, selon les règles Lead existantes. Un salarié simple/lecture seule n’acquiert pas de droit commercial implicite.
- Édition limitée au responsable du club, au commercial assigné ou au créateur habilité.
- Révision capturée à l’ouverture de l’éditeur ; une autre modification intervenue entre-temps provoque un conflit plutôt qu’un écrasement.
- Référence d’opération rejouable, conservée après panne réseau et persistée au serveur ; créations concurrentes identiques regroupées.
- Validation des champs, doublons par téléphone normalisé/email dans le même club ; transfert et attribution hors formulaire. Identité/adhésion d’un adhérent confirmé restent sous référence Heitz.
- Transaction : préparation d’un nouvel état, écriture atomique puis remplacement mémoire ; échec disque sans faux succès ni reçu consommé.
- Limites : corps HTTP 64 Kio, textes et listes bornés, 10 000 contacts et 100 000 reçus ; pas de purge automatique des reçus dans ce lot.

## Preuves exécutées

- Rust : 235 tests réussis, 0 échec, sur l’arbre combiné, dont 12 nouveaux ciblés (droits, conflit, déduplication, concurrence, panne et rechargement).
- TypeScript : 207 tests réussis, 0 échec, lint sans erreur. Neuf tests du nouvel adaptateur vérifient aussi un accusé qui renvoie des champs périmés.
- Build Vite exécuté avec succès ; aucun déploiement.
- scripts/test_lead_contacts_http.py : sept groupes PASS sur un vrai processus Rust et un dossier neuf : création et seconde session, deux clubs/refus, doublons/rejeux/conflit, validation/413, panne disque, concurrence et redémarrage. Aucun secret fournisseur hérité.
- Navigateur, copie isolée port 64526 (build de l’éditeur avant le dernier renforcement de comparaison des champs) : création commerciale, étape retrouvée après rechargement, modification des notes/adresse, objectif indépendant, relecture après recharge, refus de doublon avec saisie conservée, correction puis succès et compteurs actualisés, reprise explicite d’une ancienne fiche sans effacer l’original.
- Formulaires inspectés visuellement à 390×844, 768×1024 et 1440×900 ; bas du formulaire mobile atteint par défilement, boutons accessibles. Modale de création à description séparée et erreur visible ; fiche principale empilée aux largeurs intermédiaires pour éviter trois colonnes trop comprimées. Captures visualisées dans l’outil, pas exportées dans ce dossier.

## Écart métier encore ouvert

Le compte fictif Chloé est affiché Commerciale mais son profil serveur Beynost est employe_standard : la création et la règle existante de RDV répondent 403. Un administrateur crée bien à Beynost ; Maxime crée à Carré de Soie et est refusé à Beynost. Le test de réussite initialement supposé pour Chloé a échoué ; il n’est pas présenté comme validé.

Signalement sur #21, commentaire 7212888686 : raccorder une habilitation Lead explicite par salarié/club sans lui attribuer des droits d’administration RH. Ce point reste à traiter/coordonner avant pilote commercial complet. Le nouveau lot conserve le refus sûr.

## Exclusions et suite

Segments en masse, ancien rendez-vous simulé, opposition SMS, historique d’échanges et autres données encore locales ne deviennent pas persistants du fait de ce lot. Les changements d’étape ne prouvent ni une réservation réelle ni une vente Heitz. Aucun matériel, abonnement fournisseur ou envoi réel n’a été testé.

Relecture humaine requise sur routes/models/seed et package.json. Valider la version effectivement servie après fusion/déploiement par Francisco ; une PR et un build local ne prouvent pas un déploiement. Validation du parcours contact uniquement sur le périmètre décrit, pas une certification d’exhaustivité Lead/Skello ni une autorisation de mise en production.
