export function communicationsCsv(rows:Array<{subject:string;createdAt:string;clubId:string;channel?:string}>):string {
  const cell=(value:string)=>`"${(/^[\s]*[=+@-]/.test(value)?"'":"")+value.replace(/"/g,'""')}"`;
  return '\uFEFF'+[['MESSAGE','DATE','CLUB','CANAL','STATUT'],...rows.map(r=>[r.subject,r.createdAt,r.clubId,r.channel??'Email','Simulation — aucun envoi'])].map(row=>row.map(cell).join(';')).join('\r\n');
}
