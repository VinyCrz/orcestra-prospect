'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FilterX,
  Plus,
  Search,
} from 'lucide-react';
import { UFS } from '@orcestra/shared';
import { BarraAcoesEmMassa } from '@/components/ej/acoes-em-massa';
import { FiltrosSheet } from '@/components/ej/filtros-sheet';
import { ListasSalvas } from '@/components/ej/listas-salvas';
import { useFiltrosBase } from '@/components/ej/use-opcoes';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useAuth } from '@/lib/auth';
import {
  contarFiltros,
  filtrosDaUrl,
  listaDe,
  querystringFiltros,
  type FiltrosUrl,
} from '@/lib/filtros-ej';
import type { EjLista, ListaEjs } from '@/lib/tipos';

const TODAS = 'todas';
const PAGE_SIZE = 20;
const numero = new Intl.NumberFormat('pt-BR');

interface Coluna {
  id: string;
  titulo: string;
  ordenar?: string;
  classe?: string;
}

/** Em telas pequenas algumas colunas somem (os dados vão para a linha do nome). */
const COLUNAS: Coluna[] = [
  { id: 'nome', titulo: 'Empresa Júnior', ordenar: 'nome' },
  { id: 'ies', titulo: 'IES', classe: 'hidden md:table-cell' },
  { id: 'cidade', titulo: 'Cidade', ordenar: 'cidade', classe: 'hidden sm:table-cell' },
  { id: 'uf', titulo: 'UF', ordenar: 'uf' },
  { id: 'federacao', titulo: 'Federação', classe: 'hidden lg:table-cell' },
  { id: 'responsavel', titulo: 'Responsável', classe: 'hidden xl:table-cell' },
  { id: 'score', titulo: 'Score', ordenar: 'scoreIcp', classe: 'hidden lg:table-cell' },
  { id: 'status', titulo: 'Status', classe: 'hidden sm:table-cell' },
];

const Vazio = () => <span className="text-muted-foreground">—</span>;

function Celula({ id, ej }: { id: string; ej: EjLista }) {
  switch (id) {
    case 'nome': {
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
          <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
            <StatusBadge status={ej.statusProspeccao} />
          </div>
        </div>
      );
    }
    case 'ies':
      return ej.ies ? (
        <span className="line-clamp-1" title={ej.ies.nome}>
          {ej.ies.sigla ?? ej.ies.nome}
        </span>
      ) : (
        <Vazio />
      );
    case 'cidade':
      return ej.cidade ?? <Vazio />;
    case 'uf':
      return <span data-testid="celula-uf">{ej.uf ?? '—'}</span>;
    case 'federacao':
      return ej.federacao?.sigla ?? <Vazio />;
    case 'responsavel':
      return ej.responsavel?.nome ?? <span className="text-muted-foreground">Sem responsável</span>;
    case 'score':
      return <Badge variant="outline">{ej.scoreIcp}</Badge>;
    default:
      return <StatusBadge status={ej.statusProspeccao} />;
  }
}

