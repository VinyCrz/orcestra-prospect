'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquarePlus, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import type { StatusProspeccao } from '@orcestra/shared';
import { MudarStatusDialog, type DadosStatus } from '@/components/funil/status-dialog';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { InteracaoDialog, invalidarEj } from './interacao-dialog';

/** Botões "Registrar interação" e "Mudar status" da página da EJ (somente quem pode editar). */
export function AcoesFunilEj({ ejId, status }: { ejId: string; status: StatusProspeccao }) {
  const qc = useQueryClient();
  const [interacao, setInteracao] = useState(false);
  const [mudar, setMudar] = useState(false);

  const m = useMutation({
    mutationFn: (d: DadosStatus) =>
      api(`/empresas-juniores/${ejId}/status`, { method: 'PATCH', json: d }),
    onSuccess: () => {
      invalidarEj(qc, ejId);
      toast.success('Status atualizado');
      setMudar(false);
    },
  });

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setMudar(true)}>
        <Repeat /> Mudar status
      </Button>
      <Button size="sm" onClick={() => setInteracao(true)}>
        <MessageSquarePlus /> Registrar interação
      </Button>
      <MudarStatusDialog
        aberto={mudar}
        onFechar={() => {
          setMudar(false);
          m.reset();
        }}
        statusAtual={status}
        pendente={m.isPending}
        erro={m.error instanceof ApiError ? m.error.message : m.error ? 'Erro ao mudar o status' : null}
        onConfirmar={(d) => m.mutate(d)}
      />
      <InteracaoDialog
        ejId={ejId}
        statusAtual={status}
        aberto={interacao}
        onFechar={() => setInteracao(false)}
      />
    </>
  );
}
