'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { GripVertical, Loader2, MoveRight, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  STATUS_PROSPECCAO,
  STATUS_PROSPECCAO_LABEL,
  type StatusProspeccao,
} from '@orcestra/shared';
import { useFiltrosBase, useOpcoesResponsaveis } from '@/components/ej/use-opcoes';
import { FaixaBadge } from '@/components/faixa-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useDebounce } from '@/hooks/use-debounce';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { CardKanban, ColunaKanban, RespostaKanban } from '@/lib/tipos-funil';
import { cn } from '@/lib/utils';
import { MudarStatusDialog, type DadosStatus } from './status-dialog';

const TODOS = '__todos__';
const EXIGE_DIALOGO: StatusProspeccao[] = ['PERDIDA', 'NUTRICAO'];

type Colunas = Record<StatusProspeccao, ColunaKanban>;

function vazias(): Colunas {
  return Object.fromEntries(
    STATUS_PROSPECCAO.map((s) => [s, { status: s, total: 0, items: [], proximoCursor: null }]),
  ) as unknown as Colunas;
}

interface Movimento {
  card: CardKanban;
  para: StatusProspeccao;
}

function CardConteudo({
  card,
  alca,
  menu,
}: {
  card: CardKanban;
  alca?: React.ReactNode;
  menu?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-1">
      {alca}
      <div className="min-w-0 flex-1">
        <Link
          href={`/empresas-juniores/${card.id}`}
          className="block truncate text-sm font-medium hover:underline focus-visible:underline"
          title={card.nome}
        >
          {card.nome}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {[card.uf, card.ies?.sigla ?? card.ies?.nome].filter(Boolean).join(' · ') || 'Sem localização'}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <FaixaBadge faixa={card.faixaIcp} score={card.scoreIcp} />
          <span className="truncate text-xs text-muted-foreground">
            {card.responsavel?.nome ?? 'Sem responsável'}
          </span>
        </div>
      </div>
      {menu}
    </div>
  );
}

function CardArrastavel({
  card,
  onMover,
}: {
  card: CardKanban;
  onMover: (c: CardKanban, para: StatusProspeccao) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: card.id,
    data: { card },
    disabled: !card.podeEditar,
  });
  return (
    <li
      ref={setNodeRef}
      className={cn(
        'rounded-md border bg-card p-2.5 text-card-foreground shadow-xs',
        isDragging && 'opacity-40',
      )}
      data-testid={`card-${card.id}`}
    >
      <CardConteudo
        card={card}
        alca={
          card.podeEditar && (
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...listeners}
              {...attributes}
              aria-label={`Arrastar ${card.nome}`}
              className="mt-0.5 grid size-6 shrink-0 cursor-grab touch-none place-items-center rounded text-muted-foreground outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <GripVertical className="size-4" />
            </button>
          )
        }
        menu={
          card.podeEditar && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={`Mover ${card.nome} para…`}
                >
                  <MoveRight />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Mover para…</DropdownMenuLabel>
                {STATUS_PROSPECCAO.filter((s) => s !== card.statusProspeccao).map((s) => (
                  <DropdownMenuItem key={s} onSelect={() => onMover(card, s)}>
                    {STATUS_PROSPECCAO_LABEL[s]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />
    </li>
  );
}

function ColunaView({
  coluna,
  carregandoMais,
  onMais,
  onMover,
}: {
  coluna: ColunaKanban;
  carregandoMais: boolean;
  onMais: (s: StatusProspeccao) => void;
  onMover: (c: CardKanban, para: StatusProspeccao) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: coluna.status });
  return (
    <section
      aria-label={`${STATUS_PROSPECCAO_LABEL[coluna.status]}, ${coluna.total} EJs`}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-lg border bg-muted/50 transition-colors',
        isOver && 'border-primary bg-accent',
      )}
      data-testid={`coluna-${coluna.status}`}
    >
      <header className="flex items-center justify-between gap-2 px-3 py-2.5">
        <h2 className="truncate text-sm font-semibold">{STATUS_PROSPECCAO_LABEL[coluna.status]}</h2>
        <Badge variant="secondary" data-testid={`total-${coluna.status}`}>
          {coluna.total}
        </Badge>
      </header>
      <ul
        ref={setNodeRef}
        className="flex max-h-[calc(100svh-19rem)] min-h-24 flex-col gap-2 overflow-y-auto px-2 pb-2"
      >
        {coluna.items.map((c) => (
          <CardArrastavel key={c.id} card={c} onMover={onMover} />
        ))}
        {coluna.items.length === 0 && (
          <li className="px-1 py-4 text-center text-xs text-muted-foreground">Nenhuma EJ</li>
        )}
        {coluna.proximoCursor && (
          <li>
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              disabled={carregandoMais}
              onClick={() => onMais(coluna.status)}
            >
              {carregandoMais && <Loader2 className="animate-spin" />}
              Carregar mais
            </Button>
          </li>
        )}
      </ul>
    </section>
  );
}

