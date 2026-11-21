'use client';
import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Loader2, Mail, MessageCircle, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  BASES_LEGAIS,
  CARGO_CONTATO_LABEL,
  CARGOS_CONTATO,
  criarContatoSchema,
  type BaseLegal,
  type CargoContato,
} from '@orcestra/shared';
import { Campo } from '@/components/form/campo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { api, ApiError } from '@/lib/api';
import type { ContatoEj } from '@/lib/tipos';

const BASE_LEGAL_LABEL: Record<BaseLegal, string> = {
  LEGITIMO_INTERESSE_B2B: 'Legítimo interesse (B2B)',
  CONSENTIMENTO: 'Consentimento',
  EXECUCAO_CONTRATO: 'Execução de contrato',
  OBRIGACAO_LEGAL: 'Obrigação legal',
};

const dataBr = (iso: string | null) =>
  iso ? iso.slice(0, 10).split('-').reverse().join('/') : null;

/** wa.me exige DDI + número, só dígitos. */
function linkWhatsapp(tel: string) {
  const d = tel.replace(/\D/g, '');
  return `https://wa.me/${d.length <= 11 ? `55${d}` : d}`;
}

interface Valores {
  nome: string;
  cargo: CargoContato;
  cargoDescricao: string;
  email: string;
  telefone: string;
  whatsapp: string;
  linkedin: string;
  principal: boolean;
  mandatoInicio: string;
  mandatoFim: string;
  baseLegal: BaseLegal;
  fonte: string;
  optOut: boolean;
  optOutMotivo: string;
}

const vazio: Valores = {
  nome: '',
  cargo: 'OUTRO',
  cargoDescricao: '',
  email: '',
  telefone: '',
  whatsapp: '',
  linkedin: '',
  principal: false,
  mandatoInicio: '',
  mandatoFim: '',
  baseLegal: 'LEGITIMO_INTERESSE_B2B',
  fonte: '',
  optOut: false,
  optOutMotivo: '',
};

function deContato(c: ContatoEj): Valores {
  return {
    nome: c.nome,
    cargo: c.cargo,
    cargoDescricao: c.cargoDescricao ?? '',
    email: c.email ?? '',
    telefone: c.telefone ?? '',
    whatsapp: c.whatsapp ?? '',
    linkedin: c.linkedin ?? '',
    principal: c.principal,
    mandatoInicio: c.mandatoInicio?.slice(0, 10) ?? '',
    mandatoFim: c.mandatoFim?.slice(0, 10) ?? '',
    baseLegal: c.baseLegal,
    fonte: c.fonte ?? '',
    optOut: c.optOut,
    optOutMotivo: c.optOutMotivo ?? '',
  };
}

