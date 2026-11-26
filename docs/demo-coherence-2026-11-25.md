# Démonstration de cohérence — 25 novembre 2026

## Décision de Daniel

Publication des avancées autorisée uniquement pour une démonstration isolée, avec données fictives, sans accès à Heitz réel. L’objectif immédiat est de voir l’arborescence, les parcours et l’ergonomie, avant une connexion métier. Les autorisations précédentes de consultation Heitz ne sont pas utilisées pendant cette livraison.

## Lot proposé

Cette branche comprend la PR #82 et son transport fiabilisé, puis le blocage serveur Heitz, des exemples fictifs de consultation et des corrections de présentation. La PR #82 ne doit pas être déployée seule pour cette démonstration.

- Démo : aucun serveur Heitz distant autorisé, même si des clés et le commutateur live ont été laissés dans la configuration. Les liens web Heitz ne sont pas renvoyés. Les données d’exemple du lecteur sont marquées simulated=true et ne valident aucune preuve. Une exception de recette nommée autorise seulement une IP HTTP de boucle locale ; elle est forcée à 0 dans Docker.
- Hors démo : les lectures réelles restent désactivées par défaut, et demandent CFITNESS_HEITZ_LIVE_READS_ENABLED=1. Ce n’est pas une autorisation de les activer actuellement.
- La copie locale démarre avec un environnement reconstruit : aucun secret fournisseur hérité, nouveau stockage fictif, workers désactivés, accès modèle désactivé. Elle ne réutilise ni ne supprime le stockage d’un club.
- Recouvrement : coordonnées disponibles distinctes d’un envoi prêt ; messages de connexion compréhensibles ; libellé générique Adhérent Heitz exclu du nom de contrat importé ; exemples fictifs sans prétendre récupérer des contrats ou CGV.
- Accueil : mur de caméras retiré de la vue générale, conservé dans son onglet, avec mention d’aperçu fictif ; couleurs et pictogrammes conservés. Écran de connexion simplifié sans promesses PostgreSQL/VPN/Argon2id.
- Planning : retrait des promesses de synchronisation bidirectionnelle non qualifiée et de conformité globale ; affichage des alertes réellement calculées, libellés usuels de poste et d’ajout au planning. Aucun changement du moteur de planning.
- Lead : titre Ventes sans nom de route technique. Pas de changement des scénarios, campagnes ou moteurs d’envoi dans ce complément.

Ce nettoyage est ciblé : des libellés et parcours doivent encore être revus dans les autres rubriques. Aucune parité exhaustive ou validation globale de Lead/Skello n’est annoncée.

## Vérification exécutée

175 tests Rust et 160 tests TypeScript passants ; typage/build frontend et build Rust. Recettes HTTP collecte, lecteurs, preuves passantes. La recette lecteurs redémarre en démo avec clés fictives présentes, flags live/worker forcés, puis vérifie refus de synchronisation, aperçu non connecté, liens supprimés, exemples simulés et zéro appel au faux fournisseur. Aucun appel à Heitz réel utilisé pour la preuve.

Reprise visuelle de #82 effectuée avant ce complément sur ordinateur 1440×1000, mobile 390×844 et tablette 768×1024 : lecture, liens, brouillon/abandon et changement de dossier. Nouveau complément : recouvrement vérifié dans la copie locale, bannière fictive, message d’assistant simplifié, liens Heitz supprimés et exemples fictifs affichés. Les copies de référence ne sont pas modifiées.

Docker indisponible sur le poste : le compose autonome est fourni mais n’a pas été lancé ici. Son déploiement et son URL publique restent à vérifier ; une publication GitHub n’est pas un déploiement.

## Mise à disposition

Copie locale : scripts/run_demo_preview.py avec CFITNESS_TEST_BINARY et CFITNESS_FRONTEND_DIR pointant sur les sorties de build, TMPDIR autorisé. Adresse imprimée au démarrage ; la copie reste disponible tant que son processus fonctionne. L’adresse locale n’est accessible que sur le Mac.

Serveur du développeur : utiliser exclusivement docker-compose.demo.yml, jamais une superposition sur le compose de production. Commande à exécuter après revue du lot sur un dossier de sources distinct et sans données de clubs :

    docker compose -p cfitness-demo-review -f docker-compose.demo.yml up -d --build

Le service écoute seulement sur 127.0.0.1:18888 et possède son volume fictif distinct. Ne pas restaurer une sauvegarde de club dans ce volume. Le développeur doit fournir un lien stable/tunnel vers ce service, le commit déployé et le résultat des contrôles d’absence d’appels externes. Les clés Heitz sont vides et le fournisseur pointe vers un port local fermé.

L’accès cfitness-audit annoncé auparavant est en lecture seule ; Codex n’a pas confirmé d’accès permettant ce déploiement. Pas de contournement des protections de main ou d’élévation de privilèges.

## Parcours à examiner avec Daniel

1. Accueil → choix du club → Prospection–Vente → fiche prospect → activités → modèles/scénarios.
2. Prospection → dossier adhérent CRM : vérifier le contexte et les informations conservées, sans conversion réelle dans Heitz.
3. Mon compte → dossier personnel → absence → relecture depuis les écrans responsables → retour collaborateur.
4. Mon planning → horaires → pointages personnels/borne selon droits ; les tablettes et photos restent des recettes distinctes.
5. Collaborateurs et RH → clubs → équipes → profils et droits ; comparer responsable mono-club et responsable des deux clubs.
6. Recouvrement → dossier fictif → exemples d’échéancier → références de pièces → paiement signalé/contestation et suspension du suivi. Aucun envoi ou transfert contentieux réel.

Ces parcours sont la grille de revue de cohérence, pas l’affirmation qu’ils ont tous été reçus dans ce lot. Daniel peut les parcourir maintenant dans la démonstration.

Dernier contrôle : la page restait sur le bundle index-Deu2VleG.js alors que le serveur servait index-CV19de16.js. Rechargement effectué sur l’accueil sans saisie en cours : nouveau bundle confirmé, bannière fictive visible et mur de caméras absent de la vue générale. L’onglet Caméras est conservé. Ce décalage explique une partie de l’impression de version inchangée ; il ne certifie pas la cohérence complète du produit.
