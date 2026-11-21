import { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Cpu,
  RefreshCw,
  Save,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useCfos } from '../context/CfosContext';
import type { Site } from '../domain/types';

interface OllamaStatusPayload {
  online: boolean;
  baseUrl: string;
  defaultModel: string;
  models: string[];
  error?: string;
}

function buildAuthHeaders(actorId: string, siteId: string): Record<string, string> {
  const headers: Record<string, string> = {
    'x-cfitness-actor-id': actorId,
    'x-cfitness-site-id': siteId,
  };
  try {
    const token = window.sessionStorage.getItem('cfos_bearer_token');
    const tokenActor = window.sessionStorage.getItem('cfos_bearer_actor_id');
    if (token && tokenActor === actorId) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // ignore storage errors
  }
  return headers;
}

async function fetchAdminSiteJson<T>(
  path: string,
  actorId: string,
  siteId: string,
  init?: RequestInit
): Promise<T> {
  const headers = new Headers(init?.headers);
  const authHeaders = buildAuthHeaders(actorId, siteId);
  Object.entries(authHeaders).forEach(([k, v]) => headers.set(k, v));
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response = await fetch(path, { ...init, headers });
  if (response.status === 401 && headers.has('Authorization')) {
    try {
      window.sessionStorage.removeItem('cfos_bearer_token');
      window.sessionStorage.removeItem('cfos_bearer_actor_id');
    } catch {
      // ignore
    }
    headers.delete('Authorization');
    response = await fetch(path, { ...init, headers });
  }

  if (!response.ok) {
    let errMsg = `Erreur serveur HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload?.error) errMsg = payload.error;
    } catch {
      // keep default HTTP message
    }
    throw new Error(errMsg);
  }
  return (await response.json()) as T;
}

export function ClubAndAiSettingsPanel() {
  const { currentUser, clubFilter, themeMode } = useCfos();
  const isDark = themeMode === 'dark';
  const activeSiteId = clubFilter === 'beynost' ? 'club-beynost' : 'club-carre-soie';

  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>(activeSiteId);
  const [draftSite, setDraftSite] = useState<Site | null>(null);
  const [loadingSites, setLoadingSites] = useState(false);
  const [savingSite, setSavingSite] = useState(false);
  const [siteStatus, setSiteStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatusPayload | null>(null);
  const [loadingOllama, setLoadingOllama] = useState(false);
  const [testingOllama, setTestingOllama] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [aiTestResult, setAiTestResult] = useState<{
    ok: boolean;
    latencyMs: number;
    text: string;
  } | null>(null);

  async function loadSites() {
    setLoadingSites(true);
    try {
      const list = await fetchAdminSiteJson<Site[]>(
        '/api/admin/sites',
        currentUser.id,
        activeSiteId
      );
      setSites(list);
      const current = list.find((s) => s.id === selectedSiteId) ?? list[0] ?? null;
      if (current) {
        setSelectedSiteId(current.id);
        setDraftSite(structuredClone(current));
      }
    } catch (e) {
      setSiteStatus({
        kind: 'err',
        text: e instanceof Error ? e.message : 'Erreur de lecture des établissements.',
      });
    } finally {
      setLoadingSites(false);
    }
  }

  async function loadOllamaStatus() {
    setLoadingOllama(true);
    try {
      const res = await fetch('/api/ollama/status');
      const data = (await res.json()) as OllamaStatusPayload;
      setOllamaStatus(data);
      setSelectedModel((prev) => prev || data.defaultModel || data.models?.[0] || 'qwen2.5:3b');
    } catch (e) {
      setOllamaStatus({
        online: false,
        baseUrl: 'http://host.docker.internal:11434',
        defaultModel: 'qwen2.5:3b',
        models: [],
        error: e instanceof Error ? e.message : 'Service Ollama injoignable',
      });
    } finally {
      setLoadingOllama(false);
    }
  }

  useEffect(() => {
    void loadSites();
    void loadOllamaStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, activeSiteId]);

  function handleSelectSite(nextId: string) {
    setSelectedSiteId(nextId);
    setSiteStatus(null);
    const match = sites.find((s) => s.id === nextId);
    if (match) {
      setDraftSite(structuredClone(match));
    }
  }

  async function handleSaveSite() {
    if (!draftSite) return;
    setSiteStatus(null);
    setSavingSite(true);
    try {
      const updated = await fetchAdminSiteJson<Site>(
        `/api/admin/sites/${encodeURIComponent(draftSite.id)}`,
        currentUser.id,
        activeSiteId,
        {
          method: 'PUT',
          body: JSON.stringify({
            name: draftSite.name,
            address: draftSite.address,
            city: draftSite.city,
            siret: draftSite.siret,
            dayStartHour: draftSite.settings.dayStartHour,
            breakAlertHours: draftSite.settings.breakAlertHours,
            breakAlertEnabled: draftSite.settings.breakAlertEnabled,
            consecutiveDaysBlocking: draftSite.settings.consecutiveDaysBlocking,
            complementaryMaxHours: draftSite.settings.complementaryMaxHours,
            missionsModuleActive: draftSite.settings.missionsModuleActive,
            reportRulesVisible: draftSite.settings.reportRulesVisible,
          }),
        }
      );
      setSites((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setDraftSite(structuredClone(updated));
      setSiteStatus({
        kind: 'ok',
        text: `Paramètres enregistrés côté serveur pour « ${updated.name} ».`,
      });
    } catch (e) {
      setSiteStatus({
        kind: 'err',
        text: e instanceof Error ? e.message : 'Impossible d’enregistrer l’établissement.',
      });
    } finally {
      setSavingSite(false);
    }
  }

  async function handleTestAi() {
    setTestingOllama(true);
    setAiTestResult(null);
    const t0 = performance.now();
    try {
      const res = await fetch('/api/ollama/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel || undefined,
          systemPrompt: 'Tu es l’assistant local C.Fitness OS. Réponds en français en une phrase courte.',
          messages: [{ role: 'user', content: 'Confirme que tu es prêt pour aider sur les clubs Carré de Soie et Beynost.' }],
        }),
      });
      const data = (await res.json()) as { ok?: boolean; reply?: string; error?: string };
      const latencyMs = Math.round(performance.now() - t0);
      if (data.ok && data.reply) {
        setAiTestResult({ ok: true, latencyMs, text: data.reply });
      } else {
        setAiTestResult({
          ok: false,
          latencyMs,
          text: data.error || 'Aucune réponse renvoyée par Ollama.',
        });
      }
    } catch (e) {
      setAiTestResult({
        ok: false,
        latencyMs: Math.round(performance.now() - t0),
        text: e instanceof Error ? e.message : 'Erreur réseau vers Ollama.',
      });
    } finally {
      setTestingOllama(false);
    }
  }

  const cardCls = `rounded-2xl border p-5 space-y-4 ${
    isDark
      ? 'bg-[#151A2A] border-slate-800 text-slate-100'
      : 'bg-white border-slate-200/80 text-slate-900'
  }`;

  const subBoxCls = `rounded-xl border p-3.5 ${
    isDark
      ? 'bg-slate-900/60 border-slate-800'
      : 'bg-slate-50 border-slate-200'
  }`;

  const inputCls = `w-full rounded-lg border px-3 py-2 text-xs outline-none focus:border-violet-500 ${
    isDark
      ? 'bg-slate-900 border-slate-700 text-slate-100'
      : 'bg-white border-slate-300 text-slate-900'
  }`;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {/* Section 1 : Identité & règles par club */}
      <div className={cardCls}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold flex items-center gap-2">
              <Building2 className="w-4 h-4 text-violet-400" />
              <span>Paramètres des établissements</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Éditez les coordonnées réelles et les règles RH/pointage propres à Carré de Soie et Beynost.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {sites.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSelectSite(s.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  selectedSiteId === s.id
                    ? 'bg-violet-600 text-white'
                    : isDark
                    ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {s.id === 'club-carre-soie' ? 'Carré de Soie' : 'Beynost'}
              </button>
            ))}
          </div>
        </div>

        {siteStatus && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              siteStatus.kind === 'ok'
                ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300'
                : 'bg-red-500/10 border-red-500/35 text-red-300'
            }`}
          >
            {siteStatus.kind === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 shrink-0" />
            )}
            <span>{siteStatus.text}</span>
          </div>
        )}

        {loadingSites || !draftSite ? (
          <div className="text-xs text-slate-400 py-4">Chargement des établissements...</div>
        ) : (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-slate-400">Nom du club</span>
                <input
                  type="text"
                  value={draftSite.name}
                  onChange={(e) => setDraftSite({ ...draftSite, name: e.target.value })}
                  className={inputCls}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-slate-400">SIRET</span>
                <input
                  type="text"
                  value={draftSite.siret}
                  onChange={(e) => setDraftSite({ ...draftSite, siret: e.target.value })}
                  className={inputCls}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-slate-400">Adresse</span>
                <input
                  type="text"
                  value={draftSite.address}
                  onChange={(e) => setDraftSite({ ...draftSite, address: e.target.value })}
                  className={inputCls}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-slate-400">Ville</span>
                <input
                  type="text"
                  value={draftSite.city}
                  onChange={(e) => setDraftSite({ ...draftSite, city: e.target.value })}
                  className={inputCls}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block space-y-1">
                <span className="text-slate-400">Début de journée (HH:MM)</span>
                <input
                  type="text"
                  value={draftSite.settings.dayStartHour}
                  onChange={(e) =>
                    setDraftSite({
                      ...draftSite,
                      settings: { ...draftSite.settings, dayStartHour: e.target.value },
                    })
                  }
                  className={inputCls}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-slate-400">Seuil alerte pause (h)</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={draftSite.settings.breakAlertHours}
                  onChange={(e) =>
                    setDraftSite({
                      ...draftSite,
                      settings: {
                        ...draftSite.settings,
                        breakAlertHours: Number(e.target.value) || 4,
                      },
                    })
                  }
                  className={inputCls}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-slate-400">Plafond heures compl. (h)</span>
                <input
                  type="number"
                  min={1}
                  max={48}
                  value={draftSite.settings.complementaryMaxHours}
                  onChange={(e) =>
                    setDraftSite({
                      ...draftSite,
                      settings: {
                        ...draftSite.settings,
                        complementaryMaxHours: Number(e.target.value) || 35,
                      },
                    })
                  }
                  className={inputCls}
                />
              </label>
            </div>

            <div className={`${subBoxCls} grid grid-cols-1 sm:grid-cols-2 gap-2.5`}>
              {[
                { key: 'breakAlertEnabled' as const, label: 'Alerte pause activée' },
                { key: 'consecutiveDaysBlocking' as const, label: 'Blocage jours consécutifs' },
                { key: 'missionsModuleActive' as const, label: 'Module Missions actif' },
                { key: 'reportRulesVisible' as const, label: 'Règles visibles sur rapports' },
              ].map((toggle) => (
                <label key={toggle.key} className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftSite.settings[toggle.key]}
                    onChange={(e) =>
                      setDraftSite({
                        ...draftSite,
                        settings: {
                          ...draftSite.settings,
                          [toggle.key]: e.target.checked,
                        },
                      })
                    }
                    className="accent-violet-500"
                  />
                  <span>{toggle.label}</span>
                </label>
              ))}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => void handleSaveSite()}
                disabled={savingSite}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingSite ? 'Enregistrement...' : 'Enregistrer ce club'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Section 2 : Assistant IA local (Ollama) */}
      <div className={cardCls}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              <span>Assistant IA local (Ollama 100% privé)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Vérifiez l’état du moteur IA local hébergé au club pour le recouvrement, les relances et l’aide RH.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadOllamaStatus()}
            disabled={loadingOllama}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
              isDark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-100 hover:bg-slate-200'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingOllama ? 'animate-spin' : ''}`} />
            <span>Actualiser</span>
          </button>
        </div>

        <div className={`${subBoxCls} space-y-2.5 text-xs`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-400">Statut moteur Ollama :</span>
            <span
              className={`px-2.5 py-0.5 rounded-full font-bold ${
                ollamaStatus?.online
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-amber-500/15 text-amber-400'
              }`}
            >
              {ollamaStatus?.online ? 'EN LIGNE' : 'HORS LIGNE'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-400">Point d’accès :</span>
            <code className="cf-mono text-[11px]">{ollamaStatus?.baseUrl ?? '—'}</code>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-400">Modèle par défaut :</span>
            <code className="cf-mono text-[11px]">{ollamaStatus?.defaultModel ?? 'qwen2.5:3b'}</code>
          </div>
          {ollamaStatus?.error && (
            <div className="text-[11px] text-amber-300 pt-1">
              Détail : {ollamaStatus.error} (normal si Ollama n’est pas encore lancé sur le poste hôte).
            </div>
          )}
        </div>

        <div className="space-y-2 text-xs">
          <label className="block space-y-1">
            <span className="text-slate-400">Modèle à tester</span>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className={inputCls}
            >
              {(ollamaStatus?.models && ollamaStatus.models.length > 0
                ? ollamaStatus.models
                : [ollamaStatus?.defaultModel ?? 'qwen2.5:3b']
              ).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => void handleTestAi()}
            disabled={testingOllama}
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {testingOllama
                ? 'Interrogation du modèle local...'
                : 'Tester la réponse de l’IA locale'}
            </span>
          </button>
        </div>

        {aiTestResult && (
          <div
            className={`p-3.5 rounded-xl border text-xs space-y-1 ${
              aiTestResult.ok
                ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-200'
                : 'bg-red-500/10 border-red-500/35 text-red-200'
            }`}
          >
            <div className="font-bold">
              {aiTestResult.ok
                ? `Réponse IA locale reçue en ${aiTestResult.latencyMs} ms`
                : `Test IA échoué (${aiTestResult.latencyMs} ms)`}
            </div>
            <p className="leading-relaxed opacity-90">{aiTestResult.text}</p>
          </div>
        )}
      </div>
    </div>
  );
}
