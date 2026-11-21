import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { MetaInput } from '@orcestra/shared';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { AuditService } from '../common/audit.service';
import { resolverMeta, segundaDe, type MetaLinha } from '../common/semana';
import { PrismaService } from '../prisma/prisma.service';

const dia = (d: Date) => d.toISOString().slice(0, 10);
const paraLinha = (m: { usuarioId: string | null; interacoesSemana: number; reunioesSemana: number; vigenteDesde: Date }): MetaLinha => ({
  usuarioId: m.usuarioId,
  interacoesSemana: m.interacoesSemana,
  reunioesSemana: m.reunioesSemana,
  vigenteDesde: dia(m.vigenteDesde),
});

/** Segunda-feira ISO válida e não anterior à semana atual (não reescreve semanas já avaliadas). */
export function validarVigencia(vigenteDesde: string | undefined, agora = new Date()): string {
  const atual = segundaDe(agora);
  if (!vigenteDesde) return atual;
  const d = new Date(`${vigenteDesde}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || dia(d) !== vigenteDesde) throw new BadRequestException('Data inválida');
  if (d.getUTCDay() !== 1) throw new BadRequestException('vigenteDesde deve ser uma segunda-feira');
  if (vigenteDesde < atual) throw new BadRequestException('vigenteDesde não pode ser anterior à semana atual');
  return vigenteDesde;
}

@Injectable()
export class MetasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async todas(): Promise<MetaLinha[]> {
    return (await this.prisma.metaSemanal.findMany()).map(paraLinha);
  }

  /** Meta efetiva do usuário na semana (segunda AAAA-MM-DD) + origem. */
  async efetiva(usuarioId: string, segunda: string) {
    const m = resolverMeta(await this.todas(), usuarioId, segunda);
    return m
      ? { interacoesSemana: m.interacoesSemana, reunioesSemana: m.reunioesSemana, vigenteDesde: m.vigenteDesde, origem: m.usuarioId ? ('USUARIO' as const) : ('GLOBAL' as const) }
      : { interacoesSemana: 0, reunioesSemana: 0, vigenteDesde: null, origem: 'NENHUMA' as const };
  }

  async obter(usuario: UsuarioAutenticado) {
    const segunda = segundaDe(new Date());
    const vigente = await this.efetiva(usuario.id, segunda);
    if (usuario.papel !== 'ADMIN') return { vigente };
    const linhas = await this.prisma.metaSemanal.findMany({
      orderBy: [{ vigenteDesde: 'desc' }],
      include: { usuario: { select: { id: true, nome: true } } },
    });
    const fmt = (m: (typeof linhas)[number]) => ({
      id: m.id,
      usuarioId: m.usuarioId,
      usuarioNome: m.usuario?.nome ?? null,
      interacoesSemana: m.interacoesSemana,
      reunioesSemana: m.reunioesSemana,
      vigenteDesde: dia(m.vigenteDesde),
    });
    return {
      vigente,
      global: linhas.filter((m) => !m.usuarioId).map(fmt),
      overrides: linhas.filter((m) => m.usuarioId).map(fmt),
    };
  }

  async definirGlobal(input: MetaInput, usuario: UsuarioAutenticado) {
    const vig = validarVigencia(input.vigenteDesde);
    const vigenteDesde = new Date(`${vig}T00:00:00Z`);
    // único parcial (vigenteDesde WHERE usuarioId IS NULL) não é expressável no upsert do Prisma
    const atual = await this.prisma.metaSemanal.findFirst({ where: { usuarioId: null, vigenteDesde } });
    const dados = { interacoesSemana: input.interacoesSemana, reunioesSemana: input.reunioesSemana };
    const nova = atual
      ? await this.prisma.metaSemanal.update({ where: { id: atual.id }, data: { ...dados, definidoPorId: usuario.id } })
      : await this.prisma.metaSemanal.create({ data: { ...dados, usuarioId: null, vigenteDesde, definidoPorId: usuario.id } });
    await this.audit.registrar({
      usuarioId: usuario.id,
      acao: 'META_GLOBAL_DEFINIDA',
      entidade: 'MetaSemanal',
      entidadeId: nova.id,
      dados: {
        antes: atual ? { ...dados, interacoesSemana: atual.interacoesSemana, reunioesSemana: atual.reunioesSemana } : null,
        depois: { ...dados, vigenteDesde: vig },
      },
    });
    return paraLinha(nova);
  }

  async definirUsuario(usuarioId: string, input: MetaInput, usuario: UsuarioAutenticado) {
    const alvo = await this.prisma.usuario.findUnique({ where: { id: usuarioId }, select: { id: true } });
    if (!alvo) throw new NotFoundException('Usuário não encontrado');
    const vig = validarVigencia(input.vigenteDesde);
    const vigenteDesde = new Date(`${vig}T00:00:00Z`);
    const atual = await this.prisma.metaSemanal.findUnique({ where: { usuarioId_vigenteDesde: { usuarioId, vigenteDesde } } });
    const dados = { interacoesSemana: input.interacoesSemana, reunioesSemana: input.reunioesSemana };
    const nova = await this.prisma.metaSemanal.upsert({
      where: { usuarioId_vigenteDesde: { usuarioId, vigenteDesde } },
      update: { ...dados, definidoPorId: usuario.id },
      create: { ...dados, usuarioId, vigenteDesde, definidoPorId: usuario.id },
    });
    await this.audit.registrar({
      usuarioId: usuario.id,
      acao: 'META_USUARIO_DEFINIDA',
      entidade: 'MetaSemanal',
      entidadeId: nova.id,
      dados: {
        alvoId: usuarioId,
        antes: atual ? { interacoesSemana: atual.interacoesSemana, reunioesSemana: atual.reunioesSemana } : null,
        depois: { ...dados, vigenteDesde: vig },
      },
    });
    return paraLinha(nova);
  }

  /** Remove todos os overrides do SDR (volta a valer a meta global). Semanas passadas já avaliadas não são reavaliadas. */
  async removerOverride(usuarioId: string, usuario: UsuarioAutenticado) {
    const antes = await this.prisma.metaSemanal.findMany({ where: { usuarioId } });
    if (!antes.length) throw new NotFoundException('Este usuário não tem meta própria');
    await this.prisma.metaSemanal.deleteMany({ where: { usuarioId } });
    await this.audit.registrar({
      usuarioId: usuario.id,
      acao: 'META_USUARIO_REMOVIDA',
      entidade: 'MetaSemanal',
      entidadeId: usuarioId,
      dados: { antes: antes.map((m) => ({ ...paraLinha(m) })), depois: null },
    });
    return { removidas: antes.length };
  }
}
