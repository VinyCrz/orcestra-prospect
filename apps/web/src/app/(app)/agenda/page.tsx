'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, CalendarClock, Check, Loader2, MessageSquareText, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ORIGEM_TAREFA_LABEL } from '@orcestra/shared';
import { MensagemDialog } from '@/components/cadencias/mensagem-dialog';
import { useOpcoesResponsaveis } from '@/components/ej/use-opcoes';
import { PrioridadesSemana } from '@/components/score/prioridades-semana';
import { PageHeader } from '@/components/page-header';
import { AdiarDataDialog, invalidarTarefas, NovaTarefaDialog } from '@/components/tarefas/tarefa-dialogs';
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
import type { Agenda, Tarefa } from '@/lib/tipos-funil';

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
            {dataBr.format(new Date(t.vencimento))}
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
  const [nova, setNova] = useState(false);
  const [adiarId, setAdiarId] = useState<string | null>(null);
  const [mensagemId, setMensagemId] = useState<string | null>(null);
  const resp = useOpcoesResponsaveis(gestor);
  const responsavelId = gestor && alvo && alvo !== usuario?.id ? alvo : undefined;

  const q = useQuery({
    queryKey: ['agenda', responsavelId ?? 'eu'],
    queryFn: () =>
      api<Agenda>(`/tarefas/agenda${responsavelId ? `?responsavelId=${responsavelId}` : ''}`),
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

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        titulo="Minha agenda"
        descricao="Tarefas atrasadas, de hoje e dos próximos 7 dias."
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
            <Button size="sm" onClick={() => setNova(true)}>
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

      <div className="mb-4">
        <PrioridadesSemana responsavelId={responsavelId} />
      </div>

      {q.isLoading ? (
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

      <NovaTarefaDialog
        aberto={nova}
        onFechar={() => setNova(false)}
        responsavelPadrao={responsavelId ?? usuario?.id ?? ''}
        podeEscolherResponsavel={gestor}
      />
      <AdiarDataDialog tarefaId={adiarId} onFechar={() => setAdiarId(null)} />
      <MensagemDialog tarefaId={mensagemId} onFechar={() => setMensagemId(null)} />
    </div>
  );
}
