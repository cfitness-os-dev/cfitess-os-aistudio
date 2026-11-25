# Recette ciblée de la collecte financière Heitz

Base main ec0a7ca, incluant les PR #74, #75 et #77. Branche fix/heitz-collection-integrity. Essais sur données fictives et serveurs de boucle locale uniquement ; aucune clé réelle, écriture Heitz ou modification de la version en ligne.

## Corrections

- Un solde ou un montant de ticket absent, non numérique, nul au sens JSON ou contradictoire entre les champs reconnus est refusé ; il ne devient pas un zéro. Un zéro numérique connu reste valide.
- Un ticket négatif garde son signe. Un centre inconnu n’est plus attribué à un club par son SIRET. Un ticket ne reçoit plus par défaut le statut NORMAL ou l’opération Vente.
- La somme de tickets sans période comptable qualifiée n’écrit plus le chiffre d’affaires. Les anciennes valeurs identifiées par le libellé exact du lecteur `Sync Heitz Cloud (` sont rendues inconnues pour les seuls clubs autorisés ; les autres KPI sont préservés. Cela ne reconstitue pas le CA réel.
- Après un solde réellement observé non débiteur, le retour d’un solde débiteur rouvre le dossier existant, sans supprimer notes et relances. Un marquage manuel « régularisé » sans passage observé à un solde non débiteur n’est pas arbitrairement annulé par cette règle.
- Une révision de solde change à chaque transition observée. Les anciennes références de détail financier/règlements restent dans l’historique mais ne redeviennent pas courantes si le même ancien montant réapparaît. Les références de contrat/CGV ne sont pas invalidées par ce seul changement financier. Les dossiers manuels sans révision conservent leur compatibilité.
- L’horodatage de collecte est pris après les réponses HTTP ; il n’est pas présenté comme date de valeur d’un règlement.
- Le compte rendu serveur distingue les soldes/tickets lus des paiements détaillés, contrats et CGV **non collectés**. Les deux interfaces de synchronisation signalent les résultats partiels et les inconnus.
- La conversion frontend des tickets récents en encaissements CB, abonnement, date du jour ou vendeur emp-mario est supprimée. L’ancien panneau de CA/commissions non rapprochés devient un état explicite à connecter avec un accès aux dossiers Heitz. Les tickets récents restent consultables dans HeitzMembersPanel, filtrés sur le club affiché. Les retours de l’aperçu d’un ancien compte/club sont ignorés.

## Vérifications exécutées

- **167 tests Rust réussis**, dont quatre nouveaux tests de validation monétaire/tickets/KPI et des extensions des parcours de synchronisation et des preuves. Un ancien test attendait l’écrasement du CA par une somme de tickets ; son attendu est remplacé par la préservation du KPI et l’absence de preuve d’encaissement.
- **157 tests TypeScript réussis**, dont deux contrôles du compte rendu de collecte. `npm run lint` et `npm run build` réussis.
- `scripts/test_heitz_collection.py` réussi : vrai serveur Rust + faux Heitz local, refus d’authentification/droits avant appel fournisseur, réponse de couverture explicite, refus atomique des soldes absents/contradictoires, solde nul puis réapparition du même montant, invalidation des preuves financières, ticket malformé signalé partiel, montant négatif conservé, KPI préservés et redémarrage. Les appels du connecteur observés sont uniquement GET et POST d’obtention du jeton fictif.
- `scripts/test_recovery_evidence.py` réussi : non-régression des preuves, suspensions, autorisations, contexte IA et persistance, avec double IA local.
- `scripts/test_heitz_crm.py` : **12 groupes de contrôles réussis**, import de copies fictives, clubs/droits, refus d’écritures fournisseur simulées, échec de persistance et redémarrage. Aucun envoi externe.
- Navigateur local : panneau « Suivi des encaissements » correctement présenté comme non connecté ; son bouton ouvre la consultation des dossiers Heitz. Après une reconstruction locale, l’ancienne page avait conservé un nom de fichier JavaScript supprimé ; rechargement sur la construction courante puis arrivée sur le dossier confirmée. Le changement de version à chaud, les réponses retardées et les formats mobile/tablette ne sont pas certifiés par ce contrôle ciblé.

## Heitz web observé en lecture seule

Même session autorisée, un centre et un dossier existant consultés. Aucun nom, identifiant de client, montant personnel ou fichier réel n’est publié.

- Documents : colonnes de date, titre, fichier, lien avec l’accès et accessibilité web. Présence de PDF constatée ; ni ouverture du PDF ni vérification de signature.
- Financier : lignes datées, référence de ticket, libellé, crédit/débit ; possibilité de filtrer les annulations ; totaux de page distincts du solde à ce jour, du solde d’échéancier et du solde final. Rejets et frais apparaissent comme des lignes distinctes. Aucun montant n’est extrapolé à l’ensemble des clubs.
- Facture : références de tickets et dates ; aucune facture créée, envoyée ou téléchargée.
- Échéancier : synthèse payé/non payé et débits/crédits ; l’exemple observé ne contenait pas d’échéance exploitable.
- Abonnement/Accès : présence d’une action « Signer le contrat », non activée. La présence de ce bouton ne prouve pas qu’un contrat est signé ou non signé.

## Documentation existante reprise

La documentation publique HZ.WS est accessible. Les rubriques documents, abonnements et échéanciers ont été dépliées et relues ; les six lectures confirmées et leurs paramètres figurent dans [le complément documentaire](heitz-lectures-documentees-2026-11-25.json). La déclaration précédente « il manque la documentation complète » était trop large : l’ancienne extraction ne couvrait pas toutes les rubriques disponibles.

Le [registre partagé](HEITZ_REPRISE.md) indique désormais les sources à reprendre avant toute nouvelle demande. Les lecteurs d’échéanciers/abonnements/documents restent **à développer** : leur présence dans la documentation n’est pas une intégration livrée. Les schémas absents, droits réels par centre et accès aux originaux/signatures restent à qualifier après reprise des sources existantes.

## Limites

Pas de collecte automatique des règlements détaillés, rejets, factures/avoirs, originaux ou signatures dans ce lot. Les tickets et soldes ne remplacent pas ces données. Le mécanisme de révision suit les transitions de solde observées, pas tous les changements d’un grand livre que le connecteur ne lit pas encore. Le moteur quotidien, les notifications et les transmissions contentieuses ne sont pas activés. La fraîcheur/forme des réponses FMI et autres données auxiliaires reste un contrôle distinct à terminer.

**Validation partielle sur le périmètre testé.** Aucun taux de couverture global ni conformité juridique/comptable affirmés.
