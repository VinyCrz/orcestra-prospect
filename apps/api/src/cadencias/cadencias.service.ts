import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CANAL_INTERACAO_LABEL,
  type AtualizarCadenciaInput,
  type CanalInteracao,
  type CriarCadenciaInput,
  type EncerrarInscricaoInput,
  type InscreverInput,
  type ListarCadenciasQuery,
  type ListarInscricoesQuery,
  type PassoCadenciaInput,
} from '@orcestra/shared';
import { Prisma } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { AuditService, type RegistroAudit } from '../common/audit.service';
import { inicioDoDiaSP, somarDias } from '../common/fuso';
import { exigirEdicaoEj } from '../empresas-juniores/permissoes';
import { MOTIVO_EJ_OCULTA } from '../empresas-juniores/visibilidade';
import { PrismaService } from '../prisma/prisma.service';
import { avancouNoFunil, encerrarInscricoes } from './encerramento';

const SELECT_CADENCIA = {
  id: true,
  nome: true,
  chave: true,
  descricao: true,
  ativa: true,
  criadoEm: true,
  atualizadoEm: true,
  passos: {
    orderBy: { ordem: 'asc' },
    select: {
      id: true,
      ordem: true,
      diaOffset: true,
      canal: true,
      templateId: true,
      instrucoes: true,
      template: { select: { id: true, nome: true, ativo: true } },
    },
  },
} satisfies Prisma.CadenciaSelect;

const SELECT_INSCRICAO = {
  id: true,
  empresaJuniorId: true,
  cadenciaId: true,
  contatoId: true,
  responsavelId: true,
  iniciadaEm: true,
  status: true,
  motivoEncerramento: true,
  motivoDetalhe: true,
  encerradaEm: true,
  empresaJunior: { select: { id: true, nome: true, uf: true } },
  cadencia: { select: { id: true, nome: true } },
  contato: { select: { id: true, nome: true } },
  responsavel: { select: { id: true, nome: true } },
} satisfies Prisma.InscricaoCadenciaSelect;

const resumoPassos = (ps: { ordem: number; diaOffset: number; canal: string; templateId: string | null }[]) =>
  ps.map((p) => ({ ordem: p.ordem, diaOffset: p.diaOffset, canal: p.canal, templateId: p.templateId }));

export interface IgnoradaInscricao {
  ejId: string;
  motivo: string;
}

