# Éditeur email et branches — troisième lot de la PR #44

Branche `feat/lead-scenarios-contract`. Aucun déploiement ni action fournisseur. Ce lot remplace les limites correspondantes des rapports précédents ; il ne certifie pas une parité totale de Lead.

## Douze blocs réellement disponibles

| Bloc | Propriétés livrées |
|---|---|
| Texte | Texte, variables, 18 polices, taille, alignement, couleurs |
| Bouton | Libellé, lien HTTPS ou variable URL, couleurs, arrondi, alignement |
| En-tête | Logo par adresse HTTPS ou image PNG/JPEG intégrée, description, largeur, arrondi, quatre marges intérieures, lien |
| Réseaux sociaux | Liste ordonnée de liens nommés, ajout/retrait, style |
| Pied de page | Texte légal saisi par le responsable, variables et lien de désabonnement propre au destinataire |
| HTML | Code source conservé pour édition, rendu assaini sur serveur et aperçu isolé |
| Image | Source HTTPS ou image intégrée, description, largeur, arrondi et lien |
| Image et texte | Texte et image côte à côte, image gauche/droite, empilement sous 768 px |
| Fond image | Image de couverture, texte, hauteur et style |
| Barre de navigation | Jusqu’à dix liens nommés ordonnés |
| Séparateur | Épaisseur, couleur et marges |
| Espace | Hauteur et marges |

Chaque bloc est ajoutable, sélectionnable, duplicable, déplaçable et supprimable. Le document conserve ordre et propriétés lors de l’enregistrement/copie/version. Les quatre marges sont intérieures : aucune prétention d’avoir reproduit toutes les propriétés Lead non observées. Les six premiers blocs avaient des propriétés détaillées dans l’audit ; les propriétés des six autres sont une implémentation OS guidée par leur type et restent à comparer à un espace fournisseur fictif.

La conversion de l’ancien titre/corps/bouton/pied vers les blocs conserve les textes et la police ; l’ancien pied devient du texte, sans ajouter silencieusement une obligation de désabonnement absente du document d’origine. Le responsable peut ajouter le bloc Pied de page explicitement. Le nouveau document et l’ancienne présentation ne peuvent pas être enregistrés simultanément.

Bornes OS : 100 blocs, document JSON 4 Mo, images PNG/JPEG intégrées 2 Mo au total, texte alternatif rendu 20 000 caractères. Vérification MIME/base64 et signature PNG/JPEG côté serveur ; SVG et liens actifs non HTTPS refusés. Le chargement d’une image dans le formulaire bloque l’enregistrement jusqu’à sa fin ; une lecture tardive ne remplace pas un autre document.

## Rendu et sécurité

Route de prévisualisation : `POST /api/lead/scenarios/:club/email-preview`, Bearer et droits de gestion du club, sans mutation ni envoi. Exemple fictif annoncé explicitement. Les images HTTPS restent des emplacements dans l’aperçu ; aucune récupération distante par le serveur. Les images intégrées sont affichables dans l’iframe. Les liens sont inactifs dans l’aperçu : attributs href supprimés/remplacés, y compris pour empêcher leur activation au clavier. L’historique de simulation utilise aussi ce rendu sans liens actifs.

Le HTML libre est analysé et assaini avec Ammonia ; scripts, formulaires, styles et attributs non autorisés sont retirés du rendu. Les variables sont échappées avant insertion dans ce HTML. L’iframe n’accorde aucune permission sandbox et comporte une CSP : `default-src 'none'`, `img-src data:`, styles intégrés autorisés, formulaires/base interdits. La sécurité ne repose pas sur une expression régulière de nettoyage HTML. Le rendu exportable du modèle structuré comporte styles bornés et règle responsive Image et texte ; le rendu dans chaque client mail réel restera à tester avec le futur connecteur.

Versions résolues : Ammonia 4.2.5 et base64 0.22.1. La version minimale Ammonia 4.2.4 tient compte du correctif de filtrage CSS signalé par [RustSec](https://rustsec.org/advisories/RUSTSEC-2026-0373.html) ; les styles du HTML libre restent désactivés dans notre politique. Références d’API : [Ammonia Builder](https://docs.rs/ammonia/latest/ammonia/struct.Builder.html), [base64 Engine](https://docs.rs/base64/latest/base64/engine/trait.Engine.html). Cargo.lock ajoute les dépendances sans remplacer les versions existantes. Résolution avec cible Rust 1.85 pour éviter ICU 2.4 exigeant Rust 1.88 ; ce n’est pas une preuve de compilation Docker/Linux sur ce lot.

À la publication, document structuré, HTML source et texte sont figés dans la version de scénario. La simulation produit du texte résolu et du HTML assaini conservé dans l’historique. Le lien `%unsubscribe-url%` exige un contexte destinataire officiel : en son absence le moteur exclut le message avec motif, sans inventer une URL de désabonnement réelle. Aucun email n’est envoyé.

## Branches conditionnelles

Une étape Condition teste : nouvelle réponse depuis inscription, consentement, commercial actif habilité au club, statut, source ou segment. Les listes sont validées sur le club. Deux destinations explicites : Oui et Non. Chacune rejoint une étape activée plus loin ou termine le parcours. Les actions disposent aussi d’une suite explicite (étape suivante, étape choisie ou fin), afin que le chemin Oui ne tombe pas ensuite dans le chemin Non.

Le moteur lit les données canoniques à l’échéance de la condition, enregistre la décision et avance le curseur. Le délai de la destination commence alors. Un changement du contact après cette décision ne réécrit pas son chemin ; redémarrer le serveur ne relance pas la condition. Les arêtes arrière, boucles, références supprimées/étrangères ou destinations désactivées sont refusées à l’enregistrement/publication ; un état restauré incohérent arrête le parcours. Les conditions de sortie globales restent prioritaires. Une seule étape par passage moteur et aucune réentrée automatique.

L’audit Lead ne prouvait pas l’exécution d’un graphe arbitraire. Cette construction est une amélioration OS demandée par Daniel, pas une affirmation non vérifiée sur Lead. Elle n’infère ni ouverture d’email ni fenêtre WhatsApp sans événement officiel.

## Retour arrière et limites

Lecture des anciennes données par le nouveau code : champs optionnels/default et validation testés. **L’ancien binaire ne sait pas forcément lire un document ou une branche nouveaux**, notamment avec les structures strictes. Avant toute intégration, garder une copie de l’état antérieur ; un retour à l’ancien code exige cette copie ou une migration adaptée. Ne pas démarrer un vieux binaire sur le nouveau fichier d’état. Aucune migration destructive ni bascule automatique effectuée.

Restent : validation des propriétés Lead non observées, glisser-déposer (les boutons de déplacement existent), édition riche directement dans le texte (texte et HTML sont éditables), rendu des emails dans les clients mail réels, adaptateurs d’envoi et pièces jointes/CID, contexte officiel de désabonnement et autres variables, fenêtres horaires/réentrée/délégations détaillées. Le stockage JSON monoprocédé et la purge des historiques/reçus restent des chantiers de production.
