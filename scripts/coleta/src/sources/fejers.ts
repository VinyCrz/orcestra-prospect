import {
  normalizarCidade,
  normalizarCnpj,
  emailInstitucional,
  normalizarInstagram,
  normalizarNomeIes,
  telefoneInstitucional,
  normalizarUf,
  normalizarUrl,
  regiaoDaUf,
  limparEspacos,
} from '@orcestra/shared';
import { obterJson } from '../http.js';
import { novaEj, type ResultadoFonte } from '../base.js';

/**
 * FEJERS (Federação das Empresas Juniores do RS) publica em https://www.fejers.org.br/empresas-juniores
 * a lista das suas EJs; a página consome a API pública https://api.fejers.org.br/junior-enterprises.
 * A API retorna também o cadastro nacional da rede (nome, CNPJ e ID Brasil Júnior) de EJs de
 * outros estados — esses registros vêm só com nome/CNPJ e são enriquecidos depois via CNPJ.
 */
const API = 'https://api.fejers.org.br/junior-enterprises';
const PAGINA = 'https://www.fejers.org.br/empresas-juniores';

interface Nome {
  name: string;
}
interface Curso {
  name: string;
  ies?: { name: string; acronym: string | null } | null;
}
interface EjFejers {
  name: string;
  cnpj: string | null;
  email: string | null;
  phone: string | null;
  bjId: string | null;
  services: Nome[];
  businessAreas: Nome[];
  courses: Curso[];
  ies: { name: string; acronym: string | null } | null;
  instagram: string | null;
  facebook: string | null;
  linkedin: string | null;
  website: string | null;
  city: string | null;
  uf: string | null;
}

export async function coletarFejers(coletadoEm: string): Promise<ResultadoFonte> {
  const dados = await obterJson<{ juniorEnterprises: EjFejers[] }>(API);
  const ejs = dados.juniorEnterprises.map((x) => {
    const detalhada = !!x.uf;
    const ej = novaEj(limparEspacos(x.name), detalhada ? PAGINA : API, coletadoEm);
    ej.fontes = [API];
    ej.cnpj = normalizarCnpj(x.cnpj);
    ej.idBrasilJunior = x.bjId ?? null;
    if (detalhada) {
      ej.uf = normalizarUf(x.uf);
      ej.regiao = regiaoDaUf(ej.uf);
      ej.cidade = normalizarCidade(x.city);
      ej.federacao = 'FEJERS';
      ej.federada = true;
      const ies = x.ies ?? x.courses.find((c) => c.ies)?.ies ?? null;
      ej.ies = normalizarNomeIes(ies?.name);
      ej.iesSigla = ies?.acronym ?? null;
      ej.cursos = [...new Set(x.courses.map((c) => limparEspacos(c.name)))];
      ej.areas = x.businessAreas.map((a) => limparEspacos(a.name));
      ej.servicos = x.services.map((s) => limparEspacos(s.name));
      ej.site = normalizarUrl(x.website);
      ej.instagram = normalizarInstagram(x.instagram);
      ej.facebook = normalizarUrl(x.facebook);
      ej.linkedin = normalizarUrl(x.linkedin);
      // LGPD: só canais claramente institucionais (ver emailInstitucional/telefoneInstitucional).
      ej.emailInstitucional = emailInstitucional(x.email, x.name);
      ej.telefoneInstitucional = telefoneInstitucional(x.phone);
    }
    return ej;
  });
  return {
    fonte: 'FEJERS — Empresas Juniores (API pública do site)',
    url: PAGINA,
    ejs,
    federacoes: [
      {
        nome: 'Federação das Empresas Juniores do Estado do Rio Grande do Sul',
        sigla: 'FEJERS',
        uf: 'RS',
        site: 'https://www.fejers.org.br/',
        instagram: 'https://www.instagram.com/oficialfejers/',
        fonteUrl: PAGINA,
      },
    ],
  };
}
