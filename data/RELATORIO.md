# Relatório da coleta de Empresas Juniores

Gerado em: 2026-11-20T23:20:42.925Z  
Gerado por: `pnpm coleta` (scripts/coleta)

## Resumo

- **Total de EJs na base:** 1515
- UFs cobertas: 27 de 27
- Registros duplicados mesclados: 61
- Excluídas por situação cadastral BAIXADA/NULA na Receita: 12

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
| (federação não confirmada em fonte) | 1375 |
| RioJunior | 75 |
| FEJERS | 65 |

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
| IES | 453 | 30% |
| Federação | 140 | 9% |
| Ano de fundação (abertura do CNPJ) | 1498 | 99% |
| Site | 72 | 5% |
| Instagram | 24 | 2% |
| LinkedIn | 2 | 0% |
| E-mail institucional | 53 | 3% |
| Telefone institucional | 22 | 1% |
| Áreas/cursos | 136 | 9% |
| Serviços | 134 | 9% |

## Fontes usadas

- **FEJERS — Empresas Juniores (API pública do site)** — https://www.fejers.org.br/empresas-juniores (1512 registros)
- **RioJunior — As Empresas Juniores** — https://riojunior.com.br/rio-junior/empresas (76 registros)
- **IBGE — API pública de localidades** (https://servicodados.ibge.gov.br/api/v1/localidades/municipios): grafia oficial dos municípios (acentos).
- **Receita Federal — dados públicos de CNPJ**, consultados via BrasilAPI (https://brasilapi.com.br) com fallback minhareceita.org: razão social, município, UF, data de abertura e situação cadastral. Quadro societário, e-mails e telefones da Receita **não** são armazenados (LGPD).

Federações catalogadas: FEJERS (RS), RioJunior (RJ).


## Metodologia e regras

- Somente páginas e APIs públicas, sem login; robots.txt respeitado; intervalo mínimo de 1,2 s entre requisições ao mesmo host; User-Agent genérico.
- Nenhum dado é inventado: campo não confirmado em fonte fica `null`. Toda EJ tem `fonteUrl` e `coletadoEm`; `fontes` lista todas as fontes que contribuíram.
- `ies` vem da federação ou, na falta, é extraída **literalmente** da razão social registrada na Receita (ex.: "... JUNIOR DA UNIVERSIDADE ESTADUAL DE LONDRINA"). Na falta do nome completo, usa a **sigla** da IES citada literalmente na razão social ou no nome da EJ (ex.: "... DA UFRRJ", "3E-UEL"). Quando nada cita a instituição, fica vazia.
- `anoFundacao` = ano de abertura do CNPJ na Receita.
- `cidade`/`uf` vêm da federação ou do endereço cadastral do CNPJ.
- Deduplicação: CNPJ; na falta, nome normalizado + IES normalizada + UF.
- LGPD: apenas dados da organização. Nenhum dado pessoal de membros (tabela Contato vazia).
- `verificado` = false para todos: nenhuma EJ foi verificada manualmente ainda.

## Lacunas conhecidas

- UFs sem nenhuma EJ na base: nenhuma.
- EJs sem UF identificada: 2 (CNPJ não encontrado/consultado).
- Federação confirmada só para EJs listadas nos sites da FEJERS (RS) e RioJunior (RJ). Outras federações estaduais não publicam lista estruturada acessível (sites em Wix/Flutter sem dados em HTML, ou fora do ar) — próximos passos: incluir novas fontes no coletor.
- Núcleo e nº estimado de membros não são publicados de forma estruturada pelas fontes usadas — ficaram vazios.
- Site/Instagram/LinkedIn: disponíveis principalmente para EJs de RS e RJ.
- O cadastro nacional pode conter EJs que deixaram a rede; a situação cadastral ATIVA na Receita não garante que a EJ siga operando.
