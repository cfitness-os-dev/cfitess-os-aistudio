import React, { useState, useEffect } from 'react';
import { ArrowRightLeft, X, AlertCircle, Building2, UserCheck, ShieldCheck } from 'lucide-react';
import type { Prospect, ClubId } from '../types/cfos';
import { formatClubName } from '../domain/rules';
import { transferProspect, type TransferProspectResult } from '../domain/leadPoolApi';

interface LeadTransferModalProps {
  prospect: Prospect | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: TransferProspectResult) => void;
}

export function LeadTransferModal({
  prospect,
  isOpen,
  onClose,
  onSuccess,
}: LeadTransferModalProps) {
  const [targetClubId, setTargetClubId] = useState<ClubId>('beynost');
  const [reason, setReason] = useState<string>('Préférence géographique ou déménagement');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (prospect) {
      const defaultTarget: ClubId =
        prospect.clubId === 'carre-de-soie' ? 'beynost' : 'carre-de-soie';
      setTargetClubId(defaultTarget);
      setReason('Préférence géographique ou déménagement');
      setError(null);
    }
  }, [prospect]);

  if (!isOpen || !prospect) return null;

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prospect) return;
    if (targetClubId === prospect.clubId) {
      setError('Le club de destination doit être différent du club actuel.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await transferProspect(prospect.id, targetClubId, reason);
      onSuccess(result);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Échec du transfert.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="transfer-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden text-slate-800 animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/15">
              <ArrowRightLeft className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 id="transfer-modal-title" className="text-base font-extrabold leading-tight">
                Transfert inter-clubs
              </h2>
              <p className="text-xs text-violet-100">
                {prospect.firstName} {prospect.lastName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleTransfer} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between text-slate-500">
              <span className="font-semibold flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-400" /> Club actuel :
              </span>
              <span className="font-bold text-slate-800">
                {formatClubName(prospect.clubId, true)}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-500">
              <span className="font-semibold flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-slate-400" /> Commercial actuel :
              </span>
              <span className="font-mono text-slate-700">
                {prospect.assignedToId || 'Non assigné'}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="target-club" className="font-bold text-slate-700 block">
              Club de destination :
            </label>
            <select
              id="target-club"
              value={targetClubId}
              onChange={(e) => setTargetClubId(e.target.value as ClubId)}
              disabled={loading}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="carre-de-soie" disabled={prospect.clubId === 'carre-de-soie'}>
                C.Fitness Carré de Soie {prospect.clubId === 'carre-de-soie' ? '(Actuel)' : ''}
              </option>
              <option value="beynost" disabled={prospect.clubId === 'beynost'}>
                C.Fitness Beynost {prospect.clubId === 'beynost' ? '(Actuel)' : ''}
              </option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="transfer-reason" className="font-bold text-slate-700 block">
              Motif du transfert :
            </label>
            <input
              id="transfer-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Demande adhérent, déménagement, proximité travail..."
              disabled={loading}
              required
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div className="p-3 rounded-xl bg-violet-50 border border-violet-200/80 text-[11px] text-violet-900 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
            <div>
              <strong>Règle d&apos;attribution automatique :</strong> Le prospect sera attribué
              au commercial disponible du club cible ayant la charge active la plus basse (ou la date
              de contact la plus ancienne).
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold cursor-pointer transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || targetClubId === prospect.clubId}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-extrabold flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 transition-all"
            >
              {loading ? (
                <>Transfert en cours...</>
              ) : (
                <>
                  <ArrowRightLeft className="w-3.5 h-3.5" /> Confirmer le transfert
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
