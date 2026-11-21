import { describe, expect, it } from 'vitest';
import {
  atualizarConfigScoreSchema,
  calcularScore,
  faixaDoScore,
  type ConfigScoreCalculo,
  type CriterioIcp,
  type DadosScoreEj,
} from './score';

const AGORA = new Date('2026-06-30T12:00:00Z');
const vazio: DadosScoreEj = {
  federada: false,
  membrosEstimados: null,
  tagIds: [],
  regiao: null,
  uf: null,
  iesNatureza: null,
  site: null,
  instagram: null,
  linkedin: null,
  facebook: null,
  verificado: false,
  cargosContatosValidos: [],
  ultimaInteracaoEm: null,
};
const lim = { A: 75, B: 50, C: 25 };

function cfg(chave: CriterioIcp, peso: number, parametros: unknown = {}, extra: ConfigScoreCalculo['criterios'] = []): ConfigScoreCalculo {
  return { limiares: lim, criterios: [{ chave, peso, ativo: true, parametros }, ...extra] };
}
const pontos = (c: ConfigScoreCalculo, d: Partial<DadosScoreEj>) =>
  calcularScore({ ...vazio, ...d }, c, AGORA).detalhe[0];

describe('critérios do score', () => {
  it('FEDERADA', () => {
    expect(pontos(cfg('FEDERADA', 10), { federada: true }).pontos).toBe(10);
    expect(pontos(cfg('FEDERADA', 10), {}).pontos).toBe(0);
  });
  it('FAIXA_MEMBROS: parcial, limites, sem dado e fora das faixas', () => {
    const c = cfg('FAIXA_MEMBROS', 20, {
      faixas: [
        { min: 0, max: 9, percentual: 25 },
        { min: 10, max: 19, percentual: 50 },
        { min: 20, max: null, percentual: 100 },
      ],
    });
    expect(pontos(c, { membrosEstimados: 9 }).pontos).toBe(5);
    expect(pontos(c, { membrosEstimados: 10 }).pontos).toBe(10);
    expect(pontos(c, { membrosEstimados: 500 }).pontos).toBe(20);
    const sd = pontos(c, { membrosEstimados: null });
    expect(sd.pontos).toBe(0);
    expect(sd.motivo).toBe('sem dado');
    expect(pontos(cfg('FAIXA_MEMBROS', 20, { faixas: [{ min: 5, max: 9, percentual: 100 }] }), { membrosEstimados: 2 }).pontos).toBe(0);
  });
  it('AREAS_ALINHADAS', () => {
    const c = cfg('AREAS_ALINHADAS', 10, { tagIds: ['a', 'b'] });
    expect(pontos(c, { tagIds: ['x', 'b'] }).pontos).toBe(10);
    expect(pontos(c, { tagIds: ['x'] }).pontos).toBe(0);
    expect(pontos(c, { tagIds: [] }).motivo).toBe('sem dado');
  });
  it('REGIAO_PRIORITARIA por UF e por região', () => {
    const c = cfg('REGIAO_PRIORITARIA', 10, { regioes: ['SUL'], ufs: ['SP'] });
    expect(pontos(c, { uf: 'SP', regiao: 'SUDESTE' }).pontos).toBe(10);
    expect(pontos(c, { uf: 'RS', regiao: 'SUL' }).pontos).toBe(10);
    expect(pontos(c, { uf: 'BA', regiao: 'NORDESTE' }).pontos).toBe(0);
    expect(pontos(c, {}).motivo).toBe('sem dado');
  });
  it('IES_PUBLICA_PRIVADA', () => {
    const c = cfg('IES_PUBLICA_PRIVADA', 5, { preferencia: 'PUBLICA' });
    expect(pontos(c, { iesNatureza: 'PUBLICA' }).pontos).toBe(5);
    expect(pontos(c, { iesNatureza: 'PRIVADA' }).pontos).toBe(0);
    expect(pontos(c, { iesNatureza: null }).motivo).toBe('sem dado');
    expect(pontos(cfg('IES_PUBLICA_PRIVADA', 5, { preferencia: null }), { iesNatureza: 'PUBLICA' }).pontos).toBe(0);
  });
  it('TEM_SITE_REDES respeita campos e mínimo', () => {
    const c = cfg('TEM_SITE_REDES', 10, { campos: ['site', 'instagram'], minimo: 2 });
    expect(pontos(c, { site: 'https://x.com', instagram: '@x' }).pontos).toBe(10);
    expect(pontos(c, { site: 'https://x.com', linkedin: 'l' }).pontos).toBe(0);
    expect(pontos(c, {}).motivo).toBe('sem dado');
  });
  it('TEM_DECISOR', () => {
    const c = cfg('TEM_DECISOR', 15, { cargos: ['PRESIDENTE', 'DIR_COMERCIAL'] });
    expect(pontos(c, { cargosContatosValidos: ['OUTRO', 'PRESIDENTE'] }).pontos).toBe(15);
    expect(pontos(c, { cargosContatosValidos: ['OUTRO'] }).pontos).toBe(0);
    expect(pontos(c, { cargosContatosValidos: [] }).motivo).toBe('sem dado');
  });
  it('INTERACAO_30D usa dias configurados', () => {
    const c = cfg('INTERACAO_30D', 10, { dias: 30 });
    expect(pontos(c, { ultimaInteracaoEm: new Date('2026-06-01T12:00:00Z') }).pontos).toBe(10);
    expect(pontos(c, { ultimaInteracaoEm: new Date('2026-05-01T12:00:00Z') }).pontos).toBe(0);
    expect(pontos(c, {}).motivo).toBe('sem dado');
  });
  it('DADOS_VERIFICADOS', () => {
    expect(pontos(cfg('DADOS_VERIFICADOS', 10), { verificado: true }).pontos).toBe(10);
    expect(pontos(cfg('DADOS_VERIFICADOS', 10), {}).pontos).toBe(0);
  });
});

