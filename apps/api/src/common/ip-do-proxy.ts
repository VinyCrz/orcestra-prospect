import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { NextFunction, Request, Response } from 'express';

export const HEADER_SEGREDO_PROXY = 'x-orcestra-proxy';
export const HEADER_IP_PROXY = 'x-orcestra-ip';

function iguais(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Se a requisição traz o segredo do proxy correto, `req.ip` passa a ser o IP informado pelo proxy do web.
 * Sem segredo configurado, ou com segredo errado, nada muda. Os dois cabeçalhos são sempre removidos.
 */
export function ipDoProxy(segredo: string | undefined) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const recebido = req.headers[HEADER_SEGREDO_PROXY];
    const ip = req.headers[HEADER_IP_PROXY];
    delete req.headers[HEADER_SEGREDO_PROXY];
    delete req.headers[HEADER_IP_PROXY];
    if (
      segredo &&
      typeof recebido === 'string' &&
      typeof ip === 'string' &&
      isIP(ip.trim()) !== 0 &&
      iguais(recebido, segredo)
    ) {
      Object.defineProperty(req, 'ip', { value: ip.trim(), configurable: true, enumerable: true });
    }
    next();
  };
}
