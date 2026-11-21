/**
 * Etapa 5 — templates de mensagem e cadências: variáveis, renderização (função pura) e schemas
 * compartilhados (API + front).
 */
import { z } from 'zod';
import { CANAIS_INTERACAO } from './enums';

const idStr = z.string().trim().min(1).max(64);
const textoOpc = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v ? v : null));

// --- Variáveis e renderização ------------------------------------------------------------------

export const VARIAVEIS_TEMPLATE = [
  'nome_ej',
  'nome_contato',
  'cargo',
  'ies',
  'cidade',
  'nome_sdr',
] as const;
export type VariavelTemplate = (typeof VARIAVEIS_TEMPLATE)[number];
export type DadosTemplate = Partial<Record<VariavelTemplate, string | null | undefined>>;

/** Dados neutros usados na pré-visualização quando não há EJ/contato. */
export const DADOS_EXEMPLO_TEMPLATE: Record<VariavelTemplate, string> = {
  nome_ej: 'Empresa Júnior Exemplo',
  nome_contato: 'Maria Silva',
  cargo: 'Presidente',
  ies: 'Universidade Exemplo',
  cidade: 'Cidade Exemplo',
  nome_sdr: 'Seu Nome',
};

const REGEX_VARIAVEL = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** Nomes de variáveis (únicos, na ordem de aparição) usados no texto. */
export function extrairVariaveis(texto: string): string[] {
  const achadas = new Set<string>();
  for (const m of texto.matchAll(REGEX_VARIAVEL)) achadas.add(m[1]!);
  return [...achadas];
}

/** Variáveis do texto que não pertencem à lista permitida. */
export function variaveisDesconhecidas(texto: string): string[] {
  return extrairVariaveis(texto).filter((v) => !(VARIAVEIS_TEMPLATE as readonly string[]).includes(v));
}

/**
 * Substitui `{{variavel}}` pelos dados. Regra: variável SEM dado (ausente, null, vazia) ou desconhecida
 * vira string vazia (nunca vaza `{{...}}` para a mensagem). Espaços duplicados deixados pela remoção
 * são colapsados dentro de cada linha, e espaço antes de pontuação (`,.;:!?`) é removido; quebras de
 * linha são preservadas.
 */
export function renderizarTemplate(corpo: string, dados: DadosTemplate): string {
  const sub = corpo.replace(REGEX_VARIAVEL, (_m, nome: string) => {
    const v = (dados as Record<string, string | null | undefined>)[nome];
    return typeof v === 'string' ? v.trim() : '';
  });
  return sub
    .split('\n')
    .map((l) => l.replace(/[ \t]{2,}/g, ' ').replace(/ +([,.;:!?])/g, '$1').replace(/[ \t]+$/g, ''))
    .join('\n');
}

const semVariaveisInvalidas = (texto: string | null | undefined) =>
  !texto || variaveisDesconhecidas(texto).length === 0;
const msgVariaveis = (texto: string | null | undefined) =>
  `Variáveis desconhecidas: ${variaveisDesconhecidas(texto ?? '').join(', ')}. Permitidas: ${VARIAVEIS_TEMPLATE.join(', ')}`;

// --- Templates ---------------------------------------------------------------------------------

const corpoTemplate = z
  .string()
  .trim()
  .min(1, 'Informe o corpo')
  .max(5000)
  .superRefine((v, ctx) => {
    if (!semVariaveisInvalidas(v)) ctx.addIssue({ code: 'custom', message: msgVariaveis(v) });
  });
const assuntoTemplate = z
  .string()
  .trim()
  .max(200)
  .nullish()
  .transform((v) => (v === undefined ? undefined : v ? v : null))
  .superRefine((v, ctx) => {
    if (!semVariaveisInvalidas(v)) ctx.addIssue({ code: 'custom', message: msgVariaveis(v) });
  });

export const criarTemplateSchema = z
  .object({
    nome: z.string().trim().min(2, 'Informe o nome').max(120),
    canal: z.enum(CANAIS_INTERACAO),
    assunto: assuntoTemplate,
    corpo: corpoTemplate,
    ativo: z.boolean().default(true),
  })
  .refine((v) => v.canal === 'EMAIL' || !v.assunto, {
    path: ['assunto'],
    message: 'Assunto só é permitido em templates de e-mail',
  });
