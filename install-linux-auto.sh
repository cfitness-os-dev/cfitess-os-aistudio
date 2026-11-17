#!/usr/bin/env bash
set -euo pipefail
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"

# ==============================================================================
# C.FITNESS OS — Script d'installation automatique Linux (Debian 12 / Ubuntu)
# À lancer après installation de Linux, depuis une clé USB contenant le projet
# ou directement en standalone (clone automatique depuis GitHub).
#
# Usage sur le PC / serveur Linux :
#   sudo bash install-linux-auto.sh
# ==============================================================================

REPO_URL="${CFITNESS_REPO_URL:-https://github.com/pinto1230766/cfitess-os-aistudio.git}"
TARGET_DIR="${CFITNESS_INSTALL_DIR:-/opt/cfitness-os}"
APP_PORT="${PORT:-8080}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "Erreur : veuillez exécuter ce script avec sudo : sudo bash $0" >&2
  exit 1
fi

REAL_USER="${SUDO_USER:-$USER}"

echo "============================================================"
echo "  C.FITNESS OS — Installation automatique serveur Linux"
echo "============================================================"
echo "Source détectée : ${SCRIPT_DIR}"
echo "Dossier cible   : ${TARGET_DIR}"
echo "Utilisateur     : ${REAL_USER}"
echo ""

# 1. Prérequis système
echo "[1/5] Installation des paquets de base (curl, git, ca-certificates, rsync)..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends ca-certificates curl git gnupg lsb-release rsync

# 2. Installation officielle de Docker Engine + Docker Compose v2 si absents
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "[2/5] Installation de Docker Engine et Docker Compose v2..."
  install -m 0755 -d /etc/apt/keyrings
  . /etc/os-release
  DISTRO_ID="${ID:-debian}"
  CODENAME="${VERSION_CODENAME:-bookworm}"

  curl -fsSL "https://download.docker.com/linux/${DISTRO_ID}/gpg" | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${DISTRO_ID} ${CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  echo "[2/5] Docker et Docker Compose v2 sont déjà installés."
fi

systemctl enable --now docker
if id -u "${REAL_USER}" >/dev/null 2>&1; then
  usermod -aG docker "${REAL_USER}" || true
fi

# 3. Réglages serveur (anti-veille sur PC portable de test + pare-feu UFW)
echo "[3/5] Configuration système (démarrage auto Docker, réseau, anti-veille)..."
if ls /sys/class/power_supply/BAT* >/dev/null 2>&1; then
  mkdir -p /etc/systemd/logind.conf.d
  cat > /etc/systemd/logind.conf.d/99-cfitness-server.conf <<'EOF'
[Login]
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
EOF
  systemctl restart systemd-logind || true
  echo "  -> PC portable détecté : mise en veille capot fermé désactivée."
fi

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow "${APP_PORT}/tcp" >/dev/null || true
  echo "  -> Port ${APP_PORT}/tcp autorisé dans UFW."
fi

# 4. Copie depuis la clé USB ou clonage depuis GitHub vers /opt/cfitness-os
echo "[4/5] Mise en place des fichiers dans ${TARGET_DIR}..."
mkdir -p "${TARGET_DIR}"

if [ -f "${SCRIPT_DIR}/Dockerfile" ] && [ -f "${SCRIPT_DIR}/docker-compose.yml" ]; then
  if [ "${SCRIPT_DIR}" != "${TARGET_DIR}" ]; then
    rsync -a --delete \
      --exclude node_modules \
      --exclude dist \
      --exclude target \
      --exclude src-rust/target \
      --exclude .env \
      "${SCRIPT_DIR}/" "${TARGET_DIR}/"
    echo "  -> Projet copié depuis la clé USB / dossier local vers ${TARGET_DIR}."
  fi
else
  if [ -d "${TARGET_DIR}/.git" ]; then
    git -C "${TARGET_DIR}" pull --ff-only
    echo "  -> Dépôt mis à jour dans ${TARGET_DIR}."
  else
    git clone "${REPO_URL}" "${TARGET_DIR}"
    echo "  -> Dépôt cloné depuis GitHub vers ${TARGET_DIR}."
  fi
fi

if id -u "${REAL_USER}" >/dev/null 2>&1; then
  chown -R "${REAL_USER}:${REAL_USER}" "${TARGET_DIR}"
fi

# 5. Déploiement Docker Compose via deploy-linux.sh
echo "[5/5] Build & démarrage du conteneur CFitness OS..."
cd "${TARGET_DIR}"
chmod +x deploy-linux.sh install-linux-auto.sh 2>/dev/null || true
./deploy-linux.sh

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo ""
echo "============================================================"
echo "  INSTALLATION TERMINÉE !"
echo "  Accès local  : http://127.0.0.1:${APP_PORT}/"
if [ -n "${LAN_IP}" ]; then
  echo "  Accès réseau : http://${LAN_IP}:${APP_PORT}/"
fi
echo "  Santé API    : http://127.0.0.1:${APP_PORT}/api/health"
echo "  Commandes    : cd ${TARGET_DIR} && docker compose logs -f"
echo "============================================================"
