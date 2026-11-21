import { describe, expect, it } from 'vitest';
import {
  chaveDedupe,
  chaveNome,
  deduplicarEjs,
  extrairIesDaRazaoSocial,
  normalizarCidade,
  normalizarCnpj,
  normalizarInstagram,
  normalizarNomeIes,
  normalizarUf,
  normalizarUrl,
  regiaoDaUf,
} from './normalize';
import type { EjColetada } from './types';

function ej(p: Partial<EjColetada>): EjColetada {
  return {
    nome: 'EJ',
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
    fonteUrl: 'https://exemplo.org/a',
    fontes: [],
    coletadoEm: '2026-01-01T00:00:00.000Z',
    verificado: false,
    ...p,
  };
}

describe('normalizarUf', () => {
  it('aceita sigla em qualquer caixa', () => {
    expect(normalizarUf('rs')).toBe('RS');
    expect(normalizarUf(' SP ')).toBe('SP');
  });
  it('aceita nome do estado com ou sem acento', () => {
    expect(normalizarUf('São Paulo')).toBe('SP');
    expect(normalizarUf('PARAIBA')).toBe('PB');
    expect(normalizarUf('distrito federal')).toBe('DF');
  });
  it('retorna null para valores inválidos', () => {
    expect(normalizarUf('XX')).toBeNull();
    expect(normalizarUf('')).toBeNull();
    expect(normalizarUf(null)).toBeNull();
  });
  it('mapeia região', () => {
    expect(regiaoDaUf('am')).toBe('NORTE');
    expect(regiaoDaUf('GO')).toBe('CENTRO_OESTE');
  });
});

describe('normalizarCidade / normalizarNomeIes', () => {
  it('aplica Title Case com preposições minúsculas', () => {
    expect(normalizarCidade('SANTA MARIA')).toBe('Santa Maria');
    expect(normalizarCidade('rio  de   janeiro')).toBe('Rio de Janeiro');
    expect(normalizarCidade('SÃO JOÃO DEL-REI')).toBe('São João Del-Rei');
  });
  it('normaliza IES e remove sufixo de campus', () => {
    expect(normalizarNomeIes('UNIVERSIDADE FEDERAL DE SANTA MARIA')).toBe(
      'Universidade Federal de Santa Maria',
    );
    expect(normalizarNomeIes('UFRRJ')).toBe('UFRRJ');
    expect(normalizarNomeIes('Universidade de São Paulo - Campus São Carlos')).toBe(
      'Universidade de São Paulo',
    );
  });
  it('restaura acentos e siglas em nomes vindos da Receita', () => {
    expect(normalizarNomeIes('UNIVERSIDADE FEDERAL RURAL DA AMAZONIA')).toBe(
      'Universidade Federal Rural da Amazônia',
    );
    expect(normalizarNomeIes('FACULDADE DE ENGENHARIA DA COMPUTACAO FCT')).toBe(
      'Faculdade de Engenharia da Computação FCT',
    );
    expect(normalizarNomeIes('UNIVERSIDADE FEDERAL DO PARA')).toBe('Universidade Federal do Pará');
    expect(normalizarNomeIes('Universidade Federal de Santa Maria')).toBe(
      'Universidade Federal de Santa Maria',
    );
  });
  it('remove campus, parênteses e sigla repetida; siglas internas em caixa alta', () => {
    expect(normalizarNomeIes('Universidade Federal da Fronteira Sul do Campus Chapecó')).toBe(
      'Universidade Federal da Fronteira Sul',
    );
    expect(normalizarNomeIes('INSTITUTO FEDERAL GOIANO-CAMPUS CERES')).toBe(
      'Instituto Federal Goiano',
    );
    expect(normalizarNomeIes('UNIVERSIDADE FEDERAL DO MARANHAO)')).toBe(
      'Universidade Federal do Maranhão',
    );
    expect(normalizarNomeIes('UNIVERSIDADE FEDERAL DO OESTE DO PARA UFOPA')).toBe(
      'Universidade Federal do Oeste do Pará',
    );
    expect(normalizarNomeIes('Fundação Universidade Federal do Pampa - Unipampa')).toBe(
      'Fundação Universidade Federal do Pampa',
    );
    expect(normalizarNomeIes('FACULDADE DE ENGENHARIA MECANICA DA UFU')).toBe(
      'Faculdade de Engenharia Mecânica da UFU',
    );
    expect(
      normalizarNomeIes('INSTITUTO FEDERAL DE EDUCACAO CIENCIA E TECNOLOGIA DO PARA-IFPA'),
    ).toBe('Instituto Federal de Educação Ciência e Tecnologia do Pará');
    expect(normalizarNomeIes('UNIVERSIDADE FEDERAL RURAL DO SEMI-ARIDO')).toBe(
      'Universidade Federal Rural do Semi-Árido',
    );
  });
  it('corta sufixos após hífen ao extrair da razão social', () => {
    expect(
      extrairIesDaRazaoSocial('EJ DO INSTITUTO FEDERAL DE EDUCACAO, CIENCIA E TECNOLOGIA DE MINAS'),
    ).toBe('Instituto Federal de Educação, Ciência e Tecnologia de Minas');
    expect(extrairIesDaRazaoSocial('EJ DO CENTRO UNIVERSITARIO BARAO DE MAUA-CURSO ADM')).toBe(
      'Centro Universitário Barão de Mauá',
    );
    expect(extrairIesDaRazaoSocial('BIO JUNIOR DA UNIVERSIDADE FEDERAL DO PARA- BIO JUNIOR')).toBe(
      'Universidade Federal do Pará',
    );
    expect(
      extrairIesDaRazaoSocial('EMPRESA JUNIOR DA UNIVERSIDADE FEDERAL DE SAO JOAO DEL-REI'),
    ).toBe('Universidade Federal de São João Del-Rei');
  });
  it('extrai IES da razão social', () => {
    expect(
      extrairIesDaRazaoSocial(
        'EMPRESA DE ENGENHARIA ELETRICA JUNIOR DA UNIVERSIDADE ESTADUAL DE LONDRINA',
      ),
    ).toBe('Universidade Estadual de Londrina');
    expect(extrairIesDaRazaoSocial('META CONSULTORIA JUNIOR')).toBeNull();
    expect(extrairIesDaRazaoSocial('EMPRESA JUNIOR DO CENTRO UNIVERSITÁRIO FEI - ASSOCIACAO')).toBe(
      'Centro Universitário FEI',
    );
  });
});

