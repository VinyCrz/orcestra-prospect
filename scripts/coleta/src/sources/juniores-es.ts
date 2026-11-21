import * as cheerio from 'cheerio';
import { chaveNome, limparEspacos, normalizarCidade } from '@orcestra/shared';
import { obter } from '../http.js';
import { novaEj, type ResultadoFonte } from '../base.js';
import { casarComRegistro } from '../match.js';

/**
 * Juniores (Federação das Empresas Juniores do Espírito Santo) — https://www.federacaojuniores.com.br
 * A página /empresas-juniores ("Catálogo de Empresas Juniores Federadas") lista as EJs federadas.
 * O catálogo vem do conteúdo embutido no bundle JS público do próprio site (sem login nem API privada).
 *
 * Cautelas: o site está claramente em construção (telefone placeholder, painel admin, textos de
 * cases ilustrativos). Por isso usamos SOMENTE o que é fato de cadastro da lista de federadas
 * (nome, IES/sigla, cidade) e SOMENTE para EJs que casam de forma única com o cadastro nacional
 * (nome normalizado + UF do CNPJ). Instagram, áreas, serviços e cases do site NÃO são usados.
 */
const BASE = 'https://www.federacaojuniores.com.br';
const PAGINA = `${BASE}/empresas-juniores`;

interface EjSite {
  name: string;
  institution: string;
  city: string;
}

/** Converte o literal JS do bundle (chaves sem aspas, \xNN, !0/!1) em JSON; null se não der. */
function literalParaJson(arr: string): unknown {
  const a = arr
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h: string) => `\\u00${h}`)
    .replace(/!0/g, 'true')
    .replace(/!1/g, 'false');
  let out = '';
  let aspas: string | null = null;
  for (let i = 0; i < a.length; i++) {
    const c = a[i];
    if (aspas) {
      out += c;
      if (c === '\\') out += a[++i];
      else if (c === aspas) aspas = null;
      continue;
    }
    if (c === '"') {
      aspas = c;
      out += c;
      continue;
    }
    const m = /^([{,])([A-Za-z_$][\w$]*):/.exec(a.slice(i, i + 80));
    if (m) {
      out += `${m[1]}"${m[2]}":`;
      i += m[0].length - 1;
      continue;
    }
    out += c;
  }
  return JSON.parse(out);
}

function extrairArrayEjs(js: string): EjSite[] | null {
  const ini = js.indexOf('ejs:[{id:"');
  if (ini < 0) return null;
  const j = ini + 4;
  let prof = 0;
  let aspas: string | null = null;
  for (let k = j; k < js.length; k++) {
    const c = js[k];
    if (aspas) {
      if (c === '\\') k++;
      else if (c === aspas) aspas = null;
    } else if (c === '"' || c === "'") aspas = c;
    else if (c === '[') prof++;
    else if (c === ']' && --prof === 0) {
      try {
        const arr = literalParaJson(js.slice(j, k + 1)) as EjSite[];
        return Array.isArray(arr) ? arr : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function coletarJuniores(coletadoEm: string): Promise<ResultadoFonte> {
  const html = await obter(PAGINA);
  const $ = cheerio.load(html);
  const chunks = [
    ...new Set(
      $('script[src]')
        .map((_, el) => $(el).attr('src') ?? '')
        .get()
        .filter((s) => s.startsWith('/_next/static/chunks/') && s.endsWith('.js')),
    ),
  ];
  let lista: EjSite[] | null = null;
  for (const c of chunks) {
    const js = await obter(`${BASE}${c}`);
    lista = extrairArrayEjs(js);
    if (lista) break;
  }
  if (!lista) throw new Error('catálogo de EJs não encontrado no bundle do site da Juniores');

  const siglasIes = new Set(
    $('body')
      .text()
      .match(/\b(UFES|IFES|UVV|FUCAPE|EMESCAM|FDV|FAESA)\b/g) ?? [],
  );

  const ejs = [];
  const nao: string[] = [];
  const conflitos: string[] = [];
  for (const x of lista) {
    const nome = limparEspacos(x.name);
    const reg = await casarComRegistro(nome, 'ES');
    if (!reg) {
      nao.push(nome);
      continue;
    }
    const ej = novaEj(nome, PAGINA, coletadoEm);
    ej.fontes = [PAGINA];
    ej.cnpj = reg.cnpj;
    ej.idBrasilJunior = reg.bjId;
    ej.uf = 'ES';
    ej.regiao = 'SUDESTE';
    ej.federacao = 'Juniores';
    ej.federada = true;
    ej.cidade = normalizarCidade(x.city);
    const sigla = limparEspacos(x.institution).split(' ')[0].toUpperCase();
    if (siglasIes.has(sigla)) {
      ej.ies = sigla;
      ej.iesSigla = sigla;
    }
    if (reg.cidade && ej.cidade && chaveNome(reg.cidade) !== chaveNome(ej.cidade))
      conflitos.push(`${nome}: cidade ${ej.cidade} (site) × ${reg.cidade} (CNPJ)`);
    ejs.push(ej);
  }

  return {
    fonte: 'Juniores (ES) — Catálogo de Empresas Juniores Federadas',
    url: PAGINA,
    ejs,
    federacoes: [
      {
        nome: 'Juniores — Federação das Empresas Juniores do Espírito Santo',
        sigla: 'Juniores',
        uf: 'ES',
        site: `${BASE}/`,
        instagram: 'https://www.instagram.com/juniores.es/',
        fonteUrl: PAGINA,
      },
    ],
    observacao:
      `site lista ${lista.length} EJs (declara 30 federadas); ${ejs.length} casadas de forma única com o cadastro nacional (nome + UF do CNPJ)` +
      (nao.length ? `; listadas e NÃO incluídas por falta de casamento: ${nao.join(', ')}` : '') +
      (conflitos.length ? `; conflitos (prevalece o CNPJ): ${conflitos.join('; ')}` : ''),
  };
}
