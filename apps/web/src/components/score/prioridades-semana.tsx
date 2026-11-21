'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { FaixaIcp } from '@orcestra/shared';
import { FaixaBadge } from '@/components/faixa-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';

interface Prioridade {
  id: string;
  nome: string;
  cidade: string | null;
  uf: string | null;
  scoreIcp: number;
  faixaIcp: FaixaIcp | null;
  ies: { id: string; nome: string; sigla: string | null } | null;
}

/** Top 10 EJs ainda não trabalhadas da carteira, por score (SDR vê a própria; gestor escolhe via responsavelId). */
export function PrioridadesSemana({ responsavelId }: { responsavelId?: string }) {
  const q = useQuery({
    queryKey: ['prioridades-semana', responsavelId ?? 'eu'],
    queryFn: () =>
      api<{ items: Prioridade[] }>(
        `/prioridades-da-semana?limite=10${responsavelId ? `&responsavelId=${responsavelId}` : ''}`,
      ),
  });
  return (
    <Card data-testid="prioridades-semana">
      <CardHeader>
        <CardTitle>Prioridades da semana</CardTitle>
        <CardDescription>Melhores scores da carteira que ainda não foram trabalhados.</CardDescription>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="grid gap-2" aria-busy="true" aria-label="Carregando prioridades">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : q.isError ? (
          <div role="alert" className="text-sm">
            <p className="text-destructive">Erro ao carregar as prioridades.</p>
            <Button variant="link" className="h-auto p-0" onClick={() => void q.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : (q.data?.items ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma EJ pendente na carteira. Atribua EJs em Empresas Juniores.
          </p>
        ) : (
          <ol className="divide-y">
            {q.data!.items.map((e, i) => (
              <li key={e.id} className="flex items-center gap-3 py-2" data-testid="prioridade">
                <span className="w-5 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/empresas-juniores/${e.id}`}
                    className="block truncate text-sm font-medium hover:text-primary hover:underline"
                    title={e.nome}
                  >
                    {e.nome}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {[e.uf, e.ies?.sigla ?? e.ies?.nome].filter(Boolean).join(' · ') || 'Sem localização'}
                  </p>
                </div>
                <FaixaBadge faixa={e.faixaIcp} score={e.scoreIcp} />
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
