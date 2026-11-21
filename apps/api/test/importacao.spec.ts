import { sugerirMapeamento, validarMapeamento } from '../src/importacoes/mapeamento';
import {
  calcularMerge,
  calcularMergeContato,
  IndiceEjs,
  normalizarLinhaContato,
  normalizarLinhaEj,
  parseCargo,
  type EjExistente,
  type EjLinha,
} from '../src/importacoes/linhas';
import {
  decodificar,
  detectarDelimitador,
  lerCsv,
  nomesColunas,
  parseCsv,
} from '../src/importacoes/parser';

describe('parser CSV', () => {
  it('detecta ; , e tab', () => {
    expect(detectarDelimitador('a;b;c\n1;2;3')).toBe(';');
    expect(detectarDelimitador('a,b,c\n1,2,3')).toBe(',');
    expect(detectarDelimitador('a\tb\tc')).toBe('\t');
    expect(detectarDelimitador('"a;b",c,d')).toBe(',');
  });

  it('remove BOM UTF-8 e lê acentos', () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Nome;UF\nEJ São Paulo;SP\n')]);
    const p = lerCsv(buf);
    expect(p.colunas).toEqual(['Nome', 'UF']);
    expect(p.linhas[0]).toEqual({ Nome: 'EJ São Paulo', UF: 'SP' });
  });

  it('cai para latin1 quando não é UTF-8 válido', () => {
    const buf = Buffer.from('Nome;Cidade\nEJ Júnior;São Paulo\n', 'latin1');
    expect(decodificar(buf)).toContain('São Paulo');
    expect(lerCsv(buf).linhas[0].Cidade).toBe('São Paulo');
  });

  it('trata aspas, separador dentro do campo e CRLF', () => {
    const m = parseCsv('a;b\r\n"x;y";"diz ""oi"""\r\n', ';');
    expect(m).toEqual([['a', 'b'], ['x;y', 'diz "oi"']]);
  });

  it('nomes de coluna vazios/repetidos ficam únicos', () => {
    expect(nomesColunas(['a', '', 'a'])).toEqual(['a', 'coluna_2', 'a (2)']);
  });

  it('rejeita arquivo vazio', () => {
    expect(() => lerCsv(Buffer.from('\n\n'))).toThrow();
  });
});

describe('mapeamento sugerido', () => {
  it('EJs', () => {
    const m = sugerirMapeamento(
      ['Nome da EJ', 'CNPJ', 'Estado', 'Cidade', 'Universidade', 'E-mail', 'Telefone', 'Instagram', 'Federação', 'Qtd Membros', 'Coluna X'],
      'EJS',
    );
    expect(m).toEqual({
      'Nome da EJ': 'nome',
      CNPJ: 'cnpj',
      Estado: 'uf',
      Cidade: 'cidade',
      Universidade: 'ies',
      'E-mail': 'emailInstitucional',
      Telefone: 'telefoneInstitucional',
      Instagram: 'instagram',
      Federação: 'federacao',
      'Qtd Membros': 'membrosEstimados',
      'Coluna X': null,
    });
  });

  it('contatos', () => {
    const m = sugerirMapeamento(['Nome', 'Empresa Júnior', 'UF', 'Cargo', 'Email', 'WhatsApp', 'Fim do mandato'], 'CONTATOS');
    expect(m).toMatchObject({
      Nome: 'nome',
      'Empresa Júnior': 'ejNome',
      UF: 'ejUf',
      Cargo: 'cargo',
      Email: 'email',
      WhatsApp: 'whatsapp',
      'Fim do mandato': 'mandatoFim',
    });
  });

  it('não repete o mesmo campo em duas colunas e valida', () => {
    const m = sugerirMapeamento(['Nome', 'Nome fantasia'], 'EJS');
    expect(Object.values(m).filter((v) => v === 'nome')).toHaveLength(1);
    expect(validarMapeamento({ A: 'nome', B: 'nome' }, ['A', 'B'], 'EJS')).not.toHaveLength(0);
    expect(validarMapeamento({ A: 'cnpj' }, ['A'], 'EJS')).toContain('Mapeie a coluna de nome');
    expect(validarMapeamento({ A: 'nome', B: 'cnpj' }, ['A', 'B'], 'EJS')).toEqual([]);
    expect(validarMapeamento({ A: 'nome' }, ['A'], 'CONTATOS')).not.toEqual([]);
  });
});

const existente = (o: Partial<EjExistente> = {}): EjExistente => ({
  razaoSocial: null,
  cnpj: null,
  iesId: null,
  federacaoId: null,
  cidade: null,
  uf: null,
  regiao: null,
  servicos: [],
  anoFundacao: null,
  membrosEstimados: null,
  site: null,
  instagram: null,
  linkedin: null,
  facebook: null,
  emailInstitucional: null,
  telefoneInstitucional: null,
  observacoes: null,
  ...o,
});
const nova = (o: Partial<EjLinha> = {}): EjLinha => ({
  nome: 'EJ Teste',
  razaoSocial: null,
  cnpj: null,
  ies: null,
  uf: null,
  cidade: null,
  federacao: null,
  tags: [],
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
  observacoes: null,
  ...o,
});

