import { BadRequestException } from '@nestjs/common';
import { SEMANA_REGEX } from '@orcestra/shared';
import { dataCivilSP, somarDias } from './fuso';

const MS_DIA = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Semana ISO (AAAA-Www) da data civil AAAA-MM-DD. */
export function semanaIsoDeDataCivil(civil: string): string {
  const [y, m, d] = civil.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay() || 7; // seg=1..dom=7
  dt.setUTCDate(dt.getUTCDate() + 4 - dow); // quinta da semana define o ano ISO
  const ano = dt.getUTCFullYear();
  const jan1 = Date.UTC(ano, 0, 1);
  const sem = Math.ceil(((dt.getTime() - jan1) / MS_DIA + 1) / 7);
  return `${ano}-W${pad(sem)}`;
}

/** Semana ISO do instante, no fuso de São Paulo. */
export const semanaIsoDe = (d: Date) => semanaIsoDeDataCivil(dataCivilSP(d));

/** Segunda-feira (AAAA-MM-DD) da semana ISO informada; 400 se a semana não existe (ex.: W53 em ano de 52). */
export function segundaDaSemanaIso(semana: string): string {
  if (!SEMANA_REGEX.test(semana)) throw new BadRequestException('Semana inválida (use AAAA-Www)');
  const [ano, sem] = semana.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(ano, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const seg = new Date(jan4.getTime() + ((1 - dow) + (sem - 1) * 7) * MS_DIA);
  const r = iso(seg);
  if (semanaIsoDeDataCivil(r) !== semana) throw new BadRequestException('Semana inexistente nesse ano');
  return r;
}

/** Segunda-feira (AAAA-MM-DD) da semana do instante, no fuso de SP. */
export const segundaDe = (d: Date) => segundaDaSemanaIso(semanaIsoDe(d));

/** Intervalo UTC meio-aberto [ini, fim) da semana ISO em SP (segunda 00:00 SP até a próxima segunda). */
export function intervaloDaSemana(semana: string): { ini: Date; fim: Date; segunda: string } {
  const segunda = segundaDaSemanaIso(semana);
  const [y, m, d] = segunda.split('-').map(Number);
  const ini = new Date(Date.UTC(y, m - 1, d, 3));
  return { ini, fim: somarDias(ini, 7), segunda };
}

/** Semana ISO anterior à do instante. */
export const semanaAnterior = (agora: Date) => semanaIsoDe(somarDias(new Date(`${segundaDe(agora)}T12:00:00Z`), -7));

export interface MetaLinha {
  usuarioId: string | null;
  interacoesSemana: number;
  reunioesSemana: number;
  vigenteDesde: string; // AAAA-MM-DD
}

/**
 * Meta efetiva na semana (segunda AAAA-MM-DD): a do SDR com maior vigenteDesde ≤ segunda; senão a global
 * com maior vigenteDesde ≤ segunda; senão null.
 */
export function resolverMeta(metas: MetaLinha[], usuarioId: string, segunda: string): MetaLinha | null {
  const melhor = (lista: MetaLinha[]) =>
    lista.filter((m) => m.vigenteDesde <= segunda).sort((a, b) => (a.vigenteDesde < b.vigenteDesde ? 1 : -1))[0] ?? null;
  return melhor(metas.filter((m) => m.usuarioId === usuarioId)) ?? melhor(metas.filter((m) => m.usuarioId === null));
}
