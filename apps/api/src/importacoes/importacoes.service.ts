import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import {
  CAMPOS_IMPORTACAO,
  LIMITE_ARQUIVO_IMPORTACAO,
  type ListarImportacoesQuery,
  type MapeamentoImportacaoInput,
  type TipoImportacao,
} from '@orcestra/shared';
import { Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { AuditService } from '../common/audit.service';
import { BOM, linhaCsv } from '../common/csv';
import { FILAS } from '../filas/filas.module';
import { PrismaService } from '../prisma/prisma.service';
import { aplicarMapeamento, type ErroRelatorio } from './importacoes.executor';
import { carregarIndice, resolverEjDoContato } from './indice';
import {
  chaveContato,
  normalizarLinhaContato,
  normalizarLinhaEj,
  refDeLinha,
} from './linhas';
import { sugerirMapeamento, validarMapeamento } from './mapeamento';
import { lerArquivo, type Planilha } from './parser';

const SELECT_RESUMO = {
  id: true,
  tipo: true,
  status: true,
  arquivoNome: true,
  arquivoTamanho: true,
  estrategiaDuplicados: true,
  totalLinhas: true,
  processadas: true,
  importadas: true,
  atualizadas: true,
  ignoradas: true,
  erros: true,
  mensagemErro: true,
  criadoEm: true,
  iniciadaEm: true,
  concluidaEm: true,
  usuario: { select: { id: true, nome: true } },
} satisfies Prisma.ImportacaoSelect;

type StatusLinha = 'NOVA' | 'DUPLICADA' | 'ERRO';

@Injectable()
export class ImportacoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue(FILAS.IMPORTACOES) private readonly fila: Queue,
  ) {}

  async iniciar(
    arquivo: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    tipo: TipoImportacao,
    usuario: UsuarioAutenticado,
  ) {
    if (!arquivo) throw new BadRequestException('Envie o arquivo no campo "arquivo"');
    if (arquivo.size > LIMITE_ARQUIVO_IMPORTACAO)
      throw new PayloadTooLargeException('Arquivo maior que 10 MB');
    let planilha: Planilha;
    try {
      planilha = await lerArquivo(arquivo.buffer, arquivo.originalname);
    } catch (e) {
      throw new BadRequestException(`Não foi possível ler o arquivo: ${(e as Error).message}`);
    }
    const hash = createHash('sha256').update(arquivo.buffer).digest('hex');
    const anterior = await this.prisma.importacao.findFirst({
      where: { arquivoHash: hash, tipo, status: 'CONCLUIDA' },
      orderBy: { criadoEm: 'desc' },
      select: { id: true, concluidaEm: true },
    });
    const imp = await this.prisma.importacao.create({
      data: {
        tipo,
        arquivoNome: arquivo.originalname.slice(0, 200),
        arquivoMime: arquivo.mimetype,
        arquivoTamanho: arquivo.size,
        arquivoHash: hash,
        totalLinhas: planilha.linhas.length,
        usuarioId: usuario.id,
        arquivo: { create: { conteudo: new Uint8Array(arquivo.buffer) } },
      },
      select: { id: true },
    });
    await this.audit.registrar({
      usuarioId: usuario.id,
      acao: 'IMPORTACAO_ENVIADA',
      entidade: 'Importacao',
      entidadeId: imp.id,
      dados: { tipo, arquivo: arquivo.originalname, linhas: planilha.linhas.length },
    });
    return {
      id: imp.id,
      tipo,
      totalLinhas: planilha.linhas.length,
      colunas: planilha.colunas,
      amostra: planilha.linhas.slice(0, 10),
      mapeamentoSugerido: sugerirMapeamento(planilha.colunas, tipo),
      camposDisponiveis: CAMPOS_IMPORTACAO[tipo],
      avisoReenvio: anterior
        ? { importacaoId: anterior.id, concluidaEm: anterior.concluidaEm }
        : null,
    };
  }

  private async carregar(id: string) {
    const imp = await this.prisma.importacao.findUnique({ where: { id } });
    if (!imp) throw new NotFoundException('Importação não encontrada');
    return imp;
  }

  private async planilhaDe(id: string, nome: string) {
    const arq = await this.prisma.importacaoArquivo.findUnique({ where: { importacaoId: id } });
    if (!arq) throw new NotFoundException('Arquivo da importação não está mais disponível');
    return lerArquivo(Buffer.from(arq.conteudo), nome);
  }

  async definirMapeamento(id: string, input: MapeamentoImportacaoInput) {
    const imp = await this.carregar(id);
    if (imp.status !== 'AGUARDANDO_MAPEAMENTO')
      throw new ConflictException('A importação já foi confirmada e não aceita novo mapeamento');
    const planilha = await this.planilhaDe(id, imp.arquivoNome);
    const erros = validarMapeamento(input.mapeamento, planilha.colunas, imp.tipo);
    if (erros.length) throw new BadRequestException({ message: 'Mapeamento inválido', erros });

    const preview = await this.previsualizar(imp.tipo, planilha, input.mapeamento);
    await this.prisma.importacao.update({
      where: { id },
      data: {
        mapeamento: input.mapeamento,
        estrategiaDuplicados: input.estrategiaDuplicados,
        totalLinhas: planilha.linhas.length,
      },
    });
    return { id, estrategiaDuplicados: input.estrategiaDuplicados, ...preview };
  }

  /** Classifica TODAS as linhas (novas/duplicadas/erro) sem gravar nada. */
  private async previsualizar(
    tipo: TipoImportacao,
    planilha: Planilha,
    mapeamento: Record<string, string | null>,
  ) {
    const indice = await carregarIndice(this.prisma);
    const contatosVistos = new Set<string>();
    if (tipo === 'CONTATOS') {
      const todos = await this.prisma.contato.findMany({
        select: { empresaJuniorId: true, email: true, nome: true },
      });
      for (const c of todos) contatosVistos.add(`${c.empresaJuniorId}|${chaveContato(c)}`);
    }
    const total = { novas: 0, duplicadas: 0, comErro: 0 };
    const amostra: {
      linha: number;
      status: StatusLinha;
      dados?: unknown;
      erros: { campo?: string; mensagem: string }[];
      existenteId?: string;
    }[] = [];
    const errosPorMensagem = new Map<string, number>();

    planilha.linhas.forEach((original, i) => {
      const linha = i + 2;
      const campos = aplicarMapeamento(original, mapeamento);
      let status: StatusLinha;
      let dados: unknown;
      let erros: { campo?: string; mensagem: string }[] = [];
      let existenteId: string | undefined;

      if (tipo === 'EJS') {
        const r = normalizarLinhaEj(campos);
        dados = r.dados;
        erros = r.erros;
        if (!r.dados) status = 'ERRO';
        else {
          const ref = indice.buscar(r.dados);
          if (ref) {
            status = 'DUPLICADA';
            existenteId = ref.id.startsWith('novo:') ? undefined : ref.id;
          } else {
            status = 'NOVA';
            indice.adicionar(refDeLinha(`novo:${linha}`, r.dados));
          }
        }
      } else {
        const r = normalizarLinhaContato(campos);
        dados = r.dados;
        erros = r.erros;
        if (!r.dados) status = 'ERRO';
        else {
          const { ref, erro } = resolverEjDoContato(indice, r.dados);
          if (!ref) {
            status = 'ERRO';
            erros = [{ campo: 'ejNome', mensagem: erro! }];
          } else {
            const k = `${ref.id}|${chaveContato(r.dados)}`;
            if (contatosVistos.has(k)) {
              status = 'DUPLICADA';
              existenteId = ref.id;
            } else {
              status = 'NOVA';
              contatosVistos.add(k);
            }
          }
        }
      }
      if (status === 'NOVA') total.novas++;
      else if (status === 'DUPLICADA') total.duplicadas++;
      else {
        total.comErro++;
        for (const e of erros) errosPorMensagem.set(e.mensagem.replace(/".*?"/g, '"…"'), (errosPorMensagem.get(e.mensagem.replace(/".*?"/g, '"…"')) ?? 0) + 1);
      }
      if (amostra.length < 20) amostra.push({ linha, status, dados, erros, existenteId });
    });

    return {
      tipo,
      totalLinhas: planilha.linhas.length,
      ...total,
      errosFrequentes: [...errosPorMensagem.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([mensagem, quantidade]) => ({ mensagem, quantidade })),
      amostra,
    };
  }

  async processar(id: string, usuario: UsuarioAutenticado) {
    const imp = await this.carregar(id);
    if (!['AGUARDANDO_MAPEAMENTO', 'FALHOU'].includes(imp.status))
      throw new ConflictException(`Importação em status ${imp.status}; não pode ser processada`);
    if (!imp.mapeamento)
      throw new BadRequestException('Defina o mapeamento (PUT /importacoes/:id/mapeamento) antes de processar');

    const jobId = `imp-${id}`;
    const antigo = await this.fila.getJob(jobId);
    if (antigo) await antigo.remove().catch(() => undefined);
    await this.prisma.importacao.update({
      where: { id },
      data: { status: 'PENDENTE', jobId, mensagemErro: null },
    });
    await this.fila.add(
      'processar',
      { importacaoId: id },
      { jobId, attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 100 },
    );
    await this.audit.registrar({
      usuarioId: usuario.id,
      acao: 'IMPORTACAO_ENFILEIRADA',
      entidade: 'Importacao',
      entidadeId: id,
      dados: { tipo: imp.tipo, estrategia: imp.estrategiaDuplicados },
    });
    return this.obter(id);
  }

  async listar(q: ListarImportacoesQuery) {
    const [total, items] = await this.prisma.$transaction([
      this.prisma.importacao.count(),
      this.prisma.importacao.findMany({
        select: SELECT_RESUMO,
        orderBy: { criadoEm: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return {
      items,
      total,
      page: q.page,
      pageSize: q.pageSize,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    };
  }

  /** Progresso: contadores + percentual + 50 primeiros erros. */
  async obter(id: string) {
    const imp = await this.prisma.importacao.findUnique({
      where: { id },
      select: { ...SELECT_RESUMO, mapeamento: true, relatorioErros: true },
    });
    if (!imp) throw new NotFoundException('Importação não encontrada');
    const { relatorioErros, ...resto } = imp;
    const erros = Array.isArray(relatorioErros) ? (relatorioErros as unknown as ErroRelatorio[]) : [];
    return {
      ...resto,
      percentual: imp.totalLinhas ? Math.min(100, Math.round((imp.processadas / imp.totalLinhas) * 100)) : 0,
      errosAmostra: erros.slice(0, 50).map(({ linha, campo, mensagem }) => ({ linha, campo, mensagem })),
    };
  }

  async errosCsv(id: string): Promise<string> {
    const imp = await this.carregar(id);
    const erros = Array.isArray(imp.relatorioErros) ? (imp.relatorioErros as unknown as ErroRelatorio[]) : [];
    // Retenção (LGPD): só linha, campo e mensagem; valores originais da planilha não são guardados.
    let out = BOM + linhaCsv(['linha', 'campo', 'erro']);
    for (const e of erros) out += linhaCsv([e.linha, e.campo ?? '', e.mensagem]);
    return out;
  }
}
