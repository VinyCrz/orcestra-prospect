import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  filtrosEjSchema,
  type AtualizarListaSalvaInput,
  type ListaSalvaInput,
} from '@orcestra/shared';
import type { ListaSalva, Prisma } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../prisma/prisma.service';

type ListaComDono = ListaSalva & { dono: { id: string; nome: string } };

@Injectable()
export class ListasSalvasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private apresentar(l: ListaComDono, usuario: UsuarioAutenticado) {
    const filtros = filtrosEjSchema.safeParse(l.filtros);
    return {
      id: l.id,
      nome: l.nome,
      descricao: l.descricao,
      filtros: filtros.success ? filtros.data : {},
      compartilhada: l.compartilhada,
      dono: l.dono,
      minha: l.donoId === usuario.id,
      podeEditar: l.donoId === usuario.id || usuario.papel === 'ADMIN',
      criadoEm: l.criadoEm,
      atualizadoEm: l.atualizadoEm,
    };
  }

  async listar(usuario: UsuarioAutenticado) {
    const listas = await this.prisma.listaSalva.findMany({
      where: { OR: [{ donoId: usuario.id }, { compartilhada: true }] },
      include: { dono: { select: { id: true, nome: true } } },
      orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    });
    return listas.map((l) => this.apresentar(l, usuario));
  }

  async obter(id: string, usuario: UsuarioAutenticado) {
    const l = await this.prisma.listaSalva.findUnique({
      where: { id },
      include: { dono: { select: { id: true, nome: true } } },
    });
    if (!l || (l.donoId !== usuario.id && !l.compartilhada))
      throw new NotFoundException('Lista não encontrada');
    return this.apresentar(l, usuario);
  }

  async criar(input: ListaSalvaInput, usuario: UsuarioAutenticado) {
    const l = await this.prisma.listaSalva.create({
      data: {
        nome: input.nome,
        descricao: input.descricao ?? null,
        filtros: input.filtros as Prisma.InputJsonObject,
        compartilhada: input.compartilhada,
        donoId: usuario.id,
      },
      include: { dono: { select: { id: true, nome: true } } },
    });
    await this.audit.registrar({
      usuarioId: usuario.id,
      acao: 'LISTA_CRIADA',
      entidade: 'ListaSalva',
      entidadeId: l.id,
      dados: { antes: null, depois: { nome: l.nome, compartilhada: l.compartilhada } },
    });
    return this.apresentar(l, usuario);
  }

  private async exigirDono(id: string, usuario: UsuarioAutenticado) {
    const l = await this.prisma.listaSalva.findUnique({ where: { id } });
    if (!l) throw new NotFoundException('Lista não encontrada');
    if (l.donoId !== usuario.id && usuario.papel !== 'ADMIN')
      throw new ForbiddenException('Somente o dono (ou ADMIN) pode alterar esta lista');
    return l;
  }

  async atualizar(id: string, input: AtualizarListaSalvaInput, usuario: UsuarioAutenticado) {
    const antes = await this.exigirDono(id, usuario);
    const l = await this.prisma.listaSalva.update({
      where: { id },
      data: {
        ...(input.nome !== undefined ? { nome: input.nome } : {}),
        ...(input.descricao !== undefined ? { descricao: input.descricao } : {}),
        ...(input.filtros !== undefined ? { filtros: input.filtros as Prisma.InputJsonObject } : {}),
        ...(input.compartilhada !== undefined ? { compartilhada: input.compartilhada } : {}),
      },
      include: { dono: { select: { id: true, nome: true } } },
    });
    await this.audit.registrar({
      usuarioId: usuario.id,
      acao: 'LISTA_EDITADA',
      entidade: 'ListaSalva',
      entidadeId: id,
      dados: {
        antes: { nome: antes.nome, compartilhada: antes.compartilhada },
        depois: { nome: l.nome, compartilhada: l.compartilhada },
      },
    });
    return this.apresentar(l, usuario);
  }

  async excluir(id: string, usuario: UsuarioAutenticado) {
    const l = await this.exigirDono(id, usuario);
    await this.prisma.listaSalva.delete({ where: { id } });
    await this.audit.registrar({
      usuarioId: usuario.id,
      acao: 'LISTA_EXCLUIDA',
      entidade: 'ListaSalva',
      entidadeId: id,
      dados: { antes: { nome: l.nome }, depois: null },
    });
    return { ok: true };
  }
}
