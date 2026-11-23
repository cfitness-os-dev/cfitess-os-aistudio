# Brevo et Heitz — préparation séparée, sans envoi

23 novembre 2026. Suite PR #44, branche `feat/lead-scenarios-contract`. Le client indique utiliser déjà Brevo pour les emails Heitz, moins de 10 000 emails mensuels au total. Cette décision remplace la préférence SES du premier comparatif : conserver Brevo évite un second prestataire à ce stade.

## Responsabilités proposées, à confronter aux réglages réels

| Famille | Système qui déclenche | Transport |
|---|---|---|
| Emails actuellement automatisés par Heitz | Heitz, sans modification par ce lot | Circuit Brevo existant |
| Relances et parcours Lead propres à l’OS | C.Fitness OS | Brevo API directe, future activation |
| Campagne ou relance déjà présente des deux côtés | Un seul propriétaire désigné avant activation | Aucun second déclenchement |

Le partage du compte Brevo dépend de sa propriété et de l’accord/configuration Heitz. Séparer les déclenchements n’impose pas deux abonnements. Prévoir une clé dédiée à l’OS, des tags distincts et des expéditeurs validés. Si Heitz utilise un compte géré par son prestataire, ne pas réutiliser son secret : demander un accès autorisé ou ouvrir un compte propre après décision client.

**L’absence de doublons entre deux applications indépendantes ne se déduit pas des tags.** L’OS n’envoie rien tant que la matrice réelle n’est pas validée. Pour chaque événement, relever propriétaire, club, public, délai, répétition, canal et modèle ; ne désactiver aucun automatisme Heitz sans validation. Les synchronisations de ventes/venues ne doivent pas créer indirectement une seconde relance identique.

## Implémentation de ce lot

- `src-rust/src/lead_brevo.rs` prépare le corps d’une demande compatible avec le format Brevo : un destinataire, objet, texte, tags `cfitness-os` / `lead-scenario` / club, identifiant de corrélation et en-tête de simulation `X-Sib-Sandbox: drop` **dans la propriété JSON `headers`**.
- Il n’existe ni client HTTP, ni lecture de clé, ni méthode d’envoi dans cet adaptateur. Même un paramétrage serveur accidentel ne peut pas activer l’envoi via ce module. Le mode sandbox Brevo lui-même n’a pas été appelé : il s’agit d’une simulation entièrement locale, pas d’une validation de Brevo.
- Chaque étape email valide alimente `leadScenarios.emailOutbox`. La clé stable inclut club, inscription, version publiée et étape. Progression/historique et préparation sont enregistrés atomiquement dans le même état ; un rejeu/redémarrage ne crée pas un second message de la même exécution. Ce mécanisme ne fusionne pas tous les doublons de fiches ni deux scénarios distincts légitimement ciblés ; ce sont des règles de pression à compléter.
- Adresses invalides, objet absent/invalide ou texte vide ne produisent pas de demande Brevo. Pour les anciens scénarios sans objet, la simulation historique peut continuer mais mentionne explicitement que la préparation est bloquée.
- Les documents à blocs conservent leur aperçu HTML isolé dans l’historique ; la préparation Brevo actuelle utilise le texte, sans exporter l’iframe de prévisualisation comme email. La conversion HTML/images CID/HTTPS reste à réaliser.
- La commande `suppress_email` vérifie session, rôle et club comme les autres commandes. Réservée à la démonstration, elle ajoute une exclusion persistante par adresse normalisée et club, motif, acteur et date. Les prochaines étapes email sont exclues, y compris sur une seconde fiche utilisant la même adresse ; les appels/tâches et autres canaux ne sont pas assimilés à des emails. Les tâches manuelles d’email préexistantes ne constituent pas un envoi automatique et ne sont pas supprimées.
- L’interface Scénarios propose « Emails Brevo · Préparation et exclusions », le nombre de simulations, les dix dernières et un essai d’exclusion. Les données exposées restent filtrées par club. Il ne s’agit pas d’un journal de livraisons réelles.

Le module existant Heitz et `lead_automations.rs` ne sont pas modifiés. `main` et l’environnement en ligne ne sont pas modifiés.

## Accès et informations à obtenir

1. Confirmer qui possède le compte Brevo utilisé par Heitz et qui peut administrer ses intégrations ; accès nominatif autorisé au compte ou écran partagé. Aucun accès requis pour poursuivre les simulations locales.
2. Fournir le relevé des scénarios/campagnes Heitz et Brevo actuellement actifs pour les deux clubs. Des captures/export de configuration sans secrets suffisent pour la matrice de responsabilités.
3. Confirmer les adresses expéditrices et de réponse de chaque club, le domaine d’envoi, le statut de validation des expéditeurs, le forfait et les quotas disponibles.
4. Pour le raccordement ultérieur : clé API dédiée à l’OS, enregistrée par le responsable **dans le gestionnaire de secrets serveur**, jamais dans le chat, Git ou le frontend. Confirmer les restrictions de clé disponibles ; ne pas présumer qu’elle est limitée à un seul club.
5. Accès DNS du domaine via son administrateur pour vérifier SPF/DKIM/DMARC, sans écraser les enregistrements existants. Vérifier qui gère les domaines de suivi et de désabonnement.
6. Origine des consentements, listes d’exclusion et désabonnements existants. Définir la portée interclubs du retrait et les flux promotionnels/de service ; ne pas réabonner un contact en recopiant un consentement global depuis Heitz.
7. Avant l’essai fournisseur : URL HTTPS stable de recette, destinataires internes autorisés, méthode de sécurisation des webhooks et budget d’essai. L’envoi réel fera l’objet d’une autorisation distincte.

## Étapes restant avant activation réelle

Compte et expéditeurs vérifiés → matrice Heitz validée → rapprochement des exclusions → transport et suivi fournisseur → webhooks authentifiés/rejeux → contrôle des quotas et des doubles soumissions incertaines → génération HTML/images et essais clients mail → recette sandbox officielle → essai réel autorisé limité → activation progressive. L’API d’email ne transforme pas une relance promotionnelle en message de service ; vérifier la politique et les règles adaptées au contenu.

Les accusés de réception, livraisons, rebonds, plaintes et désabonnements entrants ne sont pas raccordés dans ce lot. Une préparation locale n’est ni un email envoyé, ni une preuve de délivrabilité. La nouvelle interface reste à contrôler visuellement sur les trois formats ; la connexion navigateur locale était bloquée lors du lot précédent.

Sources officielles consultées : [API email Brevo](https://developers.brevo.com/reference/send-transac-email), [mode sandbox Brevo](https://developers.brevo.com/docs/using-sandbox-mode). Elles décrivent le contrat préparé, sans constituer un résultat d’essai sur notre compte.
