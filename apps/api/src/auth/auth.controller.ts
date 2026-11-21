import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  esqueciSenhaSchema,
  loginSchema,
  redefinirSenhaSchema,
  type EsqueciSenhaInput,
  type LoginInput,
  type RedefinirSenhaInput,
} from '@orcestra/shared';
import type { CookieOptions, Request, Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, usuarioPublico, type Sessao } from './auth.service';
import { EsqueciSenhaDto, LoginDto, RedefinirSenhaDto } from './auth.dto';
import { REFRESH_COOKIE, type UsuarioAutenticado } from './auth.types';
import { Public } from './decorators/public.decorator';
import { UsuarioAtual } from './decorators/usuario-atual.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private cookieOpts(expira?: Date): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get<boolean>('COOKIE_SECURE') ?? false,
      sameSite: 'strict',
      path: '/',
      expires: expira,
    };
  }

  private responder(res: Response, s: Sessao) {
    res.cookie(REFRESH_COOKIE, s.refreshToken, this.cookieOpts(s.refreshExpiraEm));
    return { accessToken: s.accessToken, usuario: s.usuario };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiBody({ type: LoginDto })
  @ApiOperation({
    summary:
      'Login com e-mail e senha. Retorna access token e grava refresh token em cookie httpOnly.',
  })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.responder(
      res,
      await this.auth.login(body.email, body.senha, req.headers['user-agent']),
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Renova o access token usando o refresh token do cookie (com rotação).',
  })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const s = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], req.headers['user-agent']);
      return this.responder(res, s);
    } catch (e) {
      res.clearCookie(REFRESH_COOKIE, this.cookieOpts());
      throw e;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Encerra a sessão (revoga o refresh token).' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, this.cookieOpts());
  }

  @Public()
  @Post('esqueci-senha')
  @HttpCode(202)
  @ApiBody({ type: EsqueciSenhaDto })
  @ApiOperation({
    summary: 'Solicita link de redefinição (nesta etapa, o link é exibido no log da API).',
  })
  async esqueciSenha(@Body(new ZodValidationPipe(esqueciSenhaSchema)) body: EsqueciSenhaInput) {
    await this.auth.solicitarRedefinicao(body.email);
    return { mensagem: 'Se o e-mail estiver cadastrado, enviaremos um link de redefinição.' };
  }

  @Public()
  @Post('redefinir-senha')
  @HttpCode(200)
  @ApiBody({ type: RedefinirSenhaDto })
  @ApiOperation({ summary: 'Redefine a senha com o token recebido.' })
  async redefinirSenha(
    @Body(new ZodValidationPipe(redefinirSenhaSchema)) body: RedefinirSenhaInput,
  ) {
    await this.auth.redefinirSenha(body.token, body.senha);
    return { mensagem: 'Senha redefinida com sucesso.' };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dados do usuário autenticado.' })
  async me(@UsuarioAtual() u: UsuarioAutenticado) {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({ where: { id: u.id } });
    return usuarioPublico(usuario);
  }
}
