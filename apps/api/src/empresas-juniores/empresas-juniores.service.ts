import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  chaveDedupe,
  chaveNome,
  normalizarNomeIes,
  regiaoEfetiva,
  type AtualizarEjInput,
  type CriarEjInput,
  type ExportarEjsQuery,
  type IesRef,
  type ListarEjsQuery,
} from '@orcestra/shared';
import { Prisma, Regiao, StatusProspeccao } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { AuditService, diffCampos } from '../common/audit.service';
import { ScoreService } from '../score/score.service';
import { StatusService } from '../funil/status.service';
import { PrismaService } from '../prisma/prisma.service';
import { montarOrderBy, montarWhere } from './filtros';
import { EJ_VISIVEL } from './visibilidade';
import { exigirEdicaoEj, podeEditarEj } from './permissoes';

/** Valor especial do filtro de federação para EJs sem federação confirmada. */
export const SEM_FEDERACAO = 'nenhuma';

const SELECT_LISTA = {
  id: true,
  nome: true,
  cidade: true,
  uf: true,
  regiao: true,
  statusProspeccao: true,
  scoreIcp: true,
  faixaIcp: true,
  verificado: true,
  federada: true,
  membrosEstimados: true,
  responsavelId: true,
  atualizadoEm: true,
  ies: { select: { id: true, nome: true, sigla: true } },
  federacao: { select: { id: true, nome: true, sigla: true } },
  responsavel: { select: { id: true, nome: true } },
  tags: { select: { id: true, nome: true, tipo: true, cor: true }, orderBy: { nome: 'asc' } },
} satisfies Prisma.EmpresaJuniorSelect;

/** Campos da EJ que compõem o diff do AuditLog (nome do campo -> valor atual). */
type Snapshot = Record<string, unknown>;

