import ExcelJS from 'exceljs';

export interface Planilha {
  /** nomes das colunas (cabeçalho), únicos e não vazios */
  colunas: string[];
  /** cada linha: valores por coluna (texto, já com trim) */
  linhas: Record<string, string>[];
}

export const MAX_LINHAS = 20000;

/** Decodifica bytes: UTF-8 (com ou sem BOM); se inválido, cai para latin1 (windows-1252). */
export function decodificar(buf: Buffer): string {
  const semBom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? buf.subarray(3) : buf;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(semBom);
  } catch {
    return new TextDecoder('windows-1252').decode(semBom);
  }
}

/** Detecta o separador (; , tab) pela primeira linha, ignorando o que está entre aspas. */
export function detectarDelimitador(texto: string): string {
  const fim = texto.search(/\r?\n/);
  const primeira = fim === -1 ? texto : texto.slice(0, fim);
  const cont: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  let aspas = false;
  for (const ch of primeira) {
    if (ch === '"') aspas = !aspas;
    else if (!aspas && ch in cont) cont[ch]++;
  }
  // empate/zero: vírgula
  return (Object.entries(cont).sort((a, b) => b[1] - a[1])[0][1] > 0
    ? Object.entries(cont).sort((a, b) => b[1] - a[1])[0][0]
    : ',') as string;
}

/** Parser de CSV (RFC 4180): aspas, aspas escapadas, quebras de linha dentro de campo. */
export function parseCsv(texto: string, delim: string): string[][] {
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else campo += c;
    } else if (c === '"' && campo === '') {
      aspas = true;
    } else if (c === delim) {
      linha.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo);
      campo = '';
      linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  if (campo !== '' || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas;
}

/** Cabeçalhos vazios viram "coluna_N"; repetidos ganham sufixo "(2)". */
export function nomesColunas(cab: string[]): string[] {
  const vistos = new Map<string, number>();
  return cab.map((c, i) => {
    const base = c.trim() || `coluna_${i + 1}`;
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

function montar(matriz: string[][]): Planilha {
  const nao_vazias = matriz.filter((l) => l.some((c) => c.trim() !== ''));
  if (nao_vazias.length === 0) throw new Error('Arquivo vazio');
  const colunas = nomesColunas(nao_vazias[0]);
  const dados = nao_vazias.slice(1);
  if (dados.length > MAX_LINHAS) throw new Error(`Arquivo com mais de ${MAX_LINHAS} linhas`);
  const linhas = dados.map((l) => Object.fromEntries(colunas.map((c, i) => [c, (l[i] ?? '').trim()])));
  return { colunas, linhas };
}

export function lerCsv(buf: Buffer): Planilha {
  const texto = decodificar(buf);
  return montar(parseCsv(texto, detectarDelimitador(texto)));
}

function celulaTexto(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join('');
    if ('result' in o) return celulaTexto(o.result as ExcelJS.CellValue);
    if ('text' in o) return celulaTexto(o.text as ExcelJS.CellValue);
    if ('hyperlink' in o) return String(o.hyperlink);
    if ('error' in o) return '';
  }
  return String(v);
}

/** Limites do XLSX descompactado (anti zip bomb), checados no diretório central antes de abrir. */
export const MAX_XLSX_DESCOMPACTADO = 100 * 1024 * 1024;
const MAX_XLSX_ENTRADAS = 2000;

/** Soma os tamanhos descompactados declarados no diretório central do ZIP; recusa ZIP64/excessos. */
export function verificarZip(buf: Buffer): void {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('XLSX inválido');
  const entradas = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (entradas === 0xffff || p === 0xffffffff || entradas > MAX_XLSX_ENTRADAS)
    throw new Error('XLSX com estrutura não suportada');
  let total = 0;
  for (let n = 0; n < entradas; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error('XLSX inválido');
    const comp = buf.readUInt32LE(p + 20);
    const desc = buf.readUInt32LE(p + 24);
    if (comp === 0xffffffff || desc === 0xffffffff) throw new Error('XLSX com estrutura não suportada');
    total += desc;
    if (total > MAX_XLSX_DESCOMPACTADO) throw new Error('XLSX descompactado excede 100 MB');
    p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
}

export async function lerXlsx(buf: Buffer): Promise<Planilha> {
  verificarZip(buf);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Planilha sem abas');
  const matriz: string[][] = [];
  const nCols = ws.actualColumnCount;
  ws.eachRow({ includeEmpty: false }, (row) => {
    const l: string[] = [];
    for (let c = 1; c <= nCols; c++) l.push(celulaTexto(row.getCell(c).value));
    matriz.push(l);
  });
  return montar(matriz);
}

/** Lê .csv ou .xlsx (pela extensão, com fallback pela assinatura ZIP "PK"). */
export async function lerArquivo(buf: Buffer, nome: string): Promise<Planilha> {
  const ext = nome.toLowerCase().split('.').pop();
  const ehZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b;
  if (ext === 'xlsx' || (ehZip && ext !== 'csv')) return lerXlsx(buf);
  if (ext === 'csv' || ext === 'txt') return lerCsv(buf);
  throw new Error('Formato não suportado. Envie .csv ou .xlsx');
}
