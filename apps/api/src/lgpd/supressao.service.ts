import { Injectable, Logger, OnModuleInit, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MotivoSupressao, Prisma, TipoSupressao } from '@prisma/client';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

type Cliente = Prisma.TransactionClient | PrismaService;

export const MSG_SUPRIMIDO = 'Contato suprimido (opt-out/anonimizado)';

export interface DadosContato {
  email?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
}

export interface ChaveSupressao {
  tipo: TipoSupressao;
  hash: string;
}

const PEPPER_DEV = 'orcestra-dev-pepper-NAO-USAR-EM-PRODUCAO';

/** E-mail: trim + minúsculo. */
export const normalizarEmailSupressao = (v: string | null | undefined): string | null => {
  const s = v?.trim().toLowerCase();
  return s ? s : null;
};

/** Telefone/WhatsApp: só dígitos, com DDI (10-11 dígitos nacionais ganham o 55). */
export const normalizarTelefoneSupressao = (v: string | null | undefined): string | null => {
  const d = (v ?? '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return d.length <= 11 ? `55${d}` : d;
};

/** Lista de supressão global (LGPD): só hashes HMAC, nunca o valor em claro. */
@Injectable()
export class SupressaoService implements OnModuleInit {
  private readonly log = new Logger(SupressaoService.name);
  private readonly pepper: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const p = config.get<string>('SUPRESSAO_PEPPER');
    this.pepper = p && p.length > 0 ? p : PEPPER_DEV;
    this.pepperAusente = !p;
  }

  private readonly pepperAusente: boolean;

  onModuleInit() {
    if (this.pepperAusente)
      this.log.warn(
        'SUPRESSAO_PEPPER não definido: usando pepper de desenvolvimento. Defina-o no .env (openssl rand -hex 32); em produção é obrigatório.',
      );
  }

  hash(tipo: TipoSupressao, valorNormalizado: string): string {
    return createHmac('sha256', this.pepper).update(`${tipo}:${valorNormalizado}`).digest('hex');
  }

  chaves(d: DadosContato): ChaveSupressao[] {
    const out: ChaveSupressao[] = [];
    const e = normalizarEmailSupressao(d.email);
    if (e) out.push({ tipo: 'EMAIL', hash: this.hash('EMAIL', e) });
    for (const t of new Set([d.telefone, d.whatsapp].map(normalizarTelefoneSupressao)))
      if (t) out.push({ tipo: 'TELEFONE', hash: this.hash('TELEFONE', t) });
    return out;
  }

  /** Grava (idempotente) os hashes de e-mail/telefone/whatsapp. Retorna quantos eram novos. */
  async registrar(
    d: DadosContato,
    motivo: MotivoSupressao,
    usuarioId: string | null,
    db: Cliente = this.prisma,
  ): Promise<number> {
    const chaves = this.chaves(d);
    if (!chaves.length) return 0;
    const r = await db.supressaoContato.createMany({
      data: chaves.map((c) => ({ ...c, motivo, criadoPorId: usuarioId })),
      skipDuplicates: true,
    });
    return r.count;
  }

  /** Remove só supressões por OPT_OUT (reativação consciente por GESTOR/ADMIN); anonimização é definitiva. */
  async removerOptOut(d: DadosContato, db: Cliente = this.prisma): Promise<void> {
    const hashes = this.chaves(d).map((c) => c.hash);
    if (hashes.length)
      await db.supressaoContato.deleteMany({ where: { hash: { in: hashes }, motivo: 'OPT_OUT' } });
  }

  async suprimido(d: DadosContato, db: Cliente = this.prisma): Promise<boolean> {
    const hashes = this.chaves(d).map((c) => c.hash);
    if (!hashes.length) return false;
    return (await db.supressaoContato.count({ where: { hash: { in: hashes } } })) > 0;
  }

  async exigirNaoSuprimido(d: DadosContato, db: Cliente = this.prisma): Promise<void> {
    if (await this.suprimido(d, db)) throw new UnprocessableEntityException(MSG_SUPRIMIDO);
  }
}
