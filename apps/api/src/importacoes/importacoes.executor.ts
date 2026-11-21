import { Injectable, Logger } from '@nestjs/common';
import { chaveDedupe, chaveNome, regiaoDaUf } from '@orcestra/shared';
import { Prisma, Regiao } from '@prisma/client';
import { AuditService, diffCampos } from '../common/audit.service';
import { MASCARAS_CONTATO, snapContato } from '../contatos/contatos.service';
import { PrismaService } from '../prisma/prisma.service';
import { carregarIndice, resolverEjDoContato } from './indice';
import {
  calcularMerge,
  calcularMergeContato,
  chaveContato,
  normalizarLinhaContato,
  normalizarLinhaEj,
  refDeLinha,
  type EjLinha,
  type ErroLinha,
  type IndiceEjs,
} from './linhas';
import { lerArquivo } from './parser';

export const TAMANHO_LOTE = 200;
export const MAX_ERROS_RELATORIO = 5000;

export interface ErroRelatorio {
  linha: number;
  campo?: string;
  mensagem: string;
}

interface Contadores {
  importadas: number;
  atualizadas: number;
  ignoradas: number;
  erros: number;
}

interface LinhaProc {
  /** número da linha na planilha (cabeçalho = 1) */
  linha: number;
  /** valores por campo do sistema */
  campos: Record<string, string>;
  /** valores originais por coluna do arquivo */
  original: Record<string, string>;
}

type Tx = Prisma.TransactionClient;

/** Aplica mapeamento { coluna: campo } a uma linha da planilha. */
export function aplicarMapeamento(
  original: Record<string, string>,
  mapeamento: Record<string, string | null>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [col, campo] of Object.entries(mapeamento)) if (campo) out[campo] = original[col] ?? '';
  return out;
}

/** Em contatos, valores entre aspas (e-mail, telefone, nome) viram "…" no relatório de erros. */
export function mensagemSegura(tipo: 'EJS' | 'CONTATOS', m: string): string {
  return tipo === 'CONTATOS' ? m.replace(/"[^"]*"/g, '"…"') : m;
}

