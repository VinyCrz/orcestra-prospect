import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import type {
  AtualizarInteracaoInput,
  CriarInteracaoInput,
  PaginacaoInput,
} from '@orcestra/shared';
import { Prisma, StatusProspeccao } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { AuditService } from '../common/audit.service';
import { exigirEdicaoEj } from '../empresas-juniores/permissoes';
import { ScoreService } from '../score/score.service';
import { PrismaService } from '../prisma/prisma.service';

const SELECT_INTERACAO = {
  id: true,
  empresaJuniorId: true,
  contatoId: true,
  usuarioId: true,
  canal: true,
  data: true,
  resumo: true,
  resultado: true,
  proximoPasso: true,
  proximoPassoData: true,
  tarefaId: true,
  criadoEm: true,
  atualizadoEm: true,
  contato: { select: { id: true, nome: true, cargo: true } },
  usuario: { select: { id: true, nome: true } },
  tarefa: { select: { id: true, concluida: true, vencimento: true } },
} satisfies Prisma.InteracaoSelect;

/** Status em que o primeiro contato costuma ainda não ter sido registrado: apenas sugerimos avançar. */
const SUGERE_PRIMEIRO_CONTATO: StatusProspeccao[] = ['NAO_TRABALHADA', 'PESQUISADA'];

export function sugestaoDeStatus(status: StatusProspeccao) {
  return SUGERE_PRIMEIRO_CONTATO.includes(status)
    ? { de: status, para: 'PRIMEIRO_CONTATO' as const }
    : null;
}

