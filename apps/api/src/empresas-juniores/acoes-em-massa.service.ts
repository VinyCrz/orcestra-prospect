import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { LIMITE_ACOES_EM_MASSA, type AcaoEmMassaInput } from '@orcestra/shared';
import { Prisma, StatusProspeccao } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { AuditService, type RegistroAudit } from '../common/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { montarWhere } from './filtros';
import { podeEditarEj } from './permissoes';

export interface ResultadoAcaoEmMassa {
  acao: AcaoEmMassaInput['acao'];
  /** EJs selecionadas (por ids ou filtros) */
  selecionadas: number;
  /** EJs efetivamente alteradas */
  alteradas: number;
  /** EJs que já estavam no estado desejado */
  semMudanca: number;
  /** EJs puladas por falta de permissão (SDR fora da carteira) */
  semPermissao: number;
}

@Injectable()
export class AcoesEmMassaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async executar(input: AcaoEmMassaInput, usuario: UsuarioAutenticado): Promise<ResultadoAcaoEmMassa> {
    if (input.acao === 'ATRIBUIR_RESPONSAVEL' && usuario.papel === 'SDR')
      throw new ForbiddenException('Somente GESTOR/ADMIN podem atribuir responsável');

    const where: Prisma.EmpresaJuniorWhereInput = input.ids
      ? { id: { in: input.ids } }
      : montarWhere(input.filtros!, usuario.id);
    const alvos = await this.prisma.empresaJunior.findMany({
      where,
      take: LIMITE_ACOES_EM_MASSA + 1,
      select: { id: true, responsavelId: true, statusProspeccao: true },
    });
    if (alvos.length > LIMITE_ACOES_EM_MASSA)
      throw new BadRequestException(
        `A ação afetaria mais de ${LIMITE_ACOES_EM_MASSA} EJs. Refine os filtros.`,
      );

    const permitidas = alvos.filter((e) => podeEditarEj(usuario, e));
    const resultado: ResultadoAcaoEmMassa = {
      acao: input.acao,
      selecionadas: alvos.length,
      alteradas: 0,
      semMudanca: 0,
      semPermissao: alvos.length - permitidas.length,
    };
    if (!permitidas.length) return resultado;

    await this.validarValor(input);
    const logs: RegistroAudit[] = [];
    const base = { usuarioId: usuario.id, entidade: 'EmpresaJunior' };

    await this.prisma.$transaction(
      async (tx) => {
        switch (input.acao) {
          case 'ATRIBUIR_RESPONSAVEL': {
            const novo = input.valor;
            const mudar = permitidas.filter((e) => e.responsavelId !== novo);
            await tx.empresaJunior.updateMany({
              where: { id: { in: mudar.map((e) => e.id) } },
              data: { responsavelId: novo },
            });
            for (const e of mudar)
              logs.push({
                ...base,
                acao: 'EJ_EDITADA_EM_MASSA',
                entidadeId: e.id,
                dados: { antes: { responsavelId: e.responsavelId }, depois: { responsavelId: novo } },
              });
            resultado.alteradas = mudar.length;
            break;
          }
          case 'MUDAR_STATUS': {
            const novo = input.valor as StatusProspeccao;
            const mudar = permitidas.filter((e) => e.statusProspeccao !== novo);
            await tx.empresaJunior.updateMany({
              where: { id: { in: mudar.map((e) => e.id) } },
              data: { statusProspeccao: novo },
            });
            for (const e of mudar)
              logs.push({
                ...base,
                acao: 'EJ_EDITADA_EM_MASSA',
                entidadeId: e.id,
                dados: {
                  antes: { statusProspeccao: e.statusProspeccao },
                  depois: { statusProspeccao: novo },
                },
              });
            resultado.alteradas = mudar.length;
            break;
          }
          case 'ADICIONAR_TAG':
          case 'REMOVER_TAG': {
            const tagId = input.valor!;
            const ids = permitidas.map((e) => e.id);
            // Tabela implícita do Prisma (A = EmpresaJunior, B = Tag).
            const atuais = await tx.$queryRaw<{ A: string }[]>(
              Prisma.sql`SELECT "A" FROM "_EmpresaJuniorToTag" WHERE "B" = ${tagId} AND "A" = ANY(${ids}::text[])`,
            );
            const tem = new Set(atuais.map((r) => r.A));
            const adicionar = input.acao === 'ADICIONAR_TAG';
            const mudar = ids.filter((id) => (adicionar ? !tem.has(id) : tem.has(id)));
            if (mudar.length) {
              if (adicionar) {
                await tx.$executeRaw(
                  Prisma.sql`INSERT INTO "_EmpresaJuniorToTag" ("A","B") SELECT x, ${tagId} FROM unnest(${mudar}::text[]) AS x ON CONFLICT DO NOTHING`,
                );
              } else {
                await tx.$executeRaw(
                  Prisma.sql`DELETE FROM "_EmpresaJuniorToTag" WHERE "B" = ${tagId} AND "A" = ANY(${mudar}::text[])`,
                );
              }
              await tx.empresaJunior.updateMany({
                where: { id: { in: mudar } },
                data: { atualizadoEm: new Date() },
              });
            }
            for (const id of mudar)
              logs.push({
                ...base,
                acao: 'EJ_EDITADA_EM_MASSA',
                entidadeId: id,
                dados: adicionar
                  ? { antes: { tagAdicionada: null }, depois: { tagAdicionada: tagId } }
                  : { antes: { tagRemovida: tagId }, depois: { tagRemovida: null } },
              });
            resultado.alteradas = mudar.length;
            break;
          }
        }
        await this.audit.registrarVarios(logs, tx);
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    resultado.semMudanca = permitidas.length - resultado.alteradas;
    return resultado;
  }

  private async validarValor(input: AcaoEmMassaInput) {
    if (input.acao === 'ATRIBUIR_RESPONSAVEL' && input.valor) {
      const u = await this.prisma.usuario.findUnique({
        where: { id: input.valor },
        select: { ativo: true },
      });
      if (!u?.ativo) throw new BadRequestException('Responsável inexistente ou inativo');
    }
    if (input.acao === 'ADICIONAR_TAG' || input.acao === 'REMOVER_TAG') {
      const t = await this.prisma.tag.findUnique({ where: { id: input.valor! } });
      if (!t) throw new BadRequestException('Tag não encontrada');
    }
  }
}
