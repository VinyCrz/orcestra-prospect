import { Injectable } from '@nestjs/common';
import type { DashboardQuery } from '@orcestra/shared';
import { Prisma } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { RESULTADOS_RESPOSTA } from '../cadencias/encerramento';
import { PrismaService } from '../prisma/prisma.service';
import { escopoResponsavel, resolverPeriodo } from './periodo';

/**
 * Todas as métricas são agregadas no banco ($queryRaw parametrizado; período meio-aberto [ini, fim) em UTC).
 * Escopo (SDR, ou GESTOR/ADMIN com responsavelId):
 *  - interações, funil, motivos de perda e tempo por etapa: ações do usuário (Interacao.usuarioId /
 *    HistoricoStatus.usuarioId);
 *  - ejsPorUf e coberturaFederacao: a CARTEIRA do usuário (EmpresaJunior.responsavelId). Essas duas são
 *    fotografia atual, não dependem do período.
 * Visibilidade (EJ_VISIVEL): métricas de BASE (ejsPorUf, funil, cobertura, motivos de perda, tempo por etapa)
 * só contam EJs com forma de contato (temContato). Métricas de ATIVIDADE do SDR (interações, reuniões, resposta
 * por canal, ranking, metas, conquistas) contam todo o trabalho feito, inclusive em EJs ocultas.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async obter(q: DashboardQuery, usuario: UsuarioAutenticado) {
    const { ini, fim } = resolverPeriodo(q.inicio, q.fim);
    const resp = escopoResponsavel(usuario, q.responsavelId);
    const hUsu = resp ? Prisma.sql`AND h."usuarioId" = ${resp}` : Prisma.empty;
    const iUsu = resp ? Prisma.sql`AND i."usuarioId" = ${resp}` : Prisma.empty;
    const eResp = resp ? Prisma.sql`AND e."responsavelId" = ${resp}` : Prisma.empty;
    const respostas = [...RESULTADOS_RESPOSTA];
    const num = (v: unknown) => Number(v ?? 0);

    const [uf, funil, cobertura, porSdr, canais, motivos, tempo, dias, faixas] = await Promise.all([
      this.prisma.$queryRaw<{ uf: string | null; total: bigint; trabalhadas: bigint }[]>(Prisma.sql`
        SELECT e.uf, count(*) total, count(*) FILTER (WHERE e."statusProspeccao" <> 'NAO_TRABALHADA') trabalhadas
        FROM empresas_juniores e WHERE e."temContato" ${eResp} GROUP BY e.uf ORDER BY e.uf`),
      this.prisma.$queryRaw<{ status: string; alcancaram: number; conv_pct: number | null }[]>(Prisma.sql`
        WITH ordem(status, n) AS (VALUES ('PESQUISADA'::"StatusProspeccao",1),('PRIMEIRO_CONTATO',2),('EM_CONVERSA',3),('REUNIAO_AGENDADA',4),('OPORTUNIDADE',5)),
        alc AS (SELECT max(o.n) n FROM historico_status h JOIN ordem o ON o.status = h.para
                JOIN empresas_juniores e ON e.id = h."empresaJuniorId" AND e."temContato"
                WHERE h."criadoEm" >= ${ini} AND h."criadoEm" < ${fim} ${hUsu} GROUP BY h."empresaJuniorId"),
        cnt AS (SELECT n, count(*) c FROM alc GROUP BY n),
        acum AS (SELECT o.n, o.status, sum(coalesce(c.c, 0)) OVER (ORDER BY o.n DESC) alcancaram FROM ordem o LEFT JOIN cnt c USING (n))
        SELECT status::text, alcancaram::int alcancaram,
               round(100.0 * alcancaram / NULLIF(lag(alcancaram) OVER (ORDER BY n), 0), 1)::float8 conv_pct
        FROM acum ORDER BY n`),
      this.prisma.$queryRaw<
        { id: string; sigla: string; nome: string; total: bigint; trabalhadas: bigint; pct: number | null }[]
      >(Prisma.sql`
        SELECT f.id, f.sigla, f.nome, count(e.id) total,
               count(e.id) FILTER (WHERE e."statusProspeccao" <> 'NAO_TRABALHADA') trabalhadas,
               round(100.0 * count(e.id) FILTER (WHERE e."statusProspeccao" <> 'NAO_TRABALHADA') / NULLIF(count(e.id), 0), 1)::float8 pct
        FROM federacoes f LEFT JOIN empresas_juniores e ON e."federacaoId" = f.id AND e."temContato" ${eResp}
        GROUP BY f.id, f.sigla, f.nome ${resp ? Prisma.sql`HAVING count(e.id) > 0` : Prisma.empty}
        ORDER BY f.sigla`),
      this.prisma.$queryRaw<{ id: string; nome: string; total: bigint; reunioes: bigint }[]>(Prisma.sql`
        SELECT u.id, u.nome, count(*) total, count(*) FILTER (WHERE i.resultado = 'REUNIAO_MARCADA') reunioes
        FROM interacoes i JOIN usuarios u ON u.id = i."usuarioId"
        WHERE i.data >= ${ini} AND i.data < ${fim} ${iUsu}
        GROUP BY u.id, u.nome ORDER BY total DESC, u.nome`),
      this.prisma.$queryRaw<{ canal: string; total: bigint; respondidas: bigint; taxa: number | null }[]>(Prisma.sql`
        SELECT i.canal::text canal, count(*) total,
               count(*) FILTER (WHERE i.resultado::text = ANY(${respostas}::text[])) respondidas,
               round(100.0 * count(*) FILTER (WHERE i.resultado::text = ANY(${respostas}::text[])) / NULLIF(count(*), 0), 1)::float8 taxa
        FROM interacoes i WHERE i.data >= ${ini} AND i.data < ${fim} ${iUsu}
        GROUP BY i.canal ORDER BY total DESC`),
      this.prisma.$queryRaw<{ id: string | null; nome: string | null; total: bigint }[]>(Prisma.sql`
        SELECT m.id, m.nome, count(*) total FROM historico_status h LEFT JOIN motivos_perda m ON m.id = h."motivoPerdaId"
        JOIN empresas_juniores e ON e.id = h."empresaJuniorId" AND e."temContato"
        WHERE h.para = 'PERDIDA' AND h."criadoEm" >= ${ini} AND h."criadoEm" < ${fim} ${hUsu}
        GROUP BY m.id, m.nome ORDER BY total DESC, m.nome`),
      this.prisma.$queryRaw<{ status: string; dias: number }[]>(Prisma.sql`
        SELECT h.de::text status, round((avg(extract(epoch FROM h."criadoEm" - p."criadoEm")) / 86400)::numeric, 1)::float8 dias
        FROM historico_status h
        CROSS JOIN LATERAL (SELECT "criadoEm" FROM historico_status p
          WHERE p."empresaJuniorId" = h."empresaJuniorId" AND (p."criadoEm", p.id) < (h."criadoEm", h.id)
          ORDER BY p."criadoEm" DESC, p.id DESC LIMIT 1) p
        JOIN empresas_juniores e ON e.id = h."empresaJuniorId" AND e."temContato"
        WHERE h."criadoEm" >= ${ini} AND h."criadoEm" < ${fim} AND h.de IS NOT NULL ${hUsu}
        GROUP BY h.de`),
      // dia da semana no fuso de Brasília (0 = domingo)
      this.prisma.$queryRaw<{ dia: number; total: bigint; respondidas: bigint; taxa: number | null }[]>(Prisma.sql`
        SELECT extract(dow FROM i.data AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::int dia, count(*) total,
               count(*) FILTER (WHERE i.resultado::text = ANY(${respostas}::text[])) respondidas,
               round(100.0 * count(*) FILTER (WHERE i.resultado::text = ANY(${respostas}::text[])) / NULLIF(count(*), 0), 1)::float8 taxa
        FROM interacoes i WHERE i.data >= ${ini} AND i.data < ${fim} ${iUsu}
        GROUP BY 1 ORDER BY 1`),
      // o score acerta? das EJs já trabalhadas de cada faixa, quantas chegaram a reunião (fotografia atual)
      this.prisma.$queryRaw<{ faixa: string; trabalhadas: bigint; reuniao: bigint; pct: number | null }[]>(Prisma.sql`
        WITH r AS (SELECT DISTINCT h."empresaJuniorId" id FROM historico_status h
                   WHERE h.para IN ('REUNIAO_AGENDADA', 'OPORTUNIDADE'))
        SELECT e."faixaIcp"::text faixa, count(*) trabalhadas, count(r.id) reuniao,
               round(100.0 * count(r.id) / NULLIF(count(*), 0), 1)::float8 pct
        FROM empresas_juniores e LEFT JOIN r ON r.id = e.id
        WHERE e."temContato" AND e."faixaIcp" IS NOT NULL AND e."statusProspeccao" <> 'NAO_TRABALHADA' ${eResp}
        GROUP BY e."faixaIcp" ORDER BY e."faixaIcp"`),
    ]);

    return {
      periodo: { inicio: ini.toISOString(), fim: fim.toISOString() },
      responsavelId: resp,
      ejsPorUf: uf.map((r) => ({ uf: r.uf, total: num(r.total), trabalhadas: num(r.trabalhadas) })),
      funil: funil.map((r) => ({ status: r.status, alcancaram: num(r.alcancaram), conversaoPct: r.conv_pct })),
      coberturaFederacao: cobertura.map((r) => ({
        federacaoId: r.id, sigla: r.sigla, nome: r.nome, total: num(r.total), trabalhadas: num(r.trabalhadas), pct: r.pct,
      })),
      interacoesPorSdr: porSdr.map((r) => ({ usuarioId: r.id, nome: r.nome, total: num(r.total), reunioes: num(r.reunioes) })),
      respostaPorCanal: canais.map((r) => ({
        canal: r.canal, total: num(r.total), respondidas: num(r.respondidas), taxaPct: r.taxa,
      })),
      motivosPerda: motivos.map((r) => ({ motivoId: r.id, nome: r.nome ?? 'Sem motivo', total: num(r.total) })),
      tempoMedioEtapa: tempo.map((r) => ({ status: r.status, dias: r.dias })),
      respostaPorDia: dias.map((r) => ({
        dia: r.dia, total: num(r.total), respondidas: num(r.respondidas), taxaPct: r.taxa,
      })),
      reuniaoPorFaixa: faixas.map((r) => ({
        faixa: r.faixa, trabalhadas: num(r.trabalhadas), comReuniao: num(r.reuniao), pct: r.pct,
      })),
    };
  }
}
