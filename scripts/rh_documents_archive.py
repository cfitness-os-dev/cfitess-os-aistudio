"""Private RH-document archives. Offline restoration always uses a new destination.
No provider access, no existing-data overwrite, no automatic deletion of source files.
"""
import argparse
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import stat
import tempfile
from datetime import datetime, timezone
import zipfile

MAX_FILE=4*1024*1024
MAX_STATE=10*1024*1024
MAX_MANIFEST=2*1024*1024
MAX_CLUB=200*1024*1024
FORMAT='cfitness-rh-documents-v1'
ID=re.compile(r'rh-doc-[0-9a-f]{32}\Z')
SHA=re.compile(r'[0-9a-f]{64}\Z')

def fail(message):
    raise ValueError(message)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def unique_object(pairs):
    result={}
    for key,value in pairs:
        if key in result:fail('Champs JSON dupliqués.')
        result[key]=value
    return result

def decode(data):
    return json.loads(data.decode('utf-8'),object_pairs_hook=unique_object,
        parse_constant=lambda _:fail('Valeur JSON non finie.'))

def documents(state):
    if not isinstance(state,dict):fail('État JSON invalide.')
    # This first format cannot claim to preserve another private file store.
    if state.get('punchPhotos'):fail('Cette archive ne prend pas encore en charge les photos de badgeage. Aucun export partiel confirmé.')
    workspace=state.get('personalWorkspace',{})
    store=workspace.get('documents',{}) if isinstance(workspace,dict) else None
    rows=store.get('files',[]) if isinstance(store,dict) else None
    if not isinstance(rows,list) or len(rows)>10000:fail('Registre documentaire invalide ou trop grand.')
    seen=set();totals={'beynost':0,'carre-de-soie':0}
    for row in rows:
        if not isinstance(row,dict):fail('Document invalide.')
        name=row.get('id');size=row.get('byteLength');sha=row.get('sha256');club=row.get('clubId')
        if not isinstance(name,str) or not ID.fullmatch(name) or name in seen:fail('Référence de fichier invalide ou dupliquée.')
        if type(size) is not int or not 1<=size<=MAX_FILE:fail('Taille documentaire invalide.')
        if not isinstance(sha,str) or not SHA.fullmatch(sha) or club not in totals:fail('Empreinte ou club documentaire invalide.')
        seen.add(name);totals[club]+=size
        if totals[club]>MAX_CLUB:fail('Quota documentaire du club dépassé.')
    return rows

def checked_read(path,limit):
    path=Path(path)
    if path.is_symlink():fail("Les liens symboliques ne sont pas acceptés.")
    # Never follow a private-file symlink into unrelated data.
    fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
    with os.fdopen(fd,'rb') as stream:
        if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):fail('Un fichier attendu n’est pas un fichier régulier.')
        data=stream.read(limit+1)
    if len(data)>limit:fail('Fichier trop volumineux.')
    return data

def source_snapshot(source):
    source=Path(source)
    if (source/'rh-documents').is_symlink():fail('Le dossier documentaire ne doit pas être un lien symbolique.')
    raw=checked_read(source/'cfitness_state.json',MAX_STATE)
    state=decode(raw);rows=documents(state)
    return raw,rows

def check_document(raw,row):
    if len(raw)!=row['byteLength'] or digest(raw)!=row['sha256']:fail('Un document est absent, incomplet ou altéré.')

