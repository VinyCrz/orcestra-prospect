import { BadRequestException } from '@nestjs/common';
import { calcularPontos } from '@orcestra/shared';
import { ConquistasService } from '../src/gamificacao/conquistas.service';
import { calcularProgresso, montarRanking } from '../src/gamificacao/contagem';
import { validarVigencia } from '../src/gamificacao/metas.service';
import { escopoResponsavel, resolverPeriodo } from '../src/dashboard/periodo';
import { DashboardService } from '../src/dashboard/dashboard.service';
import { intervaloDaSemana, resolverMeta, segundaDaSemanaIso, segundaDe, semanaAnterior, semanaIsoDe } from '../src/common/semana';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('semana ISO / fuso', () => {
  it('calcula a semana ISO (virada de ano, W53)', () => {
    expect(semanaIsoDe(new Date('2026-11-21T15:00:00Z'))).toBe('2026-W47');
    expect(semanaIsoDe(new Date('2021-01-03T15:00:00Z'))).toBe('2020-W53');
    expect(semanaIsoDe(new Date('2024-12-30T15:00:00Z'))).toBe('2025-W01');
  });
  it('usa o fuso de SP: domingo 22h em SP já é segunda em UTC mas continua na semana antiga', () => {
    expect(semanaIsoDe(new Date('2026-11-23T01:00:00Z'))).toBe('2026-W47'); // dom 22h SP
    expect(semanaIsoDe(new Date('2026-11-23T03:00:00Z'))).toBe('2026-W48'); // seg 00h SP
  });
  it('segunda da semana e intervalo meio-aberto em UTC', () => {
    expect(segundaDaSemanaIso('2026-W47')).toBe('2026-11-16');
    expect(segundaDe(new Date('2026-11-21T15:00:00Z'))).toBe('2026-11-16');
    const { ini, fim } = intervaloDaSemana('2026-W47');
    expect(ini.toISOString()).toBe('2026-11-16T03:00:00.000Z');
    expect(fim.toISOString()).toBe('2026-11-23T03:00:00.000Z');
    expect(semanaAnterior(new Date('2026-11-23T10:00:00Z'))).toBe('2026-W47');
  });
  it('rejeita semana inexistente', () => {
    expect(() => segundaDaSemanaIso('2025-W53')).toThrow(BadRequestException);
    expect(() => segundaDaSemanaIso('abc')).toThrow(BadRequestException);
  });
});

describe('meta vigente', () => {
  const m = (usuarioId: string | null, i: number, vigenteDesde: string) => ({ usuarioId, interacoesSemana: i, reunioesSemana: 1, vigenteDesde });
  const metas = [m(null, 40, '2026-01-05'), m(null, 50, '2026-11-16'), m('a', 70, '2026-11-09'), m('a', 80, '2026-11-30')];
  it('global com maior vigência <= semana', () => {
    expect(resolverMeta(metas, 'b', '2026-11-09')?.interacoesSemana).toBe(40);
    expect(resolverMeta(metas, 'b', '2026-11-16')?.interacoesSemana).toBe(50);
  });
  it('override do SDR vence a global; versões futuras não valem ainda', () => {
    expect(resolverMeta(metas, 'a', '2026-11-16')?.interacoesSemana).toBe(70);
    expect(resolverMeta(metas, 'a', '2026-11-30')?.interacoesSemana).toBe(80);
  });
  it('sem meta anterior à semana: null', () => {
    expect(resolverMeta(metas, 'b', '2025-12-29')).toBeNull();
  });
  it('validarVigencia: segunda, não passada', () => {
    const agora = new Date('2026-11-21T15:00:00Z');
    expect(validarVigencia(undefined, agora)).toBe('2026-11-16');
    expect(validarVigencia('2026-11-30', agora)).toBe('2026-11-30');
    expect(() => validarVigencia('2026-11-17', agora)).toThrow(BadRequestException);
    expect(() => validarVigencia('2026-11-09', agora)).toThrow(BadRequestException);
  });
});

