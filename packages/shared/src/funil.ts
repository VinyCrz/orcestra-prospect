/**
 * Etapa 3 — schemas compartilhados (API + front): mudança de status, kanban, motivos de perda,
 * interações, linha do tempo e tarefas.
 */
import { z } from 'zod';
import {
  CANAIS_INTERACAO,
  ORIGENS_TAREFA,
  RESULTADOS_INTERACAO,
  STATUS_PROSPECCAO,
} from './enums';
import { filtrosEjSchema } from './gestao';

const idStr = z.string().trim().min(1).max(64);
const textoOpc = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v ? v : null));

/** Data (AAAA-MM-DD) ou data/hora ISO. Data pura vale o início do dia em America/Sao_Paulo (UTC-3). */
export const dataOuDataHora = z
  .string()
  .trim()
  .refine((v) => /^\d{4}-\d{2}-\d{2}(T.+)?$/.test(v) && !Number.isNaN(Date.parse(v)), 'Data inválida')
  .transform((v) => (v.length === 10 ? new Date(`${v}T03:00:00.000Z`) : new Date(v)));

const dataSimples = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Data inválida');

// --- Status do funil ---------------------------------------------------------------------------

export const mudarStatusSchema = z.object({
  status: z.enum(STATUS_PROSPECCAO),
  /** obrigatório quando status = PERDIDA (motivo ativo) */
  motivoPerdaId: idStr.nullish(),
  motivoPerdaDetalhe: textoOpc(500),
  /** obrigatório quando status = NUTRICAO (AAAA-MM-DD) */
  dataRetornoNutricao: dataSimples.nullish(),
});
export type MudarStatusInput = z.infer<typeof mudarStatusSchema>;

export const kanbanQuerySchema = z.object({
  responsavelId: filtrosEjSchema.shape.responsavelId,
  uf: filtrosEjSchema.shape.uf,
  busca: z.string().trim().max(120).optional(),
  /** sem `status`: todas as colunas (primeiros `limite` cards de cada); com `status`: só aquela coluna */
  status: z.enum(STATUS_PROSPECCAO).optional(),
  /** id do último card recebido na coluna (paginação por cursor) */
  cursor: idStr.optional(),
  limite: z.coerce.number().int().min(1).max(50).default(20),
});
export type KanbanQuery = z.infer<typeof kanbanQuerySchema>;

// --- Motivos de perda --------------------------------------------------------------------------

export const criarMotivoPerdaSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome').max(80),
  ordem: z.number().int().min(0).max(10000).optional(),
});
export type CriarMotivoPerdaInput = z.infer<typeof criarMotivoPerdaSchema>;

