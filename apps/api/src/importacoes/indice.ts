import type { PrismaClient, Prisma } from '@prisma/client';
import { IndiceEjs, type ContatoLinha, type RefEj } from './linhas';

type Db = PrismaClient | Prisma.TransactionClient;

export async function carregarIndice(db: Db): Promise<IndiceEjs> {
  const ejs = await db.empresaJunior.findMany({
    select: {
      id: true,
      cnpj: true,
      nomeNormalizado: true,
      uf: true,
      chaveDedupe: true,
      ies: { select: { nome: true } },
    },
  });
  return new IndiceEjs(
    ejs.map((e) => ({
      id: e.id,
      cnpj: e.cnpj,
      nomeNormalizado: e.nomeNormalizado,
      uf: e.uf,
      chaveDedupe: e.chaveDedupe,
      iesNome: e.ies?.nome ?? null,
    })),
  );
}

/** Vincula o contato a uma EJ por CNPJ, senão por nome (+UF). */
export function resolverEjDoContato(
  indice: IndiceEjs,
  d: Pick<ContatoLinha, 'ejCnpj' | 'ejNome' | 'ejUf'>,
): { ref?: RefEj; erro?: string } {
  if (d.ejCnpj) {
    const r = indice.porCnpjDe(d.ejCnpj);
    if (r) return { ref: r };
    if (!d.ejNome) return { erro: `EJ com CNPJ ${d.ejCnpj} não encontrada` };
  }
  const cands = indice.buscarPorNome(d.ejNome!, d.ejUf);
  if (cands.length === 1) return { ref: cands[0] };
  if (cands.length > 1)
    return { erro: `Mais de uma EJ chamada "${d.ejNome}"${d.ejUf ? '' : ' — informe a UF ou o CNPJ'}` };
  return { erro: `EJ "${d.ejNome}"${d.ejUf ? ` (${d.ejUf})` : ''} não encontrada` };
}
