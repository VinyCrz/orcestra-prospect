/**
 * Leva os contatos novos da coleta (data/ejs.json) para o banco, sem apagar nada.
 *
 * Roda na subida do container (deploy/render/iniciar.sh) e pode rodar à mão: `pnpm --filter @orcestra/api
 * exec tsx prisma/sincronizar-base.ts`. Diferente do seed completo:
 *  - só PREENCHE campos de contato vazios (site, Instagram, LinkedIn, Facebook, e-mail e telefone
 *    institucionais) das EJs que já existem; nunca troca nem apaga o que alguém editou no sistema;
 *  - soma as fontes novas à lista `fontes`;
 *  - marca o score das EJs alteradas como defasado (a API recalcula ao subir);
 *  - não cria EJs nem mexe em trabalho comercial. EJs novas no arquivo só entram pelo seed completo.
 * Guarda o hash do arquivo em config_sistema: se o arquivo não mudou, não faz nada.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chaveDedupe, type EjColetada } from '@orcestra/shared';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DATA = process.env.SEED_DATA_DIR ?? path.resolve(__dirname, '../../../data');
const CAMPOS = [
  'site',
  'instagram',
  'linkedin',
  'facebook',
  'emailInstitucional',
  'telefoneInstitucional',
] as const;
type Campo = (typeof CAMPOS)[number];

async function main() {
  const bruto = readFileSync(path.join(DATA, 'ejs.json'), 'utf8');
  const hash = createHash('sha256').update(bruto).digest('hex');
  const config = await prisma.configSistema.findUnique({ where: { id: 1 } });
  const forcar = process.argv.includes('--forcar');
  if (config?.baseEjsHash === hash && !forcar) {
    console.log('Base de EJs já sincronizada (arquivo sem mudanças).');
    return;
  }

  const coletadas = JSON.parse(bruto) as EjColetada[];
  const noBanco = await prisma.empresaJunior.findMany({
    select: { id: true, chaveDedupe: true, fontes: true, ...Object.fromEntries(CAMPOS.map((c) => [c, true])) },
  });
  const porChave = new Map(noBanco.map((e) => [e.chaveDedupe, e]));

  const alteracoes: { id: string; data: Record<string, unknown> }[] = [];
  const preenchidos: Record<Campo, number> = Object.fromEntries(CAMPOS.map((c) => [c, 0])) as Record<Campo, number>;
  let novas = 0;
  for (const ej of coletadas) {
    const atual = porChave.get(chaveDedupe(ej)) as (Record<string, unknown> & { id: string; fontes: string[] }) | undefined;
    if (!atual) {
      novas++;
      continue;
    }
    const data: Record<string, unknown> = {};
    for (const c of CAMPOS) {
      if (!atual[c] && ej[c]) {
        data[c] = ej[c];
        preenchidos[c]++;
      }
    }
    if (!Object.keys(data).length) continue;
    data.fontes = [...new Set([...(atual.fontes ?? []), ...(ej.fontes ?? [])])];
    data.scoreVersao = null;
    alteracoes.push({ id: atual.id, data });
  }

  for (let i = 0; i < alteracoes.length; i += 100) {
    await prisma.$transaction(
      alteracoes.slice(i, i + 100).map((a) => prisma.empresaJunior.update({ where: { id: a.id }, data: a.data })),
    );
  }
  await prisma.configSistema.upsert({
    where: { id: 1 },
    create: { id: 1, baseEjsHash: hash },
    update: { baseEjsHash: hash },
  });
  if (alteracoes.length) {
    await prisma.auditLog.create({
      data: {
        usuarioId: null,
        acao: 'BASE_EJS_SINCRONIZADA',
        entidade: 'EmpresaJunior',
        dados: { ejsAtualizadas: alteracoes.length, preenchidos, novasNaoCriadas: novas },
      },
    });
  }
  console.log(
    `Base de EJs sincronizada: ${alteracoes.length} EJs com contato novo ` +
      `(${CAMPOS.map((c) => `${c} ${preenchidos[c]}`).join(', ')})` +
      (novas ? `; ${novas} EJs do arquivo não existem no banco (use o seed completo).` : '.'),
  );
}

main()
  .catch((e) => {
    console.error('Falha ao sincronizar a base de EJs:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