export function SecaoContatos({ ejId, podeEditar }: { ejId: string; podeEditar: boolean }) {
  const qc = useQueryClient();
  const [edicao, setEdicao] = useState<ContatoEj | 'novo' | null>(null);
  const [exclusao, setExclusao] = useState<ContatoEj | null>(null);
  const q = useQuery({
    queryKey: ['contatos', ejId],
    queryFn: () => api<ContatoEj[]>(`/empresas-juniores/${ejId}/contatos`),
  });
  const excluir = useMutation({
    mutationFn: (id: string) => api(`/contatos/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Contato excluído');
      void qc.invalidateQueries({ queryKey: ['contatos', ejId] });
      setExclusao(null);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir'),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>Contatos</CardTitle>
          <CardDescription>
            Somente dados institucionais/profissionais, com base legal e fonte registradas.
          </CardDescription>
        </div>
        {podeEditar && (
          <Button size="sm" onClick={() => setEdicao('novo')}>
            <Plus /> Novo contato
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-3">
        {q.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : q.isError ? (
          <p className="text-sm text-destructive">Não foi possível carregar os contatos.</p>
        ) : (q.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum contato cadastrado.</p>
        ) : (
          q.data!.map((c) => (
            <article
              key={c.id}
              className="grid gap-2 rounded-md border p-3 text-sm"
              data-testid="contato"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium">{c.nome}</h3>
                {c.principal && (
                  <Badge variant="brand">
                    <Star /> Principal
                  </Badge>
                )}
                <Badge variant="secondary">
                  {c.cargo === 'OUTRO' && c.cargoDescricao
                    ? c.cargoDescricao
                    : CARGO_CONTATO_LABEL[c.cargo]}
                </Badge>
                {c.optOut && (
                  <Badge variant="destructive">
                    <Ban /> Opt-out
                  </Badge>
                )}
                {podeEditar && (
                  <div className="ml-auto flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Editar ${c.nome}`}
                      onClick={() => setEdicao(c)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Excluir ${c.nome}`}
                      onClick={() => setExclusao(c)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </div>
              {c.optOut && (
                <p className="rounded-md bg-destructive/10 p-2 text-destructive">
                  Este contato pediu para não ser contatado
                  {c.optOutEm ? ` (${dataBr(c.optOutEm)})` : ''}
                  {c.optOutMotivo ? `: ${c.optOutMotivo}` : '.'} Não envie mensagens.
                </p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {c.email &&
                  (c.optOut ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground line-through">
                      <Mail className="size-3.5" /> {c.email}
                    </span>
                  ) : (
                    <a
                      href={`mailto:${c.email}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Mail className="size-3.5" /> {c.email}
                    </a>
                  ))}
                {c.whatsapp &&
                  (c.optOut ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground line-through">
                      <MessageCircle className="size-3.5" /> {c.whatsapp}
                    </span>
                  ) : (
                    <a
                      href={linkWhatsapp(c.whatsapp)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <MessageCircle className="size-3.5" /> {c.whatsapp}
                    </a>
                  ))}
                {c.telefone && <span className="text-muted-foreground">Tel.: {c.telefone}</span>}
                {c.linkedin && (
                  <a
                    href={c.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    LinkedIn
                  </a>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Mandato: {dataBr(c.mandatoInicio) ?? '—'} a {dataBr(c.mandatoFim) ?? '—'} · Base
                legal: {BASE_LEGAL_LABEL[c.baseLegal]} · Fonte: {c.fonte ?? 'não informada'}
              </p>
            </article>
          ))
        )}
      </CardContent>

      <DialogContato ejId={ejId} edicao={edicao} onFechar={() => setEdicao(null)} />

      <Dialog open={!!exclusao} onOpenChange={(o) => !o && setExclusao(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir contato</DialogTitle>
            <DialogDescription>
              Excluir {exclusao?.nome}? Se o objetivo é parar de contatar, prefira marcar opt-out.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExclusao(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={excluir.isPending}
              onClick={() => exclusao && excluir.mutate(exclusao.id)}
            >
              {excluir.isPending && <Loader2 className="animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DialogContato({
  ejId,
  edicao,
  onFechar,
}: {
  ejId: string;
  edicao: ContatoEj | 'novo' | null;
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const contato = edicao && edicao !== 'novo' ? edicao : null;
  const [erros, setErros] = useState<Record<string, string>>({});
  const form = useForm<Valores>({
    values: contato ? deContato(contato) : vazio,
  });
  const cargo = form.watch('cargo');
  const optOut = form.watch('optOut');

  const m = useMutation({
    mutationFn: (json: unknown) =>
      contato
        ? api(`/contatos/${contato.id}`, { method: 'PATCH', json })
        : api(`/empresas-juniores/${ejId}/contatos`, { method: 'POST', json }),
    onSuccess: () => {
      toast.success(contato ? 'Contato atualizado' : 'Contato criado');
      void qc.invalidateQueries({ queryKey: ['contatos', ejId] });
      onFechar();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar contato'),
  });

  function enviar(v: Valores) {
    const r = criarContatoSchema.safeParse(v);
    if (!r.success) {
      const e: Record<string, string> = {};
      for (const i of r.error.issues) e[String(i.path[0])] ??= i.message;
      return setErros(e);
    }
    setErros({});
    m.mutate(r.data);
  }

  const t = (id: keyof Valores, label: string, props: React.ComponentProps<'input'> = {}) => (
    <Campo id={`c-${id}`} label={label} erro={erros[id]}>
      <Input id={`c-${id}`} aria-invalid={!!erros[id]} {...form.register(id as never)} {...props} />
    </Campo>
  );

  return (
    <Dialog
      open={!!edicao}
      onOpenChange={(o) => {
        if (!o) {
          setErros({});
          onFechar();
        }
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{contato ? 'Editar contato' : 'Novo contato'}</DialogTitle>
          <DialogDescription>
            Registre só dados profissionais/institucionais, com a fonte do dado.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(enviar)} className="grid gap-4 sm:grid-cols-2" noValidate>
          <div className="sm:col-span-2">{t('nome', 'Nome *')}</div>
          <Campo id="c-cargo" label="Cargo" erro={erros.cargo}>
            <Controller
              control={form.control}
              name="cargo"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="c-cargo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CARGOS_CONTATO.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CARGO_CONTATO_LABEL[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Campo>
          {cargo === 'OUTRO' && t('cargoDescricao', 'Descrição do cargo')}
          {t('email', 'E-mail', { type: 'email' })}
          {t('telefone', 'Telefone', { type: 'tel' })}
          {t('whatsapp', 'WhatsApp', { type: 'tel' })}
          {t('linkedin', 'LinkedIn', { inputMode: 'url' })}
          {t('mandatoInicio', 'Início do mandato', { type: 'date' })}
          {t('mandatoFim', 'Fim do mandato', { type: 'date' })}
          <Campo id="c-baseLegal" label="Base legal (LGPD)" erro={erros.baseLegal}>
            <Controller
              control={form.control}
              name="baseLegal"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="c-baseLegal">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BASES_LEGAIS.map((b) => (
                      <SelectItem key={b} value={b}>
                        {BASE_LEGAL_LABEL[b]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Campo>
          {t('fonte', 'Fonte do dado')}
          <div className="flex items-center gap-2 sm:col-span-2">
            <Checkbox id="c-principal" {...form.register('principal')} />
            <Label htmlFor="c-principal">Contato principal</Label>
          </div>
          <div className="grid gap-3 rounded-md border border-destructive/30 p-3 sm:col-span-2">
            <div className="flex items-center gap-2">
              <Checkbox id="c-optOut" {...form.register('optOut')} />
              <Label htmlFor="c-optOut">Opt-out (não deve ser contatado)</Label>
            </div>
            {optOut && t('optOutMotivo', 'Motivo do opt-out')}
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={m.isPending}>
              {m.isPending && <Loader2 className="animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
