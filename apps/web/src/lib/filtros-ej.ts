import { STATUS_PROSPECCAO, type FiltrosEj } from '@orcestra/shared';

/** Parâmetros de filtro na URL (mesmos nomes da API; listas separadas por vírgula). */
export const CHAVES_LISTA = [
  'uf',
  'regiao',
  'federacaoId',
  'iesId',
  'tagIds',
  'status',
  'responsavelId',
  'faixaIcp',
  'canais',
] as const;
export const CHAVES_NUM = ['membrosMin', 'membrosMax', 'scoreMin', 'scoreMax'] as const;
export const CHAVES_FILTRO = [
  'busca',
  ...CHAVES_LISTA,
  ...CHAVES_NUM,
  'federada',
  'comContato',
  'canaisModo',
] as const;

export type FiltrosUrl = Partial<Record<(typeof CHAVES_FILTRO)[number], string>>;

export function filtrosDaUrl(p: URLSearchParams): FiltrosUrl {
  const out: FiltrosUrl = {};
  for (const k of CHAVES_FILTRO) {
    const v = p.get(k);
    if (v) out[k] = v;
  }
  return out;
}

export const listaDe = (v?: string) => (v ? v.split(',').filter(Boolean) : []);

export function contarFiltros(f: FiltrosUrl) {
  // o modo dos canais é parte do filtro de canais, não um filtro à parte
  return Object.keys(f).filter((k) => k !== 'busca' && k !== 'canaisModo').length;
}

/** Filtros da URL -> objeto aceito pelo schema da API / listas salvas. */
export function urlParaFiltros(f: FiltrosUrl): FiltrosEj {
  const out: Record<string, unknown> = {};
  if (f.busca) out.busca = f.busca;
  for (const k of CHAVES_LISTA) if (f[k]) out[k] = listaDe(f[k]);
  for (const k of CHAVES_NUM) if (f[k] !== undefined) out[k] = Number(f[k]);
  if (f.federada) out.federada = f.federada === 'true';
  if (f.comContato) out.comContato = f.comContato === 'true';
  if (f.canais && f.canaisModo) out.canaisModo = f.canaisModo;
  return out as FiltrosEj;
}

/** Objeto de filtros (lista salva) -> parâmetros de URL. */
export function filtrosParaUrl(f: FiltrosEj): FiltrosUrl {
  const out: FiltrosUrl = {};
  const o = f as Record<string, unknown>;
  if (typeof o.busca === 'string' && o.busca) out.busca = o.busca;
  for (const k of CHAVES_LISTA) {
    const v = o[k];
    if (Array.isArray(v) && v.length) out[k] = v.join(',');
  }
  for (const k of CHAVES_NUM) if (typeof o[k] === 'number') out[k] = String(o[k]);
  if (typeof o.federada === 'boolean') out.federada = String(o.federada);
  if (typeof o.comContato === 'boolean') out.comContato = String(o.comContato);
  if (typeof o.canaisModo === 'string') out.canaisModo = o.canaisModo;
  return out;
}

export function querystringFiltros(f: FiltrosUrl, extra: Record<string, string> = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}

export const STATUS_OPCOES = STATUS_PROSPECCAO;