describe('ranking e progresso', () => {
  it('pontos = interações + 5 x reuniões; empate por reuniões, depois nome', () => {
    expect(calcularPontos(10, 2)).toBe(20);
    const r = montarRanking([
      { usuarioId: '1', nome: 'Zé', interacoes: 20, reunioes: 0 },
      { usuarioId: '2', nome: 'Ana', interacoes: 10, reunioes: 2 },
      { usuarioId: '3', nome: 'Bia', interacoes: 15, reunioes: 1 },
      { usuarioId: '4', nome: 'Caio', interacoes: 0, reunioes: 0 },
    ]);
    expect(r.map((x) => [x.nome, x.pontos, x.posicao])).toEqual([['Ana', 20, 1], ['Bia', 20, 2], ['Zé', 20, 3], ['Caio', 0, 4]]);
  });
  it('progresso limita a 100 e detecta meta batida', () => {
    expect(calcularProgresso(20, 1, 40, 2).pct).toBe(50);
    expect(calcularProgresso(80, 2, 40, 2)).toMatchObject({ pct: 100, metaBatida: true });
    expect(calcularProgresso(40, 1, 40, 2).metaBatida).toBe(false);
    expect(calcularProgresso(5, 0, 0, 0)).toMatchObject({ pct: 100, metaBatida: false });
  });
});

describe('dashboard: período e permissão', () => {
  const agora = new Date('2026-11-21T15:00:00Z');
  it('padrão últimos 30 dias, fim inclusivo', () => {
    const { ini, fim } = resolverPeriodo(undefined, undefined, agora);
    expect(fim.toISOString()).toBe('2026-11-22T03:00:00.000Z');
    expect(ini.toISOString()).toBe('2026-10-23T03:00:00.000Z');
    expect(resolverPeriodo('2026-11-01', '2026-11-01', agora).fim.toISOString()).toBe('2026-11-02T03:00:00.000Z');
  });
  it('rejeita início >= fim e mais de 366 dias', () => {
    expect(() => resolverPeriodo('2026-11-10', '2026-11-01', agora)).toThrow(BadRequestException);
    expect(() => resolverPeriodo('2025-01-01', '2026-11-01', agora)).toThrow(BadRequestException);
    expect(() => resolverPeriodo('2025-11-21', '2026-11-21', agora)).not.toThrow();
  });
  it('SDR nunca vê outro responsavelId', () => {
    expect(escopoResponsavel({ id: 's1', papel: 'SDR' }, 'outro')).toBe('s1');
    expect(escopoResponsavel({ id: 'g1', papel: 'GESTOR' }, 'outro')).toBe('outro');
    expect(escopoResponsavel({ id: 'g1', papel: 'GESTOR' })).toBeNull();
  });
  it('service força o filtro do SDR nas consultas', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const svc = new DashboardService({ $queryRaw: queryRaw } as unknown as PrismaService);
    const r = await svc.obter({ responsavelId: 'outro' }, { id: 's1', email: '', nome: 'S', papel: 'SDR' });
    expect(r.responsavelId).toBe('s1');
    const valores = queryRaw.mock.calls.flatMap((c) => (c[0] as { values: unknown[] }).values);
    expect(valores).toContain('s1');
    expect(valores).not.toContain('outro');
    expect(queryRaw).toHaveBeenCalledTimes(7);
  });
});

