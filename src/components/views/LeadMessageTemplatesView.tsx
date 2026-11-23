import { EmailBlocksEditor } from './EmailBlocksEditor';
import { EmailDocumentPreview } from './EmailDocumentPreview';
import { createEmailBlock, type EmailDocument } from '../../domain/leadEmailBlocks';
import { EmailLayoutEditor, EmailLayoutPreview } from './MessageEmailLayout';
import { useEffect, useRef, useState } from 'react';
import type { ScenarioClubId } from '../../domain/leadScenarioDefinitions';
import { MESSAGE_VARIABLES, EXAMPLE_VALUES, estimateSms, renderMessage, validateMessage, type LeadMessage, type LeadMessageTemplate } from '../../domain/leadMessageTemplates';
import { newScenarioOperationId, scenarioRequest, type ScenarioCommand, type ScenarioWorkspace } from '../../domain/leadScenariosApi';

const input = 'w-full rounded-lg border border-slate-500/40 bg-transparent px-3 py-2 min-h-[44px]';
const button = 'rounded-lg border border-slate-500/40 px-3 py-2 min-h-[44px] text-sm disabled:opacity-40';
const fresh = (): LeadMessage => ({ name: '', channel: 'email', subject: '', body: '' });
export function LeadMessageTemplatesView({ actorId, clubId }: { actorId: string; clubId: ScenarioClubId | null }) {
  const [workspace, setWorkspace] = useState<ScenarioWorkspace | null>(null);
  const [selected, setSelected] = useState<LeadMessageTemplate | null>(null);
  const [draft, setDraft] = useState<LeadMessage>(fresh);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mediaBusy,setMediaBusy]=useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState('all');
  const [archived, setArchived] = useState(false);
  const [destination, setDestination] = useState<ScenarioClubId>(clubId === 'beynost' ? 'carre-de-soie' : 'beynost');
  const [tagTarget, setTagTarget] = useState<'body' | 'subject'>('body');
  const request = useRef<AbortController | null>(null);
  const retry = useRef<{ body: string; id: string } | null>(null);
  const act = async (command?: ScenarioCommand) => {
    if (!clubId) return;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); setNotice('');
    const body = command ? JSON.stringify(command) : '';
    if (command && retry.current?.body !== body) retry.current = { body, id: newScenarioOperationId() };
    try {
      const data = await scenarioRequest(actorId, clubId, command, retry.current?.id, controller.signal);
      if (controller.signal.aborted) return;
      setWorkspace(data); retry.current = null;
      if (command?.action === 'save_template') {
        const saved = data.templates.find(t => t.id === (command.templateId ?? data.commandResult?.templateId));
        if (saved) { setSelected(saved); setDraft(structuredClone(saved.message)); setDirty(false); }
      } else if (selected && !dirty) {
        const current = data.templates.find(t => t.id === selected.id) ?? null;
        setSelected(current); if (current) setDraft(structuredClone(current.message));
      }
      if (command) setNotice(command.action === 'copy_template' ? 'Copie enregistrée dans le club choisi.' : 'Modèle enregistré sur le serveur. Les versions déjà publiées de vos scénarios restent inchangées.');
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Enregistrement non confirmé. La saisie est conservée.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  useEffect(() => { void act(); return () => request.current?.abort(); }, [actorId, clubId]);
  const open = (template: LeadMessageTemplate | null) => {
    if (dirty && !window.confirm('Abandonner les modifications non enregistrées ?')) return;
    setSelected(template); setDraft(template ? structuredClone(template.message) : fresh()); setEditing(true); setDirty(false); setError(''); setNotice(''); retry.current = null;
  };
  const edit = (patch: Partial<LeadMessage>) => { setDraft(d => ({ ...d, ...patch })); setDirty(true); setNotice(''); };
  const rendered = renderMessage(draft.body, EXAMPLE_VALUES);
  const subject = renderMessage(draft.subject, EXAMPLE_VALUES);
  const sms = estimateSms(rendered.text);
  if (!clubId) return <div className="cf-card p-4">Choisissez un club pour consulter ses modèles.</div>;
  return <section aria-label="Modèles de messages" aria-busy={busy} className="space-y-4">
    <header className="cf-card p-4 flex flex-wrap justify-between gap-3"><div><h2 className="font-bold text-lg">Modèles de messages</h2><p className="text-sm cf-muted">{clubId === 'beynost' ? 'Beynost' : 'Carré de Soie'} · Emails, SMS et WhatsApp réutilisables dans vos scénarios.</p></div><div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => void act()}>Actualiser les modèles</button><button className={button} disabled={busy || !workspace} onClick={() => open(null)}>Créer un modèle</button></div></header>
    {error && <p role="alert" className="p-3 border border-rose-500 rounded-lg text-rose-400">{error}</p>}{notice && <p role="status" className="p-3 border border-emerald-500 rounded-lg text-emerald-400">{notice}</p>}
    <p className="text-sm cf-muted">Aucun envoi depuis cet écran. Un modèle WhatsApp enregistré ici ne constitue pas une approbation Meta.</p>
    {workspace && <div className="grid xl:grid-cols-[minmax(220px,1fr)_minmax(0,3fr)] gap-4">
      <aside className="cf-card p-4 space-y-3"><label className="block text-sm">Rechercher un modèle<input className={input} value={search} onChange={e => setSearch(e.target.value)} /></label><label className="block text-sm">Canal<select className={input} value={channel} onChange={e => setChannel(e.target.value)}><option value="all">Tous les canaux</option><option value="email">Email</option><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option></select></label><label className="flex gap-2 text-sm items-center"><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} />Inclure les modèles archivés</label>{workspace.templates.filter(t => (archived || !t.archived) && (channel === 'all' || t.message.channel === channel) && t.message.name.toLowerCase().includes(search.toLowerCase())).map(t => <button key={t.id} className={`${button} block w-full text-left ${selected?.id === t.id ? 'border-violet-500 bg-violet-500/10' : ''}`} disabled={busy} onClick={() => open(t)}><strong className="block break-words">{t.message.name}</strong><span className="text-xs cf-muted">{t.message.channel === 'email' ? 'Email' : t.message.channel === 'sms' ? 'SMS' : 'WhatsApp'} · Version {t.revision}{t.archived ? ' · Archivé' : ''}</span></button>)}{!workspace.templates.length && <p className="text-sm cf-muted">Aucun modèle enregistré pour ce club.</p>}</aside>
      {!editing ? <div className="cf-card p-5">Ouvrez un modèle ou créez-en un.</div> : <div className="min-w-0 space-y-4"><div className="cf-card p-4 space-y-4"><h3 className="font-bold">{selected ? 'Modifier le modèle' : 'Nouveau modèle'}{dirty ? ' · Non enregistré' : ''}</h3><fieldset disabled={busy || selected?.archived} className="space-y-3"><label className="block text-sm">Nom du modèle<input className={input} value={draft.name} maxLength={120} onChange={e => edit({ name: e.target.value })} /></label><label className="block text-sm">Canal du modèle<select className={input} disabled={!!selected} value={draft.channel} onChange={e => edit({ channel: e.target.value as LeadMessage['channel'], subject: e.target.value === 'email' ? draft.subject : '', emailLayout: e.target.value === 'email' ? draft.emailLayout : null, emailDocument: e.target.value === 'email' ? draft.emailDocument : null })}><option value="email">Email</option><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option></select></label>{draft.channel === 'email' && <label className="block text-sm">Objet de l’email<input className={input} value={draft.subject} maxLength={200} onChange={e => edit({ subject: e.target.value })} /></label>}{draft.channel === 'email' && !draft.emailDocument && <button type="button" className={button} onClick={() => { const document: EmailDocument = { version: 1, blocks: [] }; const add = (text: string) => { if (text) { const b = createEmailBlock('texte', newScenarioOperationId()); b.text = text; b.style.font = draft.emailLayout?.font ?? 'Arial'; document.blocks.push(b); } }; add(draft.emailLayout?.heading ?? ''); add(draft.body); if(draft.emailLayout?.buttonUrl){const b=createEmailBlock('bouton',newScenarioOperationId());b.label=draft.emailLayout.buttonLabel;b.url=draft.emailLayout.buttonUrl;document.blocks.push(b);} add(draft.emailLayout?.footer ?? ''); if(!document.blocks.length)document.blocks.push(createEmailBlock('texte',newScenarioOperationId())); edit({emailDocument:document,emailLayout:null,body:'Email composé de blocs'}); }}>Utiliser l’éditeur à 12 blocs</button>}
        {draft.emailDocument ? <EmailBlocksEditor onMediaBusyChange={setMediaBusy} document={draft.emailDocument} onChange={emailDocument => edit({emailDocument,body:'Email composé de blocs'})} /> : <><label className="block text-sm">Contenu du modèle<textarea className={input} rows={7} maxLength={20000} value={draft.body} onChange={e => edit({body:e.target.value})}/></label>{draft.channel==='email' && <EmailLayoutEditor layout={draft.emailLayout??null} onChange={emailLayout=>edit({emailLayout})}/>}<label className="block text-sm">Insérer une variable dans<select className={input} value={tagTarget} onChange={e=>setTagTarget(e.target.value as 'body'|'subject')}><option value="body">Le message</option>{draft.channel==='email'&&<option value="subject">L’objet</option>}</select></label><div className="flex flex-wrap gap-2">{MESSAGE_VARIABLES.map(tag=><button key={tag} type="button" className={button} onClick={()=>{const target=draft.channel==='email'?tagTarget:'body';edit({[target]:draft[target]+`%${tag}%`});}}>%{tag}%</button>)}</div></>}<button className={`${button} bg-violet-600 text-white`} disabled={mediaBusy} onClick={() => { const issues = validateMessage(draft); if (issues.length) setError(issues.join(' ')); else void act({ action: 'save_template', templateId: selected?.id ?? null, expectedRevision: selected?.revision ?? null, message: draft }); }}>Enregistrer le modèle</button></fieldset>
        {selected && <div className="flex flex-wrap gap-2 items-end"><button className={button} disabled={busy || dirty} onClick={() => { setSelected(null); setDraft({ ...draft, name: (draft.name + ' (copie)').slice(0, 120) }); setDirty(true); }}>Dupliquer ce modèle</button><label className="text-sm">Copier le modèle vers<select className={input} value={destination} onChange={e => setDestination(e.target.value as ScenarioClubId)}><option value="carre-de-soie">Carré de Soie</option><option value="beynost">Beynost</option></select></label><button className={button} disabled={busy || dirty} onClick={() => void act({ action: 'copy_template', templateId: selected.id, destinationClubId: destination })}>Copier le modèle</button><button className={button} disabled={busy || dirty || selected.archived} onClick={() => { if (window.confirm('Archiver ce modèle ? Les parcours déjà publiés gardent leur contenu.')) void act({ action: 'archive_template', templateId: selected.id, expectedRevision: selected.revision }); }}>Archiver le modèle</button></div>}</div>
        <div className="cf-card p-4 space-y-3"><h3 className="font-bold">Aperçu avec données fictives</h3><p className="text-xs cf-muted">Exemple de présentation uniquement. Une variable indisponible pour le vrai contact empêchera la simulation du message.</p>{draft.channel === 'email' && <p className="font-semibold break-words">{subject.text}</p>}{draft.emailDocument ? <EmailDocumentPreview actorId={actorId} clubId={clubId} message={draft} /> : draft.channel === 'email' ? <EmailLayoutPreview message={draft} /> : <pre className="whitespace-pre-wrap break-words font-sans text-sm">{rendered.text}</pre>}{[...subject.missing, ...rendered.missing].length > 0 && <p className="text-amber-500">Variables inconnues : {[...subject.missing, ...rendered.missing].join(', ')}</p>}{draft.channel === 'sms' && <p className="text-sm">Estimation sur cet exemple : {sms.units} unités · {sms.encoding} · {sms.segments} segment(s). Le coût réel et les variables dépendent du fournisseur.</p>}</div>
      </div>}
    </div>}
  </section>;
}
