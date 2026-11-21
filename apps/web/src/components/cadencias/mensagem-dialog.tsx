'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Copy, ExternalLink, Info, Loader2, Mail, MessageCircle, Send } from 'lucide-react';
import { toast } from 'sonner';
import { invalidarTarefas } from '@/components/tarefas/tarefa-dialogs';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import type { MensagemPassoResp } from '@/lib/tipos-cadencias';

/** Gera a mensagem do passo da cadência. NUNCA envia nada: copiar/abrir link + registrar manualmente. */
export function MensagemDialog({
  tarefaId,
  onFechar,
}: {
  tarefaId: string | null;
  onFechar: () => void;
}) {
  return (
    <Dialog open={!!tarefaId} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        {tarefaId && <Corpo tarefaId={tarefaId} onFechar={onFechar} />}
      </DialogContent>
    </Dialog>
  );
}

function Corpo({ tarefaId, onFechar }: { tarefaId: string; onFechar: () => void }) {
  const qc = useQueryClient();
  const [resumo, setResumo] = useState('');
  const q = useQuery({
    queryKey: ['mensagem-tarefa', tarefaId],
    queryFn: () => api<MensagemPassoResp>(`/tarefas/${tarefaId}/mensagem`),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const registrar = useMutation({
    mutationFn: () =>
      api<{ inscricaoConcluida: boolean }>(`/tarefas/${tarefaId}/registrar-envio`, {
        method: 'POST',
        json: { resumo: resumo || undefined, contatoId: q.data?.contato.id },
      }),
    onSuccess: (r) => {
      invalidarTarefas(qc);
      void qc.invalidateQueries({ queryKey: ['inscricoes-ej'] });
      void qc.invalidateQueries({ queryKey: ['inscricoes'] });
      toast.success(
        r.inscricaoConcluida ? 'Envio registrado; cadência concluída' : 'Envio registrado e tarefa concluída',
      );
      onFechar();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao registrar o envio'),
  });

  async function copiar() {
    if (!q.data) return;
    const t = q.data.assunto ? `Assunto: ${q.data.assunto}\n\n${q.data.texto}` : q.data.texto;
    try {
      await navigator.clipboard.writeText(t);
      toast.success('Mensagem copiada');
    } catch {
      toast.error('Não foi possível copiar; selecione o texto manualmente');
    }
  }

  const m = q.data;
  const bloqueio = q.error instanceof ApiError && q.error.status === 422 ? q.error.message : null;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Mensagem do passo</DialogTitle>
        <DialogDescription>
          Nada é enviado automaticamente: copie ou abra o aplicativo, envie você mesmo e depois marque
          como enviada.
        </DialogDescription>
      </DialogHeader>

      {q.isLoading ? (
        <div className="grid gap-2" aria-busy="true" aria-label="Gerando mensagem">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : bloqueio ? (
        <div
          className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
          data-testid="mensagem-bloqueada"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Mensagem bloqueada: {bloqueio} Conclua ou adie a tarefa manualmente, sem enviar nada.
          </span>
        </div>
      ) : q.isError || !m ? (
        <p className="text-sm text-destructive" role="alert">
          Erro ao gerar a mensagem.{' '}
          <Button variant="link" className="h-auto p-0" onClick={() => void q.refetch()}>
            Tentar novamente
          </Button>
        </p>
      ) : (
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            Para: <span className="font-medium text-foreground">{m.contato.nome}</span>
            {m.canal === 'EMAIL' && m.contato.email && ` · ${m.contato.email}`}
            {m.canal === 'WHATSAPP' && m.contato.telefone && ` · ${m.contato.telefone}`}
          </p>
          {m.assunto && (
            <div className="grid gap-1">
              <Label>Assunto</Label>
              <p className="rounded-md border bg-muted/40 p-2 text-sm break-words" data-testid="msg-assunto">
                {m.assunto}
              </p>
            </div>
          )}
          <div className="grid gap-1">
            <Label htmlFor="msg-texto">Mensagem</Label>
            <Textarea id="msg-texto" readOnly rows={9} value={m.texto} data-testid="msg-texto" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void copiar()}>
              <Copy /> Copiar
            </Button>
            {m.links.waMe && (
              <Button asChild size="sm" variant="outline">
                <a href={m.links.waMe} target="_blank" rel="noopener noreferrer">
                  <MessageCircle /> Abrir WhatsApp <ExternalLink />
                </a>
              </Button>
            )}
            {m.links.mailto && (
              <Button asChild size="sm" variant="outline">
                <a href={m.links.mailto}>
                  <Mail /> Abrir e-mail
                </a>
              </Button>
            )}
          </div>
          <div className="grid gap-1">
            <Label htmlFor="msg-resumo">Observação do envio (opcional)</Label>
            <Textarea
              id="msg-resumo"
              rows={2}
              maxLength={5000}
              value={resumo}
              onChange={(e) => setResumo(e.target.value)}
              placeholder={`Se vazio, registra "Passo N da cadência executado".`}
            />
          </div>
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onFechar}>
          Fechar
        </Button>
        {m && (
          <Button onClick={() => registrar.mutate()} disabled={registrar.isPending}>
            {registrar.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            Marcar como enviada
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
