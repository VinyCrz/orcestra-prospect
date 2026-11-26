/**
 * Verificação dos sites das EJs e extração de redes sociais publicadas no próprio site.
 *
 * Para cada EJ com `site`:
 *  1. Abre a página (redirecionamentos seguidos, timeout, nova tentativa em falha transitória).
 *     Se https falhar por TLS/conexão e http responder, guarda a versão http.
 *  2. Site fora do ar (domínio sem DNS, 404/410, certificado inválido, domínio estacionado/à venda,
 *     conta suspensa) → `site = null` e entra na lista de descartados do relatório.
 *  3. Site no ar e sem Instagram/LinkedIn na base → procura links instagram.com/<perfil> e
 *     linkedin.com/company/<perfil> no HTML. Só usa o perfil que casa com o nome da EJ ou com o
 *     endereço do site (evita perfis de clientes, parceiros, IES ou federação). Ambíguo → nada.
 *
 *  4. Site no ar e sem e-mail/telefone na base → lê a página inicial e a de contato (link "contato"/"fale
 *     conosco" do mesmo domínio). E-mail: `mailto:` ou texto, só institucional (`emailInstitucional`), com
 *     preferência para o domínio do site. Telefone: só o canal publicado em link `wa.me`/WhatsApp ou `tel:`
 *     (é o canal comercial que a EJ divulga); número solto no texto é ignorado. Mais de um número → nada.
 *
 * Nada é inventado: o perfil vem de um link publicado pela própria EJ; o site vai na lista `fontes`.
 * Resultados ficam em cache (data/cache/links, 7 dias; `--atualizar` ignora).
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  emailInstitucional,
  normalizarInstagram,
  normalizarTelefone,
  normalizarUrl,
  type EjColetada,
} from '@orcestra/shared';
import { USER_AGENT, permitidoPorRobots } from './http.js';

export interface SiteDescartado {
  nome: string;
  uf: string | null;
  url: string;
  motivo: string;
}

export interface ResultadoLinks {
  verificados: number;
  descartados: SiteDescartado[];
  urlCorrigida: number;
  instagramNovos: number;
  linkedinNovos: number;
  emailNovos: number;
  telefoneNovos: number;
}

interface Checagem {
  ok: boolean;
  motivo?: string;
  urlUsada: string;
  instagram: string[];
  linkedin: string[];
  emails?: string[];
  telefones?: string[];
}

const TTL = 7 * 24 * 3600 * 1000;
const TRANSITORIOS = ['EAI_AGAIN', 'ECONNRESET', 'UND_ERR_CONNECT_TIMEOUT', 'TimeoutError', 'AbortError', 'ETIMEDOUT', 'UND_ERR_SOCKET'];
const TLS = ['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN'];
const ESTACIONADO =
  /domain (is )?for sale|buy this domain|this domain (has expired|is parked)|parkingcrew|sedoparking|dom[ií]nio (est[aá] )?(à venda|expirado)|account (has been )?suspended|conta suspensa|site (suspenso|desativado)|hostgator.{0,40}bem-vindo|bem-vindo.{0,40}hostgator|website (is )?expired|wix.{0,30}(site|website) (isn['’]t|is not) (published|available)|wordpress\.com.{0,80}(no longer available|não está mais disponível)/i;
const PERFIS_GENERICOS = new Set([
  'p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'tv', 'instagram', 'sharer', 'share', 'direct',
  'wix', 'wixcom', 'wordpress', 'wordpressdotcom', 'hostinger', 'brasiljunior', 'brasil_junior',
]);
const PALAVRAS_FRACAS = new Set([
  'consultoria', 'consultorias', 'junior', 'empresa', 'empresas', 'engenharia', 'solucoes', 'assessoria',
  'projetos', 'servicos', 'escritorio', 'gestao', 'ltda', 'para', 'com', 'universidade', 'federal',
  'estadual', 'oficial', 'brasil', 'tecnologia', 'ambiental', 'pesquisa', 'internacional',
]);

const sem = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const compacto = (s: string) => sem(s).replace(/[^a-z0-9]/g, '');

function erroCodigo(e: unknown): string {
  const x = e as { cause?: { code?: string }; code?: string; name?: string };
  return x?.cause?.code ?? x?.code ?? x?.name ?? 'erro';
}

async function baixar(url: string): Promise<{ status: number; html: string; final: string } | { erro: string }> {
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(20000),
    });
    const html = r.ok ? (await r.text()).slice(0, 3_000_000) : '';
    return { status: r.status, html, final: r.url || url };
  } catch (e) {
    return { erro: erroCodigo(e) };
  }
}

const EMAILS_IGNORADOS = /(@(sentry|wixpress|example|exemplo|domain|dominio|email)\.|\.(png|jpe?g|gif|webp|svg)$|^(nome|seu|your|user)@)/i;

function extrairContatos(html: string) {
  const emails = new Set<string>();
  for (const m of html.matchAll(/mailto:([^"'?<>\s]+)/gi)) emails.add(decodeURIComponent(m[1]).trim().toLowerCase());
  const texto = html.replace(/<[^>]+>/g, ' ');
  for (const m of texto.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) emails.add(m[0].toLowerCase());
  const telefones = new Set<string>();
  const links = [
    ...html.matchAll(/wa\.me\/\+?(\d{10,13})/gi),
    ...html.matchAll(/api\.whatsapp\.com\/send\/?\?phone=\+?(\d{10,13})/gi),
    ...html.matchAll(/href=["']tel:([+\d\s().-]{10,20})["']/gi),
  ];
  for (const m of links) {
    const t = normalizarTelefone(m[1]);
    if (t) telefones.add(t);
  }
  return {
    emails: [...emails].filter((e) => !EMAILS_IGNORADOS.test(e)),
    telefones: [...telefones],
  };
}

/** Link para a página de contato no mesmo domínio (só o primeiro). */
function paginaDeContato(html: string, base: string): string | null {
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    if (!/contato|contact|fale-?conosco|fale_conosco/i.test(m[1])) continue;
    try {
      const u = new URL(m[1], base);
      if (u.hostname === new URL(base).hostname && /^https?:$/.test(u.protocol)) return u.toString();
    } catch {
      /* href inválido */
    }
  }
  return null;
}

