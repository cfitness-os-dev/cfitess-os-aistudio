# Recette ciblée Brevo / scénarios — 23 novembre 2026

Branche `feat/lead-scenarios-contract`, copie locale jetable, données fictives. Aucun compte fournisseur utilisé, aucun envoi externe, aucune modification de la démo.

| Contrôle | Résultat |
|---|---|
| `npm run lint` — TypeScript | Réussi |
| `npm test` | 95 tests réussis |
| `npm run build` | Réussi — `index-C2WSKMpS.js` |
| `cargo test --locked --manifest-path Cargo.toml` | 114 tests réussis |
| `cargo build --locked` | Réussi |
| `scripts/test_lead_scenarios.py` sur le vrai serveur Rust | 14 groupes réussis, zéro envoi externe |
| Compte Brevo / sandbox officielle / livraison réelle | Non exécuté |
| Nouvelle interface ordinateur, mobile et tablette | Non exécuté ; contrôle visuel restant |
| Docker Linux / compilation avec Rust 1.85 lui-même | Non exécuté |

Les commandes utilisent les outils locaux du dépôt, un TMPDIR autorisé et un stockage jetable. L’avertissement de création du cache xcrun n’empêche pas les compilations et tests de sortir avec le code 0.

Les nouveaux tests couvrent : format de préparation avec `headers.X-Sib-Sandbox=drop`, un seul destinataire, objet et adresse invalides refusés, clé stable par exécution, redémarrage réel sans seconde préparation, isolation des deux clubs, exclusion d’une adresse dupliquée, refus commercial, refus club étranger, échec disque sans exclusion visible en mémoire, rejeu de commande et exclusion appliquée après redémarrage avant la prochaine étape. Les anciens tests de branches, images et modèles continuent de passer.

**Validation partielle** : préparation locale et exclusions validées sur le périmètre exécuté. Aucun transport Brevo réel n’est livré. La prévention des doubles déclenchements avec Heitz dépend encore du relevé des automatismes et reste un préalable à l’activation. Le code refuse toute exécution simulée hors démonstration ; l’adaptateur ne possède aucun chemin d’envoi réseau.