@Injectable()
export class CadenciasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listar(q: ListarCadenciasQuery) {
    const cads = await this.prisma.cadencia.findMany({
      where: q.ativa !== undefined ? { ativa: q.ativa } : {},
      orderBy: [{ nome: 'asc' }],
      select: SELECT_CADENCIA,
    });
    const ativas = await this.prisma.inscricaoCadencia.groupBy({
      by: ['cadenciaId'],
      where: { status: 'ATIVA', cadenciaId: { in: cads.map((c) => c.id) } },
      _count: { _all: true },
    });
    const mapa = new Map(ativas.map((a) => [a.cadenciaId, a._count._all]));
    return cads.map((c) => ({ ...c, inscricoesAtivas: mapa.get(c.id) ?? 0 }));
  }

  async obter(id: string) {
    const c = await this.prisma.cadencia.findUnique({ where: { id }, select: SELECT_CADENCIA });
    if (!c) throw new NotFoundException('Cadência não encontrada');
    return c;
  }

  async criar(input: CriarCadenciaInput, u: UsuarioAutenticado) {
    await this.validarPassos(this.prisma, input.passos, []);
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.cadencia.create({
        data: {
          nome: input.nome,
          descricao: input.descricao ?? null,
          ativa: input.ativa,
          criadoPorId: u.id,
          passos: {
            create: input.passos.map((p, i) => ({
              ordem: i + 1,
              diaOffset: p.diaOffset,
              canal: p.canal,
              templateId: p.templateId,
              instrucoes: p.instrucoes ?? null,
            })),
          },
        },
        select: SELECT_CADENCIA,
      });
      await this.audit.registrar(
        {
          usuarioId: u.id,
          acao: 'CADENCIA_CRIADA',
          entidade: 'Cadencia',
          entidadeId: c.id,
          dados: { antes: null, depois: { nome: c.nome, ativa: c.ativa, passos: resumoPassos(c.passos) } },
        },
        tx,
      );
      return c;
    });
  }

  async atualizar(id: string, input: AtualizarCadenciaInput, u: UsuarioAutenticado) {
    const atual = await this.obter(id);
    if (input.passos) await this.validarPassos(this.prisma, input.passos, atual.passos);
    return this.prisma.$transaction(async (tx) => {
      const dados: Prisma.CadenciaUpdateInput = {};
      if (input.nome !== undefined) dados.nome = input.nome;
      if (input.descricao !== undefined) dados.descricao = input.descricao;
      if (input.ativa !== undefined) dados.ativa = input.ativa;
      if (Object.keys(dados).length) await tx.cadencia.update({ where: { id }, data: dados });

      if (input.passos) {
        const manter = new Set(input.passos.map((p) => p.id).filter(Boolean) as string[]);
        await tx.passoCadencia.deleteMany({ where: { cadenciaId: id, id: { notIn: [...manter] } } });
        // libera as posições (unique cadenciaId+ordem) antes de reordenar
        await tx.passoCadencia.updateMany({ where: { cadenciaId: id }, data: { ordem: { increment: 1000 } } });
        for (const [i, p] of input.passos.entries()) {
          const data = {
            ordem: i + 1,
            diaOffset: p.diaOffset,
            canal: p.canal,
            templateId: p.templateId,
            instrucoes: p.instrucoes ?? null,
          };
          if (p.id) await tx.passoCadencia.update({ where: { id: p.id }, data });
          else await tx.passoCadencia.create({ data: { ...data, cadenciaId: id } });
        }
      }
      const nova = await tx.cadencia.findUniqueOrThrow({ where: { id }, select: SELECT_CADENCIA });
      await this.audit.registrar(
        {
          usuarioId: u.id,
          acao: input.ativa === false && atual.ativa ? 'CADENCIA_DESATIVADA' : 'CADENCIA_EDITADA',
          entidade: 'Cadencia',
          entidadeId: id,
          dados: {
            antes: { nome: atual.nome, ativa: atual.ativa, passos: resumoPassos(atual.passos) },
            depois: { nome: nova.nome, ativa: nova.ativa, passos: resumoPassos(nova.passos) },
          },
        },
        tx,
      );
      return nova;
    });
  }

  /** Canal do template == canal do passo; template existente (e ativo, se novo/trocado). */
  private async validarPassos(
    db: Prisma.TransactionClient | PrismaService,
    passos: PassoCadenciaInput[],
    existentes: { id: string; templateId: string | null }[],
  ) {
    const ids = passos.map((p) => p.id).filter(Boolean) as string[];
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Passos com id repetido');
    const dono = new Map(existentes.map((p) => [p.id, p.templateId]));
    for (const i of ids) if (!dono.has(i)) throw new BadRequestException('Passo não pertence a esta cadência');
    const tplIds = [...new Set(passos.map((p) => p.templateId).filter(Boolean) as string[])];
    const tpls = new Map(
      (await db.templateMensagem.findMany({ where: { id: { in: tplIds } }, select: { id: true, canal: true, ativo: true, nome: true } })).map(
        (t) => [t.id, t],
      ),
    );
    passos.forEach((p, i) => {
      if (!p.templateId) return;
      const t = tpls.get(p.templateId);
      if (!t) throw new BadRequestException(`Passo ${i + 1}: template não encontrado`);
      if (t.canal !== p.canal)
        throw new BadRequestException(
          `Passo ${i + 1}: o canal do template "${t.nome}" (${t.canal}) difere do canal do passo (${p.canal})`,
        );
      const inalterado = p.id && dono.get(p.id) === p.templateId;
      if (!t.ativo && !inalterado) throw new BadRequestException(`Passo ${i + 1}: template "${t.nome}" está inativo`);
    });
  }

  // --- Inscrição ---------------------------------------------------------------------------------

  /**
   * Inscreve EJs numa cadência: uma InscricaoCadencia por EJ e uma Tarefa (origem CADENCIA) por passo,
   * vencimento = início do dia de hoje (America/Sao_Paulo) + diaOffset. Em lote e numa transação.
   * EJs que não podem ser inscritas são devolvidas em `ignoradas` com o motivo.
   */
  async inscrever(cadenciaId: string, input: InscreverInput, u: UsuarioAutenticado, agora = new Date()) {
    const cad = await this.obter(cadenciaId);
    if (!cad.ativa) throw new BadRequestException('Cadência inativa');
    if (!cad.passos.length) throw new BadRequestException('Cadência sem passos');
    const ejIds = [...new Set(input.ejIds)];
    if (input.contatoId && ejIds.length !== 1)
      throw new BadRequestException('contatoId só pode ser usado ao inscrever uma única EJ');

    const [ejs, jaAtivas, contato] = await Promise.all([
      this.prisma.empresaJunior.findMany({
        where: { id: { in: ejIds } },
        select: { id: true, nome: true, responsavelId: true, statusProspeccao: true, temContato: true },
      }),
      this.prisma.inscricaoCadencia.findMany({
        where: { cadenciaId, status: 'ATIVA', empresaJuniorId: { in: ejIds } },
        select: { empresaJuniorId: true },
      }),
      input.contatoId
        ? this.prisma.contato.findUnique({
            where: { id: input.contatoId },
            select: { id: true, empresaJuniorId: true, optOut: true, anonimizadoEm: true },
          })
        : Promise.resolve(null),
    ]);
    if (input.contatoId) {
      if (!contato || contato.empresaJuniorId !== ejIds[0])
        throw new BadRequestException('Contato não pertence a esta Empresa Júnior');
    }
    const porId = new Map(ejs.map((e) => [e.id, e]));
    const ativas = new Set(jaAtivas.map((i) => i.empresaJuniorId));
    const ignoradas: IgnoradaInscricao[] = [];
    const alvo: typeof ejs = [];
    for (const id of ejIds) {
      const ej = porId.get(id);
      let motivo: string | null = null;
      if (!ej) motivo = 'Empresa Júnior não encontrada';
      else if (!ej.temContato) motivo = MOTIVO_EJ_OCULTA;
      else if (u.papel === 'SDR' && ej.responsavelId !== u.id) motivo = 'Fora da sua carteira';
      else if (ej.statusProspeccao === 'PERDIDA') motivo = 'EJ perdida';
      else if (avancouNoFunil(ej.statusProspeccao)) motivo = 'EJ já avançou no funil';
      else if (ativas.has(id)) motivo = 'Já inscrita nesta cadência';
      else if (contato && (contato.optOut || contato.anonimizadoEm)) motivo = 'Contato em opt-out';
      if (motivo) ignoradas.push({ ejId: id, motivo });
      else alvo.push(ej!);
    }
    if (!alvo.length) return { inscritas: 0, ignoradas };

    const base = inicioDoDiaSP(agora);
    try {
      await this.prisma.$transaction(async (tx) => {
        const criadas = await tx.inscricaoCadencia.createManyAndReturn({
          data: alvo.map((ej) => ({
            empresaJuniorId: ej.id,
            cadenciaId,
            contatoId: input.contatoId ?? null,
            responsavelId: ej.responsavelId ?? u.id,
            inscritoPorId: u.id,
            iniciadaEm: agora,
          })),
          select: { id: true, empresaJuniorId: true, responsavelId: true },
        });
        const nomeEj = new Map(alvo.map((e) => [e.id, e.nome]));
        const tarefas: Prisma.TarefaCreateManyInput[] = criadas.flatMap((insc) =>
          cad.passos.map((p) => ({
            titulo: `${cad.nome} · passo ${p.ordem} (${CANAL_INTERACAO_LABEL[p.canal as CanalInteracao] ?? p.canal}) — ${nomeEj.get(insc.empresaJuniorId)}`.slice(0, 200),
            descricao: p.instrucoes,
            vencimento: somarDias(base, p.diaOffset),
            origem: 'CADENCIA' as const,
            responsavelId: insc.responsavelId,
            criadoPorId: u.id,
            empresaJuniorId: insc.empresaJuniorId,
            contatoId: input.contatoId ?? null,
            passoCadenciaId: p.id,
            inscricaoCadenciaId: insc.id,
          })),
        );
        await tx.tarefa.createMany({ data: tarefas });
        const logs: RegistroAudit[] = criadas.map((i) => ({
          usuarioId: u.id,
          acao: 'CADENCIA_INSCRITA',
          entidade: 'InscricaoCadencia',
          entidadeId: i.id,
          dados: {
            empresaJuniorId: i.empresaJuniorId,
            antes: null,
            depois: { cadenciaId, cadencia: cad.nome, contatoId: input.contatoId ?? null, passos: cad.passos.length },
          },
        }));
        await this.audit.registrarVarios(logs, tx);
      });
    } catch (e) {
      // índice único parcial (EJ+cadência ativa): inscrição concorrente
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new ConflictException('Inscrição concorrente detectada; tente novamente');
      throw e;
    }
    return { inscritas: alvo.length, ignoradas };
  }

  async inscricoesDaCadencia(cadenciaId: string, q: ListarInscricoesQuery) {
    await this.obter(cadenciaId);
    return this.paginarInscricoes({ cadenciaId, ...(q.status ? { status: q.status } : {}) }, q);
  }

  async inscricoesDaEj(ejId: string) {
    const ej = await this.prisma.empresaJunior.findUnique({ where: { id: ejId }, select: { id: true } });
    if (!ej) throw new NotFoundException('Empresa Júnior não encontrada');
    const r = await this.paginarInscricoes({ empresaJuniorId: ejId }, { page: 1, pageSize: 100 });
    return r.items;
  }

  private async paginarInscricoes(where: Prisma.InscricaoCadenciaWhereInput, q: { page: number; pageSize: number }) {
    const [total, items] = await this.prisma.$transaction([
      this.prisma.inscricaoCadencia.count({ where }),
      this.prisma.inscricaoCadencia.findMany({
        where,
        orderBy: [{ iniciadaEm: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: SELECT_INSCRICAO,
      }),
    ]);
    // progresso em uma consulta agregada (sem N+1); canceladas não contam
    const prog = items.length
      ? await this.prisma.tarefa.groupBy({
          by: ['inscricaoCadenciaId', 'concluida'],
          where: { inscricaoCadenciaId: { in: items.map((i) => i.id) }, canceladaEm: null },
          _count: { _all: true },
          _min: { vencimento: true },
        })
      : [];
    const mapa = new Map<string, { total: number; concluidos: number; proximoVencimento: Date | null }>();
    for (const g of prog) {
      const k = g.inscricaoCadenciaId!;
      const m = mapa.get(k) ?? { total: 0, concluidos: 0, proximoVencimento: null };
      m.total += g._count._all;
      if (g.concluida) m.concluidos += g._count._all;
      else m.proximoVencimento = g._min.vencimento;
      mapa.set(k, m);
    }
    return {
      items: items.map((i) => ({ ...i, progresso: mapa.get(i.id) ?? { total: 0, concluidos: 0, proximoVencimento: null } })),
      total,
      page: q.page,
      pageSize: q.pageSize,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    };
  }

  async encerrar(id: string, input: EncerrarInscricaoInput, u: UsuarioAutenticado) {
    const insc = await this.prisma.inscricaoCadencia.findUnique({
      where: { id },
      select: { id: true, status: true, empresaJunior: { select: { responsavelId: true } } },
    });
    if (!insc) throw new NotFoundException('Inscrição não encontrada');
    exigirEdicaoEj(u, insc.empresaJunior);
    if (insc.status !== 'ATIVA') throw new ConflictException('Inscrição já encerrada');
    await this.prisma.$transaction((tx) => encerrarInscricoes(tx, { id }, 'MANUAL', u.id, input.detalhe));
    return this.prisma.inscricaoCadencia.findUniqueOrThrow({ where: { id }, select: SELECT_INSCRICAO });
  }
}
