import { chaveNome } from '@orcestra/shared';
import { obterJson } from './http.js';

/**
 * Nomes oficiais dos municípios (IBGE — API pública de localidades), para restaurar
 * acentos e grafia correta: "FLORIANOPOLIS"/"Florianopolis" → "Florianópolis".
 */
const URL_IBGE = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios';

interface MunicipioIbge {
  nome: string;
  microrregiao?: { mesorregiao?: { UF?: { sigla: string } } } | null;
  'regiao-imediata'?: { 'regiao-intermediaria'?: { UF?: { sigla: string } } } | null;
}

const compacta = (s: string) => chaveNome(s).replace(/ /g, '');

export async function carregarMunicipios(): Promise<
  (cidade: string | null, uf: string | null) => string | null
> {
  const lista = await obterJson<MunicipioIbge[]>(URL_IBGE);
  const mapa = new Map<string, string>();
  for (const m of lista) {
    const uf =
      m.microrregiao?.mesorregiao?.UF?.sigla ??
      m['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla;
    if (!uf) continue;
    mapa.set(`${compacta(m.nome)}|${uf}`, m.nome);
  }
  return (cidade, uf) => {
    if (!cidade || !uf) return cidade;
    return mapa.get(`${compacta(cidade)}|${uf}`) ?? cidade;
  };
}
