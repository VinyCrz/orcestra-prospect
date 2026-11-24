import type {
  FaixaIcp,
  FaseTarefa,
  CanalInteracao,
  OrigemTarefa,
  PrioridadeTarefa,
  ResultadoInteracao,
  StatusProspeccao,
  TipoTimeline,
} from '@orcestra/shared';

export interface MotivoPerda {
  id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
}

export interface CardKanban {
  id: string;
  nome: string;
  cidade: string | null;
  uf: string | null;
  scoreIcp: number;
  faixaIcp: FaixaIcp | null;
  statusProspeccao: StatusProspeccao;
  responsavelId: string | null;
  ies: { id: string; nome: string; sigla: string | null } | null;
  responsavel: { id: string; nome: string } | null;
  motivoPerda: { id: string; nome: string } | null;
  dataRetornoNutricao: string | null;
  podeEditar: boolean;
}

export interface ColunaKanban {
  status: StatusProspeccao;
  total: number;
  items: CardKanban[];
  proximoCursor: string | null;
}

export interface RespostaKanban {
  colunas: ColunaKanban[];
}

export interface InteracaoCriada {
  id: string;
  sugestaoStatus: { de: StatusProspeccao; para: StatusProspeccao } | null;
}

export interface EventoTimeline {
  id: string;
  tipo: TipoTimeline;
  data: string;
  usuario: { id: string; nome: string } | null;
  detalhes: {
    canal?: CanalInteracao;
    resultado?: ResultadoInteracao;
    resumo?: string;
    contato?: { id: string; nome: string } | null;
    proximoPasso?: string | null;
    proximoPassoData?: string | null;
    de?: StatusProspeccao | null;
    para?: StatusProspeccao;
    motivoPerda?: { id: string; nome: string } | null;
    observacao?: string | null;
    acao?: string;
    dados?: { antes?: Record<string, unknown> | null; depois?: Record<string, unknown> | null } | null;
    titulo?: string;
    origem?: OrigemTarefa;
    vencimento?: string;
  };
}

export interface PaginaTimeline {
  items: EventoTimeline[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Tarefa {
  id: string;
  titulo: string;
  descricao: string | null;
  vencimento: string | null;
  fase: FaseTarefa;
  prioridade: PrioridadeTarefa;
  concluida: boolean;
  adiadaVezes: number;
  origem: OrigemTarefa;
  responsavelId: string;
  empresaJuniorId: string | null;
  empresaJunior: { id: string; nome: string; uf: string | null } | null;
  responsavel: { id: string; nome: string };
  colaboradores: { id: string; nome: string }[];
  subtarefas: { id: string; titulo: string; concluida: boolean }[];
}

export interface TarefaAgenda extends Tarefa {
  podeEditar: boolean;
}

export interface Agenda {
  responsavelId: string;
  atrasadas: Tarefa[];
  hoje: Tarefa[];
  proximos7Dias: Tarefa[];
}

export interface ContadorTarefas {
  atrasadas: number;
  hoje: number;
}
