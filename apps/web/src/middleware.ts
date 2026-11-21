import { NextResponse, type NextRequest } from 'next/server';

const PUBLICAS = ['/login', '/esqueci-senha', '/redefinir-senha'];
const REFRESH_COOKIE = 'orc_refresh';

/** Proteção de rotas: sem cookie de sessão, redireciona para o login. O papel é checado no layout e na API. */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const publica = PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const temSessao = req.cookies.has(REFRESH_COOKIE);
  if (!publica && !temSessao) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname !== '/' ? `?next=${encodeURIComponent(pathname + search)}` : '';
    return NextResponse.redirect(url);
  }
  if (pathname === '/login' && temSessao) {
    // Sessão possivelmente válida: tenta a área logada (se o refresh falhar, o cookie é limpo e volta ao login).
    const url = req.nextUrl.clone();
    url.pathname = '/empresas-juniores';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)'],
};
