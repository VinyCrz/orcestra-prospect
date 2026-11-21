import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Identificação genérica do cliente (sem dados pessoais). */
export const USER_AGENT =
  'Mozilla/5.0 (compatible; ProspectColetaBot/1.0; coleta de dados publicos institucionais)';

const ultimoAcesso = new Map<string, number>();
const robotsCache = new Map<string, string[]>();

export interface OpcoesHttp {
  cacheDir: string;
  /** Intervalo mínimo entre requisições ao mesmo host (ms). */
  intervaloMs?: number;
  /** Validade do cache em ms. */
  ttlMs?: number;
  ignorarCache?: boolean;
}

let opcoes: Required<OpcoesHttp> = {
  cacheDir: 'data/cache/http',
  intervaloMs: 1500,
  ttlMs: 7 * 24 * 3600 * 1000,
  ignorarCache: false,
};

export function configurarHttp(o: Partial<OpcoesHttp>) {
  opcoes = { ...opcoes, ...o } as Required<OpcoesHttp>;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function respeitarIntervalo(host: string, intervaloMs: number) {
  const ultimo = ultimoAcesso.get(host) ?? 0;
  const espera = ultimo + intervaloMs - Date.now();
  if (espera > 0) await dormir(espera);
  ultimoAcesso.set(host, Date.now());
}

/** Lê robots.txt e retorna os prefixos Disallow aplicáveis a "User-agent: *". */
async function regrasRobots(origin: string): Promise<string[]> {
  if (robotsCache.has(origin)) return robotsCache.get(origin)!;
  let regras: string[] = [];
  try {
    await respeitarIntervalo(new URL(origin).host, opcoes.intervaloMs);
    const r = await fetch(`${origin}/robots.txt`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
    const ct = r.headers.get('content-type') ?? '';
    if (r.ok && ct.includes('text/plain')) {
      const linhas = (await r.text()).split(/\r?\n/);
      let aplica = false;
      for (const bruta of linhas) {
        const linha = bruta.replace(/#.*/, '').trim();
        const [campo, ...resto] = linha.split(':');
        const valor = resto.join(':').trim();
        if (/^user-agent$/i.test(campo)) aplica = valor === '*';
        else if (aplica && /^disallow$/i.test(campo) && valor) regras.push(valor);
      }
    }
  } catch {
    regras = [];
  }
  robotsCache.set(origin, regras);
  return regras;
}

export async function permitidoPorRobots(url: string): Promise<boolean> {
  const u = new URL(url);
  const regras = await regrasRobots(u.origin);
  const caminho = u.pathname + u.search;
  return !regras.some((r) => {
    const padrao = '^' + r.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(padrao).test(caminho);
  });
}

export class BloqueadoError extends Error {}
export class HttpError extends Error {
  constructor(
    public status: number,
    msg: string,
  ) {
    super(msg);
  }
}

/**
 * GET educado: respeita robots.txt, intervalo por host, identifica o cliente,
 * faz backoff em 429/5xx e guarda cache em disco.
 */
export async function obter(
  url: string,
  tipo: 'text' | 'json' = 'text',
  { cache = true }: { cache?: boolean } = {},
): Promise<string> {
  const chave = createHash('sha1').update(url).digest('hex');
  const arq = path.join(opcoes.cacheDir, `${chave}.${tipo === 'json' ? 'json' : 'html'}`);
  if (cache && !opcoes.ignorarCache) {
    try {
      const s = await stat(arq);
      if (Date.now() - s.mtimeMs < opcoes.ttlMs) return await readFile(arq, 'utf8');
    } catch {
      /* sem cache */
    }
  }
  if (!(await permitidoPorRobots(url)))
    throw new BloqueadoError(`Bloqueado por robots.txt: ${url}`);
  const host = new URL(url).host;
  let tentativa = 0;
  for (;;) {
    await respeitarIntervalo(host, opcoes.intervaloMs);
    const r = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: tipo === 'json' ? 'application/json' : 'text/html,*/*',
      },
      signal: AbortSignal.timeout(30000),
    }).catch((e: Error) => e);
    if (r instanceof Error || r.status === 429 || r.status >= 500) {
      tentativa++;
      if (tentativa > 4) {
        throw new Error(`Falha ao obter ${url}: ${r instanceof Error ? r.message : r.status}`);
      }
      await dormir(2000 * 2 ** tentativa);
      continue;
    }
    if (r.status === 401 || r.status === 403)
      throw new BloqueadoError(`Acesso negado (${r.status}): ${url}`);
    const corpo = await r.text();
    if (!r.ok) throw new HttpError(r.status, `HTTP ${r.status} em ${url}`);
    if (!cache) return corpo;
    await mkdir(opcoes.cacheDir, { recursive: true });
    await writeFile(arq, corpo);
    return corpo;
  }
}

export async function obterJson<T>(url: string, o: { cache?: boolean } = {}): Promise<T> {
  return JSON.parse(await obter(url, 'json', o)) as T;
}
