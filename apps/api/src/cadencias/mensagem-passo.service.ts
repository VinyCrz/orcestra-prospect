import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { renderizarTemplate, type RegistrarEnvioInput } from '@orcestra/shared';
import { Prisma } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScoreService } from '../score/score.service';
import { concluirInscricaoSeCompleta } from './encerramento';
import { montarDados, montarLinks } from './mensagem';

const SELECT_CONTATO = {
  id: true,
  nome: true,
  cargo: true,
  cargoDescricao: true,
  email: true,
  telefone: true,
  whatsapp: true,
  optOut: true,
  anonimizadoEm: true,
  empresaJuniorId: true,
  principal: true,
} satisfies Prisma.ContatoSelect;
type ContatoMsg = Prisma.ContatoGetPayload<{ select: typeof SELECT_CONTATO }>;

export const MSG_OPT_OUT = 'Contato em opt-out (ou anonimizado): ação de mensagem bloqueada';

/** Bloqueia qualquer ação de mensagem para contato em opt-out/anonimizado (422). */
export function exigirContatoLiberado(c: { optOut: boolean; anonimizadoEm: Date | null }) {
  if (c.optOut || c.anonimizadoEm) throw new UnprocessableEntityException(MSG_OPT_OUT);
}

@Injectable()
export class MensagemPassoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly score: ScoreService,
  ) {}

  /** Mensagem do passo renderizada com a EJ/contato da tarefa. NADA é enviado. */
  async mensagem(tarefaId: string, u: UsuarioAutenticado) {
    const t = await this.carregar(tarefaId);
    const contato = await this.resolverContato(t, undefined, true);
    if (!contato) throw new UnprocessableEntityException('A EJ não tem contato disponível para esta mensagem');
    exigirContatoLiberado(contato);
    const dados = montarDados({ ej: t.empresaJunior!, contato, nomeSdr: u.nome });
    const modelo = t.passoCadencia!.template;
    const base = modelo?.corpo ?? t.passoCadencia!.instrucoes ?? '';
    if (!base) throw new UnprocessableEntityException('O passo não tem template nem instruções');
    const texto = renderizarTemplate(base, dados);
    const assunto = modelo?.assunto ? renderizarTemplate(modelo.assunto, dados) : null;
    return {
      canal: t.passoCadencia!.canal,
      assunto,
      texto,
      contato: {
        id: contato.id,
        nome: contato.nome,
        email: contato.email,
        telefone: contato.whatsapp ?? contato.telefone,
        optOut: contato.optOut,
      },
      links: montarLinks(t.passoCadencia!.canal, texto, assunto, contato),
    };
  }

  /** Confirmação do SDR: cria a Interação do passo e conclui a tarefa. */
  async registrarEnvio(tarefaId: string, input: RegistrarEnvioInput, u: UsuarioAutenticado) {
    const t = await this.carregar(tarefaId);
    // SDR: vale o responsável ATUAL da EJ (se a EJ mudou de carteira, o SDR antigo perde o acesso);
    // EJ sem responsável → quem tem a tarefa.
    const donoEj = t.empresaJunior!.responsavelId;
    if (u.papel === 'SDR' && (donoEj ? donoEj !== u.id : t.responsavelId !== u.id))
      throw new ForbiddenException('Somente o responsável da EJ, GESTOR ou ADMIN registram o envio');
    if (t.concluida) throw new ConflictException('Tarefa já concluída ou cancelada');
    const contato = await this.resolverContato(t, input.contatoId ?? undefined, true);
    if (!contato) throw new UnprocessableEntityException('A EJ não tem contato disponível (todos em opt-out ou sem contato)');
    exigirContatoLiberado(contato);
    const passo = t.passoCadencia!;
    const ejId = t.empresaJuniorId!;

    return this.prisma.$transaction(async (tx) => {
      const agora = new Date();
      const claim = await tx.tarefa.updateMany({
        where: { id: tarefaId, concluida: false },
        data: { concluida: true, concluidaEm: agora },
      });
      if (!claim.count) throw new ConflictException('Tarefa já concluída ou cancelada');
      const i = await tx.interacao.create({
        data: {
          empresaJuniorId: ejId,
          contatoId: contato?.id ?? null,
          usuarioId: u.id,
          canal: passo.canal,
          data: agora,
          resumo: input.resumo ?? `Passo ${passo.ordem} da cadência "${t.inscricaoCadencia!.cadencia.nome}" executado`,
          resultado: 'SEM_RESPOSTA',
          passoCadenciaId: passo.id,
          inscricaoCadenciaId: t.inscricaoCadenciaId,
        },
        select: { id: true },
      });
      await this.score.recalcularEj(ejId, tx);
      const concluiu = await concluirInscricaoSeCompleta(tx, t.inscricaoCadenciaId, u.id);
      await this.audit.registrarVarios(
        [
          {
            usuarioId: u.id,
            acao: 'INTERACAO_REGISTRADA',
            entidade: 'Interacao',
            entidadeId: i.id,
            dados: { empresaJuniorId: ejId, antes: null, depois: { canal: passo.canal, resultado: 'SEM_RESPOSTA', contatoId: contato?.id ?? null, tarefaId, inscricaoCadenciaId: t.inscricaoCadenciaId } },
          },
          {
            usuarioId: u.id,
            acao: 'TAREFA_CONCLUIDA',
            entidade: 'Tarefa',
            entidadeId: tarefaId,
            dados: { empresaJuniorId: ejId, antes: { concluida: false }, depois: { concluida: true } },
          },
        ],
        tx,
      );
      return { interacaoId: i.id, tarefaId, inscricaoConcluida: concluiu };
    });
  }

  private async carregar(id: string) {
    const t = await this.prisma.tarefa.findUnique({
      where: { id },
      select: {
        id: true,
        concluida: true,
        responsavelId: true,
        empresaJuniorId: true,
        contatoId: true,
        inscricaoCadenciaId: true,
        passoCadencia: {
          select: {
            id: true,
            ordem: true,
            canal: true,
            instrucoes: true,
            template: { select: { assunto: true, corpo: true } },
          },
        },
        inscricaoCadencia: { select: { contatoId: true, cadencia: { select: { nome: true } } } },
        empresaJunior: { select: { nome: true, cidade: true, responsavelId: true, ies: { select: { nome: true, cidade: true } } } },
      },
    });
    if (!t) throw new NotFoundException('Tarefa não encontrada');
    if (!t.passoCadencia || !t.empresaJuniorId || !t.empresaJunior || !t.inscricaoCadencia)
      throw new UnprocessableEntityException('Esta tarefa não é um passo de cadência');
    return t;
  }

  /**
   * Contato do passo: o informado, senão o da tarefa/inscrição, senão (se `permitirPadrao`) o principal da
   * EJ que não esteja em opt-out. Um contato explícito em opt-out é devolvido (o chamador bloqueia).
   */
  private async resolverContato(
    t: { empresaJuniorId: string | null; contatoId: string | null; inscricaoCadencia: { contatoId: string | null } | null },
    explicito: string | undefined,
    permitirPadrao: boolean,
  ): Promise<ContatoMsg | null> {
    const id = explicito ?? t.contatoId ?? t.inscricaoCadencia?.contatoId;
    if (id) {
      const c = await this.prisma.contato.findUnique({ where: { id }, select: SELECT_CONTATO });
      if (!c || c.empresaJuniorId !== t.empresaJuniorId)
        throw new BadRequestException('Contato não pertence a esta Empresa Júnior');
      return c;
    }
    if (!permitirPadrao) return null;
    const lista = await this.prisma.contato.findMany({
      where: { empresaJuniorId: t.empresaJuniorId!, optOut: false, anonimizadoEm: null },
      orderBy: [{ principal: 'desc' }, { criadoEm: 'asc' }],
      take: 1,
      select: SELECT_CONTATO,
    });
    return lista[0] ?? null;
  }
}
