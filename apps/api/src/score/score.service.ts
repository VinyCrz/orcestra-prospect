import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import {
  calcularScore,
  CRITERIOS_ICP,
  NOME_CRITERIO,
  somaPesosAtivos,
  type AtualizarConfigScoreInput,
  type ConfigScoreCalculo,
  type CriterioScoreConfig,
  type DadosScoreEj,
  type PrioridadesQuery,
} from '@orcestra/shared';
import { Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { AuditService } from '../common/audit.service';
import { EJ_VISIVEL } from '../empresas-juniores/visibilidade';
import { FILAS } from '../filas/filas.module';
import { PrismaService } from '../prisma/prisma.service';

type Cliente = Prisma.TransactionClient | PrismaService;

export const TAMANHO_LOTE_SCORE = 500;
export const ID_CONFIG_SCORE = 'default';

export interface JobScore {
  /** true = recalcula todas as EJs; false = só as com scoreVersao diferente da versão atual */
  forcar: boolean;
}

export interface ConfigScoreCompleta extends ConfigScoreCalculo {
  versao: number;
  criterios: (CriterioScoreConfig & { nome: string; descricao: string | null; ordem: number })[];
}

@Injectable()
export class ScoreService implements OnApplicationBootstrap {
  private readonly log = new Logger(ScoreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue(FILAS.SCORE) private readonly fila: Queue,
  ) {}

  /** Decisão: no boot, se houver EJ nunca calculada (faixaIcp null) enfileira o recálculo (jobId fixo = sem duplicar). */
  async onApplicationBootstrap() {
    try {
      const pendente = await this.prisma.empresaJunior.findFirst({
        where: { faixaIcp: null },
        select: { id: true },
      });
      if (pendente) {
        await this.enfileirar(false, 'recalculo-inicial');
        this.log.log('EJs sem score encontradas: recálculo inicial enfileirado');
      }
    } catch (e) {
      this.log.error(`Falha ao enfileirar recálculo inicial: ${(e as Error).message}`);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Configuração
  // ---------------------------------------------------------------------------------------------

  async carregarConfig(db: Cliente = this.prisma): Promise<ConfigScoreCompleta> {
    const [cfg, criterios] = await Promise.all([
      db.configScore.upsert({ where: { id: ID_CONFIG_SCORE }, create: { id: ID_CONFIG_SCORE }, update: {} }),
      db.criterioScore.findMany({ orderBy: [{ ordem: 'asc' }, { chave: 'asc' }] }),
    ]);
    return {
      versao: cfg.versao,
      limiares: { A: cfg.limiarA, B: cfg.limiarB, C: cfg.limiarC },
      criterios: criterios.map((c) => ({
        chave: c.chave,
        nome: c.nome,
        descricao: c.descricao,
        peso: c.peso,
        ativo: c.ativo,
        parametros: c.parametros,
        ordem: c.ordem,
      })),
    };
  }

  async obterConfig() {
    const cfg = await this.carregarConfig();
    const [pendentes, atualizada] = await Promise.all([
      this.contarPendentes(cfg.versao),
      this.prisma.configScore.findUnique({ where: { id: ID_CONFIG_SCORE }, select: { atualizadoEm: true, atualizadoPor: { select: { id: true, nome: true } } } }),
    ]);
    return {
      ...cfg,
      somaPesosAtivos: somaPesosAtivos(cfg.criterios),
      pendentesRecalculo: pendentes,
      atualizadoEm: atualizada?.atualizadoEm ?? null,
      atualizadoPor: atualizada?.atualizadoPor ?? null,
    };
  }

  async atualizarConfig(input: AtualizarConfigScoreInput, usuario: UsuarioAutenticado) {
    const atual = await this.carregarConfig();
    const porChave = new Map(atual.criterios.map((c) => [c.chave, c]));
    const final = new Map(porChave);
    for (const c of input.criterios) {
      const ex = porChave.get(c.chave);
      final.set(c.chave, {
        chave: c.chave,
        nome: ex?.nome ?? NOME_CRITERIO[c.chave],
        descricao: ex?.descricao ?? null,
        ordem: ex?.ordem ?? (CRITERIOS_ICP.indexOf(c.chave) + 1) * 10,
        peso: c.peso,
        ativo: c.ativo,
        parametros: c.parametros,
      });
    }
    const lista = [...final.values()];
    if (somaPesosAtivos(lista) <= 0)
      throw new BadRequestException('A soma dos pesos dos critérios ativos deve ser maior que zero');

    const tagIds = [...new Set(input.criterios.filter((c) => c.chave === 'AREAS_ALINHADAS').flatMap((c) => (c.parametros as { tagIds?: string[] }).tagIds ?? []))];
    if (tagIds.length && (await this.prisma.tag.count({ where: { id: { in: tagIds } } })) !== tagIds.length)
      throw new BadRequestException('Tag de área não encontrada');

    const snap = (cfg: { limiares: unknown; criterios: CriterioScoreConfig[] }) => ({
      limiares: cfg.limiares,
      criterios: [...cfg.criterios]
        .sort((a, b) => a.chave.localeCompare(b.chave))
        .map((c) => ({ chave: c.chave, peso: c.peso, ativo: c.ativo, parametros: c.parametros })),
    });
    const antes = snap(atual);
    const depois = snap({ limiares: input.limiares, criterios: lista });
    if (JSON.stringify(antes) === JSON.stringify(depois)) return this.obterConfig();

    const versao = await this.prisma.$transaction(async (tx) => {
      for (const c of input.criterios) {
        const f = final.get(c.chave)!;
        await tx.criterioScore.upsert({
          where: { chave: c.chave },
          create: { chave: c.chave, nome: f.nome, descricao: f.descricao, ordem: f.ordem, peso: c.peso, ativo: c.ativo, parametros: c.parametros as Prisma.InputJsonObject, atualizadoPorId: usuario.id },
          update: { peso: c.peso, ativo: c.ativo, parametros: c.parametros as Prisma.InputJsonObject, atualizadoPorId: usuario.id },
        });
      }
      const cfg = await tx.configScore.upsert({
        where: { id: ID_CONFIG_SCORE },
        create: { id: ID_CONFIG_SCORE, limiarA: input.limiares.A, limiarB: input.limiares.B, limiarC: input.limiares.C, versao: atual.versao + 1, atualizadoPorId: usuario.id },
        update: { limiarA: input.limiares.A, limiarB: input.limiares.B, limiarC: input.limiares.C, versao: { increment: 1 }, atualizadoPorId: usuario.id },
      });
      await this.audit.registrar(
        {
          usuarioId: usuario.id,
          acao: 'SCORE_CONFIG_ATUALIZADA',
          entidade: 'ConfigScore',
          entidadeId: ID_CONFIG_SCORE,
          dados: { antes: { versao: atual.versao, ...antes }, depois: { versao: cfg.versao, ...depois } } as unknown as Prisma.InputJsonObject,
        },
        tx,
      );
      return cfg.versao;
    });
    await this.enfileirar(false);
    this.log.log(`Configuração do score atualizada (versão ${versao}); recálculo enfileirado`);
    return this.obterConfig();
  }

  async solicitarRecalculo(usuario: UsuarioAutenticado) {
    await this.enfileirar(true);
    await this.audit.registrar({
      usuarioId: usuario.id,
      acao: 'SCORE_RECALCULO_SOLICITADO',
      entidade: 'ConfigScore',
      entidadeId: ID_CONFIG_SCORE,
      dados: { forcar: true },
    });
    return { enfileirado: true };
  }

  private enfileirar(forcar: boolean, jobId?: string) {
    return this.fila.add('recalcular', { forcar } satisfies JobScore, {
      ...(jobId ? { jobId } : {}),
      removeOnComplete: 20,
      removeOnFail: 50,
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Simulação
  // ---------------------------------------------------------------------------------------------

  /** Com ejId: calcula (sem gravar) com a configuração atual. Sem: distribuição de EJs por faixa. */
  async simular(ejId?: string) {
    const cfg = await this.carregarConfig();
    if (ejId) {
      const mapa = await this.calcularLote([ejId], cfg, this.prisma);
      const r = mapa.get(ejId);
      if (!r) throw new NotFoundException('Empresa Júnior não encontrada');
      return { ejId, versaoConfig: cfg.versao, ...r };
    }
    const grupos = await this.prisma.empresaJunior.groupBy({ by: ['faixaIcp'], _count: { _all: true } });
    const distribuicao: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, SEM_CALCULO: 0 };
    for (const g of grupos) distribuicao[g.faixaIcp ?? 'SEM_CALCULO'] = g._count._all;
    return { versaoConfig: cfg.versao, limiares: cfg.limiares, distribuicao };
  }

  // ---------------------------------------------------------------------------------------------
  // Cálculo e persistência
  // ---------------------------------------------------------------------------------------------

  /** Recalcula e grava uma EJ (use dentro da transação do chamador passando `db`). */
  async recalcularEj(id: string, db: Cliente = this.prisma) {
    await this.recalcularEjs([id], db);
  }

  /** Recalcula e grava várias EJs, em lotes, com consultas agregadas por lote. Retorna quantas foram gravadas. */
  async recalcularEjs(ids: string[], db: Cliente = this.prisma): Promise<number> {
    const unicos = [...new Set(ids)];
    if (!unicos.length) return 0;
    const cfg = await this.carregarConfig(db);
    let gravadas = 0;
    for (let i = 0; i < unicos.length; i += TAMANHO_LOTE_SCORE) {
      gravadas += await this.processarLote(unicos.slice(i, i + TAMANHO_LOTE_SCORE), cfg, db);
    }
    return gravadas;
  }

  /** Job: percorre as EJs por cursor de id, em lotes. Idempotente (reexecutar só refaz o que ainda estiver defasado). */
  async recalcularEmMassa(forcar: boolean): Promise<{ processadas: number; versao: number }> {
    const cfg = await this.carregarConfig();
    let cursor: string | undefined;
    let processadas = 0;
    for (;;) {
      const lote = await this.prisma.empresaJunior.findMany({
        where: {
          ...(cursor ? { id: { gt: cursor } } : {}),
          ...(forcar ? {} : { OR: [{ scoreVersao: null }, { scoreVersao: { not: cfg.versao } }] }),
        },
        orderBy: { id: 'asc' },
        take: TAMANHO_LOTE_SCORE,
        select: { id: true },
      });
      if (!lote.length) break;
      processadas += await this.processarLote(lote.map((e) => e.id), cfg, this.prisma);
      cursor = lote[lote.length - 1].id;
    }
    this.log.log(`Recálculo do score: ${processadas} EJs (versão ${cfg.versao}, forçado=${forcar})`);
    return { processadas, versao: cfg.versao };
  }

  private contarPendentes(versao: number) {
    return this.prisma.empresaJunior.count({
      where: { OR: [{ scoreVersao: null }, { scoreVersao: { not: versao } }] },
    });
  }

  private async processarLote(ids: string[], cfg: ConfigScoreCompleta, db: Cliente): Promise<number> {
    const calculado = await this.calcularLote(ids, cfg, db);
    if (!calculado.size) return 0;
    const lista = [...calculado.entries()];
    await db.$executeRaw(Prisma.sql`
      UPDATE "empresas_juniores" e
      SET "scoreIcp" = v.s, "faixaIcp" = v.f::"FaixaIcp", "scoreDetalhe" = v.d::jsonb,
          "scoreCalculadoEm" = now(), "scoreVersao" = ${cfg.versao}::int
      FROM unnest(${lista.map(([id]) => id)}::text[], ${lista.map(([, r]) => r.score)}::int[],
                  ${lista.map(([, r]) => r.faixa)}::text[], ${lista.map(([, r]) => JSON.stringify(r.detalhe))}::text[])
           AS v(id, s, f, d)
      WHERE e.id = v.id`);
    return lista.length;
  }

  /** Busca os dados de um lote (4 consultas, sem N+1) e aplica o cálculo puro. */
  private async calcularLote(ids: string[], cfg: ConfigScoreCompleta, db: Cliente) {
    const [ejs, contatos, interacoes] = await Promise.all([
      db.empresaJunior.findMany({
        where: { id: { in: ids } },
        select: {
          id: true, federada: true, membrosEstimados: true, regiao: true, uf: true, site: true, instagram: true,
          linkedin: true, facebook: true, verificado: true,
          ies: { select: { natureza: true } },
          tags: { select: { id: true } },
        },
      }),
      db.contato.findMany({
        where: { empresaJuniorId: { in: ids }, optOut: false, anonimizadoEm: null },
        select: { empresaJuniorId: true, cargo: true },
      }),
      db.interacao.groupBy({ by: ['empresaJuniorId'], where: { empresaJuniorId: { in: ids } }, _max: { data: true } }),
    ]);
    const cargos = new Map<string, string[]>();
    for (const c of contatos) cargos.set(c.empresaJuniorId, [...(cargos.get(c.empresaJuniorId) ?? []), c.cargo]);
    const ultima = new Map(interacoes.map((i) => [i.empresaJuniorId, i._max.data]));
    const agora = new Date();
    const out = new Map<string, ReturnType<typeof calcularScore>>();
    for (const e of ejs) {
      const dados: DadosScoreEj = {
        federada: e.federada,
        membrosEstimados: e.membrosEstimados,
        tagIds: e.tags.map((t) => t.id),
        regiao: e.regiao,
        uf: e.uf,
        iesNatureza: e.ies?.natureza ?? null,
        site: e.site,
        instagram: e.instagram,
        linkedin: e.linkedin,
        facebook: e.facebook,
        verificado: e.verificado,
        cargosContatosValidos: cargos.get(e.id) ?? [],
        ultimaInteracaoEm: ultima.get(e.id) ?? null,
      };
      out.set(e.id, calcularScore(dados, cfg, agora));
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // Prioridades da semana
  // ---------------------------------------------------------------------------------------------

  async prioridades(q: PrioridadesQuery, usuario: UsuarioAutenticado) {
    // SDR sempre vê a própria carteira; GESTOR/ADMIN escolhem (padrão: a própria).
    const responsavelId = usuario.papel === 'SDR' ? usuario.id : (q.responsavelId ?? usuario.id);
    const itens = await this.prisma.empresaJunior.findMany({
      where: {
        ...EJ_VISIVEL,
        responsavelId,
        statusProspeccao: { in: q.incluirPesquisadas ? ['NAO_TRABALHADA', 'PESQUISADA'] : ['NAO_TRABALHADA'] },
      },
      orderBy: [{ scoreIcp: 'desc' }, { nome: 'asc' }, { id: 'asc' }],
      take: q.limite,
      select: {
        id: true, nome: true, cidade: true, uf: true, scoreIcp: true, faixaIcp: true, statusProspeccao: true,
        membrosEstimados: true, responsavelId: true,
        ies: { select: { id: true, nome: true, sigla: true } },
      },
    });
    return { responsavelId, items: itens };
  }
}
