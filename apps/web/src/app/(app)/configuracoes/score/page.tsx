'use client';
import { Controller, useForm, useWatch, type FieldErrors, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  atualizarConfigScoreSchema,
  FAIXAS_ICP,
  NOME_CRITERIO,
  somaPesosAtivos,
  type AtualizarConfigScoreInput,
  type CriterioIcp,
  type FaixaIcp,
} from '@orcestra/shared';
import { SomentePapeis } from '@/components/app-shell';
import { FaixaBadge } from '@/components/faixa-badge';
import { PageHeader } from '@/components/page-header';
import { ParametrosEditor } from '@/components/score/parametros-editor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';

interface ConfigScore {
  versao: number;
  limiares: { A: number; B: number; C: number };
  criterios: {
    chave: CriterioIcp;
    nome: string;
    descricao: string | null;
    peso: number;
    ativo: boolean;
    parametros: Record<string, unknown>;
  }[];
  somaPesosAtivos: number;
  pendentesRecalculo: number;
  atualizadoEm: string | null;
  atualizadoPor: { id: string; nome: string } | null;
}
interface Simulacao {
  versaoConfig: number;
  distribuicao: Partial<Record<FaixaIcp | 'SEM_CALCULO', number>>;
}

const numero = new Intl.NumberFormat('pt-BR');
const CHAVE = ['score-config'];

function doConfig(c: ConfigScore): AtualizarConfigScoreInput {
  return {
    limiares: { ...c.limiares },
    criterios: c.criterios.map((x) => ({
      chave: x.chave,
      peso: x.peso,
      ativo: x.ativo,
      parametros: (x.parametros ?? {}) as Record<string, unknown>,
    })),
  };
}

/** Primeira mensagem de erro encontrada (percorre objetos/arrays aninhados). */
function primeiroErro(e: unknown): string | undefined {
  if (!e || typeof e !== 'object') return undefined;
  const o = e as Record<string, unknown>;
  if (typeof o.message === 'string' && o.message) return o.message;
  for (const k of Object.keys(o)) {
    if (k === 'ref') continue;
    const r = primeiroErro(o[k]);
    if (r) return r;
  }
  return undefined;
}