function ListaEmpresas() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { temPapel } = useAuth();
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const ordenarPor = params.get('ordenarPor') ?? 'nome';
  const ordem = params.get('ordem') === 'desc' ? 'desc' : 'asc';
  const filtros = useMemo(() => filtrosDaUrl(params), [params]);
  const ufs = listaDe(filtros.uf);
  const [busca, setBusca] = useState(params.get('busca') ?? '');
  const buscaDebounced = useDebounce(busca.trim());
  const [selecionadas, setSelecionadas] = useState<Map<string, EjLista>>(new Map());
  const [todosDoFiltro, setTodosDoFiltro] = useState(false);

  function atualizar(novos: Record<string, string | null | undefined>, manterPagina = false) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(novos)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (!manterPagina && !('page' in novos)) p.delete('page');
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  /** Substitui todos os filtros (painel, lista salva), preservando a ordenação. */
  function aplicarFiltros(f: FiltrosUrl) {
    const p = new URLSearchParams();
    for (const k of ['ordenarPor', 'ordem']) if (params.get(k)) p.set(k, params.get(k)!);
    for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
    setBusca(f.busca ?? '');
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  useEffect(() => {
    if ((params.get('busca') ?? '') !== buscaDebounced)
      atualizar({ busca: buscaDebounced || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaDebounced]);

  const filtrosKey = querystringFiltros(filtros);
  useEffect(() => {
    setSelecionadas(new Map());
    setTodosDoFiltro(false);
  }, [filtrosKey]);

  const filtrosQuery = useFiltrosBase();

  const qs = useMemo(
    () =>
      querystringFiltros(filtros, {
        page: String(page),
        pageSize: String(PAGE_SIZE),
        ordenarPor,
        ordem,
      }),
    [filtros, page, ordenarPor, ordem],
  );

  const lista = useQuery({
    queryKey: ['ejs', qs],
    queryFn: () => api<ListaEjs>(`/empresas-juniores?${qs}`),
    placeholderData: keepPreviousData,
  });

  const linhas = lista.data?.items ?? [];
  const contagemUf = new Map((filtrosQuery.data?.ufs ?? []).map((u) => [u.uf, u.total]));
  const temFiltro = contarFiltros(filtros) > 0 || !!filtros.busca;
  const total = lista.data?.total ?? 0;
  const totalPages = lista.data?.totalPages ?? 1;
  const inicio = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const fim = Math.min(page * PAGE_SIZE, total);
  const todasMarcadas = linhas.length > 0 && linhas.every((l) => selecionadas.has(l.id));
  const algumaMarcada = linhas.some((l) => selecionadas.has(l.id));

  function alternarTodas(marcar: boolean) {
    setTodosDoFiltro(false);
    setSelecionadas((atual) => {
      const novo = new Map(atual);
      for (const l of linhas) {
        if (marcar) novo.set(l.id, l);
        else novo.delete(l.id);
      }
      return novo;
    });
  }
  function alternar(l: EjLista, marcar: boolean) {
    setTodosDoFiltro(false);
    setSelecionadas((atual) => {
      const novo = new Map(atual);
      if (marcar) novo.set(l.id, l);
      else novo.delete(l.id);
      return novo;
    });
  }
  function ordenar(campo: string) {
    if (ordenarPor === campo) atualizar({ ordem: ordem === 'asc' ? 'desc' : 'asc' });
    else atualizar({ ordenarPor: campo, ordem: 'asc' });
  }

  const colSpan = COLUNAS.length + 1;
  const nSelecionadas = todosDoFiltro ? total : selecionadas.size;

  return (
    <>
      <PageHeader
        titulo="Empresas Juniores"
        descricao="Base de EJs do Movimento Empresa Júnior: filtre, organize a carteira e acompanhe a prospecção."
        acoes={
          <Button asChild>
            <Link href="/empresas-juniores/nova">
              <Plus /> Nova EJ
            </Link>
          </Button>
        }
      />
      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:flex lg:shrink-0">
            <Select
              value={ufs.length === 1 ? ufs[0] : ufs.length > 1 ? 'varias' : TODAS}
              onValueChange={(v) => atualizar({ uf: v === TODAS || v === 'varias' ? null : v })}
            >
              <SelectTrigger
                className="lg:w-44"
                aria-label="Filtrar por UF"
                data-testid="filtro-uf"
              >
                <SelectValue placeholder="UF">
                  {ufs.length > 1
                    ? `${ufs.length} UFs`
                    : ufs.length === 1
                      ? `${ufs[0]} — ${UFS.find((u) => u.sigla === ufs[0])?.nome ?? ''}`
                      : 'Todas as UFs'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todas as UFs</SelectItem>
                {ufs.length > 1 && (
                  <SelectItem value="varias" disabled>
                    {ufs.length} UFs selecionadas
                  </SelectItem>
                )}
                {UFS.map((u) => (
                  <SelectItem key={u.sigla} value={u.sigla}>
                    {u.sigla} — {u.nome}
                    {contagemUf.has(u.sigla) ? ` (${contagemUf.get(u.sigla)})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FiltrosSheet filtros={filtros} onAplicar={aplicarFiltros} />
            <ListasSalvas filtros={filtros} onAplicar={aplicarFiltros} />
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

        {nSelecionadas > 0 && (
          <BarraAcoesEmMassa
            selecionadas={[...selecionadas.values()]}
            totalFiltro={total}
            filtros={filtros}
            todosDoFiltro={todosDoFiltro}
            onTodosDoFiltro={setTodosDoFiltro}
            podeAtribuir={temPapel('ADMIN', 'GESTOR')}
            onLimpar={() => {
              setSelecionadas(new Map());
              setTodosDoFiltro(false);
            }}
          />
        )}

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Selecionar todas as EJs da página"
                  checked={todasMarcadas}
                  ref={(el) => {
                    if (el) el.indeterminate = algumaMarcada && !todasMarcadas;
                  }}
                  onChange={(e) => alternarTodas(e.target.checked)}
                  disabled={linhas.length === 0}
                />
              </TableHead>
              {COLUNAS.map((c) => (
                <TableHead
                  key={c.id}
                  className={c.classe}
                  aria-sort={
                    c.ordenar && ordenarPor === c.ordenar
                      ? ordem === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  {c.ordenar ? (
                    <button
                      type="button"
                      onClick={() => ordenar(c.ordenar!)}
                      className="-mx-1 inline-flex items-center gap-1 rounded-sm px-1 outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      {c.titulo}
                      {ordenarPor === c.ordenar ? (
                        ordem === 'asc' ? (
                          <ArrowUp className="size-3.5" />
                        ) : (
                          <ArrowDown className="size-3.5" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3.5 opacity-50" />
                      )}
                    </button>
                  ) : (
                    c.titulo
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody
            className={
              lista.isFetching && !lista.isLoading ? 'opacity-60 transition-opacity' : undefined
            }
          >
            {lista.isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="size-4" />
                  </TableCell>
                  {COLUNAS.map((c) => (
                    <TableCell key={c.id} className={c.classe}>
                      <Skeleton className="h-4 w-full max-w-40" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : lista.isError ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-10 text-center text-destructive">
                  Não foi possível carregar as Empresas Juniores.{' '}
                  <Button variant="link" className="h-auto p-0" onClick={() => void lista.refetch()}>
                    Tentar novamente
                  </Button>
                </TableCell>
              </TableRow>
            ) : linhas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-10 text-center text-muted-foreground">
                  Nenhuma Empresa Júnior encontrada com esses filtros.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((ej) => (
                <TableRow
                  key={ej.id}
                  data-testid="linha-ej"
                  data-state={selecionadas.has(ej.id) ? 'selected' : undefined}
                >
                  <TableCell>
                    <Checkbox
                      aria-label={`Selecionar ${ej.nome}`}
                      checked={selecionadas.has(ej.id)}
                      onChange={(e) => alternar(ej, e.target.checked)}
                    />
                  </TableCell>
                  {COLUNAS.map((c) => (
                    <TableCell key={c.id} className={c.classe}>
                      <Celula id={c.id} ej={ej} />
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
              : ' '}
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
              onClick={() => atualizar({ page: page - 1 > 1 ? String(page - 1) : null }, true)}
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
              onClick={() => atualizar({ page: String(page + 1) }, true)}
              aria-label="Próxima página"
            >
              <ChevronRight />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={page >= totalPages}
              onClick={() => atualizar({ page: String(totalPages) }, true)}
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