describe('mesclagem de importação (MESCLAR)', () => {
  it('nunca sobrescreve valores existentes', () => {
    const patch = calcularMerge(
      existente({ cidade: 'Porto Alegre', site: 'https://a.com/', membrosEstimados: 40 }),
      nova({ cidade: 'Canoas', site: 'https://b.com/', membrosEstimados: 99 }),
    );
    expect(patch).toEqual({});
  });

  it('preenche apenas campos vazios e deriva a região', () => {
    const patch = calcularMerge(
      existente({ cidade: 'Porto Alegre' }),
      nova({ cidade: 'Canoas', uf: 'RS', site: 'https://b.com/', membrosEstimados: 12 }),
    );
    expect(patch).toEqual({ uf: 'RS', regiao: 'SUL', site: 'https://b.com/', membrosEstimados: 12 });
  });

  it('une serviços sem remover os existentes e ignora duplicados', () => {
    const patch = calcularMerge(
      existente({ servicos: ['Consultoria'] }),
      nova({ servicos: ['consultoria', 'Marketing'] }),
    );
    expect(patch.servicos).toEqual(['Consultoria', 'Marketing']);
  });

  it('usa iesId/federacaoId resolvidos só se estiverem vazios', () => {
    expect(calcularMerge(existente({ iesId: 'x' }), nova(), { iesId: 'y' })).toEqual({});
    expect(calcularMerge(existente(), nova(), { iesId: 'y', federacaoId: 'f' })).toEqual({
      iesId: 'y',
      federacaoId: 'f',
    });
  });

  it('contatos: preenche vazios e preserva o resto', () => {
    const ex = {
      cargo: 'PRESIDENTE',
      cargoDescricao: null,
      email: 'a@b.com',
      telefone: null,
      whatsapp: null,
      linkedin: null,
      mandatoInicio: null,
      mandatoFim: new Date('2026-12-31'),
      fonte: 'manual',
    };
    const novo = normalizarLinhaContato({
      nome: 'Ana Silva',
      ejNome: 'EJ X',
      cargo: 'Diretora Comercial',
      email: 'outro@b.com',
      telefone: '(51) 3333-4444',
      mandatoFim: '01/01/2030',
    }).dados!;
    expect(calcularMergeContato(ex, novo)).toEqual({ telefone: '5133334444' });
  });
});

describe('normalização e deduplicação de linhas', () => {
  it('normaliza e valida linha de EJ', () => {
    const ok = normalizarLinhaEj({ nome: ' EJ  Foo ', uf: 'rio grande do sul', cnpj: '11.222.333/0001-81' });
    expect(ok.erros.length).toBeGreaterThanOrEqual(0);
    const ruim = normalizarLinhaEj({ nome: '', uf: 'XX', cnpj: '123' });
    expect(ruim.dados).toBeUndefined();
    expect(ruim.erros.map((e) => e.campo).sort()).toEqual(['cnpj', 'nome', 'uf']);
    expect(normalizarLinhaEj({ nome: 'EJ Foo', uf: 'rio grande do sul' }).dados?.uf).toBe('RS');
  });

  it('índice casa por CNPJ e por nome+UF (IES compatível)', () => {
    const idx = new IndiceEjs([
      { id: '1', cnpj: '11222333000181', nomeNormalizado: 'alfa jr', uf: 'RS', iesNome: 'UFRGS', chaveDedupe: 'cnpj:11222333000181' },
      { id: '2', cnpj: null, nomeNormalizado: 'beta consultoria', uf: 'SC', iesNome: 'UFSC', chaveDedupe: 'nome:beta consultoria|ies:ufsc|uf:SC' },
    ]);
    expect(idx.buscar({ cnpj: '11222333000181', nome: 'Qualquer', ies: null, uf: null })?.id).toBe('1');
    expect(idx.buscar({ cnpj: null, nome: 'Alfa Júnior', ies: null, uf: 'RS' })?.id).toBe('1');
    expect(idx.buscar({ cnpj: null, nome: 'Beta Consultoria', ies: 'UFSC', uf: 'SC' })?.id).toBe('2');
    expect(idx.buscar({ cnpj: null, nome: 'Beta Consultoria', ies: 'UDESC', uf: 'SC' })).toBeNull();
    expect(idx.buscar({ cnpj: '99999999000191', nome: 'Alfa Júnior', ies: null, uf: 'RS' })).toBeNull();
  });

  it('cargo de texto livre', () => {
    expect(parseCargo('Presidente').cargo).toBe('PRESIDENTE');
    expect(parseCargo('Diretor de Gente & Gestão').cargo).toBe('DIR_GENTE_GESTAO');
    expect(parseCargo('Coordenador de TI')).toEqual({ cargo: 'OUTRO', cargoDescricao: 'Coordenador de TI' });
  });
});