async function baixarComNovaTentativa(url: string) {
  let r = await baixar(url);
  for (let i = 0; i < 2 && 'erro' in r && r.erro !== 'ENOTFOUND' && !TLS.includes(r.erro); i++) {
    await new Promise((ok) => setTimeout(ok, 3000 * (i + 1)));
    r = await baixar(url);
  }
  return r;
}

function extrairPerfis(html: string) {
  const ig = [...html.matchAll(/instagram\.com\/([A-Za-z0-9_.]{2,30})/gi)]
    .map((m) => m[1].toLowerCase().replace(/\.+$/, ''))
    .filter((h) => !PERFIS_GENERICOS.has(h));
  const li = [...html.matchAll(/linkedin\.com\/company\/([^\s"'<>?#/\\&]{2,120})/gi)].map((m) => {
    let slug = m[1].replace(/[.,;:)]+$/, '');
    try {
      slug = decodeURIComponent(slug);
    } catch {
      /* mantém como veio */
    }
    return encodeURIComponent(slug.toLowerCase());
  });
  return { instagram: [...new Set(ig)], linkedin: [...new Set(li)] };
}

/** Faz a checagem (com cache em disco) de uma URL de site. */
async function checar(url: string, cacheDir: string, ignorarCache: boolean): Promise<Checagem> {
  // v2: inclui e-mails e telefones (cache antigo é ignorado)
  const arq = path.join(cacheDir, `${createHash('sha1').update(`v2|${url}`).digest('hex')}.json`);
  if (!ignorarCache) {
    try {
      if (Date.now() - (await stat(arq)).mtimeMs < TTL) return JSON.parse(await readFile(arq, 'utf8')) as Checagem;
    } catch {
      /* sem cache */
    }
  }
  let urlUsada = url;
  let r = await baixarComNovaTentativa(url);
  if ('erro' in r && url.startsWith('https://') && (TLS.includes(r.erro) || r.erro === 'ECONNREFUSED')) {
    const http = url.replace(/^https:/, 'http:');
    const r2 = await baixarComNovaTentativa(http);
    // Só aceita http se não houver redirecionamento de volta para o https quebrado.
    if (!('erro' in r2) && r2.status < 400 && !r2.final.startsWith('https://')) {
      r = r2;
      urlUsada = http;
    }
  }
  if ('erro' in r && r.erro === 'ENOTFOUND') {
    // Domínio digitado com/sem "www." na fonte: tenta a outra forma.
    const u = new URL(urlUsada);
    u.hostname = u.hostname.startsWith('www.') ? u.hostname.slice(4) : `www.${u.hostname}`;
    const r3 = await baixarComNovaTentativa(u.toString());
    if (!('erro' in r3)) {
      r = r3;
      urlUsada = u.toString();
    }
  }
  let res: Checagem;
  if ('erro' in r) {
    const motivo =
      r.erro === 'ENOTFOUND' ? 'domínio não existe mais (sem DNS)'
      : TLS.includes(r.erro) ? `certificado inválido (${r.erro})`
      : TRANSITORIOS.includes(r.erro) ? `não respondeu (${r.erro})`
      : `falha de conexão (${r.erro})`;
    res = { ok: false, motivo, urlUsada, instagram: [], linkedin: [] };
  } else if (r.status === 404 || r.status === 410) {
    res = { ok: false, motivo: `página não existe (HTTP ${r.status})`, urlUsada, instagram: [], linkedin: [] };
  } else if (r.status >= 400 && r.status !== 401 && r.status !== 403 && r.status !== 429) {
    res = { ok: false, motivo: `erro HTTP ${r.status}`, urlUsada, instagram: [], linkedin: [] };
  } else if (r.html && ESTACIONADO.test(r.html.slice(0, 60000))) {
    res = { ok: false, motivo: 'domínio estacionado/à venda ou conta suspensa', urlUsada, instagram: [], linkedin: [] };
  } else {
    // 401/403/429: o site existe (bloqueia robôs); não há HTML para ler.
    const podeLer = r.html && (await permitidoPorRobots(r.final).catch(() => true));
    res = { ok: true, urlUsada, instagram: [], linkedin: [], emails: [], telefones: [] };
    if (podeLer) {
      let html = r.html;
      const contato = paginaDeContato(r.html, r.final);
      if (contato && (await permitidoPorRobots(contato).catch(() => true))) {
        const rc = await baixar(contato);
        if (!('erro' in rc) && rc.status < 400) html += `\n${rc.html}`;
      }
      Object.assign(res, extrairPerfis(html), extrairContatos(html));
    }
  }
  await mkdir(cacheDir, { recursive: true });
  await writeFile(arq, JSON.stringify(res));
  return res;
}

/** Termos que identificam a EJ: palavras do nome, nome compacto e partes do endereço do site. */
function termosDaEj(ej: EjColetada, site: string): string[] {
  const termos = new Set<string>();
  const palavras = sem(ej.nome).split(/[^a-z0-9]+/).filter((p) => p.length >= 4 && !PALAVRAS_FRACAS.has(p));
  palavras.forEach((p) => termos.add(p));
  const nomeCompacto = compacto(ej.nome.replace(/\s[-–—(].*$/, ''));
  if (nomeCompacto.length >= 4) termos.add(nomeCompacto);
  try {
    const u = new URL(site);
    const segmentos = u.pathname.split('/').map(compacto).filter((s) => s.length >= 4);
    // Site em subpasta (ex.: ufrgs.br/neodontojr, xyz.wixsite.com/ej) → o host é da IES/plataforma.
    if (segmentos.length && !/^(pt|en|br|home|inicio|sobre(nos)?|website)$/.test(segmentos[0])) {
      segmentos.forEach((s) => termos.add(s));
      if (/wixsite\.com$/.test(u.hostname)) termos.add(compacto(u.hostname.split('.')[0]));
    } else {
      const rotulo = compacto(u.hostname.replace(/^www\./, '').split('.')[0]);
      if (rotulo.length >= 4) termos.add(rotulo);
    }
  } catch {
    /* url inválida */
  }
  // Variações sem sufixos comuns (jr, junior, ej, consultoria) para casar "ibmecjr" × "ibmec".
  for (const t of [...termos]) {
    const base = t.replace(/^(ej|oficial)/, '').replace(/(jr|junior|ej|consultoria|consultoriajr|consultoriajunior)$/, '');
    if (base.length >= 4) termos.add(base);
  }
  return [...termos];
}

function dominio(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Site em subpasta de outro domínio (IES, wix, google sites...): contatos genéricos seriam do dono do domínio. */
export function siteEmSubpasta(site: string): boolean {
  try {
    const u = new URL(site);
    return u.pathname.replace(/\/+$/, '').split('/').filter(Boolean).length > 0 || /wixsite\.com|sites\.google\.com/.test(u.hostname);
  } catch {
    return true;
  }
}

/** E-mail com o nome da EJ na parte local (não só "contato@"). */
function emailComNome(email: string, nomeEj: string): boolean {
  const local = compacto(email.split('@')[0]);
  const termos = sem(nomeEj).split(/[^a-z0-9]+/).filter((p) => p.length >= 4 && !PALAVRAS_FRACAS.has(p));
  const nc = compacto(nomeEj.replace(/\s[-–—(].*$/, '')).replace(/(jr|junior)$/, '');
  return termos.some((t) => local.includes(t)) || (nc.length >= 3 && local.includes(nc));
}

/** E-mail institucional publicado no site: prefere o do domínio do site; vários sem critério → null. */
export function escolherEmail(emails: string[], nomeEj: string, site: string): string | null {
  let validos = [...new Set(emails.map((e) => emailInstitucional(e, nomeEj)).filter((e): e is string => !!e))];
  if (siteEmSubpasta(site)) validos = validos.filter((e) => emailComNome(e, nomeEj));
  const dom = dominio(site);
  const doDominio = dom ? validos.filter((e) => e.endsWith(`@${dom}`)) : [];
  if (doDominio.length) return doDominio[0];
  return validos.length === 1 ? validos[0] : null;
}

/** Telefone publicado como canal da EJ (WhatsApp/tel). Só se houver um único número. */
export function escolherTelefone(telefones: string[]): string | null {
  const unicos = [...new Set(telefones)];
  return unicos.length === 1 ? unicos[0] : null;
}

/** Escolhe o único perfil que casa com a EJ; vários candidatos ou nenhum → null. */
export function escolherPerfil(perfis: string[], termos: string[]): string | null {
  const casam = perfis.filter((p) => {
    const h = compacto(p);
    return termos.some((t) => h.includes(t) || (h.length >= 5 && t.includes(h)));
  });
  return casam.length === 1 ? casam[0] : null;
}

export async function verificarLinks(
  ejs: EjColetada[],
  o: { cacheDir: string; ignorarCache: boolean; log?: (m: string) => void },
): Promise<ResultadoLinks> {
  const res: ResultadoLinks = {
    verificados: 0,
    descartados: [],
    urlCorrigida: 0,
    instagramNovos: 0,
    linkedinNovos: 0,
    emailNovos: 0,
    telefoneNovos: 0,
  };
  const comSite = ejs.filter((e) => e.site);
  // Checagens em paralelo limitado (hosts diferentes); cada host recebe 1 a 3 requisições.
  const fila = [...comSite];
  const trabalhador = async () => {
    for (let ej = fila.shift(); ej; ej = fila.shift()) {
      const site = ej.site!;
      const c = await checar(site, o.cacheDir, o.ignorarCache);
      res.verificados++;
      if (!c.ok) {
        res.descartados.push({ nome: ej.nome, uf: ej.uf, url: site, motivo: c.motivo ?? 'fora do ar' });
        ej.site = null;
        continue;
      }
      if (c.urlUsada !== site) {
        ej.site = normalizarUrl(c.urlUsada) ?? c.urlUsada;
        res.urlCorrigida++;
      }
      const termos = termosDaEj(ej, site);
      let usouSite = false;
      if (!ej.instagram) {
        const h = escolherPerfil(c.instagram, termos);
        if (h) {
          ej.instagram = normalizarInstagram(h);
          res.instagramNovos++;
          usouSite = true;
        }
      }
      if (!ej.linkedin) {
        const h = escolherPerfil(c.linkedin, termos);
        if (h) {
          ej.linkedin = `https://www.linkedin.com/company/${h}/`;
          res.linkedinNovos++;
          usouSite = true;
        }
      }
      if (!ej.emailInstitucional) {
        const e = escolherEmail(c.emails ?? [], ej.nome, ej.site!);
        if (e) {
          ej.emailInstitucional = e;
          res.emailNovos++;
          usouSite = true;
        }
      }
      if (!ej.telefoneInstitucional) {
        const t = siteEmSubpasta(ej.site!) ? null : escolherTelefone(c.telefones ?? []);
        if (t) {
          ej.telefoneInstitucional = t;
          res.telefoneNovos++;
          usouSite = true;
        }
      }
      if (usouSite) ej.fontes = [...new Set([...ej.fontes, ej.site!])];
    }
  };
  await Promise.all(Array.from({ length: 4 }, trabalhador));
  res.descartados.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  o.log?.(
    `✔ Sites verificados: ${res.verificados} · descartados (fora do ar): ${res.descartados.length} · ` +
      `Instagram novo: ${res.instagramNovos} · LinkedIn novo: ${res.linkedinNovos} · ` +
        `e-mail novo: ${res.emailNovos} · telefone novo: ${res.telefoneNovos}`,
  );
  return res;
}