export function Kanban() {
  const { usuario } = useAuth();
  const [resp, setResp] = useState(TODOS);
  const [uf, setUf] = useState(TODOS);
  const [busca, setBusca] = useState('');
  const buscaDeb = useDebounce(busca.trim(), 350);
  const [colunas, setColunas] = useState<Colunas>(vazias);
  const [carregandoMais, setCarregandoMais] = useState<StatusProspeccao | null>(null);
  const [ativo, setAtivo] = useState<CardKanban | null>(null);
  const [pendente, setPendente] = useState<Movimento | null>(null);
  const [aviso, setAviso] = useState('');

  const ufs = useFiltrosBase();
  const responsaveis = useOpcoesResponsaveis();

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (resp !== TODOS) p.set('responsavelId', resp);
    if (uf !== TODOS) p.set('uf', uf);
    if (buscaDeb) p.set('busca', buscaDeb);
    return p;
  }, [resp, uf, buscaDeb]);

  const q = useQuery({
    queryKey: ['kanban', params.toString()],
    queryFn: () => api<RespostaKanban>(`/funil/kanban?${params.toString()}`),
    staleTime: 0,
    // Mantém o quadro montado ao trocar filtro/busca (sem piscar skeleton nem fechar menus abertos).
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!q.data) return;
    const c = vazias();
    for (const col of q.data.colunas) c[col.status] = col;
    setColunas(c);
  }, [q.data]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const maisCards = useCallback(
    async (status: StatusProspeccao) => {
      const cursor = colunas[status].proximoCursor;
      if (!cursor) return;
      setCarregandoMais(status);
      try {
        const p = new URLSearchParams(params);
        p.set('status', status);
        p.set('cursor', cursor);
        const r = await api<RespostaKanban>(`/funil/kanban?${p.toString()}`);
        const nova = r.colunas[0];
        setColunas((atual) => {
          const ids = new Set(atual[status].items.map((i) => i.id));
          return {
            ...atual,
            [status]: {
              ...atual[status],
              total: nova.total,
              items: [...atual[status].items, ...nova.items.filter((i) => !ids.has(i.id))],
              proximoCursor: nova.proximoCursor,
            },
          };
        });
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : 'Erro ao carregar mais EJs');
      } finally {
        setCarregandoMais(null);
      }
    },
    [colunas, params],
  );

  /** Atualização otimista; em erro restaura o estado anterior. */
  async function aplicar(card: CardKanban, para: StatusProspeccao, dados?: DadosStatus) {
    const de = card.statusProspeccao;
    const anterior = colunas;
    setColunas({
      ...colunas,
      [de]: {
        ...colunas[de],
        total: Math.max(0, colunas[de].total - 1),
        items: colunas[de].items.filter((i) => i.id !== card.id),
      },
      [para]: {
        ...colunas[para],
        total: colunas[para].total + 1,
        items: [{ ...card, statusProspeccao: para }, ...colunas[para].items],
      },
    });
    setAviso(`${card.nome} movida para ${STATUS_PROSPECCAO_LABEL[para]}`);
    try {
      await api(`/empresas-juniores/${card.id}/status`, {
        method: 'PATCH',
        json: dados ?? { status: para },
      });
      void q.refetch();
    } catch (e) {
      setColunas(anterior);
      setAviso(`Não foi possível mover ${card.nome}`);
      toast.error(e instanceof ApiError ? e.message : 'Erro ao mover a EJ');
    }
  }

  function pedirMovimento(card: CardKanban, para: StatusProspeccao) {
    if (para === card.statusProspeccao) return;
    if (EXIGE_DIALOGO.includes(para)) setPendente({ card, para });
    else void aplicar(card, para);
  }

  function aoSoltar(e: DragEndEvent) {
    setAtivo(null);
    const card = e.active.data.current?.card as CardKanban | undefined;
    const para = e.over?.id as StatusProspeccao | undefined;
    if (card && para && STATUS_PROSPECCAO.includes(para)) pedirMovimento(card, para);
  }

  const nomeCard = (id: unknown) =>
    STATUS_PROSPECCAO.flatMap((s) => colunas[s].items).find((i) => i.id === id)?.nome ?? 'EJ';
  const nomeColuna = (id: unknown) =>
    STATUS_PROSPECCAO_LABEL[id as StatusProspeccao] ?? 'fora das colunas';

  const outros = (responsaveis.data?.usuarios ?? []).filter((u) => u.id !== usuario?.id);
  const temFiltro = resp !== TODOS || uf !== TODOS || buscaDeb !== '';
  const totalGeral = STATUS_PROSPECCAO.reduce((n, s) => n + colunas[s].total, 0);

  return (
    <div className="min-w-0">
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_200px_160px]">
        <div className="grid gap-1.5">
          <Label htmlFor="kb-busca">Buscar</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <Input
              id="kb-busca"
              className="pl-9"
              placeholder="Nome da EJ…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="kb-resp">Responsável</Label>
          <Select value={resp} onValueChange={setResp}>
            <SelectTrigger id="kb-resp" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos</SelectItem>
              <SelectItem value="eu">Minhas EJs</SelectItem>
              <SelectItem value="nenhum">Sem responsável</SelectItem>
              {outros.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="kb-uf">UF</Label>
          <Select value={uf} onValueChange={setUf}>
            <SelectTrigger id="kb-uf" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas</SelectItem>
              {(ufs.data?.ufs ?? []).map((u) => (
                <SelectItem key={u.uf} value={u.uf}>
                  {u.uf}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {q.isLoading ? (
        <div className="flex gap-3 overflow-hidden" aria-busy="true" aria-label="Carregando funil">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-72 w-72 shrink-0" />
          ))}
        </div>
      ) : q.isError ? (
        <div className="rounded-md border p-6 text-center" role="alert">
          <p className="text-sm text-destructive">Erro ao carregar o funil.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void q.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <>
          {totalGeral === 0 && (
            <p className="mb-3 text-sm text-muted-foreground">
              {temFiltro
                ? 'Nenhuma Empresa Júnior encontrada com esses filtros.'
                : 'Nenhuma Empresa Júnior no funil.'}
            </p>
          )}
          <DndContext
            sensors={sensors}
            onDragStart={(e: DragStartEvent) => setAtivo((e.active.data.current?.card as CardKanban) ?? null)}
            onDragEnd={aoSoltar}
            onDragCancel={() => setAtivo(null)}
            accessibility={{
              screenReaderInstructions: {
                draggable:
                  'Para pegar a EJ, pressione espaço ou Enter. Use as setas esquerda e direita para escolher a coluna e pressione espaço ou Enter para soltar. Esc cancela.',
              },
              announcements: {
                onDragStart: ({ active }) => `Pegou ${nomeCard(active.id)}.`,
                onDragOver: ({ active, over }) =>
                  over ? `${nomeCard(active.id)} sobre a coluna ${nomeColuna(over.id)}.` : undefined,
                onDragEnd: ({ active, over }) =>
                  over
                    ? `${nomeCard(active.id)} solta em ${nomeColuna(over.id)}.`
                    : `${nomeCard(active.id)} solta fora das colunas.`,
                onDragCancel: ({ active }) => `Movimento de ${nomeCard(active.id)} cancelado.`,
              },
            }}
          >
            <div
              className="flex gap-3 overflow-x-auto pb-3"
              role="region"
              aria-label="Colunas do funil"
              tabIndex={0}
            >
              {STATUS_PROSPECCAO.map((s) => (
                <ColunaView
                  key={s}
                  coluna={colunas[s]}
                  carregandoMais={carregandoMais === s}
                  onMais={(st) => void maisCards(st)}
                  onMover={pedirMovimento}
                />
              ))}
            </div>
            <DragOverlay>
              {ativo && (
                <div className="rounded-md border bg-card p-2.5 shadow-md">
                  <CardConteudo card={ativo} />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {aviso}
      </p>

      <MudarStatusDialog
        aberto={!!pendente}
        onFechar={() => setPendente(null)}
        titulo={pendente ? `Mover para ${STATUS_PROSPECCAO_LABEL[pendente.para]}` : undefined}
        descricao={pendente && <>Empresa Júnior: {pendente.card.nome}</>}
        statusAlvo={pendente?.para}
        onConfirmar={(d) => {
          if (!pendente) return;
          const { card, para } = pendente;
          setPendente(null);
          void aplicar(card, para, d);
        }}
      />
    </div>
  );
}
