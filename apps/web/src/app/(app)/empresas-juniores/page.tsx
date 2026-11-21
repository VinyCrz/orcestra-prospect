'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FilterX,
  Search,
} from 'lucide-react';
import { UFS, type EmpresaJuniorResumo } from '@orcestra/shared';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { useDebounce } from '@/hooks/use-debounce';
import { api } from '@/lib/api';
import type { Federacao, ListaEjs } from '@/lib/tipos';

const TODAS = 'todas';
const PAGE_SIZE = 20;
const numero = new Intl.NumberFormat('pt-BR');

/** Classes por coluna: em telas pequenas algumas colunas somem (os dados vão para a linha do nome). */
const CLASSE_COLUNA: Record<string, string> = {
  ies: 'hidden md:table-cell',
  cidade: 'hidden sm:table-cell',
  federacao: 'hidden lg:table-cell',
  statusProspeccao: 'hidden sm:table-cell',
};

const colunas: ColumnDef<EmpresaJuniorResumo>[] = [
  {
    header: 'Empresa Júnior',
    accessorKey: 'nome',
    cell: ({ row }) => {
      const ej = row.original;
      // Em telas pequenas as colunas IES/Cidade/Federação ficam ocultas: mostramos um resumo sob o nome.
      const extra = [ej.ies?.sigla ?? ej.ies?.nome, ej.cidade, ej.federacao?.sigla].filter(Boolean);
      return (
        <div className="min-w-0">
          <Link
            href={`/empresas-juniores/${ej.id}`}
            className="font-medium hover:text-primary hover:underline"
          >
            {ej.nome}
          </Link>
          {extra.length > 0 && (
            <p className="mt-0.5 line-clamp-2 text-xs break-words text-muted-foreground md:hidden">
              {extra.join(' · ')}
            </p>
          )}
        </div>
      );
    },
  },
  {
    header: 'IES',
    id: 'ies',
    cell: ({ row }) => {
      const ies = row.original.ies;
      if (!ies) return <span className="text-muted-foreground">—</span>;
      return (
        <span className="line-clamp-1" title={ies.nome}>
          {ies.sigla ?? ies.nome}
        </span>
      );
    },
  },
  {
    header: 'Cidade',
    accessorKey: 'cidade',
    cell: ({ getValue }) =>
      getValue<string | null>() ?? <span className="text-muted-foreground">—</span>,
  },
  {
    header: 'UF',
    accessorKey: 'uf',
    cell: ({ getValue }) => <span data-testid="celula-uf">{getValue<string | null>() ?? '—'}</span>,
  },
  {
    header: 'Federação',
    id: 'federacao',
    cell: ({ row }) =>
      row.original.federacao?.sigla ?? <span className="text-muted-foreground">—</span>,
  },
  {
    header: 'Status',
    accessorKey: 'statusProspeccao',
    cell: ({ row }) => <StatusBadge status={row.original.statusProspeccao} />,
  },
];

