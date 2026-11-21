/**
 * Seed idempotente:
 *  1. ADMIN inicial (ADMIN_NOME / ADMIN_EMAIL / ADMIN_SENHA do .env) — criado se não existir.
 *  2. Federações (data/federacoes.json), IES e EJs (data/ejs.json) — upsert por chave estável.
 */
import { PrismaClient, type Regiao, TipoTag } from '@prisma/client';
import { chaveDedupe, chaveNome, normalizarNomeIes, type EjColetada } from '@orcestra/shared';
import * as argon2 from 'argon2';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const prisma = new PrismaClient();
const DATA = process.env.SEED_DATA_DIR ?? path.resolve(__dirname, '../../../data');

interface FederacaoJson {
  nome: string;
  sigla: string;
  uf: string | null;
  site: string | null;
  instagram: string | null;
  fonteUrl: string;
}

function lerJson<T>(arq: string): T {
  const p = path.join(DATA, arq);
  if (!existsSync(p)) throw new Error(`Arquivo não encontrado: ${p}. Rode "pnpm coleta" antes.`);
  return JSON.parse(readFileSync(p, 'utf8')) as T;
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const senha = process.env.ADMIN_SENHA;
  const nome = process.env.ADMIN_NOME?.trim() || 'Administrador';
  if (!email || !senha) throw new Error('Defina ADMIN_EMAIL e ADMIN_SENHA no .env');
  if (senha.length < 8) throw new Error('ADMIN_SENHA deve ter pelo menos 8 caracteres');
  const existe = await prisma.usuario.findUnique({ where: { email } });
  if (existe) {
    console.log(`• ADMIN ${email} já existe — mantido.`);
    return;
  }
  await prisma.usuario.create({
    data: {
      nome,
      email,
      papel: 'ADMIN',
      senhaHash: await argon2.hash(senha, { type: argon2.argon2id }),
    },
  });
  console.log(`• ADMIN ${email} criado.`);
}

async function seedFederacoes() {
  const feds = lerJson<FederacaoJson[]>('federacoes.json');
  const ids = new Map<string, string>();
  for (const f of feds) {
    const r = await prisma.federacao.upsert({
      where: { sigla: f.sigla },
      create: f,
      update: {
        nome: f.nome,
        uf: f.uf,
        site: f.site,
        instagram: f.instagram,
        fonteUrl: f.fonteUrl,
      },
    });
    ids.set(f.sigla, r.id);
  }
  console.log(`• ${feds.length} federações.`);
  return ids;
}

async function seedTags(ejs: EjColetada[]) {
  const tags = new Map<string, { nome: string; tipo: TipoTag }>();
  for (const ej of ejs) {
    for (const a of ej.areas) tags.set(`AREA:${chaveNome(a)}`, { nome: a, tipo: TipoTag.AREA });
    for (const c of ej.cursos) tags.set(`CURSO:${chaveNome(c)}`, { nome: c, tipo: TipoTag.CURSO });
  }
  const existentes = new Map(
    (await prisma.tag.findMany({ select: { id: true, chave: true } })).map((t) => [t.chave, t.id]),
  );
  const novas = [...tags.entries()].filter(([k]) => !existentes.has(k));
  if (novas.length) {
    await prisma.tag.createMany({
      data: novas.map(([chave, t]) => ({ chave, nome: t.nome, tipo: t.tipo })),
      skipDuplicates: true,
    });
  }
  const todas = await prisma.tag.findMany({ select: { id: true, chave: true } });
  console.log(`• ${tags.size} tags (áreas/cursos).`);
  return new Map(todas.map((t) => [t.chave, t.id]));
}

