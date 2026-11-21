import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { MudarStatusInput } from '@orcestra/shared';
import { Prisma, StatusProspeccao } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { AuditService, type RegistroAudit } from '../common/audit.service';
import { exigirEdicaoEj } from '../empresas-juniores/permissoes';
import { avancouNoFunil, encerrarInscricoes } from '../cadencias/encerramento';
import { PrismaService } from '../prisma/prisma.service';
import { camposDoStatus, type CamposStatus, type EntradaStatus } from './status.regras';

export type OrigemMudanca = 'kanban' | 'edicao' | 'massa';

export interface EjStatusAtual {
  id: string;
  statusProspeccao: StatusProspeccao;
  motivoPerdaId: string | null;
  motivoPerdaDetalhe: string | null;
  dataRetornoNutricao: Date | null;
}

export const SELECT_STATUS = {
  id: true,
  responsavelId: true,
  statusProspeccao: true,
  motivoPerdaId: true,
  motivoPerdaDetalhe: true,
  dataRetornoNutricao: true,
} satisfies Prisma.EmpresaJuniorSelect;

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Ponto único de mudança de status (PATCH da EJ, kanban e ação em massa). */
@Injectable()
export class StatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Kanban / PATCH :id/status. Exige permissão de carteira. */
  async mudar(id: string, input: MudarStatusInput, usuario: UsuarioAutenticado) {
    const ej = await this.prisma.empresaJunior.findUnique({ where: { id }, select: SELECT_STATUS });
    if (!ej) throw new NotFoundException('Empresa Júnior não encontrada');
    exigirEdicaoEj(usuario, ej);
    const entrada: EntradaStatus = { ...input, status: input.status as StatusProspeccao };
    await this.prisma.$transaction((tx) => this.aplicarEmLote(tx, [ej], entrada, usuario, 'kanban'));
    return this.prisma.empresaJunior.findUniqueOrThrow({
      where: { id },
      select: {
        ...SELECT_STATUS,
        statusAlteradoEm: true,
        motivoPerda: { select: { id: true, nome: true } },
      },
    });
  }

  /**
   * Aplica o status a várias EJs dentro da transação do chamador. Valida as regras, grava HistoricoStatus
   * (só se o status mudou), statusAlteradoEm e AuditLog. Retorna ids alterados.
   */
  async aplicarEmLote(
    tx: Prisma.TransactionClient,
    ejs: EjStatusAtual[],
    entrada: EntradaStatus,
    usuario: UsuarioAutenticado,
    origem: OrigemMudanca,
  ): Promise<{ alteradas: number; semMudanca: number }> {
    const campos = camposDoStatus(entrada);
    if (campos.motivoPerdaId) {
      const m = await tx.motivoPerda.findUnique({
        where: { id: campos.motivoPerdaId },
        select: { ativo: true },
      });
      if (!m?.ativo) throw new BadRequestException('Motivo de perda inexistente ou inativo');
    }
    const agora = new Date();
    const logs: RegistroAudit[] = [];
    const historico: Prisma.HistoricoStatusCreateManyInput[] = [];
    const mudouStatus: string[] = [];
    const soCampos: string[] = [];

    for (const e of ejs) {
      const trocou = e.statusProspeccao !== campos.statusProspeccao;
      const camposDiferem =
        e.motivoPerdaId !== campos.motivoPerdaId ||
        e.motivoPerdaDetalhe !== campos.motivoPerdaDetalhe ||
        dia(e.dataRetornoNutricao) !== dia(campos.dataRetornoNutricao);
      if (!trocou && !camposDiferem) continue;
      if (trocou) {
        mudouStatus.push(e.id);
        historico.push({
          empresaJuniorId: e.id,
          de: e.statusProspeccao,
          para: campos.statusProspeccao,
          usuarioId: usuario.id,
          motivo: campos.motivoPerdaDetalhe ?? origem,
          motivoPerdaId: campos.motivoPerdaId,
          criadoEm: agora,
        });
      } else soCampos.push(e.id);
      logs.push({
        usuarioId: usuario.id,
        acao: 'EJ_STATUS_ALTERADO',
        entidade: 'EmpresaJunior',
        entidadeId: e.id,
        dados: {
          origem,
          antes: this.snap(e),
          depois: this.snap(campos),
        } as Prisma.InputJsonObject,
      });
    }

    const dados = {
      motivoPerdaId: campos.motivoPerdaId,
      motivoPerdaDetalhe: campos.motivoPerdaDetalhe,
      dataRetornoNutricao: campos.dataRetornoNutricao,
    };
    if (mudouStatus.length)
      await tx.empresaJunior.updateMany({
        where: { id: { in: mudouStatus } },
        data: { statusProspeccao: campos.statusProspeccao, statusAlteradoEm: agora, ...dados },
      });
    if (soCampos.length)
      await tx.empresaJunior.updateMany({ where: { id: { in: soCampos } }, data: dados });
    if (historico.length) await tx.historicoStatus.createMany({ data: historico });
    await this.audit.registrarVarios(logs, tx);
    // avançou no funil (ou perdida/nutrição): encerra cadências ativas e cancela tarefas pendentes
    if (mudouStatus.length && avancouNoFunil(campos.statusProspeccao))
      await encerrarInscricoes(tx, { empresaJuniorId: { in: mudouStatus } }, 'AVANCO_FUNIL', usuario.id);
    return { alteradas: logs.length, semMudanca: ejs.length - logs.length };
  }

  /** Registra o estado inicial no histórico (cadastro de EJ). */
  registrarInicial(
    tx: Prisma.TransactionClient,
    ejId: string,
    status: StatusProspeccao,
    usuarioId: string | null,
  ) {
    return tx.historicoStatus.create({
      data: { empresaJuniorId: ejId, de: null, para: status, usuarioId, motivo: 'cadastro' },
    });
  }

  private snap(e: EjStatusAtual | CamposStatus) {
    return {
      statusProspeccao: e.statusProspeccao,
      motivoPerdaId: e.motivoPerdaId,
      dataRetornoNutricao: dia(e.dataRetornoNutricao),
    };
  }
}
