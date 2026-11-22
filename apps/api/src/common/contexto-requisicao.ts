import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

interface Contexto {
  ip: string | null;
}

const armazenamento = new AsyncLocalStorage<Contexto>();

/** Middleware: guarda o IP da requisição para o AuditService (jobs/seed não passam por aqui -> ip null). */
export function contextoRequisicao(req: Request, _res: Response, next: NextFunction) {
  armazenamento.run({ ip: req.ip ?? null }, next);
}

export const ipAtual = (): string | null => armazenamento.getStore()?.ip ?? null;

/** Para testes. */
export const executarComIp = <T>(ip: string | null, fn: () => T): T => armazenamento.run({ ip }, fn);
