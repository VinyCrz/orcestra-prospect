'use client';
import { Fragment, Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, FilterX } from 'lucide-react';
import type { UsuarioPublico } from '@orcestra/shared';
import { SomentePapeis } from '@/components/app-shell';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { useDebounce } from '@/hooks/use-debounce';

interface Registro {
  id: string;
  usuarioId: string | null;
  acao: string;
  entidade: string;
  entidadeId: string | null;
  dados: unknown;
  ip: string | null;
  criadoEm: string;
  usuario: { id: string; nome: string; email: string } | null;
}
interface Pagina {
  total: number;
  page: number;
  pageSize: number;
  itens: Registro[];
}

const PAGE_SIZE = 25;
const TODOS = 'todos';
const fmtSp = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'America/Sao_Paulo',
});

const eObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function valorTexto(v: unknown): string {
  if (v === undefined) return '—';
  if (v === null) return 'vazio';
  if (typeof v === 'string') return v === '' ? '(vazio)' : v;
  return JSON.stringify(v);
}

/** Mostra antes/depois como lista de campos alterados; outros formatos aparecem como JSON. */
function DadosDiff({ dados }: { dados: unknown }) {
  if (dados === null || dados === undefined)
    return <p className="text-sm text-muted-foreground">Sem dados adicionais.</p>;
  if (eObjeto(dados) && ('antes' in dados || 'depois' in dados)) {
    const antes = eObjeto(dados.antes) ? dados.antes : {};
    const depois = eObjeto(dados.depois) ? dados.depois : {};
    const resto = Object.fromEntries(
      Object.entries(dados).filter(([k]) => k !== 'antes' && k !== 'depois'),
    );
    const campos = [...new Set([...Object.keys(antes), ...Object.keys(depois)])].filter(
      (k) => JSON.stringify(antes[k]) !== JSON.stringify(depois[k]),
    );
    return (
      <div className="grid gap-3">
        {campos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum campo alterado.</p>
        ) : (
          <dl className="grid gap-2 text-sm" data-testid="diff">
            {campos.map((k) => (
              <div key={k} className="grid gap-1 sm:grid-cols-[180px_1fr_1fr] sm:gap-3">
                <dt className="font-medium">{k}</dt>
                <dd className="break-words rounded-md bg-destructive/10 px-2 py-1 text-destructive">
                  <span className="sr-only">Antes: </span>
                  {valorTexto(antes[k])}
                </dd>
                <dd className="break-words rounded-md bg-success/15 px-2 py-1 text-success">
                  <span className="sr-only">Depois: </span>
                  {valorTexto(depois[k])}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {Object.keys(resto).length > 0 && <Json valor={resto} />}
      </div>
    );
  }
  return <Json valor={dados} />;
}

function Json({ valor }: { valor: unknown }) {
  return (
    <pre className="max-h-64 overflow-auto rounded-md bg-muted p-2 text-xs">
      {JSON.stringify(valor, null, 2)}
    </pre>
  );
}

function Auditoria() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [aberta, setAberta] = useState<string | null>(null);
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const usuarioId = params.get('usuarioId') ?? '';
  const acao = params.get('acao') ?? '';
  const entidade = params.get('entidade') ?? '';
  const de = params.get('de') ?? '';
  const ate = params.get('ate') ?? '';
  const [entidadeId, setEntidadeId] = useState(params.get('entidadeId') ?? '');
  const entidadeIdDeb = useDebounce(entidadeId.trim());
  const [entidadeTxt, setEntidadeTxt] = useState(entidade);
  const entidadeDeb = useDebounce(entidadeTxt.trim());

  function atualizar(mudancas: Record<string, string | undefined>, resetPagina = true) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(mudancas)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (resetPagina) p.delete('page');
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // texto livre: sincroniza com a URL após o debounce
  const idUrl = params.get('entidadeId') ?? '';
  useEffect(() => {
    if (entidadeIdDeb !== idUrl || entidadeDeb !== entidade)
      atualizar({ entidadeId: entidadeIdDeb || undefined, entidade: entidadeDeb || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entidadeIdDeb, entidadeDeb]);

  const usuarios = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => api<UsuarioPublico[]>('/usuarios'),
  });
  const acoes = useQuery({
    queryKey: ['audit-acoes'],
    queryFn: () => api<string[]>('/audit-logs/acoes'),
  });

  const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (usuarioId) qs.set('usuarioId', usuarioId);
  if (acao) qs.set('acao', acao);
  if (entidade) qs.set('entidade', entidade);
  if (params.get('entidadeId')) qs.set('entidadeId', params.get('entidadeId')!);
  if (de) qs.set('de', de);
  if (ate) qs.set('ate', ate);
  const q = useQuery({
    queryKey: ['audit-logs', qs.toString()],
    queryFn: () => api<Pagina>(`/audit-logs?${qs}`),
    placeholderData: (a) => a,
  });

  const totalPaginas = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;
  const temFiltro = !!(usuarioId || acao || entidade || params.get('entidadeId') || de || ate);

  return (
    <>
      <PageHeader
        titulo="Auditoria"
        descricao="Registro de alterações relevantes. Datas no horário de Brasília."
      />
      <Card className="mb-4 p-4">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(e) => e.preventDefault()}
          aria-label="Filtros"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="f-usuario">Usuário</Label>
            <Select
              value={usuarioId || TODOS}
              onValueChange={(v) => atualizar({ usuarioId: v === TODOS ? undefined : v })}
            >
              <SelectTrigger id="f-usuario">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {(usuarios.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="f-acao">Ação</Label>
            <Select
              value={acao || TODOS}
              onValueChange={(v) => atualizar({ acao: v === TODOS ? undefined : v })}
            >
              <SelectTrigger id="f-acao">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas</SelectItem>
                {(acoes.data ?? []).map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="f-entidade">Entidade</Label>
            <Input
              id="f-entidade"
              placeholder="ex.: Contato"
              value={entidadeTxt}
              onChange={(e) => setEntidadeTxt(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="f-entidade-id">ID da entidade</Label>
            <Input
              id="f-entidade-id"
              value={entidadeId}
              onChange={(e) => setEntidadeId(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="f-de">De</Label>
            <Input
              id="f-de"
              type="date"
              value={de}
              max={ate || undefined}
              onChange={(e) => atualizar({ de: e.target.value || undefined })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="f-ate">Até</Label>
            <Input
              id="f-ate"
              type="date"
              value={ate}
              min={de || undefined}
              onChange={(e) => atualizar({ ate: e.target.value || undefined })}
            />
          </div>
          {temFiltro && (
            <div className="sm:col-span-2 lg:col-span-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEntidadeId('');
                  setEntidadeTxt('');
                  router.replace(pathname, { scroll: false });
                }}
              >
                <FilterX /> Limpar filtros
              </Button>
            </div>
          )}
        </form>
      </Card>

      {q.isError ? (
        <Card className="p-6 text-sm text-destructive" role="alert">
          Não foi possível carregar a auditoria.{' '}
          <Button variant="link" className="h-auto p-0" onClick={() => void q.refetch()}>
            Tentar novamente
          </Button>
        </Card>
      ) : (
        <Card className="gap-0 overflow-x-auto py-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">
                  <span className="sr-only">Detalhes</span>
                </TableHead>
                <TableHead>Data (SP)</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead className="hidden md:table-cell">Entidade</TableHead>
                <TableHead className="hidden lg:table-cell">IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : (q.data?.itens ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Nenhum registro encontrado para os filtros.
                  </TableCell>
                </TableRow>
              ) : (
                q.data!.itens.map((r) => {
                  const expandida = aberta === r.id;
                  return (
                    <Fragment key={r.id}>
                      <TableRow data-testid="audit-linha">
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-expanded={expandida}
                            aria-label={`${expandida ? 'Ocultar' : 'Ver'} detalhes de ${r.acao}`}
                            onClick={() => setAberta(expandida ? null : r.id)}
                          >
                            {expandida ? <ChevronUp /> : <ChevronDown />}
                          </Button>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {fmtSp.format(new Date(r.criadoEm))}
                        </TableCell>
                        <TableCell>{r.usuario?.nome ?? <span className="text-muted-foreground">Sistema</span>}</TableCell>
                        <TableCell className="font-medium">{r.acao}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          {r.entidade}
                          {r.entidadeId && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              {r.entidadeId.slice(0, 8)}…
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground lg:table-cell">
                          {r.ip ?? '—'}
                        </TableCell>
                      </TableRow>
                      {expandida && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={6} className="bg-muted/30">
                            <div className="grid gap-2 p-1">
                              <p className="text-xs text-muted-foreground md:hidden">
                                {r.entidade} {r.entidadeId} · IP {r.ip ?? '—'}
                              </p>
                              <DadosDiff dados={r.dados} />
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {q.data && q.data.total > 0 && (
        <nav className="mt-4 flex items-center justify-between gap-2 text-sm" aria-label="Paginação">
          <span className="text-muted-foreground">
            {q.data.total} registro(s) · página {page} de {totalPaginas}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => atualizar({ page: String(page - 1) }, false)}
            >
              <ChevronLeft /> Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPaginas}
              onClick={() => atualizar({ page: String(page + 1) }, false)}
            >
              Próxima <ChevronRight />
            </Button>
          </div>
        </nav>
      )}
    </>
  );
}

export default function AuditoriaPage() {
  return (
    <SomentePapeis papeis={['ADMIN']}>
      <Suspense>
        <Auditoria />
      </Suspense>
    </SomentePapeis>
  );
}
