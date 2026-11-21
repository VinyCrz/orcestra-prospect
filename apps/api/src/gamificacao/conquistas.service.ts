import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { calcularProgresso, contarSemana } from './contagem';
import { intervaloDaSemana, resolverMeta, type MetaLinha } from '../common/semana';
import { PrismaService } from '../prisma/prisma.service';

export const CONQ = {
  PRIMEIRA_REUNIAO: 'PRIMEIRA_REUNIAO',
  DEZ_EJS_FEDERACAO_NOVA: 'DEZ_EJS_FEDERACAO_NOVA',
  SEMANA_META_BATIDA: 'SEMANA_META_BATIDA',
  PRIMEIRA_OPORTUNIDADE: 'PRIMEIRA_OPORTUNIDADE',
  CEM_INTERACOES: 'CEM_INTERACOES',
} as const;
export const LIMITE_EJS_FEDERACAO = 10;
export const LIMITE_INTERACOES = 100;

export interface Concessao {
  usuarioId: string;
  conquistaChave: string;
  referencia: string;
  dados?: Prisma.InputJsonObject;
}

/**
 * Concessão de conquistas, idempotente (createMany skipDuplicates = INSERT ... ON CONFLICT DO NOTHING sobre
 * @@unique(usuarioId, conquistaChave, referencia)). Os métodos `apos*` NUNCA lançam: falha é logada e a
 * operação principal (já commitada) segue.
 */
@Injectable()
export class ConquistasService {
  private readonly log = new Logger(ConquistasService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Grava as concessões cujas conquistas existem e estão ativas. Retorna as chaves de fato criadas. */
  async conceder(itens: Concessao[]): Promise<number> {
    if (!itens.length) return 0;
    const ativas = new Set(
      (
        await this.prisma.conquista.findMany({
          where: { chave: { in: [...new Set(itens.map((i) => i.conquistaChave))] }, ativa: true },
          select: { chave: true },
        })
      ).map((c) => c.chave),
    );
    const data = itens.filter((i) => ativas.has(i.conquistaChave));
    if (!data.length) return 0;
    const r = await this.prisma.conquistaUsuario.createMany({ data, skipDuplicates: true });
    return r.count;
  }

  /**
   * Após registrar interação (commit feito). PRIMEIRA_REUNIAO: resultado REUNIAO_MARCADA. CEM_INTERACOES: ≥ 100
   * interações do usuário. DEZ_EJS_FEDERACAO_NOVA: "trabalhada" = EJ com interação registrada pelo SDR; ao
   * alcançar 10 EJs distintas numa federação, concede uma vez por federação (referencia = federacaoId).
   */
  async aposInteracao(i: { id: string; usuarioId: string; empresaJuniorId: string; resultado: string }) {
    try {
      const itens: Concessao[] = [];
      if (i.resultado === 'REUNIAO_MARCADA')
        itens.push({ usuarioId: i.usuarioId, conquistaChave: CONQ.PRIMEIRA_REUNIAO, referencia: '', dados: { interacaoId: i.id } });

      const jaTem = new Set(
        (
          await this.prisma.conquistaUsuario.findMany({
            where: { usuarioId: i.usuarioId, conquistaChave: CONQ.CEM_INTERACOES },
            select: { conquistaChave: true },
          })
        ).map((c) => c.conquistaChave),
      );
      if (!jaTem.has(CONQ.CEM_INTERACOES)) {
        const total = await this.prisma.interacao.count({ where: { usuarioId: i.usuarioId } });
        if (total >= LIMITE_INTERACOES)
          itens.push({ usuarioId: i.usuarioId, conquistaChave: CONQ.CEM_INTERACOES, referencia: '', dados: { interacaoId: i.id, total } });
      }

      const ej = await this.prisma.empresaJunior.findUnique({ where: { id: i.empresaJuniorId }, select: { federacaoId: true } });
      if (ej?.federacaoId) {
        const [{ n }] = await this.prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
          SELECT count(DISTINCT i."empresaJuniorId") n FROM interacoes i
          JOIN empresas_juniores e ON e.id = i."empresaJuniorId"
          WHERE i."usuarioId" = ${i.usuarioId} AND e."federacaoId" = ${ej.federacaoId}`);
        if (Number(n) >= LIMITE_EJS_FEDERACAO)
          itens.push({
            usuarioId: i.usuarioId,
            conquistaChave: CONQ.DEZ_EJS_FEDERACAO_NOVA,
            referencia: ej.federacaoId,
            dados: { federacaoId: ej.federacaoId, ejs: Number(n) },
          });
      }
      await this.conceder(itens);
    } catch (e) {
      this.log.error(`Falha ao avaliar conquistas da interação ${i.id}: ${(e as Error).message}`);
    }
  }

  /** Após mudar status (commit feito): PRIMEIRA_OPORTUNIDADE quando o novo status é OPORTUNIDADE. */
  async aposMudancaStatus(usuarioId: string, novoStatus: string, alteradas: number) {
    if (novoStatus !== 'OPORTUNIDADE' || alteradas <= 0) return;
    try {
      await this.conceder([{ usuarioId, conquistaChave: CONQ.PRIMEIRA_OPORTUNIDADE, referencia: '', dados: { alteradas } }]);
    } catch (e) {
      this.log.error(`Falha ao avaliar PRIMEIRA_OPORTUNIDADE de ${usuarioId}: ${(e as Error).message}`);
    }
  }

  /** SEMANA_META_BATIDA para todos os SDRs ativos que bateram a meta vigente na semana (referencia = AAAA-Www). */
  async avaliarSemana(semana: string): Promise<{ semana: string; avaliados: number; concedidas: number }> {
    const { ini, fim, segunda } = intervaloDaSemana(semana);
    const metas: MetaLinha[] = (await this.prisma.metaSemanal.findMany()).map((m) => ({
      usuarioId: m.usuarioId,
      interacoesSemana: m.interacoesSemana,
      reunioesSemana: m.reunioesSemana,
      vigenteDesde: m.vigenteDesde.toISOString().slice(0, 10),
    }));
    const contagens = await contarSemana(this.prisma, ini, fim);
    const itens: Concessao[] = [];
    for (const c of contagens) {
      const meta = resolverMeta(metas, c.usuarioId, segunda);
      if (!meta) continue;
      if (calcularProgresso(c.interacoes, c.reunioes, meta.interacoesSemana, meta.reunioesSemana).metaBatida)
        itens.push({
          usuarioId: c.usuarioId,
          conquistaChave: CONQ.SEMANA_META_BATIDA,
          referencia: semana,
          dados: {
            semana,
            interacoes: c.interacoes,
            reunioes: c.reunioes,
            meta: { interacoes: meta.interacoesSemana, reunioes: meta.reunioesSemana },
          },
        });
    }
    return { semana, avaliados: contagens.length, concedidas: await this.conceder(itens) };
  }
}
