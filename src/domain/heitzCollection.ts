/** Describes the bounded reader run; never promises complete vendor API coverage. */
export function describeHeitzCollection(value: unknown): string {
  const p=value as {ok?:boolean;partialSync?:boolean;syncedMembersCount?:number;financialCollection?:{paymentsCollected?:boolean;contractsCollected?:boolean;termsCollected?:boolean}};
  if(!p||p.ok!==true||typeof p.partialSync!=='boolean'||typeof p.syncedMembersCount!=='number'||!Number.isInteger(p.syncedMembersCount)||p.syncedMembersCount<0) {
    throw new Error('Le serveur n’a pas confirmé le résultat de la collecte Heitz.');
  }
  const coverage=p.financialCollection;
  const missing: string[]=[];
  if(coverage?.paymentsCollected!==true)missing.push('règlements détaillés');
  if(coverage?.contractsCollected!==true)missing.push('contrats');
  if(coverage?.termsCollected!==true)missing.push('CGV');
  return `${p.partialSync?'Collecte Heitz partielle':'Collecte Heitz effectuée'} : ${p.syncedMembersCount} fiches relues dans votre périmètre.${p.partialSync?' Certaines sources restent à vérifier.':''}${missing.length?' Non collectés automatiquement : '+missing.join(', ')+'.':''} Un solde ou un ticket ne constitue pas une preuve de règlement.`;
}
