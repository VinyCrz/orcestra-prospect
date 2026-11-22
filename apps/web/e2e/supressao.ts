import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Limpeza da lista de supressão (LGPD) para os specs: apaga SÓ os hashes dos valores de teste,
 * nunca por janela de data (isso poderia remover um opt-out real feito durante a execução).
 * Mesma regra da API (apps/api/src/lgpd/supressao.service.ts): HMAC-SHA256(pepper, "<TIPO>:<valor normalizado>").
 */
const RAIZ = path.resolve(__dirname, '../../..');
const PEPPER_DEV = 'orcestra-dev-pepper-NAO-USAR-EM-PRODUCAO';

function pepper(): string {
  try {
    const env = readFileSync(path.join(RAIZ, '.env'), 'utf8');
    return /^SUPRESSAO_PEPPER=(.*)$/m.exec(env)?.[1]?.trim() || PEPPER_DEV;
  } catch {
    return PEPPER_DEV;
  }
}

const hash = (tipo: 'EMAIL' | 'TELEFONE', v: string) => createHmac('sha256', pepper()).update(`${tipo}:${v}`).digest('hex');

function normTelefone(v: string): string | null {
  const d = v.replace(/\D/g, '');
  if (d.length < 10) return null;
  return d.length <= 11 ? `55${d}` : d;
}

/** SQL que remove as supressões dos e-mails/telefones de teste informados. */
export function sqlLimparSupressoes(valores: { emails?: string[]; telefones?: string[] }): string {
  const hs = [
    ...(valores.emails ?? []).map((e) => hash('EMAIL', e.trim().toLowerCase())),
    ...(valores.telefones ?? []).map(normTelefone).filter((t): t is string => !!t).map((t) => hash('TELEFONE', t)),
  ];
  return hs.length ? `delete from supressoes_contato where hash in (${hs.map((h) => `'${h}'`).join(',')});` : '';
}
