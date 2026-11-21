'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Loader2, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { STATUS_PROSPECCAO_LABEL, type AcaoEmMassaInput } from '@orcestra/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, ApiError, baixarArquivo, baixarBlob } from '@/lib/api';
import { querystringFiltros, urlParaFiltros, type FiltrosUrl } from '@/lib/filtros-ej';
import type { EjLista, ResultadoAcaoEmMassa } from '@/lib/tipos';
import { useOpcoesResponsaveis, useOpcoesTags } from './use-opcoes';

type Acao = AcaoEmMassaInput['acao'];
const NENHUM = '__nenhum__';

const ACAO_LABEL: Record<Acao, string> = {
  ATRIBUIR_RESPONSAVEL: 'Atribuir responsável',
  MUDAR_STATUS: 'Mudar status',
  ADICIONAR_TAG: 'Adicionar tag',
  REMOVER_TAG: 'Remover tag',
};

function csvSelecao(linhas: EjLista[]) {
  const cel = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cab = ['Nome', 'IES', 'UF', 'Cidade', 'Federação', 'Status', 'Score ICP', 'Responsável', 'Tags'];
  const corpo = linhas.map((e) =>
    [
      e.nome,
      e.ies?.nome,
      e.uf,
      e.cidade,
      e.federacao?.sigla ?? e.federacao?.nome,
      STATUS_PROSPECCAO_LABEL[e.statusProspeccao],
      e.scoreIcp,
      e.responsavel?.nome,
      e.tags.map((t) => t.nome).join(', '),
    ]
      .map(cel)
      .join(';'),
  );
  return '﻿' + [cab.join(';'), ...corpo].join('\r\n') + '\r\n';
}

/** Barra exibida com linhas selecionadas: ação em massa + exportação. */
export function BarraAcoesEmMassa({
  selecionadas,
  totalFiltro,
  filtros,
  todosDoFiltro,
  onTodosDoFiltro,
  podeAtribuir,
  onLimpar,
}: {
  selecionadas: EjLista[];
  totalFiltro: number;
  filtros: FiltrosUrl;
  todosDoFiltro: boolean;
  onTodosDoFiltro: (v: boolean) => void;
  podeAtribuir: boolean;
  onLimpar: () => void;
}) {
  const qc = useQueryClient();
  const [dialogo, setDialogo] = useState(false);
  const [acao, setAcao] = useState<Acao>('MUDAR_STATUS');
  const [valor, setValor] = useState<string>('');
  const tags = useOpcoesTags();
  const resp = useOpcoesResponsaveis(dialogo && podeAtribuir);

  const quantidade = todosDoFiltro ? totalFiltro : selecionadas.length;
  const acoes = (Object.keys(ACAO_LABEL) as Acao[]).filter(
    (a) => a !== 'ATRIBUIR_RESPONSAVEL' || podeAtribuir,
  );

  const m = useMutation({
    mutationFn: () => {
      const base = {
        acao,
        valor: valor === NENHUM ? null : valor || null,
      };
      const corpo = todosDoFiltro
        ? { ...base, filtros: urlParaFiltros(filtros) }
        : { ...base, ids: selecionadas.map((e) => e.id) };
      return api<ResultadoAcaoEmMassa>('/empresas-juniores/acoes-em-massa', {
        method: 'POST',
        json: corpo,
      });
    },
    onSuccess: (r) => {
      const extra = r.semPermissao ? `, ${r.semPermissao} sem permissão` : '';
      toast.success(`${r.alteradas} alterada(s), ${r.semMudanca} sem mudança${extra}`);
      void qc.invalidateQueries({ queryKey: ['ejs'] });
      void qc.invalidateQueries({ queryKey: ['opcoes-responsaveis'] });
      setDialogo(false);
      onLimpar();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao aplicar a ação'),
  });

  const exportar = useMutation({
    mutationFn: async () => {
      if (!todosDoFiltro && selecionadas.length) {
        baixarBlob(
          new Blob([csvSelecao(selecionadas)], { type: 'text/csv;charset=utf-8' }),
          `empresas-juniores-selecao-${new Date().toISOString().slice(0, 10)}.csv`,
        );
        return;
      }
      await baixarArquivo(
        `/empresas-juniores/exportar.csv?${querystringFiltros(filtros)}`,
        'empresas-juniores.csv',
      );
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao exportar'),
  });

  const valorValido = acao === 'ATRIBUIR_RESPONSAVEL' ? valor !== '' : valor !== '' && valor !== NENHUM;

  return (
    <>
      <div
        className="flex flex-col gap-2 border-b bg-accent p-3 text-sm text-accent-foreground sm:flex-row sm:items-center"
        role="region"
        aria-label="Ações em massa"
        data-testid="barra-massa"
      >
        <span className="font-medium">
          {quantidade} EJ{quantidade === 1 ? '' : 's'} selecionada{quantidade === 1 ? '' : 's'}
        </span>
        {!todosDoFiltro && totalFiltro > selecionadas.length && (
          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => onTodosDoFiltro(true)}>
            Selecionar todas as {totalFiltro} do filtro
          </Button>
        )}
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Button size="sm" onClick={() => setDialogo(true)}>
            <Zap /> Ação em massa
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportar.mutate()} disabled={exportar.isPending}>
            {exportar.isPending ? <Loader2 className="animate-spin" /> : <Download />}
            Exportar CSV
          </Button>
          <Button size="sm" variant="ghost" onClick={onLimpar}>
            <X /> Limpar seleção
          </Button>
        </div>
      </div>

      <Dialog open={dialogo} onOpenChange={setDialogo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ação em massa</DialogTitle>
            <DialogDescription>
              Será aplicada a {quantidade} EJ{quantidade === 1 ? '' : 's'}. Só as que você pode
              editar serão alteradas.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="massa-acao">Ação</Label>
              <Select
                value={acao}
                onValueChange={(v) => {
                  setAcao(v as Acao);
                  setValor('');
                }}
              >
                <SelectTrigger id="massa-acao">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {acoes.map((a) => (
                    <SelectItem key={a} value={a}>
                      {ACAO_LABEL[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="massa-valor">
                {acao === 'ATRIBUIR_RESPONSAVEL'
                  ? 'Responsável'
                  : acao === 'MUDAR_STATUS'
                    ? 'Novo status'
                    : 'Tag'}
              </Label>
              <Select value={valor} onValueChange={setValor}>
                <SelectTrigger id="massa-valor">
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {acao === 'ATRIBUIR_RESPONSAVEL' && (
                    <>
                      <SelectItem value={NENHUM}>Remover responsável</SelectItem>
                      {(resp.data?.usuarios ?? []).map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.nome}
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {acao === 'MUDAR_STATUS' &&
                    Object.entries(STATUS_PROSPECCAO_LABEL).map(([v, r]) => (
                      <SelectItem key={v} value={v}>
                        {r}
                      </SelectItem>
                    ))}
                  {(acao === 'ADICIONAR_TAG' || acao === 'REMOVER_TAG') &&
                    (tags.data ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nome}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(false)}>
              Cancelar
            </Button>
            <Button onClick={() => m.mutate()} disabled={!valorValido || m.isPending}>
              {m.isPending && <Loader2 className="animate-spin" />}
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
