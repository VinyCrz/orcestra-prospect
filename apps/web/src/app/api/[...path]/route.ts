import type { NextRequest } from 'next/server';

/**
 * Proxy /api/* → API NestJS. Mantém front e API na mesma origem para o navegador,
 * o que permite usar o refresh token em cookie httpOnly SameSite=Strict.
 * A URL da API é lida em tempo de execução (API_INTERNAL_URL).
 */
export const dynamic = 'force-dynamic';

const HEADERS_REPASSADOS = ['content-type', 'authorization', 'cookie', 'user-agent', 'accept'];
const HEADERS_REMOVIDOS = ['content-encoding', 'content-length', 'transfer-encoding', 'connection'];

const PARECE_IP = /^[0-9a-f.:]{3,45}$/i;

/**
 * IP do usuário. No Render a borda é a Cloudflare, que sobrescreve `cf-connecting-ip` (o cliente não
 * consegue forjá-lo). Já o X-Forwarded-For o Render só acrescenta, então o 1º item pode ser falso.
 * Sem Cloudflare (local/docker) vale o último salto do X-Forwarded-For.
 */
function ipReal(req: NextRequest): string | null {
  const cf = req.headers.get('cf-connecting-ip')?.trim();
  if (cf && PARECE_IP.test(cf)) return cf;
  const ultimo = req.headers.get('x-forwarded-for')?.split(',').pop()?.trim();
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
  // Nunca repassa o X-Forwarded-For do cliente (forjável): manda só o IP real.
  // A API escuta só por dentro e usa trust proxy = 1, então lê exatamente este valor.
  const ip = ipReal(req);
  if (ip) headers.set('x-forwarded-for', ip);
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
