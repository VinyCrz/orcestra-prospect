import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdiarTarefaInput,
  AgendaPainelQuery,
  AtualizarTarefaInput,
  CriarTarefaInput,
  FaseTarefa,
  ListarTarefasQuery,
} from '@orcestra/shared';
import { Prisma } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { AuditService } from '../common/audit.service';
import { inicioDoDiaSP, limitesAgenda, somarDias } from '../common/fuso';
import { concluirInscricaoSeCompleta } from '../cadencias/encerramento';
import { PrismaService } from '../prisma/prisma.service';
import { agruparAgenda } from './agenda';

const SELECT_TAREFA = {
  id: true,
  titulo: true,
  descricao: true,
  vencimento: true,
  fase: true,
  prioridade: true,
  concluida: true,
  concluidaEm: true,
  adiadaVezes: true,
  origem: true,
  responsavelId: true,
  empresaJuniorId: true,
  contatoId: true,
  criadoPorId: true,
  criadoEm: true,
  responsavel: { select: { id: true, nome: true } },
  colaboradores: { orderBy: [{ nome: 'asc' }, { id: 'asc' }], select: { id: true, nome: true } },
  subtarefas: { orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }], select: { id: true, titulo: true, concluida: true } },
  empresaJunior: { select: { id: true, nome: true, uf: true } },
} satisfies Prisma.TarefaSelect;

const gestor = (u: UsuarioAutenticado) => u.papel !== 'SDR';
const LIMITE_AGENDA = 500;

/** Nova data de vencimento ao adiar: `dias` contam a partir de max(vencimento, hoje). */
export function calcularAdiamento(
  vencimento: Date,
  input: AdiarTarefaInput,
  agora = new Date(),
): Date {
  const hoje = inicioDoDiaSP(agora);
  if (input.novaData) {
    if (input.novaData.getTime() < hoje.getTime())
      throw new BadRequestException('A nova data não pode estar no passado');
    return input.novaData;
  }
  const base = vencimento.getTime() > hoje.getTime() ? vencimento : hoje;
  return somarDias(base, input.dias!);
}

