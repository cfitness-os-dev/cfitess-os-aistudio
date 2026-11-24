#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# C.FITNESS OS — Script automatisé de bascule Démo -> Production réelle
# Usage :
#   ./scripts/switch-to-production.sh \
#     --origins "http://192.168.1.120:8080,http://100.87.239.70:8080" \
#     --admin-password "<MOT_DE_PASSE_ADMIN_MIN_12_CAR>" \
#     [--reset-demo-db]
# ==============================================================================

ALLOWED_ORIGINS=""
ADMIN_PASSWORD=""
RESET_DEMO_DB=0
TRUST_PROXY=0
COOKIE_SECURE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --origins)
      ALLOWED_ORIGINS="${2:-}"
      shift 2
      ;;
    --admin-password)
      ADMIN_PASSWORD="${2:-}"
      shift 2
      ;;
    --reset-demo-db)
      RESET_DEMO_DB=1
      shift
      ;;
    --trust-proxy)
      TRUST_PROXY=1
      shift
      ;;
    --cookie-secure)
      COOKIE_SECURE=1
      shift
      ;;
    *)
      echo "Option inconnue : $1" >&2
      echo "Usage : $0 --origins <URL1,URL2> --admin-password <MIN_12_CAR> [--reset-demo-db] [--trust-proxy] [--cookie-secure]" >&2
      exit 1
      ;;
  esac
done

echo "============================================================"
echo "  BASCULE C.FITNESS OS : MODE DÉMO -> PRODUCTION RÉELLE"
echo "============================================================"

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Erreur : Docker et Docker Compose v2 sont requis." >&2
  exit 1
fi

if [ -z "$ALLOWED_ORIGINS" ]; then
  SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  if [ -n "$SERVER_IP" ]; then
    ALLOWED_ORIGINS="http://localhost:8080,http://127.0.0.1:8080,http://${SERVER_IP}:8080"
  else
    ALLOWED_ORIGINS="http://localhost:8080,http://127.0.0.1:8080"
  fi
  echo "[1/6] CFITNESS_ALLOWED_ORIGINS auto-détecté : $ALLOWED_ORIGINS"
else
  echo "[1/6] CFITNESS_ALLOWED_ORIGINS configuré : $ALLOWED_ORIGINS"
fi

if [ -n "$ADMIN_PASSWORD" ] && [ "${#ADMIN_PASSWORD}" -lt 12 ]; then
  echo "Erreur : --admin-password doit comporter au moins 12 caractères." >&2
  exit 1
fi

if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
  else
    touch .env
  fi
else
  cp .env ".env.bak.$(date +%Y%m%d-%H%M%S)"
fi

gen_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
  else
    head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

set_kv() {
  local k="$1"
  local v="$2"
  if grep -qE "^${k}=" .env; then
    sed -i "s|^${k}=.*|${k}=${v}|" .env
  else
    echo "${k}=${v}" >> .env
  fi
}

ensure_secret_kv() {
  local k="$1"
  local prefix="$2"
  local current
  current="$(grep -E "^${k}=" .env | head -n1 | cut -d'=' -f2- || true)"
  if [ "${#current}" -lt 16 ]; then
    set_kv "$k" "${prefix}$(gen_secret)"
  fi
}

echo "[2/6] Durcissement du fichier .env (CFITNESS_DEMO_MODE=0, CFITNESS_STRICT_SESSION=1, secrets CSPRNG)..."
set_kv "CFITNESS_DEMO_MODE" "0"
set_kv "VITE_DEMO_MODE" "false"
set_kv "CFITNESS_STRICT_SESSION" "1"
set_kv "CFITNESS_ALLOWED_ORIGINS" "$ALLOWED_ORIGINS"
set_kv "CFITNESS_TRUST_PROXY" "$TRUST_PROXY"
set_kv "CFITNESS_COOKIE_SECURE" "$COOKIE_SECURE"
set_kv "RUST_LOG" "info,cfitness_os=info"

if [ -n "$ADMIN_PASSWORD" ]; then
  set_kv "CFITNESS_INITIAL_ADMIN_PASSWORD" "$ADMIN_PASSWORD"
fi

ensure_secret_kv "CFITNESS_LEAD_API_KEY" "cf_lead_"
ensure_secret_kv "CFITNESS_INBOUND_WEBHOOK_SECRET" "cf_inb_"
ensure_secret_kv "CFITNESS_HEITZ_WEBHOOK_SECRET" "cf_hz_"
ensure_secret_kv "HEITZ_WS_TOKEN" "CFOS-HZ-"
ensure_secret_kv "CFITNESS_BACKUP_SIGNING_KEY" "cf_bkp_"
chmod 600 .env

if [ "$RESET_DEMO_DB" -eq 1 ]; then
  echo "[3/6] Archivage de l'état démo et réinitialisation sur base vierge de production..."
  docker compose stop cfitness-os >/dev/null 2>&1 || true
  TS="$(date +%Y%m%d-%H%M%S)"
  docker run --rm -v cfitness-os_cfitness_data:/data -v "$(pwd):/backup" alpine:3.21 \
    sh -c "if [ -f /data/cfitness_state.json ]; then cp /data/cfitness_state.json /backup/cfitness_state.demo-backup-${TS}.json && rm -f /data/cfitness_state.json; fi" || true
else
  echo "[3/6] Conservation du volume de données existant (ajoutez --reset-demo-db pour repartir d'une base vierge)."
fi

echo "[4/6] Compilation de l'image de production (VITE_DEMO_MODE=false) et redémarrage..."
docker compose build --build-arg VITE_DEMO_MODE=false
docker compose up -d

# Nettoyage du mot de passe initial en clair dans .env une fois le bootstrap effectué
if [ -n "$ADMIN_PASSWORD" ]; then
  sleep 3
  set_kv "CFITNESS_INITIAL_ADMIN_PASSWORD" ""
fi

echo "[5/6] Vérification de disponibilité et des en-têtes de sécurité..."
PORT_VAL="$(grep -E '^PORT=' .env | head -n1 | cut -d'=' -f2- || echo 8080)"
PORT_VAL="${PORT_VAL:-8080}"

for _ in $(seq 1 25); do
  if curl -fsS "http://127.0.0.1:${PORT_VAL}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

curl -fsSI "http://127.0.0.1:${PORT_VAL}/api/health" | grep -iE "content-security-policy|cache-control|strict-transport-security|x-content-type-options" || true
echo ""
curl -fsS "http://127.0.0.1:${PORT_VAL}/api/health"
echo ""

echo "[6/6] Vérification de l'agent IA local Ollama..."
if docker ps --format '{{.Names}}' | grep -qx ollama; then
  echo "  -> Conteneur Ollama actif :"
  docker exec ollama ollama list || true
else
  echo "  -> Avertissement : conteneur 'ollama' non détecté. Lancez : docker run -d --name ollama --restart unless-stopped -p 11434:11434 -v ollama_data:/root/.ollama ollama/ollama:latest && docker exec ollama ollama pull qwen2.5:3b"
fi

echo "============================================================"
echo "  BASCULE EN PRODUCTION TERMINÉE AVEC SUCCÈS"
echo "============================================================"
