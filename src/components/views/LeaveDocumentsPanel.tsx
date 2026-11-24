import { useEffect, useRef, useState } from 'react';
import type { HRDocument } from '../../types/cfos';
import type { LeavePolicy } from '../../domain/hrLeaveRules';
import { useLeadDraftGuard } from '../useLeadDraftGuard';
export function LeaveDocumentsPanel({ policy, documents, busy, onSave }: {
    policy: LeavePolicy;
    documents: HRDocument[];
    busy: boolean;
    onSave: (ids: string[], revision: string) => Promise<boolean>;
}) {
    const [base, setBase] = useState(policy);
    const [selected, setSelected] = useState(policy.documentIds);
    const ownSave = useRef(false);
    useEffect(() => { if (ownSave.current) {
        setBase(policy);
        setSelected(policy.documentIds);
        ownSave.current = false;
    } }, [policy]);
    const dirty = JSON.stringify([...selected].sort()) !== JSON.stringify([...base.documentIds].sort());
    const stale = base.requestRevision !== policy.requestRevision;
    useLeadDraftGuard(dirty);
    const options = documents.filter(doc => doc.category === 'Attestation');
    return <div className="space-y-2 mt-3">
    <h4 className="font-semibold">Justificatifs de cette demande</h4>
    <p className="text-sm cf-muted">Sélectionnez une attestation déjà présente dans vos documents. Pour ajouter un nouveau fichier, contactez votre responsable.</p>
    {!options.length && <p>Aucune attestation disponible dans votre dossier.</p>}
    {stale && <p role="alert">La demande a changé. Reprenez les pièces actuelles avant de les modifier.</p>}
    <fieldset disabled={busy || stale} className="space-y-2">
      <legend className="sr-only">Attestations à joindre</legend>
      {options.map(doc => <label key={doc.id} className="flex gap-3 items-start min-h-[44px]"><input type="checkbox" className="mt-1" checked={selected.includes(doc.id)} onChange={e => setSelected(e.target.checked ? [...selected, doc.id] : selected.filter(id => id !== doc.id))}/><span>{doc.title}</span></label>)}
    </fieldset>
    <div className="flex flex-wrap gap-2">
      <button type="button" className="cf-brand-gradient text-white min-h-[44px] px-3 rounded-xl disabled:opacity-50" disabled={busy || stale || !dirty || selected.length > 10} onClick={async () => { ownSave.current = true; if (!await onSave(selected, base.requestRevision))
        ownSave.current = false; }}>Enregistrer les justificatifs sélectionnés</button>
      {(dirty || stale) && <button type="button" disabled={busy} className="cf-card-secondary min-h-[44px] px-3 rounded-xl" onClick={() => { setBase(policy); setSelected(policy.documentIds); }}>Reprendre les pièces actuelles</button>}
    </div>
  </div>;
}
