/**
 * Etapa 2 — schemas compartilhados (API + front): filtros da lista de EJs, cadastro/edição de EJ,
 * listas salvas, ações em massa, carteira, contatos e importação.
 */
import { z } from 'zod';
import { REGIOES, STATUS_PROSPECCAO } from './enums';
import {
  normalizarCnpj,
  normalizarEmail,
  normalizarInstagram,
  normalizarTelefone,
  normalizarUf,
  normalizarUrl,
  regiaoDaUf,
} from './normalize';
import { FAIXAS_ICP } from './score';
import { UF_SIGLAS } from './uf';

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/** Aceita `a,b`, `a&a=b` (repetido) ou array JSON; devolve array (ou undefined se vazio). */
const lista = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((v) => {
    if (v === undefined || v === null || v === '') return undefined;
    const arr = (Array.isArray(v) ? v : [v]) as unknown[];
    const out = arr
      .flatMap((x) => (typeof x === 'string' ? x.split(',') : [x]))
      .map((x) => (typeof x === 'string' ? x.trim() : x))
      .filter((x) => x !== '');
    return out.length ? out : undefined;
  }, z.array(item).max(50, 'Máximo de 50 itens no filtro').optional());

const boolQuery = z.preprocess(
  (v) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : v),
  z.boolean().optional(),
);

const intQuery = (min = 0, max = 1_000_000) =>
  z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number().int().min(min).max(max).optional(),
  );

const ufItem = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => UF_SIGLAS.includes(v), 'UF inválida');

/** Texto opcional que pode ser limpo: undefined = não alterar; ""/null = limpar. */
const texto = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v ? v : null));

/** Transforma com normalizador; valor preenchido porém inválido gera erro. */
const normalizado = (fn: (v: string) => string | null, msg: string) =>
  z
    .string()
    .trim()
    .nullish()
    .transform((v, ctx) => {
      if (v === undefined) return undefined;
      if (!v) return null;
      const r = fn(v);
      if (r === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg });
        return z.NEVER;
      }
      return r;
    });

// ---------------------------------------------------------------------------------------------
// Filtros / listagem de EJs
// ---------------------------------------------------------------------------------------------

/** Valores especiais aceitos nos filtros de federação e responsável. */
export const FILTRO_NENHUMA = 'nenhuma';
export const FILTRO_NENHUM = 'nenhum';
export const FILTRO_EU = 'eu';

export const filtrosEjSchema = z.object({
  busca: z.string().trim().max(120).optional(),
  uf: lista(ufItem),
  regiao: lista(z.enum(REGIOES)),
  /** IDs de federação e/ou "nenhuma" (EJs sem federação) */
  federacaoId: lista(z.string()),
  iesId: lista(z.string()),
  /** Tags (área/curso/livre): EJ com QUALQUER uma das tags */
  tagIds: lista(z.string()),
  membrosMin: intQuery(),
  membrosMax: intQuery(),
  federada: boolQuery,
  status: lista(z.enum(STATUS_PROSPECCAO)),
  scoreMin: intQuery(0, 100),
  scoreMax: intQuery(0, 100),
  /** Faixa do score de ICP (A/B/C/D): EJ em QUALQUER uma das faixas */
  faixaIcp: lista(z.enum(FAIXAS_ICP)),
  /** IDs de usuário e/ou "nenhum" (sem responsável) e/ou "eu" (usuário logado) */
  responsavelId: lista(z.string()),
});
export type FiltrosEj = z.infer<typeof filtrosEjSchema>;

export const ORDENAR_EJS = [
  'nome',
  'uf',
  'cidade',
  'scoreIcp',
  'atualizadoEm',
  'membros',
] as const;

export const listarEjsQuerySchema = filtrosEjSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  ordenarPor: z.enum(ORDENAR_EJS).default('nome'),
  ordem: z.enum(['asc', 'desc']).default('asc'),
});
export type ListarEjsQuery = z.infer<typeof listarEjsQuerySchema>;

/** Exportação usa os mesmos filtros e a mesma ordenação, sem paginação. */
export const exportarEjsQuerySchema = filtrosEjSchema.extend({
  ordenarPor: z.enum(ORDENAR_EJS).default('nome'),
  ordem: z.enum(['asc', 'desc']).default('asc'),
});
export type ExportarEjsQuery = z.infer<typeof exportarEjsQuerySchema>;

// ---------------------------------------------------------------------------------------------
// Cadastro / edição de EJ
// ---------------------------------------------------------------------------------------------

const iesRef = z
  .union([
    z.object({ id: z.string().min(1) }),
    z.object({
      nome: z.string().trim().min(2).max(200),
      uf: ufItem,
      cidade: z.string().trim().max(120).optional(),
      sigla: z.string().trim().max(20).optional(),
    }),
  ])
  .nullish();
