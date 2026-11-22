'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, EyeOff, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { CARGO_CONTATO_LABEL, type CargoContato } from '@orcestra/shared';
import { SomentePapeis } from '@/components/app-shell';
import { DialogAnonimizar } from '@/components/ej/contatos';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, ApiError } from '@/lib/api';

interface Candidato {
  id: string;
  nome: string;
  cargo: CargoContato;
  mandatoFim: string | null;
  optOut: boolean;
  empresaJunior: { id: string; nome: string };
  ultimaInteracaoEm: string | null;
}
interface Pagina {
  corte: string;
  total: number;
  page: number;
  pageSize: number;
  itens: Candidato[];
}

const PAGE_SIZE = 20;
const dataBr = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
    : '—';
const dataCurta = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');

function Lgpd() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [alvo, setAlvo] = useState<Candidato | null>(null);
  const q = useQuery({
    queryKey: ['lgpd-retencao', page],
    queryFn: () => api<Pagina>(`/lgpd/retencao?page=${page}&pageSize=${PAGE_SIZE}`),
    placeholderData: (a) => a,
  });
  const backfill = useMutation({
    mutationFn: () => api<Record<string, unknown>>('/lgpd/supressao/backfill', { method: 'POST' }),
    onSuccess: (r) => {
      const novos = typeof r?.novos === 'number' ? r.novos : null;
      toast.success(
        novos === null
          ? 'Lista de supressão reprocessada'
          : `Lista de supressão reprocessada (${novos} novo(s) registro(s))`,
      );
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao reprocessar'),
  });
  const totalPaginas = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        titulo="LGPD e retenção"
        descricao="Nada é apagado automaticamente: revise os candidatos e anonimize caso a caso."
        acoes={
          <Button variant="outline" disabled={backfill.isPending} onClick={() => backfill.mutate()}>
            {backfill.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Reprocessar lista de supressão
          </Button>
        }
      />
      <Card className="mb-4 p-4 text-sm text-muted-foreground">
        Candidatos: contatos com mandato encerrado há mais de 24 meses e sem interação nos últimos 24
        meses{q.data ? ` (corte em ${dataBr(q.data.corte)})` : ''}.
      </Card>

      {q.isError ? (
        <Card className="p-6 text-sm text-destructive" role="alert">
          Não foi possível carregar a lista de retenção.{' '}
          <Button variant="link" className="h-auto p-0" onClick={() => void q.refetch()}>
            Tentar novamente
          </Button>
        </Card>
      ) : (
        <Card className="gap-0 overflow-x-auto py-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Contato</TableHead>
                <TableHead>Empresa Júnior</TableHead>
                <TableHead className="hidden md:table-cell">Fim do mandato</TableHead>
                <TableHead className="hidden md:table-cell">Última interação</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : (q.data?.itens ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Nenhum contato candidato à anonimização.
                  </TableCell>
                </TableRow>
              ) : (
                q.data!.itens.map((c) => (
                  <TableRow key={c.id} data-testid="candidato">
                    <TableCell>
                      <div className="font-medium">{c.nome}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        {CARGO_CONTATO_LABEL[c.cargo]}
                        {c.optOut && <Badge variant="destructive">Opt-out</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/empresas-juniores/${c.empresaJunior.id}`}
                        className="text-primary hover:underline"
                      >
                        {c.empresaJunior.nome}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{dataCurta(c.mandatoFim)}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {c.ultimaInteracaoEm ? dataBr(c.ultimaInteracaoEm) : 'Nunca'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setAlvo(c)}>
                        <EyeOff /> Anonimizar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {q.data && q.data.total > 0 && (
        <nav className="mt-4 flex items-center justify-between gap-2 text-sm" aria-label="Paginação">
          <span className="text-muted-foreground">
            {q.data.total} candidato(s) · página {page} de {totalPaginas}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft /> Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPaginas}
              onClick={() => setPage(page + 1)}
            >
              Próxima <ChevronRight />
            </Button>
          </div>
        </nav>
      )}

      <DialogAnonimizar
        contato={alvo}
        onFechar={() => setAlvo(null)}
        aoConcluir={() => void qc.invalidateQueries({ queryKey: ['lgpd-retencao'] })}
      />
    </>
  );
}

export default function LgpdPage() {
  return (
    <SomentePapeis papeis={['ADMIN']}>
      <Lgpd />
    </SomentePapeis>
  );
}
