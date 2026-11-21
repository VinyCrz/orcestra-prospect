import { BadRequestException, Injectable } from '@nestjs/common';
import {
  LIMITE_DISTRIBUICAO,
  type DistribuirCarteiraInput,
} from '@orcestra/shared';
import type { Prisma } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { AuditService } from '../common/audit.service';
import { montarWhere } from '../empresas-juniores/filtros';
import { PrismaService } from '../prisma/prisma.service';
import { distribuirRodizio } from './rodizio';

@Injectable()
export class CarteiraService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async distribuir(input: DistribuirCarteiraInput, usuario: UsuarioAutenticado) {
    const sdrIds = input.modo === 'MANUAL' ? [input.sdrId] : [...new Set(input.sdrIds)];
    const sdrs = await this.prisma.usuario.findMany({
      where: { id: { in: sdrIds }, ativo: true },
      select: { id: true, nome: true },
    });
    if (sdrs.length !== sdrIds.length)
      throw new BadRequestException('Usuário inexistente ou inativo na distribuição');

    const where: Prisma.EmpresaJuniorWhereInput =
      input.modo === 'MANUAL'
        ? { id: { in: input.ejIds } }
        : {
            AND: [
              montarWhere(input.filtros, usuario.id),
              input.apenasSemResponsavel ? { responsavelId: null } : {},
            ],
          };
    const ejs = await this.prisma.empresaJunior.findMany({
      where,
      take: LIMITE_DISTRIBUICAO + 1,
      select: { id: true, uf: true, responsavelId: true },
    });
    if (ejs.length > LIMITE_DISTRIBUICAO)
      throw new BadRequestException(`Mais de ${LIMITE_DISTRIBUICAO} EJs selecionadas. Refine os filtros.`);

    let atribuicao: Map<string, string>;
    if (input.modo === 'MANUAL') {
      atribuicao = new Map(ejs.map((e) => [e.id, input.sdrId]));
    } else {
      // Carga atual por SDR/UF, descontando as EJs que serão redistribuídas.
      const cargaDb = await this.prisma.empresaJunior.groupBy({
        by: ['responsavelId', 'uf'],
        where: { responsavelId: { in: sdrIds } },
        _count: { _all: true },
      });
      const carga = new Map<string, number>();
      for (const c of cargaDb) carga.set(`${c.responsavelId}|${c.uf ?? ''}`, c._count._all);
      for (const e of ejs) {
        if (e.responsavelId && sdrIds.includes(e.responsavelId)) {
          const k = `${e.responsavelId}|${e.uf ?? ''}`;
          carga.set(k, (carga.get(k) ?? 1) - 1);
        }
      }
      atribuicao = distribuirRodizio(ejs, sdrIds, carga);
    }

    const alvo = ejs.filter((e) => atribuicao.get(e.id) !== e.responsavelId);
    const porSdr = new Map<string, string[]>();
    for (const e of alvo) {
      const s = atribuicao.get(e.id)!;
      (porSdr.get(s) ?? porSdr.set(s, []).get(s)!).push(e.id);
    }
    await this.prisma.$transaction(
      async (tx) => {
        for (const [sdr, ids] of porSdr) {
          await tx.empresaJunior.updateMany({ where: { id: { in: ids } }, data: { responsavelId: sdr } });
        }
        await this.audit.registrarVarios(
          alvo.map((e) => ({
            usuarioId: usuario.id,
            acao: 'CARTEIRA_DISTRIBUIDA',
            entidade: 'EmpresaJunior',
            entidadeId: e.id,
            dados: {
              modo: input.modo,
              antes: { responsavelId: e.responsavelId },
              depois: { responsavelId: atribuicao.get(e.id)! },
            },
          })),
          tx,
        );
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    // Resumo por SDR (e UF)
    const ufPorId = new Map(ejs.map((e) => [e.id, e.uf ?? '']));
    const resumo = sdrs.map((s) => {
      const ids = porSdr.get(s.id) ?? [];
      const porUf: Record<string, number> = {};
      for (const id of ids) porUf[ufPorId.get(id) || 'SEM_UF'] = (porUf[ufPorId.get(id) || 'SEM_UF'] ?? 0) + 1;
      return { sdrId: s.id, nome: s.nome, atribuidas: ids.length, porUf };
    });
    return {
      modo: input.modo,
      selecionadas: ejs.length,
      atribuidas: alvo.length,
      semMudanca: ejs.length - alvo.length,
      resumo,
    };
  }
}
