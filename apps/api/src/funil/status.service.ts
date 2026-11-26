import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { MudarStatusInput } from '@orcestra/shared';
import { Prisma, StatusProspeccao } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { AuditService, type RegistroAudit } from '../common/audit.service';
import { exigirEdicaoEj } from '../empresas-juniores/permissoes';
import { avancouNoFunil, encerrarInscricoes } from '../cadencias/encerramento';
import { ConquistasService } from '../gamificacao/conquistas.service';
import { PrismaService } from '../prisma/prisma.service';
import { camposDoStatus, type CamposStatus, type EntradaStatus } from './status.regras';

export type OrigemMudanca = 'kanban' | 'edicao' | 'massa';

export interface EjStatusAtual {
  id: string;
  statusProspeccao: StatusProspeccao;
  motivoPerdaId: string | null;
  motivoPerdaDetalhe: string | null;
  dataRetornoNutricao: Date | null;
  responsavelId?: string | null;
}

export const SELECT_STATUS = {
  id: true,
  responsavelId: true,
  statusProspeccao: true,
  motivoPerdaId: true,
  motivoPerdaDetalhe: true,
  dataRetornoNutricao: true,
} satisfies Prisma.EmpresaJuniorSelect;

/** Status em que a EJ ainda não foi abordada; "Prospectar" leva para PRIMEIRO_CONTATO. */
const STATUS_ANTES_DO_FUNIL: StatusProspeccao[] = ['NAO_TRABALHADA', 'PESQUISADA'];

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Ponto único de mudança de status (PATCH da EJ, kanban e ação em massa). */
@Injectable()
export class StatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly conquistas?: ConquistasService,
  ) {}

  /** Chamar APÓS o commit de aplicarEmLote (PRIMEIRA_OPORTUNIDADE); nunca lança. */
  aposMudanca(usuarioId: string, status: string, alteradas: number) {
    return this.conquistas?.aposMudancaStatus(usuarioId, status, alteradas);
  }

  /** Kanban / PATCH :id/status. Exige permissão de carteira. */
  async mudar(id: string, input: MudarStatusInput, usuario: UsuarioAutenticado) {
    const ej = await this.prisma.empresaJunior.findUnique({ where: { id }, select: SELECT_STATUS });
    if (!ej) throw new NotFoundException('Empresa Júnior não encontrada');
    exigirEdicaoEj(usuario, ej);
    const entrada: EntradaStatus = { ...input, status: input.status as StatusProspeccao };
    const r = await this.prisma.$transaction((tx) => this.aplicarEmLote(tx, [ej], entrada, usuario, 'kanban'));
    await this.aposMudanca(usuario.id, entrada.status, r.alteradas);
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
   * Botão "Prospectar": num clique a EJ vai para a carteira de quem clicou (se estiver sem responsável) e entra
   * no funil em PRIMEIRO_CONTATO (se ainda estava em NAO_TRABALHADA/PESQUISADA). Se já estiver mais à frente,
   * o status fica como está. SDR não pode pegar EJ da carteira de outra pessoa.
   */
  async prospectar(id: string, usuario: UsuarioAutenticado) {
    const ej = await this.prisma.empresaJunior.findUnique({
      where: { id },
      select: { ...SELECT_STATUS, responsavel: { select: { nome: true } } },
    });
    if (!ej) throw new NotFoundException('Empresa Júnior não encontrada');
    if (usuario.papel === 'SDR' && ej.responsavelId && ej.responsavelId !== usuario.id)
      throw new ForbiddenException(`Esta EJ já está na carteira de ${ej.responsavel?.nome ?? 'outra pessoa'}`);

    const assumiu = !ej.responsavelId;
    const entrouNoFunil = STATUS_ANTES_DO_FUNIL.includes(ej.statusProspeccao);
    const r = await this.prisma.$transaction(async (tx) => {
      if (assumiu) {
        // só assume se continuar sem responsável (dois cliques ao mesmo tempo não roubam a EJ)
        const { count } = await tx.empresaJunior.updateMany({
          where: { id, responsavelId: null },
          data: { responsavelId: usuario.id },
        });
        if (!count) throw new ConflictException('Outra pessoa acabou de pegar esta EJ');
        await this.audit.registrar(
          {
            usuarioId: usuario.id,
            acao: 'EJ_PROSPECTADA',
            entidade: 'EmpresaJunior',
            entidadeId: id,
            dados: { antes: { responsavelId: null }, depois: { responsavelId: usuario.id } },
          },
          tx,
        );
      }
      if (!entrouNoFunil) return { alteradas: 0 };
      return this.aplicarEmLote(tx, [ej], { status: 'PRIMEIRO_CONTATO' }, usuario, 'kanban');
    });
    if (r.alteradas) await this.aposMudanca(usuario.id, 'PRIMEIRO_CONTATO', r.alteradas);
    const atual = await this.prisma.empresaJunior.findUniqueOrThrow({
      where: { id },
      select: { statusProspeccao: true, responsavel: { select: { id: true, nome: true } } },
    });
    return { ...atual, assumiu, entrouNoFunil };
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
    // Voltar para "Não trabalhada" = a EJ saiu do funil: fica sem responsável para outra pessoa poder pegar.
    const libera = campos.statusProspeccao === 'NAO_TRABALHADA';

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
          antes: { ...this.snap(e), ...(libera && e.responsavelId ? { responsavelId: e.responsavelId } : {}) },
          depois: { ...this.snap(campos), ...(libera && e.responsavelId ? { responsavelId: null } : {}) },
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
        data: {
          statusProspeccao: campos.statusProspeccao,
          statusAlteradoEm: agora,
          ...dados,
          ...(libera ? { responsavelId: null } : {}),
        },
      });
    if (soCampos.length)
      await tx.empresaJunior.updateMany({ where: { id: { in: soCampos } }, data: dados });
    if (historico.length) await tx.historicoStatus.createMany({ data: historico });
    await this.audit.registrarVarios(logs, tx);
    // avançou no funil (ou perdida/nutrição): encerra cadências ativas e cancela tarefas pendentes
    if (mudouStatus.length && avancouNoFunil(campos.statusProspeccao))
      await encerrarInscricoes(tx, { empresaJuniorId: { in: mudouStatus } }, 'AVANCO_FUNIL', usuario.id);
    // liberada: as cadências e tarefas de quem era responsável não fazem mais sentido
    if (mudouStatus.length && libera)
      await encerrarInscricoes(
        tx,
        { empresaJuniorId: { in: mudouStatus } },
        'MANUAL',
        usuario.id,
        'EJ voltou para Não trabalhada e ficou sem responsável',
      );
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
