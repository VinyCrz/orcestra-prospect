import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  DADOS_EXEMPLO_TEMPLATE,
  renderizarTemplate,
  type AtualizarTemplateInput,
  type CriarTemplateInput,
  type ListarTemplatesQuery,
  type PrevisualizarTemplateInput,
} from '@orcestra/shared';
import { Prisma } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { AuditService, diffCampos } from '../common/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { montarDados } from './mensagem';

const SELECT_TEMPLATE = {
  id: true,
  nome: true,
  chave: true,
  canal: true,
  assunto: true,
  corpo: true,
  ativo: true,
  criadoEm: true,
  atualizadoEm: true,
} satisfies Prisma.TemplateMensagemSelect;

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listar(q: ListarTemplatesQuery) {
    return this.prisma.templateMensagem.findMany({
      where: { ...(q.canal ? { canal: q.canal } : {}), ...(q.ativo !== undefined ? { ativo: q.ativo } : {}) },
      orderBy: [{ canal: 'asc' }, { nome: 'asc' }],
      select: SELECT_TEMPLATE,
    });
  }

  async obter(id: string) {
    const t = await this.prisma.templateMensagem.findUnique({ where: { id }, select: SELECT_TEMPLATE });
    if (!t) throw new NotFoundException('Template não encontrado');
    return t;
  }

  async criar(input: CriarTemplateInput, u: UsuarioAutenticado) {
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.templateMensagem.create({
        data: { ...input, assunto: input.assunto ?? null, criadoPorId: u.id },
        select: SELECT_TEMPLATE,
      });
      await this.audit.registrar(
        { usuarioId: u.id, acao: 'TEMPLATE_CRIADO', entidade: 'TemplateMensagem', entidadeId: t.id, dados: { antes: null, depois: { nome: t.nome, canal: t.canal, ativo: t.ativo } } },
        tx,
      );
      return t;
    });
  }

  async atualizar(id: string, input: AtualizarTemplateInput, u: UsuarioAutenticado) {
    const atual = await this.obter(id);
    const canal = input.canal ?? atual.canal;
    const assunto = input.assunto !== undefined ? input.assunto : atual.assunto;
    if (canal !== 'EMAIL' && assunto) throw new BadRequestException('Assunto só é permitido em templates de e-mail');
    if (input.canal && input.canal !== atual.canal) {
      const conflito = await this.prisma.passoCadencia.count({ where: { templateId: id, canal: { not: input.canal } } });
      if (conflito)
        throw new BadRequestException('Template em uso por passos de outro canal: não é possível mudar o canal');
    }
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.templateMensagem.update({
        where: { id },
        data: { ...input, ...(input.assunto !== undefined ? { assunto: input.assunto } : {}) },
        select: SELECT_TEMPLATE,
      });
      const campos = ['nome', 'canal', 'assunto', 'corpo', 'ativo'] as const;
      const pick = (o: typeof t) => Object.fromEntries(campos.map((c) => [c, o[c]]));
      const d = diffCampos(pick(atual), pick(t));
      if (d)
        await this.audit.registrar(
          {
            usuarioId: u.id,
            acao: input.ativo === false && atual.ativo ? 'TEMPLATE_DESATIVADO' : 'TEMPLATE_EDITADO',
            entidade: 'TemplateMensagem',
            entidadeId: id,
            dados: d as Prisma.InputJsonObject,
          },
          tx,
        );
      return t;
    });
  }

  /** Texto renderizado com a EJ/contato informados (ou dados de exemplo neutros). Bloqueia contato em opt-out. */
  async previsualizar(id: string, input: PrevisualizarTemplateInput, u: UsuarioAutenticado) {
    const t = await this.obter(id);
    let dados = { ...DADOS_EXEMPLO_TEMPLATE, nome_sdr: u.nome } as Record<string, string>;
    let ejId = input.ejId;
    let contato: Prisma.ContatoGetPayload<object> | null = null;
    if (input.contatoId) {
      contato = await this.prisma.contato.findUnique({ where: { id: input.contatoId } });
      if (!contato) throw new BadRequestException('Contato não encontrado');
      if (contato.optOut || contato.anonimizadoEm)
        throw new UnprocessableEntityException('Contato em opt-out (ou anonimizado): ação de mensagem bloqueada');
      if (ejId && ejId !== contato.empresaJuniorId) throw new BadRequestException('Contato não pertence a esta Empresa Júnior');
      ejId = contato.empresaJuniorId;
    }
    if (ejId) {
      const ej = await this.prisma.empresaJunior.findUnique({
        where: { id: ejId },
        select: { nome: true, cidade: true, ies: { select: { nome: true, cidade: true } } },
      });
      if (!ej) throw new BadRequestException('Empresa Júnior não encontrada');
      dados = montarDados({ ej, contato, nomeSdr: u.nome }) as Record<string, string>;
    }
    return {
      canal: t.canal,
      assunto: t.assunto ? renderizarTemplate(t.assunto, dados) : null,
      texto: renderizarTemplate(t.corpo, dados),
    };
  }
}
