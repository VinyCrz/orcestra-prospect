import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AtualizarContatoInput, CriarContatoInput } from '@orcestra/shared';
import type { Contato, Prisma } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import {
  AuditService,
  diffCampos,
  mascararEmail,
  mascararNome,
  mascararTelefone,
} from '../common/audit.service';
import { exigirEdicaoEj } from '../empresas-juniores/permissoes';
import { PrismaService } from '../prisma/prisma.service';

/** Dados pessoais são mascarados no AuditLog (LGPD): registramos QUE mudou, não o valor em claro. */
export const MASCARAS_CONTATO = {
  nome: mascararNome,
  email: mascararEmail,
  telefone: mascararTelefone,
  whatsapp: mascararTelefone,
  // URL do LinkedIn identifica a pessoa; motivo do opt-out e descrição do cargo são texto livre.
  linkedin: (v: string | null) => (v ? '***' : null),
  optOutMotivo: (v: string | null) => (v ? '***' : null),
  cargoDescricao: (v: string | null) => (v ? '***' : null),
};

export const CAMPOS_AUDIT = [
  'nome',
  'cargo',
  'cargoDescricao',
  'email',
  'telefone',
  'whatsapp',
  'linkedin',
  'principal',
  'mandatoInicio',
  'mandatoFim',
  'baseLegal',
  'fonte',
  'optOut',
  'optOutMotivo',
] as const;

const aData = (v: string | null | undefined) =>
  v === undefined ? undefined : v ? new Date(`${v}T00:00:00.000Z`) : null;

export function snapContato(c: Partial<Contato>): Record<string, unknown> {
  return Object.fromEntries(
    CAMPOS_AUDIT.map((k) => {
      const v = c[k];
      return [k, v instanceof Date ? v.toISOString().slice(0, 10) : (v ?? null)];
    }),
  );
}

@Injectable()
export class ContatosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async ejOuErro(id: string) {
    const ej = await this.prisma.empresaJunior.findUnique({
      where: { id },
      select: { id: true, responsavelId: true },
    });
    if (!ej) throw new NotFoundException('Empresa Júnior não encontrada');
    return ej;
  }

  async listar(ejId: string) {
    await this.ejOuErro(ejId);
    return this.prisma.contato.findMany({
      where: { empresaJuniorId: ejId },
      orderBy: [{ principal: 'desc' }, { cargo: 'asc' }, { nome: 'asc' }],
    });
  }

  async obter(id: string) {
    const c = await this.prisma.contato.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Contato não encontrado');
    return c;
  }

  async criar(ejId: string, input: CriarContatoInput, usuario: UsuarioAutenticado) {
    const ej = await this.ejOuErro(ejId);
    exigirEdicaoEj(usuario, ej);
    const optOut = input.optOut ?? false;
    return this.prisma.$transaction(async (tx) => {
      if (input.principal) await this.limparPrincipal(tx, ejId);
      const c = await tx.contato.create({
        data: {
          empresaJuniorId: ejId,
          nome: input.nome,
          cargo: input.cargo,
          cargoDescricao: input.cargoDescricao ?? null,
          email: input.email ?? null,
          telefone: input.telefone ?? null,
          whatsapp: input.whatsapp ?? null,
          linkedin: input.linkedin ?? null,
          principal: input.principal ?? false,
          mandatoInicio: aData(input.mandatoInicio) ?? null,
          mandatoFim: aData(input.mandatoFim) ?? null,
          baseLegal: input.baseLegal,
          fonte: input.fonte ?? 'manual',
          optOut,
          optOutEm: optOut ? new Date() : null,
          optOutMotivo: optOut ? (input.optOutMotivo ?? null) : null,
        },
      });
      const d = diffCampos(snapContato({}), snapContato(c), MASCARAS_CONTATO);
      await this.audit.registrar(
        {
          usuarioId: usuario.id,
          acao: 'CONTATO_CRIADO',
          entidade: 'Contato',
          entidadeId: c.id,
          dados: { empresaJuniorId: ejId, antes: null, depois: d?.depois ?? {} } as Prisma.InputJsonObject,
        },
        tx,
      );
      return c;
    });
  }

  async atualizar(id: string, input: AtualizarContatoInput, usuario: UsuarioAutenticado) {
    const atual = await this.obter(id);
    const ej = await this.ejOuErro(atual.empresaJuniorId);
    exigirEdicaoEj(usuario, ej);

    const data: Prisma.ContatoUpdateInput = {};
    for (const k of [
      'nome',
      'cargo',
      'cargoDescricao',
      'email',
      'telefone',
      'whatsapp',
      'linkedin',
      'principal',
      'baseLegal',
      'fonte',
    ] as const) {
      if (input[k] !== undefined) (data as Record<string, unknown>)[k] = input[k];
    }
    if (input.mandatoInicio !== undefined) data.mandatoInicio = aData(input.mandatoInicio);
    if (input.mandatoFim !== undefined) data.mandatoFim = aData(input.mandatoFim);
    const inicio = (input.mandatoInicio !== undefined ? input.mandatoInicio : atual.mandatoInicio?.toISOString().slice(0, 10)) ?? null;
    const fim = (input.mandatoFim !== undefined ? input.mandatoFim : atual.mandatoFim?.toISOString().slice(0, 10)) ?? null;
    if (inicio && fim && fim < inicio)
      throw new BadRequestException('Fim do mandato anterior ao início');

    if (input.optOut !== undefined) {
      data.optOut = input.optOut;
      if (input.optOut && !atual.optOut) data.optOutEm = new Date();
      if (!input.optOut) {
        data.optOutEm = null;
        data.optOutMotivo = null;
      }
    }
    if (input.optOutMotivo !== undefined && (input.optOut ?? atual.optOut))
      data.optOutMotivo = input.optOutMotivo;

    return this.prisma.$transaction(async (tx) => {
      if (input.principal) await this.limparPrincipal(tx, atual.empresaJuniorId, id);
      const novo = await tx.contato.update({ where: { id }, data });
      const d = diffCampos(snapContato(atual), snapContato(novo), MASCARAS_CONTATO);
      if (d) {
        await this.audit.registrar(
          {
            usuarioId: usuario.id,
            acao: input.optOut !== undefined && input.optOut !== atual.optOut ? 'CONTATO_OPTOUT' : 'CONTATO_EDITADO',
            entidade: 'Contato',
            entidadeId: id,
            dados: { empresaJuniorId: atual.empresaJuniorId, ...d } as Prisma.InputJsonObject,
          },
          tx,
        );
      }
      return novo;
    });
  }

  async excluir(id: string, usuario: UsuarioAutenticado) {
    const atual = await this.obter(id);
    const ej = await this.ejOuErro(atual.empresaJuniorId);
    exigirEdicaoEj(usuario, ej);
    await this.prisma.$transaction(async (tx) => {
      await tx.contato.delete({ where: { id } });
      await this.audit.registrar(
        {
          usuarioId: usuario.id,
          acao: 'CONTATO_EXCLUIDO',
          entidade: 'Contato',
          entidadeId: id,
          dados: {
            empresaJuniorId: atual.empresaJuniorId,
            antes: diffCampos({}, snapContato(atual), MASCARAS_CONTATO)?.depois ?? {},
            depois: null,
          } as Prisma.InputJsonObject,
        },
        tx,
      );
    });
    return { ok: true };
  }

  private limparPrincipal(tx: Prisma.TransactionClient, ejId: string, exceto?: string) {
    return tx.contato.updateMany({
      where: { empresaJuniorId: ejId, principal: true, ...(exceto ? { id: { not: exceto } } : {}) },
      data: { principal: false },
    });
  }
}
