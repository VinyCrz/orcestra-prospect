'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Pencil, StopCircle } from 'lucide-react';
import { CANAL_INTERACAO_LABEL } from '@orcestra/shared';
import { CadenciaEditorDialog } from '@/components/cadencias/cadencia-editor';
import { BadgeInscricao, useEncerrarInscricao } from '@/components/cadencias/secao-cadencias-ej';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  dataCurtaBr,
  MOTIVO_ENCERRAMENTO_LABEL,
  STATUS_INSCRICAO_LABEL,
  type Cadencia,
  type PaginaInscricoes,
} from '@/lib/tipos-cadencias';

const TODOS = '__todos__';

export default function CadenciaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { temPapel } = useAuth();
  const admin = temPapel('ADMIN');
  const [edicao, setEdicao] = useState(false);
  const [status, setStatus] = useState(TODOS);
  const [page, setPage] = useState(1);
  const encerrar = useEncerrarInscricao();

  const cad = useQuery({
    queryKey: ['cadencia', id],
    queryFn: () => api<Cadencia>(`/cadencias/${id}`),
  });
  const insc = useQuery({
    queryKey: ['inscricoes', id, status, page],
    queryFn: () =>
      api<PaginaInscricoes>(
        `/cadencias/${id}/inscricoes?page=${page}&pageSize=20${status === TODOS ? '' : `&status=${status}`}`,
      ),
  });

  const voltar = (
    <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
      <Link href="/cadencias">
        <ArrowLeft /> Cadências
      </Link>
    </Button>
  );

  if (cad.isLoading)
    return (
      <div className="grid gap-4">
        {voltar}
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  if (cad.isError || !cad.data)
    return (
      <div>
        {voltar}
        <p className="text-destructive" role="alert">
          {cad.error instanceof ApiError && cad.error.status === 404
            ? 'Cadência não encontrada.'
            : 'Erro ao carregar a cadência.'}
        </p>
      </div>
    );

  const c = cad.data;
  return (
    <div className="mx-auto max-w-4xl">
      {voltar}
      <PageHeader
        titulo={c.nome}
        descricao={c.descricao ?? undefined}
        acoes={
          admin && (
            <Button size="sm" variant="outline" onClick={() => setEdicao(true)}>
              <Pencil /> Editar
            </Button>
          )
        }
      />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Passos {!c.ativa && <Badge variant="secondary">Inativa</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="divide-y">
              {c.passos.map((p) => (
                <li key={p.id} className="grid gap-0.5 py-2.5 text-sm">
                  <p className="font-medium">
                    {p.ordem}. Dia {p.diaOffset} · {CANAL_INTERACAO_LABEL[p.canal]}
                    {p.template && <span className="font-normal text-muted-foreground"> · {p.template.nome}</span>}
                  </p>
                  {p.instrucoes && <p className="text-muted-foreground break-words">{p.instrucoes}</p>}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-2">
            <CardTitle>Inscrições</CardTitle>
            <div className="grid gap-1">
              <Label htmlFor="insc-status">Status</Label>
              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                <SelectTrigger id="insc-status" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos</SelectItem>
                  {Object.entries(STATUS_INSCRICAO_LABEL).map(([v, r]) => (
                    <SelectItem key={v} value={v}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {insc.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : insc.isError ? (
              <p className="text-sm text-destructive" role="alert">
                Erro ao carregar as inscrições.{' '}
                <Button variant="link" className="h-auto p-0" onClick={() => void insc.refetch()}>
                  Tentar novamente
                </Button>
              </p>
            ) : !insc.data?.items.length ? (
              <p className="text-sm text-muted-foreground">Nenhuma inscrição.</p>
            ) : (
              <>
                <ul className="divide-y">
                  {insc.data.items.map((i) => (
                    <li key={i.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 text-sm">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          <Link href={`/empresas-juniores/${i.empresaJunior.id}`} className="text-primary hover:underline">
                            {i.empresaJunior.nome}
                          </Link>
                          <BadgeInscricao i={i} />
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {i.progresso.concluidos}/{i.progresso.total} passos · iniciada em {dataCurtaBr(i.iniciadaEm)}
                          {i.status === 'ATIVA' && i.progresso.proximoVencimento && ` · próximo em ${dataCurtaBr(i.progresso.proximoVencimento)}`}
                          {i.responsavel && ` · ${i.responsavel.nome}`}
                          {i.motivoEncerramento && ` · ${MOTIVO_ENCERRAMENTO_LABEL[i.motivoEncerramento]}`}
                        </p>
                      </div>
                      {i.status === 'ATIVA' && (
                        <Button size="sm" variant="outline" disabled={encerrar.isPending} onClick={() => encerrar.mutate(i.id)} aria-label={`Encerrar inscrição de ${i.empresaJunior.nome}`}>
                          {encerrar.isPending ? <Loader2 className="animate-spin" /> : <StopCircle />}
                          Encerrar
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
                {insc.data.totalPages > 1 && (
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Anterior
                    </Button>
                    <span>
                      Página {page} de {insc.data.totalPages}
                    </span>
                    <Button size="sm" variant="outline" disabled={page >= insc.data.totalPages} onClick={() => setPage((p) => p + 1)}>
                      Próxima
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
      <CadenciaEditorDialog aberto={edicao} cadencia={c} onFechar={() => setEdicao(false)} />
    </div>
  );
}
