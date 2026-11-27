# Présentation des modules métier — lot suivant du 27 novembre 2026

## Demande et références
Daniel demande de terminer visuellement Lead, Skello et Heitz en conservant les habitudes. La finition reste EN COURS. La matrice presentation-modules-suivi.json distingue l’enveloppe commune appliquée aux rubriques et les sous-écrans réellement contrôlés.

Références utilisées : inventaire et recommandations UX Lead dans public/references/lead_audit/LEAD_AUDIT_EN_COURS/, libellés existants de l’audit RH, parcours actuels et copies observées dans le navigateur. Couleurs et icônes existantes conservées. Aucun code propriétaire réutilisé.

## Changements
- Titres spécifiques à la rubrique dans toutes les enveloppes Lead et RH responsable.
- Quatorze réglages Lead regroupés en Club et accès, Messages et alertes, Parcours commercial, Connexions ; liste intégrale sur mobile.
- Une actualisation conserve la rubrique Lead et le réglage choisi dans l’URL. Les identifiants inconnus et les pages de diagnostic hors mode technique reviennent aux prospects ; les contrôles de droits existants continuent de s’appliquer.
- Scénarios : horaires et règles d’arrêt dépliables ; étapes accessibles plus tôt ; variables présentées comme Prénom, Nom du club, Lien de désinscription… Le contenu enregistré conserve les jetons attendus.
- Documents RH : formulaire Ajouter un document dépliable, liste et filtres accessibles immédiatement.
- Heitz : explications détaillées dépliables, référence de dossier lisible, identifiant interne conservé dans Informations de la copie. Aucun lien annoncé comme ouvert s’il n’est pas configuré.
- Heitz mobile/tablette : liste → fiche → retour, recherche conservée ; focus et défilement vers la fiche sur sélection.
- Connexion de démonstration : nombre de profils dynamique, distinction Direction/Responsable, noms de fonctions simplifiés, sélection du profil au clavier, autres interfaces regroupées. Aucune modification du mécanisme d’authentification.

## Résultats observés
- 211/211 tests TypeScript exécutés, dont 4 nouveaux cas de navigation ; build TypeScript/Vite réussi.
- Contrôles dans le navigateur intégré : ordinateur (viewport initial ~1273×716), mobile 390×844, tablette 768×1024.
- Connexion Mario de démonstration puis accès aux modules : réussi.
- Documents RH : panneau d’ajout déplié, champs et contrôles conservés, aucun fichier importé.
- Heitz : import de deux dossiers explicitement fictifs dans la seule copie locale, confirmation et relecture réussies. Aucun dossier réel ni donnée de contact réelle.
- Heitz : listes, filtre/recherche par référence, sélection, dossier à jour et dossier débiteur fictif observés. Retour préservant la recherche contrôlé sur mobile ; tableau/listes tablette sans débordement global (768 px sur 768).
- Scénarios : brouillon fictif créé et sauvegardé, repris après chargement ; variable Nom du club insère bien le jeton %club% et l’aperçu affiche le nom fictif ; sauvegarde réussie. Scénario jamais publié ni activé.
- Lead : Scénarios demeure sélectionné après rechargement ; Paramètres/Gestion des prospects reste sélectionné après rechargement mobile. Les 14 réglages sont présents dans le sélecteur mobile.
- Réglages mobile : bouton Enregistrer intégralement dégagé du bandeau en fin de page ; largeur du document 383 px pour 390 px.
- Captures inspectées dans la conversation, non exportées dans ce dossier.

## Copie et frontières
http://127.0.0.1:62511/ — sur le Mac de recette uniquement.
Frontend build-presentation-metier, backend du lot précédent sans changement Rust ; données neuves dans un dossier isolé. Tous les workers/services externes désactivés, adresses Heitz/IA externe dirigées vers une boucle locale inactive. Aucun SMS/email/WhatsApp, paiement, caméra, portillon ou action réelle.

## Ce qui reste
La matrice n’est pas un certificat de finition. Campagnes, modèles à 12 blocs, tous les écrans RH avancés (paie, acquisition/report, règles d’organisation, terminaux), modales, états d’erreur et tous les profils doivent encore être contrôlés visuellement dans ce chantier. Leurs titres/enveloppes partagés sont harmonisés, leur détail n’est pas déclaré terminé. Les contrôles matériels et Safari/iOS réel ne sont pas exécutés.

La page de connexion conserve des raccourcis et codes de démonstration existants. Ce lot n’est pas une homologation de l’authentification de production. La sélection d’un scénario individuel n’est pas conservée au rechargement ; sa rubrique et ses données enregistrées le sont. Les usages Heitz hors API disponible restent dans son interface, avec accès à configurer, aucun écran fonctionnel fictivement promis.

Base PR #115 : intégrer et relire cette base avant ce complément. Le lot RH justificatifs privé non validé reste isolé dans sa branche précédente. Aucun déploiement ni fusion réalisé par Codex.
