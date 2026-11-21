import { Injectable } from '@nestjs/common';
import { STATUS_PROSPECCAO, type KanbanQuery } from '@orcestra/shared';
import { Prisma, StatusProspeccao } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { montarWhere } from '../empresas-juniores/filtros';
import { podeEditarEj } from '../empresas-juniores/permissoes';
import { PrismaService } from '../prisma/prisma.service';

const SELECT_CARD = {
  id: true,
  nome: true,
  cidade: true,
  uf: true,
  scoreIcp: true,
  faixaIcp: true,
  statusProspeccao: true,
  statusAlteradoEm: true,
  dataRetornoNutricao: true,
  motivoPerdaDetalhe: true,
  responsavelId: true,
  ies: { select: { id: true, nome: true, sigla: true } },
  responsavel: { select: { id: true, nome: true } },
  motivoPerda: { select: { id: true, nome: true } },
} satisfies Prisma.EmpresaJuniorSelect;

const ORDEM: Prisma.EmpresaJuniorOrderByWithRelationInput[] = [
  { scoreIcp: 'desc' },
  { nome: 'asc' },
  { id: 'asc' },
];

@Injectable()
export class KanbanService {
  constructor(private readonly prisma: PrismaService) {}

  async obter(q: KanbanQuery, usuario: UsuarioAutenticado) {
    const status = q.status ? [q.status] : [...STATUS_PROSPECCAO];
    const colunas = await Promise.all(
      status.map((s) => this.coluna(s as StatusProspeccao, q, usuario)),
    );
    return { colunas };
  }

  private async coluna(status: StatusProspeccao, q: KanbanQuery, usuario: UsuarioAutenticado) {
    const where: Prisma.EmpresaJuniorWhereInput = {
      AND: [
        montarWhere(
          { busca: q.busca, uf: q.uf, responsavelId: q.responsavelId } as Parameters<typeof montarWhere>[0],
          usuario.id,
        ),
        { statusProspeccao: status },
      ],
    };
    const [total, itens] = await Promise.all([
      this.prisma.empresaJunior.count({ where }),
      this.prisma.empresaJunior.findMany({
        where,
        orderBy: ORDEM,
        take: q.limite + 1,
        ...(q.cursor && q.status ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        select: SELECT_CARD,
      }),
    ]);
    const temMais = itens.length > q.limite;
    const items = itens.slice(0, q.limite).map((e) => ({ ...e, podeEditar: podeEditarEj(usuario, e) }));
    return {
      status,
      total,
      items,
      proximoCursor: temMais ? items[items.length - 1].id : null,
    };
  }
}
