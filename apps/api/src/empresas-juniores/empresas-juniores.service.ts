import { Injectable, NotFoundException } from '@nestjs/common';
import { chaveNome, type ListarEjsQuery } from '@orcestra/shared';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Valor especial do filtro de federação para EJs sem federação confirmada. */
export const SEM_FEDERACAO = 'nenhuma';

@Injectable()
export class EmpresasJunioresService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(q: ListarEjsQuery) {
    const where: Prisma.EmpresaJuniorWhereInput = {};
    if (q.busca) {
      const chave = chaveNome(q.busca);
      where.OR = [
        { nome: { contains: q.busca, mode: 'insensitive' } },
        ...(chave ? [{ nomeNormalizado: { contains: chave } }] : []),
        { razaoSocial: { contains: q.busca, mode: 'insensitive' } },
      ];
    }
    if (q.uf) where.uf = q.uf;
    if (q.federacaoId) where.federacaoId = q.federacaoId === SEM_FEDERACAO ? null : q.federacaoId;
    if (q.status) where.statusProspeccao = q.status;

    const orderBy: Prisma.EmpresaJuniorOrderByWithRelationInput[] = [
      (q.ordenarPor === 'uf' || q.ordenarPor === 'cidade'
        ? { [q.ordenarPor]: { sort: q.ordem, nulls: 'last' } }
        : { [q.ordenarPor]: q.ordem }) as Prisma.EmpresaJuniorOrderByWithRelationInput,
      { nome: 'asc' },
      { id: 'asc' },
    ];

    const [total, items] = await this.prisma.$transaction([
      this.prisma.empresaJunior.count({ where }),
      this.prisma.empresaJunior.findMany({
        where,
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          nome: true,
          cidade: true,
          uf: true,
          statusProspeccao: true,
          scoreIcp: true,
          verificado: true,
          ies: { select: { id: true, nome: true, sigla: true } },
          federacao: { select: { id: true, nome: true, sigla: true } },
        },
      }),
    ]);
    return {
      items,
      total,
      page: q.page,
      pageSize: q.pageSize,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    };
  }

  async detalhar(id: string) {
    const ej = await this.prisma.empresaJunior.findUnique({
      where: { id },
      include: {
        ies: true,
        federacao: true,
        nucleo: true,
        tags: { orderBy: { nome: 'asc' } },
        responsavel: { select: { id: true, nome: true, email: true } },
      },
    });
    if (!ej) throw new NotFoundException('Empresa Júnior não encontrada');
    return ej;
  }

  async filtros() {
    const ufs = await this.prisma.empresaJunior.groupBy({
      by: ['uf'],
      _count: { _all: true },
      orderBy: { uf: 'asc' },
    });
    return { ufs: ufs.filter((u) => u.uf).map((u) => ({ uf: u.uf!, total: u._count._all })) };
  }
}
