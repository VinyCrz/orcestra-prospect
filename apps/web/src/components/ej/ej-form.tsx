'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  criarEjSchema,
  REGIOES,
  REGIAO_LABEL,
  STATUS_PROSPECCAO_LABEL,
  UFS,
  type StatusProspeccao,
} from '@orcestra/shared';
import { Campo } from '@/components/form/campo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckGroup } from '@/components/ui/check-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import type { EmpresaJuniorDetalhe } from '@/lib/tipos';
import { useFederacoes, useOpcoesIes, useOpcoesResponsaveis, useOpcoesTags } from './use-opcoes';

const NENHUM = '__nenhum__';

/** Valores do formulário: tudo texto (inputs), exceto booleanos. */
interface Valores {
  nome: string;
  razaoSocial: string;
  cnpj: string;
  iesNome: string;
  federacaoId: string;
  cidade: string;
  uf: string;
  regiao: string;
  anoFundacao: string;
  membrosEstimados: string;
  federada: boolean;
  site: string;
  instagram: string;
  linkedin: string;
  facebook: string;
  emailInstitucional: string;
  telefoneInstitucional: string;
  situacaoCadastral: string;
  servicos: string;
  tagIds: string[];
  responsavelId: string;
  statusProspeccao: string;
  observacoes: string;
  verificado: boolean;
}

function valoresIniciais(ej?: EmpresaJuniorDetalhe): Valores {
  return {
    nome: ej?.nome ?? '',
    razaoSocial: ej?.razaoSocial ?? '',
    cnpj: ej?.cnpj ?? '',
    iesNome: ej?.ies?.nome ?? '',
    federacaoId: ej?.federacao?.id ?? '',
    cidade: ej?.cidade ?? '',
    uf: ej?.uf ?? '',
    regiao: ej?.regiao ?? '',
    anoFundacao: ej?.anoFundacao?.toString() ?? '',
    membrosEstimados: ej?.membrosEstimados?.toString() ?? '',
    federada: ej?.federada ?? false,
    site: ej?.site ?? '',
    instagram: ej?.instagram ?? '',
    linkedin: ej?.linkedin ?? '',
    facebook: ej?.facebook ?? '',
    emailInstitucional: ej?.emailInstitucional ?? '',
    telefoneInstitucional: ej?.telefoneInstitucional ?? '',
    situacaoCadastral: ej?.situacaoCadastral ?? '',
    servicos: ej?.servicos.join('\n') ?? '',
    tagIds: ej?.tags.map((t) => t.id) ?? [],
    responsavelId: ej?.responsavel?.id ?? '',
    statusProspeccao: ej?.statusProspeccao ?? 'NAO_TRABALHADA',
    observacoes: ej?.observacoes ?? '',
    verificado: ej?.verificado ?? false,
  };
}

const num = (v: string) => (v.trim() === '' ? null : Number(v));

/** Converte os valores do formulário no payload da API (vazio = limpar/null). */
function paraPayload(
  v: Valores,
  opcoes: { podeAtribuir: boolean; ies: { id: string; nome: string }[] },
) {
  const iesNome = v.iesNome.trim();
  const iesExistente = opcoes.ies.find((i) => i.nome.toLowerCase() === iesNome.toLowerCase());
  return {
    nome: v.nome,
    razaoSocial: v.razaoSocial,
    cnpj: v.cnpj,
    ies: !iesNome
      ? null
      : iesExistente
        ? { id: iesExistente.id }
        : { nome: iesNome, uf: v.uf },
    federacaoId: v.federacaoId || null,
    cidade: v.cidade,
    uf: v.uf,
    regiao: v.regiao || null,
    servicos: v.servicos
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    anoFundacao: num(v.anoFundacao),
    membrosEstimados: num(v.membrosEstimados),
    federada: v.federada,
    site: v.site,
    instagram: v.instagram,
    linkedin: v.linkedin,
    facebook: v.facebook,
    emailInstitucional: v.emailInstitucional,
    telefoneInstitucional: v.telefoneInstitucional,
    situacaoCadastral: v.situacaoCadastral,
    tagIds: v.tagIds,
    ...(opcoes.podeAtribuir ? { responsavelId: v.responsavelId || null } : {}),
    statusProspeccao: v.statusProspeccao as StatusProspeccao,
    observacoes: v.observacoes,
    verificado: v.verificado,
  };
}

