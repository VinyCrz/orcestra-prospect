/** Cliente HTTP do front: access token em memória + renovação automática via cookie httpOnly. */
let accessToken: string | null = null;
let renovando: Promise<string | null> | null = null;
let aoExpirar: (() => void) | null = null;

export function definirAccessToken(t: string | null) {
  accessToken = t;
}

export function aoSessaoExpirar(fn: () => void) {
  aoExpirar = fn;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public dados?: unknown,
  ) {
    super(message);
  }
}

export interface RespostaSessao {
  accessToken: string;
  usuario: import('@orcestra/shared').UsuarioPublico;
}

export function renovarSessao(): Promise<RespostaSessao | null> {
  const p = (async () => {
    const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
    if (!r.ok) {
      accessToken = null;
      return null;
    }
    const dados = (await r.json()) as RespostaSessao;
    accessToken = dados.accessToken;
    return dados;
  })();
  renovando = p
    .then((d) => d?.accessToken ?? null)
    .finally(() => {
      renovando = null;
    });
  return p;
}

async function tokenRenovado(): Promise<string | null> {
  if (renovando) return renovando;
  return (await renovarSessao())?.accessToken ?? null;
}

type Opcoes = Omit<RequestInit, 'body'> & {
  json?: unknown;
  /** Corpo bruto (ex.: FormData em uploads); o Content-Type é definido pelo navegador. */
  corpo?: BodyInit;
  semRenovar?: boolean;
};

export async function api<T>(caminho: string, opcoes: Opcoes = {}): Promise<T> {
  const { json, corpo: corpoBruto, semRenovar, headers, ...resto } = opcoes;
  const fazer = (token: string | null) =>
    fetch(`/api${caminho}`, {
      ...resto,
      credentials: 'same-origin',
      headers: {
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : corpoBruto,
    });

  let r = await fazer(accessToken);
  if (r.status === 401 && !semRenovar) {
    const novo = await tokenRenovado();
    if (novo) r = await fazer(novo);
    if (r.status === 401) aoExpirar?.();
  }
  if (r.status === 204) return undefined as T;
  const corpo = await r.json().catch(() => null);
  if (!r.ok) {
    const msg =
      (corpo && (Array.isArray(corpo.message) ? corpo.message[0] : corpo.message)) ||
      'Erro inesperado';
    throw new ApiError(r.status, msg, corpo);
  }
  return corpo as T;
}

/** Baixa um arquivo (ex.: CSV) autenticado e dispara o download no navegador. */
export async function baixarArquivo(caminho: string, nomePadrao: string): Promise<void> {
  const fazer = (token: string | null) =>
    fetch(`/api${caminho}`, {
      credentials: 'same-origin',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  let r = await fazer(accessToken);
  if (r.status === 401) {
    const novo = await tokenRenovado();
    if (novo) r = await fazer(novo);
    if (r.status === 401) aoExpirar?.();
  }
  if (!r.ok) throw new ApiError(r.status, 'Não foi possível baixar o arquivo');
  const cd = r.headers.get('Content-Disposition') ?? '';
  const nome = /filename="?([^";]+)"?/.exec(cd)?.[1] ?? nomePadrao;
  baixarBlob(await r.blob(), nome);
}

export function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
