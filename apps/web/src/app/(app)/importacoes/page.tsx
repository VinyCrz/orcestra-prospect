'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { keepPreviousData } from '@tanstack/react-query';
import { SomentePapeis } from '@/components/app-shell';
import { BotaoErrosCsv, TIPO_LABEL, WizardImportacao } from '@/components/importacoes/wizard';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import type { ImportacaoResumo } from '@/lib/tipos';
import type { Paginado } from '@orcestra/shared';

const STATUS_LABEL: Record<ImportacaoResumo['status'], string> = {
  AGUARDANDO_MAPEAMENTO: 'Aguardando mapeamento',
  PENDENTE: 'Na fila',
  PROCESSANDO: 'Processando',
  CONCLUIDA: 'Concluída',
  FALHOU: 'Falhou',
  CANCELADA: 'Cancelada',
};
const STATUS_VARIANTE: Record<ImportacaoResumo['status'], 'success' | 'destructive' | 'secondary' | 'brand'> = {
  AGUARDANDO_MAPEAMENTO: 'secondary',
  PENDENTE: 'brand',
  PROCESSANDO: 'brand',
  CONCLUIDA: 'success',
  FALHOU: 'destructive',
  CANCELADA: 'secondary',
};
const dataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function Historico() {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['importacoes', page],
    queryFn: () => api<Paginado<ImportacaoResumo>>(`/importacoes?page=${page}&pageSize=10`),
    placeholderData: keepPreviousData,
  });
  const itens = q.data?.items ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Histórico</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {q.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : q.isError ? (
          <p className="text-sm text-destructive">Não foi possível carregar o histórico.</p>
        ) : itens.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma importação realizada.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arquivo</TableHead>
                  <TableHead className="hidden sm:table-cell">Tipo</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="hidden md:table-cell">Resultado</TableHead>
                  <TableHead className="hidden sm:table-cell">Data</TableHead>
                  <TableHead>
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="max-w-48 truncate font-medium" title={i.arquivoNome}>
                      {i.arquivoNome}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{TIPO_LABEL[i.tipo]}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTE[i.status]}>{STATUS_LABEL[i.status]}</Badge>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {i.importadas} novas · {i.atualizadas} atualizadas · {i.ignoradas} ignoradas ·{' '}
                      {i.erros} erros
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {dataHora.format(new Date(i.criadoEm))}
                    </TableCell>
                    <TableCell>{i.erros > 0 && <BotaoErrosCsv id={i.id} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {q.data && q.data.totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 text-sm">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Anterior
            </Button>
            <span className="tabular-nums">
              {page} / {q.data.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= q.data.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ImportacoesPage() {
  return (
    <SomentePapeis papeis={['ADMIN', 'GESTOR']}>
      <PageHeader
        titulo="Importações"
        descricao="Importe EJs ou contatos de planilhas CSV/XLSX, com mapeamento de colunas e deduplicação."
      />
      <div className="grid gap-6">
        <WizardImportacao />
        <Historico />
      </div>
    </SomentePapeis>
  );
}
