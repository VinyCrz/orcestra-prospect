'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  atualizarTarefaSchema,
  criarTarefaSchema,
  FASE_TAREFA_LABEL,
  FASES_TAREFA,
  PRIORIDADE_TAREFA_LABEL,
  PRIORIDADES_TAREFA,
  type FaseTarefa,
  type PrioridadeTarefa,
} from '@orcestra/shared';
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
import type { TarefaAgenda } from '@/lib/tipos-funil';

export function invalidarTarefas(qc: ReturnType<typeof useQueryClient>) {
  for (const k of ['agenda', 'agenda-painel', 'tarefas-contador', 'timeline'])
    void qc.invalidateQueries({ queryKey: [k] });
}

export function TarefaDialog({
  aberto,
  onFechar,
  responsavelPadrao,
  podeEscolherResponsavel,
  dataPadrao,
  faseInicial,
  tarefa,
  onMensagem,
  onAdiar,
}: {
  aberto: boolean;
  onFechar: () => void;
  responsavelPadrao: string;
  podeEscolherResponsavel: boolean;
  dataPadrao?: string;
  faseInicial?: 'IDEIA' | 'NAO_INICIADA' | 'EM_ANDAMENTO';
  tarefa?: TarefaAgenda;
  onMensagem: (id: string) => void;
  onAdiar: (id: string) => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        {aberto && (
          <FormularioTarefa
            key={tarefa?.id ?? 'nova'}
            onFechar={onFechar}
            responsavelPadrao={responsavelPadrao}
            podeEscolherResponsavel={podeEscolherResponsavel}
            dataPadrao={dataPadrao}
            faseInicial={faseInicial}
            tarefa={tarefa}
            onMensagem={onMensagem}
            onAdiar={onAdiar}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

const dataCivil = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
});

function FormularioTarefa({
  onFechar,
  responsavelPadrao,
  podeEscolherResponsavel,
  dataPadrao,
  faseInicial = 'NAO_INICIADA',
  tarefa,
  onMensagem,
  onAdiar,
}: {
  onFechar: () => void;
  responsavelPadrao: string;
  podeEscolherResponsavel: boolean;
  dataPadrao?: string;
  faseInicial?: 'IDEIA' | 'NAO_INICIADA' | 'EM_ANDAMENTO';
  tarefa?: TarefaAgenda;
  onMensagem: (id: string) => void;
  onAdiar: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { usuario } = useAuth();
  const editavel = tarefa?.podeEditar ?? true;
  const resp = useOpcoesResponsaveis(editavel);
  const [titulo, setTitulo] = useState(tarefa?.titulo ?? '');
  const [descricao, setDescricao] = useState(tarefa?.descricao ?? '');
  const [vencimento, setVencimento] = useState(
    tarefa ? (tarefa.vencimento ? dataCivil.format(new Date(tarefa.vencimento)) : '') : (dataPadrao ?? ''),
  );
  const [responsavelId, setResponsavelId] = useState(tarefa?.responsavelId ?? responsavelPadrao);
  const [prioridade, setPrioridade] = useState<PrioridadeTarefa>(tarefa?.prioridade ?? 'MEDIA');
  const [colaboradorIds, setColaboradorIds] = useState(tarefa?.colaboradores.map((c) => c.id) ?? []);
  const [novaSubtarefa, setNovaSubtarefa] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});

  const m = useMutation({
    mutationFn: (corpo: Record<string, unknown>) =>
      api(tarefa ? `/tarefas/${tarefa.id}` : '/tarefas', { method: tarefa ? 'PATCH' : 'POST', json: corpo }),
    onSuccess: () => {
      invalidarTarefas(qc);
      toast.success(tarefa ? 'Tarefa atualizada' : 'Tarefa criada');
      onFechar();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar a tarefa'),
  });

  const atualizarDetalhe = useMutation({
    mutationFn: ({ rota, method, json }: { rota: string; method: 'POST' | 'PATCH'; json: object }) =>
      api(`/tarefas/${tarefa?.id}/${rota}`, { method, json }),
    onSuccess: async (_, operacao) => {
      if (operacao.method === 'POST') setNovaSubtarefa('');
      await qc.invalidateQueries({ queryKey: ['agenda-painel'] });
      if (operacao.rota === 'fase') invalidarTarefas(qc);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao atualizar a tarefa'),
  });

  const outros = (resp.data?.usuarios ?? []).filter((u) => u.id !== usuario?.id);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const corpo = {
      titulo,
      descricao: descricao || null,
      ...(!tarefa || vencimento !== (tarefa.vencimento ? dataCivil.format(new Date(tarefa.vencimento)) : '')
        ? { vencimento: vencimento || null }
        : {}),
      prioridade,
      ...(!tarefa ? { fase: faseInicial } : {}),
      ...(!tarefa || colaboradorIds.join(',') !== tarefa.colaboradores.map((c) => c.id).join(',')
        ? { colaboradorIds }
        : {}),
      ...(podeEscolherResponsavel && responsavelId ? { responsavelId } : {}),
    };
    const r = (tarefa ? atualizarTarefaSchema : criarTarefaSchema).safeParse(corpo);
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
        <DialogTitle>{tarefa?.titulo ?? 'Nova tarefa'}</DialogTitle>
        <DialogDescription>
          {tarefa ? 'Detalhes da tarefa na Minha Agenda.' : 'A tarefa fica disponível no Calendário e no Kanban.'}
        </DialogDescription>
      </DialogHeader>
      {editavel ? (
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
        {podeEscolherResponsavel ? (
          <Campo id="tar-resp" label="Responsável">
            <Select value={responsavelId} onValueChange={(id) => {
              setResponsavelId(id);
              setColaboradorIds((ids) => ids.filter((item) => item !== id));
            }}>
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
        ) : (
          <p className="text-sm">Responsável: {tarefa?.responsavel.nome ?? usuario?.nome}</p>
        )}
        <Campo id="tar-prioridade" label="Prioridade">
          <Select value={prioridade} onValueChange={(v) => setPrioridade(v as PrioridadeTarefa)}>
            <SelectTrigger id="tar-prioridade"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRIORIDADES_TAREFA.map((p) => (
                <SelectItem key={p} value={p}>{PRIORIDADE_TAREFA_LABEL[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
        <fieldset className="grid gap-1.5">
          <legend className="mb-1 text-sm font-medium">Colaboradores</legend>
          {resp.isError && <p className="text-sm text-destructive">Não foi possível carregar os usuários.</p>}
          {resp.isPending && <p className="text-sm text-muted-foreground">Carregando usuários…</p>}
          {resp.isSuccess && (
            <div className="grid max-h-32 gap-2 overflow-y-auto rounded-md border p-2">
              {resp.data.usuarios.filter((u) => u.id !== responsavelId).map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={colaboradorIds.includes(u.id)}
                    onChange={(e) => setColaboradorIds((ids) =>
                      e.target.checked ? [...ids, u.id] : ids.filter((id) => id !== u.id),
                    )}
                  />
                  {u.nome}
                </label>
              ))}
              {!resp.data.usuarios.some((u) => u.id !== responsavelId) && (
                <p className="text-sm text-muted-foreground">Nenhum outro usuário ativo.</p>
              )}
            </div>
          )}
        </fieldset>
      </form>
      ) : tarefa && (
        <div className="grid gap-2 text-sm">
          {tarefa.descricao && <p className="whitespace-pre-wrap">{tarefa.descricao}</p>}
          <p>Vencimento: {vencimento ? vencimento.split('-').reverse().join('/') : 'Sem data'}</p>
          <p>Responsável: {tarefa.responsavel.nome}</p>
          <p>Prioridade: {PRIORIDADE_TAREFA_LABEL[tarefa.prioridade]}</p>
          <p>Fase: {FASE_TAREFA_LABEL[tarefa.fase]}</p>
          <p>Colaboradores: {tarefa.colaboradores.map((c) => c.nome).join(', ') || 'Nenhum'}</p>
        </div>
      )}
      {tarefa && (
        <>
          {editavel && (
            <Campo id="tar-fase" label="Fase">
              <Select
                value={tarefa.fase}
                disabled={atualizarDetalhe.isPending}
                onValueChange={(fase: FaseTarefa) => atualizarDetalhe.mutate({ rota: 'fase', method: 'PATCH', json: { fase } })}
              >
                <SelectTrigger id="tar-fase"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FASES_TAREFA.map((fase) => <SelectItem key={fase} value={fase}>{FASE_TAREFA_LABEL[fase]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Campo>
          )}
          <section aria-labelledby="titulo-subtarefas" className="grid gap-2 border-t pt-3">
            <h3 id="titulo-subtarefas" className="text-sm font-medium">Subtarefas</h3>
            {tarefa.subtarefas.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={s.concluida}
                  disabled={atualizarDetalhe.isPending}
                  onChange={(e) => atualizarDetalhe.mutate({
                    rota: `subtarefas/${s.id}`, method: 'PATCH', json: { concluida: e.target.checked },
                  })}
                />
                <span className={s.concluida ? 'text-muted-foreground line-through' : undefined}>{s.titulo}</span>
              </label>
            ))}
            <form className="flex gap-2" onSubmit={(e) => {
              e.preventDefault();
              atualizarDetalhe.mutate({ rota: 'subtarefas', method: 'POST', json: { titulo: novaSubtarefa } });
            }}>
              <Input aria-label="Nova subtarefa" placeholder="Nova subtarefa" maxLength={200}
                value={novaSubtarefa} onChange={(e) => setNovaSubtarefa(e.target.value)} />
              <Button type="submit" size="sm" variant="outline"
                disabled={novaSubtarefa.trim().length < 2 || atualizarDetalhe.isPending}>Adicionar</Button>
            </form>
          </section>
          {editavel && !tarefa.concluida && (
            <div className="flex flex-wrap gap-2">
              {tarefa.origem === 'CADENCIA' && (
                <Button type="button" size="sm" variant="outline" onClick={() => onMensagem(tarefa.id)}>
                  Gerar mensagem
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" onClick={() => onAdiar(tarefa.id)}>Adiar</Button>
            </div>
          )}
        </>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onFechar}>
          {tarefa ? 'Fechar' : 'Cancelar'}
        </Button>
        {editavel && (
          <Button type="submit" form="form-tarefa" disabled={m.isPending}>
            {m.isPending && <Loader2 className="animate-spin" />}
            {tarefa ? 'Salvar alterações' : 'Criar tarefa'}
          </Button>
        )}
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