export type IesRef = z.infer<typeof iesRef>;

const ejCampos = {
  nome: z.string().trim().min(2, 'Informe o nome').max(200),
  razaoSocial: texto(250),
  cnpj: normalizado(normalizarCnpj, 'CNPJ inválido'),
  /** { id } de IES existente, { nome, uf } para criar/reutilizar, ou null para remover */
  ies: iesRef,
  federacaoId: z.string().trim().min(1).nullish(),
  nucleoId: z.string().trim().min(1).nullish(),
  cidade: texto(120),
  uf: normalizado(normalizarUf, 'UF inválida'),
  /** se omitida, é derivada da UF */
  regiao: z.enum(REGIOES).nullish(),
  servicos: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  anoFundacao: z.number().int().min(1900).max(2100).nullish(),
  membrosEstimados: z.number().int().min(0).max(100000).nullish(),
  federada: z.boolean().optional(),
  site: normalizado(normalizarUrl, 'URL do site inválida'),
  instagram: normalizado(normalizarInstagram, 'Instagram inválido (use @perfil ou URL)'),
  linkedin: normalizado(normalizarUrl, 'URL do LinkedIn inválida'),
  facebook: normalizado(normalizarUrl, 'URL do Facebook inválida'),
  emailInstitucional: normalizado(normalizarEmail, 'E-mail inválido'),
  telefoneInstitucional: normalizado(normalizarTelefone, 'Telefone inválido (DDD + número)'),
  situacaoCadastral: texto(60),
  tagIds: z.array(z.string().min(1)).max(100).optional(),
  responsavelId: z.string().min(1).nullish(),
  statusProspeccao: z.enum(STATUS_PROSPECCAO).optional(),
  observacoes: texto(5000),
  verificado: z.boolean().optional(),
};

export const criarEjSchema = z.object({
  ...ejCampos,
  /** URL da fonte; padrão "cadastro manual" */
  fonteUrl: z.string().trim().max(500).optional(),
});
export type CriarEjInput = z.infer<typeof criarEjSchema>;

