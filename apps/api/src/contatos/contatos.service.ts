import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AtualizarContatoInput, CriarContatoInput } from '@orcestra/shared';
import type { Contato, Prisma } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import {
  AuditService,
  diffCampos,
  mascararEmail,
  mascararNome,
  mascararTelefone,
} from '../common/audit.service';
import { encerrarInscricoes } from '../cadencias/encerramento';
import { SupressaoService } from '../lgpd/supressao.service';
import { exigirEdicaoEj } from '../empresas-juniores/permissoes';
import { ScoreService } from '../score/score.service';
import { PrismaService } from '../prisma/prisma.service';

/** Dados pessoais são mascarados no AuditLog (LGPD): registramos QUE mudou, não o valor em claro. */
export const MASCARAS_CONTATO = {
  nome: mascararNome,
  email: mascararEmail,
  telefone: mascararTelefone,
  whatsapp: mascararTelefone,
  // URL do LinkedIn identifica a pessoa; motivo do opt-out e descrição do cargo são texto livre.
  linkedin: (v: string | null) => (v ? '***' : null),
  optOutMotivo: (v: string | null) => (v ? '***' : null),
  cargoDescricao: (v: string | null) => (v ? '***' : null),
};

export const CAMPOS_AUDIT = [
  'nome',
  'cargo',
  'cargoDescricao',
  'email',
  'telefone',
  'whatsapp',
  'linkedin',
  'principal',
  'mandatoInicio',
  'mandatoFim',
  'baseLegal',
  'fonte',
  'optOut',
  'optOutMotivo',
] as const;

export const PAPEIS_DESMARCA_OPTOUT: string[] = ['GESTOR', 'ADMIN'];

/** Tarefas pendentes do contato viram canceladas (concluida = true + canceladaEm), como no encerramento de cadência. */
export function cancelarTarefasDoContato(tx: Prisma.TransactionClient, contatoId: string) {
  return tx.tarefa.updateMany({
    where: { contatoId, concluida: false },
    data: { concluida: true, canceladaEm: new Date() },
  });
}

const aData = (v: string | null | undefined) =>
  v === undefined ? undefined : v ? new Date(`${v}T00:00:00.000Z`) : null;

export function snapContato(c: Partial<Contato>): Record<string, unknown> {
  return Object.fromEntries(
    CAMPOS_AUDIT.map((k) => {
      const v = c[k];
      return [k, v instanceof Date ? v.toISOString().slice(0, 10) : (v ?? null)];
    }),
  );
}

