import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  UserCheck,
  BadgeCheck,
  Clock,
  UserX,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import {
  fetchLeadConversionStats,
  rebalanceStaleProspects,
  type ConversionStatsData,
} from '../domain/leadPoolApi';

interface LeadConversionStatsBarProps {
  clubId?: string;
  onRebalanceComplete?: (count: number) => void;
}

export function LeadConversionStatsBar({
  clubId,
  onRebalanceComplete,
}: LeadConversionStatsBarProps) {
  const [stats, setStats] = useState<ConversionStatsData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [rebalancing, setRebalancing] = useState<boolean>(false);
  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [thresholdDays, setThresholdDays] = useState<number>(3);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'warn'; text: string } | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchLeadConversionStats(clubId);
      if (res.ok && res.stats) {
        setStats(res.stats);
      }
    } catch {
      // Ignoré si hors ligne ou permissions
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleRebalance = async () => {
    setRebalancing(true);
    setFeedback(null);
    try {
      const res = await rebalanceStaleProspects({
        clubId: clubId && clubId !== 'all' ? clubId : undefined,
        thresholdDays,
      });
      if (res.ok) {
        setFeedback({
          type: 'ok',
          text: `Rééquilibrage terminé : ${res.reassignedCount} prospect(s) réaffecté(s) équitablement.`,
        });
        await loadStats();
        if (onRebalanceComplete) {
          onRebalanceComplete(res.reassignedCount);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Échec du rééquilibrage automatique.';
      setFeedback({
        type: 'warn',
        text: msg,
      });
    } finally {
      setRebalancing(false);
      setShowConfig(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden text-xs space-y-0">
      {/* Top Banner KPI strip */}
      <div className="px-4 py-3 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 lg:gap-4">
          <div className="flex items-center gap-2 pr-3 border-r border-slate-700/80">
            <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold">
                Taux de transformation
              </div>
              <div className="text-sm font-black font-mono text-emerald-400">
                {stats ? `${stats.conversionRatePercent.toFixed(1)} %` : '—'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-semibold flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-blue-400" />
              Actifs :{' '}
              <strong className="text-white font-mono">{stats?.activeLeads ?? 0}</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-semibold flex items-center gap-1.5">
              <BadgeCheck className="w-3.5 h-3.5 text-emerald-400" />
              Convertis :{' '}
              <strong className="text-white font-mono">{stats?.convertedLeads ?? 0}</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-semibold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              Stagnants (&gt; {thresholdDays}j) :{' '}
              <strong className="text-amber-300 font-mono">{stats?.staleLeads ?? 0}</strong>
            </span>
            {Boolean(stats?.unassignedLeads) && (
              <span className="px-2 py-0.5 rounded bg-rose-950/60 border border-rose-800 text-rose-300 font-semibold flex items-center gap-1.5">
                <UserX className="w-3.5 h-3.5 text-rose-400" />
                Non assignés :{' '}
                <strong className="text-rose-200 font-mono">{stats?.unassignedLeads}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Action button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="px-2.5 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Paramètres de réattribution"
          >
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">Seuil {thresholdDays}j</span>
          </button>
          <button
            type="button"
            onClick={handleRebalance}
            disabled={rebalancing}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-extrabold flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 transition-all"
            title="Réaffecter équitablement les prospects sans contact ou commerciaux indisponibles"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${rebalancing ? 'animate-spin' : ''}`} />
            {rebalancing ? 'Rééquilibrage...' : 'Rééquilibrer vivier'}
          </button>
        </div>
      </div>

      {/* Threshold Config Accordion */}
      {showConfig && (
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-bold text-slate-700">Seuil d&apos;inactivité :</span>
            <div className="flex items-center gap-1.5">
              {[2, 3, 5, 7].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setThresholdDays(days)}
                  className={`px-2.5 py-1 rounded-lg font-bold border cursor-pointer ${
                    thresholdDays === days
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {days} jours
                </button>
              ))}
            </div>
            <span className="text-[11px] text-slate-500">
              Les prospects sans relance depuis {thresholdDays} jours ou avec commercial en congé
              seront redistribués en round-robin cyclique.
            </span>
          </div>
          <button
            type="button"
            onClick={handleRebalance}
            disabled={rebalancing}
            className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
          >
            Appliquer maintenant
          </button>
        </div>
      )}

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`px-4 py-2 border-t text-xs font-semibold flex items-center justify-between gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-amber-50 text-amber-900 border-amber-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[11px] underline cursor-pointer"
          >
            Fermer
          </button>
        </div>
      )}
    </div>
  );
}
