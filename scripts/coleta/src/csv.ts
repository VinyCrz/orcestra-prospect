import { writeFile } from 'node:fs/promises';
import type { EjColetada } from '@orcestra/shared';

const COLUNAS: (keyof EjColetada)[] = [
  'nome',
  'razaoSocial',
  'cnpj',
  'ies',
  'iesSigla',
  'federacao',
  'nucleo',
  'cidade',
  'uf',
  'regiao',
  'areas',
  'cursos',
  'servicos',
  'anoFundacao',
  'membrosEstimados',
  'federada',
  'site',
  'instagram',
  'linkedin',
  'facebook',
  'emailInstitucional',
  'telefoneInstitucional',
  'situacaoCadastral',
  'idBrasilJunior',
  'fonteUrl',
  'fontes',
  'coletadoEm',
  'verificado',
];

function celula(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = Array.isArray(v) ? v.join(' | ') : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function escreverCsv(arquivo: string, ejs: EjColetada[]) {
  const linhas = [COLUNAS.join(','), ...ejs.map((e) => COLUNAS.map((c) => celula(e[c])).join(','))];
  await writeFile(arquivo, '﻿' + linhas.join('\n') + '\n');
}
