import { useEffect, useRef, useState } from 'react';
import type { ScenarioClubId } from '../../domain/leadScenarioDefinitions';
import { validateMessage, type LeadMessage } from '../../domain/leadMessageTemplates';
import { previewScenarioEmail } from '../../domain/leadScenariosApi';
export function EmailDocumentPreview({ actorId, clubId, message }: { actorId: string; clubId: ScenarioClubId; message: LeadMessage }) {
  const [html,setHtml]=useState(''); const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  const request=useRef<AbortController|null>(null);
  useEffect(()=>{ request.current?.abort(); setHtml(''); setError(''); setBusy(false); return ()=>request.current?.abort(); },[actorId,clubId,message]);
  return <div className="space-y-3"><button type="button" className="rounded-lg border border-slate-500/40 px-3 py-2 min-h-[44px] disabled:opacity-40" disabled={busy} onClick={async()=>{
    const errors=validateMessage(message); if(errors.length){setError(errors.join(' '));return;}
    request.current?.abort(); const controller=new AbortController(); request.current=controller; setBusy(true);setError('');
    try { const result=await previewScenarioEmail(actorId,clubId,message,controller.signal);if(!controller.signal.aborted)setHtml(result); }
    catch(err){if(!controller.signal.aborted)setError(err instanceof Error?err.message:'Aperçu indisponible.');}
    finally{if(!controller.signal.aborted)setBusy(false);}
  }}>{busy ? "Préparation de l’aperçu…" : html ? "Actualiser l’aperçu" : "Afficher l’aperçu de l’email"}</button>{!html && !busy && !error && <p className="text-sm cf-muted">Affichez votre email avec un contact fictif pour vérifier sa présentation. Aucun message ne sera envoyé.</p>}{error&&<p role="alert" className="text-rose-400 text-sm">{error}</p>}{html&&<iframe title="Aperçu isolé de l’email composé" sandbox="" referrerPolicy="no-referrer" className="w-full rounded-xl bg-white border border-slate-500/30" style={{height:650}} srcDoc={html}/>}<p className="text-xs cf-muted">Rendu avec données fictives. Liens inactifs, scripts et ressources distantes bloqués ; images intégrées affichées. Vérifiez aussi le rendu chez vos destinataires lors du raccordement du service d’envoi.</p></div>;
}
