import {
  Controller,
  ExecutionContext,
  ForbiddenException,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Papel } from '@prisma/client';
import { AuditLogsController } from '../src/audit-logs/audit-logs.controller';
import { limitesPeriodo } from '../src/audit-logs/audit-logs.service';
import { LimiteLogin, MSG_RATE_LIMIT } from '../src/auth/auth-throttler.guard';
import type { UsuarioAutenticado } from '../src/auth/auth.types';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { AuditService } from '../src/common/audit.service';
import { executarComIp } from '../src/common/contexto-requisicao';
import { ContatosController } from '../src/contatos/contatos.controller';
import { ContatosService } from '../src/contatos/contatos.service';
import { ImportacoesExecutor } from '../src/importacoes/importacoes.executor';
import { IndiceEjs } from '../src/importacoes/linhas';
import { LgpdController } from '../src/lgpd/lgpd.controller';
import { LgpdService, corteRetencao } from '../src/lgpd/lgpd.service';
import { MSG_SUPRIMIDO, SupressaoService } from '../src/lgpd/supressao.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { ScoreService } from '../src/score/score.service';

const usuario = (papel: Papel, id = 'u1'): UsuarioAutenticado => ({ id, email: 'x@y.z', nome: 'X', papel });
const score = { recalcularEj: jest.fn() } as unknown as ScoreService;

function supressaoReal(prisma: unknown, pepper = 'pepper-de-teste-com-32-caracteres-ok') {
  return new SupressaoService(prisma as PrismaService, new ConfigService({ SUPRESSAO_PEPPER: pepper }));
}

describe('rate limit de auth', () => {
  @Controller('t')
  class TesteController {
    @LimiteLogin()
    @Post('login')
    login() {
      return { ok: true };
    }
  }

  it('6ª tentativa de login do mesmo e-mail no minuto retorna 429 em pt-BR; outro e-mail não é afetado', async () => {
    const mod = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 10 }] })],
      controllers: [TesteController],
    }).compile();
    const app = mod.createNestApplication();
    await app.listen(0);
    try {
      const url = `${await app.getUrl()}/t/login`.replace('[::1]', '127.0.0.1');
      const post = (email: string) =>
        fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, senha: 'x' }),
        });
      for (let i = 0; i < 5; i++) expect((await post('a@b.com')).status).toBe(201);
      const r = await post('a@b.com');
      expect(r.status).toBe(429);
      expect(((await r.json()) as { message: string }).message).toBe(MSG_RATE_LIMIT);
      expect((await post('outro@b.com')).status).toBe(201);
    } finally {
      await app.close();
    }
  });
});

describe('supressão (hash HMAC)', () => {
  it('normaliza e-mail/telefone, não guarda valor em claro e depende do pepper', () => {
    const s = supressaoReal({});
    const a = s.chaves({ email: '  Ana@Ex.com ', telefone: '(11) 99999-8888', whatsapp: '+55 11 99999-8888' });
    expect(a).toHaveLength(2); // telefone e whatsapp iguais colapsam
    expect(s.chaves({ email: 'ana@ex.com' })[0].hash).toBe(a.find((c) => c.tipo === 'EMAIL')!.hash);
    expect(s.chaves({ telefone: '5511999998888' })[0].hash).toBe(a.find((c) => c.tipo === 'TELEFONE')!.hash);
    expect(a.every((c) => /^[0-9a-f]{64}$/.test(c.hash))).toBe(true);
    expect(supressaoReal({}, 'outro-pepper-outro-pepper-outro-pepper').chaves({ email: 'ana@ex.com' })[0].hash).not.toBe(
      a[0].hash,
    );
  });
});

