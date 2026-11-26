'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { Papel, UsuarioPublico } from '@orcestra/shared';
import {
  aoSessaoExpirar,
  api,
  definirAccessToken,
  renovarSessao,
  type RespostaSessao,
} from './api';

const ROTAS_PUBLICAS = ['/login', '/cadastro', '/esqueci-senha', '/redefinir-senha'];

type Estado = 'carregando' | 'autenticado' | 'anonimo';

interface AuthCtx {
  estado: Estado;
  usuario: UsuarioPublico | null;
  entrar: (email: string, senha: string) => Promise<UsuarioPublico>;
  sair: () => Promise<void>;
  temPapel: (...papeis: Papel[]) => boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<Estado>('carregando');
  const [usuario, setUsuario] = useState<UsuarioPublico | null>(null);
  const estadoRef = useRef<Estado>('carregando');
  estadoRef.current = estado;
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const rotaPublica = ROTAS_PUBLICAS.some((r) => pathname.startsWith(r));

  const limpar = useCallback(() => {
    definirAccessToken(null);
    setUsuario(null);
    setEstado('anonimo');
    qc.clear();
  }, [qc]);

  useEffect(() => {
    let ativo = true;
    aoSessaoExpirar(() => {
      limpar();
      router.replace('/login');
    });
    if (estadoRef.current === 'autenticado') return;
    if (rotaPublica) {
      // Páginas públicas não restauram sessão (o middleware já redireciona quem tem cookie).
      setEstado((e) => (e === 'carregando' ? 'anonimo' : e));
      return;
    }
    renovarSessao()
      .then((s) => {
        if (!ativo) return;
        if (s) {
          setUsuario(s.usuario);
          setEstado('autenticado');
        } else setEstado('anonimo');
      })
      .catch(() => ativo && setEstado('anonimo'));
    return () => {
      ativo = false;
    };
    // Restaura a sessão uma vez ao entrar na área logada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotaPublica]);

  const entrar = useCallback(async (email: string, senha: string) => {
    const s = await api<RespostaSessao>('/auth/login', {
      method: 'POST',
      json: { email, senha },
      semRenovar: true,
    });
    definirAccessToken(s.accessToken);
    setUsuario(s.usuario);
    setEstado('autenticado');
    return s.usuario;
  }, []);

  const sair = useCallback(async () => {
    await api('/auth/logout', { method: 'POST', semRenovar: true }).catch(() => undefined);
    limpar();
    router.replace('/login');
  }, [limpar, router]);

  const temPapel = useCallback(
    (...papeis: Papel[]) => !!usuario && papeis.includes(usuario.papel),
    [usuario],
  );

  const valor = useMemo(
    () => ({ estado, usuario, entrar, sair, temPapel }),
    [estado, usuario, entrar, sair, temPapel],
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
}
