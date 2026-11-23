/**
 * Fontes públicas investigadas que NÃO geraram lista de EJs (registro para o relatório).
 * Última verificação: 2026-11-20. Nada aqui exigiu login, CAPTCHA ou burla de limite de requisições.
 */
export const FONTES_SEM_LISTA: Array<{ fonte: string; url: string; situacao: string }> = [
  {
    fonte: 'Brasil Júnior — site institucional',
    url: 'https://brasiljunior.org.br/',
    situacao:
      'Next.js sem diretório de EJs/federações: __NEXT_DATA__ vazio (pageProps: {}), sitemap só com páginas institucionais. Os dados dinâmicos (blog, parceiros, seleção de IES) vêm de api.brasiljunior.org.br, que exige token (Authorization) não publicado → não usada. Portal/ID (portal.brasiljunior.org.br, id.brasiljunior.org.br) exigem login → não acessados.',
  },
  {
    fonte: 'Brasil Júnior — Portal da Transparência',
    url: 'https://brasiljunior.org.br/portal-da-transparencia',
    situacao: 'Relatórios de legado, demonstrativos e planejamento em PDFs no Google Drive: agregados, sem lista de EJs/federações.',
  },
  {
    fonte: 'Brasil Júnior — IES Empreendedoras / MEJ Carreiras',
    url: 'https://iesempreendedoras.brasiljunior.org.br/ ; https://mej-carreiras.brasiljunior.org.br/',
    situacao: 'Ranking de IES (não de EJs) e banco de talentos; sem lista de EJs com federação.',
  },
  {
    fonte: 'API do site da FEJERS — outros endpoints',
    url: 'https://api.fejers.org.br/',
    situacao: '/federations, /business-areas, /services, /events, /docs exigem autenticação (401) → não usados. /ies e /courses são públicos mas cobrem só o RS.',
  },
  {
    fonte: 'FEJEMG (MG)',
    url: 'https://www.fejemg.org.br/',
    situacao: 'Wix de eventos (EMEJ); sitemap sem páginas de EJs; sem lista de federadas.',
  },
  {
    fonte: 'FEJESP (SP)',
    url: 'https://fejesp.org.br/',
    situacao: 'App FlutterFlow estático (eventos/manifesto); bundle sem backend de EJs; sem lista de federadas.',
  },
  {
    fonte: 'Goiás Júnior (GO)',
    url: 'https://goiasjunior.org.br/',
    situacao: 'WordPress com estatísticas agregadas (40 EJs, 8 IES, 10 cidades); wp-json sem post type de EJs (apenas membros de equipe, não coletados por LGPD).',
  },
  {
    fonte: 'FEJESC (SC)',
    url: 'https://fejesc.etechjr.com.br/',
    situacao: 'Site em construção/homologação: post type "empresas-juniores" tem só 5 itens com texto "Lorem ipsum" → descartado. fejesc.com.br não abre (falha TLS/redirecionamento).',
  },
  {
    fonte: 'Fejepar (PR), RN Júnior, PB Júnior, Concentro (DF), FEJEPE (PE), UNIJr-BA, FEJECE (CE), FEJEA (AL), SERJÚNIOR (SE), Maranhão Júnior, Pará Júnior, FEJEMS (MS)',
    url: 'domínios listados na Wikipédia (Empresa júnior) e variações',
    situacao: 'Sem DNS, página padrão de hospedagem ("Bem-vindo a HostGator"), "Em manutenção" ou domínio à venda; nenhum site oficial ativo localizado. Presença só em redes sociais (não coletadas).',
  },
  {
    fonte: 'Wayback Machine (versões antigas do diretório da Brasil Júnior)',
    url: 'https://web.archive.org/',
    situacao: 'Indisponível neste ambiente (acesso bloqueado) e dados seriam defasados → não usado.',
  },
];

/** Linha de base: coleta de 2026-11-21 (antes da verificação dos sites), para o comparativo antes × depois. */
export const LINHA_DE_BASE = {
  data: '2026-11-21 (coleta anterior, antes da verificação dos sites)',
  total: 1515,
  federacao: 143,
  ies: 494,
  site: 91,
  instagram: 53,
  linkedin: 2,
  porFederacao: { FEJERS: 65, RioJunior: 75, Juniores: 3 } as Record<string, number>,
};
