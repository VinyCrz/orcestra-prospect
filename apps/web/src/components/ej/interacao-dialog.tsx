'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  CANAIS_INTERACAO,
  CANAL_INTERACAO_LABEL,
  criarInteracaoSchema,
  RESULTADOS_INTERACAO,
  RESULTADO_INTERACAO_LABEL,
  STATUS_PROSPECCAO_LABEL,
  type CanalInteracao,
  type ResultadoInteracao,
  type StatusProspeccao,
} from '@orcestra/shared';
import { Campo } from '@/components/form/campo';
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
import type { ContatoEj } from '@/lib/tipos';
import type { InteracaoCriada } from '@/lib/tipos-funil';

const SEM_CONTATO = '__sem__';

function agoraLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function invalidarEj(qc: ReturnType<typeof useQueryClient>, ejId: string) {
  for (const k of ['ej', 'timeline', 'agenda', 'tarefas-contador', 'kanban', 'ejs'])
    void qc.invalidateQueries({ queryKey: [k] });
  void qc.invalidateQueries({ queryKey: ['ej', ejId] });
}

export function InteracaoDialog({
  ejId,
  statusAtual,
  aberto,
  onFechar,
}: {
  ejId: string;
  statusAtual: StatusProspeccao;
  aberto: boolean;
  onFechar: () => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        {aberto && <Corpo ejId={ejId} statusAtual={statusAtual} onFechar={onFechar} />}
      </DialogContent>
    </Dialog>
  );
}

function Corpo({
  ejId,
  statusAtual,
  onFechar,
}: {
  ejId: string;
  statusAtual: StatusProspeccao;
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const contatos = useQuery({
    queryKey: ['contatos', ejId],
    queryFn: () => api<ContatoEj[]>(`/empresas-juniores/${ejId}/contatos`),
  });
  const [canal, setCanal] = useState<CanalInteracao>('EMAIL');
  const [data, setData] = useState(agoraLocal);
  const [contatoId, setContatoId] = useState(SEM_CONTATO);
  const [resumo, setResumo] = useState('');
  const [resultado, setResultado] = useState<ResultadoInteracao>('SEM_RESPOSTA');
  const [proximoPasso, setProximoPasso] = useState('');
  const [proximoPassoData, setProximoPassoData] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [sugestao, setSugestao] = useState<InteracaoCriada['sugestaoStatus']>(null);

  const criar = useMutation({
    mutationFn: (corpo: Record<string, unknown>) =>
      api<InteracaoCriada>(`/empresas-juniores/${ejId}/interacoes`, { method: 'POST', json: corpo }),
    onSuccess: (r) => {
      invalidarEj(qc, ejId);
      toast.success(
        proximoPassoData ? 'Interação registrada e tarefa criada' : 'Interação registrada',
      );
      if (r.sugestaoStatus) setSugestao(r.sugestaoStatus);
      else onFechar();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao registrar a interação'),
  });

  const mover = useMutation({
    mutationFn: (status: StatusProspeccao) =>
      api(`/empresas-juniores/${ejId}/status`, { method: 'PATCH', json: { status } }),
    onSuccess: () => {
      invalidarEj(qc, ejId);
      toast.success('Status atualizado');
      onFechar();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao mudar o status'),
  });

  if (sugestao) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Mover para {STATUS_PROSPECCAO_LABEL[sugestao.para]}?</DialogTitle>
          <DialogDescription>
            A interação foi registrada. Esta EJ está em &quot;{STATUS_PROSPECCAO_LABEL[statusAtual]}
            &quot;; deseja movê-la para &quot;{STATUS_PROSPECCAO_LABEL[sugestao.para]}&quot;?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Agora não
          </Button>
          <Button onClick={() => mover.mutate(sugestao.para)} disabled={mover.isPending}>
            {mover.isPending && <Loader2 className="animate-spin" />}
            Mover para {STATUS_PROSPECCAO_LABEL[sugestao.para]}
          </Button>
        </DialogFooter>
      </>
    );
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const corpo = {
      canal,
      data: data ? new Date(data).toISOString() : undefined,
      contatoId: contatoId === SEM_CONTATO ? null : contatoId,
      resumo,
      resultado,
      proximoPasso: proximoPasso || null,
      proximoPassoData: proximoPassoData || null,
    };
    const r = criarInteracaoSchema.safeParse(corpo);
    if (!r.success) {
      const m: Record<string, string> = {};
      for (const i of r.error.issues) m[String(i.path[0])] = i.message;
      setErros(m);
      return;
    }
    setErros({});
    criar.mutate(corpo);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Registrar interação</DialogTitle>
        <DialogDescription>
          Registre o contato feito com a Empresa Júnior. Informar a data do próximo passo cria uma
          tarefa na sua agenda.
        </DialogDescription>
      </DialogHeader>
      <form id="form-interacao" onSubmit={enviar} className="grid gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="int-canal" label="Canal" erro={erros.canal}>
            <Select value={canal} onValueChange={(v) => setCanal(v as CanalInteracao)}>
              <SelectTrigger id="int-canal">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CANAIS_INTERACAO.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CANAL_INTERACAO_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo id="int-data" label="Data e hora" erro={erros.data}>
            <Input
              id="int-data"
              type="datetime-local"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </Campo>
        </div>
        <Campo id="int-contato" label="Contato (opcional)" erro={erros.contatoId}>
          <Select value={contatoId} onValueChange={setContatoId}>
            <SelectTrigger id="int-contato">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_CONTATO}>Sem contato específico</SelectItem>
              {(contatos.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id} disabled={c.optOut}>
                  {c.nome}
                  {c.optOut ? ' (opt-out)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
        <Campo id="int-resumo" label="Resumo" erro={erros.resumo}>
          <Textarea
            id="int-resumo"
            maxLength={5000}
            value={resumo}
            onChange={(e) => setResumo(e.target.value)}
            aria-invalid={!!erros.resumo}
          />
        </Campo>
        <Campo id="int-resultado" label="Resultado" erro={erros.resultado}>
          <Select value={resultado} onValueChange={(v) => setResultado(v as ResultadoInteracao)}>
            <SelectTrigger id="int-resultado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RESULTADOS_INTERACAO.map((r) => (
                <SelectItem key={r} value={r}>
                  {RESULTADO_INTERACAO_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <Campo id="int-passo" label="Próximo passo (opcional)" erro={erros.proximoPasso}>
            <Input
              id="int-passo"
              maxLength={300}
              value={proximoPasso}
              onChange={(e) => setProximoPasso(e.target.value)}
            />
          </Campo>
          <Campo id="int-passo-data" label="Data do próximo passo" erro={erros.proximoPassoData}>
            <Input
              id="int-passo-data"
              type="date"
              min={hojeIso()}
              value={proximoPassoData}
              onChange={(e) => setProximoPassoData(e.target.value)}
            />
          </Campo>
        </div>
        {proximoPassoData && (
          <p className="text-sm text-muted-foreground" role="status">
            Ao salvar, uma tarefa será criada na sua agenda para essa data.
          </p>
        )}
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onFechar}>
          Cancelar
        </Button>
        <Button type="submit" form="form-interacao" disabled={criar.isPending}>
          {criar.isPending && <Loader2 className="animate-spin" />}
          Registrar
        </Button>
      </DialogFooter>
    </>
  );
}