@Injectable()
export class InteracoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly score: ScoreService,
  ) {}

  async listar(ejId: string, q: PaginacaoInput) {
    await this.ejOuErro(ejId);
    const where = { empresaJuniorId: ejId };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.interacao.count({ where }),
      this.prisma.interacao.findMany({
        where,
        orderBy: [{ data: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: SELECT_INTERACAO,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) };
  }

  async criar(ejId: string, input: CriarInteracaoInput, usuario: UsuarioAutenticado) {
    const ej = await this.ejOuErro(ejId);
    exigirEdicaoEj(usuario, ej); // SDR registra só nas EJs da própria carteira
    if (input.contatoId) await this.exigirContatoValido(input.contatoId, ejId);

    const interacao = await this.prisma.$transaction(async (tx) => {
      let tarefaId: string | null = null;
      if (input.proximoPassoData) {
        const t = await tx.tarefa.create({
          data: {
            titulo: input.proximoPasso || `Próximo passo com ${ej.nome}`,
            vencimento: input.proximoPassoData,
            origem: 'INTERACAO',
            responsavelId: usuario.id,
            criadoPorId: usuario.id,
            empresaJuniorId: ejId,
            contatoId: input.contatoId ?? null,
          },
        });
        tarefaId = t.id;
      }
      const i = await tx.interacao.create({
        data: {
          empresaJuniorId: ejId,
          contatoId: input.contatoId ?? null,
          usuarioId: usuario.id,
          canal: input.canal,
          data: input.data ?? new Date(),
          resumo: input.resumo,
          resultado: input.resultado,
          proximoPasso: input.proximoPasso ?? null,
          proximoPassoData: input.proximoPassoData ?? null,
          tarefaId,
        },
        select: SELECT_INTERACAO,
      });
      await this.score.recalcularEj(ejId, tx);
      await this.audit.registrar(
        {
          usuarioId: usuario.id,
          acao: 'INTERACAO_REGISTRADA',
          entidade: 'Interacao',
          entidadeId: i.id,
          // resumo é texto livre (pode conter dado pessoal): não vai para o AuditLog
          dados: {
            empresaJuniorId: ejId,
            antes: null,
            depois: { canal: i.canal, resultado: i.resultado, contatoId: i.contatoId, tarefaId },
          },
        },
        tx,
      );
      return i;
    });
    return { ...interacao, sugestaoStatus: sugestaoDeStatus(ej.statusProspeccao) };
  }

  async atualizar(id: string, input: AtualizarInteracaoInput, usuario: UsuarioAutenticado) {
    const atual = await this.obterEditavel(id, usuario);
    if (input.contatoId && input.contatoId !== atual.contatoId)
      await this.exigirContatoValido(input.contatoId, atual.empresaJuniorId);

    const data: Prisma.InteracaoUncheckedUpdateInput = {};
    if (input.canal !== undefined) data.canal = input.canal;
    if (input.data !== undefined) data.data = input.data;
    if (input.contatoId !== undefined) data.contatoId = input.contatoId ?? null;
    if (input.resumo !== undefined) data.resumo = input.resumo;
    if (input.resultado !== undefined) data.resultado = input.resultado;
    if (input.proximoPasso !== undefined) data.proximoPasso = input.proximoPasso;
    if (input.proximoPassoData !== undefined) data.proximoPassoData = input.proximoPassoData;

    return this.prisma.$transaction(async (tx) => {
      // mantém a tarefa gerada em sincronia com o próximo passo
      const passo = input.proximoPasso !== undefined ? input.proximoPasso : atual.proximoPasso;
      const quando = input.proximoPassoData !== undefined ? input.proximoPassoData : atual.proximoPassoData;
      if (input.proximoPassoData !== undefined || input.proximoPasso !== undefined) {
        if (quando && atual.tarefaId) {
          await tx.tarefa.updateMany({
            where: { id: atual.tarefaId, concluida: false },
            data: { vencimento: quando, ...(passo ? { titulo: passo } : {}) },
          });
        } else if (quando && !atual.tarefaId) {
          const t = await tx.tarefa.create({
            data: {
              titulo: passo || 'Próximo passo',
              vencimento: quando,
              origem: 'INTERACAO',
              responsavelId: usuario.id,
              criadoPorId: usuario.id,
              empresaJuniorId: atual.empresaJuniorId,
              contatoId: input.contatoId !== undefined ? input.contatoId : atual.contatoId,
            },
          });
          data.tarefaId = t.id;
        } else if (!quando && atual.tarefaId) {
          await tx.tarefa.deleteMany({ where: { id: atual.tarefaId, concluida: false } });
          data.tarefaId = null;
        }
      }
      const nova = await tx.interacao.update({ where: { id }, data, select: SELECT_INTERACAO });
      await this.score.recalcularEj(atual.empresaJuniorId, tx);
      await this.audit.registrar(
        {
          usuarioId: usuario.id,
          acao: 'INTERACAO_EDITADA',
          entidade: 'Interacao',
          entidadeId: id,
          dados: {
            empresaJuniorId: atual.empresaJuniorId,
            campos: Object.keys(input).filter((k) => input[k as keyof typeof input] !== undefined),
          },
        },
        tx,
      );
      return nova;
    });
  }

  async excluir(id: string, usuario: UsuarioAutenticado) {
    const atual = await this.obterEditavel(id, usuario);
    await this.prisma.$transaction(async (tx) => {
      await tx.interacao.delete({ where: { id } });
      await this.score.recalcularEj(atual.empresaJuniorId, tx);
      // tarefa gerada e ainda pendente perde o sentido junto com a interação
      if (atual.tarefaId) await tx.tarefa.deleteMany({ where: { id: atual.tarefaId, concluida: false } });
      await this.audit.registrar(
        {
          usuarioId: usuario.id,
          acao: 'INTERACAO_EXCLUIDA',
          entidade: 'Interacao',
          entidadeId: id,
          dados: {
            empresaJuniorId: atual.empresaJuniorId,
            antes: { canal: atual.canal, resultado: atual.resultado, contatoId: atual.contatoId },
            depois: null,
          },
        },
        tx,
      );
    });
  }

  // ---------------------------------------------------------------------------------------------

  private async ejOuErro(id: string) {
    const ej = await this.prisma.empresaJunior.findUnique({
      where: { id },
      select: { id: true, nome: true, responsavelId: true, statusProspeccao: true },
    });
    if (!ej) throw new NotFoundException('Empresa Júnior não encontrada');
    return ej;
  }

  /** Só o autor ou GESTOR/ADMIN alteram/excluem. */
  private async obterEditavel(id: string, usuario: UsuarioAutenticado) {
    const i = await this.prisma.interacao.findUnique({ where: { id } });
    if (!i) throw new NotFoundException('Interação não encontrada');
    if (usuario.papel === 'SDR' && i.usuarioId !== usuario.id)
      throw new ForbiddenException('Somente o autor, GESTOR ou ADMIN podem alterar esta interação');
    return i;
  }

  /** Contato precisa ser da EJ e não estar em opt-out nem anonimizado (422). */
  private async exigirContatoValido(contatoId: string, ejId: string) {
    const c = await this.prisma.contato.findUnique({
      where: { id: contatoId },
      select: { empresaJuniorId: true, optOut: true, anonimizadoEm: true },
    });
    if (!c || c.empresaJuniorId !== ejId)
      throw new BadRequestException('Contato não pertence a esta Empresa Júnior');
    if (c.optOut || c.anonimizadoEm)
      throw new UnprocessableEntityException(
        'Contato em opt-out (ou anonimizado): não é permitido registrar interação com ele',
      );
  }
}
