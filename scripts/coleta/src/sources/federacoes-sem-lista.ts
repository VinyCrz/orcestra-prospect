import { obter } from '../http.js';
import type { FederacaoColetada, ResultadoFonte } from '../base.js';

/**
 * Federações cujo site oficial está no ar mas NÃO publica lista de EJs federadas (verificado):
 *  - FEJEMG (MG): site Wix de eventos (EMEJ); sitemap sem páginas de EJs/membros.
 *  - FEJESP (SP): app FlutterFlow estático (eventos/manifesto); sem backend público de EJs no bundle.
 *  - Goiás Júnior (GO): WordPress; só estatísticas agregadas ("40 EJs, 8 IES, 10 cidades"); wp-json sem EJs.
 * Entram apenas como metadados em data/federacoes.json (nenhuma EJ é vinculada a elas).
 */
const FEDS: Array<FederacaoColetada & { verificar: string }> = [
  {
    nome: 'FEJEMG — Federação das Empresas Juniores do Estado de Minas Gerais',
    sigla: 'FEJEMG',
    uf: 'MG',
    site: 'https://www.fejemg.org.br/',
    instagram: 'https://www.instagram.com/fejemg/',
    fonteUrl: 'https://www.fejemg.org.br/',
    verificar: 'https://www.fejemg.org.br/sitemap.xml',
  },
  {
    nome: 'FEJESP — Federação das Empresas Juniores do Estado de São Paulo',
    sigla: 'FEJESP',
    uf: 'SP',
    site: 'https://fejesp.org.br/',
    instagram: 'https://www.instagram.com/_fejesp/',
    fonteUrl: 'https://fejesp.org.br/',
    verificar: 'https://fejesp.org.br/',
  },
  {
    nome: 'Goiás Júnior — Federação Goiana de Empresas Juniores',
    sigla: 'Goiás Júnior',
    uf: 'GO',
    site: 'https://goiasjunior.org.br/',
    instagram: 'https://www.instagram.com/goiasjunior/',
    fonteUrl: 'https://goiasjunior.org.br/',
    verificar: 'https://goiasjunior.org.br/',
  },
];

export async function coletarFederacoesSemLista(): Promise<ResultadoFonte> {
  const federacoes: FederacaoColetada[] = [];
  const notas: string[] = [];
  for (const { verificar, ...f } of FEDS) {
    try {
      await obter(verificar);
      notas.push(`${f.sigla}: site no ar, sem lista de EJs`);
    } catch (e) {
      notas.push(`${f.sigla}: ${(e as Error).message}`);
    }
    federacoes.push(f);
  }
  return {
    fonte: 'Federações com site público sem lista de EJs (FEJEMG, FEJESP, Goiás Júnior)',
    url: 'https://www.fejemg.org.br/ ; https://fejesp.org.br/ ; https://goiasjunior.org.br/',
    ejs: [],
    federacoes,
    observacao: `apenas metadados da federação — ${notas.join('; ')}`,
  };
}
