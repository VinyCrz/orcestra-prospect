import { BadRequestException } from '@nestjs/common';
import type { UsuarioAutenticado } from '../src/auth/auth.types';
import type { AuditService } from '../src/common/audit.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { ScoreService } from '../src/score/score.service';

const admin: UsuarioAutenticado = { id: 'a1', email: 'a@x.com', nome: 'A', papel: 'ADMIN' };
const sdr: UsuarioAutenticado = { id: 's1', email: 's@x.com', nome: 'S', papel: 'SDR' };

const criterio = (chave: string, peso: number, ativo = true, parametros: object = {}) => ({
  chave, nome: chave, descricao: null, peso, ativo, parametros, ordem: 10,
});

function montar(over: Record<string, unknown> = {}) {
  const tx: Record<string, unknown> = {};
  const prisma = {
    configScore: {
      upsert: jest.fn().mockResolvedValue({ versao: 3, limiarA: 75, limiarB: 50, limiarC: 25 }),
      findUnique: jest.fn().mockResolvedValue({ atualizadoEm: new Date(), atualizadoPor: null }),
    },
    criterioScore: { findMany: jest.fn().mockResolvedValue([criterio('FEDERADA', 10), criterio('DADOS_VERIFICADOS', 10)]), upsert: jest.fn() },
    empresaJunior: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    contato: { findMany: jest.fn().mockResolvedValue([]) },
    interacao: { groupBy: jest.fn().mockResolvedValue([]) },
    tag: { count: jest.fn().mockResolvedValue(0) },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
    ...over,
  };
  Object.assign(tx, prisma);
  const audit = { registrar: jest.fn() } as unknown as AuditService;
  const fila = { add: jest.fn() };
  const svc = new ScoreService(prisma as unknown as PrismaService, audit, fila as never);
  return { svc, prisma, audit, fila };
}

const limiares = { A: 75, B: 50, C: 25 };

describe('ScoreService.atualizarConfig', () => {
  it('rejeita quando a soma dos pesos ativos fica 0', async () => {
    const { svc } = montar();
    await expect(
      svc.atualizarConfig(
        { limiares, criterios: [{ chave: 'FEDERADA', peso: 0, ativo: true, parametros: {} }, { chave: 'DADOS_VERIFICADOS', peso: 10, ativo: false, parametros: {} }] },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('salva, incrementa versão, audita e enfileira recálculo', async () => {
    const { svc, prisma, audit, fila } = montar();
    await svc.atualizarConfig(
      { limiares, criterios: [{ chave: 'FEDERADA', peso: 30, ativo: true, parametros: {} }] },
      admin,
    );
    expect(prisma.criterioScore.upsert).toHaveBeenCalledTimes(1);
    const arg = (prisma.configScore.upsert as jest.Mock).mock.calls.find((c) => c[0].update.versao)?.[0];
    expect(arg.update.versao).toEqual({ increment: 1 });
    expect((audit.registrar as jest.Mock).mock.calls[0][0].acao).toBe('SCORE_CONFIG_ATUALIZADA');
    expect(fila.add).toHaveBeenCalledWith('recalcular', { forcar: false }, expect.anything());
  });

  it('sem mudanças não incrementa versão nem enfileira', async () => {
    const { svc, fila, prisma } = montar();
    await svc.atualizarConfig({ limiares, criterios: [{ chave: 'FEDERADA', peso: 10, ativo: true, parametros: {} }] }, admin);
    expect(fila.add).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('ScoreService cálculo em lote', () => {
  it('recalcula com consultas agregadas (sem N+1) e grava em uma única UPDATE por lote', async () => {
    const ejs = Array.from({ length: 3 }, (_, i) => ({
      id: `e${i}`, federada: i === 0, membrosEstimados: null, regiao: null, uf: null, site: null, instagram: null,
      linkedin: null, facebook: null, verificado: false, ies: null, tags: [],
    }));
    const { svc, prisma } = montar({
      empresaJunior: { findMany: jest.fn().mockResolvedValue(ejs), count: jest.fn(), findFirst: jest.fn(), groupBy: jest.fn() },
    });
    const n = await svc.recalcularEjs(['e0', 'e1', 'e2']);
    expect(n).toBe(3);
    expect(prisma.contato.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.interacao.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('SDR vê só a própria carteira nas prioridades; GESTOR escolhe', async () => {
    const { svc, prisma } = montar();
    const fm = prisma.empresaJunior.findMany as jest.Mock;
    await svc.prioridades({ responsavelId: 'outro', limite: 10, incluirPesquisadas: false }, sdr);
    expect(fm.mock.calls[0][0].where.responsavelId).toBe('s1');
    await svc.prioridades({ responsavelId: 'outro', limite: 5, incluirPesquisadas: true }, { ...admin, papel: 'GESTOR' });
    expect(fm.mock.calls[1][0].where.responsavelId).toBe('outro');
    expect(fm.mock.calls[1][0].where.statusProspeccao).toEqual({ in: ['NAO_TRABALHADA', 'PESQUISADA'] });
    expect(fm.mock.calls[1][0].take).toBe(5);
  });
});
