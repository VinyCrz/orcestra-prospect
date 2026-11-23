/**
 * Coletor da base de Empresas Juniores (pnpm coleta).
 *
 * Uso: pnpm coleta [--sem-cnpj] [--atualizar] [--limite-cnpj=N]
 *   --sem-cnpj        não consulta a Receita (usa só o cache existente)
 *   --atualizar       ignora o cache HTTP das páginas das federações e das checagens de sites
 *   --sem-links       não verifica os sites das EJs (nem busca Instagram/LinkedIn neles)
 *   --limite-cnpj=N   consulta no máximo N CNPJs novos nesta execução
 *
 * Saída: data/ejs.json, data/ejs.csv, data/federacoes.json, data/RELATORIO.md
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  UFS,
  deduplicarEjs,
  extrairIesDaRazaoSocial,
  extrairSiglaIes,
  normalizarCidade,
  normalizarUf,
  regiaoDaUf,
  type EjColetada,
} from '@orcestra/shared';
import { configurarHttp } from './http.js';
import type { FederacaoColetada, ResultadoFonte } from './base.js';
import { coletarFejers } from './sources/fejers.js';
import { coletarRioJunior } from './sources/riojunior.js';
import { coletarJuniores } from './sources/juniores-es.js';
import { coletarUnbGuia } from './sources/unb-guia.js';
import { coletarUfscEbook } from './sources/ufsc-ebook.js';
import { coletarFederacoesSemLista } from './sources/federacoes-sem-lista.js';
import { consultarCnpj, type DadosCnpj } from './cnpj.js';
import { escreverCsv } from './csv.js';
import { gerarRelatorio } from './relatorio.js';
import { carregarMunicipios } from './ibge.js';
import { verificarLinks } from './links.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DATA = path.join(RAIZ, 'data');
const args = new Set(process.argv.slice(2));
const limiteArg = process.argv.find((a) => a.startsWith('--limite-cnpj='));
const LIMITE_CNPJ = limiteArg ? Number(limiteArg.split('=')[1]) : Infinity;
const SITUACOES_EXCLUIDAS = ['BAIXADA', 'NULA'];

const FONTES: Array<(c: string) => Promise<ResultadoFonte>> = [
  coletarFejers,
  coletarRioJunior,
  coletarJuniores,
  coletarUnbGuia,
  coletarUfscEbook,
  coletarFederacoesSemLista,
];

async function main() {
  configurarHttp({
    cacheDir: path.join(DATA, 'cache', 'http'),
    ignorarCache: args.has('--atualizar'),
    intervaloMs: 1200,
  });
  const coletadoEm = new Date().toISOString();
  const resultados: ResultadoFonte[] = [];
  const falhas: string[] = [];
  for (const fonte of FONTES) {
    try {
      const r = await fonte(coletadoEm);
      console.log(`✔ ${r.fonte}: ${r.ejs.length} registros`);
      resultados.push(r);
    } catch (e) {
      const msg = `${fonte.name}: ${(e as Error).message}`;
      console.warn(`✘ ${msg} — seguindo para a próxima fonte`);
      falhas.push(msg);
    }
  }

  let ejs: EjColetada[] = resultados.flatMap((r) => r.ejs);

  // Enriquecimento via CNPJ (dados públicos da Receita Federal).
  const cacheCnpj = path.join(DATA, 'cache', 'cnpj');
  let consultados = 0;
  let novos = 0;
  const comCnpj = ejs.filter((e) => e.cnpj);
  for (const ej of comCnpj) {
    let dados: DadosCnpj | null = null;
    const podeConsultar = !args.has('--sem-cnpj') && novos < LIMITE_CNPJ;
    dados = await consultarCnpjComCache(ej.cnpj!, cacheCnpj, podeConsultar, () => novos++);
    consultados++;
    if (consultados % 100 === 0)
      console.log(`  CNPJ: ${consultados}/${comCnpj.length} (novas consultas: ${novos})`);
    if (!dados || dados.naoEncontrado) continue;
    ej.razaoSocial = dados.razaoSocial;
    ej.situacaoCadastral = dados.situacaoCadastral;
    if (!ej.uf && dados.uf) ej.uf = normalizarUf(dados.uf);
    if (!ej.cidade && dados.municipio) ej.cidade = normalizarCidade(dados.municipio);
    if (dados.dataInicioAtividade)
      ej.anoFundacao = Number(dados.dataInicioAtividade.slice(0, 4)) || null;
    if (!ej.ies) ej.ies = extrairIesDaRazaoSocial(dados.razaoSocial);
    ej.fontes = [...new Set([...ej.fontes, dados.fonteUrl])];
  }

  const nomeOficial = await carregarMunicipios().catch((e: Error) => {
    console.warn(`✘ IBGE indisponível (${e.message}) — cidades ficam sem correção de acentos`);
    return (c: string | null) => c;
  });
  for (const ej of ejs) {
    ej.uf = normalizarUf(ej.uf);
    ej.regiao = regiaoDaUf(ej.uf);
    ej.cidade = nomeOficial(normalizarCidade(ej.cidade), ej.uf);
  }

  const antes = ejs.length;
  ejs = deduplicarEjs(ejs);
  const duplicados = antes - ejs.length;
  // Depois da deduplicação: sigla de IES citada literalmente na razão social ou no nome da EJ
  // (ex.: "... DA UFRRJ", "3E-UEL"). Feito após o dedupe para não impedir a fusão com registros de nome completo.
  for (const ej of ejs) {
    const sigla = extrairSiglaIes(ej.razaoSocial) ?? extrairSiglaIes(ej.nome);
    if (!ej.ies && sigla) ej.ies = sigla;
    if (!ej.iesSigla && sigla) ej.iesSigla = sigla;
  }
  const excluidas = ejs.filter(
    (e) => e.situacaoCadastral && SITUACOES_EXCLUIDAS.includes(e.situacaoCadastral.toUpperCase()),
  );
  ejs = ejs.filter((e) => !excluidas.includes(e));
  ejs.sort(
    (a, b) => (a.uf ?? 'ZZ').localeCompare(b.uf ?? 'ZZ') || a.nome.localeCompare(b.nome, 'pt-BR'),
  );

  // Sites fora do ar são descartados; Instagram/LinkedIn publicados no próprio site são aproveitados.
  const links = args.has('--sem-links')
    ? null
    : await verificarLinks(ejs, {
        cacheDir: path.join(DATA, 'cache', 'links'),
        ignorarCache: args.has('--atualizar'),
        log: console.log,
      });

  const federacoes = new Map<string, FederacaoColetada>();
  for (const r of resultados) for (const f of r.federacoes) federacoes.set(f.sigla, f);

  await mkdir(DATA, { recursive: true });
  await writeFile(path.join(DATA, 'ejs.json'), JSON.stringify(ejs, null, 2) + '\n');
  await writeFile(
    path.join(DATA, 'federacoes.json'),
    JSON.stringify([...federacoes.values()], null, 2) + '\n',
  );
  await escreverCsv(path.join(DATA, 'ejs.csv'), ejs);
  await writeFile(
    path.join(DATA, 'RELATORIO.md'),
    gerarRelatorio({
      ejs,
      resultados,
      falhas,
      duplicados,
      excluidas,
      coletadoEm,
      ufs: UFS.map((u) => u.sigla),
      federacoes: [...federacoes.values()],
      links,
    }),
  );
  console.log(
    `\nTotal: ${ejs.length} EJs (duplicados mesclados: ${duplicados}, excluídas por situação cadastral: ${excluidas.length})`,
  );
}

async function consultarCnpjComCache(
  cnpj: string,
  dir: string,
  podeConsultar: boolean,
  contarNova: () => void,
): Promise<DadosCnpj | null> {
  const { readFile } = await import('node:fs/promises');
  try {
    return JSON.parse(await readFile(path.join(dir, `${cnpj}.json`), 'utf8')) as DadosCnpj;
  } catch {
    if (!podeConsultar) return null;
    contarNova();
    return consultarCnpj(cnpj, dir);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
