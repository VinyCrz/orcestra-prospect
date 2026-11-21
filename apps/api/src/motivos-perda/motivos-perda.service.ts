import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AtualizarMotivoPerdaInput, CriarMotivoPerdaInput } from '@orcestra/shared';
import { Prisma } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { AuditService, diffCampos } from '../common/audit.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MotivosPerdaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listar(incluirInativos: boolean) {
    return this.prisma.motivoPerda.findMany({
      where: incluirInativos ? {} : { ativo: true },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      select: { id: true, nome: true, ativo: true, ordem: true },
    });
  }

  async criar(input: CriarMotivoPerdaInput, usuario: UsuarioAutenticado) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const ordem =
          input.ordem ?? ((await tx.motivoPerda.aggregate({ _max: { ordem: true } }))._max.ordem ?? 0) + 10;
        const m = await tx.motivoPerda.create({ data: { nome: input.nome, ordem } });
        await this.audit.registrar(
          {
            usuarioId: usuario.id,
            acao: 'MOTIVO_PERDA_CRIADO',
            entidade: 'MotivoPerda',
            entidadeId: m.id,
            dados: { antes: null, depois: { nome: m.nome, ordem: m.ordem } },
          },
          tx,
        );
        return m;
      });
    } catch (e) {
      this.tratarDuplicado(e);
      throw e;
    }
  }

  async atualizar(id: string, input: AtualizarMotivoPerdaInput, usuario: UsuarioAutenticado) {
    const atual = await this.prisma.motivoPerda.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('Motivo de perda não encontrado');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const novo = await tx.motivoPerda.update({ where: { id }, data: input });
        const campos = ['nome', 'ordem', 'ativo'];
        const pick = (m: typeof atual) => Object.fromEntries(campos.map((c) => [c, m[c as keyof typeof m]]));
        const diff = diffCampos(pick(atual), pick(novo));
        if (diff)
          await this.audit.registrar(
            {
              usuarioId: usuario.id,
              acao: input.ativo !== undefined && input.ativo !== atual.ativo
                ? input.ativo ? 'MOTIVO_PERDA_REATIVADO' : 'MOTIVO_PERDA_DESATIVADO'
                : 'MOTIVO_PERDA_EDITADO',
              entidade: 'MotivoPerda',
              entidadeId: id,
              dados: diff as Prisma.InputJsonObject,
            },
            tx,
          );
        return novo;
      });
    } catch (e) {
      this.tratarDuplicado(e);
      throw e;
    }
  }

  private tratarDuplicado(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      throw new ConflictException('Já existe um motivo de perda com esse nome');
  }
}