export function FormularioEj({ ej }: { ej?: EmpresaJuniorDetalhe }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { temPapel } = useAuth();
  const podeAtribuir = temPapel('ADMIN', 'GESTOR');
  const federacoes = useFederacoes();
  const ies = useOpcoesIes();
  const tags = useOpcoesTags();
  const resp = useOpcoesResponsaveis(podeAtribuir);
  const [duplicada, setDuplicada] = useState<{ id: string; nome: string } | null>(null);
  const editando = !!ej;
  const iesConhecidas = [...(ies.data ?? []), ...(ej?.ies ? [ej.ies] : [])];

  // Valida com o mesmo schema do shared (convertendo antes os campos de texto).
  const resolver: Resolver<Valores> = async (valores) => {
    const r = criarEjSchema.safeParse(
      paraPayload(valores, { podeAtribuir, ies: iesConhecidas }),
    );
    if (r.success) return { values: valores, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const i of r.error.issues) {
      let campo = String(i.path[0] ?? 'nome');
      if (campo === 'ies') campo = 'iesNome';
      if (!errors[campo]) errors[campo] = { type: i.code, message: i.message };
    }
    return { values: {}, errors: errors as never };
  };

  const form = useForm<Valores>({ resolver, defaultValues: valoresIniciais(ej) });
  const { errors } = form.formState;
  const registrar = form.register;

  const m = useMutation({
    mutationFn: (v: Valores) => {
      const payload = paraPayload(v, { podeAtribuir, ies: iesConhecidas });
      return editando
        ? api<{ id: string }>(`/empresas-juniores/${ej.id}`, { method: 'PATCH', json: payload })
        : api<{ id: string }>('/empresas-juniores', { method: 'POST', json: payload });
    },
    onSuccess: (r) => {
      toast.success(editando ? 'Empresa Júnior atualizada' : 'Empresa Júnior cadastrada');
      void qc.invalidateQueries({ queryKey: ['ejs'] });
      void qc.invalidateQueries({ queryKey: ['ej'] });
      router.push(`/empresas-juniores/${editando ? ej.id : r.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) {
        const d = e.dados as { existenteId?: string; existenteNome?: string } | undefined;
        if (d?.existenteId) {
          setDuplicada({ id: d.existenteId, nome: d.existenteNome ?? 'ver cadastro' });
          return;
        }
      }
      toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar');
    },
  });

  function texto(id: keyof Valores, label: string, props: React.ComponentProps<'input'> = {}) {
    return (
      <Campo id={id} label={label} erro={errors[id]?.message as string | undefined}>
        <Input id={id} aria-invalid={!!errors[id]} {...registrar(id as never)} {...props} />
      </Campo>
    );
  }

  function seletor(
    id: 'uf' | 'regiao' | 'federacaoId' | 'responsavelId' | 'statusProspeccao',
    label: string,
    itens: { valor: string; rotulo: string }[],
    permitirVazio: boolean,
  ) {
    return (
      <Campo id={id} label={label} erro={errors[id]?.message as string | undefined}>
        <Controller
          control={form.control}
          name={id}
          render={({ field }) => (
            <Select
              value={field.value || (permitirVazio ? NENHUM : undefined)}
              onValueChange={(v) => field.onChange(v === NENHUM ? '' : v)}
            >
              <SelectTrigger id={id}>
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {permitirVazio && <SelectItem value={NENHUM}>Não informado</SelectItem>}
                {itens.map((i) => (
                  <SelectItem key={i.valor} value={i.valor}>
                    {i.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Campo>
    );
  }

  return (
    <form onSubmit={form.handleSubmit((v) => m.mutate(v))} className="grid gap-6" noValidate>
      {duplicada && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
        >
          Já existe uma Empresa Júnior com esses dados:{' '}
          <Link
            href={`/empresas-juniores/${duplicada.id}`}
            className="font-medium underline underline-offset-2"
          >
            {duplicada.nome}
          </Link>
          . Abra o cadastro existente em vez de criar outro.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Identificação</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{texto('nome', 'Nome da EJ *')}</div>
          {texto('razaoSocial', 'Razão social')}
          {texto('cnpj', 'CNPJ', { inputMode: 'numeric', placeholder: '00.000.000/0000-00' })}
          <Campo
            id="iesNome"
            label="IES"
            erro={errors.iesNome?.message}
          >
            <Input
              id="iesNome"
              list="lista-ies"
              autoComplete="off"
              aria-invalid={!!errors.iesNome}
              {...registrar('iesNome')}
            />
            <datalist id="lista-ies">
              {(ies.data ?? []).map((i) => (
                <option key={i.id} value={i.nome} />
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">
              Escolha uma existente ou digite um nome novo (a UF abaixo é obrigatória nesse caso).
            </p>
          </Campo>
          {seletor(
            'federacaoId',
            'Federação',
            (federacoes.data ?? []).map((f) => ({ valor: f.id, rotulo: f.sigla })),
            true,
          )}
          {texto('cidade', 'Cidade')}
          {seletor(
            'uf',
            'UF',
            UFS.map((u) => ({ valor: u.sigla, rotulo: `${u.sigla} — ${u.nome}` })),
            true,
          )}
          {seletor(
            'regiao',
            'Região (se vazio, derivada da UF)',
            REGIOES.map((r) => ({ valor: r, rotulo: REGIAO_LABEL[r] })),
            true,
          )}
          {texto('anoFundacao', 'Ano de fundação', { type: 'number', inputMode: 'numeric' })}
          {texto('membrosEstimados', 'Nº de membros', { type: 'number', inputMode: 'numeric' })}
          {texto('situacaoCadastral', 'Situação cadastral')}
          <div className="flex items-center gap-2 sm:col-span-2">
            <Checkbox id="federada" {...registrar('federada')} />
            <Label htmlFor="federada">Federada</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Canais institucionais</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {texto('site', 'Site', { inputMode: 'url' })}
          {texto('instagram', 'Instagram (@perfil ou URL)')}
          {texto('linkedin', 'LinkedIn', { inputMode: 'url' })}
          {texto('facebook', 'Facebook', { inputMode: 'url' })}
          {texto('emailInstitucional', 'E-mail institucional', { type: 'email' })}
          {texto('telefoneInstitucional', 'Telefone institucional', { type: 'tel' })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Atuação e prospecção</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Campo id="servicos" label="Serviços (um por linha)">
              <Textarea id="servicos" {...registrar('servicos')} />
            </Campo>
          </div>
          <div className="sm:col-span-2">
            <Controller
              control={form.control}
              name="tagIds"
              render={({ field }) => (
                <CheckGroup
                  legenda="Áreas, cursos e tags"
                  valor={field.value}
                  onChange={field.onChange}
                  opcoes={(tags.data ?? []).map((t) => ({ valor: t.id, rotulo: t.nome }))}
                  carregando={tags.isLoading}
                  vazio="Nenhuma tag cadastrada"
                  buscavel
                />
              )}
            />
          </div>
          {seletor(
            'statusProspeccao',
            'Status',
            Object.entries(STATUS_PROSPECCAO_LABEL).map(([valor, rotulo]) => ({ valor, rotulo })),
            false,
          )}
          {podeAtribuir &&
            seletor(
              'responsavelId',
              'Responsável',
              (resp.data?.usuarios ?? []).map((u) => ({ valor: u.id, rotulo: u.nome })),
              true,
            )}
          <div className="sm:col-span-2">
            <Campo id="observacoes" label="Observações" erro={errors.observacoes?.message}>
              <Textarea id="observacoes" {...registrar('observacoes')} />
            </Campo>
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Checkbox id="verificado" {...registrar('verificado')} />
            <Label htmlFor="verificado">Dados verificados manualmente</Label>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="outline">
          <Link href={editando ? `/empresas-juniores/${ej.id}` : '/empresas-juniores'}>
            Cancelar
          </Link>
        </Button>
        <Button type="submit" disabled={m.isPending}>
          {m.isPending && <Loader2 className="animate-spin" />}
          {editando ? 'Salvar alterações' : 'Cadastrar EJ'}
        </Button>
      </div>
    </form>
  );
}