export const atualizarEjSchema = z
  .object({
    ...ejCampos,
    nome: ejCampos.nome.optional(),
    /** PERDIDA exige motivoPerdaId; NUTRICAO exige dataRetornoNutricao (AAAA-MM-DD) */
    motivoPerdaId: z.string().min(1).max(64).nullish(),
    motivoPerdaDetalhe: texto(500),
    dataRetornoNutricao: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD')
      .nullish(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Informe ao menos um campo');
export type AtualizarEjInput = z.infer<typeof atualizarEjSchema>;

/** Regiao efetiva: informada ou derivada da UF. */
export function regiaoEfetiva(uf: string | null | undefined, regiao?: string | null) {
  return (regiao as (typeof REGIOES)[number] | null | undefined) ?? regiaoDaUf(uf);
}

// ---------------------------------------------------------------------------------------------
// Listas salvas
// ---------------------------------------------------------------------------------------------

export const listaSalvaSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome').max(80),
  descricao: texto(300),
  filtros: filtrosEjSchema,
  compartilhada: z.boolean().default(false),
});
export type ListaSalvaInput = z.infer<typeof listaSalvaSchema>;

export const atualizarListaSalvaSchema = z
  .object({
    nome: z.string().trim().min(2).max(80).optional(),
    descricao: texto(300),
    filtros: filtrosEjSchema.optional(),
    compartilhada: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Informe ao menos um campo');
export type AtualizarListaSalvaInput = z.infer<typeof atualizarListaSalvaSchema>;

// ---------------------------------------------------------------------------------------------
// Ações em massa e carteira
// ---------------------------------------------------------------------------------------------

export const LIMITE_ACOES_EM_MASSA = 5000;
export const ACOES_EM_MASSA = [
  'ATRIBUIR_RESPONSAVEL',
  'MUDAR_STATUS',
  'ADICIONAR_TAG',
  'REMOVER_TAG',
] as const;

export const acaoEmMassaSchema = z
  .object({
    ids: z.array(z.string().min(1).max(64)).min(1).max(LIMITE_ACOES_EM_MASSA).optional(),
    filtros: filtrosEjSchema.optional(),
    acao: z.enum(ACOES_EM_MASSA),
    /** ATRIBUIR_RESPONSAVEL: id do usuário (ou null p/ remover); MUDAR_STATUS: status; tags: id da tag */
    valor: z.string().min(1).nullable(),
    /** MUDAR_STATUS -> PERDIDA: motivo obrigatório; -> NUTRICAO: data de retorno (AAAA-MM-DD) obrigatória */
    motivoPerdaId: z.string().min(1).max(64).nullish(),
    motivoPerdaDetalhe: z.string().trim().max(500).nullish(),
    dataRetornoNutricao: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullish(),
  })
  .superRefine((v, ctx) => {
    if (!v.ids && !v.filtros)
      ctx.addIssue({ code: 'custom', message: 'Informe ids ou filtros', path: ['ids'] });
    if (v.ids && v.filtros)
      ctx.addIssue({ code: 'custom', message: 'Use ids OU filtros, não ambos', path: ['filtros'] });
    if (v.acao === 'MUDAR_STATUS' && !(STATUS_PROSPECCAO as readonly string[]).includes(v.valor ?? ''))
      ctx.addIssue({ code: 'custom', message: 'Status inválido', path: ['valor'] });
    if ((v.acao === 'ADICIONAR_TAG' || v.acao === 'REMOVER_TAG') && !v.valor)
      ctx.addIssue({ code: 'custom', message: 'Informe a tag', path: ['valor'] });
  });
export type AcaoEmMassaInput = z.infer<typeof acaoEmMassaSchema>;

export const LIMITE_DISTRIBUICAO = 20000;
export const distribuirCarteiraSchema = z.discriminatedUnion('modo', [
  z.object({
    modo: z.literal('MANUAL'),
    ejIds: z.array(z.string().min(1).max(64)).min(1).max(LIMITE_ACOES_EM_MASSA),
    sdrId: z.string().min(1),
  }),
  z.object({
    modo: z.literal('RODIZIO'),
    sdrIds: z.array(z.string().min(1)).min(1).max(50),
    filtros: filtrosEjSchema.default({}),
    apenasSemResponsavel: z.boolean().default(true),
  }),
]);
export type DistribuirCarteiraInput = z.infer<typeof distribuirCarteiraSchema>;

// ---------------------------------------------------------------------------------------------
// Contatos
// ---------------------------------------------------------------------------------------------

export const CARGOS_CONTATO = [
  'PRESIDENTE',
  'DIR_GENTE_GESTAO',
  'DIR_COMERCIAL',
  'DIR_PROJETOS',
  'OUTRO',
] as const;
export type CargoContato = (typeof CARGOS_CONTATO)[number];
export const CARGO_CONTATO_LABEL: Record<CargoContato, string> = {
  PRESIDENTE: 'Presidente',
  DIR_GENTE_GESTAO: 'Dir. Gente & Gestão',
  DIR_COMERCIAL: 'Dir. Comercial',
  DIR_PROJETOS: 'Dir. Projetos',
  OUTRO: 'Outro',
};

export const BASES_LEGAIS = [
  'LEGITIMO_INTERESSE_B2B',
  'CONSENTIMENTO',
  'EXECUCAO_CONTRATO',
  'OBRIGACAO_LEGAL',
] as const;
export type BaseLegal = (typeof BASES_LEGAIS)[number];

const dataIso = z
  .string()
  .trim()
  .nullish()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (!v) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Data inválida (use AAAA-MM-DD)' });
      return z.NEVER;
    }
    return v;
  });

const contatoCampos = {
  nome: z.string().trim().min(2, 'Informe o nome').max(160),
  cargo: z.enum(CARGOS_CONTATO).default('OUTRO'),
  cargoDescricao: texto(120),
  email: normalizado(normalizarEmail, 'E-mail inválido'),
  telefone: normalizado(normalizarTelefone, 'Telefone inválido (DDD + número)'),
  whatsapp: normalizado(normalizarTelefone, 'WhatsApp inválido (DDD + número)'),
  linkedin: normalizado(normalizarUrl, 'URL do LinkedIn inválida'),
  principal: z.boolean().optional(),
  mandatoInicio: dataIso,
  mandatoFim: dataIso,
  baseLegal: z.enum(BASES_LEGAIS).default('LEGITIMO_INTERESSE_B2B'),
  fonte: texto(300),
  optOut: z.boolean().optional(),
  optOutMotivo: texto(300),
};

const mandatoCoerente = (v: { mandatoInicio?: string | null; mandatoFim?: string | null }) =>
  !v.mandatoInicio || !v.mandatoFim || v.mandatoFim >= v.mandatoInicio;

export const criarContatoSchema = z
  .object(contatoCampos)
  .refine(mandatoCoerente, { message: 'Fim do mandato anterior ao início', path: ['mandatoFim'] });
export type CriarContatoInput = z.infer<typeof criarContatoSchema>;