@Injectable()
export class ContatosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly score: ScoreService,
    private readonly supressao: SupressaoService,
  ) {}

  private async ejOuErro(id: string) {
    const ej = await this.prisma.empresaJunior.findUnique({
      where: { id },
      select: { id: true, responsavelId: true },
    });
    if (!ej) throw new NotFoundException('Empresa Júnior não encontrada');
    return ej;
  }

  async listar(ejId: string) {
    await this.ejOuErro(ejId);
    return this.prisma.contato.findMany({
      where: { empresaJuniorId: ejId },
      orderBy: [{ principal: 'desc' }, { cargo: 'asc' }, { nome: 'asc' }],
    });
  }

  async obter(id: string) {
    const c = await this.prisma.contato.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Contato não encontrado');
    return c;
  }

  async criar(ejId: string, input: CriarContatoInput, usuario: UsuarioAutenticado) {
    const ej = await this.ejOuErro(ejId);
    exigirEdicaoEj(usuario, ej);
    const optOut = input.optOut ?? false;
    if (optOut && !input.optOutMotivo?.trim())
      throw new BadRequestException('Informe o motivo do opt-out');
    await this.supressao.exigirNaoSuprimido(input);
    return this.prisma.$transaction(async (tx) => {
      if (input.principal) await this.limparPrincipal(tx, ejId);
      const c = await tx.contato.create({
        data: {
          empresaJuniorId: ejId,
          nome: input.nome,
          cargo: input.cargo,
          cargoDescricao: input.cargoDescricao ?? null,
          email: input.email ?? null,
          telefone: input.telefone ?? null,
          whatsapp: input.whatsapp ?? null,
          linkedin: input.linkedin ?? null,
          principal: input.principal ?? false,
          mandatoInicio: aData(input.mandatoInicio) ?? null,
          mandatoFim: aData(input.mandatoFim) ?? null,
          baseLegal: input.baseLegal,
          fonte: input.fonte ?? 'manual',
          optOut,
          optOutEm: optOut ? new Date() : null,
          optOutMotivo: optOut ? (input.optOutMotivo ?? null) : null,
        },
      });
      if (optOut) {
        await tx.historicoOptOut.create({
          data: { contatoId: c.id, acao: 'MARCADO', motivo: input.optOutMotivo, usuarioId: usuario.id },
        });
        await this.supressao.registrar(c, 'OPT_OUT', usuario.id, tx);
      }
      await this.score.recalcularEj(ejId, tx);
      const d = diffCampos(snapContato({}), snapContato(c), MASCARAS_CONTATO);
      await this.audit.registrar(
        {
          usuarioId: usuario.id,
          acao: 'CONTATO_CRIADO',
          entidade: 'Contato',
          entidadeId: c.id,
          dados: { empresaJuniorId: ejId, antes: null, depois: d?.depois ?? {} } as Prisma.InputJsonObject,
        },
        tx,
      );
      return c;
    });
  }

  async atualizar(id: string, input: AtualizarContatoInput, usuario: UsuarioAutenticado) {
    const atual = await this.obter(id);
    if (atual.anonimizadoEm)
      throw new UnprocessableEntityException('Contato anonimizado não pode ser alterado');
    const ej = await this.ejOuErro(atual.empresaJuniorId);
    exigirEdicaoEj(usuario, ej);

    const marcando = input.optOut === true && !atual.optOut;
    const desmarcando = input.optOut === false && atual.optOut;
    if (desmarcando && !PAPEIS_DESMARCA_OPTOUT.includes(usuario.papel))
      throw new ForbiddenException('Apenas GESTOR ou ADMIN podem desmarcar um opt-out');
    if (marcando && !input.optOutMotivo?.trim())
      throw new BadRequestException('Informe o motivo do opt-out');
    // novos valores de contato não podem estar na lista de supressão
    const novos = {
      email: input.email !== undefined && input.email !== atual.email ? input.email : null,
      telefone: input.telefone !== undefined && input.telefone !== atual.telefone ? input.telefone : null,
      whatsapp: input.whatsapp !== undefined && input.whatsapp !== atual.whatsapp ? input.whatsapp : null,
    };
    await this.supressao.exigirNaoSuprimido(novos);

    const data: Prisma.ContatoUpdateInput = {};
    for (const k of [
      'nome',
      'cargo',
      'cargoDescricao',
      'email',
      'telefone',
      'whatsapp',
      'linkedin',
      'principal',
      'baseLegal',
      'fonte',
    ] as const) {
      if (input[k] !== undefined) (data as Record<string, unknown>)[k] = input[k];
    }
    if (input.mandatoInicio !== undefined) data.mandatoInicio = aData(input.mandatoInicio);
    if (input.mandatoFim !== undefined) data.mandatoFim = aData(input.mandatoFim);
    const inicio = (input.mandatoInicio !== undefined ? input.mandatoInicio : atual.mandatoInicio?.toISOString().slice(0, 10)) ?? null;
    const fim = (input.mandatoFim !== undefined ? input.mandatoFim : atual.mandatoFim?.toISOString().slice(0, 10)) ?? null;
    if (inicio && fim && fim < inicio)
      throw new BadRequestException('Fim do mandato anterior ao início');

    if (input.optOut !== undefined) {
      data.optOut = input.optOut;
      if (input.optOut && !atual.optOut) data.optOutEm = new Date();
      if (!input.optOut) {
        data.optOutEm = null;
        data.optOutMotivo = null;
      }
    }
    if (input.optOutMotivo !== undefined && !desmarcando && (input.optOut ?? atual.optOut))
      data.optOutMotivo = input.optOutMotivo;

    return this.prisma.$transaction(async (tx) => {
      if (input.principal) await this.limparPrincipal(tx, atual.empresaJuniorId, id);
      const novo = await tx.contato.update({ where: { id }, data });
      await this.score.recalcularEj(atual.empresaJuniorId, tx);
      if (marcando) {
        await encerrarInscricoes(tx, { contatoId: id }, 'OPT_OUT', usuario.id);
        await cancelarTarefasDoContato(tx, id);
        await tx.historicoOptOut.create({
          data: { contatoId: id, acao: 'MARCADO', motivo: input.optOutMotivo, usuarioId: usuario.id },
        });
      } else if (desmarcando) {
        await tx.historicoOptOut.create({
          data: { contatoId: id, acao: 'DESMARCADO', motivo: input.optOutMotivo ?? null, usuarioId: usuario.id },
        });
        await this.supressao.removerOptOut(atual, tx);
      }
      if (novo.optOut) await this.supressao.registrar(novo, 'OPT_OUT', usuario.id, tx);
      const d = diffCampos(snapContato(atual), snapContato(novo), MASCARAS_CONTATO);
      if (d) {
        await this.audit.registrar(
          {
            usuarioId: usuario.id,
            acao: marcando || desmarcando ? 'CONTATO_OPTOUT' : 'CONTATO_EDITADO',
            entidade: 'Contato',
            entidadeId: id,
            dados: { empresaJuniorId: atual.empresaJuniorId, ...d } as Prisma.InputJsonObject,
          },
          tx,
        );
      }
      return novo;
    });
  }

  async excluir(id: string, usuario: UsuarioAutenticado) {
    const atual = await this.obter(id);
    const ej = await this.ejOuErro(atual.empresaJuniorId);
    exigirEdicaoEj(usuario, ej);
    await this.prisma.$transaction(async (tx) => {
      // excluir não pode "limpar" um opt-out: o valor continua suprimido
      if (atual.optOut || atual.anonimizadoEm)
        await this.supressao.registrar(atual, atual.anonimizadoEm ? 'ANONIMIZACAO' : 'OPT_OUT', usuario.id, tx);
      await tx.contato.delete({ where: { id } });
      await this.score.recalcularEj(atual.empresaJuniorId, tx);
      await this.audit.registrar(
        {
          usuarioId: usuario.id,
          acao: 'CONTATO_EXCLUIDO',
          entidade: 'Contato',
          entidadeId: id,
          dados: {
            empresaJuniorId: atual.empresaJuniorId,
            antes: diffCampos({}, snapContato(atual), MASCARAS_CONTATO)?.depois ?? {},
            depois: null,
          } as Prisma.InputJsonObject,
        },
        tx,
      );
    });
    return { ok: true };
  }

  /** Direito de acesso do titular (LGPD): todos os dados do contato em JSON. GESTOR/ADMIN (guard na rota). */
  async exportar(id: string, usuario: UsuarioAutenticado) {
    const c = await this.obter(id);
    const [ej, interacoes, tarefas, inscricoes, historicoOptOut, auditoria] = await Promise.all([
      this.prisma.empresaJunior.findUnique({
        where: { id: c.empresaJuniorId },
        select: { id: true, nome: true, cidade: true, uf: true, cnpj: true, site: true },
      }),
      this.prisma.interacao.findMany({ where: { contatoId: id }, orderBy: { data: 'asc' } }),
      this.prisma.tarefa.findMany({ where: { contatoId: id }, orderBy: { vencimento: 'asc' } }),
      this.prisma.inscricaoCadencia.findMany({
        where: { contatoId: id },
        orderBy: { criadoEm: 'asc' },
        include: {
          cadencia: {
            select: {
              id: true,
              nome: true,
              passos: { orderBy: { ordem: 'asc' }, select: { ordem: true, diaOffset: true, canal: true, instrucoes: true } },
            },
          },
        },
      }),
      this.prisma.historicoOptOut.findMany({ where: { contatoId: id }, orderBy: { criadoEm: 'asc' } }),
      this.prisma.auditLog.findMany({
        where: { entidade: 'Contato', entidadeId: id },
        orderBy: { criadoEm: 'asc' },
        select: { id: true, acao: true, usuarioId: true, dados: true, criadoEm: true },
      }),
    ]);
    await this.audit.registrar({
      usuarioId: usuario.id,
      acao: 'CONTATO_EXPORTADO',
      entidade: 'Contato',
      entidadeId: id,
      dados: { empresaJuniorId: c.empresaJuniorId },
    });
    return {
      geradoEm: new Date().toISOString(),
      contato: c,
      empresaJunior: ej,
      interacoes,
      tarefas,
      inscricoesCadencia: inscricoes,
      historicoOptOut,
      auditoria,
    };
  }

  /**
   * Direito de eliminação (LGPD): anonimiza os dados pessoais. Registra a supressão ANTES de apagar os
   * valores, para que o dado não volte por importação/coleta. Idempotente.
   */
  async anonimizar(id: string, usuario: UsuarioAutenticado) {
    const atual = await this.obter(id);
    if (atual.anonimizadoEm) return { ok: true, jaAnonimizado: true };
    await this.prisma.$transaction(async (tx) => {
      await this.supressao.registrar(atual, 'ANONIMIZACAO', usuario.id, tx);
      await tx.historicoOptOut.updateMany({ where: { contatoId: id }, data: { motivo: null } });
      if (!atual.optOut)
        await tx.historicoOptOut.create({
          data: { contatoId: id, acao: 'MARCADO', motivo: null, usuarioId: usuario.id },
        });
      const agora = new Date();
      await tx.contato.update({
        where: { id },
        data: {
          nome: 'Contato anonimizado',
          email: null,
          telefone: null,
          whatsapp: null,
          linkedin: null,
          cargoDescricao: null,
          mandatoInicio: null,
          mandatoFim: null,
          principal: false,
          fonte: null,
          optOut: true,
          optOutEm: atual.optOutEm ?? agora,
          optOutMotivo: null,
          anonimizadoEm: agora,
        },
      });
      await encerrarInscricoes(tx, { contatoId: id }, 'OPT_OUT', usuario.id);
      await cancelarTarefasDoContato(tx, id);
      await this.score.recalcularEj(atual.empresaJuniorId, tx);
      await this.audit.registrar(
        {
          usuarioId: usuario.id,
          acao: 'CONTATO_ANONIMIZADO',
          entidade: 'Contato',
          entidadeId: id,
          dados: { empresaJuniorId: atual.empresaJuniorId },
        },
        tx,
      );
    });
    return { ok: true, jaAnonimizado: false };
  }

  private limparPrincipal(tx: Prisma.TransactionClient, ejId: string, exceto?: string) {
    return tx.contato.updateMany({
      where: { empresaJuniorId: ejId, principal: true, ...(exceto ? { id: { not: exceto } } : {}) },
      data: { principal: false },
    });
  }
}