@Injectable()
export class TarefasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listar(q: ListarTarefasQuery, u: UsuarioAutenticado) {
    const where: Prisma.TarefaWhereInput = {
      ...(q.empresaJuniorId ? { empresaJuniorId: q.empresaJuniorId } : {}),
      ...(q.concluida !== undefined ? { concluida: q.concluida } : {}),
      ...(q.origem ? { origem: q.origem } : {}),
    };
    // sem filtro de EJ: só as do usuário; com EJ: de todos os responsáveis (salvo se pedir um)
    if (q.responsavelId || !q.empresaJuniorId) where.responsavelId = this.responsavelAlvo(q.responsavelId, u);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.tarefa.count({ where }),
      this.prisma.tarefa.findMany({
        where,
        orderBy: [{ concluida: 'asc' }, { vencimento: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: SELECT_TAREFA,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) };
  }

  async agenda(responsavelId: string | undefined, u: UsuarioAutenticado, agora = new Date()) {
    const alvo = this.responsavelAlvo(responsavelId, u);
    const { fimProximos7 } = limitesAgenda(agora);
    const tarefas = await this.prisma.tarefa.findMany({
      where: { responsavelId: alvo, concluida: false, vencimento: { lt: fimProximos7 } },
      orderBy: [{ vencimento: 'asc' }, { id: 'asc' }],
      take: LIMITE_AGENDA,
      select: SELECT_TAREFA,
    });
    const g = agruparAgenda(
      tarefas.flatMap((t) => t.vencimento ? [{ ...t, vencimento: t.vencimento }] : []),
      agora,
    );
    return {
      responsavelId: alvo,
      geradoEm: agora,
      atrasadas: g.atrasadas,
      hoje: g.hoje,
      proximos7Dias: g.proximos7Dias,
    };
  }

  async painel(q: AgendaPainelQuery, u: UsuarioAutenticado) {
    const alvo = this.responsavelAlvo(q.responsavelId, u);
    const where: Prisma.TarefaWhereInput = {
      OR: [{ responsavelId: alvo }, { colaboradores: { some: { id: alvo } } }],
      ...(q.inicio && q.fim ? { vencimento: { gte: q.inicio, lt: q.fim } } : {}),
    };
    const items = await this.prisma.tarefa.findMany({
      where,
      orderBy: [{ vencimento: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize + 1,
      select: SELECT_TAREFA,
    });
    return {
      items: items.slice(0, q.pageSize).map((t) => ({
        ...t,
        podeEditar: gestor(u) || t.responsavelId === u.id || t.criadoPorId === u.id,
      })),
      temMais: items.length > q.pageSize,
    };
  }

  async contador(u: UsuarioAutenticado, agora = new Date()) {
    const { hoje, amanha } = limitesAgenda(agora);
    const base = { responsavelId: u.id, concluida: false };
    const [atrasadas, doDia] = await Promise.all([
      this.prisma.tarefa.count({ where: { ...base, vencimento: { lt: hoje } } }),
      this.prisma.tarefa.count({ where: { ...base, vencimento: { gte: hoje, lt: amanha } } }),
    ]);
    return { atrasadas, hoje: doDia };
  }

  async criar(input: CriarTarefaInput, u: UsuarioAutenticado) {
    const responsavelId = input.responsavelId ?? u.id;
    if (responsavelId !== u.id && !gestor(u))
      throw new ForbiddenException('SDR só cria tarefas para si mesmo');
    const resp = await this.prisma.usuario.findUnique({ where: { id: responsavelId }, select: { ativo: true } });
    if (!resp?.ativo) throw new BadRequestException('Responsável inexistente ou inativo');
    if (input.empresaJuniorId) await this.validarVinculos(input.empresaJuniorId, input.contatoId);
    else if (input.contatoId) throw new BadRequestException('Informe a empresa júnior do contato');

    return this.prisma.$transaction(async (tx) => {
      const colaboradores = await this.validarColaboradores(tx, input.colaboradorIds ?? [], responsavelId);
      const t = await tx.tarefa.create({
        data: {
          titulo: input.titulo,
          descricao: input.descricao ?? null,
          vencimento: input.vencimento,
          fase: input.fase,
          prioridade: input.prioridade,
          colaboradores: { connect: colaboradores },
          responsavelId,
          criadoPorId: u.id,
          empresaJuniorId: input.empresaJuniorId ?? null,
          contatoId: input.contatoId ?? null,
        },
        select: SELECT_TAREFA,
      });
      await this.registrar(tx, u, 'TAREFA_CRIADA', t.id, null, { responsavelId, vencimento: t.vencimento }, t.empresaJuniorId);
      return t;
    });
  }

  async atualizar(id: string, input: AtualizarTarefaInput, u: UsuarioAutenticado) {
    const atual = await this.obterEditavel(id, u);
    const { colaboradorIds, ...campos } = input;
    if (input.vencimento === null && atual.origem !== 'MANUAL')
      throw new BadRequestException('Esta tarefa precisa de uma data de vencimento');
    if (input.responsavelId && input.responsavelId !== atual.responsavelId) {
      if (!gestor(u)) throw new ForbiddenException('Somente GESTOR/ADMIN reatribuem tarefas');
      const resp = await this.prisma.usuario.findUnique({ where: { id: input.responsavelId }, select: { ativo: true } });
      if (!resp?.ativo) throw new BadRequestException('Responsável inexistente ou inativo');
    }
    return this.prisma.$transaction(async (tx) => {
      const colaboradores = colaboradorIds === undefined
        ? undefined
        : await this.validarColaboradores(tx, colaboradorIds, input.responsavelId ?? atual.responsavelId);
      const t = await tx.tarefa.update({
        where: { id, responsavelId: atual.responsavelId },
        data: {
          ...campos,
          colaboradores: colaboradores
            ? { set: colaboradores }
            : input.responsavelId && input.responsavelId !== atual.responsavelId
              ? { disconnect: { id: input.responsavelId } }
              : undefined,
        },
        select: SELECT_TAREFA,
      });
      await this.registrar(
        tx, u, 'TAREFA_EDITADA', id,
        { vencimento: atual.vencimento, responsavelId: atual.responsavelId },
        { vencimento: t.vencimento, responsavelId: t.responsavelId },
        atual.empresaJuniorId,
      );
      return t;
    });
  }

  async mover(id: string, fase: FaseTarefa, u: UsuarioAutenticado) {
    const atual = await this.obterEditavel(id, u);
    if (fase === atual.fase) return;
    if (atual.canceladaEm && atual.origem !== 'MANUAL')
      throw new ConflictException('Tarefa automática cancelada não pode mudar de fase');
    if (atual.concluida && atual.inscricaoCadenciaId) {
      const inscricao = await this.prisma.inscricaoCadencia.findUnique({
        where: { id: atual.inscricaoCadenciaId },
        select: { status: true },
      });
      if (inscricao && inscricao.status !== 'ATIVA')
        throw new ConflictException('A cadência desta tarefa já foi encerrada/concluída');
    }
    const concluida = fase === 'REALIZADA' || fase === 'NAO_REALIZADA';
    const agora = new Date();
    await this.prisma.$transaction(async (tx) => {
      const alteradas = await tx.tarefa.updateMany({
        where: { id, fase: atual.fase, responsavelId: atual.responsavelId },
        data: {
          fase,
          concluida,
          concluidaEm: fase === 'REALIZADA' ? agora : null,
          canceladaEm: fase === 'NAO_REALIZADA' ? agora : null,
        },
      });
      if (!alteradas.count) throw new ConflictException('A tarefa mudou. Atualize o quadro e tente de novo');
      const acao = fase === 'REALIZADA' ? 'TAREFA_CONCLUIDA' : 'TAREFA_FASE_ALTERADA';
      await this.registrar(tx, u, acao, id, { fase: atual.fase }, { fase }, atual.empresaJuniorId);
      if (concluida) await concluirInscricaoSeCompleta(tx, atual.inscricaoCadenciaId, u.id);
    });
  }

  async criarSubtarefa(id: string, titulo: string, u: UsuarioAutenticado) {
    await this.obterEditavel(id, u, true);
    return this.prisma.subtarefa.create({ data: { tarefaId: id, titulo } });
  }

  async concluirSubtarefa(id: string, subtarefaId: string, concluida: boolean, u: UsuarioAutenticado) {
    await this.obterEditavel(id, u, true);
    const r = await this.prisma.subtarefa.updateMany({ where: { id: subtarefaId, tarefaId: id }, data: { concluida } });
    if (!r.count) throw new NotFoundException('Subtarefa não encontrada');
  }

  async concluir(id: string, u: UsuarioAutenticado) {
    const atual = await this.obterEditavel(id, u);
    if (atual.concluida) return this.prisma.tarefa.findUniqueOrThrow({ where: { id }, select: SELECT_TAREFA });
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.tarefa.update({
        where: { id },
        data: { concluida: true, concluidaEm: new Date() },
        select: SELECT_TAREFA,
      });
      await this.registrar(tx, u, 'TAREFA_CONCLUIDA', id, { concluida: false }, { concluida: true }, atual.empresaJuniorId);
      await concluirInscricaoSeCompleta(tx, atual.inscricaoCadenciaId, u.id);
      return t;
    });
  }

  async reabrir(id: string, u: UsuarioAutenticado) {
    const atual = await this.obterEditavel(id, u);
    if (!atual.concluida) return this.prisma.tarefa.findUniqueOrThrow({ where: { id }, select: SELECT_TAREFA });
    if (atual.canceladaEm) throw new ConflictException('Tarefa cancelada (cadência encerrada) não pode ser reaberta');
    if (atual.inscricaoCadenciaId) {
      const insc = await this.prisma.inscricaoCadencia.findUnique({
        where: { id: atual.inscricaoCadenciaId },
        select: { status: true },
      });
      if (insc && insc.status !== 'ATIVA')
        throw new ConflictException('A cadência desta tarefa já foi encerrada/concluída');
    }
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.tarefa.update({
        where: { id },
        data: { concluida: false, concluidaEm: null },
        select: SELECT_TAREFA,
      });
      await this.registrar(tx, u, 'TAREFA_REABERTA', id, { concluida: true }, { concluida: false }, atual.empresaJuniorId);
      return t;
    });
  }

  async adiar(id: string, input: AdiarTarefaInput, u: UsuarioAutenticado) {
    const atual = await this.obterEditavel(id, u);
    if (atual.concluida) throw new BadRequestException('Tarefa concluída não pode ser adiada; reabra antes');
    const vencimento = calcularAdiamento(atual.vencimento ?? inicioDoDiaSP(new Date()), input);
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.tarefa.update({
        where: { id },
        data: { vencimento, adiadaVezes: { increment: 1 } },
        select: SELECT_TAREFA,
      });
      await this.registrar(tx, u, 'TAREFA_ADIADA', id, { vencimento: atual.vencimento }, { vencimento }, atual.empresaJuniorId);
      return t;
    });
  }

  async excluir(id: string, u: UsuarioAutenticado) {
    const atual = await this.obterEditavel(id, u);
    await this.prisma.$transaction(async (tx) => {
      await tx.tarefa.delete({ where: { id } });
      await this.registrar(tx, u, 'TAREFA_EXCLUIDA', id, { titulo: atual.titulo, origem: atual.origem }, null, atual.empresaJuniorId);
    });
  }

  // ---------------------------------------------------------------------------------------------

  /** Responsável cujas tarefas serão lidas: o próprio usuário; GESTOR/ADMIN podem consultar outro. */
  private responsavelAlvo(pedido: string | undefined, u: UsuarioAutenticado): string {
    if (!pedido || pedido === u.id) return u.id;
    if (!gestor(u)) throw new ForbiddenException('Somente GESTOR/ADMIN veem a agenda de outro usuário');
    return pedido;
  }

  /** Responsável, criador, GESTOR ou ADMIN. */
  private async obterEditavel(id: string, u: UsuarioAutenticado, aceitaColaborador = false) {
    const t = await this.prisma.tarefa.findUnique({
      where: { id },
      include: { colaboradores: { where: { id: u.id }, select: { id: true } } },
    });
    if (!t) throw new NotFoundException('Tarefa não encontrada');
    if (!gestor(u) && t.responsavelId !== u.id && t.criadoPorId !== u.id && !(aceitaColaborador && t.colaboradores.length))
      throw new ForbiddenException('Você não pode alterar esta tarefa');
    return t;
  }

  private async validarColaboradores(tx: Prisma.TransactionClient, ids: string[], responsavelId: string) {
    const unicos = [...new Set(ids)].filter((id) => id !== responsavelId);
    if (!unicos.length) return [];
    const usuarios = await tx.usuario.findMany({ where: { id: { in: unicos }, ativo: true }, select: { id: true } });
    if (usuarios.length !== unicos.length) throw new BadRequestException('Há colaboradores inexistentes ou inativos');
    return usuarios;
  }

  private async validarVinculos(ejId: string, contatoId?: string | null) {
    const ej = await this.prisma.empresaJunior.findUnique({ where: { id: ejId }, select: { id: true } });
    if (!ej) throw new BadRequestException('Empresa Júnior não encontrada');
    if (contatoId) {
      const c = await this.prisma.contato.findUnique({ where: { id: contatoId }, select: { empresaJuniorId: true } });
      if (!c || c.empresaJuniorId !== ejId) throw new BadRequestException('Contato não pertence a esta Empresa Júnior');
    }
  }

  private registrar(
    tx: Prisma.TransactionClient,
    u: UsuarioAutenticado,
    acao: string,
    id: string,
    antes: unknown,
    depois: unknown,
    empresaJuniorId: string | null,
  ) {
    return this.audit.registrar(
      {
        usuarioId: u.id,
        acao,
        entidade: 'Tarefa',
        entidadeId: id,
        dados: { empresaJuniorId, antes, depois } as Prisma.InputJsonObject,
      },
      tx,
    );
  }
}