describe('CNPJ e URLs', () => {
  it('valida e normaliza CNPJ', () => {
    expect(normalizarCnpj('07.340.372/0001-06')).toBe('07340372000106');
    expect(normalizarCnpj('7340372000106')).toBe('07340372000106');
    expect(normalizarCnpj('11.111.111/1111-11')).toBeNull();
    expect(normalizarCnpj('07340372000107')).toBeNull();
  });
  it('normaliza URL e Instagram', () => {
    expect(normalizarUrl('www.ej.com.br')).toBe('https://www.ej.com.br/');
    expect(normalizarUrl('null')).toBeNull();
    expect(normalizarInstagram('https://www.instagram.com/MinervaJr?igsh=abc')).toBe(
      'https://www.instagram.com/minervajr/',
    );
    expect(normalizarInstagram('@fluxo.consultoria')).toBe(
      'https://www.instagram.com/fluxo.consultoria/',
    );
    expect(normalizarInstagram('https://www.instagram.com/p/xyz')).toBeNull();
  });
});

describe('chaveNome', () => {
  it('ignora acentos, caixa, pontuação e variações de júnior', () => {
    expect(chaveNome('Vértix Júnior')).toBe(chaveNome('VERTIX JR.'));
    expect(chaveNome('P&Q Engenharia Jr.')).toBe('p e q engenharia jr');
  });
});

