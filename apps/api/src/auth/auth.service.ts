import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Usuario } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { AuditService, mascararEmail } from '../common/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from './auth.types';
import { SenhaService } from './senha.service';

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export function usuarioPublico(u: Usuario) {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    papel: u.papel,
    ativo: u.ativo,
    criadoEm: u.criadoEm.toISOString(),
    ultimoLoginEm: u.ultimoLoginEm?.toISOString() ?? null,
  };
}

export interface Sessao {
  accessToken: string;
  refreshToken: string;
  refreshExpiraEm: Date;
  usuario: ReturnType<typeof usuarioPublico>;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly senhas: SenhaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, senha: string, userAgent?: string): Promise<Sessao> {
    const usuario = await this.prisma.usuario.findUnique({ where: { email: email.toLowerCase() } });
    const ok = await this.senhas.verificar(
      usuario?.senhaHash ?? (await this.senhas.hashFicticio()),
      senha,
    );
    if (!usuario || !ok) {
      const motivo = !usuario ? 'email_nao_cadastrado' : 'senha_incorreta';
      this.logger.warn(`Login recusado para "${mascararEmail(email)}": ${motivo}`);
      await this.auditarLoginFalho(usuario, email, motivo);
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    if (!usuario.ativo) {
      this.logger.warn(`Login recusado para "${mascararEmail(email)}": usuário desativado`);
      await this.auditarLoginFalho(usuario, email, 'usuario_desativado');
      throw new UnauthorizedException('Usuário desativado. Fale com um administrador.');
    }
    this.logger.log(`Login de ${mascararEmail(usuario.email)}`);
    const atualizado = await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { ultimoLoginEm: new Date() },
    });
    await this.audit.registrar({
      usuarioId: usuario.id,
      acao: 'LOGIN_OK',
      entidade: 'Usuario',
      entidadeId: usuario.id,
    });
    return this.emitirSessao(atualizado, userAgent);
  }

  private auditarLoginFalho(usuario: Usuario | null, email: string, motivo: string) {
    return this.audit.registrar({
      usuarioId: usuario?.id ?? null,
      acao: 'LOGIN_FALHOU',
      entidade: 'Usuario',
      entidadeId: usuario?.id ?? null,
      dados: { email: mascararEmail(email), motivo },
    });
  }

  /** Troca um refresh token válido por uma nova sessão (rotação). Reuso de token revogado derruba todas as sessões. */
  async refresh(refreshToken: string | undefined, userAgent?: string): Promise<Sessao> {
    if (!refreshToken) throw new UnauthorizedException('Sessão expirada');
    const registro = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { usuario: true },
    });
    if (!registro) throw new UnauthorizedException('Sessão inválida');
    if (registro.revogadoEm) {
      await this.prisma.refreshToken.updateMany({
        where: { usuarioId: registro.usuarioId, revogadoEm: null },
        data: { revogadoEm: new Date() },
      });
      this.logger.warn(`Reuso de refresh token detectado para o usuário ${registro.usuarioId}`);
      throw new UnauthorizedException('Sessão inválida');
    }
    if (registro.expiraEm.getTime() <= Date.now())
      throw new UnauthorizedException('Sessão expirada');
    if (!registro.usuario.ativo) throw new UnauthorizedException('Usuário desativado');
    await this.prisma.refreshToken.update({
      where: { id: registro.id },
      data: { revogadoEm: new Date() },
    });
    return this.emitirSessao(registro.usuario, userAgent);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revogadoEm: null },
      data: { revogadoEm: new Date() },
    });
  }

  async revogarSessoes(usuarioId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { usuarioId, revogadoEm: null },
      data: { revogadoEm: new Date() },
    });
  }

  /** Cria um token de uso único e devolve o link. No banco fica só o hash. */
  async gerarLinkRedefinicao(usuarioId: string, validadeMs: number) {
    const token = randomBytes(32).toString('base64url');
    const expiraEm = new Date(Date.now() + validadeMs);
    await this.prisma.tokenRedefinicaoSenha.create({
      data: { usuarioId, tokenHash: sha256(token), expiraEm },
    });
    return { link: `${this.config.get('WEB_URL')}/redefinir-senha?token=${token}`, expiraEm };
  }

  /** "Esqueci minha senha" (sem envio de e-mail): fora de produção o link vai para o log. */
  async solicitarRedefinicao(email: string): Promise<void> {
    const usuario = await this.prisma.usuario.findUnique({ where: { email: email.toLowerCase() } });
    if (!usuario || !usuario.ativo) return; // resposta idêntica para não revelar e-mails cadastrados
    const { link } = await this.gerarLinkRedefinicao(usuario.id, 60 * 60 * 1000);
    if (this.config.get('NODE_ENV') !== 'production') {
      this.logger.log(`[esqueci-minha-senha] Link de redefinição para ${usuario.email}: ${link}`);
    } else {
      this.logger.log(`Redefinição de senha solicitada para ${mascararEmail(usuario.email)}`);
    }
  }

  async redefinirSenha(token: string, novaSenha: string): Promise<void> {
    const registro = await this.prisma.tokenRedefinicaoSenha.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!registro || registro.usadoEm || registro.expiraEm.getTime() <= Date.now()) {
      throw new BadRequestException('Link de redefinição inválido ou expirado');
    }
    const senhaHash = await this.senhas.hash(novaSenha);
    await this.prisma.$transaction([
      this.prisma.usuario.update({ where: { id: registro.usuarioId }, data: { senhaHash } }),
      this.prisma.tokenRedefinicaoSenha.update({
        where: { id: registro.id },
        data: { usadoEm: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { usuarioId: registro.usuarioId, revogadoEm: null },
        data: { revogadoEm: new Date() },
      }),
    ]);
  }

  private async emitirSessao(usuario: Usuario, userAgent?: string): Promise<Sessao> {
    const payload: JwtPayload = { sub: usuario.id, papel: usuario.papel, email: usuario.email };
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = randomBytes(48).toString('base64url');
    const dias = Number(this.config.get('REFRESH_TOKEN_TTL_DIAS') ?? 7);
    const refreshExpiraEm = new Date(Date.now() + dias * 24 * 3600 * 1000);
    await this.prisma.refreshToken.create({
      data: {
        usuarioId: usuario.id,
        tokenHash: sha256(refreshToken),
        expiraEm: refreshExpiraEm,
        userAgent: userAgent?.slice(0, 255),
      },
    });
    return { accessToken, refreshToken, refreshExpiraEm, usuario: usuarioPublico(usuario) };
  }
}
