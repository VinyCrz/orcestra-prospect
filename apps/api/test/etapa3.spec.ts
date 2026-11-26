import { BadRequestException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import type { UsuarioAutenticado } from '../src/auth/auth.types';
import type { AuditService } from '../src/common/audit.service';
import { AlertasService, chaveMandato } from '../src/alertas/alertas.service';
import { camposDoStatus } from '../src/funil/status.regras';
import { StatusService } from '../src/funil/status.service';
import { InteracoesService } from '../src/interacoes/interacoes.service';
import { paginarEventos, type EventoTimeline } from '../src/interacoes/timeline.service';
import type { ScoreService } from '../src/score/score.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { agruparAgenda } from '../src/tarefas/agenda';
import { calcularAdiamento } from '../src/tarefas/tarefas.service';

const sdr: UsuarioAutenticado = { id: 'sdr1', email: 's@x.com', nome: 'SDR', papel: 'SDR' };
const gestor: UsuarioAutenticado = { id: 'g1', email: 'g@x.com', nome: 'G', papel: 'GESTOR' };

describe('regras de status do funil', () => {
  it('PERDIDA sem motivo = 400; NUTRICAO sem data = 400', () => {
    expect(() => camposDoStatus({ status: 'PERDIDA' })).toThrow(BadRequestException);
    expect(() => camposDoStatus({ status: 'NUTRICAO' })).toThrow(BadRequestException);
  });

  it('limpa campos de perda/nutrição fora do status correspondente', () => {
    const p = camposDoStatus({ status: 'PERDIDA', motivoPerdaId: 'm1', motivoPerdaDetalhe: 'x', dataRetornoNutricao: '2026-12-01' });
    expect(p).toMatchObject({ motivoPerdaId: 'm1', motivoPerdaDetalhe: 'x', dataRetornoNutricao: null });
    const n = camposDoStatus({ status: 'NUTRICAO', dataRetornoNutricao: '2026-12-01', motivoPerdaId: 'm1' });
    expect(n.motivoPerdaId).toBeNull();
    expect(n.dataRetornoNutricao?.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    const e = camposDoStatus({ status: 'EM_CONVERSA', motivoPerdaId: 'm1' });
    expect(e).toMatchObject({ motivoPerdaId: null, motivoPerdaDetalhe: null, dataRetornoNutricao: null });
  });

  function montar(motivoAtivo = true) {
    const tx = {
      motivoPerda: { findUnique: jest.fn().mockResolvedValue({ ativo: motivoAtivo }) },
      empresaJunior: { updateMany: jest.fn() },
      historicoStatus: { createMany: jest.fn() },
      inscricaoCadencia: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const audit = { registrarVarios: jest.fn() } as unknown as AuditService;
    return { tx, audit, svc: new StatusService({} as PrismaService, audit) };
  }
  const ej = (statusProspeccao: 'EM_CONVERSA' | 'PERDIDA' = 'EM_CONVERSA') => ({
    id: 'e1',
    statusProspeccao,
    motivoPerdaId: statusProspeccao === 'PERDIDA' ? 'm1' : null,
    motivoPerdaDetalhe: null,
    dataRetornoNutricao: null,
  });

  it('grava HistoricoStatus, statusAlteradoEm e AuditLog ao mudar', async () => {
    const { tx, audit, svc } = montar();
    const r = await svc.aplicarEmLote(tx as never, [ej()], { status: 'PERDIDA', motivoPerdaId: 'm1' }, gestor, 'kanban');
    expect(r).toEqual({ alteradas: 1, semMudanca: 0 });
    expect(tx.historicoStatus.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ empresaJuniorId: 'e1', de: 'EM_CONVERSA', para: 'PERDIDA', motivoPerdaId: 'm1', usuarioId: 'g1' })],
    });
    expect(tx.empresaJunior.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ statusProspeccao: 'PERDIDA', statusAlteradoEm: expect.any(Date) }) }),
    );
    expect((audit.registrarVarios as jest.Mock).mock.calls[0][0][0]).toMatchObject({ acao: 'EJ_STATUS_ALTERADO' });
  });

  it('motivo inativo = 400; mesmo status sem mudança não grava histórico', async () => {
    const a = montar(false);
    await expect(
      a.svc.aplicarEmLote(a.tx as never, [ej()], { status: 'PERDIDA', motivoPerdaId: 'm1' }, gestor, 'massa'),
    ).rejects.toBeInstanceOf(BadRequestException);
    const b = montar();
    const r = await b.svc.aplicarEmLote(b.tx as never, [ej()], { status: 'EM_CONVERSA' }, gestor, 'massa');
    expect(r).toEqual({ alteradas: 0, semMudanca: 1 });
    expect(b.tx.historicoStatus.createMany).not.toHaveBeenCalled();
  });

  it('ao sair de PERDIDA os campos de perda são limpos', async () => {
    const { tx, svc } = montar();
    await svc.aplicarEmLote(tx as never, [ej('PERDIDA')], { status: 'EM_CONVERSA' }, gestor, 'kanban');
    expect(tx.empresaJunior.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ motivoPerdaId: null, motivoPerdaDetalhe: null }) }),
    );
  });
});

