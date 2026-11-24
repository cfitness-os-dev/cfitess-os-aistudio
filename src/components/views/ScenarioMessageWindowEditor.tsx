import type {ScenarioMessageWindow} from '../../domain/leadScenarioDefinitions';

const days=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
export function ScenarioMessageWindowEditor({value,onChange}:{value:ScenarioMessageWindow|null;onChange:(value:ScenarioMessageWindow|null)=>void}) {
  const input='w-full min-w-0 rounded-lg border border-slate-500/40 bg-transparent p-3 min-h-[44px]';
  return <fieldset className="space-y-3 rounded-xl border border-slate-500/30 p-3">
    <legend className="font-semibold">Jours et horaires des messages</legend>
    <label className="flex items-center gap-2"><input type="checkbox" checked={!!value} onChange={e=>onChange(e.target.checked?{timezone:'Europe/Paris',weekdays:[1,2,3,4,5],startTime:'09:00',endTime:'20:00'}:null)}/>Limiter les messages à certains jours et horaires</label>
    <p className="text-sm cf-muted">Ces horaires concernent les messages simulés du scénario. Les tâches de l’équipe gardent leurs échéances. Sans restriction, le délai de chaque étape s’applique seul.</p>
    {value&&<>
      <div className="flex flex-wrap gap-3">{days.map((day,index)=><label key={day} className="inline-flex items-center gap-2 min-h-[44px]"><input type="checkbox" checked={value.weekdays.includes(index+1)} onChange={e=>onChange({...value,weekdays:e.target.checked?[...value.weekdays,index+1].sort((a,b)=>a-b):value.weekdays.filter(d=>d!==index+1)})}/>{day}</label>)}</div>
      <div className="grid sm:grid-cols-2 gap-3"><label>Début des messages<input type="time" className={input} value={value.startTime} onChange={e=>onChange({...value,startTime:e.target.value})}/></label><label>Fin des messages<input type="time" className={input} value={value.endTime} onChange={e=>onChange({...value,endTime:e.target.value})}/></label></div>
      <p className="text-sm cf-muted">Heure de France (Europe/Paris), dans une même journée. À l’heure de fin, le prochain message attend la prochaine ouverture. Les jours fériés ne sont pas exclus automatiquement.</p>
      <p className="text-sm cf-muted">La publication conserve ces horaires pour les parcours concernés. Les messages ne sont pas envoyés et les automatismes Heitz restent inchangés.</p>
    </>}
  </fieldset>;
}
