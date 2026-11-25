import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Download,
  FileCheck2,
  FileWarning,
  Lock,
  Mail,
  Plus,
  RefreshCw,
  Scale,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { useCfos } from '../../context/CfosContext';
import type { ClubId, RecoveryCase, RecoveryCaseStatus } from '../../types/cfos';

async function recoveryFetchJson<T>(
  path: string,
  actorId: string,
  siteId: string,
  init?: RequestInit
): Promise<T> {
  const isDemoMode =
    (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_DEMO_MODE !== 'false';
  const headers = new Headers(init?.headers);
  headers.set('x-cfitness-actor-id', actorId);
  headers.set('x-cfitness-site-id', siteId);
  try {
    const token = window.sessionStorage.getItem('cfos_bearer_token');
    const tokenActor = window.sessionStorage.getItem('cfos_bearer_actor_id');
    if (token && tokenActor === actorId) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  } catch {
    // ignore storage errors
  }
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response = await fetch(path, { ...init, headers });
  if (response.status === 401) {
    // Purge du jeton local (le serveur purge aussi le cookie HttpOnly cfos_session sur cette 401)
    try {
      window.sessionStorage.removeItem('cfos_bearer_token');
      window.sessionStorage.removeItem('cfos_bearer_actor_id');
    } catch {
      // ignore
    }
    headers.delete('Authorization');
    if (isDemoMode) {
      response = await fetch(path, { ...init, headers });
    }
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('cfos-session-expired'));
    }
  }
  if (!response.ok) {
    let errMsg = `Erreur serveur HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload?.error) errMsg = payload.error;
    } catch {
      // garde le message HTTP générique
    }
    throw new Error(errMsg);
  }
  return (await response.json()) as T;
}

const DEFAULT_CGV_SUMMARY = `CONDITIONS GÉNÉRALES DE VENTE — C.FITNESS (Carré de Soie & Beynost)
1. Prélèvement SEPA mensuel : échéance mensuelle automatique. Tout rejet bancaire entraîne la suspension immédiate du droit d'accès aux portillons jusqu'à régularisation complète.
2. Frais de rejet : les frais bancaires de rejet restent à la charge de l'adhérent conformément au mandat SEPA signé.
3. Résiliation / Préavis : toute résiliation doit respecter un préavis contractuel de 2 mois par lettre recommandée ou demande écrite validée, après la période d'engagement initial de 12 mois. Toute révocation unilatérale de mandat SEPA sans respect du préavis rend les mensualités restantes exigibles.
4. Mise en demeure & Contentieux : à défaut de régularisation sous 8 jours après mise en demeure, le dossier complet (contrat, CGV acceptées, historique des mensualités impayées et relances) est transmis à la société de recouvrement / service contentieux.`;

const STATUS_META: Record<
  RecoveryCaseStatus,
  { label: string; badgeCls: string }
> = {
  a_relancer: {
    label: 'À relancer',
    badgeCls: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  },
  mise_en_demeure: {
    label: 'Mise en demeure',
    badgeCls: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  },
  pret_contentieux: {
    label: 'Prêt contentieux',
    badgeCls: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  },
  transmis_contentieux: {
    label: 'Transmis contentieux',
    badgeCls: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
  },
  regularise: {
    label: 'Régularisé',
    badgeCls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  },
};

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

export function RecoveryView() {
  const {
    clubFilter,
    currentUser,
    employees,
    recoveryCases,
    recoveryAuthorizedEmployeeIds,
    canAccessRecovery,
    toggleRecoveryAccess,
    updateRecoveryCaseStatus,
    recordRecoveryRelance,
    themeMode,
  } = useCfos();

  const isDark = themeMode === 'dark';
  const activeSiteId =
    clubFilter === 'beynost' ? 'club-beynost' : 'club-carre-soie';

  const [serverCases, setServerCases] = useState<RecoveryCase[] | null>(null);
  const [loadingCases, setLoadingCases] = useState(false);
  const [loadCasesError, setLoadCasesError] = useState<string | null>(null);
  const [reloadCasesNonce, setReloadCasesNonce] = useState(0);
  const [savingCase, setSavingCase] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState<{
    kind: 'ok' | 'err';
    text: string;
  } | null>(null);
  const [showNewCaseForm, setShowNewCaseForm] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newClubId, setNewClubId] = useState<ClubId>(
    clubFilter === 'beynost' ? 'beynost' : 'carre-de-soie'
  );
  const [newAmount, setNewAmount] = useState('39.90');
  const [newDaysOverdue, setNewDaysOverdue] = useState('15');
  const [newReason, setNewReason] = useState('Rejet prélèvement SEPA');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const [statusFilter, setStatusFilter] = useState<'ALL' | RecoveryCaseStatus>('ALL');
  const [selectedCaseId, setSelectedCaseId] = useState<string>(recoveryCases[0]?.id || '');
  const [showRightsPanel, setShowRightsPanel] = useState(false);
  const [cgvText, setCgvText] = useState(DEFAULT_CGV_SUMMARY);
  const [showCgvEditor, setShowCgvEditor] = useState(false);

  // Ollama local status & chat
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('qwen2.5:3b');
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [checkingOllama, setCheckingOllama] = useState(false);

  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [sendingChat, setSendingChat] = useState(false);

  const checkOllamaStatus = async () => {
    setCheckingOllama(true);
    setOllamaError(null);
    try {
      const data = await recoveryFetchJson<{
        online?: boolean;
        models?: string[];
        defaultModel?: string;
        error?: string;
      }>('/api/ollama/status', currentUser.id, activeSiteId);
      setOllamaOnline(Boolean(data.online));
      const models = Array.isArray(data.models) ? data.models : [];
      setOllamaModels(models);
      if (models.length > 0 && !models.includes(selectedModel)) {
        setSelectedModel(models[0]);
      } else if (data.defaultModel && models.length === 0) {
        setSelectedModel(data.defaultModel);
      }
      if (!data.online && data.error) {
        setOllamaError(data.error);
      }
    } catch {
      setOllamaOnline(false);
      setOllamaError('Impossible de joindre le service local IA.');
    } finally {
      setCheckingOllama(false);
    }
  };

  useEffect(() => {
    void checkOllamaStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (clubFilter === 'beynost' || clubFilter === 'carre-de-soie') {
      setNewClubId(clubFilter);
    }
  }, [clubFilter]);

  useEffect(() => {
    if (!canAccessRecovery) return;
    let cancelled = false;
    setLoadingCases(true);
    setLoadCasesError(null);
    setServerCases(null);
    void recoveryFetchJson<RecoveryCase[]>(
      '/api/recovery/cases',
      currentUser.id,
      activeSiteId
    )
      .then((list) => {
        if (!cancelled && Array.isArray(list)) {
          setServerCases(list);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadCasesError(
            err instanceof Error
              ? err.message
              : 'Impossible de charger les dossiers de recouvrement depuis le serveur.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCases(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser.id, activeSiteId, canAccessRecovery, reloadCasesNonce]);

  const effectiveCases = serverCases ?? (loadCasesError ? [] : recoveryCases);

  const clubCases = useMemo(() => {
    return effectiveCases.filter((rc) =>
      clubFilter === 'all' ? true : rc.clubId === clubFilter
    );
  }, [effectiveCases, clubFilter]);

  const filteredCases = useMemo(() => {
    return clubCases.filter((rc) => {
      if (statusFilter !== 'ALL' && rc.status !== statusFilter) return false;
      return true;
    });
  }, [clubCases, statusFilter]);

  const selectedCase =
    filteredCases.find((c) => c.id === selectedCaseId) ||
    filteredCases[0] ||
    null;

  const activeCases = clubCases.filter((c) => c.status !== 'regularise');
  const totalDueEur = activeCases.reduce((sum, c) => sum + c.amountDueEur, 0);
  const readyForLitigationCount = clubCases.filter(
    (c) => c.status === 'pret_contentieux'
  ).length;

  async function handleChangeCaseStatus(
    caseId: string,
    status: RecoveryCaseStatus,
    note?: string
  ) {
    setRecoveryNotice(null);
    setSavingCase(true);
    try {
      const updated = await recoveryFetchJson<RecoveryCase>(
        `/api/recovery/cases/${encodeURIComponent(caseId)}/status`,
        currentUser.id,
        activeSiteId,
        {
          method: 'PATCH',
          body: JSON.stringify({ status, note }),
        }
      );
      setServerCases((prev) =>
        (prev ?? recoveryCases).map((rc) => (rc.id === updated.id ? updated : rc))
      );
      updateRecoveryCaseStatus(caseId, status, note);
      setRecoveryNotice({
        kind: 'ok',
        text: `Statut mis à jour côté serveur (${STATUS_META[status].label}) pour ${updated.memberName}.`,
      });
    } catch (e) {
      setRecoveryNotice({
        kind: 'err',
        text: e instanceof Error ? e.message : 'Échec mise à jour statut.',
      });
    } finally {
      setSavingCase(false);
    }
  }

  async function handleRecordRelance(caseId: string, note: string) {
    setRecoveryNotice(null);
    setSavingCase(true);
    try {
      const updated = await recoveryFetchJson<RecoveryCase>(
        `/api/recovery/cases/${encodeURIComponent(caseId)}/relance`,
        currentUser.id,
        activeSiteId,
        {
          method: 'POST',
          body: JSON.stringify({ note }),
        }
      );
      setServerCases((prev) =>
        (prev ?? recoveryCases).map((rc) => (rc.id === updated.id ? updated : rc))
      );
      recordRecoveryRelance(caseId, note);
      setRecoveryNotice({
        kind: 'ok',
        text: `Relance #${updated.relanceCount} enregistrée côté serveur pour ${updated.memberName}.`,
      });
    } catch (e) {
      setRecoveryNotice({
        kind: 'err',
        text: e instanceof Error ? e.message : 'Échec enregistrement relance.',
      });
    } finally {
      setSavingCase(false);
    }
  }

  async function handleCreateCase(e: React.FormEvent) {
    e.preventDefault();
    setRecoveryNotice(null);
    const amount = Number.parseFloat(newAmount.replace(',', '.'));
    const days = Number.parseInt(newDaysOverdue, 10);
    if (!newMemberName.trim()) {
      setRecoveryNotice({ kind: 'err', text: 'Indiquez le nom de l’adhérent.' });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setRecoveryNotice({ kind: 'err', text: 'Indiquez un montant dû valide (> 0 €).' });
      return;
    }
    setSavingCase(true);
    try {
      const created = await recoveryFetchJson<RecoveryCase>(
        '/api/recovery/cases',
        currentUser.id,
        activeSiteId,
        {
          method: 'POST',
          body: JSON.stringify({
            memberName: newMemberName.trim(),
            clubId: newClubId,
            amountDueEur: amount,
            daysOverdue: Number.isFinite(days) && days >= 0 ? days : 1,
            unpaidReason: newReason.trim() || 'Rejet prélèvement SEPA',
            phone: newPhone.trim(),
            email: newEmail.trim(),
          }),
        }
      );
      setServerCases((prev) => [created, ...(prev ?? recoveryCases)]);
      setSelectedCaseId(created.id);
      setNewMemberName('');
      setNewPhone('');
      setNewEmail('');
      setShowNewCaseForm(false);
      setRecoveryNotice({
        kind: 'ok',
        text: `Dossier créé et enregistré côté serveur pour ${created.memberName} (${created.amountDueEur.toFixed(2)} €).`,
      });
    } catch (e) {
      setRecoveryNotice({
        kind: 'err',
        text: e instanceof Error ? e.message : 'Échec création dossier.',
      });
    } finally {
      setSavingCase(false);
    }
  }

  if (!canAccessRecovery) {
    return (
      <div className="cf-card p-8 text-center space-y-3">
        <Lock className="w-8 h-8 text-rose-400 mx-auto" />
        <h2 className="text-base font-bold">Accès Recouvrement non attribué</h2>
        <p className="text-xs cf-muted max-w-md mx-auto">
          Votre profil ({currentUser.firstName} {currentUser.lastName}) n&apos;a pas encore le droit
          d&apos;accès au module Recouvrement &amp; Contentieux. Un dirigeant peut vous l&apos;activer en 1 clic.
        </p>
      </div>
    );
  }

  const handleExportWeeklyCsv = () => {
    const exportRows = filteredCases.filter((c) => c.status !== 'regularise');
    const header = [
      'ID',
      'Adherent',
      'Club',
      'Telephone',
      'Email',
      'Montant_Du_EUR',
      'Jours_Retard',
      'Motif_Impaye',
      'Mois_Factures',
      'Contrat_Signe',
      'Piece_ID_RIB',
      'CGV_Acceptees',
      'Pieces_Manquantes',
      'Statut',
      'Nb_Relances',
    ].join(';');

    const lines = exportRows.map((c) =>
      [
        c.id,
        c.memberName,
        c.clubId === 'carre-de-soie' ? 'Carré de Soie' : 'Beynost',
        c.phone,
        c.email,
        c.amountDueEur.toFixed(2),
        String(c.daysOverdue),
        c.unpaidReason.replace(/;/g, ','),
        c.billedMonths.join(' | '),
        c.hasSignedContract ? 'OUI' : 'NON',
        c.hasIdAndRib ? 'OUI' : 'NON',
        c.hasCgvAccepted ? 'OUI' : 'NON',
        c.missingDocs.length > 0 ? c.missingDocs.join(' | ') : 'Aucune',
        STATUS_META[c.status].label,
        String(c.relanceCount),
      ].join(';')
    );

    const blob = new Blob(['\uFEFF' + [header, ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cfitness_contentieux_hebdo_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const askOllamaAgent = async (promptText: string) => {
    if (!selectedCase || !promptText.trim() || sendingChat) return;
    const nextUserMsg: ChatMsg = { role: 'user', content: promptText.trim() };
    const nextHistory = [...chatMessages, nextUserMsg];
    setChatMessages(nextHistory);
    setChatInput('');
    setSendingChat(true);

    const systemPrompt = `Tu es l'assistant juridique et recouvrement interne de C.Fitness (clubs Carré de Soie et Beynost).
Tu réponds toujours en français, de manière claire, professionnelle, ferme mais courtoise, en t'appuyant sur nos CGV.

${cgvText}

DOSSIER ADHÉRENT ACTUEL :
- Nom : ${selectedCase.memberName}
- Club : ${selectedCase.clubId === 'carre-de-soie' ? 'Carré de Soie' : 'Beynost'}
- Formule : ${selectedCase.contractLabel}
- Montant dû : ${selectedCase.amountDueEur.toFixed(2)} €
- Retard : ${selectedCase.daysOverdue} jours
- Motif précis : ${selectedCase.unpaidReason}
- Mois facturés impayés : ${selectedCase.billedMonths.join(', ')}
- Contrat signé présent : ${selectedCase.hasSignedContract ? 'Oui' : 'Non'}
- Pièce d'identité & RIB : ${selectedCase.hasIdAndRib ? 'Oui' : 'Non'}
- CGV acceptées : ${selectedCase.hasCgvAccepted ? 'Oui' : 'Non'}
- Pièces manquantes : ${selectedCase.missingDocs.length > 0 ? selectedCase.missingDocs.join(', ') : 'Aucune'}
- Relances déjà effectuées : ${selectedCase.relanceCount}
- Dernière note : ${selectedCase.lastActionNote}`;

    try {
      const data = await recoveryFetchJson<{
        ok?: boolean;
        reply?: string;
        error?: string;
      }>('/api/ollama/chat', currentUser.id, activeSiteId, {
        method: 'POST',
        body: JSON.stringify({
          model: selectedModel,
          systemPrompt,
          messages: nextHistory,
        }),
      });
      if (data.ok && data.reply) {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: data.reply! }]);
      } else {
        setChatMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Erreur IA locale : ${data.error || 'Aucune réponse reçue d’Ollama.'}`,
          },
        ]);
      }
    } catch (err) {
      const detail =
        err instanceof Error && err.message && !err.message.toLowerCase().includes('failed to fetch')
          ? `Erreur IA locale : ${err.message}`
          : 'Impossible de contacter le serveur Ollama local.';
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: detail,
        },
      ]);
    } finally {
      setSendingChat(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* En-tête + Actions principales */}
      <div className="cf-card p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-rose-600 to-amber-500 text-white flex items-center justify-center shrink-0">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-rose-400">
              Recouvrement &amp; Contentieux · Suivi Impayés Bi-Club
            </div>
            <h1 className="text-lg sm:text-xl font-extrabold mt-0.5">
              Dossiers Impayés, Vérification CGV &amp; Export Contentieux
            </h1>
            <p className="text-xs cf-muted mt-0.5">
              Contrôle des motifs de rejet, pièces du dossier, relances appuyées par nos CGV et export hebdomadaire pour la société de recouvrement.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {currentUser.role === 'admin' && (
            <button
              type="button"
              onClick={() => setShowRightsPanel((v) => !v)}
              className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                showRightsPanel
                  ? 'bg-violet-600 text-white border-violet-500'
                  : isDark
                  ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Droits d&apos;accès ({recoveryAuthorizedEmployeeIds.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowNewCaseForm((v) => !v)}
            className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nouveau dossier</span>
          </button>

          <button
            type="button"
            onClick={handleExportWeeklyCsv}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:brightness-110 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Hebdo Contentieux (CSV)</span>
          </button>
        </div>
      </div>

      {loadCasesError && (
        <div
          role="alert"
          className="p-3.5 rounded-xl border bg-rose-950/40 border-rose-500/40 text-rose-200 text-xs flex flex-wrap items-center justify-between gap-2"
        >
          <span>{loadCasesError}</span>
          <button
            type="button"
            onClick={() => setReloadCasesNonce((n) => n + 1)}
            className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-100 font-semibold cursor-pointer"
          >
            Réessayer
          </button>
        </div>
      )}

      {loadingCases && !loadCasesError && (
        <div role="status" className="p-3 rounded-xl border border-[var(--cf-border)] cf-card-secondary text-xs cf-muted">
          Chargement des dossiers de recouvrement depuis le serveur…
        </div>
      )}

      {recoveryNotice && (
        <div
          role={recoveryNotice.kind === 'err' ? 'alert' : 'status'}
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
            recoveryNotice.kind === 'ok'
              ? 'bg-emerald-950/35 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
          }`}
        >
          {recoveryNotice.kind === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{recoveryNotice.text}</span>
        </div>
      )}

      {showNewCaseForm && (
        <form
          onSubmit={(e) => void handleCreateCase(e)}
          className="cf-card p-4 space-y-3 border border-emerald-500/35 text-xs"
        >
          <div className="font-bold text-sm">Ouvrir un nouveau dossier impayé</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <input
              type="text"
              required
              placeholder="Nom adhérent *"
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              className="cf-input px-3 py-2 sm:col-span-2"
            />
            <select
              value={newClubId}
              onChange={(e) => setNewClubId(e.target.value as ClubId)}
              className="cf-input px-3 py-2"
            >
              <option value="carre-de-soie">Carré de Soie</option>
              <option value="beynost">Beynost</option>
            </select>
            <input
              type="number"
              step="0.01"
              min="1"
              required
              placeholder="Montant €"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              className="cf-input px-3 py-2"
            />
            <input
              type="number"
              min="0"
              placeholder="Retard (j)"
              value={newDaysOverdue}
              onChange={(e) => setNewDaysOverdue(e.target.value)}
              className="cf-input px-3 py-2"
            />
            <input
              type="text"
              placeholder="Téléphone"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="cf-input px-3 py-2"
            />
            <input
              type="email"
              placeholder="Email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="cf-input px-3 py-2 sm:col-span-2"
            />
            <input
              type="text"
              placeholder="Motif impayé (ex: Rejet SEPA AM04)"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              className="cf-input px-3 py-2 sm:col-span-3"
            />
            <button
              type="submit"
              disabled={savingCase}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer disabled:opacity-50"
            >
              {savingCase ? 'Enregistrement...' : 'Créer le dossier'}
            </button>
          </div>
        </form>
      )}

      {/* Panneau d'attribution du droit Recouvrement */}
      {showRightsPanel && currentUser.role === 'admin' && (
        <div className="cf-card p-4 space-y-3 border border-violet-500/40">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-violet-400" />
                Attribution du droit « Recouvrement &amp; Contentieux »
              </h2>
              <p className="text-xs cf-muted">
                Activez ce droit pour les personnes habilitées (Direction, Grégory, associé, responsable accueil…).
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
            {employees
              .filter((e) => e.role !== 'kiosque')
              .map((emp) => {
                const isAdmin = emp.role === 'admin';
                const hasAccess =
                  isAdmin || recoveryAuthorizedEmployeeIds.includes(emp.id);
                return (
                  <button
                    key={emp.id}
                    type="button"
                    disabled={isAdmin}
                    onClick={() => toggleRecoveryAccess(emp.id)}
                    className={`p-3 rounded-xl border text-left flex items-center justify-between gap-2 transition-colors ${
                      isAdmin ? 'opacity-80 cursor-default' : 'cursor-pointer'
                    } ${
                      hasAccess
                        ? isDark
                          ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                          : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                        : isDark
                        ? 'bg-slate-900/50 border-slate-800 text-slate-400'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-bold truncate">
                        {emp.firstName} {emp.lastName}
                      </div>
                      <div className="text-[11px] opacity-75 truncate">{emp.jobTitle}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 bg-black/20">
                      {isAdmin ? 'Admin (Auto)' : hasAccess ? 'Autorisé' : 'Désactivé'}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* KPIs + État IA Locale Ollama */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="cf-card p-4">
          <div className="cf-muted font-medium">Dossiers impayés actifs</div>
          <div className="text-xl font-black mt-1">{activeCases.length}</div>
          <div className="text-[11px] cf-muted mt-0.5">Carré de Soie &amp; Beynost</div>
        </div>
        <div className="cf-card p-4">
          <div className="cf-muted font-medium">Montant total à recouvrer</div>
          <div className="text-xl font-black text-rose-400 mt-1">
            {totalDueEur.toFixed(2)} €
          </div>
          <div className="text-[11px] cf-muted mt-0.5">Hors dossiers régularisés</div>
        </div>
        <div className="cf-card p-4">
          <div className="cf-muted font-medium">Prêts pour contentieux</div>
          <div className="text-xl font-black text-amber-400 mt-1">
            {readyForLitigationCount}
          </div>
          <div className="text-[11px] cf-muted mt-0.5">Dossiers complets (contrat + CGV)</div>
        </div>
        <div className="cf-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="cf-muted font-medium">Agent IA local (Ollama)</span>
            <button
              type="button"
              onClick={() => void checkOllamaStatus()}
              disabled={checkingOllama}
              className="p-1 rounded hover:bg-slate-800 cursor-pointer"
              title="Vérifier la connexion Ollama"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingOllama ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                ollamaOnline ? 'bg-emerald-400' : 'bg-rose-400'
              }`}
            />
            <span className="font-bold text-sm">
              {ollamaOnline === null
                ? 'Vérification...'
                : ollamaOnline
                ? `En ligne (${selectedModel})`
                : 'Hors ligne'}
            </span>
          </div>
          <div className="text-[11px] cf-muted mt-0.5 truncate">
            {ollamaOnline
              ? `${ollamaModels.length} modèle(s) prêt(s) sur le serveur`
              : ollamaError || 'Service Ollama non détecté'}
          </div>
        </div>
      </div>

      {/* Espace principal : Liste dossiers à gauche + Assistant IA Ollama & CGV à droite */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Colonne gauche : Liste & Checklist */}
        <div className="lg:col-span-7 space-y-4">
          <div className="cf-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold">Liste des dossiers ({filteredCases.length})</h2>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {(
                  [
                    ['ALL', 'Tous'],
                    ['a_relancer', 'À relancer'],
                    ['mise_en_demeure', 'Mise en demeure'],
                    ['pret_contentieux', 'Prêt contentieux'],
                    ['transmis_contentieux', 'Transmis'],
                    ['regularise', 'Régularisé'],
                  ] as const
                ).map(([val, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setStatusFilter(val)}
                    className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                      statusFilter === val
                        ? 'bg-violet-600 text-white'
                        : isDark
                        ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5">
              {filteredCases.map((rc) => {
                const active = selectedCase?.id === rc.id;
                const meta = STATUS_META[rc.status];
                return (
                  <div
                    key={rc.id}
                    onClick={() => setSelectedCaseId(rc.id)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-colors space-y-2 ${
                      active
                        ? isDark
                          ? 'bg-violet-950/35 border-violet-500/60'
                          : 'bg-violet-50 border-violet-400'
                        : isDark
                        ? 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-sm">{rc.memberName}</span>
                        <span className="text-xs cf-muted ml-2">
                          {rc.clubId === 'carre-de-soie' ? 'Carré de Soie' : 'Beynost'} ·{' '}
                          {rc.overdueDaysKnown === false
                            ? 'Retard non daté (Heitz)'
                            : `${rc.daysOverdue}j de retard`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-rose-400">
                          {rc.amountDueEur.toFixed(2)} €
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.badgeCls}`}
                        >
                          {meta.label}
                        </span>
                      </div>
                    </div>

                    <div className="text-xs">
                      <span className="font-semibold text-amber-400">Motif :</span>{' '}
                      {rc.unpaidReason}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] cf-muted">
                      <span>
                        Mois facturés :{' '}
                        {rc.billedMonths.length > 0
                          ? rc.billedMonths.join(', ')
                          : 'Non détaillés par Heitz'}
                      </span>
                      <span>·</span>
                      <span>Relances : {rc.relanceCount}</span>
                      {rc.sourceProvenance && (
                        <>
                          <span>·</span>
                          <span>Source : {rc.sourceProvenance}</span>
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                      <span
                        className={`px-2 py-0.5 rounded flex items-center gap-1 ${
                          rc.complianceVerified === false
                            ? 'bg-slate-500/15 text-slate-300'
                            : rc.hasSignedContract
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-rose-500/15 text-rose-300'
                        }`}
                      >
                        <FileCheck2 className="w-3 h-3" />
                        Contrat{' '}
                        {rc.complianceVerified === false
                          ? 'À vérifier'
                          : rc.hasSignedContract
                          ? 'OK'
                          : 'Manquant'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded flex items-center gap-1 ${
                          rc.complianceVerified === false
                            ? 'bg-slate-500/15 text-slate-300'
                            : rc.hasIdAndRib
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-amber-500/15 text-amber-300'
                        }`}
                      >
                        {rc.hasIdAndRib && rc.complianceVerified !== false ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <FileWarning className="w-3 h-3" />
                        )}
                        ID &amp; RIB{' '}
                        {rc.complianceVerified === false
                          ? 'À vérifier'
                          : rc.hasIdAndRib
                          ? 'OK'
                          : 'Manquant'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded flex items-center gap-1 ${
                          rc.complianceVerified === false
                            ? 'bg-slate-500/15 text-slate-300'
                            : rc.hasCgvAccepted
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-rose-500/15 text-rose-300'
                        }`}
                      >
                        CGV{' '}
                        {rc.complianceVerified === false
                          ? 'À vérifier'
                          : rc.hasCgvAccepted
                          ? 'Signées'
                          : 'Manquantes'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Détail dossier sélectionné & changement de statut */}
          {selectedCase && (
            <div className="cf-card p-4 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-sm">
                  Actions sur le dossier : {selectedCase.memberName}
                </h3>
                <span className="cf-muted">{selectedCase.contractLabel}</span>
              </div>
              {selectedCase.missingDocs.length > 0 && (
                <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Pièces à récupérer : {selectedCase.missingDocs.join(', ')}</span>
                </div>
              )}
              <div className="text-xs cf-muted">
                Dernière note : <span className="font-medium">{selectedCase.lastActionNote}</span>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={savingCase}
                  onClick={() =>
                    void handleRecordRelance(
                      selectedCase.id,
                      `Relance email/SMS enregistrée le ${new Date().toLocaleDateString('fr-FR')}.`
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Enregistrer 1 relance</span>
                </button>
                <button
                  type="button"
                  disabled={savingCase}
                  onClick={() =>
                    void handleChangeCaseStatus(
                      selectedCase.id,
                      'mise_en_demeure',
                      'Mise en demeure (délai 8 jours CGV) envoyée.'
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-semibold cursor-pointer disabled:opacity-50"
                >
                  Passer en Mise en demeure
                </button>
                <button
                  type="button"
                  disabled={savingCase}
                  onClick={() =>
                    void handleChangeCaseStatus(
                      selectedCase.id,
                      'pret_contentieux',
                      'Dossier vérifié et prêt pour l’export contentieux hebdomadaire.'
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer disabled:opacity-50"
                >
                  Prêt Contentieux
                </button>
                <button
                  type="button"
                  disabled={savingCase}
                  onClick={() =>
                    void handleChangeCaseStatus(
                      selectedCase.id,
                      'transmis_contentieux',
                      'Dossier transmis à la société de recouvrement.'
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold cursor-pointer disabled:opacity-50"
                >
                  Marquer Transmis
                </button>
                <button
                  type="button"
                  disabled={savingCase}
                  onClick={() =>
                    void handleChangeCaseStatus(
                      selectedCase.id,
                      'regularise',
                      'Impayé régularisé par l’adhérent.'
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer disabled:opacity-50"
                >
                  Régularisé
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Colonne droite : Assistant IA Recouvrement (Ollama local + CGV) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="cf-card p-4 space-y-3 flex flex-col h-full">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--cf-border)]">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-violet-400" />
                <div>
                  <h2 className="text-sm font-bold">Assistant IA Recouvrement (Ollama)</h2>
                  <p className="text-[11px] cf-muted">
                    Connecté à nos CGV &amp; au dossier de {selectedCase?.memberName ?? '—'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="cf-input px-2 py-1 text-[11px]"
                >
                  {ollamaModels.length > 0 ? (
                    ollamaModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))
                  ) : (
                    <option value="qwen2.5:3b">qwen2.5:3b</option>
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => setShowCgvEditor((v) => !v)}
                  className="px-2 py-1 rounded-lg border border-slate-700 text-[11px] hover:bg-slate-800 cursor-pointer"
                >
                  CGV
                </button>
              </div>
            </div>

            {showCgvEditor && (
              <div className="space-y-1.5 text-xs">
                <div className="font-semibold text-violet-300">
                  Base CGV injectée à l&apos;agent local :
                </div>
                <textarea
                  rows={6}
                  value={cgvText}
                  onChange={(e) => setCgvText(e.target.value)}
                  className="cf-input w-full p-2.5 text-[11px]"
                />
              </div>
            )}

            {/* Raccourcis métier 1-clic */}
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <button
                type="button"
                disabled={sendingChat || !selectedCase}
                onClick={() =>
                  void askOllamaAgent(
                    `Rédige un mail de relance amiable court et professionnel pour ${selectedCase?.memberName} concernant son impayé de ${selectedCase?.amountDueEur.toFixed(2)} € (${selectedCase?.unpaidReason}), avec lien de régularisation.`
                  )
                }
                className="px-2.5 py-1.5 rounded-lg bg-violet-600/20 border border-violet-500/40 text-violet-300 hover:bg-violet-600/30 font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3 h-3" />
                <span>Mail relance amiable</span>
              </button>
              <button
                type="button"
                disabled={sendingChat || !selectedCase}
                onClick={() =>
                  void askOllamaAgent(
                    `Rédige une mise en demeure formelle sous 8 jours basée sur nos CGV pour ${selectedCase?.memberName} (${selectedCase?.amountDueEur.toFixed(2)} € sur ${selectedCase?.billedMonths.join(', ')}), motif : ${selectedCase?.unpaidReason}.`
                  )
                }
                className="px-2.5 py-1.5 rounded-lg bg-orange-600/20 border border-orange-500/40 text-orange-300 hover:bg-orange-600/30 font-semibold cursor-pointer disabled:opacity-50"
              >
                Mise en demeure (CGV)
              </button>
              <button
                type="button"
                disabled={sendingChat || !selectedCase}
                onClick={() =>
                  void askOllamaAgent(
                    `Fais une fiche de synthèse claire pour notre société de recouvrement / contentieux sur le dossier de ${selectedCase?.memberName} : montant, motif, pièces présentes/manquantes et arguments CGV.`
                  )
                }
                className="px-2.5 py-1.5 rounded-lg bg-rose-600/20 border border-rose-500/40 text-rose-300 hover:bg-rose-600/30 font-semibold cursor-pointer disabled:opacity-50"
              >
                Synthèse contentieux
              </button>
            </div>

            {/* Historique conversation Ollama */}
            <div className="flex-1 min-h-[260px] max-h-[380px] overflow-y-auto space-y-2.5 p-3 rounded-xl bg-black/20 border border-[var(--cf-border)] text-xs">
              {chatMessages.length === 0 ? (
                <div className="cf-muted text-center py-10 space-y-1">
                  <div>Sélectionne un dossier à gauche puis clique sur un bouton ci-dessus</div>
                  <div>ou pose ta question à l&apos;agent Ollama local.</div>
                </div>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-xl whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-violet-600/25 border border-violet-500/40 ml-6'
                        : 'bg-slate-800/70 border border-slate-700 mr-4'
                    }`}
                  >
                    <div className="text-[10px] font-bold uppercase opacity-70 mb-1">
                      {msg.role === 'user' ? 'Vous' : `Agent Recouvrement (${selectedModel})`}
                    </div>
                    <div>{msg.content}</div>
                    {msg.role === 'assistant' &&
                      selectedCase &&
                      !msg.content.startsWith('Erreur IA locale') &&
                      !msg.content.startsWith('Impossible de contacter') && (
                        <div className="mt-2 pt-2 border-t border-white/10 flex justify-end">
                          <button
                            type="button"
                            disabled={savingCase}
                            onClick={() =>
                              void handleRecordRelance(
                                selectedCase.id,
                                `[IA Ollama] ${msg.content.slice(0, 140).replace(/\s+/g, ' ')}...`
                              )
                            }
                            className="px-2.5 py-1 rounded bg-emerald-600/25 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/35 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                          >
                            Tracer cette réponse en relance
                          </button>
                        </div>
                      )}
                  </div>
                ))
              )}
              {sendingChat && (
                <div className="text-[11px] cf-muted italic">
                  L&apos;agent local ({selectedModel}) rédige la réponse...
                </div>
              )}
            </div>

            {/* Saisie libre */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void askOllamaAgent(chatInput);
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Demander à l'agent (ex: quels arguments CGV si opposition SEPA ?)"
                className="cf-input flex-1 px-3 py-2 text-xs"
              />
              <button
                type="submit"
                disabled={sendingChat || !chatInput.trim()}
                className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Envoyer</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