export const atualizarContatoSchema = z
  .object({
    ...contatoCampos,
    nome: contatoCampos.nome.optional(),
    cargo: z.enum(CARGOS_CONTATO).optional(),
    baseLegal: z.enum(BASES_LEGAIS).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Informe ao menos um campo')
  .refine(mandatoCoerente, { message: 'Fim do mandato anterior ao início', path: ['mandatoFim'] });
export type AtualizarContatoInput = z.infer<typeof atualizarContatoSchema>;

// ---------------------------------------------------------------------------------------------
// Importação
// ---------------------------------------------------------------------------------------------

export const TIPOS_IMPORTACAO = ['EJS', 'CONTATOS'] as const;
export type TipoImportacao = (typeof TIPOS_IMPORTACAO)[number];
export const ESTRATEGIAS_DUPLICADOS = ['MESCLAR', 'IGNORAR'] as const;

export const LIMITE_ARQUIVO_IMPORTACAO = 10 * 1024 * 1024;

export const CAMPOS_IMPORTACAO: Record<
  TipoImportacao,
  { campo: string; rotulo: string; obrigatorio?: boolean }[]
> = {
  EJS: [
    { campo: 'nome', rotulo: 'Nome da EJ', obrigatorio: true },
    { campo: 'razaoSocial', rotulo: 'Razão social' },
    { campo: 'cnpj', rotulo: 'CNPJ' },
    { campo: 'ies', rotulo: 'IES' },
    { campo: 'uf', rotulo: 'UF' },
    { campo: 'cidade', rotulo: 'Cidade' },
    { campo: 'federacao', rotulo: 'Federação (nome ou sigla)' },
    { campo: 'tags', rotulo: 'Tags/áreas (separadas por ; , ou |)' },
    { campo: 'servicos', rotulo: 'Serviços (separados por ; , ou |)' },
    { campo: 'anoFundacao', rotulo: 'Ano de fundação' },
    { campo: 'membrosEstimados', rotulo: 'Nº de membros' },
    { campo: 'federada', rotulo: 'Federada (sim/não)' },
    { campo: 'site', rotulo: 'Site' },
    { campo: 'instagram', rotulo: 'Instagram' },
    { campo: 'linkedin', rotulo: 'LinkedIn' },
    { campo: 'facebook', rotulo: 'Facebook' },
    { campo: 'emailInstitucional', rotulo: 'E-mail institucional' },
    { campo: 'telefoneInstitucional', rotulo: 'Telefone institucional' },
    { campo: 'observacoes', rotulo: 'Observações' },
  ],
  CONTATOS: [
    { campo: 'ejCnpj', rotulo: 'CNPJ da EJ (ou nome+UF)' },
    { campo: 'ejNome', rotulo: 'Nome da EJ' },
    { campo: 'ejUf', rotulo: 'UF da EJ' },
    { campo: 'nome', rotulo: 'Nome do contato', obrigatorio: true },
    { campo: 'cargo', rotulo: 'Cargo' },
    { campo: 'email', rotulo: 'E-mail' },
    { campo: 'telefone', rotulo: 'Telefone' },
    { campo: 'whatsapp', rotulo: 'WhatsApp' },
    { campo: 'linkedin', rotulo: 'LinkedIn' },
    { campo: 'mandatoInicio', rotulo: 'Início do mandato' },
    { campo: 'mandatoFim', rotulo: 'Fim do mandato' },
    { campo: 'fonte', rotulo: 'Fonte do dado' },
    { campo: 'baseLegal', rotulo: 'Base legal (padrão: legítimo interesse B2B)' },
  ],
};

export const iniciarImportacaoSchema = z.object({ tipo: z.enum(TIPOS_IMPORTACAO) });
export type IniciarImportacaoInput = z.infer<typeof iniciarImportacaoSchema>;

export const mapeamentoImportacaoSchema = z.object({
  /** { "Coluna do arquivo": "campoDoSistema" | null } */
  mapeamento: z
    .record(z.string().max(200), z.string().max(60).nullable())
    .refine((m) => Object.keys(m).length <= 100, 'Máximo de 100 colunas no mapeamento'),
  estrategiaDuplicados: z.enum(ESTRATEGIAS_DUPLICADOS).default('IGNORAR'),
});
export type MapeamentoImportacaoInput = z.infer<typeof mapeamentoImportacaoSchema>;

export const listarImportacoesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListarImportacoesQuery = z.infer<typeof listarImportacoesQuerySchema>;

/** GET /empresas-juniores/opcoes/ies */
export const opcoesIesQuerySchema = z.object({
  busca: z.preprocess((v) => (Array.isArray(v) ? v[0] : v), z.string().trim().max(120).optional()),
  uf: z.preprocess((v) => (Array.isArray(v) ? v[0] : v), z.string().trim().length(2).toUpperCase().optional().or(z.literal('').transform(() => undefined))),
});
export type OpcoesIesQuery = z.infer<typeof opcoesIesQuerySchema>;
