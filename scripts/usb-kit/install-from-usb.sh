#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# C.FITNESS OS — Kit clé USB auto-installable (Serveur Linux Debian / Ubuntu)
# Lancer en 1 commande depuis le dossier de la clé USB :
#   sudo bash install-from-usb.sh
# ==============================================================================

INSTALL_DIR="/opt/cfitness-os"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================================"
echo "  INSTALLATION AUTOMATIQUE C.FITNESS OS DEPUIS CLÉ USB"
echo "============================================================"

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "Erreur : lancez ce script avec sudo :" >&2
  echo "  sudo bash \"$0\"" >&2
  exit 1
fi

# Détection du dossier source (racine du projet sur la clé USB)
if [ -f "$SCRIPT_DIR/docker-compose.yml" ]; then
  SRC_DIR="$SCRIPT_DIR"
elif [ -f "$SCRIPT_DIR/../../docker-compose.yml" ]; then
  SRC_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
elif [ -d "$SCRIPT_DIR/cfitness-os" ] && [ -f "$SCRIPT_DIR/cfitness-os/docker-compose.yml" ]; then
  SRC_DIR="$SCRIPT_DIR/cfitness-os"
else
  echo "Erreur : impossible de trouver docker-compose.yml dans $SCRIPT_DIR" >&2
  exit 1
fi

echo "[1/6] Dossier source détecté : $SRC_DIR"

# 1. Vérifier / installer Docker + Docker Compose v2
if ! command -v docker >/dev/null 2>&1; then
  echo "[2/6] Docker absent : tentative d'installation automatique..."
  if curl -fsSL https://get.docker.com | sh; then
    systemctl enable --now docker || true
  else
    echo "Erreur : Docker introuvable et téléchargement impossible (pas d'Internet ?)." >&2
    echo "Installez Docker manuellement puis relancez ce script." >&2
    exit 1
  fi
else
  echo "[2/6] Docker déjà installé ($(docker --version))."
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Erreur : le plugin Docker Compose v2 ('docker compose') est requis." >&2
  exit 1
fi

# 2. Copie propre vers /opt/cfitness-os sans écraser un .env existant
echo "[3/6] Copie du projet vers $INSTALL_DIR ..."
mkdir -p "$INSTALL_DIR"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude 'target' \
    --exclude 'dist' \
    --exclude '.env' \
    --exclude 'cfitness-os-image.tar' \
    "$SRC_DIR/" "$INSTALL_DIR/"
else
  if [ -f "$INSTALL_DIR/.env" ]; then
    cp "$INSTALL_DIR/.env" /tmp/cfos_env_preserve.bak
  fi
  cp -a "$SRC_DIR/." "$INSTALL_DIR/"
  if [ -f /tmp/cfos_env_preserve.bak ]; then
    mv /tmp/cfos_env_preserve.bak "$INSTALL_DIR/.env"
  fi
  rm -rf "$INSTALL_DIR/.git" "$INSTALL_DIR/node_modules" "$INSTALL_DIR/target" "$INSTALL_DIR/dist" "$INSTALL_DIR/cfitness-os-image.tar" || true
fi

cd "$INSTALL_DIR"

# 3. Génération du .env de production si absent (mode démo coupé + secrets aléatoires)
if [ ! -f "$INSTALL_DIR/.env" ]; then
  echo "[4/6] Création d'un fichier .env de production sécurisé..."
  if [ -f "$INSTALL_DIR/.env.example" ]; then
    cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
  else
    touch "$INSTALL_DIR/.env"
  fi

  gen_secret() {
    if command -v openssl >/dev/null 2>&1; then
      openssl rand -hex 24
    else
      head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'
    fi
  }

  LEAD_KEY="cf_lead_$(gen_secret)"
  INBOUND_SEC="cf_inb_$(gen_secret)"
  HEITZ_SEC="cf_hz_$(gen_secret)"
  HZ_TOKEN="CFOS-HZ-$(gen_secret)"

  set_kv() {
    local k="$1"
    local v="$2"
    if grep -qE "^${k}=" "$INSTALL_DIR/.env"; then
      sed -i "s|^${k}=.*|${k}=${v}|" "$INSTALL_DIR/.env"
    else
      echo "${k}=${v}" >> "$INSTALL_DIR/.env"
    fi
  }

  set_kv "CFITNESS_DEMO_MODE" "0"
  set_kv "CFITNESS_STRICT_SESSION" "1"
  set_kv "RUST_LOG" "info,cfitness_os=info"
  set_kv "CFITNESS_LEAD_API_KEY" "$LEAD_KEY"
  set_kv "CFITNESS_INBOUND_WEBHOOK_SECRET" "$INBOUND_SEC"
  set_kv "CFITNESS_HEITZ_WEBHOOK_SECRET" "$HEITZ_SEC"
  set_kv "HEITZ_WS_TOKEN" "$HZ_TOKEN"
  chmod 600 "$INSTALL_DIR/.env"
  echo "  -> .env créé en mode PRODUCTION (CFITNESS_DEMO_MODE=0, secrets générés)."
else
  echo "[4/6] Fichier .env déjà présent : conservé tel quel."
fi

# 4. Pare-feu local (si ufw actif)
if command -v ufw >/dev/null 2>&1 && ufw status | grep -qi "Status: active"; then
  ufw allow 8080/tcp >/dev/null 2>&1 || true
fi

# 5. Chargement hors-ligne de l'image Docker si présente sur la clé USB, sinon build
TAR_PATH=""
if [ -f "$SRC_DIR/cfitness-os-image.tar" ]; then
  TAR_PATH="$SRC_DIR/cfitness-os-image.tar"
elif [ -f "$SCRIPT_DIR/cfitness-os-image.tar" ]; then
  TAR_PATH="$SCRIPT_DIR/cfitness-os-image.tar"
fi

if [ -n "$TAR_PATH" ]; then
  echo "[5/6] Image hors-ligne détectée ($TAR_PATH) : chargement Docker..."
  docker load -i "$TAR_PATH"
  docker compose up -d --no-build
else
  echo "[5/6] Compilation locale et démarrage avec build-arg VITE_DEMO_MODE=false..."
  docker compose build --build-arg VITE_DEMO_MODE=false
  docker compose up -d
fi

# 6. Vérification finale
echo "[6/6] Vérification de disponibilité sur http://127.0.0.1:8080/api/health ..."
for _ in $(seq 1 25); do
  if curl -fsS "http://127.0.0.1:8080/api/health" >/dev/null 2>&1; then
    echo ""
    echo "============================================================"
    echo "  C.FITNESS OS EST DÉMARRÉ ET OPÉRATIONNEL !"
    echo "============================================================"
    curl -fsS "http://127.0.0.1:8080/api/health"
    echo ""
    SERVER_IP="$(hostname -I | awk '{print $1}')"
    echo "Ouvrez depuis un PC du club : http://${SERVER_IP:-IP_DU_SERVEUR}:8080"
    echo "Configuration serveur       : $INSTALL_DIR/.env"
    exit 0
  fi
  sleep 2
done

echo "Avertissement : le service met plus de temps que prévu à répondre." >&2
echo "Consultez : docker compose -f $INSTALL_DIR/docker-compose.yml logs -f" >&2
exit 1
