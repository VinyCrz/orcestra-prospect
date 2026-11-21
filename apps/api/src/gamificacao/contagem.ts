import { calcularPontos } from '@orcestra/shared';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

export interface ContagemSemana {
  usuarioId: string;
  nome: string;
  interacoes: number;
  reunioes: number;
}

/**
 * Interações e reuniões (resultado REUNIAO_MARCADA, qualquer canal) por usuário em [ini, fim), agregadas no banco.
 * `usuarioId`: um usuário (qualquer papel/ativo); sem ele: todos os SDRs ativos (inclusive com zero).
 */
export async function contarSemana(
  db: Pick<PrismaService, '$queryRaw'>,
  ini: Date,
  fim: Date,
  usuarioId?: string,
): Promise<ContagemSemana[]> {
  const filtro = usuarioId ? Prisma.sql`u.id = ${usuarioId}` : Prisma.sql`u.ativo AND u.papel = 'SDR'`;
  const rows = await db.$queryRaw<{ id: string; nome: string; total: bigint; reunioes: bigint }[]>(Prisma.sql`
    SELECT u.id, u.nome, count(i.id) total, count(i.id) FILTER (WHERE i.resultado = 'REUNIAO_MARCADA') reunioes
    FROM usuarios u
    LEFT JOIN interacoes i ON i."usuarioId" = u.id AND i.data >= ${ini} AND i.data < ${fim}
    WHERE ${filtro}
    GROUP BY u.id, u.nome`);
  return rows.map((r) => ({ usuarioId: r.id, nome: r.nome, interacoes: Number(r.total), reunioes: Number(r.reunioes) }));
}

/** Ranking: pontos (interações + 5 × reuniões) desc; empate por reuniões desc, depois nome. */
export function montarRanking(linhas: ContagemSemana[]) {
  const ord = linhas
    .map((l) => ({ ...l, pontos: calcularPontos(l.interacoes, l.reunioes) }))
    .sort((a, b) => b.pontos - a.pontos || b.reunioes - a.reunioes || a.nome.localeCompare(b.nome, 'pt-BR'));
  return ord.map((l, idx) => ({ ...l, posicao: idx + 1 }));
}

const pctMeta = (valor: number, meta: number) => (meta > 0 ? Math.min(100, Math.round((100 * valor) / meta)) : null);

/** Progresso: pct = média dos percentuais (limitados a 100) das metas > 0; 100 se não há meta configurada. */
export function calcularProgresso(interacoes: number, reunioes: number, metaInteracoes: number, metaReunioes: number) {
  const pI = pctMeta(interacoes, metaInteracoes);
  const pR = pctMeta(reunioes, metaReunioes);
  const partes = [pI, pR].filter((p): p is number => p !== null);
  const pct = partes.length ? Math.round(partes.reduce((a, b) => a + b, 0) / partes.length) : 100;
  return { pctInteracoes: pI, pctReunioes: pR, pct, metaBatida: interacoes >= metaInteracoes && reunioes >= metaReunioes && (metaInteracoes > 0 || metaReunioes > 0) };
}