describe('agenda por fuso America/Sao_Paulo', () => {
  // 2026-11-20 15:00Z = 12:00 em São Paulo; o dia civil de SP vai de 11-20T03:00Z a 11-21T03:00Z
  const agora = new Date('2026-11-20T15:00:00Z');
  const t = (id: string, iso: string) => ({ id, vencimento: new Date(iso) });

  it('agrupa em atrasadas, hoje e próximos 7 dias', () => {
    const g = agruparAgenda(
      [
        t('ontem-noite', '2026-11-20T02:59:00Z'), // 19/11 23:59 em SP -> atrasada (em UTC já seria "hoje")
        t('hoje-inicio', '2026-11-20T03:00:00Z'),
        t('hoje-fim', '2026-11-21T02:30:00Z'), // 20/11 23:30 em SP -> hoje (em UTC seria amanhã)
        t('amanha', '2026-11-21T03:00:00Z'),
        t('dia7', '2026-11-28T02:59:00Z'), // 27/11 23:59 SP -> último dia da janela
        t('dia8', '2026-11-28T03:00:00Z'),
      ],
      agora,
    );
    expect(g.atrasadas.map((x) => x.id)).toEqual(['ontem-noite']);
    expect(g.hoje.map((x) => x.id)).toEqual(['hoje-inicio', 'hoje-fim']);
    expect(g.proximos7Dias.map((x) => x.id)).toEqual(['amanha', 'dia7']);
  });

  it('adiar: dias contam de max(vencimento, hoje); data no passado = 400', () => {
    const atrasada = new Date('2026-11-10T03:00:00Z');
    expect(calcularAdiamento(atrasada, { dias: 2 }, agora).toISOString()).toBe('2026-11-22T03:00:00.000Z');
    const futura = new Date('2026-11-25T03:00:00Z');
    expect(calcularAdiamento(futura, { dias: 1 }, agora).toISOString()).toBe('2026-11-26T03:00:00.000Z');
    expect(() => calcularAdiamento(futura, { novaData: new Date('2026-11-01T03:00:00Z') }, agora)).toThrow(BadRequestException);
  });
});

