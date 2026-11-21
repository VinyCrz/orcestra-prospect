'use client';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  CalendarCheck,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Pencil,
  Repeat,
  UserRound,
} from 'lucide-react';
import {
  CANAL_INTERACAO_LABEL,
  ORIGEM_TAREFA_LABEL,
  RESULTADO_INTERACAO_LABEL,
  STATUS_PROSPECCAO_LABEL,
  type TipoTimeline,
} from '@orcestra/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { MOTIVO_ENCERRAMENTO_LABEL } from '@/lib/tipos-cadencias';
import type { EventoTimeline, PaginaTimeline } from '@/lib/tipos-funil';

const dataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const dataCurta = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

const ICONE: Record<TipoTimeline, React.ComponentType<{ className?: string }>> = {
  INTERACAO: MessageSquare,
  STATUS: Repeat,
  EDICAO: Pencil,
  CONTATO: UserRound,
  TAREFA_CRIADA: CalendarCheck,
  TAREFA_CONCLUIDA: CheckCircle2,
};
const ROTULO: Record<TipoTimeline, string> = {
  INTERACAO: 'Interação',
  STATUS: 'Mudança de status',
  EDICAO: 'Edição',
  CONTATO: 'Contato',
  TAREFA_CRIADA: 'Tarefa criada',
  TAREFA_CONCLUIDA: 'Tarefa concluída',
};

const ACAO_CADENCIA: Record<string, string> = {
  CADENCIA_INSCRITA: 'Inscrita em cadência',
  CADENCIA_ENCERRADA: 'Cadência encerrada',
  CADENCIA_CONCLUIDA: 'Cadência concluída',
};

function Descricao({ e }: { e: EventoTimeline }) {
  const d = e.detalhes;
  switch (e.tipo) {
    case 'INTERACAO':
      return (
        <>
          <p className="text-sm font-medium">
            {d.canal ? CANAL_INTERACAO_LABEL[d.canal] : 'Interação'}
            {d.resultado && ` · ${RESULTADO_INTERACAO_LABEL[d.resultado]}`}
            {d.contato && ` · ${d.contato.nome}`}
          </p>
          {d.resumo && <p className="text-sm break-words whitespace-pre-line">{d.resumo}</p>}
          {d.proximoPasso || d.proximoPassoData ? (
            <p className="text-xs text-muted-foreground">
              Próximo passo: {d.proximoPasso ?? 'sem descrição'}
              {d.proximoPassoData && ` (${dataCurta(d.proximoPassoData)})`}
            </p>
          ) : null}
        </>
      );
    case 'STATUS':
      return (
        <>
          <p className="text-sm font-medium">
            {d.de ? STATUS_PROSPECCAO_LABEL[d.de] : 'Início'} →{' '}
            {d.para ? STATUS_PROSPECCAO_LABEL[d.para] : ''}
          </p>
          {d.motivoPerda && (
            <p className="text-sm text-muted-foreground">Motivo: {d.motivoPerda.nome}</p>
          )}
          {d.observacao && <p className="text-sm break-words">{d.observacao}</p>}
        </>
      );
    case 'EDICAO':
    case 'CONTATO': {
      const cad = d.acao ? ACAO_CADENCIA[d.acao] : undefined;
      if (cad) {
        const motivo = (d.dados?.depois as { motivo?: string } | null | undefined)?.motivo;
        const rot = motivo ? MOTIVO_ENCERRAMENTO_LABEL[motivo as keyof typeof MOTIVO_ENCERRAMENTO_LABEL] : null;
        return (
          <p className="text-sm font-medium">
            {cad}
            {rot && <span className="font-normal text-muted-foreground"> · {rot}</span>}
          </p>
        );
      }
      const campos = Object.keys(d.dados?.depois ?? {});
      return (
        <p className="text-sm">
          {e.tipo === 'CONTATO' ? 'Contato alterado' : 'Dados da EJ alterados'}
          {campos.length > 0 && (
            <span className="text-muted-foreground"> ({campos.slice(0, 6).join(', ')})</span>
          )}
        </p>
      );
    }
    case 'TAREFA_CRIADA':
    case 'TAREFA_CONCLUIDA':
      return (
        <>
          <p className="text-sm font-medium break-words">{d.titulo}</p>
          <p className="text-xs text-muted-foreground">
            {d.origem && ORIGEM_TAREFA_LABEL[d.origem]}
            {d.vencimento && ` · vence em ${dataCurta(d.vencimento)}`}
          </p>
        </>
      );
  }
}

export function Timeline({ ejId }: { ejId: string }) {
  const q = useInfiniteQuery({
    queryKey: ['timeline', ejId],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api<PaginaTimeline>(`/empresas-juniores/${ejId}/timeline?page=${pageParam}&pageSize=20`),
    getNextPageParam: (u) => (u.page < u.totalPages ? u.page + 1 : undefined),
  });
  const eventos = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Linha do tempo</CardTitle>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="grid gap-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : q.isError ? (
          <p className="text-sm text-destructive" role="alert">
            Erro ao carregar a linha do tempo.{' '}
            <Button variant="link" className="h-auto p-0" onClick={() => void q.refetch()}>
              Tentar novamente
            </Button>
          </p>
        ) : eventos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
        ) : (
          <ol className="grid gap-4" data-testid="timeline">
            {eventos.map((e) => {
              const Icone =
                e.tipo === 'EDICAO' && e.detalhes.acao && ACAO_CADENCIA[e.detalhes.acao]
                  ? Repeat
                  : ICONE[e.tipo];
              return (
                <li key={e.id} className="flex gap-3">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                    <Icone className="size-4" aria-hidden />
                    <span className="sr-only">{ROTULO[e.tipo]}</span>
                  </span>
                  <div className="grid min-w-0 gap-0.5">
                    <Descricao e={e} />
                    <p className="text-xs text-muted-foreground">
                      {dataHora.format(new Date(e.data))}
                      {e.usuario && ` · ${e.usuario.nome}`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {q.hasNextPage && (
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => void q.fetchNextPage()}
            disabled={q.isFetchingNextPage}
          >
            {q.isFetchingNextPage && <Loader2 className="animate-spin" />}
            Carregar mais
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
