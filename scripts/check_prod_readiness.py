#!/usr/bin/env python3
"""Vérification pré-production C.Fitness OS (bascule Démo -> Production réelle)."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env"
DOCKERFILE = ROOT / "Dockerfile"

errors = []
warnings = []

if not ENV_FILE.exists():
    warnings.append("Fichier .env absent (copier .env.example et renseigner des secrets uniques).")
else:
    env_text = ENV_FILE.read_text(encoding="utf-8", errors="ignore")
    kv = {}
    for line in env_text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        kv[k.strip()] = v.strip()

    if kv.get("CFITNESS_DEMO_MODE") != "0":
        errors.append("CFITNESS_DEMO_MODE doit être réglé sur 0 en production.")
    if kv.get("CFITNESS_STRICT_SESSION") != "1":
        errors.append("CFITNESS_STRICT_SESSION doit être réglé sur 1 en production.")
    if not kv.get("CFITNESS_ALLOWED_ORIGINS"):
        errors.append("CFITNESS_ALLOWED_ORIGINS doit lister le(s) domaine(s) autorisé(s).")
    if kv.get("VITE_DEMO_MODE", "").lower() != "false":
        warnings.append("Compiler le frontend avec --build-arg VITE_DEMO_MODE=false.")

if DOCKERFILE.exists():
    df = DOCKERFILE.read_text(encoding="utf-8", errors="ignore")
    if "COPY contracts ./contracts" not in df:
        errors.append("Dockerfile : COPY contracts ./contracts manquant dans rust-builder.")
else:
    errors.append("Dockerfile introuvable.")

print("=== Audit Pré-Production C.Fitness OS ===")
for w in warnings:
    print(f"[AVERTISSEMENT] {w}")
for e in errors:
    print(f"[BLOQUANT]      {e}")
if not errors:
    print("OK : aucun blocage détecté.")
    sys.exit(0)
sys.exit(1)