describe('job de alertas', () => {
  const agora = new Date('2026-11-20T09:00:00Z');
  function montar() {
    const chaves = new Set<string>();
    const prisma = {
      contato: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'c1', nome: 'A', mandatoFim: new Date('2026-12-10T00:00:00Z'), empresaJuniorId: 'e1', empresaJunior: { nome: 'EJ 1', responsavel: { id: 'u1', ativo: true } } },
          { id: 'c2', nome: 'B', mandatoFim: new Date('2026-12-11T00:00:00Z'), empresaJuniorId: 'e2', empresaJunior: { nome: 'EJ 2', responsavel: null } },
        ]),
      },
      empresaJunior: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'e3', nome: 'EJ 3', dataRetornoNutricao: new Date('2026-11-18T00:00:00Z'), responsavel: { id: 'u1', ativo: true } },
        ]),
      },
      tarefa: {
        createMany: jest.fn(async ({ data }: { data: { chaveIdempotencia: string }[] }) => {
          let count = 0;
          for (const d of data) {
            if (chaves.has(d.chaveIdempotencia)) continue;
            chaves.add(d.chaveIdempotencia);
            count++;
          }
          return { count };
        }),
      },
    } as unknown as PrismaService;
    return { prisma, chaves, svc: new AlertasService(prisma) };
  }

  it('cria tarefas, pula EJ sem responsável e é idempotente', async () => {
    const { svc, chaves, prisma } = montar();
    const r1 = await svc.executar(agora);
    expect(r1.mandato).toMatchObject({ candidatos: 2, criadas: 1, semResponsavel: 1 });
    expect(r1.nutricao).toMatchObject({ candidatos: 1, criadas: 1, semResponsavel: 0 });
    expect(chaves.has(chaveMandato('c1', new Date('2026-12-10T00:00:00Z')))).toBe(true);
    const r2 = await svc.executar(agora);
    expect(r2.mandato).toMatchObject({ criadas: 0, jaExistentes: 1 });
    expect(r2.nutricao).toMatchObject({ criadas: 0, jaExistentes: 1 });
    expect(chaves.size).toBe(2);
    expect((prisma.tarefa.createMany as jest.Mock).mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it('consulta só contatos sem opt-out/anonimização e EJs em NUTRICAO', async () => {
    const { svc, prisma } = montar();
    await svc.executar(agora);
    const where = (prisma.contato.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where).toMatchObject({ optOut: false, anonimizadoEm: null });
    expect((prisma.empresaJunior.findMany as jest.Mock).mock.calls[0][0].where.statusProspeccao).toBe('NUTRICAO');
  });
});

describe('interações', () => {
  function montar(contato: object | null = null, ejResp = 'sdr1', status = 'NAO_TRABALHADA') {
    const tarefaCreate = jest.fn().mockResolvedValue({ id: 't1' });
    const interacaoCreate = jest.fn().mockImplementation(async ({ data }) => ({ id: 'i1', ...data }));
    const tx = {
      tarefa: { create: tarefaCreate },
      interacao: { create: interacaoCreate },
      inscricaoCadencia: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = {
      empresaJunior: {
        findUnique: jest.fn().mockResolvedValue({ id: 'e1', nome: 'EJ 1', responsavelId: ejResp, statusProspeccao: status }),
      },
      contato: { findUnique: jest.fn().mockResolvedValue(contato) },
      $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
    } as unknown as PrismaService;
    const audit = { registrar: jest.fn() } as unknown as AuditService;
    return { svc: new InteracoesService(prisma, audit, { recalcularEj: jest.fn() } as unknown as ScoreService), tarefaCreate, interacaoCreate, audit };
  }
  const base = { canal: 'EMAIL', resumo: 'Conversa', resultado: 'RESPONDEU' } as const;

  it('próximo passo com data cria Tarefa (origem INTERACAO) e vincula; sugere status sem alterá-lo', async () => {
    const { svc, tarefaCreate, interacaoCreate } = montar();
    const venc = new Date('2026-11-25T03:00:00Z');
    const r = await svc.criar('e1', { ...base, proximoPasso: 'Enviar proposta', proximoPassoData: venc }, sdr);
    expect(tarefaCreate.mock.calls[0][0].data).toMatchObject({
      origem: 'INTERACAO', responsavelId: 'sdr1', vencimento: venc, titulo: 'Enviar proposta', empresaJuniorId: 'e1',
    });
    expect(interacaoCreate.mock.calls[0][0].data.tarefaId).toBe('t1');
    expect(r.sugestaoStatus).toEqual({ de: 'NAO_TRABALHADA', para: 'PRIMEIRO_CONTATO' });
  });

  it('sem data não cria tarefa; EM_CONVERSA não gera sugestão', async () => {
    const { svc, tarefaCreate } = montar(null, 'sdr1', 'EM_CONVERSA');
    const r = await svc.criar('e1', base, sdr);
    expect(tarefaCreate).not.toHaveBeenCalled();
    expect(r.sugestaoStatus).toBeNull();
  });

  it('contato em opt-out = 422 e nada é gravado', async () => {
    const { svc, interacaoCreate } = montar({ empresaJuniorId: 'e1', optOut: true, anonimizadoEm: null });
    await expect(svc.criar('e1', { ...base, contatoId: 'c1' }, sdr)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(interacaoCreate).not.toHaveBeenCalled();
  });

  it('SDR fora da carteira = 403; GESTOR pode', async () => {
    const { svc } = montar(null, 'outro');
    await expect(svc.criar('e1', base, sdr)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.criar('e1', base, gestor)).resolves.toBeDefined();
  });
});

describe('timeline', () => {
  it('mescla fontes em ordem decrescente e pagina', () => {
    const ev = (id: string, iso: string): EventoTimeline => ({ id, tipo: 'INTERACAO', data: new Date(iso), usuario: null, detalhes: {} });
    const a = [ev('a1', '2026-01-05T00:00:00Z'), ev('a2', '2026-01-01T00:00:00Z')];
    const b = [ev('b1', '2026-01-04T00:00:00Z'), ev('b2', '2026-01-03T00:00:00Z')];
    expect(paginarEventos([a, b], 1, 3).map((e) => e.id)).toEqual(['a1', 'b1', 'b2']);
    expect(paginarEventos([a, b], 2, 3).map((e) => e.id)).toEqual(['a2']);
  });
});

describe('botão Prospectar', () => {
  function montar(ej: { responsavelId: string | null; statusProspeccao: string }, count = 1) {
    const base = { id: 'e1', motivoPerdaId: null, motivoPerdaDetalhe: null, dataRetornoNutricao: null, ...ej };
    const tx = {
      empresaJunior: { updateMany: jest.fn().mockResolvedValue({ count }) },
      historicoStatus: { createMany: jest.fn() },
      inscricaoCadencia: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = {
      empresaJunior: {
        findUnique: jest.fn().mockResolvedValue({ ...base, responsavel: ej.responsavelId ? { nome: 'Ana' } : null }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ statusProspeccao: 'PRIMEIRO_CONTATO', responsavel: null }),
      },
      $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    };
    const audit = { registrar: jest.fn(), registrarVarios: jest.fn() } as unknown as AuditService;
    return { tx, audit, svc: new StatusService(prisma as unknown as PrismaService, audit) };
  }

  it('EJ sem responsável: vira do SDR e entra em PRIMEIRO_CONTATO', async () => {
    const { tx, audit, svc } = montar({ responsavelId: null, statusProspeccao: 'NAO_TRABALHADA' });
    const r = await svc.prospectar('e1', sdr);
    expect(r).toMatchObject({ assumiu: true, entrouNoFunil: true });
    expect(tx.empresaJunior.updateMany).toHaveBeenCalledWith({
      where: { id: 'e1', responsavelId: null },
      data: { responsavelId: 'sdr1' },
    });
    expect(tx.historicoStatus.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ de: 'NAO_TRABALHADA', para: 'PRIMEIRO_CONTATO' })],
    });
    expect(audit.registrar).toHaveBeenCalledWith(expect.objectContaining({ acao: 'EJ_PROSPECTADA' }), tx);
  });

  it('SDR não pega EJ da carteira de outra pessoa', async () => {
    const { svc } = montar({ responsavelId: 'outro', statusProspeccao: 'NAO_TRABALHADA' });
    await expect(svc.prospectar('e1', sdr)).rejects.toThrow(ForbiddenException);
  });

  it('já mais à frente no funil: não muda o status', async () => {
    const { tx, svc } = montar({ responsavelId: 'sdr1', statusProspeccao: 'EM_CONVERSA' });
    const r = await svc.prospectar('e1', sdr);
    expect(r).toMatchObject({ assumiu: false, entrouNoFunil: false });
    expect(tx.empresaJunior.updateMany).not.toHaveBeenCalled();
  });

  it('dois cliques ao mesmo tempo: o segundo recebe conflito', async () => {
    const { svc } = montar({ responsavelId: null, statusProspeccao: 'NAO_TRABALHADA' }, 0);
    await expect(svc.prospectar('e1', gestor)).rejects.toThrow('Outra pessoa acabou de pegar esta EJ');
  });
});