export const atualizarMotivoPerdaSchema = z
  .object({
    nome: z.string().trim().min(2).max(80).optional(),
    ordem: z.number().int().min(0).max(10000).optional(),
    ativo: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Informe ao menos um campo');
export type AtualizarMotivoPerdaInput = z.infer<typeof atualizarMotivoPerdaSchema>;

export const listarMotivosQuerySchema = z.object({
  incluirInativos: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
});

// --- Interações --------------------------------------------------------------------------------

export const criarInteracaoSchema = z.object({
  canal: z.enum(CANAIS_INTERACAO),
  /** padrão: agora */
  data: dataOuDataHora.optional(),
  contatoId: idStr.nullish(),
  resumo: z.string().trim().min(1, 'Informe o resumo').max(5000),
  resultado: z.enum(RESULTADOS_INTERACAO),
  proximoPasso: textoOpc(300),
  /** se informada, cria uma Tarefa (origem INTERACAO) para o usuário */
  proximoPassoData: dataOuDataHora.nullish(),
});
export type CriarInteracaoInput = z.infer<typeof criarInteracaoSchema>;

export const atualizarInteracaoSchema = z
  .object({
    canal: z.enum(CANAIS_INTERACAO).optional(),
    data: dataOuDataHora.optional(),
    contatoId: idStr.nullish(),
    resumo: z.string().trim().min(1).max(5000).optional(),
    resultado: z.enum(RESULTADOS_INTERACAO).optional(),
    proximoPasso: textoOpc(300),
    proximoPassoData: dataOuDataHora.nullish(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Informe ao menos um campo');
export type AtualizarInteracaoInput = z.infer<typeof atualizarInteracaoSchema>;

const pagina = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};
export const paginacaoSchema = z.object(pagina);
export type PaginacaoInput = z.infer<typeof paginacaoSchema>;

export const TIPOS_TIMELINE = [
  'INTERACAO',
  'STATUS',
  'EDICAO',
  'CONTATO',
  'TAREFA_CRIADA',
  'TAREFA_CONCLUIDA',
] as const;
export type TipoTimeline = (typeof TIPOS_TIMELINE)[number];

// --- Tarefas -----------------------------------------------------------------------------------

export const FASES_TAREFA = ['IDEIA', 'NAO_INICIADA', 'EM_ANDAMENTO', 'REALIZADA', 'NAO_REALIZADA'] as const;
export type FaseTarefa = (typeof FASES_TAREFA)[number];
export const FASE_TAREFA_LABEL: Record<FaseTarefa, string> = {
  IDEIA: 'Ideias',
  NAO_INICIADA: 'Não iniciadas',
  EM_ANDAMENTO: 'Em andamento',
  REALIZADA: 'Realizadas',
  NAO_REALIZADA: 'Não realizadas',
};

export const PRIORIDADES_TAREFA = ['ALTA', 'MEDIA', 'BAIXA'] as const;
export type PrioridadeTarefa = (typeof PRIORIDADES_TAREFA)[number];
export const PRIORIDADE_TAREFA_LABEL: Record<PrioridadeTarefa, string> = {
  ALTA: 'Alta',
  MEDIA: 'Média',
  BAIXA: 'Baixa',
};

const preferenciasTarefa = {
  prioridade: z.enum(PRIORIDADES_TAREFA).optional(),
  colaboradorIds: z.array(idStr).max(50).optional(),
};

export const criarTarefaSchema = z.object({
  ...preferenciasTarefa,
  titulo: z.string().trim().min(2, 'Informe o título').max(200),
  descricao: textoOpc(2000),
  vencimento: dataOuDataHora.nullable(),
  fase: z.enum(['IDEIA', 'NAO_INICIADA', 'EM_ANDAMENTO']).optional(),
  /** padrão: o próprio usuário; só GESTOR/ADMIN atribuem a outro */
  responsavelId: idStr.optional(),
  empresaJuniorId: idStr.nullish(),
  contatoId: idStr.nullish(),
});
export type CriarTarefaInput = z.infer<typeof criarTarefaSchema>;

export const atualizarTarefaSchema = z
  .object({
    ...preferenciasTarefa,
    titulo: z.string().trim().min(2).max(200).optional(),
    descricao: textoOpc(2000),
    vencimento: dataOuDataHora.nullish(),
    responsavelId: idStr.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Informe ao menos um campo');
export type AtualizarTarefaInput = z.infer<typeof atualizarTarefaSchema>;

export const listarTarefasQuerySchema = z.object({
  ...pagina,
  responsavelId: idStr.optional(),
  empresaJuniorId: idStr.optional(),
  concluida: z.preprocess(
    (v) => (v === 'true' ? true : v === 'false' ? false : v),
    z.boolean().optional(),
  ),
  origem: z.enum(ORIGENS_TAREFA).optional(),
});
export type ListarTarefasQuery = z.infer<typeof listarTarefasQuerySchema>;

export const agendaQuerySchema = z.object({ responsavelId: idStr.optional() });
export type AgendaQuery = z.infer<typeof agendaQuerySchema>;

export const agendaPainelQuerySchema = z
  .object({
    ...pagina,
    responsavelId: idStr.optional(),
    inicio: dataOuDataHora.optional(),
    fim: dataOuDataHora.optional(),
  })
  .refine(
    ({ inicio, fim }) => (!inicio && !fim) || !!(inicio && fim && inicio < fim),
    'Informe um intervalo de datas válido',
  );
export type AgendaPainelQuery = z.infer<typeof agendaPainelQuerySchema>;

export const moverTarefaSchema = z.object({ fase: z.enum(FASES_TAREFA) });
export const criarSubtarefaSchema = z.object({ titulo: z.string().trim().min(2).max(200) });
export const atualizarSubtarefaSchema = z.object({ concluida: z.boolean() });

export const adiarTarefaSchema = z
  .object({
    novaData: dataOuDataHora.optional(),
    dias: z.number().int().min(1).max(365).optional(),
  })
  .refine((v) => (v.novaData === undefined) !== (v.dias === undefined), 'Informe novaData OU dias');
export type AdiarTarefaInput = z.infer<typeof adiarTarefaSchema>;
