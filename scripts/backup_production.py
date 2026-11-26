#!/usr/bin/env python3
"""One operator backup and bounded rotation. No scheduler or production readiness claim.

Private state, documents and punch photos are signed together. Only archives
verified with the selected key are eligible for rotation; unrelated files remain.
"""
# cspell:disable
from __future__ import annotations
import argparse
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
import rh_documents_archive as joint

NAME = re.compile(r"cfitness_backup_[0-9]{8}_[0-9]{6}_[0-9]{6}\.zip\Z")
LOCK = ".cfitness-backup.lock"

def create_production_backup(state_file: Path, backup_dir: Path,
                             hmac_secret: str | None = None, max_backups: int = 7) -> dict:
    """Create and verify before pruning. Keep the new archive even if clocks differ."""
    # Validate before mkdir, archive creation, or rotation.
    if type(max_backups) is not int or not 1 <= max_backups <= 365:
        return {"ok": False, "error": "Conservation invalide : choisissez de 1 à 365 archives."}
    if not isinstance(hmac_secret, str) or len(hmac_secret.strip()) < 32:
        return {"ok": False, "error": "Une clé HMAC de 32 caractères minimum doit être fournie par l’environnement."}
    state_file=Path(state_file);backup_dir=Path(backup_dir)
    if state_file.is_symlink() or not state_file.is_file() or state_file.name != "cfitness_state.json":
        return {"ok": False, "error": "Le fichier d’état canonique est absent ou invalide."}
    if backup_dir.is_symlink():
        return {"ok": False, "error": "Le dossier de sauvegarde ne doit pas être un lien symbolique."}
    archive_path=None;locked=False
    try:
        backup_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        # A second invocation must never rotate a first invocation's work.
        fd=os.open(backup_dir/LOCK, os.O_CREAT|os.O_EXCL|os.O_WRONLY, 0o600)
        locked=True;os.close(fd)
        timestamp=datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
        archive_path=backup_dir/f"cfitness_backup_{timestamp}.zip"
        key=hmac_secret.encode()
        joint.create(state_file.parent, archive_path, key)
        verified=joint.verify(archive_path, key)
        if not verified.get("verified") or not verified.get("signed"):
            raise ValueError("archive verification failed")
        checksum=hashlib.sha256()
        with archive_path.open("rb") as stream:
            for chunk in iter(lambda:stream.read(1024*1024), b""):checksum.update(chunk)
        size=archive_path.stat().st_size

        candidates=[];skipped=0
        for path in backup_dir.iterdir():
            if path==archive_path or not NAME.fullmatch(path.name):continue
            if path.is_symlink() or not path.is_file():
                skipped+=1;continue
            try:
                check=joint.verify(path,key)
                if not check.get("verified") or not check.get("signed"):
                    skipped+=1;continue
            except (OSError,ValueError,KeyError,TypeError,RuntimeError,joint.zipfile.BadZipFile):
                skipped+=1;continue
            candidates.append(path)
        candidates.sort(key=lambda p:p.name,reverse=True)
        # Always retain this successful archive; future-dated old files cannot displace it.
        removed=[]
        for old in candidates[max_backups-1:]:
            old.unlink();removed.append(old.name)
        return {"ok":True,"archiveName":archive_path.name,"archivePath":str(archive_path),
                "sizeBytes":size,"sha256":checksum.hexdigest(),"signed":True,
                "createdAt":datetime.now(timezone.utc).isoformat(),
                "retainedCount":1+min(len(candidates),max_backups-1),
                "prunedBackups":removed,"skippedUnverifiedCount":skipped,"rotationComplete":True}
    except FileExistsError:
        return {"ok":False,"error":"Une sauvegarde est déjà en cours ou sa destination existe. Aucune rotation confirmée."}
    except (OSError,ValueError,KeyError,TypeError,RuntimeError,joint.zipfile.BadZipFile):
        # No raw state, file content or secret is printed. Never prune after a create/verify failure.
        return {"ok":False,"archiveCreated":archive_path is not None and archive_path.is_file(),
                "rotationComplete":False,
                "error":"Sauvegarde ou rotation non confirmée. Les archives restantes sont conservées ; contrôler le dossier."}
    finally:
        if locked:
            try:(backup_dir/LOCK).unlink()
            except OSError:pass

class PrivateArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        self.exit(2,"Arguments invalides. Consultez --help ; transmettez la clé uniquement par variable d’environnement.\n")

def main() -> int:
    parser=PrivateArgumentParser(description="Créer une archive privée signée et appliquer sa rotation, sans planificateur.")
    parser.add_argument("--state",default="cfitness_state.json",help="Fichier d’état canonique à sauvegarder")
    parser.add_argument("--output-dir",default="backups",help="Dossier privé réservé à ces archives")
    parser.add_argument("--key-env",default="CFITNESS_HMAC_SECRET",help="Nom de la variable contenant la clé HMAC, jamais la clé elle-même")
    parser.add_argument("--max-backups",type=int,default=7,help="De 1 à 365 archives signées vérifiées")
    args=parser.parse_args()
    result=create_production_backup(Path(args.state),Path(args.output_dir),
                                    os.environ.get(args.key_env),args.max_backups)
    print(json.dumps(result,indent=2,ensure_ascii=False))
    return 0 if result["ok"] else 1

if __name__=="__main__":raise SystemExit(main())