describe('contatos: opt-out, supressão, anonimização', () => {
  const contato = {
    id: 'c1',
    empresaJuniorId: 'ej1',
    nome: 'Fulana de Tal',
    email: 'fulana@ej.com',
    telefone: '11999998888',
    whatsapp: null,
    optOut: false,
    optOutEm: null,
    anonimizadoEm: null,
  };

  function montar(extra: Record<string, unknown> = {}, contatoAtual: Record<string, unknown> = contato) {
    const tx = {
      supressaoContato: { createMany: jest.fn().mockResolvedValue({ count: 2 }), deleteMany: jest.fn() },
      historicoOptOut: { updateMany: jest.fn(), create: jest.fn() },
      contato: { update: jest.fn().mockImplementation(({ data }) => ({ ...contatoAtual, ...data })) },
      inscricaoCadencia: { findMany: jest.fn().mockResolvedValue([{ id: 'i1', empresaJuniorId: 'ej1', cadenciaId: 'cd' }]), updateMany: jest.fn() },
      tarefa: { updateMany: jest.fn() },
      auditLog: { create: jest.fn(), createMany: jest.fn() },
    };
    const prisma = {
      ...tx,
      empresaJunior: { findUnique: jest.fn().mockResolvedValue({ id: 'ej1', responsavelId: 'u1' }) },
      contato: { ...tx.contato, findUnique: jest.fn().mockResolvedValue(contatoAtual) },
      supressaoContato: { ...tx.supressaoContato, count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
      ...extra,
    };
    const audit = { registrar: jest.fn() };
    const svc = new ContatosService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      score,
      supressaoReal(prisma),
    );
    return { svc, prisma, tx, audit };
  }

  it('anonimizar: supressão antes de limpar, campos limpos, inscrições/tarefas encerradas, audit sem dados pessoais', async () => {
    const { svc, tx, audit } = montar();
    const r = await svc.anonimizar('c1', usuario('GESTOR'));
    expect(r).toEqual({ ok: true, jaAnonimizado: false });

    const supOrdem = tx.supressaoContato.createMany.mock.invocationCallOrder[0];
    const updOrdem = tx.contato.update.mock.invocationCallOrder[0];
    expect(supOrdem).toBeLessThan(updOrdem);
    const hashes = tx.supressaoContato.createMany.mock.calls[0][0].data;
    expect(hashes.map((h: { tipo: string }) => h.tipo).sort()).toEqual(['EMAIL', 'TELEFONE']);
    expect(hashes.every((h: { motivo: string }) => h.motivo === 'ANONIMIZACAO')).toBe(true);

    const data = tx.contato.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      nome: 'Contato anonimizado',
      email: null,
      telefone: null,
      whatsapp: null,
      linkedin: null,
      cargoDescricao: null,
      mandatoInicio: null,
      mandatoFim: null,
      optOut: true,
      optOutMotivo: null,
    });
    expect(data.anonimizadoEm).toBeInstanceOf(Date);
    expect(tx.historicoOptOut.updateMany).toHaveBeenCalledWith({ where: { contatoId: 'c1' }, data: { motivo: null } });
    expect(tx.inscricaoCadencia.updateMany).toHaveBeenCalled();
    expect(tx.tarefa.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ concluida: true }) }),
    );
    expect(audit.registrar.mock.calls[0][0]).toMatchObject({ acao: 'CONTATO_ANONIMIZADO', entidadeId: 'c1' });
    expect(JSON.stringify(audit.registrar.mock.calls[0][0])).not.toContain('fulana');
  });

  it('anonimizar é idempotente e atualizar contato anonimizado -> 422', async () => {
    const anon = { ...contato, anonimizadoEm: new Date() };
    const { svc, tx } = montar({}, anon);
    expect(await svc.anonimizar('c1', usuario('ADMIN'))).toEqual({ ok: true, jaAnonimizado: true });
    expect(tx.contato.update).not.toHaveBeenCalled();
    await expect(svc.atualizar('c1', { nome: 'Outro Nome' }, usuario('ADMIN'))).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('desmarcar opt-out como SDR -> 403', async () => {
    const { svc } = montar({}, { ...contato, optOut: true });
    await expect(svc.atualizar('c1', { optOut: false }, usuario('SDR'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('GESTOR desmarca: grava histórico DESMARCADO e remove só a supressão por opt-out', async () => {
    const { svc, tx } = montar({}, { ...contato, optOut: true });
    await svc.atualizar('c1', { optOut: false }, usuario('GESTOR'));
    expect(tx.historicoOptOut.create.mock.calls[0][0].data).toMatchObject({ acao: 'DESMARCADO', contatoId: 'c1' });
    expect(tx.supressaoContato.deleteMany.mock.calls[0][0].where.motivo).toBe('OPT_OUT');
  });

  it('marcar opt-out: exige motivo; grava histórico, supressão e cancela tarefas', async () => {
    const { svc, tx } = montar();
    await expect(svc.atualizar('c1', { optOut: true }, usuario('SDR'))).rejects.toThrow('motivo');
    await svc.atualizar('c1', { optOut: true, optOutMotivo: 'Pediu para sair' }, usuario('SDR'));
    expect(tx.historicoOptOut.create.mock.calls[0][0].data).toMatchObject({ acao: 'MARCADO', motivo: 'Pediu para sair' });
    expect(tx.supressaoContato.createMany).toHaveBeenCalled();
    expect(tx.tarefa.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { contatoId: 'c1', concluida: false } }),
    );
  });

  it('criar contato suprimido -> 422 (e nada é gravado)', async () => {
    const { svc, prisma } = montar({ supressaoContato: { count: jest.fn().mockResolvedValue(1), createMany: jest.fn() } });
    await expect(
      svc.criar('ej1', { nome: 'Fulana', cargo: 'OUTRO', baseLegal: 'LEGITIMO_INTERESSE_B2B', email: 'fulana@ej.com' }, usuario('GESTOR')),
    ).rejects.toThrow(MSG_SUPRIMIDO);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('exportar gera AuditLog CONTATO_EXPORTADO e devolve as seções', async () => {
    const { svc, audit } = montar({
      interacao: { findMany: jest.fn().mockResolvedValue([]) },
      tarefa: { findMany: jest.fn().mockResolvedValue([]) },
      inscricaoCadencia: { findMany: jest.fn().mockResolvedValue([]) },
      historicoOptOut: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
    });
    (svc as unknown as { prisma: { empresaJunior: { findUnique: jest.Mock } } }).prisma.empresaJunior.findUnique.mockResolvedValue({ id: 'ej1', nome: 'EJ' });
    const r = await svc.exportar('c1', usuario('GESTOR'));
    expect(Object.keys(r)).toEqual(
      expect.arrayContaining(['contato', 'empresaJunior', 'interacoes', 'tarefas', 'inscricoesCadencia', 'historicoOptOut', 'auditoria']),
    );
    expect(audit.registrar.mock.calls[0][0].acao).toBe('CONTATO_EXPORTADO');
  });
});

describe('importação respeita a supressão', () => {
  it('linha de contato suprimido não é criada e entra no relatório com o motivo', async () => {
    const indice = new IndiceEjs([
      { id: 'ej1', cnpj: null, nomeNormalizado: 'ej alfa', uf: 'SP', chaveDedupe: 'k', iesNome: null },
    ]);
    const tx = {
      contato: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      supressaoContato: { count: jest.fn().mockResolvedValue(1) },
    };
    const prisma = { supressaoContato: tx.supressaoContato };
    const exec = new ImportacoesExecutor({} as PrismaService, {} as AuditService, {} as ScoreService, supressaoReal(prisma));
    const cont = { importadas: 0, atualizadas: 0, ignoradas: 0, erros: 0 };
    const erros = await (exec as unknown as {
      linhaContato: (...a: unknown[]) => Promise<{ mensagem: string }[]>;
    }).linhaContato(
      tx,
      'imp1',
      'u1',
      'MESCLAR',
      indice,
      { linha: 2, original: {}, campos: { nome: 'Fulana de Tal', email: 'fulana@ej.com', ejNome: 'EJ Alfa', ejUf: 'SP' } },
      cont,
    );
    expect(erros[0].mensagem).toBe(MSG_SUPRIMIDO);
    expect(tx.contato.create).not.toHaveBeenCalled();
    expect(tx.contato.findMany.mock.calls[0][0].where).toMatchObject({ anonimizadoEm: null });
  });
});

describe('papéis das rotas LGPD/auditoria', () => {
  const guard = new RolesGuard(new Reflector());
  const ctx = (cls: new (...a: never[]) => unknown, handler: string, papel: Papel) =>
    ({
      getHandler: () => (cls.prototype as Record<string, () => void>)[handler],
      getClass: () => cls,
      switchToHttp: () => ({ getRequest: () => ({ usuario: usuario(papel) }) }),
    }) as unknown as ExecutionContext;

  it.each([
    [ContatosController, 'exportar'],
    [ContatosController, 'anonimizar'],
    [ContatosController, 'excluir'],
  ])('%p.%s: SDR 403; GESTOR e ADMIN ok', (cls, h) => {
    expect(() => guard.canActivate(ctx(cls, h, 'SDR'))).toThrow(ForbiddenException);
    expect(guard.canActivate(ctx(cls, h, 'GESTOR'))).toBe(true);
    expect(guard.canActivate(ctx(cls, h, 'ADMIN'))).toBe(true);
  });

  it.each([
    [AuditLogsController, 'listar'],
    [AuditLogsController, 'acoes'],
    [LgpdController, 'retencao'],
    [LgpdController, 'backfill'],
  ])('%p.%s: só ADMIN', (cls, h) => {
    expect(() => guard.canActivate(ctx(cls, h, 'SDR'))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx(cls, h, 'GESTOR'))).toThrow(ForbiddenException);
    expect(guard.canActivate(ctx(cls, h, 'ADMIN'))).toBe(true);
  });
});

describe('retenção, backfill e audit', () => {
  it('retenção consulta mandato < hoje-24m e sem interação no período, só não anonimizados', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { contato: { count: jest.fn().mockResolvedValue(0), findMany } };
    const svc = new LgpdService(prisma as unknown as PrismaService, {} as SupressaoService, {} as AuditService);
    const agora = new Date('2026-11-21T12:00:00Z');
    const r = await svc.retencao({ page: 2, pageSize: 10 }, agora);
    const where = findMany.mock.calls[0][0].where;
    expect(where.anonimizadoEm).toBeNull();
    expect(where.mandatoFim.lt.toISOString()).toBe(corteRetencao(agora).toISOString());
    expect(corteRetencao(agora).getUTCFullYear()).toBe(2024);
    expect(where.interacoes.none.data.gte).toEqual(where.mandatoFim.lt);
    expect(findMany.mock.calls[0][0]).toMatchObject({ skip: 10, take: 10 });
    expect(r.itens).toEqual([]);
  });

  it('backfill é idempotente: usa createMany skipDuplicates e conta só os novos', async () => {
    const createMany = jest.fn().mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 0 });
    const prisma = {
      contato: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'a', email: 'a@x.com', telefone: '11999998888', whatsapp: null, anonimizadoEm: null }])
          .mockResolvedValueOnce([]),
      },
      supressaoContato: { createMany },
    };
    const audit = { registrar: jest.fn() };
    const svc = new LgpdService(prisma as unknown as PrismaService, supressaoReal(prisma), audit as unknown as AuditService);
    expect(await svc.backfillSupressao('adm')).toEqual({ contatos: 1, novos: 2 });
    expect(createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it('período "ate" só com data inclui o dia inteiro (Brasília)', () => {
    const p = limitesPeriodo('2026-11-01', '2026-11-02')!;
    expect(p.gte).toEqual(new Date('2026-11-01T03:00:00.000Z'));
    expect(p.lt).toEqual(new Date('2026-11-03T03:00:00.000Z'));
  });

  it('AuditService grava o IP do contexto da requisição (null fora dela)', async () => {
    const create = jest.fn();
    const audit = new AuditService({ auditLog: { create } } as unknown as PrismaService);
    await executarComIp('203.0.113.9', () => audit.registrar({ usuarioId: 'u', acao: 'X', entidade: 'Y' }));
    await audit.registrar({ usuarioId: 'u', acao: 'X', entidade: 'Y' });
    expect(create.mock.calls[0][0].data.ip).toBe('203.0.113.9');
    expect(create.mock.calls[1][0].data.ip).toBeNull();
  });
});
