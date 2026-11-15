#!/usr/bin/env bash
set -euo pipefail

echo "=== Déploiement CFitness OS (Serveur Linux) ==="

if ! command -v docker >/dev/null 2>&1; then
  echo "Erreur : Docker n'est pas installé sur ce serveur Linux." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Erreur : Docker Compose v2 ('docker compose') est requis." >&2
  exit 1
fi

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp .env.example .env
  echo "Fichier .env initialisé depuis .env.example (données 100 % fictives par défaut)."
fi

echo "Construction de l'image Docker multi-étapes (Frontend + Rust/Axum)..."
docker compose up -d --build

echo "Vérification de disponibilité sur http://127.0.0.1:${PORT:-8080}/api/health ..."
for i in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${PORT:-8080}/api/health" >/dev/null 2>&1; then
    echo "CFitness OS est opérationnel :"
    curl -fsS "http://127.0.0.1:${PORT:-8080}/api/health"
    echo ""
    exit 0
  fi
  sleep 2
done

echo "Avertissement : le service met plus de temps que prévu à répondre. Consultez 'docker compose logs -f'."
exit 1
