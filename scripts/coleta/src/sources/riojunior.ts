import * as cheerio from 'cheerio';
import { limparEspacos, normalizarInstagram, normalizarUrl } from '@orcestra/shared';
import { obter, obterJson } from '../http.js';
import { novaEj, type ResultadoFonte } from '../base.js';

/**
 * RioJunior (Federação das EJs do Estado do RJ): página pública "As Empresas Juniores"
 * com cards (nome + link para site/Instagram da EJ) e a API REST pública do WordPress
 * (post type empresa_juniores) com áreas de atuação e serviços.
 */
const BASE = 'https://riojunior.com.br';
const PAGINA = `${BASE}/rio-junior/empresas`;

interface Termo {
  id: number;
  name: string;
}
interface PostEj {
  title: { rendered: string };
  area_de_atuacao: number[];
  servico: number[];
  link: string;
}

async function todosTermos(tax: string): Promise<Map<number, string>> {
  const mapa = new Map<number, string>();
  for (let p = 1; p < 20; p++) {
    const lote = await obterJson<Termo[]>(
      `${BASE}/wp-json/wp/v2/${tax}?per_page=100&page=${p}`,
    ).catch(() => []);
    if (!Array.isArray(lote) || lote.length === 0) break;
    for (const t of lote) mapa.set(t.id, cheerio.load(t.name).text());
    if (lote.length < 100) break;
  }
  return mapa;
}

export async function coletarRioJunior(coletadoEm: string): Promise<ResultadoFonte> {
  const html = await obter(PAGINA);
  const $ = cheerio.load(html);
  const links = new Map<string, string | null>();
  $('.company-card').each((_, el) => {
    const nome = limparEspacos($(el).find('p').first().text());
    const href = $(el).closest('a').attr('href') ?? null;
    if (nome) links.set(nome, href);
  });

  const areas = await todosTermos('area_de_atuacao');
  const servicos = await todosTermos('servico');
  const posts: PostEj[] = [];
  for (let p = 1; p < 10; p++) {
    const lote = await obterJson<PostEj[]>(
      `${BASE}/wp-json/wp/v2/empresa_juniores?per_page=100&page=${p}`,
    ).catch(() => []);
    if (!Array.isArray(lote) || lote.length === 0) break;
    posts.push(...lote);
    if (lote.length < 100) break;
  }
  const porNome = new Map(
    posts.map((p) => [limparEspacos(cheerio.load(p.title.rendered).text()), p]),
  );
  const nomes = new Set([...links.keys(), ...porNome.keys()]);

  const ejs = [...nomes].map((nome) => {
    const ej = novaEj(nome, PAGINA, coletadoEm);
    ej.uf = 'RJ';
    ej.regiao = 'SUDESTE';
    ej.federacao = 'RioJunior';
    ej.federada = true;
    const href = links.get(nome);
    if (href) {
      if (/instagram\.com/i.test(href)) ej.instagram = normalizarInstagram(href);
      else if (/linkedin\.com/i.test(href)) ej.linkedin = normalizarUrl(href);
      else if (/facebook\.com/i.test(href)) ej.facebook = normalizarUrl(href);
      else if (!/riojunior\.com\.br/i.test(href)) ej.site = normalizarUrl(href);
    }
    const post = porNome.get(nome);
    if (post) {
      ej.areas = post.area_de_atuacao.map((id) => areas.get(id)).filter((x): x is string => !!x);
      ej.servicos = post.servico.map((id) => servicos.get(id)).filter((x): x is string => !!x);
      ej.fontes = [post.link];
    }
    return ej;
  });

  return {
    fonte: 'RioJunior — As Empresas Juniores',
    url: PAGINA,
    ejs,
    federacoes: [
      {
        nome: 'RioJunior — Federação das Empresas Juniores do Estado do Rio de Janeiro',
        sigla: 'RioJunior',
        uf: 'RJ',
        site: `${BASE}/`,
        instagram: 'https://www.instagram.com/riojuniorfederacao/',
        fonteUrl: PAGINA,
      },
    ],
  };
}
