import type { EjColetada } from '@orcestra/shared';

export interface FederacaoColetada {
  nome: string;
  sigla: string;
  uf: string | null;
  site: string | null;
  instagram: string | null;
  fonteUrl: string;
}

export interface ResultadoFonte {
  fonte: string;
  url: string;
  ejs: EjColetada[];
  federacoes: FederacaoColetada[];
  observacao?: string;
}

export function novaEj(nome: string, fonteUrl: string, coletadoEm: string): EjColetada {
  return {
    nome,
    razaoSocial: null,
    cnpj: null,
    ies: null,
    iesSigla: null,
    federacao: null,
    nucleo: null,
    cidade: null,
    uf: null,
    regiao: null,
    areas: [],
    cursos: [],
    servicos: [],
    anoFundacao: null,
    membrosEstimados: null,
    federada: null,
    site: null,
    instagram: null,
    linkedin: null,
    facebook: null,
    emailInstitucional: null,
    telefoneInstitucional: null,
    situacaoCadastral: null,
    idBrasilJunior: null,
    fonteUrl,
    fontes: [],
    coletadoEm,
    verificado: false,
  };
}