async function seedIes(ejs: EjColetada[]) {
  const ies = new Map<
    string,
    { nome: string; sigla: string | null; uf: string | null; cidade: string | null }
  >();
  for (const ej of ejs) {
    const nome = normalizarNomeIes(ej.ies);
    if (!nome) continue;
    const chave = `${chaveNome(nome)}|${ej.uf ?? ''}`;
    const atual = ies.get(chave);
    if (!atual) ies.set(chave, { nome, sigla: ej.iesSigla, uf: ej.uf, cidade: ej.cidade });
    else if (!atual.sigla && ej.iesSigla) atual.sigla = ej.iesSigla;
  }
  for (const [chave, i] of ies) {
    await prisma.ies.upsert({
      where: { chave },
      create: { chave, ...i },
      update: { nome: i.nome, sigla: i.sigla ?? undefined, cidade: i.cidade ?? undefined },
    });
  }
  const todas = await prisma.ies.findMany({ select: { id: true, chave: true } });
  console.log(`• ${ies.size} IES.`);
  return new Map(todas.map((t) => [t.chave, t.id]));
}

async function seedEjs(
  ejs: EjColetada[],
  feds: Map<string, string>,
  iesIds: Map<string, string>,
  tagIds: Map<string, string>,
) {
  let criadas = 0;
  let atualizadas = 0;
  const lote = 50;
  for (let i = 0; i < ejs.length; i += lote) {
    await Promise.all(
      ejs.slice(i, i + lote).map(async (ej) => {
        const chave = chaveDedupe(ej);
        const iesNome = normalizarNomeIes(ej.ies);
        const iesId = iesNome ? (iesIds.get(`${chaveNome(iesNome)}|${ej.uf ?? ''}`) ?? null) : null;
        const tags = [
          ...ej.areas.map((a) => tagIds.get(`AREA:${chaveNome(a)}`)),
          ...ej.cursos.map((c) => tagIds.get(`CURSO:${chaveNome(c)}`)),
        ].filter((x): x is string => !!x);
        // Dados vindos da coleta. Campos de trabalho comercial (status, score, responsável,
        // observações, verificado) NÃO são sobrescritos em execuções seguintes.
        const dados = {
          nome: ej.nome,
          nomeNormalizado: chaveNome(ej.nome),
          razaoSocial: ej.razaoSocial,
          cnpj: ej.cnpj,
          iesId,
          federacaoId: ej.federacao ? (feds.get(ej.federacao) ?? null) : null,
          cidade: ej.cidade,
          uf: ej.uf,
          regiao: ej.regiao as Regiao | null,
          servicos: ej.servicos,
          anoFundacao: ej.anoFundacao,
          membrosEstimados: ej.membrosEstimados,
          federada: ej.federada ?? false,
          site: ej.site,
          instagram: ej.instagram,
          linkedin: ej.linkedin,
          facebook: ej.facebook,
          emailInstitucional: ej.emailInstitucional,
          telefoneInstitucional: ej.telefoneInstitucional,
          situacaoCadastral: ej.situacaoCadastral,
          idBrasilJunior: ej.idBrasilJunior,
          fonteUrl: ej.fonteUrl,
          fontes: ej.fontes,
          coletadoEm: new Date(ej.coletadoEm),
        };
        const existente = await prisma.empresaJunior.findUnique({
          where: { chaveDedupe: chave },
          select: { id: true },
        });
        if (existente) {
          await prisma.empresaJunior.update({
            where: { id: existente.id },
            data: { ...dados, tags: { set: tags.map((id) => ({ id })) } },
          });
          atualizadas++;
        } else {
          await prisma.empresaJunior.create({
            data: {
              ...dados,
              chaveDedupe: chave,
              verificado: ej.verificado,
              tags: { connect: tags.map((id) => ({ id })) },
            },
          });
          criadas++;
        }
      }),
    );
  }
  console.log(
    `• EJs: ${criadas} criadas, ${atualizadas} atualizadas (total no arquivo: ${ejs.length}).`,
  );
}

async function main() {
  console.log(`Seed — dados em ${DATA}`);
  await seedAdmin();
  const ejs = lerJson<EjColetada[]>('ejs.json');
  const feds = await seedFederacoes();
  const tags = await seedTags(ejs);
  const ies = await seedIes(ejs);
  await seedEjs(ejs, feds, ies, tags);
  // IES que deixaram de ser referenciadas (ex.: nome normalizado mudou entre coletas).
  const orfas = await prisma.ies.deleteMany({ where: { empresas: { none: {} } } });
  if (orfas.count) console.log(`• ${orfas.count} IES sem EJs removidas.`);
  console.log('Seed concluído.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
