import type { Regiao } from './enums';

export interface UfInfo {
  sigla: string;
  nome: string;
  regiao: Regiao;
}

export const UFS: UfInfo[] = [
  { sigla: 'AC', nome: 'Acre', regiao: 'NORTE' },
  { sigla: 'AL', nome: 'Alagoas', regiao: 'NORDESTE' },
  { sigla: 'AP', nome: 'Amapá', regiao: 'NORTE' },
  { sigla: 'AM', nome: 'Amazonas', regiao: 'NORTE' },
  { sigla: 'BA', nome: 'Bahia', regiao: 'NORDESTE' },
  { sigla: 'CE', nome: 'Ceará', regiao: 'NORDESTE' },
  { sigla: 'DF', nome: 'Distrito Federal', regiao: 'CENTRO_OESTE' },
  { sigla: 'ES', nome: 'Espírito Santo', regiao: 'SUDESTE' },
  { sigla: 'GO', nome: 'Goiás', regiao: 'CENTRO_OESTE' },
  { sigla: 'MA', nome: 'Maranhão', regiao: 'NORDESTE' },
  { sigla: 'MT', nome: 'Mato Grosso', regiao: 'CENTRO_OESTE' },
  { sigla: 'MS', nome: 'Mato Grosso do Sul', regiao: 'CENTRO_OESTE' },
  { sigla: 'MG', nome: 'Minas Gerais', regiao: 'SUDESTE' },
  { sigla: 'PA', nome: 'Pará', regiao: 'NORTE' },
  { sigla: 'PB', nome: 'Paraíba', regiao: 'NORDESTE' },
  { sigla: 'PR', nome: 'Paraná', regiao: 'SUL' },
  { sigla: 'PE', nome: 'Pernambuco', regiao: 'NORDESTE' },
  { sigla: 'PI', nome: 'Piauí', regiao: 'NORDESTE' },
  { sigla: 'RJ', nome: 'Rio de Janeiro', regiao: 'SUDESTE' },
  { sigla: 'RN', nome: 'Rio Grande do Norte', regiao: 'NORDESTE' },
  { sigla: 'RS', nome: 'Rio Grande do Sul', regiao: 'SUL' },
  { sigla: 'RO', nome: 'Rondônia', regiao: 'NORTE' },
  { sigla: 'RR', nome: 'Roraima', regiao: 'NORTE' },
  { sigla: 'SC', nome: 'Santa Catarina', regiao: 'SUL' },
  { sigla: 'SP', nome: 'São Paulo', regiao: 'SUDESTE' },
  { sigla: 'SE', nome: 'Sergipe', regiao: 'NORDESTE' },
  { sigla: 'TO', nome: 'Tocantins', regiao: 'NORTE' },
];

export const UF_SIGLAS = UFS.map((u) => u.sigla);
