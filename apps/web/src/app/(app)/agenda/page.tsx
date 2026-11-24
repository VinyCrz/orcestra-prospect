'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, CalendarClock, Check, Loader2, MessageSquareText, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ORIGEM_TAREFA_LABEL, type FaseTarefa } from '@orcestra/shared';
import { MensagemDialog } from '@/components/cadencias/mensagem-dialog';
import { useOpcoesResponsaveis } from '@/components/ej/use-opcoes';
import { PrioridadesSemana } from '@/components/score/prioridades-semana';
import { PageHeader } from '@/components/page-header';
import { CalendarioTarefas, dataUtcIso, hojeAgenda, mesAgenda } from '@/components/tarefas/calendario-tarefas';
import { KanbanTarefas, type FaseNovaTarefa } from '@/components/tarefas/kanban-tarefas';
import { AdiarDataDialog, invalidarTarefas, TarefaDialog } from '@/components/tarefas/tarefa-dialogs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Agenda, Tarefa, TarefaAgenda } from '@/lib/tipos-funil';

const dataBr = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

function LinhaTarefa({
  t,
  atrasada,
  somenteLeitura,
  onAdiarData,
  onMensagem,
}: {
  t: Tarefa;
  atrasada?: boolean;
  somenteLeitura?: boolean;
  onAdiarData: (id: string) => void;
  onMensagem: (id: string) => void;
}) {
  const qc = useQueryClient();
  const erro = (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Erro na tarefa');
  const concluir = useMutation({
    mutationFn: () => api(`/tarefas/${t.id}/concluir`, { method: 'PATCH' }),
    onSuccess: () => {
      invalidarTarefas(qc);
      toast.success('Tarefa concluída');
    },
    onError: erro,
  });
  const adiar = useMutation({
    mutationFn: (dias: number) => api(`/tarefas/${t.id}/adiar`, { method: 'POST', json: { dias } }),
    onSuccess: () => {
      invalidarTarefas(qc);
      toast.success('Tarefa adiada');
    },
    onError: erro,
  });
  const ocupado = concluir.isPending || adiar.isPending;

  return (
    <li
      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid="tarefa"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium break-words">{t.titulo}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className={atrasada ? 'font-medium text-destructive' : undefined}>
            {t.vencimento ? dataBr.format(new Date(t.vencimento)) : 'Sem data'}
          </span>
          <Badge variant="secondary">{ORIGEM_TAREFA_LABEL[t.origem]}</Badge>
          {t.adiadaVezes > 0 && <span>adiada {t.adiadaVezes}x</span>}
          {t.empresaJunior && (
            <Link
              href={`/empresas-juniores/${t.empresaJunior.id}`}
              className="text-primary hover:underline"
            >
              {t.empresaJunior.nome}
            </Link>
          )}
        </p>
      </div>
      {!somenteLeitura && (
        <div className="flex shrink-0 flex-wrap gap-2">
          {t.origem === 'CADENCIA' && (
            <Button size="sm" onClick={() => onMensagem(t.id)} disabled={ocupado}>
              <MessageSquareText /> Gerar mensagem
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => concluir.mutate()} disabled={ocupado}>
            {concluir.isPending ? <Loader2 className="animate-spin" /> : <Check />}
            Concluir
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" disabled={ocupado} aria-label={`Adiar ${t.titulo}`}>
                <CalendarClock /> Adiar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => adiar.mutate(1)}>+1 dia</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => adiar.mutate(3)}>+3 dias</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => adiar.mutate(7)}>+7 dias</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAdiarData(t.id)}>Escolher data…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </li>
  );
}

