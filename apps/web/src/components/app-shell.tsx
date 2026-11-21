'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Briefcase, Building2, Loader2, LogOut, Menu, Upload, Users, X } from 'lucide-react';
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
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

interface ItemNav {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  papeis?: Papel[];
}

const NAV: ItemNav[] = [
  { href: '/empresas-juniores', label: 'Empresas Juniores', icon: Building2 },
  { href: '/carteira', label: 'Carteira', icon: Briefcase, papeis: ['ADMIN', 'GESTOR'] },
  { href: '/importacoes', label: 'Importações', icon: Upload, papeis: ['ADMIN', 'GESTOR'] },
  { href: '/usuarios', label: 'Usuários', icon: Users, papeis: ['ADMIN'] },
];

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

  const itens = NAV.filter((i) => !i.papeis || temPapel(...i.papeis));
  const nav = (
    <nav className="grid gap-1" aria-label="Navegação principal">
      {itens.map(({ href, label, icon: Icon }) => {
        const ativo = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              ativo
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="hidden border-r bg-sidebar lg:flex lg:flex-col lg:gap-6 lg:p-4">
        <Logo className="px-2 pt-1" />
        {nav}
      </aside>

      {menuAberto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuAberto(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col gap-6 border-r bg-sidebar p-4">
            <div className="flex items-center justify-between">
              <Logo />
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
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur lg:px-6">
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
        <main className="flex-1 p-4 lg:p-6">{children}</main>
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
