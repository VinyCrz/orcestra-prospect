import type { EjColetada } from '@orcestra/shared';
import type { FederacaoColetada, ResultadoFonte } from './base.js';

interface Entrada {
  ejs: EjColetada[];
  resultados: ResultadoFonte[];
  falhas: string[];
  duplicados: number;
  excluidas: EjColetada[];
  coletadoEm: string;
  ufs: string[];
  federacoes: FederacaoColetada[];
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
  const situacoes = contar(ejs, (x) => x.situacaoCadastral ?? '(não consultada / não encontrada)');

  return `# Relatório da coleta de Empresas Juniores

Gerado em: ${e.coletadoEm}  
Gerado por: \`pnpm coleta\` (scripts/coleta)

## Resumo

- **Total de EJs na base:** ${t}
- UFs cobertas: ${e.ufs.length - ufsSem.length} de ${e.ufs.length}
- Registros duplicados mesclados: ${e.duplicados}
- Excluídas por situação cadastral BAIXADA/NULA na Receita: ${e.excluidas.length}

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

## Fontes usadas

${e.resultados.map((r) => `- **${r.fonte}** — ${r.url} (${r.ejs.length} registros)${r.observacao ? ` — ${r.observacao}` : ''}`).join('\n')}
- **IBGE — API pública de localidades** (https://servicodados.ibge.gov.br/api/v1/localidades/municipios): grafia oficial dos municípios (acentos).
- **Receita Federal — dados públicos de CNPJ**, consultados via BrasilAPI (https://brasilapi.com.br) com fallback minhareceita.org: razão social, município, UF, data de abertura e situação cadastral. Quadro societário, e-mails e telefones da Receita **não** são armazenados (LGPD).

Federações catalogadas: ${e.federacoes.map((f) => `${f.sigla} (${f.uf ?? '-'})`).join(', ')}.

${e.falhas.length ? `### Fontes que falharam nesta execução\n\n${e.falhas.map((f) => `- ${f}`).join('\n')}\n` : ''}
## Metodologia e regras

- Somente páginas e APIs públicas, sem login; robots.txt respeitado; intervalo mínimo de 1,2 s entre requisições ao mesmo host; User-Agent genérico.
- Nenhum dado é inventado: campo não confirmado em fonte fica \`null\`. Toda EJ tem \`fonteUrl\` e \`coletadoEm\`; \`fontes\` lista todas as fontes que contribuíram.
- \`ies\` vem da federação ou, na falta, é extraída **literalmente** da razão social registrada na Receita (ex.: "... JUNIOR DA UNIVERSIDADE ESTADUAL DE LONDRINA"). Na falta do nome completo, usa a **sigla** da IES citada literalmente na razão social ou no nome da EJ (ex.: "... DA UFRRJ", "3E-UEL"). Quando nada cita a instituição, fica vazia.
- \`anoFundacao\` = ano de abertura do CNPJ na Receita.
- \`cidade\`/\`uf\` vêm da federação ou do endereço cadastral do CNPJ.
- Deduplicação: CNPJ; na falta, nome normalizado + IES normalizada + UF.
- LGPD: apenas dados da organização. Nenhum dado pessoal de membros (tabela Contato vazia).
- \`verificado\` = false para todos: nenhuma EJ foi verificada manualmente ainda.

## Lacunas conhecidas

- UFs sem nenhuma EJ na base: ${ufsSem.length ? ufsSem.join(', ') : 'nenhuma'}.
- EJs sem UF identificada: ${ejs.filter((x) => !x.uf).length} (CNPJ não encontrado/consultado).
- Federação confirmada só para EJs listadas nos sites da FEJERS (RS) e RioJunior (RJ). Outras federações estaduais não publicam lista estruturada acessível (sites em Wix/Flutter sem dados em HTML, ou fora do ar) — próximos passos: incluir novas fontes no coletor.
- Núcleo e nº estimado de membros não são publicados de forma estruturada pelas fontes usadas — ficaram vazios.
- Site/Instagram/LinkedIn: disponíveis principalmente para EJs de RS e RJ.
- O cadastro nacional pode conter EJs que deixaram a rede; a situação cadastral ATIVA na Receita não garante que a EJ siga operando.
`;
}
