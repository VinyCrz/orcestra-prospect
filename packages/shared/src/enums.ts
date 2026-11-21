export const PAPEIS = ['ADMIN', 'GESTOR', 'SDR'] as const;
export type Papel = (typeof PAPEIS)[number];

export const PAPEL_LABEL: Record<Papel, string> = {
  ADMIN: 'Administrador',
  GESTOR: 'Gestor',
  SDR: 'SDR',
};

/** Funil, na ordem das colunas do kanban. PERDIDA exige motivo; NUTRICAO exige data de retorno. */
export const STATUS_PROSPECCAO = [
  'NAO_TRABALHADA',
  'PESQUISADA',
  'PRIMEIRO_CONTATO',
  'EM_CONVERSA',
  'REUNIAO_AGENDADA',
  'OPORTUNIDADE',
  'PERDIDA',
  'NUTRICAO',
] as const;
export type StatusProspeccao = (typeof STATUS_PROSPECCAO)[number];

export const STATUS_PROSPECCAO_LABEL: Record<StatusProspeccao, string> = {
  NAO_TRABALHADA: 'Não trabalhada',
  PESQUISADA: 'Pesquisada',
  PRIMEIRO_CONTATO: 'Primeiro contato',
  EM_CONVERSA: 'Em conversa',
  REUNIAO_AGENDADA: 'Reunião agendada',
  OPORTUNIDADE: 'Oportunidade',
  PERDIDA: 'Perdida',
  NUTRICAO: 'Nutrição',
};

/** Canais aceitos ao registrar interação (o enum do banco também tem OUTRO, legado de cadências). */
export const CANAIS_INTERACAO = [
  'EMAIL',
  'WHATSAPP',
  'LIGACAO',
  'LINKEDIN',
  'INSTAGRAM',
  'REUNIAO',
  'EVENTO',
] as const;
export type CanalInteracao = (typeof CANAIS_INTERACAO)[number];

export const CANAL_INTERACAO_LABEL: Record<CanalInteracao, string> = {
  EMAIL: 'E-mail',
  WHATSAPP: 'WhatsApp',
  LIGACAO: 'Ligação',
  LINKEDIN: 'LinkedIn',
  INSTAGRAM: 'Instagram',
  REUNIAO: 'Reunião',
  EVENTO: 'Evento',
};

export const RESULTADOS_INTERACAO = [
  'SEM_RESPOSTA',
  'RESPONDEU',
  'REUNIAO_MARCADA',
  'NAO_INTERESSADO',
  'OUTRO',
] as const;
export type ResultadoInteracao = (typeof RESULTADOS_INTERACAO)[number];

export const RESULTADO_INTERACAO_LABEL: Record<ResultadoInteracao, string> = {
  SEM_RESPOSTA: 'Sem resposta',
  RESPONDEU: 'Respondeu',
  REUNIAO_MARCADA: 'Reunião marcada',
  NAO_INTERESSADO: 'Não interessado',
  OUTRO: 'Outro',
};

export const ORIGENS_TAREFA = [
  'MANUAL',
  'INTERACAO',
  'MANDATO_VENCENDO',
  'NUTRICAO_RETORNO',
  'CADENCIA',
] as const;
export type OrigemTarefa = (typeof ORIGENS_TAREFA)[number];

export const ORIGEM_TAREFA_LABEL: Record<OrigemTarefa, string> = {
  MANUAL: 'Manual',
  INTERACAO: 'Interação',
  MANDATO_VENCENDO: 'Mandato vencendo',
  NUTRICAO_RETORNO: 'Retorno de nutrição',
  CADENCIA: 'Cadência',
};

export const REGIOES = ['NORTE', 'NORDESTE', 'CENTRO_OESTE', 'SUDESTE', 'SUL'] as const;
export type Regiao = (typeof REGIOES)[number];

export const REGIAO_LABEL: Record<Regiao, string> = {
  NORTE: 'Norte',
  NORDESTE: 'Nordeste',
  CENTRO_OESTE: 'Centro-Oeste',
  SUDESTE: 'Sudeste',
  SUL: 'Sul',
};
