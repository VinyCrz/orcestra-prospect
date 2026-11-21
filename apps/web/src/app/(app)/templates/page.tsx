'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Loader2, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  CANAIS_INTERACAO,
  CANAL_INTERACAO_LABEL,
  criarTemplateSchema,
  DADOS_EXEMPLO_TEMPLATE,
  type Paginado,
  renderizarTemplate,
  VARIAVEIS_TEMPLATE,
  type CanalInteracao,
} from '@orcestra/shared';
import { Campo } from '@/components/form/campo';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { EjLista } from '@/lib/tipos';
import type { TemplateMsg } from '@/lib/tipos-cadencias';

const TODOS = '__todos__';

export default function TemplatesPage() {
  const { temPapel } = useAuth();
  const edita = temPapel('ADMIN', 'GESTOR');
  const [canal, setCanal] = useState<string>(TODOS);
  const [edicao, setEdicao] = useState<TemplateMsg | 'novo' | null>(null);

  const q = useQuery({
    queryKey: ['templates', canal],
    queryFn: () => api<TemplateMsg[]>(`/templates${canal === TODOS ? '' : `?canal=${canal}`}`),
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        titulo="Templates"
        descricao="Mensagens-modelo por canal, com variáveis preenchidas na hora do envio."
        acoes={
          edita && (
            <Button size="sm" onClick={() => setEdicao('novo')}>
              <Plus /> Novo template
            </Button>
          )
        }
      />
      <div className="mb-4 grid max-w-xs gap-1.5">
        <Label htmlFor="tpl-canal">Canal</Label>
        <Select value={canal} onValueChange={setCanal}>
          <SelectTrigger id="tpl-canal" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os canais</SelectItem>
            {CANAIS_INTERACAO.map((c) => (
              <SelectItem key={c} value={c}>
                {CANAL_INTERACAO_LABEL[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {q.isLoading ? (
        <div className="grid gap-3" aria-busy="true" aria-label="Carregando templates">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : q.isError ? (
        <div className="rounded-md border p-6 text-center" role="alert">
          <p className="text-sm text-destructive">Erro ao carregar os templates.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void q.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : !q.data?.length ? (
        <p className="text-sm text-muted-foreground" data-testid="templates-vazio">
          Nenhum template encontrado.
        </p>
      ) : (
        <ul className="grid gap-3">
          {q.data.map((t) => (
            <li key={t.id}>
              <Card data-testid="template">
                <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {t.nome}
                      <Badge variant="brand">{CANAL_INTERACAO_LABEL[t.canal]}</Badge>
                      {!t.ativo && <Badge variant="secondary">Inativo</Badge>}
                    </p>
                    {t.assunto && (
                      <p className="mt-1 text-sm text-muted-foreground break-words">
                        Assunto: {t.assunto}
                      </p>
                    )}
                    <p className="mt-1 line-clamp-3 text-sm whitespace-pre-line break-words">
                      {t.corpo}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEdicao(t)}>
                    {edita ? <Pencil /> : <Eye />}
                    {edita ? 'Editar' : 'Ver'}
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!edicao} onOpenChange={(o) => !o && setEdicao(null)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
          {edicao && (
            <Editor
              template={edicao === 'novo' ? null : edicao}
              somenteLeitura={!edita}
              onFechar={() => setEdicao(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Editor({
  template,
  somenteLeitura,
  onFechar,
}: {
  template: TemplateMsg | null;
  somenteLeitura: boolean;
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const [nome, setNome] = useState(template?.nome ?? '');
  const [canal, setCanal] = useState<CanalInteracao>(template?.canal ?? 'EMAIL');
  const [assunto, setAssunto] = useState(template?.assunto ?? '');
  const [corpo, setCorpo] = useState(template?.corpo ?? '');
  const [ativo, setAtivo] = useState(template?.ativo ?? true);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [ejId, setEjId] = useState('');
  const [busca, setBusca] = useState('');

  const previaLocal = useMemo(
    () => ({
      assunto: canal === 'EMAIL' ? renderizarTemplate(assunto, DADOS_EXEMPLO_TEMPLATE) : '',
      texto: renderizarTemplate(corpo, DADOS_EXEMPLO_TEMPLATE),
    }),
    [assunto, corpo, canal],
  );

  const ejs = useQuery({
    queryKey: ['ejs-busca-template', busca],
    queryFn: () =>
      api<Paginado<EjLista>>(`/empresas-juniores?pageSize=8&busca=${encodeURIComponent(busca)}`),
    enabled: busca.trim().length >= 2,
  });

  const previaReal = useMutation({
    mutationFn: () =>
      api<{ canal: string; assunto: string | null; texto: string }>(
        `/templates/${template!.id}/previsualizar`,
        { method: 'POST', json: { ejId } },
      ),
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Erro ao pré-visualizar com a EJ'),
  });

  const salvar = useMutation({
    mutationFn: (corpoReq: Record<string, unknown>) =>
      template
        ? api(`/templates/${template.id}`, { method: 'PATCH', json: corpoReq })
        : api('/templates', { method: 'POST', json: corpoReq }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['templates'] });
      void qc.invalidateQueries({ queryKey: ['cadencias'] });
      toast.success('Template salvo');
      onFechar();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar o template'),
  });

  function inserir(v: string) {
    const el = document.getElementById('tpl-corpo') as HTMLTextAreaElement | null;
    const marca = `{{${v}}}`;
    if (!el) return setCorpo((c) => c + marca);
    const ini = el.selectionStart ?? corpo.length;
    const fim = el.selectionEnd ?? corpo.length;
    setCorpo(corpo.slice(0, ini) + marca + corpo.slice(fim));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(ini + marca.length, ini + marca.length);
    });
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const req = { nome, canal, assunto: canal === 'EMAIL' ? assunto || null : null, corpo, ativo };
    const r = criarTemplateSchema.safeParse(req);
    if (!r.success) {
      const mapa: Record<string, string> = {};
      for (const i of r.error.issues) mapa[String(i.path[0])] ??= i.message;
      setErros(mapa);
      return;
    }
    setErros({});
    salvar.mutate(req);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{template ? (somenteLeitura ? template.nome : 'Editar template') : 'Novo template'}</DialogTitle>
        <DialogDescription>
          {somenteLeitura
            ? 'Somente leitura: apenas Admin e Gestor editam templates.'
            : 'Use as variáveis para personalizar a mensagem.'}
        </DialogDescription>
      </DialogHeader>
      <form id="form-template" onSubmit={enviar} className="grid gap-4" noValidate>
        <fieldset disabled={somenteLeitura} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="tpl-nome" label="Nome" erro={erros.nome}>
              <Input id="tpl-nome" value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} aria-invalid={!!erros.nome} />
            </Campo>
            <Campo id="tpl-canal-ed" label="Canal">
              <Select value={canal} onValueChange={(v) => setCanal(v as CanalInteracao)}>
                <SelectTrigger id="tpl-canal-ed">
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
          </div>
          {canal === 'EMAIL' && (
            <Campo id="tpl-assunto" label="Assunto" erro={erros.assunto}>
              <Input id="tpl-assunto" value={assunto} maxLength={200} onChange={(e) => setAssunto(e.target.value)} aria-invalid={!!erros.assunto} />
            </Campo>
          )}
          <Campo id="tpl-corpo" label="Corpo da mensagem" erro={erros.corpo}>
            <Textarea
              id="tpl-corpo"
              rows={8}
              maxLength={5000}
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
              aria-invalid={!!erros.corpo}
            />
          </Campo>
          {!somenteLeitura && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Inserir variável">
              <span className="text-xs text-muted-foreground">Inserir variável:</span>
              {VARIAVEIS_TEMPLATE.map((v) => (
                <Button key={v} type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => inserir(v)}>
                  {`{{${v}}}`}
                </Button>
              ))}
            </div>
          )}
          {template && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={ativo}
                onChange={(e) => setAtivo(e.target.checked)}
              />
              Template ativo
            </label>
          )}
        </fieldset>
      </form>

      <section className="grid gap-2 rounded-md border bg-muted/40 p-3" aria-label="Pré-visualização">
        <h3 className="text-sm font-medium">Pré-visualização (dados de exemplo)</h3>
        {canal === 'EMAIL' && previaLocal.assunto && (
          <p className="text-sm break-words" data-testid="previa-assunto">
            <span className="text-muted-foreground">Assunto:</span> {previaLocal.assunto}
          </p>
        )}
        <p className="text-sm whitespace-pre-line break-words" data-testid="previa-texto">
          {previaLocal.texto || <span className="text-muted-foreground">Digite o corpo para ver a prévia.</span>}
        </p>
      </section>

      {template && (
        <section className="grid gap-2 rounded-md border p-3" aria-label="Prévia com EJ real">
          <h3 className="text-sm font-medium">Prévia com uma EJ real</h3>
          <div className="grid gap-1.5">
            <Label htmlFor="tpl-busca-ej">Buscar EJ</Label>
            <Input id="tpl-busca-ej" placeholder="Digite ao menos 2 letras" value={busca} onChange={(e) => { setBusca(e.target.value); setEjId(''); }} />
          </div>
          {busca.trim().length >= 2 && (
            <div className="grid gap-1.5">
              <Label htmlFor="tpl-ej">Empresa Júnior</Label>
              <Select value={ejId} onValueChange={setEjId}>
                <SelectTrigger id="tpl-ej">
                  <SelectValue placeholder={ejs.isLoading ? 'Buscando…' : 'Selecione…'} />
                </SelectTrigger>
                <SelectContent>
                  {(ejs.data?.items ?? []).map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button type="button" size="sm" variant="outline" className="w-fit" disabled={!ejId || previaReal.isPending} onClick={() => previaReal.mutate()}>
            {previaReal.isPending && <Loader2 className="animate-spin" />}
            Pré-visualizar com esta EJ
          </Button>
          {previaReal.data && (
            <div className="rounded-md bg-muted/40 p-2 text-sm whitespace-pre-line break-words" data-testid="previa-real">
              {previaReal.data.assunto && <p className="font-medium">Assunto: {previaReal.data.assunto}</p>}
              {previaReal.data.texto}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Salve antes: a prévia real usa a versão gravada do template.</p>
        </section>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onFechar}>
          {somenteLeitura ? 'Fechar' : 'Cancelar'}
        </Button>
        {!somenteLeitura && (
          <Button type="submit" form="form-template" disabled={salvar.isPending}>
            {salvar.isPending && <Loader2 className="animate-spin" />}
            Salvar
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
