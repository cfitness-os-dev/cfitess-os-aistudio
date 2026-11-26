"""Isolated regression tests for operator backup retention. No real data or keys."""
import json,os,secrets,subprocess,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parent))
import backup_production as backup

class BackupSafetyTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix="backup-safety-",dir=os.environ["TMPDIR"])
        self.root=Path(self.temp.name);self.source=self.root/"source";self.source.mkdir()
        self.state=self.source/"cfitness_state.json"
        self.state.write_text(json.dumps({"personalWorkspace":{"documents":{"files":[]}},"punchPhotos":[]}))
        self.output=self.root/"backups";self.key=secrets.token_hex(32)
    def tearDown(self):self.temp.cleanup()
    def run_backup(self,**kw):
        return backup.create_production_backup(self.state,self.output,self.key,**kw)
    def test_zero_retention_must_not_delete_new_archive_and_report_success(self):
        result=self.run_backup(max_backups=0)
        self.assertFalse(result["ok"])
        self.assertFalse(self.output.exists())

    def test_invalid_retention_and_missing_key_do_not_touch_existing_backups(self):
        self.output.mkdir();marker=self.output/"cfitness_backup_unrecognized.zip";marker.write_bytes(b"preserve")
        for value in [-1,True,366]:
            self.assertFalse(self.run_backup(max_backups=value)["ok"])
        for key in [None,"","short"]:
            self.assertFalse(backup.create_production_backup(self.state,self.output,key)["ok"])
        self.assertEqual(marker.read_bytes(),b"preserve")
        self.assertEqual(list(self.output.iterdir()),[marker])
    def test_signed_rotation_keeps_new_archive_and_exact_limit(self):
        records=[self.run_backup(max_backups=2) for _ in range(3)]
        self.assertTrue(all(r["ok"] and r["signed"] for r in records))
        self.assertEqual(len(list(self.output.glob("*.zip"))),2)
        self.assertEqual(len(records[-1]["prunedBackups"]),1)
        self.assertTrue(Path(records[-1]["archivePath"]).is_file())
        self.assertEqual(records[-1]["retainedCount"],2)
        self.assertFalse((self.output/backup.LOCK).exists())
    def test_unrecognized_corrupt_other_key_and_symlink_files_are_preserved(self):
        first=self.run_backup(max_backups=1);self.assertTrue(first["ok"])
        original=Path(first["archivePath"])
        foreign=self.output/"cfitness_backup_20990101_000000_000001.zip"
        backup.joint.create(self.source,foreign,secrets.token_hex(32).encode())
        corrupt=self.output/"cfitness_backup_20990101_000000_000002.zip";corrupt.write_bytes(b"bad zip")
        unknown=self.output/"cfitness_backup_custom.zip";unknown.write_bytes(b"unrelated")
        link=self.output/"cfitness_backup_20990101_000000_000003.zip"
        outside=self.root/"outside";outside.write_bytes(b"outside")
        link.symlink_to(outside)
        result=self.run_backup(max_backups=1)
        self.assertTrue(result["ok"]);self.assertEqual(result["skippedUnverifiedCount"],3)
        self.assertFalse(original.exists())
        for path in [foreign,corrupt,unknown]:self.assertTrue(path.exists())
        self.assertTrue(link.is_symlink());self.assertEqual(outside.read_bytes(),b"outside")
    def test_future_dated_valid_archive_cannot_displace_current_backup(self):
        self.output.mkdir()
        future=self.output/"cfitness_backup_20990101_000000_000001.zip"
        backup.joint.create(self.source,future,self.key.encode())
        result=self.run_backup(max_backups=1)
        self.assertTrue(result["ok"]);self.assertTrue(Path(result["archivePath"]).exists())
        self.assertFalse(future.exists())
    def test_existing_lock_refuses_without_deleting_foreign_lock(self):
        self.output.mkdir();lock=self.output/backup.LOCK;lock.write_bytes(b"other invocation")
        self.assertFalse(self.run_backup()["ok"])
        self.assertEqual(lock.read_bytes(),b"other invocation")
        self.assertEqual(len(list(self.output.iterdir())),1)
    def test_create_and_verify_failures_never_rotate_old_backups(self):
        first=self.run_backup(max_backups=1);old=Path(first["archivePath"]);before=old.read_bytes()
        with patch.object(backup.joint,"create",side_effect=OSError("private diagnostic")):
            result=self.run_backup(max_backups=1)
            self.assertFalse(result["ok"]);self.assertNotIn("private diagnostic",str(result))
        with patch.object(backup.joint,"verify",side_effect=ValueError("private diagnostic")):
            result=self.run_backup(max_backups=1)
            self.assertFalse(result["ok"]);self.assertTrue(result["archiveCreated"])
            self.assertNotIn("private diagnostic",str(result))
        self.assertEqual(old.read_bytes(),before)
        self.assertFalse((self.output/backup.LOCK).exists())
    def test_missing_or_differently_named_state_and_symlink_output_are_refused(self):
        missing=self.source/"missing.json"
        self.assertFalse(backup.create_production_backup(missing,self.output,self.key)["ok"])
        wrong=self.source/"other.json";wrong.write_bytes(self.state.read_bytes())
        self.assertFalse(backup.create_production_backup(wrong,self.output,self.key)["ok"])
        self.assertFalse(self.output.exists())
        target=self.root/"target";target.mkdir();self.output.symlink_to(target,target_is_directory=True)
        self.assertFalse(self.run_backup()["ok"]);self.assertEqual(list(target.iterdir()),[])
    def test_cli_from_unrelated_directory_uses_environment_key_only(self):
        env={**os.environ,"CFITNESS_BACKUP_TEST_KEY":self.key}
        script=str(Path(backup.__file__).resolve())
        cmd=[sys.executable,script,"--state",str(self.state),"--output-dir",str(self.output),"--key-env","CFITNESS_BACKUP_TEST_KEY"]
        result=subprocess.run(cmd,cwd=self.root,env=env,text=True,capture_output=True)
        self.assertEqual(result.returncode,0,result.stderr)
        parsed=json.loads(result.stdout);self.assertTrue(parsed["ok"])
        self.assertTrue(backup.joint.verify(parsed["archivePath"],self.key.encode())["signed"])
        self.assertNotIn(self.key,result.stdout+result.stderr)
        rejected=subprocess.run([sys.executable,script,"--hmac-secret",self.key],cwd=self.root,env=env,text=True,capture_output=True)
        self.assertNotEqual(rejected.returncode,0)
        self.assertNotIn(self.key,rejected.stdout+rejected.stderr)
    def test_prune_failure_reports_failure_and_keeps_new_backup(self):
        previous=self.run_backup(max_backups=1)
        original=Path.unlink
        def fail_old(path,*args,**kwargs):
            if str(path)==previous["archivePath"]:raise PermissionError("synthetic")
            return original(path,*args,**kwargs)
        with patch.object(Path,"unlink",fail_old):
            result=self.run_backup(max_backups=1)
        self.assertFalse(result["ok"]);self.assertTrue(result["archiveCreated"]);self.assertFalse(result["rotationComplete"])
        self.assertTrue(Path(previous["archivePath"]).exists())
        self.assertFalse((self.output/backup.LOCK).exists())

if __name__=="__main__":unittest.main()
