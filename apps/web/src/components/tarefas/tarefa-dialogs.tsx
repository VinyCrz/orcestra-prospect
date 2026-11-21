'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { criarTarefaSchema } from '@orcestra/shared';
import { Campo } from '@/components/form/campo';
import { useOpcoesResponsaveis } from '@/components/ej/use-opcoes';
import { hojeIso } from '@/components/funil/status-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function invalidarTarefas(qc: ReturnType<typeof useQueryClient>) {
  for (const k of ['agenda', 'tarefas-contador', 'timeline'])
    void qc.invalidateQueries({ queryKey: [k] });
}

export function NovaTarefaDialog({
  aberto,
  onFechar,
  responsavelPadrao,
  podeEscolherResponsavel,
}: {
  aberto: boolean;
  onFechar: () => void;
  responsavelPadrao: string;
  podeEscolherResponsavel: boolean;
}) {
  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        {aberto && (
          <NovaTarefa
            onFechar={onFechar}
            responsavelPadrao={responsavelPadrao}
            podeEscolherResponsavel={podeEscolherResponsavel}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NovaTarefa({
  onFechar,
  responsavelPadrao,
  podeEscolherResponsavel,
}: {
  onFechar: () => void;
  responsavelPadrao: string;
  podeEscolherResponsavel: boolean;
}) {
  const qc = useQueryClient();
  const { usuario } = useAuth();
  const resp = useOpcoesResponsaveis(podeEscolherResponsavel);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [vencimento, setVencimento] = useState(hojeIso());
  const [responsavelId, setResponsavelId] = useState(responsavelPadrao);
  const [erros, setErros] = useState<Record<string, string>>({});

  const m = useMutation({
    mutationFn: (corpo: Record<string, unknown>) => api('/tarefas', { method: 'POST', json: corpo }),
    onSuccess: () => {
      invalidarTarefas(qc);
      toast.success('Tarefa criada');
      onFechar();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao criar a tarefa'),
  });

  const outros = (resp.data?.usuarios ?? []).filter((u) => u.id !== usuario?.id);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const corpo = {
      titulo,
      descricao: descricao || null,
      vencimento,
      ...(podeEscolherResponsavel && responsavelId ? { responsavelId } : {}),
    };
    const r = criarTarefaSchema.safeParse(corpo);
    if (!r.success) {
      const mapa: Record<string, string> = {};
      for (const i of r.error.issues) mapa[String(i.path[0])] = i.message;
      setErros(mapa);
      return;
    }
    setErros({});
    m.mutate(corpo);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Nova tarefa</DialogTitle>
        <DialogDescription>Crie um lembrete manual na agenda.</DialogDescription>
      </DialogHeader>
      <form id="form-tarefa" onSubmit={enviar} className="grid gap-4" noValidate>
        <Campo id="tar-titulo" label="Título" erro={erros.titulo}>
          <Input
            id="tar-titulo"
            maxLength={200}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            aria-invalid={!!erros.titulo}
          />
        </Campo>
        <Campo id="tar-data" label="Vencimento" erro={erros.vencimento}>
          <Input
            id="tar-data"
            type="date"
            min={hojeIso()}
            value={vencimento}
            onChange={(e) => setVencimento(e.target.value)}
          />
        </Campo>
        <Campo id="tar-desc" label="Descrição (opcional)" erro={erros.descricao}>
          <Textarea
            id="tar-desc"
            maxLength={2000}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </Campo>
        {podeEscolherResponsavel && (
          <Campo id="tar-resp" label="Responsável">
            <Select value={responsavelId} onValueChange={setResponsavelId}>
              <SelectTrigger id="tar-resp">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {usuario && <SelectItem value={usuario.id}>Eu ({usuario.nome})</SelectItem>}
                {outros.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
        )}
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onFechar}>
          Cancelar
        </Button>
        <Button type="submit" form="form-tarefa" disabled={m.isPending}>
          {m.isPending && <Loader2 className="animate-spin" />}
          Criar tarefa
        </Button>
      </DialogFooter>
    </>
  );
}

export function AdiarDataDialog({
  tarefaId,
  onFechar,
}: {
  tarefaId: string | null;
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const [data, setData] = useState('');
  const m = useMutation({
    mutationFn: () =>
      api(`/tarefas/${tarefaId}/adiar`, { method: 'POST', json: { novaData: data } }),
    onSuccess: () => {
      invalidarTarefas(qc);
      toast.success('Tarefa adiada');
      setData('');
      onFechar();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao adiar a tarefa'),
  });
  return (
    <Dialog open={!!tarefaId} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adiar para…</DialogTitle>
          <DialogDescription>Escolha a nova data de vencimento.</DialogDescription>
        </DialogHeader>
        <Campo id="adiar-data" label="Nova data">
          <Input
            id="adiar-data"
            type="date"
            min={hojeIso()}
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </Campo>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={() => m.mutate()} disabled={!data || m.isPending}>
            {m.isPending && <Loader2 className="animate-spin" />}
            Adiar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
