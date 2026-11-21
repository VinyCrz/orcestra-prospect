/**
 * Etapa 4 — Score de ICP. Cálculo puro (sem I/O), usado pela API (job de recálculo) e pelo front (simulação).
 *
 * score = round(100 × Σ pontos / Σ pesos dos critérios ATIVOS). Cada critério devolve pontos em [0, peso]
 * (pode ser parcial) e um motivo legível. Sem dado = 0 pontos com motivo "sem dado".
 * Faixa: ≥ limiarA → A, ≥ limiarB → B, ≥ limiarC → C, senão D.
 */
import { z } from 'zod';
import { REGIOES } from './enums';
import { UF_SIGLAS } from './uf';

export const FAIXAS_ICP = ['A', 'B', 'C', 'D'] as const;
export type FaixaIcp = (typeof FAIXAS_ICP)[number];

export const CRITERIOS_ICP = [
  'FEDERADA',
  'FAIXA_MEMBROS',
  'AREAS_ALINHADAS',
  'REGIAO_PRIORITARIA',
  'IES_PUBLICA_PRIVADA',
  'TEM_SITE_REDES',
  'TEM_DECISOR',
  'INTERACAO_30D',
  'DADOS_VERIFICADOS',
] as const;
export type CriterioIcp = (typeof CRITERIOS_ICP)[number];

export const CARGOS_DECISORES = ['PRESIDENTE', 'DIR_GENTE_GESTAO', 'DIR_COMERCIAL', 'DIR_PROJETOS'] as const;
export const CAMPOS_SITE_REDES = ['site', 'instagram', 'linkedin', 'facebook'] as const;

// ---------------------------------------------------------------------------------------------
// Parâmetros por critério (validação Zod por chave)
// ---------------------------------------------------------------------------------------------

const faixaMembrosSchema = z
  .object({
    min: z.number().int().min(0),
    max: z.number().int().min(0).nullable(),
    percentual: z.number().min(0).max(100),
  })
  .refine((f) => f.max === null || f.max >= f.min, { message: 'max deve ser ≥ min', path: ['max'] });

export const PARAMETROS_CRITERIO = {
  FEDERADA: z.object({}).strict(),
  FAIXA_MEMBROS: z.object({ faixas: z.array(faixaMembrosSchema).max(20) }).strict(),
  AREAS_ALINHADAS: z.object({ tagIds: z.array(z.string().min(1)).max(200) }).strict(),
  REGIAO_PRIORITARIA: z
    .object({
      regioes: z.array(z.enum(REGIOES)).max(5),
      ufs: z.array(z.enum(UF_SIGLAS as unknown as [string, ...string[]])).max(27),
    })
    .strict(),
  IES_PUBLICA_PRIVADA: z.object({ preferencia: z.enum(['PUBLICA', 'PRIVADA']).nullable() }).strict(),
  TEM_SITE_REDES: z
    .object({
      campos: z.array(z.enum(CAMPOS_SITE_REDES)).min(1).max(4),
      minimo: z.number().int().min(1).max(4),
    })
    .strict(),
  TEM_DECISOR: z.object({ cargos: z.array(z.enum(CARGOS_DECISORES)).min(1) }).strict(),
  INTERACAO_30D: z.object({ dias: z.number().int().min(1).max(365) }).strict(),
  DADOS_VERIFICADOS: z.object({}).strict(),
} as const satisfies Record<CriterioIcp, z.ZodTypeAny>;

export const NOME_CRITERIO: Record<CriterioIcp, string> = {
  FEDERADA: 'Federada',
  FAIXA_MEMBROS: 'Faixa de nº de membros',
  AREAS_ALINHADAS: 'Áreas de atuação alinhadas',
  REGIAO_PRIORITARIA: 'Região/UF prioritária',
  IES_PUBLICA_PRIVADA: 'IES pública/privada',
  TEM_SITE_REDES: 'Tem site/redes',
  TEM_DECISOR: 'Contato decisor mapeado',
  INTERACAO_30D: 'Interação recente',
  DADOS_VERIFICADOS: 'Dados verificados',
};

export interface CriterioScoreConfig {
  chave: CriterioIcp;
  /** se ausente, usa o nome padrão da chave */
  nome?: string;
  peso: number;
  ativo: boolean;
  parametros: unknown;
}

export interface LimiaresScore {
  A: number;
  B: number;
  C: number;
}

export interface ConfigScoreCalculo {
  limiares: LimiaresScore;
  criterios: CriterioScoreConfig[];
}

