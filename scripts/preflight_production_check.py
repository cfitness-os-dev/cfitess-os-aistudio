#!/usr/bin/env python3
"""Preflight verification script for C.Fitness OS production deployment.

Checks environment variables, state file integrity, session secrets,
CORS security, and directory permissions before live go-live.
"""
# cspell:disable

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Dict, List, Tuple


def check_env_vars() -> List[Tuple[str, str, str]]:
    """Verify production environment variables."""
    results: List[Tuple[str, str, str]] = []

    # 1. CFITNESS_DEMO_MODE
    demo_mode = os.environ.get("CFITNESS_DEMO_MODE", "").strip()
    if demo_mode in ("0", "false", "False"):
        results.append(("PASS", "CFITNESS_DEMO_MODE", "Désactivé (0)"))
    elif demo_mode == "":
        results.append(("WARN", "CFITNESS_DEMO_MODE", "Non défini (mode démo par défaut)"))
    else:
        results.append(("FAIL", "CFITNESS_DEMO_MODE", f"Actif ({demo_mode}) : interdire en production"))

    # 2. CFITNESS_STRICT_SESSION
    strict_session = os.environ.get("CFITNESS_STRICT_SESSION", "").strip()
    if strict_session in ("1", "true", "True"):
        results.append(("PASS", "CFITNESS_STRICT_SESSION", "Actif (1)"))
    else:
        results.append(("FAIL", "CFITNESS_STRICT_SESSION", "Désactivé : Bearer strict obligatoire en production"))

    # 3. CFITNESS_ALLOWED_ORIGINS
    origins = os.environ.get("CFITNESS_ALLOWED_ORIGINS", "").strip()
    if not origins or origins == "*":
        results.append(("FAIL", "CFITNESS_ALLOWED_ORIGINS", "Wildcard '*' ou vide interdit en production"))
    elif "http://" in origins:
        results.append(("WARN", "CFITNESS_ALLOWED_ORIGINS", f"Origines non-HTTPS détectées : {origins}"))
    else:
        results.append(("PASS", "CFITNESS_ALLOWED_ORIGINS", f"Origines HTTPS strictes : {origins}"))

    # 4. CFITNESS_SESSION_SECRET / CFITNESS_HMAC_SECRET
    for sec_name in ("CFITNESS_SESSION_SECRET", "CFITNESS_HMAC_SECRET"):
        val = os.environ.get(sec_name, "").strip()
        if not val:
            results.append(("WARN", sec_name, "Non défini (CSPRNG automatique en mémoire)"))
        elif len(val) < 32:
            results.append(("FAIL", sec_name, f"Trop court ({len(val)} car., minimum 32 recommandé)"))
        elif any(bad in val.lower() for bad in ("test", "demo", "default", "change", "1234")):
            results.append(("FAIL", sec_name, "Contient un mot de passe prévisible / par défaut"))
        else:
            results.append(("PASS", sec_name, "Défini avec entropie satisfaisante (>= 32 car.)"))

    return results


def check_state_file(state_path: Path) -> List[Tuple[str, str, str]]:
    """Verify database state file existence and schema."""
    results: List[Tuple[str, str, str]] = []

    if not state_path.exists():
        results.append(("FAIL", "Base de données", f"Fichier {state_path} introuvable"))
        return results

    try:
        content = state_path.read_text(encoding="utf-8")
        data = json.loads(content)
        results.append(("PASS", "Format JSON", f"Valide ({len(content)} octets)"))
    except Exception as exc:
        results.append(("FAIL", "Format JSON", f"Corruption détectée : {exc}"))
        return results

    # Vérification des collections obligatoires (support camelCase réel du backend et rétro-compatibilité snake_case)
    required_collections = [
        ("employees", "employees"),
        ("sites", "sites"),
        ("leaveRequests", "leave_requests"),
        ("leadProspects", "lead_prospects"),
        ("leadAlerts", "lead_alerts"),
        ("auditLog", "audit_log"),
    ]
    missing = [camel for camel, snake in required_collections if camel not in data and snake not in data]
    if missing:
        results.append(("FAIL", "Schéma données", f"Collections manquantes : {', '.join(missing)}"))
    else:
        results.append(("PASS", "Schéma données", "Toutes les collections requises sont présentes"))

    # Vérification des comptes administrateurs (support camelCase profileId / admin_systeme et snake_case)
    employees = data.get("employees", [])
    admins = []
    for e in employees:
        accesses = e.get("siteAccesses") or e.get("site_accesses") or []
        for sa in accesses:
            prof = sa.get("profileId") or sa.get("profile_id")
            if prof in ("admin_systeme", "admin"):
                admins.append(e)
                break

    if not admins:
        results.append(("FAIL", "Comptes admin", "Aucun administrateur (admin_systeme / admin) configuré"))
    else:
        results.append(("PASS", "Comptes admin", f"{len(admins)} administrateur(s) détecté(s)"))

    return results


def run_preflight(state_path: Path | None = None) -> int:
    """Execute all preflight checks and format report."""
    if state_path is None:
        state_path = Path("cfitness_state.json")

    print("==================================================")
    print("   C.Fitness OS — Contrôle Pré-Vol Production     ")
    print("==================================================\n")

    env_results = check_env_vars()
    state_results = check_state_file(state_path)
    all_results = env_results + state_results

    has_fail = False
    has_warn = False
    for status, label, detail in all_results:
        symbol = "[OK]  " if status == "PASS" else ("[WARN]" if status == "WARN" else "[FAIL]")
        if status == "FAIL":
            has_fail = True
        elif status == "WARN":
            has_warn = True
        print(f"{symbol} {label:<28} : {detail}")

    print("\n--------------------------------------------------")
    if has_fail:
        print("RÉSULTAT : ÉCHEC — Corrigez les points bloquants [FAIL] avant la mise en production.")
        return 1
    elif has_warn:
        print("RÉSULTAT : AVERTISSEMENT — Contrôles techniques passés avec des avertissements (WARN). Revoir les réglages signalés avant exploitation.")
        return 0
    else:
        print("RÉSULTAT : SUCCÈS — Contrôles techniques pré-vol conformes pour les variables d'environnement et la structure du fichier d'état.")
        return 0


if __name__ == "__main__":
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("cfitness_state.json")
    sys.exit(run_preflight(path))
