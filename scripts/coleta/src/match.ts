import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chaveNome, normalizarCidade, normalizarCnpj, normalizarUf } from '@orcestra/shared';
import { obterJson } from './http.js';

/**
 * Casamento de EJs listadas por fontes sem CNPJ (federações, IES) com o cadastro nacional
 * (nome + CNPJ + ID Brasil Júnior, exposto pela API pública do site da FEJERS).
 * O casamento só ocorre quando o nome normalizado é igual E a UF do CNPJ (cache da Receita)
 * confere E o candidato é único — caso contrário nenhum vínculo é feito.
 */
const API = 'https://api.fejers.org.br/junior-enterprises';
const CACHE_CNPJ = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../data/cache/cnpj',
);

export interface RegistroEj {
  nome: string;
  cnpj: string;
  bjId: string | null;
  uf: string | null;
  /** Município do endereço cadastral do CNPJ (cache da Receita), sem correção de grafia. */
  cidade: string | null;
}

let registro: Promise<RegistroEj[]> | null = null;

async function dadosDoCnpj(cnpj: string): Promise<{ uf: string | null; cidade: string | null }> {
  try {
    const d = JSON.parse(await readFile(path.join(CACHE_CNPJ, `${cnpj}.json`), 'utf8')) as {
      uf?: string | null;
      municipio?: string | null;
      naoEncontrado?: boolean;
    };
    if (d.naoEncontrado) return { uf: null, cidade: null };
    return { uf: normalizarUf(d.uf ?? null), cidade: normalizarCidade(d.municipio ?? null) };
  } catch {
    return { uf: null, cidade: null };
  }
}

export function carregarRegistro(): Promise<RegistroEj[]> {
  registro ??= (async () => {
    const dados = await obterJson<{
      juniorEnterprises: Array<{ name: string; cnpj: string | null; bjId: string | null; uf: string | null }>;
    }>(API);
    const lista: RegistroEj[] = [];
    for (const x of dados.juniorEnterprises) {
      const cnpj = normalizarCnpj(x.cnpj);
      if (!cnpj) continue;
      const r = await dadosDoCnpj(cnpj);
      lista.push({
        nome: x.name,
        cnpj,
        bjId: x.bjId ?? null,
        uf: normalizarUf(x.uf) ?? r.uf,
        cidade: r.cidade,
      });
    }
    return lista;
  })();
  return registro;
}

/** Chave mais tolerante: ignora "empresa", "junior/jr", "consultoria", "ej" e preposições. */
export function chaveFrouxa(nome: string): string {
  return chaveNome(nome)
    .split(' ')
    .filter((t) => t && !['empresa', 'jr', 'ej', 'consultoria', 'de', 'da', 'do', 'e'].includes(t))
    .join(' ');
}

/** Retorna o registro nacional único com mesmo nome (e UF), ou null se ausente/ambíguo. */
export async function casarComRegistro(nome: string, uf: string): Promise<RegistroEj | null> {
  const reg = await carregarRegistro();
  const exato = reg.filter((r) => r.uf === uf && chaveNome(r.nome) === chaveNome(nome));
  if (exato.length === 1) return exato[0];
  if (exato.length > 1) return null;
  const k = chaveFrouxa(nome);
  if (k.length < 3) return null;
  const frouxo = reg.filter((r) => r.uf === uf && chaveFrouxa(r.nome) === k);
  return frouxo.length === 1 ? frouxo[0] : null;
}
