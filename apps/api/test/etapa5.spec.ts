import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import type { UsuarioAutenticado } from '../src/auth/auth.types';
import type { AuditService } from '../src/common/audit.service';
import { CadenciasService } from '../src/cadencias/cadencias.service';
import { avancouNoFunil, ehResposta, encerrarInscricoes } from '../src/cadencias/encerramento';
import { montarLinks, numeroWaMe } from '../src/cadencias/mensagem';
import { MensagemPassoService } from '../src/cadencias/mensagem-passo.service';
import { TemplatesService } from '../src/cadencias/templates.service';
import { StatusService } from '../src/funil/status.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { ScoreService } from '../src/score/score.service';

const sdr: UsuarioAutenticado = { id: 'sdr1', email: 's@x.com', nome: 'Sara SDR', papel: 'SDR' };
const gestor: UsuarioAutenticado = { id: 'g1', email: 'g@x.com', nome: 'G', papel: 'GESTOR' };
const audit = { registrar: jest.fn(), registrarVarios: jest.fn() } as unknown as AuditService;

const passos = [
  { id: 'p1', ordem: 1, diaOffset: 0, canal: 'LINKEDIN', templateId: null, instrucoes: 'conectar', template: null },
  { id: 'p2', ordem: 2, diaOffset: 3, canal: 'WHATSAPP', templateId: 't1', instrucoes: null, template: null },
];
const cadencia = { id: 'c1', nome: 'Gamificação', ativa: true, passos };

