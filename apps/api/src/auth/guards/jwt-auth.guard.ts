import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload, UsuarioAutenticado } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Cache curto do usuário (id → dados) para não consultar o banco em todo clique: o banco fica em outro
 * servidor e cada ida custa dezenas de ms. Só guarda usuário ativo. Quem muda papel ou desativa chama
 * `esquecerUsuario`, então a mudança vale na hora; o TTL é só uma rede de segurança.
 */
const TTL_CACHE_MS = 30_000;
const cache = new Map<string, { usuario: UsuarioAutenticado; expira: number }>();

export function esquecerUsuario(id: string) {
  cache.delete(id);
}

export function limparCacheUsuarios() {
  cache.clear();
}

/** Guard global: exige access token (Bearer) válido e usuário ativo, exceto em rotas @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    const [tipo, token] = header?.split(' ') ?? [];
    if (tipo !== 'Bearer' || !token) throw new UnauthorizedException('Token ausente');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }
    const emCache = cache.get(payload.sub);
    if (emCache && emCache.expira > Date.now()) {
      req.usuario = { ...emCache.usuario };
      return true;
    }
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, nome: true, papel: true, ativo: true },
    });
    if (!usuario || !usuario.ativo) throw new UnauthorizedException('Usuário inativo');
    const autenticado: UsuarioAutenticado = {
      id: usuario.id,
      email: usuario.email,
      nome: usuario.nome,
      papel: usuario.papel,
    };
    cache.set(usuario.id, { usuario: autenticado, expira: Date.now() + TTL_CACHE_MS });
    req.usuario = { ...autenticado };
    return true;
  }
}
