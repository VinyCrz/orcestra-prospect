import type { EmpresaJuniorResumo, Paginado, StatusProspeccao } from '@orcestra/shared';

export type ListaEjs = Paginado<EmpresaJuniorResumo>;

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
  tags: { id: string; nome: string; tipo: 'AREA' | 'CURSO' | 'LIVRE' }[];
}
