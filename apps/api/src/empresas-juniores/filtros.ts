import {
  CANAIS_CONTATO,
  chaveNome,
  FILTRO_EU,
  FILTRO_NENHUM,
  FILTRO_NENHUMA,
  type CanalContato,
  type FiltrosEj,
  type ModoCanais,
} from '@orcestra/shared';
import type { Prisma } from '@prisma/client';
import { EJ_VISIVEL } from './visibilidade';

/** Converte os filtros combináveis (AND entre filtros, OR dentro de cada filtro multi) em `where` do Prisma. */
export function montarWhere(f: FiltrosEj, usuarioId: string): Prisma.EmpresaJuniorWhereInput {
  // Só EJs visíveis (com forma de contato). `comContato` segue aceito por compatibilidade: true é redundante,
  // false não casa com nenhuma EJ visível (resultado vazio).
  const and: Prisma.EmpresaJuniorWhereInput[] = [EJ_VISIVEL];

  if (f.busca) {
    const chave = chaveNome(f.busca);
    const digitos = f.busca.replace(/\D/g, '');
    and.push({
      OR: [
        { nome: { contains: f.busca, mode: 'insensitive' } },
        ...(chave ? [{ nomeNormalizado: { contains: chave } }] : []),
        { razaoSocial: { contains: f.busca, mode: 'insensitive' as const } },
        ...(digitos.length >= 4 ? [{ cnpj: { contains: digitos } }] : []),
      ],
    });
  }
  if (f.uf?.length) and.push({ uf: { in: f.uf } });
  if (f.regiao?.length) and.push({ regiao: { in: f.regiao } });
  if (f.federacaoId?.length) and.push(comNulo('federacaoId', f.federacaoId, FILTRO_NENHUMA));
  if (f.iesId?.length) and.push({ iesId: { in: f.iesId } });
  if (f.tagIds?.length) and.push({ tags: { some: { id: { in: f.tagIds } } } });
  if (f.membrosMin !== undefined) and.push({ membrosEstimados: { gte: f.membrosMin } });
  if (f.membrosMax !== undefined) and.push({ membrosEstimados: { lte: f.membrosMax } });
  if (f.federada !== undefined) and.push({ federada: f.federada });
  if (f.comContato === false) and.push({ temContato: false });
  if (f.status?.length) and.push({ statusProspeccao: { in: f.status } });
  if (f.scoreMin !== undefined) and.push({ scoreIcp: { gte: f.scoreMin } });
  if (f.scoreMax !== undefined) and.push({ scoreIcp: { lte: f.scoreMax } });
  if (f.faixaIcp?.length) and.push({ faixaIcp: { in: f.faixaIcp } });
  if (f.responsavelId?.length) {
    const ids = f.responsavelId.map((v) => (v === FILTRO_EU ? usuarioId : v));
    and.push(comNulo('responsavelId', ids, FILTRO_NENHUM));
  }
  if (f.canais?.length) and.push(filtroCanais(f.canais, f.canaisModo ?? 'algum'));
  return { AND: and };
}

const CAMPO_CANAL: Record<CanalContato, 'site' | 'instagram' | 'linkedin' | 'emailInstitucional' | 'telefoneInstitucional'> = {
  site: 'site',
  instagram: 'instagram',
  linkedin: 'linkedin',
  email: 'emailInstitucional',
  telefone: 'telefoneInstitucional',
};
const tem = (c: CanalContato): Prisma.EmpresaJuniorWhereInput => ({ [CAMPO_CANAL[c]]: { not: null } });
const naoTem = (c: CanalContato): Prisma.EmpresaJuniorWhereInput => ({ [CAMPO_CANAL[c]]: null });

/** Filtro por canais de contato institucional (ver MODOS_CANAIS). */
export function filtroCanais(canais: CanalContato[], modo: ModoCanais): Prisma.EmpresaJuniorWhereInput {
  const marcados = [...new Set(canais)];
  if (modo === 'todos') return { AND: marcados.map(tem) };
  const algum: Prisma.EmpresaJuniorWhereInput = { OR: marcados.map(tem) };
  if (modo === 'algum') return algum;
  const outros = CANAIS_CONTATO.filter((c) => !marcados.includes(c));
  return { AND: [algum, ...outros.map(naoTem)] };
}

function comNulo(
  campo: 'federacaoId' | 'responsavelId',
  valores: string[],
  especial: string,
): Prisma.EmpresaJuniorWhereInput {
  const ids = valores.filter((v) => v !== especial);
  const nulo = valores.includes(especial);
  const cond: Prisma.EmpresaJuniorWhereInput[] = [];
  if (nulo) cond.push({ [campo]: null });
  if (ids.length) cond.push({ [campo]: { in: ids } });
  return cond.length === 1 ? cond[0] : { OR: cond };
}

export function montarOrderBy(
  ordenarPor: string,
  ordem: 'asc' | 'desc',
): Prisma.EmpresaJuniorOrderByWithRelationInput[] {
  const campo = ordenarPor === 'membros' ? 'membrosEstimados' : ordenarPor;
  const nulos = ['uf', 'cidade', 'membrosEstimados'].includes(campo);
  return [
    (nulos
      ? { [campo]: { sort: ordem, nulls: 'last' } }
      : { [campo]: ordem }) as Prisma.EmpresaJuniorOrderByWithRelationInput,
    { nome: 'asc' },
    { id: 'asc' },
  ];
}
