import copy,hashlib,importlib.util,json,os,tempfile,unittest,zipfile
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('archives',Path(__file__).with_name('rh_documents_archive.py'))
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='rh-archive-unit-',dir=os.environ['TMPDIR']);self.root=Path(self.temp.name)
        self.source=self.root/'source';self.source.mkdir();(self.source/'rh-documents').mkdir()
        self.raw=b'%PDF-1.4\nFictif\n%%EOF\n';self.id='rh-doc-'+'a'*32
        self.row={'id':self.id,'clubId':'beynost','byteLength':len(self.raw),'sha256':hashlib.sha256(self.raw).hexdigest(),'acknowledgedAt':'2026-11-26T10:00:00Z'}
        self.state={'personalWorkspace':{'documents':{'files':[self.row]}},'punchPhotos':[]}
        self.save_state();(self.source/'rh-documents'/self.id).write_bytes(self.raw)
        self.archive=self.root/'archive.cfos-rh.zip'
    def tearDown(self):self.temp.cleanup()
    def save_state(self): (self.source/'cfitness_state.json').write_text(json.dumps(self.state))
    def rewrite(self,transform):
        with zipfile.ZipFile(self.archive) as z:entries={n:z.read(n) for n in z.namelist()}
        transform(entries)
        with zipfile.ZipFile(self.archive,'w',compression=zipfile.ZIP_STORED) as z:
            for name,data in entries.items():z.writestr(name,data)
    def test_signed_roundtrip_preserves_metadata_private_bytes_and_permissions(self):
        key=b'fictional-unit-key';self.assertTrue(a.create(self.source,self.archive,key)['signed'])
        self.assertEqual(a.verify(self.archive,key)['documents'],1)
        target=self.root/'restored';self.assertTrue(a.restore(self.archive,target,key)['restored'])
        self.assertEqual((target/'cfitness_state.json').read_bytes(),(self.source/'cfitness_state.json').read_bytes())
        self.assertEqual((target/'rh-documents'/self.id).read_bytes(),self.raw)
        if os.name=='posix':
            self.assertEqual(self.archive.stat().st_mode&0o777,0o600)
            self.assertEqual((target/'rh-documents'/self.id).stat().st_mode&0o777,0o600)
    def test_existing_archive_and_restore_target_are_never_replaced(self):
        a.create(self.source,self.archive);original=self.archive.read_bytes()
        with self.assertRaises(ValueError):a.create(self.source,self.archive)
        self.assertEqual(self.archive.read_bytes(),original)
        target=self.root/'existing';target.mkdir();sentinel=target/'keep';sentinel.write_bytes(b'keep')
        with self.assertRaises(FileExistsError):a.restore(self.archive,target)
        self.assertEqual(sentinel.read_bytes(),b'keep')
    def test_signatures_require_matching_key_and_cannot_be_downgraded(self):
        a.create(self.source,self.archive,b'fictional-unit-key')
        for key in [None,b'wrong']:
            with self.assertRaises(ValueError):a.verify(self.archive,key)
        self.rewrite(lambda e:e.update({'manifest.json':json.dumps({**json.loads(e['manifest.json']),'signature':None}).encode()}))
        with self.assertRaises(ValueError):a.verify(self.archive,b'fictional-unit-key')
    def test_tampered_file_or_state_are_refused_before_creating_restore_target(self):
        for name in ['cfitness_state.json','rh-documents/'+self.id]:
            a.create(self.source,self.archive)
            self.rewrite(lambda e:e.update({name:b'changed'}))
            target=self.root/'not-created'
            with self.assertRaises(ValueError):a.restore(self.archive,target)
            self.assertFalse(target.exists());self.archive.unlink()
    def test_extra_traversal_duplicate_and_compressed_entries_are_refused(self):
        a.create(self.source,self.archive)
        self.rewrite(lambda e:e.update({'../escape':b'unexpected'}))
        with self.assertRaises(ValueError):a.verify(self.archive)
        self.archive.unlink();a.create(self.source,self.archive)
        with zipfile.ZipFile(self.archive,'a') as z:
            with __import__('warnings').catch_warnings():
                __import__('warnings').simplefilter('ignore');z.writestr('manifest.json',b'{}')
        with self.assertRaises(ValueError):a.verify(self.archive)
        self.archive.unlink()
        with zipfile.ZipFile(self.archive,'w',compression=zipfile.ZIP_DEFLATED) as z:z.writestr('manifest.json',b'{}')
        with self.assertRaises(ValueError):a.verify(self.archive)
    def test_missing_tampered_source_or_invalid_registry_does_not_publish_partial_archive(self):
        (self.source/'rh-documents'/self.id).unlink()
        with self.assertRaises(OSError):a.create(self.source,self.archive)
        self.assertFalse(self.archive.exists());self.assertEqual(list(self.root.glob('.cfos-rh-archive-*')),[])
        (self.source/'rh-documents'/self.id).write_bytes(b'wrong')
        with self.assertRaises(ValueError):a.create(self.source,self.archive)
        self.state['personalWorkspace']['documents']['files'].append(copy.deepcopy(self.row));self.save_state()
        with self.assertRaises(ValueError):a.create(self.source,self.archive)
    def test_inspection_reports_orphans_without_deleting_and_photos_are_not_silently_omitted(self):
        orphan=self.source/'rh-documents'/'unreferenced';orphan.write_bytes(b'keep')
        self.assertEqual(a.inspect_source(self.source)['unreferencedEntries'],1)
        a.create(self.source,self.archive);self.assertEqual(orphan.read_bytes(),b'keep')
        self.state['punchPhotos']=[{'id':'unsupported-private-photo'}];self.save_state()
        with self.assertRaises(ValueError):a.create(self.source,self.root/'refused.zip')
    def test_restore_failure_removes_only_its_new_files(self):
        a.create(self.source,self.archive)
        original=a.read_entry
        calls=0
        def fail_second_pass(archive,name,limit):
            nonlocal calls
            if name.startswith('rh-documents/'):
                calls+=1
                if calls==2:raise OSError('fictional restore failure')
            return original(archive,name,limit)
        target=self.root/'failed-restore'
        with patch.object(a,'read_entry',side_effect=fail_second_pass):
            with self.assertRaises(OSError):a.restore(self.archive,target)
        self.assertFalse(target.exists());self.assertTrue(self.archive.exists())
    def test_private_source_symlinks_are_refused(self):
        if not hasattr(os,'symlink'):self.skipTest('Symlinks unavailable')
        path=self.source/'rh-documents'/self.id
        path.unlink();outside=self.root/'outside-fictif';outside.write_bytes(self.raw);path.symlink_to(outside)
        with self.assertRaises(ValueError):a.create(self.source,self.archive)
        self.assertEqual(outside.read_bytes(),self.raw)
        path.unlink();path.write_bytes(self.raw)
        folder=self.source/'rh-documents';moved=self.root/'other-folder';folder.rename(moved);folder.symlink_to(moved,target_is_directory=True)
        with self.assertRaises(ValueError):a.create(self.source,self.archive)
if __name__=='__main__':unittest.main()
