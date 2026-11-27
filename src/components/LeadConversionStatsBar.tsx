import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, Sliders, TrendingUp, Users } from 'lucide-react';
import { fetchLeadConversionStats, rebalanceStaleProspects, type ConversionStatsData, type RebalanceStaleResult } from '../domain/leadPoolApi';

interface Props {
  clubId?: string;
  canRebalance?: boolean;
  employees?: {id:string; firstName:string; lastName:string}[];
  onRebalanceComplete?: (result:RebalanceStaleResult)=>void;
}
const button='cf-card-secondary rounded-lg px-3 py-2 min-h-11 text-sm font-semibold disabled:opacity-50';
export function LeadConversionStatsBar({clubId,canRebalance=false,employees=[],onRebalanceComplete}:Props) {
  const [stats,setStats]=useState<ConversionStatsData|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [config,setConfig]=useState(false);
  const [breakdown,setBreakdown]=useState(false);
  const [threshold,setThreshold]=useState(3);
  const [confirm,setConfirm]=useState(false);
  const [feedback,setFeedback]=useState('');
  const generation=useRef(0); const submitting=useRef(false);
  useEffect(()=>()=>{generation.current++;},[]);
  async function load() {
    const current=++generation.current;
    setStats(null);setLoading(true);setError('');
    try {const result=await fetchLeadConversionStats(clubId);if(current===generation.current)setStats(result.stats);}
    catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'Indicateurs indisponibles.');}
    finally{if(current===generation.current)setLoading(false);}
  }
  useEffect(()=>{setFeedback('');setConfirm(false);void load();return()=>{generation.current++;};},[clubId]);
  async function rebalance() {
    if(submitting.current || !canRebalance || !stats)return;
    submitting.current=true;setBusy(true);setFeedback('');setError('');
    const current=generation.current;
    try {
      const result=await rebalanceStaleProspects({clubId,thresholdDays:threshold});
      if(current!==generation.current)return;
      onRebalanceComplete?.(result);
      setFeedback(result.reassignedCount ? result.reassignedCount+' prospect(s) réattribué(s).' : 'Aucune réattribution nécessaire.');
      setConfirm(false);await load();
    } catch(e) {
      if(current===generation.current){setError(e instanceof Error?e.message:'La réattribution n’a pas été confirmée.');setStats(null);setConfirm(false);}
    } finally {submitting.current=false;setBusy(false);}
  }
  const name=(id:string)=>{const employee=employees.find(e=>e.id===id);return employee ? employee.firstName+' '+employee.lastName : 'Collaborateur non disponible';};
  return <section aria-label="Suivi des prospects du club" className="cf-card rounded-2xl min-w-0">
    <details className="group p-4">
      <summary className="cursor-pointer min-h-6 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
        <span className="flex items-center gap-2"><TrendingUp size={18}/>Indicateurs commerciaux</span>
        <span className="cf-muted">{stats ? stats.activeLeads + " actif(s) · " + stats.staleLeads + " sans contact depuis 3 jours" : error ? "Indicateurs indisponibles" : "Chargement…"} <span className="ml-2 text-violet-400 group-open:hidden">Voir le détail</span></span>
      </summary>
      <div className="space-y-4 mt-4">
    <div className="flex flex-wrap gap-3 items-start justify-between">
      <h2 className="font-bold flex gap-2 items-center"><TrendingUp size={18}/>Suivi des prospects</h2>
      <button className={button} disabled={loading||busy} onClick={()=>void load()} aria-label="Actualiser les indicateurs"><RefreshCw size={16}/></button>
    </div>
    {loading && <p role="status" className="cf-muted text-sm">Chargement des indicateurs…</p>}
    {error && <p role="alert" className="text-amber-400 flex items-start gap-2 text-sm"><AlertTriangle size={16} className="shrink-0"/>{error}</p>}
    {stats && <>
      <dl className="grid grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
        {[['Transformation',stats.conversionRatePercent.toFixed(1)+' %'],['Prospects actifs',stats.activeLeads],['Devenus adhérents',stats.convertedLeads],['Sans contact depuis au moins 3 jours',stats.staleLeads]].map(([label,value])=><div key={label} className="cf-card-secondary rounded-xl p-3 min-w-0"><dt className="cf-muted break-words">{label}</dt><dd className="text-lg font-bold mt-1">{value}</dd></div>)}
      </dl>
      {stats.unassignedLeads>0 && <p className="text-amber-400 text-sm">{stats.unassignedLeads} prospect(s) en attente d’attribution.</p>}
      <div className="flex flex-wrap gap-2">
        <button className={button} aria-expanded={breakdown} onClick={()=>setBreakdown(v=>!v)}><Users size={16} className="inline mr-2"/>Répartition par commercial</button>
        {canRebalance && <button className={button} aria-expanded={config} onClick={()=>{setConfig(v=>!v);setConfirm(false);}}><Sliders size={16} className="inline mr-2"/>Réattribuer des prospects</button>}
      </div>
      {config && canRebalance && <div className="cf-card-secondary rounded-xl p-3 min-w-0 space-y-3">
        <label className="block text-sm font-semibold">Délai sans contact avant réattribution<select className="cf-input w-full mt-2 p-2 min-h-11" value={threshold} disabled={busy} onChange={e=>{setThreshold(Number(e.target.value));setConfirm(false);}}>{[2,3,5,7].map(days=><option key={days} value={days}>{days} jours</option>)}</select></label>
        <p className="cf-muted text-sm break-words">Les prospects sans contact depuis au moins {threshold} jours, ou suivis par un commercial indisponible, pourront être confiés à un autre commercial disponible du club. L’indicateur ci-dessus conserve son repère de 3 jours.</p>
        {confirm ? <div className="space-y-2"><p className="text-sm">Confirmer la réattribution pour le club sélectionné avec ce délai de {threshold} jours ?</p><div className="flex flex-wrap gap-2"><button disabled={busy||loading} className={button} onClick={()=>void rebalance()}>{busy?'Réattribution en cours…':'Confirmer la réattribution'}</button><button disabled={busy} className={button} onClick={()=>setConfirm(false)}>Annuler</button></div></div> :
          <button disabled={busy||loading} className={button} onClick={()=>setConfirm(true)}>Vérifier avant de réattribuer</button>}
      </div>}
      {breakdown && <div className="space-y-3">
        <h3 className="font-semibold text-sm">Répartition par commercial</h3>
        {!stats.commercialBreakdown.length && <p className="cf-muted text-sm">Aucune attribution pour ce club.</p>}
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{stats.commercialBreakdown.map(c=><article key={c.employeeId} className="cf-card-secondary rounded-xl p-3 min-w-0"><h4 className="font-semibold break-words">{name(c.employeeId)}</h4><p className="cf-muted text-sm mt-2">{c.activeLeads} actif(s) · {c.convertedLeads} devenu(s) adhérent(s) · {c.staleLeads} sans contact depuis au moins 3 jours</p></article>)}</div>
      </div>}
    </>}
    {feedback && <p role="status" className="text-emerald-400 text-sm">{feedback}</p>}
      </div>
    </details>
    {error && <p role="alert" className="px-4 pb-4 text-amber-400 text-sm">{error}</p>}
  </section>;
}