@Injectable()
export class EmpresasJunioresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly status: StatusService,
    private readonly score: ScoreService,
  ) {}

  async listar(q: ListarEjsQuery, usuario: UsuarioAutenticado) {
    const where = montarWhere(q, usuario.id);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.empresaJunior.count({ where }),
      this.prisma.empresaJunior.findMany({
        where,
        orderBy: montarOrderBy(q.ordenarPor, q.ordem),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: SELECT_LISTA,
      }),
    ]);
    return {
      items: items.map((i) => ({ ...i, podeEditar: podeEditarEj(usuario, i) })),
      total,
      page: q.page,
      pageSize: q.pageSize,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    };
  }

  /** Iterador paginado por cursor (usado na exportação CSV, sem carregar tudo na memória). */
  async *iterar(q: ExportarEjsQuery, usuario: UsuarioAutenticado, tamanho = 500) {
    const where = montarWhere(q, usuario.id);
    const orderBy = montarOrderBy(q.ordenarPor, q.ordem);
    let cursor: string | undefined;
    for (;;) {
      const lote = await this.prisma.empresaJunior.findMany({
        where,
        orderBy,
        take: tamanho,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          ...SELECT_LISTA,
          cnpj: true,
          site: true,
          instagram: true,
          emailInstitucional: true,
          telefoneInstitucional: true,
        },
      });
      if (!lote.length) return;
      yield lote;
      if (lote.length < tamanho) return;
      cursor = lote[lote.length - 1].id;
    }
  }

  async detalhar(id: string, usuario?: UsuarioAutenticado) {
    const ej = await this.prisma.empresaJunior.findUnique({
      where: { id },
      include: {
        ies: true,
        federacao: true,
        nucleo: true,
        tags: { orderBy: { nome: 'asc' } },
        responsavel: { select: { id: true, nome: true, email: true } },
      },
    });
    if (!ej) throw new NotFoundException('Empresa Júnior não encontrada');
    return { ...ej, podeEditar: usuario ? podeEditarEj(usuario, ej) : false };
  }

  async filtros() {
    const [ufs, regioes] = await Promise.all([
      this.prisma.empresaJunior.groupBy({
        by: ['uf'],
        where: EJ_VISIVEL,
        _count: { _all: true },
        orderBy: { uf: 'asc' },
      }),
      this.prisma.empresaJunior.groupBy({
        by: ['regiao'],
        where: EJ_VISIVEL,
        _count: { _all: true },
        orderBy: { regiao: 'asc' },
      }),
    ]);
    return {
      ufs: ufs.filter((u) => u.uf).map((u) => ({ uf: u.uf!, total: u._count._all })),
      regioes: regioes
        .filter((r) => r.regiao)
        .map((r) => ({ regiao: r.regiao!, total: r._count._all })),
    };
  }

  async opcoesIes(busca?: string, uf?: string) {
    const chave = busca ? chaveNome(busca) : '';
    const ies = await this.prisma.ies.findMany({
      where: {
        ...(uf ? { uf: uf.toUpperCase() } : {}),
        ...(chave ? { chave: { contains: chave } } : { empresas: { some: EJ_VISIVEL } }),
      },
      select: { id: true, nome: true, sigla: true, uf: true, _count: { select: { empresas: { where: EJ_VISIVEL } } } },
      orderBy: [{ empresas: { _count: 'desc' } }, { nome: 'asc' }],
      take: 200,
    });
    return ies.map(({ _count, ...i }) => ({ ...i, total: _count.empresas }));
  }

  async opcoesTags() {
    const tags = await this.prisma.tag.findMany({
      select: { id: true, nome: true, tipo: true, cor: true, _count: { select: { empresas: { where: EJ_VISIVEL } } } },
      orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
    });
    return tags.map(({ _count, ...t }) => ({ ...t, total: _count.empresas }));
  }

  async opcoesResponsaveis() {
    const [usuarios, carga] = await Promise.all([
      this.prisma.usuario.findMany({
        where: { ativo: true },
        select: { id: true, nome: true, papel: true },
        orderBy: { nome: 'asc' },
      }),
      this.prisma.empresaJunior.groupBy({
        by: ['responsavelId'],
        where: { ...EJ_VISIVEL, responsavelId: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const m = new Map(carga.map((c) => [c.responsavelId, c._count._all]));
    return {
      usuarios: usuarios.map((u) => ({ ...u, totalEjs: m.get(u.id) ?? 0 })),
      semResponsavel: await this.prisma.empresaJunior.count({ where: { ...EJ_VISIVEL, responsavelId: null } }),
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Cadastro manual
  // ---------------------------------------------------------------------------------------------

  async criar(input: CriarEjInput, usuario: UsuarioAutenticado) {
    let responsavelId = input.responsavelId ?? null;
    if (usuario.papel === 'SDR') {
      if (responsavelId && responsavelId !== usuario.id)
        throw new ForbiddenException('SDR só pode atribuir EJs a si mesmo');
      responsavelId = usuario.id; // SDR cria já na própria carteira (senão não poderia editar)
    }
    if (input.statusProspeccao === 'PERDIDA' || input.statusProspeccao === 'NUTRICAO')
      throw new BadRequestException('Crie a EJ e depois mude o status informando motivo/data de retorno');
    const uf = input.uf ?? null;
    const iesNome = await this.nomeIes(input.ies);
    const chave = chaveDedupe({ cnpj: input.cnpj ?? null, nome: input.nome, ies: iesNome, uf });
    await this.exigirSemDuplicado({ cnpj: input.cnpj ?? null, nome: input.nome, uf, iesNome, chave });
    await this.validarReferencias(input);
    if (responsavelId) await this.exigirUsuarioAtivo(responsavelId);

    try {
      const ej = await this.prisma.$transaction(async (tx) => {
        const ies = await this.resolverIes(input.ies, tx);
        const criada = await tx.empresaJunior.create({
          data: {
            nome: input.nome,
            nomeNormalizado: chaveNome(input.nome),
            chaveDedupe: chave,
            razaoSocial: input.razaoSocial ?? null,
            cnpj: input.cnpj ?? null,
            iesId: ies?.id ?? null,
            federacaoId: input.federacaoId ?? null,
            nucleoId: input.nucleoId ?? null,
            cidade: input.cidade ?? null,
            uf,
            regiao: (regiaoEfetiva(uf, input.regiao) as Regiao | null) ?? null,
            servicos: input.servicos ?? [],
            anoFundacao: input.anoFundacao ?? null,
            membrosEstimados: input.membrosEstimados ?? null,
            federada: input.federada ?? !!input.federacaoId,
            site: input.site ?? null,
            instagram: input.instagram ?? null,
            linkedin: input.linkedin ?? null,
            facebook: input.facebook ?? null,
            emailInstitucional: input.emailInstitucional ?? null,
            telefoneInstitucional: input.telefoneInstitucional ?? null,
            situacaoCadastral: input.situacaoCadastral ?? null,
            fonteUrl: input.fonteUrl || 'cadastro manual',
            fontes: [input.fonteUrl || 'cadastro manual'],
            coletadoEm: new Date(),
            verificado: input.verificado ?? false,
            statusProspeccao: (input.statusProspeccao as StatusProspeccao) ?? 'NAO_TRABALHADA',
            responsavelId,
            observacoes: input.observacoes ?? null,
            tags: input.tagIds?.length ? { connect: input.tagIds.map((id) => ({ id })) } : undefined,
          },
        });
        await this.status.registrarInicial(tx, criada.id, criada.statusProspeccao, usuario.id);
        await this.score.recalcularEj(criada.id, tx);
        await this.audit.registrar(
          {
            usuarioId: usuario.id,
            acao: 'EJ_CRIADA',
            entidade: 'EmpresaJunior',
            entidadeId: criada.id,
            dados: { antes: null, depois: { nome: criada.nome, cnpj: criada.cnpj, uf: criada.uf } },
          },
          tx,
        );
        return criada;
      });
      return this.detalhar(ej.id, usuario);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new ConflictException('Já existe uma Empresa Júnior com esses dados (CNPJ ou nome)');
      throw e;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Edição
  // ---------------------------------------------------------------------------------------------

  async atualizar(id: string, input: AtualizarEjInput, usuario: UsuarioAutenticado) {
    const atual = await this.prisma.empresaJunior.findUnique({
      where: { id },
      include: { ies: true, tags: { select: { id: true } } },
    });
    if (!atual) throw new NotFoundException('Empresa Júnior não encontrada');
    exigirEdicaoEj(usuario, atual);
    if (usuario.papel === 'SDR' && input.responsavelId !== undefined)
      throw new ForbiddenException('Somente GESTOR/ADMIN podem alterar o responsável');
    await this.validarReferencias(input);
    if (input.responsavelId) await this.exigirUsuarioAtivo(input.responsavelId);

    // Dados finais para recalcular chave de deduplicação.
    const nome = input.nome ?? atual.nome;
    const cnpj = input.cnpj !== undefined ? input.cnpj : atual.cnpj;
    const uf = input.uf !== undefined ? input.uf : atual.uf;
    const iesNome = input.ies !== undefined ? await this.nomeIes(input.ies) : (atual.ies?.nome ?? null);
    const chave = chaveDedupe({ cnpj, nome, ies: iesNome, uf });
    const mudouChave = chave !== atual.chaveDedupe;
    if (mudouChave || input.nome !== undefined || input.cnpj !== undefined) {
      await this.exigirSemDuplicado({ cnpj, nome, uf, iesNome, chave, ignorarId: id });
    }

    const data: Record<string, unknown> = {};
    const escalares = [
      'nome',
      'razaoSocial',
      'cnpj',
      'cidade',
      'uf',
      'servicos',
      'anoFundacao',
      'membrosEstimados',
      'federada',
      'site',
      'instagram',
      'linkedin',
      'facebook',
      'emailInstitucional',
      'telefoneInstitucional',
      'situacaoCadastral',
      'observacoes',
      'verificado',
    ] as const;
    for (const k of escalares) if (input[k] !== undefined) data[k] = input[k];
    if (input.nome !== undefined) data.nomeNormalizado = chaveNome(input.nome);
    if (mudouChave) data.chaveDedupe = chave;
    if (input.regiao !== undefined || input.uf !== undefined) {
      data.regiao = regiaoEfetiva(uf, input.regiao) ?? null;
    }

    const rel: Record<string, string | null> = {};
    if (input.federacaoId !== undefined) rel.federacaoId = input.federacaoId ?? null;
    if (input.nucleoId !== undefined) rel.nucleoId = input.nucleoId ?? null;
    if (input.responsavelId !== undefined) rel.responsavelId = input.responsavelId ?? null;

    const mexeNoStatus =
      input.statusProspeccao !== undefined ||
      input.motivoPerdaId !== undefined ||
      input.motivoPerdaDetalhe !== undefined ||
      input.dataRetornoNutricao !== undefined;

    const resultado = await this.prisma.$transaction(async (tx) => {
      if (input.ies !== undefined) {
        const ies = await this.resolverIes(input.ies, tx);
        rel.iesId = ies?.id ?? null;
      }
      for (const [campo, valor] of Object.entries(rel)) {
        const relacao = campo.replace(/Id$/, '');
        data[relacao] = valor ? { connect: { id: valor } } : { disconnect: true };
      }
      if (input.tagIds !== undefined) data.tags = { set: input.tagIds.map((t) => ({ id: t })) };

      const nova = await tx.empresaJunior.update({
        where: { id },
        data: data as Prisma.EmpresaJuniorUpdateInput,
        include: { tags: { select: { id: true } } },
      });

      const campos = [...escalares, 'regiao', 'iesId', 'federacaoId', 'nucleoId', 'responsavelId'];
      const snap = (e: typeof nova | typeof atual): Snapshot => ({
        ...Object.fromEntries(campos.map((c) => [c, (e as unknown as Snapshot)[c]])),
        tagIds: e.tags.map((t) => t.id).sort(),
      });
      if (mexeNoStatus) {
        const alvo = input.statusProspeccao ?? atual.statusProspeccao;
        const mesmo = alvo === atual.statusProspeccao;
        // Sem reenviar os campos, mantém os atuais (ex.: só trocar o detalhe da perda).
        await this.status.aplicarEmLote(
          tx,
          [atual],
          {
            status: alvo,
            motivoPerdaId: input.motivoPerdaId !== undefined ? input.motivoPerdaId : mesmo ? atual.motivoPerdaId : null,
            motivoPerdaDetalhe:
              input.motivoPerdaDetalhe !== undefined ? input.motivoPerdaDetalhe : mesmo ? atual.motivoPerdaDetalhe : null,
            dataRetornoNutricao:
              input.dataRetornoNutricao !== undefined
                ? input.dataRetornoNutricao
                : mesmo
                  ? (atual.dataRetornoNutricao?.toISOString().slice(0, 10) ?? null)
                  : null,
          },
          usuario,
          'edicao',
        );
      }
      await this.score.recalcularEj(id, tx);
      const diff = diffCampos(snap(atual), snap(nova));
      // Texto livre pode conter dado pessoal: no AuditLog fica só o indicativo de alteração.
      if (diff && 'observacoes' in diff.depois) {
        diff.antes.observacoes = 'alterado';
        diff.depois.observacoes = 'alterado';
      }
      if (diff) {
        await this.audit.registrar(
          {
            usuarioId: usuario.id,
            acao: 'EJ_EDITADA',
            entidade: 'EmpresaJunior',
            entidadeId: id,
            dados: diff as Prisma.InputJsonObject,
          },
          tx,
        );
      }
      return nova;
    });
    if (input.statusProspeccao === 'OPORTUNIDADE' && atual.statusProspeccao !== 'OPORTUNIDADE')
      await this.status.aposMudanca(usuario.id, 'OPORTUNIDADE', 1);
    return this.detalhar(resultado.id, usuario);
  }

  // ---------------------------------------------------------------------------------------------
  // Auxiliares
  // ---------------------------------------------------------------------------------------------

  private async nomeIes(ref: IesRef): Promise<string | null> {
    if (!ref) return null;
    if ('id' in ref) {
      const ies = await this.prisma.ies.findUnique({ where: { id: ref.id } });
      if (!ies) throw new BadRequestException('IES não encontrada');
      return ies.nome;
    }
    return normalizarNomeIes(ref.nome) ?? ref.nome;
  }

  private async resolverIes(ref: IesRef, db: Prisma.TransactionClient) {
    if (!ref) return null;
    if ('id' in ref) return db.ies.findUnique({ where: { id: ref.id } });
    const nome = normalizarNomeIes(ref.nome) ?? ref.nome;
    const chave = `${chaveNome(nome)}|${ref.uf}`;
    return db.ies.upsert({
      where: { chave },
      update: {},
      create: { chave, nome, uf: ref.uf, cidade: ref.cidade ?? null, sigla: ref.sigla ?? null },
    });
  }

  private async validarReferencias(input: {
    federacaoId?: string | null;
    nucleoId?: string | null;
    tagIds?: string[];
  }) {
    if (input.federacaoId && !(await this.prisma.federacao.findUnique({ where: { id: input.federacaoId } })))
      throw new BadRequestException('Federação não encontrada');
    if (input.nucleoId && !(await this.prisma.nucleo.findUnique({ where: { id: input.nucleoId } })))
      throw new BadRequestException('Núcleo não encontrado');
    if (input.tagIds?.length) {
      const n = await this.prisma.tag.count({ where: { id: { in: input.tagIds } } });
      if (n !== new Set(input.tagIds).size) throw new BadRequestException('Tag não encontrada');
    }
  }

  private async exigirUsuarioAtivo(id: string) {
    const u = await this.prisma.usuario.findUnique({ where: { id }, select: { ativo: true } });
    if (!u?.ativo) throw new BadRequestException('Responsável inexistente ou inativo');
  }

  /** 409 indicando a EJ existente: mesmo CNPJ, mesma chave (nome+IES+UF) ou mesmo nome+UF sem CNPJ divergente. */
  private async exigirSemDuplicado(p: {
    cnpj: string | null;
    nome: string;
    uf: string | null;
    iesNome: string | null;
    chave: string;
    ignorarId?: string;
  }) {
    const nomeNorm = chaveNome(p.nome);
    const candidatas = await this.prisma.empresaJunior.findMany({
      where: {
        ...(p.ignorarId ? { id: { not: p.ignorarId } } : {}),
        OR: [
          { chaveDedupe: p.chave },
          ...(p.cnpj ? [{ cnpj: p.cnpj }] : []),
          ...(p.uf ? [{ nomeNormalizado: nomeNorm, uf: p.uf }] : []),
        ],
      },
      select: { id: true, nome: true, cnpj: true, uf: true, chaveDedupe: true, ies: { select: { nome: true } } },
    });
    const dup = candidatas.find((c) => {
      if (c.chaveDedupe === p.chave || (p.cnpj && c.cnpj === p.cnpj)) return true;
      if (p.cnpj && c.cnpj) return false; // CNPJs diferentes = empresas diferentes
      const iesOk = !p.iesNome || !c.ies || chaveNome(p.iesNome) === chaveNome(c.ies.nome);
      return iesOk;
    });
    if (dup) {
      throw new ConflictException({
        message: `Já existe uma Empresa Júnior cadastrada: ${dup.nome}`,
        existenteId: dup.id,
        existenteNome: dup.nome,
      });
    }
  }
}