describe('concessão de conquistas', () => {
  function montar(over: { interacoes?: number; ejs?: number; criadas?: number } = {}) {
    const createMany = jest.fn().mockResolvedValue({ count: over.criadas ?? 1 });
    const prisma = {
      conquista: { findMany: jest.fn(async ({ where }: { where: { chave: { in: string[] } } }) => where.chave.in.map((chave) => ({ chave }))) },
      conquistaUsuario: { createMany, findMany: jest.fn().mockResolvedValue([]) },
      interacao: { count: jest.fn().mockResolvedValue(over.interacoes ?? 1) },
      empresaJunior: { findUnique: jest.fn().mockResolvedValue({ federacaoId: 'f1' }) },
      $queryRaw: jest.fn().mockResolvedValue([{ n: BigInt(over.ejs ?? 1) }]),
    };
    return { prisma, createMany, svc: new ConquistasService(prisma as unknown as PrismaService) };
  }
  const base = { id: 'i1', usuarioId: 'u1', empresaJuniorId: 'e1' };

  it('reunião marcada + 100 interações + 10 EJs da federação', async () => {
    const { svc, createMany } = montar({ interacoes: 100, ejs: 10 });
    await svc.aposInteracao({ ...base, resultado: 'REUNIAO_MARCADA' });
    const chaves = (createMany.mock.calls[0][0].data as { conquistaChave: string; referencia: string }[]).map((d) => `${d.conquistaChave}:${d.referencia}`);
    expect(chaves).toEqual(['PRIMEIRA_REUNIAO:', 'CEM_INTERACOES:', 'DEZ_EJS_FEDERACAO_NOVA:f1']);
    expect(createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });
  it('sem critérios atingidos não grava nada', async () => {
    const { svc, createMany } = montar();
    await svc.aposInteracao({ ...base, resultado: 'RESPONDEU' });
    expect(createMany).not.toHaveBeenCalled();
  });
  it('é idempotente: repetir só reenvia com skipDuplicates (sem lançar)', async () => {
    const { svc, createMany } = montar({ criadas: 0 });
    await svc.aposInteracao({ ...base, resultado: 'REUNIAO_MARCADA' });
    await svc.aposInteracao({ ...base, resultado: 'REUNIAO_MARCADA' });
    expect(createMany).toHaveBeenCalledTimes(2);
    expect(createMany.mock.calls.every((c) => c[0].skipDuplicates === true)).toBe(true);
  });
  it('falha não propaga', async () => {
    const { svc, prisma } = montar();
    prisma.conquista.findMany = jest.fn().mockRejectedValue(new Error('db'));
    await expect(svc.aposInteracao({ ...base, resultado: 'REUNIAO_MARCADA' })).resolves.toBeUndefined();
    await expect(svc.aposMudancaStatus('u1', 'OPORTUNIDADE', 1)).resolves.toBeUndefined();
  });
  it('conquista inativa/inexistente é ignorada', async () => {
    const { svc, prisma, createMany } = montar();
    prisma.conquista.findMany = jest.fn().mockResolvedValue([]);
    await svc.aposMudancaStatus('u1', 'OPORTUNIDADE', 1);
    expect(createMany).not.toHaveBeenCalled();
  });
  it('PRIMEIRA_OPORTUNIDADE só para OPORTUNIDADE com alteração', async () => {
    const { svc, createMany } = montar();
    await svc.aposMudancaStatus('u1', 'EM_CONVERSA', 1);
    await svc.aposMudancaStatus('u1', 'OPORTUNIDADE', 0);
    expect(createMany).not.toHaveBeenCalled();
    await svc.aposMudancaStatus('u1', 'OPORTUNIDADE', 1);
    expect(createMany).toHaveBeenCalledTimes(1);
  });
  it('avaliarSemana concede só a quem bateu a meta vigente', async () => {
    const { svc, prisma, createMany } = montar();
    (prisma as Record<string, unknown>).metaSemanal = {
      findMany: jest.fn().mockResolvedValue([
        { usuarioId: null, interacoesSemana: 40, reunioesSemana: 2, vigenteDesde: new Date('2026-01-05T00:00:00Z') },
        { usuarioId: 'b', interacoesSemana: 10, reunioesSemana: 0, vigenteDesde: new Date('2026-11-02T00:00:00Z') },
      ]),
    };
    prisma.$queryRaw = jest.fn().mockResolvedValue([
      { id: 'a', nome: 'A', total: 45n, reunioes: 2n },
      { id: 'b', nome: 'B', total: 10n, reunioes: 0n },
      { id: 'c', nome: 'C', total: 39n, reunioes: 5n },
    ]);
    const r = await svc.avaliarSemana('2026-W47');
    expect(r).toMatchObject({ avaliados: 3 });
    const data = createMany.mock.calls[0][0].data as { usuarioId: string; referencia: string }[];
    expect(data.map((d) => [d.usuarioId, d.referencia])).toEqual([['a', '2026-W47'], ['b', '2026-W47']]);
  });
});
