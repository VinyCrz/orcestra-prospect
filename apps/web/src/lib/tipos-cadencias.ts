import type { CanalInteracao, MotivoEncerramento } from '@orcestra/shared';

export interface TemplateMsg {
  id: string;
  nome: string;
  chave: string | null;
  canal: CanalInteracao;
  assunto: string | null;
  corpo: string;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export interface PassoCadencia {
  id: string;
  ordem: number;
  diaOffset: number;
  canal: CanalInteracao;
  templateId: string | null;
  instrucoes: string | null;
  template: { id: string; nome: string; ativo: boolean } | null;
}

export interface Cadencia {
  id: string;
  nome: string;
  chave: string | null;
  descricao: string | null;
  ativa: boolean;
  passos: PassoCadencia[];
  inscricoesAtivas?: number;
}

export type StatusInscricao = 'ATIVA' | 'CONCLUIDA' | 'ENCERRADA';

export interface Inscricao {
  id: string;
  empresaJuniorId: string;
  cadenciaId: string;
  contatoId: string | null;
  iniciadaEm: string;
  status: StatusInscricao;
  motivoEncerramento: MotivoEncerramento | null;
  motivoDetalhe: string | null;
  encerradaEm: string | null;
  empresaJunior: { id: string; nome: string; uf: string | null };
  cadencia: { id: string; nome: string };
  contato: { id: string; nome: string } | null;
  responsavel: { id: string; nome: string } | null;
  progresso: { total: number; concluidos: number; proximoVencimento: string | null };
}

export interface PaginaInscricoes {
  items: Inscricao[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ResultadoInscricao {
  inscritas: number;
  ignoradas: { ejId: string; motivo: string }[];
}

export interface MensagemPassoResp {
  canal: CanalInteracao;
  assunto: string | null;
  texto: string;
  contato: { id: string; nome: string; email: string | null; telefone: string | null; optOut: boolean };
  links: { waMe?: string; mailto?: string };
}

export const STATUS_INSCRICAO_LABEL: Record<StatusInscricao, string> = {
  ATIVA: 'Ativa',
  CONCLUIDA: 'Concluída',
  ENCERRADA: 'Encerrada',
};

export const MOTIVO_ENCERRAMENTO_LABEL: Record<MotivoEncerramento, string> = {
  RESPOSTA: 'Houve resposta',
  AVANCO_FUNIL: 'Avançou no funil',
  MANUAL: 'Encerrada manualmente',
  OPT_OUT: 'Contato em opt-out',
};

export const dataCurtaBr = (iso: string | null | undefined) =>
  iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';
