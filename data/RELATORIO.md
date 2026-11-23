# Relatório da coleta de Empresas Juniores

Gerado em: 2026-11-23T01:16:23.915Z  
Gerado por: `pnpm coleta` (scripts/coleta)

## Resumo

- **Total de EJs na base:** 1515
- UFs cobertas: 27 de 27
- Registros duplicados mesclados: 112
- Excluídas por situação cadastral BAIXADA/NULA na Receita: 12

## Antes × depois

Linha de base: 2026-11-21 (coleta anterior, antes da verificação dos sites).

| Indicador | Antes | Depois | Variação |
|---|---:|---:|---:|
| Total de EJs | 1515 | 1515 | +0 |
| Com federação confirmada | 143 (9%) | 143 (9%) | +0 |
| Com IES | 494 (33%) | 494 (33%) | +0 |
| Com site | 91 (6%) | 142 (9%) | +51 |
| Com Instagram | 53 (3%) | 338 (22%) | +285 |
| Com LinkedIn | 2 (0%) | 215 (14%) | +213 |

Por federação (EJs com federação confirmada pela própria federação):

| Federação | Antes | Depois |
|---|---:|---:|
| FEJERS | 65 | 65 |
| RioJunior | 75 | 75 |
| Juniores | 3 | 3 |

## Total por UF

| UF | EJs |
|---|---:|
| MG | 288 |
| SP | 221 |
| PR | 138 |
| RJ | 89 |
| BA | 76 |
| RN | 69 |
| SC | 69 |
| RS | 65 |
| CE | 64 |
| DF | 57 |
| PB | 44 |
| PE | 43 |
| GO | 39 |
| PA | 34 |
| AL | 33 |
| MA | 29 |
| ES | 28 |
| MS | 27 |
| SE | 24 |
| MT | 19 |
| AM | 13 |
| TO | 13 |
| PI | 12 |
| AC | 7 |
| RO | 6 |
| AP | 4 |
| (UF não identificada) | 2 |
| RR | 2 |

## Total por federação

| Federação | EJs |
|---|---:|
| (federação não confirmada em fonte) | 1372 |
| RioJunior | 75 |
| FEJERS | 65 |
| Juniores | 3 |

> A federação só é preenchida quando a própria federação lista a EJ em seu site. EJs vindas do
> cadastro nacional (nome + CNPJ + ID Brasil Júnior) ficam com federação vazia até serem confirmadas.

## Situação cadastral (Receita Federal)

| Situação | EJs |
|---|---:|
| ATIVA | 1350 |
| INAPTA | 144 |
| (não consultada / não encontrada) | 17 |
| SUSPENSA | 4 |

## Preenchimento dos campos

| Campo | Preenchido | % |
|---|---:|---:|
| CNPJ | 1498 | 99% |
| UF | 1513 | 100% |
| Cidade | 1498 | 99% |
| IES | 494 | 33% |
| Federação | 143 | 9% |
| Ano de fundação (abertura do CNPJ) | 1498 | 99% |
| Site | 142 | 9% |
| Instagram | 338 | 22% |
| LinkedIn | 215 | 14% |
| E-mail institucional | 53 | 3% |
| Telefone institucional | 22 | 1% |
| Áreas/cursos | 136 | 9% |
| Serviços | 134 | 9% |

## Busca na web (redes de EJs sem contato)

Arquivo `data/redes-encontradas.json`: 355 EJs (RJ, SP, MG e PR, 2026-11-22) com Instagram, LinkedIn de empresa e/ou site
confirmados por página pública (`evidencia`, que entra em `fontes`). Critério: nome igual e IES ou cidade compatível na própria
evidência; perfis pessoais, contas de processo seletivo e casos ambíguos ficaram de fora. Aplicadas nesta coleta: 355.

## Verificação dos sites

Cada site foi aberto nesta coleta. Site fora do ar é removido da EJ (fica `null`); se o site está no ar
e a EJ não tinha Instagram/LinkedIn, o perfil publicado **no próprio site** é aproveitado quando casa com o
nome da EJ ou com o endereço do site (perfis de clientes, parceiros, IES ou federação são ignorados).