describe('deduplicarEjs', () => {
  it('deduplica por CNPJ e mescla campos', () => {
    const r = deduplicarEjs([
      ej({ nome: 'Meta', cnpj: '07340372000106', site: 'https://meta.com/', fonteUrl: 'a' }),
      ej({ nome: 'META JR', cnpj: '07.340.372/0001-06', cidade: 'Londrina', fonteUrl: 'b' }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].site).toBe('https://meta.com/');
    expect(r[0].cidade).toBe('Londrina');
    expect(r[0].fontes.sort()).toEqual(['a', 'b']);
  });
  it('deduplica por nome + IES + UF quando não há CNPJ', () => {
    const r = deduplicarEjs([
      ej({ nome: 'Fluxo Consultoria', ies: 'UFRJ', uf: 'RJ' }),
      ej({ nome: 'FLUXO CONSULTORIA', ies: 'ufrj', uf: 'rj', instagram: 'x' }),
      ej({ nome: 'Fluxo Consultoria', ies: 'UFRJ', uf: 'SP' }),
    ]);
    expect(r).toHaveLength(2);
    expect(r.find((x) => x.uf === 'RJ')?.instagram).toBe('x');
  });
  it('casa registro sem CNPJ com registro com CNPJ de mesmo nome e UF', () => {
    const r = deduplicarEjs([
      ej({ nome: 'IME Júnior', cnpj: '07340372000106', uf: 'RJ' }),
      ej({ nome: 'IME Junior', uf: 'RJ', instagram: 'https://www.instagram.com/imejr/' }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].instagram).toBe('https://www.instagram.com/imejr/');
  });
  it('não mescla EJs diferentes com mesmo nome em IES diferentes', () => {
    const r = deduplicarEjs([
      ej({ nome: 'Pulso', ies: 'UFF', uf: 'RJ' }),
      ej({ nome: 'Pulso', ies: 'UFRJ', uf: 'RJ' }),
    ]);
    expect(r).toHaveLength(2);
  });
  it('chaveDedupe prioriza CNPJ', () => {
    expect(chaveDedupe({ nome: 'x', cnpj: '07340372000106', ies: null, uf: null })).toBe(
      'cnpj:07340372000106',
    );
  });
});

describe('LGPD — canais institucionais', () => {
  it('mantém e-mail com nome da EJ ou termo institucional', async () => {
    const { emailInstitucional } = await import('./normalize');
    expect(emailInstitucional('acusticajr@ufsm.br', 'Acústica Jr')).toBe('acusticajr@ufsm.br');
    expect(emailInstitucional('contato@minhaej.com.br', 'Outra')).toBe('contato@minhaej.com.br');
    expect(emailInstitucional('COMERCIAL@x.com', 'Y')).toBe('comercial@x.com');
  });
  it('descarta e-mail com cara de pessoal', async () => {
    const { emailInstitucional } = await import('./normalize');
    expect(emailInstitucional('joao.silva@gmail.com', 'Acústica Jr')).toBeNull();
    expect(emailInstitucional('maria123@ufsm.br', 'Meta Consultoria')).toBeNull();
  });
  it('mantém fixo e descarta celular', async () => {
    const { telefoneInstitucional } = await import('./normalize');
    expect(telefoneInstitucional('(55) 3220-8000')).toBe('5532208000');
    expect(telefoneInstitucional('61 99393-5570')).toBeNull();
    expect(telefoneInstitucional('6199393557')).toBeNull();
  });
});

describe('extrairSiglaIes', () => {
  it('extrai siglas de IES citadas literalmente', async () => {
    const { extrairSiglaIes } = await import('./normalize');
    expect(extrairSiglaIes('EMPRESA JUNIOR DE RELACOES INTERNACIONAIS DA UFRRJ')).toBe('UFRRJ');
    expect(extrairSiglaIes('3E-UEL')).toBe('UEL');
    expect(extrairSiglaIes('EMPRESA JUNIOR UNESP SOROCABA')).toBe('UNESP');
    expect(extrairSiglaIes('PERIODYCA EMPRESA JUNIOR DE QUIMICA E BIOQUIMICA DA UEM')).toBe('UEM');
    expect(extrairSiglaIes('FGV Jr.')).toBe('FGV');
    expect(extrairSiglaIes('Empresa Júnior PUC-Rio')).toBe('PUC-RIO');
  });
  it('não inventa sigla quando não há citação', async () => {
    const { extrairSiglaIes } = await import('./normalize');
    expect(extrairSiglaIes('EMPRESA JUNIOR DE ENFERMAGEM')).toBeNull();
    expect(extrairSiglaIes('ENGRENAGEM JUNIOR')).toBeNull();
    expect(extrairSiglaIes('UNIAO CONSULTORIA JUNIOR')).toBeNull();
    expect(extrairSiglaIes('JUNIOR PUPILA AUDIOVISUAL - PAV')).toBeNull();
  });
});
