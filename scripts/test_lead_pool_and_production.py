#!/usr/bin/env python3
"""Integration tests for lead commercial pool rebalancing, transfer, conversion KPIs,
and production preflight/backup tooling.
"""
# cspell:disable

from __future__ import annotations

import json
import os
import secrets
import subprocess
import sys
import tempfile
from pathlib import Path


def test_preflight_tool() -> None:
    """Test preflight check script with mock state and environment."""
    with tempfile.TemporaryDirectory(prefix="cfos_preflight_") as tmp_dir:
        tmp_path = Path(tmp_dir)
        state_file = tmp_path / "cfitness_state.json"

        # 1. État incomplet -> doit échouer
        state_file.write_text(json.dumps({"invalid": True}), encoding="utf-8")
        cmd = [sys.executable, "scripts/preflight_production_check.py", str(state_file)]
        res = subprocess.run(cmd, capture_output=True, text=True)
        assert res.returncode == 1, f"Incomplete state should fail: {res.stdout}"

        # 2. État complet avec admin -> avec env production complet -> doit passer
        valid_state = {
            "employees": [
                {
                    "id": "emp-admin",
                    "site_accesses": [{"site_id": "club-carre-soie", "profile_id": "admin"}],
                }
            ],
            "sites": [{"id": "club-carre-soie"}],
            "leave_requests": [],
            "lead_prospects": [],
            "lead_alerts": [],
            "audit_log": [],
        }
        state_file.write_text(json.dumps(valid_state), encoding="utf-8")

        env = {
            **os.environ,
            "CFITNESS_DEMO_MODE": "0",
            "CFITNESS_STRICT_SESSION": "1",
            "CFITNESS_ALLOWED_ORIGINS": "https://app.cfitness.fr",
            "CFITNESS_SESSION_SECRET": "a" * 32,
            "CFITNESS_HMAC_SECRET": "b" * 32,
        }
        res2 = subprocess.run(cmd, capture_output=True, text=True, env=env)
        assert res2.returncode == 0, f"Valid production preflight failed: {res2.stdout}"
        assert "CFITNESS_DEMO_MODE" in res2.stdout
        assert "CFITNESS_STRICT_SESSION" in res2.stdout
        assert "Comptes admin" in res2.stdout


def test_backup_tool_and_rotation() -> None:
    """Test automated production backup creation, verification, and rotation."""
    with tempfile.TemporaryDirectory(prefix="cfos_backup_") as tmp_dir:
        tmp_path = Path(tmp_dir)
        state_file = tmp_path / "cfitness_state.json"
        state_file.write_text(
            json.dumps(
                {
                    "employees": [],
                    "sites": [],
                    "punchPhotos": [],
                    "personalWorkspace": {"documents": {"files": []}},
                }
            ),
            encoding="utf-8",
        )

        backup_dir = tmp_path / "backups"
        hmac_secret = secrets.token_hex(32)

        # Exécuter 3 sauvegardes avec max_backups=2 pour tester la rotation
        for i in range(3):
            cmd = [
                sys.executable,
                "scripts/backup_production.py",
                "--state",
                str(state_file),
                "--output-dir",
                str(backup_dir),
                "--key-env",
                "CFITNESS_BACKUP_TEST_KEY",
                "--max-backups",
                "2",
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, env={**os.environ, "CFITNESS_BACKUP_TEST_KEY": hmac_secret})
            assert res.returncode == 0, f"Backup iteration {i} failed: {res.stderr}\n{res.stdout}"
            out = json.loads(res.stdout)
            assert out["ok"] is True
            assert out["sha256"]

        # Vérifier que seules 2 archives subsistent (rotation respectée)
        backups = list(backup_dir.glob("cfitness_backup_*.zip"))
        assert len(backups) == 2, f"Rotation expected 2 backups, found {len(backups)}"


def main() -> int:
    print("Test 1: Contrôle pré-vol de production...")
    test_preflight_tool()
    print("  -> OK")

    print("Test 2: Sauvegarde automatisée et rotation...")
    test_backup_tool_and_rotation()
    print("  -> OK")

    print("\nTous les tests Python d'outillage de production sont passés avec succès.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
