import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AtualizarUsuarioInput, CriarUsuarioInput } from '@orcestra/shared';
import { AuthService, usuarioPublico } from '../auth/auth.service';
import { esquecerUsuario } from '../auth/guards/jwt-auth.guard';
import { SenhaService } from '../auth/senha.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly senhas: SenhaService,
    private readonly auth: AuthService,
  ) {}

  async listar() {
    const usuarios = await this.prisma.usuario.findMany({
      orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
    });
    return usuarios.map(usuarioPublico);
  }

  async criar(dados: CriarUsuarioInput, autorId: string) {
    const existe = await this.prisma.usuario.findUnique({ where: { email: dados.email } });
    if (existe) throw new ConflictException('Já existe um usuário com este e-mail');
    const usuario = await this.prisma.usuario.create({
      data: {
        nome: dados.nome,
        email: dados.email,
        papel: dados.papel,
        senhaHash: await this.senhas.hash(dados.senha),
      },
    });
    await this.auditar(autorId, 'USUARIO_CRIADO', usuario.id, {
      email: usuario.email,
      papel: usuario.papel,
    });
    return usuarioPublico(usuario);
  }

  async atualizar(id: string, dados: AtualizarUsuarioInput, autorId: string) {
    const alvo = await this.prisma.usuario.findUnique({ where: { id } });
    if (!alvo) throw new NotFoundException('Usuário não encontrado');
    if (id === autorId && (dados.ativo === false || (dados.papel && dados.papel !== 'ADMIN'))) {
      throw new BadRequestException('Você não pode desativar nem rebaixar o próprio usuário');
    }
    const deixaDeSerAdminAtivo =
      alvo.papel === 'ADMIN' &&
      alvo.ativo &&
      (dados.ativo === false || (dados.papel && dados.papel !== 'ADMIN'));
    if (deixaDeSerAdminAtivo) {
      const admins = await this.prisma.usuario.count({ where: { papel: 'ADMIN', ativo: true } });
      if (admins <= 1)
        throw new BadRequestException('É preciso manter pelo menos um administrador ativo');
    }
    const usuario = await this.prisma.usuario.update({ where: { id }, data: dados });
    esquecerUsuario(id);
    if (dados.ativo === false) await this.auth.revogarSessoes(id);
    await this.auditar(autorId, 'USUARIO_ATUALIZADO', id, dados);
    return usuarioPublico(usuario);
  }

  /** O ADMIN gera um link de redefinição (válido por 24 h) para mandar à pessoa por WhatsApp etc. */
  async linkRedefinicao(id: string, autorId: string) {
    const alvo = await this.prisma.usuario.findUnique({ where: { id } });
    if (!alvo) throw new NotFoundException('Usuário não encontrado');
    if (!alvo.ativo) throw new BadRequestException('Reative o usuário antes de gerar o link');
    // só o link mais novo vale
    await this.prisma.tokenRedefinicaoSenha.updateMany({
      where: { usuarioId: id, usadoEm: null },
      data: { usadoEm: new Date() },
    });
    const r = await this.auth.gerarLinkRedefinicao(id, 24 * 60 * 60 * 1000);
    await this.auditar(autorId, 'LINK_REDEFINICAO_GERADO', id, { email: alvo.email });
    return { link: r.link, expiraEm: r.expiraEm.toISOString() };
  }

  private auditar(usuarioId: string, acao: string, entidadeId: string, dados: object) {
    return this.prisma.auditLog.create({
      data: { usuarioId, acao, entidade: 'Usuario', entidadeId, dados: dados as object },
    });
  }
}