// ---------------------------------------------------------------------------------------------
// Schema de atualização da configuração (PUT /score/config)
// ---------------------------------------------------------------------------------------------

export const limiaresScoreSchema = z
  .object({
    A: z.number().int().min(0).max(100),
    B: z.number().int().min(0).max(100),
    C: z.number().int().min(0).max(100),
  })
  .refine((l) => l.C >= 0 && l.C < l.B && l.B < l.A && l.A <= 100, {
    message: 'Limiares devem respeitar 0 ≤ C < B < A ≤ 100',
  });

export const criterioScoreInputSchema = z
  .object({
    chave: z.enum(CRITERIOS_ICP),
    peso: z.number().int().min(0).max(100),
    ativo: z.boolean(),
    parametros: z.record(z.unknown()).default({}),
  })
  .superRefine((c, ctx) => {
    const r = PARAMETROS_CRITERIO[c.chave].safeParse(c.parametros);
    if (!r.success) {
      for (const i of r.error.issues)
        ctx.addIssue({ code: 'custom', path: ['parametros', ...i.path], message: i.message });
    }
  });

export const atualizarConfigScoreSchema = z
  .object({
    limiares: limiaresScoreSchema,
    criterios: z.array(criterioScoreInputSchema).min(1).max(CRITERIOS_ICP.length),
  })
  .superRefine((c, ctx) => {
    const vistas = new Set<string>();
    for (const [i, cr] of c.criterios.entries()) {
      if (vistas.has(cr.chave))
        ctx.addIssue({ code: 'custom', path: ['criterios', i, 'chave'], message: 'Critério repetido' });
      vistas.add(cr.chave);
    }
  });
export type AtualizarConfigScoreInput = z.infer<typeof atualizarConfigScoreSchema>;

/** Soma dos pesos dos critérios ativos (a configuração final precisa ter soma > 0). */
export function somaPesosAtivos(criterios: { peso: number; ativo: boolean }[]): number {
  return criterios.reduce((s, c) => (c.ativo ? s + c.peso : s), 0);
}

export const simulacaoScoreQuerySchema = z.object({ ejId: z.string().min(1).optional() });
export const prioridadesQuerySchema = z.object({
  responsavelId: z.string().min(1).optional(),
  limite: z.coerce.number().int().min(1).max(50).default(10),
  incluirPesquisadas: z.preprocess((v) => v === true || v === 'true', z.boolean()).default(false),
});
export type PrioridadesQuery = z.infer<typeof prioridadesQuerySchema>;

// ---------------------------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------------------------

export interface DadosScoreEj {
  federada: boolean;
  membrosEstimados: number | null;
  tagIds: string[];
  regiao: string | null;
  uf: string | null;
  /** natureza da IES; null = sem IES ou natureza desconhecida */
  iesNatureza: 'PUBLICA' | 'PRIVADA' | null;
  site: string | null;
  instagram: string | null;
  linkedin: string | null;
  facebook: string | null;
  verificado: boolean;
  /** cargos dos contatos válidos (sem opt-out e não anonimizados) */
  cargosContatosValidos: string[];
  /** data da interação mais recente (qualquer data) */
  ultimaInteracaoEm: Date | string | null;
}

export interface DetalheCriterio {
  chave: CriterioIcp;
  nome: string;
  peso: number;
  pontos: number;
  motivo: string;
}

export interface ResultadoScore {
  score: number;
  faixa: FaixaIcp;
  pesoTotal: number;
  pontosTotal: number;
  detalhe: DetalheCriterio[];
}

const SEM_DADO = 'sem dado';
const r2 = (n: number) => Math.round(n * 100) / 100;
const cheio = (peso: number, motivo: string) => ({ pontos: peso, motivo });
const zero = (motivo: string) => ({ pontos: 0, motivo });

export function faixaDoScore(score: number, l: LimiaresScore): FaixaIcp {
  if (score >= l.A) return 'A';
  if (score >= l.B) return 'B';
  if (score >= l.C) return 'C';
  return 'D';
}

const DIA_MS = 86_400_000;

