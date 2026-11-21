export const PAPEIS = ['ADMIN', 'GESTOR', 'SDR'] as const;
export type Papel = (typeof PAPEIS)[number];

export const PAPEL_LABEL: Record<Papel, string> = {
  ADMIN: 'Administrador',
  GESTOR: 'Gestor',
  SDR: 'SDR',
};

export const STATUS_PROSPECCAO = [
  'NAO_TRABALHADA',
  'EM_PROSPECCAO',
  'CONTATO_REALIZADO',
  'REUNIAO_AGENDADA',
  'PROPOSTA_ENVIADA',
  'NEGOCIACAO',
  'GANHA',
  'PERDIDA',
  'DESCARTADA',
] as const;
export type StatusProspeccao = (typeof STATUS_PROSPECCAO)[number];

export const STATUS_PROSPECCAO_LABEL: Record<StatusProspeccao, string> = {
  NAO_TRABALHADA: 'Não trabalhada',
  EM_PROSPECCAO: 'Em prospecção',
  CONTATO_REALIZADO: 'Contato realizado',
  REUNIAO_AGENDADA: 'Reunião agendada',
  PROPOSTA_ENVIADA: 'Proposta enviada',
  NEGOCIACAO: 'Negociação',
  GANHA: 'Ganha',
  PERDIDA: 'Perdida',
  DESCARTADA: 'Descartada',
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
