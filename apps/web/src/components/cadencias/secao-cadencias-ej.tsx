'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, StopCircle } from 'lucide-react';
import { toast } from 'sonner';
import { InscreverDialog } from '@/components/cadencias/inscrever-dialog';
import { invalidarTarefas } from '@/components/tarefas/tarefa-dialogs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import {
  dataCurtaBr,
  MOTIVO_ENCERRAMENTO_LABEL,
  STATUS_INSCRICAO_LABEL,
  type Inscricao,
} from '@/lib/tipos-cadencias';

export function BadgeInscricao({ i }: { i: Inscricao }) {
  return (
    <Badge variant={i.status === 'ATIVA' ? 'brand' : i.status === 'CONCLUIDA' ? 'success' : 'secondary'}>
      {STATUS_INSCRICAO_LABEL[i.status]}
    </Badge>
  );
}

export function useEncerrarInscricao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/inscricoes/${id}/encerrar`, { method: 'POST', json: {} }),
    onSuccess: () => {
      invalidarTarefas(qc);
      for (const k of ['inscricoes-ej', 'inscricoes', 'cadencias'])
        void qc.invalidateQueries({ queryKey: [k] });
      toast.success('Inscrição encerrada; tarefas pendentes canceladas');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao encerrar'),
  });
}

export function SecaoCadenciasEj({ ejId, podeEditar }: { ejId: string; podeEditar: boolean }) {
  const [inscrever, setInscrever] = useState(false);
  const encerrar = useEncerrarInscricao();
  const q = useQuery({
    queryKey: ['inscricoes-ej', ejId],
    queryFn: () => api<Inscricao[]>(`/empresas-juniores/${ejId}/inscricoes`),
  });

  return (
    <Card data-testid="secao-cadencias">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>Cadências</CardTitle>
          <CardDescription>Sequências de contato; as mensagens são enviadas manualmente.</CardDescription>
        </div>
        {podeEditar && (
          <Button size="sm" onClick={() => setInscrever(true)}>
            <Plus /> Inscrever em cadência
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : q.isError ? (
          <p className="text-sm text-destructive" role="alert">
            Erro ao carregar as cadências.{' '}
            <Button variant="link" className="h-auto p-0" onClick={() => void q.refetch()}>
              Tentar novamente
            </Button>
          </p>
        ) : !q.data?.length ? (
          <p className="text-sm text-muted-foreground">Esta EJ não está em nenhuma cadência.</p>
        ) : (
          <ul className="divide-y">
            {q.data.map((i) => (
              <li
                key={i.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                data-testid="inscricao"
              >
                <div className="min-w-0 text-sm">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <Link href={`/cadencias/${i.cadencia.id}`} className="text-primary hover:underline">
                      {i.cadencia.nome}
                    </Link>
                    <BadgeInscricao i={i} />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {i.progresso.concluidos}/{i.progresso.total} passos
                    {i.status === 'ATIVA' &&
                      i.progresso.proximoVencimento &&
                      ` · próximo em ${dataCurtaBr(i.progresso.proximoVencimento)}`}
                    {i.contato && ` · contato ${i.contato.nome}`}
                    {i.motivoEncerramento && ` · ${MOTIVO_ENCERRAMENTO_LABEL[i.motivoEncerramento]}`}
                  </p>
                </div>
                {podeEditar && i.status === 'ATIVA' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => encerrar.mutate(i.id)}
                    disabled={encerrar.isPending}
                    aria-label={`Encerrar inscrição em ${i.cadencia.nome}`}
                  >
                    {encerrar.isPending ? <Loader2 className="animate-spin" /> : <StopCircle />}
                    Encerrar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <InscreverDialog aberto={inscrever} onFechar={() => setInscrever(false)} ejIds={[ejId]} />
    </Card>
  );
}