function avaliar(c: CriterioScoreConfig, d: DadosScoreEj, agora: Date): { pontos: number; motivo: string } {
  const parse = PARAMETROS_CRITERIO[c.chave].safeParse(c.parametros ?? {});
  if (!parse.success) return zero('parâmetros inválidos');
  const p = parse.data as Record<string, unknown>;
  switch (c.chave) {
    case 'FEDERADA':
      return d.federada ? cheio(c.peso, 'vinculada a uma federação') : zero('não federada');
    case 'FAIXA_MEMBROS': {
      if (d.membrosEstimados == null) return zero(SEM_DADO);
      const n = d.membrosEstimados;
      const faixas = p.faixas as { min: number; max: number | null; percentual: number }[];
      const f = faixas.find((x) => n >= x.min && (x.max === null || n <= x.max));
      if (!f) return zero(`${n} membros fora das faixas configuradas`);
      return { pontos: r2((c.peso * f.percentual) / 100), motivo: `${n} membros (${f.percentual}% do peso)` };
    }
    case 'AREAS_ALINHADAS': {
      const alvo = p.tagIds as string[];
      if (!alvo.length) return zero('nenhuma área configurada');
      if (!d.tagIds.length) return zero(SEM_DADO);
      const n = d.tagIds.filter((t) => alvo.includes(t)).length;
      return n > 0 ? cheio(c.peso, `${n} área(s) alinhada(s)`) : zero('nenhuma área alinhada');
    }
    case 'REGIAO_PRIORITARIA': {
      const regioes = p.regioes as string[];
      const ufs = p.ufs as string[];
      if (!regioes.length && !ufs.length) return zero('nenhuma região/UF configurada');
      if (!d.uf && !d.regiao) return zero(SEM_DADO);
      if (d.uf && ufs.includes(d.uf)) return cheio(c.peso, `UF prioritária (${d.uf})`);
      if (d.regiao && regioes.includes(d.regiao)) return cheio(c.peso, `região prioritária (${d.regiao})`);
      return zero('fora das regiões/UFs prioritárias');
    }
    case 'IES_PUBLICA_PRIVADA': {
      const pref = p.preferencia as 'PUBLICA' | 'PRIVADA' | null;
      if (!pref) return zero('nenhuma preferência configurada');
      if (!d.iesNatureza) return zero(SEM_DADO);
      const nome = d.iesNatureza === 'PUBLICA' ? 'pública' : 'privada';
      return d.iesNatureza === pref ? cheio(c.peso, `IES ${nome}`) : zero(`IES ${nome} (preferência: ${pref === 'PUBLICA' ? 'pública' : 'privada'})`);
    }
    case 'TEM_SITE_REDES': {
      const campos = p.campos as (typeof CAMPOS_SITE_REDES)[number][];
      const minimo = p.minimo as number;
      const tem = campos.filter((k) => (d[k] ?? '').toString().trim() !== '');
      if (tem.length >= minimo) return cheio(c.peso, `possui ${tem.join(', ')}`);
      return zero(tem.length ? `apenas ${tem.length} de ${minimo} canal(is) exigido(s)` : SEM_DADO);
    }
    case 'TEM_DECISOR': {
      const cargos = p.cargos as string[];
      const ok = d.cargosContatosValidos.filter((x) => cargos.includes(x));
      if (ok.length) return cheio(c.peso, `contato decisor mapeado (${[...new Set(ok)].join(', ')})`);
      return zero(d.cargosContatosValidos.length ? 'sem contato em cargo de decisão' : SEM_DADO);
    }
    case 'INTERACAO_30D': {
      const dias = p.dias as number;
      if (!d.ultimaInteracaoEm) return zero(SEM_DADO);
      const t = new Date(d.ultimaInteracaoEm).getTime();
      const idade = Math.floor((agora.getTime() - t) / DIA_MS);
      return idade <= dias ? cheio(c.peso, `interação há ${Math.max(idade, 0)} dia(s)`) : zero(`última interação há mais de ${dias} dias`);
    }
    case 'DADOS_VERIFICADOS':
      return d.verificado ? cheio(c.peso, 'cadastro verificado') : zero('cadastro não verificado');
  }
}

export function calcularScore(
  dados: DadosScoreEj,
  config: ConfigScoreCalculo,
  agora: Date = new Date(),
): ResultadoScore {
  const ativos = config.criterios.filter((c) => c.ativo);
  const pesoTotal = somaPesosAtivos(ativos);
  const detalhe: DetalheCriterio[] = ativos.map((c) => {
    const { pontos, motivo } = avaliar(c, dados, agora);
    return {
      chave: c.chave,
      nome: c.nome ?? NOME_CRITERIO[c.chave],
      peso: c.peso,
      pontos: Math.min(Math.max(pontos, 0), c.peso),
      motivo,
    };
  });
  const pontosTotal = r2(detalhe.reduce((s, x) => s + x.pontos, 0));
  const score = pesoTotal > 0 ? Math.min(100, Math.round((100 * pontosTotal) / pesoTotal)) : 0;
  return { score, faixa: faixaDoScore(score, config.limiares), pesoTotal, pontosTotal, detalhe };
}
