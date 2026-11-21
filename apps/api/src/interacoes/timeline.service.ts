import { Injectable, NotFoundException } from '@nestjs/common';
import type { PaginacaoInput, TipoTimeline } from '@orcestra/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface EventoTimeline {
  /** prefixo do tipo + id de origem (estável para chave de lista no front) */
  id: string;
  tipo: TipoTimeline;
  data: Date;
  usuario: { id: string; nome: string } | null;
  /** payload específico por tipo (ver Swagger) */
  detalhes: Record<string, unknown>;
}

/** Mescla fontes já ordenadas desc e devolve a página pedida. */
export function paginarEventos(fontes: EventoTimeline[][], page: number, pageSize: number) {
  return fontes
    .flat()
    .sort((a, b) => b.data.getTime() - a.data.getTime() || (a.id < b.id ? 1 : -1))
    .slice((page - 1) * pageSize, page * pageSize);
}

@Injectable()
export class TimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async obter(ejId: string, q: PaginacaoInput) {
    const ej = await this.prisma.empresaJunior.findUnique({ where: { id: ejId }, select: { id: true } });
    if (!ej) throw new NotFoundException('Empresa Júnior não encontrada');
    const n = q.page * q.pageSize; // cada fonte contribui no máximo com as n mais recentes
    const usuarioSel = { select: { id: true, nome: true } };

    const whereAuditEj: Prisma.AuditLogWhereInput = {
      entidade: 'EmpresaJunior',
      entidadeId: ejId,
      // mudanças de status aparecem pelo HistoricoStatus
      acao: { notIn: ['EJ_STATUS_ALTERADO'] },
    };
    const whereAuditContato: Prisma.AuditLogWhereInput = {
      entidade: 'Contato',
      dados: { path: ['empresaJuniorId'], equals: ejId },
    };
    const whereTarefaCriada = { empresaJuniorId: ejId };
    const whereTarefaConcluida = { empresaJuniorId: ejId, concluida: true, concluidaEm: { not: null } };

    const [cI, cH, cA, cC, cT, cTC, inter, hist, audEj, audCt, tarCri, tarCon] = await Promise.all([
      this.prisma.interacao.count({ where: { empresaJuniorId: ejId } }),
      this.prisma.historicoStatus.count({ where: { empresaJuniorId: ejId } }),
      this.prisma.auditLog.count({ where: whereAuditEj }),
      this.prisma.auditLog.count({ where: whereAuditContato }),
      this.prisma.tarefa.count({ where: whereTarefaCriada }),
      this.prisma.tarefa.count({ where: whereTarefaConcluida }),
      this.prisma.interacao.findMany({
        where: { empresaJuniorId: ejId },
        orderBy: [{ data: 'desc' }, { id: 'desc' }],
        take: n,
        include: { usuario: usuarioSel, contato: { select: { id: true, nome: true, cargo: true } } },
      }),
      this.prisma.historicoStatus.findMany({
        where: { empresaJuniorId: ejId },
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        take: n,
        include: { usuario: usuarioSel, motivoPerda: { select: { id: true, nome: true } } },
      }),
      this.prisma.auditLog.findMany({
        where: whereAuditEj,
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        take: n,
        include: { usuario: usuarioSel },
      }),
      this.prisma.auditLog.findMany({
        where: whereAuditContato,
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        take: n,
        include: { usuario: usuarioSel },
      }),
      this.prisma.tarefa.findMany({
        where: whereTarefaCriada,
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        take: n,
        include: { criadoPor: usuarioSel },
      }),
      this.prisma.tarefa.findMany({
        where: whereTarefaConcluida,
        orderBy: [{ concluidaEm: 'desc' }, { id: 'desc' }],
        take: n,
        include: { responsavel: usuarioSel },
      }),
    ]);

    const fontes: EventoTimeline[][] = [
      inter.map((i) => ({
        id: `interacao:${i.id}`,
        tipo: 'INTERACAO',
        data: i.data,
        usuario: i.usuario,
        detalhes: {
          interacaoId: i.id,
          canal: i.canal,
          resultado: i.resultado,
          resumo: i.resumo,
          contato: i.contato,
          proximoPasso: i.proximoPasso,
          proximoPassoData: i.proximoPassoData,
        },
      })),
      hist.map((h) => ({
        id: `status:${h.id}`,
        tipo: 'STATUS',
        data: h.criadoEm,
        usuario: h.usuario,
        detalhes: { de: h.de, para: h.para, motivoPerda: h.motivoPerda, observacao: h.motivo },
      })),
      audEj.map((a) => ({
        id: `audit:${a.id}`,
        tipo: 'EDICAO',
        data: a.criadoEm,
        usuario: a.usuario,
        detalhes: { acao: a.acao, dados: a.dados }, // observações já gravadas como "alterado"
      })),
      audCt.map((a) => ({
        id: `audit:${a.id}`,
        tipo: 'CONTATO',
        data: a.criadoEm,
        usuario: a.usuario,
        detalhes: { acao: a.acao, contatoId: a.entidadeId, dados: a.dados }, // dados pessoais já mascarados
      })),
      tarCri.map((t) => ({
        id: `tarefa-criada:${t.id}`,
        tipo: 'TAREFA_CRIADA',
        data: t.criadoEm,
        usuario: t.criadoPor,
        detalhes: { tarefaId: t.id, titulo: t.titulo, origem: t.origem, vencimento: t.vencimento },
      })),
      tarCon.map((t) => ({
        id: `tarefa-concluida:${t.id}`,
        tipo: 'TAREFA_CONCLUIDA',
        data: t.concluidaEm!,
        usuario: t.responsavel,
        detalhes: { tarefaId: t.id, titulo: t.titulo, origem: t.origem },
      })),
    ];

    const total = cI + cH + cA + cC + cT + cTC;
    return {
      items: paginarEventos(fontes, q.page, q.pageSize),
      total,
      page: q.page,
      pageSize: q.pageSize,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    };
  }
}
