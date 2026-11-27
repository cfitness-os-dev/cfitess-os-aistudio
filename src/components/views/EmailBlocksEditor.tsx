import { messageVariableLabel } from '../../domain/messageVariableLabels';
import { useEffect, useRef, useState } from 'react';
import { createEmailBlock, type EmailBlock, type EmailBlockKind, type EmailDocument } from '../../domain/leadEmailBlocks';
import { LEAD_EMAIL_BLOCKS_12, LEAD_EMAIL_FONTS_18 } from '../../domain/leadAuditRegistry';
import { MESSAGE_VARIABLES } from '../../domain/leadMessageTemplates';
import { newScenarioOperationId } from '../../domain/leadScenariosApi';
import { MAX_EMAIL_IMAGE_BYTES, validateImageImport } from '../../domain/leadEmailImages';
const input = 'w-full rounded-lg border border-slate-500/40 bg-transparent px-3 py-2 min-h-[44px]';
const button = 'rounded-lg border border-slate-500/40 px-3 py-2 min-h-[44px] text-sm disabled:opacity-40';
export function EmailBlocksEditor({ document, onChange, onMediaBusyChange }: { document: EmailDocument; onChange: (doc: EmailDocument) => void; onMediaBusyChange?: (busy:boolean)=>void }) {
  const [addKind, setAddKind] = useState<EmailBlockKind>('texte');
  const [selected, setSelected] = useState(document.blocks[0]?.id ?? '');
  const [error, setError] = useState('');
  const [uploading,setUploading]=useState(false);
  const current = useRef<EmailDocument | null>(document); current.current = document;
  useEffect(() => () => { current.current = null; onMediaBusyChange?.(false); }, []);
  const selectedId = document.blocks.some(b=>b.id===selected) ? selected : document.blocks[0]?.id ?? '';
  const index = document.blocks.findIndex(b=>b.id===selectedId);
  const block = document.blocks[index];
  const update = (patch: Partial<EmailBlock>) => onChange({ ...document, blocks: document.blocks.map(b=>b.id===selectedId ? { ...b, ...patch } : b) });
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    if (!['image/png','image/jpeg'].includes(file.type) || file.size > MAX_EMAIL_IMAGE_BYTES) { setError('Choisissez une image JPEG ou PNG de 2 Mo maximum.'); return; }
    const before = document;
    setUploading(true);onMediaBusyChange?.(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (current.current !== before) return;
      const invalid = validateImageImport(before, selectedId, file.type, bytes);
      if (invalid) { setError(invalid); return; }
      const value = await new Promise<string>((resolve,reject)=>{ const reader=new FileReader(); reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):reject(new Error()); reader.onerror=()=>reject(new Error()); reader.readAsDataURL(file); });
      await new Promise<void>((resolve,reject)=>{ const image=new Image(); image.onload=()=>image.naturalWidth > 0 && image.naturalHeight > 0 ? resolve() : reject(new Error()); image.onerror=()=>reject(new Error()); image.src=value; });
      if (current.current !== before) return;
      update({ image: value });
    } catch { if (current.current === before) setError('Impossible de lire cette image.'); }
    finally { if(current.current)setUploading(false);onMediaBusyChange?.(false); }
  };
  const addBlock = (kind: EmailBlockKind) => {
    if (document.blocks.length >= 100) return;
    const block = createEmailBlock(kind, newScenarioOperationId());
    onChange({ ...document, blocks: [...document.blocks, block] });
    setSelected(block.id);
  };
  const move = (direction: number) => { const blocks=[...document.blocks]; [blocks[index],blocks[index+direction]]=[blocks[index+direction],blocks[index]]; onChange({ ...document, blocks }); };
  return <div className="space-y-4" aria-label="Éditeur email à douze blocs">
    <h3 className="font-semibold">Composer votre email</h3>
    <div className="sm:hidden space-y-2">
      <label className="block text-sm">Type de bloc à ajouter
        <select className={input} value={addKind} disabled={document.blocks.length>=100} onChange={event=>setAddKind(event.target.value as EmailBlockKind)}>
          {LEAD_EMAIL_BLOCKS_12.map(meta=><option key={meta.id} value={meta.id}>{meta.label}</option>)}
        </select>
      </label>
      <button type="button" className={button+" w-full"} disabled={document.blocks.length>=100} onClick={()=>addBlock(addKind)}>Ajouter le bloc</button>
    </div>
    <div className="hidden sm:flex flex-wrap gap-2">{LEAD_EMAIL_BLOCKS_12.map(meta=><button type="button" key={meta.id} className={button} disabled={document.blocks.length>=100} onClick={()=>addBlock(meta.id as EmailBlockKind)}>Ajouter : {meta.label}</button>)}</div>
    <p className="text-xs cf-muted">Images intégrées : JPEG/PNG, 2 Mo au total. Les images distantes ne sont pas chargées automatiquement dans l’aperçu. Les marges et propriétés sont réglées bloc par bloc.</p>
    {error && <p role="alert" className="text-rose-400">{error}</p>}
    <ol className="space-y-2">{document.blocks.map((b,i)=><li key={b.id}><button type="button" className={`${button} w-full text-left ${selectedId===b.id?'border-violet-500 bg-violet-500/10':''}`} onClick={()=>setSelected(b.id)}>{i+1}. {LEAD_EMAIL_BLOCKS_12.find(m=>m.id===b.kind)?.label} {b.text ? `— ${b.text.slice(0,50)}` : ''}</button></li>)}</ol>
    {block && <fieldset className="space-y-3 rounded-xl border border-slate-500/30 p-3"><legend className="font-semibold px-1">Propriétés du bloc {index+1}</legend><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={index===0} onClick={()=>move(-1)}>Monter le bloc</button><button type="button" className={button} disabled={index===document.blocks.length-1} onClick={()=>move(1)}>Descendre le bloc</button><button type="button" className={button} disabled={document.blocks.length>=100} onClick={()=>{ const b={...structuredClone(block),id:newScenarioOperationId()}; const blocks=[...document.blocks]; blocks.splice(index+1,0,b); onChange({ ...document,blocks }); setSelected(b.id); }}>Dupliquer le bloc</button><button type="button" className={button} onClick={()=>{ onChange({ ...document,blocks:document.blocks.filter(b=>b.id!==selectedId) }); setSelected(document.blocks[index-1]?.id??document.blocks[index+1]?.id??''); }}>Supprimer le bloc</button></div>
      {['texte','pied','image_texte','fond_image'].includes(block.kind) && <><label className="block text-sm">Texte du bloc<textarea className={input} rows={5} maxLength={20000} value={block.text} onChange={e=>update({text:e.target.value})} /></label><details className="cf-card-secondary rounded-xl p-3"><summary className="cursor-pointer text-sm font-semibold">Personnaliser le texte</summary><div className="flex flex-wrap gap-1 mt-3">{MESSAGE_VARIABLES.map(tag=><button type="button" key={tag} className={button} onClick={()=>update({text:block.text+`%${tag}%`})}>{messageVariableLabel(tag)}</button>)}</div></details></>}
      {['bouton'].includes(block.kind) && <label className="block text-sm">Libellé du bouton<input className={input} maxLength={120} value={block.label} onChange={e=>update({label:e.target.value})} /></label>}
      {['bouton','entete','image'].includes(block.kind) && <label className="block text-sm">Lien du bloc (HTTPS ou variable URL)<input className={input} maxLength={2000} value={block.url} onChange={e=>update({url:e.target.value})} /></label>}
      {['image','entete','image_texte','fond_image'].includes(block.kind) && <><label className="block text-sm">Adresse de l’image (HTTPS)<input className={input} maxLength={2000} value={block.image.startsWith('data:')?'':block.image} onChange={e=>update({image:e.target.value})} /></label><label className="block text-sm">Importer une image JPEG ou PNG<input className={input} type="file" disabled={uploading} accept="image/png,image/jpeg" onChange={e=>{ const file=e.currentTarget.files?.[0]; e.currentTarget.value=""; void upload(file); }} /></label>{block.image.startsWith('data:') && <p className="text-xs cf-muted">Image intégrée au document. Elle sera enregistrée avec le modèle.</p>}<label className="block text-sm">Description de l’image<input className={input} maxLength={300} value={block.alt} onChange={e=>update({alt:e.target.value})} /></label><label className="block text-sm">Largeur de l’image<input className={input} type="number" min={1} max={1200} value={block.style.imageWidth} onChange={e=>update({style:{...block.style,imageWidth:Number(e.target.value)}})} /></label></>}
      {block.kind==='image_texte' && <label className="block text-sm">Position de l’image<select className={input} value={block.style.imagePosition} onChange={e=>update({style:{...block.style,imagePosition:e.target.value as 'left'|'right'}})}><option value="left">À gauche du texte</option><option value="right">À droite du texte</option></select></label>}
      {block.kind==='html' && <><label className="block text-sm">Contenu HTML<textarea className={`${input} font-mono`} rows={8} maxLength={20000} value={block.html} onChange={e=>update({html:e.target.value})} /></label><p className="text-xs cf-muted">Scripts, formulaires, styles et attributs non autorisés sont retirés du rendu. L’aperçu est isolé de l’application.</p></>}
      {['navbar','reseaux'].includes(block.kind) && <div className="space-y-2"><h4 className="text-sm font-semibold">Liens du bloc</h4>{block.links.map((link,i)=><div key={i} className="space-y-2 border border-slate-500/30 rounded-lg p-2"><label className="block text-sm">Libellé du lien {i+1}<input className={input} maxLength={120} value={link.label} onChange={e=>update({links:block.links.map((v,j)=>j===i?{...v,label:e.target.value}:v)})} /></label><label className="block text-sm">Adresse du lien {i+1}<input className={input} maxLength={2000} value={link.url} onChange={e=>update({links:block.links.map((v,j)=>j===i?{...v,url:e.target.value}:v)})} /></label><button type="button" className={button} onClick={()=>update({links:block.links.filter((_,j)=>j!==i)})}>Retirer le lien {i+1}</button></div>)}<button type="button" className={button} disabled={block.links.length>=10} onClick={()=>update({links:[...block.links,{label:'',url:''}]})}>Ajouter un lien</button></div>}
      {block.kind==='pied' && <p className="text-xs cf-muted">Le lien de désabonnement exige l’adresse propre au destinataire. Tant que le service n’est pas raccordé, l’aperçu utilise un exemple et le moteur exclut un message sans cette adresse.</p>}
      <details className="cf-card-secondary rounded-xl p-3"><summary className="cursor-pointer text-sm font-semibold">Mise en forme et marges du bloc</summary><div className="mt-3 space-y-3">
      <div className="grid sm:grid-cols-2 gap-3"><label className="block text-sm">Police du bloc<select className={input} value={block.style.font} onChange={e=>update({style:{...block.style,font:e.target.value}})}>{LEAD_EMAIL_FONTS_18.map(font=><option key={font}>{font}</option>)}</select></label><label className="block text-sm">Taille du texte<input className={input} type="number" min={8} max={72} value={block.style.fontSize} onChange={e=>update({style:{...block.style,fontSize:Number(e.target.value)}})} /></label><label className="block text-sm">Alignement<select className={input} value={block.style.align} onChange={e=>update({style:{...block.style,align:e.target.value as 'left'|'center'|'right'}})}><option value="left">Gauche</option><option value="center">Centre</option><option value="right">Droite</option></select></label><label className="block text-sm">Arrondi<input className={input} type="number" min={0} max={100} value={block.style.radius} onChange={e=>update({style:{...block.style,radius:Number(e.target.value)}})} /></label><label className="block text-sm">Couleur du texte<input type="color" className={input} value={block.style.textColor} onChange={e=>update({style:{...block.style,textColor:e.target.value}})} /></label><label className="block text-sm">Couleur du fond<input type="color" className={input} value={block.style.backgroundColor} onChange={e=>update({style:{...block.style,backgroundColor:e.target.value}})} /></label>{['espace','fond_image'].includes(block.kind) && <label className="block text-sm">Hauteur du bloc<input className={input} type="number" min={0} max={600} value={block.style.height} onChange={e=>update({style:{...block.style,height:Number(e.target.value)}})} /></label>}{block.kind==='separateur' && <label className="block text-sm">Épaisseur du séparateur<input className={input} type="number" min={0} max={20} value={block.style.thickness} onChange={e=>update({style:{...block.style,thickness:Number(e.target.value)}})} /></label>}</div>
      <fieldset><legend className="text-sm">Marges intérieures</legend><div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{['Haut','Droite','Bas','Gauche'].map((label,i)=><label key={label} className="text-sm">{label}<input type="number" className={input} min={0} max={100} value={block.style.padding[i]} onChange={e=>{ const padding=[...block.style.padding] as EmailBlock['style']['padding']; padding[i]=Number(e.target.value); update({style:{...block.style,padding}}); }} /></label>)}</div></fieldset>
      </div></details>
    </fieldset>}
  </div>;
}