def canonical(manifest):
    return json.dumps({k:v for k,v in manifest.items() if k!='signature'},ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode()

def inspect_source(source):
    source=Path(source);_,rows=source_snapshot(source)
    for row in rows:check_document(checked_read(source/'rh-documents'/row['id'],MAX_FILE),row)
    expected={row['id'] for row in rows}
    folder=source/'rh-documents'
    orphan_count=sum(p.name not in expected for p in folder.iterdir()) if folder.exists() else 0
    return {'documents':len(rows),'verified':True,'unreferencedEntries':orphan_count,'sourceModified':False}

def create(source,destination,key=None):
    source=Path(source);destination=Path(destination)
    if destination.exists() or destination.is_symlink():fail('Le fichier de destination existe déjà.')
    raw,rows=source_snapshot(source)
    manifest={'format':FORMAT,'createdAt':datetime.now(timezone.utc).isoformat(),
        'state':{'path':'cfitness_state.json','byteLength':len(raw),'sha256':digest(raw)},
        'documents':[{'id':r['id'],'path':'rh-documents/'+r['id'],'clubId':r['clubId'],
            'byteLength':r['byteLength'],'sha256':r['sha256']} for r in rows]}
    manifest['signature']=hmac.new(key,canonical(manifest),hashlib.sha256).hexdigest() if key is not None else None
    temporary=None
    try:
        fd,temporary=tempfile.mkstemp(prefix='.cfos-rh-archive-',dir=destination.parent)
        os.close(fd);os.chmod(temporary,0o600)
        with zipfile.ZipFile(temporary,'w',compression=zipfile.ZIP_STORED,allowZip64=False) as archive:
            archive.writestr('cfitness_state.json',raw)
            for row in rows:
                content=checked_read(source/'rh-documents'/row['id'],MAX_FILE)
                check_document(content,row)
                archive.writestr('rh-documents/'+row['id'],content)
            archive.writestr('manifest.json',json.dumps(manifest,ensure_ascii=False,sort_keys=True,allow_nan=False).encode())
        with open(temporary,'r+b') as stream:os.fsync(stream.fileno())
        # Atomic creation, refusing even a destination created concurrently.
        os.link(temporary,destination)
        return {'documents':len(rows),'signed':key is not None,'created':True}
    finally:
        if temporary is not None:Path(temporary).unlink(missing_ok=True)

def read_entry(archive,name,limit):
    info=archive.getinfo(name)
    if info.file_size>limit or info.compress_type!=zipfile.ZIP_STORED or info.flag_bits&1:
        fail('Entrée compressée, chiffrée ou trop grande non prise en charge.')
    with archive.open(info) as stream:data=stream.read(limit+1)
    if len(data)>limit or len(data)!=info.file_size:fail('Entrée incomplète ou trop grande.')
    return data

def verified(archive,key):
    names=[i.filename for i in archive.infolist()]
    if len(names)!=len(set(names)) or len(names)>10002:fail('Entrées dupliquées ou trop nombreuses.')
    manifest=decode(read_entry(archive,'manifest.json',MAX_MANIFEST))
    if not isinstance(manifest,dict) or set(manifest)!= {'format','createdAt','state','documents','signature'} or manifest.get('format')!=FORMAT:
        fail('Format d’archive inconnu.')
    signature=manifest.get('signature')
    if signature is not None:
        if key is None:fail('Cette archive signée nécessite sa clé de vérification.')
        if not isinstance(signature,str) or not SHA.fullmatch(signature) or not hmac.compare_digest(signature,hmac.new(key,canonical(manifest),hashlib.sha256).hexdigest()):
            fail('Signature de l’archive invalide.')
    elif key is not None:fail('Une archive signée est requise.')
    state_info=manifest.get('state')
    if not isinstance(state_info,dict) or state_info.get('path')!='cfitness_state.json':fail('État de l’archive invalide.')
    raw=read_entry(archive,'cfitness_state.json',MAX_STATE)
    if state_info.get('byteLength')!=len(raw) or state_info.get('sha256')!=digest(raw):fail('État JSON altéré.')
    rows=documents(decode(raw))
    expected=[{'id':r['id'],'path':'rh-documents/'+r['id'],'clubId':r['clubId'],
        'byteLength':r['byteLength'],'sha256':r['sha256']} for r in rows]
    if manifest.get('documents')!=expected:fail('Le manifeste ne correspond pas au registre documentaire.')
    if set(names)!={'manifest.json','cfitness_state.json',*(r['path'] for r in expected)}:
        fail('Des fichiers manquent ou ne sont pas référencés.')
    for row in expected:check_document(read_entry(archive,row['path'],MAX_FILE),row)
    return manifest,raw

def verify(path,key=None):
    with zipfile.ZipFile(path) as archive:
        manifest,_=verified(archive,key)
    return {'documents':len(manifest['documents']),'signed':manifest['signature'] is not None,'verified':True}

def restore(path,destination,key=None):
    destination=Path(destination);owned=[];created=False
    try:
        with zipfile.ZipFile(path) as archive:
            manifest,raw=verified(archive,key)
            # Offline operation: exclusive new directory; never replace an existing dataset.
            destination.mkdir(mode=0o700);created=True
            folder=destination/'rh-documents';folder.mkdir(mode=0o700)
            def write_new(path,content):
                fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600);owned.append(path)
                with os.fdopen(fd,'wb') as stream:stream.write(content);stream.flush();os.fsync(stream.fileno())
            for row in manifest['documents']:
                content=read_entry(archive,row['path'],MAX_FILE);check_document(content,row)
                write_new(folder/row['id'],content)
            # State is written last; do not start a server on this folder before success.
            write_new(destination/'cfitness_state.json',raw)
            return {'documents':len(manifest['documents']),'signed':manifest['signature'] is not None,'restored':True,'newDirectoryOnly':True}
    except BaseException:
        if created:
            for path in reversed(owned):path.unlink(missing_ok=True)
            for folder in [destination/'rh-documents',destination]:
                try:folder.rmdir()
                except OSError:pass # Preserve any unrelated file created by another process.
        raise

def main():
    parser=argparse.ArgumentParser(description='Archives privées des documents RH ; restauration hors ligne vers un dossier neuf uniquement.')
    parser.add_argument('action',choices=['create','verify','restore','inspect'])
    parser.add_argument('--source',type=Path);parser.add_argument('--archive',type=Path)
    parser.add_argument('--destination',type=Path);parser.add_argument('--key-env',help='Nom de la variable contenant la clé HMAC ; aucune clé en argument.')
    args=parser.parse_args();key=None
    if args.key_env:
        value=os.environ.get(args.key_env)
        if not value:parser.error('La variable de clé demandée est absente ou vide.')
        key=value.encode()
    try:
        if args.action=='create':
            if not args.source or not args.archive:parser.error('--source et --archive requis.')
            result=create(args.source,args.archive,key)
        elif args.action=='verify':
            if not args.archive:parser.error('--archive requis.')
            result=verify(args.archive,key)
        elif args.action=='restore':
            if not args.archive or not args.destination:parser.error('--archive et --destination requis.')
            result=restore(args.archive,args.destination,key)
        else:
            if not args.source:parser.error('--source requis.')
            result=inspect_source(args.source)
        print(json.dumps(result,ensure_ascii=False))
    except (ValueError,OSError,KeyError,zipfile.BadZipFile,RuntimeError):
        # Never print raw state, filenames from an untrusted archive, or signing secrets.
        parser.exit(1,'Opération refusée : archive, fichiers ou destination non valides. Aucun succès confirmé.\n')
if __name__=='__main__':main()
