====================================================================
C.FITNESS OS — GUIDE RAPIDE CLÉ USB (INSTALLATION EN 1 COMMANDE)
====================================================================

1. COMMENT PRÉPARER LA CLÉ USB (À LA MAISON)
------------------------------------------
Copiez sur votre clé USB (dans un dossier `cfitness-os/`) tout le contenu
du projet (sans node_modules / dist / target), ET placez ce fichier +
`install-from-usb.sh` directement à la racine du dossier `cfitness-os/`.

Option hors-ligne (si le serveur du club n'a pas encore Internet) :
Sur un PC Linux ayant déjà compilé l'image Docker en mode production :
  docker compose build --build-arg VITE_DEMO_MODE=false
  docker save -o cfitness-os-image.tar cfitness-os-cfitness-os:latest
Copiez aussi `cfitness-os-image.tar` à côté de `install-from-usb.sh` :
le script installera tout sans télécharger une seule dépendance.


2. COMMENT INSTALLER SUR LE SERVEUR LINUX DU CLUB (OU À LA MAISON)
------------------------------------------------------------------
Branchez la clé USB sur le serveur Debian / Ubuntu, ouvrez un terminal
dans le dossier de la clé USB et lancez UNE SEULE commande :

  sudo bash install-from-usb.sh

Ce script s'occupe automatiquement de tout :
  1. Vérifie / installe Docker si besoin.
  2. Copie le projet dans /opt/cfitness-os (sans écraser un .env existant).
  3. Crée un .env de production (CFITNESS_DEMO_MODE=0, STRICT_SESSION=1)
     avec génération automatique des clés secrètes aléatoires.
  4. Charge l'image hors-ligne (si cfitness-os-image.tar présent) ou compile.
  5. Ouvre le port 8080 dans UFW (si actif) et vérifie /api/health.
  6. Affiche l'adresse http://IP_DU_SERVEUR:8080 à ouvrir sur les PC d'accueil.


3. PASSER EN PRODUCTION RÉELLE (CHECKLIST)
------------------------------------------
Dans /opt/cfitness-os/.env :
  - Complétez HEITZ_WS_URL avec l'IP du PC Heitz du club.
  - Ajoutez CFITNESS_STRIPE_WEBHOOK_SECRET (si Stripe actif) et
    CFITNESS_ALLOWED_ORIGINS=http://IP_DU_SERVEUR:8080.
  - Ne copiez PAS l'ancienne base démo (/var/lib/cfitness/cfitness_state.json).
  - Créez les comptes réels et importez vos CSV Heitz / Stocks / Excel Lead.
====================================================================
