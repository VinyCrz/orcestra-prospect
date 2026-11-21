import type { Papel, Regiao, StatusProspeccao } from './enums';

/** Registro de EJ como sai do coletor (data/ejs.json). Campos não confirmados ficam null. */
export interface EjColetada {
  nome: string;
  razaoSocial: string | null;
  cnpj: string | null;
  ies: string | null;
  iesSigla: string | null;
  federacao: string | null;
  nucleo: string | null;
  cidade: string | null;
  uf: string | null;
  regiao: Regiao | null;
  areas: string[];
  cursos: string[];
  servicos: string[];
  anoFundacao: number | null;
  membrosEstimados: number | null;
  federada: boolean | null;
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
}

export interface UsuarioPublico {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  criadoEm: string;
  ultimoLoginEm: string | null;
}

export interface Paginado<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface EmpresaJuniorResumo {
  id: string;
  nome: string;
  cidade: string | null;
  uf: string | null;
  ies: { id: string; nome: string; sigla: string | null } | null;
  federacao: { id: string; nome: string; sigla: string | null } | null;
  statusProspeccao: StatusProspeccao;
  scoreIcp: number;
  verificado: boolean;
}
