import type { EjColetada } from '@orcestra/shared';
import type { FederacaoColetada, ResultadoFonte } from './base.js';
import { FONTES_SEM_LISTA, LINHA_DE_BASE } from './investigadas.js';
import type { ResultadoLinks } from './links.js';

interface Entrada {
  ejs: EjColetada[];
  resultados: ResultadoFonte[];
  falhas: string[];
  duplicados: number;
  excluidas: EjColetada[];
  coletadoEm: string;
  ufs: string[];
  federacoes: FederacaoColetada[];
  links: ResultadoLinks | null;
}

function contar<T>(xs: T[], f: (x: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const x of xs) m.set(f(x), (m.get(f(x)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const pct = (n: number, t: number) => (t ? `${Math.round((n / t) * 100)}%` : '0%');

export function gerarRelatorio(e: Entrada): string {
  const { ejs } = e;
  const t = ejs.length;
  const porUf = contar(ejs, (x) => x.uf ?? '(UF não identificada)');
  const porFed = contar(ejs, (x) => x.federacao ?? '(federação não confirmada em fonte)');
  const ufsSem = e.ufs.filter((u) => !ejs.some((x) => x.uf === u));
  const campos: [string, (x: EjColetada) => boolean][] = [
    ['CNPJ', (x) => !!x.cnpj],
    ['UF', (x) => !!x.uf],
    ['Cidade', (x) => !!x.cidade],
    ['IES', (x) => !!x.ies],
    ['Federação', (x) => !!x.federacao],
    ['Ano de fundação (abertura do CNPJ)', (x) => !!x.anoFundacao],
    ['Site', (x) => !!x.site],
    ['Instagram', (x) => !!x.instagram],
    ['LinkedIn', (x) => !!x.linkedin],
    ['E-mail institucional', (x) => !!x.emailInstitucional],
    ['Telefone institucional', (x) => !!x.telefoneInstitucional],
    ['Áreas/cursos', (x) => x.areas.length + x.cursos.length > 0],
    ['Serviços', (x) => x.servicos.length > 0],
  ];
  const n = (f: (x: EjColetada) => boolean) => ejs.filter(f).length;
  const linhaAntesDepois = (nome: string, antes: number, depois: number) =>
    `| ${nome} | ${antes} (${pct(antes, LINHA_DE_BASE.total)}) | ${depois} (${pct(depois, t)}) | ${depois - antes >= 0 ? '+' : ''}${depois - antes} |`;
  const federacoesAntesDepois = [
    ...new Set([...Object.keys(LINHA_DE_BASE.porFederacao), ...porFed.map(([k]) => k)]),
  ].filter((k) => !k.startsWith('('));
  const situacoes = contar(ejs, (x) => x.situacaoCadastral ?? '(não consultada / não encontrada)');

  return `# Relatório da coleta de Empresas Juniores

Gerado em: ${e.coletadoEm}  
Gerado por: \`pnpm coleta\` (scripts/coleta)

## Resumo

- **Total de EJs na base:** ${t}
- UFs cobertas: ${e.ufs.length - ufsSem.length} de ${e.ufs.length}
- Registros duplicados mesclados: ${e.duplicados}
- Excluídas por situação cadastral BAIXADA/NULA na Receita: ${e.excluidas.length}

## Antes × depois

Linha de base: ${LINHA_DE_BASE.data}.

| Indicador | Antes | Depois | Variação |
|---|---:|---:|---:|
| Total de EJs | ${LINHA_DE_BASE.total} | ${t} | ${t - LINHA_DE_BASE.total >= 0 ? '+' : ''}${t - LINHA_DE_BASE.total} |
${linhaAntesDepois('Com federação confirmada', LINHA_DE_BASE.federacao, n((x) => !!x.federacao))}
${linhaAntesDepois('Com IES', LINHA_DE_BASE.ies, n((x) => !!x.ies))}
${linhaAntesDepois('Com site', LINHA_DE_BASE.site, n((x) => !!x.site))}
${linhaAntesDepois('Com Instagram', LINHA_DE_BASE.instagram, n((x) => !!x.instagram))}
${linhaAntesDepois('Com LinkedIn', LINHA_DE_BASE.linkedin, n((x) => !!x.linkedin))}

Por federação (EJs com federação confirmada pela própria federação):

| Federação | Antes | Depois |
|---|---:|---:|
${federacoesAntesDepois.map((k) => `| ${k} | ${LINHA_DE_BASE.porFederacao[k] ?? 0} | ${porFed.find(([f]) => f === k)?.[1] ?? 0} |`).join('\n')}

## Total por UF

| UF | EJs |
|---|---:|
${porUf.map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

## Total por federação

| Federação | EJs |
|---|---:|
${porFed.map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

> A federação só é preenchida quando a própria federação lista a EJ em seu site. EJs vindas do
> cadastro nacional (nome + CNPJ + ID Brasil Júnior) ficam com federação vazia até serem confirmadas.

## Situação cadastral (Receita Federal)

| Situação | EJs |
|---|---:|
${situacoes.map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

## Preenchimento dos campos

| Campo | Preenchido | % |
|---|---:|---:|
${campos
  .map(([n, f]) => {
    const c = ejs.filter(f).length;
    return `| ${n} | ${c} | ${pct(c, t)} |`;
  })
  .join('\n')}

${secaoLinks(e.links)}
## Fontes usadas

${e.resultados.map((r) => `- **${r.fonte}** — ${r.url} (${r.ejs.length} registros)${r.observacao ? ` — ${r.observacao}` : ''}`).join('\n')}
- **IBGE — API pública de localidades** (https://servicodados.ibge.gov.br/api/v1/localidades/municipios): grafia oficial dos municípios (acentos).
- **Receita Federal — dados públicos de CNPJ**, consultados via BrasilAPI (https://brasilapi.com.br) com fallback minhareceita.org: razão social, município, UF, data de abertura e situação cadastral. Quadro societário, e-mails e telefones da Receita **não** são armazenados (LGPD).

### Fontes públicas investigadas sem lista de EJs aproveitável

${FONTES_SEM_LISTA.map((f) => `- **${f.fonte}** — ${f.url}: ${f.situacao}`).join('\n')}

Federações catalogadas: ${e.federacoes.map((f) => `${f.sigla} (${f.uf ?? '-'})`).join(', ')}.

${e.falhas.length ? `### Fontes que falharam nesta execução\n\n${e.falhas.map((f) => `- ${f}`).join('\n')}\n` : ''}
## Metodologia e regras

- Somente páginas e APIs públicas, sem login; robots.txt respeitado; intervalo mínimo de 1,2 s entre requisições ao mesmo host; User-Agent genérico.
- Nenhum dado é inventado: campo não confirmado em fonte fica \`null\`. Toda EJ tem \`fonteUrl\` e \`coletadoEm\`; \`fontes\` lista todas as fontes que contribuíram.
- \`ies\` vem da federação ou, na falta, é extraída **literalmente** da razão social registrada na Receita (ex.: "... JUNIOR DA UNIVERSIDADE ESTADUAL DE LONDRINA"). Na falta do nome completo, usa a **sigla** da IES citada literalmente na razão social ou no nome da EJ (ex.: "... DA UFRRJ", "3E-UEL"). Quando nada cita a instituição, fica vazia.
- \`anoFundacao\` = ano de abertura do CNPJ na Receita.
- \`cidade\`/\`uf\` vêm da federação ou do endereço cadastral do CNPJ.
- Deduplicação: CNPJ; na falta, nome normalizado + IES normalizada + UF.
- Fontes sem CNPJ (federações/IES) só são vinculadas a uma EJ quando o nome normalizado casa de forma ÚNICA com o cadastro nacional dentro da mesma UF (UF do CNPJ na Receita); sem casamento único a EJ não é incluída nem alterada.
- LGPD: apenas dados da organização. Nenhum dado pessoal de membros (tabela Contato vazia).
- \`verificado\` = false para todos: nenhuma EJ foi verificada manualmente ainda.

## Lacunas conhecidas

- UFs sem nenhuma EJ na base: ${ufsSem.length ? ufsSem.join(', ') : 'nenhuma'}.
- EJs sem UF identificada: ${ejs.filter((x) => !x.uf).length} (CNPJ não encontrado/consultado).
- Federação confirmada só para EJs listadas nos sites da ${[...new Set(ejs.map((x) => x.federacao).filter(Boolean))].join(', ')}. As demais federações estaduais não publicam lista acessível (ver "Fontes públicas investigadas") — próximos passos: contato direto com as federações (listas/CSV autorizados) ou acesso autorizado à API da Brasil Júnior.
- Juniores (ES): o site declara 30 EJs federadas e lista 12; só as que casam de forma única com o cadastro nacional entraram. O conteúdo do site está em construção (telefone placeholder, cases ilustrativos), por isso Instagram/áreas/serviços do site não foram usados.
- IES/site/Instagram de EJs do DF (UnB, guia de 2022) e IES de EJs de SC (UFSC, e-book de 2023) vêm de publicações das próprias universidades; podem estar defasados. Sites cujo domínio não resolve mais foram descartados.
- Núcleos regionais (ex.: Fejepar, FEJESC nucleada): nenhuma fonte pública lista o núcleo de cada EJ — \`nucleo\` segue vazio.
- Nº estimado de membros não é publicado de forma estruturada pelas fontes usadas — ficou vazio.
- Site/Instagram/LinkedIn: disponíveis principalmente para EJs de RS, RJ e (UnB) DF.
- O cadastro nacional pode conter EJs que deixaram a rede; a situação cadastral ATIVA na Receita não garante que a EJ siga operando.
`;
}

function secaoLinks(l: ResultadoLinks | null): string {
  if (!l) return '## Verificação dos sites\n\nNão executada nesta coleta (`--sem-links`).\n';
  return `## Verificação dos sites

Cada site foi aberto nesta coleta. Site fora do ar é removido da EJ (fica \`null\`); se o site está no ar
e a EJ não tinha Instagram/LinkedIn, o perfil publicado **no próprio site** é aproveitado quando casa com o
nome da EJ ou com o endereço do site (perfis de clientes, parceiros, IES ou federação são ignorados).

- Sites verificados: ${l.verificados}
- Sites descartados (fora do ar): ${l.descartados.length}
- Endereço corrigido (http no lugar de https quebrado, ou com/sem "www."): ${l.urlCorrigida}
- Instagram encontrado no site da EJ: ${l.instagramNovos}
- LinkedIn encontrado no site da EJ: ${l.linkedinNovos}
${
  l.descartados.length
    ? `\n| EJ | UF | Site descartado | Motivo |\n|---|---|---|---|\n${l.descartados.map((d) => `| ${d.nome.replace(/\|/g, '/')} | ${d.uf ?? '-'} | ${d.url} | ${d.motivo} |`).join('\n')}\n`
    : ''
}`;
}