function Secao({
  titulo,
  tarefas,
  vazio,
  atrasada,
  somenteLeitura,
  onAdiarData,
  onMensagem,
  testid,
}: {
  titulo: string;
  tarefas: Tarefa[];
  vazio: string;
  atrasada?: boolean;
  somenteLeitura?: boolean;
  onAdiarData: (id: string) => void;
  onMensagem: (id: string) => void;
  testid: string;
}) {
  return (
    <Card data-testid={testid}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {titulo}
          <Badge variant={atrasada && tarefas.length ? 'destructive' : 'secondary'}>
            {tarefas.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {tarefas.length === 0 ? (
          <p className="text-sm text-muted-foreground">{vazio}</p>
        ) : (
          <ul className="divide-y">
            {tarefas.map((t) => (
              <LinhaTarefa
                key={t.id}
                t={t}
                atrasada={atrasada}
                somenteLeitura={somenteLeitura}
                onAdiarData={onAdiarData}
                onMensagem={onMensagem}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function AgendaPage() {
  const { usuario, temPapel } = useAuth();
  const qc = useQueryClient();
  const gestor = temPapel('ADMIN', 'GESTOR');
  const admin = temPapel('ADMIN');
  const [alvo, setAlvo] = useState<string>('');
  const [visao, setVisao] = useState('calendario');
  const [mes, setMes] = useState(() => dataUtcIso(mesAgenda(hojeAgenda())));
  const [nova, setNova] = useState<{ data?: string; fase?: FaseNovaTarefa } | null>(null);
  const [tarefaAberta, setTarefaAberta] = useState<TarefaAgenda | null>(null);
  const [adiarId, setAdiarId] = useState<string | null>(null);
  const [mensagemId, setMensagemId] = useState<string | null>(null);
  const resp = useOpcoesResponsaveis(gestor);
  const responsavelId = gestor && alvo && alvo !== usuario?.id ? alvo : undefined;

  const q = useQuery({
    queryKey: ['agenda', responsavelId ?? 'eu'],
    queryFn: () =>
      api<Agenda>(`/tarefas/agenda${responsavelId ? `?responsavelId=${responsavelId}` : ''}`),
    enabled: visao === 'lista',
  });

  const intervalo = visao === 'calendario' ? mes : null;
  const painel = useInfiniteQuery({
    queryKey: ['agenda-painel', responsavelId ?? 'eu', intervalo],
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ page: String(pageParam), pageSize: '100' });
      if (responsavelId) params.set('responsavelId', responsavelId);
      if (intervalo) {
        params.set('inicio', intervalo);
        params.set('fim', dataUtcIso(mesAgenda(intervalo, 1)));
      }
      return api<{ items: TarefaAgenda[]; temMais: boolean }>(`/tarefas/painel?${params}`, { signal });
    },
    initialPageParam: 1,
    getNextPageParam: (ultima, paginas) => ultima.temMais ? paginas.length + 1 : undefined,
    enabled: visao !== 'lista',
  });
  const mover = useMutation({
    mutationFn: ({ id, fase }: { id: string; fase: FaseTarefa }) =>
      api(`/tarefas/${id}/fase`, { method: 'PATCH', json: { fase } }),
    onSuccess: () => invalidarTarefas(qc),
    onError: (e) => {
      invalidarTarefas(qc);
      toast.error(e instanceof ApiError ? e.message : 'Erro ao mover a tarefa');
    },
  });

  const alertas = useMutation({
    mutationFn: () =>
      api<{
        mandato: { criadas: number; jaExistentes: number };
        nutricao: { criadas: number; jaExistentes: number };
      }>('/alertas/executar', { method: 'POST' }),
    onSuccess: (r) => {
      invalidarTarefas(qc);
      const criadas = (r.mandato?.criadas ?? 0) + (r.nutricao?.criadas ?? 0);
      toast.success(criadas ? `${criadas} tarefa(s) de alerta criada(s)` : 'Nenhum alerta novo');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao gerar alertas'),
  });

  const outros = (resp.data?.usuarios ?? []).filter((u) => u.id !== usuario?.id);
  const outroUsuario = !!responsavelId;
  const total = q.data ? q.data.atrasadas.length + q.data.hoje.length + q.data.proximos7Dias.length : 0;
  const tarefas = painel.data?.pages.flatMap((pagina) => pagina.items) ?? [];
  const selecionada = tarefas.find((t) => t.id === tarefaAberta?.id) ?? tarefaAberta;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        titulo="Minha agenda"
        acoes={
          <>
            {admin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => alertas.mutate()}
                disabled={alertas.isPending}
              >
                {alertas.isPending ? <Loader2 className="animate-spin" /> : <BellRing />}
                Gerar alertas agora
              </Button>
            )}
            <Button size="sm" onClick={() => setNova(visao === 'kanban' ? {} : {
              data: visao === 'calendario' && !hojeAgenda().startsWith(mes.slice(0, 7)) ? mes : hojeAgenda(),
            })}>
              <Plus /> Nova tarefa
            </Button>
          </>
        }
      />

      {gestor && (
        <div className="mb-4 grid max-w-xs gap-1.5">
          <Label htmlFor="ag-resp">Responsável</Label>
          <Select value={alvo || usuario?.id || ''} onValueChange={setAlvo}>
            <SelectTrigger id="ag-resp" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {usuario && <SelectItem value={usuario.id}>Eu ({usuario.nome})</SelectItem>}
              {outros.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div role="group" aria-label="Visualização da agenda" className="mb-4 flex flex-wrap gap-2">
        {[
          ['calendario', 'Calendário'],
          ['kanban', 'Kanban'],
          ['lista', 'Lista'],
        ].map(([valor, rotulo]) => (
          <Button key={valor} size="sm" aria-pressed={visao === valor}
            variant={visao === valor ? 'default' : 'outline'} onClick={() => setVisao(valor)}>
            {rotulo}
          </Button>
        ))}
      </div>

      {visao === 'lista' && <div className="mb-4">
        <PrioridadesSemana responsavelId={responsavelId} />
      </div>}

      {visao !== 'lista' ? (
        <>
          {painel.isError && (
            <div role="alert" className="mb-3 flex items-center gap-2 text-sm text-destructive">
              Erro ao carregar tarefas.
              <Button size="sm" variant="outline" onClick={() => void painel.refetch()}>Tentar novamente</Button>
            </div>
          )}
          {visao === 'calendario' ? (
            <CalendarioTarefas mes={mes} tarefas={tarefas} carregando={painel.isPending} onMes={setMes}
              onCriar={(data) => setNova({ data })} onAbrir={setTarefaAberta} />
          ) : painel.isPending ? (
            <Skeleton className="h-48 w-full" aria-label="Carregando tarefas" />
          ) : (
            <KanbanTarefas tarefas={tarefas} onAbrir={setTarefaAberta}
              onCriar={(fase) => setNova({ fase })} movendo={mover.isPending}
              onMover={(id, fase) => mover.mutate({ id, fase })} />
          )}
          {painel.hasNextPage && (
            <Button size="sm" variant="outline" className="mt-3" disabled={painel.isFetchingNextPage}
              onClick={() => void painel.fetchNextPage()}>
              {painel.isFetchingNextPage ? 'Carregando…' : 'Carregar mais tarefas'}
            </Button>
          )}
        </>
      ) : q.isLoading ? (
        <div className="grid gap-4" aria-busy="true" aria-label="Carregando agenda">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : q.isError || !q.data ? (
        <div className="rounded-md border p-6 text-center" role="alert">
          <p className="text-sm text-destructive">Erro ao carregar a agenda.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void q.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {total === 0 && (
            <p className="text-sm text-muted-foreground" data-testid="agenda-vazia">
              Nenhuma tarefa pendente nos próximos 7 dias.
            </p>
          )}
          <Secao
            testid="secao-atrasadas"
            titulo="Atrasadas"
            tarefas={q.data.atrasadas}
            vazio="Nada atrasado."
            atrasada
            somenteLeitura={outroUsuario && !gestor}
            onAdiarData={setAdiarId}
            onMensagem={setMensagemId}
          />
          <Secao
            testid="secao-hoje"
            titulo="Hoje"
            tarefas={q.data.hoje}
            vazio="Nada para hoje."
            onAdiarData={setAdiarId}
            onMensagem={setMensagemId}
          />
          <Secao
            testid="secao-proximos"
            titulo="Próximos 7 dias"
            tarefas={q.data.proximos7Dias}
            vazio="Nada nos próximos dias."
            onAdiarData={setAdiarId}
            onMensagem={setMensagemId}
          />
        </div>
      )}

      <TarefaDialog
        aberto={!!nova || !!selecionada}
        onFechar={() => { setNova(null); setTarefaAberta(null); }}
        responsavelPadrao={responsavelId ?? usuario?.id ?? ''}
        podeEscolherResponsavel={gestor}
        dataPadrao={nova?.data}
        faseInicial={nova?.fase}
        tarefa={selecionada ?? undefined}
        onAdiar={(id) => { setTarefaAberta(null); setAdiarId(id); }}
        onMensagem={(id) => { setTarefaAberta(null); setMensagemId(id); }}
      />
      <AdiarDataDialog tarefaId={adiarId} onFechar={() => setAdiarId(null)} />
      <MensagemDialog tarefaId={mensagemId} onFechar={() => setMensagemId(null)} />
    </div>
  );
}
