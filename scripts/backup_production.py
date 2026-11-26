#!/usr/bin/env python3
"""Automated backup script for C.Fitness OS production instances.

Generates a joint HMAC-signed archive of the state database, RH documents,
and private punch photos using rh_documents_archive.py, verifies SHA-256
integrity immediately, and applies rotation to retain the N newest backups.
"""
# cspell:disable

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def create_production_backup(
    state_file: Path,
    backup_dir: Path,
    hmac_secret: str | None = None,
    max_backups: int = 7,
) -> dict:
    """Create a verified production backup and rotate older files."""
    backup_dir.mkdir(parents=True, exist_ok=True)
    source_dir = state_file.parent if state_file.is_file() else state_file

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
    archive_name = f"cfitness_backup_{timestamp}.zip"
    archive_path = backup_dir / archive_name

    env = {**os.environ}
    cmd = [
        sys.executable,
        "scripts/rh_documents_archive.py",
        "create",
        "--source",
        str(source_dir),
        "--archive",
        str(archive_path),
    ]
    if hmac_secret:
        env["CFITNESS_BACKUP_HMAC_KEY"] = hmac_secret
        cmd.extend(["--key-env", "CFITNESS_BACKUP_HMAC_KEY"])

    res = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if res.returncode != 0:
        return {
            "ok": False,
            "error": f"Échec création archive : {res.stderr.strip() or res.stdout.strip()}",
        }

    # Vérification immédiate
    verify_cmd = [
        sys.executable,
        "scripts/rh_documents_archive.py",
        "verify",
        "--archive",
        str(archive_path),
    ]
    if hmac_secret:
        verify_cmd.extend(["--key-env", "CFITNESS_BACKUP_HMAC_KEY"])

    v_res = subprocess.run(verify_cmd, capture_output=True, text=True, env=env)
    if v_res.returncode != 0:
        return {
            "ok": False,
            "error": f"Échec vérification intégrité de l'archive : {v_res.stderr.strip() or v_res.stdout.strip()}",
        }

    # Calcul SHA-256
    sha256 = hashlib.sha256(archive_path.read_bytes()).hexdigest()
    size_bytes = archive_path.stat().st_size

    # Rotation des anciennes archives
    existing_backups = sorted(
        backup_dir.glob("cfitness_backup_*.zip"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    removed = []
    if len(existing_backups) > max_backups:
        for old in existing_backups[max_backups:]:
            old.unlink(missing_ok=True)
            removed.append(old.name)

    return {
        "ok": True,
        "archiveName": archive_name,
        "archivePath": str(archive_path),
        "sizeBytes": size_bytes,
        "sha256": sha256,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "retainedCount": min(len(existing_backups), max_backups),
        "prunedBackups": removed,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Sauvegarde automatisée de production C.Fitness OS")
    parser.add_argument("--state", default="cfitness_state.json", help="Chemin vers cfitness_state.json")
    parser.add_argument("--output-dir", default="backups", help="Dossier de destination des sauvegardes")
    parser.add_argument("--hmac-secret", default=os.environ.get("CFITNESS_HMAC_SECRET"), help="Secret HMAC d'intégrité")
    parser.add_argument("--max-backups", type=int, default=7, help="Nombre d'archives à conserver")
    args = parser.parse_args()

    result = create_production_backup(
        state_file=Path(args.state),
        backup_dir=Path(args.output_dir),
        hmac_secret=args.hmac_secret,
        max_backups=args.max_backups,
    )

    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
