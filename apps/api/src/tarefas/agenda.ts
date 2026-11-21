import { limitesAgenda } from '../common/fuso';

export interface AgendaItem {
  vencimento: Date;
}

export interface Agenda<T extends AgendaItem> {
  atrasadas: T[];
  hoje: T[];
  proximos7Dias: T[];
}

/** Agrupa tarefas pendentes pelo dia civil de America/Sao_Paulo. Tarefas além de 7 dias ficam de fora. */
export function agruparAgenda<T extends AgendaItem>(tarefas: T[], agora = new Date()): Agenda<T> {
  const { hoje, amanha, fimProximos7 } = limitesAgenda(agora);
  const out: Agenda<T> = { atrasadas: [], hoje: [], proximos7Dias: [] };
  for (const t of [...tarefas].sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime())) {
    const v = t.vencimento.getTime();
    if (v < hoje.getTime()) out.atrasadas.push(t);
    else if (v < amanha.getTime()) out.hoje.push(t);
    else if (v < fimProximos7.getTime()) out.proximos7Dias.push(t);
  }
  return out;
}
