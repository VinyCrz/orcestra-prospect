'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Briefcase,
  ScrollText,
  ShieldCheck,
  Shield,
  FileText,
  Repeat,
  Building2,
  CalendarCheck,
  KanbanSquare,
  Gauge,
  LayoutDashboard,
  Target,
  ListX,
  Loader2,
  LogOut,
  Menu,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { PAPEL_LABEL, type Papel } from '@orcestra/shared';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { ContadorTarefas } from '@/lib/tipos-funil';
import { cn } from '@/lib/utils';

interface ItemNav {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  papeis?: Papel[];
}

const SECOES: { titulo: string; itens: ItemNav[] }[] = [
  {
    titulo: 'Prospecção',
    itens: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/empresas-juniores', label: 'Empresas Juniores', icon: Building2 },
      { href: '/funil', label: 'Funil', icon: KanbanSquare },
      { href: '/agenda', label: 'Agenda', icon: CalendarCheck },
    ],
  },
  {
    titulo: 'Contato',
    itens: [
      { href: '/templates', label: 'Templates', icon: FileText },
      { href: '/cadencias', label: 'Cadências', icon: Repeat },
    ],
  },
  {
    titulo: 'Gestão',
    itens: [
      { href: '/carteira', label: 'Carteira', icon: Briefcase, papeis: ['ADMIN', 'GESTOR'] },
      { href: '/importacoes', label: 'Importações', icon: Upload, papeis: ['ADMIN', 'GESTOR'] },
      { href: '/configuracoes/metas', label: 'Metas do time', icon: Target, papeis: ['ADMIN'] },
    ],
  },
  {
    titulo: 'Configurações',
    itens: [
      { href: '/usuarios', label: 'Usuários', icon: Users, papeis: ['ADMIN'] },
      { href: '/configuracoes/score', label: 'Score de ICP', icon: Gauge, papeis: ['ADMIN'] },
      {
        href: '/configuracoes/motivos-perda',
        label: 'Motivos de perda',
        icon: ListX,
        papeis: ['ADMIN'],
      },
      { href: '/configuracoes/auditoria', label: 'Auditoria', icon: ScrollText, papeis: ['ADMIN'] },
      {
        href: '/configuracoes/lgpd',
        label: 'LGPD e retenção',
        icon: ShieldCheck,
        papeis: ['ADMIN'],
      },
    ],
  },
];
const RODAPE: ItemNav = { href: '/politica-de-dados', label: 'Política de dados', icon: Shield };

const todosItens = [...SECOES.flatMap((s) => s.itens), RODAPE];

/** Badge com o total de tarefas atrasadas; atualiza a cada 60s e após mutações (invalidação). */
function BadgeAtrasadas() {
  const q = useQuery({
    queryKey: ['tarefas-contador'],
    queryFn: () => api<ContadorTarefas>('/tarefas/contador'),
    refetchInterval: 60_000,
  });
  const n = q.data?.atrasadas ?? 0;
  if (n <= 0) return null;
  return (
    <span
      className="ml-auto grid min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-white"
      data-testid="badge-atrasadas"
    >
      {n}
      <span className="sr-only"> tarefa{n === 1 ? '' : 's'} atrasada{n === 1 ? '' : 's'}</span>
    </span>
  );
}

function iniciais(nome: string) {
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { estado, usuario, sair, temPapel } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuAberto, setMenuAberto] = useState(false);

  useEffect(() => {
    if (estado === 'anonimo') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [estado, pathname, router]);

  useEffect(() => setMenuAberto(false), [pathname]);

  if (estado !== 'autenticado' || !usuario) {
    return (
      <div className="grid min-h-svh place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Carregando" />
      </div>
    );
  }

  const pode = (i: ItemNav) => !i.papeis || temPapel(...i.papeis);
  const ehAtivo = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const atual = todosItens.find((i) => ehAtivo(i.href));
  const link = ({ href, label, icon: Icon }: ItemNav) => {
    const ativo = ehAtivo(href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={ativo ? 'page' : undefined}
        className={cn(
          'group flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
          ativo
            ? 'bg-primary/10 font-semibold text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <Icon
          className={cn(
            'size-4 shrink-0',
            ativo ? 'text-primary' : 'text-muted-foreground/80 group-hover:text-foreground',
          )}
        />
        {label}
        {href === '/agenda' && <BadgeAtrasadas />}
      </Link>
    );
  };
  const nav = (
    <nav className="flex flex-1 flex-col gap-5" aria-label="Navegação principal">
      {SECOES.map((secao) => {
        const itens = secao.itens.filter(pode);
        if (!itens.length) return null;
        return (
          <div key={secao.titulo} className="grid gap-0.5">
            <p className="px-2.5 pb-1 text-[0.68rem] font-semibold tracking-wider text-muted-foreground/70 uppercase">
              {secao.titulo}
            </p>
            {itens.map(link)}
          </div>
        );
      })}
      <div className="mt-auto grid gap-0.5 border-t pt-3">{link(RODAPE)}</div>
    </nav>
  );

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden border-r bg-sidebar lg:sticky lg:top-0 lg:flex lg:h-svh lg:flex-col lg:gap-6 lg:overflow-y-auto lg:px-3 lg:py-4">
        <Logo completa className="px-2 pt-1" />
        {nav}
      </aside>

      {menuAberto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuAberto(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col gap-6 overflow-y-auto border-r bg-sidebar p-4">
            <div className="flex items-center justify-between">
              <Logo completa />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMenuAberto(false)}
                aria-label="Fechar menu"
              >
                <X />
              </Button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/75 px-4 backdrop-blur-md lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMenuAberto(true)}
            aria-label="Abrir menu"
          >
            <Menu />
          </Button>
          <Logo className="lg:hidden" />
          {atual && (
            <p className="hidden text-sm font-medium text-muted-foreground lg:block">
              {atual.label}
            </p>
          )}
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2" aria-label="Menu do usuário">
                  <span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {iniciais(usuario.nome)}
                  </span>
                  <span className="hidden text-sm sm:inline">{usuario.nome}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="font-medium">{usuario.nome}</div>
                  <div className="text-xs font-normal text-muted-foreground">{usuario.email}</div>
                  <div className="mt-1 text-xs font-normal text-primary">
                    {PAPEL_LABEL[usuario.papel]}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void sair()}>
                  <LogOut /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:px-8 lg:py-7">{children}</main>
      </div>
    </div>
  );
}

/** Proteção por papel no front (a API também valida). */
export function SomentePapeis({
  papeis,
  children,
}: {
  papeis: Papel[];
  children: React.ReactNode;
}) {
  const { temPapel } = useAuth();
  const router = useRouter();
  const permitido = temPapel(...papeis);
  useEffect(() => {
    if (!permitido) router.replace('/empresas-juniores');
  }, [permitido, router]);
  return permitido ? <>{children}</> : null;
}
