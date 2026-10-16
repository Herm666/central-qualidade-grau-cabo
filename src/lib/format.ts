export const statusLabels:Record<string,string>={PENDENTE:"Pendente",EM_ANALISE:"Em análise",EM_ANDAMENTO:"Em andamento",CONCLUIDO:"Concluído",INDEFERIDO:"Indeferido",NOVO:"Novo",LIDO:"Lido",ENCAMINHADO:"Encaminhado"};
export function formatDate(value:Date|string|null|undefined){if(!value)return "—";return new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC"}).format(new Date(value));}
export function monthLabel(month:number){return new Intl.DateTimeFormat("pt-BR",{month:"short",timeZone:"UTC"}).format(new Date(Date.UTC(2026,month-1,1))).replace(".","");}