function Previa({ versao }: { versao: number }) {
  const q = useQuery({
    queryKey: ['score-simulacao', versao],
    queryFn: () => api<Simulacao>('/score/simulacao'),
  });
  const d = q.data?.distribuicao ?? {};
  const total = Object.values(d).reduce((s, n) => s + (n ?? 0), 0);
  return (
    <Card data-testid="previa-distribuicao">
      <CardHeader>
        <CardTitle>Distribuição por faixa</CardTitle>
        <CardDescription>Prévia da configuração salva (EJs hoje em cada faixa).</CardDescription>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : q.isError ? (
          <div role="alert" className="text-sm">
            <p className="text-destructive">Erro ao carregar a prévia.</p>
            <Button variant="link" className="h-auto p-0" onClick={() => void q.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : total === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma EJ na base.</p>
        ) : (
          <ul className="grid gap-2">
            {FAIXAS_ICP.map((f) => {
              const n = d[f] ?? 0;
              return (
                <li key={f} className="flex items-center gap-3 text-sm">
                  <FaixaBadge faixa={f} className="w-8 justify-center" />
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(n / total) * 100}%` }}
                    />
                  </div>
                  <span className="w-16 text-right tabular-nums">{numero.format(n)}</span>
                </li>
              );
            })}
            {(d.SEM_CALCULO ?? 0) > 0 && (
              <li className="text-xs text-muted-foreground">
                {numero.format(d.SEM_CALCULO ?? 0)} ainda sem cálculo.
              </li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Formulario({ config }: { config: ConfigScore }) {
  const qc = useQueryClient();
  const form = useForm<AtualizarConfigScoreInput>({
    resolver: zodResolver(atualizarConfigScoreSchema) as unknown as Resolver<AtualizarConfigScoreInput>,
    defaultValues: doConfig(config),
  });
  const { control, handleSubmit, register, reset, formState } = form;
  const criterios = useWatch({ control, name: 'criterios' });
  const soma = somaPesosAtivos(
    (criterios ?? []).map((c) => ({ peso: Number.isFinite(c.peso) ? c.peso : 0, ativo: c.ativo })),
  );

  const salvar = useMutation({
    mutationFn: (body: AtualizarConfigScoreInput) =>
      api<ConfigScore>('/score/config', { method: 'PUT', json: body }),
    onSuccess: (nova) => {
      qc.setQueryData(CHAVE, nova);
      void qc.invalidateQueries({ queryKey: ['score-simulacao'] });
      void qc.invalidateQueries({ queryKey: ['ejs'] });
      reset(doConfig(nova));
      toast.success(
        nova.versao === config.versao ? 'Nenhuma alteração a salvar' : 'Configuração salva; recálculo enfileirado',
      );
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar'),
  });

  const recalcular = useMutation({
    mutationFn: () => api('/score/recalcular', { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CHAVE });
      toast.success('Recálculo de todas as EJs enfileirado');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro ao recalcular'),
  });

  const erros = formState.errors as FieldErrors<AtualizarConfigScoreInput>;
  const erroLimiares = primeiroErro(erros.limiares);

  return (
    <form
      noValidate
      onSubmit={handleSubmit((v) => salvar.mutate(v), () => toast.error('Corrija os campos destacados'))}
      className="grid gap-6 lg:grid-cols-3"
    >
      <div className="grid gap-4 lg:col-span-2">
        {config.criterios.map((c, i) => {
          const ativo = criterios?.[i]?.ativo ?? c.ativo;
          const erro = primeiroErro(erros.criterios?.[i]);
          return (
            <Card key={c.chave} data-testid={`criterio-${c.chave}`} className={ativo ? undefined : 'opacity-70'}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-base">
                  <span>{NOME_CRITERIO[c.chave] ?? c.nome}</span>
                  <span className="flex items-center gap-4 text-sm font-normal">
                    <label className="flex items-center gap-2">
                      <Checkbox {...register(`criterios.${i}.ativo`)} />
                      Ativo
                    </label>
                    <span className="flex items-center gap-2">
                      <Label htmlFor={`peso-${c.chave}`}>Peso</Label>
                      <Input
                        id={`peso-${c.chave}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        className="w-20"
                        aria-invalid={!!erros.criterios?.[i]?.peso}
                        {...register(`criterios.${i}.peso`, { valueAsNumber: true })}
                      />
                    </span>
                  </span>
                </CardTitle>
                {c.descricao && <CardDescription>{c.descricao}</CardDescription>}
              </CardHeader>
              <CardContent className="grid gap-2">
                <Controller
                  control={control}
                  name={`criterios.${i}.parametros`}
                  render={({ field }) => (
                    <ParametrosEditor
                      chave={c.chave}
                      idBase={`p-${c.chave}`}
                      value={(field.value ?? {}) as Record<string, unknown>}
                      onChange={(v) => field.onChange(v)}
                    />
                  )}
                />
                {erro && (
                  <p className="text-sm text-destructive" role="alert">
                    {erro}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid content-start gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Limiares das faixas</CardTitle>
            <CardDescription>Score mínimo para cada faixa (0 ≤ C &lt; B &lt; A ≤ 100).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid grid-cols-3 gap-2">
              {(['A', 'B', 'C'] as const).map((f) => (
                <div key={f} className="grid gap-1.5">
                  <Label htmlFor={`limiar-${f}`}>Faixa {f} ≥</Label>
                  <Input
                    id={`limiar-${f}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    aria-invalid={!!erroLimiares}
                    {...register(`limiares.${f}`, { valueAsNumber: true })}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Abaixo do limiar C é faixa D.</p>
            {erroLimiares && (
              <p className="text-sm text-destructive" role="alert">
                {erroLimiares}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-3">
            <p className="text-sm" aria-live="polite" data-testid="soma-pesos">
              Soma dos pesos ativos: <strong className="tabular-nums">{soma}</strong>
            </p>
            {soma <= 0 && (
              <p className="text-sm text-destructive" role="alert">
                A soma dos pesos ativos deve ser maior que zero.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              O score é normalizado: 100 × pontos obtidos ÷ soma dos pesos ativos.
            </p>
            <Button type="submit" disabled={soma <= 0 || salvar.isPending} data-testid="salvar-score">
              {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              Salvar configuração
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => recalcular.mutate()}
              disabled={recalcular.isPending}
            >
              {recalcular.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Recalcular tudo
            </Button>
            {config.pendentesRecalculo > 0 ? (
              <p
                className="rounded-md bg-accent p-2 text-xs text-accent-foreground"
                role="status"
                data-testid="aviso-recalculo"
              >
                Recálculo em andamento: {numero.format(config.pendentesRecalculo)} EJ(s) ainda com a
                versão anterior.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Todas as EJs estão atualizadas (v{config.versao}).</p>
            )}
            {config.atualizadoEm && (
              <p className="text-xs text-muted-foreground">
                Última alteração {new Date(config.atualizadoEm).toLocaleString('pt-BR')}
                {config.atualizadoPor ? ` por ${config.atualizadoPor.nome}` : ''}.
              </p>
            )}
          </CardContent>
        </Card>

        <Previa versao={config.versao} />
      </div>
    </form>
  );
}

export default function ConfigScorePage() {
  const q = useQuery({
    queryKey: CHAVE,
    queryFn: () => api<ConfigScore>('/score/config'),
    // acompanha o recálculo enquanto houver EJs pendentes
    refetchInterval: (query) => ((query.state.data?.pendentesRecalculo ?? 0) > 0 ? 5000 : false),
  });
  return (
    <SomentePapeis papeis={['ADMIN']}>
      <div className="mx-auto max-w-6xl">
        <PageHeader
          titulo="Score de ICP"
          descricao="Critérios, pesos e limiares das faixas A/B/C/D. Ao salvar, as EJs são recalculadas em segundo plano."
        />
        {q.isLoading ? (
          <div className="grid gap-4" aria-busy="true" aria-label="Carregando configuração">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : q.isError || !q.data ? (
          <div className="rounded-md border p-6 text-center" role="alert">
            <p className="text-sm text-destructive">Erro ao carregar a configuração do score.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void q.refetch()}
            >
              Tentar novamente
            </Button>
          </div>
        ) : (
          <Formulario key={q.data.versao} config={q.data} />
        )}
      </div>
    </SomentePapeis>
  );
}
