/** Fuso de negócio. O Brasil não adota horário de verão desde 2019, então o deslocamento é fixo (UTC-3). */
export const FUSO = 'America/Sao_Paulo';
const MS_DIA = 24 * 60 * 60 * 1000;

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Data civil (AAAA-MM-DD) do instante no fuso de São Paulo. */
export function dataCivilSP(d: Date): string {
  return fmt.format(d);
}

/** Instante (UTC) em que começa o dia de São Paulo que contém `d`. */
export function inicioDoDiaSP(d: Date): Date {
  const [y, m, dia] = dataCivilSP(d).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dia, 3));
}

export function somarDias(d: Date, dias: number): Date {
  return new Date(d.getTime() + dias * MS_DIA);
}

/** Meia-noite UTC da data civil de SP — formato das colunas `@db.Date` do Prisma. */
export function dataColunaHoje(agora: Date): Date {
  const [y, m, dia] = dataCivilSP(agora).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dia));
}

/** Limites da agenda: atrasadas (< hoje), hoje, próximos 7 dias (amanhã até hoje+7 inclusive). */
export function limitesAgenda(agora: Date) {
  const hoje = inicioDoDiaSP(agora);
  return {
    hoje,
    amanha: somarDias(hoje, 1),
    fimProximos7: somarDias(hoje, 8),
  };
}
