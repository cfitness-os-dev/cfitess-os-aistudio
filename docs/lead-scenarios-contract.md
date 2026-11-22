# Contrat de définition des scénarios Lead — premier bloc

Ce bloc prépare l'éditeur et le dialogue avec le moteur serveur. Il ne sauvegarde rien et n'exécute aucun scénario. Aucun nouveau bouton n'est présenté comme fonctionnel par cette PR.

Référence métier : issue21 commentaire7085571773, inventaire Lead-0460..0487,1299..1345,1526..1543. Les états actif et inscriptions verrouillées sont indépendants. Une définition complète porte une version de schéma, un club, un nom, un mode, des conditions automatiques ou null en manuel, et des étapes ordonnées.

Le catalogue transmis au validateur doit provenir des référentiels du club sélectionné. Types : email, SMS, WhatsApp et tâches email/SMS/appel ; délai entier zéro immédiat, minutes/heures/jours ; au moins une étape activée avant publication. Une tâche crée une activité avec commentaire ; elle ne devient pas un envoi automatique.

Limites choisies de première version :100 étapes, nom120 caractères, commentaire2000, contenu20000,200 valeurs de conditions. Ces bornes sont des décisions CFitness proposées, pas des limites auditées de Lead. Le plafond numérique de délai525600 est provisoire et doit être discuté par unité avec le moteur serveur. Une liste de sources vide signifie aucune restriction de source ; un statut cible au moins est obligatoire en automatique.

La validation concerne une définition complète avant publication. Un brouillon incomplet nécessite son propre modèle de sauvegarde ; ne pas effacer les champs d'un salarié en lui présentant ce validateur comme sauvegarde automatique du brouillon.

Le serveur doit revalider ce contrat et les droits. Ce validateur ne prouve ni RBAC, ni appartenance réelle à un club, ni modèle approuvé par Meta, ni consentement du destinataire. La décision de canal sera recontrôlée à l'exécution. Le mode message direct/modèle et les replis WhatsApp détaillés sont à ajouter au contrat coordonné avant raccordement complet ; ce premier bloc n'en annonce pas la couverture.

À raccorder après accord avec l'autre IA : définitions/brouillons/versions persistants, inscriptions, étapes planifiées et worker, historique, idempotence, modèle WhatsApp complet, copie interclub, interface. Les versions publiées et résultats d'exécution doivent être immuables et distincts de la révision du brouillon. Pas d'API inventée dans le client avant accord du serveur.

Test ciblé : `npx tsx --test src/domain/leadScenarioDefinitions.test.ts`. Le fichier n'est pas ajouté au script npm test dans ce bloc pour éviter une modification partagée de package.json ; le raccordement au lanceur commun reste à faire avant livraison du module complet.
