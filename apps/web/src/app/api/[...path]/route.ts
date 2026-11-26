import type { NextRequest } from 'next/server';

/**
 * Proxy /api/* → API NestJS. Mantém front e API na mesma origem para o navegador,
 * o que permite usar o refresh token em cookie httpOnly SameSite=Strict.
 * A URL da API é lida em tempo de execução (API_INTERNAL_URL).
 */
export const dynamic = 'force-dynamic';

const HEADERS_REPASSADOS = ['content-type', 'authorization', 'cookie', 'user-agent', 'accept'];
const HEADERS_REMOVIDOS = ['content-encoding', 'content-length', 'transfer-encoding', 'connection'];

function ipReal(req: NextRequest): string | null {
  // Netlify informa o IP do usuário neste cabeçalho (escrito pela própria borda, não pelo cliente)
  const netlify = req.headers.get('x-nf-client-connection-ip')?.trim();
  if (netlify) return netlify;
  const encadeado = req.headers.get('x-forwarded-for');
  const ultimo = encadeado?.split(',').pop()?.trim();
  return ultimo || req.headers.get('x-real-ip')?.trim() || null;
}

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const base = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
  const url = `${base}/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;
  const headers = new Headers();
  for (const h of HEADERS_REPASSADOS) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  // Nunca repassa o X-Forwarded-For do cliente (spoofável): sobrescreve com o IP real da conexão, que é
  // o último salto escrito pelo servidor/proxy mais próximo (a API usa trust proxy = 1 e lê esse valor).
  const ip = ipReal(req);
  if (ip) headers.set('x-forwarded-for', ip);
  // API em outro provedor (Render): há saltos a mais no caminho, então o IP vai num cabeçalho
  // autenticado pelo segredo compartilhado (a API só confia nele com o PROXY_SECRET igual).
  const segredo = process.env.PROXY_SECRET;
  if (segredo && ip) {
    headers.set('x-orcestra-proxy', segredo);
    headers.set('x-orcestra-ip', ip);
  }
  const temCorpo = !['GET', 'HEAD'].includes(req.method);
  try {
    const res = await fetch(url, {
      method: req.method,
      headers,
      body: temCorpo ? await req.arrayBuffer() : undefined,
      redirect: 'manual',
      cache: 'no-store',
    });
    const out = new Headers();
    res.headers.forEach((v, k) => {
      if (!HEADERS_REMOVIDOS.includes(k) && k !== 'set-cookie') out.set(k, v);
    });
    for (const c of res.headers.getSetCookie()) out.append('set-cookie', c);
    const semCorpo = res.status === 204 || res.status === 304;
    return new Response(semCorpo ? null : res.body, { status: res.status, headers: out });
  } catch {
    return Response.json({ statusCode: 502, message: 'API indisponível' }, { status: 502 });
  }
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
