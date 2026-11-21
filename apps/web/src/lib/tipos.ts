import type {
  BaseLegal,
  CargoContato,
  EmpresaJuniorResumo,
  FiltrosEj,
  Paginado,
  Papel,
  StatusProspeccao,
  TipoImportacao,
} from '@orcestra/shared';

export interface TagRef {
  id: string;
  nome: string;
  tipo: 'AREA' | 'CURSO' | 'LIVRE';
  cor?: string | null;
}

/** Item da lista de EJs (Etapa 2): resumo + responsável, tags e permissão de edição. */
export interface EjLista extends EmpresaJuniorResumo {
  regiao: string | null;
  federada: boolean;
  membrosEstimados: number | null;
  responsavelId: string | null;
  responsavel: { id: string; nome: string } | null;
  tags: TagRef[];
  atualizadoEm: string;
  podeEditar: boolean;
}

export type ListaEjs = Paginado<EjLista>;

export interface Federacao {
  id: string;
  nome: string;
  sigla: string;
  uf: string | null;
  site: string | null;
  instagram: string | null;
  fonteUrl: string | null;
  totalEmpresas: number;
}

export interface EmpresaJuniorDetalhe {
  id: string;
  nome: string;
  razaoSocial: string | null;
  cnpj: string | null;
  cidade: string | null;
  uf: string | null;
  regiao: string | null;
  servicos: string[];
  anoFundacao: number | null;
  membrosEstimados: number | null;
  federada: boolean;
  site: string | null;
  instagram: string | null;
  linkedin: string | null;
  facebook: string | null;
  emailInstitucional: string | null;
  telefoneInstitucional: string | null;
  situacaoCadastral: string | null;
  idBrasilJunior: string | null;
  fonteUrl: string;
  fontes: string[];
  coletadoEm: string;
  verificado: boolean;
  statusProspeccao: StatusProspeccao;
  scoreIcp: number;
  observacoes: string | null;
  atualizadoEm: string;
  ies: {
    id: string;
    nome: string;
    sigla: string | null;
    cidade: string | null;
    uf: string | null;
  } | null;
  federacao: { id: string; nome: string; sigla: string; site: string | null } | null;
  nucleo: { id: string; nome: string } | null;
  responsavel: { id: string; nome: string; email: string } | null;
  tags: TagRef[];
  podeEditar: boolean;
}

export interface OpcaoIes {
  id: string;
  nome: string;
  sigla: string | null;
  uf: string | null;
  total: number;
}
export interface OpcaoTag extends TagRef {
  total: number;
}
export interface OpcoesResponsaveis {
  usuarios: { id: string; nome: string; papel: Papel; totalEjs: number }[];
  semResponsavel: number;
}

export interface ListaSalva {
  id: string;
  nome: string;
  descricao: string | null;
  filtros: FiltrosEj;
  compartilhada: boolean;
  dono: { id: string; nome: string };
  minha: boolean;
  podeEditar: boolean;
}

export interface ContatoEj {
  id: string;
  empresaJuniorId: string;
  nome: string;
  cargo: CargoContato;
  cargoDescricao: string | null;
  email: string | null;
  telefone: string | null;
  whatsapp: string | null;
  linkedin: string | null;
  principal: boolean;
  mandatoInicio: string | null;
  mandatoFim: string | null;
  baseLegal: BaseLegal;
  fonte: string | null;
  optOut: boolean;
  optOutEm: string | null;
  optOutMotivo: string | null;
}

export interface ResultadoAcaoEmMassa {
  acao: string;
  selecionadas: number;
  alteradas: number;
  semMudanca: number;
  semPermissao: number;
}

export interface ResultadoCarteira {
  modo: 'MANUAL' | 'RODIZIO';
  selecionadas: number;
  atribuidas: number;
  semMudanca: number;
  resumo: { sdrId: string; nome: string; atribuidas: number; porUf: Record<string, number> }[];
}

export interface ImportacaoResumo {
  id: string;
  tipo: TipoImportacao;
  status: 'AGUARDANDO_MAPEAMENTO' | 'PENDENTE' | 'PROCESSANDO' | 'CONCLUIDA' | 'FALHOU' | 'CANCELADA';
  arquivoNome: string;
  estrategiaDuplicados: 'MESCLAR' | 'IGNORAR';
  totalLinhas: number;
  processadas: number;
  importadas: number;
  atualizadas: number;
  ignoradas: number;
  erros: number;
  mensagemErro: string | null;
  criadoEm: string;
  concluidaEm: string | null;
}
export interface ImportacaoDetalhe extends ImportacaoResumo {
  percentual: number;
  errosAmostra: { linha: number; campo?: string; mensagem: string }[];
}
export interface ImportacaoUpload {
  id: string;
  tipo: TipoImportacao;
  totalLinhas: number;
  colunas: string[];
  amostra: Record<string, unknown>[];
  mapeamentoSugerido: Record<string, string | null>;
  camposDisponiveis: { campo: string; rotulo: string; obrigatorio?: boolean }[];
  avisoReenvio: { importacaoId: string; concluidaEm: string | null } | null;
}
export interface ImportacaoPrevia {
  id: string;
  novas: number;
  duplicadas: number;
  comErro: number;
  totalLinhas: number;
  errosFrequentes: { mensagem: string; quantidade: number }[];
  amostra: {
    linha: number;
    status: 'NOVA' | 'DUPLICADA' | 'ERRO';
    dados?: Record<string, unknown>;
    erros: { campo?: string; mensagem: string }[];
    existenteId?: string;
  }[];
}