export type CriarTemplateInput = z.infer<typeof criarTemplateSchema>;

export const atualizarTemplateSchema = z
  .object({
    nome: z.string().trim().min(2).max(120).optional(),
    canal: z.enum(CANAIS_INTERACAO).optional(),
    assunto: assuntoTemplate,
    corpo: corpoTemplate.optional(),
    ativo: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Informe ao menos um campo');
export type AtualizarTemplateInput = z.infer<typeof atualizarTemplateSchema>;

export const listarTemplatesQuerySchema = z.object({
  canal: z.enum(CANAIS_INTERACAO).optional(),
  ativo: z
    .preprocess((v) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : undefined), z.boolean().optional()),
});
export type ListarTemplatesQuery = z.infer<typeof listarTemplatesQuerySchema>;

export const previsualizarTemplateSchema = z.object({
  ejId: idStr.optional(),
  contatoId: idStr.optional(),
});
export type PrevisualizarTemplateInput = z.infer<typeof previsualizarTemplateSchema>;

// --- Cadências ---------------------------------------------------------------------------------

export const passoCadenciaSchema = z.object({
  /** id de um passo existente (ao editar); ausente = novo passo */
  id: idStr.optional(),
  diaOffset: z.number().int().min(0).max(365),
  canal: z.enum(CANAIS_INTERACAO),
  templateId: idStr.nullish().transform((v) => v ?? null),
  instrucoes: textoOpc(2000),
});
export type PassoCadenciaInput = z.infer<typeof passoCadenciaSchema>;

/** Passos na ordem do array (ordem = posição + 1). */
const passos = z.array(passoCadenciaSchema).min(1, 'Informe ao menos um passo').max(30);

export const criarCadenciaSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome').max(120),
  descricao: textoOpc(1000),
  ativa: z.boolean().default(true),
  passos,
});
export type CriarCadenciaInput = z.infer<typeof criarCadenciaSchema>;

export const atualizarCadenciaSchema = z
  .object({
    nome: z.string().trim().min(2).max(120).optional(),
    descricao: textoOpc(1000),
    ativa: z.boolean().optional(),
    /** se enviado, substitui a lista (passos com id são atualizados; sem id, criados; os omitidos, removidos) */
    passos: passos.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Informe ao menos um campo');
export type AtualizarCadenciaInput = z.infer<typeof atualizarCadenciaSchema>;

export const listarCadenciasQuerySchema = z.object({
  ativa: z
    .preprocess((v) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : undefined), z.boolean().optional()),
});
export type ListarCadenciasQuery = z.infer<typeof listarCadenciasQuerySchema>;

export const MAX_EJS_INSCRICAO = 500;

export const inscreverSchema = z.object({
  ejIds: z.array(idStr).min(1).max(MAX_EJS_INSCRICAO),
  /** só com uma única EJ (o contato pertence a uma EJ) */
  contatoId: idStr.nullish(),
});
export type InscreverInput = z.infer<typeof inscreverSchema>;

export const STATUS_INSCRICAO = ['ATIVA', 'CONCLUIDA', 'ENCERRADA'] as const;
export const MOTIVOS_ENCERRAMENTO = ['RESPOSTA', 'AVANCO_FUNIL', 'MANUAL', 'OPT_OUT'] as const;
export type MotivoEncerramento = (typeof MOTIVOS_ENCERRAMENTO)[number];

export const listarInscricoesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(STATUS_INSCRICAO).optional(),
});
export type ListarInscricoesQuery = z.infer<typeof listarInscricoesQuerySchema>;

export const encerrarInscricaoSchema = z.object({
  motivo: z.literal('MANUAL').default('MANUAL'),
  detalhe: textoOpc(500),
});
export type EncerrarInscricaoInput = z.infer<typeof encerrarInscricaoSchema>;

export const registrarEnvioSchema = z.object({
  resumo: textoOpc(5000),
  contatoId: idStr.nullish(),
});
export type RegistrarEnvioInput = z.infer<typeof registrarEnvioSchema>;