@Injectable()
export class ImportacoesExecutor {
  private readonly log = new Logger(ImportacoesExecutor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Executa (ou retoma) a importação. Idempotente: concluída/cancelada não reexecuta; após falha
   * retoma do checkpoint (`processadas`), gravado na mesma transação de cada lote; e como o MESCLAR/IGNORAR
   * reconhece registros já criados, reprocessar uma linha nunca duplica.
   */
  async executar(importacaoId: string): Promise<void> {
    const imp = await this.prisma.importacao.findUnique({ where: { id: importacaoId } });
    if (!imp) return;
    if (imp.status === 'CONCLUIDA' || imp.status === 'CANCELADA') return;
    const mapeamento = imp.mapeamento as Record<string, string | null> | null;
    if (!mapeamento) throw new Error('Importação sem mapeamento');
    const arq = await this.prisma.importacaoArquivo.findUnique({ where: { importacaoId } });
    if (!arq) throw new Error('Arquivo da importação não encontrado');

    await this.prisma.importacao.update({
      where: { id: importacaoId },
      data: { status: 'PROCESSANDO', iniciadaEm: imp.iniciadaEm ?? new Date(), mensagemErro: null },
    });

    const planilha = await lerArquivo(Buffer.from(arq.conteudo), imp.arquivoNome);
    const linhas: LinhaProc[] = planilha.linhas.map((original, i) => ({
      linha: i + 2,
      original,
      campos: aplicarMapeamento(original, mapeamento),
    }));

    const cont: Contadores = {
      importadas: imp.importadas,
      atualizadas: imp.atualizadas,
      ignoradas: imp.ignoradas,
      erros: imp.erros,
    };
    const relatorio: ErroRelatorio[] = Array.isArray(imp.relatorioErros)
      ? (imp.relatorioErros as unknown as ErroRelatorio[])
      : [];

    for (let ini = imp.processadas; ini < linhas.length; ini += TAMANHO_LOTE) {
      const lote = linhas.slice(ini, ini + TAMANHO_LOTE);
      const fim = ini + lote.length;
      await this.processarLote(imp.id, imp.usuarioId, imp.tipo, imp.estrategiaDuplicados, lote, fim, cont, relatorio);
    }

    await this.prisma.importacao.update({
      where: { id: importacaoId },
      data: { status: 'CONCLUIDA', concluidaEm: new Date(), processadas: linhas.length },
    });
    await this.descartarArquivo(importacaoId);
    await this.audit.registrar({
      usuarioId: imp.usuarioId,
      acao: 'IMPORTACAO_CONCLUIDA',
      entidade: 'Importacao',
      entidadeId: imp.id,
      dados: { tipo: imp.tipo, estrategia: imp.estrategiaDuplicados, total: linhas.length, ...cont },
    });
    this.log.log(`Importação ${imp.id} concluída: ${JSON.stringify(cont)}`);
  }

  async marcarFalha(importacaoId: string, mensagem: string) {
    await this.prisma.importacao
      .updateMany({
        where: { id: importacaoId, status: { in: ['PENDENTE', 'PROCESSANDO'] } },
        data: { status: 'FALHOU', mensagemErro: mensagem.slice(0, 500) },
      })
      .catch(() => undefined);
    await this.descartarArquivo(importacaoId).catch(() => undefined);
  }

  /**
   * Retenção (LGPD): a planilha original (dados pessoais) é apagada ao terminar a importação
   * (CONCLUIDA/FALHOU), e o relatório de erros perde qualquer valor original (só linha/campo/mensagem).
   */
  async descartarArquivo(importacaoId: string) {
    await this.prisma.importacaoArquivo.deleteMany({ where: { importacaoId } });
    const imp = await this.prisma.importacao.findUnique({
      where: { id: importacaoId },
      select: { relatorioErros: true },
    });
    if (Array.isArray(imp?.relatorioErros)) {
      const limpo = (imp.relatorioErros as unknown as ErroRelatorio[]).map(({ linha, campo, mensagem }) => ({
        linha,
        campo,
        mensagem,
      }));
      await this.prisma.importacao.update({
        where: { id: importacaoId },
        data: { relatorioErros: limpo as unknown as Prisma.InputJsonValue },
      });
    }
  }

  /** Lote em uma transação (com checkpoint). Se o lote falhar, reprocessa linha a linha isolando a problemática. */
  private async processarLote(
    id: string,
    usuarioId: string | null,
    tipo: 'EJS' | 'CONTATOS',
    estrategia: 'MESCLAR' | 'IGNORAR',
    lote: LinhaProc[],
    fim: number,
    cont: Contadores,
    relatorio: ErroRelatorio[],
  ) {
    const rodar = async (
      tx: Tx,
      linhas: LinhaProc[],
      c: Contadores,
      rel: ErroRelatorio[],
      checkpoint: number,
    ) => {
      const indice = await carregarIndice(tx);
      for (const l of linhas) {
        const r =
          tipo === 'EJS'
            ? await this.linhaEj(tx, id, estrategia, indice, l, c)
            : await this.linhaContato(tx, id, usuarioId, estrategia, indice, l, c);
        if (r.length) {
          c.erros++;
          for (const e of r)
            if (rel.length < MAX_ERROS_RELATORIO)
              rel.push({ linha: l.linha, campo: e.campo, mensagem: mensagemSegura(tipo, e.mensagem) });
        }
      }
      await tx.importacao.update({
        where: { id },
        data: {
          processadas: checkpoint,
          importadas: c.importadas,
          atualizadas: c.atualizadas,
          ignoradas: c.ignoradas,
          erros: c.erros,
          relatorioErros: rel as unknown as Prisma.InputJsonValue,
        },
      });
    };

    const opts = { timeout: 120_000, maxWait: 15_000 };
    const c0 = { ...cont };
    const n0 = relatorio.length;
    try {
      await this.prisma.$transaction((tx) => rodar(tx, lote, cont, relatorio, fim), opts);
    } catch (e) {
      this.log.warn(`Lote falhou (${(e as Error).message}); reprocessando linha a linha`);
      Object.assign(cont, c0);
      relatorio.length = n0;
      for (const [i, l] of lote.entries()) {
        const ck = fim - lote.length + i + 1;
        const antes = { ...cont };
        const nAntes = relatorio.length;
        try {
          await this.prisma.$transaction((tx) => rodar(tx, [l], cont, relatorio, ck), opts);
        } catch (err) {
          Object.assign(cont, antes);
          relatorio.length = nAntes;
          cont.erros++;
          if (relatorio.length < MAX_ERROS_RELATORIO)
            relatorio.push({
              linha: l.linha,
              mensagem:
                tipo === 'CONTATOS'
                  ? 'Falha ao gravar a linha'
                  : `Falha ao gravar a linha: ${(err as Error).message.slice(0, 200)}`,
            });
          await this.prisma.importacao.update({
            where: { id },
            data: {
              processadas: ck,
              erros: cont.erros,
              relatorioErros: relatorio as unknown as Prisma.InputJsonValue,
            },
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // EJs
  // ---------------------------------------------------------------------------------------------

  private async linhaEj(
    tx: Tx,
    importacaoId: string,
    estrategia: 'MESCLAR' | 'IGNORAR',
    indice: IndiceEjs,
    l: LinhaProc,
    c: Contadores,
  ): Promise<ErroLinha[]> {
    const { dados, erros } = normalizarLinhaEj(l.campos);
    if (!dados) return erros;

    const ref = indice.buscar(dados);
    if (ref) {
      if (estrategia === 'IGNORAR') {
        c.ignoradas++;
        return [];
      }
      const r = await this.mesclarEj(tx, indice, ref.id, dados);
      if (r.erro) return [{ mensagem: r.erro }];
      if (r.alterou) c.atualizadas++;
      else c.ignoradas++;
      return [];
    }

    const federacaoId = await this.resolverFederacao(tx, dados.federacao);
    if (dados.federacao && !federacaoId)
      return [{ campo: 'federacao', mensagem: `Federação não encontrada: "${dados.federacao}"` }];
    const iesId = await this.resolverIes(tx, dados.ies, dados.uf, dados.cidade);
    const tagIds = await this.resolverTags(tx, dados.tags);
    const fonte = `importação ${importacaoId}`;
    const chave = chaveDedupe(dados);
    const criada = await tx.empresaJunior.create({
      data: {
        nome: dados.nome,
        nomeNormalizado: chaveNome(dados.nome),
        chaveDedupe: chave,
        razaoSocial: dados.razaoSocial,
        cnpj: dados.cnpj,
        iesId,
        federacaoId,
        cidade: dados.cidade,
        uf: dados.uf,
        regiao: regiaoDaUf(dados.uf) as Regiao | null,
        servicos: dados.servicos,
        anoFundacao: dados.anoFundacao,
        membrosEstimados: dados.membrosEstimados,
        federada: dados.federada ?? !!federacaoId,
        site: dados.site,
        instagram: dados.instagram,
        linkedin: dados.linkedin,
        facebook: dados.facebook,
        emailInstitucional: dados.emailInstitucional,
        telefoneInstitucional: dados.telefoneInstitucional,
        observacoes: dados.observacoes,
        fonteUrl: fonte,
        fontes: [fonte],
        coletadoEm: new Date(),
        tags: tagIds.length ? { connect: tagIds.map((id) => ({ id })) } : undefined,
      },
      select: { id: true },
    });
    indice.adicionar(refDeLinha(criada.id, dados));
    c.importadas++;
    return [];
  }

  private async mesclarEj(
    tx: Tx,
    indice: IndiceEjs,
    id: string,
    dados: EjLinha,
  ): Promise<{ alterou: boolean; erro?: string }> {
    const ex = await tx.empresaJunior.findUnique({
      where: { id },
      include: { tags: { select: { id: true } }, ies: { select: { nome: true } } },
    });
    if (!ex) return { alterou: false, erro: 'EJ existente não encontrada' };
    const federacaoId = !ex.federacaoId ? await this.resolverFederacao(tx, dados.federacao) : null;
    if (!ex.federacaoId && dados.federacao && !federacaoId)
      return { alterou: false, erro: `Federação não encontrada: "${dados.federacao}"` };
    const iesId = !ex.iesId ? await this.resolverIes(tx, dados.ies, dados.uf ?? ex.uf, dados.cidade) : null;
    const patch = calcularMerge(ex, dados, { iesId, federacaoId });

    // Se mudar a identidade (cnpj/uf/ies), recalcula a chave e evita colidir com outro registro.
    const identidade = ['cnpj', 'uf', 'iesId'].some((k) => k in patch);
    if (identidade) {
      const cnpj = (patch.cnpj as string | undefined) ?? ex.cnpj;
      const uf = (patch.uf as string | undefined) ?? ex.uf;
      let iesNome = ex.ies?.nome ?? null;
      if (patch.iesId) iesNome = dados.ies;
      const chave = chaveDedupe({ cnpj, nome: ex.nome, ies: iesNome, uf });
      const outro = indice.porChaveDe(chave);
      const cnpjOutro = patch.cnpj ? indice.porCnpjDe(patch.cnpj as string) : null;
      if ((outro && outro.id !== id) || (cnpjOutro && cnpjOutro.id !== id)) {
        delete patch.cnpj;
        delete patch.uf;
        delete patch.iesId;
        delete patch.regiao;
      } else if (chave !== ex.chaveDedupe) {
        patch.chaveDedupe = chave;
      }
    }

    const tagIds = await this.resolverTags(tx, dados.tags);
    const novasTags = tagIds.filter((t) => !ex.tags.some((x) => x.id === t));
    if (!Object.keys(patch).length && !novasTags.length) return { alterou: false };
    await tx.empresaJunior.update({
      where: { id },
      data: {
        ...(patch as Prisma.EmpresaJuniorUncheckedUpdateInput),
        ...(novasTags.length ? { tags: { connect: novasTags.map((t) => ({ id: t })) } } : {}),
      },
    });
    if (patch.chaveDedupe || patch.cnpj) {
      indice.adicionar({
        id,
        cnpj: (patch.cnpj as string | undefined) ?? ex.cnpj,
        nomeNormalizado: ex.nomeNormalizado,
        uf: (patch.uf as string | undefined) ?? ex.uf,
        iesNome: ex.ies?.nome ?? dados.ies,
        chaveDedupe: (patch.chaveDedupe as string | undefined) ?? ex.chaveDedupe,
      });
    }
    return { alterou: true };
  }

  private async resolverFederacao(tx: Tx, valor: string | null): Promise<string | null> {
    if (!valor) return null;
    const k = chaveNome(valor);
    const feds = await tx.federacao.findMany({ select: { id: true, nome: true, sigla: true } });
    return feds.find((f) => chaveNome(f.sigla) === k || chaveNome(f.nome) === k)?.id ?? null;
  }

  private async resolverIes(
    tx: Tx,
    nome: string | null,
    uf: string | null,
    cidade: string | null,
  ): Promise<string | null> {
    if (!nome) return null;
    const chave = `${chaveNome(nome)}|${uf ?? ''}`;
    const ies = await tx.ies.upsert({
      where: { chave },
      update: {},
      create: { chave, nome, uf, cidade },
      select: { id: true },
    });
    return ies.id;
  }

  private async resolverTags(tx: Tx, nomes: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const nome of nomes) {
      const k = chaveNome(nome);
      if (!k) continue;
      const chaves = [`AREA:${k}`, `CURSO:${k}`, `LIVRE:${k}`];
      const achada = await tx.tag.findFirst({ where: { chave: { in: chaves } }, select: { id: true } });
      if (achada) ids.push(achada.id);
      else {
        const t = await tx.tag.create({
          data: { nome, tipo: 'LIVRE', chave: `LIVRE:${k}` },
          select: { id: true },
        });
        ids.push(t.id);
      }
    }
    return ids;
  }

  // ---------------------------------------------------------------------------------------------
  // Contatos
  // ---------------------------------------------------------------------------------------------

  private async linhaContato(
    tx: Tx,
    importacaoId: string,
    usuarioId: string | null,
    estrategia: 'MESCLAR' | 'IGNORAR',
    indice: IndiceEjs,
    l: LinhaProc,
    c: Contadores,
  ): Promise<ErroLinha[]> {
    const { dados, erros } = normalizarLinhaContato(l.campos);
    if (!dados) return erros;
    const { ref, erro } = resolverEjDoContato(indice, dados);
    if (!ref) return [{ campo: 'ejNome', mensagem: erro! }];

    const existentes = await tx.contato.findMany({ where: { empresaJuniorId: ref.id } });
    const chave = chaveContato(dados);
    const ex = existentes.find((e) => chaveContato(e) === chave);
    if (ex) {
      // LGPD: contato com opt-out não recebe novos dados pessoais por importação.
      if (estrategia === 'IGNORAR' || ex.optOut) {
        c.ignoradas++;
        return [];
      }
      const patch = calcularMergeContato(ex, dados);
      if (!Object.keys(patch).length) {
        c.ignoradas++;
        return [];
      }
      const novo = await tx.contato.update({ where: { id: ex.id }, data: patch as Prisma.ContatoUpdateInput });
      const d = diffCampos(snapContato(ex), snapContato(novo), MASCARAS_CONTATO);
      await this.audit.registrar(
        {
          usuarioId,
          acao: 'CONTATO_EDITADO',
          entidade: 'Contato',
          entidadeId: ex.id,
          dados: { empresaJuniorId: ref.id, importacaoId, ...(d ?? {}) } as Prisma.InputJsonObject,
        },
        tx,
      );
      c.atualizadas++;
      return [];
    }
    const criado = await tx.contato.create({
      data: {
        empresaJuniorId: ref.id,
        nome: dados.nome,
        cargo: dados.cargo,
        cargoDescricao: dados.cargoDescricao,
        email: dados.email,
        telefone: dados.telefone,
        whatsapp: dados.whatsapp,
        linkedin: dados.linkedin,
        mandatoInicio: dados.mandatoInicio ? new Date(`${dados.mandatoInicio}T00:00:00.000Z`) : null,
        mandatoFim: dados.mandatoFim ? new Date(`${dados.mandatoFim}T00:00:00.000Z`) : null,
        baseLegal: dados.baseLegal,
        fonte: dados.fonte ?? `importação ${importacaoId}`,
      },
    });
    const d = diffCampos(snapContato({}), snapContato(criado), MASCARAS_CONTATO);
    await this.audit.registrar(
      {
        usuarioId,
        acao: 'CONTATO_CRIADO',
        entidade: 'Contato',
        entidadeId: criado.id,
        dados: { empresaJuniorId: ref.id, importacaoId, antes: null, depois: d?.depois ?? {} } as Prisma.InputJsonObject,
      },
      tx,
    );
    c.importadas++;
    return [];
  }
}
