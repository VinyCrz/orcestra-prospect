import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HttpError, obterJson } from './http.js';

/**
 * Consulta dados cadastrais PÚBLICOS do CNPJ (Receita Federal) via BrasilAPI, com
 * fallback para minhareceita.org. Por LGPD, guardamos SOMENTE campos da organização
 * (razão social, nome fantasia, município, UF, data de abertura, situação, CNAE).
 * Quadro societário (nomes de pessoas), e-mail e telefone da Receita são descartados.
 */
export interface DadosCnpj {
  cnpj: string;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  municipio: string | null;
  uf: string | null;
  dataInicioAtividade: string | null;
  situacaoCadastral: string | null;
  cnae: string | null;
  fonteUrl: string;
  consultadoEm: string;
  naoEncontrado?: boolean;
}

interface RespostaReceita {
  razao_social?: string;
  nome_fantasia?: string;
  municipio?: string;
  uf?: string;
  data_inicio_atividade?: string;
  descricao_situacao_cadastral?: string;
  cnae_fiscal_descricao?: string;
}

const TTL = 30 * 24 * 3600 * 1000;

function filtrar(cnpj: string, r: RespostaReceita, fonteUrl: string): DadosCnpj {
  return {
    cnpj,
    razaoSocial: r.razao_social || null,
    nomeFantasia: r.nome_fantasia || null,
    municipio: r.municipio || null,
    uf: r.uf || null,
    dataInicioAtividade: r.data_inicio_atividade || null,
    situacaoCadastral: r.descricao_situacao_cadastral || null,
    cnae: r.cnae_fiscal_descricao || null,
    fonteUrl,
    consultadoEm: new Date().toISOString(),
  };
}

export async function consultarCnpj(cnpj: string, cacheDir: string): Promise<DadosCnpj | null> {
  const arq = path.join(cacheDir, `${cnpj}.json`);
  try {
    const s = await stat(arq);
    if (Date.now() - s.mtimeMs < TTL) return JSON.parse(await readFile(arq, 'utf8')) as DadosCnpj;
  } catch {
    /* sem cache */
  }
  const provedores = [
    `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
    `https://minhareceita.org/${cnpj}`,
  ];
  let resultado: DadosCnpj | null = null;
  for (const url of provedores) {
    try {
      resultado = filtrar(cnpj, await obterJson<RespostaReceita>(url, { cache: false }), url);
      break;
    } catch (e) {
      if (e instanceof HttpError && (e.status === 404 || e.status === 400)) {
        resultado = { ...filtrar(cnpj, {}, url), naoEncontrado: true };
        break;
      }
      // tenta o próximo provedor
    }
  }
  if (resultado) {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(arq, JSON.stringify(resultado, null, 2));
  }
  return resultado;
}
