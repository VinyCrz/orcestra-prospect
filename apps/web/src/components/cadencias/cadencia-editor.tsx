'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  CANAIS_INTERACAO,
  CANAL_INTERACAO_LABEL,
  criarCadenciaSchema,
  type CanalInteracao,
} from '@orcestra/shared';
import { Campo } from '@/components/form/campo';
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
import type { Cadencia, TemplateMsg } from '@/lib/tipos-cadencias';

interface PassoForm {
  id?: string;
  chave: string;
  diaOffset: string;
  canal: CanalInteracao;
  templateId: string;
  instrucoes: string;
}
const SEM_TPL = '__sem__';
let seq = 0;
const novaChave = () => `p${++seq}`;

function inicial(c: Cadencia | null): PassoForm[] {
  return (c?.passos ?? []).map((p) => ({
    id: p.id,
    chave: novaChave(),
    diaOffset: String(p.diaOffset),
    canal: p.canal,
    templateId: p.templateId ?? SEM_TPL,
    instrucoes: p.instrucoes ?? '',
  }));
}

export function CadenciaEditorDialog({
  aberto,
  cadencia,
  onFechar,
}: {
  aberto: boolean;
  cadencia: Cadencia | null;
  onFechar: () => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        {aberto && <Editor cadencia={cadencia} onFechar={onFechar} />}
      </DialogContent>
    </Dialog>
  );
}

function Editor({ cadencia, onFechar }: { cadencia: Cadencia | null; onFechar: () => void }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState(cadencia?.nome ?? '');
  const [descricao, setDescricao] = useState(cadencia?.descricao ?? '');
  const [ativa, setAtiva] = useState(cadencia?.ativa ?? true);
  const [passos, setPassos] = useState<PassoForm[]>(() =>
    cadencia ? inicial(cadencia) : [{ chave: novaChave(), diaOffset: '0', canal: 'EMAIL', templateId: SEM_TPL, instrucoes: '' }],
  );
  const [erros, setErros] = useState<string[]>([]);
  const tpls = useQuery({
    queryKey: ['templates', '__todos__'],
    queryFn: () => api<TemplateMsg[]>('/templates'),
  });

  const salvar = useMutation({
    mutationFn: (corpo: unknown) =>
      cadencia
        ? api(`/cadencias/${cadencia.id}`, { method: 'PATCH', json: corpo })
        : api('/cadencias', { method: 'POST', json: corpo }),
    onSuccess: () => {
      for (const k of ['cadencias', 'cadencia'])
        void qc.invalidateQueries({ queryKey: [k] });
      toast.success('Cadência salva');
      onFechar();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar a cadência'),
  });

  const set = (i: number, patch: Partial<PassoForm>) =>
    setPassos((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const mover = (i: number, d: -1 | 1) =>
    setPassos((ps) => {
      const j = i + d;
      if (j < 0 || j >= ps.length) return ps;
      const c = [...ps];
      [c[i], c[j]] = [c[j]!, c[i]!];
      return c;
    });

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const corpo = {
      nome,
      descricao: descricao || null,
      ativa,
      passos: passos.map((p) => ({
        ...(p.id ? { id: p.id } : {}),
        diaOffset: p.diaOffset === '' ? Number.NaN : Number(p.diaOffset),
        canal: p.canal,
        templateId: p.templateId === SEM_TPL ? null : p.templateId,
        instrucoes: p.instrucoes || null,
      })),
    };
    const r = criarCadenciaSchema.safeParse(corpo);
    if (!r.success) {
      setErros(
        r.error.issues.map((i) => {
          const pi = i.path[0] === 'passos' && typeof i.path[1] === 'number' ? `Passo ${i.path[1] + 1}: ` : '';
          return pi + i.message;
        }),
      );
      return;
    }
    setErros([]);
    salvar.mutate(corpo);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{cadencia ? 'Editar cadência' : 'Nova cadência'}</DialogTitle>
        <DialogDescription>
          Cada passo vira uma tarefa na agenda, no dia indicado a partir da inscrição.
        </DialogDescription>
      </DialogHeader>
      <form id="form-cadencia" onSubmit={enviar} className="grid gap-4" noValidate>
        <Campo id="cad-nome" label="Nome">
          <Input id="cad-nome" value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <Campo id="cad-desc" label="Descrição (opcional)">
          <Textarea id="cad-desc" rows={2} maxLength={1000} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </Campo>
        {cadencia && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} />
            Cadência ativa (permite novas inscrições)
          </label>
        )}

        <div className="grid gap-3">
          <h3 className="text-sm font-medium">Passos</h3>
          {passos.map((p, i) => {
            const opcoes = (tpls.data ?? []).filter((t) => t.canal === p.canal && (t.ativo || t.id === p.templateId));
            return (
              <fieldset key={p.chave} className="grid gap-3 rounded-md border p-3" data-testid="passo-editor">
                <legend className="px-1 text-sm font-medium">Passo {i + 1}</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Campo id={`p-dia-${p.chave}`} label="Dia (após inscrição)">
                    <Input id={`p-dia-${p.chave}`} type="number" min={0} max={365} value={p.diaOffset} onChange={(e) => set(i, { diaOffset: e.target.value })} />
                  </Campo>
                  <Campo id={`p-canal-${p.chave}`} label="Canal">
                    <Select value={p.canal} onValueChange={(v) => set(i, { canal: v as CanalInteracao, templateId: SEM_TPL })}>
                      <SelectTrigger id={`p-canal-${p.chave}`}>
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
                  <Campo id={`p-tpl-${p.chave}`} label="Template">
                    <Select value={p.templateId} onValueChange={(v) => set(i, { templateId: v })}>
                      <SelectTrigger id={`p-tpl-${p.chave}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SEM_TPL}>Sem template</SelectItem>
                        {opcoes.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Campo>
                </div>
                <Campo id={`p-ins-${p.chave}`} label="Instruções (opcional)">
                  <Textarea id={`p-ins-${p.chave}`} rows={2} maxLength={2000} value={p.instrucoes} onChange={(e) => set(i, { instrucoes: e.target.value })} />
                </Campo>
                <div className="flex gap-1">
                  <Button type="button" size="icon" variant="outline" onClick={() => mover(i, -1)} disabled={i === 0} aria-label={`Mover passo ${i + 1} para cima`}>
                    <ArrowUp />
                  </Button>
                  <Button type="button" size="icon" variant="outline" onClick={() => mover(i, 1)} disabled={i === passos.length - 1} aria-label={`Mover passo ${i + 1} para baixo`}>
                    <ArrowDown />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={() => setPassos((ps) => ps.filter((_, j) => j !== i))} disabled={passos.length === 1} aria-label={`Remover passo ${i + 1}`}>
                    <Trash2 />
                  </Button>
                </div>
              </fieldset>
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={passos.length >= 30}
            onClick={() => {
              const ult = passos[passos.length - 1];
              setPassos((ps) => [...ps, { chave: novaChave(), diaOffset: String(Number(ult?.diaOffset || 0) + 2), canal: ult?.canal ?? 'EMAIL', templateId: SEM_TPL, instrucoes: '' }]);
            }}
          >
            <Plus /> Adicionar passo
          </Button>
        </div>

        {erros.length > 0 && (
          <ul className="grid gap-1 text-sm text-destructive" role="alert">
            {erros.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onFechar}>
          Cancelar
        </Button>
        <Button type="submit" form="form-cadencia" disabled={salvar.isPending}>
          {salvar.isPending && <Loader2 className="animate-spin" />}
          Salvar
        </Button>
      </DialogFooter>
    </>
  );
}
