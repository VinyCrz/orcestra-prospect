/** Utilitários de CSV de saída: separador `;` (Excel pt-BR), UTF-8 com BOM, proteção contra injeção de fórmulas. */
export const BOM = '﻿';
export const SEP = ';';

export function celulaCsv(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function linhaCsv(cols: unknown[]): string {
  return cols.map(celulaCsv).join(SEP) + '\r\n';
}