- Sites verificados: 166
- Sites descartados (fora do ar): 24
- Endereço corrigido (http no lugar de https quebrado, ou com/sem "www."): 0
- Instagram encontrado no site da EJ: 72
- LinkedIn encontrado no site da EJ: 50

| EJ | UF | Site descartado | Motivo |
|---|---|---|---|
| AlQualis Jr. | RJ | https://www.alqualisjunior.com.br/ | domínio não existe mais (sem DNS) |
| Âmbar Consultoria Ambiental Júnior | RJ | https://ambarconsultoriajr.com.br/ | domínio não existe mais (sem DNS) |
| ATELIÊ MUDA | DF | https://ateliemuda.com/ | página não existe (HTTP 404) |
| Atena Consultoria Jr. | RS | http://atenajr.com/ | domínio não existe mais (sem DNS) |
| Carioca Jr | RJ | https://cariocajr.com.br/ | certificado inválido (CERT_HAS_EXPIRED) |
| Catena Consultoria | RJ | https://catenaconsultoria.com/pt/sobre-nos/ | domínio não existe mais (sem DNS) |
| CPEn Jr | RS | https://www.cpenjr.com/ | domínio não existe mais (sem DNS) |
| ECAPE - EMPRESA JÚNIOR DE CONSULTORIA AGROPECUÁRIA E PLANEJAMENTO ESTRATÉGICO | RS | https://www.ecapejrconsultoria.com/ | domínio não existe mais (sem DNS) |
| EcoLógica Jr. | RS | https://www.ecologicajr.com.br/ | domínio não existe mais (sem DNS) |
| EngerSolution Consultoria Jr. | RS | https://engersolution.com.br/ | domínio não existe mais (sem DNS) |
| ENV Consultoria | RJ | https://envjr.com/ | não respondeu (EAI_AGAIN) |
| Expand Jr. - Consultoria Internacional | RJ | http://www.expandjr.com.br/ | domínio não existe mais (sem DNS) |
| expresse! consultoria | RJ | https://expresseconsultoria.com.br/ | domínio não existe mais (sem DNS) |
| Farmac Jr. | RJ | https://farmacjr.com/ | domínio não existe mais (sem DNS) |
| Flora Júnior | RJ | https://www.florajunior.com/ | domínio não existe mais (sem DNS) |
| Horizonte Soluções Geofísicas | RJ | https://www.horizontegeofisica.com/ | domínio não existe mais (sem DNS) |
| Insight Consultoria | RJ | https://insightjunior.com.br/ | domínio não existe mais (sem DNS) |
| LEVE Consultoria e Gestão de Projetos | RJ | https://ejleve.com.br/ | não respondeu (EAI_AGAIN) |
| Mecajun | DF | https://mecajun.com/ | não respondeu (UND_ERR_CONNECT_TIMEOUT) |
| Med.Co Jr | RJ | https://medcojr.com/ | domínio não existe mais (sem DNS) |
| Multi Jr | RJ | https://multijr.com.br/ | domínio não existe mais (sem DNS) |
| Nuvem Jr. | RS | https://www.nuvemjr.com/ | domínio não existe mais (sem DNS) |
| Polaris Jr. | DF | https://polarisjrblog.wordpress.com/ | página não existe (HTTP 410) |
| XPORT Jr. Consultoria e Suporte Internacional | RJ | https://www.xportjr.com.br/ | domínio não existe mais (sem DNS) |

## Fontes usadas

