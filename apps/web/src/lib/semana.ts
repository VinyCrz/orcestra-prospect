/** Datas civis (America/Sao_Paulo) e semanas ISO (AAAA-Www) no front. */
const MS_DIA = 86_400_000;

export const hojeSP = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

const paraUtc = (civil: string) => new Date(`${civil}T12:00:00Z`);
const paraCivil = (d: Date) => d.toISOString().slice(0, 10);

export const somarDias = (civil: string, n: number) => paraCivil(new Date(paraUtc(civil).getTime() + n * MS_DIA));

export function semanaIsoDe(civil: string): string {
  const d = paraUtc(civil);
  const dow = (d.getUTCDay() + 6) % 7; // seg=0
  const quinta = new Date(d.getTime() + (3 - dow) * MS_DIA);
  const ano = quinta.getUTCFullYear();
  const jan4 = new Date(Date.UTC(ano, 0, 4, 12));
  const dowJan4 = (jan4.getUTCDay() + 6) % 7;
  const semana1Seg = jan4.getTime() - dowJan4 * MS_DIA;
  const n = Math.floor((d.getTime() - dow * MS_DIA - semana1Seg) / (7 * MS_DIA)) + 1;
  return `${ano}-W${String(n).padStart(2, '0')}`;
}

export function segundaDaSemana(semana: string): string {
  const [a, w] = semana.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(a, 0, 4, 12));
  const dowJan4 = (jan4.getUTCDay() + 6) % 7;
  return paraCivil(new Date(jan4.getTime() - dowJan4 * MS_DIA + (w - 1) * 7 * MS_DIA));
}

export const deslocarSemana = (semana: string, n: number) => semanaIsoDe(somarDias(segundaDaSemana(semana), n * 7));
export const semanaAtual = () => semanaIsoDe(hojeSP());

const fmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
export const rotuloSemana = (semana: string) => {
  const seg = segundaDaSemana(semana);
  return `${fmt.format(paraUtc(seg))} a ${fmt.format(paraUtc(somarDias(seg, 6)))}`;
};
