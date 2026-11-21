import { execFile } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { promisify } from 'node:util';
import { chaveNome, limparEspacos, normalizarInstagram, normalizarUrl } from '@orcestra/shared';
import { obterArquivo } from '../http.js';
import { novaEj, type ResultadoFonte } from '../base.js';
import { casarComRegistro } from '../match.js';

const exec = promisify(execFile);

/**
 * Guia das Empresas Juniores da UnB (Portfólio publicado pelo CDT/UnB — Pró-Jr, 2022, PDF público):
 * https://cdt.unb.br/images/Empresa_J%C3%BAnior/Portflio_Ejs_1.pdf
 * Cada EJ tem uma ficha com site e Instagram institucionais. Como o guia é da própria universidade,
 * a IES é "Universidade de Brasília" (UnB) para todas as EJs listadas.
 *
 * Só entram EJs que casam de forma única (nome normalizado + UF=DF do CNPJ) com o cadastro nacional.
 * Valores de site/Instagram repetidos em duas fichas (erro de cópia do guia) são descartados, a menos
 * que o próprio endereço contenha o nome da EJ. Requer o binário `pdftotext` (poppler-utils).
 * Sem fonte de federação: o guia cita a Concentro, mas não lista EJs como federadas — federação fica vazia.
 */
const PDF = 'https://cdt.unb.br/images/Empresa_J%C3%BAnior/Portflio_Ejs_1.pdf';
const PAGINAS = 56;

async function textoPagina(arquivo: string, p: number): Promise<string> {
  const { stdout } = await exec('pdftotext', ['-f', String(p), '-l', String(p), '-layout', arquivo, '-']);
  return stdout;
}

/** O guia é de 2022: sites cujo domínio não resolve mais (DNS) são descartados. */
async function dominioResolve(url: string | null): Promise<boolean> {
  if (!url) return false;
  try {
    await lookup(new URL(url).hostname);
    return true;
  } catch {
    return false;
  }
}

const compacto = (s: string) => chaveNome(s).replace(/ /g, '');

export async function coletarUnbGuia(coletadoEm: string): Promise<ResultadoFonte> {
  const arquivo = await obterArquivo(PDF, 'pdf');

  // Sumário: nomes completos das EJs.
  const sumario = await textoPagina(arquivo, 4);
  const nomesCompletos: string[] = [];
  for (const linha of sumario.split('\n')) {
    for (const m of linha.matchAll(/(\d{1,3})\s{2,}(\S.*?)(?=\s{2,}\d{1,3}\s{2,}|\s*$)/g)) {
      const n = limparEspacos(m[2]);
      if (!/^todas as empresas/i.test(n)) nomesCompletos.push(n);
    }
  }

  // Fichas: cabeçalho "Guia das Empresas Juniores da UnB l <Nome>" + "Site:" e "Instagram:".
  const fichas = new Map<string, { site: string | null; instagram: string | null }>();
  for (let p = 5; p <= PAGINAS; p++) {
    const t = await textoPagina(arquivo, p);
    const cab = /Guia das Empresas Juniores da UnB\s*l\s*(.+)/.exec(t);
    if (!cab) continue;
    const nome = limparEspacos(cab[1]);
    const site = /Site:\s*(\S+)/.exec(t)?.[1] ?? null;
    const ig = /Instagram:\s*(@[A-Za-z0-9._]{2,30})(?=\s|$)/.exec(t)?.[1] ?? null;
    const atual = fichas.get(nome) ?? { site: null, instagram: null };
    fichas.set(nome, { site: atual.site ?? site, instagram: atual.instagram ?? ig });
  }

  // Descarta valores repetidos entre fichas (erro de cópia), salvo se contêm o nome da EJ.
  const contagem = new Map<string, number>();
  for (const f of fichas.values())
    for (const v of [f.site, f.instagram]) if (v) contagem.set(v.toLowerCase(), (contagem.get(v.toLowerCase()) ?? 0) + 1);

  const ejs = [];
  const sem: string[] = [];
  const mortos: string[] = [];
  for (const [curto, f] of fichas) {
    const completo =
      nomesCompletos.find((n) => compacto(n) === compacto(curto)) ??
      nomesCompletos.find((n) => compacto(n).startsWith(compacto(curto))) ??
      curto;
    const reg =
      (await casarComRegistro(completo, 'DF')) ?? (await casarComRegistro(curto, 'DF'));
    if (!reg) {
      sem.push(curto);
      continue;
    }
    const ok = (v: string | null) =>
      !!v && ((contagem.get(v.toLowerCase()) ?? 0) === 1 || compacto(v).includes(compacto(curto).slice(0, 5)));
    const ej = novaEj(reg.nome, PDF, coletadoEm);
    ej.fontes = [PDF];
    ej.cnpj = reg.cnpj;
    ej.idBrasilJunior = reg.bjId;
    ej.uf = 'DF';
    ej.regiao = 'CENTRO_OESTE';
    ej.ies = 'Universidade de Brasília';
    ej.iesSigla = 'UnB';
    const site = ok(f.site) ? normalizarUrl(f.site) : null;
    if (site && !(await dominioResolve(site))) mortos.push(curto);
    ej.site = site && !mortos.includes(curto) ? site : null;
    ej.instagram = ok(f.instagram) ? normalizarInstagram(f.instagram) : null;
    ejs.push(ej);
  }

  return {
    fonte: 'UnB — Guia das Empresas Juniores da UnB (CDT/Pró-Jr, 2022)',
    url: PDF,
    ejs,
    federacoes: [],
    observacao:
      `${fichas.size} fichas; ${ejs.length} casadas de forma única com o cadastro nacional (DF)` +
      (sem.length ? `; sem casamento (não incluídas): ${sem.join(', ')}` : '') +
      (mortos.length ? `; sites descartados por domínio sem DNS hoje: ${mortos.join(', ')}` : ''),
  };
}