- **FEJERS — Empresas Juniores (API pública do site)** — https://www.fejers.org.br/empresas-juniores (1512 registros)
- **RioJunior — As Empresas Juniores** — https://riojunior.com.br/rio-junior/empresas (76 registros)
- **Juniores (ES) — Catálogo de Empresas Juniores Federadas** — https://www.federacaojuniores.com.br/empresas-juniores (3 registros) — site lista 12 EJs (declara 30 federadas); 3 casadas de forma única com o cadastro nacional (nome + UF do CNPJ); listadas e NÃO incluídas por falta de casamento: TEC Jr, Fucape Jr Consultoria, Pi Júnior, IF Júnior, Prisma Júnior, Lex Consultoria Jurídica Jr, Nutri & Saúde Jr, Impulso Marketing Jr, Conecta Engenharia Jr; conflitos (prevalece o CNPJ): Projeta Júnior: cidade Vitória (site) × Sao Mateus (CNPJ); Ecos Jr: cidade Alegre (site) × Vitoria (CNPJ)
- **UnB — Guia das Empresas Juniores da UnB (CDT/Pró-Jr, 2022)** — https://cdt.unb.br/images/Empresa_J%C3%BAnior/Portflio_Ejs_1.pdf (32 registros) — 49 fichas; 32 casadas de forma única com o cadastro nacional (DF); sem casamento (não incluídas): Ábaco, Arch, Astrodatum, ConFiE Jr, Ecoflor, Econsult, Engrena, Estat, Facto, Matriz, Museotec, O2, Olé Júnior, Phygeo, Quark Up, Socius, Strategos; sites descartados por domínio sem DNS hoje: AD&M, Avenir, Cráton, Doisnovemeia, Embragea, Endêmica Júnior, Flua, Tecmec, Terapêutica Jr.
- **UFSC — E-book "Empresas Juniores da UFSC" (2023)** — https://via.ufsc.br/wp-content/uploads/ebooks-EJS-oficial.pdf (16 registros) — 32 fichas lidas; 16 casadas de forma única com o cadastro nacional (SC); sem casamento (não incluídas): C2E, EJEM, EJEN, EJIFAR, INVESTJR., SIMBIOSIS, ANALIZE, CALTECH, COMUNICA!, Uipi, Café & Fita Crepe, TÉTIS, CONEVA Jr, EJEC, Emfisio Jr., Kadima
- **Federações com site público sem lista de EJs (FEJEMG, FEJESP, Goiás Júnior)** — https://www.fejemg.org.br/ ; https://fejesp.org.br/ ; https://goiasjunior.org.br/ (0 registros) — apenas metadados da federação — FEJEMG: site no ar, sem lista de EJs; FEJESP: site no ar, sem lista de EJs; Goiás Júnior: site no ar, sem lista de EJs
- **IBGE — API pública de localidades** (https://servicodados.ibge.gov.br/api/v1/localidades/municipios): grafia oficial dos municípios (acentos).
- **Receita Federal — dados públicos de CNPJ**, consultados via BrasilAPI (https://brasilapi.com.br) com fallback minhareceita.org: razão social, município, UF, data de abertura e situação cadastral. Quadro societário, e-mails e telefones da Receita **não** são armazenados (LGPD).

### Fontes públicas investigadas sem lista de EJs aproveitável

- **Brasil Júnior — site institucional** — https://brasiljunior.org.br/: Next.js sem diretório de EJs/federações: __NEXT_DATA__ vazio (pageProps: {}), sitemap só com páginas institucionais. Os dados dinâmicos (blog, parceiros, seleção de IES) vêm de api.brasiljunior.org.br, que exige token (Authorization) não publicado → não usada. Portal/ID (portal.brasiljunior.org.br, id.brasiljunior.org.br) exigem login → não acessados.
- **Brasil Júnior — Portal da Transparência** — https://brasiljunior.org.br/portal-da-transparencia: Relatórios de legado, demonstrativos e planejamento em PDFs no Google Drive: agregados, sem lista de EJs/federações.
- **Brasil Júnior — IES Empreendedoras / MEJ Carreiras** — https://iesempreendedoras.brasiljunior.org.br/ ; https://mej-carreiras.brasiljunior.org.br/: Ranking de IES (não de EJs) e banco de talentos; sem lista de EJs com federação.
- **API do site da FEJERS — outros endpoints** — https://api.fejers.org.br/: /federations, /business-areas, /services, /events, /docs exigem autenticação (401) → não usados. /ies e /courses são públicos mas cobrem só o RS.
- **FEJEMG (MG)** — https://www.fejemg.org.br/: Wix de eventos (EMEJ); sitemap sem páginas de EJs; sem lista de federadas.
- **FEJESP (SP)** — https://fejesp.org.br/: App FlutterFlow estático (eventos/manifesto); bundle sem backend de EJs; sem lista de federadas.
- **Goiás Júnior (GO)** — https://goiasjunior.org.br/: WordPress com estatísticas agregadas (40 EJs, 8 IES, 10 cidades); wp-json sem post type de EJs (apenas membros de equipe, não coletados por LGPD).
- **FEJESC (SC)** — https://fejesc.etechjr.com.br/: Site em construção/homologação: post type "empresas-juniores" tem só 5 itens com texto "Lorem ipsum" → descartado. fejesc.com.br não abre (falha TLS/redirecionamento).
- **Fejepar (PR), RN Júnior, PB Júnior, Concentro (DF), FEJEPE (PE), UNIJr-BA, FEJECE (CE), FEJEA (AL), SERJÚNIOR (SE), Maranhão Júnior, Pará Júnior, FEJEMS (MS)** — domínios listados na Wikipédia (Empresa júnior) e variações: Sem DNS, página padrão de hospedagem ("Bem-vindo a HostGator"), "Em manutenção" ou domínio à venda; nenhum site oficial ativo localizado. Presença só em redes sociais (não coletadas).
- **Wayback Machine (versões antigas do diretório da Brasil Júnior)** — https://web.archive.org/: Indisponível neste ambiente (acesso bloqueado) e dados seriam defasados → não usado.

Federações catalogadas: FEJERS (RS), RioJunior (RJ), Juniores (ES), FEJEMG (MG), FEJESP (SP), Goiás Júnior (GO).


## Metodologia e regras

- Somente páginas e APIs públicas, sem login; robots.txt respeitado; intervalo mínimo de 1,2 s entre requisições ao mesmo host; User-Agent genérico.
- Nenhum dado é inventado: campo não confirmado em fonte fica `null`. Toda EJ tem `fonteUrl` e `coletadoEm`; `fontes` lista todas as fontes que contribuíram.
- `ies` vem da federação ou, na falta, é extraída **literalmente** da razão social registrada na Receita (ex.: "... JUNIOR DA UNIVERSIDADE ESTADUAL DE LONDRINA"). Na falta do nome completo, usa a **sigla** da IES citada literalmente na razão social ou no nome da EJ (ex.: "... DA UFRRJ", "3E-UEL"). Quando nada cita a instituição, fica vazia.
- `anoFundacao` = ano de abertura do CNPJ na Receita.
- `cidade`/`uf` vêm da federação ou do endereço cadastral do CNPJ.
- Deduplicação: CNPJ; na falta, nome normalizado + IES normalizada + UF.
- Fontes sem CNPJ (federações/IES) só são vinculadas a uma EJ quando o nome normalizado casa de forma ÚNICA com o cadastro nacional dentro da mesma UF (UF do CNPJ na Receita); sem casamento único a EJ não é incluída nem alterada.
- LGPD: apenas dados da organização. Nenhum dado pessoal de membros (tabela Contato vazia).
- `verificado` = false para todos: nenhuma EJ foi verificada manualmente ainda.

## Lacunas conhecidas

- UFs sem nenhuma EJ na base: nenhuma.
- EJs sem UF identificada: 2 (CNPJ não encontrado/consultado).
- Federação confirmada só para EJs listadas nos sites da Juniores, RioJunior, FEJERS. As demais federações estaduais não publicam lista acessível (ver "Fontes públicas investigadas") — próximos passos: contato direto com as federações (listas/CSV autorizados) ou acesso autorizado à API da Brasil Júnior.
- Juniores (ES): o site declara 30 EJs federadas e lista 12; só as que casam de forma única com o cadastro nacional entraram. O conteúdo do site está em construção (telefone placeholder, cases ilustrativos), por isso Instagram/áreas/serviços do site não foram usados.
- IES/site/Instagram de EJs do DF (UnB, guia de 2022) e IES de EJs de SC (UFSC, e-book de 2023) vêm de publicações das próprias universidades; podem estar defasados. Sites cujo domínio não resolve mais foram descartados.
- Núcleos regionais (ex.: Fejepar, FEJESC nucleada): nenhuma fonte pública lista o núcleo de cada EJ — `nucleo` segue vazio.
- Nº estimado de membros não é publicado de forma estruturada pelas fontes usadas — ficou vazio.
- Site/Instagram/LinkedIn: disponíveis principalmente para EJs de RS, RJ e (UnB) DF.
- O cadastro nacional pode conter EJs que deixaram a rede; a situação cadastral ATIVA na Receita não garante que a EJ siga operando.
