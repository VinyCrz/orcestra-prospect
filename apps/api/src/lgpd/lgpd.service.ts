import { Injectable } from '@nestjs/common';
import type { RetencaoQuery } from '@orcestra/shared';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupressaoService } from './supressao.service';

export const RETENCAO_MESES = 24;

export function corteRetencao(agora = new Date()): Date {
  const d = new Date(agora);
  d.setUTCMonth(d.getUTCMonth() - RETENCAO_MESES);
  return d;
}

@Injectable()
export class LgpdService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supressao: SupressaoService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Candidatos à anonimização (NADA é apagado automaticamente): mandato encerrado há mais de 24 meses
   * e sem nenhuma interação nos últimos 24 meses; ainda não anonimizados.
   */
  async retencao(q: RetencaoQuery, agora = new Date()) {
    const corte = corteRetencao(agora);
    const where = {
      anonimizadoEm: null,
      mandatoFim: { lt: corte },
      interacoes: { none: { data: { gte: corte } } },
    };
    const [total, itens] = await Promise.all([
      this.prisma.contato.count({ where }),
      this.prisma.contato.findMany({
        where,
        orderBy: [{ mandatoFim: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          nome: true,
          cargo: true,
          mandatoFim: true,
          optOut: true,
          empresaJunior: { select: { id: true, nome: true } },
          interacoes: { orderBy: { data: 'desc' }, take: 1, select: { data: true } },
        },
      }),
    ]);
    return {
      corte: corte.toISOString(),
      total,
      page: q.page,
      pageSize: q.pageSize,
      itens: itens.map(({ interacoes, mandatoFim, ...c }) => ({
        ...c,
        mandatoFim: mandatoFim?.toISOString().slice(0, 10) ?? null,
        ultimaInteracaoEm: interacoes[0]?.data.toISOString() ?? null,
      })),
    };
  }

  /** Idempotente: grava a supressão de todos os contatos com opt-out (e anonimizados, que já não têm valores). */
  async backfillSupressao(usuarioId: string) {
    let cursor: string | undefined;
    let contatos = 0;
    let novos = 0;
    for (;;) {
      const lote = await this.prisma.contato.findMany({
        where: { OR: [{ optOut: true }, { anonimizadoEm: { not: null } }] },
        orderBy: { id: 'asc' },
        take: 500,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: { id: true, email: true, telefone: true, whatsapp: true, anonimizadoEm: true },
      });
      if (!lote.length) break;
      for (const c of lote) {
        novos += await this.supressao.registrar(
          c,
          c.anonimizadoEm ? 'ANONIMIZACAO' : 'OPT_OUT',
          usuarioId,
        );
      }
      contatos += lote.length;
      cursor = lote[lote.length - 1].id;
    }
    await this.audit.registrar({
      usuarioId,
      acao: 'SUPRESSAO_BACKFILL',
      entidade: 'SupressaoContato',
      dados: { contatos, novos },
    });
    return { contatos, novos };
  }
}
