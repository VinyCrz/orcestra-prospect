import type { MotivoEncerramento, Prisma, StatusProspeccao } from '@prisma/client';

/** Resultados de interação que indicam resposta da EJ/contato (encerram a cadência). */
export const RESULTADOS_RESPOSTA = ['RESPONDEU', 'REUNIAO_MARCADA', 'NAO_INTERESSADO'] as const;
export const ehResposta = (r: string) => (RESULTADOS_RESPOSTA as readonly string[]).includes(r);

/** Status do funil em que a cadência ainda faz sentido; qualquer outro encerra (AVANCO_FUNIL). */
const STATUS_INICIAIS: StatusProspeccao[] = ['NAO_TRABALHADA', 'PESQUISADA', 'PRIMEIRO_CONTATO'];
export const avancouNoFunil = (status: StatusProspeccao) => !STATUS_INICIAIS.includes(status);

/**
 * Encerra (ENCERRADA + motivo + encerradaEm) as inscrições ATIVAS que casam com `where` e cancela as
 * tarefas pendentes delas (concluida = true + canceladaEm). Idempotente; roda na transação do chamador.
 * Sem DI de propósito, para ser usada por interações, funil e contatos sem dependência circular.
 */
export async function encerrarInscricoes(
  tx: Prisma.TransactionClient,
  where: Prisma.InscricaoCadenciaWhereInput,
  motivo: MotivoEncerramento,
  usuarioId: string | null,
  detalhe?: string | null,
): Promise<number> {
  const ativas = await tx.inscricaoCadencia.findMany({
    where: { ...where, status: 'ATIVA' },
    select: { id: true, empresaJuniorId: true, cadenciaId: true },
  });
  if (!ativas.length) return 0;
  const ids = ativas.map((i) => i.id);
  const agora = new Date();
  await tx.inscricaoCadencia.updateMany({
    where: { id: { in: ids }, status: 'ATIVA' },
    data: { status: 'ENCERRADA', motivoEncerramento: motivo, motivoDetalhe: detalhe ?? null, encerradaEm: agora },
  });
  await tx.tarefa.updateMany({
    where: { inscricaoCadenciaId: { in: ids }, concluida: false },
    data: { concluida: true, canceladaEm: agora },
  });
  await tx.auditLog.createMany({
    data: ativas.map((i) => ({
      usuarioId,
      acao: 'CADENCIA_ENCERRADA',
      entidade: 'InscricaoCadencia',
      entidadeId: i.id,
      dados: {
        empresaJuniorId: i.empresaJuniorId,
        cadenciaId: i.cadenciaId,
        antes: { status: 'ATIVA' },
        depois: { status: 'ENCERRADA', motivo, detalhe: detalhe ?? null },
      } as Prisma.InputJsonObject,
    })),
  });
  return ativas.length;
}

/** Marca a inscrição como CONCLUIDA quando não restam tarefas pendentes (canceladas não existem em ATIVA). */
export async function concluirInscricaoSeCompleta(
  tx: Prisma.TransactionClient,
  inscricaoId: string | null | undefined,
  usuarioId: string | null,
): Promise<boolean> {
  if (!inscricaoId) return false;
  const pendentes = await tx.tarefa.count({ where: { inscricaoCadenciaId: inscricaoId, concluida: false } });
  if (pendentes > 0) return false;
  const insc = await tx.inscricaoCadencia.findUnique({
    where: { id: inscricaoId },
    select: { status: true, empresaJuniorId: true, cadenciaId: true },
  });
  if (insc?.status !== 'ATIVA') return false;
  const r = await tx.inscricaoCadencia.updateMany({
    where: { id: inscricaoId, status: 'ATIVA' },
    data: { status: 'CONCLUIDA', encerradaEm: new Date() },
  });
  if (!r.count) return false;
  await tx.auditLog.create({
    data: {
      usuarioId,
      acao: 'CADENCIA_CONCLUIDA',
      entidade: 'InscricaoCadencia',
      entidadeId: inscricaoId,
      dados: {
        empresaJuniorId: insc.empresaJuniorId,
        cadenciaId: insc.cadenciaId,
        antes: { status: 'ATIVA' },
        depois: { status: 'CONCLUIDA' },
      } as Prisma.InputJsonObject,
    },
  });
  return true;
}