describe('normalização e faixas', () => {
  it('ignora critérios inativos e normaliza pelos pesos ativos', () => {
    const c: ConfigScoreCalculo = {
      limiares: lim,
      criterios: [
        { chave: 'FEDERADA', peso: 10, ativo: true, parametros: {} },
        { chave: 'DADOS_VERIFICADOS', peso: 30, ativo: true, parametros: {} },
        { chave: 'TEM_DECISOR', peso: 60, ativo: false, parametros: { cargos: ['PRESIDENTE'] } },
      ],
    };
    const r = calcularScore({ ...vazio, federada: true }, c, AGORA);
    expect(r.pesoTotal).toBe(40);
    expect(r.score).toBe(25);
    expect(r.faixa).toBe('C');
    expect(r.detalhe).toHaveLength(2);
  });
  it('score 100 com tudo; 0 sem nenhum critério ativo', () => {
    const c = cfg('FEDERADA', 7);
    expect(calcularScore({ ...vazio, federada: true }, c, AGORA).score).toBe(100);
    expect(calcularScore(vazio, { limiares: lim, criterios: [] }, AGORA).score).toBe(0);
  });
  it('faixas nos limites', () => {
    expect(faixaDoScore(75, lim)).toBe('A');
    expect(faixaDoScore(74, lim)).toBe('B');
    expect(faixaDoScore(50, lim)).toBe('B');
    expect(faixaDoScore(49, lim)).toBe('C');
    expect(faixaDoScore(25, lim)).toBe('C');
    expect(faixaDoScore(24, lim)).toBe('D');
    expect(faixaDoScore(0, lim)).toBe('D');
  });
});

describe('validação da configuração', () => {
  const ok = {
    limiares: { A: 75, B: 50, C: 25 },
    criterios: [
      { chave: 'FEDERADA', peso: 10, ativo: true, parametros: {} },
      { chave: 'INTERACAO_30D', peso: 5, ativo: true, parametros: { dias: 15 } },
    ],
  };
  it('aceita configuração válida', () => {
    expect(atualizarConfigScoreSchema.safeParse(ok).success).toBe(true);
  });
  it('rejeita limiares fora de ordem', () => {
    expect(atualizarConfigScoreSchema.safeParse({ ...ok, limiares: { A: 50, B: 50, C: 25 } }).success).toBe(false);
    expect(atualizarConfigScoreSchema.safeParse({ ...ok, limiares: { A: 101, B: 50, C: 25 } }).success).toBe(false);
  });
  it('rejeita parâmetros inválidos por chave', () => {
    const bad = (c: unknown) => atualizarConfigScoreSchema.safeParse({ ...ok, criterios: [c] }).success;
    expect(bad({ chave: 'INTERACAO_30D', peso: 5, ativo: true, parametros: { dias: 0 } })).toBe(false);
    expect(bad({ chave: 'REGIAO_PRIORITARIA', peso: 5, ativo: true, parametros: { regioes: ['XX'], ufs: [] } })).toBe(false);
    expect(bad({ chave: 'FAIXA_MEMBROS', peso: 5, ativo: true, parametros: { faixas: [{ min: 10, max: 5, percentual: 50 }] } })).toBe(false);
    expect(bad({ chave: 'FEDERADA', peso: 101, ativo: true, parametros: {} })).toBe(false);
  });
  it('rejeita critério repetido', () => {
    const c = ok.criterios[0];
    expect(atualizarConfigScoreSchema.safeParse({ ...ok, criterios: [c, c] }).success).toBe(false);
  });
});
