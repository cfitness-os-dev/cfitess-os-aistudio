import {useEffect,useRef,useState} from 'react';
import {FileText,Download,Upload} from 'lucide-react';
import {loadRhDocuments,uploadRhDocument,acknowledgeRhDocument,archiveRhDocument,downloadRhDocument,documentFile,type RhDocuments,type RhDocument} from '../../domain/hrDocuments';
import {useLeadDraftGuard} from '../useLeadDraftGuard';
const button='cf-card-secondary rounded-lg p-3 text-sm disabled:opacity-50 min-h-[44px]';
export function HrDocumentsView({actorId,clubId,personal=false}:{actorId:string;clubId:string;personal?:boolean}){
  return <Documents key={actorId+':'+clubId+':'+personal} actorId={actorId} clubId={clubId} personal={personal}/>;
}
function Documents({actorId,clubId,personal}:{actorId:string;clubId:string;personal:boolean}){
  const [data,setData]=useState<RhDocuments|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const [employee,setEmployee]=useState(personal?actorId:''),[title,setTitle]=useState(''),[category,setCategory]=useState('Autre'),[file,setFile]=useState<File|null>(null);
  const [archived,setArchived]=useState(false),[search,setSearch]=useState(''),[folder,setFolder]=useState(''),[confirm,setConfirm]=useState<string|null>(null),[consents,setConsents]=useState<Record<string,boolean>>({});
  const operation=useRef<{fingerprint:string;id:string}|null>(null),pending=useRef(false),mounted=useRef(true),fileInput=useRef<HTMLInputElement>(null);
  useLeadDraftGuard(!!title||!!file);
  useEffect(()=>{
    mounted.current=true;const abort=new AbortController();
    loadRhDocuments(actorId,clubId,personal,false,undefined,abort.signal).then(v=>{if(!abort.signal.aborted)setData(v);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);});
    return()=>{mounted.current=false;abort.abort();};
  },[actorId,clubId,personal]);
  async function reload(includeArchived=archived,before?:string){
    const value=await loadRhDocuments(actorId,clubId,personal,includeArchived,before);
    if(mounted.current)setData(value);
  }
  async function run(action:()=>Promise<void>){
    if(pending.current)return;pending.current=true;setBusy(true);setError('');setNotice('');
    try{await action();}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Opération non confirmée. Réessayez.');}
    finally{pending.current=false;if(mounted.current)setBusy(false);}
  }
  async function upload(){
    if(!file)return;
    const current=file,recipient=personal?actorId:employee;
    await run(async()=>{
      const content=await documentFile(current);
      const fingerprint=JSON.stringify([recipient,title.trim(),category,content]);
      if(operation.current?.fingerprint!==fingerprint)operation.current={fingerprint,id:crypto.randomUUID()};
      await uploadRhDocument(actorId,clubId,{employeeId:recipient,operationId:operation.current.id,title,category,...content});
      if(!mounted.current)return;
      setTitle('');setFile(null);operation.current=null;if(fileInput.current)fileInput.current.value='';
      setNotice('Document enregistré dans le dossier du collaborateur.');await reload();
    });
  }
  async function download(doc:RhDocument){
    await run(async()=>{
      const blob=await downloadRhDocument(actorId,clubId,doc);if(!mounted.current)return;
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=doc.fileName;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setNotice('Téléchargement préparé. La prise de connaissance se confirme séparément.');
    });
  }
  const visible=data?.documents.filter(d=>(!folder||d.category===folder)&&[d.title,d.employeeName,d.fileName].join(' ').toLocaleLowerCase('fr-FR').includes(search.toLocaleLowerCase('fr-FR').trim()))??[];
  return <div className="space-y-4 min-w-0">
    <header className="cf-card p-4 space-y-2"><h2 className="font-bold text-xl flex items-center gap-2"><FileText size={20}/>{personal?'Mes fichiers RH':'Documents des collaborateurs'}</h2>
      <p className="cf-muted text-sm">Retrouvez les fichiers du dossier {personal?'personnel':'des collaborateurs autorisés dans ce club'}. La prise de connaissance est un accusé interne, sans signature contractuelle.</p></header>
    {error&&<p role="alert" className="cf-card p-4 text-rose-300">{error}</p>}
    {notice&&<p role="status" className="cf-card p-4 text-emerald-300">{notice}</p>}
    <button disabled={busy} className={button} onClick={()=>void run(()=>reload())}>Actualiser les documents</button>
    {!data&&!error&&<p role="status">Chargement des documents…</p>}
    {data&&<>
      {(personal?data.canUpload:data.employees.length>0)&&<section className="cf-card p-4 space-y-3"><h3 className="font-bold flex gap-2 items-center"><Upload size={16}/>Importer un fichier</h3>
        <fieldset disabled={busy} className="space-y-3">
          {!personal&&<label className="block text-sm">Collaborateur<select className="cf-input w-full p-3 mt-1" value={employee} onChange={e=>setEmployee(e.target.value)}><option value="">Choisir un collaborateur</option>{data.employees.map(e=><option key={e.id} value={e.id} disabled={!e.canUpload}>{e.name}{!e.canUpload?' (import indisponible)':''}</option>)}</select></label>}
          <label className="block text-sm">Titre du document<input className="cf-input w-full p-3 mt-1" maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/></label>
          <label className="block text-sm">Dossier<select className="cf-input w-full p-3 mt-1" value={category} onChange={e=>setCategory(e.target.value)}>{data.categories.map(c=><option key={c}>{c}</option>)}</select></label>
          <label className="block text-sm">Fichier PDF, PNG ou JPEG<input ref={fileInput} className="cf-input w-full min-w-0 p-2 mt-1 text-sm" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e=>{setFile(e.target.files?.[0]??null);operation.current=null;}}/></label>
          <p className="cf-muted text-xs">Un fichier à la fois, 4 Mo maximum. Les fichiers Word et l’import multiple ne sont pas encore disponibles.</p>
          {file&&<p className="text-sm break-all">{file.name} · {Math.ceil(file.size/1024)} Ko</p>}
          <button className="cf-brand-gradient text-white p-3 rounded-lg disabled:opacity-50" disabled={!file||!title.trim()||(!personal&&!employee)} onClick={()=>void upload()}>Importer dans le dossier RH</button>
          {(file||title)&&<button className={button+' ml-2'} onClick={()=>{setTitle('');setFile(null);operation.current=null;if(fileInput.current)fileInput.current.value='';}}>Annuler la saisie</button>}
        </fieldset>
      </section>}
      <section className="cf-card p-4 space-y-3"><h3 className="font-bold">Documents récents</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block text-sm">Rechercher sur cette page<input className="cf-input w-full p-3 mt-1" value={search} onChange={e=>setSearch(e.target.value)}/></label>
          <label className="block text-sm">Filtrer par dossier<select className="cf-input w-full p-3 mt-1" value={folder} onChange={e=>setFolder(e.target.value)}><option value="">Tous les dossiers</option>{data.categories.map(c=><option key={c}>{c}</option>)}</select></label>
        </div>
        {!personal&&<label className="flex gap-2 items-center text-sm"><input disabled={busy} type="checkbox" checked={archived} onChange={e=>{const value=e.target.checked;void run(async()=>{await reload(value);if(mounted.current)setArchived(value);});}}/>Afficher aussi les documents archivés</label>}
        {!visible.length&&<p className="cf-muted">Aucun document correspondant sur cette page.</p>}
        {visible.map(d=><article key={d.id} className="cf-card-secondary rounded-xl p-4 space-y-2 min-w-0">
          <h4 className="font-semibold break-words">{d.title}</h4><p className="cf-muted text-sm">{!personal&&d.employeeName+' · '}{d.category} · {new Date(d.createdAt).toLocaleDateString('fr-FR')}</p>
          <p className="text-xs cf-muted break-all">{d.fileName} · {Math.ceil(d.byteLength/1024)} Ko{d.archivedAt?' · Archivé':''}</p>
          <button disabled={busy} className={button} onClick={()=>void download(d)}><Download size={14} className="inline mr-2"/>Télécharger</button>
          {d.acknowledgedAt?<p className="text-sm text-emerald-300">Prise de connaissance déclarée le {new Date(d.acknowledgedAt).toLocaleString('fr-FR')}</p>:<p className="cf-muted text-sm">Prise de connaissance non confirmée.</p>}
          {personal&&!d.acknowledgedAt&&<div className="space-y-2">
            <label className="flex items-start gap-2 text-sm"><input disabled={busy} type="checkbox" checked={!!consents[d.id]} onChange={e=>setConsents(p=>({...p,[d.id]:e.target.checked}))}/>J’ai pris connaissance de « {d.title} ». Cette confirmation ne signe aucun contrat.</label>
            <button disabled={busy||!consents[d.id]} className={button} onClick={()=>void run(async()=>{const value=await acknowledgeRhDocument(actorId,clubId,d.id);if(mounted.current){setData(value);setNotice('Prise de connaissance enregistrée. Aucune signature contractuelle.');}})}>Confirmer la prise de connaissance</button>
          </div>}
          {!personal&&(confirm===d.id?<div className="space-y-2"><p className="text-sm">{d.archivedAt?'Remettre ce document dans l’espace personnel ?':'Archiver ce document ? Il restera accessible aux responsables autorisés et pourra être restauré.'}</p><div className="flex flex-wrap gap-2"><button disabled={busy} className={button} onClick={()=>void run(async()=>{await archiveRhDocument(actorId,clubId,d.id,!d.archivedAt);if(mounted.current){setConfirm(null);setNotice(d.archivedAt?'Document restauré.':'Document archivé.');}await reload();})}>Confirmer</button><button disabled={busy} className={button} onClick={()=>setConfirm(null)}>Garder en l’état</button></div></div>:<button disabled={busy} className={button+' ml-2'} onClick={()=>setConfirm(d.id)}>{d.archivedAt?'Restaurer le document':'Archiver le document'}</button>)}
        </article>)}
        <div className="flex flex-wrap gap-2"><button disabled={busy} className={button} onClick={()=>void run(()=>reload())}>Documents les plus récents</button>{data.nextCursor&&<button disabled={busy} className={button} onClick={()=>void run(()=>reload(archived,data.nextCursor!))}>Documents plus anciens</button>}</div>
      </section>
    </>}
  </div>;
}