function ListaEmpresas() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const uf = params.get('uf') ?? '';
  const federacaoId = params.get('federacao') ?? '';
  const [busca, setBusca] = useState(params.get('busca') ?? '');
  const buscaDebounced = useDebounce(busca.trim());

  function atualizar(novos: Record<string, string | null>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(novos)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (!('page' in novos)) p.delete('page');
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  useEffect(() => {
    if ((params.get('busca') ?? '') !== buscaDebounced)
      atualizar({ busca: buscaDebounced || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaDebounced]);

  const filtrosQuery = useQuery({
    queryKey: ['ejs-filtros'],
    queryFn: () => api<{ ufs: { uf: string; total: number }[] }>('/empresas-juniores/filtros'),
    staleTime: 5 * 60_000,
  });
  const federacoesQuery = useQuery({
    queryKey: ['federacoes'],
    queryFn: () => api<Federacao[]>('/federacoes'),
    staleTime: 5 * 60_000,
  });

  const qs = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (params.get('busca')) p.set('busca', params.get('busca')!);
    if (uf) p.set('uf', uf);
    if (federacaoId) p.set('federacaoId', federacaoId);
    return p.toString();
  }, [page, uf, federacaoId, params]);

  const lista = useQuery({
    queryKey: ['ejs', qs],
    queryFn: () => api<ListaEjs>(`/empresas-juniores?${qs}`),
    placeholderData: keepPreviousData,
  });

  const tabela = useReactTable({
    data: lista.data?.items ?? [],
    columns: colunas,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: lista.data?.totalPages ?? -1,
  });

  const contagemUf = new Map((filtrosQuery.data?.ufs ?? []).map((u) => [u.uf, u.total]));
  const temFiltro = !!(uf || federacaoId || params.get('busca'));
  const total = lista.data?.total ?? 0;
  const totalPages = lista.data?.totalPages ?? 1;
  const inicio = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const fim = Math.min(page * PAGE_SIZE, total);

  return (
    <>
      <PageHeader
        titulo="Empresas Juniores"
        descricao="Base pública de EJs do Movimento Empresa Júnior. Somente leitura nesta etapa."
      />
      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome…"
              className="pl-9"
              aria-label="Buscar por nome"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:flex md:shrink-0">
            <Select
              value={uf || TODAS}
              onValueChange={(v) => atualizar({ uf: v === TODAS ? null : v })}
            >
              <SelectTrigger
                className="md:w-44"
                aria-label="Filtrar por UF"
                data-testid="filtro-uf"
              >
                <SelectValue placeholder="UF">
                  {uf ? `${uf} — ${UFS.find((u) => u.sigla === uf)?.nome ?? ''}` : 'Todas as UFs'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todas as UFs</SelectItem>
                {UFS.map((u) => (
                  <SelectItem key={u.sigla} value={u.sigla}>
                    {u.sigla} — {u.nome}
                    {contagemUf.has(u.sigla) ? ` (${contagemUf.get(u.sigla)})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={federacaoId || TODAS}
              onValueChange={(v) => atualizar({ federacao: v === TODAS ? null : v })}
            >
              <SelectTrigger
                className="md:w-52"
                aria-label="Filtrar por federação"
                data-testid="filtro-federacao"
              >
                <SelectValue placeholder="Federação">
                  {!federacaoId
                    ? 'Todas as federações'
                    : federacaoId === 'nenhuma'
                      ? 'Sem federação confirmada'
                      : (federacoesQuery.data?.find((f) => f.id === federacaoId)?.sigla ??
                        'Federação')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todas as federações</SelectItem>
                {(federacoesQuery.data ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.sigla} ({f.totalEmpresas})
                  </SelectItem>
                ))}
                <SelectItem value="nenhuma">Sem federação confirmada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {temFiltro && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setBusca('');
                router.replace(pathname, { scroll: false });
              }}
            >
              <FilterX /> Limpar
            </Button>
          )}
        </div>

        <Table>
          <TableHeader>
            {tabela.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className={CLASSE_COLUNA[h.column.id]}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody
            className={
              lista.isFetching && !lista.isLoading ? 'opacity-60 transition-opacity' : undefined
            }
          >
            {lista.isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {colunas.map((c, j) => (
                    <TableCell
                      key={j}
                      className={
                        CLASSE_COLUNA[c.id ?? (c as { accessorKey?: string }).accessorKey ?? '']
                      }
                    >
                      <Skeleton className="h-4 w-full max-w-40" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : lista.isError ? (
              <TableRow>
                <TableCell colSpan={colunas.length} className="py-10 text-center text-destructive">
                  Não foi possível carregar as Empresas Juniores.
                </TableCell>
              </TableRow>
            ) : tabela.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={colunas.length}
                  className="py-10 text-center text-muted-foreground"
                >
                  Nenhuma Empresa Júnior encontrada com esses filtros.
                </TableCell>
              </TableRow>
            ) : (
              tabela.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-testid="linha-ej">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={CLASSE_COLUNA[cell.column.id]}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex flex-col items-center justify-between gap-3 border-t p-4 text-sm sm:flex-row">
          <p className="text-muted-foreground" data-testid="resumo-paginacao">
            {lista.data
              ? `${numero.format(inicio)}–${numero.format(fim)} de ${numero.format(total)} EJs`
              : ' '}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              disabled={page <= 1}
              onClick={() => atualizar({ page: null })}
              aria-label="Primeira página"
            >
              <ChevronsLeft />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={page <= 1}
              onClick={() => atualizar({ page: page - 1 > 1 ? String(page - 1) : null })}
              aria-label="Página anterior"
            >
              <ChevronLeft />
            </Button>
            <span className="px-3 tabular-nums">
              Página {page} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              disabled={page >= totalPages}
              onClick={() => atualizar({ page: String(page + 1) })}
              aria-label="Próxima página"
            >
              <ChevronRight />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={page >= totalPages}
              onClick={() => atualizar({ page: String(totalPages) })}
              aria-label="Última página"
            >
              <ChevronsRight />
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}

export default function EmpresasJunioresPage() {
  return (
    <Suspense>
      <ListaEmpresas />
    </Suspense>
  );
}
