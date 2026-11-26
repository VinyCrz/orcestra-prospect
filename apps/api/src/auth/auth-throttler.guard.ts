import { ExecutionContext, HttpException, HttpStatus, Injectable, applyDecorators, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

export const MSG_RATE_LIMIT = 'Muitas tentativas. Aguarde um minuto e tente novamente.';
const MINUTO = 60_000;

const lerLimite = (nome: string, padrao: number) => () => {
  const n = Number(process.env[nome]);
  return Number.isInteger(n) && n > 0 ? n : padrao;
};

/** Rate limit das rotas de auth: chave = IP (+ e-mail no login). 429 em pt-BR. */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: { ip?: string; body?: { email?: unknown } }): Promise<string> {
    const ip = (req.ip as string | undefined) ?? 'sem-ip';
    const email = req.body?.email;
    return typeof email === 'string' && email ? `${ip}|${email.trim().toLowerCase()}` : ip;
  }

  protected throwThrottlingException(_ctx: ExecutionContext): Promise<void> {
    throw new HttpException(MSG_RATE_LIMIT, HttpStatus.TOO_MANY_REQUESTS);
  }
}

/** Variante só por IP: impede tentar códigos trocando o e-mail a cada pedido. */
@Injectable()
export class IpThrottlerGuard extends AuthThrottlerGuard {
  protected async getTracker(req: { ip?: string }): Promise<string> {
    return (req.ip as string | undefined) ?? 'sem-ip';
  }
}

/** Autocadastro: 5/min por IP (RATE_LIMIT_CADASTRO_POR_MIN). */
export const LimiteCadastro = () =>
  applyDecorators(
    UseGuards(IpThrottlerGuard),
    Throttle({ default: { limit: lerLimite('RATE_LIMIT_CADASTRO_POR_MIN', 5), ttl: MINUTO } }),
  );

/** Login: 5/min por IP+e-mail (RATE_LIMIT_LOGIN_POR_MIN). */
export const LimiteLogin = () =>
  applyDecorators(
    UseGuards(AuthThrottlerGuard),
    Throttle({ default: { limit: lerLimite('RATE_LIMIT_LOGIN_POR_MIN', 5), ttl: MINUTO } }),
  );

/** Refresh / esqueci-senha / redefinir-senha: 10/min por IP (RATE_LIMIT_AUTH_POR_MIN). */
export const LimiteAuth = () =>
  applyDecorators(
    UseGuards(AuthThrottlerGuard),
    Throttle({ default: { limit: lerLimite('RATE_LIMIT_AUTH_POR_MIN', 10), ttl: MINUTO } }),
  );
