import { Global, Injectable, Module } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Cliente = Prisma.TransactionClient | PrismaService;

export interface RegistroAudit {
  usuarioId: string | null;
  acao: string;
  entidade: string;
  entidadeId?: string | null;
  dados?: Prisma.InputJsonValue;
}

/** Máscara de e-mail: jo***@dominio.com */
export function mascararEmail(v: string | null | undefined): string | null {
  if (!v) return null;
  const [local, dominio] = v.split('@');
  if (!dominio) return '***';
  // partes locais curtas não mostram nada além da inicial
  return `${local.length > 4 ? local.slice(0, 2) : local.slice(0, 1)}***@${dominio}`;
}

/** Máscara de telefone: mantém só os 2 últimos dígitos. */
export function mascararTelefone(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = v.replace(/\D/g, '');
  return d.length <= 2 ? '***' : `${'*'.repeat(d.length - 2)}${d.slice(-2)}`;
}

/** Máscara de texto pessoal (ex.: nome): primeira letra de cada palavra + ***. */
export function mascararNome(v: string | null | undefined): string | null {
  if (!v) return null;
  return v
    .split(/\s+/)
    .map((p) => `${p.charAt(0)}***`)
    .join(' ');
}

/** Compara valores (inclui arrays e datas) para o diff do AuditLog. */
export function valoresIguais(a: unknown, b: unknown): boolean {
  const norm = (x: unknown) =>
    x instanceof Date ? x.toISOString() : x === undefined ? null : x;
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/** {antes, depois} somente dos campos que realmente mudaram. Retorna null se nada mudou. */
export function diffCampos(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
  mascaras: Record<string, (v: string | null) => string | null> = {},
): { antes: Record<string, unknown>; depois: Record<string, unknown> } | null {
  const a: Record<string, unknown> = {};
  const d: Record<string, unknown> = {};
  for (const k of Object.keys(depois)) {
    if (valoresIguais(antes[k], depois[k])) continue;
    const m = mascaras[k] as ((v: string | null) => string | null) | undefined;
    const f = (v: unknown) => (m && (typeof v === 'string' || v == null) ? m(v ?? null) : v);
    a[k] = f(antes[k] ?? null);
    d[k] = f(depois[k] ?? null);
  }
  return Object.keys(d).length ? { antes: a, depois: d } : null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  registrar(r: RegistroAudit, db: Cliente = this.prisma) {
    return db.auditLog.create({
      data: {
        usuarioId: r.usuarioId,
        acao: r.acao,
        entidade: r.entidade,
        entidadeId: r.entidadeId ?? null,
        dados: r.dados,
      },
    });
  }

  registrarVarios(rs: RegistroAudit[], db: Cliente = this.prisma) {
    if (!rs.length) return Promise.resolve({ count: 0 });
    return db.auditLog.createMany({
      data: rs.map((r) => ({
        usuarioId: r.usuarioId,
        acao: r.acao,
        entidade: r.entidade,
        entidadeId: r.entidadeId ?? null,
        dados: r.dados,
      })),
    });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
