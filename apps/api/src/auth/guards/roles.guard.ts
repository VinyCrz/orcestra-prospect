import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Papel } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth.types';
import { PAPEIS_KEY } from '../decorators/papeis.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/** Guard global de papéis: se a rota tiver @Papeis(...), o usuário precisa ter um deles. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const alvos = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, alvos)) return true;
    const exigidos = this.reflector.getAllAndOverride<Papel[] | undefined>(PAPEIS_KEY, alvos);
    if (!exigidos || exigidos.length === 0) return true;
    const usuario: UsuarioAutenticado | undefined = ctx.switchToHttp().getRequest().usuario;
    if (!usuario || !exigidos.includes(usuario.papel)) {
      throw new ForbiddenException('Você não tem permissão para esta ação');
    }
    return true;
  }
}
