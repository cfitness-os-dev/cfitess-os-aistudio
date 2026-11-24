export function communicationsCsv(rows:Array<{subject:string;createdAt:string;clubId:string}>):string {
  const cell=(value:string)=>`"${(/^[\s]*[=+@-]/.test(value)?"'":"")+value.replace(/"/g,'""')}"`;
  return '\uFEFF'+[['OBJET','DATE','CLUB','STATUT'],...rows.map(r=>[r.subject,r.createdAt,r.clubId,'Simulation — aucun envoi'])].map(row=>row.map(cell).join(';')).join('\r\n');
}
