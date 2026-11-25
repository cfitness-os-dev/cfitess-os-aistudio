import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileCheck2,
  FileWarning,
  Lock,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Scale,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import { useCfos } from '../../context/CfosContext';
import { RecoveryEvidencePanel } from './RecoveryEvidencePanel';
import { confirmLeadDraftNavigation } from '../../domain/leadDraftGuard';
import { fetchRecoveryEvidence, recoveryFollowupCsv, type RecoveryEvidenceSnapshot } from '../../domain/recoveryEvidence';
import {
  buildClubRecoveryMailto,
  describeMemberRecoveryChannels,
  getClubRecoveryMailbox,
} from '../../domain/recoveryMailto';
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

interface ChatThreadState {
  messages: ChatMsg[];
  updatedAt?: string | null;
  saved: boolean;
}

function isTransientChatNotice(content: string): boolean {
  return (
    content.startsWith('Erreur IA locale') ||
    content.startsWith('Impossible de contacter') ||
    content === 'Génération annulée en cours de route.'
  );
}

function loadLocalChatThreads(actorId: string): Record<string, ChatThreadState> {
  try {
    const raw = window.localStorage.getItem(`cfos_recovery_chat_${actorId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ChatThreadState>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
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
  const [newAmount, setNewAmount] = useState('');
  const [newDaysOverdue, setNewDaysOverdue] = useState('');
  const [newReason, setNewReason] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const [statusFilter, setStatusFilter] = useState<'ALL' | RecoveryCaseStatus>('ALL');
  const [selectedCaseId, setSelectedCaseId] = useState<string>(recoveryCases[0]?.id || '');
  const [showRightsPanel, setShowRightsPanel] = useState(false);
  const [evidenceContext, setEvidenceContext] = useState<RecoveryEvidenceSnapshot | null>(null);
  const [evidenceDraftDirty, setEvidenceDraftDirty] = useState(false);
  const [caseActionReference, setCaseActionReference] = useState('');
  const chatEpoch = useRef(0);
  const chatAbortRef = useRef<AbortController | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const [copiedMsgIdx, setCopiedMsgIdx] = useState<number | null>(null);

  // Ollama local status & chat
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('qwen2.5:3b');
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [checkingOllama, setCheckingOllama] = useState(false);

  const chatNoticeTimerRef = useRef<number | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatStore, setChatStore] = useState<{
    actorId: string;
    threads: Record<string, ChatThreadState>;
  }>(() => ({
    actorId: currentUser.id,
    threads: loadLocalChatThreads(currentUser.id),
  }));
  const [sendingChat, setSendingChat] = useState(false);
  const [savingChat, setSavingChat] = useState(false);
  const [chatNotice, setChatNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const chatThreadsByCase =
    chatStore.actorId === currentUser.id ? chatStore.threads : {};

  useEffect(() => {
    setChatStore((prev) =>
      prev.actorId === currentUser.id
        ? prev
        : {
            actorId: currentUser.id,
            threads: loadLocalChatThreads(currentUser.id),
          }
    );
  }, [currentUser.id]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        `cfos_recovery_chat_${chatStore.actorId}`,
        JSON.stringify(chatStore.threads)
      );
    } catch {
      // ignore storage quota errors
    }
  }, [chatStore]);

  const updateCaseChatThread = (
    caseId: string,
    updater: (prev: ChatThreadState | undefined) => ChatThreadState
  ) => {
    setChatStore((prev) => {
      const baseThreads =
        prev.actorId === currentUser.id
          ? prev.threads
          : loadLocalChatThreads(currentUser.id);
      return {
        actorId: currentUser.id,
        threads: {
          ...baseThreads,
          [caseId]: updater(baseThreads[caseId]),
        },
      };
    });
  };

  const showChatBanner = (kind: 'ok' | 'err', text: string) => {
    setChatNotice({ kind, text });
    if (chatNoticeTimerRef.current !== null) {
      window.clearTimeout(chatNoticeTimerRef.current);
    }
    chatNoticeTimerRef.current = window.setTimeout(() => {
      setChatNotice(null);
      chatNoticeTimerRef.current = null;
    }, 3000);
  };

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

  const selectedChannels = useMemo(
    () => (selectedCase ? describeMemberRecoveryChannels(selectedCase) : null),
    [selectedCase]
  );
  const selectedThread = selectedCase ? chatThreadsByCase[selectedCase.id] : undefined;
  const chatMessages = selectedThread?.messages ?? [];

  useEffect(() => {
    chatEpoch.current += 1;
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    setSendingChat(false);
    setCopiedMsgIdx(null);
    setEvidenceContext(null);
    setCaseActionReference('');
    setChatNotice(null);

    let cancelled = false;
    const caseId = selectedCase?.id;
    if (caseId && canAccessRecovery) {
      void recoveryFetchJson<{
        caseId: string;
        updatedAt?: string;
        messages?: ChatMsg[];
      }>(
        `/api/recovery/cases/${encodeURIComponent(caseId)}/chat`,
        currentUser.id,
        activeSiteId
      )
        .then((serverChat) => {
          if (cancelled || !Array.isArray(serverChat?.messages)) return;
          updateCaseChatThread(caseId, (prev) => {
            if (prev && !prev.saved && prev.messages.length > 0) {
              return prev;
            }
            if (serverChat.messages!.length === 0 && prev && prev.messages.length === 0) {
              return prev;
            }
            return {
              messages: serverChat.messages!,
              updatedAt: serverChat.updatedAt || null,
              saved: true,
            };
          });
        })
        .catch(() => {
          // Conserve le cache local en cas d'indisponibilité réseau ponctuelle
        });
    }

    return () => {
      cancelled = true;
      chatAbortRef.current?.abort();
      chatAbortRef.current = null;
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
      if (chatNoticeTimerRef.current !== null) {
        window.clearTimeout(chatNoticeTimerRef.current);
        chatNoticeTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCase?.id, currentUser.id, activeSiteId, canAccessRecovery]);

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
            ...(Number.isFinite(days) && days >= 0 ? {daysOverdue:days} : {}),
            unpaidReason: newReason.trim() || undefined,
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
    const csv = recoveryFollowupCsv(exportRows);

    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cfitness_suivi_impayes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cancelOllamaAgent = () => {
    if (!chatAbortRef.current) return;
    chatAbortRef.current.abort();
    chatAbortRef.current = null;
  };

  const copyAssistantReply = async (idx: number, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMsgIdx(idx);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedMsgIdx((prev) => (prev === idx ? null : prev));
        copyTimerRef.current = null;
      }, 2000);
    } catch {
      // Clipboard indisponible hors contexte sécurisé : ignore silencieusement
    }
  };

  const persistChatToServer = async (
    caseId: string,
    messagesToSave: ChatMsg[],
    showBanner: boolean
  ) => {
    const cleanMessages = messagesToSave
      .filter((m) => !isTransientChatNotice(m.content) && m.content.trim().length > 0)
      .slice(-50);
    setSavingChat(true);
    try {
      const saved = await recoveryFetchJson<{
        caseId: string;
        updatedAt?: string;
        messages?: ChatMsg[];
      }>(
        `/api/recovery/cases/${encodeURIComponent(caseId)}/chat`,
        currentUser.id,
        activeSiteId,
        {
          method: 'PUT',
          body: JSON.stringify({ messages: cleanMessages }),
        }
      );
      updateCaseChatThread(caseId, () => ({
        messages: Array.isArray(saved.messages) ? saved.messages : cleanMessages,
        updatedAt: saved.updatedAt || null,
        saved: true,
      }));
      if (showBanner) {
        showChatBanner('ok', 'Conversation enregistrée sur le serveur.');
      }
    } catch (err) {
      if (showBanner) {
        showChatBanner(
          'err',
          err instanceof Error ? err.message : 'Échec de l’enregistrement du chat.'
        );
      }
    } finally {
      setSavingChat(false);
    }
  };

  const clearCaseChat = async (caseId: string) => {
    cancelOllamaAgent();
    setSavingChat(true);
    try {
      await recoveryFetchJson(
        `/api/recovery/cases/${encodeURIComponent(caseId)}/chat`,
        currentUser.id,
        activeSiteId,
        {
          method: 'PUT',
          body: JSON.stringify({ messages: [] }),
        }
      );
      updateCaseChatThread(caseId, () => ({
        messages: [],
        updatedAt: null,
        saved: true,
      }));
      showChatBanner('ok', 'Chat effacé pour ce dossier.');
    } catch (err) {
      showChatBanner(
        'err',
        err instanceof Error ? err.message : 'Impossible d’effacer le chat côté serveur.'
      );
    } finally {
      setSavingChat(false);
    }
  };

  const askOllamaAgent = async (promptText: string) => {
    if (!selectedCase || !promptText.trim() || sendingChat) return;
    const targetCase = selectedCase;
    const currentMessages = chatThreadsByCase[targetCase.id]?.messages ?? [];
    const nextUserMsg: ChatMsg = { role: 'user', content: promptText.trim() };
    const nextHistory = [...currentMessages, nextUserMsg];
    updateCaseChatThread(targetCase.id, (prev) => ({
      messages: nextHistory,
      updatedAt: prev?.updatedAt ?? null,
      saved: false,
    }));
    setChatInput('');
    setSendingChat(true);

    const epoch = chatEpoch.current;
    chatAbortRef.current?.abort();
    const controller = new AbortController();
    chatAbortRef.current = controller;

    try {
      const context = await fetchRecoveryEvidence(currentUser.id, targetCase.id, targetCase.clubId);
      if (chatEpoch.current !== epoch) return;
      if (controller.signal.aborted) {
        updateCaseChatThread(targetCase.id, (prev) => ({
          messages: [
            ...(prev?.messages ?? nextHistory),
            { role: 'assistant', content: 'Génération annulée en cours de route.' },
          ],
          updatedAt: prev?.updatedAt ?? null,
          saved: false,
        }));
        return;
      }
      const apiMessages = nextHistory
        .filter((m) => !isTransientChatNotice(m.content))
        .slice(-20);
      const data = await recoveryFetchJson<{
        ok?: boolean;
        reply?: string;
        error?: string;
      }>('/api/ollama/chat', currentUser.id, activeSiteId, {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({
          model: selectedModel,
          recoveryCaseId: targetCase.id,
          expectedCaseRevision: context.revision,
          messages: apiMessages,
        }),
      });
      if (chatEpoch.current !== epoch) return;
      if (data.ok && data.reply) {
        const finalHistory: ChatMsg[] = [
          ...nextHistory,
          { role: 'assistant', content: data.reply },
        ];
        updateCaseChatThread(targetCase.id, (prev) => ({
          messages: finalHistory,
          updatedAt: prev?.updatedAt ?? null,
          saved: false,
        }));
        void persistChatToServer(targetCase.id, finalHistory, false);
      } else {
        updateCaseChatThread(targetCase.id, (prev) => ({
          messages: [
            ...(prev?.messages ?? nextHistory),
            {
              role: 'assistant',
              content: `Erreur IA locale : ${data.error || 'Aucune réponse reçue d’Ollama.'}`,
            },
          ],
          updatedAt: prev?.updatedAt ?? null,
          saved: false,
        }));
      }
    } catch (error) {
      if (chatEpoch.current !== epoch) return;
      const isAbort =
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError');
      updateCaseChatThread(targetCase.id, (prev) => ({
        messages: [
          ...(prev?.messages ?? nextHistory),
          {
            role: 'assistant',
            content: isAbort
              ? 'Génération annulée en cours de route.'
              : error instanceof Error
                ? error.message
                : 'L’assistant n’a pas pu relire les données du dossier.',
          },
        ],
        updatedAt: prev?.updatedAt ?? null,
        saved: false,
      }));
    } finally {
      if (chatAbortRef.current === controller) {
        chatAbortRef.current = null;
      }
      if (chatEpoch.current === epoch) setSendingChat(false);
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
              Suivi des impayés et préparation des dossiers
            </h1>
            <p className="text-xs cf-muted mt-0.5">
              Contrôle des motifs de rejet, pièces du dossier, suivi des échanges, références documentaires et export de travail pour la société de recouvrement.
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
            <span>Exporter le suivi des impayés</span>
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
          <div className="text-[11px] cf-muted mt-0.5">Dossiers classés prêts — pièces à relire</div>
        </div>
        <div className="cf-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="cf-muted font-medium">Assistant de préparation</span>
            <button
              type="button"
              onClick={() => void checkOllamaStatus()}
              disabled={checkingOllama}
              className="p-1 rounded hover:bg-slate-800 cursor-pointer"
              title="Vérifier la connexion de l’assistant"
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
              : ollamaError || 'Assistant indisponible'}
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
                const channels = describeMemberRecoveryChannels(rc);
                const caseChatCount = chatThreadsByCase[rc.id]?.messages.length ?? 0;
                return (
                  <div
                    key={rc.id}
                    onClick={() => { const action = () => setSelectedCaseId(rc.id); if (confirmLeadDraftNavigation(action)) action(); }}
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
                          {rc.overdueDaysKnown !== true
                            ? 'Retard à vérifier'
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

                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span
                        className={`px-2 py-0.5 rounded flex items-center gap-1 ${
                          channels.emailDeliverable
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : channels.emailMasked
                            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-500/15 text-slate-300 border border-slate-500/30'
                        }`}
                      >
                        <Mail className="w-3 h-3 shrink-0" />
                        <span>
                          {channels.emailDeliverable
                            ? `Mail : ${channels.emailLabel}`
                            : channels.emailMasked
                            ? `Mail masqué : ${channels.emailLabel}`
                            : 'Aucun e-mail'}
                        </span>
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded flex items-center gap-1 ${
                          channels.phoneDeliverable
                            ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                            : channels.phoneMasked
                            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-500/15 text-slate-300 border border-slate-500/30'
                        }`}
                      >
                        <Phone className="w-3 h-3 shrink-0" />
                        <span>
                          {channels.phoneDeliverable
                            ? `Tél / SMS : ${channels.phoneLabel}`
                            : channels.phoneMasked
                            ? `Tél masqué : ${channels.phoneLabel}`
                            : 'Aucun téléphone'}
                        </span>
                      </span>
                      {caseChatCount > 0 && (
                        <span className="px-2 py-0.5 rounded flex items-center gap-1 bg-violet-500/15 text-violet-300 border border-violet-500/30">
                          <MessageSquare className="w-3 h-3 shrink-0" />
                          <span>Chat IA ({caseChatCount} msg)</span>
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] cf-muted">
                      <span>
                        Mois facturés :{' '}
                        {rc.billedMonths.length > 0
                          ? rc.billedMonths.join(', ')
                          : 'À retrouver auprès de la source'}
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
                          rc.complianceVerified !== true
                            ? 'bg-slate-500/15 text-slate-300'
                            : rc.hasSignedContract
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-rose-500/15 text-rose-300'
                        }`}
                      >
                        <FileCheck2 className="w-3 h-3" />
                        Contrat{' '}
                        {rc.complianceVerified !== true
                          ? 'À vérifier'
                          : rc.hasSignedContract
                          ? 'Déclaré présent'
                          : 'Manquant'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded flex items-center gap-1 ${
                          rc.complianceVerified !== true
                            ? 'bg-slate-500/15 text-slate-300'
                            : rc.hasIdAndRib
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-amber-500/15 text-amber-300'
                        }`}
                      >
                        {rc.hasIdAndRib && rc.complianceVerified === true ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <FileWarning className="w-3 h-3" />
                        )}
                        ID &amp; RIB{' '}
                        {rc.complianceVerified !== true
                          ? 'À vérifier'
                          : rc.hasIdAndRib
                          ? 'Déclaré présent'
                          : 'Manquant'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded flex items-center gap-1 ${
                          rc.complianceVerified !== true
                            ? 'bg-slate-500/15 text-slate-300'
                            : rc.hasCgvAccepted
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-rose-500/15 text-rose-300'
                        }`}
                      >
                        CGV{' '}
                        {rc.complianceVerified !== true
                          ? 'À vérifier'
                          : rc.hasCgvAccepted
                          ? 'Déclarées · preuve à contrôler'
                          : 'Manquantes'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Détail dossier sélectionné & changement de statut */}
          {selectedCase && <RecoveryEvidencePanel key={`${currentUser.id}:${selectedCase.id}:${selectedCase.status}:${selectedCase.relanceCount}:${selectedCase.lastActionNote}`} actorId={currentUser.id} caseId={selectedCase.id} club={selectedCase.clubId} onContext={setEvidenceContext} onDirtyChanged={setEvidenceDraftDirty} />}
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
              <label className="block">Référence et date de la démarche réellement effectuée<input className="cf-input w-full p-2 min-h-[44px]" value={caseActionReference} onChange={e => setCaseActionReference(e.target.value)} /></label>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={savingCase || evidenceDraftDirty || !evidenceContext?.canEdit || evidenceContext.followupPaused || !caseActionReference.trim()}
                  onClick={() =>
                    void handleRecordRelance(
                      selectedCase.id,
                      caseActionReference.trim()
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Consigner une relance déjà effectuée</span>
                </button>
                <button
                  type="button"
                  disabled={savingCase || evidenceDraftDirty || !evidenceContext?.canEdit || evidenceContext.followupPaused || !caseActionReference.trim()}
                  onClick={() =>
                    void handleChangeCaseStatus(
                      selectedCase.id,
                      'mise_en_demeure',
                      caseActionReference.trim()
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-semibold cursor-pointer disabled:opacity-50"
                >
                  Consigner une mise en demeure effectuée
                </button>
                <button
                  type="button"
                  disabled={savingCase || evidenceDraftDirty || !evidenceContext?.canEdit || !evidenceContext.documented || !caseActionReference.trim()}
                  onClick={() =>
                    void handleChangeCaseStatus(
                      selectedCase.id,
                      'pret_contentieux',
                      caseActionReference.trim()
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer disabled:opacity-50"
                >
                  Prêt Contentieux
                </button>
                <button
                  type="button"
                  disabled={savingCase || evidenceDraftDirty || !evidenceContext?.canEdit || !evidenceContext.documented || !caseActionReference.trim()}
                  onClick={() =>
                    void handleChangeCaseStatus(
                      selectedCase.id,
                      'transmis_contentieux',
                      caseActionReference.trim()
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold cursor-pointer disabled:opacity-50"
                >
                  Consigner une transmission effectuée
                </button>
                <button
                  type="button"
                  disabled={savingCase || evidenceDraftDirty || !evidenceContext?.canEdit || !caseActionReference.trim()}
                  onClick={() =>
                    void handleChangeCaseStatus(
                      selectedCase.id,
                      'regularise',
                      caseActionReference.trim()
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
                  <h2 className="text-sm font-bold">Assistant recouvrement</h2>
                  <p className="text-[11px] cf-muted">
                    Dossier de {selectedCase?.memberName ?? '—'}
                    {selectedCase
                      ? ` · Boîte mail club : ${getClubRecoveryMailbox(selectedCase.clubId).clubEmail}`
                      : ''}
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
              </div>
            </div>
            <p className="text-xs cf-muted">
              Périmètre strict C.Fitness OS &amp; droit général du recouvrement. L’assistant relit les données du serveur sans inventer de clause CGV.
            </p>

            {selectedCase && selectedChannels && (
              <div className="p-2.5 rounded-xl border border-[var(--cf-border)] cf-card-secondary text-[11px] space-y-1.5">
                <div className="font-semibold text-xs flex flex-wrap items-center justify-between gap-2">
                  <span>Canaux de contact adhérent</span>
                  <span className="text-[11px] text-violet-300 font-semibold">
                    {selectedChannels.recommendedChannelLabel}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`px-2 py-0.5 rounded flex items-center gap-1 ${
                      selectedChannels.emailDeliverable
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : selectedChannels.emailMasked
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'bg-slate-500/15 text-slate-300'
                    }`}
                  >
                    <Mail className="w-3 h-3 shrink-0" />
                    <span>
                      {selectedChannels.emailDeliverable
                        ? `Mail : ${selectedChannels.emailLabel} (envoi club prêt)`
                        : selectedChannels.emailMasked
                        ? `Mail masqué (${selectedChannels.emailLabel})`
                        : 'Mail : indisponible'}
                    </span>
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded flex items-center gap-1 ${
                      selectedChannels.phoneDeliverable
                        ? 'bg-sky-500/15 text-sky-300'
                        : selectedChannels.phoneMasked
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'bg-slate-500/15 text-slate-300'
                    }`}
                  >
                    <Phone className="w-3 h-3 shrink-0" />
                    <span>
                      {selectedChannels.phoneDeliverable
                        ? `Tél / SMS : ${selectedChannels.phoneLabel}`
                        : selectedChannels.phoneMasked
                        ? `Tél masqué (${selectedChannels.phoneLabel})`
                        : 'Tél / SMS : indisponible'}
                    </span>
                  </span>
                </div>
              </div>
            )}

            {/* Raccourcis métier 1-clic */}
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <button
                type="button"
                disabled={sendingChat || !selectedCase || !evidenceContext || evidenceContext.followupPaused}
                onClick={() =>
                  void askOllamaAgent(
                    `Rédige un mail de relance amiable court et professionnel pour ${selectedCase?.memberName} concernant son impayé de ${selectedCase?.amountDueEur.toFixed(2)} € (${selectedCase?.unpaidReason}), sans inventer de lien de paiement, de clause ou de frais.`
                  )
                }
                className="px-2.5 py-1.5 rounded-lg bg-violet-600/20 border border-violet-500/40 text-violet-300 hover:bg-violet-600/30 font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3 h-3" />
                <span>Mail relance amiable</span>
              </button>
              <button
                type="button"
                disabled={sendingChat || !selectedCase || !evidenceContext || evidenceContext.followupPaused}
                onClick={() =>
                  void askOllamaAgent(
                    `Rédige un SMS court et courtois (maximum 320 caractères) pour ${selectedCase?.memberName} concernant son impayé de ${selectedCase?.amountDueEur.toFixed(2)} € (${selectedCase?.unpaidReason}), en l'invitant à contacter le club, sans inventer de lien ni de frais.`
                  )
                }
                className="px-2.5 py-1.5 rounded-lg bg-sky-600/20 border border-sky-500/40 text-sky-300 hover:bg-sky-600/30 font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <Phone className="w-3 h-3" />
                <span>SMS / Message court</span>
              </button>
              <button
                type="button"
                disabled={sendingChat || !selectedCase || !evidenceContext || evidenceContext.followupPaused}
                onClick={() =>
                  void askOllamaAgent(
                    `Prépare les points à vérifier avant une démarche formelle pour ${selectedCase?.memberName} (${selectedCase?.amountDueEur.toFixed(2)} € sur ${selectedCase?.billedMonths.join(', ')}), motif : ${selectedCase?.unpaidReason}.`
                  )
                }
                className="px-2.5 py-1.5 rounded-lg bg-orange-600/20 border border-orange-500/40 text-orange-300 hover:bg-orange-600/30 font-semibold cursor-pointer disabled:opacity-50"
              >
                Vérifier avant démarche formelle
              </button>
              <button
                type="button"
                disabled={sendingChat || !selectedCase}
                onClick={() =>
                  void askOllamaAgent(
                    `Fais une fiche de synthèse claire pour notre société de recouvrement / contentieux sur le dossier de ${selectedCase?.memberName} : montant, motif, pièces présentes/manquantes et références documentaires vérifiées, sans inventer de clause.`
                  )
                }
                className="px-2.5 py-1.5 rounded-lg bg-rose-600/20 border border-rose-500/40 text-rose-300 hover:bg-rose-600/30 font-semibold cursor-pointer disabled:opacity-50"
              >
                Synthèse contentieux
              </button>
            </div>

            {/* Barre de sauvegarde / effacement du chat par dossier */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex flex-wrap items-center gap-2 cf-muted">
                <span>
                  {chatMessages.length} message(s) sur ce dossier
                </span>
                {chatMessages.length > 0 && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      selectedThread?.saved
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {selectedThread?.saved
                      ? selectedThread.updatedAt
                        ? `Enregistré (${new Date(selectedThread.updatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})`
                        : 'Enregistré'
                      : 'Modification locale non enregistrée'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={
                    !selectedCase ||
                    savingChat ||
                    sendingChat ||
                    chatMessages.filter((m) => !isTransientChatNotice(m.content)).length === 0
                  }
                  onClick={() =>
                    selectedCase && void persistChatToServer(selectedCase.id, chatMessages, true)
                  }
                  className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3 h-3" />
                  <span>{savingChat ? 'Enregistrement...' : 'Enregistrer'}</span>
                </button>
                <button
                  type="button"
                  disabled={!selectedCase || savingChat || chatMessages.length === 0}
                  onClick={() => selectedCase && void clearCaseChat(selectedCase.id)}
                  className="px-2.5 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Effacer le chat</span>
                </button>
              </div>
            </div>

            {chatNotice && (
              <div
                role={chatNotice.kind === 'err' ? 'alert' : 'status'}
                className={`px-3 py-2 rounded-xl border text-[11px] flex items-center gap-1.5 ${
                  chatNotice.kind === 'ok'
                    ? 'bg-emerald-950/35 border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                }`}
              >
                {chatNotice.kind === 'ok' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                )}
                <span>{chatNotice.text}</span>
              </div>
            )}

            {/* Historique conversation Ollama (hauteur doublée vers le bas) */}
            <div className="flex-1 min-h-[520px] max-h-[760px] overflow-y-auto space-y-2.5 p-3 rounded-xl bg-black/20 border border-[var(--cf-border)] text-xs">
              {chatMessages.length === 0 ? (
                <div className="cf-muted text-center py-16 space-y-1">
                  <div>Sélectionne un dossier à gauche puis clique sur un bouton ci-dessus</div>
                  <div>ou pose ta question sur ce dossier, C.Fitness OS ou les règles générales du recouvrement.</div>
                </div>
              ) : (
                chatMessages.map((msg, idx) => {
                  const isErrorOrCancel = isTransientChatNotice(msg.content);
                  const mailto =
                    msg.role === 'assistant' && !isErrorOrCancel && selectedCase
                      ? buildClubRecoveryMailto({
                          clubId: selectedCase.clubId,
                          recipientEmail: selectedCase.email,
                          memberName: selectedCase.memberName,
                          body: msg.content,
                          followupPaused: Boolean(evidenceContext?.followupPaused),
                        })
                      : null;
                  const disabledMailReason = evidenceContext?.followupPaused
                    ? 'Envoi bloqué (dossier suspendu)'
                    : 'E-mail adhérent indisponible';
                  return (
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
                      {msg.role === 'assistant' && !isErrorOrCancel && (
                        <div className="mt-2 pt-2 border-t border-white/10 space-y-2">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => void copyAssistantReply(idx, msg.content)}
                              className="px-2.5 py-1 rounded bg-slate-700/70 hover:bg-slate-700 border border-slate-600 text-slate-100 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              {copiedMsgIdx === idx ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span>Copié !</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copier</span>
                                </>
                              )}
                            </button>
                            {mailto ? (
                              <a
                                href={mailto.href}
                                title={`Ouvrir dans votre messagerie (${mailto.clubEmail}) vers ${mailto.recipientEmail}`}
                                className="px-2.5 py-1 rounded bg-blue-600/25 hover:bg-blue-600/35 border border-blue-500/40 text-blue-200 text-[11px] font-semibold inline-flex items-center gap-1"
                              >
                                <Mail className="w-3 h-3" />
                                <span>Envoyer par mail ({mailto.clubEmail})</span>
                              </a>
                            ) : (
                              <button
                                type="button"
                                disabled
                                className="px-2.5 py-1 rounded bg-slate-800/70 border border-slate-700 text-slate-400 text-[11px] inline-flex items-center gap-1 opacity-60 cursor-not-allowed"
                              >
                                <Mail className="w-3 h-3" />
                                <span>{disabledMailReason}</span>
                              </button>
                            )}
                          </div>
                          <p className="cf-muted text-[11px]">
                            Brouillon à relire. L’ouverture dans la messagerie du club ne consigne aucun envoi ni relance effectuée.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              {sendingChat && (
                <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-800/60 border border-slate-700 text-[11px] cf-muted italic">
                  <span>L&apos;agent local ({selectedModel}) rédige la réponse...</span>
                  <button
                    type="button"
                    onClick={cancelOllamaAgent}
                    className="not-italic px-2 py-1 rounded bg-rose-600/25 hover:bg-rose-600/40 border border-rose-500/40 text-rose-200 font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <XCircle className="w-3 h-3" />
                    <span>Annuler</span>
                  </button>
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
                placeholder="Poser une question sur le dossier, C.Fitness OS ou le recouvrement..."
                className="cf-input flex-1 px-3 py-2 text-xs"
              />
              {sendingChat ? (
                <button
                  type="button"
                  onClick={cancelOllamaAgent}
                  className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Annuler</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!chatInput.trim() || !selectedCase}
                  className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Envoyer</span>
                </button>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
