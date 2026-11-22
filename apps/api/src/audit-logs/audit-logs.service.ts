import { Injectable } from '@nestjs/common';
import type { AuditLogsQuery } from '@orcestra/shared';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DIA_MS = 24 * 3600 * 1000;
const SO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** `ate` só com data (AAAA-MM-DD) vale até o fim desse dia (fuso de Brasília, UTC-3). */
export function limitesPeriodo(de?: string, ate?: string): Prisma.DateTimeFilter | undefined {
  const f: Prisma.DateTimeFilter = {};
  if (de) f.gte = new Date(SO_DATA.test(de) ? `${de}T03:00:00.000Z` : de);
  if (ate)
    f.lt = SO_DATA.test(ate) ? new Date(new Date(`${ate}T03:00:00.000Z`).getTime() + DIA_MS) : new Date(ate);
  return Object.keys(f).length ? f : undefined;
}

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(q: AuditLogsQuery) {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.usuarioId ? { usuarioId: q.usuarioId } : {}),
      ...(q.acao ? { acao: q.acao } : {}),
      ...(q.entidade ? { entidade: q.entidade } : {}),
      ...(q.entidadeId ? { entidadeId: q.entidadeId } : {}),
      ...(limitesPeriodo(q.de, q.ate) ? { criadoEm: limitesPeriodo(q.de, q.ate) } : {}),
    };
    const [total, itens] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { usuario: { select: { id: true, nome: true, email: true } } },
      }),
    ]);
    return { total, page: q.page, pageSize: q.pageSize, itens };
  }

  async acoes(): Promise<string[]> {
    const r = await this.prisma.auditLog.findMany({
      distinct: ['acao'],
      select: { acao: true },
      orderBy: { acao: 'asc' },
    });
    return r.map((x) => x.acao);
  }
}