function montarInscricao(over: { ejs?: unknown[]; ativas?: unknown[]; contato?: unknown } = {}) {
  const tx = {
    inscricaoCadencia: {
      createManyAndReturn: jest.fn(async ({ data }: { data: { empresaJuniorId: string; responsavelId: string }[] }) =>
        data.map((d, i) => ({ id: `i${i}`, empresaJuniorId: d.empresaJuniorId, responsavelId: d.responsavelId })),
      ),
    },
    tarefa: { createMany: jest.fn() },
  };
  const prisma = {
    cadencia: { findUnique: jest.fn().mockResolvedValue(cadencia) },
    empresaJunior: { findMany: jest.fn().mockResolvedValue(over.ejs ?? []) },
    inscricaoCadencia: { findMany: jest.fn().mockResolvedValue(over.ativas ?? []) },
    contato: { findUnique: jest.fn().mockResolvedValue(over.contato ?? null) },
    $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  return { tx, prisma, svc: new CadenciasService(prisma as unknown as PrismaService, audit) };
}
const ej = (id: string, extra: object = {}) => ({
  id, nome: `EJ ${id}`, responsavelId: 'sdr1', statusProspeccao: 'PESQUISADA', temContato: true, ...extra,
});

describe('inscrição em cadência', () => {
  it('EJ oculta (sem forma de contato) é ignorada com motivo', async () => {
    const { tx, svc } = montarInscricao({ ejs: [ej('oculta', { temContato: false })] });
    const r = await svc.inscrever('c1', { ejIds: ['oculta'] }, gestor);
    expect(r).toEqual({ inscritas: 0, ignoradas: [{ ejId: 'oculta', motivo: 'EJ sem forma de contato' }] });
    expect(tx.tarefa.createMany).not.toHaveBeenCalled();
  });

  it('gera inscrição + uma tarefa por passo com vencimento = hoje(SP) + diaOffset, responsável da EJ', async () => {
    const { tx, svc } = montarInscricao({ ejs: [ej('e1'), ej('e2', { responsavelId: null })] });
    const agora = new Date('2026-11-21T15:00:00Z'); // 12h em SP
    const r = await svc.inscrever('c1', { ejIds: ['e1', 'e2'] }, gestor, agora);
    expect(r).toEqual({ inscritas: 2, ignoradas: [] });
    expect(tx.tarefa.createMany).toHaveBeenCalledTimes(1); // lote único
    const tarefas = tx.tarefa.createMany.mock.calls[0][0].data;
    expect(tarefas).toHaveLength(4);
    const t1 = tarefas.find((t: { empresaJuniorId: string; passoCadenciaId: string }) => t.empresaJuniorId === 'e1' && t.passoCadenciaId === 'p2');
    expect(t1.vencimento.toISOString()).toBe('2026-11-24T03:00:00.000Z');
    expect(t1).toMatchObject({ origem: 'CADENCIA', responsavelId: 'sdr1', inscricaoCadenciaId: 'i0' });
    const semResp = tarefas.find((t: { empresaJuniorId: string }) => t.empresaJuniorId === 'e2');
    expect(semResp.responsavelId).toBe('g1'); // quem inscreveu
    const hoje = tarefas.find((t: { passoCadenciaId: string }) => t.passoCadenciaId === 'p1');
    expect(hoje.vencimento.toISOString()).toBe('2026-11-21T03:00:00.000Z');
  });

  it('pula ativas, PERDIDA, inexistentes e (SDR) fora da carteira', async () => {
    const { tx, svc } = montarInscricao({
      ejs: [ej('ok'), ej('ativa'), ej('perdida', { statusProspeccao: 'PERDIDA' }), ej('alheia', { responsavelId: 'outro' })],
      ativas: [{ empresaJuniorId: 'ativa' }],
    });
    const r = await svc.inscrever('c1', { ejIds: ['ok', 'ativa', 'perdida', 'alheia', 'naoexiste'] }, sdr);
    expect(r.inscritas).toBe(1);
    expect(Object.fromEntries(r.ignoradas.map((i) => [i.ejId, i.motivo]))).toEqual({
      ativa: 'Já inscrita nesta cadência',
      perdida: 'EJ perdida',
      alheia: 'Fora da sua carteira',
      naoexiste: 'Empresa Júnior não encontrada',
    });
    expect(tx.tarefa.createMany.mock.calls[0][0].data).toHaveLength(2);
  });

  it('GESTOR inscreve EJ de outro responsável', async () => {
    const { svc } = montarInscricao({ ejs: [ej('alheia', { responsavelId: 'outro' })] });
    expect((await svc.inscrever('c1', { ejIds: ['alheia'] }, gestor)).inscritas).toBe(1);
  });

  it('contato em opt-out é ignorado; contatoId com várias EJs = 400', async () => {
    const { tx, svc } = montarInscricao({
      ejs: [ej('e1')],
      contato: { id: 'k1', empresaJuniorId: 'e1', optOut: true, anonimizadoEm: null },
    });
    const r = await svc.inscrever('c1', { ejIds: ['e1'], contatoId: 'k1' }, sdr);
    expect(r).toEqual({ inscritas: 0, ignoradas: [{ ejId: 'e1', motivo: 'Contato em opt-out' }] });
    expect(tx.tarefa.createMany).not.toHaveBeenCalled();
    await expect(svc.inscrever('c1', { ejIds: ['e1', 'e2'], contatoId: 'k1' }, sdr)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('validação canal template x passo', () => {
  function montar(tpl: { canal: string; ativo: boolean } | null) {
    const prisma = {
      templateMensagem: { findMany: jest.fn().mockResolvedValue(tpl ? [{ id: 't1', nome: 'T', ...tpl }] : []) },
    };
    return new CadenciasService(prisma as unknown as PrismaService, audit);
  }
  const body = (canal: string) => ({
    nome: 'X', ativa: true,
    passos: [{ diaOffset: 0, canal: canal as 'EMAIL', templateId: 't1', instrucoes: null }],
  });
  it('rejeita canal divergente, template inexistente e inativo', async () => {
    await expect(montar({ canal: 'EMAIL', ativo: true }).criar(body('WHATSAPP'), gestor)).rejects.toThrow(/difere/);
    await expect(montar(null).criar(body('EMAIL'), gestor)).rejects.toThrow(/não encontrado/);
    await expect(montar({ canal: 'EMAIL', ativo: false }).criar(body('EMAIL'), gestor)).rejects.toThrow(/inativo/);
  });
});

describe('encerramento automático', () => {
  it('classifica resposta e avanço de funil', () => {
    expect(['RESPONDEU', 'REUNIAO_MARCADA', 'NAO_INTERESSADO'].every(ehResposta)).toBe(true);
    expect(ehResposta('SEM_RESPOSTA')).toBe(false);
    expect(avancouNoFunil('PRIMEIRO_CONTATO')).toBe(false);
    expect(avancouNoFunil('EM_CONVERSA')).toBe(true);
    expect(avancouNoFunil('PERDIDA')).toBe(true);
  });

  function txEncerrar(ativas: unknown[]) {
    return {
      inscricaoCadencia: { findMany: jest.fn().mockResolvedValue(ativas), updateMany: jest.fn() },
      tarefa: { updateMany: jest.fn() },
      auditLog: { createMany: jest.fn() },
    };
  }
  it.each(['RESPOSTA', 'AVANCO_FUNIL', 'OPT_OUT'] as const)('motivo %s: ENCERRADA + cancela tarefas pendentes', async (motivo) => {
    const tx = txEncerrar([{ id: 'i1', empresaJuniorId: 'e1', cadenciaId: 'c1' }]);
    const n = await encerrarInscricoes(tx as never, { empresaJuniorId: 'e1' }, motivo, 'u1');
    expect(n).toBe(1);
    expect(tx.inscricaoCadencia.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ENCERRADA', motivoEncerramento: motivo, encerradaEm: expect.any(Date) }) }),
    );
    expect(tx.tarefa.updateMany).toHaveBeenCalledWith({
      where: { inscricaoCadenciaId: { in: ['i1'] }, concluida: false },
      data: { concluida: true, canceladaEm: expect.any(Date) },
    });
    expect(tx.auditLog.createMany.mock.calls[0][0].data[0]).toMatchObject({ acao: 'CADENCIA_ENCERRADA', entidade: 'InscricaoCadencia' });
  });
  it('sem inscrições ativas não faz nada', async () => {
    const tx = txEncerrar([]);
    expect(await encerrarInscricoes(tx as never, {}, 'RESPOSTA', null)).toBe(0);
    expect(tx.tarefa.updateMany).not.toHaveBeenCalled();
  });

  it('StatusService encerra por AVANCO_FUNIL só ao avançar além de PRIMEIRO_CONTATO', async () => {
    const mk = () => {
      const tx = {
        motivoPerda: { findUnique: jest.fn() },
        empresaJunior: { updateMany: jest.fn() },
        historicoStatus: { createMany: jest.fn() },
        ...txEncerrar([{ id: 'i1', empresaJuniorId: 'e1', cadenciaId: 'c1' }]),
      };
      return tx;
    };
    const svc = new StatusService({} as PrismaService, audit);
    const e = { id: 'e1', statusProspeccao: 'PESQUISADA' as const, motivoPerdaId: null, motivoPerdaDetalhe: null, dataRetornoNutricao: null };
    const a = mk();
    await svc.aplicarEmLote(a as never, [e], { status: 'PRIMEIRO_CONTATO' }, gestor, 'kanban');
    expect(a.inscricaoCadencia.updateMany).not.toHaveBeenCalled();
    const b = mk();
    await svc.aplicarEmLote(b as never, [e], { status: 'EM_CONVERSA' }, gestor, 'kanban');
    expect(b.inscricaoCadencia.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ motivoEncerramento: 'AVANCO_FUNIL' }) }),
    );
  });
});

describe('mensagem do passo e opt-out', () => {
  const tarefa = (contatoId: string | null) => ({
    id: 't1', concluida: false, responsavelId: 'sdr1', empresaJuniorId: 'e1', contatoId, inscricaoCadenciaId: 'i1',
    passoCadencia: {
      id: 'p2', ordem: 2, canal: 'WHATSAPP', instrucoes: null,
      template: { assunto: null, corpo: 'Oi {{nome_contato}}, sou {{nome_sdr}} da {{nome_ej}}.' },
    },
    inscricaoCadencia: { contatoId: null, cadencia: { nome: 'Gamificação' } },
    empresaJunior: { nome: 'Alfa', cidade: 'Natal', ies: { nome: 'UFRN', cidade: 'Natal' } },
  });
  const contato = (optOut: boolean) => ({
    id: 'k1', nome: 'Ana', cargo: 'PRESIDENTE', cargoDescricao: null, email: 'ana@x.com', telefone: '(84) 99999-1111',
    whatsapp: null, optOut, anonimizadoEm: null, empresaJuniorId: 'e1', principal: true,
  });
  function montar(t: unknown, c: unknown, lista: unknown[] = []) {
    const prisma = {
      tarefa: { findUnique: jest.fn().mockResolvedValue(t) },
      contato: { findUnique: jest.fn().mockResolvedValue(c), findMany: jest.fn().mockResolvedValue(lista) },
    };
    return new MensagemPassoService(prisma as unknown as PrismaService, audit, {} as ScoreService);
  }

  it('renderiza e gera wa.me', async () => {
    const r = await montar(tarefa('k1'), contato(false)).mensagem('t1', sdr);
    expect(r.texto).toBe('Oi Ana, sou Sara SDR da Alfa.');
    expect(r.links.waMe).toBe(`https://wa.me/5584999991111?text=${encodeURIComponent(r.texto)}`);
    expect(r.contato).toMatchObject({ nome: 'Ana', optOut: false });
  });
  it('contato em opt-out = 422 sem links', async () => {
    await expect(montar(tarefa('k1'), contato(true)).mensagem('t1', sdr)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
  it('sem contato disponível = 422; contato padrão = principal sem opt-out', async () => {
    await expect(montar(tarefa(null), null, []).mensagem('t1', sdr)).rejects.toThrow(/contato disponível/);
    const r = await montar(tarefa(null), null, [contato(false)]).mensagem('t1', sdr);
    expect(r.contato.nome).toBe('Ana');
  });
  it('registrar-envio com contato em opt-out é bloqueado', async () => {
    await expect(montar(tarefa('k1'), contato(true)).registrarEnvio('t1', {}, sdr)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
  it('previsualizar com contatoId em opt-out bloqueia; sem ejId usa dados de exemplo', async () => {
    const tpl = { id: 't', canal: 'WHATSAPP', assunto: null, corpo: 'Oi {{nome_contato}} da {{nome_ej}}' };
    const prisma = {
      templateMensagem: { findUnique: jest.fn().mockResolvedValue(tpl) },
      contato: { findUnique: jest.fn().mockResolvedValue(contato(true)) },
    };
    const svc = new TemplatesService(prisma as unknown as PrismaService, audit);
    await expect(svc.previsualizar('t', { contatoId: 'k1' }, sdr)).rejects.toBeInstanceOf(UnprocessableEntityException);
    const r = await svc.previsualizar('t', {}, sdr);
    expect(r.texto).toBe('Oi Maria Silva da Empresa Júnior Exemplo');
  });
});

describe('links', () => {
  it('numeroWaMe e mailto', () => {
    expect(numeroWaMe('(84) 99999-1111')).toBe('5584999991111');
    expect(numeroWaMe('+55 84 99999-1111')).toBe('5584999991111');
    expect(numeroWaMe('123')).toBeNull();
    expect(montarLinks('EMAIL', 'oi', 'Assunto x', { email: 'a@b.com' }).mailto).toBe('mailto:a@b.com?subject=Assunto%20x&body=oi');
    expect(montarLinks('LINKEDIN', 'oi', null, { email: 'a@b.com' })).toEqual({});
  });
});
