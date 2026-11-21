'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { CadenciaEditorDialog } from '@/components/cadencias/cadencia-editor';
import { useCadencias } from '@/components/cadencias/inscrever-dialog';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth';

export default function CadenciasPage() {
  const { temPapel } = useAuth();
  const admin = temPapel('ADMIN');
  const [novo, setNovo] = useState(false);
  const q = useCadencias();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        titulo="Cadências"
        descricao="Sequências de passos (dia, canal e template) que geram tarefas na agenda."
        acoes={
          admin && (
            <Button size="sm" onClick={() => setNovo(true)}>
              <Plus /> Nova cadência
            </Button>
          )
        }
      />
      {q.isLoading ? (
        <div className="grid gap-3" aria-busy="true" aria-label="Carregando cadências">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : q.isError ? (
        <div className="rounded-md border p-6 text-center" role="alert">
          <p className="text-sm text-destructive">Erro ao carregar as cadências.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void q.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : !q.data?.length ? (
        <p className="text-sm text-muted-foreground" data-testid="cadencias-vazio">
          Nenhuma cadência cadastrada.
        </p>
      ) : (
        <ul className="grid gap-3">
          {q.data.map((c) => (
            <li key={c.id}>
              <Card>
                <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link href={`/cadencias/${c.id}`} className="flex flex-wrap items-center gap-2 font-medium text-primary hover:underline">
                      {c.nome}
                      {!c.ativa && <Badge variant="secondary">Inativa</Badge>}
                    </Link>
                    {c.descricao && <p className="text-sm text-muted-foreground break-words">{c.descricao}</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Badge variant="outline">{c.passos.length} passo{c.passos.length === 1 ? '' : 's'}</Badge>
                    <Badge variant="brand">{c.inscricoesAtivas ?? 0} inscrição(ões) ativa(s)</Badge>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <CadenciaEditorDialog aberto={novo} cadencia={null} onFechar={() => setNovo(false)} />
    </div>
  );
}
